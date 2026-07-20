# M5 Domain Model Specification — Multi-Floor Navigation

**Status:** Draft
**Date:** 2026-07-16

---

## Navigation Layers

The NAVI platform is organized into six conceptual layers. Each layer has distinct responsibilities and data models. No layer reaches across more than one boundary.

```
┌──────────────────────────────────────────────────────┐
│           Campus Layer     CampusDocument            │ Editor
├──────────────────────────────────────────────────────┤
│         Building Layer     per-building scope         │ Editor
├──────────────────────────────────────────────────────┤
│          Floor Layer       rooms, hallways, stops    │ Editor
├──────────────────────────────────────────────────────┤
│       Navigation Layer     NavNode, NavEdge          │ Compiler
├──────────────────────────────────────────────────────┤
│         Runtime Layer      A*, policies, GPS         │ Runtime
├──────────────────────────────────────────────────────┤
│      Presentation Layer    instructions, UI          │ Runtime + App
└──────────────────────────────────────────────────────┘
```

### Layer Rules

1. **Campus → Building → Floor** — authored entities, stored in `CampusDocument`. These layers are the editor's responsibility.
2. **Navigation Layer** — compiled output. Purely structural (nodes, edges, costs). No authored entity types exist here.
3. **Runtime Layer** — graph algorithms. Operates on `NavNode`/`NavEdge`. Never imports authored entity types.
4. **Presentation Layer** — UI. Reads from both compiled output (route) and authored document (floor plans, labels).

**Critical constraint:** The compiler output is NEVER consumed by the rendering pipeline. `EntityRenderer` reads `CampusDocument` directly. The `NavigationGraph` is consumed only by the runtime for routing and instruction generation.

---

## Visual vs Navigation Presentation

The Presentation Layer splits into two concerns:

```
CampusDocument
        │
        ├──────────────────► Visual Presentation
        │                       buildings, floor plans,
        │                       polygons, labels, panoramas
        │
        ▼
     Compiler
        ▼
  NavigationGraph
        ▼
     Runtime
        │
        ▼
  Navigation Presentation
            blue dot, route line, ETA,
            turn instructions, floor transitions
```

| Concern | Data Source | Purpose |
|---------|------------|---------|
| Visual | `CampusDocument` (authored) | What the campus looks like |
| Navigation | `NavigationGraph` (compiled) | How to get from A to B |

They are siblings, not parent/child. Changing the compiler algorithm (e.g., from midpoint nodes to visibility graph) must not change the rendered floor plan.

---

## Authoring Lifecycle

The complete authoring pipeline connects ADR 006/007 (document transaction model) to the compiled runtime:

```
Tool                    ← user interaction
  │
  ▼
Command                 ← dispatched by tool
  │
  ▼
CampusDocument          ← mutated by command
  │
  ▼
DocumentStore.commit()  ← transaction boundary (bumps version)
  │
  ▼
revision.committed      ← event bus notification
  │
  ├──► History          ← snapshot for undo/redo
  ├──► Validation       ← mark dirty, debounced re-validate
  ├──► Autosave         ← debounce → save queue → persist
  └──► Workflow         ← state machine (saved/dirty/saving)
                │
                ▼
           Publish
                │
                ▼
           Compiler
                │
                ▼
        NavigationGraph
                │
                ├──► NavigationArtifacts
│         ├── NavigationGraph
│         ├── SearchIndex
│         ├── SpatialIndex
│         └── BuildingIndex
                │
                ▼
          RuntimeEngine
                │
                ├──► SearchEngine
                ├──► RouteEngine (A* + Policy)
                └──► InstructionGenerator
                            │
                            ▼
                     MapLibre (blue dot, route line, floor transitions)
```

---

## Core Entities

```
Campus
  ├── Building
  │     ├── Floor
  │     ├── Floor
  │     │     ├── Room              (destination POI)
  │     │     │     └── RoomDoor    (access point to hallway)
  │     │     ├── Hallway           (visual geometry; navigation skeleton derived)
  │     │     └── Anchor            (floor-level spatial reference, not connector-associated)
  │     │           ├── Panorama
  │     │           ├── QR
  │     │           ├── BLE
  │     │           └── ARMarker
  │     │
  │     ├── VerticalConnector
  │     │     └── ConnectorStop     (owns its own panorama, QR, heading)
  │     │
  │     └── Entrance                (future: extends TransitionConnector)
  │
  └── Road                          (outdoor traversable edge)
```

### Campus

