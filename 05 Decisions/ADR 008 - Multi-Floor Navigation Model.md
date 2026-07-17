# ADR 008 - Multi-Floor Navigation Model

**Status:** Accepted
**Date:** 2026-07-16
**Author:** opencode Architecture Agent

## Context

ADR 006 established `CampusDocument` as the single source of truth and ADR 007 established the transaction model. These ADRs completed the migration from the legacy `Graph` class and gave the editor a clean architectural foundation.

With M4 frozen, the next major feature is **multi-floor navigation** — the ability to route across floors within a building (stairs, elevators) and between outdoor and indoor spaces (entrances). This introduces a fundamentally new **vertical dimension** to the navigation graph, and it requires revisiting the domain model, compiler design, and runtime interfaces.

Before M5, the navigation model was implicitly 2D:

- Rooms and hallways existed on a single plane
- Staircases and elevators were editor entities but lacked a formal connection model
- The compiler had no concept of vertical transitions
- Outdoor routing (roads) was disconnected from indoor routing

M5 introduces a 3D navigation graph where vertical transitions — stairs, elevators, entrances — are first-class edges with explicit semantics.

The core challenge: **how should a real campus with buildings, floors, stairs, elevators, entrances, outdoor paths, and indoor spaces be modeled as a unified navigation graph?**

## Decision

### 1. Navigation Layers

The platform is organized into six layers with strict boundaries:

```
Campus Layer      ─ CampusDocument (authored entities)
Building Layer    ─ per-building entity scope
Floor Layer       ─ rooms, hallways, connector stops, anchors
Navigation Layer  ─ NavNode, NavEdge (compiled output)
Runtime Layer     ─ A*, policies, instruction generation
Presentation Layer ─ map rendering, route display, instructions UI
```

Rules:
- The compiler is the **only** translation boundary between authored layers and the navigation layer.
- The runtime never imports authored entity types (Room, Floor, Building, etc.).
- The compiler output is **never** consumed by the rendering pipeline.

### 2. Visual vs Navigation Presentation

The presentation layer splits into two independent siblings:

- **Visual Presentation**: reads `CampusDocument` directly — renders buildings, floor plans, polygons, labels, panoramas. This is `EntityRenderer`.
- **Navigation Presentation**: reads compiled `NavigationGraph` — renders blue dot, route line, ETA, turn instructions, floor transitions.

These are independent data sources rendered by independent subsystems. Changing the compiler algorithm must not change the rendered floor plan.

### 3. New Entity Model

#### VerticalConnector + ConnectorStop

Replace the flat `Staircase`/`Elevator` types with a split model:

- `VerticalConnector` — building-level entity (`Stair A`, `Elevator 1`) with abstract `behavior` (`stairs | elevator | escalator | ramp`), `baseCost`, `accessible`, `emergencyOnly`, `bidirectional`
- `ConnectorStop` — per-floor landing owned by a connector, embedding `position`, `rotation`, `landingPolygon`, `connectedHallwayId`, and inline `panorama`/`qr`

A connector does not directly hold per-floor data. Each stop captures floor-local state. The compiler reads stops and generates transition edges between consecutive served floors. Elevators skipping a floor (serves 1,2,3,5) naturally omit edges to/from floor 4.

#### Anchor hierarchy

Introduce an `Anchor` base class for all fixed spatial reference points:

```
Anchor
  ├── VisualAnchor (icon, label)
  │     ├── Panorama (panoramaId, heading, pitch)
  │     ├── QR (url, label)
  │     └── ARMarker (markerType, assetUrl)
  └── BLE (uuid, major, minor)
```

Anchors associated with a connector landing live inline on `ConnectorStop.panorama` / `.qr`. Free-standing anchors (floor-level, not connector-associated) live on `Floor.anchors[]`.

#### RoomDoor

Replace `doors?: LocalCoord[]` with a proper `RoomDoor` entity:

```ts
RoomDoor { id, position, width, accessible, isDefault, isEmergencyExit, label }
```

Rooms are destinations, not traversable space. Each door produces an access edge to the nearest hallway waypoint. Routing can choose the closest door.

#### Entrance as transition

`Entrance` bridges outdoor and indoor routing. Each entrance generates:
- An `entrance-outdoor` node (world coords, connected to road graph)
- An `entrance-indoor` node (local coords on `floorLevel`, connected to hallway graph)
- An `entrance` transition edge between them

Routing never connects to a building directly — always through an entrance. In the future, `Entrance` should extend a unified `TransitionConnector` family with stairs and elevators.

### 4. Navigation Primitives (Compiler Intermediate Representation)

Between authored entities and the final `NavigationGraph`, the compiler operates on an intermediate representation:

```
Authored Entity → Navigation Primitive → Graph Element

Hallway polyline → Waypoint / SkeletonEdge → NavNode / NavEdge
Room polygon     → POI + AccessPoint       → POI node + access edge
Road polyline    → RoadJunction            → Road node/edge
VerticalConnector → TransitionPoint        → Transition edges
Entrance          → EntrancePortal         → Entrance nodes + edge
```

This decouples entity extraction from graph generation. Future sources (CAD, BIM, AI extraction, polygon-based floor plans) can all produce primitives without changing graph generation.

### 5. Compiler Pipeline (10 Phases)

