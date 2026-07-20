# M5 Phase 2 — Compiler Implementation Plan

**Spec:** `spec/M5-P2-COMPILER-TRANSFORMATION.md`
**Contract:** ADR-009 (`05 Decisions/ADR 009 - Compiler Pipeline and Navigation Primitive Generation.md`)
**Status:** Draft

---

## Overview

Transform the existing 6-stage compiler to consume M5 domain model entities (`VerticalConnector`, `ConnectorStop`, `RoomDoor`, `Anchor`) through a new 4-stage pipeline (Normalize → Generate Primitives → Build Graph → Assemble Artifacts) while keeping the legacy path intact.

The new pipeline lives alongside the old one. `compileV2()` is the migration endpoint. Old `compile()` is unchanged.

## Success Criteria

1. Compiler types (`PrimitiveGraph`, `CompilerReport`, `NavigationArtifacts`, `SkeletonGenerator`) defined and exported
2. Five independent primitive extractors produce correct output, verified by per-extractor unit tests
3. `PolylineSkeletonGenerator` samples hallway/road geometry into waypoints + skeleton edges
4. Phase 2.3 connects primitives (nearest-waypoint, transition pairing, portal edges) — no spatial logic leaks into later phases
5. Phase 3.1 normalizes (snap, merge, pair) — modifies the graph
6. Phase 3.2 validates (orphan, disconnect, dangling) — read-only, never mutates
7. Phase 3.3 emits NavNode/Edge — pure mechanical transform, zero spatial search
8. Phase 4 assembles `NavigationArtifacts` bundle with `extensions: Record<string, unknown>`
9. `compileV2()` produces `CompileResultV2` with `PrimitiveGraph`, `NavigationArtifacts`, and `CompilerReport`
10. All 12 ACs pass (6 original + AC7 determinism + 5 internal per-task)
11. Old `compile()` output unchanged for documents without new entity types
12. Compilation is deterministic — same input → same checksums

## Milestones

| Milestone | Tasks | Deliverable | Verification |
|-----------|-------|-------------|--------------|
| **M2.1** | T1–T3 | Types + SkeletonGenerator + extractors defined | Unit tests per extractor, type compilation |
| **M2.2** | T4–T7 | Coordinator → Normalize → Validate → Emit pipeline | Integration tests, connectivity spy test |
| **M2.3** | T8–T10 | `compileV2()` wired, legacy compat maintained | Full `compileV2()` round-trip, old `compile()` unchanged |
| **M2.4** | T11–T12 | All tests green, parity verified | Determinism test, regression test, spy AC4 test |

## Relevant ERRORS.md Entries

- **2026-07-08: Checksum/Size Mismatch in Manifest Validation** — checksums must be computed from exact bytes written. AC7 (determinism) directly prevents this class of error.
- **2026-07-09: SelectionManager version clash** — naming collision between parent/subclass properties. Guardrail: new types (`PrimitiveGraph`, `CompilerReport`, etc.) are interfaces/data objects, never classes with inheritance. No collision risk.

**Preventing:** Checksum nondeterminism (T8 — serialize deterministically, exclude timestamps). Type naming collisions (all tasks — use interfaces, not classes).

---

## Task Definitions

### Task 1 — Create Compiler Types

**Goal:** Define all new compiler types (`PrimitiveGraph`, `PrimitiveNode`, `PrimitiveEdge`, `CompilerReport`, `CompilerStatistics`, `NavigationArtifacts`, `SkeletonGenerator`, `ConnectivityGraph`) in `packages/compiler/src/types/index.ts`. These are the backbone of the entire pipeline — every subsequent task depends on them.

**Files:**
- `packages/compiler/src/types/index.ts` — add new types alongside existing legacy types

**Dependencies:** None

**Steps:**
1. Define `PrimitiveNode` discriminated union (`waypoint` | `poi` | `transition` | `entrance_portal`)
2. Define `PrimitiveEdge` discriminated union (`skeleton` | `access` | `transition` | `portal`)
3. Define `PrimitiveSource` (entityId, entityType, field, generatorId)
4. Define `PrimitiveGraph` (nodes, edges, metadata, diagnostics)
5. Define `ConnectivityGraph` (same structure as PrimitiveGraph — represents graph after spatial cleanup)
6. Define `CompilerDiagnostic` (severity, sourceEntityId, phase, code, message, relatedNodeIds)
7. Define `CompilerStatistics` (rooms, hallways, roads, primitives, waypoints, edges, diagnostics count, compileTime)
8. Define `CompilerReport` as `{ diagnostics: CompilerDiagnostic[]; statistics: CompilerStatistics }`
9. Define `NavigationArtifacts` (graph, searchIndex, spatialIndex, buildingIndex, poiIndex, `extensions: Record<string, unknown>`)
10. Define `SkeletonGenerator` interface (id, generate method)
11. Export all new types from `packages/compiler/src/index.ts`

