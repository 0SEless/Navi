import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Graph } from '../engine/graph'
import { useGraphStore } from './graph-store'

const MAP_ID = 'conflict-map'
const CACHE_KEY = `navi-graph-${MAP_ID}`
const MARKER_KEY = `navi-sync-status-${MAP_ID}`
const BACKUP_KEY = `navi-graph-backup-${MAP_ID}`

function makeGraph(buildingName: string): Graph {
  const graph = new Graph()
  graph.campusId = MAP_ID
  graph.addBuilding({
    id: 'building-1',
    name: buildingName,
    campusId: MAP_ID,
    footprint: [],
  } as never)
  return graph
}

function serverPayload(buildingName: string, updatedAt: string): Record<string, unknown> {
  return { ...(makeGraph(buildingName).toJSON() as unknown as Record<string, unknown>), updatedAt }
}

function stubServer(
  payload: Record<string, unknown>,
  options?: { failGet?: boolean; postCounter?: { count: number }; postUpdatedAt?: string; postedBodies?: string[] },
) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method === 'POST') {
      if (options?.postCounter) options.postCounter.count += 1
      if (typeof init?.body === 'string') options?.postedBodies?.push(init.body)
      return new Response(JSON.stringify(options?.postUpdatedAt ? { updatedAt: options.postUpdatedAt } : {}), { status: 200 })
    }
    if (options?.failGet) throw new TypeError('Failed to fetch')
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function seedCleanLocal(buildingName: string): Promise<void> {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  useGraphStore.setState({ graph: makeGraph(buildingName), currentMapId: MAP_ID, syncStatus: 'idle', syncError: null })
  await useGraphStore.getState().save()
}

function rewriteLocalCache(buildingName: string): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(makeGraph(buildingName).toJSON()))
}

async function loadFresh(): Promise<void> {
  useGraphStore.setState({ graph: new Graph(), currentMapId: null, syncStatus: 'idle', syncError: null })
  useGraphStore.getState().loadMapData(MAP_ID)
  await vi.waitFor(() => {
    expect(useGraphStore.getState().currentMapId).toBe(MAP_ID)
  })
}

