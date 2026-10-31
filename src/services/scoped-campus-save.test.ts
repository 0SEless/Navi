import { describe, expect, it, vi } from 'vitest'
import {
  commitScopedCandidate,
  createLegacyRevisionCheckpoint,
  createScopedSaveCandidate,
  reconstructLegacyCheckpoint,
  type ScopedCampusState,
  type ScopedCommitAcknowledgment,
  type ScopedCommitStore,
} from './scoped-campus-save'

const campusId = 'campus-test'
const buildingScope = { kind: 'building' as const, id: 'building-a' }
const initial = { walls: [{ id: 'wall-1', points: [[0, 0], [1, 1]] }] }
const changed = { walls: [{ id: 'wall-1', points: [[0, 0], [2, 2]] }] }

function state(overrides: Partial<ScopedCampusState> = {}): ScopedCampusState {
  return {
    campusId,
    revision: 4,
    scopes: { 'building:building-a': { revision: 4, contentChecksum: 'old' } },
    ...overrides,
  }
}

function createStore(overrides: Partial<ScopedCommitStore> = {}, initialState: ScopedCampusState = state()) {
  let current = initialState
  const acknowledgments = new Map<string, ScopedCommitAcknowledgment>()
  const mutationKey = (campus: string, mutationId: string) => `${campus}\u0000${mutationId}`
  const store: ScopedCommitStore = {
    readCampusState: vi.fn(async () => current),
    findMutation: vi.fn(async (campusId, mutationId) => acknowledgments.get(mutationKey(campusId, mutationId)) ?? null),
    commitAtomically: vi.fn(async (candidate) => {
      const existingReceipt = acknowledgments.get(mutationKey(candidate.campusId, candidate.mutationId))
      if (existingReceipt) {
        return existingReceipt.requestChecksum === candidate.requestChecksum
          ? { status: 'replayed' as const, acknowledgment: existingReceipt }
          : { status: 'conflict' as const, code: 'MUTATION_ID_REUSED' as const, currentRevision: current.revision }
      }
      if (candidate.expectedCampusRevision !== current.revision) {
        return { status: 'conflict' as const, code: 'STALE_REVISION' as const, currentRevision: current.revision }
      }
      for (const dependency of candidate.dependencies) {
        const currentDependency = current.scopes[`${dependency.scope.kind}:${dependency.scope.id}`]
        if (!currentDependency && dependency.required) {
          return { status: 'conflict' as const, code: 'DEPENDENCY_MISSING' as const, currentRevision: current.revision }
        }
        if (currentDependency && (currentDependency.revision !== dependency.revision || currentDependency.contentChecksum !== dependency.contentChecksum)) {
          return { status: 'conflict' as const, code: 'DEPENDENCY_CONFLICT' as const, currentRevision: current.revision }
        }
      }
      const existingScope = current.scopes[`${candidate.scope.kind}:${candidate.scope.id}`]
      if (existingScope?.contentChecksum === candidate.contentChecksum) {
        return { status: 'unchanged' as const, revision: current.revision }
      }
      const acknowledgment: ScopedCommitAcknowledgment = {
        campusId: candidate.campusId,
        revision: current.revision + 1,
        mutationId: candidate.mutationId,
        requestChecksum: candidate.requestChecksum,
        contentChecksum: candidate.contentChecksum,
        committedAt: '2026-10-30T00:00:00.000Z',
      }
      current = {
        ...current,
        revision: acknowledgment.revision,
        scopes: { ...current.scopes, [`${candidate.scope.kind}:${candidate.scope.id}`]: { revision: acknowledgment.revision, contentChecksum: candidate.contentChecksum } },
      }
      acknowledgments.set(mutationKey(candidate.campusId, candidate.mutationId), acknowledgment)
      return { status: 'committed' as const, acknowledgment }
    }),
    ...overrides,
  }
  return { store, acknowledgments, getState: () => current, setState: (next: ScopedCampusState) => { current = next } }
}

async function candidate(content: unknown = changed, overrides: Record<string, unknown> = {}) {
  return createScopedSaveCandidate({
    campusId,
    scope: buildingScope,
    expectedCampusRevision: 4,
    mutationId: 'mutation-1',
    content,
    dependencies: [],
    ...overrides,
  })
}

