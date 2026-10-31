import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  commitScopedBatch,
  commitScopedCandidate,
  createScopedSaveCandidate,
  scopedBatchChecksum,
  scopedContentChecksum,
  type ScopedSaveCandidate,
  type ScopedSaveScope,
} from './scoped-campus-save'
import {
  PostgresScopedCommitStore,
  scopedPostgresSqlForTests,
  type ScopedPgClient,
  type ScopedPgPool,
  type ScopedPgQueryResult,
} from './scoped-postgres-adapter'

const campusId = "synthetic-campus-'quoted"
const documentId = `campus:${campusId}`
const building: ScopedSaveScope = { kind: 'building', id: 'building-a' }
const routing: ScopedSaveScope = { kind: 'routing', id: campusId }
const actor = { actorId: 'trusted-server-user', isAdministrator: true }
const committedAt = '2026-10-30T05:00:00.000Z'

interface FakeScope {
  scope_kind: ScopedSaveScope['kind']
  scope_id: string
  revision: number
  content_checksum: string
  content_json: unknown
}

interface FakeOperation {
  operation_index: number
  mutation_id: string
  scope_kind: ScopedSaveScope['kind']
  scope_id: string
  before_checksum: string
  after_checksum: string
  content_json: unknown
  dependencies: Array<{
    scope_kind: string
    scope_id: string
    expected_revision: number
    expected_checksum: string
    required: boolean
  }>
}

interface FakeChangeSet {
  campus_id: string
  revision: number
  batch_checksum: string
  before_head_checksum: string
  after_head_checksum: string
  operations: FakeOperation[]
}

interface FakeReceipt {
  campus_id: string
  mutation_id: string
  request_checksum: string
  content_checksum: string
  batch_checksum: string
  revision: number
  operation_index: number | null
  committed_at: string
}

interface FakeCheckpoint {
  revision: number
  scope_count: number
  snapshot_checksum: string
  snapshot_json: unknown
}

interface FakeState {
  head: null | { campus_id: string; document_id: string; revision: number; head_checksum: string; updated_at: string }
  scopes: Map<string, FakeScope>
  changes: FakeChangeSet[]
  receipts: Map<string, FakeReceipt>
  checkpoints: Map<number, FakeCheckpoint>
}

class FakeSqlError extends Error {
  constructor(message: string, readonly code = 'XX000') {
    super(message)
  }
}

function key(kind: string, id: string): string {
  return `${kind}:${id}`
}

function cloneState(state: FakeState): FakeState {
  return structuredClone(state)
}

function emptyState(): FakeState {
  return { head: null, scopes: new Map(), changes: [], receipts: new Map(), checkpoints: new Map() }
}

function makeCandidate(scope: ScopedSaveScope, mutationId: string, content: unknown, expectedRevision = 0, dependencies: ScopedSaveCandidate['dependencies'] = []) {
  return createScopedSaveCandidate({
    campusId,
    scope,
    expectedCampusRevision: expectedRevision,
    mutationId,
    content,
    dependencies,
  })
}

class FakePool implements ScopedPgPool {
  state = emptyState()
  readonly queries: Array<{ text: string; values: readonly unknown[] }> = []
  committedTransactions = 0
  rolledBackTransactions = 0
  failWhen: string | null = null
  failCode = 'XX000'
  commitAckFailure = false
  private lockHeld = false
  private lockWaiters: Array<() => void> = []

  async connect(): Promise<ScopedPgClient> {
    return new FakeClient(this)
  }

  acquireLock(): Promise<void> {
    if (!this.lockHeld) {
      this.lockHeld = true
      return Promise.resolve()
    }
    return new Promise((resolveLock) => this.lockWaiters.push(resolveLock))
  }

  releaseLock(): void {
    const next = this.lockWaiters.shift()
    if (next) next()
    else this.lockHeld = false
  }

  snapshot() {
    return cloneState(this.state)
  }
}

class FakeClient implements ScopedPgClient {
  private working: FakeState | null = null
  private locked = false

  constructor(private readonly pool: FakePool) {}