```ts
interface Campus {
  id: string;
  name: string;
  buildings: Building[];
  roads: Road[];
  metadata?: Record<string, unknown>;
}
```

The root entity. Owns buildings and the outdoor road network.

### Building

```ts
interface Building {
  id: string;
  campusId: string;
  name: string;
  floors: Floor[];
  verticalConnectors: VerticalConnector[];
  entrances: Entrance[];
  footprint?: WorldPolygon;       // optional; fallback centroid from rooms
  elevation?: number;              // ground-level elevation in meters
  metadata?: Record<string, unknown>;
}
```

A building is a container for floors, vertical connectors, and entrances. It has a footprint for 3D visualization and coordinate transformation.

### Floor

```ts
interface Floor {
  id: string;
  buildingId: string;
  level: number;                   // -2, -1, 0, 1, 2, 3 ... (sort order)
  label: string;                   // "Ground", "2nd Floor", "B1"
  elevation: number;               // meters above building ground
  rooms: Room[];
  hallways: Hallway[];
  anchors: Anchor[];               // panoramas, QR markers, etc.
  connectorStops: ConnectorStop[]; // landings for stairs/elevators
  visible: boolean;                // toggle visibility in editor
  locked: boolean;                 // prevent edits
}
```

A floor is a vertical slice of a building. `level` is integer for sort; `label` is what users see.

### Room

```ts
interface Room {
  id: string;
  floorId: string;
  name: string;
  polygon: LocalPolygon;          // building-local coordinates
  doors: RoomDoor[];               // access points to hallway network
  category?: string;               // "classroom", "office", "lab", "restroom", etc.
  capacity?: number;
}

interface RoomDoor {
  id: string;
  position: LocalCoord;           // door location in building-local coords
  width?: number;                   // meters
  accessible: boolean;              // wheelchair accessible
  isDefault: boolean;               // primary entrance for routing
  isEmergencyExit: boolean;         // emergency use only
  label?: string;                   // "Main", "Side", "Service"
}
```

Rooms are **destinations, not traversable space**. The route ends at the room's entrance, never routes through a room interior. In the compiled graph, a room becomes a terminal POI node connected to the nearest hallway waypoint via an access edge. Multiple `RoomDoor` entries produce multiple access edges — routing can choose the closest.

### Hallway

```ts
interface Hallway {
  id: string;
  floorId: string;
  name?: string;
  polyline: LocalCoord[];         // centerline in building-local coordinates (visual geometry)
  width?: number;                  // meters, for spatial queries
}
```

Hallways are **visual geometry** — the physical corridor shape. They do not directly contain navigation primitives. The compiler extracts a **Navigation Skeleton** from hallway geometry: it traces the centerline, identifies junctions and dead-ends, and generates waypoints and edges. This indirection matters because future sources (CAD, BIM, AI extraction, polygon-based floor plans) can feed the same skeleton extraction pipeline without changing the graph format.

### Road

```ts
interface Road {
  id: string;
  campusId: string;
  name?: string;
  polyline: LatLng[];             // world coordinates
  width?: number;
  type: "walkway" | "crosswalk" | "path" | "road";
}
```

Outdoor traversable paths connecting building entrances. The outdoor road network forms the campus-level graph skeleton. Roads connect to entrances, not to buildings directly.

### Entrance

```ts
interface Entrance {
  id: string;
  buildingId: string;
  name: string;
  position: LatLng;               // world coordinates
  floorLevel: number;              // which floor this entrance opens to (default: 0)
  accessible: boolean;             // wheelchair accessible
}
```

The bridge between outdoor and indoor routing. Each entrance generates two graph nodes (outdoor and indoor) connected by a transition edge. Routing never connects directly to a building — always through an entrance.

**Future:** `Entrance` should extend `TransitionConnector` in a unified family with stairs, elevators, escalators, and ramps — everything that changes navigation context. Not needed for M5; reserved for future modeling. The relationship would be: `TransitionConnector ← Entrance | VerticalConnector`.

### VerticalConnector

```ts
interface VerticalConnector {
  id: string;
  buildingId: string;
  name: string;                    // "Stair A", "Elevator 1"
  behavior: ConnectorBehavior;    // governs traversal semantics
  accessible: boolean;             // elevator: true, stairs: false typically
  emergencyOnly: boolean;          // fire stairs
  bidirectional: boolean;          // default true
  baseCost: number;                // traversal cost multiplier (stairs: 2-3, elevator: 1)
  capacity?: number;               // for future simulation
  stops: ConnectorStop[];
}

type ConnectorBehavior =
  | "stairs"
  | "elevator";
  // future: "escalator", "ramp", "moving-walkway"
```

