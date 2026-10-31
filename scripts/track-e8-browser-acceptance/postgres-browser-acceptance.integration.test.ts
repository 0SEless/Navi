import pg from 'pg'
import { describe, expect, it } from 'vitest'
import { projectScopedDocument } from '../../src/services/scoped-change-detection'
import { PostgresScopedCommitStore } from '../../src/services/scoped-postgres-adapter'
import { createE84BrowserCampusDocument, createE8BrowserCampusDocument, createE83BrowserCampusDocument } from './fixture'

const mode = process.env.NAVI_E8_BROWSER_DB_MODE
const active = mode === 'bootstrap' || mode === 'verify'
const suite = active ? describe : describe.skip

suite(`E8.1 browser PostgreSQL ${mode}`, () => {
  const campusId = process.env.NAVI_E8_BROWSER_CAMPUS_ID ?? ''
  const actorId = 'e8-browser-global-admin'
  const documentId = `campus:${campusId}`
  const pool = new pg.Pool({
    host: process.env.NAVI_E5_PG_HOST,
    port: Number(process.env.NAVI_E5_PG_PORT),
    database: process.env.NAVI_E5_PG_DATABASE,
    user: process.env.NAVI_E5_PG_USER,
    password: process.env.NAVI_E5_PG_PASSWORD,
    connectionTimeoutMillis: 3000,
    application_name: 'navi-e8-1-browser-synthetic',
    max: 2,
  })

  const store = new PostgresScopedCommitStore({
    pool,
    resolveTrustedActor: () => actorId,
    resolveDocumentId: (requestedCampusId) => requestedCampusId === campusId ? documentId : null,
    authorizeActor: (context) => context.actorId === actorId && context.campusId === campusId && context.documentId === documentId,
  })

  it.skipIf(mode !== 'bootstrap')('seeds one uniquely named revision-zero synthetic editor campus', async () => {
    expect(campusId).toMatch(/^navi-e8-browser-[a-f0-9]{16}$/)
    expect(process.env.NAVI_E5_PG_HOST).toBe('127.0.0.1')
    expect(process.env.NAVI_E5_PG_PORT).toBe('55433')
    expect(process.env.NAVI_E5_PG_DATABASE).toBe('navi_e4_test')
    expect(process.env.NAVI_E5_PG_USER).toBe('navi_e4_runner')
    expect(process.env.NAVI_E5_PG_PASSWORD).toBeTruthy()
    const identity = await pool.query(`
      SELECT current_database() AS database, session_user AS role,
             current_setting('server_version_num')::integer AS version_num,
             shobj_description(d.oid, 'pg_database') AS marker
      FROM pg_database d WHERE d.datname = current_database()
    `)
    expect(identity.rows[0]).toMatchObject({ database: 'navi_e4_test', role: 'navi_e4_runner', marker: 'navi-e4-synthetic-v1' })
    expect(Number(identity.rows[0].version_num)).toBeGreaterThanOrEqual(170000)
    expect(Number(identity.rows[0].version_num)).toBeLessThan(180000)
    const schema = await pool.query(`SELECT to_regnamespace('navi_scoped') IS NOT NULL AS present`)
    expect(schema.rows[0].present).toBe(true)

    const document = process.env.NAVI_E8_BROWSER_FIXTURE === 'e83'
      ? createE83BrowserCampusDocument(campusId)
      : process.env.NAVI_E8_BROWSER_FIXTURE === 'e84'
        ? createE84BrowserCampusDocument(campusId)
        : createE8BrowserCampusDocument(campusId)
    const projection = projectScopedDocument(document, campusId)
    expect(projection.status).toBe('projected')
    if (projection.status !== 'projected') throw new Error('The synthetic editor fixture could not be projected into scoped data.')
    await store.initializeCampus(actorId, campusId, documentId, projection.scopes.map(({ scope, content }) => ({ scope, content })))
    const state = await store.readCampusState(campusId)
    expect(state).toMatchObject({ campusId, revision: 0 })
    process.stdout.write(`E8_1_BROWSER_BOOTSTRAP ${JSON.stringify({ campusId, revision: state.revision, scopeCount: Object.keys(state.scopes).length })}\n`)
  })

  it.skipIf(mode !== 'verify')('records actual final PostgreSQL row counts and reconstructed checksum after browser workflow', async () => {
    const state = await store.readCampusState(campusId)
    const reconstructed = await store.reconstructCampus(campusId, state.revision)
    const revisionChecksums: Array<{ revision: number; checksum: string }> = []
    for (let revision = 1; revision <= state.revision; revision += 1) {
      const reconstructedAtRevision = await store.reconstructCampus(campusId, revision)
      revisionChecksums.push({ revision, checksum: reconstructedAtRevision.checksum })
    }
    const result = await pool.query(`
      SELECT (SELECT count(*)::integer FROM navi_scoped.change_sets WHERE campus_id = $1) AS change_sets,
             (SELECT count(*)::integer FROM navi_scoped.change_operations WHERE campus_id = $1) AS operations,
             (SELECT count(*)::integer FROM navi_scoped.mutation_receipts WHERE campus_id = $1) AS receipts,
             (SELECT count(*)::integer FROM navi_scoped.checkpoints WHERE campus_id = $1) AS checkpoints,
             (SELECT COALESCE(sum(pg_column_size(content_json)), 0)::bigint FROM navi_scoped.change_operations WHERE campus_id = $1) AS stored_jsonb_bytes
    `, [campusId])
    const operationsByScope = await pool.query(`
      SELECT scope_kind, scope_id, count(*)::integer AS operations
      FROM navi_scoped.change_operations WHERE campus_id = $1
      GROUP BY scope_kind, scope_id ORDER BY scope_kind, scope_id
    `, [campusId])
    const scopeHeads = await pool.query(`
      SELECT scope_kind, scope_id, revision, content_checksum
      FROM navi_scoped.scope_heads WHERE campus_id = $1
      ORDER BY scope_kind, scope_id
    `, [campusId])
    const expectedRevision = Number(process.env.NAVI_E8_BROWSER_EXPECTED_REVISION ?? 1)
    expect(state.revision).toBe(expectedRevision)
    expect(reconstructed.revision).toBe(expectedRevision)
    if (process.env.NAVI_E8_BROWSER_FIXTURE === 'e84') {
      const terrain = reconstructed.scopes[`terrain:${campusId}`]
      expect(terrain?.revision).toBe(1)
      expect(terrain?.content).toMatchObject({
        terrainVerticalDatum: { kind: 'campus-local', name: 'E8.4 synthetic campus datum', elevationStatus: 'authored-not-surveyed' },
        terrainAreas: [{ id: expect.stringMatching(/^terrain-/), name: 'Synthetic north lawn', elevationMeters: 3.25 }],
      })
      expect(Object.keys(terrain?.content as object)).toContain('terrainAreas')
      expect(operationsByScope.rows).toEqual([{ scope_kind: 'terrain', scope_id: campusId, operations: 1 }])
      // PostgreSQL BIGINT revisions are returned as strings by node-postgres.
      expect(scopeHeads.rows.filter((head) => head.scope_kind !== 'terrain').every((head) => Number(head.revision) === 0)).toBe(true)
      expect(Number(scopeHeads.rows.find((head) => head.scope_kind === 'terrain')?.revision)).toBe(1)
      expect(result.rows[0]).toMatchObject({ change_sets: 1, operations: 1, receipts: 1 })
      process.stdout.write(`E8_4_BROWSER_DB_EVIDENCE ${JSON.stringify({ campusId, revision: state.revision, scopeCount: Object.keys(reconstructed.scopes).length, reconstructedChecksum: reconstructed.checksum, revisionChecksums, actualRows: result.rows[0], operationsByScope: operationsByScope.rows, scopeHeads: scopeHeads.rows, terrainContent: terrain?.content })}\n`)
    } else if (process.env.NAVI_E8_BROWSER_FIXTURE === 'e83') {
      expect(reconstructed.scopes['building:e8-building-lab']?.content).toMatchObject({ name: 'E8.3 newer edit durably saved' })
      expect(reconstructed.scopes['building:e8-building-library']?.content).toMatchObject({ name: 'E8.3 winner' })
      expect((reconstructed.scopes[`routing:${campusId}`]?.content as { roads?: Array<{ id: string; routing?: { feature?: string } }> })?.roads)
        .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'e83-synthetic-road', routing: expect.objectContaining({ feature: 'ramp' }) })]))
      expect(result.rows[0]).toMatchObject({ change_sets: 5, operations: 6, receipts: 6 })
      process.stdout.write(`E8_3_BROWSER_DB_EVIDENCE ${JSON.stringify({ campusId, revision: state.revision, scopeCount: Object.keys(reconstructed.scopes).length, reconstructedChecksum: reconstructed.checksum, revisionChecksums, actualRows: result.rows[0], operationsByScope: operationsByScope.rows, scopeChecksums: state.scopes })}\n`)
    } else {
      expect(reconstructed.scopes['building:e8-building-lab']?.content).toMatchObject({ name: 'Unchanged Synthetic Lab' })
      expect(reconstructed.scopes['building:e8-building-library']?.content).toMatchObject({ name: 'Synthetic Library E8.1 Accepted' })
      expect(result.rows[0]).toMatchObject({ change_sets: 1, operations: 1, receipts: 1 })
      process.stdout.write(`E8_1_BROWSER_DB_EVIDENCE ${JSON.stringify({ campusId, revision: state.revision, scopeCount: Object.keys(reconstructed.scopes).length, reconstructedChecksum: reconstructed.checksum, actualRows: result.rows[0] })}\n`)
    }
  })

  it('closes its E5-only PostgreSQL connection pool', async () => {
    await pool.end()
  })
})
