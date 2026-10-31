import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { commitScopedBatch, createScopedSaveCandidate } from '../../src/services/scoped-campus-save.ts'
import { PostgresScopedCommitStore } from '../../src/services/scoped-postgres-adapter.ts'

const enabled = process.env.NAVI_E5_ADAPTER_INTEGRATION === '1'
const integrationDescribe = enabled ? describe : describe.skip

integrationDescribe('E5 real PostgreSQL adapter integration', () => {
  let pool
  let store
  let campusId
  const actorId = 'navi-e5-synthetic-administrator'
  const documentId = 'navi-e5-synthetic-document'
  const buildingScope = { kind: 'building', id: 'e5-adapter-building' }

  beforeAll(async () => {
    if (!process.env.NAVI_E5_PGPASSWORD) throw new Error('NAVI_E5_PGPASSWORD is required in this process only.')
    pool = new pg.Pool({
      host: process.env.NAVI_E5_PGHOST,
      port: Number(process.env.NAVI_E5_PGPORT),
      database: process.env.NAVI_E5_PGDATABASE,
      user: process.env.NAVI_E5_PGUSER,
      password: process.env.NAVI_E5_PGPASSWORD,
      connectionTimeoutMillis: 3000,
      max: 4,
    })
    const identity = await pool.query(`
      SELECT current_database() AS database, session_user AS role,
             current_setting('server_version_num')::integer AS version_num
    `)
    expect(identity.rows[0]).toMatchObject({ database: 'navi_e4_test', role: 'navi_e4_runner' })
    expect(identity.rows[0].version_num).toBeGreaterThanOrEqual(170000)
    expect(identity.rows[0].version_num).toBeLessThan(180000)

    store = new PostgresScopedCommitStore({
      pool,
      resolveTrustedActor: () => actorId,
      resolveDocumentId: (id) => (id === campusId ? documentId : null),
      authorizeActor: ({ actorId: trustedActor, permission }) => trustedActor === actorId && ['read', 'write'].includes(permission),
      checkpointInterval: 1,
    })
    campusId = `navi-e5-adapter-${randomUUID()}`
    await store.initializeCampus(actorId, campusId, documentId, [
      { scope: buildingScope, content: { name: 'Synthetic Initial Building', floors: 1 } },
      { scope: { kind: 'routing', id: campusId }, content: { routes: ['synthetic-route-a'] } },
    ])
  }, 15000)

  afterAll(async () => {
    await pool?.end()
  })

  it('commits and replays a batch, reconstructs state, and matches independent PostgreSQL rows', async () => {
    const candidates = [
      createScopedSaveCandidate({
        campusId,
        scope: buildingScope,
        expectedCampusRevision: 0,
        mutationId: `e5-adapter-building-${randomUUID()}`,
        content: { name: 'Synthetic Updated Building', floors: 2 },
        dependencies: [],
      }),
      createScopedSaveCandidate({
        campusId,
        scope: { kind: 'routing', id: campusId },
        expectedCampusRevision: 0,
        mutationId: `e5-adapter-routing-${randomUUID()}`,
        content: { routes: ['synthetic-route-a', 'synthetic-route-b'] },
        dependencies: [],
      }),
    ]

    const committed = await commitScopedBatch(candidates, { actorId, isAdministrator: true }, store)
    expect(committed).toMatchObject({ status: 'committed', revision: 1 })
    expect(committed.acknowledgments).toHaveLength(2)

    const replayed = await commitScopedBatch(candidates, { actorId, isAdministrator: true }, store)
    expect(replayed).toMatchObject({ status: 'replayed', revision: 1 })

    const current = await store.readCampusState(campusId)
    expect(current).toMatchObject({ campusId, revision: 1 })
    const reconstructed = await store.reconstructCampus(campusId, 1)
    expect(reconstructed).toMatchObject({
      campusId,
      revision: 1,
      scopes: {
        [`building:${buildingScope.id}`]: { content: { name: 'Synthetic Updated Building', floors: 2 } },
        [`routing:${campusId}`]: { content: { routes: ['synthetic-route-a', 'synthetic-route-b'] } },
      },
    })

    const independent = await pool.query(
      `SELECT h.revision::integer AS revision,
              (SELECT count(*)::integer FROM navi_scoped.scope_heads WHERE campus_id = $1) AS scope_count,
              (SELECT count(*)::integer FROM navi_scoped.change_sets WHERE campus_id = $1) AS change_set_count,
              (SELECT count(*)::integer FROM navi_scoped.change_operations WHERE campus_id = $1) AS operation_count,
              (SELECT count(*)::integer FROM navi_scoped.mutation_receipts WHERE campus_id = $1) AS receipt_count,
              (SELECT count(*)::integer FROM navi_scoped.checkpoints WHERE campus_id = $1) AS checkpoint_count
       FROM navi_scoped.campus_heads h WHERE h.campus_id = $1`,
      [campusId],
    )
    expect(independent.rows[0]).toMatchObject({
      revision: 1,
      scope_count: 2,
      change_set_count: 1,
      operation_count: 2,
      receipt_count: 2,
      checkpoint_count: 2,
    })
  }, 15000)
})
