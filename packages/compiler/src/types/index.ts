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

  /** Built-in stage overrides (optional — defaults use internal implementations) */
  stages?: {
    parse?: new () => CompilerStagePlugin
    'build-nodes'?: new () => CompilerStagePlugin
    'build-edges'?: new () => CompilerStagePlugin
    'connect-campuses'?: new () => CompilerStagePlugin
    'optimize'?: new () => CompilerStagePlugin
    'validate'?: new () => CompilerStagePlugin
  }

  /** Third-party plugins to inject into the compile pipeline */
  plugins?: CompilerStagePlugin[]
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

/** @deprecated Use CompileResultV2 for new code. Legacy for backward compat. */
export interface CompileResult {
  graph: NavigationGraph
  report: CompileReport
  duration: number
  extraction?: ExtractionResult
}

/** V2 compile result matching architecture spec — returned by CampusCompiler */
export interface CompileResultV2 {
  success: boolean
  graph: NavigationGraph | null
  stats: CompileStats
  warnings: CompileWarning[]
  errors: CompileError[]
  duration: number
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

// ──────────────────────────────────────────────
// Compiler Stage Plugin System
// ──────────────────────────────────────────────

export type CompileStageId =
  | 'parse'
  | 'build-nodes'
  | 'build-edges'
  | 'connect-campuses'
  | 'optimize'
  | 'validate'

export type PluginMode = 'replace' | 'augment'

export interface CompilerStagePlugin {
  /** Plugin identifier (must be namespaced: "compiler-{name}") */
  id: string

  /** Which stage this plugin replaces or augments */
  targetStage: CompileStageId

  /** Plugin metadata */
  meta: {
    name: string
    version: string
    description: string
    author?: string
  }

  /** Execution mode: 'replace' takes full control, 'augment' wraps the default */
  mode: PluginMode

  /** Execute the plugin (replaces or wraps the default stage) */
  execute(input: CompilerStageInput, next: CompilerStageNext): CompilerStageOutput
}

export interface CompilerStageInput {
  /** The document being compiled (available at all stages) */
  document: import('@navi/core').CampusDocument

  /** Parsed document (available after parse stage) */
  parsed?: ParsedDocument

  /** Current graph state (available after build-nodes stage) */
  nodes?: import('../types').NavNode[]
  edges?: import('../types').NavEdge[]

  /** Stage-specific context */
  context: Record<string, unknown>
}

export interface CompilerStageOutput {
  /** Modified nodes (if stage operates on nodes) */
  nodes?: import('../types').NavNode[]

  /** Modified edges (if stage operates on edges) */
  edges?: import('../types').NavEdge[]

  /** Warnings to add to result */
  warnings?: CompileWarning[]

  /** Errors (returning errors halts the pipeline) */
  errors?: CompileError[]

  /** Pass-through data for later stages */
  context?: Record<string, unknown>
}

export type CompilerStageNext = (input: CompilerStageInput) => CompilerStageOutput

/** Parsed document representation produced by the Parse stage */
export interface ParsedDocument {
  buildings: ParsedBuilding[]
  rooms: ParsedRoom[]
  hallways: ParsedHallway[]
  entrances: ParsedEntrance[]
  stairs: ParsedStair[]
  elevators: ParsedElevator[]
  roads: ParsedRoad[]
}

export interface ParsedBuilding {
  id: string
  name: string
  code: string
  category: string
  position: LatLng
  baseElevation: number
  height: number
  floors: number[]
  color: string
}

export interface ParsedRoom {
  id: string
  name: string
  number: string
  category: string
  polygon: LatLng[]
  centroid: LatLng
  floorId: string
  floorLevel: number
  buildingId: string
}

export interface ParsedHallway {
  id: string
  name: string
  polyline: LatLng[]
  width: number
  floorId: string
  floorLevel: number
  buildingId: string
}

export interface ParsedEntrance {
  id: string
  name: string
  position: LatLng
  level: number
  buildingId: string
  isAccessible: boolean
  hasQR: boolean
  hasPanorama: boolean
}

export interface ParsedStair {
  id: string
  name: string
  position: LatLng
  buildingId: string
  isAccessible: boolean
}

export interface ParsedElevator {
  id: string
  name: string
  position: LatLng
  buildingId: string
  isAccessible: boolean
}

export interface ParsedRoad {
  id: string
  name: string
  polyline: LatLng[]
  width: number
  surface: string
  type: string
}

export interface CompileStats {
  totalNodes: number
  totalEdges: number
  buildingsProcessed: number
  floorsProcessed: number
  roomsProcessed: number
  hallwaysProcessed: number
  totalRouteLength: number // meters
  connectivityScore: number // 0–1
}

export interface CompileWarning {
  code: string    // 'ORPHANED_ROOM'
  message: string  // "Room 203 has no hallway connection"
  entityId: string
}

export interface CompileError {
  code: string
  message: string
  entityId?: string
}

export interface CompileStage {
  name: string     // "Building nodes", "Connecting edges", etc.
  progress: number  // 0–1
}