**Acceptance Criteria:**
- All types compile without errors
- `PrimitiveNode.kind` is a discriminated field — TypeScript narrows on `node.kind`
- `PrimitiveEdge.kind` is a discriminated field — TypeScript narrows on `edge.kind`
- `NavigationArtifacts.extensions` accepts any JSON-serializable value
- Types export cleanly from `@navi/compiler` barrel

**Tests:**
- Type-level tests: assign valid and invalid node/edge shapes, verify compiler errors
- Export test: verify all new types are reachable via `import { ... } from '@navi/compiler'`

**Risk:** Type proliferation — 7+ new interfaces. If any is wrong, downstream tasks cascade-fail.
**Rollback:** Revert `types/index.ts` and `index.ts` changes.
**Definition of Done:** `tsc --noEmit` passes with zero errors. No existing code broken.
**Architectural Guardrails:**
- All types are interfaces or unions, never classes
- `PrimitiveNode` and `PrimitiveEdge` use discriminated unions for exhaustive matching
- No type references authored entities (Room, Floor, Building, etc.) — ADR-009 invariant
- `CompilerStatistics` is flat — no nested objects
- `NavigationArtifacts.extensions` is `Record<string, unknown>` not `any`

---

### Task 2 — Implement SkeletonGenerator Abstraction

**Goal:** Define and implement the `SkeletonGenerator` interface with a built-in `PolylineSkeletonGenerator` that samples hallway/road polylines into waypoints and skeleton edges.

**Files:**
- `packages/compiler/src/primitives/skeleton-generator.ts` (new)
- `packages/compiler/src/primitives/index.ts` (new — barrel)

**Dependencies:** T1 (types)

**Steps:**
1. Implement `SkeletonGenerator` interface in `skeleton-generator.ts`
2. Implement `PolylineSkeletonGenerator`:
   - Accept hallway/road polylines from `NormalizedDocument`
   - Sample each polyline at `config.nodeInterval` spacing
   - Emit `PrimitiveNode(kind: 'waypoint')` per sample point
   - Emit `PrimitiveEdge(kind: 'skeleton')` between consecutive waypoints
   - Return `PrimitiveContribution` with nodes, edges, diagnostics
3. Use haversine distance for skeleton edge distances
4. Handle degenerate cases: zero-length polyline → empty contribution, single-point polyline → single waypoint with no edges

**Acceptance Criteria:**
- 10m polyline at 2m interval → 6 waypoints, 5 skeleton edges
- Zero-length polyline → empty nodes/edges
- Single-point polyline → 1 waypoint, 0 edges
- Each skeleton edge distance equals haversine(waypoint[i], waypoint[i+1])
- All waypoints carry `PrimitiveSource` with `generatorId: 'builtin:polyline-skeleton'`

**Tests:**
- `PolylineSkeletonGenerator.sample()` with known polyline → exact waypoint count
- Edge case: empty, single-point, two-point polylines
- Node interval respects config
- Generated source metadata correct

**Risk:** Floating point accumulation — repeated sampling could drift. Use haversine from `@navi/core`.
**Rollback:** Remove `skeleton-generator.ts` — it's a new file, no existing code touched.
**Definition of Done:** Unit tests pass. No existing tests broken.
**Architectural Guardrails:**
- Generator never reads authored entity types — only takes polylines as input
- Generator never performs spatial search (no nearest-neighbor)
- Generator never produces non-skeleton edge types
- Generator output is deterministic — same polyline + same config = same waypoints

---

### Task 3 — Implement Primitive Extractors

**Goal:** Implement five independent primitive extractors, each converting one M5 entity type into `PrimitiveContribution`. Extractors never call each other — they are pure functions coordinated only by the pipeline.

**Files:**
- `packages/compiler/src/primitives/room-extractor.ts` (new)
- `packages/compiler/src/primitives/door-extractor.ts` (new)
- `packages/compiler/src/primitives/anchor-extractor.ts` (new)
- `packages/compiler/src/primitives/connector-extractor.ts` (new)
- `packages/compiler/src/primitives/entrance-extractor.ts` (new)

**Dependencies:** T1 (types), T2 (SkeletonGenerator interface, but not the implementation)

**Steps:**

**3a — RoomExtractor**
1. Accept `NormalizedDocument` floors
2. For each room: emit `PrimitiveNode(kind: 'poi')` at centroid
3. If room has `RoomDoor[]`, store door info for later (door-extractor handles edges)
4. If room has no RoomDoor, emit `ROOM_NO_DOOR` diagnostic
5. `poiCategory = 'room'`

**3b — DoorExtractor**
1. Accept `NormalizedDocument` floors
2. For each `RoomDoor`: store access spec (roomId, door position, door properties)
3. Does NOT emit edges — edges are resolved in Phase 2.3
4. Returns door specs as structured data in `PrimitiveContribution`

**3c — AnchorExtractor**
1. Accept `NormalizedDocument` floors and buildings
2. For each `PanoramaAnchor`: emit `PrimitiveNode(kind: 'poi')` at anchor position, `poiCategory = 'panorama'`
3. For each `QRCodeAnchor`: emit `PrimitiveNode(kind: 'poi')` at anchor position, `poiCategory = 'qr_marker'`
4. For standalone floor anchors: same as above