  async query<Row = Record<string, unknown>>(text: string, values: readonly unknown[] = []): Promise<ScopedPgQueryResult<Row>> {
    const compact = text.replace(/\s+/g, ' ').trim()
    this.pool.queries.push({ text: compact, values: structuredClone(values) })
    if (this.pool.failWhen && compact.includes(this.pool.failWhen)) throw new FakeSqlError(`injected failure at ${this.pool.failWhen}`, this.pool.failCode)

    if (compact.startsWith('BEGIN')) {
      this.working = cloneState(this.pool.state)
      return rows<Row>([])
    }
    if (compact === 'COMMIT') {
      if (this.working) this.pool.state = this.working
      this.pool.committedTransactions += 1
      this.working = null
      this.unlock()
      if (this.pool.commitAckFailure) throw new FakeSqlError('simulated connection loss after server commit')
      return rows<Row>([])
    }
    if (compact === 'ROLLBACK') {
      this.pool.rolledBackTransactions += 1
      this.working = null
      this.unlock()
      return rows<Row>([])
    }
    if (compact === scopedPostgresSqlForTests.lockCampus.replace(/\s+/g, ' ').trim()) {
      await this.pool.acquireLock()
      this.locked = true
      // A waiting PostgreSQL READ COMMITTED transaction sees the prior commit
      // on its next statement after the advisory lock has been granted.
      this.working = cloneState(this.pool.state)
      return rows<Row>([])
    }
    if (compact === scopedPostgresSqlForTests.setTimeouts.replace(/\s+/g, ' ').trim()) return rows<Row>([])

    const state = this.working ?? this.pool.state
    if (compact === scopedPostgresSqlForTests.lockHead.replace(/\s+/g, ' ').trim() || compact === scopedPostgresSqlForTests.readHead.replace(/\s+/g, ' ').trim()) {
      return rows<Row>(state.head ? [structuredClone(state.head) as Row] : [])
    }
    if (compact === scopedPostgresSqlForTests.readScopes.replace(/\s+/g, ' ').trim()) {
      return rows<Row>([...state.scopes.values()].sort((a, b) => key(a.scope_kind, a.scope_id).localeCompare(key(b.scope_kind, b.scope_id))).map((entry) => structuredClone(entry) as Row))
    }
    if (compact === scopedPostgresSqlForTests.readReceipts.replace(/\s+/g, ' ').trim()) {
      const ids = values[1] as string[]
      return rows<Row>(ids.flatMap((id) => {
        const receipt = state.receipts.get(id)
        return receipt ? [structuredClone(receipt) as Row] : []
      }))
    }
    if (compact === scopedPostgresSqlForTests.findReceipt.replace(/\s+/g, ' ').trim()) {
      const receipt = state.receipts.get(String(values[1]))
      return rows<Row>(receipt ? [structuredClone(receipt) as Row] : [])
    }
    if (compact === scopedPostgresSqlForTests.insertCampus.replace(/\s+/g, ' ').trim()) {
      this.requireWorking().head = {
        campus_id: String(values[0]),
        document_id: String(values[1]),
        revision: 0,
        head_checksum: String(values[2]),
        updated_at: committedAt,
      }
      return rows<Row>([])
    }
    if (compact === scopedPostgresSqlForTests.insertScope.replace(/\s+/g, ' ').trim()) {
      const content = JSON.parse(String(values[5])) as unknown
      this.requireWorking().scopes.set(key(String(values[1]), String(values[2])), {
        scope_kind: String(values[1]) as ScopedSaveScope['kind'],
        scope_id: String(values[2]),
        revision: Number(values[3]),
        content_checksum: String(values[4]),
        content_json: content,
      })
      return rows<Row>([])
    }
    if (compact === scopedPostgresSqlForTests.insertChangeSet.replace(/\s+/g, ' ').trim()) {
      const change: FakeChangeSet = {
        campus_id: String(values[0]),
        revision: Number(values[1]),
        batch_checksum: String(values[2]),
        before_head_checksum: String(values[3]),
        after_head_checksum: String(values[4]),
        operations: [],
      }
      this.requireWorking().changes.push(change)
      return rows<Row>([{ committed_at: committedAt } as Row])
    }
    if (compact === scopedPostgresSqlForTests.upsertScope.replace(/\s+/g, ' ').trim()) {
      const content = JSON.parse(String(values[5])) as unknown
      this.requireWorking().scopes.set(key(String(values[1]), String(values[2])), {
        scope_kind: String(values[1]) as ScopedSaveScope['kind'],
        scope_id: String(values[2]),
        revision: Number(values[3]),
        content_checksum: String(values[4]),
        content_json: content,
      })
      return rows<Row>([])
    }
    if (compact === scopedPostgresSqlForTests.insertOperation.replace(/\s+/g, ' ').trim()) {
      const change = this.findChange(Number(values[1]))
      change.operations.push({
        operation_index: Number(values[2]),
        mutation_id: String(values[3]),
        scope_kind: String(values[4]) as ScopedSaveScope['kind'],
        scope_id: String(values[5]),
        before_checksum: String(values[6]),
        after_checksum: String(values[7]),
        content_json: JSON.parse(String(values[8])) as unknown,
        dependencies: [],
      })
      return rows<Row>([])
    }
    if (compact === scopedPostgresSqlForTests.insertDependency.replace(/\s+/g, ' ').trim()) {
      const op = this.findChange(Number(values[1])).operations.find((entry) => entry.operation_index === Number(values[2]))
      if (!op) throw new FakeSqlError('operation dependency inserted before its operation')
      op.dependencies.push({
        scope_kind: String(values[4]),
        scope_id: String(values[5]),
        expected_revision: Number(values[6]),
        expected_checksum: String(values[7]),
        required: Boolean(values[8]),
      })
      return rows<Row>([])
    }
    if (compact === scopedPostgresSqlForTests.insertReceipt.replace(/\s+/g, ' ').trim()) {
      const receipt: FakeReceipt = {
        campus_id: String(values[0]),
        mutation_id: String(values[1]),
        request_checksum: String(values[2]),
        content_checksum: String(values[3]),
        revision: Number(values[4]),
        operation_index: values[5] === null ? null : Number(values[5]),
        batch_checksum: String(values[6]),
        committed_at: String(values[7]),
      }
      this.requireWorking().receipts.set(receipt.mutation_id, receipt)
      return rows<Row>([])
    }
    if (compact === scopedPostgresSqlForTests.updateHead.replace(/\s+/g, ' ').trim()) {
      const head = this.requireWorking().head
      if (!head) throw new FakeSqlError('head update without a campus row')
      head.revision = Number(values[1])
      head.head_checksum = String(values[2])
      head.updated_at = String(values[3])
      return rows<Row>([])
    }
    if (compact === scopedPostgresSqlForTests.insertCheckpoint.replace(/\s+/g, ' ').trim()) {
      this.requireWorking().checkpoints.set(Number(values[1]), {
        revision: Number(values[1]),
        scope_count: Number(values[2]),
        snapshot_checksum: String(values[3]),
        snapshot_json: JSON.parse(String(values[4])) as unknown,
      })
      return rows<Row>([])
    }
    if (compact === scopedPostgresSqlForTests.readCheckpoint.replace(/\s+/g, ' ').trim()) {
      const target = Number(values[1])
      const checkpoint = [...state.checkpoints.values()].filter((entry) => entry.revision <= target).sort((a, b) => b.revision - a.revision)[0]
      return rows<Row>(checkpoint ? [structuredClone(checkpoint) as Row] : [])
    }
    if (compact === scopedPostgresSqlForTests.readHistory.replace(/\s+/g, ' ').trim()) {
      const after = Number(values[1])
      const through = Number(values[2])
      const history = state.changes.filter((change) => change.revision > after && change.revision <= through)
      return rows<Row>(history.flatMap((change) => change.operations.map((operation) => ({
        revision: change.revision,
        before_head_checksum: change.before_head_checksum,
        after_head_checksum: change.after_head_checksum,
        operation_count: change.operations.length,
        operation_index: operation.operation_index,
        scope_kind: operation.scope_kind,
        scope_id: operation.scope_id,
        before_checksum: operation.before_checksum,
        after_checksum: operation.after_checksum,
        content_json: operation.content_json,
      }) as Row)))
    }
    throw new FakeSqlError(`unexpected SQL in test fake: ${compact}`)
  }

