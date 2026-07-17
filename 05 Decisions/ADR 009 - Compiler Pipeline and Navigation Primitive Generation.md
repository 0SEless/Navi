# ADR 009: Compiler Pipeline & Navigation Primitive Generation

**Status:** Accepted
**Date:** 2026-07-16
**Author:** opencode Architecture Agent

## Context

ADR-006 established `CampusDocument` as the single source of truth. ADR-007 defined the transaction model. ADR-008 defined the multi-floor domain model — the entities that authors create (buildings, floors, rooms, hallways, vertical connectors, connector stops, room doors, anchors).

What ADR-008 intentionally does **not** define is **how authored entities become a navigation graph**. That transformation is the compiler's responsibility.

The existing compiler (`packages/compiler/`) has a 6-stage pipeline (`parse → build-nodes → build-edges → connect-campuses → optimize → validate`) that operates on `NavigationSpace`, `TransitionPoint`, and `WalkableCorridor` types — a flat, 2D model that predates M5. It knows nothing about:

- `VerticalConnector` + `ConnectorStop` — the new multi-floor transition model
- `RoomDoor` — doors as access points rather than room centroids
- `Anchor` — panorama/QR anchors as POI sources
- `Entrance` as a two-sided portal (outdoor → indoor)
- Hallway skeletons — waypoints along polylines instead of single nodes
- `NavigationArtifacts` as a bundle of outputs

The compiler must be redesigned to match the M5 architecture. This ADR defines that design — the transformation pipeline, the intermediate representation, the artifact bundle, compiler diagnostics, and the invariants that govern compilation.

## Decision

### 1. Compiler Architecture: Four Architectural Stages, Ten Implementation Phases

The compiler transforms `CampusDocument` into `NavigationArtifacts` through four **architectural stages**. Each stage has one or more **internal implementation phases**.

```
CampusDocument
      │
      ▼
┌────────────────────────────────────────────────┐
│  Stage 1: Normalize                            │
│  ┌──────────────┐  ┌──────────────┐            │
│  │ Phase 1.1    │  │ Phase 1.2    │            │
│  │ Parse &      │→│ Geometry     │            │
│  │ Validate     │  │ Normalize    │            │
│  └──────────────┘  └──────────────┘            │
│  Produces: NormalizedDocument                   │
└──────────────────────┬─────────────────────────┘
                       ▼
┌────────────────────────────────────────────────┐
│  Stage 2: Generate Primitives                  │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐ │
│  │ Phase 2.1│ │ Phase 2.2│ │ Phase 2.3      │ │
│  │ Extract  │→│Skeletonize│→│Connect &       │ │
│  │ Sources  │  │          │  │ Resolve        │ │
│  └──────────┘ └──────────┘ └────────────────┘ │
│  Produces: PrimitiveGraph (with pre-resolved connections) │
└──────────────────────┬─────────────────────────┘
                       ▼
┌────────────────────────────────────────────────┐
│  Stage 3: Build Graph                          │
│  ┌────────────────┐ ┌────────────────┐         │
│  │ Phase 3.1      │ │ Phase 3.2      │         │
│  │ Resolve        │→│ Emit           │         │
│  │ Connectivity   │  │ NavNode/Edge   │         │
│  └────────────────┘ └────────────────┘         │
│  Produces: NavigationGraph                      │
└──────────────────────┬─────────────────────────┘
                       ▼
┌────────────────────────────────────────────────┐
│  Stage 4: Assemble Artifacts                   │
│  ┌──────────────┐ ┌──────────────┐             │
│  │ Phase 4.1    │ │ Phase 4.2    │             │
│  │ Build Indexes│→│ Serialize &  │             │
│  │              │  │ Checksum     │             │
│  └──────────────┘ └──────────────┘             │
│  Produces: NavigationArtifacts                  │
└──────────────────────┬─────────────────────────┘
                       ▼
              NavigationArtifacts
```

Each stage is a pure transformation: given its expected input, it produces its expected output with no side effects and no knowledge of stages before or after. Internal phases within a stage are implementation details — they may be inlined, parallelized, or extended without changing the architectural contract.

### 2. PrimitiveGraph (Intermediate Representation)

Between authored entities and the final graph, the compiler operates on a `PrimitiveGraph` — a proper graph with nodes, edges, metadata, and diagnostics.

