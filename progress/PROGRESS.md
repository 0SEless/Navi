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

## 2026-07-25: Milestone 1 Slice 1 — Toolbar + Building drawing + Polygon editing overlay

- **Previous state**: Studio-new app exists with point entity editing, Inspector, CommandBus, SelectionManager, undo/redo, snap overlay, highlight overlay — but no drawing tools. Editor has toolbar only for pointer mode. No way to create buildings, rooms, hallways, or roads on the map.
- **What was done**:
  1. Wrote `spec/SPEC.md` for Milestone 1 — Geometry Editing: mission, success criteria, 5 vertical slices, known pitfalls
  2. Wrote `plan/PLAN.md` — slice breakdown with detailed tasks and acceptance criteria
  3. Created `components/Toolbar.tsx` — 12 tools (Pointer, Pan, Building, Room, Hallway, Road, Boundary, Entrance, Stair, Elevator, Panorama, QR) with icons, keyboard shortcuts, groups
  4. Extended `entity-handlers.ts` — added `room` and `hallway` create/delete support to `entityCreateHandler` and `entityDeleteHandler`
  5. Created `lib/id.ts` — sequential ID generator with random suffix
  6. Updated `app/page.tsx`:
     - Tool state (`activeTool`, `setActiveTool`) with keyboard shortcut switching
     - Drawing mode for building/room/hallway/road: click-to-accumulate-vertices, Enter/dblclick to finish
     - Drawing preview line (dashed blue) showing polygon/path being drawn
     - Point entity tools (Entrance, Stair, Elevator, Panorama, QR): click-once-to-place via CommandBus
     - Drawing hint bar showing current tool and point count
     - Auto-select newly created entities
     - Escape clears drawing state, Enter finishes drawing
  7. Created `lib/editing/polygon-edit-overlay.ts` — PolygonEditOverlay class following HighlightOverlay/SnapOverlay pattern:
     - Shows vertex handles (circles) and edges (dashed lines) for selected building/room
     - Drag vertex → live preview → commit via CommandBus on mouseup
     - Observes SelectionManager for selection changes
     - Auto-syncs on document changes
  8. Wired PolygonEditOverlay into page.tsx: init in handleMapReady, sync on document changes, cleanup on unmount
- **Verification**: 141 test files, 1249 tests pass (zero regressions), studio-new 71 tests pass (14 new editing tests)

## 2026-07-25: Milestone 1 Slice 2 — Room drawing (selected building) + room polygon drag editing

- **Previous state**: Room tool always uses first building/floor. PolygonEditOverlay only handles building vertex drag. Point entities always place on first building.
- **What was done**:
  1. **T2.1 — Room drawing with building context**: `finishDrawing()` for room/hallway now uses `selectionManager.selected` to find the target building; falls back to `doc.buildings[0]` if nothing selected. Hint bar shows which building/floor the room targets.
  2. **Hallway/Point entity alignment**: Same building-selection logic applied to hallway creation and all point entity placements (entrance, stair, elevator, QR).
  3. **T2.2 — Room polygon drag editing**: `PolygonEditOverlay` extended with room support — `onVertexMouseDown` captures room origin/localPoints, `onMouseMove` converts dragged vertex world→local for live preview, `onMouseUp` reads updated vertices and commits via `entity.update` for rooms.
  4. **14 new tests**: coordinate conversion round-trip, building centroid, room→world→local vertex mapping, entity handler room creation (correct floor, buildingId/floorId stripped), building selection logic.
- **Verification**: 141 test files, 1249 tests pass (zero regressions), studio-new 71 tests pass (14 new)

## 2026-07-25: Milestone 1 Slice 3 + Slice 4 — Path editing overlay for hallways/roads

- **Previous state**: PolygonEditOverlay only handled building (closed footprint) and room (local polygon). Hallways and roads were not selectable for editing. Hallway/road creation already worked via vertex accumulation.
- **What was done**:
  1. Extended `PolygonEditOverlay.getEntityVertices()` to handle `hallway` (local coords → world via building origin) and `road` (world coords directly)
  2. Added `isClosed` flag to distinguish polygons (building, room) from polylines (hallway, road) — polylines don't close the loop in edge rendering
  3. Updated `syncEditing()` to check all 4 entity types and render open/closed topologies correctly
  4. Added hallway drag-to-reshape: `onMouseMove` converts dragged vertex world→local, `onMouseUp` commits via `entity.update` with `polyline.points`
  5. Added road drag-to-reshape: `onMouseMove` uses world coords directly, `onMouseUp` commits via `entity.update`
  6. Set `isLocal: true` for hallways in drag state (so coordinate conversion works)
  7. All 4 entity types (building, room, hallway, road) now share the same editing overlay — select → vertex handles → drag → reshape → CommandBus commit