  release(): void {
    this.unlock()
  }

  private requireWorking(): FakeState {
    if (!this.working) throw new FakeSqlError('write outside transaction')
    return this.working
  }

  private findChange(revision: number): FakeChangeSet {
    const change = this.requireWorking().changes.find((entry) => entry.revision === revision)
    if (!change) throw new FakeSqlError(`missing change set ${revision}`)
    return change
  }

  private unlock(): void {
    if (!this.locked) return
    this.locked = false
    this.pool.releaseLock()
  }
}

function rows<Row>(items: Row[]): ScopedPgQueryResult<Row> {
  return { rows: items, rowCount: items.length }
}

async function makeStore(options: { checkpointInterval?: number; authorize?: (actorId: string, permission: 'read' | 'write') => boolean } = {}) {
  const pool = new FakePool()
  const store = new PostgresScopedCommitStore({
    pool,
    resolveTrustedActor: () => actor.actorId,
    resolveDocumentId: (id) => `campus:${id}`,
    authorizeActor: ({ actorId, permission }) => options.authorize?.(actorId, permission) ?? actorId === actor.actorId,
    checkpointInterval: options.checkpointInterval,
    statementTimeoutMs: 4000,
    lockTimeoutMs: 500,
  })
  await store.initializeCampus(actor.actorId, campusId, documentId, [
    { scope: building, content: { name: 'Old Building' } },
    { scope: routing, content: { roads: [] } },
  ])
  pool.queries.length = 0
  pool.committedTransactions = 0
  pool.rolledBackTransactions = 0
  return { pool, store }
}

