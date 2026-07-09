import type { LatLng } from '@navi/core'

export interface BoundingBox {
  minLng: number
  maxLng: number
  minLat: number
  maxLat: number
}

export type NavNodeType = 'space' | 'corridor' | 'transition' | 'intersection' | 'poi'

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

export interface CompilerConfig {
  nodeInterval: number
  mergeThreshold: number
  optimizationLevel: 'none' | 'moderate' | 'aggressive'
  includeAccessibility: boolean
}

export interface CompileReport {
  spacesExtracted: number
  transitionsExtracted: number
  corridorsExtracted: number
  nodesGenerated: number
  edgesGenerated: number
  warnings: string[]
  errors: string[]
  validation: ValidationResult[]
}

export interface CompileResult {
  graph: NavigationGraph
  report: CompileReport
  duration: number
  extraction?: ExtractionResult
}

export type NavigationSpaceType = 'room' | 'lobby' | 'hallway' | 'stairwell' | 'elevator_shaft' | 'outdoor'

export interface NavigationSpace {
  id: string
  label: string
  type: NavigationSpaceType
  buildingId: string
  floor: number
  position: LatLng
  polygon?: LatLng[]
  capacity?: number
  properties: Record<string, unknown>
}

export type TransitionPointType = 'entrance' | 'staircase' | 'elevator' | 'qr_checkpoint' | 'panorama'

export interface TransitionPoint {
  id: string
  label: string
  type: TransitionPointType
  position: LatLng
  buildingId: string
  floor: number
  connectsTo?: string
  properties: Record<string, unknown>
}

export type CorridorType = 'hallway' | 'road' | 'walkway'

export interface WalkableCorridor {
  id: string
  name: string
  type: CorridorType
  polyline: LatLng[]
  width: number
  buildingId?: string
  floor?: number
  surface?: string
  properties: Record<string, unknown>
}

export interface ExtractionResult {
  spaces: NavigationSpace[]
  transitions: TransitionPoint[]
  corridors: WalkableCorridor[]
  duration: number
}

export interface ValidationResult {
  severity: 'error' | 'warning'
  code: string
  message: string
  entityId?: string
  location?: string
  references?: string[]
}

export interface PublishedArtifact {
  filename: string
  content: string
  checksum: string
  size: number
}

export interface PublishedManifest {
  projectId: string
  campusId: string
  publishedAt: string
  schemaVersion: number
  compilerVersion: string
  artifacts: {
    navigationGraph: { filename: string; checksum: string; size: number }
    searchIndex: { filename: string; checksum: string; size: number }
    poiData: { filename: string; checksum: string; size: number }
    buildingIndex: { filename: string; checksum: string; size: number }
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

export interface POIData {
  version: string
  points: POI[]
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