**3d — ConnectorExtractor**
1. Accept `NormalizedDocument` buildings
2. For each `VerticalConnector` with `ConnectorStop[]`:
   - Emit one `PrimitiveNode(kind: 'transition')` per ConnectorStop
   - `behavior` from parent connector (stairs/elevator/escalator/ramp)
   - `accessible` and `baseCost` from parent connector
3. Does NOT pair stops — pairing happens in Phase 2.3

**3e — EntranceExtractor**
1. Accept `NormalizedDocument` buildings
2. For each `Entrance`: emit `PrimitiveNode(kind: 'entrance_portal')`
   - `outdoorPosition` and `indoorPosition`
   - `accessible` from entrance entity
3. Does NOT emit portal edge — edge created in Phase 2.3

**Acceptance Criteria:**
- Room with 3 RoomDoors → 1 POI node + 3 door specs
- Room with 0 RoomDoors → 1 POI node + `ROOM_NO_DOOR` diagnostic
- PanoramaAnchor → 1 POI node with `poiCategory = 'panorama'`
- VerticalConnector with 3 stops → 3 transition nodes, each with correct `behavior`
- Entrance → 1 entrance_portal node with both positions
- No extractor calls another extractor — each is independently testable
- Each extractor's output is deterministic

**Tests:**
- RoomExtractor: room with/without doors, room with invalid polygon
- DoorExtractor: door specs match expected structure
- AnchorExtractor: panorama, QR, mixed anchors per floor
- ConnectorExtractor: connector with 2, 3, 1 stops; accessible vs non-accessible
- EntranceExtractor: entrance with/without accessible flag

**Risk:** ConnectorExtractor depends on the parent `VerticalConnector.entityType` to resolve behavior — if the connector is missing from the document, the stop is orphaned. That's fine — `STOP_UNPAIRED` catches it in Phase 2.3.
**Rollback:** Remove individual extractor files.
**Definition of Done:** Per-extractor unit tests pass. No cross-extractor imports exist.
**Architectural Guardrails:**
- Extractors are pure functions — no shared state, no caching, no side effects
- Extractors never call each other — verified by grep for cross-imports
- Extractors never perform spatial search
- Extractors never reference `SkeletonGenerator` or waypoints
- All positions in world coordinates (lat/lng) — local→world happens in Stage 1
- Output is deterministic — same entity → same primitive, no Date.now()

---

### Task 4 — Implement PrimitiveCoordinator

**Goal:** Implement the Phase 2.1 coordinator that runs extractors (T3) and the skeleton generator (T2) in sequence, merges their contributions into a single `PrimitiveGraph`, then runs Phase 2.3 (Connect & Resolve) to resolve access edges, transition edges, and portal edges.

**Files:**
- `packages/compiler/src/primitives/coordinator.ts` (new)
- `packages/compiler/src/primitives/connector.ts` (new — Phase 2.3 logic)

**Dependencies:** T1, T2, T3

**Steps:**
1. Create `PrimitiveCoordinator` that:
   - Runs extractors in fixed order: Room → Door → Anchor → Connector → Entrance
   - Merges all `PrimitiveContribution` nodes, edges, doorSpecs into a partial `PrimitiveGraph`
   - Passes to `PolylineSkeletonGenerator` — adds waypoints + skeleton edges
2. Implement Phase 2.3 `connectPrimitives()`:
   - **AccessEdge resolution:** For each door spec, find nearest waypoint on same floor (nearest-neighbor search). Create `PrimitiveEdge(kind: 'access')` from POI node to waypoint. If no waypoint on floor, emit `DOOR_ORPHANED`
   - **TransitionEdge pairing:** For each `VerticalConnector`, pair its TransitionNodes in floor order. Create `PrimitiveEdge(kind: 'transition')` per consecutive pair. If a stop has no pair, emit `STOP_UNPAIRED`
   - **PortalEdge generation:** For each `EntrancePortalNode`, create `PrimitiveEdge(kind: 'portal')` with `distance = haversine(outdoor, indoor)`
   - **Entrance-to-road connection:** For each EntrancePortalNode, find nearest road waypoint. If none within threshold, emit `ENTRANCE_UNCONNECTED`
3. Collect all diagnostics from extractors, skeletonizer, and connector into `PrimitiveGraph.diagnostics`

**Acceptance Criteria:**
- Full `PrimitiveGraph` with nodes, edges, diagnostics after coordinator completes
- Room POI → nearest waypoint access edge correctly resolved
- Connector stops paired across floors
- Entrance portal node → portal edge emitted
- `DOOR_ORPHANED` when floor has no waypoints
- `STOP_UNPAIRED` when connector has single stop
- All diagnostics from all phases aggregated

