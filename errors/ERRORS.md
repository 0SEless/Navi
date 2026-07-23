# Error Ledger

## 2026-07-23: BuildingTracer / CampusBoundary drawing ref cleanup loop
- **Error**: Points were not being added in Building and Boundary modes. Clicking the map produced no ConfirmBar.
- **Cause**: `useBuildingTracer` / `useCampusBoundary` had `drawing` in the `useEffect` dependency array of the main click-handler effect. `drawing` from `useDrawingSession()` is a new object reference on every render (new arrays for `tracePoints`/`drawPoints`). Every time a point was added (via `setDrawPoints`), React re-rendered, the effect cleanup ran, clearing `pointsRef.current = []` and calling `drawing?.clearDrawPoints()`, obliterating all accumulated points.
- **Fix**: Added `drawingRef` (`useRef(drawing)`, sync on every render). Removed `drawing` from dependency arrays of the two main effects. Used `drawingRef.current` (and a local `const d = drawingRef.current` captured at effect start) inside effects. Also removed `drawing?.drawPoints` from sync effect deps (it was a no-op since `drawing` changes every render anyway).
- **Prevention**: Any hook that uses `drawing` from `useDrawingSession()` MUST either (a) store it in a ref and NOT include `drawing` in effect deps, or (b) only include specific stable sub-values (like callbacks from `useCallback` with empty deps). Never include the full `drawing` object in effect deps.
- **Related tasks**: T1 (original bug), T2 (polygon auto-close not testable without T1 fix)

## 2026-07-23: InteractionController stale closure on drawing methods
- **Error**: Enter key did not trigger confirm despite correct event handler code.
- **Cause**: `InteractionController.handleKeyDown` was registered inside `useEffect(() => { ... window.addEventListener('keydown', handleKeyDown) ... }, [map])`. The `drawing` variable in the closure was captured from the render when the effect ran. Since `drawing` changes on every render (new object) and the effect only depends on `[map]`, all `drawing.*` calls inside the handler used stale references.
- **Fix**: Added `drawingRef` (`useRef(drawing)`, synced every render). Replaced all `drawing.*` calls inside event handlers with `drawingRef.current.*`.
- **Prevention**: Event handlers registered inside effects with limited deps must use refs for any value that changes across renders. Pattern: `const ref = useRef(val); ref.current = val` then use `ref.current` inside handlers.
- **Related tasks**: T1, T3
