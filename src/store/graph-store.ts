import { create } from 'zustand'
import { fullSnapshotFingerprint, SNAPSHOT_IDENTITY_VERSION } from '../services/full-snapshot-identity'
import { Graph } from '../engine/graph'
import type { NavNode, NavEdge, Building, Component, GraphSnapshot, TracePath } from '../types/nav-types'
import { compileComponent } from '../engine/component-compiler'
import { serializeSnapshot, type GraphSnapshotLike } from '../services/graph-snapshot-serializer'
import type { CampusDocument } from '@navi/core'
import {
  parseAuthoredGraphPayload,
  serializeAuthoredGraphPayload,
} from '../services/authored-snapshot-persistence'
import { appendIntent, evaluateAuthoredSave, intentsIncludedInSave, type AuthoredMutationIntent } from './authored-mutation-intent'
import type { GuardCollections } from '../lib/save-safety-guard'
import { updateBuildingCoverMetadata } from '../lib/building-cover'
import { isBuildingCoverReferenceForOwner } from '../lib/building-cover-policy'
import { readGraphSaveOutbox, writeGraphSaveOutbox, clearGraphSaveOutbox, type PendingGraphSave } from '../services/graph-save-outbox'

const STORAGE_KEY = 'navi-graph'
const SYNC_STATUS_KEY = 'navi-sync-status'

function syncStatusKey(mapId: string | null): string {
  return mapId ? `${SYNC_STATUS_KEY}-${mapId}` : SYNC_STATUS_KEY
}

const BUILDING_COVER_METADATA_FIELDS = ['imageUrl', 'photoUrl', 'image'] as const

type BuildingCoverMetadataSnapshot = Record<
  (typeof BUILDING_COVER_METADATA_FIELDS)[number],
  { present: boolean; value: unknown }
>

function snapshotBuildingCoverFields(metadata: Record<string, unknown>): BuildingCoverMetadataSnapshot {
  const snapshot = {} as BuildingCoverMetadataSnapshot
  for (const field of BUILDING_COVER_METADATA_FIELDS) {
    snapshot[field] = {
      present: Object.prototype.hasOwnProperty.call(metadata, field),
      value: metadata[field],
    }
  }
  return snapshot
}

function restoreBuildingCoverFields(
  document: CampusDocument,
  buildingId: string,
  snapshot: BuildingCoverMetadataSnapshot,
): CampusDocument | null {
  const index = document.buildings.findIndex((building) => building.id === buildingId)
  if (index < 0) return null
  const building = document.buildings[index]
  const metadata: Record<string, unknown> = { ...building.metadata }
  for (const field of BUILDING_COVER_METADATA_FIELDS) {
    const prior = snapshot[field]
    if (prior.present) metadata[field] = prior.value
    else delete metadata[field]
  }
  const buildings = [...document.buildings]
  buildings[index] = { ...building, metadata }
  return { ...document, buildings }
}

type SyncStatus = 'idle' | 'syncing' | 'checking' | 'synced' | 'error' | 'conflict'

interface GraphState {
  graph: Graph
  /** Canonical authored state when the active snapshot uses the new format. */
  authoredDocument: CampusDocument | null
  setAuthoredDocument: (document: CampusDocument | null) => void
  /** Persist one stable cover reference through the existing guarded save path. */
  saveBuildingCoverReference: (buildingId: string, reference: string | null) => Promise<void>
  currentMapId: string | null
  /** Incremented only after a server graph and its local cache are adopted. */
  serverAdoptionVersion: number
  renderVersion: number
  syncStatus: SyncStatus
  syncError: string | null
  /**
   * P0.11 — CAMPUS_READY_FOR_AUTHORED_SAVE. False while an authoritative load
   * or hydration is in flight; saves are refused until it settles true.
   */
  campusReady: boolean
  /** P0.11 — authored mutation intents pending since the last acknowledged save. */
  pendingAuthoredMutations: AuthoredMutationIntent[]
  recordAuthoredMutation: (kind: AuthoredMutationIntent['kind'], buildingId?: string | null, floor?: number | null) => void
  clearAuthoredMutations: (ackedSeq: number) => void
  /** P0.14 — real runtime readiness lifecycle (shared by runtime and fixtures). */
  beginCampusHydration: () => void
  completeCampusHydration: () => void

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
  save: (options?: { trigger?: SaveTrigger }) => Promise<void>
  /** Synchronous recovery checkpoint; never certifies a server save. */
  persistRecovery: () => void
  reset: () => void

  syncToSupabase: (options?: { force?: boolean; trigger?: SaveTrigger }) => Promise<void>
  /**
   * Refresh-recovery: safe retry when local authored work is ahead of the last
   * acknowledged revision but the server is still at that acknowledged base.
   * Reuses the existing guarded save path; never force-overwrites.
   */
  syncLocalChanges: () => Promise<void>
  reSync: (options?: { force?: boolean }) => Promise<void>
  fetchFromSupabase: (mapId?: string) => Promise<void>
  adoptServerSnapshot: () => Promise<void>
}

function storageKey(mapId: string): string {
  return mapId ? `navi-graph-${mapId}` : STORAGE_KEY
}

function workingFingerprint(state: Pick<GraphState, 'graph' | 'authoredDocument'>): string {
  return fullSnapshotFingerprint(serializeAuthoredGraphPayload(state.graph.toJSON() as unknown as Record<string, unknown>, state.authoredDocument))
}

function hasUnsyncedWork(state: GraphState): boolean {
  if (!state.currentMapId) return false
  if (state.pendingAuthoredMutations.length) return true
  const marker = readSyncMarker(state.currentMapId)
  return marker?.formatVersion === SNAPSHOT_IDENTITY_VERSION
    ? marker.snapshotFingerprint !== workingFingerprint(state)
    : state.syncStatus !== 'synced' && state.syncStatus !== 'checking' && state.syncStatus !== 'syncing'
}