**Tests:**
- Coordinator integration: document with 1 building, 2 floors, 1 hallway, 1 room with door, 1 connector → correct node/edge counts
- Nearest-waypoint: floor with 2 waypoints, door at (0,0), waypoints at (1,0) and (10,0) → access edge to (1,0)
- Transition pairing: 3 stops at floors 1,2,4 → edges: (1↔2), (2↔4). Floor 3 skipped → no edge for floor 3
- Portal distance: entrance with 5m between outdoor/indoor → portal edge distance = 5

**Risk:** Nearest-waypoint search is O(n*m) — acceptable for Phase 2.3 as a one-time cost. Guard: this is the ONLY place spatial search occurs.
**Rollback:** Remove `coordinator.ts` and `connector.ts`.
**Definition of Done:** Integration test passes. All diagnostics present. All edge types present.
**Architectural Guardrails:**
- Phase 2.3 (connector.ts) is the ONLY phase that performs nearest-neighbor spatial search
- No extractor performs spatial search
- The coordinator only runs extractors — it doesn't filter or modify their output
- The coordinator never accesses authored entity types directly — all data flows through `NormalizedDocument`

---

### Task 5 — Implement Connectivity Normalize

**Goal:** Implement Phase 3.1 — the only phase that modifies the `PrimitiveGraph`. Snaps nearby waypoints, merges duplicates, pairs orphaned nodes, repairs broken edge references.

**Files:**
- `packages/compiler/src/connectivity/normalizer.ts` (new)
- `packages/compiler/src/connectivity/index.ts` (new — barrel)

**Dependencies:** T4 (PrimitiveGraph from coordinator)

**Steps:**
1. Implement `normalizeConnectivity(graph: PrimitiveGraph, config: CompilerConfig): ConnectivityGraph`
2. **Snap nearby waypoints:** Merge waypoints within `config.mergeThreshold` (default 0.5m). Update all incident edges to reference the surviving node ID.
3. **Remove dangling waypoints:** Remove waypoints with zero incident edges after merging. Track removed IDs.
4. **Repair broken skeleton edges:** If a skeleton edge references a removed node, reconnect to nearest remaining waypoint on same floor.
5. **Merge overlapping access edges:** If two POIs share the same doorway (consecutive RoomDoors at same position), deduplicate.
6. Return `ConnectivityGraph` with repaired nodes, edges, metadata, and diagnostics attached.

**Acceptance Criteria:**
- Two waypoints 0.3m apart → merged into one, edges updated
- Waypoint with zero edges → removed, `SKELETON_DANGLING` diagnostic emitted
- Skeleton edge referencing removed waypoint → reconnected to nearest survivor
- Two access edges to same doorway → deduplicated to one
- All diagnostics aggregated in output `ConnectivityGraph.diagnostics`

**Tests:**
- Snap: 2 waypoints within threshold → 1 node, edges updated
- Dangling: waypoint with 0 edges → removed, diagnostic emitted
- Repair: edge to removed node → reconnected to nearest
- Dedup: overlapping access edges → single edge
- No-op: no waypoints within threshold → output identical to input
- Threshold zero: no snapping occurs

**Risk:** Snapping removes nodes — downstream phases (Validate, Emit) must handle removed IDs gracefully. Guard: normalizer updates ALL edges referencing removed nodes before returning.
**Rollback:** Remove `connectivity/` directory.
**Definition of Done:** All snap/merge/repair unit tests pass. No spatial search occurs after this phase.
**Architectural Guardrails:**
- Normalizer is the ONLY phase that modifies the graph
- Normalizer never emits NavNode/Edge types
- Normalizer never validates — it repairs and moves on
- Normalizer never performs nearest-neighbor search (uses existing waypoint positions)
- After Phase 3.1, the graph is "clean" — no further spatial repair needed
- All edge references are valid (no dangling IDs) after repair step

---

### Task 6 — Implement Connectivity Validate

**Goal:** Implement Phase 3.2 — a read-only validator that inspects the `ConnectivityGraph` and produces diagnostics. Never modifies the graph. Returns a `ValidationReport`.

**Files:**
- `packages/compiler/src/connectivity/validator.ts` (new)

**Dependencies:** T5 (ConnectivityGraph post-normalize)

**Steps:**
1. Implement `validateConnectivity(graph: ConnectivityGraph): ValidationReport`
2. **Orphan detection:** Find waypoints with zero incident edges. Emit `SKELETON_DANGLING` diagnostics.
3. **Disconnected component detection:** Run BFS from each entrance portal node. Any waypoint unreachable from any entrance → `HALLWAY_DISCONNECTED` diagnostic.
4. **Dangling edge detection:** Find edges referencing non-existent node IDs. Emit `EDGE_ORPHANED` diagnostic (should not happen after T5 repair, but validates it).
5. Return read-only report — never touches graph structure.

```typescript
interface ValidationReport {
  diagnostics: CompilerDiagnostic[]
  metrics: {
    totalComponents: number
    reachableWaypoints: number
    orphanedWaypoints: number
    disconnectedComponents: number
  }
}
```

