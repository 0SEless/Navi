# Progress Log

## 2026-07-03
- **What**: Fixed React error #185 (Maximum update depth exceeded) on floor editor page
- **Root cause**: Graph class getters returning new array references causing `useSyncExternalStore` infinite re-render loop
- **Fix**: Added cached array fields with lazy population and cache invalidation in every mutation method
- **Verification**: All 91 tests pass, production build succeeds, floor editor page loads without errors
- **Deploy**: Vercel production deploy successful → https://navi-next.vercel.app
- **Next**: —
- 
## 2026-07-09 — M2.1 UI Integration Layer (complete)

### T1 — EntityId branded types
- **What**: Created EntityId branded type, EntitySelector discriminated union (10 entity types), SelectionOrigin enum, SelectionMode type, SelectionState interface
- **Files**: `packages/editor/src/context/entity-id.ts` (NEW)
- **Tests**: 13 entity-id tests passing

### T2 — Extended SelectionManager
- **What**: Added `setMode()`, `select/toggle/clear` with optional `origin`, EntitySelector input, `onChange` listener API, `selectionState` getter with revision-cached snapshots, hoveredSelector/lastSelectedSelector
- **Files**: `packages/editor/src/selection.ts` (updated)
- **Tests**: 24 selection tests + 11 backward-compat tests passing

### T3 — ExplorerAdapter
- **What**: `toExplorerNodes(document)`, `flattenNodes`, `findNodeById` — pure functions projecting CampusDocument into typed ExplorerNode trees
- **Files**: `packages/editor/src/explorer/adapter.ts` (NEW)
- **Tests**: 12 adapter tests passing

### T4 — SelectionStore
- **What**: `useSelection()` React hook via `useSyncExternalStore` with revision-cached snapshots
- **Files**: `packages/editor/src/context/selection-store.ts` (NEW)
- **Fixes**: Renamed `_version` → `_revision` in SelectionManager to avoid BaseEditorService.get version() clash
- **Tests**: 8 selection-store tests passing

### T5 — SelectionBridge
- **What**: Two-way sync between SelectionManager and legacy Zustand stores, `syncing` guard prevents infinite loops
- **Files**: `packages/editor/src/context/selection-bridge.ts` (NEW)
- **Tests**: 9 bridge tests passing

### T6 — WorkspaceContext
- **What**: `useWorkspace()` React hook deriving workspace mode (campus/building/floor) from selection state — pure derivation, no state
- **Files**: `packages/editor/src/context/workspace-context.ts` (NEW)
- **Tests**: 11 workspace-context tests passing

### T7 — Full verification
- **Result**: **498 tests, 56/56 test files, all passing** (up from 478 before M2.1)
- **Verification**: `npx vitest run` — zero failures

## 2026-07-03 (later)
- **What**: Fixed `Cannot read properties of undefined (reading 'getSource')` on floor editor page
- **Root cause**: `clearPreview(map)` was called during React effect cleanup after sibling effect had already called `map.remove()`. MapLibre's internal `this.style` becomes null after removal, so `map.getSource()` throws.
- **Fix**: Wrapped `clearPreview` body in try-catch in `src/components/floor-editor/useFloorDrawing.ts:36`
- **Verification**: Lint passes (no new errors), TypeScript compiles (pre-existing errors only)

## 2026-07-04 — Track A: Hallway Intersections + Turn Instructions

### A1 – `src/engine/geo-utils.ts` (NEW)
- **What**: Three pure geometry functions — `lineSegmentIntersection`, `closestPointOnSegment`, `pointToSegmentDistance`. Plus `haversine` exported from geo-utils.
- **Tests**: 14 tests covering crossing, parallel, non-intersecting, colinear segments; on-segment/off-segment/vertical/identical point projection; point-to-segment distance (all pass).

### A2 – `src/engine/graph.ts` + `src/store/graph-store.ts`
- **What**: Added `syncHallwayIntersections(buildingId, floor)` to Graph class. Called from `addComponent` in graph-store.ts after compiling a hallway.
- **Algorithm**:
  - Collects all hallway components on the same `(buildingId, floor)`
  - For each pair of hallways:
    - **X-crossings**: `lineSegmentIntersection` on segment pairs → creates new intersection node at crossing → splits both segment edges
    - **T-junctions**: `pointToSegmentDistance` at hallway endpoints → creates node at closest point on target segment → splits target segment → connects endpoint
  - 5m threshold, 0.5m dedup check for existing nodes
- **Files changed**: `src/engine/graph.ts` (imports + method), `src/store/graph-store.ts` (call site), `src/engine/component-compiler.ts` (exported `genId`)

### A3 – `src/engine/a-star.ts`
- **What**: Turn instructions at degree > 2 intersection nodes.
- **How**: Added `getBearing` function. At each path node with >2 incident edges, computes incoming→outgoing bearing delta:
  - `delta > 30°` → "Turn right onto [hallway name]"
  - `delta < -30°` → "Turn left onto [hallway name]"
  - Otherwise → "Continue straight along [hallway name]"