```typescript
interface PrimitiveGraph {
  nodes: PrimitiveNode[]
  edges: PrimitiveEdge[]
  metadata: {
    campusId: string
    buildingCount: number
    floorCount: number
    generatedAt: number     // deterministic timestamp (document version hash)
  }
  diagnostics: CompilerDiagnostic[]
}
```

Every `PrimitiveNode` has a stable `id`, a `position`, and a discriminated `kind` field. Every `PrimitiveEdge` references nodes by `id` and has a discriminated `kind` field. All primitives carry a `source` field recording which authored entity produced them (for traceability and diagnostic linking).

#### 2.1 PrimitiveNode kinds

##### kind: "waypoint"

A traversable point that routing can pass through. Waypoints are the atoms of the navigation graph.

| Property | Value |
|----------|-------|
| **Purpose** | Defines *where routing is allowed* |
| **Generated from** | Sampling authored geometry (hallways, roads) or external sources (AI extraction, CAD, BIM, navigation mesh) into skeleton segments |
| **Ownership** | Owned by the floor/building containing the generating geometry |
| **Lifetime** | Destroyed after NavNode generation |
| **Compiler phase** | Phase 2.2 (Skeletonize) |

```typescript
interface WaypointNode extends PrimitiveNodeBase {
  kind: 'waypoint'
  position: LatLng
  floor: number
  buildingId: string
  source: PrimitiveSource
}
```

A waypoint does not know what geometry produced it. It is just a traversable coordinate.

##### kind: "poi"

A destination that routing can target but cannot traverse through.

| Property | Value |
|----------|-------|
| **Purpose** | Defines *routable destinations* |
| **Generated from** | Rooms (via doors), PanoramaAnchor, QRCodeAnchor, standalone anchors, future sources |
| **Ownership** | Owned by the parent authored entity |
| **Lifetime** | Destroyed after NavNode generation |
| **Compiler phase** | Phase 2.1 (Extract Sources) |

```typescript
interface POINode extends PrimitiveNodeBase {
  kind: 'poi'
  label: string
  position: LatLng
  floor: number
  buildingId: string
  poiCategory: string        // 'room' | 'panorama' | 'qr_marker' | 'landmark' | ...
  source: PrimitiveSource
}
```

##### kind: "transition"

A point where vertical movement occurs. Always produced in pairs — one per floor — connected by a `TransitionEdge`.

| Property | Value |
|----------|-------|
| **Purpose** | Defines *vertical movement points* (stair landings, elevator lobbies) |
| **Generated from** | ConnectorStop.position |
| **Ownership** | Owned by the parent VerticalConnector |
| **Lifetime** | Destroyed after NavNode generation |
| **Compiler phase** | Phase 2.1 (Extract Sources) |

```typescript
interface TransitionNode extends PrimitiveNodeBase {
  kind: 'transition'
  position: LatLng
  floor: number
  buildingId: string
  connectorId: string
  stopId: string
  behavior: string           // from VerticalConnector: 'stairs' | 'elevator' | 'escalator' | 'ramp'
  accessible: boolean
  baseCost: number
  source: PrimitiveSource
}
```

`behavior` comes from the authored `VerticalConnector`, not the primitive. This avoids maintaining a parallel type system and allows future connector types (skybridge, tunnel, moving walkway) without changing the primitive.

##### kind: "entrance_portal"

A two-sided portal connecting outdoor and indoor routing. A single `EntrancePortalNode` carries both positions. The edge connecting its two sides is implicit.

| Property | Value |
|----------|-------|
| **Purpose** | Defines *the indoor/outdoor boundary* |
| **Generated from** | Entrance entity |
| **Ownership** | Owned by the Entrance |
| **Lifetime** | Destroyed after NavNode generation |
| **Compiler phase** | Phase 2.1 (Extract Sources) |

```typescript
interface EntrancePortalNode extends PrimitiveNodeBase {
  kind: 'entrance_portal'
  outdoorPosition: LatLng
  indoorPosition: LatLng
  floor: number
  buildingId: string
  entranceId: string
  accessible: boolean
  source: PrimitiveSource
}
```

#### 2.2 PrimitiveEdge kinds

##### kind: "skeleton"

Connects two waypoints along traversable geometry.

```typescript
interface SkeletonEdge extends PrimitiveEdgeBase {
  kind: 'skeleton'
  from: string        // waypoint node id
  to: string          // waypoint node id
  distance: number
  source: PrimitiveSource
}
```

##### kind: "access"

Connects a POI or AccessPoint to its nearest waypoint. The target waypoint is **pre-resolved** during primitive generation — never searched during graph building.