**Acceptance Criteria:**
- Waypoint with 0 edges → diagnostic emitted
- Disconnected component (no entrance portal reachable) → diagnostic emitted
- Fully connected graph with all waypoints reachable → empty diagnostics
- Graph is unchanged after validation (deep-compare snapshot)
- All metrics correctly computed

**Tests:**
- Orphan detection: single waypoint, no edges → 1 orphan diagnostic
- Disconnected component: two separate clusters, entrance in cluster A, waypoint in cluster B → disconnected diagnostic
- Fully connected: no diagnostics
- Snapshot: deep-compare input graph === output graph (validator is pure read-only)
- Edge case: empty graph → 0 components, 0 waypoints

**Risk:** BFS on large graph could be expensive — acceptable for Phase 3.2 (one-time per compile). If performance becomes an issue, add visited-set caching.
**Rollback:** Remove `validator.ts`.
**Definition of Done:** Read-only invariant verified via deep-compare test. All diagnostic scenarios covered.
**Architectural Guardrails:**
- Validator NEVER modifies the graph — verified by post-call deep-compare test
- Validator NEVER emits NavNode/Edge types
- Validator NEVER performs spatial search (no nearest-neighbor, no geometry)
- Validator returns a report — does not halt compilation
- Validator is deterministic — same graph → same report

---

### Task 7 — Implement Graph Emitter

**Goal:** Implement Phase 3.3 — a pure mechanical transform that maps `ConnectivityGraph` nodes/edges to `NavNode`/`NavEdge`. Zero spatial search. Zero geometry repair. Zero validation.

**Files:**
- `packages/compiler/src/emitter/index.ts` (new)
- `packages/compiler/src/emitter/types.ts` (new — mapping table)

**Dependencies:** T5 (ConnectivityGraph), T1 (NavNode/NavEdge types)

**Steps:**
1. Define the type mapping table in `types.ts`:

| PrimitiveNode kind | NavNode type | Notes |
|---|---|---|
| `waypoint` | `'waypoint'` | Direct mapping |
| `poi` | `'poi'` | Direct mapping |
| `transition` | `'transition'` | Direct mapping |
| `entrance_portal` | `'entrance'` (indoor) + `'outdoor'` (outdoor) | Emits TWO NavNodes |

| PrimitiveEdge kind | NavEdge type | Notes |
|---|---|---|
| `skeleton` | `'walk'` | Direct mapping |
| `access` | `'walk'` | Direct mapping |
| `transition` | `behavior` value | Edge type = connector's behavior (stairs/elevator/escalator/ramp) |
| `portal` | `'walk'` | Between outdoor and entrance NavNodes |

2. Implement `emitGraph(graph: ConnectivityGraph): NavigationGraph`:
   ```
   for each node in ConnectivityGraph.nodes:
       if node.kind === 'entrance_portal':
           NavNode('outdoor') ← node.outdoorPosition
           NavNode('entrance') ← node.indoorPosition
           NavEdge('walk') between them
       else:
           NavNode ← { id, type map, position, floor, buildingId }
   
   for each edge in ConnectivityGraph.edges:
       if edge.kind === 'portal':
           skip (already emitted with entrance_portal nodes)
       else:
           NavEdge ← { id, from, to, type map, distance, weight }
   ```
3. No spatial operations — no nearest-neighbor, no haversine (distance comes from `edge.distance`), no geometry access.
4. `weight = distance` for all edges (custom weight functions are a future concern).

**Acceptance Criteria:**
- Every `ConnectivityGraph` node → exactly one (or two, for entrance_portal) `NavNode`
- Every `ConnectivityGraph` edge → exactly one `NavEdge` (except portal edges, which are inlined)
- Type mapping table exhaustively covers all primitive kinds
- Zero calls to any spatial function (haversine, nearestNeighbor, etc.)
- Output `NavigationGraph` is deterministic

**Tests:**
- Waypoint → NavNode type 'waypoint'
- POI → NavNode type 'poi'
- Transition → NavNode type 'transition'
- EntrancePortal → 2 NavNodes (outdoor + entrance) + 1 NavEdge between them
- Skeleton edge → NavEdge type 'walk', distance preserved
- Access edge → NavEdge type 'walk'
- Transition edge → NavEdge type matches behavior (stairs/elevator/etc.)
- SPY TEST: wrap `haversine` and all spatial functions — assert zero calls during emit
- Determinism: emit same graph twice → byte-identical NavigationGraph

**Risk:** EntrancePortal emits 2 nodes + 1 edge, breaking the one-to-one mapping assumption. Handled by special case in the loop.
**Rollback:** Remove `emitter/` directory.
**Definition of Done:** All mapping tests pass. Spatial spy test passes (zero calls). Output `NavigationGraph` matches ADR-009 shape.
**Architectural Guardrails:**
- NO spatial search — verified by spy injection
- NO geometry repair — emitter assumes clean graph
- NO validation — emitter never reads diagnostics
- NO mutation of input graph — read-only
- Pure type-level transform: `PrimitiveNode{k: 'waypoint'}` → `NavNode{type: 'waypoint'}`
- Every primitive kind has a mapping entry — TypeScript exhaustiveness check via `never`
- `weight = distance` — simple default, extendable later

