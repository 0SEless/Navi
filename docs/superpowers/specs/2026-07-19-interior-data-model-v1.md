# Interior Data Model v1

Date: 2026-07-19
Status: Draft
Parent: Interior Editor Workspace v1
Next: Interior Tool System v1

## Purpose

Define the entity structure of a building's interior — what belongs to each level, how entities reference each other, and what the data ownership boundaries are. This document drives the Canvas, the Inspector panels, and the Navigation Graph.

---

## 1. Entity Hierarchy

```
Campus
└── Building (1)
    ├── Floor (N)
    │   ├── Space (N)          ← rooms, lobbies, atriums, etc.
    │   ├── Hallway (N)
    │   ├── Entrance (N)
    │   ├── StairConnection (N)
    │   ├── ElevatorConnection (N)
    │   └── PanoramaNode (N)
    ├── OutdoorEntrance (N)
    └── BuildingMetadata (1)

The Compiled Navigation Graph is not stored per-floor. It is derived from geometry by the Compiler.
```

A Campus contains Buildings. A Building contains Floors. Floors contain interior entities.

No entity at the Floor level ever belongs directly to a Building or Campus.

---

## 2. Architectural Principle

> **The Interior Editor edits building geometry. It never edits navigation behavior. Navigation behavior is derived by the Graph Compiler.**

This principle governs every decision in the Interior Editor:

- Every tool edits **geometry or metadata** — rooms, hallways, entrances, stairs, elevators, panoramas.
- No tool edits **compiled artifacts** — navigation nodes, edges, routing preferences, QR codes.
- The Graph Compiler derives nodes and edges from geometry. The compiled graph is never manually authored (except in advanced debug mode).
- Completion percentage is **computed, never stored** — derived from metadata completeness + geometry coverage + validation pass rate. A Completion Service calculates this on demand; no sync needed.
- The Interior Editor's job ends at "geometry complete." Publishing is the Campus Workspace's responsibility. The Interior Editor should not know the Publish button exists.

---

## 3. Building-Level Data

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| name | string | Display name |
| code | string | Short code (e.g., "ENG") |
| category | enum | academic, administrative, residential, facility, parking |
| position | GeoJSON Point | Building footprint centroid |
| footprint | GeoJSON Polygon | Building outline |
| height | number (meters) | Building height |
| elevation | number (meters) | Ground elevation above sea level |
| color | hex | Display color on campus map |
| floors | Floor[] | Ordered list of floor references |
| outdoorEntrances | OutdoorEntrance[] | Entrances from outside |

Building-level data is authored in the Campus Workspace. The Interior Editor reads it but never modifies it.

---

## 4. Floor-Level Data

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| buildingId | UUID | Parent building |
| name | string | Display name (e.g., "Ground Floor") |
| level | integer | Vertical order (0 = ground, -1 = basement, 1 = second) |
| color | hex \| null | Display color on floor selector |
| visible | boolean | Whether the floor is shown in the runtime |
| locked | boolean | Prevent edits (for published floors) |
| notes | string | Admin notes (not visible to users) |
| floorPlan | FloorPlan \| null | Uploaded reference image |
| floorPlanState | enum | none, calibrating, active, locked |

A floor exists even without a floor plan. It can hold geometry directly (via Start Drawing).

### FloorPlan

| Field | Type | Description |
|-------|------|-------------|
| imageUrl | string | Uploaded image path |
| width | number (pixels) | Original image width |
| height | number (pixels) | Original image height |
| calibration | Calibration \| null | Mapping from pixels to floor coordinates |

### Calibration

| Field | Type | Description |
|-------|------|-------------|
| originX | number (meters) | Floor coordinate X at image top-left |
| originY | number (meters) | Floor coordinate Y at image top-left |
| scale | number (m/px) | Meters per pixel |
| rotation | number (degrees) | Image rotation (usually 0) |

---

## 5. Space

Not every interior polygon is a room. Lobbies, atriums, food courts, waiting areas, and open spaces are all spaces with different semantics. The model captures them uniformly with a `type` field.

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| floorId | UUID | Parent floor |
| name | string | Display name |
| number | string | Room number (e.g., "201") |
| type | enum | classroom, office, lab, auditorium, lobby, atrium, food_court, restroom, storage, utility, waiting_area, garden, other |
| capacity | integer | Maximum occupancy |
| polygon | GeoJSON Polygon | Space boundary in floor coordinates |
| adjacentHallwayIds | UUID[] | References to hallways this space connects to |