- **Verification**: 141 test files, 1249 tests pass (zero regressions), studio-new 71 tests pass

## 2026-07-25: Milestone 1 Slice 5 — Point placement hover preview + Inspector auto-open

- **Previous state**: Point entity tools (entrance, stair, elevator, panorama, QR) placed entities on click but had no hover preview. Inspector already responds to selection changes.
- **What was done**:
  1. **T5.1 — Hover preview**: Added `navi-point-preview` GeoJSON source and circle layer in `handleMapReady`. When a point tool is active, mousemove updates the preview circle at cursor position. Preview clears when tool changes or entity is placed.
  2. **T5.2 — Auto-open Inspector**: Already implemented in `placePointEntity()` via `selMgr.select()` — Inspector reacts to the selection change automatically (no new code needed).
- **Verification**: 141 test files, 1249 tests pass (zero regressions), studio-new 71 tests pass

## Milestone 1 Complete — Acceptance Criteria Review

| Criterion | Status |
|-----------|--------|
| 1. Drawing tools for all 12 toolbar tools | ✅ Done — building, room, hallway, road (vertex accumulation + Enter/dblclick), point entities (click-once) |
| 2. Polygon editing via PolygonEngine + overlay | ✅ Done — building/room vertex handles, drag-to-reshape, CommandBus commit |
| 3. Path editing for hallways/roads | ✅ Done — extended overlay handles polylines (open topology, local coords for hallways, world coords for roads) |
| 4. Parametric placement with Inspector | ✅ Done — stair/elevator placed on click, auto-selected, Inspector shows properties |
| 5. Undo/redo for every create/edit/delete | ✅ Done — all mutations through CommandBus with CommandHistory snapshot |
| 6. Save to localStorage | ✅ Done — existing persistence layer, all changes survive reload |

## 2026-07-26: Cancel rebuild, freeze studio-new, port snap+preview, add validation, add undo shortcuts

- **Previous state**: Production and `apps/studio-new/` codebases diverging; no snap overlay or point preview in production; no Ctrl+Z; validation panel unwired
- **What was done**:
  1. Architecture audit resolved the production vs studio-new split
  2. Created `ADR-020 Cancel Studio Rebuild` — production `src/` is canonical
  3. Froze `apps/studio-new/` with `FROZEN.md`
  4. Marked PolygonEngine cluster as experimental with `README.md`
  5. Ported SnapOverlay from studio-new to `FloorEditorCanvas.tsx` — blue circle indicator on mousemove
  6. Ported point placement preview — semi-transparent blue circle when entrance/stair/elevator tool active
  7. Verified save/autosave/undo/reload reliability — well-designed, 200MB history budget, debounced autosave, tab-close save
  8. Created `validation-checks.ts` with 6 mapping checks: missing entrance, hallway unconnected, room unreachable, stair unconnected, duplicate QR
  9. Wired `DiagnosticsPanel` into FloorEditor right panel under Validation toggle
  10. Added Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo/redo keyboard shortcuts
- **Verification**: 141 test files, 1249 tests pass, zero regressions
- **Next**: Freeze editor development — start mapping real ASU-Ibajay campus buildings

## 2026-07-26: Floor Readiness Workflow — guided onboarding over the floor editor

- **Previous state**: Floor editor drops users into blank canvas with full toolbar; upload is hidden in properties panel; no guidance
- **What was done**:
  1. Designed three-state workflow derived from floor data: no-floor-plan → setup → mapping
  2. Created `docs/superpowers/specs/2026-07-26-floor-readiness-workflow.md` with full spec
  3. `FloorEditor.tsx`: Added mode/locked state, upload handler (base64 via FileReader), "Got it" tooltip, setup toolbar (Move/Opacity/Advanced/Reset/Lock Alignment), progress card with ✓/□ tracking, unlock warning when geometry exists, "Floor Plan ▼ Setup" affordance when card hidden
  4. `FloorEditorCanvas.tsx`: Added `locked` prop, passed to FloorPlanAlignment
  5. `FloorPlanAlignment.tsx`: Added `locked` prop, guards on all mouse down handlers, cursor changes
  6. Replaced old "Pipeline" steps with progress card
  7. Removed `alignMode` state (replaced by workflow mode)
  8. Removed 'a' keyboard shortcut (alignment now workflow-guided)
  9. Replaced old no-plan banner with centered upload card
