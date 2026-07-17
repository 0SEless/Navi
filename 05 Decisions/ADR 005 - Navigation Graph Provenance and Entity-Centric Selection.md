# ADR 005 - Navigation Graph Provenance and Entity-Centric Selection

**Status:** Accepted
**Date:** 2026-07-15
**Author:** opencode Architecture Agent

## Context

NAVI Studio's selection layer had developed a drift: clicking a compiled
navigation-graph element on the canvas could resolve to a graph entity id
(`N0002`, `N0031`) rather than to a `CampusDocument` entity, producing the
runtime error `Entity not found: <id>` in the Properties panel. This violated
the new architecture's invariant that **selection is always of an authored
entity**.

Tracing the failures surfaced two distinct leak points, both rooted in the same
misconception — that the navigation graph is a first-class selection target:

1. **Explorer / graph-node click (EditorBridge).** `EditorBridge` resolved a
   graph node through "Direction A" (graph node → graph node) instead of
   "Direction B" (graph node → source `CampusDocument` entity via
   `NavNode.componentId`). Fixed by `resolveGraphNodeSelection.ts`, which maps a
   `NavNode`/`NavEdge` to its owning entity. (`packages/editor/src/components/studio/resolveGraphNodeSelection.ts`)
2. **Canvas road click (`select-tool.ts`).** `selectTool` routed road hits to
   `legacySelectTrace` (the legacy trace store) instead of
   `SelectionManager.select({ type: 'road', id })`. The road hit-test also ran
   *before* the node hit-test, so the compiled graph overlay (`l-nodes` /
   `l-nodes-connection`) intercepted clicks that landed on an authored road,
   selecting a graph node (`N0031`) instead of the road entity. Fixed by:
   - `ROAD_LAYERS` now points at the authored road layer (`navi-road-line`), not
     the legacy trace layers (`l-traces-line` / `l-traces-inner`).
   - A road hit calls `selection.select({ type: 'road', id }, SelectionOrigin.Canvas)`.
   - Authored-geometry hit-testing (building, road) runs **before** the node
     layers, so an authored road/building always wins over the derived graph
     overlay that renders on top of it.
   (`packages/editor/src/tools/select-tool.ts`)

These were symptoms of a single unresolved architectural rule: the navigation
graph is a **derived artifact** (ADR 004) and is therefore **not** an authored
selection target. Selection must be entity-centric end to end.

## Decision

Selection is **entity-centric**: `SelectionManager` owns only `CampusDocument`
entities (buildings, floors, rooms, roads, hallways, entrances, elevators, QR
codes, panoramas). The navigation graph is never an authored target.

1. **Graph entities are derived; they are not selectable targets.** A
   `NavNode`/`NavEdge` exists only because its source `CampusDocument` entity
   was compiled. They are never placed in `SelectionManager`.
2. **Provenance is mandatory.** Every compiled graph entity carries a
   `componentId` pointer to the `CampusDocument` entity that produced it
   (`NavEdge.componentId` added; `NavNode.componentId` already present). This is
   the seam between the derived graph and authored state.
3. **Graph clicks redirect to the source entity.** When a graph node/edge is
   clicked (Explorer or canvas), resolve it through `resolveGraphNodeSelection`
   → `SelectionManager.select({ type, id })`. The selection is always the
   authored entity.
4. **Canvas and Explorer use the identical selection path.** Both produce a
   `Selection` of `{ type, id }` consumed by `SelectionManager`. There is **no**
   separate "legacy trace" or second selection store for canvas clicks
   (legacy `legacySelectTrace` / `legacySelectNode` paths are not used by the
   new architecture).
5. **Hit-test priority: authored geometry wins over the derived overlay.** In
   `selectTool`, authored layers (building, road) are checked before node
   layers, so a click that overlaps both selects the authored entity, never the
   compiled graph node.
6. **No-provenance fallback = highlight only.** If a graph element has no
   `componentId` (should not happen for valid compiled output), do not throw
   `Entity not found` and do not select a non-entity — highlight/ignore only.