```
Phase  1: Extract Document
Phase  2: Normalize Geometry
Phase  3: Generate Navigation Primitives
Phase  4: Connect Indoor Graph
Phase  5: Connect Outdoor Graph
Phase  6: Connect Vertical Transitions
Phase  7: Merge Graphs
Phase  8: Validate Graph
Phase  9: Generate NavigationArtifacts (Graph, SearchIndex, SpatialIndex, BuildingIndex)
Phase 10: Publish Artifacts
```

### 6. NavigationArtifacts (Compiler Output)

The compiler produces a bundle of artifacts:

- `NavigationGraph` — unified graph with all node/edge types
- `SearchIndex` — maps queries to NavNode references
- `SpatialIndex` — spatial queries (nearest node to GPS coordinate)
- `BuildingIndex` — per-building graph sub-views

### 7. RoutePolicy Interface

The runtime receives `NavNode`, `NavEdge`, and a `RoutePolicy`:

```ts
interface RoutePolicy { edgeCost(edge: NavEdge): number; }
```

Policies (Shortest, Accessible, AvoidStairs, Emergency) are pluggable. Initially only `ShortestPolicy` ships. The interface reserves future policies without changing the routing engine.

### 8. InstructionGenerator as Separate Subsystem

```
A* → Path → InstructionGenerator → Instruction[]
```

Routing answers which nodes; instruction generation answers how to explain the route to a human. They are separate subsystems.

### 9. Search as First-Class Consumer

```
SearchIndex → SearchEngine → SearchResult → RouteEngine
```

Search resolves human-readable queries ("Room 204") to `NavNode` references. The same routing algorithm works for any destination type.

## Consequences

### Positive

- **Vertical dimension is now formally modeled.** Stairs, elevators, and entrances are first-class transitions with explicit semantics. No more implicit connections or per-floor inference.
- **Visual and navigation pipelines are uncoupled.** Changing the compiler algorithm does not change the rendered map. This was an invariant in ADR 006; ADR 008 formalizes it.
- **Compiler intermediate representation enables multiple source formats.** Hallway polylines, CAD imports, BIM extraction, and AI-generated floor plans all feed the same compiler. The graph generation phase does not change.
- **Runtime is completely domain-agnostic.** It receives nodes, edges, and costs. No authored entity types leak. This matches ADR 006's invariant that only `CampusDocument` is the authoring model.
- **NavigationArtifacts bundle is extensible.** New artifact types (POIIndex, LandmarkIndex) can be added without changing the compiler pipeline structure.
- **ConnectorStop ownership eliminates orphan validation.** Panoramas and QR markers at landings are owned inline rather than cross-referenced by ID. Fewer validation rules, simpler data model.

### Negative

- **Existing Staircase/Elevator entities must migrate.** The flat `type` field becomes abstract `behavior`; per-floor data moves to `ConnectorStop`. This is a breaking change to the `CampusDocument` schema requiring a migration step.
- **ConnectorStop splits responsibility.** It is owned by `VerticalConnector` but cross-references `Floor` via `floorId`. Both cascade rules fire on delete (orphan if parent connector or parent floor is removed).
- **Compiler intermediate representation adds an abstraction layer.** Developers debugging the compiler must understand three stages (entity → primitive → graph) instead of two (entity → graph).
- **NavigationArtifacts bundle is new.** Downstream consumers (search, runtime) must be updated to read from the new bundle format instead of raw graph output.

## Architectural Invariants

1. **Compiler is the only translation boundary.** No editor code directly creates `NavNode` or `NavEdge`. No runtime code reads `CampusDocument`.
2. **Compiler output is never rendering input.** `EntityRenderer` reads authored geometry. Route overlay is a separate layer.
3. **Runtime never imports authored types.** The runtime package has zero dependency on `@navi/core` entity types.
4. **ConnectorStop inline ownership.** Panorama/QR at landings are embedded in `ConnectorStop`, not cross-referenced by ID.
5. **Rooms are terminal POIs.** No route passes through a room interior. All room access is via `RoomDoor` → hallway waypoint.

## Alternatives Considered

| Alternative | Pros | Cons | Reason Rejected |
|---|---|---|---|
| Keep flat Staircase/Elevator with `servedFloors[]` | Simple, fewer types | Connector object grows with per-floor data; no clear boundary for landing-specific state | ConnectorStop splits per-floor concerns cleanly |
| Panorama/QR as cross-referenced IDs | Familiar pattern | Validation burden; orphan detection; inconsistent with "owned" pattern elsewhere in document | Inline ownership on ConnectorStop avoids the cross-reference problem |
| Rooms as traversable waypoints | Simple graph | Routes pass through classrooms; semantically wrong | Rooms are destinations, proven by real-world navigation systems |
| Runtime receives full entity model | Direct access to metadata | Couples runtime to authoring model; changes to editor schema change runtime | ADR 006 requires runtime to read compiled artifacts only |
| Single compiler output (graph only) | Simple bundle | Search requires separate index; spatial queries need spatial index | NavigationArtifacts bundle groups all outputs |

## Related

- Depends on: ADR 006 (CampusDocument as Source of Truth), ADR 007 (Document Transaction Model)
- Supersedes: the implicit 2D-only navigation model that existed before M5
- Referenced by: `spec/M5-DOMAIN-MODEL.md` (domain model specification), `packages/compiler/`, `packages/runtime/`, `packages/core/`
- Enables: M5 (Multi-Floor Navigation), M6 (Runtime, Search, Offline), future AR guidance and accessibility routing