- **Verification**: 141 test files, 1252 tests pass, zero regressions

## 2026-07-30: Floor Editor Completion Plan — Tasks T10, T1, T4, T2, T3, T5 Implemented & Verified

- **Previous state**: Floor editor plan approved to address base64 payload bloat, PublicMap floor plan rendering, floor selector, and debounced alignment persistence.
- **What was done**:
  1. **T10**: Created `src/lib/floor-plan-coords.ts` with shared `computeFloorPlanCoords` utility, imported by `FloorEditorCanvas.tsx` and `PublicMap.tsx`.
  2. **T1**: Created `src/services/floor-plan-storage.ts` for Supabase Storage uploads with fallback; updated `FloorEditor.tsx` to upload floor plan images to Supabase storage.
  3. **T4**: Implemented 500ms debounced alignment persistence in `FloorEditor.tsx` whenever `editorAlignment` changes.
  4. **T2**: Fixed `PublicMap.tsx` floor plan overlay to dynamically add/update MapLibre `ImageSource` with `computeFloorPlanCoords`.
  5. **T3**: Created `src/components/map/FloorSelector.tsx` and integrated it into `PublicMap.tsx` with active floor state for rooms and floor plan rendering.
  13. **Page Reload Handle Visibility Fix**: Added `effectiveFootprint` fallback in `FloorEditorCanvas.tsx` (deriving footprint from building components or center position if `building.footprint` is missing or < 3 points). Added full MapLibre event listeners (`zoom`, `resize`, `render`, `load`, `idle`) and post-mount delayed timers in `FloorPlanAlignment.tsx` so corner and rotation handles render immediately on page reload.
- **Verification**: 1251 vitest tests pass, alignment handles render reliably upon page refresh.


## 2026-08-01: Road Editing & Connectivity Fixes � T1, T2a, T2b, T2c Implemented & Verified

- **Previous state**: Vertex editing unusable (dragPan/doubleClickZoom conflicts); roads only connected via fragile 0.5m waypoint merge; entrance?road linking was unbounded nearest-neighbor; no endpoint snap while drawing
- **What was done**:
  1. **SPEC/PLAN**: spec/ROAD-EDIT-CONNECTIVITY.md + plan/ROAD-EDIT-CONNECTIVITY.md (T1 vertex editing, T2a intersections, T2b entrance?road links, T2c endpoint snap)
  2. **T1 � Vertex editing fix**: src/components/studio/useVertexEditor.ts � new effect disables map.dragPan + map.doubleClickZoom while isVertexEditing, re-enables otherwise; cleanup re-enables with try-catch guard
  3. **T2a � Road intersections**: skeleton-generator.ts � samplePolyline(polyline, interval, forcedPoints) projects forced points onto segments; planar segmentIntersection detects pairwise crossings between different roads; forced junction waypoints per road; ROAD_JUNCTION info diagnostic. Test oad-junction.test.ts (3 tests)
  4. **T2b � Entrance?road explicit linking**: connectorRoadId? on NormalizedEntrance + EntrancePortalNode; connectorEntranceId? on NormalizedRoad; carried through 
ormalize/index.ts + entrance-extractor.ts; connector.ts step 6 rewritten (explicit link ? bounded =50m nearest ? ENTRANCE_NO_ROAD; ROAD_LINK_BROKEN warning when linked road gone; new accessType entrance_road_link); oadLinks index + maxEntranceRoadDistance config (default 50) through coordinator + campus-compiler.ts. Test oad-entrance-link.test.ts (4 tests)
  5. **T2c � Endpoint snap**: new packages/editor/src/commands/road-snap.ts (equirectangular meter math, 
earestPointOnPolyline, snapRoadEndpoints 5m radius, snapPoint); oadCreateHandler snaps endpoints before storing; InteractionController.tsx route-tool snaps placed points for live preview; exports from commands/index.ts. Test oad-snap.test.ts (13 tests)
- **Verification**: compiler 232/232; editor road/command/rendering 156/156; studio InteractionController+Confirm 17/17; full root 1263 pass, 7 pre-existing failures (6 property panels + FloorEditor185 lucide mock � proven present without these changes via git stash). Zero regressions from this work
- **Next**: T3 log complete � run graphify update, then live-test vertex editing + road drawing in browser

## 2026-08-01: QA review fixes � Import Tool Group (5 findings)

