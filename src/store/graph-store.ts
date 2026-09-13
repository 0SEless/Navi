import { create } from 'zustand'
import { Graph } from '../engine/graph'
import type { NavNode, NavEdge, Building, Component, GraphSnapshot, TracePath } from '../types/nav-types'
import { compileComponent } from '../engine/component-compiler'
import { serializeSnapshot, type GraphSnapshotLike } from '../services/graph-snapshot-serializer'

const STORAGE_KEY = 'navi-graph'
const SYNC_STATUS_KEY = 'navi-sync-status'

function syncStatusKey(mapId: string | null): string {
  return mapId ? `${SYNC_STATUS_KEY}-${mapId}` : SYNC_STATUS_KEY
}

function snapshotFingerprint(snapshotJson: string): string {
  // A small synchronous fingerprint keeps the local sync marker tied to the
  // exact cached snapshot without storing another copy of the graph.
  let hash = 2166136261
  for (let i = 0; i < snapshotJson.length; i += 1) {
    hash ^= snapshotJson.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'conflict'

interface GraphState {
  graph: Graph
  currentMapId: string | null
  renderVersion: number
  syncStatus: SyncStatus
  syncError: string | null

  addNode: (node: NavNode) => void
  removeNode: (id: string) => void
  updateNode: (id: string, partial: Partial<NavNode>) => void

  addEdge: (edge: NavEdge) => void
  removeEdge: (id: string) => void
  updateEdge: (id: string, partial: Partial<NavEdge>) => void

  addBuilding: (building: Building) => void
  updateBuilding: (id: string, partial: Partial<Building>) => void
  removeBuilding: (id: string) => void

  addComponent: (component: Component) => void
  updateComponent: (id: string, partial: Partial<Component>) => void
  removeComponent: (id: string) => void
  addTrace: (trace: TracePath) => void
  updateTrace: (id: string, partial: Partial<TracePath>) => void
  removeTrace: (id: string) => void
  recompileTrace: (id: string) => void
  addComponentWithPolygon: (component: Component) => void
  rotateBuilding: (buildingId: string, angleRad: number) => void

  setNodes: (nodes: NavNode[]) => void
  setEdges: (edges: NavEdge[]) => void
  setBuildings: (buildings: Building[]) => void

  loadMapData: (mapId: string) => void
  setCurrentMapId: (mapId: string | null) => void
  load: () => void
  save: () => Promise<void>
  reset: () => void

  syncToSupabase: (options?: { force?: boolean }) => Promise<void>
  reSync: (options?: { force?: boolean }) => Promise<void>
  fetchFromSupabase: (mapId?: string) => Promise<void>
  adoptServerSnapshot: () => Promise<void>
}

function storageKey(mapId: string): string {
  return mapId ? `navi-graph-${mapId}` : STORAGE_KEY
}

/**
 * Backoff delays (ms) between sync retries for transient network failures.
 * Total worst-case added latency before giving up: 1s + 3s = 4s.
 */
const SYNC_RETRY_DELAYS = [1000, 3000]

let onlineResyncBound = false

/**
 * True for transport-level failures (undici "fetch failed", browser
 * "Failed to fetch", Firefox "NetworkError", Safari "Load failed", ...).
 * These are transient and worth retrying; HTTP/data errors are not.
 */
function isNetworkError(msg: string): boolean {
  return /fetch failed|failed to fetch|networkerror|load failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/i.test(msg)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * After a sync fails because the browser is offline, resume syncing
 * automatically once the connection returns. Bound at most once.
 */
function bindOnlineResync() {
  if (typeof window === 'undefined' || onlineResyncBound) return
  onlineResyncBound = true
  window.addEventListener('online', () => {
    const state = useGraphStore.getState()
    if (state.currentMapId) void state.syncToSupabase().catch(() => {})
  })
}

interface SyncMarker {
  snapshotFingerprint?: string
  syncedAt?: string
  serverTimestamp?: string | null
}

function readSyncMarker(mapId: string): SyncMarker | null {
  try {
    const raw = localStorage.getItem(syncStatusKey(mapId))
    return raw ? (JSON.parse(raw) as SyncMarker) : null
  } catch {
    return null
  }
}

/**
 * `serverTimestamp` is only ever populated from a real server response.
 * It must never be stamped with the local clock, otherwise a stale local
 * snapshot can appear newer than the server during freshness comparison.
 */
function writeSyncMarker(
  mapId: string,
  fingerprint: string,
  syncedAt: string,
  serverTimestamp: string | null,
): void {
  try {
    localStorage.setItem(syncStatusKey(mapId), JSON.stringify({
      snapshotFingerprint: fingerprint,
      syncedAt,
      serverTimestamp,
    }))
  } catch {
    // Best effort: a missing marker only costs an extra server check.
  }
}

function backupKey(mapId: string): string {
  return `navi-graph-backup-${mapId}`
}

/** Canonical JSON with sorted keys so JSONB key reordering cannot fake a mismatch. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}

/**
 * Content fingerprint that ignores object key order and the volatile
 * `updatedAt` field that `Graph.toJSON()` regenerates on every call.
 */
function graphFingerprint(snapshot: unknown): string {
  const json = Graph.fromJSON(snapshot as GraphSnapshot).toJSON() as unknown as Record<string, unknown>
  delete json.updatedAt
  return snapshotFingerprint(stableStringify(json))
}

async function fetchServerSnapshot(mapId: string): Promise<(GraphSnapshot & { updatedAt?: string }) | null> {
  try {
    const res = await fetch(`/api/graph?campus_id=${encodeURIComponent(mapId)}`, { credentials: 'include' })
    if (!res.ok) return null
    const data = (await res.json()) as GraphSnapshot & { updatedAt?: string }
    if (!data || !Array.isArray(data.nodes)) return null
    return data
  } catch {
    return null
  }
}

function isServerSnapshotEmpty(data: GraphSnapshot): boolean {
  return (data.buildings?.length ?? 0) === 0 && (data.nodes?.length ?? 0) === 0
}

/** Replace the active graph with a server snapshot and record the synced marker. */
function adoptServerSnapshotData(mapId: string, data: GraphSnapshot & { updatedAt?: string }): void {
  const graph = Graph.fromJSON(data)
  graph.campusId = mapId
  const snapshot = graph.toJSON()
  try {
    localStorage.setItem(storageKey(mapId), JSON.stringify(snapshot))
  } catch {
    // Cache is best effort; the in-memory graph stays authoritative.
  }
  writeSyncMarker(mapId, graphFingerprint(snapshot), data.updatedAt ?? new Date().toISOString(), data.updatedAt ?? null)
  useGraphStore.setState({ graph, currentMapId: mapId, syncStatus: 'synced', syncError: null })
}

/**
 * Compare the local snapshot with the server and reconcile:
 * - identical content -> mark synced;
 * - server differs, local clean -> adopt the server snapshot;
 * - server differs, local has unsynced changes -> visible conflict (no side is discarded).
 * Network failures and empty servers keep the local snapshot (offline fallback).
 */
async function checkServerFreshness(mapId: string): Promise<void> {
  const data = await fetchServerSnapshot(mapId)
  if (!data || isServerSnapshotEmpty(data)) return

  const state = useGraphStore.getState()
  if (state.currentMapId !== mapId) return

  const localRaw = localStorage.getItem(storageKey(mapId))
  if (!localRaw) return
  let localSnapshot: unknown
  try {
    localSnapshot = JSON.parse(localRaw)
  } catch {
    return
  }

  const localFingerprint = graphFingerprint(localSnapshot)
  const serverFingerprint = graphFingerprint(data)
  const storeFingerprint = graphFingerprint(state.graph.toJSON())

  if (serverFingerprint === localFingerprint && storeFingerprint === localFingerprint) {
    writeSyncMarker(mapId, localFingerprint, new Date().toISOString(), data.updatedAt ?? null)
    useGraphStore.setState({ syncStatus: 'synced', syncError: null })
    return
  }

  const marker = readSyncMarker(mapId)
  const localDirty = !marker || marker.snapshotFingerprint !== localFingerprint
  const storeAhead = storeFingerprint !== localFingerprint

  if (!localDirty && !storeAhead) {
    const lastServerTime = marker?.serverTimestamp ? Date.parse(marker.serverTimestamp) : Number.NaN
    const incomingServerTime = data.updatedAt ? Date.parse(data.updatedAt) : Number.NaN
    if (Number.isFinite(lastServerTime) && Number.isFinite(incomingServerTime)) {
      if (incomingServerTime < lastServerTime) {
        // A stale replica/response must not roll a known-newer clean snapshot back.
        useGraphStore.setState({ syncStatus: 'synced', syncError: null })
        return
      }
      if (incomingServerTime > lastServerTime) {
        adoptServerSnapshotData(mapId, data)
        return
      }
      // Same server revision with different content is internally inconsistent;
      // preserve local data and surface the normal explicit conflict below.
    } else {
      // Legacy markers have no server revision. Preserve established behavior
      // while the next successful response upgrades the marker.
      adoptServerSnapshotData(mapId, data)
      return
    }
  }

  const stamp = data.updatedAt ? ` (updated ${data.updatedAt})` : ''
  useGraphStore.setState({
    syncStatus: 'conflict',
    syncError: `The server has a different version of this map${stamp}. Your unsynced local changes are preserved. Use "Load server version" to replace them, or reSync({ force: true }) to overwrite the server.`,
  })
}

export const useGraphStore = create<GraphState>((set, get) => ({
  graph: new Graph(),
  currentMapId: null,
  renderVersion: 0,
  syncStatus: 'idle',
  syncError: null,

  addNode: (node) => {
    get().graph.addNode(node)
    set({ renderVersion: get().renderVersion + 1 })
  },

  removeNode: (id) => {
    get().graph.removeNode(id)
    set({ renderVersion: get().renderVersion + 1 })
  },

  updateNode: (id, partial) => {
    get().graph.updateNode(id, partial)
    set({ renderVersion: get().renderVersion + 1 })
  },

  addEdge: (edge) => {
    get().graph.addEdge(edge)
    set({ renderVersion: get().renderVersion + 1 })
  },

  removeEdge: (id) => {
    get().graph.removeEdge(id)
    set({ renderVersion: get().renderVersion + 1 })
  },

  updateEdge: (id, partial) => {
    get().graph.updateEdge(id, partial)
    set({ renderVersion: get().renderVersion + 1 })
  },

  addBuilding: (building) => {
    get().graph.addBuilding(building)
    set({ renderVersion: get().renderVersion + 1 })
  },

  updateBuilding: (id, partial) => {
    get().graph.updateBuilding(id, partial)
    set({ renderVersion: get().renderVersion + 1 })
  },

  removeBuilding: (id) => {
    get().graph.removeBuilding(id)
    set({ renderVersion: get().renderVersion + 1 })
  },

  setNodes: (nodes) => {
    get().graph.setNodes(nodes)
    set({ renderVersion: get().renderVersion + 1 })
  },

  setEdges: (edges) => {
    get().graph.setEdges(edges)
    set({ renderVersion: get().renderVersion + 1 })
  },

  setBuildings: (buildings) => {
    get().graph.setBuildings(buildings)
    set({ renderVersion: get().renderVersion + 1 })
  },

  addComponent: (component: Component) => {
    const graph = get().graph
    const buildingsMap = new Map(graph.buildings.map((b) => [b.id, b]))
    const currentMapId = get().currentMapId
    const result = compileComponent(component, {
      buildings: buildingsMap,
      existingNodes: graph.nodes,
      existingEdges: graph.edges,
      componentId: component.id,
      campusId: component.campusId ?? currentMapId ?? undefined,
    })
    graph.addComponent({ ...component, polygon: component.polygon ?? result.polygon })
    for (const node of result.nodes) {
      graph.addNode(node)
    }
    for (const edge of result.edges) {
      graph.addEdge(edge)
    }
    if (component.type === 'hallway') {
      graph.syncHallwayIntersections(component.buildingId, component.floor)
    }
    set({ renderVersion: get().renderVersion + 1 })
  },

  updateComponent: (id, partial) => {
    get().graph.updateComponent(id, partial)
    set({ renderVersion: get().renderVersion + 1 })
  },

  removeComponent: (id) => {
    const graph = get().graph
    const component = graph.getComponent(id)
    graph.removeComponent(id)
    if (component?.type === 'entrance') {
      const building = graph.getBuilding(component.buildingId)
      if (building && building.entrances) {
        graph.updateBuilding(component.buildingId, {
          entrances: building.entrances.filter((e) => e.id !== id),
        })
      }
    }
    set({ renderVersion: get().renderVersion + 1 })
  },

  addTrace: (trace) => {
    const roomNodes = get().graph.nodes.filter(n => n.type === 'room_door' || n.type === 'room')
    get().graph.addTraceWithCompile(trace, roomNodes)
    set({ renderVersion: get().renderVersion + 1 })
  },

  updateTrace: (id, partial) => {
    get().graph.updateTrace(id, partial)
    set({ renderVersion: get().renderVersion + 1 })
  },

  removeTrace: (id) => {
    get().graph.removeTrace(id)
    set({ renderVersion: get().renderVersion + 1 })
  },

  recompileTrace: (id: string) => {
    get().graph.recompileTrace(id)
    set({ renderVersion: get().renderVersion + 1 })
  },

  addComponentWithPolygon: (component: Component) => get().addComponent(component),

  rotateBuilding: (buildingId: string, angleRad: number) => {
    const graph = get().graph
    const building = graph.buildings.find((b) => b.id === buildingId)
    if (!building || !building.footprint || building.footprint.length === 0) return

    const centroid = building.footprint.reduce(
      (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
      { lat: 0, lng: 0 },
    )
    centroid.lat /= building.footprint.length
    centroid.lng /= building.footprint.length

    const cosA = Math.cos(angleRad)
    const sinA = Math.sin(angleRad)
    const newFootprint = building.footprint.map((p) => {
      const dx = p.lng - centroid.lng
      const dy = p.lat - centroid.lat
      return {
        lat: centroid.lat + (dy * cosA - dx * sinA),
        lng: centroid.lng + (dx * cosA + dy * sinA),
      }
    })

    graph.updateBuilding(buildingId, { footprint: newFootprint })
    set({ renderVersion: get().renderVersion + 1 })
  },

  load: async () => {
    if (typeof window === 'undefined') return
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      await get().fetchFromSupabase()
      return
    }
    try {
      const snapshot = JSON.parse(raw)
      const graph = Graph.fromJSON(snapshot)
      set({ graph })
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[graph-store] Failed to parse localStorage graph:', e)
      }
      await get().fetchFromSupabase()
    }
  },

  loadMapData: (mapId: string) => {
    if (typeof window === 'undefined') return
    const key = storageKey(mapId)
    const raw = localStorage.getItem(key)
    let graph = new Graph()
    if (raw) {
      try {
        const snapshot = JSON.parse(raw)
        graph = Graph.fromJSON(snapshot)
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[graph-store] Failed to parse map data from localStorage:', e)
        }
      }
    }
    // Ensure graph identity matches the map being loaded
    graph.campusId = mapId

    // CASE A — No local graph or empty: fetch from Supabase
    if (!raw || !graph.buildings.length) {
      set({ graph, currentMapId: null })
      void get().fetchFromSupabase(mapId)
      return
    }

    // CASE B — Local graph exists with buildings.
    // Fast paint from the local cache, then always check the server. A local
    // snapshot must never be silently preferred over newer server data.
    let locallySynced = false
    try {
      const marker = readSyncMarker(mapId)
      locallySynced = marker?.snapshotFingerprint === graphFingerprint(JSON.parse(raw))
    } catch {
      locallySynced = false
    }
    set({ graph, currentMapId: mapId, syncStatus: locallySynced ? 'synced' : 'idle', syncError: null })
    void checkServerFreshness(mapId)
  },

  setCurrentMapId: (mapId: string | null) => {
    const graph = get().graph
    if (mapId) graph.campusId = mapId
    set({ currentMapId: mapId })
  },

  save: async () => {
    if (typeof window === 'undefined') return
    const mapId = get().currentMapId
    // Keep graph identity in sync with the active map
    if (mapId) get().graph.campusId = mapId
    const key = mapId ? storageKey(mapId) : STORAGE_KEY
    const json = get().graph.toJSON()
    localStorage.setItem(key, JSON.stringify(json))
    await get().syncToSupabase()
  },

  reset: () => {
    if (typeof window === 'undefined') return
    const mapId = get().currentMapId
    const key = mapId ? storageKey(mapId) : STORAGE_KEY
    localStorage.removeItem(key)
    set({ graph: new Graph(), currentMapId: null, syncStatus: 'idle', syncError: null })
  },

  syncToSupabase: async (options?: { force?: boolean }) => {
    if (typeof window === 'undefined') return
    const unresolvedConflict = get().syncStatus === 'conflict' ? get().syncError : null
    if (unresolvedConflict) {
      // Never overwrite a divergent server snapshot from an autosave. The user
      // must resolve explicitly via reSync({ force: true }) or adoptServerSnapshot().
      console.warn('[graph-store] syncToSupabase blocked while a server conflict is unresolved:', unresolvedConflict)
      throw new Error(unresolvedConflict)
    }
    const mapId = get().currentMapId
    if (!mapId) {
      const message = 'Cannot sync without an active map'
      set({ syncStatus: 'error', syncError: message })
      throw new Error(message)
    }
    // Per-campus queue: overlapping autosave/visibility/manual writes must not
    // race each other with the same expectedServerUpdatedAt.
    await enqueueCampusSave(mapId, options?.force === true)
  },

  /**
   * Force re-sync the current graph to Supabase.
   * Useful for recovering from a failed sync (e.g. after fixing field mappings).
   * Call this from the browser console:
   *   useGraphStore.getState().reSync()
   *
   * Without `force`, refuses to overwrite a server snapshot whose content
   * differs from the local copy and reports a recoverable conflict instead.
   *   useGraphStore.getState().reSync({ force: true }) — overwrite the server.
   */
  reSync: async (options?: { force?: boolean }) => {
    if (typeof window === 'undefined') return
    const mapId = get().currentMapId
    if (!mapId) {
      console.warn('[graph-store] reSync: no active map')
      return
    }

    if (!options?.force) {
      const data = await fetchServerSnapshot(mapId)
      if (data && !isServerSnapshotEmpty(data)) {
        const localRaw = localStorage.getItem(storageKey(mapId))
        let localSnapshot: unknown = null
        if (localRaw) {
          try {
            localSnapshot = JSON.parse(localRaw)
          } catch {
            localSnapshot = null
          }
        }
        if (!localSnapshot || graphFingerprint(localSnapshot) !== graphFingerprint(data)) {
          const stamp = data.updatedAt ? ` (updated ${data.updatedAt})` : ''
          const message = `The server has a different version of this map${stamp}. reSync refused to overwrite it. Use reSync({ force: true }) to overwrite the server, or adoptServerSnapshot() to load the server version.`
          console.warn('[graph-store] reSync blocked by server conflict:', message)
          set({ syncStatus: 'conflict', syncError: message })
          throw new Error(message)
        }
      }
    }

    if (options?.force) {
      // Explicit overwrite: leave the conflict state and push the local copy.
      set({ syncStatus: 'idle', syncError: null })
    }

    const key = storageKey(mapId)
    const raw = localStorage.getItem(key)
    if (raw) {
      try {
        const graph = Graph.fromJSON(JSON.parse(raw))
        graph.campusId = mapId
        set({ graph, currentMapId: mapId })
      } catch (e) {
        console.warn('[graph-store] reSync: failed to parse local data', e)
      }
    }
    await get().syncToSupabase({ force: options?.force })
  },

  /**
   * Resolve a local/server conflict in favour of the server snapshot.
   * The unsynced local copy is preserved at `navi-graph-backup-<mapId>`
   * before the server version replaces it.
   */
  adoptServerSnapshot: async () => {
    if (typeof window === 'undefined') return
    const mapId = get().currentMapId
    if (!mapId) return
    const localRaw = localStorage.getItem(storageKey(mapId))
    if (localRaw) {
      try {
        localStorage.setItem(backupKey(mapId), localRaw)
      } catch {
        // Backup is best effort; never block the explicit user action on it.
      }
    }
    const data = await fetchServerSnapshot(mapId)
    if (!data || isServerSnapshotEmpty(data)) {
      const message = 'Unable to load the server version. Check your connection and try again.'
      set({ syncStatus: 'error', syncError: message })
      throw new Error(message)
    }
    adoptServerSnapshotData(mapId, data)
  },

  fetchFromSupabase: async (mapId?: string) => {
    if (typeof window === 'undefined') return
    const effectiveMapId = mapId || get().currentMapId
    set({ syncStatus: 'syncing' })
    try {
      const url = effectiveMapId ? `/api/graph?campus_id=${encodeURIComponent(effectiveMapId)}` : `/api/graph`
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as GraphSnapshot & { updatedAt?: string }
      if (!data || !data.nodes) {
        // F3: metadata-only or legacy rows carry an authoritative revision but
        // no graph arrays. Record that revision and mount an empty graph so the
        // editor can open and adopt the row on its first save.
        if (effectiveMapId && data?.updatedAt) {
          let fingerprint: string
          try {
            fingerprint = graphFingerprint(data)
          } catch {
            fingerprint = snapshotFingerprint(stableStringify(data))
          }
          writeSyncMarker(effectiveMapId, fingerprint, data.updatedAt, data.updatedAt)
        }
        const emptyGraph = new Graph()
        if (effectiveMapId) emptyGraph.campusId = effectiveMapId
        set({ graph: emptyGraph, currentMapId: effectiveMapId ?? null, syncStatus: 'idle' })
        return
      }
      const graph = Graph.fromJSON(data)
      // Keep graph identity in sync with the map we loaded
      if (effectiveMapId) graph.campusId = effectiveMapId
      // Record server freshness for future load comparisons. Only real server
      // timestamps may enter the marker.
      if (effectiveMapId && data.updatedAt) {
        writeSyncMarker(effectiveMapId, graphFingerprint(data), data.updatedAt, data.updatedAt)
      }
      set({ graph, currentMapId: effectiveMapId, syncStatus: 'synced' })
    } catch (e) {
      console.warn('[graph-store] fetchFromSupabase failed:', e)
      set({ syncStatus: 'idle' })
    }
  },
}))

// ── Per-campus save serialization ─────────────────────────────────────────
//
// Optimistic concurrency requires a single writer per campus: when two POSTs
// read the same expectedServerUpdatedAt, the second one conflicts against the
// revision produced by the first (a self-conflict). All save triggers
// (autosave debounce, visibility/unload flush, building drag, wizard, online
// resync, forced re-sync) funnel through this queue.
//
// Contract:
//   - at most one `/api/graph` POST in flight per campus;
//   - while one runs, callers join a single coalesced follow-up;
//   - the follow-up re-reads the newest graph and the latest acknowledged
//     revision at execution time, so a later local edit is never lost.

interface CampusSaveQueue {
  running: boolean
  hasPending: boolean
  pendingForce: boolean
  waiters: Array<{ resolve: () => void; reject: (reason: unknown) => void }>
}

const campusSaveQueues = new Map<string, CampusSaveQueue>()

/** Test-only: clears queued/running save state between test cases. */
export function __resetGraphSaveQueuesForTests(): void {
  campusSaveQueues.clear()
}

function getCampusSaveQueue(mapId: string): CampusSaveQueue {
  let queue = campusSaveQueues.get(mapId)
  if (!queue) {
    queue = { running: false, hasPending: false, pendingForce: false, waiters: [] }
    campusSaveQueues.set(mapId, queue)
  }
  return queue
}

function enqueueCampusSave(mapId: string, force: boolean): Promise<void> {
  const queue = getCampusSaveQueue(mapId)

  if (queue.running) {
    queue.hasPending = true
    queue.pendingForce = queue.pendingForce || force
    return new Promise<void>((resolve, reject) => {
      queue.waiters.push({ resolve, reject })
    })
  }

  queue.running = true
  const firstRun = performSyncToSupabase(mapId, force)
  // Drain after the first run settles. `firstRun` is also the first caller's
  // result, so its outcome is not coupled to later queued writes.
  void firstRun.then(
    () => {
      void drainCampusSaveQueue(mapId, queue)
    },
    (error: unknown) => {
      rejectQueuedSaves(queue, error)
      queue.running = false
    },
  )
  return firstRun
}

async function drainCampusSaveQueue(mapId: string, queue: CampusSaveQueue): Promise<void> {
  while (queue.hasPending) {
    const force = queue.pendingForce
    const waiters = queue.waiters.splice(0)
    queue.hasPending = false
    queue.pendingForce = false
    try {
      await performSyncToSupabase(mapId, force)
      for (const waiter of waiters) waiter.resolve()
    } catch (error) {
      rejectQueuedSaves(queue, error, waiters)
      break
    }
  }
  queue.running = false
}

function rejectQueuedSaves(
  queue: CampusSaveQueue,
  error: unknown,
  settled: CampusSaveQueue['waiters'] = [],
): void {
  const stillWaiting = queue.waiters.splice(0)
  queue.hasPending = false
  queue.pendingForce = false
  for (const waiter of [...settled, ...stillWaiting]) waiter.reject(error)
}

async function performSyncToSupabase(mapId: string, force: boolean): Promise<void> {
  const unresolvedConflict =
    useGraphStore.getState().syncStatus === 'conflict' ? useGraphStore.getState().syncError : null
  if (unresolvedConflict) {
    console.warn('[graph-store] syncToSupabase blocked while a server conflict is unresolved:', unresolvedConflict)
    throw new Error(unresolvedConflict)
  }
  if (useGraphStore.getState().currentMapId !== mapId) {
    // The editor moved to another map while this save was queued; the graph
    // for `mapId` is no longer the active one. Its local cache is intact.
    console.warn(`[graph-store] syncToSupabase skipped: map "${mapId}" is no longer active`)
    return
  }

  useGraphStore.setState({ syncStatus: 'syncing', syncError: null })
  const snapshot = useGraphStore.getState().graph.toJSON()
  const snapshotHash = graphFingerprint(snapshot)
  // Serialize through the mapping layer to ensure RPC-compatible format
  // and inject the correct campusId from currentMapId
  const payload = serializeSnapshot(snapshot as unknown as GraphSnapshotLike, mapId)
  const expectedServerUpdatedAt = readSyncMarker(mapId)?.serverTimestamp ?? null
  const body = JSON.stringify({ ...payload, expectedServerUpdatedAt, forceServerOverwrite: force })

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch('/api/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body,
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        const msg = errBody.error ?? `HTTP ${res.status}`
        if (isNetworkError(msg) && attempt < SYNC_RETRY_DELAYS.length) {
          await sleep(SYNC_RETRY_DELAYS[attempt])
          continue
        }
        throw new Error(msg)
      }
      const serverResult = (await res.json().catch(() => ({}))) as { updatedAt?: string | null }
      const acknowledgedRevision = await resolveAcknowledgedRevision(mapId, serverResult.updatedAt ?? null)
      if (!acknowledgedRevision) {
        // No authoritative revision means the next save would claim a stale
        // expectedServerUpdatedAt. Never report synchronized in that state.
        const message =
          'The save reached the server, but the authoritative revision could not be confirmed. Local changes remain cached; retry when the server is reachable.'
        console.warn('[graph-store] syncToSupabase could not confirm the server revision.')
        useGraphStore.setState({ syncStatus: 'error', syncError: message })
        throw new Error(message)
      }
      // A confirmed server revision always becomes the marker's revision. The
      // fingerprint records the exact content the server acknowledged, while
      // newer local edits remain tracked as unsynced by the fingerprint mismatch.
      writeSyncMarker(mapId, snapshotHash, new Date().toISOString(), acknowledgedRevision)
      useGraphStore.setState({ syncStatus: 'synced', syncError: null })
      return
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sync failed'
      if (isNetworkError(msg) && attempt < SYNC_RETRY_DELAYS.length) {
        await sleep(SYNC_RETRY_DELAYS[attempt])
        continue
      }
      if (isNetworkError(msg)) {
        // Transient network failure — the graph is already safe in
        // localStorage, so surface a calm status and resume automatically
        // when the connection comes back.
        bindOnlineResync()
        const offlineMessage = 'Offline — changes saved locally. Will retry when back online.'
        console.warn('[graph-store] syncToSupabase offline — saved locally, will retry when back online:', msg)
        useGraphStore.setState({ syncStatus: 'error', syncError: offlineMessage })
        throw new Error(offlineMessage)
      } else if (/server changed|snapshot conflict/i.test(msg)) {
        useGraphStore.setState({ syncStatus: 'conflict', syncError: msg })
        throw new Error(msg)
      } else {
        console.error('[graph-store] syncToSupabase failed:', msg)
        useGraphStore.setState({ syncStatus: 'error', syncError: msg })
        throw new Error(msg)
      }
    }
  }
}

/**
 * Resolve the revision the save must acknowledge.
 *
 * Migration 009 returns `updatedAt`; the deployed 004/005 RPC does not. When
 * the POST response carries no revision, read the authoritative value back so
 * the next save never claims a revision the server has already advanced past.
 */
async function resolveAcknowledgedRevision(
  mapId: string,
  responseUpdatedAt: string | null,
): Promise<string | null> {
  if (typeof responseUpdatedAt === 'string' && responseUpdatedAt.length > 0) {
    return responseUpdatedAt
  }
  const data = await fetchServerSnapshot(mapId)
  return data?.updatedAt ?? null
}
