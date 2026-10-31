import { describe, expect, it, vi } from 'vitest'
import { scopedBatchChecksum, scopedContentChecksum } from './scoped-campus-save'
import { handleScopedSaveRequest } from './scoped-save-request'
import { authorizeScopedSave, type VerifiedMutationUser } from '@/lib/api-guard'

const campusId = 'e8-synthetic-campus'
const buildingA = { kind: 'building', id: 'e8-building-a' }
const buildingB = { kind: 'building', id: 'e8-building-b' }
const initialA = { id: buildingA.id, name: 'Synthetic A' }

async function getHandler() {
  return handleScopedSaveRequest as unknown as (request: Request, dependencies: Record<string, unknown>) => Promise<Response>
}

function createFakeStore(initialRevision = 0) {
  let revision = initialRevision
  const scopes: Record<string, { scope: { kind: string; id: string }; revision: number; contentChecksum: string; content: unknown }> = {
    [`building:${buildingA.id}`]: {
      scope: buildingA,
      revision: initialRevision,
      contentChecksum: scopedContentChecksum(initialA),
      content: initialA,
    },
  }
  const receipts = new Map<string, Record<string, unknown>>()
  const store = {
    async readCampusState(id: string) {
      return { campusId: id, revision, scopes: Object.fromEntries(Object.entries(scopes).map(([key, value]) => [key, { revision: value.revision, contentChecksum: value.contentChecksum }])) }
    },
    async findMutation(_id: string, mutationId: string) {
      return receipts.get(mutationId) ?? null
    },
    async commitAtomically(candidate: Record<string, unknown>) {
      const expected = candidate.expectedCampusRevision as number
      if (revision !== expected) return { status: 'conflict', code: 'STALE_REVISION', currentRevision: revision }
      const nextRevision = revision + 1
      const checksum = scopedBatchChecksum([candidate as never])
      const acknowledgment = {
        campusId: candidate.campusId,
        revision: nextRevision,
        mutationId: candidate.mutationId,
        requestChecksum: candidate.requestChecksum,
        contentChecksum: candidate.contentChecksum,
        batchChecksum: checksum,
        committedAt: new Date().toISOString(),
      }
      const scope = candidate.scope as { kind: string; id: string }
      scopes[`${scope.kind}:${scope.id}`] = {
        scope,
        revision: nextRevision,
        contentChecksum: candidate.contentChecksum as string,
        content: candidate.content,
      }
      revision = nextRevision
      receipts.set(candidate.mutationId as string, acknowledgment)
      return { status: 'committed', acknowledgment }
    },
    async commitBatchAtomically(candidates: readonly Record<string, unknown>[]) {
      const expected = candidates[0].expectedCampusRevision as number
      if (revision !== expected) return { status: 'conflict', code: 'STALE_REVISION', currentRevision: revision }
      const nextRevision = revision + 1
      const checksum = scopedBatchChecksum(candidates as never[])
      const acknowledgments = candidates.map((candidate) => ({
        campusId: candidate.campusId,
        revision: nextRevision,
        mutationId: candidate.mutationId,
        requestChecksum: candidate.requestChecksum,
        contentChecksum: candidate.contentChecksum,
        batchChecksum: checksum,
        committedAt: new Date().toISOString(),
      }))
      candidates.forEach((candidate, index) => {
        const scope = candidate.scope as { kind: string; id: string }
        scopes[`${scope.kind}:${scope.id}`] = {
          scope,
          revision: nextRevision,
          contentChecksum: candidate.contentChecksum as string,
          content: candidate.content,
        }
        receipts.set(candidate.mutationId as string, acknowledgments[index] as unknown as Record<string, unknown>)
      })
      revision = nextRevision
      return { status: 'committed', acknowledgments }
    },
  }
  return store
}

function makeDependencies(overrides: Record<string, unknown> = {}) {
  const store = createFakeStore()
  return {
    enabled: () => true,
    verifyPrincipal: vi.fn(async () => ({ ok: true, principal: { id: 'verified-global-admin', email: 'admin@example.test', role: 'super_admin', method: 'supabase' } })),
    authorize: vi.fn(() => ({ authorized: true })),
    createStore: vi.fn(async () => store),
    ...overrides,
  }
}