A vertical transport entity. Does not directly hold per-floor data — that belongs to `ConnectorStop`. Abstract `behavior` replaces the flat `type` enum to allow future behaviors (escalator, ramp) without schema changes.

### ConnectorStop

```ts
interface ConnectorStop {
  id: string;
  connectorId: string;
  floorId: string;
  position: LocalCoord;            // landing position in building-local coords
  label?: string;                   // "Landing", "Elevator Lobby"
  rotation?: number;                // facing direction in degrees (for instruction generation)
  landingPolygon?: LocalPolygon;    // physical landing area
  connectedHallwayId?: string;      // which hallway this stop opens onto
  panorama?: Panorama;              // panorama anchored at this landing
  qr?: QR;                          // QR checkpoint at this landing
  accessible: boolean;              // override per stop
  metadata?: Record<string, unknown>;
}
```

Represents one floor's landing/stop for a `VerticalConnector`. Every floor landing is physically distinct — the stop captures floor-local state including its own panorama and QR. This avoids the validation burden of cross-referencing separate entities: `ConnectorStop.panorama` is always valid because it's owned inline. The compiler reads stops and generates edges between consecutive served floors. Elevators that skip floors (serves 1,2,3,5 but not 4) naturally have no edge to/from floor 4.

### Anchor

```ts
interface Anchor {
  id: string;
  floorId: string;
  position: LocalCoord;
}

interface VisualAnchor extends Anchor {
  icon?: string;
  label?: string;
}

interface Panorama extends VisualAnchor {
  panoramaId: string;
  heading?: number;
  pitch?: number;
}

interface QR extends VisualAnchor {
  url: string;
  label: string;
}

interface BLE extends Anchor {
  uuid: string;
  major?: number;
  minor?: number;
}

interface ARMarker extends VisualAnchor {
  markerType: "image" | "model" | "plane";
  assetUrl?: string;
}
```

A unified abstraction for fixed spatial reference points that are **not associated with a ConnectorStop**. Floor-level anchors (free-standing panoramas, standalone QR markers, BLE beacons, AR markers) extend this hierarchy. Anchors that belong to a specific landing live directly on `ConnectorStop.panorama` / `.qr` instead.

All anchors participate in validation (orphan detection), snapping (to nearest hallway), and search indexing.

---

## Ownership Hierarchy

```
Campus
  owns → Building
  owns → Road
Building
  owns → Floor
  owns → VerticalConnector  (not per-floor — one connector serves multiple floors)
  owns → Entrance
Floor
  owns → Room (owns RoomDoor)
  owns → Hallway
  owns → Anchor              (free-standing; connector-associated anchors live on ConnectorStop)
VerticalConnector
  owns → ConnectorStop      (cross-reference to Floor)
```

### Cascade Rules

- Deleting a building cascades to all floors, vertical connectors, entrances, and their children.
- Deleting a floor cascades to rooms, hallways, anchors, and connector stops on that floor.
- Deleting a vertical connector cascades to all its connector stops.
- A connector stop is orphaned if either its parent connector or parent floor is deleted. Both validations fire.

---

## Navigation Semantics

### What is traversable

| Entity | Role | Graph Node Type | Graph Edge Type | Notes |
|--------|------|----------------|----------------|-------|
| Hallway | Traversable | Waypoint | hallway | Waypoints at junctions/dead-ends |
| Road | Traversable | waypoint | road | Outdoor paths |
| Stairs | Transition | — | stairs | Generated by compiler from stops |
| Elevator | Transition | — | elevator | Generated by compiler from stops |
| Entrance | Transition | entrance-outdoor, entrance-indoor | entrance | Two nodes, one edge |

### What is a destination (terminal POI)

| Entity | Graph Role | Connected Via |
|--------|-----------|---------------|
| Room | POI node (terminal) | access edge from nearest waypoint |
| Building | Logical scope | Not a graph element; entered via entrance nodes |

### What is metadata only (not in graph)

| Entity | Handled By |
|--------|-----------|
| Panorama | Visual presentation layer |
| QR | Visual presentation layer |
| Floor label | Visual presentation layer |
| Room capacity | Instruction generation, POI detail |
| Building footprint | Visual presentation layer |
| ConnectorStop rotation | Instruction generation |

---

