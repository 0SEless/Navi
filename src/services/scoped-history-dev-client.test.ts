import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { createScopedHistoryDevClient } from './scoped-history-dev-client'
import { createScopedHistoryRuntime, handleScopedHistoryRequest } from './scoped-history-dev-route'

function document(campusId = 'campus-1'): CampusDocument {
  return {
    schemaVersion: 1, version: 1,
    metadata: { campusId, name: 'Campus', description: '', lastModified: '2026-10-30T00:00:00.000Z', editorVersion: '1.5' },
    buildings: [{
      id: 'building-1', name: 'Library', floors: [{
        id: 'floor-1', level: 0, rooms: [{ id: 'room-1', name: 'A' }], walls: [], doors: [], entrances: [],
        routeNetwork: { nodes: [{ id: 'node-1', type: 'walk', position: { x: 0, y: 0 }, floor: 0 }], edges: [] },
      }], verticalTransitions: [],
    } as unknown as CampusDocument['buildings'][number]],
    roads: [], panoramas: [], qrCheckpoints: [], areas: [],
  } as CampusDocument
}

const env = { NODE_ENV: 'development', NEXT_PUBLIC_NAVI_STUDIO_SCOPED_HISTORY: 'true', NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS: 'true' }

describe('Development scoped-history client', () => {
  afterEach(() => vi.useRealTimers())

  it('coalesces a rapid edit burst into one scoped revision', async () => {
    vi.useFakeTimers()
    const runtime = createScopedHistoryRuntime()
    const commitBodies: string[] = []
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = String(init?.body ?? '')
      if (JSON.parse(body).type === 'commit') commitBodies.push(body)
      const headers = new Headers(init?.headers)
      headers.set('host', 'localhost:3000')
      headers.set('origin', 'http://localhost:3000')
      return handleScopedHistoryRequest(new Request(new URL(String(input), 'http://localhost:3000'), { ...init, headers }), env, runtime)
    }
    const client = createScopedHistoryDevClient({
      enabled: () => true,
      newSessionId: () => 'coalesced-page',
      coalesceMs: 400,
      fetcher,
    })
    const before = document()
    await client.start(before, 'campus-1')
    const first = structuredClone(before)
    first.buildings[0].name = 'Intermediate drag sample'
    await client.recordDocument(first)
    const settled = structuredClone(first)
    settled.buildings[0].name = 'Final building edit'
    await client.recordDocument(settled)

    expect(runtime.sessions.get('coalesced-page')?.store.getChangeSets('campus-1')).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(400)
    await Promise.resolve()

    expect(client.getState()).toMatchObject({ status: 'validated', localRevision: 1, cloudAcknowledged: false })
    expect(commitBodies).toHaveLength(1)
    expect(JSON.parse(commitBodies[0]).operations[0].content.name).toBe('Final building edit')
    expect(runtime.sessions.get('coalesced-page')?.store.getChangeSets('campus-1')).toHaveLength(1)
    client.dispose()
  })

  it('retries a lost local acknowledgment with the exact immutable request', async () => {
    const runtime = createScopedHistoryRuntime()
    const commitBodies: string[] = []
    let loseFirstResponse = true
    const client = createScopedHistoryDevClient({
      enabled: () => true,
      newSessionId: () => 'page-session-1',
      fetcher: async (input, init) => {
        const body = String(init?.body ?? '')
        if (JSON.parse(body).type === 'commit') commitBodies.push(body)
        const headers = new Headers(init?.headers)
        headers.set('host', 'localhost:3000')
        headers.set('origin', 'http://localhost:3000')
        const request = new Request(new URL(String(input), 'http://localhost:3000'), { ...init, headers })
        const response = await handleScopedHistoryRequest(request, env, runtime)
        if (JSON.parse(body).type === 'commit' && loseFirstResponse) {
          loseFirstResponse = false
          throw new TypeError('synthetic lost local acknowledgment')
        }
        return response
      },
    })
    const before = document()
    await client.start(before, 'campus-1')
    const after = structuredClone(before)
    after.buildings[0].floors[0].rooms[0].name = 'Study room'

    await client.recordDocument(after)

    expect(commitBodies).toHaveLength(2)
    expect(commitBodies[0]).toBe(commitBodies[1])
    expect(client.getState()).toMatchObject({ status: 'validated', localRevision: 1, cloudAcknowledged: false })
    expect(JSON.parse(commitBodies[0])).toMatchObject({ type: 'commit', expectedRevision: 0 })
    expect(runtime.sessions.get('page-session-1')?.store.getChangeSets('campus-1')).toHaveLength(1)
  })

  it('reuses campus history in a new editor session while keeping draft storage separate', async () => {
    const runtime = createScopedHistoryRuntime()
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      headers.set('host', 'localhost:3000')
      headers.set('origin', 'http://localhost:3000')
      return handleScopedHistoryRequest(new Request(new URL(String(input), 'http://localhost:3000'), { ...init, headers }), env, runtime)
    }
    const before = document()
    const first = createScopedHistoryDevClient({ enabled: () => true, newSessionId: () => 'page-1', fetcher })
    await first.start(before, 'campus-1')
    const after = structuredClone(before)
    after.buildings[0].floors[0].rooms[0].name = 'Saved draft'
    await first.recordDocument(after)
    expect(first.getState().localRevision).toBe(1)

    const reloaded = createScopedHistoryDevClient({ enabled: () => true, newSessionId: () => 'page-2', fetcher })
    await reloaded.start(after, 'campus-1')
    expect(reloaded.getState()).toMatchObject({ status: 'session-only', localRevision: 1, cloudAcknowledged: false })
    expect(reloaded.getState().detail).toMatch(/IndexedDB draft/i)
    expect(runtime.sessions.get('page-1')?.store.getChangeSets('campus-1')).toHaveLength(1)
    expect(runtime.sessions.get('page-2')?.store.getChangeSets('campus-1')).toHaveLength(1)
    expect(runtime.sessions.get('page-1')?.store).toBe(runtime.sessions.get('page-2')?.store)
  })

  it('submits a building and campus-route edit as one explicit history batch', async () => {
    const runtime = createScopedHistoryRuntime()
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      headers.set('host', 'localhost:3000')
      headers.set('origin', 'http://localhost:3000')
      return handleScopedHistoryRequest(new Request(new URL(String(input), 'http://localhost:3000'), { ...init, headers }), env, runtime)
    }
    const client = createScopedHistoryDevClient({ enabled: () => true, newSessionId: () => 'multi-session', fetcher })
    const before = document()
    await client.start(before, 'campus-1')
    const after = structuredClone(before)
    after.buildings[0].name = 'New Library'
    after.roads.push({
      id: 'road-1', name: 'Main', polyline: [{ lat: 1, lng: 2 }, { lat: 2, lng: 3 }],
      width: 2, surface: 'paved', type: 'road', metadata: {},
    } as never)

    await client.recordDocument(after)

    expect(client.getState()).toMatchObject({ status: 'validated', localRevision: 1, cloudAcknowledged: false })
    const history = runtime.sessions.get('multi-session')?.store.getChangeSets('campus-1')
    expect(history).toHaveLength(1)
    expect(history?.[0]).toMatchObject({ kind: 'scoped-batch', operations: expect.arrayContaining([
      expect.objectContaining({ scope: { kind: 'building', id: 'building-1' } }),
      expect.objectContaining({ scope: { kind: 'routing', id: 'campus-1' } }),
    ]) })
  })

  it('isolates a campus switch with a new document session', async () => {
    const runtime = createScopedHistoryRuntime()
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      headers.set('host', 'localhost:3000')
      headers.set('origin', 'http://localhost:3000')
      return handleScopedHistoryRequest(new Request(new URL(String(input), 'http://localhost:3000'), { ...init, headers }), env, runtime)
    }
    let sessionNumber = 0
    const client = createScopedHistoryDevClient({ enabled: () => true, newSessionId: () => `page-${++sessionNumber}`, fetcher })
    await client.start(document('campus-1'), 'campus-1')
    await client.start(document('campus-2'), 'campus-2')

    expect(client.getState()).toMatchObject({ campusId: 'campus-2', localRevision: 0 })
    expect(runtime.sessions.get('page-1')?.campusId).toBe('campus-1')
    expect(runtime.sessions.get('page-2')?.campusId).toBe('campus-2')
  })

  it('stops creating scoped operations when the flag is disabled after an edit', async () => {
    let isEnabled = true
    let requestCount = 0
    const client = createScopedHistoryDevClient({
      enabled: () => isEnabled,
      newSessionId: () => 'page-flag',
      fetcher: async () => { requestCount += 1; return Response.json({ ok: true, localOnly: true, localRevision: 0, scopes: {} }) },
    })
    const before = document()
    await client.start(before, 'campus-1')
    isEnabled = false
    const after = structuredClone(before)
    after.buildings[0].name = 'Still editable'

    await client.recordDocument(after)
    expect(requestCount).toBe(1)
    expect(client.getState().status).toBe('disabled')
  })

  it('does not call the endpoint when disabled by default', async () => {
    let requestCount = 0
    const client = createScopedHistoryDevClient({
      enabled: () => false,
      fetcher: async () => { requestCount += 1; return Response.json({}) },
    })
    await client.start(document(), 'campus-1')
    expect(requestCount).toBe(0)
    expect(client.getState().status).toBe('disabled')
  })
})