describe('PostgresScopedCommitStore (simulated transaction tests; no PostgreSQL connection)', () => {
  it('bootstraps a revision-zero checkpoint and rejects unauthorized server identities', async () => {
    const pool = new FakePool()
    let trustedActor = 'client-claimed-admin'
    const store = new PostgresScopedCommitStore({
      pool,
      resolveTrustedActor: () => trustedActor,
      resolveDocumentId: (id) => `campus:${id}`,
      authorizeActor: ({ actorId }) => actorId === actor.actorId,
    })
    await expect(store.initializeCampus('client-claimed-admin', campusId, documentId, [])).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' })
    expect(pool.queries).toHaveLength(0)

    trustedActor = actor.actorId
    await store.initializeCampus(actor.actorId, campusId, documentId, [{ scope: building, content: { name: 'Seed' } }])
    expect(pool.state.head).toMatchObject({ revision: 0, document_id: documentId })
    expect([...pool.state.checkpoints.keys()]).toEqual([0])
    expect(pool.state.checkpoints.get(0)?.snapshot_checksum).toBe(scopedContentChecksum(pool.state.checkpoints.get(0)?.snapshot_json))
  })

  it('denies reads when no trusted server principal is present before connecting', async () => {
    const { pool } = await makeStore()
    const store = new PostgresScopedCommitStore({
      pool,
      resolveTrustedActor: () => null,
      resolveDocumentId: (id) => `campus:${id}`,
      authorizeActor: () => true,
    })
    pool.queries.length = 0

    await expect(store.readCampusState(campusId)).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' })
    await expect(store.findMutation(campusId, 'read:no-receipt')).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' })
    await expect(store.reconstructCampus(campusId, 0)).rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' })
    expect(pool.queries).toHaveLength(0)
  })

  it('separates read permission from write permission and binds writes to the trusted principal', async () => {
    const seeded = await makeStore()
    const readOnly = new PostgresScopedCommitStore({
      pool: seeded.pool,
      resolveTrustedActor: () => actor.actorId,
      resolveDocumentId: (id) => `campus:${id}`,
      authorizeActor: ({ permission }) => permission === 'read',
    })
    await expect(readOnly.readCampusState(campusId)).resolves.toMatchObject({ campusId, revision: 0 })
    await expect(readOnly.commitAtomically(makeCandidate(building, 'read-only:write', { name: 'Denied' }), actor.actorId))
      .rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' })
    expect(seeded.pool.state.head?.revision).toBe(0)

    const mismatchedPrincipal = new PostgresScopedCommitStore({
      pool: seeded.pool,
      resolveTrustedActor: () => 'different-server-principal',
      resolveDocumentId: (id) => `campus:${id}`,
      authorizeActor: () => true,
    })
    await expect(mismatchedPrincipal.commitAtomically(makeCandidate(building, 'principal:mismatch', { name: 'Denied' }), actor.actorId))
      .rejects.toMatchObject({ code: 'AUTHORIZATION_DENIED' })
    expect(seeded.pool.state.head?.revision).toBe(0)
  })

  it('checks canonical document identity on every read and uses a repeatable-read snapshot', async () => {
    const { pool } = await makeStore()
    const wrongDocument = new PostgresScopedCommitStore({
      pool,
      resolveTrustedActor: () => actor.actorId,
      resolveDocumentId: () => 'campus:other-document',
      authorizeActor: () => true,
    })
    pool.queries.length = 0
    await expect(wrongDocument.readCampusState(campusId)).rejects.toMatchObject({ code: 'DOCUMENT_IDENTITY_MISMATCH' })
    await expect(wrongDocument.findMutation(campusId, 'identity:read')).rejects.toMatchObject({ code: 'DOCUMENT_IDENTITY_MISMATCH' })
    await expect(wrongDocument.reconstructCampus(campusId, 0)).rejects.toMatchObject({ code: 'DOCUMENT_IDENTITY_MISMATCH' })

    const canonical = new PostgresScopedCommitStore({
      pool,
      resolveTrustedActor: () => actor.actorId,
      resolveDocumentId: (id) => `campus:${id}`,
      authorizeActor: () => true,
    })
    pool.queries.length = 0
    await canonical.readCampusState(campusId)
    expect(pool.queries[0]?.text).toContain('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    expect(pool.queries.some(({ text }) => text.includes('ROLLBACK'))).toBe(false)
  })

  it('rejects a stored campus head returned for a different campus identity', async () => {
    const { pool, store } = await makeStore()
    if (!pool.state.head) throw new Error('fake seed did not create a campus head')
    pool.state.head.campus_id = 'another-campus'

    await expect(store.readCampusState(campusId)).rejects.toMatchObject({ code: 'DOCUMENT_IDENTITY_MISMATCH' })
  })

  it('commits scoped content and every receipt in one campus revision, then reconstructs from checkpoint plus history', async () => {
    const { pool, store } = await makeStore({ checkpointInterval: 5 })
    const batch = [
      makeCandidate(building, 'batch:building', { name: 'New Building' }),
      makeCandidate(routing, 'batch:routing', { roads: ['road-1'] }),
    ]
    const result = await commitScopedBatch(batch, actor, store)

    expect(result).toMatchObject({ status: 'committed', revision: 1, acknowledgments: [{ revision: 1 }, { revision: 1 }] })
    expect(pool.state.head?.revision).toBe(1)
    expect(pool.state.changes).toHaveLength(1)
    expect(pool.state.changes[0].operations).toHaveLength(2)
    expect(pool.state.receipts.size).toBe(2)
    expect(pool.committedTransactions).toBe(4) // two receipt reads, one state read, one atomic write
    expect(pool.rolledBackTransactions).toBe(0)
    await expect(store.reconstructCampus(campusId, 1)).resolves.toMatchObject({
      revision: 1,
      scopes: {
        'building:building-a': { content: { name: 'New Building' } },
        [`routing:${campusId}`]: { content: { roads: ['road-1'] } },
      },
    })
  })

  it('replays exact lost-ack retries before stale-base rejection without duplicate history', async () => {
    const { pool, store } = await makeStore()
    const batch = [makeCandidate(building, 'retry:b', { name: 'Retry' }), makeCandidate(routing, 'retry:r', { roads: ['r'] })]
    await store.commitBatchAtomically(batch, actor.actorId)
    const replay = await store.commitBatchAtomically(batch, actor.actorId)

    expect(replay).toMatchObject({ status: 'replayed', acknowledgments: [{ revision: 1 }, { revision: 1 }] })
    expect(pool.state.head?.revision).toBe(1)
    expect(pool.state.changes).toHaveLength(1)
    expect(pool.state.receipts.size).toBe(2)
    const receiptRead = pool.queries.find(({ text }) => text.includes('mutation_id = ANY'))
    const staleCheck = pool.queries.findIndex(({ text }) => text.includes('mutation_id = ANY'))
    const headLock = pool.queries.findIndex(({ text }) => text.includes('FOR UPDATE'))
    expect(receiptRead).toBeDefined()
    expect(staleCheck).toBeGreaterThan(headLock)
    expect(new Set([...pool.state.receipts.values()].map((receipt) => receipt.batch_checksum)).size).toBe(1)
    expect([...pool.state.receipts.values()][0].batch_checksum).toBe(pool.state.changes[0].batch_checksum)
  })

  it('rejects single-candidate replay of a receipt originally committed in a multi-scope batch', async () => {
    const { store } = await makeStore()
    const originalBatch = [
      makeCandidate(building, 'wrapper-binding:building', { name: 'Batch Building' }),
      makeCandidate(routing, 'wrapper-binding:routing', { roads: ['Batch Road'] }),
    ]
    await store.commitBatchAtomically(originalBatch, actor.actorId)

    await expect(commitScopedCandidate(originalBatch[0], actor, store))
      .rejects.toMatchObject({ code: 'BATCH_REPLAY_INTEGRITY_FAILURE' })
  })

  it('computes one canonical batch identity independent of member ordering', () => {
    const batch = [
      makeCandidate(building, 'canonical:b', { name: 'A' }),
      makeCandidate(routing, 'canonical:r', { roads: ['R'] }),
    ]
    expect(scopedBatchChecksum(batch)).toMatch(/^[a-f0-9]{64}$/)
    expect(scopedBatchChecksum(batch)).toBe(scopedBatchChecksum([...batch].reverse()))
    expect(scopedBatchChecksum(batch)).not.toBe(scopedBatchChecksum([
      batch[0], makeCandidate(routing, 'canonical:r', { roads: ['different'] }),
    ]))
  })

  it('rejects a partial receipt set as batch replay corruption', async () => {
    const { pool, store } = await makeStore()
    const batch = [makeCandidate(building, 'partial:b', { name: 'B' }), makeCandidate(routing, 'partial:r', { roads: ['r'] })]
    await store.commitBatchAtomically(batch, actor.actorId)
    pool.state.receipts.delete('partial:r')

    await expect(store.commitBatchAtomically(batch, actor.actorId))
      .rejects.toMatchObject({ code: 'BATCH_REPLAY_INTEGRITY_FAILURE' })
  })

  it('rejects receipt substitution from a different original batch', async () => {
    const { pool, store } = await makeStore()
    const batch = [makeCandidate(building, 'substitute:b', { name: 'B' }), makeCandidate(routing, 'substitute:r', { roads: ['r'] })]
    await store.commitBatchAtomically(batch, actor.actorId)
    for (const receipt of pool.state.receipts.values()) receipt.batch_checksum = 'f'.repeat(64)

    await expect(store.commitBatchAtomically(batch, actor.actorId))
      .rejects.toMatchObject({ code: 'BATCH_REPLAY_INTEGRITY_FAILURE' })
  })

  it('binds changed and unchanged members of a mixed batch to the same receipt identity', async () => {
    const { pool, store } = await makeStore()
    const unchangedContent = pool.state.scopes.get(key(routing.kind, routing.id))?.content_json
    const batch = [
      makeCandidate(building, 'mixed:b', { name: 'Changed' }),
      makeCandidate(routing, 'mixed:r', unchangedContent),
    ]
    const result = await store.commitBatchAtomically(batch, actor.actorId)
    const receipts = [...pool.state.receipts.values()]

    expect(result.status).toBe('committed')
    expect(receipts).toHaveLength(2)
    expect(new Set(receipts.map((receipt) => receipt.batch_checksum))).toEqual(new Set([scopedBatchChecksum(batch)]))
    expect(receipts.find((receipt) => receipt.mutation_id === 'mixed:r')?.operation_index).toBeNull()
  })

  it('rejects changed payloads that reuse a receipt id', async () => {
    const { pool, store } = await makeStore()
    const original = [makeCandidate(building, 'reuse:b', { name: 'Original' }), makeCandidate(routing, 'reuse:r', { roads: ['r'] })]
    await store.commitBatchAtomically(original, actor.actorId)
    const changed = [makeCandidate(building, 'reuse:b', { name: 'Changed' }), original[1]]
    const before = pool.snapshot()

    await expect(store.commitBatchAtomically(changed, actor.actorId)).rejects.toMatchObject({ code: 'MUTATION_ID_REUSED' })
    expect(pool.snapshot()).toEqual(before)
  })

  it('rejects invalid content checksums before acquiring a client', async () => {
    const { pool, store } = await makeStore()
    const valid = makeCandidate(building, 'invalid:b', { name: 'Valid' })
    const invalid = { ...makeCandidate(routing, 'invalid:r', { roads: ['valid'] }), content: { roads: ['tampered'] } }
    await expect(store.commitBatchAtomically([valid, invalid], actor.actorId)).rejects.toMatchObject({ code: 'INVALID_CANDIDATE' })
    expect(pool.queries).toHaveLength(0)
    expect(pool.state.head?.revision).toBe(0)
  })

  it('rejects duplicate scope targets before acquiring a transaction', async () => {
    const { pool, store } = await makeStore()
    const duplicateScope = [
      makeCandidate(building, 'duplicate:one', { name: 'one' }),
      makeCandidate(building, 'duplicate:two', { name: 'two' }),
    ]

    await expect(store.commitBatchAtomically(duplicateScope, actor.actorId)).rejects.toMatchObject({ code: 'INVALID_CANDIDATE' })
    expect(pool.queries).toHaveLength(0)
  })

  it('rejects dependency checksum mismatch and stale bases without persistent effects', async () => {
    const { pool, store } = await makeStore()
    const badDependency = createScopedSaveCandidate({
      campusId, scope: routing, expectedCampusRevision: 0, mutationId: 'dep:r',
      content: { roads: ['dep'] }, dependencies: [{
        scope: building, revision: 0, contentChecksum: 'a'.repeat(64), required: true,
      }],
    })
    const dependentBatch = [makeCandidate(building, 'dep:b', { name: 'Changed' }), badDependency]
    const beforeDependency = pool.snapshot()
    await expect(store.commitBatchAtomically(dependentBatch, actor.actorId)).resolves.toMatchObject({ status: 'conflict', code: 'DEPENDENCY_CONFLICT' })
    expect(pool.snapshot()).toEqual(beforeDependency)

    const stale = [makeCandidate(building, 'stale:b', { name: 'Stale' }, 4), makeCandidate(routing, 'stale:r', { roads: ['stale'] }, 4)]
    await expect(store.commitBatchAtomically(stale, actor.actorId)).resolves.toMatchObject({ status: 'conflict', code: 'STALE_REVISION', currentRevision: 0 })
    expect(pool.snapshot()).toEqual(beforeDependency)
  })

  it('detects no-op batches without appending a revision or receipt', async () => {
    const { pool, store } = await makeStore()
    const currentBuilding = pool.state.scopes.get(key(building.kind, building.id))?.content_json
    const currentRouting = pool.state.scopes.get(key(routing.kind, routing.id))?.content_json
    const result = await store.commitBatchAtomically([
      makeCandidate(building, 'noop:b', currentBuilding),
      makeCandidate(routing, 'noop:r', currentRouting),
    ], actor.actorId)

    expect(result).toEqual({ status: 'unchanged', revision: 0 })
    expect(pool.state.head?.revision).toBe(0)
    expect(pool.state.changes).toHaveLength(0)
    expect(pool.state.receipts.size).toBe(0)
  })

  it('creates checkpoints at the configured interval and reconstructs from a previous checkpoint', async () => {
    const { pool, store } = await makeStore({ checkpointInterval: 2 })
    await store.commitBatchAtomically([
      makeCandidate(building, 'cp1:b', { name: 'One' }),
      makeCandidate(routing, 'cp1:r', { roads: ['one'] }),
    ], actor.actorId)
    expect([...pool.state.checkpoints.keys()]).toEqual([0])
    await store.commitBatchAtomically([
      makeCandidate(building, 'cp2:b', { name: 'Two' }, 1),
      makeCandidate(routing, 'cp2:r', { roads: ['two'] }, 1),
    ], actor.actorId)
    expect([...pool.state.checkpoints.keys()]).toEqual([0, 2])
    await expect(store.reconstructCampus(campusId, 1)).resolves.toMatchObject({
      revision: 1,
      scopes: { 'building:building-a': { content: { name: 'One' } } },
    })
    await expect(store.reconstructCampus(campusId, 2)).resolves.toMatchObject({
      revision: 2,
      scopes: { 'building:building-a': { content: { name: 'Two' } } },
    })
  })

  it('serializes same-base concurrent commits using the transaction-scoped campus lock', async () => {
    const { pool, store } = await makeStore()
    const batches = ['race-a', 'race-b'].map((id) => [
      makeCandidate(building, `${id}:b`, { name: id }),
      makeCandidate(routing, `${id}:r`, { roads: [id] }),
    ])
    const results = await Promise.all(batches.map((batch) => store.commitBatchAtomically(batch, actor.actorId)))

    expect(results.filter((result) => result.status === 'committed')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'conflict' && result.code === 'STALE_REVISION')).toHaveLength(1)
    expect(pool.state.head?.revision).toBe(1)
    expect(pool.state.changes).toHaveLength(1)
    expect(pool.state.receipts.size).toBe(2)
    const lockIndex = pool.queries.findIndex(({ text }) => text.includes('pg_advisory_xact_lock'))
    const headIndex = pool.queries.findIndex(({ text }) => text.includes('FOR UPDATE'))
    expect(lockIndex).toBeGreaterThanOrEqual(0)
    expect(headIndex).toBeGreaterThan(lockIndex)
  })

  it.each([
    { sqlState: '55P03', expectedCode: 'LOCK_TIMEOUT' },
    { sqlState: '40P01', expectedCode: 'RETRYABLE_TRANSACTION_FAILURE' },
  ])('rolls back and classifies PostgreSQL lock error $sqlState', async ({ sqlState, expectedCode }) => {
    const { pool, store } = await makeStore()
    const before = pool.snapshot()
    pool.failWhen = scopedPostgresSqlForTests.lockCampus.replace(/\s+/g, ' ').trim()
    pool.failCode = sqlState

    await expect(store.commitBatchAtomically([
      makeCandidate(building, `sqlstate:${sqlState}:b`, { name: 'x' }),
      makeCandidate(routing, `sqlstate:${sqlState}:r`, { roads: ['x'] }),
    ], actor.actorId)).rejects.toMatchObject({ code: expectedCode })
    expect(pool.snapshot()).toEqual(before)
    expect(pool.rolledBackTransactions).toBe(1)
    expect(pool.committedTransactions).toBe(0)
  })

  it('reports a lost COMMIT acknowledgment as unknown and resolves it by exact retry', async () => {
    const { pool, store } = await makeStore()
    const batch = [makeCandidate(building, 'commit-ack:b', { name: 'Committed' }), makeCandidate(routing, 'commit-ack:r', { roads: ['r'] })]
    pool.commitAckFailure = true

    await expect(store.commitBatchAtomically(batch, actor.actorId)).rejects.toMatchObject({ code: 'COMMIT_OUTCOME_UNKNOWN' })
    expect(pool.state.head?.revision).toBe(1)
    expect(pool.state.receipts.size).toBe(2)
    expect(pool.rolledBackTransactions).toBe(0)

    pool.commitAckFailure = false
    await expect(store.commitBatchAtomically(batch, actor.actorId)).resolves.toMatchObject({ status: 'replayed', acknowledgments: [{ revision: 1 }, { revision: 1 }] })
    expect(pool.state.changes).toHaveLength(1)
  })

  it('refuses revision advancement at the JavaScript safe-integer boundary', async () => {
    const { pool, store } = await makeStore()
    if (!pool.state.head) throw new Error('fake seed did not create a campus head')
    pool.state.head.revision = Number.MAX_SAFE_INTEGER
    const before = pool.snapshot()
    const batch = [
      makeCandidate(building, 'overflow:b', { name: 'Overflow' }, Number.MAX_SAFE_INTEGER),
      makeCandidate(routing, 'overflow:r', { roads: ['overflow'] }, Number.MAX_SAFE_INTEGER),
    ]

    await expect(store.commitBatchAtomically(batch, actor.actorId)).rejects.toMatchObject({ code: 'REVISION_EXHAUSTED' })
    expect(pool.state.changes).toEqual(before.changes)
    expect(pool.state.receipts).toEqual(before.receipts)
    expect(pool.state.head?.revision).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('rejects invalid stored revisions and tampered reconstructed history', async () => {
    const malformed = await makeStore()
    if (!malformed.pool.state.head) throw new Error('fake seed did not create a campus head')
    malformed.pool.state.head.revision = '9223372036854775807' as unknown as number
    await expect(malformed.store.readCampusState(campusId)).rejects.toMatchObject({ code: 'HISTORY_INTEGRITY_FAILURE' })

    const invalidScope = await makeStore()
    const storedBuilding = invalidScope.pool.state.scopes.get(key(building.kind, building.id))
    if (!storedBuilding) throw new Error('fake seed did not create a building scope')
    storedBuilding.revision = 1
    await expect(invalidScope.store.readCampusState(campusId)).rejects.toMatchObject({ code: 'HISTORY_INTEGRITY_FAILURE' })

    const malformedCheckpoint = await makeStore()
    const checkpoint = malformedCheckpoint.pool.state.checkpoints.get(0)
    if (!checkpoint) throw new Error('fake seed did not create a checkpoint')
    checkpoint.snapshot_json = null
    await expect(malformedCheckpoint.store.reconstructCampus(campusId, 0)).rejects.toMatchObject({ code: 'HISTORY_INTEGRITY_FAILURE' })

    const tampered = await makeStore()
    await tampered.store.commitBatchAtomically([
      makeCandidate(building, 'tamper:b', { name: 'Before tamper' }),
      makeCandidate(routing, 'tamper:r', { roads: ['r'] }),
    ], actor.actorId)
    const operation = tampered.pool.state.changes[0].operations[0]
    operation.content_json = { name: 'Tampered after commit' }
    await expect(tampered.store.reconstructCampus(campusId, 1)).rejects.toMatchObject({ code: 'HISTORY_INTEGRITY_FAILURE' })
  })

  it.each([
    'INSERT INTO navi_scoped.change_sets',
    'INSERT INTO navi_scoped.scope_heads',
    'INSERT INTO navi_scoped.change_operations',
    'INSERT INTO navi_scoped.mutation_receipts',
    'UPDATE navi_scoped.campus_heads',
    'INSERT INTO navi_scoped.checkpoints',
  ])('rolls back all persistent effects when SQL fails at %s', async (failurePoint) => {
    const { pool, store } = await makeStore({ checkpointInterval: 1 })
    const before = pool.snapshot()
    pool.failWhen = failurePoint
    const batch = [makeCandidate(building, 'fail:b', { name: 'Failed' }), makeCandidate(routing, 'fail:r', { roads: ['failed'] })]

    await expect(store.commitBatchAtomically(batch, actor.actorId)).rejects.toMatchObject({ code: 'DATABASE_FAILURE' })
    expect(pool.snapshot()).toEqual(before)
    expect(pool.rolledBackTransactions).toBe(1)
    expect(pool.committedTransactions).toBe(0)
  })

  it('binds identities and JSON payloads as SQL parameters and applies bounded transaction timeouts', async () => {
    const { pool, store } = await makeStore()
    const marker = "PAYLOAD-ONLY-'NOT-SQL"
    await store.commitBatchAtomically([
      makeCandidate(building, 'bind:b', { marker }),
      makeCandidate(routing, 'bind:r', { roads: [marker] }),
    ], actor.actorId)

    expect(pool.queries.every(({ text }) => !text.includes(marker) && !text.includes(campusId))).toBe(true)
    expect(pool.queries.some(({ values }) => values.includes(campusId))).toBe(true)
    expect(pool.queries.some(({ text, values }) => text.includes("set_config('statement_timeout'") && values[0] === '4000ms' && values[1] === '500ms')).toBe(true)
  })

  it('keeps document identity server-resolved and rolls back on a stored identity mismatch', async () => {
    const pool = new FakePool()
    const goodStore = new PostgresScopedCommitStore({
      pool,
      resolveTrustedActor: () => actor.actorId,
      resolveDocumentId: () => documentId,
      authorizeActor: () => true,
    })
    await goodStore.initializeCampus(actor.actorId, campusId, documentId, [])
    const before = pool.snapshot()
    const rollbackCountBefore = pool.rolledBackTransactions
    const store = new PostgresScopedCommitStore({
      pool,
      resolveTrustedActor: () => actor.actorId,
      resolveDocumentId: () => 'campus:different-document',
      authorizeActor: () => true,
    })
    await expect(store.commitBatchAtomically([
      makeCandidate(building, 'identity:b', { name: 'X' }),
      makeCandidate(routing, 'identity:r', { roads: ['x'] }),
    ], actor.actorId)).rejects.toMatchObject({ code: 'DOCUMENT_IDENTITY_MISMATCH' })
    expect(pool.snapshot()).toEqual(before)
    expect(pool.rolledBackTransactions).toBe(rollbackCountBefore + 1)
  })

  it('checks the additive SQL and rollback proposal without connecting to PostgreSQL', () => {
    const forward = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261030045317_navi_scoped_persistence_foundation.sql'), 'utf8')
    const rollback = readFileSync(resolve(process.cwd(), 'supabase/rollback/20261030045317_navi_scoped_persistence_foundation.rollback.sql'), 'utf8')
    const seedSql = readFileSync(resolve(process.cwd(), 'scripts/track-e4-postgres-integration/01-seed-and-contracts.sql'), 'utf8')
    const harness = readFileSync(resolve(process.cwd(), 'scripts/track-e4-postgres-integration/run.ps1'), 'utf8')
    for (const table of ['campus_heads', 'scope_heads', 'change_sets', 'change_operations', 'change_dependencies', 'mutation_receipts', 'checkpoints']) {
      expect(forward).toContain(`navi_scoped.${table}`)
    }
    expect(forward).toContain('ENABLE ROW LEVEL SECURITY')
    expect(forward).toContain('REVOKE ALL ON SCHEMA navi_scoped FROM PUBLIC')
    expect(forward).toContain('owned by the migration executor')
    expect(forward).toContain("REVOKE ALL ON SCHEMA navi_scoped FROM authenticated")
    expect(forward).toContain("REVOKE ALL ON SCHEMA navi_scoped FROM anon")
    expect(forward.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(7)
    expect(forward).toContain('change_operations_scope_history_idx')
    expect(forward).toContain('change_dependencies_scope_idx')
    expect(forward).toMatch(/change_sets[\s\S]*?batch_checksum TEXT NOT NULL/)
    expect(forward).toMatch(/mutation_receipts[\s\S]*?batch_checksum TEXT NOT NULL/)
    expect(forward).toMatch(/FOREIGN KEY \(campus_id, revision, batch_checksum\)[\s\S]*?REFERENCES navi_scoped\.change_sets\(campus_id, revision, batch_checksum\)/)
    expect(forward).not.toMatch(/^\s*DROP\s/im)
    expect(forward).not.toMatch(/ALTER\s+TABLE\s+public\./i)
    expect(forward).not.toMatch(/CREATE\s+EXTENSION/i)
    const syntheticChecksums = [...seedSql.matchAll(/repeat\('([^']+)',\s*64\)/g)].map((match) => match[1])
    expect(syntheticChecksums.length).toBeGreaterThan(0)
    expect(syntheticChecksums.every((value) => /^[a-f0-9]$/.test(value))).toBe(true)
    expect(harness).toContain("'databaseComment', shobj_description(d.oid, 'pg_database')")
    expect(harness).toContain("'navi-e4-synthetic-v1'")
    expect(harness).toContain("'databaseOwner', pg_get_userbyid(d.datdba)")
    expect(rollback.indexOf('DROP TABLE IF EXISTS navi_scoped.checkpoints')).toBeLessThan(rollback.indexOf('DROP TABLE IF EXISTS navi_scoped.campus_heads'))
    expect(rollback).not.toMatch(/^\s*DROP\s+[^;]+\s+CASCADE\s*;/im)
  })

  it('records deterministic synthetic scope and checkpoint efficiency measurements', async () => {
    const fullCampus = {
      buildings: Array.from({ length: 24 }, (_, index) => ({
        id: `building-${index + 1}`,
        name: `Synthetic Building ${index + 1}`,
        floors: Array.from({ length: 4 }, (__, floor) => ({ floor, rooms: Array.from({ length: 18 }, (___, room) => ({ room, area: 12.5 + room })) })),
      })),
      routing: { roads: Array.from({ length: 700 }, (_, index) => ({ id: `road-${index}`, coordinates: [[121 + index / 100_000, 14], [121 + index / 100_000 + 0.0005, 14.0005]] })) },
      terrain: { contours: Array.from({ length: 500 }, (_, index) => ({ id: `contour-${index}`, elevation: 20 + index % 90, coordinates: [[121, 14], [121.001, 14.001], [121.002, 14.002]] })) },
    }
    const scopedDocuments = [
      { kind: 'building' as const, id: 'building-1', content: fullCampus.buildings[0] },
      { kind: 'routing' as const, id: campusId, content: fullCampus.routing },
      { kind: 'terrain' as const, id: campusId, content: fullCampus.terrain },
    ]
    const fullBytes = Buffer.byteLength(JSON.stringify(fullCampus))
    const scopedBytes = scopedDocuments.map(({ content }) => Buffer.byteLength(JSON.stringify(content)))
    const scopeSummaryBytes = scopedDocuments.reduce((sum, _entry, index) => sum + scopedBytes[index], 0)

    const { pool, store } = await makeStore({ checkpointInterval: 5 })
    const checkpoints = [0]
    for (let revision = 1; revision <= 20; revision += 1) {
      const scope = scopedDocuments[(revision - 1) % scopedDocuments.length]
      const content = { ...scope.content as Record<string, unknown>, syntheticRevision: revision }
      const result = await store.commitAtomically(
        makeCandidate({ kind: scope.kind, id: scope.id }, `efficiency-${revision}`, content, revision - 1),
        actor.actorId,
      )
      expect(result.status).toBe('committed')
      if (revision % 5 === 0) checkpoints.push(revision)
    }

    const fullHistoryBytes = fullBytes * 20
    const scopedHistoryBytes = scopedBytes.reduce((sum, bytes) => sum + bytes, 0) * Math.ceil(20 / scopedDocuments.length)
    const reconstructionMetrics = []
    for (const interval of [5, 10, 20]) {
      const targetRevision = 19
      const baseCheckpoint = Math.floor(targetRevision / interval) * interval
      const operationCount = targetRevision - baseCheckpoint
      const started = performance.now()
      const reconstructed = await store.reconstructCampus(campusId, 19)
      const elapsedMs = performance.now() - started
      expect(reconstructed.revision).toBe(targetRevision)
      reconstructionMetrics.push({ interval, checkpointAtOrBeforeRevision: baseCheckpoint, operationsToReplay: operationCount, fakeReconstructionMs: Number(elapsedMs.toFixed(3)) })
    }

    expect([...pool.state.checkpoints.keys()]).toEqual([0, 5, 10, 15, 20])
    expect(fullHistoryBytes).toBeGreaterThan(scopedHistoryBytes)
    expect(checkpoints).toEqual([0, 5, 10, 15, 20])
    expect(reconstructionMetrics.map((metric) => metric.operationsToReplay)).toEqual([4, 9, 19])
    const metrics = {
      fixture: 'deterministic synthetic campus; 24 buildings, 700 routing segments, 500 terrain contours',
      serializedBytes: { fullCampusPerRevision: fullBytes, selectedBuildingPerRevision: scopedBytes[0], routingPerRevision: scopedBytes[1], terrainPerRevision: scopedBytes[2], representativeScopeUpdateBytes: scopeSummaryBytes, fullCampusHistory20Revisions: fullHistoryBytes, scopedHistory20Revisions: scopedHistoryBytes },
      checkpointInterval: 5,
      checkpointRevisions: [...pool.state.checkpoints.keys()],
      reconstructionTradeoffModel: reconstructionMetrics,
      measuredFakeReconstructionAtConfiguredIntervalMs: reconstructionMetrics[0].fakeReconstructionMs,
      caveat: 'In-process transaction fake only; serialized JSON and elapsed time do not model PostgreSQL TOAST, indexes, WAL, network, disk, or query planning.',
    }
    console.log(`NAVI_E3_EFFICIENCY ${JSON.stringify(metrics)}`)
  })
})