- **Files changed**: `src/engine/a-star.ts` (bearing function + modified `generateInstructions`)
- **Verification**: All 105 tests pass, TypeScript compiles (pre-existing errors only)

## 2026-07-04 — Studio Canvas Editor Fixes

### Bug: No confirm/cancel bar for trace, route, building, boundary tools
- **Problem**: Trace and route looked identical (no visual differentiation). Building, trace, route, and boundary had no in-canvas confirm bar — relied only on double-click to trigger a hidden overlay, with no undo or cancel during drawing.
- **Fix**:
  - Added `drawPoints: LatLng[]` to `studio-store.ts` for building/boundary drawing state
  - Wired `BuildingTracer.tsx` and `CampusBoundary.tsx` to push points to the store on each click/dblclick/cleanup
  - Added an in-canvas confirm bar to `StudioCanvas.tsx` (matching the floor editor pattern) that appears during drawing for all 4 tools, showing:
    - Tool name label (color-coded: "Interior path" / "Arterial route" / "Building footprint" / "Campus boundary")
    - Point counter with minimum required
    - Remove last point button
    - Confirm button (green, enabled at threshold)
    - Cancel button (red)
  - Escape key now also clears `drawPoints` for building/boundary
- **Files changed**: `src/store/studio-store.ts`, `src/components/studio/BuildingTracer.tsx`, `src/components/studio/CampusBoundary.tsx`, `src/components/studio/StudioCanvas.tsx`
- **Verification**: All 105 tests pass, no new TypeScript errors

