# M2: Core Spatial Editor

## What

Build the editor application layer and a minimal React UI shell so a user can see a map, create/rename/delete buildings via commands, select them, undo/redo with Ctrl+Z/Ctrl+Shift+Z, and see validation errors.

**Deliberately deferred to later milestones:** Save/restore system, Properties panel (entities too bare), and drawing tools (M3).

## Success Criteria

1. **EditorContext** owns Document, Dispatcher, History, Selection, ToolRegistry, Validation, EventBus, and Viewport — every panel gets `useEditor()`
2. **MapLibre GL canvas** displays base map tiles with pointer events forwarded to the active tool
3. **Command pipeline** works: all mutations flow through Dispatcher → Command → Document; `building.create`, `building.rename`, `building.delete` execute and are reversible
4. **EventBus** supports batched transactions (`transaction.begin`/`transaction.end`) so panels redraw once per batch
5. **Selection model**: click selects building, shift+click toggles multi-select, click empty clears; selection clears on tool change
6. **Undo/redo**: Ctrl+Z dispatches inverse command (or loads snapshot), Ctrl+Shift+Z replays original; history always flows through Dispatcher
7. **Viewport** manages camera state (zoom, center, bearing, pitch) and UI state (active building, active floor, active layer)
8. **Validation** is plugin-based: `ValidationRegistry` with per-entity-type validators; Tier 1 rules (polygon closure, self-intersection, dup IDs) register as plugins
9. **Editor shell** renders with menu bar, canvas, left sidebar (toolbar + layers), right sidebar (problems), and status bar
10. **All 45+ tests pass**

## Known Pitfalls

- MapLibre GL npm install may have Windows-native dependency issues — pin version, check peer deps
- React 19 concurrent features can break zustand subscriptions — use `useSyncExternalStore` or shallow comparison
- Command serialization for undo/redo needs structuredClone-compatible payloads
- EventBus transactions must handle nested begin/end correctly (stack counter, not boolean flag)
