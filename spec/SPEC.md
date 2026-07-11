# M2.8 — FloorEditorCanvas Bugfixes

## What
Fix confirmed bugs in FloorEditorCanvas and useFloorDrawing identified in the component review (.planning/phases/floor-editor-review.md). Target: 6 CRITICAL/HIGH findings + 2 MEDIUM follow-ups.

## Success Criteria
1. Floor plan image loads when MapLibre map initializes (finding #1)
2. Building footprint with 0 elements produces empty GeoJSON, not NaN coordinates (finding #5)
3. Empty floor plan URL doesn't trigger spurious network requests (finding #6)
4. `graph.traces` removed from unused dependency array (finding #4)
5. Keyboard shortcuts work without manual canvas click (finding #8)
6. Empty catch blocks log warnings instead of swallowing silently (finding #9)
7. `toggleLayer` wrapped in useCallback for consistency (finding #15)
8. All 864 tests still pass, no TypeScript regressions

## Known Pitfalls (from ERRORS.md)
- Effect dependency correctness: adding `mapInstance` to a dependency array must not create stale closure issues
- `console.warn` in catch blocks must not leak PII or be overly noisy during normal operation
- Canvas focus must not interfere with MapLibre's own focus handling or drawing interaction