```typescript
interface AccessEdge extends PrimitiveEdgeBase {
  kind: 'access'
  from: string              // poi or entrance_portal node id
  to: string                // waypoint node id (pre-resolved in Phase 2.3)
  distance: number
  accessType: string        // 'door' | 'entrance' | 'loading_dock' | 'security_gate' | 'emergency_exit' | ...
  width?: number
  source: PrimitiveSource
}
```

`accessType` is an open string. The compiler does not care what specific access type an edge has — it only cares that traversal enters or leaves an authored entity at this point.

##### kind: "transition"

Connects two `TransitionNode`s on adjacent floors.

```typescript
interface TransitionEdge extends PrimitiveEdgeBase {
  kind: 'transition'
  from: string              // transition node id (upper floor)
  to: string                // transition node id (lower floor)
  distance: number
  behavior: string          // from VerticalConnector: 'stairs' | 'elevator' | ...
  baseCost: number
  source: PrimitiveSource
}
```

##### kind: "portal"

The implicit connection between the two sides of an `EntrancePortalNode`.

```typescript
interface PortalEdge extends PrimitiveEdgeBase {
  kind: 'portal'
  nodeId: string            // entrance_portal node id
  distance: number
  source: PrimitiveSource
}
```

#### 2.3 PrimitiveSource

Every primitive carries a source record for traceability:

```typescript
interface PrimitiveSource {
  entityId: string
  entityType: string        // 'hallway' | 'road' | 'room_door' | 'connector_stop' | 'entrance' | ...
  field?: string            // which field produced it: 'polyline' | 'position' | 'anchors'
  generatorId: string       // which generator: 'builtin:hallway' | 'ai:extraction' | 'cad:import' | ...
}
```

### 3. Compiler Diagnostics

Every compiler run produces a diagnostics array alongside the output artifacts:

```typescript
interface CompilerDiagnostic {
  severity: 'info' | 'warning' | 'error'
  sourceEntityId: string
  phase: 'normalize' | 'primitives' | 'connectivity' | 'graph' | 'artifacts'
  code: string              // namespaced: 'SKELETON_DANGLING' | 'DOOR_ORPHANED' | ...
  message: string
  relatedNodeIds?: string[]
}
```

Diagnostics are the bridge between the compiler and the editor UI. They flow through the `PrimitiveGraph` and are aggregated into the final `CompileResult`.

| Code | Severity | When it fires |
|------|----------|--------------|
| `SKELETON_DANGLING` | warning | A waypoint has no incident edges after skeletonization |
| `DOOR_ORPHANED` | warning | A RoomDoor's access edge could not connect (no hallway on floor) |
| `STOP_UNPAIRED` | warning | A ConnectorStop has no paired stop on an adjacent floor |
| `ENTRANCE_UNCONNECTED` | warning | An EntrancePortal has no road nearby |
| `HALLWAY_DISCONNECTED` | error | A hallway's skeleton segments form multiple disconnected components |
| `ROOM_NO_DOOR` | info | A room has no RoomDoor and will use centroid fallback |
| `VERTICAL_GAP` | info | A VerticalConnector skips a floor between stops |

These diagnostics do not block compilation. They are accumulated and surfaced to the user. Only structural errors (invalid geometry, missing required fields) in Phase 1.1 halt the pipeline.

### 4. Compiler Phases (Detailed)

#### Stage 1: Normalize

##### Phase 1.1: Parse & Validate

| Property | Value |
|----------|-------|
| **Input** | `CampusDocument` |
| **Output** | Validated document snapshot |
| **Preconditions** | JSON deserialization succeeded |
| **Postconditions** | All required fields present; all arrays non-null |
| **Failure conditions** | Missing required field, non-array where array expected |
| **Side effects** | None — halts on failure |

##### Phase 1.2: Geometry Normalize

| Property | Value |
|----------|-------|
| **Input** | Validated document |
| **Output** | `NormalizedDocument` |
| **Preconditions** | All authored data is structurally valid |
| **Postconditions** | All positions in world (lat/lng); polygons closed; centroids computed |
| **Failure conditions** | Coordinate conversion error, self-intersecting polygon |
| **Side effects** | None |

