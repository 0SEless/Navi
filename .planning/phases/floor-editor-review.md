# Floor Editor Component Review

**Files Reviewed:** 8
**Depth:** Deep (cross-file analysis)

---

## 1. [CRITICAL] Floor plan image never loads

**Files:** `FloorEditorCanvas.tsx:141-164`
**Line:** 141-164

The floor plan overlay effect checks `readyRef.current` (initialized to `false`) and bails out early. The effect's dependency array is `[building.floorPlanUrls, floor, building.footprint]`. These dependencies never change between:

1. Initial mount (where the effect bails out because `readyRef.current` is `false`)
2. After the MapLibre `load` event fires (where `setMapInstance(map)` triggers a re-render but the dependencies remain the same reference)

The effect never re-runs after `readyRef.current` becomes `true`, so `src.updateImage()` is never called. **The floor plan image NEVER displays.**

**Fix:** Add `mapInstance` to the dependency array so the effect re-runs after the map initializes:

```typescript
useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    // ... existing floor plan logic
}, [building.floorPlanUrls, floor, building.footprint, mapInstance])
```

---

## 2. [CRITICAL] Double-click to confirm hallway/room placement is broken

**File:** `useFloorDrawing.ts:219-232`
**Line:** 222-228

The double-click handler checks `drawState.drawMode` captured from its closure. When the user:
1. Clicks on the map → `handleMapClick` dispatches `ADD_POINT` (or `ADD_POLYGON_POINT`) via `useReducer`. This queues a state update but does NOT synchronously re-render.
2. The browser fires `dblclick` event **before React re-renders** (same event loop tick).
3. The dblclick handler still has the stale closure with `drawState.drawMode === 'idle'`.
4. The condition `drawState.drawMode === 'placing-points'` evaluates to `false`, so **`confirmHallway()` / `confirmRoom()` is NEVER called.**

