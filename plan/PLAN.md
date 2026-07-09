# M2: Core Spatial Editor — Execution Plan

## Architecture

```
packages/core  (types, geometry, serialization)
       ↑
packages/editor  (@navi/editor — this milestone)
       ↑
navi-next  (Next.js app imports from @navi/editor)
```

New package `packages/editor/` depends on `@navi/core` and `react`.

---

## Revised Task Order (per review feedback)

```
T1  Scaffold
T2  EditorContext + Service Registry
T3  EventBus (with transaction batching)
T4  Command Pipeline (Dispatcher, Registry, Schema, building handlers)
T5  History Stack (hybrid inverse/snapshot, always through dispatcher)
T6  Selection Manager
T7  Tool Registry + SelectTool + PanTool
T8  Viewport (camera + UI state)
T9  Validation (plugin-based ValidationRegistry)
T10 Canvas (MapLibre GL, pointer events → tools)
T11 Editor Shell (layout, menu bar, status bar)
T12 Panels (Layers, Problems — skip Properties until M3)
T13 Tests (~50 tests)
```

**Save System (T8 from previous plan) → deferred to M3.** Reason: no drawing tools yet, nothing meaningful to auto-save. Crash recovery without real work is untestable.

**Properties Panel → deferred to M3.** Reason: buildings only have name+ID; adding footprint/floors/entrance editing will require a rewrite.

---

### T1 — Scaffold `packages/editor/`

**Files:** `packages/editor/package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`

**What:** Workspace package with `@navi/core` as dependency, vitest configured, barrel export.

**Acceptance:** `npm install` resolves, `@navi/editor` importable, vitest runs.

---

### T2 — EditorContext + Service Registry

**Files:** `packages/editor/src/context/editor-context.ts`, `packages/editor/src/context/service-registry.ts`, `packages/editor/src/context/index.ts`

**What:**
- `EditorContext` — single object that owns Document, Dispatcher, History, Selection, ToolRegistry, Validation, EventBus, Viewport
- `ServiceRegistry` — map of service names to instances, lifecycle (init/destroy)
- React context + `useEditor()` hook so any panel/component does `const editor = useEditor()` instead of importing 8 different stores

```
EditorContext {
  document: CampusDocument
  dispatcher: CommandDispatcher
  history: HistoryStack
  selection: SelectionManager
  toolRegistry: ToolRegistry
  validation: ValidationRegistry
  eventBus: DocumentEventBus
  viewport: ViewportState
}
```

**Acceptance:** `useEditor()` returns the context; services are accessible by name; init() wires everything; destroy() cleans up.

---

### T3 — EventBus (with Transaction Batching)

**Files:** `packages/editor/src/eventbus.ts`

**What:**
- Typed events: `entity.created`, `entity.updated`, `entity.deleted`, `selection.changed`, `tool.changed`, `viewport.changed`, `document.loaded`
- `DocumentEventBus` with `on(type, handler)`, `off(type, handler)`, `emit(type, payload)`
- **Transaction support:**
  - `transaction.begin` — increments a counter (supports nesting)
  - `transaction.end` — decrements counter; when it reaches 0, flushes all queued events
  - During a transaction, events are queued instead of dispatched immediately
  - Panels subscribe to `transaction.flush` (or use `transaction.onCommit`) to redraw once
- Unsubscribe returns a cleanup function — panels call it in `useEffect` cleanup

**Acceptance:** Events fire; multiple listeners work; unsubscribe prevents leaks; batched transaction emits one flush per batch, not per event.

---

### T4 — Command Pipeline

**Files:** `packages/editor/src/commands/types.ts`, `packages/editor/src/commands/registry.ts`, `packages/editor/src/commands/dispatcher.ts`, `packages/editor/src/commands/building-handlers.ts`

**What:**
- `Command` interface: `id, payload, handler(document, payload): MutationResult, inverse?(payload): InverseCommand | null, label, schema`
- `CommandRegistry` — maps command IDs to handlers; plugins register here
- `CommandDispatcher` — single entry: pre-hooks → validate → execute → post-hooks (emit events) → push to history
- `CommandSchemaRegistry` — Zod or simple JSON Schema validation per command
- Building handlers:
  - `building.create` — inserts Building, emits `entity.created`
  - `building.rename` — updates name, emits `entity.updated`
  - `building.delete` — removes building + all floors, emits `entity.deleted`