## Navigation Primitives (Intermediate Representation)

Between authored entities and the compiled graph, the compiler operates on an intermediate representation: **Navigation Primitives**. These are not editor entities (not persisted in CampusDocument) and not yet the final graph. They are a compiler-internal stage that decouples entity extraction from graph generation.

```
Authored Entities                Navigation Primitives              NavigationGraph
─────────────────────            ──────────────────────             ────────────────
Hallway polyline      ──►       Skeleton (waypoints)     ──►        NavNode/Edge
Room polygon          ──►       POI + AccessPoints       ──►        POI node + access edge
Road polyline         ──►       RoadSkeleton             ──►        Road node/edge
VerticalConnector     ──►       TransitionPoints         ──►        Transition edges
Entrance              ──►       EntrancePortals          ──►        Entrance nodes + edge
```

### Primitive types

```ts
type NavigationPrimitive =
  | Waypoint              // hallway junction or dead-end
  | RoadJunction          // outdoor path junction
  | POI                   // room, anchor (terminal node)
  | AccessPoint           // door connecting POI to waypoint
  | TransitionPoint       // connector stop at one floor
  | EntrancePortal        // indoor↔outdoor pair
  | SkeletonEdge          // hallway or road segment between waypoints
```

### Why this exists

1. **Multiple source formats.** Hallway polylines, CAD imports, BIM extraction, and AI-generated floor plans can all produce `Waypoint`/`SkeletonEdge` primitives.
2. **Compiler modularity.** Phase 3 (extract) is independent from Phase 4–7 (connect, validate). Replacing the extraction algorithm doesn't change graph generation.
3. **Debuggability.** Primitives can be serialized for inspection, test assertions, and visualization — without leaking editor entity types into the graph.

---

## Compiler Pipeline (Phased)

The compiler transforms `CampusDocument` into publishable artifacts through discrete phases:

```
Phase 1:  Extract Document
          Read CampusDocument, validate structure
            │
            ▼
Phase 2:  Normalize Geometry
          Convert world ↔ local coords, snap to grid
            │
            ▼
Phase 3:  Generate Navigation Primitives
          (compiler-internal intermediate representation)
          Hallway geometry → Navigation Skeleton → waypoints + skeleton edges
          Road geometry → road junctions + road edges
          Rooms → POI primitives + access points
          Anchors → POI primitives
            │
            ▼
Phase 4:  Connect Indoor Graph
          For each building:
            Connect waypoints at hallway junctions
            Attach rooms/anchors to nearest waypoint
            Attach connector stops to nearest waypoint
            │
            ▼
Phase 5:  Connect Outdoor Graph
          Roads → waypoints at junctions/intervals
          Connect entrance-outdoor nodes to road graph
            │
            ▼
Phase 6:  Connect Vertical Transitions
          For each VerticalConnector:
            Generate edges between consecutive served floors
            Attach to indoor graph via connector stop waypoints
          For each Entrance:
            Generate entrance-outdoor → entrance-indoor edge
            Connect entrance-indoor to nearest hallway waypoint
            │
            ▼
Phase 7:  Merge Graphs
          Single NavigationGraph with all node/edge types
            │
            ▼
Phase 8:  Validate Graph
          Connectivity check, orphan detection, cost bounds
            │
            ▼
Phase 9:  Generate Search Index
          SearchIndex, BuildingIndex, POIIndex
            │
            ▼
Phase 10: Publish Artifacts
          Serialize to deployment format
```

### Compiler Transformation Detail

```
Phase 3 — Generate Navigation Primitives
=========================================
For each Hallway polyline:
  → Extract junction points (where ≥2 hallways meet)
  → Extract dead-end points (hallway endpoints)
  → Generate waypoint nodes at junctions + dead-ends
  → Generate hallway edges between consecutive waypoints

For each Road polyline:
  → Extract junction points (where ≥2 roads meet)
  → Generate road waypoint nodes
  → Generate road edges between consecutive waypoints

For each Room:
  → Find nearest hallway waypoint
  → Generate POI node at room centroid or door position
  → Generate access edge (waypoint → POI)

For each Anchor:
  → Find nearest hallway waypoint
  → Generate POI node at anchor position
  → Generate access edge (waypoint → POI)


Phase 4 — Connect Indoor Graph
================================
For each building:
  - Merge waypoints that are within snap tolerance
  - Ensure all waypoints are reachable (connected subgraph per floor)
  - Mark disconnected segments as validation warnings


Phase 5 — Connect Outdoor Graph
================================
For each Entrance:
  → Generate entrance-outdoor node at position (world coords)
  → Generate entrance-indoor node at position (local coords on floorLevel)
  → Generate entrance transition edge (cost: small constant)
  → Connect entrance-outdoor to nearest road waypoint
  → Connect entrance-indoor to nearest hallway waypoint


Phase 6 — Connect Vertical Transitions
=======================================
For each VerticalConnector:
  Sort stops by floor level ascending
  For each consecutive pair (stopN, stopN+1):
    → Generate transition edge: stairs | elevator | ...
    → cost = baseCost × vertical distance
    → Connect each stop to nearest hallway waypoint on its floor
```

