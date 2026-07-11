# M2.7 — FloorEditor UI State Migration

## WHAT

Integrate FloorEditor's UI state into the editor service infrastructure — ToolRegistry, SelectionManager, Viewport, EditingContext — while leaving floor-specific logic (useFloorDrawing, rendering, graph model) untouched. Follows the same pattern as M2.1 (Toolbar) and M2.6 (StudioCanvas decomposition).

## Success Criteria

1. FloorEditor is wrapped in `EditorProvider` (same `DocumentFrame` / `useEditor()` contract used by StudioCanvas)
2. `useState<StudioTool>('select')` is replaced by `ToolRegistry.activeTool` + `ToolRegistry.setTool()`
3. `useState<string | null>(null)` selection is replaced by `SelectionManager.selectedId` + `SelectionManager.select()`
4. `Viewport.activeFloorId` (string) is the UI source of truth for the active floor; `floor: number` becomes a domain detail, converted via a boundary adapter at the graph API boundary
5. `useFloorDrawing` is **untouched** — its signature stays the same, still receives `floor: number`
6. `EditorBridge` is already registered — FloorEditor picks up services from the existing `DocumentFrame` without registering new ones
7. No duplicated UI state: the three React `useState` calls (tool, selectedId, layers) are either migrated or owned by services
8. TypeScript passes with no new errors; existing tests pass

## Pitfalls from ERRORS.md

- **React #185 (infinite re-render)**: FloorEditor reads `useGraphStore((s) => s.graph)` — the graph getter cache fix prevents this. Any new selector that derives arrays from the graph must also be cached.
- **Map#getSource on removed map**: `useFloorDrawing`'s effect cleanup has try-catch, but any new editor services that touch the maplibre map in cleanup need the same guard.
- **SelectionManager version clash**: SelectionManager already renamed its getter to `revision`. No collision risk. Just use the existing class.

## Non-goals

- ❌ Rewrite FloorEditorCanvas renderer
- ❌ Rewrite useFloorDrawing or draw-reducer
- ❌ Rewrite graph model (Component.floor stays number)
- ❌ Rewrite commands
- ❌ Convert graph store to string floor IDs
