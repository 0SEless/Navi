import { describe, expect, it, vi } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { createScopedSaveCandidate, scopedContentChecksum } from './scoped-campus-save'
import { createScopedSaveDocumentSession } from './scoped-save-document-session'

function document(): CampusDocument {
  return {
    schemaVersion: 1, version: 1,
    metadata: { campusId: 'campus-test', name: 'Synthetic campus', description: '', lastModified: '2026-10-30T00:00:00.000Z', editorVersion: '1.5' },
    buildings: [{ id: 'building-1', name: 'Library', floors: [{ id: 'floor-1', rooms: [{ id: 'room-1', name: 'A' }], walls: [], doors: [], entrances: [], routeNetwork: { nodes: [], edges: [] } }], verticalTransitions: [] } as unknown as CampusDocument['buildings'][number]],
    roads: [], panoramas: [], qrCheckpoints: [], areas: [],
  } as CampusDocument
}

describe('durable scoped document session', () => {
  it('reads an E5 baseline then saves the meaningful document snapshot through exact candidate acknowledgments', async () => {
    const calls: string[] = []
    const baselineSnapshot = { campusId: 'campus-test', revision: 0, scopes: {} }
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(String(input))
      if (!init?.method || init.method === 'GET') return Response.json({ ok: true, campusId: 'campus-test', revision: 0, scopes: {}, snapshot: { ...baselineSnapshot, checksum: scopedContentChecksum(baselineSnapshot) }, storage: 'local-e5-synthetic' })
      const body = JSON.parse(String(init.body)) as { campusId: string; expectedCampusRevision: number; operations: Array<{ mutationId: string; scope: { kind: 'building'; id: string }; content: unknown; dependencies: never[] }> }
      const candidate = createScopedSaveCandidate({ ...body.operations[0], campusId: body.campusId, expectedCampusRevision: body.expectedCampusRevision })
      return Response.json({ ok: true, durable: true, storage: 'local-e5-synthetic', outcome: 'committed', acknowledgments: [{ campusId: candidate.campusId, mutationId: candidate.mutationId, requestChecksum: candidate.requestChecksum, contentChecksum: candidate.contentChecksum, revision: 1, committedAt: '2026-10-30T00:00:00.000Z' }] })
    })
    const session = createScopedSaveDocumentSession({ campusId: 'campus-test', enabled: () => true, fetcher })
    const before = document()
    await session.initialize(before)
    const after = structuredClone(before)
    after.buildings[0].name = 'Updated synthetic library'
    const state = await session.save(after)
    expect(calls).toHaveLength(2)
    expect(state).toMatchObject({ status: 'durably-committed-local', revision: 1, cloudAcknowledged: false })
    expect(fetcher.mock.calls[1]?.[1]?.body).toContain('Updated synthetic library')
  })

  it('preserves a newer editor change when an exact retry acknowledges an older request', async () => {
    const postBodies: string[] = []
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        const snapshot = { campusId: 'campus-test', revision: 0, scopes: {} }
        return Response.json({ ok: true, campusId: 'campus-test', revision: 0, scopes: {}, snapshot: { ...snapshot, checksum: scopedContentChecksum(snapshot) }, storage: 'local-e5-synthetic' })
      }
      const bodyText = String(init.body)
      postBodies.push(bodyText)
      if (postBodies.length === 1) throw new Error('synthetic lost response')
      const body = JSON.parse(bodyText) as { campusId: string; expectedCampusRevision: number; operations: Array<{ mutationId: string; scope: { kind: 'building'; id: string }; content: unknown; dependencies: never[] }> }
      const operation = body.operations[0]
      const candidate = createScopedSaveCandidate({ ...operation, campusId: body.campusId, expectedCampusRevision: body.expectedCampusRevision })
      return Response.json({
        ok: true, durable: true, storage: 'local-e5-synthetic', outcome: postBodies.length === 2 ? 'replayed' : 'committed',
        acknowledgments: [{ campusId: candidate.campusId, mutationId: candidate.mutationId, requestChecksum: candidate.requestChecksum, contentChecksum: candidate.contentChecksum, revision: candidate.expectedCampusRevision + 1, committedAt: '2026-10-30T00:00:00.000Z' }],
      })
    })
    const session = createScopedSaveDocumentSession({ campusId: 'campus-test', enabled: () => true, fetcher })
    const before = document()
    await session.initialize(before)

    const firstEdit = structuredClone(before)
    firstEdit.buildings[0].name = 'First committed edit'
    await expect(session.save(firstEdit)).rejects.toThrow('The save outcome is unknown')

    const newerEdit = structuredClone(firstEdit)
    newerEdit.buildings[0].name = 'Newer unsaved edit'
    await expect(session.save(newerEdit)).resolves.toMatchObject({ status: 'durably-committed-local', revision: 1 })
    await expect(session.save(newerEdit)).resolves.toMatchObject({ status: 'durably-committed-local', revision: 2 })

    expect(postBodies).toHaveLength(3)
    expect(postBodies[0]).toBe(postBodies[1])
    expect(JSON.parse(postBodies[0]).operations[0].content.name).toBe('First committed edit')
    expect(JSON.parse(postBodies[2]).operations[0].content.name).toBe('Newer unsaved edit')
    expect(JSON.parse(postBodies[2]).expectedCampusRevision).toBe(1)
  })
})