/** One logical save attempt gets one stable mutation id (kept across transport retries). */
function newMutationId(): string {
  try {
    const c = globalThis.crypto as Crypto | undefined
    if (c?.randomUUID) return c.randomUUID()
  } catch {
    // fall through to non-crypto id
  }
  return `mut-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Backoff delays (ms) between sync retries for transient network failures.
 * Total worst-case added latency before giving up: 1s + 3s = 4s.
 */
const SYNC_RETRY_DELAYS = [1000, 3000]
const REQUEST_TIMEOUT_MS = 15000
class GraphRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}
async function fetchGraphJson(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal })
        const data = await response.json() as Record<string, unknown>
        return { ok: response.ok, status: response.status, data }
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Graph request timed out. Pending work is preserved.')) }, REQUEST_TIMEOUT_MS)
      }),
    ])
  } finally { if (timer) clearTimeout(timer) }
}

let onlineResyncBound = false

/** P0.11 — monotonic sequence for authored mutation intents. */
let authoredIntentSeq = 0
let intentGeneration = newMutationId()

/**
 * P0.11 — last server-acknowledged canonical collections (guard baseline).
 * Null until an authoritative load or save acknowledgement is captured.
 */
let lastAcknowledgedCollections: GuardCollections | null = null
let lastAcknowledgedSeq = 0

const asEntityList = (items: unknown): GuardCollections['buildings'] =>
  (Array.isArray(items) ? items : []).map((raw) => {
    const e = raw as { id?: string; buildingId?: string | null; floor?: number | null; from?: string; to?: string }
    return { id: String(e.id ?? ''), buildingId: e.buildingId ?? null, floor: e.floor ?? null, from: e.from, to: e.to }
  })

/** Snapshot a serialized graph into guard-comparable collections. */
function collectionsOf(snapshot: unknown): GuardCollections {
  const s = snapshot as Record<string, unknown>
  return {
    buildings: asEntityList(s.buildings),
    components: asEntityList(s.components),
    nodes: asEntityList(s.nodes),
    edges: asEntityList(s.edges),
    traces: asEntityList(s.traces),
    doors: asEntityList(s.doors),
  }
}

/** Scope of an edge derived from its endpoints in the current graph. */
function edgeScope(
  graph: Graph,
  edge: { from?: string; to?: string } | undefined,
): { buildingId: string | null; floor: number | null } {
  const nodes = graph.nodes as Array<{ id: string; buildingId?: string | null; floor?: number | null }>
  const from = edge?.from ? nodes.find((n) => n.id === edge.from) : undefined
  const to = edge?.to ? nodes.find((n) => n.id === edge.to) : undefined
  const preferred = [from, to].find((n) => n?.buildingId) ?? from ?? to
  return { buildingId: preferred?.buildingId ?? null, floor: preferred?.floor ?? null }
}

/**
 * True for transport-level failures (undici "fetch failed", browser
 * "Failed to fetch", Firefox "NetworkError", Safari "Load failed", ...).
 * These are transient and worth retrying; HTTP/data errors are not.
 */
function isNetworkError(msg: string): boolean {
  return /fetch failed|failed to fetch|networkerror|load failed|request timed out|aborted|ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/i.test(msg)
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
  formatVersion?: number
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
): boolean {
  try {
    localStorage.setItem(syncStatusKey(mapId), JSON.stringify({
      formatVersion: SNAPSHOT_IDENTITY_VERSION,
      snapshotFingerprint: fingerprint,
      syncedAt,
      serverTimestamp,
    }))
    return true
  } catch {
    // Best effort: a missing marker only costs an extra server check.
    return false
  }
}

type PersistedGraphSnapshot = GraphSnapshot & {
  updatedAt?: string
  authoredDocument?: unknown
  authoredDocumentFormatVersion?: number
}

async function fetchServerSnapshot(mapId: string): Promise<PersistedGraphSnapshot | null> {
  try {
    const res = await fetchGraphJson(`/api/graph?campus_id=${encodeURIComponent(mapId)}`, { credentials: 'include' })
    if (!res.ok) return null
    const data = res.data as unknown as PersistedGraphSnapshot
    if (!data || typeof data !== 'object') return null
    return data
  } catch {
    return null
  }
}

function isServerSnapshotEmpty(data: PersistedGraphSnapshot): boolean {
  // Row existence/revision, never Graph entity count, determines authority.
  return !data.updatedAt && !data.authoredDocument && (data.buildings?.length ?? 0) === 0 && (data.nodes?.length ?? 0) === 0
}

/**
 * Per-campus supersession epoch: bumped whenever the authoritative base is
 * replaced (server adoption/load). In-flight saves that started under an older
 * epoch must not stamp their acknowledgement onto the new base.
 */
const campusEpoch = new Map<string, number>()
const adoptingCampuses = new Set<string>()
let serverLoadSequence = 0
const getCampusEpoch = (mapId: string): number => campusEpoch.get(mapId) ?? 0
const bumpCampusEpoch = (mapId: string): void => {
  campusEpoch.set(mapId, getCampusEpoch(mapId) + 1)
}

/**
 * Drop queued (not yet running) saves for a campus whose authoritative base has
 * been replaced. Waiters are rejected with a descriptive reason so callers can
 * surface the truth instead of silently re-persisting a discarded graph.
 */
function invalidateQueuedCampusSaves(mapId: string, reason: string): void {
  const queue = campusSaveQueues.get(mapId)
  if (!queue) return
  const pending = queue.waiters.splice(0)
  queue.hasPending = false
  queue.pendingForce = false
  for (const waiter of pending) waiter.reject(new Error(reason))
}

/** Replace the active graph with a server snapshot and record the synced marker. */
function adoptServerSnapshotData(mapId: string, data: PersistedGraphSnapshot): void {
  if (!data.updatedAt) throw new Error('The server snapshot has no authoritative revision.')
  const persisted = parseAuthoredGraphPayload(data)
  const graph = Graph.fromJSON({ ...data, buildings: data.buildings ?? [], nodes: data.nodes ?? [], edges: data.edges ?? [] })
  graph.campusId = mapId
  const snapshot = graph.toJSON()
  try {
    localStorage.setItem(
      storageKey(mapId),
      JSON.stringify(serializeAuthoredGraphPayload(snapshot as unknown as Record<string, unknown>, persisted.authoredDocument)),
    )
  } catch (error) {
    throw new Error(`Unable to persist the server version locally: ${error instanceof Error ? error.message : 'storage write failed'}`)
  }
  const markerWritten = writeSyncMarker(mapId, fullSnapshotFingerprint(data), new Date().toISOString(), data.updatedAt ?? null)
  if (!markerWritten) throw new Error('Unable to record the adopted server revision locally.')
  clearGraphSaveOutbox(mapId)
  lastAcknowledgedCollections = collectionsOf(snapshot)
  // Adopting the authoritative snapshot DISCARDS local edits: their pending
  // intents and any queued saves must not resurrect the discarded graph.
  authoredIntentSeq = 0
  intentGeneration = newMutationId()
  bumpCampusEpoch(mapId)
  invalidateQueuedCampusSaves(mapId, 'Superseded by authoritative server adoption')
  useGraphStore.setState({
    graph,
    authoredDocument: persisted.authoredDocument,
    currentMapId: mapId,
    syncStatus: 'synced',
    syncError: null,
    pendingAuthoredMutations: [],
    serverAdoptionVersion: useGraphStore.getState().serverAdoptionVersion + 1,
  })
}

/**
 * Compare the local snapshot with the server and reconcile:
 * - identical content -> mark synced;
 * - server differs, local clean -> adopt the server snapshot;
 * - server differs, local has unsynced changes -> visible conflict (no side is discarded).
 * Network failures keep the local snapshot but surface an explicit unverified
 * state; empty server snapshots settle to idle. `synced` requires server data.
 */
async function checkServerFreshness(mapId: string): Promise<void> {
  const epoch = getCampusEpoch(mapId)
  const data = await fetchServerSnapshot(mapId)

  const state = useGraphStore.getState()
  if (state.currentMapId !== mapId || getCampusEpoch(mapId) !== epoch) return

  let localRaw: string | null
  try { localRaw = localStorage.getItem(storageKey(mapId)) }
  catch { useGraphStore.setState({ syncStatus: 'error', syncError: 'Recovery storage is unavailable. Working content remains in memory.' }); return }

  if (!data) {
    // The server copy could not be read (offline or HTTP failure). The local
    // snapshot is preserved, but synchronization is unverified: never claim
    // `synced` from a marker alone.
    if (localRaw) {
      useGraphStore.setState({
        syncStatus: 'error',
        syncError: 'Offline — could not verify the server copy. Local changes are preserved.',
      })
    } else {
      useGraphStore.setState({ syncStatus: 'idle', syncError: null })
    }
    return
  }

  if (isServerSnapshotEmpty(data)) {
    // Nothing on the server to reconcile against. Keep the local snapshot but
    // settle on an explicit state — never leave load-time `checking` stuck.
    useGraphStore.setState({ syncStatus: 'idle', syncError: null })
    return
  }

  // An uncertain request is replayable against its original base, including
  // when the exact content already committed but its ACK was lost. Do not
  // discard newer local work or invent an ACK from this GET.
  try {
    const pending = readGraphSaveOutbox(mapId)
    if (pending && (data.updatedAt === pending.expectedServerUpdatedAt || fullSnapshotFingerprint(data) === pending.contentFingerprint)) {
      useGraphStore.setState({ syncStatus: 'idle', syncError: 'Pending save is recoverable. Retry will verify its original mutation acknowledgment.' })
      return
    }
  } catch (error) {
    useGraphStore.setState({ syncStatus: 'error', syncError: error instanceof Error ? error.message : 'Unable to read pending save recovery.' })
    return
  }

  if (!localRaw) return
  let localSnapshot: unknown
  try {
    localSnapshot = JSON.parse(localRaw)
  } catch {
    return
  }

  let localFingerprint: string, serverFingerprint: string, storeFingerprint: string
  try {
    localFingerprint = fullSnapshotFingerprint(localSnapshot)
    serverFingerprint = fullSnapshotFingerprint(data)
    storeFingerprint = fullSnapshotFingerprint(serializeAuthoredGraphPayload(state.graph.toJSON() as unknown as Record<string, unknown>, state.authoredDocument))
  } catch (error) {
    useGraphStore.setState({ syncStatus: 'error', syncError: `Unable to verify complete persisted content: ${error instanceof Error ? error.message : 'invalid snapshot'}` })
    return
  }
  if (data.updatedAt && serverFingerprint === localFingerprint && storeFingerprint === localFingerprint) {
    if (!writeSyncMarker(mapId, localFingerprint, new Date().toISOString(), data.updatedAt)) {
      useGraphStore.setState({ syncStatus: 'error', syncError: 'Unable to record the verified server revision locally.' })
      return
    }
    lastAcknowledgedCollections = collectionsOf(data)
    useGraphStore.setState({ syncStatus: state.pendingAuthoredMutations.length ? 'idle' : 'synced', syncError: null })
    return
  }
  const marker = readSyncMarker(mapId)
  const knownBase = marker?.formatVersion === SNAPSHOT_IDENTITY_VERSION
  const localDirty = !knownBase || marker.snapshotFingerprint !== localFingerprint
  const storeAhead = storeFingerprint !== localFingerprint || state.pendingAuthoredMutations.length > 0
  if (!localDirty && !storeAhead) {
    const previous = marker.serverTimestamp ? Date.parse(marker.serverTimestamp) : NaN
    const incoming = data.updatedAt ? Date.parse(data.updatedAt) : NaN
    if (Number.isFinite(previous) && Number.isFinite(incoming) && incoming > previous) {
      try { adoptServerSnapshotData(mapId, data) }
      catch (error) { useGraphStore.setState({ syncStatus: 'error', syncError: error instanceof Error ? error.message : 'Unable to persist server version locally.' }) }
      return
    }
    // Same/older revision with different content is not proof of synchronization.
    useGraphStore.setState({ syncStatus: 'error', syncError: 'Server revision/content could not be verified. Local content is preserved.' })
    return
  }

  const stamp = data.updatedAt ? ` (updated ${data.updatedAt})` : ''
  useGraphStore.setState({
    syncStatus: 'conflict',
    syncError: `The server has a different version of this map${stamp}. Your unsynced local changes are preserved. Use "Load server version" to replace them, or "Sync Changes" to retry against an unchanged base.`,
  })
}

export const useGraphStore = create<GraphState>((set, get) => ({
  graph: new Graph(),
  authoredDocument: null,
  setAuthoredDocument: (document) => {
    const snapshot = document ? JSON.parse(JSON.stringify(document)) as CampusDocument : null
    set({ authoredDocument: snapshot })
  },
  saveBuildingCoverReference: async (buildingId, reference) => {
    if (typeof window === 'undefined') throw new Error('Building cover persistence requires a browser session.')
    const initial = get()
    const mapId = initial.currentMapId
    if (!mapId) throw new Error('An active campus is required to save a building cover.')
    if (!initial.campusReady) throw new Error('The active campus is not ready for authored changes.')
    if (initial.syncStatus === 'conflict') throw new Error('Resolve the current server conflict before changing a building cover.')
    if (initial.syncStatus === 'syncing' || initial.syncStatus === 'checking') {
      throw new Error('Wait for the current campus save check to finish before changing a building cover.')
    }
    if (initial.pendingAuthoredMutations.length > 0) {
      throw new Error('Save or resolve the pending authored campus changes before changing a building cover.')
    }

    const document = initial.authoredDocument
    if (!document) throw new Error('The active campus has no authored document to update.')
    if (document.metadata.campusId !== mapId) throw new Error('The authored document does not match the active campus.')
    const building = document.buildings.find((candidate) => candidate.id === buildingId)
    if (!building) throw new Error('The selected building does not exist in the authored document.')
    if (reference !== null && !isBuildingCoverReferenceForOwner(reference, mapId, buildingId)) {
      throw new Error('The building cover reference is not a stable URL for this building.')
    }

    const cacheKey = storageKey(mapId)
    const priorLocalDraft = localStorage.getItem(cacheKey)
    const previousCoverFields = snapshotBuildingCoverFields(building.metadata)
    const updated = updateBuildingCoverMetadata(document, buildingId, reference)
    if (!updated) throw new Error('The selected building no longer exists in the authored document.')
    // CampusDocument.version is the authored-document change counter; keep it monotonic for metadata-only edits too.
    const nextDocument = { ...updated, version: document.version + 1 }

    get().setAuthoredDocument(nextDocument)
    get().recordAuthoredMutation('building', buildingId, null)
    const pending = get().pendingAuthoredMutations
    const coverIntent = pending[pending.length - 1]
    if (!coverIntent) {
      get().setAuthoredDocument(document)
      throw new Error('The building cover mutation intent could not be recorded.')
    }

    try {
      await get().save({ trigger: 'manual' })
      const acknowledged = get()
      if (acknowledged.currentMapId !== mapId) throw new Error('The active campus changed before the building cover save was acknowledged.')
      if (acknowledged.syncStatus !== 'synced' || acknowledged.pendingAuthoredMutations.some((intent) => intent.seq === coverIntent.seq)) {
        throw new Error('The building cover save was not confirmed by the server.')
      }
    } catch (error) {
      const current = get()
      if (current.currentMapId === mapId) {
        let localRollbackFailed = false
        if (current.authoredDocument) {
          const restored = restoreBuildingCoverFields(current.authoredDocument, buildingId, previousCoverFields)
          get().setAuthoredDocument(restored ?? current.authoredDocument)
          try {
            const persisted = serializeAuthoredGraphPayload(
              get().graph.toJSON() as unknown as Record<string, unknown>,
              get().authoredDocument,
            )
            localStorage.setItem(cacheKey, JSON.stringify(persisted))
          } catch {
            localRollbackFailed = true
          }
        } else {
          try {
            if (priorLocalDraft === null) localStorage.removeItem(cacheKey)
            else localStorage.setItem(cacheKey, priorLocalDraft)
          } catch {
            localRollbackFailed = true
          }
        }
        get().clearAuthoredMutations(coverIntent.seq)
        if (get().syncStatus !== 'conflict') {
          set({
            syncStatus: 'error',
            syncError: localRollbackFailed
              ? 'The building cover failed to save and its local rollback could not be written.'
              : error instanceof Error ? error.message : 'The building cover save failed.',
          })
        }
      } else {
        try {
          if (priorLocalDraft === null) localStorage.removeItem(cacheKey)
          else localStorage.setItem(cacheKey, priorLocalDraft)
        } catch {
          // Keep the current campus untouched; its own save state is unrelated.
        }
      }
      throw error
    }
  },
  currentMapId: null,
  serverAdoptionVersion: 0,
  renderVersion: 0,
  syncStatus: 'idle',
  syncError: null,
  campusReady: true,
  pendingAuthoredMutations: [],

  recordAuthoredMutation: (kind, buildingId, floor) => {
    authoredIntentSeq += 1
    set((state) => {
      const next = appendIntent(state.pendingAuthoredMutations, { kind, buildingId, floor }, authoredIntentSeq)
      // Keep one entry per scope, but advance its sequence on every real edit.
      // Otherwise an earlier in-flight ACK clears a newer same-scope edit.
      const latest = appendIntent([], { kind, buildingId, floor }, authoredIntentSeq)[0]
      const refreshed = next === state.pendingAuthoredMutations ? next.map(intent =>
        intent.kind === latest.kind && (intent.buildingId ?? null) === (latest.buildingId ?? null) && (intent.floor ?? null) === (latest.floor ?? null)
          ? latest : intent) : next
      return {
        pendingAuthoredMutations: refreshed,
        syncStatus: state.syncStatus === 'synced' ? 'idle' : state.syncStatus,
      }
    })
  },

  clearAuthoredMutations: (ackedSeq) => {
    set((state) => ({ pendingAuthoredMutations: intentsIncludedInSave(state.pendingAuthoredMutations, ackedSeq) }))
  },

  beginCampusHydration: () => set({ campusReady: false }),
  completeCampusHydration: () => {
    const currentJson = get().graph.toJSON()
    lastAcknowledgedCollections = collectionsOf(currentJson)
    set({ campusReady: true })
  },

  addNode: (node) => {
    const n = node as { buildingId?: string | null; floor?: number | null; type?: string }
    get().recordAuthoredMutation(n.type === 'room_door' ? 'door' : n.buildingId ? 'route' : 'outdoor', n.buildingId ?? null, n.floor ?? null)
    get().graph.addNode(node)
    set({ renderVersion: get().renderVersion + 1 })
  },

  removeNode: (id) => {
    const n = get().graph.nodes.find((x) => x.id === id) as { buildingId?: string | null; floor?: number | null; type?: string } | undefined
    get().recordAuthoredMutation(n?.type === 'room_door' ? 'door' : n?.buildingId ? 'route' : 'outdoor', n?.buildingId ?? null, n?.floor ?? null)
    get().graph.removeNode(id)
    set({ renderVersion: get().renderVersion + 1 })
  },

  updateNode: (id, partial) => {
    const n = get().graph.nodes.find((x) => x.id === id) as { buildingId?: string | null; floor?: number | null; type?: string } | undefined
    get().recordAuthoredMutation(n?.type === 'room_door' ? 'door' : n?.buildingId ? 'route' : 'outdoor', n?.buildingId ?? null, n?.floor ?? null)
    get().graph.updateNode(id, partial)
    set({ renderVersion: get().renderVersion + 1 })
  },

  addEdge: (edge) => {
    const scope = edgeScope(get().graph, edge)
    get().recordAuthoredMutation(scope.buildingId ? 'route' : 'outdoor', scope.buildingId, scope.floor)
    get().graph.addEdge(edge)
    set({ renderVersion: get().renderVersion + 1 })
  },

  removeEdge: (id) => {
    const edge = get().graph.edges.find((x) => x.id === id)
    const scope = edgeScope(get().graph, edge)
    get().recordAuthoredMutation(scope.buildingId ? 'route' : 'outdoor', scope.buildingId, scope.floor)
    get().graph.removeEdge(id)
    set({ renderVersion: get().renderVersion + 1 })
  },

  updateEdge: (id, partial) => {
    const edge = get().graph.edges.find((x) => x.id === id)
    const scope = edgeScope(get().graph, edge)
    get().recordAuthoredMutation(scope.buildingId ? 'route' : 'outdoor', scope.buildingId, scope.floor)
    get().graph.updateEdge(id, partial)
    set({ renderVersion: get().renderVersion + 1 })
  },

  addBuilding: (building) => {
    get().recordAuthoredMutation('building', building.id, null)
    get().graph.addBuilding(building)
    set({ renderVersion: get().renderVersion + 1 })
  },

  updateBuilding: (id, partial) => {
    get().recordAuthoredMutation('building', id, null)
    get().graph.updateBuilding(id, partial)
    set({ renderVersion: get().renderVersion + 1 })
  },

  removeBuilding: (id) => {
    get().recordAuthoredMutation('building', id, null)
    get().graph.removeBuilding(id)
    set({ renderVersion: get().renderVersion + 1 })
  },

  setNodes: (nodes) => {
    // Hydration boundary — NOT an authored mutation (P0.11 §7).
    get().graph.setNodes(nodes)
    set({ renderVersion: get().renderVersion + 1 })
  },

  setEdges: (edges) => {
    // Hydration boundary — NOT an authored mutation (P0.11 §7).
    get().graph.setEdges(edges)
    set({ renderVersion: get().renderVersion + 1 })
  },

  setBuildings: (buildings) => {
    // Hydration boundary — NOT an authored mutation (P0.11 §7).
    get().graph.setBuildings(buildings)
    set({ renderVersion: get().renderVersion + 1 })
  },

  addComponent: (component) => {
    const c = component as Component & { buildingId?: string | null; floor?: number | null }
    get().recordAuthoredMutation('floor', c.buildingId ?? null, c.floor ?? null)
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
    const c = get().graph.getComponent(id) as (Component & { buildingId?: string | null; floor?: number | null }) | undefined
    get().recordAuthoredMutation('floor', c?.buildingId ?? null, c?.floor ?? null)
    get().graph.updateComponent(id, partial)
    set({ renderVersion: get().renderVersion + 1 })
  },

  removeComponent: (id) => {
    const graph = get().graph
    const component = graph.getComponent(id) as (Component & { buildingId?: string | null; floor?: number | null }) | undefined
    get().recordAuthoredMutation('floor', component?.buildingId ?? null, component?.floor ?? null)
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
    const t = trace as { buildingId?: string | null; floor?: number | null }
    get().recordAuthoredMutation(t.buildingId ? 'route' : 'outdoor', t.buildingId ?? null, t.floor ?? null)
    const roomNodes = get().graph.nodes.filter(n => n.type === 'room_door' || n.type === 'room')
    get().graph.addTraceWithCompile(trace, roomNodes)
    set({ renderVersion: get().renderVersion + 1 })
  },

  updateTrace: (id, partial) => {
    const t = (get().graph.traces ?? []).find((x) => x.id === id) as { buildingId?: string | null; floor?: number | null } | undefined
    get().recordAuthoredMutation(t?.buildingId ? 'route' : 'outdoor', t?.buildingId ?? null, t?.floor ?? null)
    get().graph.updateTrace(id, partial)
    set({ renderVersion: get().renderVersion + 1 })
  },

  removeTrace: (id) => {
    const t = (get().graph.traces ?? []).find((x) => x.id === id) as { buildingId?: string | null; floor?: number | null } | undefined
    get().recordAuthoredMutation(t?.buildingId ? 'route' : 'outdoor', t?.buildingId ?? null, t?.floor ?? null)
    get().graph.removeTrace(id)
    set({ renderVersion: get().renderVersion + 1 })
  },

  recompileTrace: (id: string) => {
    const t = (get().graph.traces ?? []).find((x) => x.id === id) as { buildingId?: string | null; floor?: number | null } | undefined
    get().recordAuthoredMutation(t?.buildingId ? 'route' : 'outdoor', t?.buildingId ?? null, t?.floor ?? null)
    get().graph.recompileTrace(id)
    set({ renderVersion: get().renderVersion + 1 })
  },

  addComponentWithPolygon: (component: Component) => get().addComponent(component),

  rotateBuilding: (buildingId: string, angleRad: number) => {
    const graph = get().graph
    const building = graph.buildings.find((b) => b.id === buildingId)
    if (!building || !building.footprint || building.footprint.length === 0) return
    get().recordAuthoredMutation('building', buildingId, null)

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
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        const mapId = parsed.campusId || parsed.authoredDocument?.metadata?.campusId
        if (typeof mapId === 'string' && mapId) {
          if (!localStorage.getItem(storageKey(mapId))) localStorage.setItem(storageKey(mapId), raw)
          get().loadMapData(mapId)
          return
        }
      }
      await get().fetchFromSupabase()
    } catch (error) {
      set({ syncStatus: 'error', syncError: `Unable to read browser recovery: ${error instanceof Error ? error.message : 'invalid cache'}` })
    }
  },

  loadMapData: (mapId: string) => {
    if (typeof window === 'undefined') return
    // Preserve the current campus before retiring its debounce callbacks.
    if (hasUnsyncedWork(get())) get().persistRecovery()
    // P0.12: a campus load begins — the acknowledged baseline is unknown until
    // the load settles, so it must not authorize or block saves meanwhile.
    lastAcknowledgedCollections = null
    authoredIntentSeq = 0
    intentGeneration = newMutationId()
    // P0.14: not ready while an authoritative campus load is in flight.
    bumpCampusEpoch(mapId)
    get().beginCampusHydration()
    const key = storageKey(mapId)
    let raw: string | null = null
    try { raw = localStorage.getItem(key) } catch { /* server read still proceeds */ }
    // If only the immutable pending record survived, it is still recoverable.
    if (!raw) {
      try { raw = readGraphSaveOutbox(mapId)?.body ?? null }
      catch (error) { set({ syncStatus: 'error', syncError: error instanceof Error ? error.message : 'Pending recovery is unreadable.' }); return }
    }
    let graph = new Graph()
    let authoredDocument: CampusDocument | null = null
    if (raw) {
      try {
        const snapshot = JSON.parse(raw)
        const persisted = parseAuthoredGraphPayload(snapshot)
        graph = Graph.fromJSON(persisted.graphPayload as GraphSnapshot)
        authoredDocument = persisted.authoredDocument
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[graph-store] Failed to parse map data from localStorage:', e)
        }
        // A malformed authored companion must not make the legacy Graph
        // unreadable. Keep the established compatibility path, but do not
        // manufacture authored state from it.
        try {
          graph = Graph.fromJSON(JSON.parse(raw))
        } catch {
          graph = new Graph()
        }
      }
    }
    // Ensure graph identity matches the map being loaded
    graph.campusId = mapId

    // CASE A — No local graph or empty: fetch from Supabase
    if (!raw) {
      set({ graph, authoredDocument, currentMapId: null, pendingAuthoredMutations: [], syncStatus: 'checking', syncError: null })
      void get().fetchFromSupabase(mapId)
      return
    }

    // Clean cache is only a fallback: ordinary startup waits for the server.
    let locallySynced = false
    try {
      const marker = readSyncMarker(mapId)
      locallySynced = marker?.formatVersion === SNAPSHOT_IDENTITY_VERSION && marker.snapshotFingerprint === fullSnapshotFingerprint(JSON.parse(raw))
    } catch { /* ambiguous content is recovery, never authority */ }
    if (locallySynced) {
      const loadingGraph = new Graph(); loadingGraph.campusId = mapId
      set({ graph: loadingGraph, authoredDocument: null, currentMapId: null, pendingAuthoredMutations: [], syncStatus: 'checking', syncError: null })
      void get().fetchFromSupabase(mapId)
    } else {
      set({ graph, authoredDocument, currentMapId: mapId, pendingAuthoredMutations: [], syncStatus: 'idle', syncError: 'Unverified browser recovery. Checking the server before saving.' })
      void checkServerFreshness(mapId)
    }

  },

  setCurrentMapId: (mapId: string | null) => {
    const graph = get().graph
    if (mapId) graph.campusId = mapId
    if (mapId !== get().currentMapId) {
      const previous = get().currentMapId
      if (previous) bumpCampusEpoch(previous)
      if (mapId) bumpCampusEpoch(mapId)
      // P0.12 campus isolation: per-campus authored intents and the
      // acknowledged baseline must never carry across campuses.
      lastAcknowledgedCollections = null
      authoredIntentSeq = 0
      intentGeneration = newMutationId()
      set({ currentMapId: mapId, authoredDocument: null, pendingAuthoredMutations: [], campusReady: false })
    } else {
      set({ currentMapId: mapId })
    }
  },

  save: async (options?: { trigger?: SaveTrigger }) => {
    if (typeof window === 'undefined') return
    const mapId = get().currentMapId
    if (mapId && adoptingCampuses.has(mapId)) throw new Error('Save paused while the server version is being adopted.')
    // Keep graph identity in sync with the active map
    if (mapId) get().graph.campusId = mapId
    get().persistRecovery()
    await get().syncToSupabase({ trigger: options?.trigger })
  },

  persistRecovery: () => {
    if (typeof window === 'undefined') return
    const state = get()
    const key = state.currentMapId ? storageKey(state.currentMapId) : STORAGE_KEY
    try {
      const previousRaw = localStorage.getItem(key)
      if (previousRaw && parseAuthoredGraphPayload(JSON.parse(previousRaw)).authoredDocument && !state.authoredDocument) {
        throw new Error('The local authored document cannot be cleared by a Graph-only save.')
      }
      const persisted = serializeAuthoredGraphPayload(state.graph.toJSON() as unknown as Record<string, unknown>, state.authoredDocument)
      localStorage.setItem(key, JSON.stringify(persisted))
    } catch (error) {
      const message = `Recovery checkpoint failed: ${error instanceof Error ? error.message : 'storage write failed'}. Edits remain in memory.`
      set({ syncStatus: 'error', syncError: message })
      throw new Error(message)
    }
  },

  reset: () => {
    if (typeof window === 'undefined') return
    const mapId = get().currentMapId
    const key = mapId ? storageKey(mapId) : STORAGE_KEY
    localStorage.removeItem(key)
    set({ graph: new Graph(), authoredDocument: null, currentMapId: null, syncStatus: 'idle', syncError: null })
  },

  syncToSupabase: async (options?: { force?: boolean; trigger?: SaveTrigger }) => {
    if (typeof window === 'undefined') return
    if (options?.force) throw new Error('Ordinary saves cannot force overwrite. Use the explicit administrator recovery action.')
    const unresolvedConflict = get().syncStatus === 'conflict' ? get().syncError : null
    if (unresolvedConflict) {
      // Never overwrite a divergent server snapshot from an autosave. The user
      // must resolve explicitly via reSync({ force: true }) or adoptServerSnapshot().
      console.warn('[graph-store] syncToSupabase blocked while a server conflict is unresolved:', unresolvedConflict)
      throw new Error(unresolvedConflict)
    }
    const mapId = get().currentMapId
    if (mapId && adoptingCampuses.has(mapId)) throw new Error('Sync paused while the server version is being adopted.')
    if (!mapId) {
      const message = 'Cannot sync without an active map'
      set({ syncStatus: 'error', syncError: message })
      throw new Error(message)
    }
    // Per-campus queue: overlapping autosave/visibility/manual writes must not
    // race each other with the same expectedServerUpdatedAt.
    await enqueueCampusSave(mapId, options?.force === true, options?.trigger ?? 'manual')
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
    if (adoptingCampuses.has(mapId)) throw new Error('Re-sync paused while the server version is being adopted.')

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
        if (!localSnapshot || fullSnapshotFingerprint(localSnapshot) !== fullSnapshotFingerprint(data)) {
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

    // Use the active document; reloading a cache here would rewind newer commands.
    if (options?.force) {
      const current = get()
      const previousRaw = localStorage.getItem(storageKey(mapId))
      if (previousRaw && parseAuthoredGraphPayload(JSON.parse(previousRaw)).authoredDocument && !current.authoredDocument) {
        throw new Error('Administrator recovery cannot clear a modern authored document.')
      }
      localStorage.setItem(storageKey(mapId), JSON.stringify(serializeAuthoredGraphPayload(
        current.graph.toJSON() as unknown as Record<string, unknown>, current.authoredDocument,
      )))
      await enqueueCampusSave(mapId, true, 'manual')
    } else await get().save()

  },

  /**
   * Resolve a local/server conflict in favour of the server snapshot.
   * The unsynced local copy is replaced only after the user confirms. Do not
   * duplicate large snapshots in localStorage: quota pressure can block the
   * authoritative replacement itself.
   */
  adoptServerSnapshot: async () => {
    if (typeof window === 'undefined') return
    const mapId = get().currentMapId
    if (!mapId) return
    if (adoptingCampuses.has(mapId)) throw new Error('Server adoption is already in progress.')
    adoptingCampuses.add(mapId)
    bumpCampusEpoch(mapId)
    try {
      // Stop queued local snapshots and let any already-running request settle
      // before fetching the revision to adopt. This prevents an older POST from
      // racing the authoritative GET.
      invalidateQueuedCampusSaves(mapId, 'Superseded by authoritative server adoption')
      await waitForCampusSavesToSettle(mapId)
      if (get().currentMapId !== mapId) throw new Error('Server adoption cancelled because Studio navigated to another campus.')

      const data = await fetchServerSnapshot(mapId)
      if (!data || isServerSnapshotEmpty(data)) {
        throw new Error('Unable to load the server version. Check your connection and try again.')
      }
      if (get().currentMapId !== mapId) throw new Error('Server adoption cancelled because Studio navigated to another campus.')
      adoptServerSnapshotData(mapId, data)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to adopt the server version.'
      if (get().currentMapId === mapId) set({ syncStatus: 'conflict', syncError: message })
      throw error
    } finally {
      adoptingCampuses.delete(mapId)
    }
  },

  syncLocalChanges: async () => {
    if (typeof window === 'undefined') return
    const mapId = get().currentMapId
    if (!mapId) return
    if (get().syncStatus !== 'conflict') return

    const marker = readSyncMarker(mapId)
    const acknowledged = marker?.formatVersion === SNAPSHOT_IDENTITY_VERSION ? marker.snapshotFingerprint ?? null : null
    const data = await fetchServerSnapshot(mapId)
    if (!data) {
      const message = 'Could not reach the server. Your local work is preserved; try again.'
      set({ syncStatus: 'error', syncError: message })
      throw new Error(message)
    }

    // Genuine divergence (CASE C): the server moved beyond the acknowledged
    // base. Never overwrite; keep the local work and the conflict state.
    if (acknowledged === null || fullSnapshotFingerprint(data) !== acknowledged) {
      const message = 'Server and local changes differ. Your local work is preserved.'
      set({ syncStatus: 'conflict', syncError: message })
      throw new Error(message)
    }

    // Server is still at the acknowledged base (CASE B): retry the preserved
    // local work through the normal guarded save queue with the latest
    // expected revision. Clear conflict only after an authoritative ack.
    set({ syncStatus: 'idle', syncError: null })
    try {
      await enqueueCampusSave(mapId, false, 'manual')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed'
      set({ syncStatus: 'conflict', syncError: message })
      throw error
    }
  },

  fetchFromSupabase: async (mapId?: string) => {
    if (typeof window === 'undefined') return
    const effectiveMapId = mapId || get().currentMapId
    if (effectiveMapId && effectiveMapId === get().currentMapId && hasUnsyncedWork(get())) {
      get().persistRecovery()
      await checkServerFreshness(effectiveMapId)
      return
    }
    const initialFingerprint = workingFingerprint(get())
    const initialIntentSeq = get().pendingAuthoredMutations.map(i => i.seq).join(',')
    const requestSequence = ++serverLoadSequence
    const startingCampus = get().currentMapId
    const readinessAtStart = get().campusReady
    const startingEpoch = effectiveMapId ? getCampusEpoch(effectiveMapId) : 0
    const isCurrentLoad = () => requestSequence === serverLoadSequence && get().currentMapId === startingCampus && (!effectiveMapId || getCampusEpoch(effectiveMapId) === startingEpoch)
    // P0.12: baseline unknown while an authoritative fetch is in flight.
    if (startingCampus !== effectiveMapId) {
      lastAcknowledgedCollections = null
      authoredIntentSeq = 0
      intentGeneration = newMutationId()
    }
    // P0.14: not ready until the fetched graph is reconciled by the editor.
    get().beginCampusHydration()
    set({ syncStatus: 'checking', syncError: null })
    try {
      const url = effectiveMapId ? `/api/graph?campus_id=${encodeURIComponent(effectiveMapId)}` : `/api/graph`
      const res = await fetchGraphJson(url, { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = res.data as unknown as PersistedGraphSnapshot
      if (!isCurrentLoad()) return
      if (workingFingerprint(get()) !== initialFingerprint || get().pendingAuthoredMutations.map(i => i.seq).join(',') !== initialIntentSeq) {
        get().persistRecovery()
        set({ campusReady: readinessAtStart, syncStatus: 'conflict', syncError: 'Local work changed during the server read. Both versions are preserved; resolve before saving.' })
        return
      }
      const authoredDocument = parseAuthoredGraphPayload(data).authoredDocument
      if (!data || !data.nodes) {
        // F3: metadata-only or legacy rows carry an authoritative revision but
        // no graph arrays. Record that revision and mount an empty graph so the
        // editor can open and adopt the row on its first save.
        if (effectiveMapId && data?.updatedAt) {
          writeSyncMarker(effectiveMapId, fullSnapshotFingerprint(data), data.updatedAt, data.updatedAt)
        }
        const emptyGraph = new Graph()
        if (effectiveMapId) emptyGraph.campusId = effectiveMapId
        if (effectiveMapId) {
          bumpCampusEpoch(effectiveMapId)
          invalidateQueuedCampusSaves(effectiveMapId, 'Superseded by authoritative server load')
        }
        set({ graph: emptyGraph, authoredDocument, pendingAuthoredMutations: [], currentMapId: effectiveMapId ?? null, syncStatus: 'idle', serverAdoptionVersion: get().serverAdoptionVersion + 1 })
        return
      }
      const graph = Graph.fromJSON({ ...data, buildings: data.buildings ?? [], nodes: data.nodes ?? [], edges: data.edges ?? [] })
      if (effectiveMapId && data.updatedAt) {
        adoptServerSnapshotData(effectiveMapId, data)
        return
      }
      // Keep graph identity in sync with the map we loaded
      if (effectiveMapId) graph.campusId = effectiveMapId
      // Record server freshness for future load comparisons. Only real server
      // timestamps may enter the marker.
      if (effectiveMapId && data.updatedAt) {
        writeSyncMarker(effectiveMapId, fullSnapshotFingerprint(data), data.updatedAt, data.updatedAt)
      }
      lastAcknowledgedCollections = collectionsOf(data)
      // A fresh authoritative load replaces any retained local edits: discard
      // their intents and queued saves so they cannot resurrect after load.
      if (effectiveMapId) {
        authoredIntentSeq = 0
        intentGeneration = newMutationId()
        bumpCampusEpoch(effectiveMapId)
        invalidateQueuedCampusSaves(effectiveMapId, 'Superseded by authoritative server load')
      }
      useGraphStore.setState({ pendingAuthoredMutations: [] })
      set({ graph, authoredDocument, currentMapId: effectiveMapId, syncStatus: data.updatedAt ? 'synced' : 'idle', serverAdoptionVersion: get().serverAdoptionVersion + 1 })
    } catch (e) {
      if (!isCurrentLoad()) return
      console.warn('[graph-store] fetchFromSupabase failed:', e)
      if (workingFingerprint(get()) !== initialFingerprint || get().pendingAuthoredMutations.map(i => i.seq).join(',') !== initialIntentSeq) {
        // Even a failed late read must not restore an older cached document.
        try { get().persistRecovery() } catch { /* the checkpoint surfaced its error */ }
        set({ campusReady: readinessAtStart, syncStatus: 'error', syncError: 'Server read failed. Newer working edits remain preserved; retry when connected.' })
        return
      }
      // Read failure may expose a cached snapshot, but never certify it saved.
      let recovery: Partial<GraphState> = {}
      try {
        const raw = effectiveMapId ? localStorage.getItem(storageKey(effectiveMapId)) : null
        if (raw) {
          const parsed = parseAuthoredGraphPayload(JSON.parse(raw))
          const graph = Graph.fromJSON(parsed.graphPayload as GraphSnapshot)
          graph.campusId = effectiveMapId!
          recovery = { graph, authoredDocument: parsed.authoredDocument, currentMapId: effectiveMapId }
        }
      } catch { /* preserve unreadable cache bytes and current memory */ }
      set({ ...recovery, syncStatus: 'error', syncError: 'Offline or server unavailable. Browser recovery is unverified; edits remain preserved.' })
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

/** P0.11 — explicit save trigger (manual vs autosave) — never inferred from timing. */
export type SaveTrigger = 'autosave' | 'manual'

interface CampusSaveQueue {
  running: boolean
  hasPending: boolean
  pendingForce: boolean
  pendingTrigger: SaveTrigger
  waiters: Array<{ resolve: () => void; reject: (reason: unknown) => void }>
  idleWaiters: Array<() => void>
}

const campusSaveQueues = new Map<string, CampusSaveQueue>()

/** Test-only: clears queued/running save state between test cases. */
export function __resetGraphSaveQueuesForTests(): void {
  campusSaveQueues.clear()
  // P0.12: module-level safety state must not leak across test cases (the
  // acknowledged baseline and authored sequence are per-campus runtime state).
  lastAcknowledgedCollections = null
  authoredIntentSeq = 0
  intentGeneration = newMutationId()
  campusEpoch.clear()
  adoptingCampuses.clear()
  // P0.14: fixtures start from a fully hydrated campus; tests that exercise the
  // load lifecycle call beginCampusHydration()/completeCampusHydration() explicitly.
  useGraphStore.setState({ pendingAuthoredMutations: [], campusReady: true })
}

function getCampusSaveQueue(mapId: string): CampusSaveQueue {
  let queue = campusSaveQueues.get(mapId)
  if (!queue) {
    queue = { running: false, hasPending: false, pendingForce: false, pendingTrigger: 'manual', waiters: [], idleWaiters: [] }
    campusSaveQueues.set(mapId, queue)
  }
  return queue
}

function waitForCampusSavesToSettle(mapId: string): Promise<void> {
  const queue = campusSaveQueues.get(mapId)
  if (!queue?.running) return Promise.resolve()
  return new Promise<void>((resolve) => queue.idleWaiters.push(resolve))
}

function resolveCampusQueueIdle(queue: CampusSaveQueue): void {
  const waiters = queue.idleWaiters.splice(0)
  for (const resolve of waiters) resolve()
}

function enqueueCampusSave(mapId: string, force: boolean, trigger: SaveTrigger = 'manual'): Promise<void> {
  const queue = getCampusSaveQueue(mapId)

  if (queue.running) {
    queue.hasPending = true
    queue.pendingForce = queue.pendingForce || force
    // A pending manual request must not be downgraded to autosave semantics.
    queue.pendingTrigger = queue.pendingTrigger === 'manual' || trigger === 'manual' ? 'manual' : 'autosave'
    return new Promise<void>((resolve, reject) => {
      queue.waiters.push({ resolve, reject })
    })
  }

  queue.running = true
  const firstRun = performSyncToSupabase(mapId, force, trigger)
  // Drain after the first run settles. `firstRun` is also the first caller's
  // result, so its outcome is not coupled to later queued writes.
  void firstRun.then(
    () => {
      void drainCampusSaveQueue(mapId, queue)
    },
    (error: unknown) => {
      rejectQueuedSaves(queue, error)
      queue.running = false
      resolveCampusQueueIdle(queue)
    },
  )
  return firstRun
}

async function drainCampusSaveQueue(mapId: string, queue: CampusSaveQueue): Promise<void> {
  while (queue.hasPending) {
    const force = queue.pendingForce
    const trigger = queue.pendingTrigger
    const waiters = queue.waiters.splice(0)
    queue.hasPending = false
    queue.pendingForce = false
    queue.pendingTrigger = 'manual'
    try {
      await performSyncToSupabase(mapId, force, trigger)
      for (const waiter of waiters) waiter.resolve()
    } catch (error) {
      rejectQueuedSaves(queue, error, waiters)
      break
    }
  }
  queue.running = false
  resolveCampusQueueIdle(queue)
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

async function performSyncToSupabase(mapId: string, force: boolean, trigger: SaveTrigger = 'manual'): Promise<void> {
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

  // ── P0.11 save contract (trigger + authored intent + readiness) ──────────
  const preState = useGraphStore.getState()
  if (!preState.campusReady) {
    // Never write a partially hydrated candidate — manual save included.
    console.warn(`[graph-store] save refused: campus not ready (trigger=${trigger})`)
    return
  }
  // Direct sync/reconnect uses the same synchronous recovery contract as save.
  preState.persistRecovery()
  const candidateSnapshot = preState.graph.toJSON()
  const candidateHash = fullSnapshotFingerprint(serializeAuthoredGraphPayload(candidateSnapshot as unknown as Record<string, unknown>, preState.authoredDocument))
  const acknowledgedFingerprint = readSyncMarker(mapId)?.snapshotFingerprint ?? null
  let existing: PendingGraphSave | null
  try { existing = readGraphSaveOutbox(mapId) }
  catch (error) {
    useGraphStore.setState({ syncStatus: 'error', syncError: error instanceof Error ? error.message : 'Unable to read pending save.' })
    throw error
  }
  const pending = preState.pendingAuthoredMutations
  const candidateUnchanged = acknowledgedFingerprint !== null && acknowledgedFingerprint === candidateHash
  let includedUpTo = 0

  if (!existing && trigger === 'autosave' && pending.length === 0) {
    // CASE A: nothing authored to persist — no POST.
    return
  }

  if (existing) {
    // This immutable candidate already passed the guard before its first POST.
  } else if (pending.length === 0) {
    // CASE D/E: clean manual save = explicit revision refresh (POST).
    // CASE E: a changed candidate with no authored intent is an unattributed
    // persistent mutation and fails closed — but only once this session has an
    // acknowledged baseline AND has performed at least one authored edit.
    // Hydration-only sessions (fixtures, programmatic document writes) keep the
    // legacy save behavior; their state never claims authored authority.
    if (!candidateUnchanged && lastAcknowledgedCollections !== null && authoredIntentSeq > 0) {
      const message = 'Unattributed persistent graph mutation blocked during manual save'
      console.warn(`[graph-store] ${message}`)
      useGraphStore.setState({ syncStatus: 'error', syncError: message })
      return
    }
  } else {
    // CASE B/C: evaluate every pending intent against the last acknowledged
    // canonical baseline before any network write.
    includedUpTo = Math.max(...pending.map((p) => p.seq))
    if (lastAcknowledgedCollections) {
      const verdict = evaluateAuthoredSave(lastAcknowledgedCollections, collectionsOf(candidateSnapshot), pending)
      if (!verdict.allowed) {
        console.warn(`[graph-store] save blocked by safety guard: ${verdict.reason}`)
        useGraphStore.setState({ syncStatus: 'error', syncError: verdict.reason })
        return
      }
    }
  }

  useGraphStore.setState({ syncStatus: 'syncing', syncError: null })
  const snapshot = preState.graph.toJSON()
  const payload = serializeSnapshot(snapshot as unknown as GraphSnapshotLike, mapId, preState.authoredDocument)
  const marker = readSyncMarker(mapId)
  let expectedServerUpdatedAt = marker?.formatVersion === SNAPSHOT_IDENTITY_VERSION ? marker.serverTimestamp ?? null : null
  const epochAtStart = getCampusEpoch(mapId)
  const stillCurrent = () => getCampusEpoch(mapId) === epochAtStart && useGraphStore.getState().currentMapId === mapId && !adoptingCampuses.has(mapId)
  if (force) {
    const recoveryBase = await fetchServerSnapshot(mapId)
    if (!stillCurrent()) return
    if (!recoveryBase?.updatedAt) {
      const message = 'Administrator recovery requires a verified current server revision.'
      useGraphStore.setState({ syncStatus: 'error', syncError: message })
      throw new Error(message)
    }
    expectedServerUpdatedAt = recoveryBase.updatedAt
    // An explicit recovery choice replaces an ordinary failed candidate.
    if (existing && !existing.recovery) { clearGraphSaveOutbox(mapId); existing = null }
  }
  const mutationId = existing?.mutationId ?? newMutationId()
  const body = existing?.body ?? JSON.stringify({ ...payload, expectedServerUpdatedAt, mutationId,
    ...(force ? { recoveryPurpose: 'Explicit Studio conflict recovery' } : {}) })
  const snapshotHash = existing?.contentFingerprint ?? fullSnapshotFingerprint(payload)
  const entry: PendingGraphSave = existing ?? { version: 1, campusId: mapId, mutationId, body,
    expectedServerUpdatedAt, contentFingerprint: snapshotHash, includedUpTo, intentGeneration, recovery: force }
  const resumedOlderContent = Boolean(existing && existing.contentFingerprint !== candidateHash)
  try { writeGraphSaveOutbox(entry) }
  catch (error) {
    const message = `Pending save recovery could not be recorded: ${error instanceof Error ? error.message : 'storage unavailable'}. Edits remain preserved.`
    useGraphStore.setState({ syncStatus: 'error', syncError: message })
    throw new Error(message)
  }
  for (let attempt = 0; ; attempt++) {
    if (!stillCurrent()) return
    try {
      const res = await fetchGraphJson(entry.recovery ? '/api/graph/recovery' : '/api/graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body,
      })
      if (!res.ok) {
        const msg = res.status === 401 || res.status === 403
          ? 'Your session expired or lacks permission. Sign in again; pending work is preserved.'
          : String(res.data.error ?? `HTTP ${res.status}`)
        throw new GraphRequestError(msg, res.status)
      }
      const serverResult = res.data as SaveAcknowledgment
      if (!stillCurrent()) return
      const acknowledgedRevision = await resolveAcknowledgedRevision(mapId, serverResult, mutationId, snapshotHash)
      if (!stillCurrent()) {
        // The authoritative base was replaced while this save was in flight;
        // its acknowledgement must not be stamped onto the new base.
        console.warn('[graph-store] save superseded by authoritative adoption — ack discarded')
        return
      }
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
      if (!writeSyncMarker(mapId, snapshotHash, new Date().toISOString(), acknowledgedRevision)) throw new Error('Unable to record the authoritative save acknowledgment locally.')
      // P0.11: the acknowledged snapshot is the new canonical guard baseline;
      // clear ONLY the intents included in this save (newer edits stay pending).
      clearGraphSaveOutbox(mapId, mutationId)
      lastAcknowledgedCollections = collectionsOf(JSON.parse(body))
      includedUpTo = entry.intentGeneration === intentGeneration ? entry.includedUpTo : 0
      lastAcknowledgedSeq = Math.max(lastAcknowledgedSeq, includedUpTo)
      if (includedUpTo > 0) useGraphStore.getState().clearAuthoredMutations(includedUpTo)
      const current = useGraphStore.getState()
      const currentHash = fullSnapshotFingerprint(serializeAuthoredGraphPayload(current.graph.toJSON() as unknown as Record<string, unknown>, current.authoredDocument))
      useGraphStore.setState({ syncStatus: currentHash === snapshotHash && current.pendingAuthoredMutations.length === 0 ? 'synced' : 'idle', syncError: null })
      // A later candidate owns its own retry budget and error classification.
      if (resumedOlderContent && currentHash !== snapshotHash) return performSyncToSupabase(mapId, false, 'manual')
      return
    } catch (e) {
      if (!stillCurrent()) return
      const msg = e instanceof Error ? e.message : 'Sync failed'
      if ((isNetworkError(msg) || (e instanceof GraphRequestError && e.status >= 500)) && attempt < SYNC_RETRY_DELAYS.length) {
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
      } else if (!/mutation[_ ]?id[_ ]collision/i.test(msg) && ((e instanceof GraphRequestError && e.status === 409) || /server changed|snapshot conflict/i.test(msg))) {
        useGraphStore.setState({ syncStatus: 'conflict', syncError: msg })
        throw new Error(msg)
      } else if (/mutation[_ ]?id[_ ]collision/i.test(msg)) {
        // Same mutation id reused with different content: never silently treat as a retry.
        console.error('[graph-store] syncToSupabase mutation id collision:', msg)
        useGraphStore.setState({ syncStatus: 'error', syncError: msg })
        throw new Error(msg)
      } else {
        console.error('[graph-store] syncToSupabase failed:', msg)
        useGraphStore.setState({ syncStatus: 'error', syncError: msg })
        throw new Error(msg)
      }
    }
  }
}

interface SaveAcknowledgment {
  updatedAt?: unknown
  campusId?: unknown
  mutationId?: unknown
  committedRevision?: unknown
  committedContentFingerprint?: unknown
}

async function resolveAcknowledgedRevision(
  mapId: string,
  ack: SaveAcknowledgment,
  mutationId: string,
  intendedFingerprint: string,
): Promise<string | null> {
  const modern = ['campusId', 'mutationId', 'committedRevision', 'committedContentFingerprint'].some(key => key in ack)
  if (modern) {
    if (ack.campusId !== mapId || ack.mutationId !== mutationId ||
        typeof ack.committedRevision !== 'string' || !ack.committedRevision ||
        ack.committedContentFingerprint !== intendedFingerprint ||
        (ack.updatedAt !== undefined && ack.updatedAt !== ack.committedRevision)) {
      throw new Error('Server acknowledgment does not confirm the intended campus, mutation and complete content.')
    }
    return ack.committedRevision
  }
  // Compatibility readback must prove the complete intended content. A GET
  // timestamp by itself never certifies a save, nor a newer unrelated revision.
  const data = await fetchServerSnapshot(mapId)
  if (!data?.updatedAt || data.campusId !== mapId || fullSnapshotFingerprint(data) !== intendedFingerprint) return null
  if (ack.updatedAt !== undefined && ack.updatedAt !== null && ack.updatedAt !== data.updatedAt) return null
  return data.updatedAt
}