Responsibilities:
1. Convert building-local `(x, y)` coordinates to `(lat, lng)` using building footprint centroid + rotation via `CoordinateTransformer`
2. Validate polygon winding (counter-clockwise) and closure; fix minor gaps
3. Detect self-intersecting polygons → emit diagnostic
4. Compute centroids for rooms, hallways, and connector stops
5. Collect all entity IDs into a set for cross-reference validation

#### Stage 2: Generate Primitives

##### Phase 2.1: Extract Sources

| Property | Value |
|----------|-------|
| **Input** | `NormalizedDocument` |
| **Output** | Partial `PrimitiveGraph` (POI nodes, transition nodes, entrance portal nodes) |
| **Preconditions** | All coordinates in world space |
| **Postconditions** | Every authored entity that produces routing data has at least one primitive |
| **Side effects** | None |

Responsibilities:
1. **Room** → `PrimitiveNode(kind='poi')` at centroid or first door position. If no `RoomDoor`, emit diagnostic `ROOM_NO_DOOR`.
2. **PanoramaAnchor, QRCodeAnchor** → `PrimitiveNode(kind='poi')` at anchor position.
3. **Floor.anchors** → `PrimitiveNode(kind='poi')` per standalone anchor.
4. **ConnectorStop** → `PrimitiveNode(kind='transition')` with `behavior` from parent `VerticalConnector`.
5. **Entrance** → `PrimitiveNode(kind='entrance_portal')` with outdoor + indoor positions.
6. **External sources** (future): registered `PrimitiveSource` instances produce additional nodes.

##### Phase 2.2: Skeletonize

| Property | Value |
|----------|-------|
| **Input** | `NormalizedDocument` + partial `PrimitiveGraph` |
| **Output** | `PrimitiveGraph` with waypoint nodes and skeleton edges added |
| **Preconditions** | Phase 2.1 complete |
| **Postconditions** | Every hallway and road is sampled into a connected chain of waypoints and skeleton edges |
| **Side effects** | None — may emit SKELETON_DANGLING diagnostics |

Responsibilities:
1. **Hallway geometry** → Sample polyline at `config.nodeInterval` spacing. Emit `PrimitiveNode(kind='waypoint')` at each sample point. Emit `PrimitiveEdge(kind='skeleton')` between consecutive waypoints.
2. **Road geometry** → Same sampling as hallways. Waypoints are at world coordinates.
3. **PrimitiveSource generators** (future: visibility graph, nav mesh, CAD/BIM importers) → Run after built-in skeletonization. Add their waypoints and skeleton edges to the same PrimitiveGraph.

The compiler does not know which geometry source produced which waypoints or skeleton edges. All waypoints are equal in the PrimitiveGraph.

##### Phase 2.3: Connect & Resolve

| Property | Value |
|----------|-------|
| **Input** | `PrimitiveGraph` (all nodes and skeleton edges) |
| **Output** | `PrimitiveGraph` with access edges, transition edges, portal edges, and resolved connections |
| **Preconditions** | All authored sources extracted; all geometry skeletonized |
| **Postconditions** | Every non-waypoint node has ≥1 incident edge; every transition node is paired; every entrance portal records its implicit portal edge |
| **Side effects** | None — may emit DOOR_ORPHANED, STOP_UNPAIRED, ENTRANCE_UNCONNECTED diagnostics |

This phase performs **all** spatial reasoning. Graph generation (Stage 3) will perform none.

Responsibilities:
1. **AccessEdge generation**: For every POI node whose source is a room with RoomDoors, create one `PrimitiveEdge(kind='access')` per RoomDoor, with `to` set to the nearest waypoint node (pre-resolved — nearest-neighbor search happens here, not later). If no waypoints exist on the same floor, emit `DOOR_ORPHANED`.
2. **AccessEdge fallback**: For POI nodes with no RoomDoors, create a single `AccessEdge` from the POI to the nearest waypoint (centroid fallback). Emit `ROOM_NO_DOOR` diagnostic.
3. **TransitionEdge generation**: For each `VerticalConnector`, pair its `TransitionNode`s in floor order. Create one `PrimitiveEdge(kind='transition')` per consecutive pair. If a stop has no paired neighbor, emit `STOP_UNPAIRED`.
4. **PortalEdge generation**: For each `EntrancePortalNode`, create one `PrimitiveEdge(kind='portal')` with `nodeId` set to the portal node itself. The distance is `haversine(outdoorPosition, indoorPosition)`.
5. **Entrance-to-road connection**: For each `EntrancePortalNode`, find the nearest road waypoint within configurable threshold. If none found, emit `ENTRANCE_UNCONNECTED` (non-fatal).

