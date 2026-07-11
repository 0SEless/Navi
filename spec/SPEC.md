# M2.9 — Remaining FloorEditor Review Findings

## What
Fix the remaining actionable findings from `.planning/phases/floor-editor-review.md`. Target: 4 findings (#2, #7, #12, #13). #15 was already fixed in M2.8. #14 (getState bypass) and #16 (save pattern) are INFO/deferred.

## Success Criteria
1. Double-click during drawing skips the intermediate click event and confirms the drawing (finding #2)
2. `as unknown as maplibregl.EventHandler` cast replaced with proper typing (finding #7)
3. MapLibre mock fires 'load' event in tests, enabling source/layer initialization coverage (finding #12)
4. ComponentProperties uses named constants instead of magic numbers for defaults (finding #13)
5. All 864 tests still pass, build succeeds

## Known Pitfalls (from ERRORS.md)
- Effect dependency changes: adding a dblclick handler must not create stale closures
- Test mock changes must not break existing tests
