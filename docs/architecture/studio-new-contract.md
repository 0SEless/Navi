# studio-new Contract

> What is allowed inside `apps/studio-new/`.

## Purpose

This contract governs every file committed to `apps/studio-new/`. It exists to prevent the new application from inheriting the architectural drift that accumulated in `src/`.

## Allowed Dependencies

```
@navi/core          → CampusDocument types, geometry utilities
@navi/compiler      → compile pipeline, artifacts, publisher
@navi/editor        → ToolRegistry, SelectionManager, EntityRenderer,
                      ValidationEngine, Viewport, CommandBus, services,
                      React hooks (useEditor, useSelection, etc.),
                      React components (PropertiesPanel, LayersPanel, etc.)
@navi/runtime       → RuntimeEngine, SearchEngine, RoutingEngine
```

## Forbidden Dependencies

```
useGraphStore       → Use @navi/editor's document store instead
useStudioStore      → Use @navi/editor's SelectionManager + Viewport instead
MapRenderer         → Use EntityRenderer from @navi/editor instead
NavigationGraphRenderer → Rewrite using @navi/editor's rendering primitives
InteractionController  → ToolRegistry handles this natively
SRC / LYR constants → Use SOURCE_IDS / LAYER_IDS from @navi/editor
Graph (legacy)      → CampusDocument is the canonical data model
legacySelectNode    → Use SelectionManager.select()
legacySelectTrace   → Use SelectionManager.select({type:'road', id})
```

## Gate Rule

Every component must pass this check before entering `studio-new`:

> Can this component compile **without** importing from:
> - `@/store/graph-store`
> - `@/store/studio-store`
> - `@/store/campus-map-store`
> - `@/engine/` (legacy engine directory)
> - `@/components/studio/rendering/constants`
> - Any `.legacy.` file
> - `src/components/studio/legacy/`
>
> **YES** → Accept
>
> **NO** → Rewrite from `@navi/*` packages

## Strategy

1. **Build incrementally** — one capability at a time, verified before moving on.
2. **No wholesale copies** — every file enters through the gate.
3. **Reference only** — `src/` is read-only. Fix bugs in the new app, not the old one.
4. **Packages are the foundation** — if something is missing from a package, extend the package, not the app.

## File Structure

```
apps/studio-new/
  app/
    layout.tsx        ← Next.js root layout
    page.tsx          ← Dashboard (map list)
    studio/
      [id]/
        page.tsx      ← Editor page (single campus document)
  components/
    StudioShell.tsx   ← Layout shell (toolbar + panels + canvas)
    MapCanvas.tsx     ← MapLibre init + EntityRenderer
    Toolbar.tsx       ← ToolRegistry buttons
    Explorer.tsx      ← Document tree
    Inspector.tsx     ← Selection properties
    ConfirmBar.tsx    ← Drawing confirm/cancel
    Overlays.tsx      ← Drawing + selection + preview overlays
  lib/
    persistence.ts    ← Load/save CampusDocument (localStorage + optional sync)
    editor-context.ts ← createEditorContext + EditorProvider setup
  styles/
    globals.css
```

## Verification

Before moving to the next stage:

```
Stage passes when:

  - app compiles with zero type errors
  - app runs without console exceptions
  - the ONE capability being built works end-to-end
  - no legacy stores imported
  - no legacy renderers imported
```
