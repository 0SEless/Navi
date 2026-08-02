'use client'

import { create } from 'zustand'
import type {
  Building,
  BuildingEntrance,
  NavNode,
  NavEdge,
  Component,
  LatLng,
  PathResult,
  SearchEntry,
  CampusBundle,
} from '@/types/nav-types'
import { aStar, haversine } from '@/engine/a-star'

export type { CampusBundle, SearchEntry } from '@/types/nav-types'

export type TabId = 'home' | 'explore' | 'navigate' | 'maps' | 'profile'

export type SheetState = 'collapsed' | 'half' | 'full' | 'hidden'
export type MapMode = 'explore' | 'navigate'
export type CampusSource = 'supabase' | 'demo' | 'empty'

/** Payload from GET /api/public-campus — a partial GraphSnapshot. */
export interface CampusData {
  campusId: string
  source: CampusSource
  buildings: Building[]
  components: Component[]
  nodes: NavNode[]
  edges: NavEdge[]
  boundary?: { points: LatLng[] } | null
}

export type CampusStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface PublicState {
  activeTab: TabId
  sheetState: SheetState
  mapMode: MapMode
  fromNode: string | null
  toNode: string | null
  selectedBuilding: Building | null
  selectedNode: NavNode | null

  campusData: CampusData | null
  campusStatus: CampusStatus
  campusError: string | null
  activeFloor: number

  /** Parsed, validated public data bundle (from /api/campus-maps or demo artifacts). */
  campus: CampusBundle | null
  campusLoading: boolean

  recentDestinations: string[]    // node IDs, max 8
  recentSearches: string[]        // query strings, max 8
  onboardingComplete: boolean

  setTab: (tab: TabId) => void
  setSheet: (state: SheetState) => void
  setMapMode: (mode: MapMode) => void
  setFrom: (nodeId: string | null) => void
  setTo: (nodeId: string | null) => void
  selectBuilding: (b: Building | null) => void
  selectNode: (n: NavNode | null) => void
  setActiveFloor: (floor: number) => void
  fetchCampusData: (campusId?: string) => Promise<void>
  search: (query: string) => SearchEntry[]
  findRoute: (fromId: string, toId: string) => PathResult | null
  nearestNode: (latlng: LatLng, maxDistanceMeters?: number) => NavNode | null
  addRecentDestination: (nodeId: string) => void
  addRecentSearch: (query: string) => void
  completeOnboarding: () => void
  resetOnboarding: () => void
}

const RECENT_DEST_KEY = 'navi-recent-destinations'
const RECENT_SEARCH_KEY = 'navi-recent-searches'
const ONBOARDING_KEY = 'navi-onboarded'
const MAX_RECENT = 8

const DEFAULT_CAMPUS_ID = 'asu-ibajay'

function loadArray(key: string): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveArray(key: string, arr: string[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(arr))
}

// ---- Pure helpers (exported for tests and for the store actions) ----

export function search(entries: SearchEntry[], query: string, limit = 20): SearchEntry[] {
  const q = query.trim().toLowerCase()
  if (!q || entries.length === 0) return []
  const scored: Array<{ entry: SearchEntry; rank: number }> = []
  for (const entry of entries) {
    const label = (entry.label ?? '').toLowerCase()
    if (label.startsWith(q)) scored.push({ entry, rank: 0 })
    else if (label.includes(q)) scored.push({ entry, rank: 1 })
    else if ((entry.tags ?? []).some((t) => t.toLowerCase().includes(q))) scored.push({ entry, rank: 2 })
  }
  scored.sort((a, b) => a.rank - b.rank)
  return scored.slice(0, limit).map((s) => s.entry)
}

export function findRoute(
  nodes: NavNode[],
  edges: NavEdge[],
  fromId: string,
  toId: string,
): PathResult | null {
  return aStar(nodes, edges, fromId, toId)
}

export function nearestNode(
  nodes: NavNode[],
  latlng: LatLng,
  maxDistanceMeters = 50,
): NavNode | null {
  let best: NavNode | null = null
  let bestDist = Infinity
  for (const node of nodes) {
    const dist = haversine(latlng, node.position)
    if (dist < bestDist) {
      bestDist = dist
      best = node
    }
  }
  return best && bestDist <= maxDistanceMeters ? best : null
}

// ---- Defensive artifact parsing (see errors/ERRORS.md: Array.isArray guards) ----

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function docCampusId(raw: unknown, fallback: string): string {
  return isRecord(raw) && typeof raw.campusId === 'string' && raw.campusId !== ''
    ? raw.campusId
    : fallback
}