### The resulting graph

```
[RoadWP] ===road=== [RoadWP] ====road==== [EntranceOutdoor_A]
                                                 │
                                           [entrance]
                                                 │
                                           [EntranceIndoor_A]
                                                 │
                                           [hallway]
                                                 │
                      [HallwayWP] ===hallway=== [HallwayJunction]
                           │                        │
                     [access]                  [access]
                           │                        │
                       [Room 101]              [Room 102]
                                                 │
                                           [stairs]
                                                 │
                      [HallwayWP] ===hallway=== [HallwayJunction]
                           │                        │
                     [access]                  [access]
                           │                        │
                       [Room 201]              [Room 202]
```

### Node types in the compiled graph

```ts
type NavNodeType =
  | "waypoint"           // hallway junction or endpoint
  | "road"               // outdoor path junction
  | "poi"                // room, anchor (terminal)
  | "entrance-outdoor"   // outdoor side of entrance
  | "entrance-indoor"    // indoor side of entrance
  | "transition"         // abstract; edges connect stop to stop
```

### Edge types in the compiled graph

```ts
type NavEdgeType =
  | "hallway"
  | "road"
  | "stairs"
  | "elevator"
  | "entrance"
  | "access";            // waypoint → POI
```

---

## Runtime Consumption Model

### What the runtime sees

The runtime receives a compiled `NavigationGraph` containing only:

```ts
interface NavNode {
  id: string;
  position: LatLng;
  floor: number;
  buildingId?: string;
  type: NavNodeType;
}

interface NavEdge {
  id: string;
  from: string;
  to: string;
  type: NavEdgeType;
  baseCost: number;
  accessible: boolean;
}
```

### What the runtime deliberately does NOT see

- `CampusDocument` types (Room, Floor, Building, etc.)
- Polygons, footprints, floor plans
- Labels, names, metadata
- Authoring model entities

### RoutePolicy interface

```ts
interface RoutePolicy {
  edgeCost(edge: NavEdge): number;
}

class ShortestPolicy implements RoutePolicy {
  edgeCost(edge) { return edge.baseCost; }
}

class AccessiblePolicy implements RoutePolicy {
  edgeCost(edge) {
    if (!edge.accessible) return Infinity;
    return edge.baseCost;
  }
}

class AvoidStairsPolicy implements RoutePolicy {
  edgeCost(edge) {
    if (edge.type === 'stairs') return Infinity;
    return edge.baseCost;
  }
}

class EmergencyPolicy implements RoutePolicy {
  edgeCost(edge) {
    if (edge.type === 'elevator') return Infinity;
    if (edge.type === 'entrance' && /* locked */) return Infinity;
    return edge.baseCost;
  }
}
```

Initially only `ShortestPolicy` ships. The interface reserves space for future policies without changing the routing engine.

### Search

Search is a first-class consumer of compiled artifacts. `SearchIndex` (generated in compiler Phase 9) maps human-readable queries to `NavNode` references:

```
SearchIndex
    │
    ▼
SearchEngine
    │
    ▼
SearchResult → RouteEngine
```

```
SearchResult {
  nodeId: string;        // target NavNode (POI, waypoint, or entrance)
  label: string;         // "Room 204", "Engineering Building"
  type: "room" | "building" | "poi" | "anchor";
  floor?: number;
  buildingName?: string;
}
```

The route engine receives a target `NavNode` — the same routing algorithm works for any destination type. Searching "Room 204" resolves to the room's POI node; routing finds the best path to that node.

### Instruction generation

Post-processing on the routed path. A separate `InstructionGenerator` subsystem (not part of A*):

```
A* → Path → InstructionGenerator → Instruction[]
```

