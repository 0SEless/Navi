import { describe, expect, it } from 'vitest'
import { createScopedSaveCandidate, commitScopedBatch, commitScopedCandidate, type ScopedCommitAcknowledgment, type ScopedSaveCandidate, type ScopedSaveScope } from './scoped-campus-save'
import { InMemoryScopedCommitStore } from './scoped-campus-history.local'

const actor = { actorId: 'local-reference', isAdministrator: true }
const building: ScopedSaveScope = { kind: 'building', id: 'building-1' }
const routing: ScopedSaveScope = { kind: 'routing', id: 'campus-1' }

function candidate(scope: ScopedSaveScope, mutationId: string, content: unknown) {
  return createScopedSaveCandidate({
    campusId: 'campus-1', scope, expectedCampusRevision: 0, mutationId, content, dependencies: [],
  })
}

async function snapshot(store: InMemoryScopedCommitStore, mutationIds: string[]) {
  const state = await store.readCampusState('campus-1')
  return {
    state,
    receipts: await Promise.all(mutationIds.map((id) => store.findMutation('campus-1', id))),
    history: store.getChangeSets('campus-1'),
    checkpoints: store.getCheckpointRevisions('campus-1'),
    reconstructed: store.reconstructCampus('campus-1', state.revision),
  }
}

function expectAtomicStateUnchanged(before: Awaited<ReturnType<typeof snapshot>>, after: Awaited<ReturnType<typeof snapshot>>) {
  expect(after).toEqual(before)
}

