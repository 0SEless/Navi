import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import pg from 'pg'
import { commitScopedCandidate, createScopedSaveCandidate } from '../../src/services/scoped-campus-save.ts'
import { PostgresScopedCommitStore } from '../../src/services/scoped-postgres-adapter.ts'

const enabled = process.env.NAVI_E7_PG_INTEGRATION === '1'
const integrationDescribe = enabled ? describe : describe.skip
const host = process.env.NAVI_E5_PGHOST
const port = Number(process.env.NAVI_E5_PGPORT)
const database = process.env.NAVI_E5_PGDATABASE
const user = process.env.NAVI_E5_PGUSER
const password = process.env.NAVI_E5_PGPASSWORD

function geometryPoints(count, offset = 0) {
  return Array.from({ length: count }, (_, index) => ({
    x: Number((index * 1.25 + offset).toFixed(2)),
    y: Number((Math.sin(index / 11) * 20 + offset).toFixed(2)),
  }))
}

function makeBuilding(id, name, offset) {
  return {
    id,
    name,
    floors: Array.from({ length: 3 }, (_, floor) => ({
      id: `${id}-floor-${floor}`,
      level: floor,
      rooms: Array.from({ length: 20 }, (_, room) => ({
        id: `${id}-f${floor}-room-${room}`,
        name: `Synthetic room ${room}`,
        geometry: geometryPoints(8, offset + room + floor),
      })),
    })),
  }
}

function makeRoute() {
  return {
    routes: [{
      id: 'synthetic-route-a',
      fromBuilding: 'e7-building-a',
      toBuilding: 'e7-building-b',
      segments: geometryPoints(600, 5),
    }],
  }
}

function makeTerrain() {
  return { contours: Array.from({ length: 80 }, (_, contour) => ({ id: `contour-${contour}`, points: geometryPoints(12, contour) })) }
}