---

### Task 8 — Implement Artifact Builder

**Goal:** Implement Phase 4 — build `SearchIndex`, `SpatialIndex`, `BuildingIndex`, `POIIndex` from the `NavigationGraph` and `NormalizedDocument`. Wire phase 4.2 serialization with deterministic checksums.

**Files:**
- `packages/compiler/src/artifacts/index.ts` (extend existing)
- `packages/compiler/src/artifacts/artifact-generator.ts` (extend existing)

**Dependencies:** T7 (NavigationGraph from emitter), T1 (NavigationArtifacts types)

**Steps:**
1. Extend existing artifact generator with `buildNavigationArtifacts(graph, document): NavigationArtifacts`
2. **SearchIndex:** Extract POI labels, building names, room names/numbers → search entries with tags
3. **SpatialIndex:** Build spatial hash grid (cell lat/lng hash → NavNode IDs) for nearest-node queries
4. **BuildingIndex:** Per-building subgraph views with floor/room/entrance listings
5. **POIIndex:** Flat list of POI nodes with categories and parent building
6. **Serialization:** Compute SHA-256 checksum per artifact, attach metadata (nodeCount, edgeCount, boundingBox, routeable flag)
7. **Deterministic output:** Exclude timestamps from checksum computation. Use `createHash('sha256').update(JSON.stringify(contentOnly)).digest('hex')`
8. **extensions:** Empty `Record<string, unknown>` in initial output

**Acceptance Criteria:**
- `SearchIndex` contains entries for all POI nodes + building names + room names
- `SpatialIndex` cells contain correct NavNode IDs
- `BuildingIndex` groups nodes by building, floors sorted by level
- `POIIndex` contains all POI nodes with categories
- `NavigationArtifacts.extensions` is `{}` (empty, but typed)
- Two identical inputs produce identical checksums
- Checksum excludes creation timestamp but includes all content

**Tests:**
- SearchIndex: POI entry present with correct label, type, position
- SpatialIndex: node in known cell → cell hash contains node ID
- BuildingIndex: building with 2 floors → building entry with 2 floor entries
- POIIndex: panorama POI → category 'panorama'
- Determinism: same input twice → identical artifacts
- Checksum: identical structure → identical checksum; different structure → different checksum
- extensions: empty object, typed as `Record<string, unknown>`

**Risk:** SpatialIndex cell size choice affects query performance. Use default 0.001° (~111m) — acceptable for initial implementation.
**Rollback:** Revert `artifacts/` changes — existing artifact generator continues working.
**Definition of Done:** All artifact indexes built and verified. `NavigationArtifacts` matches ADR-009 shape.
**Architectural Guardrails:**
- Artifacts are derived from `NavigationGraph` only (and document metadata) — never from primitives
- No authored entity types leak into artifacts
- Serialization excludes timestamps — all checksums are content-derived
- `extensions` is always present, even when empty
- Artifact generation is deterministic

---

### Task 9 — Add `compileV2()` Pipeline

**Goal:** Wire the new 4-stage pipeline into `CampusCompiler` as `compileV2()`. The new method runs alongside the existing `compile()` method. Stages run sequentially, diagnostics accumulate, result includes `CompilerReport`.

**Files:**
- `packages/compiler/src/pipeline/campus-compiler.ts` — add `compileV2()` method

**Dependencies:** T4 (PrimitiveCoordinator), T5 (Connectivity Normalizer), T6 (Connectivity Validator), T7 (Graph Emitter), T8 (Artifact Builder)

**Steps:**
1. Add `compileV2(document: CampusDocument): CompileResultV2` to `CampusCompiler`
2. Wire the pipeline:
   ```
   Stage 1: parseStage + geometryNormalize → NormalizedDocument
   Stage 2: PrimitiveCoordinator → PrimitiveGraph
   Stage 3.1: ConnectivityNormalizer → ConnectivityGraph
   Stage 3.2: ConnectivityValidator → ValidationReport (diagnostics only)
   Stage 3.3: GraphEmitter → NavigationGraph
   Stage 4: ArtifactBuilder → NavigationArtifacts
   ```
3. Collect all diagnostics into `CompilerReport`
4. Populate `CompilerStatistics` from pipeline data
5. Ensure `compileV2()` never calls old stages — completely independent code path
6. Wrap entire pipeline in try-catch with graceful error reporting

**Acceptance Criteria:**
- `compileV2()` returns `CompileResultV2` with all fields populated
- `CompileResultV2.report` contains diagnostics + statistics
- `CompileResultV2.artifacts` is a `NavigationArtifacts` instance
- Pipeline halts on Stage 1 structural errors
- Pipeline continues through warnings in Stages 2–4
- Old `compile()` method still works identically
- No shared mutable state between old and new pipelines

**Tests:**
- `compileV2()` with valid document → success, artifacts present
- `compileV2()` with document with missing fields → structural error, no artifacts
- `compileV2()` with document with disconnected hallway → diagnostics present, artifacts still produced
- `compileV2()` document statistics correct (node count, edge count, etc.)
- Old `compile()` same document → output unchanged (compare with baseline)