```ts
interface NavigationInstruction {
  type: "walk" | "turn" | "enter-building" | "exit-building"
       | "take-stairs" | "take-elevator" | "arrive";
  text: string;
  distance?: number;
  floor?: number;
  buildingName?: string;
  landmark?: string;
}
```

Generation rules:
- Crossing `entrance` edge → "Enter/Exit <Building>"
- Crossing `stairs` edge with floor change → "Take stairs to Floor N"
- Crossing `elevator` edge with floor change → "Take elevator to Floor N"
- Hallway direction change > 30° → "Turn left/right"
- Otherwise → "Walk <distance>"
- Arriving at POI terminal → "Arrive at <Room>"

---

## Rendering Separation (Invariant)

The compiler output is **never** consumed by the rendering pipeline. This is an absolute invariant:

```
CampusDocument ──────► EntityRenderer     ← renders floor plans, buildings
       │
       ▼
    Compiler
       │
       ▼
  NavigationGraph ──► RouteEngine          ← computes paths
                           │
                           ▼
                    InstructionGenerator   ← generates instructions
```

Changing the compiler algorithm (e.g., hallway midpoint nodes → navigation mesh) must not change what the user sees on the map. The map shows authored geometry. The route overlay shows compiled geometry. These are two independent data sources rendered by two independent subsystems.

---

## Complete System Lifecycle

```
┌──────────────────────────────────────────────────────────────────┐
│                          EDITOR                                   │
│                                                                   │
│  Tool ──► Command ──► CampusDocument ──► DocumentStore.commit()  │
│                                                    │              │
│                                           revision.committed      │
│                                                    │              │
│                          ┌────────────────────────┼──────────┐    │
│                          ▼                        ▼          ▼    │
│                      History                Validation   Autosave │
│                      (undo/redo)            (mark dirty) (save)   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
                           │
                           ▼
                     PublishService
                           │
                           ▼
                     @navi/compiler
                           │
                           ▼
                  NavigationArtifacts
                           │
                    ┌──────┼──────┐
                    ▼      ▼      ▼
              NavGraph  Search   Spatial + Building
                         Index    Indexes
                           │
                           ▼
                    ┌──────┴──────┐
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                        RUNTIME                                    │
│                                                                   │
│              ┌─────────────────────────┐                          │
│              │    RuntimeEngine         │                          │
│              │                         │                          │
│              │  SearchEngine ──► Route  │                          │
│              │         │         │      │                          │
│              │         │    RoutePolicy  │                          │
│              │         ▼         │      │                          │
│              │    SearchResult   │      │                          │
│              │              ┌────┘      │                          │
│              │              ▼           │                          │
│              │         A* Search        │                          │
│              │              │           │                          │
│              │              ▼           │                          │
│              │      InstructionGenerator│                          │
│              └─────────────────────────┘                          │
│                           │                                        │
│                           ▼                                        │
│                    MapLibre (blue dot, route line,                 │
│                              floor transitions,                    │
│                              turn-by-turn UI)                      │
└──────────────────────────────────────────────────────────────────┘
```

---

## Mapping to Existing Types

| Domain Entity | Current Type | Status |
|--------------|-------------|--------|
| Campus | `CampusDocument` | ✅ Exists |
| Building | `Building` | ✅ Exists (needs elevation, metadata) |
| Floor | `Floor` | ✅ Exists (needs label, visible, locked) |
| Room | `Room` | ✅ Exists (needs RoomDoor) |
| RoomDoor | — | 🆕 New entity |
| Hallway | `Hallway` | ✅ Exists |
| Road | `Road` | ✅ Exists |
| Entrance | `Entrance` | ✅ Exists (needs floorLevel; future TransitionConnector) |
| VerticalConnector | `Staircase` / `Elevator` | 🔄 Merge into VerticalConnector + ConnectorStop |
| ConnectorStop | — | 🆕 New entity |
| Panorama (free-standing) | `Panorama` | 🔄 Refactor into Anchor hierarchy |
| QR (free-standing) | `QRCheckpoint` | 🔄 Refactor into Anchor hierarchy |
| Anchor base | — | 🆕 New abstraction |
| Navigation Primitives | — | 🆕 Compiler-internal IR |
| NavigationArtifacts | — | 🆕 Compiler output bundle |
| RoutePolicy | — | 🆕 New abstraction |
| InstructionGenerator | — | 🆕 New subsystem |
| SearchEngine | — | 🆕 New subsystem |
| Outdoor Graph | Compiled edges | ✅ Generated by compiler |
| Indoor Graph | Compiled edges | ✅ Generated by compiler |
