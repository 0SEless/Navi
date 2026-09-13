import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Graph } from '../engine/graph'
import { __resetGraphSaveQueuesForTests, useGraphStore } from './graph-store'

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('graph store persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    __resetGraphSaveQueuesForTests()
    useGraphStore.setState({
      currentMapId: 'test-map',
      syncError: null,
      syncStatus: 'idle',
    })
  })

  it('does not resolve save until the graph API sync resolves', async () => {
    let resolveRequest: ((response: Response) => void) | undefined
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') {
        return new Promise<Response>((resolve) => {
          resolveRequest = resolve
        })
      }
      return Promise.resolve(
        jsonResponse({ buildings: [], nodes: [], edges: [], updatedAt: '2026-09-13T00:00:00.000Z' }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const saveResult = useGraphStore.getState().save()

    expect(saveResult).toBeInstanceOf(Promise)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/graph',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(useGraphStore.getState().syncStatus).toBe('syncing')

    let resolved = false
    void saveResult.then(() => {
      resolved = true
    })
    await Promise.resolve()
    expect(resolved).toBe(false)

    resolveRequest?.(jsonResponse({ success: true, updatedAt: '2026-09-13T00:00:00.000Z' }))
    await saveResult

    expect(resolved).toBe(true)
    expect(useGraphStore.getState().syncStatus).toBe('synced')
  })

  it('rejects save when the graph API rejects and keeps the local recovery snapshot', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'graph validation failed' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })))

    await expect(useGraphStore.getState().save()).rejects.toThrow('graph validation failed')

    expect(useGraphStore.getState().syncStatus).toBe('error')
    expect(useGraphStore.getState().syncError).toBe('graph validation failed')
    expect(localStorage.getItem('navi-graph-test-map')).not.toBeNull()
  })

  it('restores synced status only for a matching saved local snapshot', async () => {
    const mapId = 'cached-map'
    const graph = new Graph()
    graph.addBuilding({
      id: 'building-1',
      name: 'Main Hall',
      campusId: mapId,
      footprint: [],
    } as any)
    useGraphStore.setState({ graph, currentMapId: mapId })
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') {
        return jsonResponse({ success: true, updatedAt: '2026-09-13T00:00:00.000Z' })
      }
      return jsonResponse({ buildings: [], nodes: [], edges: [], updatedAt: '2026-09-13T00:00:00.000Z' })
    }))

    await useGraphStore.getState().save()

    expect(localStorage.getItem(`navi-sync-status-${mapId}`)).not.toBeNull()
    useGraphStore.setState({ graph: new Graph(), currentMapId: null, syncStatus: 'idle', syncError: null })
    useGraphStore.getState().loadMapData(mapId)
    expect(useGraphStore.getState().syncStatus).toBe('synced')

    // Content must match for the marker to restore `synced`; trailing
    // whitespace is irrelevant, so tamper with the graph content itself.
    const savedSnapshot = JSON.parse(localStorage.getItem(`navi-graph-${mapId}`) ?? '{}')
    savedSnapshot.buildings[0].name = 'Tampered Hall'
    localStorage.setItem(`navi-graph-${mapId}`, JSON.stringify(savedSnapshot))
    useGraphStore.setState({ graph: new Graph(), currentMapId: null, syncStatus: 'idle', syncError: null })
    useGraphStore.getState().loadMapData(mapId)
    expect(useGraphStore.getState().syncStatus).toBe('idle')
  })
})