**Key invariant:** History stack is NEVER manipulated directly. Undo dispatches an inverse command; redo dispatches the original. All mutations go through the dispatcher.

**Acceptance:** Creating a building works and emits event; renaming works; deleting works; pre/post hooks fire; each command declares inverse (or `null` = snapshot needed).

---

### T5 — History Stack

**Files:** `packages/editor/src/history.ts`

**What:**
- `HistoryStack`: `past: HistoryEntry[], future: HistoryEntry[], maxMemory: 200MB`
- Push: stores `{ command, beforeDigest, afterDigest, snapshot? }`
- `undo()`: if entry has snapshot → restore snapshot; if entry has inverse → `dispatcher.execute(inverseCommand)`
- `redo()`: always `dispatcher.execute(originalCommand)`
- Memory limit: estimate entry size, drop oldest snapshots first when exceeding 200MB
- `beforeHash`/`afterHash` via xxHash64 snapshots of CampusDocument

**Acceptance:** Undo restores exact prior state (hash-match verified); redo replays; new command after undo clears future; memory never exceeds 200MB.

---

### T6 — Selection Manager

**Files:** `packages/editor/src/selection.ts`

**What:**
- `SelectionManager`: `entityIds: Set<string>, hoveredEntityId: string | null, lastSelectedId: string | null`
- Derived: `selectedEntities: Entity[]`, `boundingBox: BBox | null`
- Methods: `select(id)`, `toggle(id)`, `clear()`, `setHover(id)`, `clearHover()`
- Events: emits `selection.changed` and `hover.changed` through EventBus
- Auto-clears when active tool changes (listens to `tool.changed`)

**Acceptance:** Selection state correct; shift+click toggles; empty space clears; tool change clears; events fire.

---

### T7 — Tool Registry + SelectTool + PanTool

**Files:** `packages/editor/src/tools/types.ts`, `packages/editor/src/tools/registry.ts`, `packages/editor/src/tools/select-tool.ts`, `packages/editor/src/tools/pan-tool.ts`

**What:**
- `Tool` interface: `id, label, cursor, onActivate, onDeactivate, onPointerDown/Move/Up, onKeyDown, renderOverlay?`
- `ToolRegistry`: `register(tool), activate(id), deactivate(), getActive(): Tool | null`
- `SelectTool` — pointer events → entityAtPoint → SelectionManager.select; shift+click → toggle; empty → clear
- `PanTool` — pointer events → updates Viewport center (pan); delegates to MapLibre drag where possible
- Keyboard: `V` → SelectTool, `Escape` → SelectTool (from any tool)

**Acceptance:** Exactly one tool active at all times; Escape returns to SelectTool; SelectTool dispatches selection; PanTool pans viewport.

---

### T8 — Viewport

**Files:** `packages/editor/src/viewport.ts`

**What:**
- `ViewportState`: `zoom, center: LatLng, bearing, pitch, activeBuildingId: string | null, activeFloorId: string | null, activeLayer: string | null`
- Methods: `setZoom()`, `panTo()`, `setBearing()`, `setActiveBuilding()`, `setActiveFloor()`, `setActiveLayer()`
- Emits `viewport.changed` on any change
- CameraState is the subset `{ zoom, center, bearing, pitch }` — passed to MapLibre and CoordinateTransformer

**Acceptance:** Viewport state tracks camera + UI; changes fire events; canvas reacts to camera changes.

---

### T9 — Validation (Plugin-Based)

**Files:** `packages/editor/src/validation/registry.ts`, `packages/editor/src/validation/validators/polygon-closure.ts`, `packages/editor/src/validation/validators/self-intersection.ts`, `packages/editor/src/validation/validators/duplicate-ids.ts`, `packages/editor/src/validation/validators/index.ts`

