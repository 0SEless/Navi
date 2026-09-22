import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import {
  createDocument,
  __getWorkflowStatusTraceForTests,
  __resetWorkflowStatusTraceForTests,
} from '@navi/editor'
import { CONNECTIVITY_CONTRACT_VERSION } from '@navi/core'
import { Graph } from '@/engine/graph'
import { serializeAuthoredGraphPayload } from '@/services/authored-snapshot-persistence'
import {
  __getSyncStatusTraceForTests,
  __resetSyncStatusTraceForTests,
  useGraphStore,
} from '@/store/graph-store'
import { EditorBridge } from '../EditorBridge'
import { SaveStatus } from '../SaveStatus'

const MAP_ID = 'reload-status-last-writer'
const CACHE_KEY = `navi-graph-${MAP_ID}`
const MARKER_KEY = `navi-sync-status-${MAP_ID}`

function makeGraph(name: string): Graph {
  const graph = new Graph()
  graph.campusId = MAP_ID
  graph.setConnectivitySemanticsVersion(CONNECTIVITY_CONTRACT_VERSION)
  graph.addBuilding({ id: 'building-1', name, campusId: MAP_ID, footprint: [], floors: [] } as never)
  return graph
}

function payload(name: string): Record<string, unknown> {
  const graph = makeGraph(name)
  return serializeAuthoredGraphPayload(
    graph.toJSON() as unknown as Record<string, unknown>,
    createDocument(graph),
  )
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function clearActiveGraph(): void {
  useGraphStore.setState({
    graph: new Graph(),
    authoredDocument: null,
    currentMapId: null,
    syncStatus: 'idle',
    syncError: null,
    campusReady: false,
    pendingAuthoredMutations: [],
  })
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  __resetSyncStatusTraceForTests()
  __resetWorkflowStatusTraceForTests()
  useGraphStore.setState({
    graph: new Graph(),
    authoredDocument: null,
    currentMapId: null,
    syncStatus: 'idle',
    syncError: null,
    campusReady: false,
    pendingAuthoredMutations: [],
  })
})