**This makes hallway and room placement completely non-functional** — users can add points but can never confirm the drawing to create a component. Neither `confirmHallway` nor `confirmRoom` are exposed as UI buttons or keyboard shortcuts (they're returned from the hook but never destructured by the caller).

**Fix:** Use a ref to track the current drawing mode synchronously, or read the mode from the reducer state synchronously at event time:

```typescript
// Option A: Use a ref that stays current
const drawModeRef = useRef(drawState.drawMode)
useEffect(() => { drawModeRef.current = drawState.drawMode }, [drawState.drawMode])

// In the dblclick handler:
const handleDblClick = (e: maplibregl.MapMouseEvent) => {
    const mode = drawModeRef.current  // Always current
    if (mode === 'placing-points') {
        e.originalEvent.preventDefault()
        confirmHallway()
    } else if (mode === 'placing-polygon') {
        e.originalEvent.preventDefault()
        confirmRoom()
    }
}
```

---

## 3. [CRITICAL] Effects depend on `graph.components` which returns a new array reference on every access

**File:** `FloorEditorCanvas.tsx:167-200, 203-235, 270-289, 292-415`
**Lines:** 200, 235, 289, 415

The `Graph.components` getter returns `Array.from(this._components.values())` — a **new array reference on every access** (confirmed at `graph.ts:32-34`). When used in useEffect dependency arrays, the reference inequality (`Object.is(oldArr, newArr) === false`) causes the effect to re-run on **every render**, not just when components actually change.

This causes effects that register MapLibre event listeners (drag interaction at line 292-415) to **remove and re-register map event handlers on every store mutation**. This creates a window where:
- Between cleanup and re-registration, events are not handled
- Event listener registration order could change

Same issue applies to `graph.traces` (getter at `graph.ts:36-37`, unused in dependency at line 200) and `graph.buildings` (used in parent `FloorEditor.tsx:48`).

**Fix:** Memoize the derived arrays, or use a stable key (like an incrementing version counter) in dependencies instead of the volatile array reference.

---

## 4. [HIGH] `graph.traces` included in dependency array but never used in effect body

**File:** `FloorEditorCanvas.tsx:200`
**Line:** 200

The effect at lines 167-200 has dependency `graph.traces` but the effect body only uses `graph.components`. The `traces` data is completely unused in this effect but causes unnecessary re-execution every time traces change (plus the new-array-reference issue from finding #3).

**Fix:** Remove `graph.traces` from the dependency array.

---

## 5. [HIGH] Building footprint with 0 elements produces NaN GeoJSON coordinates

**File:** `FloorEditorCanvas.tsx:36-46`
**Line:** 36-46

When `building.footprint` has 0 elements:
- Falls into the `else` branch (since `0 >= 3` is false)
- `reduce()` with initial value `{ lat: 0, lng: 0 }` returns `{ lat: 0, lng: 0 }`
- Division `0 / 0` produces `NaN`
- Fallback coordinates become `[NaN - 0.0003, NaN - 0.0003]` etc.

MapLibre may silently fail or throw when `setData()` is called with NaN coordinates.

**Fix:** Add early return or guard for empty footprint:

```typescript
if (building.footprint.length === 0) {
    return { type: 'FeatureCollection', features: [] }
}
```

---

## 6. [HIGH] Floor plan effect makes MapLibre request with empty URL string

**File:** `FloorEditorCanvas.tsx:162`
**Line:** 162

```typescript
src.updateImage({ url: '', coordinates: [[0, 0], [0, 0], [0, 0], [0, 0]] })
```

Passing an empty string as URL to MapLibre's `ImageSource.updateImage()` causes MapLibre to attempt a fetch to `""` (the current page URL), generating a spurious network request and console error.

**Fix:** Check for empty URL and skip the `updateImage` call, or remove the source entirely:

```typescript
if (imgUrl) {
    src.updateImage({ /* ... */ })
}
// Don't call updateImage with empty url at all
```

---

## 7. [MEDIUM] `as unknown as maplibregl.EventHandler` cast defeats all type safety

**File:** `FloorEditorCanvas.tsx:404`
**Line:** 404

```typescript
map.on('mousedown', 'floor-vertex-handles-layer', onMouseDown as unknown as maplibregl.EventHandler)
```

MapLibre's `map.on(event, layerId, handler)` overload should properly type the handler parameter to include `features`. The `as unknown as maplibregl.EventHandler` double cast bypasses TypeScript's overload resolution. If the runtime event shape doesn't match `onMouseDown`'s expected `MapMouseEvent & { features?: MapGeoJSONFeature[] }` type, it will silently fail or throw.

If the `features` property is not populated by MapLibre for this event type, `e.features` would be `undefined` (handled by the guard at line 299), but the cast means the compiler won't flag this mismatch.

---

## 8. [MEDIUM] Keyboard shortcuts don't work until canvas is manually focused

**File:** `FloorEditorCanvas.tsx:436-437`
**Line:** 436-437

```typescript
canvas.addEventListener('keydown', handleKey)
canvas.setAttribute('tabindex', '0')
```

The canvas is made focusable but never programmatically focused. The keyboard shortcuts (Delete, Backspace, Escape) only work after the user manually clicks on the canvas (giving it focus). There's no `canvas.focus()` or `autoFocus` behavior on mount.

Additionally, if the user clicks on the sidebar, outliner, or properties panel (all rendered as sibling divs, not inside the canvas), the canvas loses focus and keyboard shortcuts stop working.

---

## 9. [MEDIUM] Empty catch blocks silently swallow errors

**File:** `FloorEditorCanvas.tsx:199, 257`
**Lines:** 199, 257

```typescript
catch { /* source not ready */ }
catch { /* layer not found */ }
```

These empty catch blocks suppress all errors, including genuine programming errors (typos in source IDs, incorrect state, etc.). During development, this makes debugging map-related issues extremely difficult — any error in `setData()` or `setLayoutProperty()` is silently swallowed.

---

## 10. [MEDIUM] Drag interaction effects re-register listeners on every store mutation

**File:** `FloorEditorCanvas.tsx:292-415`
**Line:** 415

The dependency array `[selectedId, graph.components, tool, updateComponent, saveGraph]` causes the drag event handlers (`mousedown`, `mousemove`, `mouseup`, `mouseenter`, `mouseleave`) to be **removed and re-added** on every store mutation (because `graph.components` returns a new array reference — see finding #3).

This means during a drag operation, a concurrent store mutation (e.g., from another component editing the same graph) could tear down and re-establish the event handlers, potentially losing the drag state or dropping events.

---

## 11. [MEDIUM] `FloorEditor.tsx` uses `graph.buildings` in useMemo dependency with volatile array

**File:** `FloorEditor.tsx:48`
**Line:** 48

```typescript
const building = useMemo(() => graph.buildings.find((b) => b.id === buildingId), [graph.buildings, buildingId])
```

`graph.buildings` returns a new array reference on every render (getter at `graph.ts:28-30`). The `useMemo` recomputes on every render because the dependency is always a different array reference, defeating the purpose of memoization. While the returned `building` object reference stays the same (same object from `.find()`), the memoization is wasted computation.

---

## 12. [LOW] Test mock doesn't simulate 'load' event — no coverage of source/layer initialization

**File:** `__tests__/FloorEditorCanvas.test.tsx:77-86`
**Lines:** 77-86

The MapLibre mock's `MapCtor` returns a `MockEvented` instance but never fires the `'load'` event (via `map.fire('load')` or similar). This means the entire `addSourcesAndLayers()` function (which creates 10+ MapLibre sources and layers) is never tested. Tests only verify basic React rendering and button behavior, not the core map interaction logic.

The mock also doesn't properly implement `once()` which is called by... actually it's not called in this code path. But more importantly, the mock's `getSource()` returns `null` for all sources since `addSource()` is never called during the test, making any setData-dependent code path untested.

---

## 13. [LOW] `ComponentProperties` initial state has unstabilized default values

**File:** `ComponentProperties.tsx:23-26`
**Lines:** 23-26

```typescript
const [width, setWidth] = useState(component?.dimensions?.width ?? 4)
const [height, setHeight] = useState(component?.dimensions?.height ?? 5)
```

The magic numbers `4` and `5` for default dimensions have no documented rationale. If the component has no `dimensions` property, these defaults are silently applied. Additionally, `rangeFrom`/`rangeTo` fall back to `component?.floor ?? 0` and `(component?.floor ?? 0) + 1` — which also silently defaults to floor 0 if `component` is null.

(This is partially mitigated by the `key={selectedId}` remounting pattern in `FloorEditor.tsx:164` which resets the state on component change.)

---

## 14. [LOW] `useFloorDrawing.ts` directly accesses store state via `getState()` bypassing reactivity

**File:** `useFloorDrawing.ts:165`
**Line:** 165

```typescript
const graph = useGraphStore.getState().graph
```

In the `placeComponent` callback, the code bypasses the reactive store selector and reads state directly via `useGraphStore.getState()`. This is an inconsistent pattern compared to the rest of the codebase and creates a hidden dependency on the store's internal shape that TypeScript can't check via the component's type contracts.

---

## 15. [INFO] `toggleLayer` not wrapped in `useCallback`

**File:** `FloorEditor.tsx:59-61`
**Line:** 59

```typescript
const toggleLayer = (key: keyof LayerVisibility) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }))
}
```

This function is recreated on every render. While it only toggles state (no expensive computation), wrapping in `useCallback` would be consistent with the other memoized handlers in the same component.

---

## 16. [INFO] `handleDelete` in `FloorOutliner.tsx` mutates store then calls separate `save()`

**File:** `FloorOutliner.tsx:56-61`
**Lines:** 58-59

```typescript
removeComponent(id);
save();
```

The `removeComponent` store action does NOT call `save()` internally (unlike the delete button in `FloorEditorCanvas.tsx` which calls both). This is inconsistent — the outliner's delete always saves, while other delete paths manually call `save()`. If a component is deleted from the Properties panel, it also calls `save()` separately. This inconsistency could lead to unsaved deletions if new delete paths are added without remembering to call `save()`.

---

## Summary

| # | Severity | File | Line | Description |
|---|----------|------|------|-------------|
| 1 | CRITICAL | FloorEditorCanvas.tsx | 141-164 | Floor plan image never loads (readyRef check without retrigger) |
| 2 | CRITICAL | useFloorDrawing.ts | 222-228 | Double-click to confirm hallway/room placement broken (stale closure) |
| 3 | CRITICAL | FloorEditorCanvas.tsx | 200,235,289,415 | Effects re-run on every render due to `graph.components` returning new array |
| 4 | HIGH | FloorEditorCanvas.tsx | 200 | `graph.traces` in dependency array but unused in effect body |
| 5 | HIGH | FloorEditorCanvas.tsx | 36-46 | Empty footprint produces NaN coordinates in GeoJSON |
| 6 | HIGH | FloorEditorCanvas.tsx | 162 | Empty URL string sent to MapLibre `updateImage()` |
| 7 | MEDIUM | FloorEditorCanvas.tsx | 404 | Double `as unknown` cast defeats TypeScript safety |
| 8 | MEDIUM | FloorEditorCanvas.tsx | 436-437 | Keyboard shortcuts broken until canvas manually focused |
| 9 | MEDIUM | FloorEditorCanvas.tsx | 199,257 | Empty catch blocks silently swallow errors |
| 10 | MEDIUM | FloorEditorCanvas.tsx | 292-415 | Drag handlers torn down/re-registered on every store mutation |
| 11 | MEDIUM | FloorEditor.tsx | 48 | `graph.buildings` in useMemo defeats memoization (new array ref each render) |
| 12 | LOW | __tests__/FloorEditorCanvas.test.tsx | 77-86 | MapLibre mock never fires 'load' event — no source/layer test coverage |
| 13 | LOW | ComponentProperties.tsx | 23-26 | Unstabilized magic number defaults for component dimensions |
| 14 | LOW | useFloorDrawing.ts | 165 | Direct `getState()` bypasses reactive store selector pattern |
| 15 | INFO | FloorEditor.tsx | 59 | `toggleLayer` not wrapped in `useCallback` (inconsistent) |
| 16 | INFO | FloorOutliner.tsx | 56-61 | Inconsistent save pattern across delete paths |

**Most severe:** Finding #2 makes the entire hallway/room drawing workflow non-functional. Without a working double-click confirmation and no fallback confirmation UI, users can place points but never create components. Finding #1 makes floor plan display completely invisible. Finding #3 causes cascading performance and correctness issues across multiple effects.