**What:**
- `ValidationRegistry` — collection of `ValidatorPlugin` instances
- `ValidatorPlugin` interface: `id, label, validate(document: CampusDocument): ValidationIssue[]`
- `ValidationIssue`: `{ severity: 'error' | 'warning' | 'info', entityId?: string, message: string, location?: { ... } }`
- `validateAll()` runs all registered validators, returns aggregated issues
- Tier 1 validators as plugins:
  - `PolygonClosureValidator` — checks all polygons are closed
  - `SelfIntersectionValidator` — detects self-intersecting polygon edges
  - `DuplicateIdValidator` — detects duplicate entity IDs
- New validators register: `registry.register(new RoomValidator())`

**Acceptance:** Valid document = no issues; invalid document produces issues; plugins can be added/removed; issues are entity-referenced.

---

### T10 — Canvas (React)

**Files:** `packages/editor/src/ui/canvas.tsx`

**What:**
- MapLibre GL JS instance with OSM base style
- Camera syncs with ViewportState
- Pointer events forwarded to active Tool via ToolRegistry
- ResizeObserver for responsive rendering
- Uses `useEditor()` to access viewport, toolRegistry, selection

**Acceptance:** Map renders tiles; pan/zoom works; pointer events reach active tool; camera follows ViewportState.

---

### T11 — Editor Shell (React)

**Files:** `packages/editor/src/ui/shell.tsx`, `packages/editor/src/ui/menu-bar.tsx`, `packages/editor/src/ui/status-bar.tsx`

**What:**
- `EditorShell` — layout: menu bar, left sidebar, canvas, right sidebar, status bar
- `MenuBar` — File (New), Edit (Undo, Redo, keyboard shortcuts Ctrl+Z/Ctrl+Shift+Z), View (tool toggles)
- `StatusBar` — active tool name, entity count, viewport center/zoom

**Acceptance:** Shell renders all zones; menu shortcuts work; status bar reflects context state.

---

### T12 — Panels (React)

**Files:** `packages/editor/src/ui/panels/layers.tsx`, `packages/editor/src/ui/panels/problems.tsx`

**What:**
- `LayersPanel` — entity tree grouped by building, visibility toggles per layer
- `ProblemsPanel` — validation issues list from ValidationRegistry, grouped by severity

**Properties Panel deliberately deferred to M3** (entities too bare).

**Acceptance:** Panels render; layers reflect document state; problems list updates on validation run.

---

### T13 — Tests

**At least 50 tests across:**
- EditorContext: service resolution, init/destroy (3)
- EventBus: emit, on, off, multiple listeners, transaction batching (7)
- Commands: building.create/rename/delete execute + undo each (9)
- History: push, undo, redo, memory limit, snapshot fallback, clear on new command (8)
- Selection: select, toggle, clear, hover, tool-change clear, events (7)
- Tool registry: register, activate, deactivate, escape → select (5)
- Viewport: zoom, pan, building/floor/layer state, events (5)
- Validation: closure, self-intersection, dup IDs, valid document, plugin registration (6)

**Total: ~50 tests**

---

## Dependency Graph

```
T1  ──→ T2 ──→ T3 ──→ T4 ──→ T5
                   ↘        ↘
                    T6 ──→ T7 ──→ T8 ──→ T9 ──→ T10 ──→ T11 ──→ T12
                     ↑       ↑                           ↑
                     └───────┘                           T9
                                                         
                                        All ──→ T13
```

T3 (EventBus) must come before T4 (Commands emit events). T5 (History) depends on T4 (Dispatcher). T6–T8 depend on T4 but not T5. T9 depends on nothing except T1. T10–T12 depend on most earlier tasks. T13 is last.

## Error Prevention

- Read ERRORS.md before each task
- Prevent: EventBus memory leaks — every `on()` returns an unsubscribe function; panels call it in useEffect cleanup
- Prevent: History stack mutation outside dispatcher — History has no public `push()`; only Dispatcher appends to it
- Prevent: Selection holding stale entity references — SelectionManager listens to `entity.deleted` and auto-removes
- Prevent: Nested EventBus transactions — use a counter (not boolean) so begin/end pairs nest correctly
- Prevent: MapLibre instance leak — canvas component destroys gl instance on unmount
- Prevent: Circular service initialization in EditorContext — build services first, then wire references