describe('graph store stale-local conflict handling', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    useGraphStore.setState({ graph: new Graph(), currentMapId: null, syncStatus: 'idle', syncError: null })
  })

  it('never stamps the sync marker with the local clock as serverTimestamp', async () => {
    await seedCleanLocal('Local Hall')
    const marker = JSON.parse(localStorage.getItem(MARKER_KEY) ?? '{}')
    expect(marker.serverTimestamp).toBeNull()
    expect(typeof marker.syncedAt).toBe('string')
  })

  it('adopts a differing server snapshot when the local copy is clean', async () => {
    await seedCleanLocal('Local Hall')
    stubServer(serverPayload('Server Hall', '2026-09-12T10:00:00.000Z'))

    await loadFresh()

    await vi.waitFor(() => {
      expect(useGraphStore.getState().syncStatus).toBe('synced')
      expect(useGraphStore.getState().graph.buildings[0]?.name).toBe('Server Hall')
    })
    const marker = JSON.parse(localStorage.getItem(MARKER_KEY) ?? '{}')
    expect(marker.serverTimestamp).toBe('2026-09-12T10:00:00.000Z')
  })

  it('keeps a clean local snapshot when a stale server response is older than the last server revision', async () => {
    await seedCleanLocal('Local Hall')
    const marker = JSON.parse(localStorage.getItem(MARKER_KEY) ?? '{}')
    localStorage.setItem(MARKER_KEY, JSON.stringify({ ...marker, serverTimestamp: '2026-09-12T10:00:00.000Z' }))
    stubServer(serverPayload('Older Server Hall', '2026-09-12T09:00:00.000Z'))

    await loadFresh()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(useGraphStore.getState().graph.buildings[0]?.name).toBe('Local Hall')
    expect(useGraphStore.getState().syncStatus).toBe('synced')
  })

  it('sends the last server revision on save and records the revision returned by the server', async () => {
    await seedCleanLocal('Local Hall')
    const marker = JSON.parse(localStorage.getItem(MARKER_KEY) ?? '{}')
    localStorage.setItem(MARKER_KEY, JSON.stringify({ ...marker, serverTimestamp: '2026-09-12T10:00:00.000Z' }))
    const postedBodies: string[] = []
    stubServer(serverPayload('Local Hall', '2026-09-12T10:00:00.000Z'), { postedBodies, postUpdatedAt: '2026-09-12T11:00:00.000Z' })

    useGraphStore.setState({ graph: makeGraph('Local Hall'), currentMapId: MAP_ID, syncStatus: 'idle', syncError: null })
    await useGraphStore.getState().save()

    expect(JSON.parse(postedBodies[0])).toMatchObject({ expectedServerUpdatedAt: '2026-09-12T10:00:00.000Z' })
    expect(JSON.parse(localStorage.getItem(MARKER_KEY) ?? '{}').serverTimestamp).toBe('2026-09-12T11:00:00.000Z')
  })

  it('keeps the dirty local snapshot and reports a conflict when the server differs', async () => {
    await seedCleanLocal('Local Hall')
    rewriteLocalCache('Local Hall Edited')
    const postCounter = { count: 0 }
    stubServer(serverPayload('Server Hall', '2026-09-12T10:00:00.000Z'), { postCounter })

    await loadFresh()

    await vi.waitFor(() => {
      expect(useGraphStore.getState().syncStatus).toBe('conflict')
    })
    expect(useGraphStore.getState().graph.buildings[0]?.name).toBe('Local Hall Edited')
    expect(useGraphStore.getState().syncError).toMatch(/different version/)

    await expect(useGraphStore.getState().syncToSupabase()).rejects.toThrow(/different version/)
    expect(postCounter.count).toBe(0)
  })

  it('adoptServerSnapshot backs up the dirty local copy and loads the server version', async () => {
    await seedCleanLocal('Local Hall')
    rewriteLocalCache('Local Hall Edited')
    stubServer(serverPayload('Server Hall', '2026-09-12T10:00:00.000Z'))

    await loadFresh()
    await vi.waitFor(() => {
      expect(useGraphStore.getState().syncStatus).toBe('conflict')
    })

    await useGraphStore.getState().adoptServerSnapshot()

    expect(useGraphStore.getState().syncStatus).toBe('synced')
    expect(useGraphStore.getState().graph.buildings[0]?.name).toBe('Server Hall')
    expect(localStorage.getItem(BACKUP_KEY)).toContain('Local Hall Edited')
  })

  it('reSync refuses to overwrite a differing server snapshot unless forced', async () => {
    await seedCleanLocal('Local Hall')
    rewriteLocalCache('Local Hall Edited')
    const postCounter = { count: 0 }
    stubServer(serverPayload('Server Hall', '2026-09-12T10:00:00.000Z'), { postCounter })

    useGraphStore.setState({ graph: new Graph(), currentMapId: MAP_ID, syncStatus: 'idle', syncError: null })
    await expect(useGraphStore.getState().reSync()).rejects.toThrow(/refused/)
    expect(postCounter.count).toBe(0)
    expect(useGraphStore.getState().syncStatus).toBe('conflict')

    await useGraphStore.getState().reSync({ force: true })
    expect(postCounter.count).toBe(1)
    expect(useGraphStore.getState().syncStatus).toBe('synced')
  })

  it('keeps the local snapshot when the server check fails (offline fallback)', async () => {
    await seedCleanLocal('Local Hall')
    rewriteLocalCache('Local Hall Edited')
    stubServer(serverPayload('Server Hall', '2026-09-12T10:00:00.000Z'), { failGet: true })

    await loadFresh()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(useGraphStore.getState().syncStatus).toBe('idle')
    expect(useGraphStore.getState().syncError).toBeNull()
    expect(useGraphStore.getState().graph.buildings[0]?.name).toBe('Local Hall Edited')
  })

  it('marks synced when the server content matches the local snapshot', async () => {
    await seedCleanLocal('Local Hall')
    localStorage.removeItem(MARKER_KEY)
    stubServer(serverPayload('Local Hall', '2026-09-12T10:00:00.000Z'))

    await loadFresh()
    await vi.waitFor(() => {
      expect(useGraphStore.getState().syncStatus).toBe('synced')
    })
    const marker = JSON.parse(localStorage.getItem(MARKER_KEY) ?? '{}')
    expect(marker.serverTimestamp).toBe('2026-09-12T10:00:00.000Z')
  })
})
