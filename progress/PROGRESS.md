# Progress Log

## 2026-07-03
- **What**: Fixed React error #185 (Maximum update depth exceeded) on floor editor page
- **Root cause**: Graph class getters returning new array references causing `useSyncExternalStore` infinite re-render loop
- **Fix**: Added cached array fields with lazy population and cache invalidation in every mutation method
- **Verification**: All 91 tests pass, production build succeeds, floor editor page loads without errors
- **Deploy**: Vercel production deploy successful → https://navi-next.vercel.app
- **Next**: —
- 
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