After Phase 2.3, the `PrimitiveGraph` is fully connected. No further spatial searching occurs.

#### Stage 3: Build Graph

##### Phase 3.1: Connectivity Resolution

| Property | Value |
|----------|-------|
| **Input** | `PrimitiveGraph` |
| **Output** | `ConnectivityGraph` (repaired, merged, validated primitive graph) |
| **Preconditions** | All primitives generated and connected |
| **Postconditions** | Dangling waypoints removed; duplicate nodes merged; edges repaired; graph is routable |
| **Side effects** | None — may emit diagnostics for removed elements |

This is the phase where spatial imperfections are resolved before graph emission:

1. **Snap nearby waypoints** — Merge waypoints within `config.mergeThreshold` distance (typically 0.5m). Update all incident edges to reference the surviving node.
2. **Remove dangling waypoints** — Remove waypoints with zero incident edges. Emit `SKELETON_DANGLING` diagnostic.
3. **Repair broken skeleton chains** — If a skeleton edge references a removed node, reconnect to the nearest remaining waypoint.
4. **Merge overlapping access edges** — If two POIs share the same doorway (consecutive RoomDoors at the same position), deduplicate.
5. **Validate connectivity** — Run a quick BFS from every entrance portal to confirm all waypoints are reachable. Emit `HALLWAY_DISCONNECTED` for disconnected components (non-fatal — the graph is still emitted; the diagnostic flags an editing issue).
6. **Attach diagnostics** to the output `ConnectivityGraph`.

```typescript
interface ConnectivityGraph {
  nodes: PrimitiveNode[]           // same nodes, possibly merged/deduplicated
  edges: PrimitiveEdge[]           // same edges, possibly repaired
  metadata: PrimitiveGraph['metadata']
  diagnostics: CompilerDiagnostic[]
}
```

The `ConnectivityGraph` is structurally identical to `PrimitiveGraph` — it is the same IR after spatial cleanup. This phase exists to isolate spatial reasoning from graph emission so that NavNode/Edge generation is a pure mechanical transform.

##### Phase 3.2: Emit NavNode/NavEdge

| Property | Value |
|----------|-------|
| **Input** | `ConnectivityGraph` |
| **Output** | `NavigationGraph` |
| **Preconditions** | All connectivity resolved; no spatial searches needed |
| **Postconditions** | Every ConnectivityGraph node → one NavNode; every ConnectivityGraph edge → one NavEdge |
| **Side effects** | None |

This phase is a mechanical for-loop. No spatial reasoning, no searching, no merging:

```
for each node in ConnectivityGraph:
    NavNode ← { id, type, position, floor, buildingId }
    (type mapping: waypoint → 'waypoint', poi → 'poi', transition → 'transition',
                   entrance_portal → 'entrance' + 'outdoor')

for each edge in ConnectivityGraph:
    NavEdge ← { id, from, to, distance, type }
    (type mapping: skeleton → 'walk', access → 'walk',
                   transition → behavior value, portal → 'walk')
```

Two special cases for `entrance_portal` nodes:
- Emit `NavNode(type='outdoor')` at `outdoorPosition`
- Emit `NavNode(type='transition')` at `indoorPosition`
- Emit `NavEdge(type='walk')` between them (from the portal edge)

#### Stage 4: Assemble Artifacts

##### Phase 4.1: Build Indexes

| Property | Value |
|----------|-------|
| **Input** | `NavigationGraph` + `NormalizedDocument` |
| **Output** | Unserialized `NavigationArtifacts` |
| **Preconditions** | NavigationGraph is valid |
| **Postconditions** | All indexes are internally consistent with the graph |
| **Side effects** | None |

1. Build `SearchIndex` — extract POI labels, room names/numbers, building names → search entries with tags
2. Build `SpatialIndex` — spatial hash grid for nearest-node queries
3. Build `BuildingIndex` — per-building subgraph views with floor/room/entrance listings
4. Build `POIIndex` — flat list of POI nodes with categories and parent building

##### Phase 4.2: Serialize & Checksum

1. Compute SHA-256 checksum for each artifact
2. Attach metadata (nodeCount, edgeCount, boundingBox, routeable flag)
3. Serialize all artifacts as JSON
4. Compute top-level bundle checksum

### 5. NavigationArtifacts (Compiler Output Bundle)

