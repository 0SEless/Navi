import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { commitScopedBatch, commitScopedCandidate, createScopedSaveCandidate, scopedContentChecksum } from '../../src/services/scoped-campus-save'
import { PostgresScopedCommitStore } from '../../src/services/scoped-postgres-adapter'
import type { ScopedPgClient, ScopedPgPool } from '../../src/services/scoped-postgres-adapter'

const mode = process.env.NAVI_E8_INTEGRATION_MODE
const enabled = mode === 'write' || mode === 'read'
const acceptance = enabled ? describe : describe.skip

acceptance(`E8 E5 PostgreSQL process acceptance (${mode})`, () => {
  const campusId = process.env.NAVI_E8_SYNTHETIC_CAMPUS as string
  const actorId = 'navi-e8-synthetic-verified-admin'
  const documentId = `campus:${campusId}`
  const pool = new pg.Pool({
    host: process.env.NAVI_E5_PGHOST,
    port: Number(process.env.NAVI_E5_PGPORT),
    database: process.env.NAVI_E5_PGDATABASE,
    user: process.env.NAVI_E5_PGUSER,
    password: process.env.NAVI_E5_PGPASSWORD,
    connectionTimeoutMillis: 3000,
    application_name: 'navi-e8-synthetic-proof',
    max: 3,
  })
  const store = new PostgresScopedCommitStore({
    pool,
    resolveTrustedActor: () => actorId,
    resolveDocumentId: (requestedCampusId) => requestedCampusId === campusId ? documentId : null,
    authorizeActor: (context) => context.actorId === actorId && context.campusId === campusId && context.documentId === documentId,
    checkpointInterval: 1,
  })

  beforeAll(async () => {
    expect(process.env.NAVI_E5_PGHOST).toBe('127.0.0.1')
    expect(process.env.NAVI_E5_PGPORT).toBe('55433')
    expect(process.env.NAVI_E5_PGDATABASE).toBe('navi_e4_test')
    expect(process.env.NAVI_E5_PGUSER).toBe('navi_e4_runner')
    expect(process.env.NAVI_E5_PGPASSWORD).toBeTruthy()
    expect(campusId).toMatch(/^navi-e8-synthetic-/)
    const identity = await pool.query(`
      SELECT current_database() AS database, session_user AS role,
             current_setting('server_version') AS version,
             current_setting('server_version_num')::integer AS version_num,
             shobj_description(d.oid, 'pg_database') AS marker,
             inet_server_addr()::text AS server_address,
             inet_client_addr()::text AS client_address
      FROM pg_database d WHERE d.datname = current_database()
    `)
    expect(identity.rows[0]).toMatchObject({ database: 'navi_e4_test', role: 'navi_e4_runner', marker: 'navi-e4-synthetic-v1' })
    expect(identity.rows[0].server_address).toMatch(/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/)
    expect(identity.rows[0].client_address).toBeTruthy()
    expect(Number(identity.rows[0].version_num)).toBeGreaterThanOrEqual(170000)
    expect(Number(identity.rows[0].version_num)).toBeLessThan(180000)
    if (mode === 'write') {
      const schema = await pool.query(`SELECT to_regnamespace('navi_scoped') IS NOT NULL AS present`)
      if (!schema.rows[0].present) {
        const partial = await pool.query(`SELECT count(*)::integer AS count FROM pg_catalog.pg_tables WHERE schemaname = 'navi_scoped'`)
        expect(partial.rows[0].count).toBe(0)
        const migration = await readFile('supabase/migrations/20261030045317_navi_scoped_persistence_foundation.sql', 'utf8')
        expect(migration.startsWith('-- PROPOSED ONLY — Tracks E3/E4.')).toBe(true)
        await pool.query(migration)
      }
      const names = await pool.query(`SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'navi_scoped' ORDER BY tablename`)
      expect(names.rows.map((row) => row.tablename)).toEqual(['campus_heads', 'change_dependencies', 'change_operations', 'change_sets', 'checkpoints', 'mutation_receipts', 'scope_heads'])
      const security = await pool.query(`
        SELECT r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolbypassrls,
               (SELECT count(*)::integer FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'navi_scoped' AND c.relkind = 'r' AND c.relrowsecurity) AS rls_tables,
               EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) AS supabase_roles
        FROM pg_roles r WHERE r.rolname = session_user
      `)
      expect(security.rows[0]).toMatchObject({ rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false, rls_tables: 7, supabase_roles: false })
      const building = { kind: 'building' as const, id: 'synthetic-building-1' }
      const routing = { kind: 'routing' as const, id: campusId }
      const terrain = { kind: 'terrain' as const, id: campusId }
      await store.initializeCampus(actorId, campusId, documentId, [
        { scope: building, content: { id: building.id, name: 'Synthetic Library', floors: [{ id: 'floor-1', rooms: ['room-1'] }] } },
        { scope: routing, content: { routes: [{ id: 'route-1', from: 'room-1', to: 'entrance-1' }] } },
        { scope: terrain, content: { boundary: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } } },
      ])
    }
  }, 20000)

  afterAll(async () => { await pool.end() })

  if (mode === 'write') {
    it('proves rollback, atomic revisioning, exact replay, collision, no-op, and concurrent writers', async () => {
      const building = { kind: 'building' as const, id: 'synthetic-building-1' }
      const routing = { kind: 'routing' as const, id: campusId }
      const terrain = { kind: 'terrain' as const, id: campusId }
      const baseline = await store.readCampusState(campusId)
      expect(baseline.revision).toBe(0)

      let injected = false
      const faultPool = {
        connect: async () => {
          const client = await pool.connect()
          const faultClient: ScopedPgClient = {
            query: async <Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]) => {
              if (!injected && typeof sql === 'string' && sql.includes('INSERT INTO navi_scoped.change_operations')) {
                injected = true
                const failure = new Error('E8 synthetic fault injected before the first operation insert.') as Error & { code: string }
                failure.code = 'XXE80'
                throw failure
              }
              return client.query<Row>(sql, values)
            },
            release: (error?: Error) => client.release(error),
          }
          return faultClient
        },
      } as unknown as ScopedPgPool
      const faultStore = new PostgresScopedCommitStore({
        pool: faultPool,
        resolveTrustedActor: () => actorId,
        resolveDocumentId: (requestedCampusId) => requestedCampusId === campusId ? documentId : null,
        authorizeActor: (context) => context.actorId === actorId && context.campusId === campusId && context.documentId === documentId,
        checkpointInterval: 1,
      })
      const failedBatch = [
        createScopedSaveCandidate({ campusId, scope: building, expectedCampusRevision: 0, mutationId: `${campusId}:fault:building:${randomUUID()}`, content: { id: building.id, name: 'Must roll back' }, dependencies: [] }),
        createScopedSaveCandidate({ campusId, scope: terrain, expectedCampusRevision: 0, mutationId: `${campusId}:fault:terrain:${randomUUID()}`, content: { boundary: { failed: true } }, dependencies: [] }),
      ]
      await expect(commitScopedBatch(failedBatch, { actorId, isAdministrator: true }, faultStore)).rejects.toMatchObject({ code: 'DATABASE_FAILURE' })
      expect(injected).toBe(true)
      expect((await store.readCampusState(campusId)).revision).toBe(0)
      const rollbackCounts = await pool.query(`
        SELECT (SELECT count(*)::integer FROM navi_scoped.change_sets WHERE campus_id = $1) AS change_sets,
               (SELECT count(*)::integer FROM navi_scoped.change_operations WHERE campus_id = $1) AS operations,
               (SELECT count(*)::integer FROM navi_scoped.mutation_receipts WHERE campus_id = $1) AS receipts
      `, [campusId])
      expect(rollbackCounts.rows[0]).toEqual({ change_sets: 0, operations: 0, receipts: 0 })

      const nextBuilding = { id: building.id, name: 'Synthetic Library Updated', floors: [{ id: 'floor-1', rooms: ['room-1', 'room-2'] }] }
      const nextRouting = { routes: [{ id: 'route-1', from: 'room-2', to: 'entrance-1' }] }
      const nextTerrain = { boundary: { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 0]]] } }
      const candidates = [
        createScopedSaveCandidate({ campusId, scope: building, expectedCampusRevision: 0, mutationId: `${campusId}:building:${randomUUID()}`, content: nextBuilding, dependencies: [] }),
        createScopedSaveCandidate({ campusId, scope: routing, expectedCampusRevision: 0, mutationId: `${campusId}:routing:${randomUUID()}`, content: nextRouting, dependencies: [] }),
        createScopedSaveCandidate({ campusId, scope: terrain, expectedCampusRevision: 0, mutationId: `${campusId}:terrain:${randomUUID()}`, content: nextTerrain, dependencies: [] }),
      ]
      const payloadBytes = Buffer.byteLength(JSON.stringify(candidates), 'utf8')
      const batchStarted = performance.now()
      const committed = await commitScopedBatch(candidates, { actorId, isAdministrator: true }, store)
      const batchElapsedMs = performance.now() - batchStarted
      if (committed.status !== 'committed') throw new Error(`Expected a new commit, received ${committed.status}.`)
      expect(committed.revision).toBe(1)
      expect(committed.acknowledgments).toHaveLength(3)
      const replay = await commitScopedBatch(candidates, { actorId, isAdministrator: true }, store)
      if (replay.status !== 'replayed') throw new Error(`Expected exact replay, received ${replay.status}.`)
      expect(replay.revision).toBe(1)
      expect(replay.acknowledgments).toHaveLength(3) // Simulates a retry after the first acknowledgment is lost.
      const collision = createScopedSaveCandidate({ ...candidates[0], content: { id: building.id, name: 'Changed payload under same mutation identity' } })
      await expect(commitScopedCandidate(collision, { actorId, isAdministrator: true }, store)).rejects.toMatchObject({ code: 'MUTATION_ID_REUSED' })
      const stale = createScopedSaveCandidate({ campusId, scope: { kind: 'terrain', id: campusId }, expectedCampusRevision: 0, mutationId: `${campusId}:stale:${randomUUID()}`, content: { boundary: null }, dependencies: [] })
      await expect(commitScopedBatch([stale, createScopedSaveCandidate({ campusId, scope: { kind: 'campus-settings', id: campusId }, expectedCampusRevision: 0, mutationId: `${campusId}:stale-settings:${randomUUID()}`, content: { name: 'Synthetic' }, dependencies: [] })], { actorId, isAdministrator: true }, store)).rejects.toMatchObject({ code: 'STALE_REVISION' })

      const unchanged = await commitScopedCandidate(
        createScopedSaveCandidate({ campusId, scope: building, expectedCampusRevision: 1, mutationId: `${campusId}:unchanged:${randomUUID()}`, content: nextBuilding, dependencies: [] }),
        { actorId, isAdministrator: true },
        store,
      )
      expect(unchanged).toMatchObject({ status: 'unchanged', revision: 1 })
      expect((await store.readCampusState(campusId)).revision).toBe(1)

      const concurrentCandidates = [
        createScopedSaveCandidate({ campusId, scope: { kind: 'building' as const, id: 'synthetic-building-race-a' }, expectedCampusRevision: 1, mutationId: `${campusId}:race:a:${randomUUID()}`, content: { id: 'synthetic-building-race-a', name: 'Concurrent A' }, dependencies: [] }),
        createScopedSaveCandidate({ campusId, scope: { kind: 'campus-settings' as const, id: campusId }, expectedCampusRevision: 1, mutationId: `${campusId}:race:b:${randomUUID()}`, content: { name: 'Concurrent B' }, dependencies: [] }),
      ]
      const concurrentStarted = performance.now()
      const concurrent = await Promise.allSettled(concurrentCandidates.map((candidate) => commitScopedCandidate(candidate, { actorId, isAdministrator: true }, store)))
      const concurrentElapsedMs = performance.now() - concurrentStarted
      const concurrentCommitted = concurrent.filter((result) => result.status === 'fulfilled')
      const concurrentConflicted = concurrent.filter((result) => result.status === 'rejected' && (result.reason as { code?: string }).code === 'STALE_REVISION')
      expect(concurrentCommitted).toHaveLength(1)
      expect(concurrentConflicted).toHaveLength(1)
      expect((await store.readCampusState(campusId)).revision).toBe(2)

      const actualCounts = await pool.query(`
        SELECT (SELECT count(*)::integer FROM navi_scoped.change_sets WHERE campus_id = $1) AS change_sets,
               (SELECT count(*)::integer FROM navi_scoped.change_operations WHERE campus_id = $1) AS operations,
               (SELECT count(*)::integer FROM navi_scoped.mutation_receipts WHERE campus_id = $1) AS receipts,
               (SELECT COALESCE(sum(pg_column_size(content_json)), 0)::bigint FROM navi_scoped.change_operations WHERE campus_id = $1) AS stored_jsonb_bytes
      `, [campusId])
      const evidence = { campusId, database: 'navi_e4_test', role: 'navi_e4_runner', revision: committed.revision, finalRevision: 2, batchAckCount: committed.acknowledgments.length, replayStatus: replay.status, mutationCollisionCode: 'MUTATION_ID_REUSED', staleWriterCode: 'STALE_REVISION', transactionRollback: rollbackCounts.rows[0], concurrentCommitted: concurrentCommitted.length, concurrentStale: concurrentConflicted.length, unchangedStatus: unchanged.status, batchElapsedMs, concurrentElapsedMs, candidatePayloadBytes: payloadBytes, actualDatabaseCounts: actualCounts.rows[0], contentChecksums: [scopedContentChecksum(nextBuilding), scopedContentChecksum(nextRouting), scopedContentChecksum(nextTerrain)] }
      process.stdout.write(`E8_WRITE_EVIDENCE ${JSON.stringify(evidence)}\n`)
    })
  } else {
    it('reconnects in a separate process and reconstructs receipts, history, checkpoints, and checksums', async () => {
      const state = await store.readCampusState(campusId)
      const reconstructed = await store.reconstructCampus(campusId, state.revision)
      const [receipts, changeSets, operations, checkpoints] = await Promise.all([
        pool.query('SELECT count(*)::integer AS count FROM navi_scoped.mutation_receipts WHERE campus_id = $1', [campusId]),
        pool.query('SELECT count(*)::integer AS count FROM navi_scoped.change_sets WHERE campus_id = $1', [campusId]),
        pool.query('SELECT count(*)::integer AS count FROM navi_scoped.change_operations WHERE campus_id = $1', [campusId]),
        pool.query('SELECT count(*)::integer AS count FROM navi_scoped.checkpoints WHERE campus_id = $1', [campusId]),
      ])
      expect(state.revision).toBe(2)
      expect(reconstructed).toMatchObject({ campusId, revision: 2 })
      expect(Object.keys(reconstructed.scopes)).toHaveLength(4)
      expect(reconstructed.scopes['building:synthetic-building-1'].contentChecksum).toBe(scopedContentChecksum({ id: 'synthetic-building-1', name: 'Synthetic Library Updated', floors: [{ id: 'floor-1', rooms: ['room-1', 'room-2'] }] }))
      expect([receipts.rows[0].count, changeSets.rows[0].count, operations.rows[0].count, checkpoints.rows[0].count]).toEqual([4, 2, 4, 3])
      process.stdout.write(`E8_READ_EVIDENCE ${JSON.stringify({ campusId, revision: reconstructed.revision, campusChecksum: reconstructed.checksum, scopeCount: Object.keys(reconstructed.scopes).length, receiptCount: receipts.rows[0].count, changeSetCount: changeSets.rows[0].count, operationCount: operations.rows[0].count, checkpointCount: checkpoints.rows[0].count })}\n`)
    })
  }
})