describe('atomic scoped batch contract', () => {
  it('commits multiple scope operations in one campus revision and reconstructs them together', async () => {
    const store = new InMemoryScopedCommitStore(5)
    store.seedCampus('campus-1', [
      { scope: building, content: { name: 'Old' } },
      { scope: routing, content: { roads: [] } },
    ])

    const result = await commitScopedBatch([
      candidate(building, 'batch-1:building', { name: 'New' }),
      candidate(routing, 'batch-1:routing', { roads: ['road-1'] }),
    ], actor, store)

    expect(result).toMatchObject({ status: 'committed', revision: 1, acknowledgments: [{ revision: 1 }, { revision: 1 }] })
    expect(store.getChangeSets('campus-1')).toHaveLength(1)
    expect(store.reconstructCampus('campus-1', 1).scopes['building:building-1'].content).toEqual({ name: 'New' })
    expect(store.reconstructCampus('campus-1', 1).scopes['routing:campus-1'].content).toEqual({ roads: ['road-1'] })
  })

  it('replays an exact multi-scope retry without advancing history again', async () => {
    const store = new InMemoryScopedCommitStore()
    store.seedCampus('campus-1', [{ scope: building, content: { name: 'Old' } }, { scope: routing, content: { roads: [] } }])
    const batch = [candidate(building, 'batch-2:building', { name: 'New' }), candidate(routing, 'batch-2:routing', { roads: ['r'] })]

    await commitScopedBatch(batch, actor, store)
    await expect(commitScopedBatch(batch, actor, store)).resolves.toMatchObject({ status: 'replayed', revision: 1 })
    expect(store.getChangeSets('campus-1')).toHaveLength(1)
  })

  it('rejects batch replay acknowledgments bound to different original batches', async () => {
    const store = new InMemoryScopedCommitStore()
    store.seedCampus('campus-1', [{ scope: building, content: { name: 'Old' } }, { scope: routing, content: { roads: [] } }])
    const batch = [candidate(building, 'substituted:building', { name: 'New' }), candidate(routing, 'substituted:routing', { roads: ['r'] })]
    const batchIdentity = new Map(batch.map((entry, index) => [entry.mutationId, index === 0 ? 'a'.repeat(64) : 'b'.repeat(64)]))
    store.findMutation = async (_campusId, mutationId) => {
      const member = batch.find((entry) => entry.mutationId === mutationId)
      if (!member) return null
      const acknowledgment: ScopedCommitAcknowledgment = {
        campusId: member.campusId,
        revision: 1,
        mutationId: member.mutationId,
        requestChecksum: member.requestChecksum,
        contentChecksum: member.contentChecksum,
        batchChecksum: batchIdentity.get(mutationId),
        committedAt: '2026-10-30T00:00:00.000Z',
      }
      return acknowledgment
    }

    await expect(commitScopedBatch(batch, actor, store)).rejects.toMatchObject({ code: 'BATCH_REPLAY_INTEGRITY_FAILURE' })
  })

  it('rejects a partial set when any existing receipt carries durable batch binding', async () => {
    const store = new InMemoryScopedCommitStore()
    store.seedCampus('campus-1', [{ scope: building, content: { name: 'Old' } }, { scope: routing, content: { roads: [] } }])
    const batch = [candidate(building, 'partial-bound:building', { name: 'New' }), candidate(routing, 'partial-bound:routing', { roads: ['r'] })]
    store.findMutation = async (_campusId, mutationId) => {
      if (mutationId !== batch[0].mutationId) return null
      return {
        campusId: batch[0].campusId,
        revision: 1,
        mutationId: batch[0].mutationId,
        requestChecksum: batch[0].requestChecksum,
        contentChecksum: batch[0].contentChecksum,
        batchChecksum: 'a'.repeat(64),
        committedAt: '2026-10-30T00:00:00.000Z',
      }
    }

    await expect(commitScopedBatch(batch, actor, store)).rejects.toMatchObject({ code: 'BATCH_REPLAY_INTEGRITY_FAILURE' })
  })

  it('does not partially commit when one candidate has a stale dependency', async () => {
    const store = new InMemoryScopedCommitStore()
    store.seedCampus('campus-1', [{ scope: building, content: { name: 'Old' } }, { scope: routing, content: { roads: [] } }])
    const stale = createScopedSaveCandidate({
      campusId: 'campus-1', scope: routing, expectedCampusRevision: 0, mutationId: 'batch-3:routing',
      content: { roads: ['r'] }, dependencies: [{ scope: building, revision: 4, contentChecksum: 'a'.repeat(64), required: true }],
    })

    const before = await snapshot(store, ['batch-3:building', 'batch-3:routing'])
    await expect(commitScopedBatch([
      candidate(building, 'batch-3:building', { name: 'New' }), stale,
    ], actor, store)).rejects.toMatchObject({ code: 'DEPENDENCY_CONFLICT' })
    expectAtomicStateUnchanged(before, await snapshot(store, ['batch-3:building', 'batch-3:routing']))
  })

  it('rejects a valid-plus-invalid batch without changing any durable reference state', async () => {
    const store = new InMemoryScopedCommitStore(1)
    store.seedCampus('campus-1', [{ scope: building, content: { name: 'Old' } }, { scope: routing, content: { roads: [] } }])
    const valid = candidate(building, 'invalid-member:building', { name: 'New' })
    const invalid = { ...candidate(routing, 'invalid-member:routing', { roads: ['r'] }), content: { roads: ['tampered'] } }
    const before = await snapshot(store, [valid.mutationId, invalid.mutationId])

    await expect(commitScopedBatch([valid, invalid], actor, store)).rejects.toMatchObject({ code: 'INVALID_CANDIDATE' })
    expectAtomicStateUnchanged(before, await snapshot(store, [valid.mutationId, invalid.mutationId]))
  })

  it('rejects a stale batch base without changing revision, receipts, history or checkpoints', async () => {
    const store = new InMemoryScopedCommitStore(1)
    store.seedCampus('campus-1', [{ scope: building, content: { name: 'Old' } }, { scope: routing, content: { roads: [] } }])
    await commitScopedCandidate(candidate(building, 'advance:building', { name: 'Advanced' }), actor, store)
    const staleBatch: ScopedSaveCandidate[] = [
      candidate(building, 'stale:building', { name: 'New' }),
      candidate(routing, 'stale:routing', { roads: ['r'] }),
    ]
    const before = await snapshot(store, staleBatch.map(({ mutationId }) => mutationId))

    await expect(commitScopedBatch(staleBatch, actor, store)).rejects.toMatchObject({ code: 'STALE_REVISION' })
    expectAtomicStateUnchanged(before, await snapshot(store, staleBatch.map(({ mutationId }) => mutationId)))
  })

  it('rejects a dependency checksum mismatch at the same revision atomically', async () => {
    const store = new InMemoryScopedCommitStore(1)
    store.seedCampus('campus-1', [{ scope: building, content: { name: 'Old' } }, { scope: routing, content: { roads: [] } }])
    const dependent = createScopedSaveCandidate({
      campusId: 'campus-1', scope: routing, expectedCampusRevision: 0, mutationId: 'checksum:routing',
      content: { roads: ['r'] }, dependencies: [{ scope: building, revision: 0, contentChecksum: 'a'.repeat(64), required: true }],
    })
    const batch = [candidate(building, 'checksum:building', { name: 'New' }), dependent]
    const before = await snapshot(store, batch.map(({ mutationId }) => mutationId))

    await expect(commitScopedBatch(batch, actor, store)).rejects.toMatchObject({ code: 'DEPENDENCY_CONFLICT' })
    expectAtomicStateUnchanged(before, await snapshot(store, batch.map(({ mutationId }) => mutationId)))
  })

  it('rejects duplicate mutation ids before touching reference state', async () => {
    const store = new InMemoryScopedCommitStore()
    store.seedCampus('campus-1', [{ scope: building, content: { name: 'Old' } }, { scope: routing, content: { roads: [] } }])
    const batch = [candidate(building, 'duplicate:id', { name: 'New' }), candidate(routing, 'duplicate:id', { roads: ['r'] })]
    const before = await snapshot(store, ['duplicate:id'])

    await expect(commitScopedBatch(batch, actor, store)).rejects.toMatchObject({ code: 'INVALID_CANDIDATE' })
    expectAtomicStateUnchanged(before, await snapshot(store, ['duplicate:id']))
  })

  it('serializes concurrent edits so only one same-base batch advances history', async () => {
    const store = new InMemoryScopedCommitStore(1)
    store.seedCampus('campus-1', [{ scope: building, content: { name: 'Old' } }, { scope: routing, content: { roads: [] } }])
    const batches = ['concurrent-a', 'concurrent-b'].map((id) => [
      candidate(building, `${id}:building`, { name: id }),
      candidate(routing, `${id}:routing`, { roads: [id] }),
    ])
    const results = await Promise.allSettled(batches.map((batch) => commitScopedBatch(batch, actor, store)))

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'STALE_REVISION' } })
    const state = await store.readCampusState('campus-1')
    expect(state.revision).toBe(1)
    expect(store.getChangeSets('campus-1')).toHaveLength(1)
    expect(store.getChangeSets('campus-1')[0]).toMatchObject({ kind: 'scoped-batch', revision: 1 })
    expect(store.getCheckpointRevisions('campus-1')).toEqual([0, 1])
    expect(store.reconstructCampus('campus-1', 1).revision).toBe(1)
  })

  it('replays a lost acknowledgment retry without duplicating its receipt or checkpoint', async () => {
    const store = new InMemoryScopedCommitStore(1)
    store.seedCampus('campus-1', [{ scope: building, content: { name: 'Old' } }, { scope: routing, content: { roads: [] } }])
    const batch = [candidate(building, 'lost-ack:building', { name: 'New' }), candidate(routing, 'lost-ack:routing', { roads: ['r'] })]
    const first = await commitScopedBatch(batch, actor, store)
    const beforeRetry = await snapshot(store, batch.map(({ mutationId }) => mutationId))

    await expect(commitScopedBatch(batch, actor, store)).resolves.toMatchObject({ status: 'replayed', revision: 1 })
    expectAtomicStateUnchanged(beforeRetry, await snapshot(store, batch.map(({ mutationId }) => mutationId)))
    expect(first.status).toBe('committed')
  })
})
