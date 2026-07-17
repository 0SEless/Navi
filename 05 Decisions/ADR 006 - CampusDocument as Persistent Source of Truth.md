# ADR 006 - CampusDocument as the Persistent Source of Truth

**Status:** Accepted
**Date:** 2026-07-15
**Author:** opencode Architecture Agent

## Context

ADR 005 established that the navigation graph is a **derived artifact** and that
**selection is always of an authored `CampusDocument` entity**. ADR 004 separated
rendering into `EntityRenderer` (reads `CampusDocument`) and
`NavigationGraphRenderer` (reads the compiled graph).

During the P1.2 migration audit, a deeper seam was found at the **persistence
boundary**: the legacy `Graph` JSON is the stored model, and `CampusDocument` is
rebuilt *from* it on load (`create-editor-context.ts:82-244`). Every edit is
compiled back into that graph via `GraphAdapter.sync`, and `save()` serializes the
graph (`graph-store.ts:222-229` → `/api/graph` → `graph_snapshots.data` JSONB).

This means the **compiled output is masquerading as authored data**. It violates
both ADR 004 (graph is derived) and ADR 005 (only entities are editable/persisted
as such), and it keeps `CampusDocument` from being the real source of truth
regardless of how clean the rest of the architecture is.

## Decision

**Only `CampusDocument` is serialized and persisted.** The Navigation Graph is
always regenerated from `CampusDocument` during load, publish, and runtime
compilation. Persisting compiled graph artifacts as the stored model is
**prohibited**; compiled artifacts may exist only as build/runtime bundles
(e.g. `demo-output/navigation.graph.json`).

1. **`CampusDocument` is the canonical stored shape.** `persistenceAdapter.save()`
   serializes `CampusDocument`; `load` reconstructs `CampusDocument` and then
   compiles it to the Navigation Graph via `GraphAdapter.sync`.
2. **The compiled graph is a runtime projection only.** `GraphAdapter.sync` runs
   on `document.changed` to feed `NavigationGraphRenderer`; it is never persisted
   as the source of truth.
3. **`CampusDocument` must round-trip losslessly.** A `serialize`/`deserialize`
   pair covers every entity type (buildings, floors, rooms, hallways,
   staircases, elevators, entrances, **roads**, **panoramas**, **qrCheckpoints**,
   and `version`). `createDocument`'s current drops of roads/panoramas/QR are
   defects to be fixed, not accepted behavior.
4. **Backward compatibility is a migration concern, not a permanent dual model.**
   Legacy `Graph` snapshots already in storage are converted once to
   `CampusDocument` on load and re-saved as documents; the dual read path is
   removed once conversion is verified.
5. **Storage stores the document.** The Supabase `graph_snapshots.data` (or an
   equivalent) holds document-shaped JSONB as the source of truth; normalized
   `buildings`/`route_nodes`/`route_edges` are derived.

## Invariant S0 (the architectural invariant this ADR enforces)

> At every point in time there is exactly one mutable authoring model:
> **`CampusDocument`**. All other models are derived projections.

This is the single sentence that prevents future regressions. If a contributor
is tempted to persist a compiled/derived representation, S0 is the rule that
stops them.

## Persistent Data Rule (project-wide, not navigation-only)

```
CampusDocument is the only persisted authoring model.

Every other representation
  (Graph, NavigationGraph, Compiler Output,
   Spatial Index, Render Cache, Search Index)
is reconstructible.

If it can be reconstructed,
it must never become the persistent source of truth.
```

This generalizes ADR 006 beyond navigation: any model that can be regenerated
from `CampusDocument` is a cache/projection and must not be stored as the source
of truth.

## Interaction Ownership Rule (promoted 2026-07-15)

> Every editor interaction is owned by exactly one `ToolRegistry` tool.
> `InteractionController` is an event router only and never performs authoring,
> selection, graph mutation, persistence, or rendering logic.

This is the fourth ownership invariant, and together with ADR 004/005/006 it
makes the whole pipeline internally consistent:

```
Interaction
      │
      ▼
Tool
      │
      ▼
Command
      │
      ▼
CampusDocument
      │
      ▼
Compiler
      │
      ▼
Navigation Graph
      │
      ▼
Renderer
```

The ownership invariants by layer:

| Concern        | ADR | Rule |
| ---            | --- | --- |
| Rendering      | 004 | `EntityRenderer` owns authored-world draw; `NavigationGraphRenderer` owns graph draw |
| Selection      | 005 | selection is always of a `CampusDocument` entity, via `SelectionManager` |
| Persistence    | 006 | `CampusDocument` is the only persisted authoring model |
| **Path authoring** | 006 | `Road` is the only authored path entity; compiled traces/edges are compiler output, never editable |
| **Tool activation** | 006 | `ToolRegistry.activate()` is the only way to activate a tool; UI delegates, no parallel `setTool` |
| **Interaction**| 006 | every interaction is owned by exactly one tool; `InteractionController` only routes |

**Migration discipline (Seam 2):** `InteractionController` may be deleted only
after every capability row in the Stage A ownership matrix has a *verified* new
owner and its legacy handler is removed. Deletion is the last step, not the
first.

## Road Authoring Rule (promoted 2026-07-15)

> **Roads are the only authored path entities.** Compiled traces, navigation
> edges, and intermediate routing geometry are compiler-generated artifacts and
> are never directly editable. All path editing is performed through `Road`
> entities, after which the compiler regenerates the navigation graph.

