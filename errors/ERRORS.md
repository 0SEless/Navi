# Error Log

## 2026-07-03: React #185 Maximum Update Depth Exceeded
- **Error**: Minified React error #185 — "Maximum update depth exceeded" (50 nested updates guard). Crashes floor editor page in production.
- **Cause**: `Graph` class getters (`.nodes`, `.edges`, `.buildings`, `.components`, `.traces`) returned `Array.from(this._x.values())` — a **new array reference on every call**. Zustand's `useSyncExternalStore` detected the new reference as a store change during the commit-phase consistency check, called `forceStoreRerender`, creating an infinite re-render loop.
- **Fix**: Added private cache fields (`_cachedNodes`, `_cachedEdges`, etc.) initialized to `null`. Getters populate the cache once and return a stable reference. Every mutation method invalidates the relevant cache(s). See `src/engine/graph.ts`.
- **Prevention**: Any getter returning a derived array/object from a Map must cache the result between mutations. When using Zustand selectors that return arrays or objects, ensure the reference is stable (use caching or `useShallow`).
- **Detection**: React 19 in dev mode warns: *"The result of getSnapshot should be cached to avoid an infinite loop"* — treat this as a hard error, not a warning.
- **Related files**: `src/engine/graph.ts`, `src/store/graph-store.ts`
- 
## 2026-07-03: Map#getSource Called on Removed Map
- **Error**: `Cannot read properties of undefined (reading 'getSource')` — thrown inside MapLibre's `Map.getSource()` because `this.style` is null after `map.remove()`.
- **Cause**: React effect cleanup order. When `building` prop changes in `FloorEditorCanvas`, the `[building]` effect cleanup runs first (reverse registration order), calling `map.remove()`. Then `useFloorDrawing`'s `[map]` effect cleanup runs, calling `clearPreview(map)` on the already-removed map. MapLibre nullifies `this.style` in `remove()`, so `getSource` throws.
- **Fix**: Wrapped `clearPreview` body in try-catch in `src/components/floor-editor/useFloorDrawing.ts:36-40`
- **Prevention**: Any function called during effect cleanup that accesses a map must handle the case where the map was already removed by an earlier cleanup. Use try-catch or check `map.getContainer()` (returns null after remove).
- **Related tasks**: —
- **Related files**: `src/components/floor-editor/useFloorDrawing.ts`

## 2026-07-04: Studio Canvas — No Confirm Bar for Trace/Route/Building/Boundary
- **Error**: Trace and route tools were visually identical. Building, trace, route, and boundary tools had no in-canvas confirm/cancel bar during drawing — relied on non-obvious double-click to trigger a hidden overlay. No undo or cancel during drawing.
- **Cause**: BuildingTracer and CampusBoundary hooks stored drawing state in private useRefs (not accessible from StudioCanvas render tree). ConfirmOverlay only appeared after double-click completed the drawing.
- **Fix**:
  1. Added `drawPoints: LatLng[]` to studio-store with `setDrawPoints` / `clearDrawPoints` actions
  2. Wired BuildingTracer and CampusBoundary to push points to the store on each click, and clear on dblclick/cleanup
  3. Added in-canvas confirm bar in StudioCanvas (same pattern as FloorEditorCanvas) for all 4 tools
  4. Confirm bar shows color-coded tool label ("Interior path" vs "Arterial route"), point count, remove-last, confirm, cancel
  5. Escape key now clears drawPoints for building/boundary too
- **Prevention**: Any drawing tool that stores state in a hook's useRef must also push visual state (point count, etc.) to a store or render tree so UI overlays can read it.
- **Related tasks**: —
- **Related files**: `src/store/studio-store.ts`, `src/components/studio/BuildingTracer.tsx`, `src/components/studio/CampusBoundary.tsx`, `src/components/studio/StudioCanvas.tsx`