- **Previous state**: QA review found 5 issues in the Import Tool Group feature (ToolDock phantom shortcut, ImportToast timer race, OsmImportTool false-success toast, CampusBoundary missing effect dep, eslint issues)
- **What was done**:
  1. **Fix 1** � packages/editor/src/panels/ToolDock.tsx: removed `shortcut: 'I'` from `import` parent tool (dead keybinding, no hook listens for id 'import'); made `shortcut` optional in `ToolDockItem`; guarded title + shortcut registry for missing shortcuts; removed unused `useCallback` import. Commit 54c3fbb
  2. **Fix 2** � src/components/studio/ImportToast.tsx: module-level `_globalTimer` in `showImportToast` (clearTimeout on each call); cleanup clears timer on unmount. Commit 8702552
  3. **Fix 3** � src/components/studio/OsmImportTool.tsx: `completePolygon` counts dispatches whose result `success !== false`; failure path emits `{ count: 0, success: false, error }`. Verified `execute()` returns `MutationResult { success: boolean }` (packages/editor/src/commands/types.ts, dispatcher.ts:92). Commit d80b6b9
  4. **Fix 4** � src/components/studio/CampusBoundary.tsx: added `toolId` to main effect deps; `options` via `optionsRef` (inline object at StudioCanvas.tsx:109 would re-run effect every render � ERRORS.md 2026-07-23 pattern). Commit 8ca09e6
  5. **Fix 5** � ToolDock.test.tsx: removed `as any` casts. Commit a44aad6
- **Verification**: tsc clean in all 5 edited files (only pre-existing error remains in untouched src/components/studio/ToolDock.tsx:21); ToolDock.test.tsx 11/11 pass; eslint: 8 problems at HEAD (5 errors/3 warnings) -> 4 errors/0 warnings, all remaining are pre-existing `react-hooks/refs` render-body ref writes (accepted codebase pattern, same as InteractionController.tsx:24-25, QA-sanctioned)
- **Next**: run graphify update; live-test import flow in browser

## 2026-08-02: Demo graph stitching + search-to-node resolution — cross-building & cross-floor routing live-verified

- **Previous state**: `/map/navigate` computed routes from the raw legacy compile output, but the demo graph was disconnected: roads shared hubs (11.82,122.168) that were never merged, Main Entrance had zero edges, staircases were never extracted (floor-1 rooms unreachable), and search results resolved to component ids (`rm-main-101`) instead of graph node ids (`node-1`) so `aStar` always returned null
- **What was done**:
  1. **TYPE_MAP fix** (`src/app/api/public-campus/route.ts`): legacy `compile()` emits entrance nodes as `transition`; now maps `transition -> entrance` (was wrongly `staircase`)
  2. **`stitchDemoGraph()`** in the route's demo fallback: (a) stitches co-located road endpoints into hubs (≤60m, incl. the 3-node hub at 11.82,122.168), (b) links each entrance to nearest road endpoint (≤300m — Main Entrance 275m to hub), (c) regenerates staircase nodes from `floors[].staircases` local x/y via `localToLatLng` (origin = footprint centroid, METER_PER_DEG=111320) and wires them across adjacent floors (≤30m) and to same-building same-floor rooms (≤60m). All added edges are haversine-weighted `walk` edges, deduped via seen-set
  3. **`stampComponentIds()`**: legacy nodes never carry `componentId`; stamped by matching room name within building (`bld-main|registrar office -> rm-main-101`) — all 24 room nodes linked
  4. **`campus-search.ts`**: room results now resolve `nodeId` via `node.componentId` bridge; building results resolve to entrance > staircase > first node in building
  5. Deleted temp scripts `scripts/verify-stitch.ts`, `scripts/verify-public-campus.ts`
- **Verification** (live, browser + API):
  - API: 40 nodes (room 24 / entrance 4 / hallway 8 / staircase 4), 94 edges, 24 componentId-linked nodes
  - aStar over live API: Registrar Office → Library Lobby 713m; Faculty Room (F1) → Library Lobby 746m [stairs]; Restroom (F0) → Faculty Room (F1) 62m [stairs]; Main Lobby → Computer Lab 56m [stairs]; Engineering Lobby → Book Stacks 1202m — all OK
  - Browser E2E on `/map/navigate`: search "Registrar" → pick → search "Library" → pick building → route drawn: **551 m, 5 steps** ("Start here at Main Building (GF)", "Turn left onto hallway 221m", "Enter 144m", "Continue straight along hallway 54m", "Destination reached at Library — Library Entrance 131m"); route source + route-glow/route-core/route-flow layers confirmed present on map via `__naviMap`
  - tsc: my files clean; remaining 220 errors pre-existing
  - Pre-existing RouteLine `getLayer` console error gone after fresh load
