# M2.7 Plan — FloorEditor UI State Migration

## Scope

Register `ToolRegistry` and `Viewport` in the existing EditorBridge, wrap FloorEditor in EditorProvider, migrate its UI state (tool, selection, floor) behind adapters. No `buildEditorContext()` extraction — that belongs in Phase 3 when we consolidate editor bootstrapping across all surfaces.

---

## Important — Key files to be aware of

- `packages/editor/src/tools/registry.ts` — ToolRegistry class
- `packages/editor/src/selection.ts` — SelectionManager class
- `packages/editor/src/viewport.ts` — Viewport class
- `packages/editor/src/context/editor-context.tsx` — EditorProvider, useEditor
- `packages/editor/src/context/service-registry.ts` — ServiceRegistry, ServiceMap
- `packages/editor/src/editing-context.ts` — EditingContextService
- `src/components/studio/EditorBridge.tsx` — existing bridge, where ToolRegistry + Viewport are registered

---

## T1 — Register ToolRegistry + Viewport in EditorBridge

**Description:** Register `ToolRegistry` and `Viewport` inside the existing `EditorBridge.buildContext()`. No extraction — just add `registry.register('toolRegistry', new ToolRegistry())` and `registry.register('viewport', new Viewport(eventBus))` alongside the existing registrations.

**Files to touch:**
- `src/components/studio/EditorBridge.tsx` — add ToolRegistry + Viewport imports and registration calls

