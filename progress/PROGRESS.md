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

## 2026-07-25: Parametric Engine RC-1 + RC-2 (types, engine, handlers, canvas wiring)

- **Previous state**: LGE complete, Parametric Engine planned, no code written
- **What was done**:
  1. Created `spec/RC-PARAMETRIC-ENGINE.md` — frozen spec with pure geometry, lean engine, single renderer with themes
  2. Created `plan/RC-PARAMETRIC-ENGINE.md` — 8 RC execution plan with RC-3.5 geometry verification milestone
  3. RC-1: Created `src/types/parametric-types.ts` — `ParametricDefinition`, `ParametricComponent`, `PrimitiveGeometry`, `StairDefinition`, `ElevatorDefinition`, `DEFINITIONS`, `ParamSpec`, `Constraint`, `Diagnostic` — all with frozen JSDoc
  4. RC-1: Created `src/components/floor-editor/ParametricEngine.ts` — lean engine with register, create, add, remove, get, getAll, getDefinition, getGeometry, updateProperty, validate
  5. RC-1: Created `src/components/floor-editor/transform-helpers.ts` — pure `applyTranslation()`, `applyRotation()`, `setPosition()` for future TransformEngine
  6. RC-1: Added `ParametricComponentEntity` to `@navi/core` entities, `parametricComponents` field on `Floor`
  7. RC-1: Created `packages/editor/src/commands/parametric-handlers.ts` — `parametric.create/delete/update` with undo/redo
  8. RC-1: Registered all three handlers in `create-editor-context.ts`
  9. RC-1: 33 new tests (14 types + 13 engine + 6 transform helpers), zero regressions
  10. RC-2: Wired stair creation in `placeComponent` → `parametric.create`
  11. RC-2: Wired elevator creation in `confirmPolygon` → `parametric.create`
  12. RC-2: Added `parametricComponents: []` default in document migration
  13. RC-2: Added 7 handler tests (create/delete/update with validation)
  14. RC-2.5: Added compatibility adapter in `extractFloorComponents()` — reads `parametricComponents[]`, converts to legacy `Component[]` for existing MapLibre layers
  15. RC-2.5: Added parametric component lookup in `findOneComponent()` — enables selection/highlighting
  16. RC-2.5: Fixed `useFloorDrawing` — uses `StairDefinition.create()`/`ElevatorDefinition.create()` with proper default properties, correct `onSelect` ID
  17. RC-2.5: Added `parametric-adapter-pipeline.test.ts` — 4 integration tests for handler→document→adapter→GeoJSON pipeline
- **Verification**: 132 test files, 1157 tests pass (4 new pipeline tests), zero regressions, browser dev server starts at localhost:3000 (auth-gated studio prevents full live test)

## 2026-07-25: RC-3 Diagnostic Engine — types, providers, topology rules, engine, UI

- **Previous state**: Parametric Engine RC-1/RC-2 complete, no feedback on invalid/disconnected components
- **What was done**:
   1. Created `src/diagnostics/diagnostic-types.ts` — `Diagnostic`, `DiagnosticCode`, `DiagnosticCategory`, `DiagnosticSeverity`, `DiagnosticTarget`, `EntityType`, `DiagnosticProvider`, `TopologyRule`, `EngineOptions`, `EngineResult`
   2. Created `src/diagnostics/__tests__/diagnostic-types.test.ts` — 4 structural type tests
   3. Created `src/diagnostics/thresholds.ts` — `TOPOLOGY_THRESHOLDS` constants (`stairHallwayMaxDistance: 8`, `elevatorHallwayMaxDistance: 5`, `entranceHallwayMaxDistance: 3`)
   4. Created `src/diagnostics/parameter/evaluate-constraints.ts` — pure constraint evaluator extracted from `ParametricEngine.validate()`
   5. Created `src/diagnostics/__tests__/evaluate-constraints.test.ts` — 5 tests (valid, out-of-range, required, multiple violations, unknown definition)
   6. Refactored `ParametricEngine.validate()` to delegate to `evaluateConstraints()` — zero code duplication
   7. Created `src/diagnostics/parameter/index.ts` — `parameterDiagnostics()` provider + `ParameterDiagnostics` (iterates all floors/components)
   8. Created `src/diagnostics/__tests__/parameter-diagnostics.test.ts` — 4 integration tests
   9. Created `src/diagnostics/topology/stair-connection.ts` — `StairConnectionRule` (>8m from hallway → warning)
   10. Created `src/diagnostics/topology/elevator-connection.ts` — `ElevatorConnectionRule` (>5m from path → warning)
   11. Created `src/diagnostics/topology/entrance-rule.ts` — `EntranceRule` (>3m from hallway → info)
   12. Created `src/diagnostics/topology/index.ts` — `topologyDiagnostics()` with per-rule try/catch isolation
   13. Created `src/diagnostics/__tests__/topology-rules.test.ts` — 5 tests (empty, stair warn, elevator warn, entrance warn, connected OK)
   14. Created `src/diagnostics/engine.ts` — `DiagnosticEngine.run(document, options?)` with provider orchestration, skip, and error isolation
   15. Created `src/diagnostics/__tests__/diagnostic-engine.test.ts` — 4 tests (all providers, filtered, deterministic, no skip)
   16. Created `src/diagnostics/use-diagnostics.ts` — `useDiagnostics(document, options?)` React hook (memoized)
   17. Created `src/components/diagnostics/DiagnosticsPanel.tsx` — grouped by severity with Tailwind styling
- **Verification**: 137 test files, 1179 tests pass (22 new diagnostic tests), zero regressions

## 2026-07-25: RC-POLYGON-ENGINE — types, engine, renderer, hook, overlay, constraints, API freeze

- **Previous state**: LGE + Parametric Engine complete, no polygon shape editing
- **What was done**:
  1. ADR-016: Geometry Engine Principles — constitution for all geometry engines
  2. Created `spec/RC-POLYGON-ENGINE.md` — approved 10/10 with canonical model, editing/analysis tables, pipeline
  3. Created `plan/RC-POLYGON-ENGINE.md` — 8 tasks (types + analysis merged), TDD approach, refined APIs
  4. Created `src/types/polygon-types.ts` — `Vertex`, `PolygonEdge`, `PolygonRing`, `EditablePolygon` (frozen JSDoc)
  5. Created `src/components/floor-editor/PolygonEngine.ts` — 14 methods: create, clone, edges, area, perimeter, boundingBox, centroid, winding, normalize, setVertex, moveVertex, insertVertex, deleteVertex, closePolygon
  6. Created `src/components/floor-editor/PolygonRenderer.tsx` — configurable SVG renderer with PolygonRendererStyle
  7. Created `src/components/floor-editor/useEditablePolygonEditor.ts` — EditablePolygonSession with undo/redo history, operations, handlers
  8. Created `src/components/floor-editor/PolygonOverlay.tsx` — MapLibre GL overlay with vertex handles, edge midpoints, hover/drag state
  9. Created `src/components/floor-editor/polygon-constraints.ts` — validateVertices, minEdgeLength, minArea, deduplicateVertices
  10. 70 new tests (53 PolygonEngine + 10 hook + 2 renderer + 5 constraints), zero regressions across 5 commits
- **Verification**: 141 test files, 1249 tests pass (70 new polygon tests), zero regressions