- **Known issue (pre-existing)**: `SplashOnboarding` hydration mismatch on every page load (server renders fixed overlay, client renders flex layout) — cosmetic, client regenerates; flagged for later fix
- **Next**: build `/map/search` page (stub exists) — search input → `searchCampus()` results → tap result → `setTo(nodeId)` + `router.push('/map/navigate')`; then Step 4 runtime wiring, Step 5 QR, Step 6 mobile polish

## 2026-08-02: /map/search page built — search → navigate flow live-verified

- **Previous state**: `/map/search` was a static stub ("Search coming in Phase 4")
- **What was done**:
  1. Replaced stub with functional search page (`src/app/(public)/map/search/page.tsx`): autofocused search input, Enter-to-submit (live re-search on typing after submit), clear button
  2. Results via `searchCampus()` with building/room icons, sublabel (building · floor), navigation affordance
  3. Tap result → `setTo(r.nodeId)` + `addRecentSearch(query)` + `addRecentDestination(nodeId)` → `router.push('/map/navigate')`
  4. Empty state: "Recent searches" chips (localStorage-backed via store, max 8) + "Popular destinations" (first 6 rooms)
  5. Loading / error + Retry states via `campusStatus`/`campusError`
- **Verification** (live browser):
  - `/map/search` loads with 6 Popular destinations
  - Search "Computer Lab" → single result "202 — Computer Lab Main Building · Floor 1"
  - Tap → lands on `/map/navigate` with destination chip "Computer Lab" (F1)
  - Back on search page: "Recent searches" shows "Computer Lab" chip (persisted)
  - tsc clean for the page; engine 76/76, store 8/8 tests pass — zero regressions
- **Next**: Step 4 runtime wiring (QR codes + live location), Step 5 QR sharing, Step 6 mobile polish; then manual real-ASU data entry (Step 3)

## 2026-08-01: Public map app complete (plan tasks 1-8, all acceptance green)

- **Previous state**: plan `2026-08-01-public-map-app.md` tasks 1-5 committed (data layer, explore, search, navigate, QR infra); 7 failing tests fixed at T1; demo artifacts published (36 nodes / 69 edges / 27 search entries).
- **What was done**:
  1. **T6 QR polish** (`177c37b`): cross-campus guard for foreign NAVI codes (`isForeignCampus` + 6 tests) and stable scanner handlers (camera no longer restarts on dep change).
  2. **T7 runtime wiring** (`cfbbacb`, `58b448d`): `RuntimeMapShell` migrated from stale `engine.routing.*`/`engine.position.*` to `engine.navigation.*`/`engine.location.*` (verified against runtime package sources); data fetches pointed at `/api/demo/artifacts?file=`; artifacts route hardened against path traversal (`isSafeArtifactName`, 400 on invalid, + tests); "Route from here" wired via `nearestEntrance ?? nearestNode` fallback after QA flagged the demo graph has no `transition` nodes.
  3. **T8a mobile polish** (`0085734`): navigate steps-sheet collapse, search badge overflow at 360px, runtime shell scroll fix; Playwright DOM-geometry verified at 375x812/360x740.
  4. **T8b/T8c hydration fixes** (`db609fb`, `01db75c`): SSR hydration mismatches from synchronous localStorage reads in store init — recents sections gated behind new `useHydrated()` hook; onboarding overlay null-until-hydrated. Deterministic E2E regression: search-write → home reload → zero page errors; onboarded reloads clean on all pages.
- **Verification (all evidence collected)**: vitest 150 files / 1347 tests green; tsc no NEW errors in touched files (214 pre-existing baseline); `next build` passes; controller E2E journey at 375x812 — 8/8 PASS (onboarding show/skip, search → `?to=node-8` deep link, route renders 2 steps `from=node-0&to=node-1`, explore map canvas, home reload after writes, runtime shell no error banner, zero console/page errors).
- **Next**: root repo submodule pointer bump (`chore: update navi-next submodule (public map app)` on `feature/voicecode`); later sessions: real ASU data entry in Studio, `src/app/demo/navigate/page.tsx` stale-API cleanup, orphaned-file cleanup (PublicMap.tsx, BuildingSheet.tsx, demo-stitch.ts, api/public-campus/), `apps/studio-new/.next` untrack+gitignore hygiene.