**Acceptance check:** `services.get('toolRegistry')` returns a ToolRegistry with `activeToolId: null` and zero registered tools. `services.get('viewport')` returns a Viewport with `activeFloorId: null`. StudioWorkspace renders identically to before (Studio configures its own tools — that's unchanged).

**Error prevention:**
- Viewport constructor can accept an optional `eventBus` or be set during `init()`. EventBus is already registered before any other service. Use `registry.get('editor')` style or pass eventBus directly.
- ToolRegistry has no dependencies — simple `new ToolRegistry()`.

---

## T2 — Wrap FloorEditor in EditorProvider

**Description:** The floor route page creates an editor context using the same `buildContext()` pattern as EditorBridge (duplicated for now — Phase 3 consolidates). Registers floor tools via a dedicated helper. Wraps `<FloorEditor>` in `EditorProvider`.

**Details:**
- Create `src/components/floor-editor/configure-floor-editor-tools.ts`:
  ```ts
  export function configureFloorEditorTools(toolRegistry: ToolRegistry): void {
    const tools = ['select', 'room', 'entrance', 'stairs', 'elevator', 'hallway']
    for (const id of tools) {
      if (!toolRegistry.get(id)) {
        toolRegistry.register({ id, onActivate() {}, onDeactivate() {} })
      }
    }
  }
  ```
  **Must be idempotent** — calling it multiple times must not register duplicate tools (guards against hot reloads and test re-mounts).
- Route page creates an editor context using the same construction sequence as `EditorBridge` (duplicate for now)
  - **Note:** Temporary duplication. No new behavior may be added independently to either copy. Do not modify one bootstrap path without making the equivalent change in the other until Phase 3 removes the duplication. This duplication will be removed during **P3.1 Editor Bootstrap Consolidation**.
- Calls `configureFloorEditorTools(toolRegistry)` after building context
- Wraps `<FloorEditor>` in `<EditorProvider context={ctx}>`

**Files to touch:**
- `src/components/floor-editor/configure-floor-editor-tools.ts` (new)
- `src/app/(admin)/studio/[id]/edit/building/[buildingId]/floor/[floor]/page.tsx`

**Acceptance check:** FloorEditor renders inside EditorProvider. `useEditor()` works. ToolRegistry has 6 floor tools. EditorBridge unchanged.

---

## T3 — Introduce `FloorAdapter` (Viewport encapsulation)

**Description:** Create a floor adapter hook that encapsulates `Viewport.activeFloorId` — the UI works with floor indices, never string IDs. The adapter lives in the application layer.

**Details:**
- Create `src/components/floor-editor/adapters/floor-adapter.ts`:
  ```ts
  export function useFloorAdapter(
    viewport: Viewport,
    building: { floors: { id: string }[] },
    floorIndex: number
  ) {
    // Internal: none of these escape the module
    function indexToId(idx: number) { return building.floors[idx]?.id ?? null }
    function idToIndex(id: string | null) {
      if (!id) return 0
      return building.floors.findIndex(f => f.id === id)
    }

    useEffect(() => {
      viewport.setActiveFloor(indexToId(floorIndex))
    }, [viewport, building, floorIndex])

    const activeFloorIndex = idToIndex(viewport.activeFloorId)

    return {
      activeFloorIndex,
      selectFloor: (idx: number) => viewport.setActiveFloor(indexToId(idx)),
    }
  }
  ```
- Conversion helpers are **private** — not exported. If another consumer needs them, the adapter grows, not the export list.
- FloorEditor calls `const { activeFloorIndex } = useFloorAdapter(viewport, building, floor)`
- `FloorEditorCanvas` and `useFloorDrawing` receive `floor: activeFloorIndex` (number) — unchanged
- `FloorOutliner` receives `activeFloorId: building.floors[activeFloorIndex].id` (string)

**Files to touch:**
- `src/components/floor-editor/adapters/floor-adapter.ts` (new)
- `src/components/floor-editor/FloorEditor.tsx`

**Acceptance check:** Viewport never exposes `activeFloorIndex`. Conversion helpers are not exported. FloorEditor must never manipulate `Viewport.activeFloorId` directly.

---

## T4 — Introduce `ToolAdapter`

**Description:** Create a tool adapter that encapsulates `ToolRegistry` — exposing `StudioTool`-typed APIs while hiding the registry's generic string IDs. No `as StudioTool` casts.

**Details:**
- Create `src/components/floor-editor/adapters/tool-adapter.ts` with a `useToolAdapter(toolRegistry)` hook returning `{ activeTool: StudioTool, activateTool: (t: StudioTool) => void, isActive: (t: StudioTool) => boolean }`. Conversion helpers `toStudioTool` / `toRegistryTool` are private to the module.
- FloorEditor removes `useState<StudioTool>('select')`
- Reads `toolRegistry.activeToolId` mapped through `toStudioTool()`
- Calls `toolRegistry.activate(toRegistryTool(tool))` on button click
- Tool change clears selection via `selectionManager.select(null)`
- FloorEditorCanvas receives `tool` prop via adapter output

**Files to touch:**
- `src/components/floor-editor/adapters/tool-adapter.ts` (new)
- `src/components/floor-editor/FloorEditor.tsx`

**Error prevention:** No `as StudioTool` cast. Adapter is the sole conversion path.

**Acceptance check:** No `useState<StudioTool>`. No `as StudioTool` cast. All six tool buttons highlight and activate correctly.

---

## T5 — Replace selection with SelectionManager

**Description:** Remove `useState<string | null>(null)`. Use `selectionManager.selectedId` and `selectionManager.select(id)` directly.

**Files to touch:**
- `src/components/floor-editor/FloorEditor.tsx`

**Acceptance check:** No `useState<string | null>` for selection. Selection highlights in FloorOutliner and FloorEditorCanvas work. ComponentProperties shows for selected component.

---

## T6 — Cleanup dead UI state

**Description:** Remove the three `useState` lines (tool, selectedId, handleToolChange/handleSelect wrappers). Only `useState<LayerVisibility>` remains (intentionally local — no LayersService yet).

**Files to touch:**
- `src/components/floor-editor/FloorEditor.tsx`

**Acceptance check:** Only one `useState` in FloorEditor (layers). `grep "useState<StudioTool>"` → 0. `grep "useState<string"` → 0. No direct reads or writes of `Viewport.activeFloorId` outside `FloorAdapter`.

---

## T7 — Verification

### Acceptance Checks

1. TypeScript compiles with no new errors.
2. Existing tests pass.
3. Ownership verification:
   - `useState<StudioTool>` → **0 matches** in `FloorEditor.tsx`
   - `useState<string | null>` → **0 matches** in `FloorEditor.tsx`
   - No direct reads or writes of `Viewport.activeFloorId` outside `FloorAdapter`
4. `Viewport` exposes only `activeFloorId: string | null` (never `activeFloorIndex`).
5. `configureFloorEditorTools()` is the only place that registers FloorEditor tools.
6. `FloorEditor` imports no legacy UI stores (`useStudioStore` or `useUiStore`).
7. No component outside adapters imports `ToolRegistry` or `Viewport` for direct UI manipulation.

## Architectural Invariant (Post-M2.7)

### Ownership
- `ToolRegistry` owns the active tool.
- `SelectionManager` owns the current selection.
- `Viewport` owns the active floor identity (`string` ID).
- `FloorEditor` owns only floor-editor-specific UI state (layers and drawing session).

### Translation
- `FloorAdapter` is the **only** component allowed to translate between `Viewport.activeFloorId` and floor indices.
- `ToolAdapter` is the **only** component allowed to translate between `ToolRegistry` IDs and `StudioTool`.

Future work must preserve these ownership boundaries. Any new editor surface should consume editor services through adapters rather than introducing duplicate UI state or bypassing the established ownership model.

## Prevention

Check `ERRORS.md` before merging:

- React #185 — Ensure no new derived array state is created from the graph.
- `Map#getSource` on removed maps — `useFloorDrawing` remains unchanged; preserve its cleanup guards.
- SelectionManager revision — Continue using `revision`; do not reintroduce the old `version` pattern.

---

## Task Dependency Graph

```
T1 (register ToolRegistry + Viewport in EditorBridge)
│
▼
T2 (wrap FloorEditor in EditorProvider + configureFloorEditorTools)
│
┌──────────┬─────────────┬──────────────┐
▼          ▼             ▼              ▼
T3        T4            T5
Floor     Tool          Selection
Adapter   Adapter       Manager
(Viewport (ToolRegistry (useState →
 capsule)  → StudioTool) SelectionManager)
│          │             │
└──────────┴──────┬──────┘
                  ▼
          T6 (cleanup dead state)
                  │
                  ▼
          T7 (verify)
```