function post(body: unknown, contentType = 'application/json') {
  return new Request('http://localhost/api/studio/scoped-save', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('authenticated scoped-save request service', () => {
  it('returns disabled before authentication or store access', async () => {
    const handle = await getHandler()
    if (!handle) return
    const dependencies = makeDependencies({ enabled: () => false })
    const response = await handle(post({}), dependencies)
    expect(response.status).toBe(404)
    expect(dependencies.verifyPrincipal).not.toHaveBeenCalled()
    expect(dependencies.createStore).not.toHaveBeenCalled()
  })

  it('returns the injected authentication response without accessing the store', async () => {
    const handle = await getHandler()
    if (!handle) return
    const dependencies = makeDependencies({ verifyPrincipal: async () => ({ ok: false, response: new Response('unauthenticated', { status: 401 }) }) })
    const response = await handle(post({ campusId, expectedCampusRevision: 0, operations: [{ mutationId: 'unauth', scope: buildingA, content: {}, dependencies: [] }] }), dependencies)
    expect(response.status).toBe(401)
    expect(dependencies.createStore).not.toHaveBeenCalled()
  })

  it('rejects campus authorization before constructing a store', async () => {
    const handle = await getHandler()
    if (!handle) return
    const dependencies = makeDependencies({ authorize: () => ({ authorized: false, code: 'AUTHORIZATION_DENIED' }) })
    const response = await handle(post({ campusId, expectedCampusRevision: 0, operations: [{ mutationId: 'denied', scope: buildingA, content: {}, dependencies: [] }] }), dependencies)
    expect(response.status).toBe(403)
    expect(dependencies.createStore).not.toHaveBeenCalled()
  })

  it('permits a verified synthetic global administrator through the real scoped authorization policy', async () => {
    const handle = await getHandler()
    if (!handle) return
    const dependencies = makeDependencies({ authorize: authorizeScopedSave })
    const response = await handle(post({ campusId, expectedCampusRevision: 0, operations: [{ mutationId: 'policy-admin', scope: buildingA, content: initialA, dependencies: [] }] }), dependencies)
    expect(response.status).toBe(200)
    expect(dependencies.createStore).toHaveBeenCalledOnce()
  })

  it('denies verified campus administrators without a trusted campus ACL before store creation', async () => {
    const handle = await getHandler()
    if (!handle) return
    const campusAdmin: VerifiedMutationUser = { id: 'synthetic-campus-admin', email: 'campus-admin@example.test', role: 'campus_admin', method: 'supabase' }
    const dependencies = makeDependencies({
      verifyPrincipal: vi.fn(async () => ({ ok: true, principal: campusAdmin })),
      authorize: authorizeScopedSave,
    })
    const response = await handle(post({ campusId: 'another-synthetic-campus', expectedCampusRevision: 0, operations: [{ mutationId: 'cross-campus-denied', scope: buildingA, content: initialA, dependencies: [] }] }), dependencies)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'AUTHORIZATION_DENIED' })
    expect(dependencies.createStore).not.toHaveBeenCalled()
  })

  it('denies the protected campus and never creates a transaction store', async () => {
    const handle = await getHandler()
    if (!handle) return
    const dependencies = makeDependencies({ authorize: authorizeScopedSave })
    const response = await handle(post({ campusId: 'map-map-1-k6bv', expectedCampusRevision: 0, operations: [{ mutationId: 'protected-denied', scope: buildingA, content: initialA, dependencies: [] }] }), dependencies)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'PROTECTED_CAMPUS' })
    expect(dependencies.createStore).not.toHaveBeenCalled()
  })

  it.each(['actorId', 'userId', 'role', 'isAdministrator', 'documentId'])('rejects client-supplied %s identity claims', async (key) => {
    const handle = await getHandler()
    if (!handle) return
    const dependencies = makeDependencies()
    const response = await handle(post({ campusId, expectedCampusRevision: 0, operations: [], [key]: 'forged' }), dependencies)
    expect(response.status).toBe(400)
    expect(dependencies.createStore).not.toHaveBeenCalled()
  })

  it('rejects oversized and malformed JSON bodies', async () => {
    const handle = await getHandler()
    if (!handle) return
    const dependencies = makeDependencies()
    const oversized = await handle(post(' '.repeat(1_048_577)), dependencies)
    expect(oversized.status).toBe(413)
    const malformed = await handle(post('{'), dependencies)
    expect(malformed.status).toBe(400)
    expect(dependencies.createStore).not.toHaveBeenCalled()
  })

  it('rejects invalid scopes and malformed dependency records', async () => {
    const handle = await getHandler()
    if (!handle) return
    const dependencies = makeDependencies()
    const invalidScope = await handle(post({ campusId, expectedCampusRevision: 0, operations: [{ mutationId: 'm-1', scope: { kind: 'unknown', id: 'x' }, content: {} }] }), dependencies)
    expect(invalidScope.status).toBe(400)
    const invalidDependency = await handle(post({ campusId, expectedCampusRevision: 0, operations: [{ mutationId: 'm-2', scope: buildingB, content: {}, dependencies: [{ scope: buildingA, revision: -1, contentChecksum: 'bad', required: true }] }] }), dependencies)
    expect(invalidDependency.status).toBe(400)
    const invalidChecksum = await handle(post({ campusId, expectedCampusRevision: 0, operations: [{ mutationId: 'm-3', scope: buildingB, content: {}, dependencies: [{ scope: buildingA, revision: 0, contentChecksum: 'bad', required: true }] }] }), dependencies)
    expect(invalidChecksum.status).toBe(400)
    expect(dependencies.createStore).not.toHaveBeenCalled()
  })

  it('commits one scope and returns its exact durable acknowledgment', async () => {
    const handle = await getHandler()
    if (!handle) return
    const dependencies = makeDependencies()
    const response = await handle(post({ campusId, expectedCampusRevision: 0, operations: [{ mutationId: 'e8-one', scope: buildingA, content: { ...initialA, name: 'Changed A' }, dependencies: [] }] }), dependencies)
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ durable: true, storage: 'local-e5-synthetic', outcome: 'committed', acknowledgments: [{ campusId, revision: 1, mutationId: 'e8-one' }] })
    expect(body.acknowledgments[0].requestChecksum).toMatch(/^[a-f0-9]{64}$/)
  })

  it('commits a building and dependent route in one revision', async () => {
    const handle = await getHandler()
    if (!handle) return
    const dependencies = makeDependencies()
    const response = await handle(post({
      campusId,
      expectedCampusRevision: 0,
      operations: [
        { mutationId: 'e8-building-b', scope: buildingB, content: { id: buildingB.id }, dependencies: [] },
        { mutationId: 'e8-route', scope: { kind: 'routing', id: campusId }, content: { from: buildingA.id, to: buildingB.id }, dependencies: [{ scope: buildingA, revision: 0, contentChecksum: scopedContentChecksum(initialA), required: true }] },
      ],
    }), dependencies)
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.acknowledgments).toHaveLength(2)
    expect(body.acknowledgments.map((ack: { revision: number }) => ack.revision)).toEqual([1, 1])
  })

  it('maps stale writes and ambiguous commits to retry-safe status codes', async () => {
    const handle = await getHandler()
    if (!handle) return
    const stale = makeDependencies({ createStore: async () => createFakeStore(1) })
    const staleResponse = await handle(post({ campusId, expectedCampusRevision: 0, operations: [{ mutationId: 'stale', scope: buildingA, content: {}, dependencies: [] }] }), stale)
    expect(staleResponse.status).toBe(409)
    const unknown = makeDependencies({ createStore: async () => ({ ...createFakeStore(), commitAtomically: async () => { throw { code: 'COMMIT_OUTCOME_UNKNOWN' } } }) })
    const unknownResponse = await handle(post({ campusId, expectedCampusRevision: 0, operations: [{ mutationId: 'unknown', scope: buildingA, content: {}, dependencies: [] }] }), unknown)
    expect(unknownResponse.status).toBe(503)
    expect(await unknownResponse.json()).toMatchObject({ code: 'COMMIT_OUTCOME_UNKNOWN', retry: 'exact-request' })
  })

  it('does not return raw database errors or credentials', async () => {
    const handle = await getHandler()
    if (!handle) return
    const dependencies = makeDependencies({ createStore: async () => { throw new Error('password=synthetic-secret SQL: SELECT *') } })
    const response = await handle(post({ campusId, expectedCampusRevision: 0, operations: [{ mutationId: 'db-error', scope: buildingA, content: {}, dependencies: [] }] }), dependencies)
    expect(response.status).toBe(503)
    const body = JSON.stringify(await response.json())
    expect(body).not.toMatch(/synthetic-secret|SELECT|password/i)
  })
})
