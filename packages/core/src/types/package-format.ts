import type { BoundingBox } from './navigation-artifacts'

// ── Package Format (ADR-010) ──
// Shared between @navi/publisher (writer) and @navi/runtime (reader)

export interface NavNodeFile {
  id: string
  type: 'waypoint' | 'poi' | 'transition' | 'outdoor' | 'entrance'
  lat: number
  lng: number
  floor: number
  buildingId: string
}

export interface NavEdgeFile {
  id: string
  from: string
  to: string
  type: 'walk' | 'stairs' | 'elevator' | 'escalator' | 'ramp' | 'transition'
  distance: number
  weight: number
}

export interface NavigationGraphFile {
  schemaVersion: string
  campusId: string
  checksum: string
  nodes: NavNodeFile[]
  edges: NavEdgeFile[]
}

export interface SearchEntryFile {
  id: string
  label: string
  type: 'building' | 'room' | 'entrance' | 'poi'
  nodeId: string
  lat: number
  lng: number
  tags: string[]
  buildingId?: string
  floor?: number
}

export interface SearchIndexFile {
  schemaVersion: string
  entries: SearchEntryFile[]
}

export interface SpatialIndexFile {
  schemaVersion: string
  cellSize: number
  cells: Record<string, string[]>
}

export interface EntranceEntryFile {
  id: string
  label: string
  nodeId: string
}

export interface FloorEntryFile {
  level: number
  label: string
  nodeIds: string[]
}

export interface BuildingEntryFile {
  id: string
  name: string
  code: string
  position: { lat: number; lng: number }
  floors: FloorEntryFile[]
  entrances: EntranceEntryFile[]
  floorPlanUrls?: Record<number, string>
}

export interface BuildingIndexFile {
  schemaVersion: string
  buildings: BuildingEntryFile[]
}

export interface POIEntryFile {
  id: string
  label: string
  category: string
  lat: number
  lng: number
  nodeId: string
  buildingId?: string
  floor?: number
  properties: Record<string, unknown>
}

export interface POIIndexFile {
  schemaVersion: string
  points: POIEntryFile[]
}

export interface HotspotFile {
  id: string
  type: 'navigation' | 'information' | 'link'
  target: string
  yaw: number
  pitch: number
  label: string
}

export interface PanoramaEntryFile {
  id: string
  title: string
  imageAssetId: string
  buildingId?: string
  floor?: number
  lat: number
  lng: number
  heading?: number
  hotspots: HotspotFile[]
}

export interface PanoramaIndexFile {
  schemaVersion: string
  panoramas: PanoramaEntryFile[]
}

// ── Package Manifest (ADR-010 §2) ──

export interface PackageArtifact {
  path: string
  checksum: string
  size: number
  schemaVersion: string
}

export interface PackageMetadata {
  nodeCount: number
  edgeCount: number
  buildingCount: number
  floorCount: number
  boundingBox: BoundingBox
  routeable: boolean
}

export interface NavigationPackageManifest {
  schemaVersion: string
  campusId: string
  campusName: string
  publishedAt: string
  compilerVersion: string
  revision: string
  artifacts: Record<string, PackageArtifact>
  metadata: PackageMetadata
}
