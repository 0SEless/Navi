# ADR 004 - Rendering Responsibilities

**Status:** Accepted
**Date:** 2026-07-14
**Author:** opencode Architecture Agent

## Context

NAVI Studio currently renders both authored campus geometry and the compiled
navigation graph through a single legacy component, `MapRenderer`. `MapRenderer`
reads `CampusDocument` for buildings/roads AND `graph-store` for navigation
nodes/edges, accumulating two distinct responsibilities. Tracing the data flow
showed the navigation graph is **not** another representation of the
CampusDocument — it is **compiler output**:

```
CampusDocument
      │  document.changed
      ▼
GraphAdapter.sync(document)        packages/editor/src/graph-adapter.ts:51
      │  clears graph, rebuilds buildings + floor→components, compiles
      ▼
graph-store.Graph (legacy Graph)
      │  compileComponent / addTraceWithCompile
      ├── NavNode[]   ← GENERATED, never authored
      └── NavEdge[]
      │
      ▼
MapRenderer reads graph.nodes/edges (src/components/studio/rendering/MapRenderer.tsx:72)
```

The graph is a **derived artifact** (two steps removed from CampusDocument:
document → components/traces → compiled nodes/edges). This means the two visual
concerns have fundamentally different lifecycles and authors, and belong in
separate owners.

## Decision

Decompose rendering into two visual domains, each with exactly one owner:

| Component | Input | Responsible for |
|---|---|---|
| **EntityRenderer** | `CampusDocument` | Buildings, Roads, Rooms, Hallways, Entrances, Elevators, QR, Panoramas |
| **NavigationGraphRenderer** | Compiled Graph (`graph-store`) | Nav Nodes, Nav Edges, Vertex Editing Overlay, Graph Visibility, Graph Selection |
| **InteractionController** | pointer/tool events | Pointer events, tool dispatch, hit testing |

- The legacy `MapRenderer` is **deleted**.
- The navigation graph is rendered by a new component named
  **`NavigationGraphRenderer`** (not `GraphOverlay` — named after its
  responsibility, the compiled navigation graph).
- `NavigationGraphRenderer` reads the compiled `Graph` from `graph-store`, fed
  by `GraphAdapter`. This is durable: the roadmap removes `GraphAdapter` (M4.2)
  but keeps the compiler, so the nav-graph stays derived forever.
- Migration order is **extract → swap → delete**, never a commit where
  `MapRenderer` and `NavigationGraphRenderer` both own the graph:
  1. Extract graph rendering from `MapRenderer`.
  2. Create `NavigationGraphRenderer`.
  3. Mount `EntityRenderer` + `NavigationGraphRenderer`.
  4. Delete `MapRenderer`.
  5. Verify.
  6. Then selection migration (Phase 3).

## Consequences

### Positive

- Each architectural responsibility has exactly one owner (eliminates the
  dual-renderer seam and the responsibility drift that created `MapRenderer`).
- The two lifecycles are independent: a `Room Created` event redraws
  `EntityRenderer` (from `CampusDocument`) and, simultaneously, triggers
  `GraphAdapter` → compiler → `GraphOverlay` redraw (from the compiled graph).
- Layer toggles become trivial: Buildings/Roads/Rooms and the Navigation Graph
  can be shown independently (`NavigationGraphRenderer` owns graph visibility).
- Vertex editing naturally lives in `NavigationGraphRenderer` (it edits the
  graph, not the document).
- Future debugging/feature work is isolated per domain.

### Negative

- One additional component to maintain (`NavigationGraphRenderer`).
- `NavigationGraphRenderer` must replicate the graph-specific parts of
  `MapRenderer`: `activeFloor` filtering, regular/connection-node split, edges,
  layer-visibility toggles, and vertex-editing visibility.

## Alternatives Considered

| Alternative | Pros | Cons | Reason Rejected |
|---|---|---|---|
| Extend `EntityRenderer` to also render the nav-graph | one component | couples `EntityRenderer` (reads `CampusDocument`) to `graph-store` (derived); muddies authored vs generated | violates the derived-vs-authored separation this ADR establishes |
| Keep `MapRenderer` only for the graph overlay | lowest effort, lowest risk | violates the single-renderer goal; preserves the exact seam we are removing | rejected — perpetuates the problem |
| One mega-renderer owning everything | simplest file layout | no separation of lifecycle; layer toggles harder; re-creates the drift | rejected — this is the status quo |

## Related

- Supersedes: the implicit "single `MapRenderer` owns all map rendering" arrangement.
- Referenced by: StudioCanvas composition (`src/components/studio/StudioCanvas.tsx`), `graph-store.ts`, `graph-adapter.ts`, `MapRenderer.tsx`.
- Evidence: `packages/editor/src/graph-adapter.ts:51`, `src/store/graph-store.ts:123,167`, `src/components/studio/rendering/MapRenderer.tsx:72-94`, `packages/editor/src/context/create-editor-context.ts:339-350`.
- Roadmap: `M4.2` removes `GraphAdapter` but keeps the compiler (nav-graph stays derived).