**Risk:** Try-catch in `compileV2()` could swallow unexpected errors. Guard: re-throw after logging in dev mode. Production mode returns error in `CompileResultV2.errors`.
**Rollback:** Remove `compileV2()` method — old pipeline unchanged.
**Definition of Done:** `compileV2()` returns valid results for all test documents. Old `compile()` output baseline confirmed.
**Architectural Guardrails:**
- `compileV2()` has zero code paths in common with old `compile()` — no shared stages, no shared extractors
- Pipeline is sequential — no phase executes before its dependency
- Diagnostics accumulate monotonically — never cleared mid-pipeline
- All errors collected, never thrown (except Stage 1 structural errors, which are caught)

---

### Task 10 — Compatibility Layer

**Goal:** Ensure old `compile()` and new `compileV2()` coexist without interference. Old consumers continue working. New consumers opt in via the new method.

**Files:**
- `packages/compiler/src/pipeline/compile.ts` — verify unchanged
- `packages/compiler/src/index.ts` — export both APIs
- `packages/editor/src/services/navigation-compiler.ts` — verify backward compat

**Dependencies:** T9 (compileV2 exists)

**Steps:**
1. Verify old `compile()` in `compile.ts` is unchanged — still calls `directExtract + buildGraph`
2. Verify `CampusCompiler.compile()` still uses old 6-stage pipeline
3. Verify `CampusCompiler.compileV2()` uses new 4-stage pipeline
4. Export both from `index.ts`:
   ```typescript
   export { compile, CampusCompiler } from './pipeline/compile'
   // compile() — old pipeline (legacy)
   // CampusCompiler.compile() — old pipeline (default)
   // CampusCompiler.compileV2() — new pipeline (migration)
   ```
5. Create `CompileResultV2` type that includes `legacy?: CompileResult` for consumers that need both
6. Verify editor's `navigation-compiler.ts` Com pilerAdapter interface still works with old compiler

**Acceptance Criteria:**
- `compile()` returns `CompileResult` (unchanged)
- `CampusCompiler.compile()` returns `CompileResultV2` (unchanged)
- `CampusCompiler.compileV2()` returns `CompileResultV2` with new pipeline
- Editor's `CompilerAdapter.compile()` still works (it delegates to `@navi/compiler`)
- No TypeScript errors from dual API

**Tests:**
- Old `compile()` output snapshot matches pre-M5 baseline
- `CampusCompiler.compile()` unchanged behavior
- Both APIs importable from `@navi/compiler`
- Editor's navigation-compiler tests pass unchanged

**Risk:** Dual export could confuse consumers. Mitigated by documentation and @deprecated markers on old API in M6.
**Rollback:** N/A — no changes to existing code paths.
**Definition of Done:** All three API surfaces work. Old tests pass. No new type errors.
**Architectural Guardrails:**
- Old `compile()` never references new types (PrimitiveGraph, CompilerDiagnostic, etc.)
- New `compileV2()` never references old types (NavigationSpace, TransitionPoint, WalkableCorridor, etc.)
- The two code paths are fully isolated — no shared variables, no shared functions, no shared state

---

### Task 11 — Unit Tests

**Goal:** Comprehensive unit tests for every new module. Tests must be isolated (no integration dependencies), fast, and deterministic.

**Files:**
- `packages/compiler/src/primitives/__tests__/room-extractor.test.ts` (new)
- `packages/compiler/src/primitives/__tests__/door-extractor.test.ts` (new)
- `packages/compiler/src/primitives/__tests__/anchor-extractor.test.ts` (new)
- `packages/compiler/src/primitives/__tests__/connector-extractor.test.ts` (new)
- `packages/compiler/src/primitives/__tests__/entrance-extractor.test.ts` (new)
- `packages/compiler/src/primitives/__tests__/skeleton-generator.test.ts` (new)
- `packages/compiler/src/primitives/__tests__/coordinator.test.ts` (new)
- `packages/compiler/src/primitives/__tests__/connector.test.ts` (new)
- `packages/compiler/src/connectivity/__tests__/normalizer.test.ts` (new)
- `packages/compiler/src/connectivity/__tests__/validator.test.ts` (new)
- `packages/compiler/src/emitter/__tests__/emitter.test.ts` (new)
- `packages/compiler/src/artifacts/__tests__/artifact-generator.test.ts` (extend existing)

**Dependencies:** All previous tasks

**Steps:**
1. Create test fixtures (typed `NormalizedDocument` fragments, `PrimitiveGraph` fragments)
2. Write tests per the Acceptance Criteria and Tests sections in T2–T10
3. Verify each extractor test is independent — no shared state
4. Add snapshot tests for complex output shapes
5. Verify all existing tests still pass

**Acceptance Criteria:**
- Each new module has ≥90% line coverage
- All tests run in <1s
- No test imports from another module's tests (independence)
- Existing test suite unaffected