The graph compiler creates a space anchor node from each space. The space does not store which node represents it — that is the graph's concern.

### Space Constraints

- Polygon must be closed and non-self-intersecting
- Minimum area: 1m²
- Spaces must not overlap (validated)
- A space must be adjacent to at least one hallway to be reachable

---

## 6. Hallway

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| floorId | UUID | Parent floor |
| name | string | Display name |
| geometry | GeoJSON Polygon \| GeoJSON LineString | Hallway shape |
| width | number (meters) | Hallway width (only when geometry is LineString) |

The graph compiler derives hallway endpoints and edges from the geometry. The hallway does not store which nodes represent it.

### Hallway Constraints

- If Polygon: closed, non-self-intersecting, no minimum area
- If LineString: width > 0, defines a corridor with uniform width along the path
- Hallways may intersect (crossings are normal)
- Hallway endpoints are auto-navigation-nodes

---

## 7. Entrance — the outdoor-to-indoor bridge

The entrance is where outdoor routing crosses into indoor routing. Conceptually, this is a single doorway viewed from two workspaces — the **Building Entrance (Campus side)** and the **Building Entrance (Interior side)**. Long-term they may become a single logical entity with two geometric representations. For now, they are paired by reference.

```
Outdoor Graph
      │
Outdoor Entrance (Campus Workspace)
      │
Indoor Entrance (Interior Editor)
      │
Indoor Graph
```

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| floorId | UUID | Parent floor |
| name | string | Display name |
| position | GeoJSON Point | Position in floor coordinates |
| type | enum | main, side, service, emergency |
| outdoorEntranceId | UUID \| null | Reference to paired outdoor entrance |
| connectedHallwayId | UUID \| null | Nearest hallway this entrance connects to |

### Entrance Constraints

- Position must be near the floor boundary (validated)
- Must connect to at least one hallway to be usable

---

## 8. StairConnection

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| name | string | Display name |
| floorPairs | StairFloorPair[] | List of connected floors |

### StairFloorPair

| Field | Type | Description |
|-------|------|-------------|
| floorId | UUID | Floor this stair is on |
| position | GeoJSON Point | Position in that floor's coordinates |
| connectedHallwayId | UUID \| null | Nearest hallway on that floor |

### Stair Constraints

- Must have at least 2 floor pairs (connects at least 2 floors)
- Each floor pair has its own position (stairs occupy different locations on each floor)
- All floor pairs share the same `stairId` — that is how cross-floor connectivity is established

---

## 9. ElevatorConnection

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| name | string | Display name |
| floorPairs | ElevatorFloorPair[] | List of connected floors |

### ElevatorFloorPair

| Field | Type | Description |
|-------|------|-------------|
| floorId | UUID | Floor this elevator is on |
| position | GeoJSON Point | Position in that floor's coordinates |
| connectedHallwayId | UUID \| null | Nearest hallway on that floor |

### Elevator Constraints

- Same structure as StairConnection
- Elevators can connect 2+ floors
- Each floor has its own position (elevator shaft position in building coordinates is shared, but the access point on each floor may differ)

---

## 10. PanoramaNode

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| floorId | UUID | Parent floor |
| name | string | Display name |
| position | GeoJSON Point | Position in floor coordinates |
| heading | number (degrees) | Initial camera heading (0–360) |
| imageUrl | string \| null | 360° image path |
| captureDate | date \| null | When the panorama was captured |
| interactionHotspots | InteractionHotspot[] | Links to panoramas, spaces, buildings, URLs, or info cards (future) |

### InteractionHotspot

| Field | Type | Description |
|-------|------|-------------|
| targetType | enum | panorama, space, building, url, info |
| targetId | UUID \| string | Target identifier (UUID for entities, URL for web links) |
| position | { x, y } | Position in source panorama (normalized 0–1) |
| label | string | Display label for the hotspot

### Panorama Constraints

- Must be inside a space or hallway (validated against geometry)
- heading is optional (defaults to 0)