integrationDescribe('E7 local editor-to-PostgreSQL workflow', () => {
  it('saves independent scopes, validates dependencies, races safely, reconstructs, and measures PostgreSQL writes', async () => {
    if (host !== '127.0.0.1' || port !== 55433 || database !== 'navi_e4_test' || user !== 'navi_e4_runner' || !password) {
      throw new Error('E7 accepts only the approved E5 loopback database and runner identity.')
    }
    const pool = new pg.Pool({ host, port, database, user, password, connectionTimeoutMillis: 3000, max: 8 })
    let createdSchema = false
    let rollbackSql = ''

    try {
      const preflight = await pool.query(`
        SELECT current_database() AS database, session_user AS role,
               current_setting('server_version_num')::integer AS version_num,
               shobj_description(d.oid, 'pg_database') AS database_marker,
               r.rolsuper AS superuser, r.rolcreatedb AS create_database, r.rolcreaterole AS create_role,
               to_regnamespace('navi_scoped') IS NOT NULL AS schema_exists
        FROM pg_database d JOIN pg_roles r ON r.rolname = session_user
        WHERE d.datname = current_database()
      `)
      const identity = preflight.rows[0]
      expect(identity).toMatchObject({
        database: 'navi_e4_test',
        role: 'navi_e4_runner',
        database_marker: 'navi-e4-synthetic-v1',
        superuser: false,
        create_database: false,
        create_role: false,
        schema_exists: false,
      })
      expect(identity.version_num).toBeGreaterThanOrEqual(170000)
      expect(identity.version_num).toBeLessThan(180000)

      const migrationPath = new URL('../../supabase/migrations/20261030045317_navi_scoped_persistence_foundation.sql', import.meta.url)
      const rollbackPath = new URL('../../supabase/rollback/20261030045317_navi_scoped_persistence_foundation.rollback.sql', import.meta.url)
      const baselineStats = await pool.query('SELECT pg_database_size(current_database())::bigint AS database_bytes')
      const beforeStats = await pool.query('SELECT tup_inserted, tup_updated, tup_deleted FROM pg_stat_database WHERE datname = current_database()')
      rollbackSql = readFileSync(rollbackPath, 'utf8')
      await pool.query(readFileSync(migrationPath, 'utf8'))
      createdSchema = true

      const store = new PostgresScopedCommitStore({
        pool,
        resolveTrustedActor: () => 'e7-synthetic-server-actor',
        resolveDocumentId: (campusId) => campusId.startsWith('e7-synthetic-') ? `campus:${campusId}` : null,
        authorizeActor: ({ actorId, campusId, permission }) =>
          actorId === 'e7-synthetic-server-actor' &&
          campusId.startsWith('e7-synthetic-') &&
          (permission === 'read' || permission === 'write'),
        checkpointInterval: 2,
      })

      const campusId = `e7-synthetic-${randomUUID()}`
      const buildingA = { kind: 'building', id: 'e7-building-a' }
      const buildingB = { kind: 'building', id: 'e7-building-b' }
      const route = { kind: 'routing', id: campusId }
      const terrain = { kind: 'terrain', id: campusId }
      const settings = { kind: 'campus-settings', id: campusId }
      const initialA = makeBuilding(buildingA.id, 'Synthetic Building A', 1)
      const initialB = makeBuilding(buildingB.id, 'Synthetic Building B', 2)
      const initialRoute = makeRoute()
      const initialTerrain = makeTerrain()
      const initialSettings = { name: 'Synthetic E7 campus', coordinateSystem: 'EPSG:4326', revisionLabel: 'fixture-only' }
      const fullDocument = { campusId, buildings: [initialA, initialB], route: initialRoute, terrain: initialTerrain, settings: initialSettings }
      const fullBytes = Buffer.byteLength(JSON.stringify(fullDocument))
      const baselineDatabaseBytes = Number(baselineStats.rows[0].database_bytes)
      const saveLatencies = []
      const updatePayloadBytes = []

      const seedStarted = performance.now()
      await store.initializeCampus('e7-synthetic-server-actor', campusId, `campus:${campusId}`, [
        { scope: buildingA, content: initialA },
        { scope: buildingB, content: initialB },
        { scope: route, content: initialRoute },
        { scope: terrain, content: initialTerrain },
        { scope: settings, content: initialSettings },
      ])
      saveLatencies.push({ operation: 'seed five synthetic scopes', milliseconds: Number((performance.now() - seedStarted).toFixed(3)) })

      const save = async ({ scope, expectedRevision, mutationId, content, dependencies = [] }) => {
        const candidate = createScopedSaveCandidate({
          campusId, scope, expectedCampusRevision: expectedRevision, mutationId, content, dependencies,
        })
        updatePayloadBytes.push({
          scope: `${scope.kind}:${scope.id}`,
          bytes: Buffer.byteLength(JSON.stringify(candidate)),
        })
        const started = performance.now()
        const result = await commitScopedCandidate(candidate, { actorId: 'e7-synthetic-server-actor', isAdministrator: true }, store)
        saveLatencies.push({ operation: scope.kind, milliseconds: Number((performance.now() - started).toFixed(3)), revision: result.acknowledgment?.revision ?? result.revision })
        return { candidate, result }
      }

      const firstBuilding = { ...initialA, name: 'Synthetic Building A updated' }
      const first = await save({ scope: buildingA, expectedRevision: 0, mutationId: `${campusId}:building-a:1`, content: firstBuilding })
      expect(first.result).toMatchObject({ status: 'committed', acknowledgment: { revision: 1 } })
      let state = await store.reconstructCampus(campusId, 1)
      expect(state.scopes['building:e7-building-a'].content).toMatchObject({ name: firstBuilding.name })
      expect(state.scopes['building:e7-building-b'].content).toEqual(initialB)

      const secondBuilding = { ...initialB, name: 'Synthetic Building B updated' }
      const second = await save({ scope: buildingB, expectedRevision: 1, mutationId: `${campusId}:building-b:1`, content: secondBuilding })
      expect(second.result).toMatchObject({ status: 'committed', acknowledgment: { revision: 2 } })
      state = await store.reconstructCampus(campusId, 2)
      expect(state.scopes['building:e7-building-a'].content).toEqual(firstBuilding)
      expect(state.scopes['building:e7-building-b'].content).toEqual(secondBuilding)

      const currentState = await store.readCampusState(campusId)
      const routeDependencies = [buildingA, buildingB].map((scope) => ({
        scope,
        revision: currentState.scopes[`${scope.kind}:${scope.id}`].revision,
        contentChecksum: currentState.scopes[`${scope.kind}:${scope.id}`].contentChecksum,
        required: true,
      }))
      const updatedRoute = { routes: [{ ...initialRoute.routes[0], segments: geometryPoints(601, 6), validatedAgainst: [buildingA.id, buildingB.id] }] }
      const third = await save({ scope: route, expectedRevision: 2, mutationId: `${campusId}:route:1`, content: updatedRoute, dependencies: routeDependencies })
      expect(third.result).toMatchObject({ status: 'committed', acknowledgment: { revision: 3 } })

      const fourth = await save({ scope: terrain, expectedRevision: 3, mutationId: `${campusId}:terrain:1`, content: { ...initialTerrain, contours: initialTerrain.contours.slice(0, 79) } })
      expect(fourth.result).toMatchObject({ status: 'committed', acknowledgment: { revision: 4 } })
      const fifth = await save({ scope: settings, expectedRevision: 4, mutationId: `${campusId}:settings:1`, content: { ...initialSettings, name: 'Synthetic E7 campus updated' } })
      expect(fifth.result).toMatchObject({ status: 'committed', acknowledgment: { revision: 5 } })
      const retry = await commitScopedCandidate(fifth.candidate, { actorId: 'e7-synthetic-server-actor', isAdministrator: true }, store)
      expect(retry).toMatchObject({ status: 'replayed', acknowledgment: { revision: 5 } })

      const concurrentResults = await Promise.allSettled([
        save({ scope: buildingA, expectedRevision: 5, mutationId: `${campusId}:race:a`, content: { ...firstBuilding, name: 'Concurrent A' } }),
        save({ scope: buildingB, expectedRevision: 5, mutationId: `${campusId}:race:b`, content: { ...secondBuilding, name: 'Concurrent B' } }),
      ])
      const successfulRaces = concurrentResults.filter((result) => result.status === 'fulfilled')
      const rejectedRaces = concurrentResults.filter((result) => result.status === 'rejected')
      expect(successfulRaces).toHaveLength(1)
      expect(rejectedRaces).toHaveLength(1)
      expect(rejectedRaces[0].reason).toMatchObject({ code: 'STALE_REVISION' })

      const winningSave = successfulRaces[0].value
      const expectedBuildingA = winningSave.candidate.scope.id === buildingA.id ? winningSave.candidate.content : firstBuilding
      const expectedBuildingB = winningSave.candidate.scope.id === buildingB.id ? winningSave.candidate.content : secondBuilding
      const afterRace = await store.readCampusState(campusId)
      const refreshedDependencies = [buildingA, buildingB].map((scope) => ({
        scope,
        revision: afterRace.scopes[`${scope.kind}:${scope.id}`].revision,
        contentChecksum: afterRace.scopes[`${scope.kind}:${scope.id}`].contentChecksum,
        required: true,
      }))
      const refreshedRoute = {
        routes: [{ ...updatedRoute.routes[0], validatedAgainstRevision: afterRace.revision }],
      }
      const refreshedRouteSave = await save({
        scope: route,
        expectedRevision: afterRace.revision,
        mutationId: `${campusId}:route:2`,
        content: refreshedRoute,
        dependencies: refreshedDependencies,
      })
      expect(refreshedRouteSave.result).toMatchObject({ status: 'committed', acknowledgment: { revision: 7 } })

      const finalState = await store.readCampusState(campusId)
      const reconstructStarted = performance.now()
      const reconstructed = await store.reconstructCampus(campusId, finalState.revision)
      const reconstructionMs = Number((performance.now() - reconstructStarted).toFixed(3))
      expect(reconstructed.revision).toBe(finalState.revision)
      expect(reconstructed.scopes['building:e7-building-a'].content).toMatchObject({ id: buildingA.id })
      expect(reconstructed.scopes['building:e7-building-b'].content).toMatchObject({ id: buildingB.id })
      const reconstructedDocument = {
        campusId,
        buildings: [
          reconstructed.scopes['building:e7-building-a'].content,
          reconstructed.scopes['building:e7-building-b'].content,
        ],
        route: reconstructed.scopes[`routing:${campusId}`].content,
        terrain: reconstructed.scopes[`terrain:${campusId}`].content,
        settings: reconstructed.scopes[`campus-settings:${campusId}`].content,
      }
      expect(reconstructedDocument.buildings).toEqual([expectedBuildingA, expectedBuildingB])
      expect(reconstructedDocument.route).toEqual(refreshedRoute)
      expect(reconstructedDocument.terrain.contours).toHaveLength(79)
      expect(reconstructedDocument.settings.name).toBe('Synthetic E7 campus updated')

      const [dbBytes, tableBytes, payloadBytes, statDelta, counts] = await Promise.all([
        pool.query('SELECT pg_database_size(current_database())::bigint AS bytes'),
        pool.query("SELECT coalesce(sum(pg_total_relation_size(c.oid)),0)::bigint AS bytes FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='navi_scoped' AND c.relkind='r'"),
        pool.query('SELECT coalesce(sum(pg_column_size(content_json)),0)::bigint AS stored_jsonb_bytes, coalesce(sum(octet_length(content_json::text)),0)::bigint AS json_text_bytes FROM navi_scoped.change_operations WHERE campus_id=$1', [campusId]),
        pool.query('SELECT tup_inserted, tup_updated, tup_deleted FROM pg_stat_database WHERE datname=current_database()'),
        pool.query('SELECT (SELECT count(*)::int FROM navi_scoped.change_operations WHERE campus_id=$1) AS operations, (SELECT count(*)::int FROM navi_scoped.change_sets WHERE campus_id=$1) AS changes, (SELECT count(*)::int FROM navi_scoped.checkpoints WHERE campus_id=$1) AS checkpoints', [campusId]),
      ])
      const afterStats = statDelta.rows[0]
      const beforeCounters = beforeStats.rows[0]
      const metrics = {
        identity: { database: identity.database, role: identity.role, postgresql: Number(identity.version_num) },
        syntheticCampusId: campusId,
        finalRevision: finalState.revision,
        changeSetCount: Number(counts.rows[0].changes),
        operationCount: Number(counts.rows[0].operations),
        checkpointCount: Number(counts.rows[0].checkpoints),
        saveLatencies,
        reconstructionMilliseconds: reconstructionMs,
        fullDocumentJsonBytes: fullBytes,
        scopedMutationCandidateJsonBytes: updatePayloadBytes,
        acceptedRaceCount: successfulRaces.length,
        rejectedStaleRaceCount: rejectedRaces.length,
        pgDatabaseBytesBeforeMigration: baselineDatabaseBytes,
        pgDatabaseBytesAfterWorkflow: Number(dbBytes.rows[0].bytes),
        pgScopedTableAllocatedBytes: Number(tableBytes.rows[0].bytes),
        pgStoredJsonbOperationBytes: Number(payloadBytes.rows[0].stored_jsonb_bytes),
        pgOperationJsonTextBytes: Number(payloadBytes.rows[0].json_text_bytes),
        pgStatDatabaseTupleDeltas: {
          inserted: Number(afterStats.tup_inserted) - Number(beforeCounters.tup_inserted),
          updated: Number(afterStats.tup_updated) - Number(beforeCounters.tup_updated),
          deleted: Number(afterStats.tup_deleted) - Number(beforeCounters.tup_deleted),
        },
        note: 'PostgreSQL relation/database sizes and pg_stat_database tuple deltas are measured from E5; JSON candidate sizes are client serialization measurements, not WAL bytes.',
      }
      console.log(`NAVI_E7_POSTGRES_METRICS ${JSON.stringify(metrics)}`)
      expect(metrics.operationCount).toBeGreaterThanOrEqual(7)
      expect(metrics.changeSetCount).toBe(finalState.revision)
      expect(metrics.checkpointCount).toBeGreaterThanOrEqual(3)
      expect(fullBytes).toBeGreaterThan(updatePayloadBytes.find((entry) => entry.scope === `building:${buildingA.id}`).bytes)
    } finally {
      if (createdSchema) {
        await pool.query(rollbackSql)
        createdSchema = false
        const clean = await pool.query("SELECT to_regnamespace('navi_scoped') IS NULL AS schema_absent")
        expect(clean.rows[0].schema_absent).toBe(true)
      }
      await pool.end()
    }
  }, 55000)
})