const VALID_NODE_TYPES = new Set<NavNode['type']>([
  'room', 'walkway', 'stair', 'elevator', 'entrance', 'qr_marker', 'corner',
  'staircase', 'intersection', 'building_entrance', 'outdoor', 'hallway', 'connector_stop',
])

const NODE_TYPE_MAP: Record<string, NavNode['type']> = {
  space: 'room',
  corridor: 'walkway',
  transition: 'building_entrance',
}

function mapNodeType(raw: unknown): NavNode['type'] {
  if (typeof raw === 'string') {
    if (VALID_NODE_TYPES.has(raw as NavNode['type'])) return raw as NavNode['type']
    const mapped = NODE_TYPE_MAP[raw]
    if (mapped) return mapped
  }
  return 'room'
}

function normalizeNode(raw: unknown, campusId: string): NavNode | null {
  if (!isRecord(raw)) return null
  const { id, label, position, floor, buildingId } = raw
  if (typeof id !== 'string' || id === '') return null
  if (!isRecord(position) || typeof position.lat !== 'number' || typeof position.lng !== 'number') {
    return null
  }
  const node: NavNode = {
    id,
    label: typeof label === 'string' && label !== '' ? label : id,
    position: { lat: position.lat, lng: position.lng },
    floor: typeof floor === 'number' ? floor : 0,
    buildingId: typeof buildingId === 'string' ? buildingId : '',
    campusId,
    type: mapNodeType(raw.type),
  }
  if (typeof raw.name === 'string') node.name = raw.name
  const properties = isRecord(raw.properties) ? raw.properties : undefined
  const metadata = isRecord(raw.metadata) ? raw.metadata : undefined
  if (properties || metadata) node.metadata = { ...(properties ?? {}), ...(metadata ?? {}) }
  return node
}

const VALID_EDGE_TYPES = new Set<NavEdge['type']>([
  'walkway', 'stair', 'elevator', 'hallway', 'outdoor', 'corridor', 'stairs',
  'transition', 'walk', 'wall', 'door',
])

function mapEdgeType(raw: unknown): NavEdge['type'] {
  if (typeof raw === 'string' && VALID_EDGE_TYPES.has(raw as NavEdge['type'])) {
    return raw as NavEdge['type']
  }
  return 'walk'
}

function normalizeEdge(raw: unknown): NavEdge | null {
  if (!isRecord(raw)) return null
  const { id, from, to, distance, weight } = raw
  if (
    typeof id !== 'string' || id === '' ||
    typeof from !== 'string' || from === '' ||
    typeof to !== 'string' || to === ''
  ) {
    return null
  }
  const dist = typeof distance === 'number' && distance >= 0 ? distance : 0
  return {
    id,
    from,
    to,
    distance: dist,
    weight: typeof weight === 'number' && weight >= 0 ? weight : dist,
    type: mapEdgeType(raw.type),
  }
}

function normalizeSearchEntry(raw: unknown): SearchEntry | null {
  if (!isRecord(raw)) return null
  const { id, label, nodeId, position, tags, buildingId, floor, type } = raw
  if (typeof id !== 'string' || id === '' || typeof label !== 'string' || label === '') {
    return null
  }
  const entry: SearchEntry = {
    id,
    label,
    type: type === 'building' ? 'building' : 'room',
    nodeId: typeof nodeId === 'string' ? nodeId : '',
  }
  if (isRecord(position) && typeof position.lat === 'number' && typeof position.lng === 'number') {
    entry.position = { lat: position.lat, lng: position.lng }
  }
  if (Array.isArray(tags)) {
    const strTags = tags.filter((t): t is string => typeof t === 'string')
    if (strTags.length > 0) entry.tags = strTags
  }
  if (typeof buildingId === 'string') entry.buildingId = buildingId
  if (typeof floor === 'number') entry.floor = floor
  return entry
}

