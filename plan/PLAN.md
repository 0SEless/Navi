# Plan: Route Connection + Vertex Recompile + Node Selection

## Task Order (T3 smallest → T2 → T1 core feature)

### T3 — Selected Node Highlight (`StudioCanvas.tsx`)
**Files**: `src/components/studio/StudioCanvas.tsx`
**Acceptance**: Clicking a node turns it cyan + larger. Clicking empty space resets. Escape deselects.
**Prevent**: Don't crash if map/source not ready. Don't leak feature-state after deselect.

- T3a: Add `map.setFeatureState` on node click in the select-tool handler
- T3b: Add selected node tracking (ref to hold previous selected node ID)
- T3c: Update `LYR.NODES` paint to react to `feature-state.selected`
- T3d: Handle deselect (click empty space, Escape key)

### T2 — `recompileTrace` Method (`graph.ts` + `graph-store.ts` + `StudioCanvas.tsx`)
**Files**: `src/engine/graph.ts`, `src/store/graph-store.ts`, `src/components/studio/StudioCanvas.tsx`
**Acceptance**: After vertex edit, trace nodes in graph match updated trace points. Old nodes removed.
**Prevent**: React #185 — invalidate `_cachedNodes`/`_cachedEdges`/`_cachedTraces`. Handle `traceIds[]` on shared intersection nodes — only remove this trace's ID, don't delete the node if other traces reference it.

- T2a: Add `Graph.recompileTrace(traceId)` that:
  1. Gets trace by ID
  2. Collects old nodes where `metadata.traceId === id` or `metadata.traceIds?.includes(id)`
  3. For nodes with `traceIds` array: remove this `traceId` from array, don't delete if array non-empty
  4. Remove nodes where `metadata.traceId === id` (single owner)
  5. Remove orphaned edges
  6. Re-runs `compileTrace()` with current trace points
  7. Re-runs intersection detection (T1) against all other routes
  8. Tags new nodes with `metadata.traceId = trace.id`
  9. Adds new nodes + edges
  10. Invalidates all caches
- T2b: Add `graph-store.recompileTrace(id)` action that delegates + bumps renderVersion
- T2c: Wire in `StudioCanvas.tsx` vertex save handler (line 242-247) — call `recompileTrace` instead of `updateTrace`

### T1 — Route Intersection Detection (`trace-compiler.ts` + `graph.ts`)
**Files**: `src/engine/trace-compiler.ts`, `src/engine/graph.ts`
**Acceptance**: When a new route crosses/touches an existing route, intersection node is created, existing edge is split, and the routes are connected. Endpoint-on-centerline creates T-junction node.
**Prevent**: 0.5m dedup for existing intersection nodes. Don't connect a route to itself. Don't crash if no existing routes.

- T1a: Add `findTraceIntersections(trace, existingTraces)` in `trace-compiler.ts`
  - For each segment of new trace, check segments of each existing trace via `lineSegmentIntersection`
  - Return list of `{ position, existingEdgeId, existingTraceId }`
- T1b: Extend `CompileTraceResult` with `edgeSplits: { edgeId, position, traceIds }[]`
- T1c: Add endpoint-on-edge detection (T-junction) using `pointToSegmentDistance` + `closestPointOnSegment`
  - For first and last trace point, check if within 5m of any existing trace's edge segment
  - Create intersection node at closest point on segment
  - Record edge split in result
  - Trim the excess endpoint (snap trace endpoint to the intersection node position)
- T1d: Apply edge splits in `addTraceWithCompile` (graph.ts)
  - For each split: remove the old edge, create two sub-edges through intersection node
  - Tag intersection nodes with `traceIds: [existingTraceId, newTraceId]`
  - Connect new trace's node to the intersection node
- T1e: Call trace intersection detection and endpoint snapping from `addTraceWithCompile` after initial `compileTrace()`