```
NavigationArtifacts
├── graph: NavigationGraph       // Primary: the routable graph
├── searchIndex: SearchIndex     // Search: query → node resolution
├── spatialIndex: SpatialIndex   // Spatial: nearest node to coordinate
├── buildingIndex: BuildingIndex // Per-building sub-views
└── poiIndex: POIIndex           // POIs with categories
```

```typescript
interface NavigationGraph {
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
    routeable: boolean
  }
}

interface NavNode {
  id: string
  type: 'waypoint' | 'poi' | 'transition' | 'outdoor' | 'entrance'
  position: LatLng
  floor: number
  buildingId: string
}

interface NavEdge {
  id: string
  from: string
  to: string
  type: 'walk' | 'stairs' | 'elevator' | 'escalator' | 'ramp' | 'transition'
  distance: number
  weight: number
}

interface SearchIndex {
  version: string
  entries: Array<{
    id: string
    label: string
    type: 'building' | 'room' | 'entrance' | 'poi'
    nodeId: string
    position: LatLng
    tags: string[]
    buildingId?: string
    floor?: number
  }>
}

interface SpatialIndex {
  version: string
  cells: Record<string, string[]>   // spatial cell hash → NavNode IDs
  cellSize: number
}

interface BuildingIndex {
  version: string
  buildings: Array<{
    id: string
    name: string
    code: string
    position: LatLng
    floors: Array<{
      level: number
      label: string
      nodeIds: string[]
    }>
    entrances: Array<{ id: string; label: string; nodeId: string }>
  }>
}

interface POIIndex {
  version: string
  points: Array<{
    id: string
    label: string
    category: string
    position: LatLng
    nodeId: string
    buildingId?: string
    floor?: number
    properties: Record<string, unknown>
  }>
}
```

Consumers:
| Artifact | Consumer |
|----------|----------|
| `graph` | RouteEngine, MapRenderer (route overlay) |
| `searchIndex` | Search box, query auto-complete |
| `spatialIndex` | GPS-to-nearest-node, "nearest X to me" |
| `buildingIndex` | Building picker, floor selector UI |
| `poiIndex` | POI browser, category filters |

### 6. Compiler Invariants

1. **No authored entity type survives past Phase 2.1.** After extraction, the compiler never references `Room`, `Floor`, `Building`, `VerticalConnector`, or any other authored type. The `PrimitiveGraph` is self-contained.

2. **Graph generation never searches spatially.** Phase 3.2 is a mechanical for-loop. All nearest-neighbor, snapping, and connectivity resolution happens in Phase 2.3 and Phase 3.1.

3. **Graph validation never mutates the graph.** The validator is read-only. It returns a report; it does not fix or modify.

4. **Rendering geometry is never emitted from NavigationGraph.** The graph contains only routing data (node positions, edge distances, types). No polygon outlines, floor plan images, or svg data.

5. **NavigationGraph contains only routing data.** No authored metadata leaks into NavNode or NavEdge. The `source` and `properties` fields on primitives are consumed during graph generation and not forwarded.

6. **Phases are one-directional.** No phase reads from a later phase's output. The data flow is strictly `Normalize → Generate Primitives → Build Graph → Assemble Artifacts`.

7. **Compilation is deterministic.** The same `CampusDocument` always produces the same `NavigationArtifacts` (same checksums) given the same configuration. Randomness or time-based values are prohibited. The `generatedAt` timestamp in `PrimitiveGraph` uses the document version hash, not `Date.now()`.

8. **Every NavNode belongs to exactly one building.** A node's `buildingId` is always set. Outdoor nodes (from roads, entrance portals) belong to a synthetic `__outdoor__` campus-level building.

9. **Every NavEdge has a positive distance.** Zero-length edges are not emitted. The minimum edge distance is 0.1 meters. Edges below this threshold are merged during Phase 3.1.

10. **Diagnostics never block compilation.** Only Phase 1.1 structural errors halt the pipeline. All other diagnostics (warnings, info) are accumulated and surfaced.

### 7. Extension Points

The compiler exposes three extension points:

#### 7.1 PrimitiveSource

Third-party code can register a `PrimitiveSource` that produces primitives from non-CampusDocument sources:

```typescript
interface PrimitiveSource {
  readonly id: string
  generate(document: NormalizedDocument, context: GenerationContext): PrimitiveContribution
}

interface PrimitiveContribution {
  nodes?: PrimitiveNode[]
  edges?: PrimitiveEdge[]
  diagnostics?: CompilerDiagnostic[]
}
```