**Tests:**
- (Covered by per-module tests defined in T2–T10)

**Risk:** Test fixtures become stale as types evolve. Mitigation: use factory functions, not raw object literals.
**Rollback:** N/A — new test files only.
**Definition of Done:** `npx vitest run packages/compiler/` passes. Coverage report shows ≥90% for new files.
**Architectural Guardrails:**
- Tests use factory functions (`createRoom()`, `createPrimitiveGraph()`) — not raw literals
- Tests never depend on implementation details — only public interfaces
- Each test file is independent — no shared `describe` or `beforeAll` state
- Snapshot tests for complex output; assertion tests for specific values

---

### Task 12 — Integration, Regression, Determinism, and Spy Tests

**Goal:** Verify the entire pipeline end-to-end. Confirm old path still works. Confirm determinism. Confirm Phase 3.3 does zero spatial search.

**Files:**
- `packages/compiler/src/__tests__/compile-v2-integration.test.ts` (new)
- `packages/compiler/src/__tests__/compile-v2-regression.test.ts` (new)
- `packages/compiler/src/__tests__/compile-v2-determinism.test.ts` (new)
- `packages/compiler/src/__tests__/compile-v2-spy.test.ts` (new)

**Dependencies:** T11 (unit tests pass), T9 (compileV2 pipeline)

**Steps:**

**12a — Integration test:**
1. Create a realistic `CampusDocument` with 2 buildings, 3 floors each, rooms, hallways, connectors, doors, anchors, entrances, roads
2. Run `CampusCompiler.compileV2(document)`
3. Verify `CompileResultV2` has:
   - `success: true`
   - `artifacts.graph.nodes.length > 0`
   - `artifacts.graph.edges.length > 0`
   - `report.statistics.rooms > 0`
   - `report.statistics.waypoints > 0`
   - `report.diagnostics` may be empty or populated
4. Verify `NavigationArtifacts` has all 5 fields + empty extensions

**12b — Regression test:**
1. Take a pre-M5 document (no new entity types)
2. Run old `compile(document, config)` → capture output snapshot
3. Run `CampusCompiler.compileV2(document)` — should still succeed, but output differs (new pipeline)
4. Verify old `compile()` output is byte-identical to pre-M5 baseline snapshot

**12c — Determinism test:**
1. Create a `CampusDocument`
2. Run `compileV2()` → `result1`
3. Run `compileV2()` → `result2`
4. Assert `result1.artifacts.graph.checksum === result2.artifacts.graph.checksum`
5. Assert deep-equal on all artifacts
6. Run 5 times — all checksums identical

**12d — Spy test (AC4):**
1. Create a spy that wraps `haversine` and all spatial utility functions
2. Run `compileV2()` through Phase 3.3 only (feed pre-built ConnectivityGraph)
3. Assert zero calls to any spatial function during Phase 3.3

**Acceptance Criteria:**
- Integration test: full pipeline produces valid, complete output
- Regression test: old `compile()` output unchanged
- Determinism test: 5 runs → 5 identical checksums
- Spy test: zero spatial calls during emit

**Tests:**
- (Covered by 12a–12d above)

**Risk:** Integration test document must be large enough to exercise all code paths but small enough to debug failures. Use a 2-building, 6-floor fixture.
**Rollback:** N/A — new test files only.
**Definition of Done:** All 4 test files pass. Old test suite unaffected. AC4 (spy) and AC7 (determinism) confirmed.
**Architectural Guardrails:**
- Integration test document exercises every entity type and every edge/phase
- Regression test captures exact output — any change to old `compile()` is a failure
- Determinism test runs minimum 5 iterations to catch non-determinism from timestamps, random IDs, or iteration order
- Spy test wraps ALL spatial functions — if a new one is added, the test catches it

---

## Implementation Order

```
T1 ──────────────────────────────────────────────────┐
                                                      │
T2 ────────────────────────────────────────────┐     │
                                               │     │
T3 ───────────────────────────────────┐        │     │
                                      │        │     │
T4 ───────────────────────────┐       │        │     │
                              │       │        │     │
T5 ────────────────────┐      │       │        │     │
                       │      │       │        │     │
T6 ─────────────┐      │      │       │        │     │
                │      │      │       │        │     │
T7 ──────┐      │      │      │       │        │     │
         │      │      │      │       │        │     │
T8 ─┐    │      │      │      │       │        │     │
    │    │      │      │      │       │        │     │
    ▼    ▼      ▼      ▼      ▼       ▼        ▼     ▼
    T8   T7     T6     T5     T4      T3       T2    T1
    │    │      │      │      │       │        │     │
    └────┴──────┴──────┴──────┴───────┴────────┴─────┘
                              │
                           T9 ┘
                              │
                           T10 ┘
                              │
                           T11 ┘
                              │
                           T12 ┘
```

All tasks are sequential — each depends on its predecessor's output types or modules. T1–T8 build bottom-up (types → components → pipeline). T9–T10 wire and compat. T11–T12 verify.