function normalizeBuilding(raw: unknown, campusId: string): Building | null {
  if (!isRecord(raw)) return null
  const { id, name, position } = raw
  if (typeof id !== 'string' || id === '' || typeof name !== 'string' || name === '') {
    return null
  }
  const floors: number[] = []
  if (Array.isArray(raw.floors)) {
    for (const f of raw.floors) {
      let level: number
      if (isRecord(f) && typeof f.level === 'number') level = f.level
      else if (typeof f === 'number') level = f
      else continue
      if (Number.isFinite(level) && !floors.includes(level)) floors.push(level)
    }
  }
  const building: Building = {
    id,
    name,
    campusId,
    floors,
    footprint: [],
    baseElevation: 0,
    height: 0,
  }
  if (isRecord(position) && typeof position.lat === 'number' && typeof position.lng === 'number') {
    building.center = { lat: position.lat, lng: position.lng }
  }
  if (typeof raw.code === 'string') building.code = raw.code
  if (typeof raw.category === 'string') building.category = raw.category
  if (typeof raw.baseElevation === 'number') building.baseElevation = raw.baseElevation
  if (typeof raw.height === 'number') building.height = raw.height
  if (Array.isArray(raw.footprint)) {
    const footprint = raw.footprint
      .map((p) =>
        isRecord(p) && typeof p.lat === 'number' && typeof p.lng === 'number'
          ? { lat: p.lat, lng: p.lng }
          : null,
      )
      .filter((p): p is LatLng => p !== null)
    if (footprint.length > 0) building.footprint = footprint
  }
  if (Array.isArray(raw.entrances)) {
    const entrances = raw.entrances
      .map((e): BuildingEntrance | null => {
        if (!isRecord(e) || typeof e.id !== 'string' || e.id === '') return null
        const ep = e.position
        if (!isRecord(ep) || typeof ep.lat !== 'number' || typeof ep.lng !== 'number') return null
        return {
          id: e.id,
          position: { lat: ep.lat, lng: ep.lng },
          floor: typeof e.floor === 'number' ? e.floor : 0,
          label: typeof e.label === 'string' ? e.label : undefined,
        }
      })
      .filter((e): e is BuildingEntrance => e !== null)
    if (entrances.length > 0) building.entrances = entrances
  }
  return building
}

function normalizeBoundingBox(raw: unknown): CampusBundle['boundingBox'] {
  if (isRecord(raw)) {
    const { minLat, maxLat, minLng, maxLng } = raw
    if (
      typeof minLat === 'number' && typeof maxLat === 'number' &&
      typeof minLng === 'number' && typeof maxLng === 'number'
    ) {
      return { minLat, maxLat, minLng, maxLng }
    }
  }
  return null
}

function computeBoundingBox(nodes: NavNode[]): CampusBundle['boundingBox'] {
  if (nodes.length === 0) return null
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const n of nodes) {
    if (n.position.lat < minLat) minLat = n.position.lat
    if (n.position.lat > maxLat) maxLat = n.position.lat
    if (n.position.lng < minLng) minLng = n.position.lng
    if (n.position.lng > maxLng) maxLng = n.position.lng
  }
  return { minLat, maxLat, minLng, maxLng }
}

function parseGraph(raw: unknown, campusId: string): { nodes: NavNode[]; edges: NavEdge[]; boundingBox: CampusBundle['boundingBox'] } | null {
  if (!isRecord(raw) || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null
  const nodes = raw.nodes
    .map((n) => normalizeNode(n, campusId))
    .filter((n): n is NavNode => n !== null)
  const edges = raw.edges
    .map((e) => normalizeEdge(e))
    .filter((e): e is NavEdge => e !== null)
  const boundingBox = normalizeBoundingBox(isRecord(raw.metadata) ? raw.metadata.boundingBox : undefined)
  return { nodes, edges, boundingBox: boundingBox ?? computeBoundingBox(nodes) }
}

function parseSearchEntries(raw: unknown): SearchEntry[] {
  const entries = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.entries)
      ? raw.entries
      : []
  return entries
    .map((e) => normalizeSearchEntry(e))
    .filter((e): e is SearchEntry => e !== null)
}

function parseBuildings(raw: unknown, campusId: string): Building[] {
  if (!isRecord(raw) || !Array.isArray(raw.buildings)) return []
  return raw.buildings
    .map((b) => normalizeBuilding(b, campusId))
    .filter((b): b is Building => b !== null)
}

function parsePoi(raw: unknown): unknown[] {
  if (isRecord(raw) && Array.isArray(raw.points)) return raw.points
  return []
}

async function fetchJson(url: string): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    return null
  }
  if (!res.ok) return null
  try {
    return await res.json()
  } catch {
    return null
  }
}

async function fetchFromCampusMaps(campusId: string): Promise<CampusBundle | null> {
  const doc = await fetchJson(`/api/campus-maps?map_id=${encodeURIComponent(campusId)}`)
  if (!isRecord(doc) || !Array.isArray(doc.nodes) || !Array.isArray(doc.edges)) return null
  const id = docCampusId(doc, campusId)
  const graph = parseGraph(doc, id)
  if (!graph) return null
  return {
    nodes: graph.nodes,
    edges: graph.edges,
    searchEntries: Array.isArray(doc.searchEntries)
      ? parseSearchEntries(doc.searchEntries)
      : parseSearchEntries(doc.search),
    buildings: parseBuildings(doc, id),
    poi: isRecord(doc.poi) ? parsePoi(doc.poi) : (Array.isArray(doc.poi) ? doc.poi : []),
    boundingBox: graph.boundingBox,
  }
}