describe('full reload status lifecycle', () => {
  it('keeps the final header saved after all hydration effects settle', async () => {
    const server = payload('Canonical Hall')
    localStorage.setItem(CACHE_KEY, JSON.stringify(server))
    localStorage.setItem(MARKER_KEY, JSON.stringify({
      snapshotFingerprint: 'stale-marker',
      serverTimestamp: '2026-09-21T00:00:00.000Z',
    }))
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      ...server,
      updatedAt: '2026-09-22T00:00:00.000Z',
    })))

    useGraphStore.getState().loadMapData(MAP_ID)
    const view = render(
      <EditorBridge>
        <SaveStatus />
      </EditorBridge>,
    )

    await waitFor(() => expect(useGraphStore.getState().syncStatus).toBe('synced'))
    await waitFor(() => expect(view.getByText('All changes saved')).toBeInTheDocument())
    expect(view.queryByText('Changes not synced')).not.toBeInTheDocument()

    const trace = __getSyncStatusTraceForTests()
    expect(trace.at(-1)?.to).toBe('synced')
    expect(trace.at(-1)?.source).toBe('checkServerFreshness')
    expect(trace.some((entry) => entry.to === 'conflict')).toBe(false)
  })

  it('keeps a clean acknowledged reload saved after a second hydration', async () => {
    const local = payload('Canonical Hall')
    localStorage.setItem(CACHE_KEY, JSON.stringify(local))
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ...local, updatedAt: 'R-current' })))

    useGraphStore.getState().loadMapData(MAP_ID)
    await waitFor(() => expect(useGraphStore.getState().syncStatus).toBe('synced'))
    clearActiveGraph()

    useGraphStore.getState().loadMapData(MAP_ID)
    const view = render(
      <EditorBridge>
        <SaveStatus />
      </EditorBridge>,
    )
    await waitFor(() => expect(view.getByText('All changes saved')).toBeInTheDocument())
    expect(useGraphStore.getState().syncStatus).toBe('synced')
  })

  it('ignores a stale freshness response from an earlier reload', async () => {
    const local = payload('Canonical Hall')
    localStorage.setItem(CACHE_KEY, JSON.stringify(local))
    localStorage.setItem(MARKER_KEY, JSON.stringify({
      snapshotFingerprint: 'stale-marker',
      serverTimestamp: '2026-09-21T00:00:00.000Z',
    }))

    const responses: Array<(response: Response) => void> = []
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      responses.push(resolve)
    })))

    useGraphStore.getState().loadMapData(MAP_ID)
    useGraphStore.getState().loadMapData(MAP_ID)
    const view = render(
      <EditorBridge>
        <SaveStatus />
      </EditorBridge>,
    )

    await waitFor(() => expect(responses).toHaveLength(2))
    // The second reload receives the current converged server snapshot first.
    responses[1](jsonResponse({ ...local, updatedAt: 'R-current' }))
    await waitFor(() => expect(useGraphStore.getState().syncStatus).toBe('synced'))

    // The first reload's delayed replica is stale and differs in content. It
    // must not be allowed to overwrite the final state established by reload 2.
    responses[0](jsonResponse({ ...payload('Stale Replica Hall'), updatedAt: 'R-old' }))
    await waitFor(() => expect(view.getByText('All changes saved')).toBeInTheDocument())
    expect(useGraphStore.getState().syncStatus).toBe('synced')
    expect(useGraphStore.getState().graph.buildings[0]?.name).toBe('Canonical Hall')
  })

  it('does not let an earlier reload reassert conflict from a stale local draft', async () => {
    const firstLocal = payload('Old Draft Hall')
    const currentLocal = payload('Canonical Hall')
    localStorage.setItem(CACHE_KEY, JSON.stringify(firstLocal))
    localStorage.setItem(MARKER_KEY, JSON.stringify({
      snapshotFingerprint: 'stale-marker',
      serverTimestamp: '2026-09-21T00:00:00.000Z',
    }))

    const responses: Array<(response: Response) => void> = []
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      responses.push(resolve)
    })))

    // Reload 1 starts with the old cache and is still waiting on the server.
    useGraphStore.getState().loadMapData(MAP_ID)
    // Reload 2 paints the current canonical cache and settles cleanly first.
    localStorage.setItem(CACHE_KEY, JSON.stringify(currentLocal))
    useGraphStore.getState().loadMapData(MAP_ID)
    const view = render(
      <EditorBridge>
        <SaveStatus />
      </EditorBridge>,
    )

    await waitFor(() => expect(responses).toHaveLength(2))
    responses[1](jsonResponse({ ...currentLocal, updatedAt: 'R-current' }))
    await waitFor(() => expect(useGraphStore.getState().syncStatus).toBe('synced'))

    // A teardown/visibility writer from reload 1 lands after reload 2. The
    // active graph is still canonical B, but the stale local cache is A.
    localStorage.setItem(CACHE_KEY, JSON.stringify(firstLocal))
    responses[0](jsonResponse({ ...currentLocal, updatedAt: 'R-current' }))

    await waitFor(() => expect(view.getByText('All changes saved')).toBeInTheDocument())
    expect(useGraphStore.getState().syncStatus).toBe('synced')
    expect(useGraphStore.getState().graph.buildings[0]?.name).toBe('Canonical Hall')
    expect(__getSyncStatusTraceForTests().some((entry) => entry.to === 'conflict')).toBe(false)
  })

  it('heals a stale workflow baseline when the same canonical document reloads', async () => {
    const local = payload('Canonical Hall')
    localStorage.setItem(CACHE_KEY, JSON.stringify(local))
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ...local, updatedAt: 'R-current' })))

    useGraphStore.getState().loadMapData(MAP_ID)
    const view = render(
      <EditorBridge>
        <SaveStatus />
      </EditorBridge>,
    )
    await waitFor(() => expect(useGraphStore.getState().syncStatus).toBe('synced'))

    __resetWorkflowStatusTraceForTests()
    const context = (window as unknown as {
      __naviContext: { services: { get: (name: string) => { updateLifecycle?: (update: { saveState: 'dirty' }) => void } | undefined } }
    }).__naviContext
    context.services.get('workflowStore')?.updateLifecycle?.({ saveState: 'dirty' })

    // A client-side reload reuses the mounted editor context, so the workflow
    // baseline is intentionally stale while the Graph store hydrates again.
    useGraphStore.getState().loadMapData(MAP_ID)
    await waitFor(() => expect(view.getByText('All changes saved')).toBeInTheDocument())
    expect(useGraphStore.getState().syncStatus).toBe('synced')
    expect(__getWorkflowStatusTraceForTests().some((entry) => entry.field === 'saveState' && entry.to === 'saved')).toBe(true)
  })

  it('allows an intermediate stale in-memory projection and settles saved after server hydration', async () => {
    const local = payload('Canonical Hall')
    localStorage.setItem(CACHE_KEY, JSON.stringify(local))
    localStorage.setItem(MARKER_KEY, JSON.stringify({
      snapshotFingerprint: 'stale-marker',
      serverTimestamp: 'R1',
    }))
    let resolveServer: ((response: Response) => void) | null = null
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      resolveServer = resolve
    })))

    useGraphStore.getState().loadMapData(MAP_ID)
    useGraphStore.setState({
      graph: makeGraph('Stale Projection Hall'),
      authoredDocument: createDocument(makeGraph('Stale Projection Hall')),
    })
    const view = render(
      <EditorBridge>
        <SaveStatus />
      </EditorBridge>,
    )
    await waitFor(() => expect(resolveServer).not.toBeNull())
    resolveServer?.(jsonResponse({ ...local, updatedAt: 'R2' }))

    await waitFor(() => expect(view.getByText('All changes saved')).toBeInTheDocument())
    expect(useGraphStore.getState().syncStatus).toBe('synced')
    expect(useGraphStore.getState().graph.buildings[0]?.name).toBe('Canonical Hall')
  })

  it('settles the final header as conflict for true local/server divergence', async () => {
    const local = payload('Local Divergence Hall')
    localStorage.setItem(CACHE_KEY, JSON.stringify(local))
    localStorage.setItem(MARKER_KEY, JSON.stringify({
      snapshotFingerprint: 'acknowledged-baseline',
      serverTimestamp: 'R1',
    }))
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      ...payload('Server Divergence Hall'),
      updatedAt: 'R2',
    })))

    useGraphStore.getState().loadMapData(MAP_ID)
    const view = render(
      <EditorBridge>
        <SaveStatus />
      </EditorBridge>,
    )
    await waitFor(() => expect(view.getByText('Changes not synced')).toBeInTheDocument())
    expect(useGraphStore.getState().syncStatus).toBe('conflict')
  })

  it('converges a local-ahead draft through the guarded save and ends saved', async () => {
    const baseline = payload('Baseline Hall')
    const local = payload('Local Draft Hall')
    localStorage.setItem(CACHE_KEY, JSON.stringify(baseline))
    const posts: RequestInit[] = []
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') {
        posts.push(init ?? {})
        return jsonResponse({ success: true, updatedAt: 'R2' })
      }
      return jsonResponse({ ...baseline, updatedAt: 'R1' })
    }))

    // Prime an acknowledged baseline so the second load is classified as
    // local-ahead rather than an unknown-baseline divergence.
    useGraphStore.getState().loadMapData(MAP_ID)
    await waitFor(() => expect(useGraphStore.getState().syncStatus).toBe('synced'))
    localStorage.setItem(CACHE_KEY, JSON.stringify(local))
    clearActiveGraph()
    useGraphStore.getState().loadMapData(MAP_ID)
    const view = render(
      <EditorBridge>
        <SaveStatus />
      </EditorBridge>,
    )

    await waitFor(() => expect(view.getByText('All changes saved')).toBeInTheDocument())
    expect(useGraphStore.getState().syncStatus).toBe('synced')
    expect(posts).toHaveLength(1)
    const trace = __getSyncStatusTraceForTests()
    expect(trace.at(-1)?.source).toBe('performSyncToSupabase')
    expect(trace.at(-1)?.to).toBe('synced')
    expect(trace.some((entry) => entry.to === 'conflict')).toBe(false)
  })
})
