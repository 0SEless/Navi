import { describe, expect, it, vi } from 'vitest'
import { createScopedSaveCandidate } from './scoped-campus-save'
import { createScopedSaveClient } from './scoped-save-client'

const candidate = createScopedSaveCandidate({
  campusId: 'campus-test', scope: { kind: 'building', id: 'building-1' }, expectedCampusRevision: 4,
  mutationId: 'mutation-1', content: { name: 'Library' }, dependencies: [],
})
const acknowledgment = {
  campusId: candidate.campusId, mutationId: candidate.mutationId, requestChecksum: candidate.requestChecksum,
  contentChecksum: candidate.contentChecksum, revision: 5, committedAt: '2026-10-30T00:00:00.000Z',
}

describe('durable scoped-save client', () => {
  it('accepts only an exact durable local E5 acknowledgment', async () => {
    const client = createScopedSaveClient({ enabled: () => true, fetcher: async () => Response.json({ ok: true, durable: true, storage: 'local-e5-synthetic', outcome: 'committed', acknowledgments: [acknowledgment] }) })
    await client.save({ campusId: candidate.campusId, expectedCampusRevision: 4, operations: [{ mutationId: candidate.mutationId, scope: candidate.scope, content: candidate.content, dependencies: [] }] } as never)
    expect(client.getState()).toMatchObject({ status: 'durably-committed-local', revision: 5 })
  })

  it('rejects forged acknowledgments and retains the exact pending request', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input; void init
      return Response.json({ ok: true, durable: true, storage: 'local-e5-synthetic', outcome: 'committed', acknowledgments: [{ ...acknowledgment, mutationId: 'forged' }] })
    })
    const client = createScopedSaveClient({ enabled: () => true, fetcher })
    const payload = { campusId: candidate.campusId, expectedCampusRevision: 4, operations: [{ mutationId: candidate.mutationId, scope: candidate.scope, content: candidate.content, dependencies: [] }] }
    await expect(client.save(payload as never)).rejects.toThrow()
    const firstBody = fetcher.mock.calls[0]?.[1]?.body
    expect(client.getState()).toMatchObject({ status: 'failed', hasPendingRequest: true })
    await expect(client.save(payload as never)).rejects.toThrow()
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(firstBody)
  })

  it('keeps a stale response as a conflict without clearing pending bytes', async () => {
    const client = createScopedSaveClient({ enabled: () => true, fetcher: async () => Response.json({ ok: false, code: 'STALE_REVISION' }, { status: 409 }) })
    await expect(client.save({ campusId: candidate.campusId, expectedCampusRevision: 4, operations: [] } as never)).rejects.toThrow()
    expect(client.getState()).toMatchObject({ status: 'conflict', hasPendingRequest: true })
  })

  it('retries the exact immutable request after a lost acknowledgment', async () => {
    let first = true
    let firstBody: BodyInit | null | undefined
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (first) {
        first = false
        firstBody = init?.body
        throw new TypeError('synthetic lost response after server commit')
      }
      expect(init?.body).toBe(firstBody)
      return Response.json({ ok: true, durable: true, storage: 'local-e5-synthetic', outcome: 'replayed', acknowledgments: [acknowledgment] })
    })
    const client = createScopedSaveClient({ enabled: () => true, fetcher })
    const request = { campusId: candidate.campusId, expectedCampusRevision: 4, operations: [{ mutationId: candidate.mutationId, scope: candidate.scope, content: candidate.content, dependencies: [] }] }
    await expect(client.save(request)).rejects.toThrow(/outcome is unknown/i)
    await client.save(request)
    expect(fetcher.mock.calls).toHaveLength(2)
    expect(client.getState()).toMatchObject({ status: 'durably-committed-local', revision: 5, hasPendingRequest: false })
  })

  it('does not call the endpoint when disabled', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input; void init
      return Response.json({})
    })
    const client = createScopedSaveClient({ enabled: () => false, fetcher })
    await expect(client.save({} as never)).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
