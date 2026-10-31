import { describe, expect, it } from 'vitest'
import {
  commitScopedCandidate,
  createScopedSaveCandidate,
  scopedContentChecksum,
  type ScopedCommitStore,
  type ScopedSaveScope,
} from './scoped-campus-save'
import { InMemoryScopedCommitStore, ScopedHistoryIntegrityError } from './scoped-campus-history.local'

const actor = { actorId: 'synthetic-admin', isAdministrator: true }
const buildingA: ScopedSaveScope = { kind: 'building', id: 'building-a' }
const buildingB: ScopedSaveScope = { kind: 'building', id: 'building-b' }
const routing: ScopedSaveScope = { kind: 'routing', id: 'campus-routing' }

function candidate(input: {
  campusId?: string
  scope?: ScopedSaveScope
  revision?: number
  mutationId?: string
  content: unknown
  dependencies?: Parameters<typeof createScopedSaveCandidate>[0]['dependencies']
}) {
  return createScopedSaveCandidate({
    campusId: input.campusId ?? 'campus-test',
    scope: input.scope ?? buildingA,
    expectedCampusRevision: input.revision ?? 0,
    mutationId: input.mutationId ?? 'mutation-1',
    content: input.content,
    dependencies: input.dependencies ?? [],
  })
}

function scopeContent(store: InMemoryScopedCommitStore, campusId: string, scope: ScopedSaveScope, revision: number) {
  return store.reconstructCampus(campusId, revision).scopes[`${scope.kind}:${scope.id}`]?.content
}