---

## 11. Compiled Navigation Graph (per floor)

The compiled navigation graph is not stored as authored data. It is **generated** by the Graph Compiler from the floor's geometry (spaces, hallways, entrances, stairs, elevators). Geometry owns geometry. The compiler owns the graph.

```
Interior Geometry
    ↓
Graph Compiler
    ↓
Compiled Navigation Graph
```

### NavNode

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| floorId | UUID | Parent floor |
| position | GeoJSON Point | Position in floor coordinates |
| nodeType | enum | hallway_endpoint, space_anchor, stair_point, elevator_point, entrance_point, panorama_point, waypoint |
| entityId | UUID \| null | Reference to the entity that created this node |

### NavEdge

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| floorId | UUID | Parent floor |
| sourceNodeId | UUID | Source node |
| targetNodeId | UUID | Target node |
| weight | number (meters) | Edge length |
| direction | enum | bidirectional, forward, backward |
| entityId | UUID \| null | Reference to the entity that created this edge |

### CrossFloorEdge

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier |
| sourceFloorId | UUID | Source floor |
| sourceNodeId | UUID | Node on source floor |
| targetFloorId | UUID | Target floor |
| targetNodeId | UUID | Node on target floor |
| connectionType | enum | stair, elevator |

---

## 12. Entity References

| Source | Target | Via |
|--------|--------|-----|
| Space | Hallway | adjacentHallwayIds |
| Entrance | OutdoorEntrance | outdoorEntranceId |
| Entrance | Hallway | connectedHallwayId |
| StairConnection | Hallway | floorPairs[].connectedHallwayId |
| ElevatorConnection | Hallway | floorPairs[].connectedHallwayId |
| Panorama | (spatial) | position inside space/hallway polygon |
| NavNode | Geometry entity | entityId (link from compiled graph back to source) |
| NavEdge | Geometry entity | entityId (link from compiled graph back to source) |
| Floor | Building | buildingId |

All references are UUIDs. No nested entity trees at the data layer — only flat collections with parent IDs.

---

## 13. Data Ownership Summary

| Entity | Owner |
|--------|-------|
| Building | Campus Workspace |
| Floor | Interior Editor |
| Space | Interior Editor |
| Hallway | Interior Editor |
| Entrance | Interior Editor |
| StairConnection | Interior Editor |
| ElevatorConnection | Interior Editor |
| PanoramaNode | Interior Editor |
| Compiled Navigation Graph | Graph Compiler (derived, not authored) |
| QR Code | QR Manager |

---

## 14. Validation Rules (summary)

These rules are checked by the Canvas validation system and should be reflected in the entity model:

| Rule | Scope | Type |
|------|-------|------|
| Space polygon is closed and non-self-intersecting | per-space | error |
| Space area >= 1m² | per-space | error |
| No overlapping spaces | per-floor | error |
| Space has at least one hallway adjacency | per-space | error |
| Hallway width > 0 | per-hallway | error |
| Entrance connects to a hallway | per-entrance | error |
| Stair connects at least 2 floors | per-stair | error |
| Elevator connects at least 2 floors | per-elevator | error |
| Panorama is inside a space or hallway | per-panorama | warning |
| Space has a name | per-space | warning |
| Every accessible space is reachable from at least one entrance via graph | per-floor | error |
| Dead-end hallway longer than 20m | per-hallway | warning |

---

## 15. Architecture Pipeline

The data model flows through four cleanly separated layers:

```
Campus
    │
    ▼
Building
    │
    ▼
Interior Geometry
(Space, Hallway, Entrance, Stair, Elevator, Panorama)
    │
    ▼
Graph Compiler
(derives nodes, edges, connectivity from geometry)
    │
    ▼
Compiled Navigation Graph
(per-floor node/edge network, cross-floor edges)
    │
    ▼
QR Manager
(attaches deployment info to entities)
    │
    ▼
Runtime
(consumes compiled graph + QR data — never reads raw geometry)
```

Each stage has a single responsibility. The runtime never reads raw geometry — it consumes the compiled graph. The QR Manager never edits geometry — it only attaches deployment metadata. That separation is what will keep NAVI maintainable as the campus grows.