A compiled trace is compiler output, exactly like `NavNode`, `NavEdge`,
`Intersection`, or a connection node. A user cannot create, rename, delete, or
meaningfully inspect a compiled trace — so it must not be an editable concept in
the authoring model. This prevents the dual authoring path
(`Road Tool → CampusDocument` **and** `Compiled Trace Tool → Graph`) that would
re-violate ADR 006. The compiler alone owns connectivity (intersections, shared
vertices, endpoints).

Consequence for Seam 2 gaps: **G1 (compiled-trace selection) and G7 (legacy
`route`/trace editing) become planned removals, not missing tools.** Canvas
clicks resolve to `Road` via provenance; the `route` tool becomes `draw-road`
only.

## Tool Activation Rule (promoted 2026-07-15)

> **`ToolRegistry` is the only mechanism allowed to activate editing tools.**
> UI components — `Toolbar`, `ComponentPalette`, keyboard shortcuts, and future
> command palettes — must all delegate to `ToolRegistry.activate()`. No UI
> component may activate tools through legacy `setTool` state or any parallel
> activation mechanism.

There must be exactly one activation path and one active tool:

```
UI (Toolbar / ComponentPalette / shortcuts)
      │
      ▼
ToolRegistry.activate(toolId)
      │
      ▼
Active Tool
      │
      ▼
InteractionController (router only)
      │
      ▼
Tool.onPointer...
```

During migration, `setTool` may survive as a thin adapter that calls
`toolRegistry.activate`, but the legacy `switch (tool)` fallback in
`InteractionController` and the parallel tool-enum mechanism are removed once
`ComponentPalette` is fully on the registry. This closes **G9**.

## Legacy Reachability Rule (promoted 2026-07-15)

> Legacy implementations may remain temporarily during migration, but they must
> be **unreachable from production UI**. Unreachable legacy code is *migration
> debt*; reachable legacy code is *architectural drift*.

This is the distinction that makes a strangler-fig migration safe. Keeping an
unused implementation around while its callers are cut over is acceptable —
it is bounded, diagnosable debt. Keeping **two active paths** to the same
behavior (e.g. both `ToolRegistry.activate` and a legacy `setTool` switch
reachable from the UI) is drift, because the two can diverge and neither is
clearly authoritative.

**Operational rule (before any legacy deletion):** prove reachability first.
`grep` every entry point (`setTool(`, `legacySelectNode`, `legacySelectTrace`,
etc.), confirm usage, run tests, do a browser pass, confirm coverage, **then**
delete. Deleting before this audit risks hiding a consumer that becomes hard to
diagnose once the code is gone. G9 closed because the legacy `switch(tool)` is
now unreachable, not because it was deleted.

### Deferred UI elements (not product removals)

UI controls with no `ToolRegistry` implementation are removed from the active
UI but kept on the roadmap. Example: `Wall` and `Door` palette buttons were
removed from `ComponentPalette` — there is no `draw-wall` / `draw-door` tool and
no `Wall` / `Door` entity model, so the buttons would violate the Tool Activation
Rule (activate nothing). Recorded as:
**Deferred. Not removed from the product roadmap; removed from the active UI
because no `ToolRegistry` implementation exists.** Re-add only when a
`draw-wall` / `draw-door` tool is implemented.

## Consequences

### Positive

- The architecture finally matches the intended pipeline end to end:
  `CampusDocument → Save` and `Load → CampusDocument → Compile → NavigationGraph`.
- No authored state can silently live only inside the compiled graph (the root
  cause of past data-loss and "Entity not found" drift).
- Future features (multi-floor, etc.) build on a single unambiguous source of
  truth.

### Negative

- Requires adding real `CampusDocument` serialization (T1.1) and a one-time data
  migration for campuses already stored as legacy graphs (T1.4).
- Stored graphs that already dropped roads/panoramas/QR cannot recover that data;
  the migration preserves what the graph contains and prevents further loss.

## Alternatives Considered

| Alternative | Pros | Cons | Reason Rejected |
|---|---|---|---|
| Keep persisting the graph; treat `CampusDocument` as a view | smallest change | `CampusDocument` is never truly the source of truth; re-introduces every drift ADR 004/005 forbid; data can live only in the graph | contradicts ADR 004 + ADR 005; perpetuates the root seam |
| Persist both graph and document | reversible | dual source of truth; divergence risk; which wins on load? | rejected — two sources of truth is the problem we are removing |
| Persist document but skip migration of old graphs | simplest | existing campuses break or lose data on first save | rejected — data loss; violates the migration-safety rule |

## Related

- Supersedes: the implicit "legacy `Graph` JSON is the stored model" arrangement
  (`graph-store.ts:222-229`, `/api/graph/route.ts:50-65`,
  `migrations/001_initial_schema.sql:134-161`).
- Depends on: ADR 004 (Renderer Separation), ADR 005 (Entity-Centric Selection &
  Graph Provenance).
- Enables: P1.2 Seam 1 (persistence inversion), then Seam 2 (InteractionController
  router) and Seam 3 (canvas node selection).
- Referenced by: `packages/core/src/types/document.ts`,
  `packages/editor/src/context/create-editor-context.ts:82-244,343-350`,
  `src/components/studio/EditorBridge.tsx:63-89`,
  `src/store/graph-store.ts:206-229`.
- Evidence (audit 2026-07-15): `create-editor-context.ts:82-244` builds the
  document FROM the graph; `graph-store.ts:222-229` `save()` serializes
  `graph.toJSON()`; `graph_snapshots.data` is JSONB holding the full legacy graph.
