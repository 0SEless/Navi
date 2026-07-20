import type { LatLng } from '@navi/core'
import type {
  BoundingBox,
  NavNodeType,
  NavNode,
  NavEdgeType,
  NavEdge,
  NavigationGraph,
  SearchEntry,
  SearchIndex,
  POI,
  FloorEntry,
  BuildingEntry,
  BuildingIndex,
  NavigationArtifacts,
  POIIndex,
  SpatialIndex,
} from '@navi/core'

export type {
  BoundingBox,
  NavNodeType,
  NavNode,
  NavEdgeType,
  NavEdge,
  NavigationGraph,
  SearchEntry,
  SearchIndex,
  POI,
  FloorEntry,
  BuildingEntry,
  BuildingIndex,
  NavigationArtifacts,
  POIIndex,
  SpatialIndex,
} from '@navi/core'

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
  artifacts?: NavigationArtifacts
  report?: CompilerReport
  stats: CompileStats
  warnings: CompileWarning[]
  errors: CompileError[]
  duration: number
  validation?: import('../graph/validators/types').ValidationReport
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

export interface POIData {
  version: string
  points: POI[]
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

// ──────────────────────────────────────────────
// M5 Primitive Graph Types
// ──────────────────────────────────────────────

export interface PrimitiveSource {
  entityId: string
  entityType: string
  field?: string
  generatorId: string
}

export type PrimitiveNodeKind = 'waypoint' | 'poi' | 'transition' | 'entrance_portal'

export interface PrimitiveNodeBase {
  id: string
  position: LatLng
  floor: number
  buildingId: string
  source: PrimitiveSource
}

export interface WaypointNode extends PrimitiveNodeBase {
  kind: 'waypoint'
}

export interface POINode extends PrimitiveNodeBase {
  kind: 'poi'
  label: string
  poiCategory: string
}

export interface TransitionNode extends PrimitiveNodeBase {
  kind: 'transition'
  connectorId: string
  stopId: string
  behavior: string
  accessible: boolean
  baseCost: number
}

export interface EntrancePortalNode extends PrimitiveNodeBase {
  kind: 'entrance_portal'
  outdoorPosition: LatLng
  indoorPosition: LatLng
  entranceId: string
  accessible: boolean
}

export type PrimitiveNode = WaypointNode | POINode | TransitionNode | EntrancePortalNode

export type PrimitiveEdgeKind = 'skeleton' | 'access' | 'transition' | 'portal'

export interface PrimitiveEdgeBase {
  id: string
  from: string
  to: string
  distance: number
  source: PrimitiveSource
}

export interface SkeletonEdge extends PrimitiveEdgeBase {
  kind: 'skeleton'
}

export interface AccessEdge extends PrimitiveEdgeBase {
  kind: 'access'
  accessType: string
  width?: number
}

export interface TransitionEdge extends PrimitiveEdgeBase {
  kind: 'transition'
  behavior: string
  baseCost: number
}

/**
 * PortalEdge represents the implicit connection between the two sides
 * of an EntrancePortalNode. It does NOT have from/to because its
 * single node (nodeId) carries both outdoor and indoor positions.
 * The emitter splits this into two NavNodes + one NavEdge.
 */
export interface PortalEdge {
  kind: 'portal'
  id: string
  nodeId: string
  distance: number
  source: PrimitiveSource
}

export type PrimitiveEdge = SkeletonEdge | AccessEdge | TransitionEdge | PortalEdge

export interface PrimitiveGraph {
  nodes: PrimitiveNode[]
  edges: PrimitiveEdge[]
  metadata: {
    campusId: string
    buildingCount: number
    floorCount: number
    generatedAt: number
  }
  diagnostics: CompilerDiagnostic[]
}

export interface ConnectivityGraph {
  nodes: PrimitiveNode[]
  edges: PrimitiveEdge[]
  metadata: PrimitiveGraph['metadata']
  diagnostics: CompilerDiagnostic[]
}

// ──────────────────────────────────────────────
// Compiler Diagnostics & Report
// ──────────────────────────────────────────────

export type DiagnosticSeverity = 'info' | 'warning' | 'error'

export interface CompilerDiagnostic {
  severity: DiagnosticSeverity
  sourceEntityId: string
  phase: 'normalize' | 'primitives' | 'connectivity' | 'graph' | 'artifacts'
  code: string
  message: string
  relatedNodeIds?: string[]
}

export interface CompilerStatistics {
  rooms: number
  hallways: number
  roads: number
  primitives: number
  waypoints: number
  edges: number
  diagnostics: { error: number; warning: number; info: number }
  compileTime: number
}

export interface CompilerReport {
  diagnostics: CompilerDiagnostic[]
  statistics: CompilerStatistics
}

// ──────────────────────────────────────────────
// Skeleton Generator Abstraction
// ──────────────────────────────────────────────

export interface SkeletonGenerator {
  readonly id: string
  generate(document: NormalizedDocument, context: GenerationContext): PrimitiveContribution
}

export interface PrimitiveContribution {
  nodes?: PrimitiveNode[]
  edges?: PrimitiveEdge[]
  diagnostics?: CompilerDiagnostic[]
  doorSpecs?: DoorSpec[]
}

export interface DoorSpec {
  roomId: string
  doorId: string
  position: LatLng
  floor: number
  buildingId: string
  width?: number
  properties?: Record<string, unknown>
}

export interface GenerationContext {
  nodeInterval: number
  mergeThreshold: number
}

// ──────────────────────────────────────────────
// Normalized Document (Stage 1 output)
// ──────────────────────────────────────────────

export interface NormalizedDocument {
  buildings: NormalizedBuilding[]
  roads: NormalizedRoad[]
}

export interface NormalizedBuilding {
  id: string
  name: string
  code: string
  category: string
  position: LatLng
  baseElevation: number
  height: number
  floors: NormalizedFloor[]
}

export interface NormalizedFloor {
  id: string
  level: number
  label: string
  elevation: number
  buildingId: string
  rooms: NormalizedRoom[]
  hallways: NormalizedHallway[]
  connectorStops: NormalizedConnectorStop[]
  entrances: NormalizedEntrance[]
  anchors: NormalizedAnchor[]
}

export interface NormalizedRoom {
  id: string
  name: string
  number: string
  category: string
  polygon: LatLng[]
  centroid: LatLng
  floorId: string
  floorLevel: number
  buildingId: string
  doors: NormalizedRoomDoor[]
}

export interface NormalizedRoomDoor {
  id: string
  roomId: string
  position: LatLng
  width?: number
  properties?: Record<string, unknown>
}

export interface NormalizedHallway {
  id: string
  name: string
  polyline: LatLng[]
  width: number
  floorId: string
  floorLevel: number
  buildingId: string
}

export interface NormalizedConnectorStop {
  id: string
  connectorId: string
  position: LatLng
  floor: number
  buildingId: string
  behavior: string
  accessible: boolean
  baseCost: number
}

export interface NormalizedEntrance {
  id: string
  label: string
  outdoorPosition: LatLng
  indoorPosition: LatLng
  level: number
  buildingId: string
  accessible: boolean
}

export interface NormalizedAnchor {
  id: string
  type: 'panorama' | 'qr_marker'
  position: LatLng
  floor: number
  buildingId: string
  label?: string
  properties?: Record<string, unknown>
}

export interface NormalizedRoad {
  id: string
  name: string
  polyline: LatLng[]
  width: number
  surface: string
  type: string
}