describe('scoped campus save contract', () => {
  it('commits one immutable scoped candidate and returns an exact acknowledgment', async () => {
    const { store } = createStore()
    const save = await candidate()
    const result = await commitScopedCandidate(save, { actorId: 'admin-1', isAdministrator: true }, store)
    expect(result.status).toBe('committed')
    if (result.status !== 'committed') throw new Error('expected a committed acknowledgment')
    expect(result.acknowledgment).toMatchObject({ campusId, revision: 5, mutationId: save.mutationId, requestChecksum: save.requestChecksum, contentChecksum: save.contentChecksum })
    expect(store.commitAtomically).toHaveBeenCalledWith(save, 'admin-1')
  })

  it('suppresses an unchanged document without a cloud commit', async () => {
    const save = await candidate(initial)
    const { store } = createStore({}, state({ scopes: { 'building:building-a': { revision: 4, contentChecksum: save.contentChecksum } } }))
    await expect(commitScopedCandidate(save, { actorId: 'admin-1', isAdministrator: true }, store)).resolves.toMatchObject({ status: 'unchanged', revision: 4 })
    expect(store.commitAtomically).toHaveBeenCalledWith(save, 'admin-1')
  })

  it('rejects a stale campus revision before attempting an atomic commit', async () => {
    const { store } = createStore({ readCampusState: vi.fn(async () => state({ revision: 5 })) })
    await expect(commitScopedCandidate(await candidate(), { actorId: 'admin-1', isAdministrator: true }, store)).rejects.toMatchObject({ code: 'STALE_REVISION' })
    expect(store.commitAtomically).not.toHaveBeenCalled()
  })

  it('replays the exact acknowledgment for a duplicate mutation id and checksum', async () => {
    const save = await candidate()
    const acknowledgment = { campusId, revision: 5, mutationId: save.mutationId, requestChecksum: save.requestChecksum, contentChecksum: save.contentChecksum, committedAt: '2026-10-30T00:00:00.000Z' }
    const { store } = createStore({ findMutation: vi.fn(async () => acknowledgment) })
    await expect(commitScopedCandidate(save, { actorId: 'admin-1', isAdministrator: true }, store)).resolves.toEqual({ status: 'replayed', acknowledgment })
    expect(store.commitAtomically).not.toHaveBeenCalled()
  })

  it('rejects reuse of a mutation id with a changed payload checksum', async () => {
    const save = await candidate()
    const { store } = createStore({ findMutation: vi.fn(async () => ({ campusId, revision: 5, mutationId: save.mutationId, requestChecksum: 'different', contentChecksum: 'different', committedAt: '2026-10-30T00:00:00.000Z' })) })
    await expect(commitScopedCandidate(save, { actorId: 'admin-1', isAdministrator: true }, store)).rejects.toMatchObject({ code: 'MUTATION_ID_REUSED' })
  })

  it('recovers an interrupted request by replaying the committed acknowledgment', async () => {
    const save = await candidate()
    const backend = createStore()
    vi.mocked(backend.store.commitAtomically).mockImplementationOnce(async (candidate, actorId) => {
      const committed = await createStore().store.commitAtomically(candidate, actorId)
      const ack = committed.status === 'committed' ? committed.acknowledgment : undefined
      if (ack) backend.acknowledgments.set(`${candidate.campusId}\u0000${candidate.mutationId}`, ack)
      throw new Error('connection interrupted after commit')
    })
    await expect(commitScopedCandidate(save, { actorId: 'admin-1', isAdministrator: true }, backend.store)).rejects.toThrow('connection interrupted')
    const recovered = await commitScopedCandidate(save, { actorId: 'admin-1', isAdministrator: true }, backend.store)
    expect(recovered.status).toBe('replayed')
    if (recovered.status !== 'replayed') throw new Error('expected a replay acknowledgment')
    expect(recovered.acknowledgment.revision).toBe(5)
  })

  it('keeps the submitted content snapshot stable while later edits continue', async () => {
    const edited = { walls: [{ id: 'wall-1', points: [[0, 0], [2, 2]] }] }
    const save = await candidate(edited)
    edited.walls[0].points[1][0] = 99
    const { store } = createStore()
    await commitScopedCandidate(save, { actorId: 'admin-1', isAdministrator: true }, store)
    expect(save.content).toEqual(changed)
    expect(save.contentChecksum).toBe((await candidate(changed)).contentChecksum)
  })

  it('accepts a delayed acknowledgment for the submitted snapshot after the editor advances', async () => {
    const edited = { walls: [{ id: 'wall-1', points: [[0, 0], [2, 2]] }] }
    const save = await candidate(edited)
    let release!: (value: { status: 'committed'; acknowledgment: ScopedCommitAcknowledgment }) => void
    let entered!: () => void
    const enteredCommit = new Promise<void>((resolve) => { entered = resolve })
    const delayed = new Promise<{ status: 'committed'; acknowledgment: ScopedCommitAcknowledgment }>((resolve) => { release = resolve })
    const { store } = createStore({ commitAtomically: vi.fn(async () => { entered(); return delayed }) })
    const pending = commitScopedCandidate(save, { actorId: 'admin-1', isAdministrator: true }, store)
    await enteredCommit
    edited.walls[0].points[1][0] = 7
    release({ status: 'committed', acknowledgment: { campusId, revision: 5, mutationId: save.mutationId, requestChecksum: save.requestChecksum, contentChecksum: save.contentChecksum, committedAt: '2026-10-30T00:00:00.000Z' } })
    await expect(pending).resolves.toMatchObject({ status: 'committed', acknowledgment: { revision: 5, contentChecksum: save.contentChecksum } })
    expect(save.content).toEqual(changed)
  })

  it('rejects a cross-scope dependency whose campus revision or checksum changed', async () => {
    const save = await candidate(changed, { dependencies: [{ scope: { kind: 'routing', id: 'campus-routing' }, revision: 3, contentChecksum: 'a'.repeat(64), required: true }] })
    const { store } = createStore({}, state({ scopes: { 'building:building-a': { revision: 4, contentChecksum: 'old' }, 'routing:campus-routing': { revision: 4, contentChecksum: 'b'.repeat(64) } } }))
    await expect(commitScopedCandidate(save, { actorId: 'admin-1', isAdministrator: true }, store)).rejects.toMatchObject({ code: 'DEPENDENCY_CONFLICT' })
    expect(store.commitAtomically).not.toHaveBeenCalled()
  })

  it('denies an unauthorized actor before reading or writing campus state', async () => {
    const { store } = createStore()
    await expect(commitScopedCandidate(await candidate(), { actorId: 'member-1', isAdministrator: false }, store)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(store.readCampusState).not.toHaveBeenCalled()
    expect(store.commitAtomically).not.toHaveBeenCalled()
  })

  it('rejects a missing required terrain dependency', async () => {
    const save = await candidate(changed, { dependencies: [{ scope: { kind: 'terrain', id: 'terrain-v2' }, revision: 1, contentChecksum: 'c'.repeat(64), required: true }] })
    const { store } = createStore()
    await expect(commitScopedCandidate(save, { actorId: 'admin-1', isAdministrator: true }, store)).rejects.toMatchObject({ code: 'DEPENDENCY_MISSING' })
  })

  it('rejects unsupported scope kinds and malformed or duplicate dependencies', async () => {
    expect(() => createScopedSaveCandidate({
      campusId,
      scope: { kind: 'unknown' as never, id: 'building-a' },
      expectedCampusRevision: 4,
      mutationId: 'mutation-1',
      content: changed,
      dependencies: [],
    })).toThrowError(expect.objectContaining({ code: 'INVALID_CANDIDATE' }))
    await expect(candidate(changed, { dependencies: [{ scope: { kind: 'routing', id: 'campus-routing' }, revision: 0, contentChecksum: 'not-a-hash', required: true }] })).rejects.toMatchObject({ code: 'INVALID_CANDIDATE' })
    expect(() => createScopedSaveCandidate({
      campusId,
      scope: buildingScope,
      expectedCampusRevision: 4,
      mutationId: 'mutation-1',
      content: changed,
      dependencies: [
        { scope: { kind: 'routing', id: 'campus-routing' }, revision: 0, contentChecksum: 'a'.repeat(64), required: true },
        { scope: { kind: 'routing', id: 'campus-routing' }, revision: 0, contentChecksum: 'a'.repeat(64), required: true },
      ],
    })).toThrowError(expect.objectContaining({ code: 'INVALID_CANDIDATE' }))
  })

  it('rejects an acknowledgment that skips a campus revision', async () => {
    const save = await candidate()
    const { store } = createStore({
      commitAtomically: vi.fn(async () => ({
        status: 'committed' as const,
        acknowledgment: {
          campusId,
          revision: 6,
          mutationId: save.mutationId,
          requestChecksum: save.requestChecksum,
          contentChecksum: save.contentChecksum,
          committedAt: '2026-10-30T00:00:00.000Z',
        },
      })),
    })
    await expect(commitScopedCandidate(save, { actorId: 'admin-1', isAdministrator: true }, store)).rejects.toMatchObject({ code: 'INVALID_ACKNOWLEDGMENT' })
  })

  it('wraps a legacy full snapshot as a deterministic reconstruction checkpoint', () => {
    const legacy = { campusId, revision: 2, capturedAt: '2025-01-01T00:00:00.000Z', graph: { nodes: [{ id: 'n1' }], edges: [] } }
    const checkpoint = createLegacyRevisionCheckpoint(legacy)
    expect(checkpoint.format).toBe('legacy-full-snapshot-v1')
    expect(reconstructLegacyCheckpoint(checkpoint)).toEqual(legacy)
  })
})
