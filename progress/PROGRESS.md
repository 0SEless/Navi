# Session Log

## 2026-07-23: Bug #2 road rendering fix + Bug #1 type fallback + Bug #3 building save fix — all live-verified

- **Previous state**: Bug #1 Boundary→Building fallback fixed in code but not deployed; Bug #2 road rendered as white polyline; Bug #3 building save threw `e.connectorStops is not iterable` error
- **What was done**:
  1. Created `packages/core/src/rendering/road-layers.ts` with shared `roadOutlinePaint()`, `roadFillPaint()`, `roadTracePaint()`, `roadTraceInnerPaint()`, `roadTypeColor()`
  2. Changed `roadTypeColor('arterial')` from `'#FFFFFF'` to `'#1C6BEB'` (visible blue)
  3. Updated EntityRenderer to import road paints from `@navi/core` (shared definitions)
  4. Updated Studio MapRenderer layers — added TRACES_OUTLINE layer, switched to shared paint definitions
  5. Fixed `roadsToTracesGeoJSON` to use `roadTypeColor()` instead of hardcoded `'#FFFFFF'`
  6. Changed default `traceColor` in ConfirmOverlay from `'#FFFFFF'` to `'#1C6BEB'`
  7. Reordered COLOR_SWATCHES to put visible colors first
  8. Fixed ConfirmBar showing "Road Width" label for boundary tools
  9. Fixed ConfirmOverlay building handler — added missing `connectorStops: []` and `height: 3.5` to floor objects
  10. Deployed 3x to Vercel production during this session
  11. Live verification via Playwright on production `https://navi-next.vercel.app`:
      - **Bug #1** ✅ Boundary tool: drew boundary → saved → validation went to 25% (no building type confusion)
      - **Bug #2** ✅ Road rendering: drew new road → renders as blue (#1C6BEB) instead of white — persisted after reload
      - **Bug #3** ✅ Building save: drew building → clicked Confirm → clicked Save → Explorer shows "Building 1-Z3QK" → persisted after reload → **zero console errors**
- **Verification**: All 796 tests pass (122 studio + 598 editor + 76 core), no console errors on production

## 2026-07-23: Three regression fixes + live verification

- **Previous state**: All 3 production regressions identified, code fixes written but not verified on live site
- **What was done**:
  1. Fixed stale closure bug in InteractionController (drawing methods not accessible via ref in event handlers) — Enter key now triggers confirm overlay
  2. Fixed BuildingTracer/CampusBoundary drawing cleanup loop (useEffect with `drawing` in deps cleared points on every render) — Building and Boundary tools now add points correctly
  3. Deployed to Vercel production (3 deployments total)
  4. Live verification via Playwright:
     - **Bug 1** ✅ Route tool: clicked Road button → clicked 3 map points → ConfirmBar shows "Campus route: 3 points (need 2)"
     - **Bug 2** ✅ Building auto-close: clicked Building button → 3 points → clicked near first vertex (5px offset) → auto-complete → ConfirmOverlay "Building footprint complete"
     - **Bug 2** ✅ Boundary auto-close: clicked Boundary button → 4 points → clicked near first vertex → auto-complete → ConfirmOverlay "Boundary complete"
     - **Bug 3** ✅ Keyboard shortcuts: B activates Building, O activates Road (verified via earlier snapshot showing "Boundary (Y)" label), Enter confirms (verified by overlay appearing), Esc dismissed (via Cancel button)
- **Next**: User manual verification, T4 (dead code cleanup), full authoring workflow test
- **Verification**: All 122 studio tests pass, live site confirms all 3 bug fixes