describe('local-only scoped campus history rehearsal', () => {
  it('serializes concurrent edits with a campus-wide compare-and-swap', async () => {
    const store = new InMemoryScopedCommitStore()
    store.seedCampus('campus-test', [
      { scope: buildingA, content: { rooms: ['old-a'] } },
      { scope: buildingB, content: { rooms: ['old-b'] } },
    ])
    const saves = [
      candidate({ scope: buildingA, content: { rooms: ['new-a'] }, mutationId: 'edit-a' }),
      candidate({ scope: buildingB, content: { rooms: ['new-b'] }, mutationId: 'edit-b' }),
    ]

    const results = await Promise.allSettled(saves.map((save) => commitScopedCandidate(save, actor, store)))
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result) => result.status === 'rejected')
    expect(rejected).toMatchObject({ status: 'rejected', reason: expect.objectContaining({ code: 'STALE_REVISION' }) })
    await expect(store.readCampusState('campus-test')).resolves.toMatchObject({ revision: 1 })
    expect(store.getChangeSets('campus-test')).toHaveLength(1)
  })

  it('replays one exact receipt for concurrent retries of the same mutation', async () => {
    const store = new InMemoryScopedCommitStore()
    store.seedCampus('campus-test', [{ scope: buildingA, content: { rooms: ['old'] } }])
    const save = candidate({ content: { rooms: ['saved'] } })

    const results = await Promise.all([
      commitScopedCandidate(save, actor, store),
      commitScopedCandidate(save, actor, store),
    ])
    expect(results.map((result) => result.status).sort()).toEqual(['committed', 'replayed'])
    const acknowledgments = results.map((result) => {
      if (result.status === 'unchanged') throw new Error('Concurrent retry should produce a receipt.')
      return result.acknowledgment
    })
    expect(acknowledgments[0]).toEqual(acknowledgments[1])
    await expect(store.readCampusState('campus-test')).resolves.toMatchObject({ revision: 1 })
  })

  it('scopes mutation receipts by campus id', async () => {
    const store = new InMemoryScopedCommitStore()
    store.seedCampus('campus-one', [{ scope: buildingA, content: { rooms: [] } }])
    store.seedCampus('campus-two', [{ scope: buildingA, content: { rooms: [] } }])
    const saves = [
      candidate({ campusId: 'campus-one', content: { rooms: ['one'] }, mutationId: 'same-client-id' }),
      candidate({ campusId: 'campus-two', content: { rooms: ['two'] }, mutationId: 'same-client-id' }),
    ]

    const results = await Promise.all(saves.map((save) => commitScopedCandidate(save, actor, store)))
    expect(results.map((result) => result.status)).toEqual(['committed', 'committed'])
    expect(results.map((result) => result.status === 'committed' ? result.acknowledgment.campusId : '')).toEqual(['campus-one', 'campus-two'])
  })

  it('confirms unchanged content atomically without creating a revision or change set', async () => {
    const initial = { rooms: ['same'] }
    const store = new InMemoryScopedCommitStore()
    store.seedCampus('campus-test', [{ scope: buildingA, content: initial }])

    await expect(commitScopedCandidate(candidate({ content: initial }), actor, store)).resolves.toEqual({ status: 'unchanged', revision: 0 })
    expect(store.getChangeSets('campus-test')).toHaveLength(0)
    expect(store.getCheckpointRevisions('campus-test')).toEqual([0])
  })

  it('rechecks cross-scope dependencies inside the atomic boundary', async () => {
    const oldRouting = { nodes: [{ id: 'old' }] }
    const store = new InMemoryScopedCommitStore()
    store.seedCampus('campus-test', [
      { scope: buildingA, content: { rooms: [] } },
      { scope: routing, content: oldRouting },
    ])
    const routeCandidate = candidate({ scope: routing, content: { nodes: [{ id: 'new' }] }, mutationId: 'route-update' })
    await commitScopedCandidate(routeCandidate, actor, store)

    const buildingCandidate = candidate({
      scope: buildingA,
      revision: 1,
      content: { rooms: ['new-room'] },
      mutationId: 'building-update',
      dependencies: [{ scope: routing, revision: 0, contentChecksum: scopedContentChecksum(oldRouting), required: true }],
    })
    await expect(store.commitAtomically(buildingCandidate, actor.actorId)).resolves.toMatchObject({
      status: 'conflict',
      code: 'DEPENDENCY_CONFLICT',
      currentRevision: 1,
    })
    await expect(commitScopedCandidate(buildingCandidate, actor, store)).rejects.toMatchObject({ code: 'DEPENDENCY_CONFLICT' })
    expect(store.getChangeSets('campus-test')).toHaveLength(1)
  })

  it('stores scope-specific change sets and reconstructs revisions across checkpoints', async () => {
    const store = new InMemoryScopedCommitStore(3, () => '2026-10-30T00:00:00.000Z')
    store.seedCampus('campus-test', [
      { scope: buildingA, content: { rooms: ['initial-a'] } },
      { scope: buildingB, content: { rooms: ['initial-b'] } },
    ])
    await commitScopedCandidate(candidate({ scope: buildingA, content: { rooms: ['rev-1-a'] }, mutationId: 'r1' }), actor, store)
    await commitScopedCandidate(candidate({ scope: buildingB, revision: 1, content: { rooms: ['rev-2-b'] }, mutationId: 'r2' }), actor, store)
    await commitScopedCandidate(candidate({ scope: buildingA, revision: 2, content: { rooms: ['rev-3-a'] }, mutationId: 'r3' }), actor, store)
    await commitScopedCandidate(candidate({ scope: buildingB, revision: 3, content: { rooms: ['rev-4-b'] }, mutationId: 'r4' }), actor, store)

    const history = store.getChangeSets('campus-test')
    expect(history[0]).toMatchObject({
      scope: buildingA,
      operation: { kind: 'replace-scope', afterChecksum: scopedContentChecksum({ rooms: ['rev-1-a'] }) },
    })
    expect(Object.keys(history[0])).toContain('scope')
    expect(store.getCheckpointRevisions('campus-test')).toEqual([0, 3])
    expect(scopeContent(store, 'campus-test', buildingB, 2)).toEqual({ rooms: ['rev-2-b'] })
    expect(scopeContent(store, 'campus-test', buildingA, 4)).toEqual({ rooms: ['rev-3-a'] })
    expect(scopeContent(store, 'campus-test', buildingB, 4)).toEqual({ rooms: ['rev-4-b'] })
  })

  it('blocks reconstruction when a checkpoint checksum is corrupted', async () => {
    const store = new InMemoryScopedCommitStore(2)
    store.seedCampus('campus-test', [{ scope: buildingA, content: { rooms: [] } }])
    await commitScopedCandidate(candidate({ content: { rooms: ['one'] } }), actor, store)
    await commitScopedCandidate(candidate({ revision: 1, mutationId: 'mutation-2', content: { rooms: ['two'] } }), actor, store)
    store.tamperCheckpointForTest('campus-test', 2)

    expect(() => store.reconstructCampus('campus-test', 2)).toThrow(ScopedHistoryIntegrityError)
  })

  it('blocks reconstruction when a scoped operation checksum is corrupted', async () => {
    const store = new InMemoryScopedCommitStore(5)
    store.seedCampus('campus-test', [{ scope: buildingA, content: { rooms: [] } }])
    await commitScopedCandidate(candidate({ content: { rooms: ['one'] } }), actor, store)
    store.tamperChangeSetForTest('campus-test', 1)

    expect(() => store.reconstructCampus('campus-test', 1)).toThrow(ScopedHistoryIntegrityError)
  })

  it('replays the committed receipt after a simulated lost response', async () => {
    const memory = new InMemoryScopedCommitStore()
    memory.seedCampus('campus-test', [{ scope: buildingA, content: { rooms: [] } }])
    const save = candidate({ content: { rooms: ['committed'] } })
    let loseResponse = true
    const store: ScopedCommitStore = {
      readCampusState: (campusId) => memory.readCampusState(campusId),
      findMutation: (campusId, mutationId) => memory.findMutation(campusId, mutationId),
      async commitAtomically(candidateToCommit, actorId) {
        const result = await memory.commitAtomically(candidateToCommit, actorId)
        if (loseResponse) {
          loseResponse = false
          throw new Error('synthetic response loss after durable commit')
        }
        return result
      },
    }

    await expect(commitScopedCandidate(save, actor, store)).rejects.toThrow('synthetic response loss')
    await expect(commitScopedCandidate(save, actor, store)).resolves.toMatchObject({ status: 'replayed', acknowledgment: { revision: 1 } })
    await expect(memory.readCampusState('campus-test')).resolves.toMatchObject({ revision: 1 })
  })
})