Registered sources run during Stage 2 alongside built-in entity extractors. Sources cannot remove or modify primitives from other sources — only add.

Expected future sources:
- **VisibilityGraphGenerator** — open indoor spaces (lobbies, atriums)
- **NavigationMeshGenerator** — game-engine-style navigation
- **CADImporter** — DXF/SVG floor plans
- **BIMImporter** — IFC building models
- **AIFloorExtractor** — ML-generated floor plans from imagery

#### 7.2 ConnectivityResolver

Replaces or augments the built-in Phase 3.1 connectivity resolution:

```typescript
interface ConnectivityResolver {
  readonly id: string
  resolve(graph: PrimitiveGraph): ConnectivityGraph
}
```

Useful for custom snapping strategies, building-specific merge rules, or specialized edge repair algorithms.

#### 7.3 ArtifactEnricher

Adds extra artifacts to the output bundle:

```typescript
interface ArtifactEnricher {
  readonly id: string
  enrich(bundle: NavigationArtifacts, document: NormalizedDocument, graph: NavigationGraph): Partial<NavigationArtifacts>
}
```

Future artifacts: `landmarkIndex`, `analyticsIndex`, `heatmapIndex`, `emergencyExitIndex`.

### 8. Migration from Existing Compiler

The existing `packages/compiler/` has a 6-stage pipeline. Migration strategy:

1. **Add new primitive types** alongside the existing `NavigationSpace`/`TransitionPoint`/`WalkableCorridor` types. The new `PrimitiveGraph` and old `ExtractionResult` coexist during the transition.

2. **Add Stage 2 (Generate Primitives)** as a new pipeline stage. The existing `build-nodes` stage becomes a consumer of `PrimitiveGraph` via a compatibility adapter.

3. **Deprecate old extraction types.** Mark `NavigationSpace`, `WalkableCorridor`, and `ExtractionResult` as `@deprecated`. New generators produce primitives.

4. **Add Phase 3.1 (Connectivity Resolution)** as a new stage between extraction and graph building. Initially runs with minimal snapping (merge threshold = 0). Gradually tighten as spatial data quality improves.

5. **Remove old extraction** after all generators are migrated. Delete `NavigationSpace`, `WalkableCorridor`, old extraction coordinator.

6. **Ship NavigationArtifacts** as the new compiler output. Add a backward-compatible wrapper that produces the old `CompileResult.graph` from `NavigationArtifacts.graph` for existing consumers.

7. **Add diagnostics** to the compiler result as the final step. Wire diagnostics into the `CompileResultV2` interface.

### 9. Compiler Dependency Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        NavigationCompiler                                │
│  (orchestrates stages, manages config, collects diagnostics + results)   │
└──────┬───────────┬──────────────┬──────────────┬─────────────────────────┘
       │           │              │              │
       ▼           ▼              ▼              ▼
┌─────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│  Stage 1    │ │ Stage 2  │ │ Stage 3  │ │ Stage 4  │
│  Normalize  │ │Generate  │ │Build     │ │Assemble  │
│             │ │Primitives│ │Graph     │ │Artifacts │
│ Phase 1.1   │ │Phase 2.1 │ │Phase 3.1 │ │Phase 4.1 │
│ Phase 1.2   │ │Phase 2.2 │ │Phase 3.2 │ │Phase 4.2 │
│             │ │Phase 2.3 │ │          │ │          │
└──────┬──────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
       │             │            │            │
       ▼             ▼            ▼            ▼
 NormalizedDoc  Primitive    Connectivity  Navigation
                Graph         Graph        Artifacts

Extension hooks:
                     │            │            │
             PrimitiveSource  Connectivity  ArtifactEn
                              Resolver      richer