7. **Inspector reads the entity, never `SelectionManager` internals.**
   `PropertiesPanel` switches on `selection.type` and renders the matching
   `*Properties` component (`road` → `RoadProperties`, etc.). The panel is
   driven entirely by the selected entity from `CampusDocument`.

## Consequences

### Positive

- The `Entity not found: N0002` / `N0031` class of error is eliminated: canvas
  and Explorer both resolve to the same authored entity via `SelectionManager`.
- Live verification confirms the full lifecycle works on the entity model: draw
  a road → canvas-click selects the `road` entity → `RoadProperties` renders →
  editing Name propagates to `CampusDocument` (Explorer updates to the new name)
  → `EntityRenderer` redraws and `GraphAdapter` recompiles, with 0 console
  errors.
- Authored and derived concerns remain cleanly separated (ADR 004): the
  selection layer now matches the rendering layer's authored-vs-derived split.
- Selection is deterministic and testable: `selectTool` unit tests assert
  authored road wins over an overlapping graph node, and that a compiled trace
  is not treated as a road entity.

### Negative

- Clicking a graph node/edge always lands the user on the source entity, never
  on the graph element itself. (Acceptable: graph editing is vertex-editing via
  `NavigationGraphRenderer`, not selection — see ADR 004.)
- The canvas hit-test must preserve authored-first ordering; a future change
  that re-orders the layer checks could re-introduce `N00xx` leaks and must be
  guarded by tests.

## Alternatives Considered

| Alternative | Pros | Cons | Reason Rejected |
|---|---|---|---|
| Make graph nodes/edges first-class selectable entities | simplest if graph were authored | graph is derived, never authored; would duplicate entities and re-create `Entity not found` drift | contradicts ADR 004 (derived artifact) and the new-architecture invariant |
| Keep a separate legacy trace selection path for canvas | lowest migration effort | two selection paths diverge (canvas ≠ Explorer), re-introduces `N00xx` | rejected — the drift this ADR removes |
| Let the canvas select graph nodes and have the panel resolve them | "works" for panel | leaks graph ids into `SelectionManager`; panel still sees a non-entity; violates entity-centric rule | rejected — symptom-level fix, not root cause |

## Related

- Supersedes: the implicit "canvas road clicks go through the legacy trace
  store" arrangement, and the "graph node → graph node" resolution in
  `EditorBridge`.
- Depends on: ADR 004 (Rendering Responsibilities) — navigation graph is a
  derived artifact owned by `NavigationGraphRenderer`, fed by `GraphAdapter`.
- Referenced by: `packages/editor/src/tools/select-tool.ts`,
  `packages/editor/src/components/studio/resolveGraphNodeSelection.ts`,
  `packages/editor/src/components/studio/EditorBridge.tsx`,
  `packages/editor/src/context/selection-manager.ts`,
  `packages/editor/src/panels/properties/PropertiesPanel.tsx`,
  `packages/editor/src/panels/properties/road-props.tsx`,
  `packages/editor/src/rendering/entity-renderer.ts`.
- Evidence (verified 2026-07-15):
  - `select-tool.ts:ROAD_LAYERS` → `['navi-road-line']`; road hit →
    `selection.select({ type: 'road', id }, SelectionOrigin.Canvas)`; node
    check runs last.
  - `draw-room-tool.verify.test.ts`: `selects an authored road via
    SelectionManager`, `does not treat a compiled trace as a road entity`,
    `prefers an authored road over an overlapping compiled graph node` (all pass).
  - Live Studio (`/studio/verify-campus/edit`): drawing a road and
    `Select`-clicking it selects the `road` entity (Properties panel shows
    **Road** with Name/Width/Surface/Type; Explorer shows `↔ Road` selected);
    editing Name updates the Explorer; 0 console errors. Previously the same
    click produced `Entity not found: N0031`.
- Roadmap: M4.2 removes `GraphAdapter` but keeps the compiler, so the nav-graph
  stays derived and provenance via `componentId` remains the contract.
