import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Graph } from '../../engine/graph'
import { useGraphStore, __resetGraphSaveQueuesForTests } from '../graph-store'

/**
 * Refresh-during-save recovery (focused).
 * CASE A: server committed but ack missed -> auto-heal on reload.
 * CASE B: local work ahead of acknowledged base, server unchanged -> "Sync Changes" retry succeeds.
 * CASE C: genuine divergence -> never overwrite; local work preserved.
 * No-edit reload -> no POST.
 */

const MAP_ID = 'refresh-recovery'
const CACHE_KEY = `navi-graph-${MAP_ID}`
const MARKER_KEY = `navi-sync-status-${MAP_ID}`

function makeGraph(name: string): Graph {
  const graph = new Graph()
  graph.campusId = MAP_ID
  graph.addBuilding({ id: 'building-1', name, campusId: MAP_ID, footprint: [] } as never)
  return graph
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function readMarker(): { serverTimestamp?: string | null; snapshotFingerprint?: string } {
  return JSON.parse(localStorage.getItem(MARKER_KEY) ?? '{}')
}

interface Harness {
  fetchMock: ReturnType<typeof vi.fn>
  posted: string[]
  setServer: (name: string, updatedAt: string) => void
  setPostStatus: (status: number) => void
}

function harness(): Harness {
  const state = { server: makeGraph('Base Hall').toJSON() as unknown as Record<string, unknown>, updatedAt: 'R1', postStatus: 200 }
  const posted: string[] = []
  let postCount = 0
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'POST') {
      posted.push(String(init?.body ?? ''))
      if (state.postStatus !== 200) return jsonResponse({ error: 'server exploded' }, state.postStatus)
      postCount += 1
      return jsonResponse({ success: true, updatedAt: 'R' + postCount })
    }
    return jsonResponse({ ...state.server, updatedAt: state.updatedAt })
  })
  vi.stubGlobal('fetch', fetchMock)
  return {
    fetchMock,
    posted,
    setServer: (name, updatedAt) => { state.server = makeGraph(name).toJSON() as unknown as Record<string, unknown>; state.updatedAt = updatedAt },
    setPostStatus: (status) => { state.postStatus = status },
  }
}

/** Seed an acknowledged base via a real save (marker = base fingerprint @ R1). */
async function seedAcknowledged(h: Harness): Promise<void> {
  useGraphStore.setState({ graph: makeGraph('Base Hall'), currentMapId: MAP_ID, syncStatus: 'idle', syncError: null })
  await useGraphStore.getState().save()
  expect(useGraphStore.getState().syncStatus).toBe('synced')
}

/** Simulate: user edited (cache+store = Edited) then refreshed (loadMapData). */
function refreshWithEditedCache(): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(makeGraph('Edited Hall').toJSON()))
  useGraphStore.setState({ graph: new Graph(), currentMapId: null, syncStatus: 'idle', syncError: null })
  useGraphStore.getState().loadMapData(MAP_ID)
}

describe('refresh-during-save recovery', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    __resetGraphSaveQueuesForTests()
    useGraphStore.setState({ graph: new Graph(), currentMapId: null, syncStatus: 'idle', syncError: null })
  })

  it('CASE A — server committed but ack was missed: reload auto-heals to synced', async () => {
    const h = harness()
    await seedAcknowledged(h)
    h.setServer('Edited Hall', 'R2') // server DID receive the edit
    refreshWithEditedCache()

    await vi.waitFor(() => expect(useGraphStore.getState().syncStatus).toBe('synced'))
    expect(readMarker().serverTimestamp).toBe('R2')
    expect(h.posted).toHaveLength(1) // only the seed save; auto-heal performs no new POST
  })

  it('CASE B — local work ahead of acknowledged base: Sync Changes retries and succeeds', async () => {
    const h = harness()
    await seedAcknowledged(h)
    // Server is still at the acknowledged base (save never landed).
    refreshWithEditedCache()
    await vi.waitFor(() => expect(useGraphStore.getState().syncStatus).toBe('conflict'))
    useGraphStore.getState().completeCampusHydration()

    await useGraphStore.getState().syncLocalChanges()
    expect(h.posted).toHaveLength(2)
    const retryBody = JSON.parse(h.posted[1])
    expect(retryBody.expectedServerUpdatedAt).toBe('R1')
    expect(useGraphStore.getState().syncStatus).toBe('synced')
    expect(readMarker().serverTimestamp).toBe('R2')
    expect(useGraphStore.getState().graph.buildings[0]?.name).toBe('Edited Hall')
  })

  it('CASE C — genuine divergence: no overwrite, local work preserved, conflict kept', async () => {
    const h = harness()
    await seedAcknowledged(h)
    h.setServer('Other Writer Hall', 'R9') // third-party divergence
    refreshWithEditedCache()
    await vi.waitFor(() => expect(useGraphStore.getState().syncStatus).toBe('conflict'))
    useGraphStore.getState().completeCampusHydration()

    await expect(useGraphStore.getState().syncLocalChanges()).rejects.toThrow(/differ/i)
    expect(useGraphStore.getState().syncStatus).toBe('conflict')
    expect(h.posted).toHaveLength(1) // no retry POST on divergence
    expect(useGraphStore.getState().graph.buildings[0]?.name).toBe('Edited Hall')
  })

  it('failed retry preserves local work and restores the conflict state', async () => {
    const h = harness()
    await seedAcknowledged(h)
    refreshWithEditedCache()
    await vi.waitFor(() => expect(useGraphStore.getState().syncStatus).toBe('conflict'))
    useGraphStore.getState().completeCampusHydration()
    h.setPostStatus(500)

    await expect(useGraphStore.getState().syncLocalChanges()).rejects.toThrow(/exploded/i)
    expect(useGraphStore.getState().syncStatus).toBe('conflict')
    expect(useGraphStore.getState().graph.buildings[0]?.name).toBe('Edited Hall')
  })

  it('no-edit reload performs no POST and stays synced', async () => {
    const h = harness()
    await seedAcknowledged(h)
    useGraphStore.setState({ graph: new Graph(), currentMapId: null, syncStatus: 'idle', syncError: null })
    useGraphStore.getState().loadMapData(MAP_ID)

    await vi.waitFor(() => expect(useGraphStore.getState().syncStatus).toBe('synced'))
    expect(h.posted).toHaveLength(1)
  })
})