```

Key properties:
- **No stage reaches backward.** Arrows go down only.
- **No stage skips ahead.** Each consumes the previous stage's output.
- **Phase 3.1 (Connectivity Resolution)** isolates all spatial repairing from graph emission.
- **Phase 3.2 (Emit)** is a mechanical for-loop — no searching, no branching on entity types.
- **Extension hooks** are inserted at stage boundaries, not inside phases.
- **Stage output types** are frozen interfaces (data, not behavior).

### 10. Relationship to Other ADRs

| ADR | Relationship |
|-----|-------------|
| ADR-006 (CampusDocument) | Provides the input to Stage 1. Defines the schema documents must conform to. |
| ADR-007 (Transaction Model) | The compiler reads a committed document snapshot. It does not participate in the transaction model. |
| ADR-008 (Domain Model) | Defines the authored entities that Stage 2 consumes. ADR-009 defines the compilation process for those entities. |
| ADR-009 (this document) | Defines the compiler pipeline, intermediate representation, connectivity resolution, diagnostics, and output artifacts. |

The separation:

> ADR-008 answers "what exists" (authored entities).
> ADR-009 answers "how those become navigation data" (compilation process).

## Consequences

### Positive

- **Clear separation between authored model and navigation model.** The `PrimitiveGraph` IR ensures no authored type leaks into routing. Enforces ADR-008's invariant that runtime never imports authored types.
- **Connectivity resolution is isolated.** Phase 3.1 owns all snapping, merging, dangling removal, and edge repair. Graph emission (Phase 3.2) is a pure mechanical transform. Changes to snapping strategies never touch graph generation.
- **Graph generation never searches.** All spatial reasoning completes before Phase 3.2. The emit phase is predictable, testable, and trivially parallelizable.
- **Diagnostics bridge the compiler and the editor.** Users see "Stair A isn't connected" or "Room 204 has no door" without block compilation. This improves editor UX without coupling the runtime.
- **PrimitiveSource extension points enable multiple input formats.** Hallways are one source; CAD, BIM, AI extraction, navigation meshes are future sources — all producing the same `PrimitiveNode`/`PrimitiveEdge` types.
- **`behavior` instead of `transitionType` keeps the primitive type system stable.** New connector types (skybridge, tunnel, moving walkway) use existing `'transition'` nodes and `'transition'` edges without compiler changes.
- **AccessEdge with resolved `to` eliminates search from graph building.** The nearest-waypoint lookup happens once in Phase 2.3, not every time the graph is rebuilt.
- **Deterministic compilation.** Same document + same config = same checksums. Enables caching, diff-based republishing, and CI verification.
- **Testing is simplified.** Each phase is a pure function. Phases can be unit-tested in isolation with typed fixture data.

### Negative

- **More intermediate representations.** Developers must understand `PrimitiveGraph`, `ConnectivityGraph`, and `NavigationGraph`, plus the 4 architectural stages and 7 internal phases.
- **PrimitiveSource and ConnectivityResolver are abstract.** Without immediate implementations, they may be removed by YAGNI pruning.
- **Backward compatibility requires a wrapper.** Existing consumers expecting `CompileResult.graph` must be updated or served by a compat layer during migration.
- **Phase 2.3 (Connect & Resolve) is computationally heavier** than the current approach — nearest-waypoint search for every door, pairing for every transition — but this is a one-time cost per compilation.

## Alternatives Considered

| Alternative | Pros | Cons | Reason Rejected |
|---|---|---|---|
| Six flat arrays for PrimitiveGraph (no graph structure) | Simpler types | No way to attach linked diagnostics; no unified node identity | Graph structure with nodes+edges enables traceability, diagnostics, and extension |
| Keep transitionType on the primitive | Self-contained primitives | Every new connector type requires a primitive type change; duplicates ADR-008's behavior field | `behavior` from the connector is the single source of truth |
| AccessPoint as a separate primitive type | Explicit semantics | AccessPoint is just a POI that happens to have an incident edge; it doesn't need its own node kind | AccessEdge captures the connection semantics; the node is always a POI |
| Graph generation performs spatial search | Simpler Phase 2 (no nearest-neighbor) | Search happens every build; emission is not a pure transform | Pre-resolving connections makes graph generation deterministic and testable |
| Skip ConnectivityGraph (inline in Phase 3) | Fewer phases, smaller diff | Snapping, merging, and repair logic mixed with emission; hard to test or replace individually | Isolating connectivity resolution is worth the extra phase |
| Halt compilation on warnings | Safer output | Blocks partial/draft compilation; prevents iterative editing flow | Diagnostics accumulate; only structural errors halt. Editors need partial results. |

## Related

- Depends on: ADR-006 (CampusDocument), ADR-007 (Document Transaction Model), ADR-008 (Multi-Floor Domain Model)
- Supersedes: the implicit 2-stage extraction-then-build model in existing `packages/compiler/`
- Referenced by: `packages/compiler/`, `packages/runtime/` (future), `spec/M5-DOMAIN-MODEL.md`
- Enables: M5 Phase 2 (Compiler Refactor), M5 Phase 3 (Runtime), M5 Phase 5 (Remove Bridge)