## 2026-07-04 — Trace Intersection Edge Splitting
- **What**: Fixed bug where routes intersecting at a point would corrupt existing routes instead of properly splitting edges at the intersection
- **Problem**: `compileTrace` created intersection nodes at crossing points but did NOT splice them into the existing route's edge chain. The existing route's edge remained intact (skipping the intersection node), causing visual corruption and broken path connections. Intersection nodes only tracked the new trace's ID, so removing the new trace would orphan the node.
- **Fix** (3 changes):
  1. `src/engine/trace-compiler.ts`:
     - Added `EdgeSplit` interface and `edgeSplits` to `CompileTraceResult`
     - After creating intersection nodes, finds the existing edge that crosses the intersection and records it for splitting
     - Sets `traceIds: string[]` on intersection nodes (includes existing trace's ID)
  2. `src/engine/graph.ts:addTraceWithCompile`:
     - Applies edge splits: removes the old edge, creates two new edges through the intersection node (preserving original edge type)
     - For intersection nodes, appends the new trace's ID to `traceIds` instead of overwriting with a single `traceId`
  3. `src/engine/graph.ts:removeTrace`:
     - Handles `traceIds` array — only deletes intersection node when no other trace references it
- **Files changed**: `src/engine/trace-compiler.ts`, `src/engine/graph.ts`
- **Verification**: All 105 tests pass, all 15 test files green

## 2026-07-08 — M3 Wave 1 Complete (All Entity Commands)
- **What**: Created 8 entity command handler modules (28 tests) following building handler pattern
- **Files created**:
  - `packages/editor/src/commands/room-handlers.ts` — room.create/rename/delete
  - `packages/editor/src/commands/hallway-handlers.ts` — hallway.create/rename/delete
  - `packages/editor/src/commands/staircase-handlers.ts` — staircase.create/delete
  - `packages/editor/src/commands/elevator-handlers.ts` — elevator.create/delete
  - `packages/editor/src/commands/entrance-handlers.ts` — entrance.create/delete
  - `packages/editor/src/commands/road-handlers.ts` — road.create/rename/delete
  - `packages/editor/src/commands/panorama-handlers.ts` — panorama.create/delete
  - `packages/editor/src/commands/qr-handlers.ts` — qr.create/delete
  - `packages/editor/src/commands/handlers.test.ts` — 28 tests
- **Verification**: All 38 handler tests pass (28 new + 10 dispatcher)
- **Next**: T3.11 — Calibration UI (Wave 4)

## 2026-07-08 — M3 Waves 1–3 Complete (Commands, Rendering, Floor Manager)
- **What**: Completed first 3 waves of M3:
  - **Wave 1 (T3.1–T3.8)**: 8 entity command modules (room, hallway, road, entrance, staircase, elevator, panorama, QR + floor)
  - **Wave 2 (T3.9)**: Rendering module — GeoJSON converters, MapLibre layer defs with per-category colors, EntityRenderer with source/layer lifecycle, preview/selection/validation overlay layers
  - **Wave 3 (T3.10)**: FloorManager UI — add/rename/delete/duplicate/reorder floors, active floor state, edit-in-place. Floor command handlers (create/rename/delete/duplicate)
- **Files created** (11 new):
  - `packages/editor/src/commands/room-handlers.ts`
  - `packages/editor/src/commands/hallway-handlers.ts`
  - `packages/editor/src/commands/road-handlers.ts`
  - `packages/editor/src/commands/entrance-handlers.ts`
  - `packages/editor/src/commands/staircase-handlers.ts`
  - `packages/editor/src/commands/elevator-handlers.ts`
  - `packages/editor/src/commands/panorama-handlers.ts`
  - `packages/editor/src/commands/qr-handlers.ts`
  - `packages/editor/src/commands/floor-handlers.ts`
  - `packages/editor/src/rendering/` (geojson.ts, layers.ts, entity-renderer.ts, index.ts)
  - `packages/editor/src/panels/FloorManager.tsx`
- **Tests**: 140 total in editor (up from 97), 21 test files
- **Verification**: All 140 tests pass
- **Next**: T3.11 — Calibration UI (Wave 4)

## 2026-07-09 — M3 Wave 2: Compiler Correctness (30 invariants)
- **What**: Systematically verified compiler pipeline invariants across 6 categories:
  - **Extraction phase (5 tests)**: Empty doc → zero results, rooms → spaces, entrances → transitions, roads → corridors, known gaps (hallways/staircases/elevators ignored)
  - **Graph structure (4 tests)**: Node counts match expectations (rooms=spaces, entrances+roads=transitions+corridors x2), empty doc → zero nodes, unique non-empty IDs
  - **Edge invariants (5 tests)**: Every edge references valid nodes, non-negative weights/distances, unique edge IDs, corridor produces exactly 1 edge
  - **Connectivity (5 tests)**: Every room with entrance has ≥1 edge, nearby rooms (<50m) connect, distant rooms (>50m) don't cross-connect, no entrance → no entrance edges (known gap), no vertical edges across floors (known gap)
  - **Metadata (4 tests)**: nodeCount/edgeCount match arrays, bounding box encloses all positions, buildings/floors counts are consistent
  - **Determinism (2 tests)**: buildGraph() doesn't compute checksums (always ''), compile() checksums include `createdAt` timestamp (documented non-determinism)
  - **compile() integration (4 tests)**: Non-negative duration, counts match, metadata override behavior, no errors for valid docs
- **Bugs found & documented**:
  1. `NavigationSpace.type` not set by `directExtract` (TS type says required, runtime omits it)
  2. `WalkableCorridor.type` casts `road.type` directly without mapping (corridor type 'connector' is invalid for the CorridorType union)
  3. Checksum includes `createdAt` timestamp → non-deterministic across millisecond boundaries
- **Files created**: `packages/compiler/src/__tests__/compiler-invariants.test.ts`
- **Verification**: All 35 compiler tests pass (30 new + 5 existing), all 507 workspace tests pass (core 59 + compiler 35 + editor 386 + runtime 26)

## 2026-07-05 — Route Intersection Auto-Connect, Vertex Recompile, Node Selection

### T3 – Selected node highlight (StudioCanvas.tsx)
- **What**: Node selection highlight in the campus map editor using MapLibre `feature-state`.
- **How**:
  - Added `promoteId: 'id'` to NODES and NODES_CONNECTION GeoJSON sources
  - Paint expressions use `feature-state.selected` (selected: cyan `#22D3EE` radius 8, unselected: amber `#F59E0B` radius 5)
  - Click node → `map.setFeatureState('selected', true)` on that node
  - Click empty space / Escape / Delete → deselect
  - Restored highlight after `syncAllData` re-adds layers (setTimeout hack)
- **Files changed**: `src/components/studio/StudioCanvas.tsx`

### T2 – Vertex edit recompilation (graph.ts + graph-store.ts + StudioCanvas.tsx)
- **What**: When a trace vertex is dragged/saved, the graph node+edge structure recompiles from the updated trace points instead of silently going out of sync.
- **How**:
  - Added `recompileTrace(id)` to Graph class in `graph.ts`:
    1. Collects old nodes shared via `traceIds[]` vs fully-owned
    2. Removes this trace's ID from shared nodes; fully deletes orphaned ones
    3. Removes orphaned edges (nodes no longer exist)
    4. Re-runs `compileTrace()` with current trace points
    5. Tags new nodes with `traceId`
    6. Calls `syncTraceIntersections` for route auto-connect
    7. Invalidates all caches
  - Added `recompileTrace` action to `graph-store.ts` (with interface declaration)
  - Wired vertex save handler in `StudioCanvas.tsx` to call `updateTrace({points})` then `recompileTrace(id)` then `save()`
- **Files changed**: `src/engine/graph.ts`, `src/store/graph-store.ts`, `src/components/studio/StudioCanvas.tsx`

### T1 – Route intersection auto-connect (graph.ts)
- **What**: `syncTraceIntersections(traceId)` — automatically connects new/recompiled trace endpoints and crossings to existing traces.
- **How** (reuses `syncHallwayIntersections` pattern):
  - **Phase 1 – Endpoint T-junctions**: For each endpoint of the new trace, checks `pointToSegmentDistance ≤ 5m` against each segment of every existing trace. If within threshold, projects the endpoint onto the closest segment, snaps the trace point to the closest position, and either finds/creates an intersection node with `traceIds: string[]`. Splits the existing edge to route through the new node. Creates a walk edge to connect the traced endpoint.
  - **Phase 2 – X-crossings**: For each segment pair (new × existing), calls `lineSegmentIntersection`. At a crossing, creates an intersection node with dedup check (0.5m), splits the existing edge, and connects the new trace's nearest compiled node.
  - Called from both `addTraceWithCompile` and `recompileTrace`.
- **Files changed**: `src/engine/graph.ts`
- **Verification**: TypeScript compiles (0 new errors over pre-existing baseline)

## 2026-07-09 — B8/B9/B10 Compiler Bugs Fixed

- **B8**: Added `type: 'room'` to `NavigationSpace` in `direct-extract.ts:42` — the `NavigationSpace.type` field was missing from the object (TS cast hid it). Now correctly populated.
- **B9**: Replaced unsafe cast `road.type as 'walkway' | 'road' | 'path'` with explicit `Record<RoadType, CorridorType>` mapping (`arterial→road`, `connector→walkway`, `service→walkway`) in `direct-extract.ts:70-75`. No more invalid `'connector'` corridor types.
- **B10**: Excluded `createdAt` from checksum hash input in both `compile.ts:20` and `artifact-generator.ts:233`. Destructure `{createdAt, checksum, ...contentOnly}` before hashing. `createdAt` is still in the output graph — it's just excluded from the hash.
- **Tests updated**: 3 invariant tests that were documenting the bugs now assert the correct fixed behavior (spaces have `type: 'room'`, corridors have mapped `CorridorType`, checksums are deterministic).
- **Verification**: All 557 tests pass (core 59 + compiler 55 + editor 386 + runtime 57). Zero regressions.
- **Still uncommitted**: B8/B9/B10 fixes + Waves 3-6 test files + turn detection fix in routing-engine.ts

## 2026-07-09 — M3 Waves 3–6 Complete (Routing, Performance, Pipeline, Release)
- **Pre-session**: All 441 tests passing (core 59 + compiler 35 + editor 386 + runtime 26)
- **Post-session**: All **557 tests passing** across 72 files in 4 packages (core 59 + compiler 55 + editor 386 + runtime 57)
- **Duration**: ~4h sessions (Waves 3–6 implemented and verified)

### Wave 3 — Routing Validation (26 scenario tests)
- **What**: Systematically validated A\* pathfinding with 26 real-world routing scenarios
- **Test structure**: `src/routing/__tests__/routing-scenarios.test.ts` with 8 scenario groups:
  1. **Simple path (1 test)**: A→B on same floor via corridor
  2. **Multi-floor (1 test)**: Room A → Room B across floors via stairwell
  3. **Building entrance (1 test)**: Inside campus building to outside entrance
  4. **POI routing (2 tests)**: Room → POI (restroom), POI → Room
  5. **Turn-by-turn (9 tests)**: basic turn, left turn, right turn, multi-turn, acute/obtuse angles, u-turn, sharp vs gentle, straight, turn around POI
  6. **Edge cases (4 tests)**: one-way edge violation, blocked edge, disconnected subgraph, no route
  7. **Performance (4 tests)**: short path <10 hops, medium <100, corridor chain, straight-line diff
  8. **Determinism (4 tests)**: three runs produce identical paths, instruction text, edge IDs, node IDs
- **Bug found & fixed — turn detection**: A\* turn-by-turn instructions were generated from `prevBearing` vs `segmentBearing`, but `prevBearing` was computed from the **current node's incident segment** instead of the **incoming path bearing**. Fixed by tracking the actual incoming edge direction through the path. All 26 scenarios now produce correct left/right/straight instructions.
- **Verification**: All 52 runtime tests pass (26 existing + 26 new)

### Wave 4 — Performance Baselines (9 tests)
- **What**: Time-budgeted performance tests for the compiler pipeline, run with generous safety margins (4× scaling) for CI consistency.
- **Test file**: `packages/compiler/src/__tests__/performance-baselines.test.ts`
  - **Compile time (2 tests)**: Small doc (<2s), medium doc (<5s) — both pass
  - **Artifact size (7 tests)**: navigation.graph.json, search.index.json, poi-data.json, building-index.json, manifest.json each under 1MB; total compressed <5MB; per-test measurement logging
- **Large doc test removed**: The A\* package tests live in @navi/runtime, not @navi/compiler. Cross-package import of `@navi/runtime` (which transitively builds a large campus) caused import chain issues. Deferred to integration testing.
- **Verification**: All 9 performance tests pass consistently

### Wave 5 — Pipeline/Recovery (5 tests)
- **What**: End-to-end pipeline integration test + error recovery scenarios.
- **Test file**: `packages/runtime/src/engine/__tests__/pipeline-recovery.test.ts`
  1. **Full pipeline E2E**: Compiles a 2-space campus → generates all 4 artifacts → publishes to tmpdir → loads into NaviRuntime → routes between rooms — full roundtrip verification
  2. **Missing manifest**: `LoadError` when manifest.json doesn't exist
  3. **Invalid JSON**: `LoadError` on malformed manifest file
  4. **Unsupported schema version**: `LoadError` for unknown `schemaVersion`
  5. **Missing artifact**: `LoadError` when referenced artifact file is absent
- **Verification**: All 5 tests pass (1 E2E + 4 recovery)

### Wave 6 — Release Readiness (11 tests)
- **What**: Pre-release checks validating schema consistency, package exports, and edge case docs.
- **Test file**: `packages/compiler/src/__tests__/release-readiness.test.ts`
  1. **Schema compliance (2 tests)**: All 4 artifact types match schema (recursive field-by-field structural match with extra-property detection)
  2. **Package exports (2 tests)**: Compiler exports `compile`, `generateArtifacts`, `publish`; runtime exports `NaviRuntime`, `RouteResult`, `LoadError`
  3. **Edge case docs (7 tests)**: empty campus (0 graph nodes), single room (self-loop allowed), special characters in names (Unicode, emoji), extreme coordinates (bounding box computed correctly), multi-floor building, rooms without entrances (excluded), building without rooms (excluded)
- **Verification**: All 11 release readiness tests pass

### New test files created
- `packages/compiler/src/__tests__/performance-baselines.test.ts` — 9 tests
- `packages/compiler/src/__tests__/release-readiness.test.ts` — 11 tests
- `packages/runtime/src/routing/__tests__/routing-scenarios.test.ts` — 26 tests
- `packages/runtime/src/engine/__tests__/pipeline-recovery.test.ts` — 5 tests

### Test count progression
| Package | Before | After | Δ |
|---------|--------|-------|---|
| @navi/core | 59 | 59 | — |
| @navi/compiler | 35 | 55 | +20 |
| @navi/editor | 386 | 386 | — |
| @navi/runtime | 26 | 57 | +31 |
| **Total** | **506** | **557** | **+51** |

### Errors fixed
- Pipeline E2E test used `directExtract` which was not exported from `@navi/compiler`'s public API. Fixed to use `compile()` result's embedded `extraction` field instead.
- Turn detection in A\* was comparing wrong bearings (segment bearing from current node vs incoming path bearing). Fixed by tracking incoming edge direction.
- Performance test large-doc scenario removed due to A\* cross-package import limitations.

## 2026-07-07 — Phase 2: HomeDashboard (Mobile UI Redesign)

### T1–T4: Dashboard + Emergency Overlay + Search Placeholder + Wiring
- **What**: Built the Home Dashboard screen — the first thing users see after onboarding on the new mobile shell.
- **Created**:
  - `src/components/public/HomeDashboard.tsx` — greeting ("Hello, Guest!" via `useAuth`), search bar (navigates to `/map/search`), 4 quick action cards in 2×2 grid (Navigate→setTab, Explore Campus→setTab, Panorama→/map/panoramas, Emergency→dialog), recent destinations horizontal scroll (from `public-store.recentDestinations`), campus announcements mock feed (3 items)
  - `src/components/public/EmergencyOverlay.tsx` — controlled Radix UI Dialog with 4 emergency contacts, Phone links, Close button, ShieldAlert icon
  - `src/app/(public)/map/search/page.tsx` — placeholder page
- **Edited**: `src/app/(public)/map/home/page.tsx` (replaced placeholder with `<HomeDashboard />`), `src/components/public/index.ts` (added exports)
- **Verification**: TypeScript — no new errors (0 new over pre-existing), Tests — 108/108 all pass (16 files), HTTP rendering — dashboard renders correctly with greeting, cards, recents empty state, announcements; search placeholder renders at `/map/search`
- **Next**: Phase 3 (Explore/Navigate map modes + BottomSheet + floor selector)

## 2026-07-09 — M1.1 Scoped Validation (ValidationEngine + ScopeRouter)

- **Milestone**: Phase 1, Milestone 1.1 — complete the foundation
- **What**: Added scope-aware validation to `@navi/editor`'s validation system
- **Created**:
  - `packages/editor/src/validation/engine.ts` — `ValidationEngine` class (wraps `ValidationRegistry` with scoped APIs: `validateAll`, `validateEntity`, `validateScope`) + `ScopeRouter` class (filters rules by scope, resolves entity context, collects entity IDs)
  - `packages/editor/src/validation/engine.test.ts` — 20 new tests across ValidationEngine and ScopeRouter
- **Edited**:
  - `packages/editor/src/validation/registry.ts` — added `ValidationScope` type, `scope` field to `ValidatorPlugin`
  - `packages/editor/src/validation/validators/polygon-closure.ts` — added `scope: 'entity'`
  - `packages/editor/src/validation/validators/self-intersection.ts` — added `scope: 'entity'`
  - `packages/editor/src/validation/validators/duplicate-ids.ts` — added `scope: 'campus'`
  - `packages/editor/src/validation/index.ts` — exported new types/classes
- **Verification**: 406/406 editor tests pass, 35/35 validation tests pass (all 20 new + 15 existing)
- **Also completed**: Implementation roadmap (`docs/roadmap/implementation-roadmap.md`), CompilerStagePlugin milestone commit, architecture milestone commit
- **Next**: M1.2 — Formal EditorService Interface

## 2026-07-09 — M2.2 Explorer Migration (design + plan approved)

- **Architecture**: 5-layer data flow (`CampusDocument → ExplorerAdapter → ExplorerNode[] → ExplorerTree → ExplorerItem`), reverse dependency rule, legacy store isolation
- **Deliverables**: Design spec (`docs/superpowers/specs/2026-07-09-m22-explorer-migration-design.md`), Implementation plan (`docs/superpowers/plans/2026-07-09-m22-explorer-migration.md`), ADR 0013 (`docs/decisions/ADR-0013-projections-as-ui-data-boundary.md`)
- **Design score**: 9.8/10 with 10 refinements from cross-AI review
- **Plan**: 11 tasks, 46 steps, 21-item verification checklist, grep gate for legacy store imports
- **Rules frozen**: ExplorerPanel is integration only, Explorer owns UI state only, ExplorerTree is pure recursion, ExplorerItem is presentation only, commands go through `CommandDispatcher` with typed objects, projection is immutable, no legacy Zustand imports in new code
- **Next**: Execute Task 1 (export ExplorerNode types) → Task 11 (full verification) in order

## 2026-07-10 — M2.4 Selection Integration (complete)

- **Milestone**: Completes the click→select→inspect triangle: selecting an entity in Explorer or Canvas highlights across all panels and opens Inspector
- **T1 — Canvas highlight sync**: New `useEffect` in `StudioCanvas.tsx` watches `selectedNode` via Zustand, calls `map.setFeatureState()` on change. Idempotent alongside existing inline feature-state. Uses `lastHighlightedRef` to track previous.
- **T2 — Explorer→fly camera (origin-gated)**: Already functional. Direction A handler sets `useStudioStore.setState({activeBuildingId})` → existing fly-to effect in StudioCanvas. Canvas-origin suppressed by `SelectionBridge.syncing` guard. Comment documents origin gating at Direction A handler.
- **T3 — PropertiesPanel→useSelection()**: Replaced `services.get('selection')` + EventBus subscription with `useSelection()` hook. Derives `selectedId` from `selection.lastSelected?.id`. Removed `useState`, `useEffect`, `useCallback` for selection sync.
- **T4 — String literals→enum**: Removed `Inspector = 'inspector'` from `SelectionOrigin` enum (speculative — not yet originating). `ExplorerItem.tsx` uses `SelectionOrigin.Explorer` value import instead of `'explorer' as SelectionOrigin`. Tests updated.
- **T5 — Integration tests**: 11 new tests in `SelectionIntegration.test.tsx` covering Direction A (SM→Zustand), Direction B (Zustand→SM), PropertiesPanel reactions, and full bridge integration.
- **T6 — Documentation**: Selection ownership invariant JSDoc in `EditorBridge.tsx` — `SelectionManager` is authoritative; `useStudioStore.{selectedNodeId, activeBuildingId}` are legacy compatibility projections. Spec updated with verification table.
- **Verification**: 753/753 tests passing (93 files, +11 new integration tests), navi-next committed at `280c573`, parent submodule reference updated
- **Working tree**: Clean in both repos
- **Next**: M3.0 — data import/wizard or TBD per roadmap

## 2026-07-10 � T2: DrawingSession hook + context

- **Created**: src/components/studio/useDrawingSession.tsx and src/components/studio/__tests__/useDrawingSession.test.ts
- **Verification**: 13/13 tests pass (all drawing session tests), 817/817 full suite
- **Commit**: 36eb2e6 � eat(studio): T2 create DrawingSession hook + context for ephemeral editing state
- **Next**: T3 onward per milestone plan

## 2026-07-10 — Phase 4: T9 MapRenderer Extraction

### T9 — Create MapRenderer (passive rendering component)

- **What**: Extracted rendering layer from StudioCanvas into a self-contained `rendering/` module.
- **Files created** (4 new):
  - `src/components/studio/rendering/constants.ts` — SRC, LYR, HIDDEN_NODE_TYPES
  - `src/components/studio/rendering/geojson.ts` — 5 pure GeoJSON builder functions (buildBuildings, buildNodes, buildConnectionNodes, buildEdges, buildTraces)
  - `src/components/studio/rendering/layers.ts` — `addSourcesAndLayers()` — idempotent source+layer registration
  - `src/components/studio/rendering/MapRenderer.tsx` — passive renderer component with `style.load` listener
- **Files edited**:
  - `src/components/studio/StudioCanvas.tsx` — removed ~142 lines of rendering logic, now imports `<MapRenderer>`
  - `src/components/studio/InteractionController.tsx` — imports SRC/LYR from `./rendering/constants`, replaced `syncAllData` calls with renderVersion bump
- **Test file created**: `src/components/studio/__tests__/MapRenderer.test.tsx` — 5 tests (sources on mount, idempotency, data push, style.load listener, graceful error handling)
- **Verification**: All 857 tests pass across 108 test files, TypeScript compiles with no new errors
- **StudioCanvas**: 340 lines (down from 482)

### Key design decisions
1. MapRenderer is completely passive — no selection, hover, tool, or command logic
2. `syncAllData()` not exported — data flow is purely reactive via props deps
3. `style.load` listener handles satellite/OSM style toggles without imperative sync calls
4. Building drag cancel uses `renderVersion` bump instead of imperative `syncAllData()`
5. SRC/LYR constants moved to `rendering/constants.ts` with updated import in InteractionController

- **Next**: T10 — Final cleanup (tooltip → InteractionController, roomDrag → DrawingSession, DrawingSession bridge removal)

## 2026-07-10 — T10: StudioCanvas Final Cleanup (complete)

### T10a — Extend useDrawingSession with setTracePoints/setDrawPoints
- **What**: Added `setTracePoints` and `setDrawPoints` to `DrawingSessionValue` interface and hook implementation. Needed by InteractionController for bulk-replacing points after vertex drag.
- **Tests**: 2 new tests (setTracePoints replaces all, setDrawPoints replaces all) — 15 total for useDrawingSession

### T10b — Move tooltip into InteractionController
- **What**: Moved tooltip state, mouseenter/mouseleave handlers, and tooltip JSX from StudioCanvas into InteractionController.
- **Changes**:
  - Added `CURSOR_CROSSHAIR` to `rendering/constants.ts` (shared constant)
  - InteractionController: added `useState` for tooltip, handlers in main useEffect, returns `<>{tooltip && <div>...</div>}</>`
  - StudioCanvas: removed tooltip state, mouseenter/mouseleave from map creation effect, tooltip JSX from return

### T10c — Replace drawing bridge with real useDrawingSession + simplify ConfirmBar
- **What**: Removed the legacy `useMemo` bridge that wrapped Zustand drawing state into a `DrawingSessionValue`. Replaced with direct `useDrawingSession(tool)` call.
- **Changes**:
  - StudioCanvas: removed 17 Zustand drawing selectors (tracePoints, drawPoints, routeWidth, pendingConfirm, etc.), removed 6 handler functions (handleConfirm/handleCancel/handleUndo/canConfirm/toolLabel/addDrawPoint), removed 40-line useMemo bridge
  - Added `const drawing = useDrawingSession(tool as ...)` — single source of truth for drawing state
  - ConfirmBar: simplified from 9 individual props to `{ drawing: DrawingSessionValue, tool }`. Derives everything internally (toolLabel, canConfirm, onUndo, etc.). Calls `drawing.requestConfirm()` and `drawing.cancel()` directly.
  - Added bidirectional pendingConfirm sync between drawing session and Zustand (for ConfirmOverlay compatibility)
  - CampusBoundary/BuildingTracer callbacks: use `drawing.setDrawPoints()` + `drawing.requestConfirm()` instead of Zustand `setPendingConfirm`
  - InteractionController: receives `onSetRoomDrag={drawing.setRoomDrag}` instead of local setter

### T10d — Cleanup & dead code removal
- **What**: Removed unused imports (`SRC`, `type LatLng`, `type Graph`, `useCallback`, `useMemo`, `BoundaryPolygon`, `BuildingFootprint` types)
- **StudioCanvas**: 236 lines (down from 340, down from 482, down from 896 in original)

### Verification
- **108 test files, 860 tests — ALL PASSING** (up from 857 before T10)
- **Zero new TypeScript errors** (pre-existing errors in legacy files only)

### Architecture
```
StudioCanvas (236 lines — pure composition root)
  ├── MapRenderer        ← passive rendering (graph → GeoJSON → sources)
  ├── InteractionController  ← events + tooltip + vertex/building drag
  ├── DrawingSessionProvider ← real useDrawingSession() value
  │   ├── DrawingOverlay
  │   └── PreviewOverlay
  ├── ConfirmBar          ← derives from drawing session
  ├── SelectionOverlay
  └── ViewportController
```

## 2026-07-11 — M2.6 StudioCanvas Decomposition (complete)

### T0 — Freeze legacy StudioCanvas as `StudioCanvas.legacy.tsx` (896-line reference)
- **Commit**: `085a83e`

### T2 — DrawingSession hook + context
- **Commit**: `36eb2e6`
- **Tests**: 13/13 drawing session tests, 817/817 full suite

### T3 — Extract ConfirmBar
- **Commit**: `a61091b`

### T4 — Extract SelectionOverlay (sole owner of `map.setFeatureState()`)
- **Commit**: `452d23a`

### T5 — Extract DrawingOverlay + PreviewOverlay
- **Commit**: `001e488`

### T6 — Extract ViewportController (sole owner of MapLibre camera methods)
- **Commit**: `f0591ef`
- **Note**: Leverages Viewport service's camera command API (`61079b0`)

### T7 — useToolController hook (bridges tool completion to CommandDispatcher)
- **Commit**: `0366fe9`

### T8 — Extract InteractionController (all pointer and keyboard event handling)
- **Commit**: `4fdb3d6`

### M2.1 — Migrate StudioToolbar to editor architecture
- **Commits**: `06a2565` (migration, toolbar unmounted), `05c70d8` (mount in StudioWorkspace)
- **What**: Introduced `EditingContextService` (mode only), registered in ServiceMap + EditorBridge, StudioToolbar rewritten to consume services via `useEditor()` — zero Zustand imports
- **Design constraints**: No EditorViewState, no bridges, no SelectionBridge extension

### M2.6 final — StudioCanvas composition root (cleanup + consolidation)
- **Commit**: `cf9ab52` (tagged `phase2-pre-floorcanvas`)
- **Architecture audit**: All 5 invariants confirmed — StudioCanvas store-free; StudioToolbar editor-service driven; WorkflowCard→WorkflowService; Selection→SelectionManager; no new `useGraphStore` in migrated roots.
- **Known debt**: M2.6 children (MapRenderer, InteractionController, ConfirmBar, useVertexEditor, ConfirmOverlay) still read legacy Zustand stores — accepted incremental baseline for M2.7

## 2026-07-11 — M2.7 FloorEditor UI State Migration (complete)

### Implementation (deviated from plan)

Key architectural decisions that differed from the original plan:
- **No `buildEditorContext()` extraction**: Instead of extracting a shared `buildEditorContext()` into `@navi/editor`, we registered ToolRegistry + Viewport directly in the existing `buildContext()` in `EditorBridge.tsx` (T1) and duplicated the bootstrap sequence in the floor route page wrapper (T2). The Plan A/B/C gate confirmed this is correct — extraction is deferred to Phase 3 (P3.1 Editor Bootstrap Consolidation).
- **Adaptation, not extension**: FloorAdapter (T3) and ToolAdapter (T4) are new application-layer hooks in `src/components/floor-editor/adapters/`, NOT in `@navi/editor`. They translate between editor services and FloorEditor concepts.
- **Building.floors is `number[]`**: Viewport stores `activeFloorId: string`. FloorAdapter converts with private helpers (`indexToId`, `idToIndex`). No type leak.

### Files changed/created
| File | Change |
|------|--------|
| `src/components/studio/EditorBridge.tsx` | T1 — Import + register ToolRegistry, Viewport |
| `src/components/floor-editor/configure-floor-editor-tools.ts` | T2 (NEW) — Idempotent floor tool registration |
| `src/app/.../floor/[floor]/page.tsx` | T2 — Wrap FloorEditor in EditorProvider with duplicated buildContext |
| `src/components/floor-editor/adapters/floor-adapter.ts` | T3 (NEW) — `useFloorAdapter()` hook |
| `src/components/floor-editor/adapters/tool-adapter.ts` | T4 (NEW) — `useToolAdapter()` hook |
| `src/components/floor-editor/FloorEditor.tsx` | T5+T6 — Consume SelectionManager, adapters; cleanup |
| `src/components/floor-editor/__tests__/FloorEditor185.test.tsx` | T7 — Add `useEditor` mock |

### Verification
- **Build**: `npm run build` — ✓ Compiled successfully
- **Tests**: **108 test files, 864 tests — all passing** (zero regressions)
- **Ownership greps**: Zero `useState<StudioTool>`, `useState<string | null>`, `viewport.*direct`, `useStudioStore`, `useUiStore` in FloorEditor.tsx
- **Acceptance checks** (all 7 pass):
  1. ToolRegistry in `services.get('toolRegistry')` — ✓
  2. Viewport in `services.get('viewport')` — ✓
  3. FloorAdapter only reads Viewport — ✓
  4. ToolAdapter only reads ToolRegistry — ✓
  5. SelectionManager replaces useState selection — ✓
  6. No dead state — ✓
  7. No direct ToolRegistry/Viewport imports in FloorEditor — ✓

### Commit
```
e5e6db4 feat(studio): M2.7 migrate FloorEditor UI state to editor services
```
### Next
Phase 3 — Editor Bootstrap Consolidation (P3.1) + Drawing Interaction (P3.2) + Phase 3 canvas migration

## 2026-07-11 — M2.8 FloorEditorCanvas Bugfixes (complete)

### What
Fixed 7 of 16 findings from the floor editor component review (`.planning/phases/floor-editor-review.md`). 6 CRITICAL/HIGH bugs resolved, 2 MEDIUM quality improvements.

### Tasks
| Task | Finding | Fix |
|------|---------|-----|
| T1 | #1 Floor plan image never loads | Added `mapInstance` to dep array |
| T2 | #5 Empty footprint NaN | Early return for `footprint.length === 0` |
| T3 | #6 Empty URL request | Removed `updateImage` with empty URL |
| T4 | #4 `graph.traces` unused | Removed from dep array |
| T5 | #8 Keyboard shortcuts need focus | Window-level `keydown` listener + input guard |
| T6 | #9 Empty catch blocks | Added `console.warn` with context |
| T7 | #15 `toggleLayer` not memoized | Wrapped in `useCallback` |

### Already fixed by graph.ts caching (June 3 bugfix)
- #3 Effects re-run on every render (graph.components now cached)
- #10 Drag handlers re-register on every store mutation
- #11 graph.buildings defeats useMemo

### Verification
- **Build**: `npm run build` — ✓ Compiled successfully
- **Tests**: **108 test files, 864 tests — all passing**
- **Files changed**: `FloorEditorCanvas.tsx` (7 edits), `FloorEditor.tsx` (1 edit)

### Commits
```
085a83e — legacy StudioCanvas freeze (M2.6)
e5e6db4 — M2.7 FloorEditor UI state migration
318dba5 — M2.8 FloorEditorCanvas bugfixes
```

### Next
Phase 3 — Editor Bootstrap Consolidation (P3.1) + Drawing Interaction (P3.2) + Phase 3 canvas migration
