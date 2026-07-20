import type { LatLng } from './coordinates'

export interface BoundingBox {
  minLng: number
  maxLng: number
  minLat: number
  maxLat: number
}

export type NavNodeType = 'space' | 'corridor' | 'transition' | 'intersection' | 'poi' | 'waypoint' | 'outdoor' | 'entrance'

export interface NavNode {
  id: string
  label: string
  type: NavNodeType
  position: LatLng
  floor: number
  buildingId: string
  properties: Record<string, unknown>
}

export type NavEdgeType = 'walk' | 'stairs' | 'elevator' | 'transition'

export interface NavEdge {
  id: string
  from: string
  to: string
  type: NavEdgeType
  distance: number
  weight: number
}

export interface NavigationGraph {
  version: string
  campusId: string
  createdAt: string
  checksum: string
  nodes: NavNode[]
  edges: NavEdge[]
  metadata: {
    nodeCount: number
    edgeCount: number
    buildings: number
    floors: number
    boundingBox: BoundingBox
  }
}

export interface SearchEntry {
  id: string
  label: string
  type: 'building' | 'room' | 'entrance' | 'poi'
  nodeId: string
  position: LatLng
  tags: string[]
  buildingId?: string
  floor?: number
}

export interface SearchIndex {
  version: string
  entries: SearchEntry[]
}

export interface POI {
  id: string
  label: string
  category: string
  position: LatLng
  buildingId?: string
  floor?: number
  nodeId: string
  properties: Record<string, unknown>
}

export interface FloorEntry {
  level: number
  label: string
  elevation: number
  rooms: { id: string; name: string; number: string; nodeId: string }[]
}

export interface BuildingEntry {
  id: string
  name: string
  code: string
  category: string
  position: LatLng
  floors: FloorEntry[]
  entrances: { id: string; label: string; position: LatLng }[]
  nodeId: string
}

export interface BuildingIndex {
  version: string
  buildings: BuildingEntry[]
}

export interface ArtifactsMetadata {
  /** Compiler version that produced these artifacts. */
  compilerVersion: string
  /** Revision identifier from the source document. */
  revision: string
  /** ISO 8601 timestamp of compilation. */
  compiledAt: string
}

export interface NavigationArtifacts {
  graph: NavigationGraph
  searchIndex: SearchIndex
  spatialIndex: SpatialIndex
  buildingIndex: BuildingIndex
  poiIndex: POIIndex
  panoramaIndex?: PanoramaIndex
  metadata?: ArtifactsMetadata
  extensions: Record<string, unknown>
}

export interface POIIndex {
  version: string
  points: POI[]
}

export interface SpatialIndex {
  version: string
  cells: Record<string, string[]>
  cellSize: number
}

// ── Panorama Index (M6.5a) ──
// Optional runtime artifact exposing panorama data to capabilities.
// A faithful, read-only projection of document panoramas — no viewer concepts.

export interface HotspotEntry {
  readonly id: string
  readonly type: 'navigation' | 'information' | 'link'
  readonly target: string
  readonly yaw: number
  readonly pitch: number
  readonly label: string
}

export interface PanoramaEntry {
  readonly id: string
  readonly title: string
  readonly imageAssetId: string
  readonly buildingId?: string
  readonly floor?: number
  readonly position: LatLng
  readonly heading?: number
  readonly hotspots: readonly HotspotEntry[]
}

export interface PanoramaIndex {
  readonly version: string
  readonly panoramas: readonly PanoramaEntry[]
}