async function fetchFromDemoArtifacts(): Promise<CampusBundle | null> {
  const [graphJson, searchJson, buildingsJson, poiJson] = await Promise.all([
    fetchJson('/api/demo/artifacts?file=navigation.graph.json'),
    fetchJson('/api/demo/artifacts?file=search.index.json'),
    fetchJson('/api/demo/artifacts?file=building-index.json'),
    fetchJson('/api/demo/artifacts?file=poi.json'),
  ])
  const campusId = docCampusId(graphJson, DEFAULT_CAMPUS_ID)
  const graph = parseGraph(graphJson, campusId)
  const searchEntries = parseSearchEntries(searchJson)
  const buildings = parseBuildings(buildingsJson, campusId)
  const poi = parsePoi(poiJson)
  if (!graph && searchEntries.length === 0 && buildings.length === 0 && poi.length === 0) {
    return null
  }
  return {
    nodes: graph?.nodes ?? [],
    edges: graph?.edges ?? [],
    searchEntries,
    buildings,
    poi,
    boundingBox: graph?.boundingBox ?? null,
  }
}

export const usePublicStore = create<PublicState>((set, get) => ({
  activeTab: 'home',
  sheetState: 'hidden',
  mapMode: 'explore',
  fromNode: null,
  toNode: null,
  selectedBuilding: null,
  selectedNode: null,

  campusData: null,
  campusStatus: 'idle',
  campusError: null,
  activeFloor: 0,

  campus: null,
  campusLoading: false,

  recentDestinations: loadArray(RECENT_DEST_KEY),
  recentSearches: loadArray(RECENT_SEARCH_KEY),
  onboardingComplete: typeof window !== 'undefined'
    ? localStorage.getItem(ONBOARDING_KEY) === 'true'
    : false,

  setTab: (tab) => set({ activeTab: tab }),

  setSheet: (state) => set({ sheetState: state }),

  setMapMode: (mode) => set({ mapMode: mode }),

  setFrom: (nodeId) => set({ fromNode: nodeId }),
  setTo: (nodeId) => set({ toNode: nodeId }),

  selectBuilding: (b) => set({ selectedBuilding: b }),
  selectNode: (n) => set({ selectedNode: n }),

  setActiveFloor: (floor) => set({ activeFloor: floor }),

  fetchCampusData: async (campusId = DEFAULT_CAMPUS_ID) => {
    if (get().campusLoading || get().campusStatus === 'loading') return
    if (get().campus) return
    set({ campusLoading: true, campusStatus: 'loading', campusError: null })
    try {
      let source: CampusSource = 'supabase'
      let bundle = await fetchFromCampusMaps(campusId)
      if (!bundle) {
        source = 'demo'
        bundle = await fetchFromDemoArtifacts()
      }
      if (!bundle) throw new Error('No campus data available from any source')
      set({
        campus: bundle,
        campusLoading: false,
        campusStatus: 'ready',
        campusError: null,
        campusData: {
          campusId,
          source,
          buildings: bundle.buildings,
          components: [],
          nodes: bundle.nodes,
          edges: bundle.edges,
          boundary: null,
        },
        activeFloor: bundle.buildings[0]?.floors?.[0] ?? 0,
      })
    } catch (e) {
      set({
        campusLoading: false,
        campusStatus: 'error',
        campus: null,
        campusError: e instanceof Error ? e.message : 'Failed to load campus data',
      })
    }
  },

  search: (query) => search(get().campus?.searchEntries ?? [], query),

  findRoute: (fromId, toId) =>
    findRoute(get().campus?.nodes ?? [], get().campus?.edges ?? [], fromId, toId),

  nearestNode: (latlng, maxDistanceMeters = 50) =>
    nearestNode(get().campus?.nodes ?? [], latlng, maxDistanceMeters),

  addRecentDestination: (nodeId) => {
    const current = get().recentDestinations
    const updated = [nodeId, ...current.filter((id) => id !== nodeId)].slice(0, MAX_RECENT)
    saveArray(RECENT_DEST_KEY, updated)
    set({ recentDestinations: updated })
  },

  addRecentSearch: (query) => {
    const current = get().recentSearches
    const updated = [query, ...current.filter((q) => q !== query)].slice(0, MAX_RECENT)
    saveArray(RECENT_SEARCH_KEY, updated)
    set({ recentSearches: updated })
  },

  completeOnboarding: () => {
    localStorage.setItem(ONBOARDING_KEY, 'true')
    set({ onboardingComplete: true })
  },

  resetOnboarding: () => {
    localStorage.removeItem(ONBOARDING_KEY)
    set({ onboardingComplete: false })
  },
}))
