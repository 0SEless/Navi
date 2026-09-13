# PROGRESS.md — Session log

## 2026-09-13: P0 — Single-user sync root cause + per-campus save serialization (audit + fix)

### Root cause (evidence)
- **No per-campus write serialization.** All Studio writes funnel through `graph-store.syncToSupabase` (single POST site), but autosave (editor `SaveQueue`) is overlapped by unqueued triggers: `EditorBridge` visibilitychange/beforeunload, floor-route unmount flush, building-drag mouseup, Create Wizard, `online` resync, forced `reSync`. Two in-flight POSTs read the same `expectedServerUpdatedAt`; with migration 009 CAS semantics the loser 409s against the winner's own revision (self-conflict). RED-proof: mock-RPC fixture showed 3 concurrent POSTs / 2 conflicts / maxInFlight 3.
- **Revision acknowledgement loss (deployed RPC).** Migrations 004/005 return `{success,campus_id}` with no `updatedAt`; only migration 009 returns it, and `navi-next/progress/PROGRESS.md:2752` records 009 "awaits rollout". The stored k6bv `data` still contains `expectedServerUpdatedAt`/`forceServerOverwrite` (`audit-artifacts/test-campus-cleanup-2026-09-13/inventory.json`), proving the last production write bypassed 009's control-field stripping. `syncToSupabase` fell back to the previous marker revision when no `updatedAt` was returned, so after every successful save the Studio kept sending a stale expected revision. RED-proof: marker stayed `R0` after a successful save to `R1`; the next sequential save then self-conflicted.
- **Unconfirmable revision reported synced.** When no revision could be resolved the old code still set `syncStatus:'synced'`. RED-proof: save resolved and reported synced with no authoritative revision.
- **External writers hit production.** `navi-next/.env.local` points local dev at the production Supabase project; `.dev-server-bg.log` shows a k6bv floor-editor session with 17 real `POST /api/graph 200` writes, aligned with the `2026-09-13T09:12:40.365798Z` revision window and the later `10:10:07Z` revision; `e2e/autosave-roundtrip.spec.ts` selected `maps[0]` (the only `campus_maps` row = k6bv); ad-hoc `e2e-p4-*.mjs` scripts hardcoded k6bv; Playwright MCP sessions and the Supabase MCP (production project ref) are agent-capable writers.

### Fix (client-side mechanism only; no DB/product writes)
- `graph-store.ts`: per-campus save queue (one POST in flight; callers during a run join one coalesced follow-up that re-reads the latest graph and latest acknowledged revision). Ack contract: use response `updatedAt`; else GET-confirm; else `error` (never `synced`); a confirmed revision is always written to the marker.
- E2E safety: `e2e/support/safety.ts` + `e2e/support/campus-guard.mjs` (explicit `E2E_CAMPUS_ID`, protected lockout for `map-map-1-k6bv`); autosave spec no longer picks `maps[0]`; POI script `maps[0]` fallback removed; all hardcoded `e2e-p4-*.mjs` scripts gated.

### Verification
- RED first: `src/store/graph-store-save-queue.test.ts` 3/6 failing pre-fix (overlap conflict, stale ack, false synced).
- GREEN: new suite 6/6; store suites 19/19; consolidated focused matrix **55 files / 436 tests PASS**; `production-route-characterization` 76/76; Playwright spec compiles/lists; 9/9 p4 scripts `node --check` OK; guard exits 1 for missing/protected ids.
- `tsc --noEmit`: only documented baseline `data-identity-comparison.test.ts(255,3) TS1005`.
- Scoped ESLint: no new findings (8 pre-existing autosave-spec violations + 1 pre-existing `as any` in graph-store.test.ts unchanged).
- No production POST/publish/migration/SQL issued; k6bv untouched.

### Status
- **ROOT CAUSE FOUND — RECOVERY PENDING.** Production still runs the pre-fix client and pre-009 RPC; the current local/server divergence must be recovered separately after root-cause sign-off. Recommend applying migration 009 and separating dev/test Supabase credentials.

### Artifacts
`spec/P0-SINGLE-USER-SYNC-ROOT-CAUSE-2026-09-13.md`, `plan/P0-SINGLE-USER-SYNC-ROOT-CAUSE-2026-09-13.md`.

## 2026-09-13: Test / Empty Campus Cleanup — Tier A EXECUTED + verified

### Phase: Approved deletion (2 of 3 requested IDs)
- Approval: Tier A only. `asu-ibajay` **excluded** after the final repository
  search confirmed runtime/default-slug references (`QR_DEFAULT_CAMPUS` in
  `src/lib/qr-payload.ts:16`; `Graph` defaults in `src/engine/graph.ts:20/:1093/:1111`;
  row-mapping defaults in `src/lib/db-schema.ts:74/:95/:115`; live RPC defaults in
  migrations 001/004; documented empty draft in `navi-next/errors/ERRORS.md`).
  Deleted only `map-map-1-5ts0` and `verify-removal`.
- Mutation: ONE atomic `DELETE` on `graph_snapshots` (`campus_id IN` the 2 IDs);
  `return=representation` returned exactly those 2 rows. Prerequisite gates
  (backup sha256, row existence, zero dependents, global baselines, protected-ID
  hard guard) all passed before the delete was issued.
- `map-map-1-k6bv`: protected — excluded from backup scope and delete list;
  version, revision `2026-09-13T10:10:07.45635+00:00`, 138,763 data bytes,
  29/53/50 building/node/edge counts and the `campus_maps` row verified
  byte-identical pre/post.

### Verification (37/37 PASS)
- Backup sha256 `2ed428dc…58ce` re-verified before mutation.
- Pre: 14 snapshots / 31 buildings / 55 nodes / 51 edges / 1 published / 1 registry / 3 captures.
- Post: 12 snapshots / 31 / 55 / 51 / 1 / 1 / 3 — only the 2 approved rows removed;
  all other table fingerprints byte-identical; remaining snapshots byte-identical;
  `asu-ibajay` and `p13-campus` untouched.
- Prod `/api/campuses` (cache MISS): 12 campuses; deleted IDs absent; `asu-ibajay`
  and `map-map-1-k6bv` still listed.
- Evidence: `audit-artifacts/test-campus-cleanup-2026-09-13/{pre-state.json,post-state.json,post-delete-verification.json,POST-DELETE-VERIFICATION.md}`.

### Status
- **TIER A: COMPLETE — VERIFIED.** Tier B (11 fixture IDs) untouched; no Tier B
  proposal made.

## 2026-09-13: Test / Empty Campus Cleanup — Phase 1–4 (read-only), stopped at approval gate

### Phase: Read-only inventory → classification → dependency audit → backup
- Inventoried all 15 campus identifiers in production Supabase
  (`oltfaepqcktrumfhadzb`) across the 7 live tables: `campus_maps` (1),
  `graph_snapshots` (14), `buildings` (31), `route_nodes` (55),
  `route_edges` (51), `published_maps` (1), `capture_sessions` (3, all
  `campus_id = NULL`).
- Classified: KEEP `map-map-1-k6bv` (protected; 29 bldg / 53 nodes / 50 edges,
  snapshot updated 2026-09-13); PROBABLE TEST/EMPTY `asu-ibajay`,
  `map-map-1-5ts0`, `verify-removal`; REVIEW REQUIRED the 10 synthetic
  POI-repair fixtures + `p13-campus` (published E2E artifact).
- Provenance: POI fixtures created 2026-09-12 during the documented POI tool
  repair; `p13-campus` from `navi-next/e2e-p1.3-identity.mjs`; `verify-removal`
  from the dev-route check recorded 2026-08-31.
- Dependency audit: no `campuses`/`floors`/POI/component tables exist; the app's
  own delete paths are incomplete (`delete_campus_map` RPC = registry only;
  `/api/campuses` DELETE = graph world only, leaves `published_maps`).
  Documented transactional order: route_edges → route_nodes → buildings →
  graph_snapshots → published_maps → campus_maps.

### Verification
- Inventory sha256 `1b697aa8…5521f`; per-campus counts reconcile with
  table-wide totals; 0 edges with missing nodes; 0 nodes with missing building.
- Backup written before any deletion:
  `audit-artifacts/test-campus-cleanup-2026-09-13/backup/campus-cleanup-backup-2026-09-13.json`
  sha256 `2ed428dc…58ce`; counts 13/2/2/1/1/0/3 — reconciliation MATCH.
- Report: `audit-artifacts/test-campus-cleanup-2026-09-13/APPROVAL-REPORT.md`.

### Integrity
- Zero DELETE / UPDATE / INSERT executed against production.
- `map-map-1-k6bv` excluded from backup scope and all proposals; export guard
  rejects it.
- Management API token rejected (401) — reads used service-role PostgREST GETs
  only; no schema or content mutation anywhere.

### Next
- Await approval: Option A (3 IDs) vs Option B (14 IDs), `asu-ibajay` keep/drop,
  and execution channel (refreshed SQL access vs service-role REST deletes).

### Status
- **CAMPUS CLEANUP: SAFE TO DELETE (3 strict IDs) — PENDING APPROVAL** ·
  **REVIEW REQUIRED (11 additional IDs)** · STOPPED BEFORE DELETION

## 2026-09-10: NAVI Day 2 Camera Repair Phase 1 audit

### Phase: Read-only audit
- Traced Capture and Navigate heading input, resolution, state ownership,
  MapLibre writers, gesture handlers, route fitting, and transition cancellation.
- Confirmed the shared resolver and marker path are healthy: heading value and
  Navigate arrow update independently of camera bearing.
- Reproduced the Navigate ownership conflict with in-memory MapLibre
  instrumentation: POV disables pan/rotate; Follow keeps writing after rotate;
  rapid mode changes interleave pitch repair and mode transitions.

### Verification
- Focused baseline: 5 files, 58 tests passed.
- Local browser marker/camera check: arrow heading 90°/180° arrived correctly;
  Heading Follow bearing moved 0°→90° and 90°→121.5° under 0.35 smoothing.
- The initial restricted Vitest attempt hit Windows `spawn EPERM`; the identical
  approved rerun passed and is authoritative.

### Integrity
- No product code, Capture code, GPS/heading pipeline, route data, routing,
  A*, Studio, compiler/publisher, or deployment state changed.
- No Vercel deployment was attempted.

### Next
- Await approval before Phase 2 camera-policy/controller implementation.

### Status
- **DAY 2 PHASE 1 AUDIT PASS — STOPPED BEFORE IMPLEMENTATION**

## 2026-08-31: Road endpoint and trace-intersection repair

### Phase: Implementation
- Added focused regressions in `navi-next/src/engine/__tests__/trace-intersections.test.ts` for the compiler's endpoint-first node insertion order and for a partially split chain with a missing direct segment edge.
- Updated `navi-next/src/engine/graph.ts` to recover new-trace nodes in authored point order, preserve existing-chain edge slots by authored segment index, and skip missing split/shared edges before dereferencing them.
- This keeps the authored final endpoint eligible for an intersection connection and prevents the save-time `chain.edges[sj].from` crash. A* was not changed.

### Verification
- Focused suite: `3` test files / `32` tests passed (`trace-intersections`, `a-star`, and `GraphAdapter`).
- `git diff --check` passed for the changed source/test files; only the existing LF-to-CRLF warning was reported.
- Live `/studio/map-map-1-k6bv/edit` mounted with `All changes saved`, and no runtime TypeError was present in the browser snapshot.
- Live `/routes` loaded the `map-map-1-k6bv` graph and routed from `N4495` to `N4343`: `Route Found`, `17` nodes, `180m`; the computed path began at `N4495` and reached `N4343`.
- The live route page still reads the already-published graph snapshot, so this source fix does not mutate route data or claim that the persisted snapshot has been recompiled. Normal Studio save/recompile/publish remains the data update boundary.
- Broader routing-validation run retained `3` pre-existing fixture failures in entrance/room projection tests; the graph/adapter tests remained green.
- `graphify update .` was attempted after the source change but remained blocked by `[WinError 5] Access is denied`; no generated graph files were manually changed.

### Scope
- No A* heuristic changes, automatic route-data mutations, entrance behavior changes, or unrelated editor files were made for this repair.

## 2026-08-31: Vercel readiness check

### Result: BLOCKED
- `npm run build` failed in `next build` because the client `/demo/navigate` import graph reaches the Node-only `fs` loader at `packages/runtime/src/loader/package-reader.ts`; Google Font requests also failed in the restricted local environment.
- `npm run lint` failed with `2,155` errors and `20,353` warnings, amplified by generated `.next` output and the broad dirty checkout.
- The `navi-next` checkout is on `master` with `872` worktree entries, so it is not a safe release source without isolating and reviewing the intended commit.
- The focused road endpoint suite remains green at `3` files / `32` tests; that verifies the bug repair only, not Vercel deployment readiness.

### Recommendation
- Do not push this checkout to Vercel yet. First correct the production build import boundary, make font loading build-safe, isolate the intended release changes, then rerun build/lint and review the final deployment diff.

## 2026-09-01: Temporary Vercel deployment readiness

### Phase: Implementation and verification

- Added the browser-safe `@navi/runtime/engine` package export and moved the
  `RuntimeEngine` value imports in both `/demo/navigate` and the public
  `/map/runtime` client shell to that entrypoint. The filesystem-backed
  `@navi/runtime/loader` export remains unchanged for server-side use.
- Replaced build-time `next/font/google` loading with the existing CSS system
  font fallback so production builds do not require Google Fonts network access.
- Added the exact Vercel project/env/asset-persistence handoff at
  `navi-next/docs/deployment/temporary-vercel.md`.
- No Studio, CampusDocument, routing, compiler, publish, Supabase schema, or
  unrelated dirty files were intentionally changed.

### Verification

- Boundary plus route/editor regressions: **4 files / 35 tests passed**.
- Elevated `npm run build`: **exit 0**; Next compiled successfully, generated
  all **40/40** static pages, and included `/studio`, both dynamic Studio edit
  routes, `/map/runtime`, and `/demo/navigate`.
- Built client chunks: no `package-reader`, `node:fs`, or `fs` import markers.
- Source audit: no remaining `RuntimeEngine` value import from the
  `@navi/runtime` package root; type-only root imports remain intentionally.
- Environment audit: current runtime code requires the two public Supabase
  variables and the server-only service-role key; mock auth is optional and
  must remain disabled for deployment.
- Read-only Supabase Storage check: the configured project currently has no
  `floor-plans` bucket or objects. Floor-plan uploads therefore use the
  existing inline data-url fallback until Storage is configured separately.
- `graphify update .` was attempted after the source changes and remained
  blocked by the managed-checkout `[WinError 5] Access is denied`; generated
  graph output was left untouched.

### Release handoff

The build is ready for a temporary single-user Vercel deployment, but no
Vercel deployment was created. Use `navi-next` as the project root and set the
three required variables documented in the deployment handoff. Review the
dirty checkout and deploy only the intended release commit.

## 2026-08-26: W12B Floor-plan Alignment Correctness

### Phase: Analysis
- Read `computeFloorPlanCoords` — confirmed offset unit bug (internal units ≈ π/180 meters, UI produces meters)
- Read `ScaleCalibration.tsx` — confirmed formula bug (sets scale = input, ignores measured distance)
- Found 3 `PlanAlignment` definitions: floor-plan-coords.ts, reference-layer.ts, entities.ts
- Found 'calibrating' state in type but never set by any code path
- Read body drag handler — already produces meters correctly
- Read keyboard nudge — already uses meter steps correctly

### Phase: Implementation

**B1 — Fix Offset Unit Semantics** ✓
- File: `navi-next/src/lib/floor-plan-coords.ts`
- Added `METERS_TO_INTERNAL = 180/π` conversion factor
- Offset now converted from meters to internal units inside computeFloorPlanCoords
- Updated PlanAlignment JSDoc and function JSDoc
- Updated existing tests to use exact constants (R=6371000, DEG_TO_M=π/180)
- Added 4 new regression tests (cases 2, 3, 5)
- All 9 floor-plan-coords tests pass

**B2 — Fix Scale Calibration Semantics** ✓
- File: `navi-next/src/components/floor-editor/ScaleCalibration.tsx`
- Added `measuredPixels` state and input field
- Fixed formula: `calibratedScale = knownDistance / measuredPixels * currentScale`
- Added clamping to [0.1, 20] range

**B3 — Consolidate Alignment Type Authority** ✓
- Canonical type: `@navi/core` coordinates.ts (new PlanAlignment export)
- `floor-plan-coords.ts`: imports from `@navi/core`, re-exports
- `reference-layer.ts`: imports from `@navi/core`, re-exports
- `entities.ts`: imports PlanAlignment from `@navi/core`
- 23 tests pass across floor-plan-coords and reference-layer

**B4 — floorPlanState Cleanup** ✓
- Removed 'calibrating' from Floor.floorPlanState type union
- Removed calibrating UI branch from FloorPlanUpload.tsx
- Removed calibrating color/label from building-props.tsx
- No code path ever set 'calibrating' — dead code removed

### Verification
- Full test suite: 286/289 files pass (3 pre-existing failures unrelated to W12B)
- TypeScript: No type errors in any changed files
- 3134/3136 tests pass (2 pre-existing failures)

## 2026-08-26: W12C Two-Point Calibration UX

### Phase: Implementation
- Created `navi-next/src/lib/two-point-calibration.ts` — math module with:
  - `computeTwoPointAlignment(planPoints, mapPoints)` → PlanAlignment
  - `validatePlanPoints(a, b, imageWidth, imageHeight)` → CalibrationError | null
  - `validateMapPoints(a, b, buildingFootprint)` → CalibrationError | null
  - `screenToImagePixel(...)` — convert screen click to plan image pixel coords
  - `screenToBuildingLocal(...)` — convert screen click to building-local meters
- Created `navi-next/src/components/floor-editor/TwoPointCalibration.tsx` — UI panel:
  - 4-step flow: Plan A → Plan B → Map A → Map B → Preview
  - Shows computed scale/rotation/offset before confirming
  - Error display for validation failures
  - Reset/Apply/Cancel buttons
- Modified `navi-next/src/components/floor-editor/FloorEditor.tsx`:
  - Added calibration state (step, points, error, image dimensions)
  - Added "2-Point Cal" button in setup toolbar
  - Added `handleCalibrationClick` handler for point collection
  - Added `handleCalibrationApply` / `handleCalibrationClose` handlers
  - Renders TwoPointCalibration overlay
  - Passes calibration props to FloorEditorCanvas
- Modified `navi-next/src/components/floor-editor/FloorEditorCanvas.tsx`:
  - Added calibration props (calibrationMode, calibrationStep, onCalibrationClick, onCalibrationImageLoaded)
  - Added footprint bounds calculation for coordinate conversion
  - Added image dimension capture via Image object
  - Intercepts MapLibre clicks in calibration mode to convert coordinates
- Created `navi-next/src/lib/__tests__/two-point-calibration.test.ts` — 20 tests:
  - Case 1: Two distant control points → expected transform (scale=0.1, rotation=0, offset=(5,5))
  - Case 2: Reversing point order → same transform
  - Case 3: Identical control points rejected (plan + map)
  - Case 4: Rotation works (45° and 90°)
  - Case 5: Scale works (0.2x and 2.0x)
  - Case 6: Translation works (offset=(10,10))
  - Edge cases: diagonal vectors, non-zero origins
  - Validation: out-of-bounds rejection, empty footprint skip
  - Coordinate conversion: screenToImagePixel, screenToBuildingLocal

### Verification
- 20 new tests pass (two-point-calibration.test.ts)
- 9 existing tests pass (floor-plan-coords.test.ts)
- 260 floor-editor tests pass
- TypeScript: No type errors in changed files
- No regressions in existing test suite

## 2026-08-27: W15C RouteNetwork Compiler + Per-Floor Authority Selector

### Phase: Implementation

**T1 — Authority Predicate** ✓
- File: `compiler/src/primitives/route-network-authority.ts` (new)
- `assessRouteNetworkAuthority(floor)` returns ABSENT/EMPTY/INVALID/USABLE
- Validates: node ID uniqueness, finite coordinates, edge ID uniqueness, edge reference integrity, no self-edges, valid distance

**T2 — Route-Network Extractor** ✓
- File: `compiler/src/primitives/route-network-extractor.ts` (new)
- Converts RouteNode.position (building-local meters) → world LatLng via building origin
- Uses same METER_PER_DEG (111320) as normalizer for coordinate conversion
- Emits PrimitiveNode with `R-` prefix namespace for authored IDs
- Preserves authored edge distances without haversine recalculation

**T3 — Authority Selector in Coordinator** ✓
- File: `compiler/src/primitives/coordinator.ts` (modified)
- Calls `assessRouteNetworkAuthority` per floor before skeleton generation
- USABLE floors → route-network-extractor
- Non-USABLE floors → filtered document sent to legacy skeleton-generator
- Skeleton generator skips hallways on floors with USABLE routeNetwork

**T4 — Export Updates** ✓
- File: `compiler/src/primitives/index.ts` (modified)
- Added exports: `extractRouteNetwork`, `assessRouteNetworkAuthority`, `RouteNetworkAuthority`

**T5 — Comprehensive Tests (22 cases)** ✓
- File: `compiler/src/__tests__/w15c-route-network-compiler.test.ts` (new)
- 11 authority predicate tests (ABSENT, EMPTY, USABLE, 8 INVALID cases)
- 7 route-network extractor tests (R- prefix, coord conversion, edges, floor/building, diagnostics, skip)
- 3 coordinator selector tests (USABLE, ABSENT, mixed floors)
- 1 A* pathfinding proof

### Verification
- `npx vitest run`: 357/359 tests pass (2 pre-existing failures unrelated to W15C)
- `npx tsc --noEmit`: No type errors in any new files
- All 22 W15C tests pass
- Pre-existing failures: `publish-blocking-gate.test.ts` (missing module) and `reconstructed-pipeline.test.ts` (missing building.json)

## 2026-08-27: Indoor Editor Bugfixes (Snap Mode + Two-Point Door)

### Phase: Implementation

**Bugfix A: Wall Snap Mode** ✓
- File: `navi-next/src/components/floor-editor/useFloorDrawing.ts`
  - Added `SnapMode` type: `'architectural' | 'trace' | 'free'`
  - Added `SNAP_CONFIGS` object with different snap configurations for each mode
  - Added `DEFAULT_SNAP_MODE` constant (defaults to 'trace')
  - Added `snapMode` state to `useFloorDrawing` hook
  - Updated wall tool to use snap mode config instead of hardcoded `DEFAULT_SNAP_CONFIG`
  - Exported `SNAP_CONFIGS`, `DEFAULT_SNAP_MODE`, `SnapMode` for testing

- File: `navi-next/src/components/floor-editor/FloorEditor.tsx`
  - Added `snapMode` state to FloorEditor component
  - Added snap mode toggle UI in toolbar when wall tool is active
  - Three buttons: Arch, Trace, Free with color highlighting for active mode

- File: `navi-next/src/components/floor-editor/FloorEditorCanvas.tsx`
  - Added `snapMode` and `onSnapModeChange` props
  - Passed props to `useFloorDrawing` hook

**Bugfix B: Two-Point Door Placement** ✓
- File: `navi-next/src/components/floor-editor/useFloorDrawing.ts`
  - Added `DoorDrawState` interface for two-click placement state
  - Added `doorDraw` state to `useFloorDrawing` hook
  - Updated door/window tool handler for two-point placement:
    - First click: stores wallId, offset, and start position
    - Second click: validates same wall, computes width, validates placement
  - Added validation:
    - Minimum width: 0.3m
    - Maximum width: wall length - start offset
    - Opening doesn't extend beyond wall endpoints
    - Same wall validation
  - Added door preview rendering (vertex at start point)
  - Updated cancel function to reset doorDraw state
  - Updated tool change reset to reset doorDraw state

**Tests** ✓
- File: `navi-next/src/components/floor-editor/__tests__/snap-mode-and-door-placement.test.ts` (new)
  - 16 tests covering:
    - Snap mode configuration (3 modes, default mode, snap values)
    - Two-point door placement (offsets, width calculation, validation)
    - Edge cases (wall start/end, diagonal walls)

### Verification
- All 16 new tests pass
- All 24 existing door-window-authoring tests pass
- All 12 wall-maplibre-vertical-slice tests pass
- All 316 floor-editor tests pass
- TypeScript: No type errors in changed files (pre-existing error in data-identity-comparison.test.ts unrelated)
- No regressions in existing test suite

## 2026-08-29: Delete Wall and Semantic Room Controls

### Phase: Implementation and verification

- Added a visible `Delete Wall` action to the selected-wall status panel in `navi-next/src/components/floor-editor/FloorEditorCanvas.tsx`.
- The wall action dispatches the existing `wall.delete` command with the active building/floor IDs, clears wall/component selection after success, and leaves the existing undo/history path intact.
- Renamed semantic Room delete affordances to `Delete Room` in the Inspector, Outliner, and selected-component action bar while preserving `roomAttributes.unassign`; wall-derived face geometry remains authoritative and is not deleted.
- Legacy polygon Rooms continue to dispatch `room.delete`.
- Added production-route coverage for selecting and deleting a wall and updated semantic Room UI expectations.
- Added `mapReady` to the MapLibre interaction effect so wall selection handlers register after map initialization.

### Verification

- UI suite: 3 files, 68 tests passed (`semantic-room-properties`, `production-route-characterization`, `FloorEditorCanvas`).
- Command suite: 2 files, 32 tests passed (`wall-handlers`, `semantic-room-handlers`).
- Geometry suite: 3 files, 47 tests passed (`w5-derived-rooms`, `semantic-room-store`, `room-access`).
- `git diff --check` passed for the changed editor/test files.
- `graphify update .` remains blocked by Windows `[WinError 5] Access is denied`; source and tests are unaffected.

## 2026-08-30: Route-network audit

### Phase: Investigation and verification

- Audited the RouteNetwork data model, editor command handlers, MapLibre rendering/drawing paths, entrance-road relationship, canonical EntranceAccess compiler path, publisher/runtime path, and the live Floor Editor route.
- Confirmed the core route-node/route-edge commands, V2 compiler fixtures, and route runtime unit tests are present and passing.
- Confirmed the real Floor Editor currently exposes Entrance but no Route Node or Route Edge authoring controls; the Navigation Preview Graph toggle is visualization-only on this route.
- Confirmed the existing Entrance UI persists entrance-to-road relationships, not the canonical outdoor-node-to-indoor-route-node EntranceAccess bridge.
- Identified V1 risks: no production authoring path, no explicit no-door semantic-room destination policy, route edge types flattened in the V2 emitter, runtime entrance/preferences/directionality gaps, and published floor-geometry route fields not preserved by the current file conversion path.

### Verification

- Root focused suite: 13 files, 324 tests passed.
- Runtime route suite: 4 files, 42 tests passed.
- Runtime service suite: 2 files, 13 tests passed.
- W15F compiler closure gate: 1 file, 63 tests passed.
- Live exact route loaded successfully; inspection found 0 Route Node buttons, 0 Route Edge buttons, 1 Entrance button, and 1 Graph control.
- No product source files were changed by this audit. The keyboard-probe harness error was recorded separately in `errors/ERRORS.md` as inconclusive.

### Next

- If approved, implement only the V1 route-network slice: route-node/route-edge authoring and selection, explicit EntranceAccess authoring, an explicit no-door destination policy, and a true compileV2-to-publisher-to-runtime route test. Keep Door out of the V1 authoritative path.

## 2026-08-30: Campus navigation minimap correction

### Phase: Implementation and verification

- Replaced the picker’s building-only view with a campus navigation context using the existing OSM map style.
- Passed the existing campus buildings, roads, areas, and graph data from `FloorEditor` into `OutdoorRoutePicker`.
- Added muted campus building/road/area layers and a complete outdoor navigation graph overlay, including intermediate junction nodes and edges that do not touch the selected Entrance.
- Kept eligible outdoor points as the only selectable candidates; the current building and Entrance remain highlighted.
- Made the picker open in full-campus view by default and retained `Focus on current building` as the secondary camera control.
- Added model and component regressions for campus context, graph filtering, intermediate segments, summary counts, and the focus toggle.

### Verification

- Focused picker/model suites: 2 files, 13 tests passed.
- Floor Editor and geometry integration sweep: 32 files, 426 tests passed.
- Live exact route: picker opened with the campus map, 83 graph nodes, 80 graph edges, current Comsci Building/Entrance context, and a working full-campus/focused-view toggle.
- Live MapLibre check found both the floor map canvas and the picker canvas (277×683); browser warnings/errors: none.
- Picker was closed with Cancel; no navigation data was created or deleted.
- `git diff --check` reported only pre-existing trailing whitespace in unrelated `docs/architecture/rendering.md` and `plan/PLAN.md`.
- `graphify update .` remains blocked by Windows `[WinError 5] Access is denied`; recorded in `errors/ERRORS.md`.

### Next

- Manually open Entrance → `Change outdoor route` to review the campus graph, then select an eligible outdoor node and confirm the connection when ready.

## 2026-08-30: Entrance auto-connection investigation

### Phase: Investigation and verification

- Traced Entrance creation, editor graph compilation, canonical `EntranceAccess`, route-node snapping, and hallway/trace intersection synchronization.
- Confirmed the editor graph currently creates an automatic Entrance → nearest outdoor/intersection edge in `src/engine/component-compiler.ts` with an unbounded nearest-node query, and adds a second nearest road-trace edge in `packages/editor/src/graph-adapter.ts` within 200 m.
- Confirmed the explicit `entrance.access.assign` command is separate, persists `Floor.entranceAccess`, and is only dispatched by the user-controlled picker/route-authoring flow.
- Confirmed the intended intersection behavior is separate: hallway/trace geometry synchronization uses a 5 m endpoint-to-segment threshold, while authored Route path node reuse uses a 0.5 m same-floor threshold.
- Confirmed the canonical V2 publisher compiler has a safer bounded 50 m fallback and emits `ENTRANCE_NO_ROAD` when no explicit link or nearby road exists; this does not remove the unsafe editor-graph behavior.
- No product source files or map data were changed.

### Verification

- Focused explicit-access and route-authoring suites: 2 files, 28 tests passed.
- Live exact Floor Editor route loaded successfully; read-only UI inspection showed the explicit `Connect to Outdoor Route` flow and current campus graph context. No command was dispatched.

### Recommendation

- Make Entrance creation graph-neutral: create only the Entrance entity.
- Require an explicit outdoor-node selection and confirmation before creating the outdoor bridge, then require an explicit indoor Route node selection for the `EntranceAccess` record.
- Keep 5 m geometry intersection synchronization and 0.5 m authored Route-node snapping scoped to their own route-authoring purposes; do not use either as an Entrance-to-outdoor fallback.
- Show an unconnected state and block publish/route validation until the explicit bridge is complete.

### Live-tab confirmation

- Rechecked the currently open exact Floor Editor route in the in-app browser without clicking or dispatching a command.
- The open picker showed the Entrance highlighted and blue campus graph lines already rendered while the outdoor selection remained empty and confirmation remained unavailable.
- This confirms the visible lines are pre-existing compiled `graphEdges` supplied to the picker, not a newly selected outdoor candidate; the picker renders those graph edges before its click handler records a selection.

## 2026-08-30: Route-network tool and layer audit

### Phase: Investigation only

- Confirmed the building footprint is already rendered as its own building polygon layer and can serve as the visual/base ground reference without becoming route topology.
- Confirmed the route network is represented separately by `floor-route-nodes` and `floor-route-edges` layers, with independent visibility controls and 2.5D edge rendering.
- Confirmed Hallway currently authors a buffered hallway geometry/polyline, while route-node and route-edge drawing logic already exists but is not exposed by the production Floor Editor tool dock or tool adapter.
- Confirmed the existing Entrance tool places a point and supports entrance-to-road relationships, but does not author the indoor route access bridge.
- Proposed the V1 tool surface: keep Base/Footprint as a non-authored reference layer, preserve Hallway as the architectural component, add Route Node and Route Edge as navigation-layer tools, and use a point-based Entrance/Room Access node for the no-door V1 compromise.

### Verification

- Read-only source audit completed across the tool registry, ToolDock, tool adapter, FloorEditor, FloorEditorCanvas, and useFloorDrawing paths.
- No product source files were changed.

## 2026-08-30: Layered route-network V1 plan

### Phase: Specification and planning

- Defined the proposed spectrum of layers: studio-only reference, visitor-visible footprint/base, architecture, point-based access, navigation graph, and route preview.
- Defined the route-only Hallway/Route behavior: preserve click-to-draw interaction while removing width and buffered hallway geometry; new authoring writes only `Floor.routeNetwork` nodes and edges.
- Defined point-based room and entrance access, route-specific validation, publish blocking, visitor-package boundaries, and the outside-to-room end-to-end test.
- Created the proposed specification at `spec/ROUTE-NETWORK-LAYERED-V1.md`, design record at `docs/superpowers/specs/2026-08-30-layered-route-network-v1-design.md`, and implementation plan at `docs/superpowers/plans/2026-08-30-layered-route-network-v1.md`.

### Verification

- Plan self-review completed: task coverage, scope exclusions, compatibility constraints, coordinate-unit safeguards, MapLibre readiness safeguards, publisher/runtime handoff, and placeholder scan reviewed.
- No product source files were changed. Implementation is intentionally paused pending user approval.

## 2026-08-30: Controlled Entrance-link investigation and plan

### Phase: Investigation, specification, and planning

- Confirmed the long line visible before outdoor-route selection is caused by inferred Entrance proximity links, primarily the editor adapter's `E-ent-*` post-pass and secondarily the legacy Entrance compiler fallback.
- Distinguished those synthetic Entrance links from authored road-polyline segments and the existing trace endpoint/crossing intersection synchronization. The latter remains required for outdoor branching and rerouting.
- Confirmed the current picker renders the complete campus graph before selection, but its candidate predicate excludes trace-backed `intersection` nodes. The plan therefore makes those existing outer graph nodes selectable without auto-selecting or auto-connecting them.
- Created the proposed spec at `spec/ENTRANCE-CONNECTION-CONTROL.md` and the focused execution plan at `docs/superpowers/plans/2026-08-30-controlled-entrance-route-links.md`.
- No product source files, live graph entities, or map data were changed.

### Verification

- Baseline focused source suite: 5 files, 73 tests passed.
- Live exact Floor Editor route loaded successfully; read-only inspection showed 83 graph nodes, 80 graph edges, no selected outdoor candidate, and the pre-existing Entrance-adjacent graph line.
- Plan placeholder/self-review scan completed.
- `git diff --check` reported only pre-existing trailing whitespace in unrelated `docs/architecture/rendering.md` and `plan/PLAN.md`.

### Next

- Await user approval of the controlled Entrance-link plan. After approval, implement task by task in the current checkout and rerun the focused tests after each task.

## 2026-08-30: Controlled Entrance-link implementation

### Phase: Implementation and verification

- Implemented source-first EntranceAccess authoring: an Entrance is selected first, then an existing outdoor graph node is reused or an exact route-line click creates a stable junction on that trace. New authoring no longer infers an outdoor connection from proximity.
- Preserved outdoor trace intersection synchronization and legacy explicit connector compatibility, while filtering indoor route intersections out of the outdoor picker.
- Verified the real Floor Editor route and picker on localhost; the picker displayed the current campus navigation graph and was cancelled without mutating the document, which remained saved.

### Verification

- Focused suite: 10 files, 134 tests passed.
- Additional compiler access and picker tests passed during the implementation pass.
- `graphify update .` was attempted but could not rebuild its generated output because the managed workspace returned Windows `[WinError 5] Access is denied`.
- Repository-wide TypeScript checks remain unsuitable as a clean gate because they report unrelated pre-existing syntax/configuration/type errors; the focused runtime tests are the applicable evidence for this slice.

### Next

- Manually select an outdoor node or route line in “Connect to Outdoor Route,” confirm it, then author/select an indoor Route and confirm the resulting explicit access edges.

## 2026-08-30: Bleacher 2 entrance connection verification

### Phase: Live verification

- Confirmed the current picker selection for Bleacher 2: outdoor node `N0009`, labelled `main road Node`, on trace `T-1-zp21`.
- Verified the Bleacher 2 building record (`osm-bldg-888026365`) and entrance component (`entrance-1-vt3k`) carry the same building identity; compiled entrance node `N0001` also carries that `buildingId`.
- Verified `N0009` is already part of the outdoor graph through edges `E0017` and `E0018`.
- The picker confirmation currently creates a pending authoring anchor only. The server still has zero `EntranceAccess` records and zero edges touching `N0001` because Bleacher 2 has no indoor Route node yet. No arbitrary indoor geometry was authored.
- Left the tab in Select mode with the temporary route message dismissed.

### Verification

- Live UI confirmed “Outdoor route connected” for the selected main-road target.
- Direct GET of the current campus graph confirmed the identity and topology values above.
- No product source files or persisted graph records were changed by the verification probes.

## 2026-08-30: Entrance route persistence and building-centered picker plan

### Phase: Investigation, specification, and planning

- Traced the current source path from `OutdoorRoutePicker` selection through `FloorEditor` pending state, first indoor Route creation, `entrance.access.assign`, `GraphAdapter.sync`, graph-store/API persistence, and compiled building search.
- Confirmed the current Bleacher 2 state: the Entrance and compiled node carry the Bleacher 2 building ID, but picker confirmation alone leaves zero persisted `EntranceAccess` records because no indoor Route node has been authored yet.
- Confirmed the picker currently resets to full-campus mode on open even though its building-focused bounds helper already exists; the plan changes the behavior to building-first focus with an explicit full-campus escape hatch.
- Created the proposed specification at `spec/ENTRANCE-ROUTE-PERSISTENCE.md` and the reviewable implementation plan at `plan/ENTRANCE-ROUTE-PERSISTENCE.md`.
- No product source files, live graph entities, or map data were changed.

### Verification

- Graphify query completed before source inspection and returned the persistence/editor graph path.
- Existing error ledger read before planning; relevant persistence, MapLibre readiness, browser-probe, and tooling-baseline entries were carried into the plan.
- New spec and plan files exist at the paths above; `git diff --check` reported no whitespace errors for the planning/log files.

## 2026-08-30: T1 persistence contract regression coverage

### Phase: Implementation

- Added `navi-next/src/store/graph-store.test.ts` to prove that graph `save()` remains pending while the `/api/graph` request is unresolved and reports `synced` only after the request completes.
- Changed `navi-next/src/store/graph-store.ts` so `save()` returns `Promise<void>` and awaits `syncToSupabase()` after writing the recoverable local snapshot.

### Verification

- Red: the new test failed because `save()` returned `undefined`.
- Green: `npm test -- --run src/store/graph-store.test.ts` — 1 test passed.

### Next

- Make the Outdoor Route picker open on current-building bounds and provide reliable node/edge hit surfaces with an unsaved preview.

## 2026-08-30: T2 building-centered and actionable outdoor picker

### Phase: Implementation

- Changed `navi-next/src/components/floor-editor/OutdoorRoutePicker.tsx` to open focused on the currently edited building, with `View full campus` remaining an explicit escape hatch.
- Added dedicated transparent hit layers for outdoor route nodes and edges, while retaining the visible graph layers and shared selection handlers.
- Added a green dashed Entrance-to-target preview that is explicitly labelled unsaved and updates from either map selection or candidate-list selection.
- Updated `navi-next/src/components/floor-editor/__tests__/OutdoorRoutePicker.test.tsx` with building-centered camera, hit-layer, preview, and full-campus-toggle coverage.

### Verification

- Red: the new camera and hit-surface assertions failed against the old full-campus default.
- Green: `npm test -- --run src/components/floor-editor/__tests__/OutdoorRoutePicker.test.tsx` — 6 tests passed.

### Next

- Make the first indoor Route point seed from the selected Entrance so outdoor confirmation can be completed without a pixel-perfect map click.

## 2026-08-30: T3 Entrance-seeded indoor Route authoring

### Phase: Implementation

- Updated `navi-next/src/components/floor-editor/useFloorDrawing.ts` to seed one exact first Route vertex from a confirmed `pendingRouteAnchor`; the next click adds the first authored segment point.
- Updated `navi-next/src/components/floor-editor/FloorEditor.tsx` so the instruction describes the seeded Entrance start rather than asking for a pixel-perfect Entrance click.
- Updated `navi-next/src/components/floor-editor/__tests__/use-floor-drawing-readiness.test.tsx` with the seeded-vertex coverage and aligned the existing readiness flow.

### Verification

- Red: the new test observed an empty preview before the first click.
- Green: `npm test -- --run src/components/floor-editor/__tests__/use-floor-drawing-readiness.test.tsx` — 6 tests passed.

## 2026-08-30: T4 truthful graph save completion

### Phase: Implementation

- `navi-next/src/store/graph-store.ts` now returns a Promise from `save()`, awaits the actual `/api/graph` synchronization, and rejects after recording visible sync failure while retaining the local snapshot and online retry path.
- The online retry listener consumes rejected retry Promises so an offline recovery attempt does not create an unhandled browser rejection.
- `navi-next/src/store/graph-store.test.ts` covers deferred successful sync and rejected HTTP sync with local recovery.

### Verification

- Red: the failure test initially resolved despite a 400 API response.
- Green: `npm test -- --run src/store/graph-store.test.ts` — 2 tests passed.

### Next

- Make compiled building search targets prefer the stable authored Entrance node, then run the focused end-to-end suite.

## 2026-08-30: T5 building search targets the Entrance path

### Phase: Implementation

- Updated `navi-next/packages/compiler/src/emitter/artifacts.ts` so V2 building search entries and building-index entries prefer an authored `entrance`/`building_entrance` node and fall back to the first building node only for incomplete legacy graphs.
- Applied the same deterministic preference in `navi-next/packages/compiler/src/artifacts/artifact-generator.ts` for the legacy compiler entry point.
- Added `S10` to `navi-next/packages/compiler/src/__tests__/w15e-search-floorgeometry.test.ts`, asserting both search and building-index destinations use the Entrance instead of an arbitrary waypoint.
- Updated `plan/ENTRANCE-ROUTE-PERSISTENCE.md` to include the actual V2 artifact builder and mark the approved plan executable in the current checkout.

### Verification

- Red: the new search-target test observed an empty building search target (and would otherwise select the waypoint first).
- Green: `npm test -- --run packages/compiler/src/__tests__/w15e-search-floorgeometry.test.ts` — 35 tests passed.

### Next

- Run the complete focused editor/compiler/persistence suite, then verify the real localhost Floor Editor route and persisted graph state.

## 2026-08-30: T6 focused verification and current-building minimap

### Phase: Verification

- Focused suite passed: `npm test -- --run packages/editor/src/graph-adapter.test.ts packages/editor/src/commands/__tests__/route-access-handlers.test.ts src/components/floor-editor/__tests__/entrance-route-authoring.test.ts src/components/floor-editor/__tests__/outdoor-route-picker-model.test.ts src/components/floor-editor/__tests__/OutdoorRoutePicker.test.tsx src/components/floor-editor/__tests__/use-floor-drawing-readiness.test.tsx packages/compiler/src/__tests__/w15f-publish-e2e-closure-gate.test.ts packages/compiler/src/__tests__/w15e-search-floorgeometry.test.ts src/store/graph-store.test.ts` — 9 files and 145 tests passed.
- Targeted `git diff --check` passed for all implementation and test files; Git only reported existing LF-to-CRLF normalization warnings.
- The real localhost route `http://localhost:3000/studio/map-map-1-k6bv/edit/building/osm-bldg-888026365/floor/0` reopened in the current-building-focused editor. After reload, the Route Nodes list still showed `Route Nodes (1)`, and selecting the Entrance still exposed the saved indoor/outdoor access assignment.
- The live graph API still reports 86 nodes and 81 edges, including `E-access-entrance-1-vt3k-outdoor` (`N0165` → `N0156`) and `E-access-entrance-1-vt3k-indoor` (`N0156` → `N-route-route-node-1-srpf`). The Entrance and Route waypoint both retain `buildingId: osm-bldg-888026365` and `floor: 0`; the outdoor target remains the `main road Node` intersection.
- `graphify update .` was attempted after the source changes but was blocked by `[WinError 5] Access is denied`; this is recorded in `errors/ERRORS.md` and no generated graph files were edited.

### Result

- The approved implementation scope is verified in the current checkout. No worktree was created, and unrelated existing checkout changes were preserved.

## 2026-08-30: T7 truthful saved status for cached maps

### Phase: Implementation and verification

- Fixed `navi-next/src/store/graph-store.ts` so a map loaded from localStorage restores `synced` only when a map-scoped successful-sync marker matches the exact cached snapshot fingerprint. Unmarked or changed local snapshots remain `idle`/unsaved, while HTTP and offline failures still reject and remain visible.
- Added the save → reload and snapshot-mismatch regression coverage in `navi-next/src/store/graph-store.test.ts`.
- Focused suite passed again: 9 test files and 146 tests passed.
- The live route remains `http://localhost:3000/studio/map-map-1-k6bv/edit/building/osm-bldg-888026365/floor/0`; the current building remains the active context, `Route Nodes (1)` remains visible, and selecting an Entrance still shows both the indoor Route point and outdoor `main road Node` junction assignment.
- The live route’s normal Save button was not available during the final browser probe because the fixture reopened in floor-plan setup state; no floor geometry was changed to force that state. The store regression is covered by the focused test, and the API graph remains the source-of-truth persistence check.
- `graphify update .` was retried after T7 and again failed with Windows `[WinError 5] Access is denied`; this is recorded in `errors/ERRORS.md`.

### Result

- T7 is complete. The approved entrance-to-outdoor route persistence implementation and the reload-status correction are verified without creating a worktree or modifying unrelated checkout changes.

## 2026-08-30: Map Editor regression audit — Road, Area, Building, Import

### Phase: Investigation and verification

- Added the audit scope and execution plan in `spec/MAP-EDITOR-TOOL-AUDIT.md` and `plan/MAP-EDITOR-TOOL-AUDIT.md`; no product source was changed.
- Reproduced the live Road failure at `http://localhost:3000/studio/map-map-1-k6bv/edit`: the first Road click throws `existingPoints is not iterable` from `packages/editor/src/geometry/snapping.ts:68`, with no road created.
- Traced the cause to `src/components/studio/InteractionController.tsx`: it calls the exported screen-space `snapPoint` with geographic Road arguments, while the correct geographic helper is `packages/editor/src/commands/road-snap.ts`.
- Area and Building authoring both showed visible previews and distinct geometry when tested with viewport coordinates. Temporary records were saved/reloaded to verify persistence, then removed via Explorer delete actions. OSM Import showed its green boundary preview; its two-point probe was discarded without a network request.
- After cleanup and reload, the live editor reported no runtime error, `All changes saved`, and 36 items. The server snapshot remained at 30 buildings, 6 roads, 0 areas, 86 nodes, and 81 edges.

### Verification

- Focused editor tests: `npm test -- --run packages/editor/src/commands/__tests__/road-snap.test.ts src/components/studio/__tests__/InteractionController.test.tsx src/components/studio/__tests__/useDrawingSession.test.ts src/components/studio/__tests__/ConfirmBar.test.tsx src/store/graph-store.test.ts` — 5 files, 48 tests passed. The first sandbox attempt hit `spawn EPERM`; the elevated retry passed.
- Focused UI/tool tests: `npm test -- --run packages/editor/src/tools/__tests__/tool-registry.test.ts packages/editor/src/panels/__tests__/ToolDock.test.tsx packages/editor/src/panels/properties/road-props.test.tsx packages/editor/src/panels/properties/building-props.test.tsx` — 4 files, 36 tests passed.
- Real localhost route was reloaded after all probes; no test records remain.

### Result

- Baseline, Area draft/save/reload, Building save/reload, and clean-up paths are usable under controlled viewport input.
- Road authoring is blocked by a confirmed runtime snap-helper contract mismatch and should be fixed before testing road persistence.
- Import capture renders, but its authoring state lacks explicit status and cancel/confirm controls; full network-backed import was intentionally not submitted during this audit.
- Secondary integration risk: the campus dock exposes `area`, `building`, `route`, `import-osm`, and `set-boundary`, while the shared tool registry has no definitions for those IDs. Activation currently warns but still proceeds.

### Next

- Implement a narrowly scoped Road snap-call correction plus a regression test, then rerun live Road save/reload. Separately decide whether Import should receive a visible draft-state fix before exercising the network-backed import path.

## 2026-08-30: Map Editor tool confirmation and registry fix

### Phase: Implementation and verification

- Added shared registry definitions for the campus dock leaf tools: `area`, `building`, `route`, `import-osm`, and `set-boundary`. Added a dock-to-registry cross-check so the warning-only activation gap cannot return silently.
- Exported the geographic Road snap helper as `snapRoadPoint` and updated `InteractionController` to use its `(LatLng, Road[])` contract. The canvas snap helper remains available under its existing API.
- Moved Import from OSM behind the shared drawing/confirmation flow. Its boundary stays visible with a point count and Confirm/Cancel controls; Save performs the request, dispatches imported buildings, awaits `workflow.save('manual')`, and retains the draft on failure.
- Put Set Campus Boundary behind the same explicit confirmation path and separated it from OSM building import. Select behavior was not changed.
- Added the implementation spec/plan plus regression coverage for registry IDs, the public Road snap contract, drawing-session pending types, confirmation-bar controls, OSM draft handling, and OSM save dispatch.

### Verification

- Focused suite passed: 11 test files and 86 tests passed, including registry, ToolDock, Road snap, drawing session, confirmation UI, OSM hook/overlay, interaction, preview, drawing, and StudioWorkspace coverage.
- New OSM/ConfirmOverlay tests lint cleanly. `git diff --check` passed for the touched implementation/test paths; only existing line-ending normalization warnings were reported.
- The broad ESLint run still reports the pre-existing shared-editor `react-hooks/refs`/explicit-`any` baseline; no unrelated lint refactor was bundled into this fix.
- Real localhost verification at `http://localhost:3000/studio/map-map-1-k6bv/edit`: Road Confirm → Save → reload persisted a temporary road, then cleanup restored the baseline. Area and Building showed Confirm/Cancel and canceled without mutation. OSM showed Confirm before any mutation; a controlled real import persisted two buildings across reload, then both temporary records were deleted. Set Campus Boundary showed Confirm/Cancel and canceled without mutation.
- Final live/API state: `All changes saved`, no runtime error overlay, 30 buildings, 6 traces, 0 areas, 36 items, and no temporary test names.
- Repository-wide `npx tsc --noEmit --pretty false` remains blocked by the pre-existing unrelated syntax error at `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`. `graphify update .` remains blocked by managed-checkout `[WinError 5] Access is denied`; both conditions are recorded in `errors/ERRORS.md`.

### Result

- The campus Map Editor now has registered authoring tools and explicit confirmation/persistence for OSM and boundary flows. The real Road runtime crash is corrected, and the clean baseline has been restored.

### Next

- Manually exercise the updated Import from OSM and Set Campus Boundary flows in the clean localhost editor, then continue with any remaining tool-specific UX issues.

## 2026-08-30: Route graph intersection connectivity investigation

### Phase: Read-only investigation and verification

- Loaded `http://localhost:3000/routes` and inspected the selected `map-map-1-k6bv` campus through the live UI and its public API.
- Confirmed the route tester is using `graph_snapshots` through `/api/public-campus`, not a `published_maps` artifact; the live payload contains 92 nodes, 86 edges, and 11 connected components.
- Found four zero-distance self-loop edges. Their nodes carry metadata claiming membership in two traces, but the self-loop does not connect those traces, explaining why A* cannot traverse across those intersections.
- Traced the cause to `Graph.syncTraceIntersections`: the newly compiled endpoint is already in the node set, is moved onto the target segment, and is then returned by the nearest-intersection lookup. The resolver selects the endpoint itself and adds `endpoint → endpoint` instead of splitting/connecting to the existing trace.
- Identified a second topology gap in the X-crossing phase: it splits the existing segment but attaches only the closer new-trace node, so the crossing is not a true four-way junction.
- Identified a diagnostics gap: `computeGraphHealth` visits every component before calculating `disconnected`, so it reports `0 unreachable nodes` alongside `11 components`.
- No product source or stored campus data was changed during this investigation.

### Verification

- Focused engine/editor suite: 5 test files, 65 tests passed.
- Live Diagnostics panel: `0 unreachable nodes`, `92/92 connected · 11 components`, `2 isolated nodes`; this confirms the UI’s component-count bug while independently exposing the bad topology.
- Direct API topology check: `source=graph_snapshots`, component sizes `61, 8, 8, 3, 2, 2, 2, 2, 2, 1, 1`, four self-loops, and two isolated nodes.

### Result

- The routing algorithm is not the primary cause. It correctly returns no path when the stored graph has no connecting edge; the graph compiler/intersection resolver is producing a disconnected topology, and Route Testing currently consumes that snapshot source.

### Next

- Execute the remediation plan in `plan/PLAN.md`: add regression fixtures, repair endpoint and X-crossing topology, normalize shared-node metadata, align the published source, improve diagnostics, then republish and retest live.

## 2026-08-30: Map Editor Area/Building undo cleanup

### Phase: Implementation and verification

- Traced confirmed Area/Building creation through `ConfirmOverlay`, `CommandDispatcher`, `HistoryStack`, `EditorBridge`, the legacy graph adapter, and `EntityRenderer`. History inverse commands intentionally skip entity hooks, so renderers and the legacy graph needed an explicit `document.changed` refresh.
- Added document-change synchronization for the legacy render graph, entity-renderer refreshes for undo/redo, keyboard undo fallback after draft points are exhausted, reactive Undo/Redo dock state, and stale active-building selection cleanup after undo.
- Added regression coverage for confirmed Area/Building undo cleanup, keyboard history undo, entity-renderer document-change refresh, graph cleanup, and selected-building cleanup.

### Verification

- Serialized focused suite passed: 12 test files and 92 tests passed with `--no-file-parallelism`.
- `git diff --check` passed for the touched implementation and test paths; only existing line-ending normalization warnings were reported.
- Real localhost verification at `http://localhost:3000/studio/map-map-1-k6bv/edit`: Area undo worked from the toolbar and keyboard; Building undo removed its rendered geometry and explorer item, redo restored it, and a second undo removed it again. Final reload reported 36 items, no temporary probe names, no `Entity not found`, no `existingPoints is not iterable`, and `All changes saved`.
- `graphify update .` remains blocked by managed-checkout Windows `[WinError 5] Access is denied`; this was recorded in `errors/ERRORS.md`.

### Result

- Confirmed Area and Building geometry now follows the same undo/redo cleanup behavior as OSM: the document, legacy render graph, visible geometry, explorer, selection state, and history controls stay aligned.

## 2026-08-30: Map Editor draft undo tracer correction

### Phase: Implementation and verification

- Reproduced the user-visible defect in the live Area draft: draft Undo changed the label from 2 points to 1 while the purple tracer geometry and handles remained unchanged.
- Added `TracerDraftSync.test.tsx`, which failed first with stale five-feature Area and Building source data, then passed after updating both dedicated tracer synchronization effects to depend on the current draft-point array.
- Verified the same behavior live for Area and Building: 3 points → draft Undo → 2 points and matching visible two-point geometry. Cancel cleared the temporary draft; no map entity was saved.

### Verification

- Serialized focused suite passed: 13 test files and 94 tests passed with `--no-file-parallelism`.
- `git diff --check` passed for the tracer implementation/test paths; only an existing line-ending normalization warning was reported.
- Final live editor state: 36 items, no draft, `All changes saved`, and no runtime error.
- `graphify update .` was retried and remains blocked by managed-checkout Windows `[WinError 5] Access is denied`; recorded in `errors/ERRORS.md`.

### Result

- Area and Building draft Undo now updates both the authoring state and the visible MapLibre tracer geometry, matching the point state shown in the confirmation bar.

## 2026-08-30: Navigation-only route visibility

### Phase: Implementation and verification

- Added an additive `Road.displayMode` field with `visible` and `navigation-only` values. Missing legacy values normalize to visible.
- Added the display choice to route confirmation and the Road properties inspector. Added a Studio-only `Show hidden routes` diagnostic toggle; revealed routes use a faint dashed line and remain selectable.
- Carried the field through the canonical GeoJSON renderer, legacy graph adapter, graph-to-document reload path, and public-map trace projection. Navigation compilation remains unchanged, so hidden routes stay usable for routing.
- Added focused tests for creation, editing, persistence, rendering filters, diagnostic visibility, and public-map exclusion.

### Verification

- Focused feature suite passed: 9 test files and 102 tests passed.
- Adjacent regression suite passed: 9 test files and 143 tests passed, including road snapping, interaction controller, renderer integration, confirmation bar, preview, and navigation session coverage.
- `git diff --check` passed for all touched implementation and test paths; only existing line-ending normalization warnings were reported.
- Real localhost verification at `http://localhost:3000/studio/map-map-1-k6bv/edit`: the editor loaded with `All changes saved`; `Show hidden routes` was visible, toggled on and back off, and the page remained loaded. Selecting the existing `main road` exposed `Map display`, `Visible route`, and `Navigation-only route`. Browser console warnings/errors: 0. No geometry was created or changed.
- Repository-wide `npx tsc --noEmit --pretty false` remains blocked by the pre-existing unrelated syntax error at `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`. Scoped ESLint still reports the pre-existing shared-editor explicit-`any`/React-ref baseline. `graphify update .` remains blocked by managed-checkout `[WinError 5] Access is denied`; all are recorded in `errors/ERRORS.md`.

### Result

- Navigation-only routes can now be authored and edited without drawing in the normal Studio or public map, while remaining in the persisted navigation graph and available for Studio inspection when explicitly revealed. Existing routes and unrelated editor tools remain unchanged.

## 2026-08-30: Route vertex editing — style-reload overlay repair

### Phase: Investigation, implementation, and verification

- Traced the existing `Edit Road` event bridge into `useVertexEditor` and reproduced the missing-controls failure with a focused MapLibre test double.
- Confirmed the root cause: the custom vertex source/layers were recreated after `style.load`, but the active Road's vertices and edit line were not repainted into the replacement source.
- Updated `useVertexEditor` to make source/layer creation idempotent, tolerate style-transition timing, keep controls above authored geometry, and repaint the active Road after style reloads.
- Added regression coverage for initial overlay population, style reload recovery, and dragged-vertex persistence through `entity.update` plus the manual save workflow.

### Verification

- Focused route suite passed: 5 test files and 72 tests passed, including the new vertex-editor tests and adjacent renderer, GraphAdapter, command, and Road-properties tests.
- The focused vertex-editor/Road-properties run also passed independently: 2 test files and 8 tests.
- Real localhost verification at `http://localhost:3000/studio/map-map-1-k6bv/edit`: selected `main road` (`T-1-zp21`), entered **Edit Road**, observed visible orange vertices/edit line, switched to Satellite and confirmed the controls survived the style reload, returned to OpenStreetMap, and exited with Escape without changing geometry. Re-entering Edit Road on OpenStreetMap restored the controls.
- `graphify update .` remains blocked by managed-checkout Windows `[WinError 5] Access is denied`; recorded in `errors/ERRORS.md`.

### Result

- Existing authored campus routes can now be selected and opened in an interactive vertex editor. Vertex changes use the canonical Road polyline update/save path, while route snapping, route creation, and unrelated editor tools remain outside this fix.

## 2026-08-30: Route intersection topology repair

### Phase: Implementation and verification

- Preserved the existing route source/public-store, navigation-only trace compiler, and explicit entrance-access changes.
- Updated `Graph.syncTraceIntersections` so a newly compiled endpoint cannot resolve to itself; when no prior junction exists, the endpoint becomes the shared junction and the target trace edge is split around it.
- Updated interior X-crossing handling to split both participating trace edges, producing four branches at the crossing instead of attaching only one side of the new trace.
- Added isolated endpoint and X-crossing regression tests.

### Verification

- Red-to-green regression evidence: the endpoint fixture first failed on a self-loop; after the fix it passed. The X fixture first failed with a 3-edge junction; after the fix it passed with 4 incident branches.
- Focused graph suite passed: 6 test files and 67 tests.
- `git diff --check` passed for the edited graph/test paths; Git reported only the existing LF/CRLF normalization warning.
- Live route tester loaded successfully after the change, but the published `map-map-1-k6bv` snapshot is still the pre-repair serialized data: 92 nodes, 86 edges, and 4 self-loops. It must be recompiled/re-published before the live campus reflects the code fix.

## 2026-08-31: Validation issue explainability plan

### Phase: Investigation and planning

- Traced the NAVI Studio Validate path from BuildStatus and WorkflowService to the editor ValidationEngine and ProblemsPanel.
- Confirmed that ValidationIssue already carries severity, message, target IDs, optional building/floor/layer scope, and optional location, but the current Studio workspace only renders Problems beside an existing selection and the panel click path does not resolve derived route-node/route-edge targets safely.
- Created the feature specification at `spec/VALIDATION-ISSUE-EXPLAINABILITY.md` and the implementation plan at `plan/VALIDATION-ISSUE-EXPLAINABILITY.md`.
- The proposed implementation is intentionally not started: it will add readable issue presentation, an always-available stale-aware Problems report, target-aware map focus, and a temporary overlay while preserving publish policy, save behavior, auto-fixes, route geometry, and the separate diagnostics engine.

### Verification

- Graphify query completed before source inspection as required by the repository instructions.
- Plan self-review found no placeholder markers; `git diff --check` passed for the planning artifacts and error ledger, with the existing line-ending normalization warning only.
- No product source, map geometry, or persisted campus data was changed.

### Next

- Await user approval before implementing the presenter, issue report, focus resolver, overlay, and workspace wiring described in the plan.

## 2026-08-31: Validation issue explainability — Task 1 presenter

### Phase: Implementation

- Added `navi-next/packages/editor/src/validation/presentation.ts` with deterministic administrator-facing copy for known route/geometry rules and a readable fallback for custom rule IDs.
- Exported `presentValidationIssue` and its result type from the editor validation barrel.
- Added presenter tests covering disconnected routes, entrance access, polygon closure, custom rules, targetless issues, and input immutability.

### Verification

- TDD RED confirmed the new test could not resolve the absent presenter module.
- TDD GREEN: `npm test -- --run packages/editor/src/validation/presentation.test.ts` passed with 1 test file and 5 tests.

### Next

- Implement the stale-aware, actionable Problems report in Task 2.

## 2026-08-31: Validation issue explainability — Tasks 2–3

### Phase: Implementation

- Expanded `navi-next/packages/editor/src/panels/ProblemsPanel.tsx` into a stale-aware report with not-validated guidance, severity totals, snapshot metadata, readable rule copy, scope/target details, typed map-focus callbacks, and guarded Show on map actions while retaining AutoFix behavior.
- Added `navi-next/src/components/studio/validation-focus.ts` to resolve authored local geometry and derived route-node/route-edge geometry into world coordinates without inventing locations for missing/global targets.
- Added `navi-next/src/components/studio/ValidationIssueOverlay.tsx`, temporary focus state/types, dedicated MapLibre source/layers, style-load repaint handling, and mounted the overlay in `StudioCanvas`.

### Verification

- ProblemsPanel focused suite passed: 1 test file and 19 tests.
- Resolver + overlay focused suite passed: 2 test files and 8 tests.
- Graphify refresh was attempted after source changes and again failed with managed-checkout `[WinError 5] Access is denied`; recorded in `errors/ERRORS.md`.

### Next

- Wire the workspace Validate/header flow and map-aware focus callback in Task 4.

## 2026-08-31: Validation issue explainability — Tasks 4–6 and live verification

### Phase: Implementation and verification

- Wired the Studio workspace to keep the Problems report available without an entity selection, expose a header-level `View issues` action, and open the report when a validation run produces errors or warnings.
- Added guarded `Show on map` focus for authored geometry and derived route-node/route-edge targets, including GraphAdapter-compatible `N-route-*`/`E-route-*` IDs; focus updates selection/compatibility state and a temporary MapLibre overlay without dispatching or persisting document changes.
- Added validation snapshot campus identity for both full and incremental engine runs and corrected stale detection to compare the snapshot with `CampusDocument.version` rather than the independent document-store commit counter.

### Verification

- Fresh focused Vitest run passed: 8 files and 72 tests passed.
- Fresh live localhost verification at `http://localhost:3000/studio/map-map-1-k6bv/edit`: clean reload, Validate, report visible with 7 errors and 1 warning, no stale marker, readable rule/scope/target/guidance text, and 7 available `Show on map` actions. Selecting a route issue focused `Route Node route-node-1-2kpf` in the inspector and map; browser console returned no errors or warnings.
- Fresh `tsc --noEmit` remains blocked by the unrelated existing syntax error at `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255:3` (`TS1005: '}' expected`).
- Targeted ESLint remains non-zero on known legacy `any`, ref-access, hook-effect, and unused-symbol findings; the new presenter, focus resolver, and overlay did not add a reported finding.
- `graphify update .` was retried and remains blocked by managed-checkout Windows `[WinError 5] Access is denied`; generated graph files were not edited.

### Result

- Studio validation now explains what is wrong, where it is scoped, how to fix it, and—when a concrete target can be resolved—lets the author focus it on the map without changing the campus document.

### Next

- No further work is included in this slice. Repairing the unrelated runtime syntax error, baseline lint debt, and Graphify checkout permissions is separate follow-up work.

## 2026-08-31: Validation issue report dismissal

### Phase: Implementation and verification

- Made the existing `View issues` header action toggle the report instead of only opening it.
- Added an explicit empty-map callback from `InteractionController` through `StudioCanvas` to `StudioWorkspace`, so a select click with no authored target dismisses the report.
- Added selection-change dismissal for ordinary component selections while preserving the report during `Show on map`, including the active-building transition produced by the selection bridge.

### Verification

- TDD RED: the new workspace/controller regressions failed as expected (4 failures before implementation); the route-focus preservation regression then reproduced the live bridge transition (1 failure before the guard adjustment).
- Focused regression run passed: 9 files and 83 tests passed.
- Live localhost verification at `http://localhost:3000/studio/map-map-1-k6bv/edit`: header close/reopen passed; confirmed empty map space dismissed the report; selecting `Bleacher 2` dismissed it; reopening and selecting a route issue with `Show on map` kept the report visible, focused `Route Node`, and showed no stale marker. No browser errors occurred; one known MapLibre style-diff warning appeared during the map interaction.
- No dispatcher, save, publish, or document mutation was introduced by the dismissal behavior.

### Result

- The issue report no longer permanently occupies the workspace: authors can close it from the same header control, by clicking empty map space, or by selecting another component, while issue focus remains actionable.
- The required post-change Graphify refresh remains blocked by Windows `[WinError 5] Access is denied`; no generated graph files were edited. Scoped diff checking reports only existing Markdown/line-ending formatting warnings, with no trailing-whitespace matches in the new follow-up tests.

## 2026-08-31: NAVI Capture Phase 0 impact audit

### Phase: Inspection and planning only

- Audited the active Next.js route/layout/auth boundaries, Studio bridge, Zustand stores, MapLibre wrappers, canonical `CampusDocument` entities, editor command handlers, compiler pipeline, publish/runtime APIs, Supabase migrations/RLS, and offline/service-worker surface.
- Confirmed the safe boundary: a `/capture` sibling route and capture-only data model can coexist in the same Vercel deployment; explicit review/import may feed the existing Studio `CampusDocument`, while `PublishedCampus`, `published_maps`, compiler output, and NAVI Web remain downstream and unchanged.
- Confirmed the MVP should keep raw GPS samples and candidate nodes/edges in a namespaced Capture domain, use IndexedDB for local-first persistence, use the existing `NavigationMap`/MapLibre dependency with capture-only layers, and import through existing editor commands rather than writing `graph_snapshots` or `published_maps` directly.

### Verification

- Graphify queries were completed before repository source inspection as required. A Graphify refresh was not needed for this inspection-only audit.
- Focused baseline: core/compiler group 248 passed and 3 existing compiler integration tests failed; editor/Studio group 105 passed; active app map/public/API group 26 passed; runtime package group 97 passed.
- Root baseline: `npm test` exited non-zero with 326 passed files, 4,004 passed tests, 8 skipped, 11 failed files, and 18 failed tests. Runtime package baseline exited non-zero because the existing `data-identity-comparison.test.ts:255:3` file has an unmatched brace; 28 other files and 326 tests passed.
- No Capture implementation, schema migration, service-worker registration, compiler change, publish change, or NAVI Web change was made. The existing dirty worktree was preserved.

### Next

- Await architecture approval before implementing the Capture MVP. The first implementation gate is a capture-only route/store/IndexedDB slice with no Studio or published-data writes.

## 2026-08-31: NAVI Capture Phase 1 — T2/T3 local domain and persistence

### Phase: Implementation

- Added the Capture-only schema, deterministic Douglas–Peucker candidate geometry, coordinate/bounds helpers, and strict `.navicapture.json` envelope parser/serializer.
- Added the native IndexedDB repository boundary using `navi-capture-local-v1` / `sessions`, clone-on-write/read semantics, and a test-only in-memory repository.
- Added an isolated Zustand Capture store for session creation, raw-sample append, status transitions, candidate derivation, marker persistence, import, delete, and hydrate-after-refresh behavior.

### Verification

- TDD RED was observed for the missing T2/T3 modules; the first npm wrapper attempt hit a runner-only `spawn EPERM`, then the direct Vitest binary ran the expected missing-module RED suites.
- T2 focused run passed: 2 files and 4 tests.
- T3 focused run passed: 2 files and 4 tests.
- No Studio, compiler, publish, public runtime, or forbidden store/API source was touched by these tasks.

### Next

- Implement the injectable foreground GPS recorder, then wire the mobile Capture screens and namespaced MapLibre layers.

## 2026-08-31: NAVI Capture Phase 1 — T4/T5 recorder and UI

### Phase: Implementation

- Added the injectable foreground `watchPosition` recorder with high-accuracy options, complete coordinate-field mapping, sequence preservation, error forwarding, pause/resume, finish, and cleanup lifecycle.
- Added Capture Home, Recording Map, Capture Review, marker composer, and shell coordination. The UI is mobile-first, uses existing NAVI design tokens, supports local file review/export handoff, and keeps primary controls at least 44px high.
- Added Capture-owned MapLibre GeoJSON sources/layers for raw breadcrumb, candidate route, current position, and markers; all IDs are prefixed with `capture-` and cleaned up by the Capture map component.

### Verification

- TDD RED was observed for the missing recorder and shell modules.
- Recorder focused run passed: 1 file and 3 tests.
- Shell focused run passed: 1 file and 2 tests.
- Repository TypeScript checking still stops at the pre-existing runtime syntax error `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255:3`; no Capture-specific diagnostics were emitted before that parser stop.

### Next

- Add the protected `/capture` route and navigation entry without mounting any Studio/editor provider.

## 2026-08-31: NAVI Capture Phase 1 — T6 route and auth boundary

### Phase: Implementation

- Added `src/app/(admin)/capture/page.tsx` as the protected route entry point for the Capture shell.
- Added `/capture` to the existing middleware admin-prefix and matcher lists.
- Added `capture` to the existing admin screen union and a navigation-only `NAVI Capture` sidebar entry.

### Verification

- TDD RED was observed for the missing route page.
- Route focused run passed: 1 file and 1 test.
- No second auth context, Studio provider, editor store, compiler API, publish API, or runtime integration was added.

### Next

- Run the complete Capture suite and the exact Phase 0 baseline suites, then verify mobile behavior and forbidden-reference isolation.

## 2026-08-31: NAVI V1 local campus cache architecture review

### Scope

- Reviewed the uploaded local-first campus cache implementation plan and implementation context.
- Confirmed the active public path: `/map/explore` and `/map/navigate` use `usePublicStore.fetchCampusData`, which loads `/api/public-campus` and normalizes the response into `CampusBundle`.
- Confirmed an existing native IndexedDB repository pattern in `src/features/capture/db.ts` that can guide a separate public-campus cache.
- No application source, API schema, compiler, publish, Studio, or runtime files were changed.

### Verification

- Focused public loading and existing IndexedDB-pattern tests: 2 files / 15 tests passed.
- Review findings: the caching concept is viable without a broad architecture redesign, but implementation should first define revision metadata, hydrate both `campus` and legacy `campusData`, separate initial loading from background refresh, reject empty/mismatched responses, and guard against stale campus-switch responses.

### Next

- Await user approval of the amended cache contract and scope before any implementation begins.

## 2026-08-31: NAVI Capture Phase 1 — Local Capture MVP verification

### Phase: Verification complete

- Completed the protected `/capture` route, isolated Capture domain/store, IndexedDB persistence, foreground GPS recorder, raw-sample preservation, separately derived candidate route geometry, manual POI/panorama/entrance/hazard markers, Capture Home/Recording Map/Review screens, and `.navicapture.json` export.
- Confirmed the implementation uses Capture-only persistence/layer namespaces and does not reference the forbidden Studio stores, graph/publish APIs, published-campus tables/types, compiler, `@navi/runtime`, or NAVI Web runtime.

### Verification

- Root before/after: `326` passing files / `11` failing files, `4,004` passing tests / `18` failing / `8` skipped → `334` passing files / `11` failing files, `4,019` passing tests / `18` failing / `8` skipped. The change adds `+8` passing files and `+15` passing tests with no increase in known failures.
- Capture focused suite: `8` files / `15` tests passed.
- Editor/Studio focused regression subset: `3` files / `26` tests passed. Active map/public regression subset: `4` files / `20` tests passed.
- NAVI Web/runtime focused regression: `9` files / `97` tests passed. Full runtime package: `28` files / `326` tests passed, with the same pre-existing parse failure in `src/__tests__/data-identity-comparison.test.ts:255:3`.
- Targeted ESLint passed with zero diagnostics; Capture production typecheck passed. The production Next build remains blocked by the existing runtime `fs` browser-bundle path and restricted Google Fonts fetch, neither of which traces through Capture.
- Mobile browser smoke at `390×844` passed: `/capture` rendered full-width with the sidebar hidden, New Capture opened the Recording Map, Pause/Resume/Finish worked, Review mounted cleanly, refresh restored saved local sessions, and the fresh-tab console had no errors/warnings. Browser geolocation permission was denied in the harness, so GPS delivery is covered by the mocked recorder tests.
- Required Graphify refresh was attempted after modification and remains blocked by Windows `[WinError 5] Access is denied`; generated graph output was not manually changed.

### Scope confirmation

- Studio editor behavior, compiler behavior, publish integration, `/api/graph`, `/api/publish`, NAVI Web runtime, Supabase sync, Studio Reviewer, draft import, and service workers were not modified or implemented for this phase. The checkout still contains unrelated pre-existing dirty changes in several of those areas, which were preserved.

### Next

- Phase 2 may begin after reviewing this MVP evidence and the pre-existing build/test baseline; keep sync, Studio Reviewer/import, compiler, publish, and NAVI Web work out of this Phase 1 change set.

## 2026-08-31: NAVI V1 local campus cache — C0/C1 implementation

### Phase: Contract and cache repository complete

- The user-provided amended plan approved implementation. Recorded the public-runtime cache contract and execution plan in `navi-next/docs/superpowers/specs/2026-08-31-navi-v1-local-campus-cache.md` and `navi-next/docs/superpowers/plans/2026-08-31-navi-v1-local-campus-cache.md`.
- Added the isolated public-campus cache boundary in `navi-next/src/features/public-campus/cache.ts` with a versioned envelope, campus/source/payload validation, IndexedDB repository, and deterministic memory repository. Capture persistence was not changed.

### Verification

- Test-first RED gate: the new cache test failed because the module did not yet exist.
- GREEN gate: `node_modules\\.bin\\vitest.cmd run src/features/public-campus/__tests__/cache.test.ts` passed `1` file / `2` tests.

### Next

- C2: normalize public API source/revision metadata and make network/cache results share the canonical hydration input.

## 2026-08-31: NAVI V1 local campus cache — C2 transport normalization

### Phase: Transport contract complete

- Added `navi-next/src/features/public-campus/types.ts` with the internal `PublicCampusResult` contract, source normalization, revision normalization, and structural payload validation.
- Updated the public-campus response to expose `revision` separately from the bundle and updated the store parser to reject missing/mismatched campus IDs and unknown/empty sources.

### Verification

- Test-first RED gate: the transport test failed before the new module existed.
- GREEN gate: `node_modules\\.bin\\vitest.cmd run src/features/public-campus/__tests__/types.test.ts src/features/public-campus/__tests__/cache.test.ts src/store/__tests__/public-store.test.ts` passed `3` files / `17` tests.

### Next

- C3: integrate cache-first hydration, separate refresh state, authoritative network replacement, and stale-request protection.

## 2026-08-31: NAVI V1 local campus cache — C3/C4 implementation and verification

### Phase: Implementation complete at the public-runtime loading boundary

- Added cache-first public loading with a canonical hydration path for `campus` and legacy `campusData`.
- Added `campusOrigin`, `campusRevision`, `isRefreshing`, and `refreshError` so cache readiness is distinct from authoritative server refresh.
- Added request sequence/in-flight protection, cache read/write best-effort handling, published-only persistence, graph-snapshot non-persistence, and preservation of a usable cache after invalid/empty/failed refreshes.
- Added the public API `revision` field while keeping revision metadata outside `CampusBundle`.

### Verification

- Final focused regression: `node_modules\\.bin\\vitest.cmd run src/features/public-campus/__tests__/cache.test.ts src/features/public-campus/__tests__/types.test.ts src/store/__tests__/public-store.test.ts src/components/map/PublicMap.test.ts src/components/pages/__tests__/NavigationInspector.test.tsx` passed `5` files / `41` tests.
- Final scoped lint: `node_modules\\.bin\\eslint.cmd` over all touched cache, store, API, and test files passed with `0` errors and `0` warnings.
- Scoped whitespace check passed.
- Full repository typecheck remains blocked only by the documented unrelated syntax error at `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`.
- Required `graphify update .` was attempted after source changes and remains blocked by documented Windows `[WinError 5] Access is denied`; generated graph output was not edited.

### Scope confirmation

- No campus selection, labels, OSM, service workers, PWA, Studio, compiler, routing, or capture persistence changes were made for this cache slice. Existing unrelated dirty changes in the checkout were preserved.

## 2026-08-31: NAVI V1 local campus cache — browser verification

### Phase: Browser smoke partially verified; cache acceptance data-constrained

- Chrome loaded `http://localhost:3000/map/explore` and rendered the active campus map without console errors or warnings.
- Selecting the visible `Hm Building` opened its building detail sheet. The floor selector changed active state to `1F` and then `3F`.
- `http://localhost:3000/map/navigate?from=N1001&to=N1002` rendered a `58 m` route with `2 steps`, confirming the live navigation path.
- The live API check for `map-map-1-k6bv` returned HTTP 200 with `source: graph_snapshots`, `105` nodes, `30` buildings, no revision, and no search index. `asu-ibajay` returned `source: empty`.
- Searching the visible `Library` label returned no results because the live graph-snapshot response contains no search index; this is a dataset limitation, not evidence of a cache regression.
- The browser-control evaluation context did not expose IndexedDB, so direct record inspection and the cache-first reload/forced-refresh-failure scenario could not be verified honestly. No data was seeded or modified to manufacture that scenario.

### Recommendation

- Keep the cache architecture unchanged. Run the final cache acceptance scenario in a normal DevTools-capable browser against a campus that resolves to a published runtime package; then verify IndexedDB, cache-first reload, refresh failure preservation, search, routing, building selection, and floor switching.

## 2026-08-31: Road `T-1-5t0p` save/persistence diagnosis

### Phase: Investigation complete; no product source changes

- Traced the live Road properties path. Name, color, width, surface, type, and display-mode edits dispatch `entity.update`; the panel intentionally has no road-specific Save button.
- Confirmed the editor starts the shared autosave service. A committed revision becomes dirty, then autosave waits for the configured 5-second debounce before calling the persistence adapter.
- Confirmed the Studio persistence adapter synchronizes the editor document into the graph, writes the map snapshot, and awaits the graph API sync.

### Verification

- Live map editor: selected road ID `T-1-5t0p`, initially named `Untitled 2`; the UI exposed no exact `Save` button.
- Road properties test: changed the name to a temporary value; status changed to `Unsaved changes`, remained dirty after 1.2 seconds, became `All changes saved` after the debounce, and the temporary name survived a full reload.
- Explorer row rename test: temporary rename also became `Unsaved changes`, became `All changes saved`, and survived a full reload.
- Read-only graph API check returned HTTP 200 and road `T-1-5t0p` with the restored final name `Untitled 2`.
- Focused tests: 4 files / 29 tests passed (`road-props`, `workflow-service`, `autosave-service`, and `graph-store`). Browser console showed no errors during the successful round trips.
- Restored the road to `Untitled 2` and verified that restoration survived reload; no product source was edited.

### Finding

- The save path works when the author waits for autosave. The likely reason an immediate reload loses an edit is the silent 5-second autosave window: before it completes, the editor correctly shows `Unsaved changes`, but there is no road-level Save action to flush the change manually.

### Next

- If approved, make the save affordance/flush behavior explicit for property edits and add a dedicated road save/reload regression. Do not implement that fix as part of this diagnosis.

## 2026-08-31: Road `T-1-lehc` endpoint visibility and persistence

### Phase: Investigation, implementation, and live verification complete

- Investigated the live map editor before reloading. The road had all 13 authored points and both endpoint nodes in the graph; only the first endpoint had `connectionNode: true` because it intersected another route. The final endpoint was a valid degree-one node, but the renderer filtered it out because it only displayed `connectionNode` markers.
- Added a separate derived `roadEndpoint` marker to both endpoints in trace compilation. This makes endpoint availability visible without changing the meaning of `connectionNode` or creating an implicit entrance/route connection.
- Updated the existing blue connection-point projection to include `roadEndpoint`, preserved road metadata through Road → Trace → Road round trips, and added load-time graph synchronization so older saved snapshots are normalized when the Studio editor opens.
- Added explicit `Save changes` and Enter-key flush behavior to Road Properties while retaining autosave. No entrance auto-connect behavior was changed.

### Verification

- TDD RED gate: the new compiler/adapter regressions initially failed with missing endpoint markers and missing trace metadata, then passed after the implementation.
- Focused relevant suite: `10` files / `108` tests passed, including trace compilation, graph behavior, GraphAdapter, road snapping, route handlers, renderer projection, vertex editing, interaction, EditorBridge load sync, and Road Properties save behavior.
- Scoped ESLint completed but reported only the shared checkout's known baseline diagnostics: `34` errors and `6` warnings, chiefly pre-existing `any` usages and React ref-hook diagnostics. No unrelated lint debt was changed.
- Live route `http://localhost:3000/studio/map-map-1-k6bv/edit`: map loaded without `Map not found`, the affected `T-1-lehc` row remained available, Road Properties exposed `Save changes`, status showed `All changes saved`, and browser console errors were empty.
- After saving the current road snapshot, the live graph API returned exactly two `roadEndpoint` nodes for `T-1-lehc`; one also had `connectionNode: true`, while the final endpoint did not. The final endpoint had only its normal chain edge, proving the blue marker did not auto-connect it to an unrelated route.
- A controlled browser reload returned to the same editor route with the road still present, `All changes saved`, and no browser console errors. The persisted API still contained both endpoint markers and the final endpoint remained degree-one.
- Required `graphify update .` was attempted after source changes and remains blocked by documented Windows `[WinError 5] Access is denied`; generated graph output was left untouched.

### Manual check

1. Select `↔ T-1-lehc` in the Studio Explorer.
2. Confirm both ends of the road show blue endpoint markers. The first may also be shared with another route; the final endpoint should remain visibly available but unconnected until explicitly joined.
3. Use the intended route/connection workflow to connect it only when desired.
4. Edit a road property, press Enter or click `Save changes`, wait for `All changes saved`, and reload to confirm the authored edit remains.

## 2026-08-31: NAVI Capture Phase 2A — read-only Studio Reviewer

### Phase: Implementation and verification complete

- Added the isolated `Capture Reviewer` domain under `navi-next/src/features/capture-review` with review metrics, GPS warning segments, independent raw/candidate/node/marker GeoJSON, and a namespaced persisted review store (`navi-capture-review-v1`).
- Added `/studio/capture-review` under the existing authenticated Studio route tree. The page reads local Capture sessions and validated `.navicapture.json` packages, but does not mount `EditorBridge`, `EditorProvider`, or any editor/runtime/publish path.
- Added a read-only campus-context map with `capture-review-*` MapLibre sources/layers, independent layer toggles, best-effort teardown, route-segment and marker include/exclude decisions, warnings, metrics, empty/error states, and a disabled import affordance.
- Added a navigation-only `Capture Reviewer` entry to `StudioDashboard.tsx`; no Studio editor behavior or state wiring was changed.
- Documented the future `CaptureImportAdapter` mapping/provenance contract. Because canonical `Entrance`/`Panorama` shapes do not provide a stable source-provenance field, the safe future design is a separate `CaptureImportManifest` sidecar; no shared core changes were made.

### Verification

- Phase 2A-only suite: `5` files / `12` tests passed.
- Phase 1 Capture suite: `8` files / `15` tests passed. Combined Phase 1 + Phase 2A invocation: `12` files / `26` tests passed.
- Root full suite: `341` passing files / `11` failing files, `4,041` passing tests / `18` failing / `8` skipped. The Phase 1 audit recorded `334` passing / `11` failing files and `4,019` passing / `18` failing / `8` skipped; failure counts and identities remained unchanged. The shared checkout also contains unrelated V1 cache work, so the total pass-count delta is not attributed solely to Phase 2A.
- Editor/Studio focused regression: `3` files / `47` tests passed. Active map/public focused regression: `4` files / `63` tests passed. These files contain more cases than the historical Phase 1 snapshot (`26` and `20` tests), and all current cases pass.
- Runtime focused regression: `9` files / `107` tests passed. Full runtime package: `28` passing files / `326` passing tests, with the same pre-existing parse failure at `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255:3`.
- Targeted ESLint over Capture Reviewer, its route, and the Studio navigation entry passed with zero diagnostics. Full TypeScript checking remains blocked only by the same unrelated runtime unmatched-brace diagnostic; the scoped reviewer production check emitted no Phase 2A diagnostics. Scoped diff/trailing-whitespace checks passed for Phase 2A paths.
- Forbidden-reference scan found no Capture Reviewer production references to forbidden stores, graph/publish APIs, published types/tables, `@navi/runtime`, editor commands, or canonical document mutation.
- Browser smoke passed through the Studio dashboard entry and direct route at `390×844` and `844×390`: local sessions loaded, map and review panel rendered, all five layer toggles could be switched off/on, document width matched viewport width, and browser error/warning logs were empty. The live local fixture had no candidate route or markers; their include/exclude behavior is covered by the passing reviewer/store tests.
- Required `graphify update .` was attempted after modification and remains blocked by Windows `[WinError 5] Access is denied`; generated graph output was not edited.

### Scope confirmation

- No Supabase sync, Studio Reviewer import, `CampusDocument` mutation, editor command dispatch, compiler integration, publish integration, service worker, NAVI Web/runtime, graph/publish API, canonical core type, or published-table change was made for Phase 2A.
- The reviewer invariant is enforced by construction: no editor provider/store is mounted or referenced in production, the import action is disabled, the test snapshot remains unchanged, and the static forbidden scan is empty.

### Recommendation

- Phase 2A is safe to hand off. Phase 2B import work should begin only after an explicit coordinate-space transform contract, campus/building/floor assignment UX, command payload mapping, and sidecar provenance policy are approved. Treat Phase 2B as medium/high risk until those canonical-model gaps are resolved.

## 2026-08-31: NAVI Capture Phase 2B — import contract audit

### Phase: Audit complete; production import intentionally not started

- Queried Graphify before repository inspection and traced the existing Capture
  source contract, Phase 2A review decisions, canonical CampusDocument
  entities, CoordinateTransformer, editor commands, validation, history,
  GraphAdapter, and Studio persistence boundary.
- Confirmed that a narrow future adapter can target outdoor Roads, indoor
  Floor.routeNetwork paths, indoor POIs, indoor Entrances, and panoramas with
  image assets through existing editor commands.
- Confirmed that outdoor POIs and hazards have no safe current canonical
  target, and point-only panoramas have no valid imageAssetId. These remain
  Capture-only or deferred.
- Corrected the indoor coordinate contract to the current source model:
  GPS converts to building-local meters for current POIs, Entrances, route
  nodes, and building-associated Panoramas. Floor selection is explicit
  ownership context; altitude and PlanAlignment.scale are not transforms.
- Found that the current dispatcher has no multi-command document transaction.
  EventBus transaction batches events only. A future import requires a
  tested batch/rollback boundary before mixed commands can be dispatched.
- Recommended a separate versioned CaptureImportManifest sidecar for
  provenance and duplicate detection because the current canonical types and
  Studio graph round trip do not provide a durable top-level import manifest.
- Identified a pre-implementation condition for Road imports: canonical Road
  width is documented in meters while current editor RoadStyle/UI values are
  pixels. The import policy must resolve this unit contract.

### Verification

- Read-only targeted checks confirmed the current RoadStyle values
  (default 8, slider range 2–20) and the existing core pointInPolygon helper.
- No production source, store, API, compiler, publish, runtime, or NAVI Web
  file was modified for this audit.
- No product test suite was rerun because this turn made no production code
  change. The documented Phase 2A baseline remains 12 files / 26 combined
  Phase 1+2A tests, with the existing unrelated full-suite/runtime baseline
  failures recorded above.
- Required post-document Graphify refresh was attempted after the report was
  written; the result is recorded in ERRORS.md.

### Recommendation

Phase 2B gate: **GO WITH CONDITIONS**. Phase 2C is safe to plan only after
batch atomicity, coordinate containment, road-width units, unsupported-object
policy, entrance-topology policy, sidecar persistence, duplicate handling, and
the required test matrix are accepted.

### Scope confirmation

Only the Phase 2B SPEC/PLAN, audit report/plan, progress log, and error log
were changed. Studio editor behavior, compiler behavior, publish behavior,
NAVI Web/runtime behavior, graph/publish APIs, and all forbidden stores remain
untouched.

## 2026-08-31: Road endpoint routing and intersection sync investigation

### Phase: Diagnosis complete; implementation intentionally not started

- The live `/routes` tester loaded `map-map-1-k6bv` from the persisted
  `graph_snapshots` fallback with 118 nodes and 115 edges. Selecting `N4495`
  to `N4343` produced a 17-node, approximately 180 m route that began at
  `N4495`, traversed `N4506` through `N4494`, and then entered the secondary
  road through `N4347`. The reverse route also ended at `N4495`.
- Persisted topology confirms `N4495` is a real degree-one road endpoint with
  only `N4506 ↔ N4495`; it has `roadEndpoint: true` but no
  `connectionNode: true`. The actual cross-trace junction is `N4494 ↔ N4347`.
- `N4495` is only about 0.1 m from the first `T-1-ddva` segment, so the missing
  connection is not caused by distance. `compileTrace` inserts endpoints
  before interior points, while `syncTraceIntersections` treats the first and
  last compiled nodes as the trace endpoints. For `T-1-lehc`, the compiled
  order is `N4494, N4495, N4496 ... N4506`, so the final endpoint `N4495` is
  not inspected as an endpoint; `N4506` is inspected instead.
- The reported save crash has a separate structural cause. The sync code
  builds each existing chain by appending only found edges, then accepts the
  chain whenever at least one edge exists. Current persisted `T-1-ddva` has 40
  matched points but only 33 original segment edges because shared/split
  junction segments no longer have the original direct edge. Later indexing
  `chain.edges[sj]` can therefore be undefined (and compacted edges can also
  be misaligned with their segment index).
- A* itself consumes only `edges` and returns the selected endpoint when it is
  the target. It does not infer a connection from `roadEndpoint`, distance, or
  `connectionNode` metadata.

### Verification

- Focused engine/adapter suite: `3` files / `30` tests passed.
- Live route UI/API checks: campus loaded, route graph visible, both directions
  to/from `N4495` returned a path, and browser console output contained no
  application error during the route test.
- No production source, graph snapshot, or route data was modified during
  this investigation.

### Handoff

The next implementation should preserve authored trace order when identifying
endpoints, represent existing-chain segments with their original indexes (or
skip missing segments safely), and add tests for both the endpoint connection
and malformed/shared-chain rebuild. It should not change A* heuristics until
the graph contains the intended endpoint edge.

## 2026-08-31: NAVI Capture Phase 2C — corrected outdoor pathway import baseline

### Phase: Baseline recorded; implementation not yet started

- Accepted the Phase 2B scope correction: NAVI Capture route import currently
  supports outdoor campus pathways only. Indoor navigation authoring remains
  the responsibility of the existing NAVI Studio Floor Editor.
- Updated the Phase 2B report/spec and Phase 2C plan so the supported target is
  only `CaptureImportAdapter → canonical Road → CampusDocument.roads[]`.
- Phase 1 + 2A regression baseline, run before production implementation:
  `13` test files passed / `27` tests passed. The invocation included the
  current Capture and Capture Reviewer suites plus both authenticated route
  page tests.
- Baseline command used the direct local Vitest binary with quoted `(admin)`
  paths to avoid the known Windows Vitest/path issues.

### Scope lock

- No indoor route network, building/floor context, altitude inference,
  world-to-floor-local conversion, indoor marker/entity import, compiler,
  publish, runtime, NAVI Web, service-worker, or forbidden store/API work is
  authorized for this slice.

## 2026-08-31: NAVI Capture Phase 2C — outdoor pathway import vertical slice

### Phase: Implementation and verification complete

- Updated the Phase 2B audit/spec and added the corrected Phase 2C plan with the
  explicit boundary: NAVI Capture route import currently supports outdoor campus
  pathways only. Indoor navigation authoring remains the responsibility of the
  existing NAVI Studio Floor Editor.
- Added the isolated `CaptureImportAdapter` and versioned
  `CaptureImportManifest` sidecar. The adapter validates the candidate route,
  explicit campus context, Road width policy, surface, source indexes, segment
  selection, and duplicate provenance before dispatch.
- Added selected contiguous candidate-segment conversion to `road.create`
  commands with canonical `Road.polyline.points` as `LatLng[]`, pedestrian
  classification, visible display mode, and no building/floor/marker import.
- Added editor-owned `CommandDispatcher.executeBatch` with exact document and
  revision rollback on handler failure. Successful imports dispatch through the
  existing editor command path and commit once; raw Capture samples are never
  mutated.
- Added Studio-hosted Reviewer import preview showing existing pathways and the
  proposed captured pathway, with segment include/exclude, cancel, campus
  mismatch blocking, duplicate warning, and import-selected actions. The
  existing standalone Reviewer remains read-only.

### Verification

- Pre-implementation Phase 1 + 2A baseline: `13` files / `27` tests passed.
- Final exact Phase 1 + 2A + Phase 2C matrix: `16` files / `41` tests passed.
- Established editor/Studio/public regression group: `9` files / `104` tests
  passed.
- Targeted compiler/public-navigation regression group: `9` files / `192`
  tests passed under the root Vitest config; the separately configured runtime
  floor-geometry compatibility suite passed `1` file / `10` tests.
- Final repository-wide `npm test`: `345` files passed / `11` files failed;
  `4,064` tests passed / `18` failed / `8` skipped. This preserves the
  documented pre-existing failure count (`341` files passed / `11` failed;
  `4,041` passed / `18` failed / `8` skipped); the pass-count delta includes
  the shared dirty checkout and this slice's tests, not new failures.
- The final Capture Reviewer timing regression starts the initial request
  synchronously and settles its async state before test cleanup, preventing
  broad-suite cross-test leakage.
- Scoped ESLint reports only the pre-existing `dispatcher.ts:54` explicit
  `any` diagnostic. Repository TypeScript reports only the pre-existing runtime
  parser error at `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255:3`.
- Capture feature production forbidden-reference scan is clean for graph stores,
  publish/graph APIs, published types/tables, compiler/runtime imports,
  route-network fields, and indoor assignment fields.
- The dedicated Studio host route follows the existing `EditorBridge` map-load
  boundary to provide the editor command service; it does not modify the
  existing graph store or use it for Capture persistence/import mutation.
- Tracked Phase 2C diff check and new-file trailing-whitespace scan passed.
- Required final `graphify update .` was retried after the last source change and remains
  blocked by managed-checkout Windows `[WinError 5] Access is denied`; generated
  Graphify output was not changed.

### Scope confirmation

- No indoor route network, building/floor assignment, altitude inference,
  world-to-floor-local conversion, indoor POI/entrance/panorama import,
  compiler mutation, publish call, service worker, NAVI Web/runtime change, or
  automatic geometric merge was added.
- Secondary POI, panorama, entrance, and hazard markers remain Capture/Reviewer
  reference information only.
- Existing compiler/runtime/public source is already dirty in this shared
  checkout from prior work; this Phase 2C slice did not modify those systems.

### Recommendation

- The outdoor pathway import vertical slice is safe to proceed to manual Studio
  QA and review. Keep broader Capture expansion paused until that QA confirms
  the live editor persistence path; do not add indoor import or marker/entity
  conversion in the next slice.

## 2026-08-31: Navi Admin Responsive Audit — baseline and scope

### Phase: T1 complete; T2 in progress

- Confirmed the active root Navi admin server responds at `http://localhost:3000`
  with the NAVI application title and an authenticated `/dashboard` surface.
- Confirmed the shared shell is `AppLayout` with a persistent 200px desktop
  sidebar, 48px header, search field, status/context area, and a flex main
  column; the current CSS narrow-viewport exception is scoped to Capture.
- Locked the audit to Dashboard, Dataset, Route Testing, Capture, Studio, and
  the floor-editor workspace where reachable, using desktop, tablet, and phone
  viewport checks.
- No application source or product data was changed.

### Next

- Capture fresh screenshots and read-only layout metrics for the viewport matrix,
  then rate practical task usability by device class.

## 2026-08-31: Navi Admin Responsive Audit — rendered viewport evidence

### Phase: T2 complete; T3 in progress

- Tested `1440x900`, `1024x768`, `768x1024`, `390x844`, and a `360x800`
  spot-check against the authenticated admin server.
- At `1440x900`, the shared shell has a 200px sidebar and a 1240px main area;
  representative routes have no horizontal overflow and the Studio map is
  usable.
- At `1024x768`, the Studio editor still exposes a 604px map and all top
  actions fit; this is the strongest tablet result.
- At `768x1024`, Dashboard retains a 4-column stats row and a fixed 300px chart
  column, producing a 625px inner scroller inside a 553px content area; the
  Studio map is only 348px wide.
- At `390x844`, the non-Capture admin shell leaves a 190px content column. The
  Dashboard, Dataset, Studio dashboard, Panoramas, and QR surfaces expose
  nested horizontal scroll/clipping; Route Testing renders a 300px map with
  controls beyond the viewport; Studio editor map width is 0px.
- Capture is the exception: its narrow shell hides the sidebar, keeps the main
  area at the full phone width, uses 44px controls, and showed no horizontal
  overflow at both phone sizes.
- Capture Reviewer wraps without horizontal overflow, but its phone content
  column is still 175px wide and requires roughly 2,949px of vertical scroll;
  session titles and controls become cramped.
- Browser console checks found no runtime errors during the tested routes. Map
  and editor pages emit a MapLibre style-diff warning while rebuilding a style;
  it did not prevent the visual audit.

### Next

- Convert the evidence into device ratings and severity-ranked findings, then
  verify the final diff is documentation/artifact-only.

## 2026-08-31: NAVI Capture Manual Studio QA Gate

### Phase: Phase 2C manual Studio QA complete

- Tested the real authenticated Studio campus `abc` (`map-map-1-k6bv`) at desktop
  and a 390x844 narrow viewport.
- Confirmed the Studio-hosted Reviewer displays raw samples, candidate geometry,
  markers, GPS warnings, existing pathways, and proposed-pathway overlays.
- Confirmed selected-segment preview, multi-segment import, zero-selection disablement,
  Cancel with no document mutation, invalid-package rejection, campus-mismatch
  rejection, empty/very-few-point rejection, and duplicate warning behavior.
- Found and fixed one Phase 2C safety bug: after a successful import, the same-page
  Reviewer could reuse a stale import plan until reload. `CaptureReviewer` now
  invalidates the plan after import; the regression test keeps a stable selection
  and verifies the immediate duplicate warning.
- Successful QA imports added four deliberate QA Roads to the local draft through
  the requested flow: two discontiguous segments, the remaining segment, and a
  second route. Existing Roads remained present. The temporary fixture was deleted;
  no temporary capture file remains in the repository.
- Reloaded normal Studio and confirmed the imported Road remains in the draft with
  `All changes saved`; no Validate, compile, or Publish action was triggered.
- Raw sample metrics remained unchanged in Reviewer. Automated Capture/import tests
  cover raw-sample preservation and compiled-graph isolation. Browser console
  warnings/errors were empty on the tested Reviewer/editor tabs.
- No obvious geometry offset was visible for the campus-aligned review-only route.
  Existing pathways and proposed captured pathways were visually distinct.
- Narrow Reviewer panels fit without body-level overflow; the pre-existing narrow
  three-column Studio editor shell leaves map/properties content off-screen. No
  editor-shell change was made because it is outside the Phase 2C QA fix scope.
- History continuity across Reviewer remount/reload was not available in the tested
  UI: Undo/Redo were disabled after reload and the Reviewer exposes no history controls.
  This remains an observed integration limitation, not a new feature change.
- The canonical adapter emits pedestrian Roads with explicit width in meters; the
  existing Road properties panel displays its legacy Type selector as `arterial`
  because `pedestrian` is not an option. No unrelated editor refactor was made.

### Verification

- Phase 1 + Phase 2A + Phase 2C matrix: **16 files / 41 tests passed**.
- Editor/Studio subset: **9 files / 104 tests passed**.
- Compiler/navigation/public compatibility subset: **9 files / 192 tests passed**.
- Runtime compatibility subset: **1 file / 10 tests passed**.
- Full suite before QA source fix: **11 failed / 345 passed files (356 total)**;
  **18 failed / 4,064 passed / 8 skipped tests (4,090 total)**.
- Full suite after QA source fix: same **11 failed / 345 passed files** and
  **18 failed / 4,064 passed / 8 skipped tests**; no new failures. The remaining
  failures are the documented pre-existing missing-module, routing/topology,
  compiler-pipeline, and floor-editor characterization failures.
- Scoped ESLint: only the pre-existing `packages/editor/src/commands/dispatcher.ts`
  `no-explicit-any` error.
- Typecheck: only the pre-existing `packages/runtime/src/__tests__/data-identity-comparison.test.ts`
  missing-brace syntax error.
- Capture production forbidden-reference scan: clean.
- Required final Graphify refresh was retried and remained blocked by managed-checkout
  Windows `[WinError 5] Access is denied`; generated Graphify output was not changed.

### Scope confirmation

- During this QA turn, only the Capture Reviewer component and its regression test
  were changed, plus the required root progress/error logs.
- No Studio editor, compiler, publish, runtime, NAVI Web, service worker, indoor
  routing, marker import, or unrelated canonical-model code was modified.

### Recommendation

- Stop at the Phase 2C manual QA gate. The outdoor pathway import vertical slice is
  suitable for review with the noted history/type-panel limitations; resolve those
  integration decisions before broad release or expanding Capture scope. Do not
  begin another feature phase in this task.

## 2026-08-31: Navi Admin Responsive Audit — ratings and findings

### Phase: T3 complete; T4 in progress

#### Ratings

- **Desktop computer (1440x900): 8.5/10.** Shared shell, dashboards, data
  tools, maps, and Studio editor fit without horizontal overflow. The main
  deductions are dense/small controls and a desktop-first interaction model.
- **Tablet landscape (1024x768): 7/10.** Core surfaces remain reachable and
  the Studio editor retains a roughly 604px map, but Dashboard charts and
  legends are noticeably compressed.
- **Tablet portrait (768x1024): 4/10.** Capture and simple data pages fit,
  but Dashboard creates a 625px inner horizontal scroller inside a 553px
  content area and the Studio map falls to roughly 348px.
- **Phone (390x844 / 360x800): 2/10 for the admin overall.** The persistent
  sidebar leaves 190px/160px for content; most admin pages clip or require
  nested horizontal scrolling, Route Testing hides its fixed-width inspector,
  and the Studio editor map measures 0px. **NAVI Capture alone: 8.5/10** on
  phone because its narrow shell override, wrapping, and 44px controls work.
- **Cross-device adaptability: 4.5/10.** Desktop is strong, but core map
  authoring and several operational surfaces fail the phone case and degrade
  materially in portrait tablet orientation.

#### Severity-ranked findings

1. **P0 — Studio editor is not phone-usable.** The 200px admin rail plus the
   220px Explorer consumes more than the phone viewport; the rendered map is
   0px wide and editor actions are clipped.
2. **P1 — Shared admin shell has no general narrow-screen mode.** Only Capture
   hides the sidebar at `max-width: 720px`; Dashboard, Dataset, Studio,
   Panoramas, QR, and Route Testing retain the desktop rail and cramped header.
3. **P1 — Route Testing loses the phone task.** Its map keeps a 300px minimum
   footprint and the right controls sit beyond the 190px phone content column
   without a usable horizontal scroll path.
4. **P1 — Dashboard breaks in portrait tablet and phone layouts.** Fixed
   `repeat(4, 1fr)` stats and a fixed 300px chart column produce clipping and
   an inner horizontal scrollbar.
5. **P2 — Studio dashboard and Reviewer are technically wrapped but cramped.**
   The Studio map cards retain a 240px minimum; Reviewer avoids x-overflow but
   reduces its phone content column to 175px, ellipsizing titles and creating a
   very long vertical workflow.
6. **P2 — Touch ergonomics are desktop-oriented.** Shared navigation is 30px
   high, the collapse affordance is 18px, and Studio editor actions are about
   23–30px high; Capture is the notable 44px exception.

### Next

- Verify the final working-tree scope, reset the temporary viewport override,
  and record the final audit handoff.

## 2026-08-31: Navi Admin Responsive Audit — final verification

### Phase: T4 complete

- Saved four read-only screenshots under `audit-artifacts/`: Dashboard phone,
  Capture phone, Studio editor phone, and Studio editor desktop.
- Reset the temporary browser viewport override after testing.
- Confirmed the active root server remained reachable at `http://localhost:3000`
  and observed no browser console errors on the tested routes. Map/editor pages
  retained one non-blocking MapLibre style-diff warning.
- No application source, route data, Studio document, import, delete, publish,
  or other product mutation was performed by this audit.
- The shared checkout already contains extensive unrelated dirty root and
  nested `navi-next` changes, so repository-wide diff isolation is not cleanly
  provable from the current baseline. The audit's intentional outputs are the
  responsive documentation entries and screenshot artifacts listed above.

### Final recommendation

- Treat desktop and tablet landscape as usable, portrait tablet as borderline,
  and phone as not production-ready for the general admin. Prioritize a shared
  responsive admin shell, then reflow Dashboard/Route Testing and provide a
  mobile-specific Studio editing mode. Preserve the existing Capture shell
  behavior as the model for narrow-screen treatment.

## 2026-08-31: NAVI Capture Phase 2C-S Undo/Redo Stabilization

### Phase: T1 audit and T2/T3 implementation in progress

- Traced `CaptureReviewer` → `CaptureImportAdapter` →
  `CommandDispatcher.executeBatch()` → `road.create` → `CampusDocument`.
- Root cause classification: **B** for the import path (batch execution
  bypassed `HistoryStack` hooks) and **D** for navigation (normal Studio and
  Studio-hosted Reviewer each mount a fresh `EditorBridge`/`EditorContext`/
  `HistoryStack`).
- Added RED integration coverage for single-Road Undo/Redo, grouped three-Road
  Undo/Redo, Cancel, duplicate rejection, failed rollback, and repeated Redo.
  RED result: 3 expected failures with `history.undoCount === 0`; Cancel and
  rollback already passed.
- Minimal fix: optional `PostHook.afterBatch`, one successful batch callback in
  `CommandDispatcher.executeBatch`, and one snapshot-backed batch entry in
  `HistoryStack`. Snapshot restore emits the existing `document.changed` event
  so the Studio map projection can follow Undo/Redo.
- GREEN result: Phase 2C-S history integration **1 file / 5 tests passed**.
- No Studio routing redesign or Undo/Redo UI was added. The Reviewer route does
  not render the normal `ToolDock`/`StudioCanvas` controls, so manual history
  checks must use the exposed real editor context or document the route boundary.

### Next

- Rerun the full required regression matrix and inspect the final diff.
- Manually verify the real Studio context, route/remount behavior, and local
  Capture import without starting another Capture phase.

## 2026-08-31: NAVI Capture Phase 2C-S Undo/Redo Stabilization — final verification

### Phase: T1–T5 complete

- Audited `CaptureReviewer → CaptureImportAdapter →
  CommandDispatcher.executeBatch() → road.create → CampusDocument →
  HistoryStack` and the `EditorBridge` route/remount boundary.
- Root cause classification: **B** for the import path because batch execution
  bypassed per-command history hooks; **D** for route navigation because the
  normal Studio editor and Studio-hosted Reviewer each create a fresh transient
  editor/history context. This is not an A/C failure.
- Added the smallest history integration: an optional `PostHook.afterBatch`, one
  successful batch callback after the transaction commits, and one
  snapshot-backed history entry for the complete batch. Snapshot restore now
  commits and emits `document.changed` so the Studio projection follows undo
  and redo. No route or Reviewer UI redesign was added.

### Automated evidence

- RED history integration run: 1 file, 3 failed and 2 passed; failures were the
  expected missing batch history entries.
- GREEN Phase 2C-S history run: 1 file, 5 passed.
- Phase 1 + 2A + 2C + 2C-S matrix: 18 files, 56 passed tests.
- Editor/Studio subset: 9 files, 104 passed tests.
- Compiler/navigation subset: 9 files, 192 passed tests.
- Runtime compatibility subset: 1 file, 10 passed tests.
- Full suite: 346 passed files, 11 failed files; 4,069 passed tests, 18
  failed, 8 skipped. The locked pre-change baseline was 345 passed files, 11
  failed files; 4,064 passed tests, 18 failed, 8 skipped. The one-file/five-test
  increase is the new Phase 2C-S history test; the failure counts did not grow.
- Capture production forbidden-reference scan: clean. Changed-source
  whitespace scan: clean. Graphify refresh: 18,559 nodes and 27,408 edges
  rebuilt successfully.
- Scoped lint retains pre-existing diagnostics in the dispatcher/history files
  (`no-explicit-any`, plus the existing unused `command` warning). TypeScript
  retains the pre-existing missing-brace error in
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts`.

### Manual Studio QA evidence

- On campus `map-map-1-k6bv`, a valid local Capture package loaded in the host
  Reviewer with raw trace, candidate route, six candidate sections, and campus
  validation visible.
- Import Preview showed the selected segment count and proposed Road count;
  Cancel was available before mutation. A single selected segment imported as
  one normal outdoor Road and persisted after autosave and Studio reload.
- A second review selected three discontiguous segments and imported three
  Roads. Studio reload showed the original Road plus the three new Roads; the
  document reported `All changes saved`, remained `Not Validated`, and Publish
  stayed disabled. No compile or publish was invoked.
- The map overlays and proposed geometry were visually aligned in the campus
  area, existing campus content remained visible, and no broken panel overlap
  was observed in the tested desktop/narrow Reviewer views.
- The host Reviewer intentionally does not render the normal Studio
  `ToolDock`, `StudioCanvas`, or keyboard history controller. Returning to the
  normal editor remounts `EditorBridge`, so its new history stack has Undo/Redo
  disabled even though the imported Roads persist. Exact single-batch and
  grouped-batch undo/redo was therefore verified at the real dispatcher/history
  boundary by automated tests; cross-route transient history remains a
  documented product limitation, not a new scope change.
- The manual QA left four clearly named QA Roads in the local draft (one single
  import and one three-Road import); no destructive cleanup was performed.

### Scope confirmation

- Phase 2C-S changed only editor batch/history integration and its tests, plus
  workflow documentation.
- Studio routing, indoor routing, markers, compiler behavior, publish,
  `PublishedCampus`, NAVI Web, runtime behavior, service workers, and existing
  Studio editor behavior were not modified.

### Recommendation

Phase 2C outdoor import is stable for atomic command-level history grouping,
exact undo/redo, rollback, duplicate no-op, and persistence. Do not claim
cross-route UI Undo/Redo continuity until a separate product decision scopes
history ownership across the Reviewer/editor route boundary. Stop here; do not
begin another Capture phase in this task.

## 2026-08-31: NAVI Capture Phase 3 — Supabase sync audit checkpoint

### Phase: audit/design gate

### What was done

- Re-established the authenticated Supabase MCP connection after the local
  clock correction; no application or database mutation was performed.
- Inspected the Phase 1 Capture domain: full `CaptureSession` envelopes and
  raw GPS samples are cloned into the isolated `navi-capture-local-v1`
  IndexedDB database; no remote repository or sync state exists yet.
- Confirmed the live Supabase project is active on PostgreSQL 17.6 and has no
  `capture_*` tables. Existing public tables are canonical campus/draft or
  published-map data and must remain outside the Capture boundary.
- Confirmed there is no current campus-membership table or RLS policy that can
  safely authorize Capture access by campus. Existing canonical policies are
  public-read, while the Capture design must use authenticated ownership and
  must not use editable `user_metadata` for authorization.
- Captured the live security advisories without applying them: PostGIS
  `public.spatial_ref_sys` has RLS disabled, and the existing
  `public.sync_graph_snapshot` function is reported with a mutable search path.
  Both are pre-existing, unrelated findings and remain out of this feature.

### Verification

- Capture/Reviewer/Import baseline: 16 files / 44 tests passed.
- Fresh Codex `/mcp`: `supabase: connected (20 tools)`.

### What's next

- Present the Phase 3 isolated sync design for approval before writing the
  feature spec, implementation plan, migration, or sync code.

## 2026-08-31: NAVI Capture Phase 3 — provider-neutral sync foundation

### Phase: Tasks 1–2 implementation checkpoint

### What was done

- Added provider-neutral Capture Sync contracts, error codes, retryability,
  deterministic canonical JSON, and Web Crypto SHA-256 hashing.
- Added a separate `navi-capture-sync-v1` / `sync-state` persistence boundary
  that stores sync metadata only; Capture sessions and raw GPS payloads remain
  in the existing local Capture repository.
- Added `CaptureSyncService` transitions for local queueing, finished-session
  validation, upload success, retryable failure, conflict, and state cleanup
  composition. No Supabase SDK or Studio/editor/runtime dependency is used in
  these layers.

### Verification

- Task 1 contract/hash/error suites: 2 files / 8 tests passed.
- Task 2 local-state/service suites: 2 files / 8 tests passed.
- Combined Capture Sync plus existing Phase 1/2A/2C matrix: 20 files / 60
  tests passed.

### What's next

- Implement and test the provider-specific Supabase adapter and additive
  `capture_sessions` RLS migration only after the adapter RED gate.

## 2026-08-31: NAVI Capture Phase 3 — Supabase adapter checkpoint

### Phase: Task 3 implementation checkpoint

### What was done

- Added `SupabaseCaptureRepository` as the only provider-specific Capture Sync
  module. It authenticates through the current Supabase user, omits client
  ownership fields so the database default/RLS owns `owner_id`, validates the
  Capture schema, preserves the full payload, and maps provider failures to
  provider-neutral errors.
- Added expected-hash conditional update behavior with explicit unchanged and
  conflict results; changed remote rows are never blindly overwritten.
- Added the isolated `capture_sessions` migration with owner-only RLS and
  authenticated select/insert/update grants. It has not been applied to the
  live project yet.

### Verification

- Capture Sync Tasks 1–3: 5 files / 21 tests passed.
- Full TypeScript check reports only the pre-existing missing-brace error in
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts`; no new
  Capture Sync type errors were reported.

### What's next

- Add the limited `/capture` sync composition provider and status/actions UI;
  do not add Studio Library, Reviewer, import, compiler, publish, runtime, or
  public-map behavior.

## 2026-08-31: NAVI Capture Phase 3 — sync UI checkpoint

### Phase: Task 4 implementation checkpoint

### What was done

- Added a provider-neutral Capture Sync context and a page-level browser
  composition provider. Supabase client construction remains outside Capture
  components, and no-user/mock-auth sessions remain local-only.
- Added finished-session Sync now/Retry/Syncing/Synced/Conflict/Local-only
  presentation to Capture Home and Capture Review while preserving local
  Review, Delete, and Export actions.
- Kept the existing Recording Map, Reviewer, import, Studio, compiler, publish,
  runtime, public-map, and NAVI Web surfaces unchanged.

### Verification

- Task 4 provider/UI and existing CaptureShell tests: 2 files / 6 tests passed.
- Combined Phase 1/2A/2C Capture matrix plus all Phase 3 tests and `/capture`
  route checks: 22 files / 69 tests passed.

### What's next

- Add only foreground `online` retry and safe sync-state cleanup when a local
  Capture session is deleted.

## 2026-08-31: NAVI Capture Phase 3 — lifecycle checkpoint

### Phase: Task 5 implementation checkpoint

### What was done

- Added a foreground-only `online` listener that calls the provider-neutral
  `syncQueuedSessions()` service operation while the Capture surface is
  mounted. No service worker, background sync, or background geolocation was
  added.
- Wired local Capture deletion to remove the corresponding dedicated sync
  metadata, while leaving remote rows untouched.
- Verified a failed sync state is restored after provider remount from the
  service-backed state repository.

### Verification

- All Phase 3 focused suites: 7 files / 28 tests passed.

### What's next

- Run read-only live schema preflight, then apply only the additive
  `capture_sessions` migration through the supported Supabase migration tool.

## 2026-08-31: NAVI Capture Phase 3 — schema checkpoint

### Phase: Task 6 implementation checkpoint

### What was done

- Verified the target project and migration drift before applying the additive
  Capture schema; no existing canonical table or migration was altered.
- Applied `create_capture_sessions`, then applied the scoped
  `tighten_capture_sessions_grants` correction after effective-grant
  verification exposed project-default privileges.
- Confirmed `capture_sessions` has the required columns and primary key, RLS
  enabled, owner-only authenticated policies, zero rows, and no anonymous
  table grants. The pre-existing `spatial_ref_sys` advisory remains
  unchanged.

### Verification

- Supabase migration tool returned success for both Capture migrations.
- Live migration history contains `create_capture_sessions` and
  `tighten_capture_sessions_grants` after the existing drifted history.
- Live policy/grant query returned exactly authenticated INSERT/SELECT/UPDATE
  and the three owner policies.

### What's next

- Run the final focused/regression, static-boundary, type/lint, and Graphify
  verification gates, then stop at Phase 3.

## 2026-08-31: NAVI Capture Phase 3 — final stop-line report

### Phase: complete

### What was done

- Completed provider-neutral, offline-first Capture Sync for finished local
  sessions: deterministic SHA-256 content hashing, separate IndexedDB sync
  state, queued/syncing/synced/failed/conflict transitions, foreground retry,
  and deletion cleanup.
- Added the Supabase adapter with authenticated-user checks, exact raw-preserving
  JSON payloads, expected-hash conditional updates, duplicate/conflict
  protection, and provider-neutral error mapping.
- Applied and verified the isolated `capture_sessions` schema in project
  `oltfaepqcktrumfhadzb`, including owner-only RLS, exact authenticated table
  grants, two indexes, and zero rows. Existing PostGIS/function/Auth advisories
  were observed and left untouched.
- Added only the `/capture` sync composition and Capture UI status/actions.
  Studio Library, remote Reviewer browsing, import, compiler, publish,
  runtime, public-map, NAVI Web, service worker, and background geolocation
  behavior were not added or modified.

### Verification

- Pre-implementation Capture baseline: 16 files / 44 tests passed.
- Final exact Capture/Reviewer/Import baseline: 16 files / 44 tests passed.
- Final Phase 3 suites: 7 files / 28 tests passed.
- Combined Phase 3 plus Capture regression matrix: 23 files / 72 tests
  passed, exit 0.
- Editor/Studio subset: 9 files / 104 tests passed.
- Compiler/navigation/public compatibility subset: 7 files / 150 tests
  passed.
- Runtime compatibility subset: 1 file / 10 tests passed after the sandbox
  retry in the approved elevated context.
- Scoped ESLint: 0 errors / 0 warnings.
- TypeScript: one unchanged pre-existing error at
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`
  (`'}' expected`); no Capture Sync type errors.
- Desktop and 390×844 browser checks: `/capture` rendered with usable local
  Capture Home controls and no observed layout overlap; a real page reload
  restored the existing five local sessions.
- Forbidden production-reference scans and whitespace scans: no matches.
- Graphify refresh: repeated managed-checkout `WinError 5` permission failure;
  generated graph output was left untouched.

### Recommendation

Phase 3 is safe to close at the approved Capture Sync vertical slice. Phase 4
may begin with a separate Studio Capture Library design/implementation task;
do not expand this completed phase retroactively.

## 2026-09-01: NAVI Capture Phase 4 — locked pre-change baseline

### Phase: baseline gate

### What was done

- Re-read the approved Phase 4 Studio Capture Library specification and kept
  the campus-scoped route, provider-neutral reads, double campus validation,
  stale-request protection, and `Imported here` wording as acceptance criteria.
- No production application code, Supabase schema, migration, compiler,
  publish, runtime, or NAVI Web files were changed for this baseline.

### Verification

- Capture/Reviewer/Import plus existing Capture and route tests: **16 files /
  44 tests passed**.
- Phase 3 Capture Sync suites: **7 files / 28 tests passed**.
- Editor/Studio compatibility subset: **9 files / 104 tests passed**.
- Compiler/navigation/public compatibility subset: **9 files / 192 tests
  passed**.
- Runtime compatibility subset: **1 file / 10 tests passed** after the
  default-sandbox `spawn EPERM` retry in the approved elevated context.
- Existing StudioDashboard route-navigation baseline: **1 file / 5 tests
  passed**.
- The pre-existing broad full-suite, TypeScript, lint, and Graphify limitations
  remain documented in `errors/ERRORS.md`; they were not attributed to this
  Phase 4 baseline.

### What's next

- Create the Phase 4 implementation plan and visible TODO, then begin the
  provider-neutral remote-read TDD slice.

## 2026-09-01: NAVI Capture Phase 4 — T1 remote-read boundary

### What was done

- Added provider-neutral `listRemoteSessions()` and `getRemoteSession()` methods
  to the Capture Sync context.
- Added explicit Capture Sync availability states and semantic unavailable-read
  handling without local fallback.
- Reused one cloud repository instance in the Supabase provider for sync and
  read-only access.

### Verification

- Remote-read RED checkpoint: both tests failed because the context methods did
  not exist.
- Remote-read GREEN: **2 files / 6 tests passed**.
- Locked Phase 3 sync suite: **7 files / 28 tests passed**, unchanged.
- Capture Sync forbidden-reference and whitespace scans: no matches.
- Existing Phase 3 migration files were present but unchanged; no Phase 4
  schema or environment file was added or modified.

### What's next

- Add read-only derived summary counts at the repository adapter boundary,
  without changing the Supabase schema.

## 2026-09-01: NAVI Capture Phase 4 — T2 remote summary metadata

### What was done

- Added a pure `getCaptureSummaryDetails()` helper for raw sample, candidate
  node/edge, and marker counts.
- Added the derived counts to remote summaries after repository row validation.
- Extended repository read tests to verify campus filtering and cloned full
  session preservation for raw samples, candidate geometry, and markers.

### Verification

- Summary/repository RED checkpoint: the summary module was missing and the
  repository returned no derived counts.
- Summary/repository GREEN: **2 files / 9 tests passed**.
- Expanded Capture Sync gate: **9 files / 34 tests passed**; original Phase 3
  baseline remains **7 files / 28 tests passed**.
- No SQL, migration, environment, canonical model, or upload request shape was
  changed.

### What's next

- Add pure remote-session campus validation and exact browser-local
  `Imported here` provenance checks.

## 2026-09-01: NAVI Capture Phase 4 — T3 campus/provenance guards

### What was done

- Added semantic remote-session validation for route campus, remote summary
  campus, payload campus, and session identity.
- Added exact browser-local provenance detection for `Imported here` using the
  existing versioned manifest; no manifest schema change was made.

### Verification

- Helper RED checkpoint: both modules were absent and Vitest could not resolve
  the imports.
- Helper GREEN: **2 files / 6 tests passed**.
- Existing manifest regression with the new helpers: **3 files / 8 tests passed**.
- No Capture session data, editor document, or canonical model was mutated.

### What's next

- Add stale-safe remote-session hydration to the existing Reviewer while
  preserving local-session and local-file behavior.

## 2026-09-01: NAVI Capture Phase 4 — T4 remote Reviewer mode

### What was done

- Extended the existing Reviewer with validated remote-session hydration,
  request-key isolation, stale/unmounted response guards, and remote-only
  loading behavior.
- Preserved local IndexedDB session review, local JSON file review, and the
  existing Phase 2C import command path.
- Composed the Studio Reviewer with provider-neutral remote reads and a clear
  back path to the campus Capture Library.

### Verification

- Reviewer RED checkpoint: the new remote assertions initially loaded local
  sessions and could not find remote errors or back-label behavior.
- Reviewer/wrapper GREEN: **3 files / 17 tests passed**.
- Complete Capture/Reviewer/import gate: **18 files / 55 tests passed**;
  original Phase 1/2C matrix remains **16 files / 44 tests passed**.
- Required Graphify refresh was attempted after source changes and again hit
  the documented managed-output `[WinError 5] Access is denied` limitation.

### What's next

- Build the read-only campus-scoped Capture Library UI with semantic error
  states and exact local provenance display.

## 2026-09-01: NAVI Capture Phase 4 — T5 campus Capture Library UI

### What was done

- Added the campus-scoped, read-only Capture Library component.
- Added semantic error mapping for unavailable, malformed, missing, mismatch,
  and temporary remote failures without exposing provider/table details.
- Added exact `Imported here` display from the existing browser-local manifest.
- Added stale campus-list protection and full-session validation before Reviewer
  navigation.

### Verification

- Library RED checkpoint: the component and semantic error module were absent.
- Library GREEN: **2 files / 9 tests passed**.
- Verified no editor, document, compiler, publish, runtime, or local-session
  fallback is used by the Library component.

### What's next

- Add the campus route, remote Reviewer query composition, and Studio campus-card
  navigation entry point.

## 2026-09-01: NAVI Capture Phase 4 — T6 route/navigation composition

### What was done

- Added `/studio/[id]/edit/capture-library` as a campus-scoped route that
  mounts only the read-only Library and Capture Sync provider.
- Added optional `?sessionId=` handling to the existing dynamic Studio Reviewer
  route while preserving its EditorBridge and legacy no-query behavior.
- Added a Capture Library action to each campus card with the exact campus
  route.

### Verification

- Route RED checkpoint: the new Library page was unresolved, the Reviewer
  lacked provider/query composition, and campus cards had no Library action.
- Corrected route test async `use(params)` handling, then GREEN: **3 files / 9
  route/navigation tests passed**.
- Existing StudioDashboard behavior remains covered by the same test file.
- No Studio editor, compiler, publish, runtime, public-app, schema, or
  environment code was modified by route composition.

### What's next

- Run the complete Phase 4 feature gate, locked compatibility suites, boundary
  scans, and real browser QA; then stop at the Phase 4 report.

## 2026-09-01: NAVI Capture Phase 4 — T7 QA and regression gate

### What was done

- Ran the campus-scoped Capture Library in the real Studio browser at the
  default desktop viewport and at 390×844, then restored the browser's default
  viewport.
- Verified the direct route fails closed for a missing campus (`Map not found`)
  in the existing Studio shell. This browser profile has no campus maps and no
  remote Capture rows, so the populated remote list/reviewer/import flow was
  covered by the controlled automated suites rather than by manufacturing
  external data.
- Confirmed no local-session fallback, Studio mutation, or browser console
  warning/error occurred during the manual route check.
- No application, schema, migration, environment, compiler, publish, runtime,
  or NAVI Web source was changed during QA.

### Verification

- Complete Phase 4 feature gate: **33 files / 109 tests passed**.
- Original Phase 1/2A/2C matrix: **16 files / 50 tests passed**. The locked
  pre-Phase 4 baseline was **16 files / 44 tests**; the six-test increase is
  the intentional remote Reviewer coverage added in the existing Reviewer
  test file, with all original assertions still green.
- Expanded Phase 3 Capture Sync suites: **9 files / 34 tests passed**; locked
  baseline was **7 files / 28 tests**.
- Editor/Studio compatibility: **9 files / 104 tests passed**, unchanged from
  baseline.
- Compiler/navigation/public compatibility: **9 files / 192 tests passed**,
  unchanged from baseline.
- Runtime compatibility: **1 file / 10 tests passed**, unchanged from
  baseline after running from the package root in the approved elevated
  context.
- Focused Capture Library production boundary scan: no forbidden store/API,
  runtime, service-worker, or publish references. The legacy dynamic Reviewer
  host still contains its established `useGraphStore`/`EditorBridge` import
  path; it was not changed because it is the existing explicit import surface.
- Focused Phase 4 whitespace scan: clean. The repository-wide dirty checkout
  still contains unrelated pre-existing `git diff --check` findings.
- TypeScript reproduces only the known pre-existing syntax error at
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`;
  no new Phase 4 type error was reported.
- Required `graphify update .` was retried and remains blocked by the known
  managed-output `[WinError 5] Access is denied`; generated graph output was
  left untouched.

### What's next

- Phase 4 is ready to close. Phase 5 may begin only as a separately scoped
  Capture UX refinement task; no additional Library/import functionality was
  started.

## 2026-09-01: NAVI Capture Phase 5A — Sensor/UX audit

### What was done

- Classified Phase 5A as an audit-only spike and preserved the approved
  Capture → Sync → Library → Reviewer → Import architecture.
- Audited the existing recorder, Capture session/store, Recording Map layers,
  Capture Home/Review UI, `useGeolocation`, NavigationMap, and sync-state
  surfaces.
- Verified current primary browser guidance for geolocation and orientation:
  geolocation requires a secure context, explicit permission, and an allowed
  Permissions Policy; orientation permission is feature-detected, may require
  a secure context and transient user activation, and absolute orientation
  requires the absolute/magnetometer permission path when supported.
- Defined the future signal model:
  reliable absolute device-facing heading → reliable GPS movement heading →
  location only. Device-facing direction remains display-only and will not be
  persisted into route geometry, Roads, or import data.

### Verification

- Existing recorder and geolocation tests: **2 files / 9 tests passed**.
- No explicit sensor Permissions-Policy/header configuration was found in the
  inspected application source/config surface.
- `@turf/turf` is already present for future distance/bearing derivation; no
  new dependency was added.
- No application source, tests, package manifests, schema, migration,
  environment, compiler, publish, runtime, NAVI Web, or service-worker files
  were changed for Phase 5A.
- Audit spec/plan placeholder and scoped whitespace checks passed.
- No new error was added to the error ledger.

### Recommendation

- Phase 5A is complete. Begin Phase 5B only after a separate implementation
  approval. Keep the first implementation slice focused on derived elapsed
  time, GPS distance, accuracy state, sample status, and current-position UX;
  defer orientation permission/compass code to Phase 5C.

## 2026-09-01: NAVI Capture Phase 5 — T0 locked baseline

### What was done

- Converted the approved continuous Phase 5 brief into
  `spec/NAVI-CAPTURE-PHASE5.md` and `plan/NAVI-CAPTURE-PHASE5.md`.
- Added the visible Phase 5 task checklist to `TODO.md`.
- Kept application source, schema, migrations, environment, compiler,
  publish, runtime, NAVI Web, Library, and Studio editor behavior untouched.

### Pre-change verification

- Capture, Capture Reviewer, Capture import, Capture sync, and Capture Library:
  **28 files / 98 tests passed**.
- Editor/Studio compatibility subset: **9 files / 104 tests passed**.
- Compiler/navigation/public compatibility subset: **9 files / 192 tests passed**.
- Capture route page subset: **4 files / 5 tests passed**.
- Runtime compatibility: **1 file / 10 tests passed** after rerunning the
  package-local command in the approved elevated context; the default sandbox
  reproduced the known pre-discovery `spawn EPERM`.
- Documentation/error-ledger whitespace check: clean apart from normal
  PowerShell LF→CRLF notices.

### What's next

- Implement Task 1 pure Capture metrics with a failing-test-first cycle, then
  continue through the approved 5B, 5C, and 5D gates.

## 2026-09-01: NAVI Capture Phase 5 — T1 pure metrics

### What was done

- Added Capture-local pure metrics in
  `navi-next/src/features/capture/metrics.ts`.
- Distance uses the existing `@navi/core`/`haversine` utility through
  `@/engine/geo-utils` and sums only valid raw-coordinate samples.
- Added explicit Good/Fair/Poor/Unknown accuracy classification, compact
  distance/time formatting, and active-duration derivation that already
  tolerates optional pause metadata without mutating the session.
- Added the first Phase 5 test suite with malformed-coordinate and raw-sample
  immutability coverage.

### Verification

- TDD RED: missing metrics module, **1 suite failed / 0 tests discovered**.
- TDD GREEN: **1 file / 6 tests passed**.
- Required Graphify refresh retried and remains blocked by the known Windows
  `[WinError 5] Access is denied`; generated output was not manually changed.

### What's next

- Add optional Capture-local pause timing so active duration survives refresh
  across pause/resume/finish.

## 2026-09-01: NAVI Capture Phase 5 — T2 pause timing

### What was done

- Added optional `pausedDurationMs` and `pauseStartedAt` Capture session
  metadata without changing the schema version, raw samples, candidate route,
  or IndexedDB database/object-store keys.
- Added pure `transitionCaptureSessionStatus()` lifecycle timing and injected
  an optional Capture-local clock into `createCaptureStore()` for deterministic
  verification.
- Updated Capture JSON validation to accept legacy sessions and reject invalid
  timing metadata.

### Verification

- TDD RED: missing timing module plus expected old store/format behavior,
  **3 files failed / 6 tests executed**.
- TDD GREEN timing/store/format: **3 files / 8 tests passed**.
- Existing foreground recorder: **1 file / 3 tests passed**.
- Required Graphify refresh retried and remains blocked by `[WinError 5] Access
  is denied`; generated output was not manually changed.

### What's next

- Add the compact Live Capture HUD to the existing Recording Map and local
  Capture Review.

## 2026-09-01: NAVI Capture Phase 5 — T3 Live Capture HUD

### What was done

- Added `CaptureLiveHud` as an isolated Capture component with GPS state,
  numeric accuracy, Good/Fair/Poor/Unknown quality, active timer, distance,
  raw sample count, and Recording/Paused status.
- Mounted the HUD over the existing `NavigationMap` without adding a map or
  recorder and added matching distance/active-time values to local Review.
- Kept the overlay pointer-transparent and compact so existing marker,
  pause/resume, and finish controls remain reachable on narrow screens.

### Verification

- HUD component TDD RED: missing HUD module, **1 suite failed / 0 tests**.
- Focused 5B integration: **8 files / 20 tests passed**.
- Required Graphify refresh retried and remains blocked by `[WinError 5] Access
  is denied`; generated output was not manually changed.

### What's next

- Run the 5B gate, including the complete Capture matrix and desktop/narrow
  browser smoke check, before starting heading work.

## 2026-09-01: NAVI Capture Phase 5 — T4 5B gate

### What was done

- Completed the full Phase 5B Capture-family regression matrix after mounting
  the Live Capture HUD.
- Exercised `/capture` in the existing local browser at the default desktop
  viewport and at 390×844.
- Verified visible Recording/Paused states, pause/resume/finish transitions,
  GPS-unavailable messaging, active-time display, review summary metrics, and
  narrow-layout control reachability.
- Checked browser console warnings/errors; none were reported.

### Verification

- Capture, Capture Reviewer, Capture import, Capture sync, and Capture Library:
  **31 files / 112 tests passed** (locked baseline: **28 files / 98 tests**;
  the 14-test increase is the intended Phase 5B coverage).
- Desktop browser smoke: passed; HUD and controls remained visible with no
  observed overlap.
- 390×844 browser smoke: passed; compact HUD, map, attribution, and bottom
  controls remained usable with no observed overlap.
- The browser profile denied geolocation, so this gate verified the explicit
  unavailable/waiting state rather than claiming a real-device GPS sample.
- Raw-sample, candidate-geometry, and persistence coverage remains in the
  focused automated Capture suites; no map/source contract was changed.
- Graphify refresh remains blocked by the known Windows `[WinError 5] Access is
  denied`; generated output was not manually changed.

### What's next

- Begin Phase 5C with pure device-facing/GPS heading contracts, keeping the
  direction indicator display-only and outside Capture persistence/import.

## 2026-09-01: NAVI Capture Phase 5 — T5/T6 heading and facing direction

### What was done

- Added Capture-local heading normalization, absolute device-orientation
  parsing, GPS movement-heading freshness rules, precedence resolution, and
  finite display-only cone/arrow GeoJSON.
- Added `useCaptureDirection()` with feature detection, explicit
  `Enable direction` permission activation, device/GPS/location-only states,
  and listener cleanup on unmount.
- Added an accessible direction status control to the Live Capture HUD.
- Added Capture-namespaced `capture-current-direction` source and cone/arrow
  layers; no map camera rotation is performed.
- Kept heading out of `RawGpsSample`, candidate geometry, Capture format,
  import, sync, compiler, and runtime contracts.

### Verification

- Pure direction contracts: **2 files / 10 tests passed**.
- Hook, status, HUD, and MapLibre cleanup integration: **5 files / 23 tests
  passed**.
- Browser QA initially found the arrow layer's `line-cap` in the wrong MapLibre
  block; moved it to `layout`, reloaded cleanly, and observed no new MapLibre
  or React effect errors.
- Device orientation was not available as a reliable real heading in the
  browser profile; the UI correctly displayed `Facing direction unavailable ·
  Unreliable`. No real-phone compass behavior is claimed.
- Graphify refresh remains blocked by the known Windows `[WinError 5] Access is
  denied`; generated output was not manually changed.

## 2026-09-01: NAVI Capture Phase 5 — T7 5C gate

### Verification

- `/capture` desktop smoke: passed; HUD direction status, map, and controls
  rendered without observed overlap.
- `/capture` 390×844 smoke: passed in the earlier 5B layout pass and remains
  covered by the compact HUD geometry; the 5C status row remained within the
  overlay without blocking map controls.
- Explicit permission behavior is covered by the hook test; no permission
  prompt was auto-opened during browser QA.
- Temporary QA sessions were finished and returned to Capture Home.

### What's next

- Begin Phase 5D with provider-neutral sync-state presentation semantics,
  reusing the existing Phase 3 service/context/repository and changing no
  sync schema or transport behavior.

## 2026-09-01: NAVI Capture Phase 5 — T8/T9 sync-state UX

### What was done

- Added a pure provider-neutral sync presentation mapper for Local, Queued,
  Syncing, Synced, Failed/Retry, Conflict, unavailable, checking, and
  unfinished-session states.
- Added the shared `CaptureSyncStatus` component and replaced duplicate Home
  and Review sync markup with it.
- Preserved existing `Sync now`, `Retry`, `Conflict`, `Local only`, Review,
  Export, and foreground retry behavior through the existing sync context.
- Did not change the sync service, IndexedDB sync-state store, repository,
  Supabase schema/RLS, or transport behavior.

### Verification

- Presentation mapper: **1 file / 11 tests passed**.
- Shared sync component, provider composition, and foreground retry:
  **3 files / 11 tests passed**.
- Graphify refresh remains blocked by the known Windows `[WinError 5] Access is
  denied`; generated output was not manually changed.

## 2026-09-01: NAVI Capture Phase 5 — T10 final gate and stop line

### Automated verification

- Capture, Capture Reviewer, Capture import, Capture sync, Capture Library,
  and all Phase 5 tests: **36 files / 145 tests passed** (locked Phase 5
  pre-change baseline: **28 files / 98 tests**).
- Editor/Studio compatibility subset: **9 files / 104 tests passed**;
  baseline unchanged.
- Compiler/navigation/public compatibility subset: **9 files / 192 tests
  passed**; baseline unchanged.
- Capture/Studio route subset: **4 files / 5 tests passed**; baseline
  unchanged.
- Runtime compatibility: **1 file / 10 tests passed** in the package-local
  elevated run. The default sandbox reproduced the known pre-discovery
  `spawn EPERM`; the incorrect repository-relative filter produced no test
  discovery before the package-local rerun.
- Full app suite: **382 files; 4,179 passed, 8 skipped, 18 failed**. The 18
  failures are outside Phase 5 and match the dirty-checkout baseline areas:
  deleted `golden-campus` imports, compiler fixture/topology/navigation
  failures, and unrelated Floor Editor assertions.
- Typecheck: the only reported error remains the pre-existing
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`
  missing `}` (`TS1005`).
- Phase 5 production boundary scan: no references to protected Studio/public/
  compiler/runtime stores, APIs, models, or `@navi/runtime` were found.
- Intended-path whitespace scan and `git diff --check`: clean; only normal
  LF→CRLF conversion notices were emitted for the root logs.
- Final `graphify update .`: reproduced the known `[WinError 5] Access is
  denied`; generated Graphify output was not edited.

### Manual verification

- `/capture` at **1280×800**: passed; HUD, direction fallback, map, sidebar,
  and controls rendered without observed overlap.
- `/capture` at **390×844**: passed; compact HUD, map controls, direction
  fallback, pause/resume/finish controls, and review layout remained usable.
- Persisted Home/Review: passed; local sessions restored after reload and
  showed `Local` / `Local only` with provider-neutral unavailable detail.
- Live flow: passed; Recording → Paused → Recording → Review/finished, active
  time remained visible, and no automatic sync/compile/publish occurred.
- Sensor environment: geolocation was denied and no reliable absolute compass
  signal was available; the UI correctly showed explicit GPS-unavailable and
  direction-unreliable fallback states. No real-device compass behavior is
  claimed.
- The browser log buffer contains only the earlier pre-fix MapLibre
  `line-cap` error and Fast Refresh dependency-array warning; after the clean
  reload and minimal layer fix, no new corresponding errors appeared.

### Phase 5 stop-line

- Phase 5B Live Capture HUD: PASS.
- Phase 5C facing/heading refinement: PASS with browser-profile sensor
  limitation documented.
- Phase 5D sync-state UX: PASS.
- No changes were made to Studio editor behavior, compiler behavior, publish
  integration, NAVI Web/runtime behavior, indoor routing, service workers,
  Capture Library architecture, Supabase schema/RLS, or background
  geolocation.
- Phase 6 production hardening is safe to plan as a separate phase, carrying
  forward the known full-suite dirty-checkout failures, Graphify permission
  issue, and the real-device populated-sync/compass QA follow-up.
- Stop here; do not begin Phase 6 implementation in this task.

## 2026-09-01: NAVI Capture Phase 6 — validation kickoff

### Scope locked

- Phase 6 is active as production hardening and release validation only.
- The governing rule is: **Phase 6 proves the system; it does not expand the
  system.**
- The release path under test is real-device Capture → local persistence →
  Supabase sync → campus Capture Library → Reviewer → explicit outdoor pathway
  import → Studio draft → existing validation/compiler/publish → NAVI Web
  routing.
- No application source, schema, migration, environment, compiler, publish,
  runtime, NAVI Web, indoor routing, marker import, or service-worker changes
  are authorized by the validation kickoff.

### Phase 6 records

- Specification: `spec/NAVI-CAPTURE-PHASE6.md`.
- Validation plan: `plan/NAVI-CAPTURE-PHASE6.md`.
- Visible task list: `TODO.md`, Phase 6 T0–T6.
- Fresh baseline execution is the next checkpoint; Phase 5 counts remain the
  comparison baseline until the identical Phase 6 commands are rerun.
- Findings will be classified before any code action as Release blocker,
  Non-blocking defect, Environment limitation, or Future enhancement.

### T0 fresh baseline verification

- Capture, Capture Reviewer, Capture Sync, Capture Library, and Capture Import:
  **36 files / 145 tests passed**.
- Capture/Studio route subset: **4 files / 5 tests passed**.
- Editor/Studio compatibility subset: **9 files / 104 tests passed**.
- Compiler/navigation/public compatibility subset: **9 files / 192 tests
  passed**.
- Runtime compatibility: the default sandbox reproduced the known `spawn EPERM`
  before discovery; the identical package-local elevated run passed **1 file /
  10 tests**.
- `npm run build`: the default sandbox compiled successfully but failed at the
  Next page-data worker with `spawn EPERM`; the identical elevated build passed
  and generated the expected `/capture`, Capture Library, and Reviewer routes.
- `npm run lint`: **2,161 errors / 20,356 warnings**. The command scans the
  dirty checkout and generated `.next` output; no lint cleanup was attempted.
- `npx tsc --noEmit --pretty false`: the same single pre-existing
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)`
  `TS1005: '}' expected` error remains.
- Documentation checkpoint: intended-path `git diff --check` and trailing
  whitespace scan passed; only root Phase 6 documentation/TODO/progress paths
  were changed for this checkpoint, with no application source changes.

### T0 decision

- Baseline is recorded. The Capture/Studio/compiler/runtime feature gates are
  green at the Phase 5 counts, and the build is green in the approved elevated
  context.
- The lint/typecheck results remain health-gate findings matching the dirty
  checkout/pre-existing ledger and are not attributed to Phase 6.
- Proceed to T1 prerequisite audit. No implementation fix is authorized by the
  baseline.

### T1 prerequisite audit

- Local runtime prerequisites: Node `v24.16.0`, npm `11.13.0`, and Supabase CLI
  `2.111.0` are available.
- `.env.local` is present with the expected public Supabase URL/anon-key names
  and server-side Supabase names. Values were not printed or changed.
- Development middleware supports the existing mock-auth path, and
  `NEXT_PUBLIC_MOCK_AUTH` is enabled locally. This is not evidence of a real
  authenticated Supabase owner session; production explicitly disables mock
  auth.
- Supabase MCP read-only audit: project `oltfaepqcktrumfhadzb` is
  `ACTIVE_HEALTHY` in `ap-northeast-1`; `create_capture_sessions` and
  `tighten_capture_sessions_grants` are applied; `public.capture_sessions` has
  RLS enabled and currently contains **0 rows**.
- Remote session fixture: **Environment limitation**. There is no populated
  synced session for Library → Reviewer → import QA, and no session was
  created during this read-only audit.
- Supabase security: **Release blocker pending security-owner review**. The
  schema inspector reported critical `rls_disabled` for PostGIS's
  `public.spatial_ref_sys`. No remediation SQL was applied because Phase 6 does
  not authorize schema changes.
- Build readiness from T0 is green in the approved elevated context; lint and
  typecheck retain their documented dirty-checkout findings.

### T1 decision

- Local controlled QA may proceed.
- Real-device sensor QA and populated remote QA remain explicitly pending
  prerequisites; they must not be reported as passes without hardware,
  permissions, an authenticated owner, and a valid synced session.
- Proceed to T2 controlled browser/mobile-viewport and recovery QA. No code,
  schema, migration, or environment fix is authorized by this audit.

### T2 controlled browser and local recovery QA

- Desktop Capture Home at the default **1280×720** viewport rendered with no
  browser error logs. The saved-session grid was visibly clipped at the right
  edge; this is classified as a **Non-blocking defect** and was not changed.
- Narrow Capture Home at **390×844** reported `scrollWidth === 390` and
  rendered the Capture form, saved-session cards, sync status, and controls
  without observed overlap or browser errors.
- Local flow passed: created `Phase 6 controlled QA`, started with the existing
  GPS-denied environment, observed `GPS unavailable` and
  `Facing direction unavailable · Unreliable`, paused, resumed, and finished.
- Refresh recovery passed: created `Phase 6 refresh QA`, refreshed while
  recording, reopened it from Home as `Recording`, then finished it. Active
  time persisted and raw samples remained `0`; no synthetic location was
  introduced.
- Finished Review showed `Status: finished`, `Local`, and `Local only`; no
  automatic sync, compile, publish, or Studio mutation occurred.
- Desktop Capture Review rendered the map, metrics, and local-only sync state
  without console error logs. The wide Review metadata/date was visibly clipped
  at the right edge, carrying the same **Non-blocking defect** classification.
- The automated baseline already passed export/serialization contracts. The
  browser download-event probe did not observe the client-side download and is
  recorded as an **Environment limitation**, not an export regression.
- No application source, schema, migration, environment, or downstream
  Studio/compiler/publish/runtime/NAVI Web file changed during T2.

### T2 decision

- Controlled local and responsive checks are acceptable for continued QA.
- Real GPS/compass behavior remains unproven because the browser profile
  denied geolocation and supplied no reliable orientation signal.
- Populated Supabase remote QA remains blocked by the empty remote Capture
  fixture and missing real authenticated-owner session.
- Proceed to T3 prerequisite handoff/remote-flow check without adding features
  or modifying code.

### T3 real-device and populated remote-flow gate

- Physical-device sensor gate: **Environment limitation**. No physical phone
  with granted GPS/orientation permissions is attached to this validation run;
  desktop fallback cannot establish real GPS or compass support.
- True network-offline/reconnect gate: **Environment limitation**. The local
  browser QA used the existing development environment and did not transmit a
  precise location trace or alter OS/network settings to manufacture a field
  fixture.
- Authenticated-owner gate: **Environment limitation**. The local development
  session is mock-authenticated; production disables mock auth, and no real
  owner session was supplied for this run.
- Supabase remote fixture gate: **Environment limitation**. Read-only MCP
  inspection confirmed `public.capture_sessions` has **0 rows**, so no remote
  session can be opened in the Library or Reviewer.
- Studio handoff gate: **Environment limitation**. The local Studio entry
  point currently reports `0 maps · 0 buildings`, and a campus Library route
  fails closed with `Map not found`; there is no disposable campus draft for
  manual import/save/publish verification.
- No Capture session was uploaded, no precise location data was transmitted,
  no cloud row was created, and no publish operation was attempted.
- The manual/remote sub-gates remain pending rather than passing by inference.

### T3 decision

- T3 is recorded as **environment-limited**, not as a product pass.
- Required handoff to unblock: a physical phone, an authenticated owner
  session, a valid finished synced Capture session for a known campus, a
  disposable/current Studio campus draft, and explicit authorization before
  any external publish action.
- Proceed to T5 automated regression/health verification; retain T4 as pending
  until those manual prerequisites exist.

### T5 post-QA regression and health gate

- Capture, Capture Reviewer, Capture Sync, Capture Library, and Capture Import:
  **36 files / 145 tests passed**, unchanged from the Phase 5 baseline.
- Capture/Studio route subset: **4 files / 5 tests passed**, unchanged.
- Editor/Studio compatibility subset: **9 files / 104 tests passed**, unchanged.
- Compiler/navigation/public compatibility subset: **9 files / 192 tests
  passed**, unchanged.
- Runtime compatibility: default package-local run again hit the known
  pre-discovery `spawn EPERM`; the identical elevated run passed **1 file /
  10 tests**.
- Full app suite: **382 files; 371 passed, 11 failed; 4,179 tests passed,
  18 failed, 8 skipped**. This matches the Phase 5 broad dirty-checkout
  baseline; failures remain in missing `golden-campus` fixtures, compiler
  fixture/topology/navigation checks, and unrelated Floor Editor assertions.
- `npm run build`: passed in the approved elevated context and enumerated the
  expected Capture, Library, Reviewer, Studio, compiler, publish, and public
  routes. No source change preceded this rerun.
- `npm run lint`: **2,161 errors / 20,356 warnings**, unchanged from T0; the
  command scans generated `.next` and the dirty checkout.
- `npx tsc --noEmit --pretty false`: the same single pre-existing
  `data-identity-comparison.test.ts(255,3)` `TS1005: '}' expected` remains.
- Required `graphify update .`: reproduced the known Windows `[WinError 5]`
  access-denied limitation; generated Graphify output was not touched.
- No Phase 6 production source, schema, migration, environment, compiler,
  publish, runtime, or NAVI Web file was changed.

### T4/T5 release status

- Automated Capture and downstream compatibility gates are stable at baseline.
- T4 is **pending environment/authorization**, not passed: no physical device,
  real authenticated owner, populated remote Capture session, disposable Studio
  campus draft, or authorized publish target is available in this run.
- Production sign-off is also **blocked pending security-owner review** of the
  Supabase critical `public.spatial_ref_sys` RLS-disabled advisory; no SQL was
  applied.
- Required next handoff: provide the real-device/account/session/campus
  fixtures and explicit publish authorization, then run T4 and the final T6
  report. Do not begin another feature phase before those gates are resolved.

### Vercel deployment handoff

- The linked deployment target is the nested `navi-next` project:
  `navi-next/.vercel/project.json` → project `navi-next`.
- The current nested app worktree contains **880** status entries, including
  uncommitted and untracked files. Because the request was to publish all
  current changes, the intended deployment source is this worktree, not only
  the last commit.
- Vercel CLI `54.15.0` is installed. `vercel whoami` rejected the available
  credential as invalid; `vercel logout` reported no active login.
- A fresh device login was started, but the authorization page's `Allow`
  control remained disabled. No deployment was attempted and no application,
  environment, schema, migration, or credential file was changed.
- Next action: complete the Vercel device authorization, then run the
  production deployment from `navi-next` and verify the resulting URL.

### 2026-09-01 — Phase 6 real-device sync visibility diagnosis

- Performed a read-only audit of the configured Supabase project and the
  production Vercel path. No application source, schema, RLS policy, env value,
  or captured data was modified.
- `public.capture_sessions` contains exactly one row:
  `capture-e5bf252e-67b3-4f59-a4dd-3ba8b294c1a5`, owned by
  `b66e6a9d-0e34-4647-a98e-7c61abf2b8dd`, with `campus_id = NULL`, status
  `finished`, schema version `1`, client update `2026-09-01 03:09:00.929+00`,
  and server created/updated timestamps `2026-09-01 09:22:17.839395+00`.
  The payload is a valid object with 69 raw samples and no payload `campusId`.
- Supabase edge evidence shows the phone’s authenticated
  `capture_sessions` read returned 200 and insert returned 201. No desktop
  campus-filtered `capture_sessions` request was observed in the inspected
  window, but the source path is deterministic: Studio passes its map ID and
  the adapter applies an equality filter on `campus_id`.
- The only remote campus map is `map-map-1-k6bv`; the Studio route binds
  `[id]` directly to `CampusMap.id`, and recent Studio data requests used that
  map ID. Therefore the phone campus identity is null while the Studio
  identity is `map-map-1-k6bv`.
- `capture_sessions` RLS is enabled with authenticated owner-only INSERT,
  SELECT, and UPDATE policies. Auth session metadata updated in the test
  window belonged to the capture owner. Production auth traffic came from
  phone and desktop clients; local `.env.local` has a mock flag, but production
  code disables mock auth.
- The focused provider/repository/Library suite passed: 4 files, 18 tests.
  The first sandbox run was blocked by Vite `spawn EPERM`; the same command
  passed under approved elevated execution.
- Classification: campus mismatch caused upstream by missing campus
  association during Capture creation/sync. There is no evidence of malformed
  payload, capture-session RLS denial, query error converted to empty state, or
  a deployment runtime failure. A separate Supabase advisory reports RLS
  disabled on `public.spatial_ref_sys`; it is unrelated and untouched.
- Next: report the minimal fix recommendation and stop. Do not implement until
  the root cause is accepted and the canonical campus-association behavior is
  specified.

### 2026-09-01 — Phase 6 campus association fix

- Implemented the accepted bounded fix. The canonical source is the existing
  `CampusMap.id`/`campus_maps.map_id`; no display-name or second campus-ID
  system was introduced.
- `/capture?campusId=map-map-1-k6bv` now preselects the known Studio campus.
  The same existing campus-map list is available as a Capture selector, and
  changing it updates the canonical query parameter.
- `CaptureStore.createSession(title, campusId)` stores the normalized campus
  ID in the session. The existing IndexedDB/memory repository clone boundary
  preserves it with raw samples, markers, and candidate geometry.
- Campus-less cloud sync now records a non-retryable failed state with the
  exact message `Choose a campus before syncing.` before hashing or invoking
  the cloud repository. The Supabase adapter repeats the guard before any
  remote request. Local recording remains available.
- Campus-tagged serialization continues to write the same ID to
  `capture_sessions.campus_id`; Library filtering and RLS were not changed.
- The existing remote diagnostic row was re-read after implementation and is
  unchanged: one row, session
  `capture-e5bf252e-67b3-4f59-a4dd-3ba8b294c1a5`, `campus_id = NULL`,
  `finished`, 69 raw samples, and the same server timestamps. No remote write,
  repair, migration, or data deletion was performed.
- Verification: Capture/sync/Library/Reviewer/route scope passed **35 files /
  138 tests**. Targeted ESLint passed with **0 errors** (four existing fixture
  warnings). Elevated `npm run build` passed compilation, page-data
  collection, static generation **40/40**, and optimization.
- The repository-wide `tsc --noEmit` remains blocked by the pre-existing
  unrelated runtime test syntax error at
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)`.
  Graphify refresh remains blocked by the established Windows access-denied
  limitation. The local HTTP smoke check returned 200 but the unauthenticated
  client reached the auth gate; the browser CLI is unavailable and no physical
  phone was attached, so interactive/device sync QA remains pending.
- Boundaries crossed: **No**. No Library filtering, owner RLS, Supabase
  schema, compiler, publish pipeline, runtime, NAVI Web, Reviewer/import
  architecture, canonical Road model, service worker, or geolocation code was
  changed.

### 2026-09-01 — Phase 6 campus-association post-fix field retest

- Re-read the configured Supabase project without mutation. It now contains
  **3** `capture_sessions` rows: the original diagnostic session plus two
  newer finished sessions. All three have `campus_id = NULL`, payload
  `campusId = NULL`, and no row matches the canonical Studio campus
  `map-map-1-k6bv`; all three are campus-less by the current Library filter.
  The two newer rows contain 90 and 97 raw samples, confirming that phone
  recording and upload completed but campus association did not.
- The Vercel project is the linked `navi-next` project. Its latest production
  deployment is `READY`, aliases the configured production domains, and was
  built at `2026-08-31T23:39:48Z` from commit `8329208` (`docs: specify Phase 4
  Capture Library`). The local campus-association route/store/sync files were
  written after that build; the deployed commit has no
  `src/app/(admin)/capture/page.tsx`.
- Root cause of this retest is therefore **stale production deployment**, not
  a Library query/RLS regression. The local fix is not yet on the phone’s
  production path. No Vercel deployment was attempted because the available
  report did not authorize an external publish, and the earlier CLI auth
  handoff remains unresolved.
- Existing NULL-campus rows were not repaired or deleted. Fresh field QA is
  blocked until the current fix is deployed and the phone is opened with the
  canonical campus selected (for example,
  `/capture?campusId=map-map-1-k6bv`), followed by a new sync and row/Library
  verification.

### 2026-09-01 — Phase 6R Wave A baseline

- The approved Phase 6R design and implementation plan are recorded in
  `spec/NAVI-CAPTURE-PHASE6R.md` and `plan/NAVI-CAPTURE-PHASE6R.md`.
- Wave order is locked as A → B → C → D → E → F. Only Wave A is authorized
  in this run; Wave B remains gated on review of the Gate A report.
- 6R.0 source audit found raw samples, candidate geometry, markers, sync, the
  campus-scoped Library, Reviewer, and import boundaries are separate. The
  current geometry path is local-meter projection followed by roughly 4 m
  Douglas–Peucker simplification with no quality filtering or maximum retained
  segment constraint.
- Wave A implementation has not started. The next checkpoint is the RED
  geometry/detail test suite; no Supabase data, schema, RLS, deployment, or
  captured evidence will be modified.

### 2026-09-01 — Phase 6R Wave A RED checkpoint

- Added deterministic geometry fixtures for straight noise, a gentle curve,
  sharp turn, S-curve, isolated low-confidence spike, stationary jitter, and
  named route-detail profiles.
- Added Reviewer coverage requiring Route Detail to update a derived review
  candidate without mutating the loaded session’s raw samples, candidate, or
  markers.
- Elevated RED run: **2 files / 24 tests; 9 intended failures, 15 existing
  assertions passed**. The failures are the expected pre-implementation
  contracts for the quality-aware v2 pipeline, maximum segment behavior,
  profiles, and Reviewer control.
- Next: implement Wave A geometry and isolated Reviewer derivation only.

### 2026-09-01 — Phase 6R Gate A

- Wave A candidate generation now follows: valid coordinate projection into
  local meters → compact stationary-jitter collapse → conservative isolated
  low-confidence spike rejection → named-profile Douglas–Peucker → retained
  source points for maximum segment length → copied `CandidateRoute` points.
- The default is **Balanced** (`3 m` tolerance, `12 m` maximum retained
  segment). Simpler uses `5.5 m` / `20 m`; Detailed uses `1.5 m` / `8 m`.
  These are policy profiles, not a target vertex count. Maximum-segment points
  always come from the quality-filtered captured trace; no interpolation is
  introduced.
- Smoothing is intentionally **none** in Wave A. Coordinates are not rewritten
  or averaged, which keeps legitimate corners and raw provenance explicit.
- Reviewer now exposes a Route Detail range control. It derives a cloned
  review session from preserved raw GPS and uses that clone for map, metrics,
  and import planning. The loaded Capture session, raw samples, markers,
  metadata, Studio document, and remote data remain unchanged.
- Verification: focused Wave A suite **2 files / 24 tests passed**; locked
  Capture/Reviewer/Import/Sync regression **36 files / 159 tests passed**;
  Wave A geometry/test ESLint passed; production Next build passed with
  compilation, static generation **40/40**, and route optimization.
- Known baseline findings: the existing `CaptureReviewer` loading effect has
  one ESLint error plus one warning; repository `tsc` remains blocked by the
  unrelated runtime test syntax error at
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)`;
  Graphify refresh remains blocked by Windows `[WinError 5] Access is denied`.
- No Supabase schema/RLS/data, deployment, compiler, runtime, NAVI Web,
  Library filtering, or import architecture was modified. Physical phone
  validation remains a Wave F/final-gate requirement.
- **Gate A status: PASS for Wave A automated/source verification. Wave B has
  not started and remains pending review.**

### 2026-09-01 — Phase 6R Wave B authorization and plan

- Gate A was reviewed and approved by the user. Wave B is now the sole active
  scope; Wave C remains gated and will not start in this run.
- Wave B is planned as T7–T11: RED tests first, pure reviewed-candidate edit
  and endpoint-snap contracts, Reviewer/map integration, import/history
  verification, and Gate B logging.
- The locked boundaries remain unchanged: raw GPS is immutable, the generated
  candidate is profile-reproducible, Reviewer edits are isolated, endpoint
  snapping is explicit and read-only toward existing Roads, and all import
  continues through `CaptureImportAdapter`.
- No source implementation has been changed for Wave B yet.

### 2026-09-01 — Phase 6R Wave B T7/T8

- T7 RED coverage is recorded for Reviewer editing, map gestures, endpoint
  snap targets, explicit snap application/cancel behavior, reviewed geometry
  import, raw immutability, and existing import/history contracts.
- The elevated RED checkpoint reached the tests: the new Reviewer/map
  controls and snap layer/listeners failed as expected; the adapter already
  consumed supplied reviewed geometry correctly. The non-elevated run was
  blocked only by the known Vitest `spawn EPERM` startup limitation.
- T8 added `navi-next/src/features/capture-review/route-editing.ts` with pure
  clone-preserving edits, raw-trace-referenced insertion, minimum-polyline
  protection, and projected-meter endpoint target detection/application.
- Verification: T8 focused suite **1 file / 6 tests passed**. Existing Road
  inputs and raw samples remain unchanged in the contract tests.
- Next: integrate the pure contracts into Reviewer and CaptureReviewMap only;
  Wave C remains out of scope.

### 2026-09-01 — Phase 6R Wave B T9

- Reviewer now keeps a `{session/profile key, reviewed candidate}` clone state;
  generated candidates remain derived from raw GPS and Route Detail, while
  move/add/remove/reset callbacks update only the reviewed clone.
- Route Detail changes clear reviewed edits and snap ignores. Raw GPS remains
  controlled by the existing layer toggle and is never passed to a mutating
  edit path.
- CaptureReviewMap now has a namespaced snap-target source/layer and guarded
  move/add/remove MapLibre listeners. Move commits the final dragged
  coordinate on pointer release; Add uses the Reviewer raw-trace helper;
  Remove is minimum-polyline protected.
- Reviewer exposes explicit endpoint Snap/Ignore actions only with Studio
  context. Applying a snap uses the pure target coordinate and leaves the
  supplied Road array untouched; no proximity-only topology action exists.
- Verification: combined Wave B edit/snap/Reviewer/adapter check passed **4
  files / 36 tests**. The reviewed-candidate import integration also passed.
- The required Graphify refresh remains blocked by the established Windows
  `[WinError 5] Access is denied` limitation; no generated graph output was
  edited.

### 2026-09-01 — Phase 6R Wave B T10 verification

- Locked Capture/Reviewer/Import/Sync compatibility: **37 files / 172 tests
  passed**.
- Campus-scoped Library, Studio Reviewer, and route compatibility: **6 files /
  15 tests passed**; matching-campus visibility and mismatch exclusion remain
  covered.
- Import adapter, provenance manifest, and grouped history: **3 files / 15
  tests passed**. Reviewed geometry is dispatched once, Cancel dispatches
  nothing, Undo removes the grouped import, Redo restores it once, and
  duplicate/provenance protections remain green.
- Final scoped lint excluding the pre-existing Reviewer loading-effect finding:
  passed. Full scoped lint still reports only that existing error and warning.
- Final `npm run build`: passed compilation, static generation **40/40**, and
  route optimization. Repository `tsc --noEmit` remains blocked at the known
  unrelated `data-identity-comparison.test.ts(255,3)` syntax error.
- Wave B source scope remains limited to the pure route-editing module,
  CaptureReviewMap, CaptureReviewer, and their focused regressions. No
  Supabase/schema/RLS, Library filtering, compiler/runtime/NAVI Web, Road
  model, graph, or captured data changes were made.

### 2026-09-01 — Phase 6R Gate B

- **PHASE 6R — GATE B**
- **STATUS: PARTIAL** — automated/source verification passes, but no deployment
  containing Wave B was validated on a physical phone; therefore this is not
  a final release PASS.
- **REVIEWER EDITING: PASS** — controls operate on a keyed reviewed clone.
- **MOVE POINT: PASS** — final dragged coordinate is committed to the clone;
  raw samples and source session remain unchanged.
- **ADD POINT: PASS** — nearest usable preserved raw sample is inserted with
  its source index; arbitrary interpolation is not used.
- **REMOVE POINT: PASS** — invalid/minimum-route removal is rejected and a
  valid removal updates only the clone.
- **RESET: PASS** — restores a clone of the generated candidate for the
  selected Route Detail profile.
- **RAW GPS OVERLAY: PASS** — existing Raw GPS layer toggle remains read-only.
- **RAW GPS IMMUTABILITY: PASS** — pure and Reviewer/import tests preserve raw
  samples through move/add/remove/reset/snap flows.
- **ROUTE DETAIL INTERACTION: PASS** — changing profile clears reviewed edits
  and regenerates from preserved raw GPS; Wave A profile behavior remains.
- **ENDPOINT SNAP: PASS** — nearby existing Road segment projections are
  detected in local meters and can be applied only through an explicit action.
- **SNAP UX: PASS** — yellow target layer plus Snap/Ignore actions make the
  suggestion visible; ignore/cancel leaves geometry unchanged.
- **EXISTING ROAD MUTATION: PASS** — target Roads are read-only; no graph nodes
  or topology connections are created.
- **IMPORT USES REVIEWED GEOMETRY: PASS** — Reviewer passes its clone through
  `CaptureImportAdapter`; the adapter does not regenerate the candidate.
- **CANCEL ISOLATION: PASS** — existing Studio/import tests show Cancel leaves
  the document unchanged.
- **UNDO/REDO: PASS** — existing grouped history tests remove and restore one
  Capture import as one action.
- **DUPLICATE HANDLING: PASS** — existing manifest/adapter tests prevent a
  second import of the same capture segment.
- **FILES CHANGED:** `route-editing.ts`, `CaptureReviewMap.tsx`,
  `CaptureReviewer.tsx`, their focused tests, `capture-import` adapter test,
  and the Phase 6R spec/plan/TODO/progress/error ledger.
- **TESTS ADDED:** pure edit/snap contracts, map event/layer contracts,
  Reviewer clone/profile/snap/import contracts, and reviewed geometry adapter
  coverage.
- **TEST RESULTS:** 37 files / 172 Capture-family tests passed; 6 files / 15
  Library/Studio route tests passed; 3 files / 15 import/manifest/history
  tests passed; final scoped lint excluding the pre-existing Reviewer loading
  effect passed; production build passed with static generation 40/40.
- **PRE-EXISTING FAILURES:** full scoped lint retains the existing Reviewer
  loading-effect error/warning; repository `tsc --noEmit` retains the unrelated
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)`
  syntax error; Graphify refresh retains Windows `[WinError 5] Access is
  denied`; Next reports the existing middleware deprecation warning.
- **ARCHITECTURAL BOUNDARIES CROSSED: NO** — no Supabase schema/RLS/data,
  Library filtering, compiler, runtime, NAVI Web, Road model, graph, service
  worker, geolocation, or existing diagnostic rows were changed.
- **NEXT RECOMMENDED ACTION:** Review Gate B. If approved, Wave C may begin in
  a later run; before final release, deploy this source and perform the locked
  physical-phone validation. Leave prior NULL-campus diagnostic rows untouched.

### 2026-09-01 — Phase 6R Wave C authorization and plan

- Gate B was reviewed and approved by the user. Wave C is now the sole active
  scope; Wave D remains gated and will not start in this run.
- Wave C covers 6R.5 Preparing/Recording/Paused state separation and 6R.6
  marker independence. New sessions must observe GPS in Preparing without
  appending route samples; Paused must keep the same GPS/heading watch live
  while stopping route samples, active time, and route-distance growth.
- The implementation plan is T12–T16: RED tests first, recorder observation
  lifecycle, store/timing/readiness/persistence contracts, Shell/map/HUD
  integration, and Gate C verification.
- Locked invariants remain unchanged: raw samples and Gate A candidate
  derivation stay immutable/reproducible, Gate B Reviewer edits/snapping stay
  cloned and explicit, campus identity remains `CampusMap.id`, and no
  Supabase/schema/RLS, compiler/runtime/NAVI Web, Library, or import boundary
  changes are authorized.

### 2026-09-01 — Phase 6R Wave C T12 RED checkpoint

- Added RED coverage for Preparing/Recording/Paused state separation, GPS
  observation versus route-sample emission, marker independence, active-time
  and distance semantics, resume-gap handling, GPS-quality presentation,
  persistence/restore, and existing Capture compatibility.
- Elevated RED run: **7 files / 35 tests; 11 intended failures and 24 existing
  assertions passed**. The failures are the expected pre-implementation
  contracts: new sessions still start as Recording, recorder observation and
  pause-watch continuity are absent, campus/file status validation omits
  Preparing, poor fixes are labeled ready, and live-position marker wiring is
  absent.
- No production source, Supabase data/schema/RLS, Reviewer/import boundary, or
  existing diagnostic row was changed at the RED checkpoint.
- Next: implement the separated recorder observation lifecycle and state/store
  contracts; Wave D remains out of scope.

### 2026-09-01 — Phase 6R Wave C T13

- Added recorder observation lifecycle separation. `observe()` starts one
  foreground geolocation watch without route sampling; `start()` enables
  samples; `pause()` disables only sample emission; `resume()` keeps the watch
  and ignores the first post-resume fix so paused movement cannot become a
  recorded gap; `finish()`/`destroy()` perform terminal watch cleanup.
- Focused verification: **1 file / 4 recorder tests passed**, including GPS
  observation during Preparing/Paused, heading-bearing live fixes, Recording
  sample gating, same-watch pause/resume, sequence behavior, error forwarding,
  and terminal cleanup.
- Required `graphify update .` was attempted and remains blocked by the known
  Windows `[WinError 5] Access is denied`; no generated graph output was
  edited.
- Next: implement the Preparing status, recording-only store append, GPS
  readiness, timing, and persistence contracts; Wave D remains out of scope.

### 2026-09-01 — Phase 6R Wave C T14

- Added `preparing` to the persisted Capture session model. New sessions no
  longer receive `startedAt`; active time therefore begins only at explicit
  Preparing → Recording. Store route appends now no-op outside Recording, while
  observed GPS fixes update/persist `lastPosition` independently.
- Added GPS readiness derivation from the existing accuracy quality classifier
  (`acquiring`, `ready`, `poor`, `unknown`) and accepted Preparing in the
  Capture file validator. Candidate derivation, raw samples, campus ID, and
  sync contracts remain unchanged.
- Focused verification: **5 files / 25 tests passed** for recorder, store,
  timing, metrics, and format. The required Graphify refresh again returned
  the known Windows `[WinError 5] Access is denied`; no generated graph output
  was edited.
- Next: integrate Shell/RecordingMap/HUD state labels and marker behavior;
  Wave D remains out of scope.

### 2026-09-01 — Phase 6R Wave C T15

- Integrated the separated lifecycle into CaptureShell and RecordingMap.
  Preparing starts the observation-only bridge and exposes Start; Recording
  exposes Pause; Paused exposes Resume. Every observed fix updates the live
  position/direction path, while only Recording fixes reach the route-sample
  store action. Marker controls remain available wherever a current fix exists.
- HUD GPS presentation now distinguishes ready, poor accuracy, unknown quality,
  unavailable, and waiting states; Capture Home and sync presentation typing
  recognize Preparing without changing cloud-sync rules.
- Focused verification: **3 files / 12 tests passed** for Shell state/marker
  behavior, HUD state/readiness, and map layer cleanup.
- Required Graphify refresh again returned the known Windows `[WinError 5]
  Access is denied`; no generated graph output was edited.
- Next: run the complete Gate C focused/regression/build/boundary verification
  and stop for Gate C review; Wave D remains out of scope.

### 2026-09-01 — Phase 6R Wave C T16 / Gate C verification

- Wave C state, recorder, persistence, marker, HUD, sync, Library, Reviewer,
  and import verification completed without changing the Gate A/B geometry or
  reviewed-candidate behavior.
- Focused Wave C verification passed: **T13 1 file / 4 tests, T14 5 files /
  25 tests, and T15 3 files / 12 tests**. The recorder suite was intentionally
  rerun in T14; the focused runs covered recorder, store, timing, metrics,
  format, Shell, HUD, and map contracts.
- Full Capture-family regression passed: **37 files / 183 tests** across
  Capture, Capture Sync, Capture Review, and Capture Import. The explicit
  Capture Library subset passed **3 files / 11 tests**, including exact campus
  visibility and mismatched-campus exclusion.
- Explicit Gate A/B regression passed: **5 files / 47 tests**, covering
  candidate geometry, Reviewer editing, Reviewer hydration, import adapter,
  and grouped import history.
- Changed-file lint passed with no output. Broader scoped lint retains the
  documented pre-existing five errors and one warning in the HUD clock,
  direction hook, and Reviewer loading code.
- Repository typecheck retains one documented pre-existing syntax error in
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts`; no Wave C
  source error was reported. Elevated production build passed compilation,
  page-data collection, static generation (**40/40**), and final optimization;
  only the existing middleware convention warning remains.
- Non-elevated Vitest/build attempts were blocked by Windows `spawn EPERM`;
  elevated reruns supplied the passing evidence. Graphify refresh remains
  blocked by `[WinError 5] Access is denied`; no generated graph output was
  edited.
- No deployment or physical-phone validation was performed in this gate.
  Final release validation remains pending and Wave D/F are intentionally not
  started.

### 2026-09-01 — Phase 6R Wave D authorization and audit baseline

- Gate C was approved. Wave D is the only authorized implementation scope;
  deployment and physical-phone validation remain deferred until after Gate D.
- Audited the current Capture UI: `CaptureLiveHud` is an absolute top overlay,
  actions are a separate bottom section, and `NavigationMap` refits bounds on
  every `bounds` change. The narrow Capture CSS already hides the sidebar and
  context; the generic admin header remains the remaining Capture-specific
  chrome candidate.
- Wave D plan now covers T17 RED tests, T18 provider-neutral camera policy,
  T19 additive map-boundary/camera control integration, T20 merged bottom HUD
  and responsive shell treatment, and T21 Gate D verification.
- UI/UX design-system search was attempted, but the catalog path contained a
  pointer to a missing script. The concrete UI checklist is therefore applied
  directly: map-first layout, semantic NAVI tokens, 44 px touch targets,
  safe-area padding, no overflow, accessible labels, and preserved desktop
  chrome.

### 2026-09-01 — Phase 6R Wave D T17 RED checkpoint

- Added RED contracts for the merged bottom HUD, Preparing/Recording/Paused
  action visibility, compact metrics, non-red Pause/Resume, outdoor-safe
  touch targets, Capture camera Follow behavior, Recenter, zoom preservation,
  cleanup, and the additive NavigationMap bounds opt-out.
- The initial non-elevated run hit the known Vitest `spawn EPERM` startup
  failure. The identical elevated run reached the tests: existing map cleanup
  and default bounds behavior passed; 4 HUD assertions failed, 1 Capture
  bounds opt-out assertion failed, and the new camera suite correctly failed
  because its not-yet-created production module is absent.
- No production source, Supabase data/schema/RLS, compiler/runtime, shared
  navigation behavior, or downstream Reviewer/import behavior was changed at
  the RED checkpoint.
- Next: implement the provider-neutral Capture camera policy and verify its
  pure contracts before integrating the map control or HUD.

### 2026-09-01 — Phase 6R Wave D T18

- Added `camera.ts` with a provider-neutral Capture camera controller. It
  registers one `dragstart` listener, turns Follow OFF on manual pan, follows
  new live positions with center-only `easeTo`, explicitly recenters and
  re-enables Follow, ignores missing positions, and removes the listener on
  teardown.
- Focused verification passed: **1 file / 7 tests**.
- The required Graphify refresh returned the known Windows `[WinError 5]
  Access is denied`; no generated graph output was edited.
- Next: add the shared NavigationMap opt-out and Capture-local Recenter
  control, then verify real map-boundary behavior.

### 2026-09-01 — Phase 6R Wave D T19

- Added the additive `NavigationMap.fitBoundsOnChange` prop, defaulting to
  `true`; existing map consumers retain their bounds behavior while Capture
  disables repeated bounds refits.
- Added `CaptureMapCamera`, connecting the tested camera controller to the
  existing NavigationMap context. The accessible Recenter control is 44 × 44,
  exposes Follow state, remains disabled without a live position, and is
  available inside the Capture map for Preparing, Recording, and Paused.
- Focused verification passed: **3 files / 12 tests** for camera policy,
  camera control, and shared NavigationMap defaults/opt-out.
- The required Graphify refresh returned the known Windows `[WinError 5]
  Access is denied`; no generated graph output was edited.
- Next: replace the split Capture HUD with the compact merged bottom surface
  and apply Capture-only narrow chrome changes.

### 2026-09-01 — Phase 6R Wave D T20

- Replaced the absolute top Capture metrics overlay plus separate action
  section with one merged bottom HUD below the map. Preparing now shows only
  readiness/accuracy, Marker, and Start; Recording/Paused retain compact
  active time, distance, and de-emphasized sample count with their correct
  labeled actions.
- Pause uses a blue/neutral treatment, Resume uses the existing primary blue,
  Finish remains the existing safe green action, and all primary controls are
  48 px high with safe-area padding and no icon-only action semantics.
- Removed duplicate status/sample content from the local Capture header and
  scoped narrow admin-header removal plus MapLibre zoom-control sizing to the
  Capture screen. Desktop admin chrome remains unchanged.
- Focused verification passed: **5 files / 21 tests** for HUD, camera control,
  camera policy, NavigationMap bounds behavior, and layer cleanup.
- The required Graphify refresh returned the known Windows `[WinError 5]
  Access is denied`; no generated graph output was edited.
- Next: run the complete Gate D regression, lint, build, and available browser
  QA, then stop before Wave E.

### 2026-09-01 — Phase 6R Wave D T21 / Gate D verification

- Final focused Wave D verification passed: **5 files / 21 tests**, including
  merged HUD state/action contracts, 44 px touch-target coverage, camera
  Follow/manual-pan/recenter/zoom-preservation behavior, cleanup, and the
  NavigationMap bounds opt-out.
- Final full Capture-family regression passed: **39 files / 194 tests** across
  Capture, Capture Sync, Capture Review, and Capture Import. Explicit Gate A/B
  regression passed **5 files / 47 tests**. Capture Library campus/provenance
  regression passed **3 files / 11 tests**.
- Targeted lint has no new Wave D camera findings after dependency cleanup. The
  known HUD timer-effect error and unused `LatLng` warning remain, as does the
  pre-existing runtime test syntax error in repository typecheck.
- Elevated production build passed compilation, page-data collection, static
  generation (**40/40**), and final optimization. The existing middleware
  convention warning remains.
- Playwright smoke reached `/login` with HTTP 200 at **390x844** and desktop;
  no overflow was reported. Protected Capture HUD interaction could not be
  exercised without an authenticated browser session. No deployment or
  physical-phone validation was performed, as required for this gate.
- Required Graphify refresh again hit Windows `[WinError 5] Access is denied`;
  no generated graph output or unrelated dirty-checkout files were edited.
- Gate D implementation is complete and awaiting review. Wave E/F remain
  pending and were not started.

### 2026-09-02 — Phase 6R Wave E T22/T23

- Gate D approval was received. Wave E is the only active implementation
  scope; no intermediate A–D deployment or Wave F work was started.
- Added and executed the T22 RED checkpoint: **6 files / 36 tests**, with
  **12 intended failures / 24 existing passes** for absent orientation APIs,
  smoothing, narrow cone, orientation control, and Preparing-only permission
  behavior.
- Implemented T23 heading validation helpers: finite normalization, shortest
  circular delta, configurable smoothing/deadband, and device-event smoothing
  while preserving the existing device/GPS/fallback source priority and raw
  sample metadata.
- T23 focused verification passed: **2 files / 13 tests** for heading math,
  source priority, invalid values, existing direction permissions, and narrow
  cone constants. The required Graphify refresh did not complete successfully
  and remains an environment limitation; no generated graph output was edited.
- Next: extend the Capture camera controller with independent orientation and
  bearing ownership, then integrate the orientation control and cone.

### 2026-09-02 — Phase 6R Wave E T24

- Extended the provider-neutral Capture camera controller with independent
  `north-up` / `heading-up` state, validated heading updates, configurable
  circular smoothing/deadband, bearing-only updates, composed center+bearing
  updates, Follow-OFF rotation behavior, and Recenter orientation
  preservation. The controller never supplies a zoom override.
- T24 focused verification passed: **2 files / 15 tests** for the existing
  Follow/center contracts and the new North-Up/Heading-Up camera contracts.
- The exact installed MapLibre API convention was verified from the local
  MapLibre source: bearing is measured counter-clockwise from north and the
  transform rotates map points by the negative bearing, so a device heading
  maps to the same numeric MapLibre bearing to keep that heading screen-up.
- Required Graphify refresh remains unavailable under the recorded Windows
  access limitation; no generated graph output was edited.
- Next: integrate the camera extension into the Capture map, add the
  accessible orientation control and Preparing-only permission UX, and refine
  the heading cone.

### 2026-09-02 — Phase 6R Wave E T25

- Integrated the independent orientation mode into the existing Capture map
  camera control. `CaptureMapCamera` keeps one controller instance, exposes a
  44 × 44 accessible orientation control, forwards the validated heading, and
  preserves Follow/Recenter behavior.
- Permission enablement is now a compact 32 px Preparing-only action; it is
  not rendered as a persistent direction block during Recording or Paused.
- Refined the display-only heading overlay to an 8 m radius / 14° half-angle
  cone with a 7 m subtle arrow line and low opacity. The existing location dot,
  raw trace, candidate trace, markers, and layer cleanup remain separate.
- The smoothed display heading is used for cone rendering without changing raw
  GPS samples or capture geometry. The geographic heading is retained once so
  the same Heading-Up camera bearing keeps the cone screen-forward without
  double rotation.
- T25 focused verification passed: **7 files / 42 tests** for direction math,
  source priority, orientation camera/control, permission UX, camera Follow,
  and cone behavior. Required Graphify refresh again failed with the recorded
  Windows access limitation; no generated graph output was edited.
- Next: run all Wave A–E regressions, lint/build, boundary checks, and genuine
  authenticated browser/physical-heading QA if available, then stop at Gate E.

### 2026-09-02 — Phase 6R Wave E T26 / Gate E verification

- Wave E focused verification passed: **7 files / 42 tests** covering heading
  validation/source priority, circular smoothing/deadband, narrow cone and
  no-double-rotation behavior, independent orientation camera state, Follow
  separation, orientation control, Preparing-only permission UX, and retained
  Wave D camera/HUD contracts.
- Explicit Gate A/B regression passed: **5 files / 47 tests**. Full Capture,
  Capture Sync, Capture Review, and Capture Import regression passed: **41 files
  / 209 tests**. Capture Library campus/provenance regression passed: **3 files
  / 11 tests**.
- Elevated production build passed compilation, page-data collection, static
  generation (**40/40**), and final optimization. The existing middleware
  convention warning remains. Targeted lint and repository typecheck retain
  only the previously recorded baseline findings; no new Wave E finding was
  introduced.
- Local MapLibre source verification confirms bearing is measured
  counter-clockwise from north and the transform applies the negative bearing;
  the implementation therefore uses the same normalized heading value as the
  MapLibre bearing and keeps the geographic cone single-rotated.
- Authenticated browser QA is **PENDING**: the available local Playwright smoke
  only reaches `/login` for the protected `/capture` route, so no authenticated
  HUD/orientation interaction was claimed. Physical heading QA is **PENDING**:
  no deployment or real phone validation was performed at Gate E.
- Required Graphify refresh remains blocked by Windows `[WinError 5] Access is
  denied`; no generated graph output or unrelated dirty-checkout files were
  edited. Wave F was not started.
- Gate E is complete for automated verification and awaiting review. Next:
  review Gate E, then deploy Waves A–E together for one authenticated browser and
  physical-phone validation before any Wave F work.

### 2026-09-02 — Phase 6R implementation acceptance / T27 authorized

- The Gate E implementation portion is accepted. Final Phase 6R remains
  **PARTIAL / HOLD** until authenticated browser QA and physical-phone compass
  QA succeed. No additional Phase 6R production changes are authorized for this
  step, and Wave F remains blocked.
- T27 scope is limited to one Vercel test deployment containing Waves A–E and a
  dedicated field-validation checklist. The checklist covers authenticated
  desktop Capture controls, stationary phone heading, walking with Follow and
  Heading-Up, heading degradation/fallback, and recording-integrity inspection
  after camera manipulation.
- Deployment must use the existing `navi-next` Vercel project link and remote
  environment configuration without printing or committing credentials. No
  Supabase schema/RLS/data changes, diagnostic-row repair, or intermediate A–D
  deployment is permitted.

### 2026-09-02 — Phase 6R T27 deployment / field-validation gate prepared

- The existing linked Vercel project was used from
  `C:\Users\Administrator\Desktop\CODEme\Navi\navi-next`. One preview/test
  deployment was created for Waves A–E:
  `https://navi-next-cd3z28z0e-navi01.vercel.app`
- Vercel inspection reports target **preview**, status **Ready**, deployment
  `dpl_62yQDgho2ERfgBGugPhBLTEzF42S`, and the remote build generated **40/40**
  pages. The preview was not promoted to production.
- Protected-route smoke through `vercel curl /capture` reached the deployment
  and returned its authentication redirect. Authenticated Capture interaction
  is therefore still pending; no authentication bypass was used.
- The remote install reported **8 high-severity npm audit advisories** and
  pending install-script approval notices. No dependency or security cleanup
  was made because it is outside the authorized Phase 6R scope; these remain
  release observations for a separate review.
- The detailed authenticated desktop, stationary-phone, walking-phone,
  heading-degradation, and recording-integrity checklist is now in the Phase 6R
  plan. Wave F remains blocked and final Phase 6R remains **PARTIAL / HOLD**.

### 2026-09-02 — Phase 6R Wave E visual correction T28/T29

- Recorded the approved visual-correction spec and plan at
  `spec/NAVI-CAPTURE-PHASE6R-WAVE-E-VISUAL-CORRECTION.md` and
  `plan/NAVI-CAPTURE-PHASE6R-WAVE-E-VISUAL-CORRECTION.md`; the visible
  `TODO.md` checklist has exactly one active implementation task.
- Added the T29 RED contracts for a single short geographic heading glow,
  tapered transparent gradient, blur, geographic anchoring, and removal of the
  old polygon/arrow layers. The elevated run executed **2 files / 13 tests**
  with **5 intended failures / 8 existing passes**; no production code changed
  before this checkpoint.
- The managed Vitest attempt again hit the established Windows `spawn EPERM`
  startup boundary; the elevated rerun supplied the actual RED evidence.
- Next: implement the geographic LineString glow, then add the independent
  display-position-stability RED/GREEN cycle. Wave F remains blocked.

### 2026-09-02 — Phase 6R Wave E visual correction T30

- Replaced the Capture direction polygon and arrow with one short geographic
  LineString glow. The line is 4 m long (half the previous 8 m cone radius),
  narrow, blurred, and rendered by a tapered `line-gradient` from 0.66 opacity
  at the live display origin to fully transparent at the far edge. The source
  enables MapLibre `lineMetrics`; `line-cap` remains in layout.
- Updated direction data and cleanup so no Capture fill/polygon or arrow layer
  remains. The existing green location dot, geographic heading, North-Up /
  Heading-Up camera behavior, no-heading fallback, raw samples, candidate route,
  and HUD were not changed.
- Focused GREEN verification passed: **3 files / 17 tests** for direction
  geometry, hook behavior, and MapLibre layer construction/cleanup.
- Next: add and run the display-position-stability RED contracts before wiring
  the stabilized target into RecordingMap. Wave F remains blocked.

### 2026-09-02 — Phase 6R Wave E visual correction T31

- Added deterministic RED coverage for stationary GPS jitter, accuracy-aware
  deadband behavior, repeated movement acceptance, sustained backward movement,
  poor-accuracy caution, good-quality responsiveness, and raw/candidate
  immutability. The elevated run reached the intended missing
  `../display-position` module failure; no production source changed before
  the checkpoint.
- Next: implement the minimal display-position stabilizer and feed its accepted
  coordinate into the existing Capture map target. Wave F remains blocked.

### 2026-09-02 — Phase 6R Wave E visual correction T32/T33 — updated Gate E report

- Implemented the display-only location stabilizer in
  `navi-next/src/features/capture/display-position.ts`. It retains the last
  accepted display coordinate, applies a minimum plus accuracy-scaled stationary
  deadband, confirms uncertain displacement across a consistent direction, and
  immediately accepts good-accuracy fixes with credible speed. It does not
  average coordinates, replace the existing 250 ms `easeTo` transition, or
  mutate `RawGpsSample[]` / `CandidateRoute` data.
- Integrated that accepted coordinate into the current-location point, the
  geographic heading glow, and Capture camera Follow/Recenter. The latest raw
  fix remains the source for heading/status and marker data; the bottom HUD and
  Preparing/Recording/Paused semantics were not redesigned.
- The heading visual is now one 4 m geographic LineString with a 12 px rounded,
  blurred MapLibre line and a `line-progress` gradient from 0.66 opacity at the
  origin to transparent at the far edge. The green point is composited above
  the glow. No polygon, fill, outline, center line, or legacy direction layer
  remains in the Capture production path.
- Focused Wave E verification passed: **6 files / 40 tests**. The complete
  Capture directory passed: **18 files / 102 tests**. Scoped lint for all
  touched Capture source/tests exited 0 with no warnings.
- Elevated production build passed compilation, page-data collection, static
  generation (**40/40**), and optimization. The existing middleware convention
  warning remains. Standalone typecheck still reports only the recorded
  pre-existing missing `}` at
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)`.
  Full-repository lint remains the dirty-checkout baseline (generated `.next`
  bundles and unrelated legacy findings; **2,161 errors / 20,356 warnings**),
  with no finding in the touched Wave E files.
- Local authenticated dev-browser smoke used the visible Mock Auth control and
  a mocked location at **390 × 844**. `wave-e-capture-new-session.png` confirms
  no-heading hiding and unchanged bottom HUD. After a fresh absolute heading,
  `wave-e-capture-heading-glow-zoomed.png` shows the short narrow blue streak
  attached to the green dot without a triangle, border, or center line.
  `wave-e-capture-heading-up.png` confirms the map rotation/control transition.
  These screenshots are local browser evidence, not physical-phone evidence.
- Required `graphify update .` was attempted after the final source change and
  again failed with Windows `[WinError 5] Access is denied`; no generated graph
  output was manually edited. Physical-phone validation of stationary drift,
  walking responsiveness, and compass behavior remains **PENDING**. Updated
  Gate E status: **AUTOMATED GREEN / LOCAL VISUAL SMOKE PASS / PHYSICAL PHONE
  PENDING**. Wave F remains blocked.

### 2026-09-02 — Phase 6R Wave E visual correction T33 final retest

- Added the final composition guard so an expired/unreliable resolved heading
  cannot leave a stale smoothed heading rendering the glow. Post-guard focused
  verification remains **6 files / 40 tests**, complete Capture regression
  remains **18 files / 102 tests**, scoped touched-file lint exits 0, and the
  production build generates **40/40** pages.
- The authenticated local 390 × 844 smoke was repeated against the final source:
  no-heading state hid the glow, a fresh heading produced the short glow, the
  Heading-Up control switched to `Use North-Up`, and a map drag/recenter cycle
  reported Follow `false` then `true`. Final screenshot artifacts are under
  `navi-next/audit-artifacts/wave-e-final-*.png`.
- Final Graphify refresh was attempted after this guard and retained the same
  Windows `[WinError 5] Access is denied` limitation. Physical-phone visual
  and stationary-drift validation remains pending; Wave F remains blocked.

### 2026-09-02 — Phase 6R Quick Capture arrow correction T34/T35

- Locked the attached physical-phone arrow reference and the pasted quick-fix
  request in `spec/NAVI-CAPTURE-PHASE6R-QUICK-ARROW-CORRECTION.md`, with the
  implementation plan in `plan/NAVI-CAPTURE-PHASE6R-QUICK-ARROW-CORRECTION.md`
  and the superpowers plan under `docs/superpowers/plans/`.
- Added RED contracts for a geographic Point arrow, compact MapLibre symbol
  layer, map-aligned rotation, live-coordinate anchoring, no-heading hiding,
  removal of glow/gradient/`lineMetrics`, and green-dot layer order.
- Focused RED verification passed its intended boundary: **3 files / 17
  tests**, with **7 expected arrow failures** and **10 existing assertions
  passing**. No production source changed at this checkpoint.
- Next: replace the old Capture glow construction with the single arrow icon
  and symbol layer, preserving the already-accepted GPS stabilizer and camera
  behavior. Wave F remains blocked.

### 2026-09-02 — Phase 6R Quick Capture arrow correction T36

- Replaced the Capture glow with one compact hollow blue arrow icon registered
  through MapLibre and one `symbol` layer. The geographic Point remains at the
  stabilized display coordinate; its normalized heading is consumed by
  map-aligned `icon-rotate`, so North-Up and Heading-Up retain one rotation
  owner.
- Removed the Capture glow field/layer/style and the direction source's
  `lineMetrics` option. The green location point remains above the arrow. The
  existing heading resolver/smoother, stale-heading guard, GPS display
  deadband, camera transition, raw samples, candidate route, markers, sync,
  import, Reviewer, Studio, and bottom HUD were not changed.
- Focused GREEN verification passed: **3 files / 17 tests**.
- Next: complete the Gate E regression/static/build/local-visual verification;
  physical-phone validation remains the final external check. Wave F remains
  blocked.

### 2026-09-02 — Phase 6R Quick Capture arrow correction T37 — updated Gate E report

- Final Capture direction construction is now arrow-only. `direction.ts`
  returns one normalized-heading Point at the stabilized display coordinate;
  `RecordingMap.tsx` registers a deterministic 32×40 hollow blue icon and
  renders one compact `symbol` layer with `icon-anchor: bottom`, geographic
  `icon-rotate: ['get', 'heading']`, and map rotation alignment. The green
  location layer remains above it.
- Removed the old Capture glow field, LineString construction, gradient/blur
  styling, glow layer identifier, polygon/center-line path, and `lineMetrics`.
  No heading produces an empty arrow collection. The existing resolver,
  circular heading smoothing, stale-heading guard, North-Up/Heading-Up camera
  controller, Follow/Recenter behavior, 250 ms movement transition, and
  display-position stabilizer remain unchanged. Raw GPS samples, candidate
  route geometry, markers, import/sync, Reviewer, Studio, and bottom HUD were
  not changed.
- Deterministic verification: focused arrow tests **3 files / 17 tests**;
  complete Capture regression **42 files / 218 tests**; scoped ESLint clean.
  Production build compiled and generated **40/40** static pages. Repository
  TypeScript remains blocked only by the recorded unrelated runtime-test
  syntax error; Next's existing middleware deprecation warning remains.
- Local visual evidence at 390×844 is under
  `navi-next/audit-artifacts/wave-e-arrow-*.png`: no-heading dot-only,
  North-Up arrow, east-heading North-Up, Heading-Up cancellation, pan with
  Follow OFF, and Recenter. All probes reported no browser console errors.
  The arrow reads as a small outlined blue directional arrow directly above
  the green dot, not a triangle or radar wedge. These are local screenshots,
  not physical-phone validation.
- `graphify update .` completed successfully and rebuilt the managed graph
  output. Updated Gate E status: **AUTOMATED GREEN / LOCAL VISUAL SMOKE PASS /
  PHYSICAL PHONE PENDING**. Wave F remains blocked and was not started.

### 2026-09-02 — Controlled road-tool connection editing investigation (T1–T5)

- Traced the admin Studio `Edit Road` path from the Road inspector through
  `road.edit`, `useVertexEditor`, `entity.update`, `document.changed`,
  `GraphAdapter`, and the legacy graph projection. The vertex editor writes the
  raw cursor coordinate; it does not call a road snap helper.
- Confirmed the likely bug in legacy graph rebuilding: `Graph.syncTraceIntersections`
  projects an edited/new trace endpoint to the first qualifying segment within
  5 m, marks a shared `connectionNode`, and splits the other route. It also
  creates junctions for exact X crossings without an authored connection. The
  endpoint loop does not globally choose the nearest target, and its `break`
  exits only the segment loop, allowing later chains to be considered.
- Confirmed a second path: new-road creation uses the same 5 m endpoint snap.
  The core/floor-editor `SnapEngine` is a separate 10 m visual indicator and is
  not the Studio Road vertex-drag commit path.
- Classified the supplied evidence: the orange/grey handles are vertex-editor
  controls; the additional screenshot shows roads rendered below building
  fills/outlines and does not prove a persisted junction because it has no edit
  handles or connection marker.
- Verification: elevated focused Vitest run started successfully. Studio vertex
  drag, road-snap, legacy trace-intersection, and GraphAdapter scope passed:
  **4 files / 33 tests**. The separate compiler road-junction file has **2
  existing fixture-success failures** and was retained as a baseline limitation.
  Scoped `git diff --check` passed; no product source, test, map data, or browser
  state was changed for this investigation.
- Recommendation: make manual road editing non-snapping by default; expose
  opt-in endpoint/segment snapping with a visible target preview and explicit
  confirmation; persist authored junctions separately from geometry; treat
  exact crossings as visual unless confirmed; choose one nearest eligible target;
  add undo/cancel and validation warnings. Separately adjust road/building layer
  order or hit-testing so building overlays do not obscure roads.
- Next: implement only after approval, beginning with characterization tests for
  no implicit 5 m T-junction, no implicit X-crossing, explicit connection, and
  source-road/save-reload preservation.

### 2026-09-04 — NAVI route connectivity live audit (T1–T7)

- Completed the investigation-only audit of the reported `/routes` failure for
  campus `map-map-1-k6bv`; no production source, road geometry, Supabase data,
  published data, or test behavior was intentionally changed.
- Verified through the live route UI that `N2016 — secondary road Node` to
  `N1977 — main road Node` produces no `Route Found` result. The live runtime
  source is `/api/public-campus` with `source: graph_snapshots` (108 nodes,
  99 edges); `/api/published-map` returns 404 for this campus.
- Verified the main and secondary traces intersect once geometrically, within
  approximately 0.045 m of both the target threshold and the pre-seeded
  junction. The graph nevertheless has 9 components: `N0041` has degree 1,
  `N2016` has degree 2, and the only bridge is a zero-length endpoint link;
  the main-road edge is not split.
- Root cause traced to the legacy Studio/GraphAdapter projection: a pre-seeded
  junction carries plural `metadata.traceIds`, chain reconstruction requires a
  singular `metadata.traceId`, and the existing-junction branch updates metadata
  without splitting the target edge. A* correctly uses edges only and returns
  no path across the two road components; the direct cross-product check found
  0 reachable pairs of 310.
- Classified compiler V2 normalization/serialization and road-tool
  preview-versus-commit snapping as real authority gaps, but not the immediate
  cause of this live incident. The focused legacy engine suite passed 3 files /
  35 tests. The existing compiler junction suite remains a baseline limitation:
  1 test passed and 2 failed at `result.success` before junction assertions.
- Evidence report: `audit-artifacts/route-connectivity-live-audit/REPORT.md`.
  Recommendation is to authorize a narrow persisted-junction topology
  characterization/fix first, then separately scope snapping alignment and
  compiler/publish authority unification.

### 2026-09-04 — NAVI persisted junction topology fix (T1–T5)

- Added the persisted/pre-seeded RoadJunction characterization before the
  production change, captured the expected RED behavior, then inverted it
  after the fix. The final regression covers plural `traceIds`, stable IDs,
  target-edge splitting, 3-road T, X, multiple ordered junctions, A*, reload,
  exact road-coordinate preservation, and Keep Separate behavior.
- Updated `Graph.syncTraceIntersections` to include shared junctions in each
  participating chain by plural trace membership and polyline position. The
  ordered chain now splits authored edges through the existing persisted node;
  the endpoint branch preserves the narrow separate endpoint/junction model
  without assigning a false singular trace ID or broad zero-length cleanup.
- Live campus `map-map-1-k6bv` was regenerated through the normal Studio
  beforeunload/save path without road edits. `/routes` now reports
  `N3688 → N0041 → N3638` as `Route Found` (3 nodes); N0041 changed from
  degree 1 to degree 3, the graph changed from 9 to 1 connected component,
  and the main edge is split on both sides of N0041.
- Verification: protected/new Vitest **11 files / 101 tests passed**;
  scoped ESLint **0 errors / 1 pre-existing warning**. The required
  `graphify update .` still fails with the logged managed Windows
  `[WinError 5] Access is denied`; generated graph output was not edited.
- Immediate incident gate: **safe to close**. Compiler/runtime unification,
  snapshot schema work, SeparatedCrossing persistence, and road-tool
  preview/commit snapping remain separate follow-up decisions.

### 2026-09-04 — NAVI connectivity architecture decision audit (T1–T5)

- Completed the investigation-only architecture audit of the CampusDocument,
  GraphAdapter/graph_snapshots, Compiler V2/published_maps, PublishedCampus,
  package loader, runtime A*, and road-tool preview/commit boundaries.
- Confirmed that RoadJunction survives the current Studio graph path only via
  graph-node metadata, while SeparatedCrossing is not carried by the RPC
  snapshot payload, is not reconstructed by createDocument, and is not part of
  the Compiler V2 normalized/published contract.
- Compared dual-authority, canonical-semantics, compiler-first, and sidecar
  alternatives. Recommendation: keep the incident fix closed, do not start
  compiler unification now, and separately evaluate a canonical authored
  connectivity semantics/materialization contract with topology parity gates.
- Added the report at
  `audit-artifacts/connectivity-architecture-decision-audit/REPORT.md`.
- Verification: focused Vitest **3 files / 39 tests passed**; report exists
  with the expected decision sections; scoped status shows only the audit
  report/spec/plan and TODO documentation changes from this task. No
  production code, generated graph, or campus data was modified.

### 2026-09-05 — NAVI Phase 6B recovery baseline and audit (T1)

- Queried the project graph before source inspection and audited the uncommitted
  Phase 6B production/test changes without discarding unrelated work.
- Baseline focused gate: **10 files / 128 tests passed; 3 files / 5 tests
  failed**, consisting of two invalid close-crossing fixtures, one parity
  helper argument error, one legacy fixture interference failure, and the two
  pre-existing compiler road-junction failures recorded in `errors/ERRORS.md`.
- Baseline full gate: **413 files passed; 14 files failed; 4,584 tests passed,
  25 failed, 8 skipped** in the dirty checkout. The failures are retained as
  baseline evidence and will be reclassified after the focused corrections.
- Root causes selected for implementation: pair-wide separated-crossing
  normalization/graph gating, early graph version stamping, and incompatible
  `addTraceWithCompile` argument handling. T1 is complete.

### 2026-09-05 — NAVI Phase 6B semantic/order correction (T2–T4)

- Added the shared position-aware separation predicate using the centralized
  0.5 m route-network tolerance. Core normalization now preserves multiple
  separated records for the same road pair at distinct positions.
- Graph compilation now receives explicit `allowGeometricInference` intent;
  modern documents compile with inference disabled, legacy documents infer and
  materialize before the persisted version is stamped, and the old
  `roomNodes` argument form remains supported.
- Compiler V2 normalization/skeleton generation and legacy graph crossing
  detection now use position-specific separation semantics.
- Repaired Phase 6B fixtures and parity helpers: valid two-crossing geometry,
  unique authored endpoint resolution, P1/P2 topology assertions, modern
  geometry-only rejection, and legacy inference coverage.
- Verification so far: core semantics **20/20**, Phase 6B canonical contract
  **13/13**, ordering/contract pair **13/13**, cross-producer parity **12/12**,
  protected topology/normalizer group **59/59**, public-store **22/22**.
- `graphify update .` was retried and failed with the logged managed Windows
  `[WinError 5] Access is denied`; generated graph output remains untouched.

### 2026-09-05 — NAVI Phase 6B recovery gate (T5)

- Completed the Phase 6B gate report at
  `progress/PHASE-6B-GATE-REPORT.md`; the scoped audit classifies the
  connectivity/compiler/editor changes as REVISE → KEEP, test-only changes as
  TEST-ONLY, and unrelated dirty-checkout changes as KEEP / OUT OF SCOPE.
- Final focused evidence remains green: 14 files / 148 tests in the protected
  gate, 13/13 canonical, 12/12 parity, 20/20 core semantics, and 3 store/editor
  files / 39 tests in the final smoke group. Public-store failures were not
  reproducible (22/22 standalone).
- Full Vitest completed at 416 files passed / 12 failed and 4,594 tests passed /
  22 failed / 8 skipped; remaining failures are the documented dirty-checkout
  baseline. Repository TypeScript remains blocked by the pre-existing runtime
  test syntax error. Target production ESLint has 0 errors and 4 existing
  warnings.
- The final required `graphify update .` retry again hit managed Windows
  `[WinError 5] Access is denied`; generated graph output was not edited.
- T5 is complete. Phase 7 was not started.

### 2026-09-06 — NAVI Phase 7B publish contract hardening (T2–T5)

- Characterized and documented the publish contract: CampusDocument.version is
  source revision; DocumentStore.version is a separate editor transaction
  counter; graph_snapshots.version and NavigationGraph.version are schema-like
  values and cannot establish source correspondence. Snapshot matching is NO;
  SAME DOCUMENT is the selected strategy.
- Added RED tests for compiler provenance/components/doors, compile and compiler
  adapter field preservation, monotonic publish behavior, public endpoint
  compatibility, and public-store door hydration.
- Compiler V2 now emits campusId, connectivitySemanticsVersion when authored,
  compilerVersion, revision/sourceDocumentVersion, compiledAt, same-document
  components, and same-document doors. Adapters and the compile endpoint carry
  additive fields through.
- Publish now validates campus/revision provenance, stops reading
  graph_snapshots, and uses a conditional update/equal-update/insert-retry
  writer. Older revisions return 409 before local files are written; equal
  revisions replace deterministically; newer revisions publish.
- Public endpoint/store now return and hydrate doors while preserving empty
  defaults for old artifacts.
- Verification: Phase 7B focused suite is 6 files / 11 tests passed. Repository
  typecheck remains blocked only by the documented unrelated runtime test
  syntax error at data-identity-comparison.test.ts:255.

### 2026-09-06 — NAVI Phase 7B publish contract hardening (T6 final gate)

- Protected regression evidence is green: 9 files / 193 tests, 9 files / 104
  tests, 10 files / 137 tests, and 5 files / 70 tests passed across the
  Phase 1–6 compiler, map, editor, routing, semantics, and parity gates.
- Targeted ESLint over all changed production and test files reports zero
  diagnostics. Repository TypeScript still stops at the pre-existing parser
  error in packages/runtime/src/__tests__/data-identity-comparison.test.ts:255;
  no Phase 7B diagnostic was emitted before that stop.
- Latest full Vitest result is 443 files total: 430 passed / 13 failed, with
  4,648 tests passed / 24 failed / 8 skipped. The accepted dirty-checkout
  baseline is 4,606 passed / 22 known failures / 8 skipped; current failures
  overlap the documented missing fixture, compiler fixture, runtime/editor
  topology, route characterization, and public UI families, and no Phase 7B
  test failed.
- Required Graphify refresh was attempted and remains blocked by the managed
  Windows permission boundary ([WinError 5] Access is denied); generated
  graph output was not edited.
- Completed the gate report at progress/PHASE-7B-GATE-REPORT.md. Verdict:
  Phase 7B PASS; Phase 7 PASS WITH DEFERRED AUTHORIZATION RISK; Phase 8 NOT
  STARTED. The publish API still needs authenticated campus ownership checks
  before production publishing is considered safe.

### 2026-09-06 — NAVI Phase 8B publish artifact validation (T1)

- Read the Phase 8A audit and confirmed the implementation boundary:
  NavigationArtifacts are structurally unchecked after compilation, while
  request/provenance checks already precede the revision writer.
- Characterized zero behavior with 3 existing compiler suites: 3 files and
  87 tests passed. Finite non-negative edge values, including zero, remain
  allowed; the older standalone ZeroWeightRule is not reused as the Phase 8B
  publish policy.
- Characterized empty behavior: empty CampusDocuments compile successfully and
  empty graphs are intrinsically valid. No explicit unpublish/reset workflow
  exists, so normal publish will reject an empty incoming graph only when an
  existing published graph is non-empty.
- Confirmed Phase 7B component and door projections are same-document outputs
  with optional legacy relationships. Wrote the Phase 8B spec, named plan,
  superpowers plan, root plan section, and TODO checklist.
- Next: add the RED validator and fail-closed publish tests.

### 2026-09-06 — NAVI Phase 8B publish artifact validation (T2 RED)

- Added pure-validator RED coverage for valid artifacts, NaN/Infinity node
  positions, NaN/Infinity/negative/zero edge weights, dangling edges,
  duplicate nodes, graph campus identity, revision provenance, component and
  door references, exterior doors, and empty-graph warning behavior.
- Added publish-boundary RED coverage for non-finite coordinates, dangling
  edges, graph campus mismatch, empty R+1 replacement preservation, and valid
  R+1 publishing. The hostile coordinate fixture uses a request stub returning
  an object with NaN because standard JSON cannot encode NaN.
- RED evidence: the pure suite fails at the missing validator module; the
  publish suite has 4 intended failures (invalid payloads and empty
  replacement still return 200) and 2 existing pass cases.

### 2026-09-06 — NAVI Phase 8B publish artifact validation (T3)

- Added the pure runtime-safe validator at
  navi-next/packages/compiler/src/validation/artifact-validator.ts and exported
  it through the compiler package.
- The validator checks graph arrays, non-empty/unique node and edge IDs,
  finite node positions, dangling endpoints, finite non-negative edge
  weight/distance, graph bounding boxes, Phase 7 provenance parity,
  component/door placement references, optional exterior doors, and cheap
  index geometry numbers.
- Empty graphs remain valid and emit ARTIFACT_EMPTY_GRAPH; zero edge weights
  remain valid. Ordinary invalid input returns structured diagnostics without
  throwing or depending on persistence state.
- Verification: the pure validator suite passes 1 file / 16 tests.
- Next: enforce the validator and contextual empty-replacement rule in
  POST /api/publish.

### 2026-09-06 — NAVI Phase 8B publish artifact validation (T4–T5)

- Enforced `validateNavigationArtifacts` in `POST /api/publish` before the
  compiler metadata blob, Supabase writer, or local/demo file writes.
- Added the contextual empty-graph replacement guard: an empty R+1 cannot
  replace a known non-empty Supabase publication, while empty graphs remain
  valid for an explicit future reset/unpublish workflow.
- Fixed optional component/door adapter handling so omitted Phase 7 fields stay
  optional while explicit malformed values are rejected.
- Verification: final Phase 8B/publish group is 4 files / 31 tests passed;
  Phase 5–7 protected and public compatibility groups are all green.

### 2026-09-06 — NAVI Phase 8B publish artifact validation (T6 final gate)

- Added a real Compiler V2 artifact integration case to the pure validator
  suite; the validator suite is now 1 file / 17 tests passed.
- Final full Vitest result: 446 files; 4692 passed / 22 failed / 8 skipped,
  4722 tests total. No Phase 8B test failed; remaining failures are the
  established dirty-checkout fixture, routing/topology, and floor-editor UI
  characterization families.
- Phase 8B production/new-test ESLint is clean. Repository TypeScript remains
  blocked by the pre-existing parser error at
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`.
- The final required Graphify refresh again failed with managed Windows
  `[WinError 5] Access is denied`; generated graph output was not edited and
  the error is recorded in `errors/ERRORS.md`.
- Completed `navi-next/progress/PHASE-8B-GATE-REPORT.md`. Verdict: Phase 8B
  PASS; Phase 8 final PASS WITH DEFERRED PRODUCTION AUTHORIZATION BLOCKER;
  Phase 9 not started.

### 2026-09-06 — NAVI Phase 9B runtime source safety (T1 characterization)

- Read the Phase 9A audit and traced the exact public path:
  /api/public-campus → normalizePublicCampusResult →
  usePublicStore → public Explore/Navigate/Search/Route Testing/rendering.
- Confirmed published_maps is queried first, graph_snapshots is only reached
  through the endpoint, and /map/runtime remains a separate @navi/runtime
  demo path using /api/demo/artifacts.
- Confirmed the two Phase 9B gaps: published query errors collapse to null and
  trigger snapshot fallback; malformed published artifacts pass through without
  critical read validation. Confirmed public-store already preserves known-good
  state on failed refresh and replaces loaded bundles in one Zustand set.
- Wrote the Phase 9B spec, implementation plan, superpowers plan, root plan
  section, and TODO checklist.

### 2026-09-06 — NAVI Phase 9B runtime source safety (T2 RED)

- Added API source-selection tests for published FOUND, NOT_FOUND fallback,
  READ_ERROR, malformed published artifacts, legacy additive metadata omission,
  and unexpected lookup exceptions.
- RED evidence: 1 file / 6 tests; 3 intended failures. Found, not-found
  fallback, and legacy published reads pass; read errors and malformed rows
  still incorrectly return 200 through the current route.

### 2026-09-06 — NAVI Phase 9B runtime source safety (T4)

- Implemented explicit published lookup states in
  `navi-next/src/app/api/public-campus/route.ts`: FOUND, definitive
  NOT_FOUND, and ERROR are now distinct, and snapshot fallback is reachable
  only from NOT_FOUND.
- Published reads now use the shared artifact validator through a
  legacy-compatible read boundary (`requireProvenance: false`,
  `requireGraphCampusId: false`), with requested-campus identity checks for
  present campus IDs. Present but malformed artifacts fail closed.
- Read failures return stable generic `PUBLIC_CAMPUS_READ_FAILED` (503) or
  `PUBLIC_CAMPUS_ARTIFACT_INVALID` (500) responses without database/transport
  details. Snapshot query errors also fail closed instead of becoming empty.
- Verification: focused public-campus API compatibility and Phase 9B suite,
  2 files / 8 tests passed. The three prior RED cases are green.

### 2026-09-06 — NAVI Phase 9B runtime source safety (T5)

- Kept `public-store` production behavior unchanged: failed refreshes retain
  the known-good bundle, newer revisions replace all bundle fields in one
  hydration update, same revisions retain the existing bundle object, and
  campus switching replaces the graph, search, components, POI, floor,
  panorama, and QR data together.
- Confirmed the normal public pages and Route Testing continue to consume
  `usePublicStore`; `/map/runtime` remains the separate demo/runtime path.
- Verification: public-store/public-campus compatibility group, 4 files / 30
  tests passed; public consumer and route-testing group, 11 files / 142 tests
  passed. No public-store redesign was required.
- Required `graphify update .` was retried after the edits and again hit the
  managed Windows `[WinError 5] Access is denied` boundary; generated graph
  output was not changed and the failure is recorded in `errors/ERRORS.md`.

### 2026-09-06 — NAVI Phase 9B runtime source safety (T6 final gate)

- Final Phase 9B API/store/public compatibility group: 11 files / 70 tests
  passed. Public consumer and Route Testing group: 11 files / 142 tests
  passed.
- Protected gates passed: Phase 5–6/N0041/ghost 10 files / 123 tests;
  Phase 7 compiler/public 12 files / 221 tests; Phase 7 editor/rendering
  9 files / 104 tests; Phase 7 editor routing 2 files / 17 tests.
- Targeted ESLint passed with no diagnostics. Repository TypeScript still
  reports only the accepted unrelated TS1005 at
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`.
- Full Vitest: 453 files; 4736 passed / 22 failed / 8 skipped. The failure
  count is unchanged from the accepted Phase 8 baseline; no Phase 9B test
  failed. The current pass/file totals include additional tests now present in
  the checkout, including Phase 9B coverage.
- Wrote `navi-next/progress/PHASE-9B-GATE-REPORT.md`. Phase 9B verdict is
  PASS; Phase 9 final remains PASS WITH DEFERRED AUTHORIZATION BLOCKER;
  Phase 10 is explicitly not started and not ready.
- Fresh post-report verification: the final 11-file compatibility group
  remained 70/70 passed, and targeted ESLint remained clean.

### 2026-09-06 — NAVI Navigate compact View selector (T1 RED)

- Added a focused assertion to `NavigationCameraControls.test.tsx` requiring
  the compact View-selector class contract while retaining all existing mode
  and route-preview assertions.
- RED verification: 1 file / 4 tests ran; 3 passed and the intended View-size
  assertion failed against the current `min-h-11/min-w-11`, `px-3`, `text-sm`,
  and `rounded-xl` classes.
- Next: update only the existing View button presentation classes, then run the
  focused green test and scoped lint.

### 2026-09-06 — NAVI Navigate compact View selector (T2 GREEN)

- Updated only the existing View selector presentation in
  `navi-next/src/components/map/NavigationCameraControls.tsx`: compact height/
  width, spacing, radius, padding, typography, and chevron size.
- Focused verification: `NavigationCameraControls.test.tsx` passed 1 file / 4
  tests, including active Top/Follow/POV selection and Route Preview’s
  overview-only behavior.
- Recenter, Compass, camera policy/controller, and navigation state code were
  not changed.
- Next: run related camera tests, scoped lint, Graphify refresh, and browser
  evidence if available.

### 2026-09-06 — NAVI Navigate compact View selector (T3 FINAL)

- Focused camera verification passed: 2 files / 7 tests in
  `NavigationCameraControls.test.tsx` and `NavigationCamera.test.tsx`.
- Scoped ESLint passed with no diagnostics for the changed component and test.
- Browser verification passed on `http://localhost:3000/map/navigate` at a
  430×900 viewport: the View control rendered as `View: Top` at 94.34×40px;
  Recenter remained 44×44px; no browser console errors were captured.
- Screenshot evidence: `navi-next/test-results/navigate-view-control-compact.png`.
- Scoped `git diff --check` passed for product and workflow files. Git reported
  only expected LF-to-CRLF working-copy warnings for root markdown files.
- Required `graphify update .` remains blocked by the known managed Windows
  `[WinError 5] Access is denied` boundary; generated graph output was not
  edited and the failure is recorded in `errors/ERRORS.md`.
- Iteration scope is closed: no camera behavior, mode policy, Recenter,
  Compass, navigation state, or Phase 8C work was changed or started.

### 2026-09-06 — NAVI Navigate camera / heading UX audit (T2 GREEN)

- Preserved Capture's geographic Point/symbol arrow helper and image contract
  in `navi-next/src/lib/navigation-heading-arrow.ts`.
- Replaced Navigate's two hard `outer`/`inner` fill cones with one visual
  short rounded beam composed of compact translucent edge/core bands, using
  the existing normalized heading value.
- Updated `NavigationPositionMarker` to use the Navigate-only beam source and
  layers while retaining the current position dot/halo and stale-layer cleanup.
- Verification: `npm test -- --run
  src/lib/__tests__/navigation-heading-arrow.test.ts
  src/components/map/__tests__/NavigationPositionMarker.test.tsx
  src/features/capture/__tests__/RecordingMap.test.tsx
  src/features/capture/__tests__/direction.test.ts --reporter=dot` passed 4
  files / 22 tests.
- Required Graphify refresh again hit the managed Windows `[WinError 5]:
  Access is denied` boundary; generated graph output was not edited and the
  error is logged.
- Next: implement the explicit mode policy ceilings and approved Follow
  preset before changing the imperative controller.

### 2026-09-06 — NAVI Navigate camera / heading UX audit (T3 GREEN)

- Added explicit camera policy contracts in
  `navi-next/src/lib/navigation-camera-policy.ts`: TOP/FOLLOW/POV preferred
  zoom 16/18/19 and matching max ceilings, Follow pitch 55°, explicit
  heading-follow input with route-preview/explore forced free, and Follow pan
  suspension alongside POV.
- Preserved POV's existing 85° perspective and existing transition, compass,
  and stored-mode helpers.
- Verification: `npm test -- --run
  src/lib/__tests__/navigation-camera-policy.test.ts --reporter=dot` passed
  1 file / 13 tests.
- Required Graphify refresh again hit the managed Windows `[WinError 5]:
  Access is denied` boundary; generated graph output was not edited and the
  error is logged.
- Next: make the imperative controller deterministic and mode-aware without
  taking ownership of route/session state.

### 2026-09-06 — NAVI Navigate camera / heading UX audit (T4 GREEN)

- Extended `NavigationCameraController` with optional MapLibre stop/zoom
  surface, max-zoom ceilings, transition generation, duplicate-intent
  suppression, Follow gesture suspension, explicit heading-follow state,
  mode-aware recenter, and listener-safe cleanup.
- Updated `NavigationCamera` and the compact camera controls bridge to keep
  one heading-follow state and to synchronize externally selected modes.
- Fixed rapid View cycling with a local latest-selection ref; rapid clicks now
  emit successive modes before a parent rerender, while the controller stops
  the previous MapLibre transition when the mode changes.
- Verification: combined camera policy/controller/control/bridge run passed
  4 files / 35 tests.
- Required Graphify refresh again hit the managed Windows `[WinError 5]:
  Access is denied` boundary; generated graph output was not edited and the
  error is logged.
- Next: wire Navigate active start/Compass state while preserving Route
  Preview TOP-only and Phase 5 route/session flow.

### 2026-09-06 — NAVI Navigate camera / heading UX audit (T5/T6 FINAL)

- Wired the existing heading-follow policy through the active Navigate Compass
  control: explicit ON/OFF state, mode/View separation, route-preview
  overview-only behavior, and active Start/End flow preservation.
- Added deterministic controller safeguards: MapLibre transition stop/generation
  handling, last-selection-wins mode switching, mode ceilings TOP/FOLLOW/POV
  16/18/19, Follow 55° preset, gesture suspension, and mode-aware Recenter.
- Replaced Navigate's giant two-cone marker with the single short rounded/faded
  green beam while keeping Capture's symbol-arrow helper and heading resolver
  contract unchanged.
- Final protected gate: 21 files / 225 tests passed. Development simulation
  unit/component contracts: 3 files / 7 tests passed. Scoped ESLint and scoped
  `git diff --check` passed with no product diagnostics.
- Full Navigate page suite remains 18/19: the one failure is the pre-existing
  test mock expecting a `navigation-dev-panel` that the mocked ExploreMap does
  not render. Repository TypeScript remains blocked by the unrelated existing
  TS1005 at `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`.
- Browser QA reached localhost and produced shell screenshots, but the campus
  bootstrap returned no campus data after onboarding bypass, so live map
  interaction/screenshots for TOP/FOLLOW/POV were unavailable. The limitation
  and final Graphify `[WinError 5] Access is denied` refresh failure are logged.
- Audit closed. No Phase 8C, deployment, authoring, compiler, publisher, QR,
  panorama, route-cost, or route-progress work was started.

### 2026-09-07 — NAVI Heading-Up audit: Capture vs Navigate (read-only)

- Traced Capture sensor input, permission, GPS fallback, heading resolution,
  smoothing, camera controller, and MapLibre `easeTo({ bearing })` path.
- Traced Navigate through `useGeolocation` → `useNavigationHeading` → the
  shared Capture direction resolver → `NavigationContext` → `ExploreMap` →
  `NavigationCamera` → `NavigationCameraController`.
- Root finding: the current `navi-next` working tree still sends
  `headingFollowEnabled` and `onToggleHeadingFollow` from Navigate, but the
  current `NavigationCamera` bridge no longer accepts, forwards, or handles
  them. Its local selected mode is also initialized once and can remain TOP
  after Start selects another mode. The controller itself emits the expected
  bearing when called directly.
- Secondary ownership finding: `RouteLine.fitBounds`, route-preview
  controller `fitBounds`, and setup `NavigationMap.fitBounds` are separate
  camera writers at phase/route transitions; no active Navigate `requestAnimationFrame`
  bearing loop or direct `setBearing`/`rotateTo` writer was found.
- Verification: focused Capture/navigation/marker/controller run was 6/7
  files and 48/49 tests; only the `NavigationCamera` bridge assertion failed.
  Navigate page assertions were 18/19, with the existing simulator mock
  mismatch as the sole failure. No product code was changed in this audit.
- Next: await approval before implementing the smallest camera-bridge fix.

### 2026-09-07 — NAVI Navigate Heading-Up targeted fix (T1–T4)

- Restored the parent-authoritative `NavigationCamera` bridge for
  `headingFollowEnabled` and `onToggleHeadingFollow`; Compass toggles now call
  the controller and parent callback, and the controls default to OFF when no
  state is supplied.
- Removed the bridge’s duplicate local camera-mode selection so the parent’s
  TOP/FOLLOW/POV prop is authoritative across rerenders.
- Reused Capture’s `normalizeCaptureHeading` and `smoothCaptureHeading` inside
  the Navigate controller for live same-mode bearing updates, including
  shortest-angle 359°→1° handling. Explicit mode changes, Compass ON, and
  Recenter use the current normalized heading as the direct camera target.
- Added regression coverage for ON, OFF, indicator independence, OFF→ON,
  wraparound, parent mode sync, rapid mode transitions, and Recenter
  transition ownership.
- Verification: targeted camera/bridge/controller run passed 3 files / 29
  tests; protected Capture direction/camera run passed 5 files / 32 tests;
  Navigate support run passed 6 files / 92 tests, with the existing single
  dev-simulator mock mismatch; scoped ESLint passed; scoped `git diff --check`
  passed.
- Required Graphify refresh remains blocked by managed Windows `[WinError 5]:
  Access is denied`; generated graph output was not edited. No phone/device
  validation was available in this environment. No Capture, routing, A*,
  Studio, authored campus, compiler/publisher, Supabase, QR, panorama,
  deployment, or Phase 8C work was touched.
- Next: await user approval before any further behavior changes.

### 2026-09-07 — NAVI Navigate visual cleanup, heading beam, and camera preset pass (T1–T4)

- Replaced the Navigate-only two-band direction cone with one short tapered
  geographic Polygon. Its broad base straddles the position dot, narrows in
  the resolved heading direction, and ends in a rounded cap; the active
  MapLibre fill layer is now a single unfiltered beam layer.
- Kept Capture's symbol-arrow image/layer and shared heading resolver
  untouched. Legacy beam-layer cleanup remains tolerant of stale old layers,
  but new Navigate mounts register only the single beam.
- Compacted idle Navigate setup to the destination search surface plus a
  contextual Set starting point action. Removed idle title/subtitle/status
  chrome, idle Use-current-location, and idle Swap. Moved GPS location into
  the origin picker, kept Recenter as the map camera action, and retained QR
  as a compact contextual icon with its existing sheet/resolver flow.
- Added route-preview-only Swap when both endpoints are present, added safe
  area top padding and 44px-class phone tap targets, and kept the existing
  TOP/FOLLOW/POV camera seam and 16/18/19 zoom ceilings unchanged.
- Verification: focused beam/marker/page contracts passed 3 files / 20 tests;
  camera policy/controller/controls/bridge passed 4 files / 42 tests;
  protected Capture direction/camera passed 5 files / 20 tests; scoped ESLint
  and nested `git diff --check` passed.
- Full Navigate page suite is 19/20: the remaining failure is the existing
  development-simulator mock mismatch (`navigation-dev-panel` absent from the
  mocked ExploreMap). Repository typecheck remains blocked by the unrelated
  existing `TS1005` at
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`.
- Required Graphify refresh again hit managed Windows `[WinError 5]: Access is
  denied`; generated graph output was not edited. No physical-phone or live
  campus-backed map validation was available, so device/browser confirmation
  remains the next validation step.
- No Capture, heading resolver, routing/A*, route progress/cost, indoor/outdoor
  systems, Studio, authored campus data, compiler/publisher, Supabase, QR
  resolver internals, panorama/TourViewer, deployment, or Phase 8C work was
  touched.

### 2026-09-07 — NAVI Navigate quick controls touch stack (T1–T4)

- Reproduced the mobile control boundary in the running Navigate browser before
  editing: the original controls were a horizontal row with a 36px View button;
  center hit-tests reached the intended buttons, so z-index alone was not the
  root cause. Recenter worked because it was the only direct, full-size button;
  View also lacked the Navigate page mode-change bridge, and Heading Follow was
  phase-gated outside active navigation.
- Reused the Explorer vertical-stack pattern in Navigate: direct right-side
  stack at `top: 58%`, safe-area-aware right inset, `z-30`, pointer-events auto,
  8px gaps, and 44×44 View/Recenter/Heading Follow targets. Removed the visible
  persistent `Heading unavailable` copy while retaining `data-heading-status`
  and the internal status/permission state.
- Restored the page → NavigationCamera mode callback and wired Heading Follow
  enable to the existing permission callback when permission is required. Added
  controller replay on MapLibre `idle` after an early `styledata` event, and
  kept programmatic rotation from suspending heading follow.
- Verification: 9 focused files / 79 tests passed; controller suite 22/22;
  scoped ESLint passed. Navigate page + controls was 27/28, with only the
  existing development-simulator mock mismatch (`navigation-dev-panel` absent
  from the mocked ExploreMap).
- Final browser smoke passed at 390px and 360px: preview controls were 44px
  wide and clear of the route panel (panel bottom 386.5px; stack top 404.39px),
  active controls were right-aligned at 12px, z-index 30, pointer-events auto,
  and all three center `elementFromPoint` checks hit their own buttons. Follow
  reached 55° pitch, POV visibly changed to MapLibre's runtime 60° max-pitch,
  Heading Follow toggled ON/OFF, synthetic alpha 90° produced beam heading 270°
  and map bearing -90°, no `Heading unavailable` text appeared, and page errors
  were empty. Rapid TOP → FOLLOW → POV → FOLLOW ended on Follow at 55° pitch;
  pan/zoom moved the camera and Recenter restored the canonical Follow framing.
- Required Graphify refresh again returned managed Windows `[WinError 5]: Access
  is denied`; generated graph output was not intentionally edited. No Capture,
  routing/A*, authored campus data, Studio, compiler/publisher, Supabase, QR,
  panorama, deployment, or Phase 8C systems were touched.

### 2026-09-07 — NAVI designer presentation audit (inspection-only)

- Completed a repository-first inventory of the current User App and Admin App,
  including public/admin page routes, major loading/empty/error/dialog states,
  responsive shells, Studio/Floor Editor tools, Capture, QR, panoramas, Route
  Testing, validation, compile, publish, and runtime consumption.
- Verified the deployed User App at the requested URL and related public paths:
  Home/onboarding, Campus Directory, Profile, Search shell, Explore/Navigate
  loading states, one campus-selected loaded Navigate map, QR redirect,
  panorama loading, and the legacy `/map/runtime` `poi.json` 404.
- Verified the deployed Admin boundary: every tested Admin URL redirected to
  `/login`; no credential, save, delete, import, export, or publish action was
  submitted. Admin behavior is therefore labeled source-only/live-gated.
- Traced the authoring → validation → compile → publish → `published_maps` /
  `graph_snapshots` → `/api/public-campus` → User App relationship and ranked
  presentation/UX risks. Added the complete report at
  `audit-artifacts/NAVI-DESIGN-AUDIT-2026-09-07.md`.
- Verification: report headings and required sections present; route appendix
  reconciled against the complete `navi-next/src/app` page-file listing,
  including `/sandbox/tour-test`; source diff check was empty. No application
  source, authored data, deployment, or generated graph output was modified.

## Field Regression Architecture Audit — 2026-09-07 (AUDIT ONLY)
- Timestamp UTC: 2026-09-07T15:07:20.9660149Z
- T1 complete: current Capture and Navigate pipelines traced; 20-section report and future phased implementation plan written at `docs/audits/2026-09-07-field-regression-audit.md`.
- User clarification: no route was started; the user was strolling and expects continuous tracking. Confirmed first divergence: `NavigationSession.tsx:71` gates watchPosition on route-active state, leaving setup on a one-shot. Setup camera surface advertises active controls but page forces heading follow OFF and rejects toggle persistence.
- Verification: real-source React diagnostic reproduced inactive freezing/toggle/POV behavior, active P1-P4 propagation through marker/camera/progress, active POV H2/H3, watcher cleanup, reload-equivalent fresh location and throttle tail loss. Fake sensors/base-map readiness/campus-store/MapLibre sink; no physical Android or WebGL claim.
- Existing tests: 25 files, 196 tests, 195 passed / 1 failed. Navigate page specifically 20 passed / 1 failed (21); failure is missing simulator panel. Other focused and adjacent suites pass. No tests were edited.
- Completion gate: all 20 report sections; 44 source/evidence reference definitions valid at validation; baseline 1,283 product files unchanged, no additions/deletions in protected source/assets/tests roots. Evidence in `docs/audits/2026-09-07-field-regression-evidence/final-verification.json`.
- Errors: search-path mistakes logged; current conditional product findings documented without fixes; user clarification resolves earlier phase unknown. No graph refresh was needed for a product-source change because no product source was changed; graph was queried for discovery and current source was independently read.
- Next: user/model review and a separate implementation session. STOP. No production edits, commits, deployment or publication.

## 2026-09-07 — Field Navigation Repair Phase 1 T1 RED gate
- Current source matched the Astra audit: inactive `NavigationSession` called
  `useGeolocation({ watch: active })`, and the hook used a leading-only 1000 ms
  callback filter.
- Added behavioral hook coverage and a real browser callback → geolocation
  hook → session → provider/context → route-progress consumer integration test.
- RED evidence: 2 files executed, 7 expected product-contract failures and 4
  passes. Setup created 0 watchers instead of 1; P2 at +500 ms remained stuck
  at P1; error recovery callbacks inside the throttle window were also lost.
- Existing rerender, Strict Mode single-live-watcher, cleanup, and remount
  behaviors passed before implementation.
- Runner evidence: the sandboxed command hit the known Vite `spawn EPERM`;
  the unchanged approved elevated command reached the tests. Next: T2 minimal
  changes in `useGeolocation.ts` and `NavigationSession.tsx` only.

## 2026-09-07 — Field Navigation Repair Phase 1 T2 GREEN gate
- `NavigationSession` now requests continuous observation for its complete
  mounted lifecycle; its existing `active && route && position` progress gate
  remains unchanged.
- `useGeolocation` no longer drops browser-delivered callbacks inside an
  application-level 1000 ms window. It still preserves native accuracy,
  heading, speed, and timestamp and retains its existing one-shot option for
  other consumers.
- GREEN evidence: 2 focused files / 11 tests passed. P1 at t0 followed by P2 at
  +500 ms and silence ended at P2; setup → preview → active → end retained one
  watcher; unmount cleared it; permission/unavailable/timeout errors recovered
  on the next callback; Strict Mode kept at most one live watcher.
- No Capture, route-progress math, camera, marker, authoring, persistence, or
  published-data file changed. Next: T3 protected regression and report gate.

## 2026-09-08 — Field Navigation Repair Phase 1 T3 completion gate
- Protected tests passed: navigation/session/context/progress/runtime 114/114,
  Capture 102/102, and Navigate camera/marker 59/59. The final focused rerun
  passed 11/11. Scoped ESLint and the elevated production build passed; all 41
  static pages generated.
- The Navigate page suite is 20/21 with its sole pre-existing disconnected
  simulator-panel failure. Repository-wide TypeScript remains blocked by the
  existing `data-identity-comparison.test.ts:255` parse error.
- Headless Chromium at 390 × 844 exercised the real Navigate page and MapLibre
  marker with five injected positions across setup, preview, active, and
  post-end setup. Marker transforms changed five times, active progress became
  visible, Start/End did not add a watcher, Strict Mode never exceeded one live
  watcher, unmount left zero, and no page errors occurred.
- Audit-baseline hash comparison found exactly 3 expected changed existing
  files, 0 unexpected changes, and the 1 planned new integration test. No
  protected route/authoring/Capture product file changed.
- Required Graphify refresh and elevated retry failed at the known Windows
  `WinError 5` replacement boundary after extraction; no generated output was
  manually repaired.
- Gate report: `docs/audits/2026-09-08-phase1-foreground-location-gate.md`.
  Status: CODE/BROWSER GATE PASS — PHYSICAL DEVICE VALIDATION PENDING. Phase 2
  has not started.

## 2026-09-08 — Field Navigation Repair Phase 2 T1 RED gate
- Added two parent-owned Navigate regressions for the approved Phase 2
  contract: setup Heading Follow must accept/persist a toggle through Start,
  and selecting POV must enable/persist Heading Follow and heading-follow top
  orientation.
- RED evidence: the unchanged elevated Navigate page run executed 23 tests;
  20 passed, the two new contract tests failed at the expected current page
  behavior, and the existing disconnected simulator-panel test failed.
- The sandboxed Vitest attempt stopped before loading with the known Vite
  `spawn EPERM`; no sandbox output was counted as test evidence.
- Next: T2 minimal Navigate parent seam correction in `page.tsx`.

## 2026-09-08 — Field Navigation Repair Phase 2 T2 GREEN gate
- Navigate now initializes live setup Heading Follow and top orientation from
  the stored navigation preference, passes that state through setup/preview,
  and persists Compass changes through the existing public preference action.
- Selecting POV from the existing mode seam now enables Heading Follow,
  selects heading-follow top orientation, and stores the preference. Route
  Preview remains Top-only through its existing surface policy.
- GREEN evidence: the unchanged elevated Navigate page suite reached 22/23;
  both Phase 2 contracts and all other page assertions passed. The only
  failure remains the pre-existing disconnected development simulator panel.
- Scoped ESLint passed for the changed page and page test. Next: T3 protected
  suites, browser gate, report, and Graphify refresh.

## 2026-09-08 — Field Navigation Repair Phase 2 T3 completion gate
- Phase 2 focused Navigate/camera run: 74 passed / 1 known failed across 6
  files. The 23 passing Navigate assertions include setup preference
  carry-through, POV auto-enable, and End-navigation restoration; the only
  failure is the pre-existing disconnected development simulator panel.
- Protected location/session/context suites passed 85/85 and Capture passed
  102/102; the combined rerun was 187/187 across 25 files. Scoped ESLint
  passed for the changed Navigate page/test.
- Elevated production build passed and generated all 41 static pages. The
  repository typecheck remains blocked by the known unrelated runtime test
  parse error at `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`.
- Real Chromium browser gate passed again at 390 × 844 after the final fix:
  setup OFF → toggle ON, preference persisted, Route Preview stayed Top, Start
  retained ON, POV was selectable and retained ON, and page errors were empty.
  Evidence is in
  `docs/audits/2026-09-08-phase2-heading-follow-pov-evidence/browser-gate.json`.
- Required Graphify refresh failed again after the final code change at managed
  Windows `[WinError 5]` replacement; generated output was not manually
  changed. Gate report:
  `docs/audits/2026-09-08-phase2-heading-follow-pov-gate.md`.
- Status: CODE/BROWSER GATE PASS — PHYSICAL DEVICE VALIDATION PENDING. Phase 3
  is not started.

## 2026-09-08 — Field Navigation Repair Phase 3 T1/T2 camera authority

- Phase 3 RED added camera contracts for route-preview fit ownership, the
  canonical RouteLine fit opt-out, explicit MapLibre max-pitch construction,
  and controller pitch repair against `getMaxPitch()`.
- RED evidence: the elevated focused run executed 4 files / 37 tests, with
  32 passing and the 5 intended failures. The sandbox runner stopped earlier
  at the known Vite `spawn EPERM` boundary and was not counted.
- The canonical camera now owns route-preview fitting without a follow-up
  generic `easeTo`; canonical ExploreMap disables RouteLine camera fitting,
  while legacy RouteLine callers keep their default fit behavior.
- NavigationMap exposes a 60° default and canonical ExploreMap configures the
  approved 85° POV ceiling. Controller update, Recenter, Compass, suspended
  repair, and move-end pitch targets clamp to the map-reported maximum.
- GREEN evidence: the unchanged elevated focused set passed 4 files / 37
  tests. Next: protected suites, lint/build/typecheck, browser gate, Graphify,
  and the Phase 3 report.

## 2026-09-08 — Field Navigation Repair Phase 3 T3 completion gate

- Protected location/session/context/Capture suites passed 187/187 across 25
  files. The camera/Navigate protection run passed 85 assertions; its one
  failure is the existing disconnected `navigation-dev-panel` simulator
  assertion.
- Scoped ESLint and targeted nested/root diff checks passed. The elevated
  production build passed and generated all 41 static pages. Repository
  TypeScript remains blocked only by the pre-existing runtime test parse error
  at `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`.
- The real Chromium gate passed at 390 × 844 after synchronizing on the async
  location result: Route Preview reached `route-preview`, the MapLibre canvas
  was visible, active navigation started, POV was selectable, Heading Follow
  stayed persisted, and page errors were empty. Evidence is in
  `docs/audits/2026-09-08-phase3-camera-authority-evidence/browser-gate.json`.
- Required `graphify update .` was attempted after the source changes and
  failed at the managed Windows `[WinError 5] Access is denied` boundary; no
  generated graph output was hand-edited. Gate report:
  `docs/audits/2026-09-08-phase3-camera-authority-gate.md`.
- Status: CODE/BROWSER GATE PASS — PHYSICAL DEVICE VALIDATION PENDING. Phase 3
  is complete.

## 2026-09-08 — Field Navigation Repair Phase 4 T1/T2 Capture-quality marker

- Phase 4 RED added shared passive marker contracts for one geographic dot and
  map-aligned arrow, sequential position/heading updates including wraparound,
  Heading Follow independence, no active Navigate beam/DOM marker, and
  namespaced cleanup/remount behavior. The elevated run executed 4 files / 24
  tests with 14 passing and 10 intended failures; the sandbox runner stopped at
  the known Vite `spawn EPERM` boundary.
- The shared `navigation-heading-arrow` seam now owns passive dot/arrow
  GeoJSON, the Capture-compatible image/layer definitions, and namespaced
  cleanup. Capture delegates its direction data and marker layers to that seam.
- Navigate now mirrors raw NavigationContext coordinates and resolved display
  heading into the shared MapLibre dot/arrow sources through setup, preview,
  active, and post-end map lifetimes. The old DOM marker and geographic beam
  are no longer active; legacy beam IDs are cleanup-only.
- GREEN evidence: the elevated focused set passed 4 files / 24 tests. Next:
  protected suites, visual/browser evidence, lint/build/typecheck, Graphify,
  and the Phase 4 report.

## 2026-09-08 — Field Navigation Repair Phase 4 T3 completion gate

- Focused shared-marker contracts passed 24/24. GPS/session/route-render/Capture
  protection passed 198/198 across 27 files. Camera/Navigate protection passed
  94 assertions; the only failure is the existing disconnected
  `navigation-dev-panel` simulator assertion.
- Scoped ESLint and targeted workflow diff checks passed. The elevated
  production build passed and generated all 41 static pages. Repository
  TypeScript remains blocked only by the pre-existing runtime test TS1005 at
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`.
- The real Chromium gate passed at 390 × 844 with injected sequential position
  and heading samples. It captured ten screenshots across setup P1/P2,
  Heading Follow OFF/ON, route preview, active Top/Follow/POV, and post-End
  setup; screenshot hashes changed, no DOM marker remained, and page errors
  were empty. Evidence is in
  `docs/audits/2026-09-08-phase4-capture-quality-marker-evidence/`.
- Required Graphify refresh was attempted after the source changes and failed
  at managed Windows `[WinError 5] Access is denied`; generated output was not
  hand-edited. Gate report:
  `docs/audits/2026-09-08-phase4-capture-quality-marker-gate.md`.
- Status: CODE/BROWSER GATE PASS — PHYSICAL DEVICE VALIDATION PENDING. Phase 4
  is complete; stop before Phase 5.

## 2026-09-08 — Phase 4.1 Automatic Navigate Direction Arrow

- **Done:** Added a Navigate-only passive orientation observation opt-in to the existing Capture direction hook. Navigate now observes permission-capable orientation events on mount, promotes only on a valid delivered event, and keeps explicit permission requests user-gesture-only. Added RED/GREEN hook and real NavigationSession integration coverage.
- **Protected:** Capture defaults, GPS/watchPosition lifecycle, route progress, camera/Heading Follow/POV semantics, Phase 4 marker geometry, and authored systems remain unchanged.
- **Verification:** Phase 4.1 focused 13/13; Phase 4.1 + marker/Capture 34/34; protected GPS/session/heading/marker/Capture 200/200 across 28 files; camera/Navigate 94 passed with the known disconnected navigation-dev-panel failure; scoped ESLint passed; production build generated 41 pages; browser gate passed at 390×844 with routeActive false, Heading Follow OFF→ON→OFF, requestPermissionCalls 0, one GPS watcher, no technical heading copy, no DOM marker, changed heading screenshots, and no page errors. `tsc --noEmit` remains limited to the known TS1005 baseline. Graphify refresh remains the known Windows WinError 5 boundary.
- **Evidence:** `docs/audits/2026-09-08-phase4-1-automatic-navigate-direction-arrow-gate.md` and its browser evidence directory.
- **Next:** Physical Android/device validation only; stop before Phase 5 pending approval.
- **Status:** `CODE/BROWSER GATE PASS — PHYSICAL DEVICE VALIDATION PENDING`

## 2026-09-08 — Field Navigation Repair Phase 5 T1/T2 integrated validation

- Added the validation-only real MapLibre Chromium gate at
  `docs/audits/2026-09-08-phase5-integrated-navigation-field-validation-evidence/browser-gate.cjs`.
  It injects only geolocation/orientation callbacks while using the real
  `useGeolocation`, NavigationSession/provider, Navigate marker, camera, and
  route-progress path at 390×844.
- The elevated gate passed R1–R10 and recovery: setup P1→P2 moved without a
  route, cardinal headings changed the passive arrow, preview stayed out of
  active guidance, active remaining distance advanced 223→111→22 m, Follow
  and POV worked, pan/rotate suspended and Recenter resumed, End left one
  watcher and post-end fixes live, and same-origin remount disposed/restored
  listeners and one watcher. It captured 22 screenshots with `pageErrors: []`.
- The disconnected `navigation-dev-panel` remains unused. The passing gate
  exercises real browser acquisition, so no simulator/product source change
  was justified in T2.

## 2026-09-08 — Field Navigation Repair Phase 5 T3 completion gate

- Final real MapLibre Chromium gate passed against the restarted
  `http://localhost:3000` server at 390×844. It captured 31 screenshots and
  produced `pageErrors: []`.
  R1–R10 and recovery passed: no-route P1→P2→P3 movement stayed in setup,
  preview accepted a live fix without guidance, active remaining distance was
  223→111→22 m with Step 1→2 progress, cardinal Follow and diagonal POV
  headings changed the camera/marker, manual pan/rotate suspended Follow,
  Recenter resumed it, End preserved one live watcher, and remount cleanup
  reached zero then restored one watcher.
- Final assertions are all green: `setupStrollChanged`,
  `setupStrollSequential`, `headingChanged`, `cardinalHeadingChanged`,
  `routePreviewLiveChanged`, `activeWatcherStable`, `activeRemainingChanged`,
  `activeProgressAdvanced`, and `allScreenshotHashesChanged`; final DOM marker
  count is 0, technical heading copy is empty, and mounted stats are one active
  GPS watcher with orientation adds 4/removes 2 and no permission calls.
- Focused navigation protection passed 93 assertions across 9 files with the
  known isolated `navigation-dev-panel` baseline failure. Protected
  MapLibre/rendering/indoor/inspector/Capture coverage passed 128 tests across
  11 files. Scoped ESLint passed; the elevated production build passed and
  generated 41 static pages; `node --check` passed. Repository typecheck is
  limited by the existing runtime-test TS1005 parse error at line 255.
- Required `graphify update .` was retried after the final harness and remains
  blocked by managed Windows `[WinError 5] Access is denied`; generated graph
  output was not hand-edited. The complete report and Android checklist are in
  `docs/audits/2026-09-08-phase5-integrated-navigation-field-validation-gate.md`;
  JSON/PNG evidence is in the adjacent evidence directory.
- Status: `CODE/BROWSER GATE PASS — PHYSICAL DEVICE VALIDATION PENDING`.
  Physical Android execution is the only remaining validation step; no
  deployment or publication was performed.
## 2026-09-10 — Routing topology / unwanted auto-connection audit

- **Done:** Completed an audit-only trace of outdoor and indoor authoring, GraphAdapter/Graph derivation, persistence/reload, Compiler V2, deletion, public source selection, Route Testing, endpoint resolution, and both A* implementations. Classified all 15 requested scenarios and produced the 17-section report.
- **Verdict:** FAIL. Current code can connect distinct authored route objects from proximity through Route path node reuse (0.5 m), ungated editor endpoint-to-road inference (2 m/5 m), compiler waypoint merge/edge rewiring (0.5 m), and legacy nearest-neighbor fallback.
- **Verification:** Report structure check found 17 numbered sections and exact final gate `AUDIT COMPLETE — SAFE TO PLAN FIX`. Focused existing Vitest run collected 203 assertions: 201 passed across 13 files; two stale `road-junction.test.ts` fixtures failed because compilation now rejects their unassigned entrance before topology assertions. Initial sandbox `spawn EPERM` was retried through the authorized test path.
- **Integrity:** No product source, test source, campus data, database data, graph snapshot, or published artifact was edited or published. Intentional changes are the audit report, dedicated spec/plan, and workflow logs; Graphify/Vitest updated generated query/result cache metadata. Temporary Graphify vocabulary probe files were removed.
- **Evidence:** `docs/audits/2026-09-10-routing-topology-unwanted-auto-connection-audit.md`.
- **Next:** Stop before implementation. If authorized later, begin Phase 1 by adding cross-layer characterization tests and defining one explicit cross-object connectivity policy.
- **Status:** `AUDIT COMPLETE — SAFE TO PLAN FIX`

## 2026-09-10 — NAVI V1 route-network audit gate

- **Done:** Revalidated the current dirty working tree against the explicit-only
  cross-object connectivity rule. Traced road authoring and junction sync,
  indoor RouteNetwork authoring, multiple entrances, canonical access,
  room-node destinations, vertical transitions, Compiler V2 reachability
  operations, deletion integrity, rendering, Route Testing, and both A*
  implementations. Produced the requested 12-section audit report.
- **Verdict:** `READY FOR MINIMAL FIX`. The V1 data model and end-to-end
  canonical route flow already work, but campus-network authoring remains gated
  by automatic road endpoint connection, indoor foreign-node reuse, compiler
  cross-object waypoint merge, legacy fail-open nearest fallback, and incomplete
  routing-reference deletion cascades.
- **Verification:** A broad focused Vitest run collected 19 files: 18 passed and
  1 failed, with 505/507 tests passing. The two failures are the previously
  documented stale `road-junction.test.ts` fixtures that fail explicit-entrance
  validation before topology assertions. A second scenario-focused run passed
  all 279 tests across 9 files. The initial sandbox-only `spawn EPERM` was
  resolved by rerunning the identical command through the approved test path.
  Report verification found exactly 12 numbered sections, the allowed verdict,
  and the exact final line. Scoped `git diff --check` reported no patch errors.
- **Integrity:** No product source, test source, campus data, database,
  application graph/test snapshot, published map, deployment, or live UI state
  was changed. Intentional changes are the audit report, its spec/plan, and the
  mandatory progress/error logs. Existing unrelated dirty changes were left
  untouched.
- **Evidence:**
  `docs/audits/2026-09-10-navi-v1-route-network-audit.md`.
- **Next:** Stop before implementation. If separately authorized, begin Phase 1
  with desired-behavior tests and the explicit-connectivity fixes named in the
  report; do not begin large-scale outdoor campus authoring before that gate.
- **Status:** `AUDIT COMPLETE — STOPPED BEFORE IMPLEMENTATION`

## 2026-09-10 — NAVI V1 route-network stabilization Phase 1 Gate 1B

- **Done:** Implemented the minimum explicit-connectivity fix across road
  creation, Graph endpoint inference, RoadJunction persistence, indoor Route
  path node reuse, and Compiler V2 normalization. Added negative and positive
  controls through authoring → GraphAdapter → JSON reload → Compiler V2 →
  runtime graph → A*. Phase 2 was not started.
- **Verification:** Final Phase 1 gate passed 276/276 tests across 17 files.
  The exact audit broad comparison passed 519/521 across 19 files with only the
  same two stale road-junction fixtures; the exact scenario comparison passed
  284/284 across 9 files. Scoped ESLint reported 0 errors/4 inherited warnings;
  scoped diff check passed. Global TypeScript and all-repository Vitest remain
  baseline-limited and are classified in the report/error ledger. Required
  Graphify refresh succeeded on approved retry (22,319 nodes, 32,625 edges,
  1,819 communities).
- **Integrity:** Product code and tests changed as listed in the gate report.
  Campus data, Supabase, NAVI `graph_snapshots`, `published_maps`, and deployment
  were not mutated. The required repository Graphify index was refreshed.
- **Evidence:**
  `docs/audits/2026-09-10-navi-v1-route-network-phase1-explicit-connectivity-gate.md`.
- **Next:** Stop and wait for reviewer authorization. Phase 2 remains planned
  but unstarted.
- **Status:** `PHASE 1 PASS — STOPPED BEFORE PHASE 2`

## 2026-09-10 — NAVI V1 route-network stabilization Phase 2 T1–T2

- **Done:** Established the Phase 2 pre-edit ownership/reference matrix and
  source fingerprints, then added fail-first tests for Road, RouteNode,
  Entrance, staircase/elevator, Building, and generic deletion cleanup.
  Introduced `routing-relationship-cleanup.ts` as the single fail-closed
  reference cleanup boundary and wired the affected handlers without proximity
  reassignment. Route-node undo also restores the relationship snapshot.
- **Verification:** Pre-edit focused baseline passed 419/419 across 11 files.
  The six new cleanup tests first failed for the six missing cascades, then the
  focused deletion regression suite passed 82/82 across 5 files.
- **Integrity:** Existing Phase 1 source was patched surgically in the current
  dirty checkout; no campus data, Supabase data, application graph snapshot,
  published map, or deployment was touched.
- **Next:** T3 middle-floor deletion, persistence, and VerticalTransition
  fail-closed compiler coverage.
- **Status:** Phase 2 T2 verified; T3 in progress.

## 2026-09-10 — NAVI V1 route-network stabilization Phase 2 T3

- **Done:** Added the critical F0–F1–F2 delete-middle-floor round-trip test and
  a compiler test for an unresolved middle transition stop. Floor cleanup now
  clears reverse entrance links, floor connector-stop membership, the deleted
  numeric feature level, and only transitions involving the deleted floor.
  The feature itself and unrelated transitions survive. Canonical transition
  compilation now emits no edges when any stop in an authored chain fails.
- **Verification:** The two T3 tests failed against the old behavior. After a
  legacy-array null-safety correction, the T3 suite passed 242/242 across 6
  files, including valid transition CRUD and multi-floor persistence controls.
- **Next:** T4 malformed canonical authority and bounded legacy fallback.
- **Status:** Phase 2 T3 verified; T4 in progress.

## 2026-09-10 — NAVI V1 route-network stabilization Phase 2 T4–T5

- **Done:** Canonical RoomAccess and EntranceAccess now establish suppression
  authority from record presence, matching the VerticalTransition rule added
  in T3. Legacy nearest-waypoint compatibility now filters candidates by
  building and numeric floor and applies the existing named 50 m
  `compilerFallbackMeters` threshold. The normalizer Step 3b nearest repair was
  proven unreachable: an endpoint in any non-portal edge has incident count at
  least one, while only zero-incident waypoint IDs enter `danglingIds`; missing
  node IDs never enter `danglingIds` because they are not in `survivingNodes`.
  It remains a documented deferred latent dead branch; no T5 product change.
- **Verification:** Six focused canonical/fallback tests established four old
  failures and then passed. The exact T4 controlling compiler suite passed
  91/91 across 4 files. A broader 96-test batch had one independently known
  stale Phase 1 merge-threshold fixture and 95 passes.
- **Next:** T6 full regression, static checks, Graphify refresh, report, and
  mandatory stop before Phase 3.
- **Status:** Phase 2 T4–T5 verified; T6 in progress.

## 2026-09-10 — NAVI V1 route-network stabilization Phase 2 integrity gate

- **Done:** Completed centralized relationship cleanup for Road, RouteNode,
  Entrance, Floor, staircase/elevator, and Building deletion. Canonical
  RoomAccess, EntranceAccess, and VerticalTransition now fail closed, legacy
  nearest compatibility is building/floor scoped and capped by the existing
  50 m threshold, and middle-floor deletion cannot synthesize a shortcut.
- **Verification:** The final Phase 2 matrix passed 434/434 tests across 13
  files; the Phase 1 regression gate passed 165/165 across 9 files; the broader
  focused comparison passed 505/505 across 19 files; and the scenario
  comparison passed 269/269 across 9 files. A separate stale-fixture batch
  passed 5/8, with two known road-junction fixtures and one superseded Phase 1
  threshold fixture classified stale. The three wholly new files pass ESLint,
  scoped `git diff --check` passes, and Graphify was refreshed to 22,400 nodes
  and 32,766 edges. Global TypeScript remains baseline-blocked as recorded in
  the error ledger.
- **Integrity:** Phase 2 changed only the listed product/test files and required
  workflow/report artifacts. Existing dirty campus/demo output, Supabase,
  application `graph_snapshots`, `published_maps`, and deployment state were
  preserved. The repository-only Graphify knowledge index was refreshed as
  required.
- **Evidence:**
  `docs/audits/2026-09-10-navi-v1-route-network-phase2-v1-integrity-gate.md`.
- **Next:** Stop and wait for explicit reviewer authorization. Phase 3 was not
  started and should primarily re-run the final V1 verification gate.
- **Status:** `PHASE 2 PASS — STOPPED BEFORE PHASE 3`

## 2026-09-10 — NAVI V1 route-network stabilization Phase 3 T1

- **Done:** Captured the outer/nested dirty baselines, reproduced the known
  stale batch at 5/8, and corrected only its fixtures. RoadJunction coverage
  now supplies an authored junction and explicit entrance-road assignment;
  threshold coverage now gives near/far pairs shared provenance so distance,
  not forbidden cross-source identity merge, remains the variable under test.
- **Verification:** The corrected two-file stale batch passes 8/8. The initial
  sandbox `spawn EPERM` and approved identical serial rerun are recorded in the
  error ledger.
- **Integrity:** No Phase 3 product code changed. No validation, provenance, or
  connectivity-authority rule was weakened.
- **Next:** Inventory and fill only genuine gaps in the 35-item end-to-end
  acceptance matrix.
- **Status:** Phase 3 T1 verified; T2 in progress.

## 2026-09-10 — NAVI V1 route-network stabilization Phase 3 T2

- **Done:** Mapped all 35 acceptance items to existing behavior tests or direct
  source evidence and filled only three genuine evidence gaps: assigning one
  of three entrances without changing sibling bridges, deleting the middle of
  three entrances without damaging survivors, and reverse outdoor-to-room A*
  traversal through the emitted EntranceAccess bridge.
- **Verification:** The three-file focused evidence batch passes 71/71. Direct
  inspection confirms Route Testing is a runtime consumer, both A* engines
  build adjacency only from supplied edges, emitted access edges are routable,
  and normal road GeoJSON is sourced only from authored roads.
- **Integrity:** Test files only; no Phase 3 production code or persistent
  campus topology changed.
- **Next:** Run the focused and regression verification gates.
- **Status:** Phase 3 T2 verified; T3 in progress.

## 2026-09-10 — NAVI V1 route-network stabilization Phase 3 T3–T4

- **Done:** Ran the fresh end-to-end lifecycle, exact Phase 1, corrected stale,
  runtime-package, and resolved broader/integrity/scenario matrices. Diagnosed
  a Windows CRLF checksum mismatch in the already dirty runtime fixtures and
  repaired only fixture bytes/metadata plus a scoped LF policy; strict runtime
  checksum behavior was not changed. Completed the structural authority review.
- **Verification:** Phase 3 root tests passed 288/288 across 19 files and the
  package-local runtime tests passed 16/16 across 3 files (304/304 total).
  Exact Phase 1 passed 165/165; stale fixtures passed 8/8; supplemental current
  matrices passed 193/193 (13 files), 239/239 (19 files), 228/228 (9 files),
  and 201/201 (9 files). Scoped diff check passed. TypeScript reproduced only
  its exact five baseline blockers; scoped ESLint findings are inherited helper
  debt and none is on a newly added Phase 3 assertion.
- **Structural evidence:** Route Testing reads the public runtime graph and
  calls A* without CampusDocument authoring; both A* implementations construct
  adjacency only from supplied edges; road GeoJSON is derived only from Roads;
  Step 3b cannot receive a surviving zero-incident node referenced by an edge.
- **Limitation:** Phase 2 retained 434/505/269 aggregates without literal
  commands. Reconstructed selections are green but are reported with their
  actual current counts rather than mislabeled as exact historical reruns.
- **Next:** Refresh Graphify, confirm protected-path non-mutation, and issue the
  required 24-section final report.
- **Status:** Phase 3 T3–T4 verified; T5 in progress.

## 2026-09-10 — NAVI V1 route-network stabilization Phase 3 final gate

- **Done:** Completed the final end-to-end V1 verification, corrected the three
  stale/superseded assertions, added three missing lifecycle assertions, and
  repaired only the checksum-sensitive runtime test fixtures plus scoped LF
  policy. No production routing code changed.
- **Verification:** Phase 3 passed 304/304 across 22 files; exact Phase 1 passed
  165/165; corrected stale batch passed 8/8; all reconstructed broader,
  integrity, and scenario matrices are green. Report validation found exactly
  24 sections, 35 acceptance rows, the exact final line, matching fixture
  hashes/sizes, and a clean scoped diff check. Graphify refreshed at 16:58 to
  22,458 nodes, 32,821 edges, and 1,845 communities.
- **Classification:** No V1-blocking defect remains. Global TypeScript and
  scoped dirty-helper lint debt are pre-existing/unrelated. Historical
  434/505/269 aggregates lack retained literal commands and are disclosed as
  non-blocking evidence reproducibility debt. Normalizer Step 3b remains
  unreachable latent legacy risk.
- **Integrity:** Branches and HEADs are unchanged. No live campus data,
  Supabase record, application `graph_snapshots`, `published_maps`, publish,
  or deployment mutation occurred.
- **Evidence:**
  `docs/audits/2026-09-10-navi-v1-route-network-phase3-final-v1-gate.md`.
- **Status:** `V1 ROUTING GATE PASS — PHASE 3 COMPLETE`

## 2026-09-10 — NAVI Mapbox Satellite Phase 1 audit

- **Done:** Audited the current Esri World Imagery registry, shared Studio and
  Preview consumers, zoom/overzoom behavior, attribution, env conventions,
  provider error handling, and dirty-checkout boundaries.
- **Verification:** Graphify queries, source inspection, local MapLibre type
  contract inspection, and official Mapbox documentation review completed.
- **Integrity:** No application source, `.env.local`, token, data, publish, or
  deployment mutation occurred; existing user changes were preserved.
- **Next:** Await explicit approval before Phase 2 implementation.
- **Status:** Phase 1 audit complete; approval gate pending.

## 2026-09-10 — NAVI Mapbox Satellite Phase 2 gate

- **Done:** After explicit approval, switched the active shared Satellite
  registry from Esri to Mapbox Raster Tiles, kept OSM/default styles unchanged,
  retained the Esri style as an internal manual fallback, added ignored local
  env configuration, required Mapbox/Maxar attribution plus a non-overlapping
  Mapbox brand control, and added status-only non-destructive error reporting.
- **Evidence:** ASU–Ibajay 3×3 tile probes returned JPEG HTTP 200 responses at
  z18, z19, z20, z21, and z22; the browser showed imagery and overlays at each
  zoom, including a z22 pan. Studio and Preview each completed
  OSM → Satellite → OSM → Satellite without losing the authored entities.
- **Verification:** Focused Vitest matrix passed 25/25; elevated production
  build passed compilation, 41 static pages, and route generation. Repository
  typecheck remains blocked by the pre-existing unmatched brace at
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`.
- **Boundary:** `agent-browser` was unavailable, so the persistent CUA/
  Playwright browser fallback supplied the live evidence. Preview emitted only
  the known pre-existing MapLibre style-diff timing warning; no new provider
  error was observed. Graphify refresh again hit the managed Windows
  `[WinError 5] Access is denied` boundary.
- **Integrity:** No CampusDocument, authored data, graph compiler, A*,
  connectivity, routing, persistence, publish, GPS, Capture, public/runtime
  map, or deployment behavior was changed.
- **Evidence file:** `progress/MAPBOX-SATELLITE-GATE-REPORT-2026-09-10.md`.
- **Status:** `MAPBOX SATELLITE GATE PASS — BASELINE TYPECHECK LIMITATION LOGGED`

## 2026-09-10 — NAVI Day 2 Camera Repair Phase 2 gate

- **Done:** Implemented only the Navigate camera policy/controller repair from
  the approved Phase 1 root cause: all three active modes permit pan/rotate/
  zoom, genuine drag/rotate/zoom starts share one `followSuspended` ownership
  contract, suspended updates omit automatic center/bearing/zoom writes, and
  transition-safe `moveend` handling prevents stale pitch repair races.
- **Verification:** RED captured 9 intended failures after the known sandbox
  `spawn EPERM` retry; focused controller/policy passed 40/40, broader camera/
  heading regression passed 76/76 across 7 files, targeted ESLint exited 0,
  and the real MapLibre browser gate passed all required Phase 2 cases with no
  page errors.
- **Integrity:** GPS, heading acquisition/resolution, marker rendering, route
  progress, A*, route graph/data, Capture, Studio, compiler/publisher,
  authored campus data, QR, panorama, and deployment state were untouched.
- **Evidence:** `progress/NAVI-DAY-2-CAMERA-REPAIR-PHASE-2-GATE-2026-09-10.md`.
- **Status:** `PHASE 2 GATE PASS — STOPPED BEFORE PHASE 3`

## 2026-09-10 — NAVI Day 2 Camera Repair Phase 3 Recenter gate

- **Done:** Implemented only the approved Navigate Recenter recovery repair on
  top of Phase 2: explicit canonical current-mode targeting, latest supplied
  position/heading use, idempotent repeated Recenter, and one-shot suppression
  of the same-input parent replay that previously appended a non-canonical
  camera write.
- **Verification:** Focused controller tests passed 36/36; the protected
  camera/heading/Capture batch passed 85/85 across 7 files; scoped controller
  and test lint passed with 0 errors; the 390×844 real-MapLibre browser gate
  passed with no page errors, stable sensor counts, latest P3/H3, all modes,
  Heading Follow ON/OFF, repeated Recenter, rapid mode changes, and active
  transition evidence.
- **Integrity:** Only the Navigate camera controller, its focused tests, Phase
  3 browser harness, and workflow artifacts changed. GPS/heading acquisition,
  markers, route progress/data, Capture, Studio/compiler/publisher, authored
  data, QR, panoramas, and deployment were untouched.
- **Boundary:** `agent-browser` was unavailable; bundled Playwright was used.
  Vitest/Chromium needed the approved unrestricted Windows path due `spawn
  EPERM`; Graphify refresh remained blocked by `[WinError 5] Access is denied`.
- **Evidence:**
  `progress/NAVI-DAY-2-CAMERA-REPAIR-PHASE-3-RECENTER-GATE-2026-09-10.md`.
- **Status:** `PHASE 3 GATE PASS — CODE/BROWSER VERIFIED; PHYSICAL DEVICE VALIDATION PENDING.`

## 2026-09-10 — NAVI Outdoor Terrain Routing Phase 0 audit gate

- **Done:** Audited the authored Road model, Inspector/commands, core and graph
  snapshot persistence, Supabase API boundary, compile/publish flow, primitive
  and NavEdge schemas, both A* consumers, indoor vertical transitions,
  accessibility declarations, rendering, and Area/POI/search boundaries.
- **Verification:** Required report sections and approval-stop line verified.
  Focused root tests: 227 passed / 4 failed across 17 files. Canonical runtime
  routing: 42/42 passed across 4 files. Full current-checkout baseline: 4,894
  passed / 33 failed / 8 skipped across 472 files (455 passed, 17 failed).
- **Baseline:** All failures are pre-existing relative to this read-only audit;
  the nested checkout started with 1045 dirty entries. Sandbox-only `spawn
  EPERM` and one corrected runtime-filter path were recorded separately.
- **Integrity:** No `navi-next` product/test code, campus data, Supabase row,
  published artifact, deployment, routing cost, A*, or topology was changed.
- **Evidence:** `docs/audits/2026-09-10-navi-outdoor-terrain-routing-phase0-audit.md`.
- **Next:** Await explicit approval before Phase 1 data-model work.
- **Status:** `PHASE 0 AUDIT PASS — STOPPED BEFORE PHASE 1`

## 2026-09-10 — NAVI Outdoor Terrain Routing Phase 1 gate

- **Done:** Added optional typed `Road.routing`, centralized pure legacy
  defaults, and safe signed elevation, summed geographic length, and grade
  helpers. No legacy Road migration or downstream behavior change was made.
- **Verification:** TDD RED was observed; final Phase 1 plus serializer tests
  passed 73/73, complete core passed 261/261, canonical runtime passed 42/42,
  scoped lint passed, and the exact Phase 0 root matrix remained 227 passed / 4
  unchanged compile-v2 failures.
- **Compatibility:** Legacy serialization stays valid without materializing
  defaults, wheelchair absence remains unknown, and helper reads do not mutate
  Road objects or polylines.
- **Boundary:** Core typecheck remains blocked by four unrelated pre-existing
  diagnostics. Required Graphify refresh again hit managed Windows
  `[WinError 5] Access is denied`; no generated graph was edited manually.
- **Integrity:** Inspector, GraphAdapter/Trace persistence, compiler/NavEdge,
  runtime costs, both A* implementations, rendering, geometry, junctions,
  snapping, and connectivity were untouched by Phase 1.
- **Evidence:**
  `docs/audits/2026-09-10-navi-outdoor-terrain-routing-phase1-gate.md`.
- **Next:** Await explicit approval before Phase 2 Road Inspector authoring.
- **Status:** `PHASE 1 PASS — STOPPED BEFORE PHASE 2`

## 2026-09-10 — NAVI Day 2 Camera Repair Phase 4 Initial Framing gate

- **Done:** Implemented only the approved Navigate setup-framing repair. Added an
  explicit `initialSetup` seam, disabled the campus `fitBounds` writer whenever
  an active camera has a valid live position, and added one-shot controller
  framing with delayed-position and pre-GPS gesture suppression. Route preview,
  active camera ownership, Recenter, GPS, heading, and Capture paths were left
  intact.
- **Verification:** Intended RED framing tests failed before implementation;
  focused controller/bridge/Explore tests passed 53/53 after implementation;
  the protected camera/context/render/session batch passed 132/132; scoped
  ESLint passed with 0 errors; the elevated production build passed compilation,
  41 static pages, and route generation.
- **Browser:** The real MapLibre Playwright seam passed cases A–F at 390×844
  with no page errors: position-at-entry framing, safe fallback, delayed
  one-shot framing, gesture-before-GPS suppression, route-preview fit, active
  Follow updates, and Recenter/heading protection. Eight screenshots were
  captured. Physical device validation remains pending.
- **Boundary:** `agent-browser` was unavailable; the bundled Playwright
  fallback supplied browser evidence. Managed Windows process access required
  the approved unrestricted path for Chromium and the production build.
  `graphify update .` again returned `[WinError 5] Access is denied`; no
  generated graph output was edited.
- **Integrity:** No GPS watcher/acquisition, heading acquisition/resolution,
  shared marker, route progress, A*, route graph/data, Capture, Studio,
  compiler/publisher, authored campus data, QR, panorama, auth, or deployment
  state was changed.
- **Evidence:** `progress/NAVI-DAY-2-CAMERA-REPAIR-PHASE-4-INITIAL-FRAMING-GATE-2026-09-10.md`.
- **Status:** `PHASE 4 GATE PASS — CODE/BROWSER VERIFIED; PHYSICAL DEVICE VALIDATION PENDING.`

## 2026-09-10 — NAVI Day 2 Camera Repair Final Integrated gate

- **Done:** Ran the approved final integrated validation only. No product
  behavior, protected system, campus data, publish state, or deployment state
  was changed. The integrated lifecycle covered setup, delayed GPS, manual
  TOP/FOLLOW/POV ownership, heading follow OFF/ON, Recenter stress, rapid
  transitions, route preview, active progress, end navigation, and remount.
- **Verification:** Combined Phase 1–4 protections passed **163/163** across
  20 files. Scoped ESLint passed with 0 errors/warnings. The elevated
  production build compiled, generated all 41 static pages, and completed
  route output. The 390×844 fresh-production MapLibre gate passed A–N with no
  page errors or hangs and captured 13 screenshots.
- **Boundary:** `agent-browser` remained unavailable; Playwright supplied the
  browser seam. Managed Chromium/Next worker startup required the approved
  unrestricted path. Graphify refresh again returned `[WinError 5] Access is
  denied`; generated graph output was not edited manually.
- **Integrity:** GPS/session acquisition, heading acquisition/resolver, Capture,
  marker visuals, route progress, A*, routing graph/data, authored campus data,
  Studio, compiler, publisher, Supabase, QR, panoramas, PublishedCampus, and
  Vercel state were untouched.
- **Evidence:** `progress/NAVI-DAY-2-CAMERA-REPAIR-FINAL-INTEGRATED-GATE-2026-09-10.md`.
- **Status:** `DAY 2 CAMERA REPAIR — CODE/BROWSER INTEGRATED GATE PASS; PHYSICAL ANDROID VALIDATION REQUIRED BEFORE FIELD ACCEPTANCE.`

## 2026-09-10 — NAVI Outdoor Terrain Routing Phase 2 gate

- **Done:** Added Road Inspector authoring for feature, slope, direction,
  walkability, tri-state wheelchair accessibility, and optional elevations.
  Centralized nested routing normalization/merge, retained invalid numeric text
  locally, and used Phase 1 helpers for signed delta and grade. No persistence,
  graph, compiler, runtime, rendering, geometry, or topology behavior changed.
- **Verification:** Final Phase 2 focused group passed **159/159 across 8
  files**. The exact frozen Phase 0 matrix remained **227 passed / 4 known
  failed** at the identical compiler assertions. Canonical runtime passed
  **42/42**. All new Phase 2 files passed scoped ESLint. Elevated production
  build compiled and generated **41/41 static pages**.
- **Command/geometry:** A real `entity.update` characterization executed
  forward, inverse undo, and redo while preserving Road ID and polyline.
- **Boundaries:** Editor-wide TypeScript retains the existing unrelated
  diagnostic set with no Phase 2 file named. Required `graphify update .`
  re-extracted source but rebuild remained blocked by managed Windows
  `[WinError 5] Access is denied`.
- **Evidence:**
  `docs/audits/2026-09-10-navi-outdoor-terrain-routing-phase2-gate.md`.
- **Next:** Await explicit approval before Phase 3 persistence work.
- **Status:** `PHASE 2 PASS — STOPPED BEFORE PHASE 3`

## 2026-09-11 — NAVI Outdoor Terrain Routing Phase 3 persistence gate

- **Done:** Added one optional normalized `TracePath.routing` payload and
  restored it in both GraphAdapter directions. Centralized authored-member
  normalization in core and reused it from the Road Inspector. The existing
  graph snapshot/serializer transports the payload without a schema change.
- **Verification:** The final Phase 3 persistence matrix passed **198/198
  across 12 files**. New Phase 3/core contracts passed **84/84**. The exact
  frozen Phase 0 matrix retained **227 passed / 4 known failed**, canonical
  runtime passed **42/42**, and the production build generated **41/41 static
  pages**.
- **Persistence:** Local graph JSON, mocked Supabase-bound request JSON,
  Graph.fromJSON, graph-store reload, and createDocument reconstruction all
  preserve valid routing and legacy absence. No production Supabase data or
  migration was touched.
- **Integrity:** Tests preserve Road IDs, ordered points, explicit RoadJunction
  identity/membership, access-edge IDs, connectivity structure, Road order,
  deleted-entity absence, and the outdoor-vs-indoor stairs boundary.
- **Quality:** New/standalone Phase 3 files pass full-rule ESLint. Existing
  shared editor/type lint debt is unchanged; build passes. Graphify refresh
  remains blocked by the known managed Windows `[WinError 5]` boundary after
  source re-extraction.
- **Evidence:**
  `docs/audits/2026-09-11-navi-outdoor-terrain-routing-phase3-gate.md`.
- **Next:** Await explicit approval before Phase 4 compiler and published-graph
  metadata propagation.
- **Status:** `PHASE 3 PASS — STOPPED BEFORE PHASE 4`

## 2026-09-11 — NAVI Outdoor Terrain Routing Phase 4 compiler/published metadata gate

- **Done:** Added the optional canonical `RoadEdgeRouting` wrapper and carried
  normalized Road semantics through NormalizedRoad, Road-derived SkeletonEdge,
  canonical NavEdge, compiler artifact validation, publisher package mapping,
  compile/publish JSON, and the canonical runtime loader. Metadata remains
  passive; no topology, cost, eligibility, A*, database, or deployment behavior
  changed.
- **Verification:** The exact Phase 4 matrix passed **46/46** (38 root, 2
  publisher, 6 runtime). Expanded compiler/API coverage produced **76 passed / 2
  pre-existing failed**. Publisher regression passed **35/35**. The locked Phase
  0 matrix retained **227 passed / 4 known failed**, canonical runtime remained
  **42/42**, full-rule lint over new/clean files passed, and the production build
  generated **41/41 static pages**.
- **Invariants:** Sixteen metadata variants preserve node/edge topology,
  distance, and weight. Authored polyline orientation and source Road identity
  survive sampling and junction splits. Outdoor stairs remain walk edges;
  Road-level elevations are carried without segment interpolation. Runtime A*
  returns the same path and weighted cost.
- **Compatibility:** Legacy absence validates, packages, publishes, and loads
  without materialized defaults; malformed present routing is rejected. The
  Phase 1–3 persistence matrix passed 198/198 earlier in-session; a later rerun
  exposed its existing `updatedAt` fingerprint race at 197/198, reproducible in
  isolation and outside all Phase 4 files.
- **Boundary:** Package typechecks retain unrelated existing diagnostics. The
  required Graphify refresh re-extracted source, then again hit managed Windows
  `[WinError 5] Access is denied`; generated output was not manually changed.
- **Evidence:**
  `docs/audits/2026-09-11-navi-outdoor-terrain-routing-phase4-gate.md`.
- **Next:** Await explicit approval before Phase 5 terrain cost model design and
  proof.
- **Status:** `PHASE 4 PASS — STOPPED BEFORE PHASE 5`
## 2026-09-11: Outdoor terrain routing Phase 5 cost model design + proof

### Completed

- Re-audited current distance/weight ownership after Phase 4.
- Specified LOW/MEDIUM/HIGH finite nonnegative terrain profiles with MEDIUM as
  the proposed default, manual-slope authority, Road-level grade allocation,
  controlled feature/slope composition, and directional uphill/downhill cost.
- Added four test-only experiment files; no production route source changed.
- Proved all eight required numerical scenarios, legacy identity, 640 seeded
  A*–Dijkstra optimal-cost comparisons, and 10,944 heuristic-consistency checks.

### Verification

- Phase 5 experiments: 111/111 passed.
- Phase 4 metadata: root 38/38, publisher 2/2, runtime 6/6.
- Canonical runtime: 42/42.
- Locked Phase 0: 227 passed / same four known failures.
- Four-file scoped ESLint and production Next.js build exited 0.
- Required Graphify refresh re-extracted source, then reproduced the documented
  managed Windows `[WinError 5] Access is denied` rebuild boundary.

### Next

- Await explicit user approval or coefficient revision before Phase 6. Do not
  activate terrain routing, direction, walkability, or accessibility behavior.

## 2026-09-11 — NAVI Outdoor Terrain Routing Phase 6, tasks 6A–6C

- **Done:** Re-audited production seams, locked the approved Phase 6 spec and
  plan, added `STANDARD_TERRAIN_PROFILE_V1`, built one canonical source-Road
  length context, and implemented directional traversal cost with manual slope
  authority, capped elevation grade, and max-based stairs/slope composition.
- **Verification:** Focused traversal-cost RED first demonstrated the absent
  export, expanded RED produced 20 expected unimplemented failures, and the
  final GREEN suite passed 21/21.
- **Invariants:** Legacy/non-Road weight remains an exact pass-through; Road
  elevation is divided by total source-Road length rather than each emitted
  segment; invalid/duplicate/inconsistent Road inputs fail explicitly; every
  accepted terrain cost is finite and at least physical distance.
- **Next:** Implement and verify the standard pedestrian eligibility policy for
  walkability and authored direction; wheelchair metadata remains passive.

## 2026-09-11 — NAVI Outdoor Terrain Routing Phase 6, tasks 6D–6E

- **Done:** Added the versioned standard pedestrian eligibility policy and one
  endpoint-aware predicate. `walkable:false` rejects both directions;
  `forward` and `reverse` follow compiled edge orientation; missing/`both`
  remains bidirectional; wheelchair metadata is deliberately ignored.
- **Verification:** The focused export test failed RED, the expanded behavior
  suite produced eight expected stub failures, and final GREEN passed 9/9.
- **Next:** Refactor canonical A* to consume injected cost and eligibility
  callbacks without changing its default legacy behavior.

## 2026-09-11 — NAVI Outdoor Terrain Routing Phase 6, task 6F

- **Done:** Added generic traversal-cost and traversal-eligibility callbacks to
  canonical A*. No terrain, Road, slope, stairs, or walkability branch exists
  in the algorithm; omitted callbacks preserve existing edge-weight and
  bidirectional behavior.
- **Verification:** Four injection tests established two behavioral RED
  failures before implementation. The combined A*/cost/eligibility GREEN gate
  passed 34/34, including actual current-node propagation in reverse traversal.
- **Next:** Build the Road context once in RoutingEngine and supply both
  standard policies through the canonical runtime lifecycle.

## 2026-09-11 — NAVI Outdoor Terrain Routing Phase 6, tasks 6G–6H

- **Done:** RoutingEngine now builds source-Road length context once per graph
  lifecycle and closes the standard cost/eligibility providers over it. The
  physical edge index is bidirectional, fixing reverse-route distance fallback.
  NavigationService remains explicitly standard-only; legacy `accessible`
  preferences do not activate wheelchair filtering.
- **Verification:** RoutingEngine RED exposed terrain selection, direction, and
  reverse-distance failures. Final integration passed 54/54 across five focused
  files, followed by 21/21 service/engine checks with the passive-wheelchair
  contract.
- **Next:** Run required production numerical scenarios, Dijkstra comparisons,
  and heuristic consistency checks against the actual runtime functions.

## 2026-09-11 — NAVI Outdoor Terrain Routing Phase 6, tasks 6I–6J

- **Done:** Recreated the approved MEDIUM scenarios with production functions,
  compared production costs against the independent Phase 5 oracle, and added
  actual canonical A* direction/walkability route tests. Added a seeded
  eligibility-aware Dijkstra oracle for production optimality.
- **Verification:** Production scenarios passed 9/9. Across 32 graphs with 18
  nodes, 57 edges, and 20 pairs each, canonical A* matched Dijkstra in 640/640
  comparisons with zero counterexamples. The production cost provider passed
  10,944 cost/distance/haversine consistency checks.
- **Next:** Prove compiler-derived multi-segment and junction-split Road context,
  then verify unified outdoor↔entrance↔indoor routing in both directions.

## 2026-09-11 — NAVI Outdoor Terrain Routing Phase 6, task 6K

- **Done:** Added a real compiler-to-runtime contract for an authored-junction
  split Road and a unified outdoor terrain→entrance→indoor route fixture.
- **Verification:** The compiled junction test passed 1/1, proving unique
  emitted segments sum once to source-Road length and cost differs from the
  forbidden repeated-rise calculation. Unified routing passed 3/3 in both
  directions: generalized cost 145, reported physical distance 117, outdoor
  stairs stayed `walk`, and indoor generalized weights stayed exact.
- **Next:** Add the narrow Studio/public graph adapter, migrate safe active
  callers, preserve routing metadata in the public projection, and audit the
  inactive accessibility plugin.

## 2026-09-11 — NAVI Outdoor Terrain Routing Phase 6, tasks 6L–6M

- **Done:** Added one Studio/public-to-canonical runtime adapter and a narrow
  `@navi/runtime/routing` export. Migrated `findNavRoute` plus both active
  RouteTesting route calls; retained legacy adjacency only for topology
  diagnostics. Added the optional `RoadEdgeRouting` field to the public type,
  proved transport preservation, and added the safe explicit-Level warning.
- **Verification:** Adapter RED failed on the absent module; GREEN passed 2/2.
  The focused Inspector/public/store/route matrix passed 89/89, and the final
  narrow-import routing subset passed 52/52. Active public-store routing now
  proves terrain-aware selection with physical distance output.
- **Audit:** The old accessibility weight plugin is exported but appears only in
  its explicit compiler-plugin test; it is not registered in the production
  standard path and remains inactive. Legacy Studio A* remains only in compiler
  characterization tests; RouteTesting uses only its adjacency diagnostic.
- **Next:** Execute the full Phase 1–6, canonical runtime, legacy, Phase 0,
  type/lint/diff/build, Graphify, and localhost browser gates; then write the
  final report and stop.

## 2026-09-11 — Floor-plan non-uniform overlay audit

- **Done:** Completed an audit-only trace of floor-plan upload, Supabase/data-URL storage, canonical `Floor`/`PlanAlignment` data, MapLibre rendering, DOM/SVG interaction, coordinate conversion, command history, dirty/autosave/shared persistence, deletion, compiler/public/runtime behavior, and current tests. Wrote the requested 11-section audit at `docs/audits/2026-09-11-floor-plan-nonuniform-overlay-audit.md` and the file-by-file TDD plan at `docs/superpowers/plans/2026-09-11-floor-plan-nonuniform-overlay.md`. No production source, schema, tests, or UI behavior was intentionally modified.
- **Verification:** The focused current-behavior suite passed 51/51 tests across 7 files: floor-plan coordinates, resize, calibration formulas, handle projection, upload processing, generic history, and compiler floor-plan URL publication. Documentation checks confirmed all 11 required audit sections, the exact terminal verdict, and no placeholder markers in the implementation plan.
- **Findings:** The active data model has one footprint-relative `scale`; width and height do not exist internally. MapLibre renders the image, while DOM/SVG supplies controls. Current two-point calibration is incompatible with renderer units/origin, `PublishedCampus` carries a URL without alignment, the dedicated route can race final debounce/autosave on exit, removal can leave stale imagery/orphaned assets, and drag preview reloads the same image URL on every mousemove.
- **Recommendation:** Use optional `scaleX`/`scaleY` with `scaleX ?? scale ?? 1` and `scaleY ?? scale ?? 1`, true-meter local transforms, image-local scale before clockwise rotation, derived meter Width/Height in the inspector, pointer-captured RAF previews using `ImageSource.setCoordinates()`, and one immediate command on release. Crop remains normalized non-destructive metadata; four-corner warp remains research-only.
- **Gate:** `ARCHITECTURAL FIX REQUIRED FIRST`; six explicit preconditions are listed in the audit.
- **Graphify:** Required `graphify update .` failed at code re-extraction with the documented `[WinError 5] Access is denied` boundary. Pre-edit Graphify queries succeeded; generated output was not manually repaired.
- **Next:** Stop after audit. Await explicit approval before executing Phase 0 or any implementation task.

## 2026-09-11 — Floor-plan transform Phase 1, T1–T2

- **Done:** Consolidated the authorized four-phase Phase 1 SPEC/PLAN/TODO. Added T1 characterization coverage for legacy-vs-axis coordinates, renderer-contract calibration, and visual-only publication. Added the core `PlanAlignment` axis fields (`scaleX`, `scaleY`, overlay `locked`) and the shared true-meter transform authority with safe resolution, deduplicated footprint frames, forward/inverse transforms, and derived dimensions.
- **Verification:** T1 RED was intentional: 3 audited failures and 11 existing assertions passed. T2 GREEN passed 6/6 pure transform tests. No resize handles, Inspector controls, crop, warp, or new authoring tools were added.
- **Next:** T3 route MapLibre coordinates through the canonical authority and remove stale imagery on invalid URL/footprint.

## 2026-09-11 — Floor-plan transform Phase 1, T3

- **Done:** Routed active editor and public MapLibre image reconciliation through `syncFloorPlanImageLayer`; invalid URL/footprint now hides stale layers, unchanged URLs update coordinates without pixel reloads, and changed URLs reload once. Refactored resize meter/rotation math to consume the shared true-meter frame authority.
- **Verification:** Transform, coordinate, resize, and lifecycle tests passed 39/39 focused assertions; the existing `FloorEditorCanvas` suite passed 16/16.
- **Next:** Repair two-point calibration so image pixels and map clicks produce canonical axis scales, clockwise rotation, and true-meter offsets.

## 2026-09-11 — Floor-plan transform Phase 1, T4

- **Done:** Repaired two-point calibration to require image dimensions and the true-meter footprint frame, write canonical `scaleX`/`scaleY`, use clockwise rotation and center-relative meter offsets, inverse-transform screen clicks through the active image, and validate map clicks in local meters. Updated the active editor click/preview wiring.
- **Verification:** Calibration unit and renderer-contract tests passed 12/12. The broader floor-editor directory retained five unrelated pre-existing routing/room-property failures; the changed calibration files had no failures.
- **Next:** Preserve all alignment fields through document/graph/snapshot reload and publish visual metadata without changing topology.

## 2026-09-11 — Floor-plan transform Phase 1, T5

- **Done:** Preserved legacy and axis alignment fields through document JSON,
  GraphAdapter/graph reconstruction, local snapshot loading, and RPC snapshot
  serialization. Added optional `PublishedFloorPlanVisual` metadata with
  alignment-aware compiler emission and runtime conversion while retaining
  legacy floor-plan URL compatibility.
- **Verification:** The focused persistence/compiler matrix passed 232/232
  assertions across 8 files; the runtime visual-loader contract passed 1/1.
  The topology fingerprint remained identical with and without visual metadata.
  The two known disconnected-fixture failures in the broader published-artifact
  pipeline remain classified as pre-existing `HALLWAY_DISCONNECTED` behavior.
- **Next:** Run the complete Phase 1 verification matrix, inspect scope, refresh
  Graphify, and write the Phase 1 gate report.

## 2026-09-11 — Floor-plan transform Phase 1, T6 final gate

- **Done:** Completed the consolidated Phase 1 architecture/compatibility gate,
  added the optional publication-reader fix, classified protected baseline
  failures, inspected the Phase 2 boundary, and wrote
  `docs/reports/2026-09-11-floor-plan-transform-phase1-gate.md`.
- **Verification:** The final focused matrix passed 16 files and 274/274 tests;
  runtime visual conversion passed 1/1; runtime routing passed 11/11; the
  changed persistence/compiler subset passed 39/39. The protected published-
  artifact fixture retained two `HALLWAY_DISCONNECTED` failures, `tsc` retained
  the known runtime-test parse error, and Graphify retained `[WinError 5]`;
  each is recorded in `errors/ERRORS.md` and the gate report.
- **Scope:** No new resize handles, Inspector controls, crop, warp, perspective,
  pointer-capture/RAF preview, database, deployment, or topology changes.
- **Gate:** `PHASE 1 PASS — READY FOR PHASE 2`.
- **Next:** Stop and wait for explicit Phase 2 approval.

## 2026-09-11 — NAVI Outdoor Terrain Routing Phase 6 final gate

- **Done:** Activated the locked `STANDARD_TERRAIN_PROFILE_V1` and separate
  standard-pedestrian eligibility in canonical runtime routing. Migrated active
  public/RouteTesting route selection through one canonical adapter, preserved
  exact selected edge identity and physical distance, added the Inspector
  conflict warning, and kept accessibility passive. No topology, geometry,
  database, publication, deployment, or accessible-profile change occurred.
- **Optimality:** Four deterministic and 640 seeded (`0x5eedc0de`) production
  A*–Dijkstra comparisons matched within `1e-8`; 10,944 production heuristic/
  lower-bound checks passed with zero counterexamples.
- **Verification:** Phase 6 runtime passed 94/94; final Studio/public/editor seam
  passed 91/91; Phase 4 + Phase 5 root gates passed 149/149; publisher metadata
  passed 2/2; the locked Phase 0 matrix retained 227 passed / the same four
  failures. The settled full repository run completed with 5,172 passed, 32
  pre-existing failed, and 8 skipped tests across 484 files. Scoped Phase 6
  ESLint and the production build (41 pages) passed.
- **Baselines:** Full runtime collected 386 passing tests but retains the known
  unrelated parse-failed suite. The Phase 1–3 rerun retains the known one-test
  timestamp race. Scoped typecheck names only four established core model/
  export errors; broad touched-file lint names only inherited RouteTesting and
  nav-types debt.
- **Boundary:** Browser/field terrain validation remains pending because the six
  authored scenarios cannot be loaded in the current UI without campus/DB
  mutation. Required Graphify refresh re-extracted source and again hit
  `[WinError 5] Access is denied`; generated output was not edited manually.
- **Review:** Independent code review found no remaining blocker after fixes for
  arbitrary-cost heuristic safety, invalid routing fallback, immutable context,
  profile validation, parallel-edge identity, and compiler-to-runtime proof.
- **Evidence:**
  `docs/audits/2026-09-11-phase6-terrain-aware-routing-gate.md`.
- **Status:** `CODE GATE PASS — BROWSER/FIELD VALIDATION PENDING; STOPPED FOR USER REVIEW.`

## 2026-09-11 — Phase 6 field-validation audit

- **Done:** Completed the read-only audit of the existing RouteTesting/public-store
  data path, Road routing metadata flow, safe local/demo artifacts, Studio reload
  initialization, ghost-map behavior, and the six-scenario browser-validation
  boundary. Wrote the required audit report and workflow SPEC/PLAN/TODO artifacts.
- **Next:** Wait for user review. If approved separately, implement only the
  narrowly scoped local fixture/pass-through follow-up described in the report.
- **Verification:** Confirmed all 36 cited source/artifact paths exist; report
  headings and required stop line are present; focused Vitest run passed 3 files
  and 47 tests. No application code, database, publish, deploy, or browser
  fixture infrastructure was changed.

## 2026-09-11 — Phase 6 field-validation support gate

- **Done:** Preserved validated Road routing metadata through the public store,
  exposed generalized cost separately from physical distance, added pure
  deterministic six-scenario local fixtures, fixed exact selected-edge
  observability, and added development-only `/routes` diagnostics.
- **Verification:** The protected support matrix passed 126/126 tests; the
  post-lint fixture/inspector regression run passed 25/25; the elevated
  production build generated all 41 static pages; focused support lint passed;
  and the localhost `/routes` browser run reported PASS for all six scenarios
  and direction subcases. Repository typecheck, full changed-file lint, and
  Graphify refresh retained only logged pre-existing/environment failures.
- **Isolation:** No terrain policy, A* math, topology, geometry, Studio,
  accessibility, Supabase, production campus, publish, deploy, or ghost-map
  behavior was changed. Fixture selection made no graph/publish write.
- **Evidence:** `progress/PHASE-6-FIELD-VALIDATION-SUPPORT-GATE-2026-09-11.md`.
- **Next:** Stop and wait for explicit user review.

## 2026-09-11 — NAVI floor-plan transform Phase 2 final gate

- **Done:** Implemented the pure eight-handle resize authority and replaced the
  floor-plan transform surface with Pointer Events, pointer capture, immutable
  gesture-start snapshots, RAF-coalesced visual previews, session-local aspect
  lock, shared cancellation/cleanup, and one pointerup commit.
- **MapLibre:** Transform previews call `ImageSource.setCoordinates()` only;
  unchanged image URLs are not reloaded. Map drag state is restored exactly
  once on commit, pointercancel, Escape, lost capture, validation failure, and
  unmount.
- **Isolation:** No transform component path dispatches document commands,
  dirty/autosave/upload/Supabase/publication writes, or authored geometry/tool
  mutations during pointermove. Existing route-characterization failures remain
  classified as unrelated dirty-checkout baseline behavior.
- **Verification:** Phase 2 geometry/interaction/MapLibre plus protected
  Phase 1 root matrix passed 13 files / 92 tests; runtime visual-loader and
  routing protection passed 2 files / 12 tests; scoped FloorEditorCanvas passed
  6/6; scoped ESLint and component diff checks passed. Repository `tsc` retains
  only the known `data-identity-comparison.test.ts:255` unmatched-brace error.
- **Tooling boundary:** Required Graphify refresh retried after the final source
  edits and again hit `[WinError 5] Access is denied`; generated output was not
  edited.
- **Evidence:** `docs/reports/2026-09-11-floor-plan-transform-phase2-gate.md`.
- **Next:** Stop and wait for explicit approval before Phase 3.

## 2026-09-11 — NAVI floor-plan transform Phase 3 final gate

- **Done:** Added the canonical pure Inspector helpers and controlled
  `FloorPlanTransformInspector`; lifted default-on session aspect-lock state;
  made `FloorEditor` the sole immediate alignment commit authority; removed the
  old 500 ms transform commit debounce; preserved Phase 2 pointermove-only
  previews and shared cleanup; and kept `Floor.locked` separate from
  `planAlignment.locked`.
- **Lifecycle:** Unified dedicated-editor and Floor Manager upload/replace/remove
  metadata policy, documented and tested the 1% source-aspect compatibility
  rule, preserved visual fields only for compatible replacements, reset unknown
  or materially conflicting geometry deterministically, gated Supabase cleanup
  by owned managed URL scope, and made explicit `planImageId: null` hide stale
  legacy URLs immediately.
- **Persistence/isolation:** Route visibility, beforeunload, and unmount now
  flush through the existing GraphAdapter/graph-store local path. Pointermove
  remains visual-only with no dispatcher, dirty/autosave, upload, Supabase,
  publication, or authored-geometry path.
- **Verification:** Final focused Phase 3 matrix passed **19 files / 119 tests**;
  runtime visual-loader/routing passed **2 files / 12 tests**; integration,
  lifecycle, and MapLibre regression passed **4 files / 13 tests**; targeted
  diff checks were clean; the new-file lint subset had **0 errors** (one
  existing upload-thumbnail warning). The protected compiler/route baselines
  retained their known four failures, repository typecheck retained only the
  known runtime unmatched-brace error, and Graphify retained `[WinError 5]`;
  all are classified in `errors/ERRORS.md` and the gate report.
- **Evidence:** `docs/reports/2026-09-11-floor-plan-transform-phase3-gate.md`.
- **Boundary:** No Phase 4 browser/field validation, crop, warp, perspective,
  routing/topology, published-data, deployment, or database work was started.
- **Next:** Stop and wait for explicit approval before Phase 4.

## 2026-09-11 — NAVI floor-plan transform Phase 4 final gate

- **Done:** Completed the bounded final regression and local Studio browser
  gate. No production source code was changed during Phase 4; the existing
  dirty checkout was preserved.
- **Browser:** Validated the seeded local, no-Supabase-key Studio route at
  `/studio/map-map-1-k6bv/edit/building/osm-bldg-888026366/floor/0` for Comsci
  Building / GF at the normal 1294x915 desktop viewport. Existing MapLibre
  floor-plan rendering showed the non-uniform dimensions, rotation, opacity,
  Inspector values, and separate overlay/floor lock states. Temporary local
  move, width-only, height-only, free-corner, aspect-locked corner, rotation,
  numeric, invalid-width, overlay-lock, and Fit/reset checks passed. A
  distinctive transform survived immediate exit/return and reload, then was
  restored exactly; outliner topology counts remained 1 entrance, 7 nodes,
  and 4 edges. Browser console error/warning capture was empty.
- **Protected verification:** Post-browser floor-plan matrix passed **19/19
  files and 119/119 tests**; runtime visual-loader/routing passed **2/2 files
  and 12/12 tests**. The compiler/route characterization command reproduced
  **4 failed / 68 passed / 72 total** with the exact prior `HALLWAY_DISCONNECTED`
  and two route-authoring signatures. TypeScript retained only the known
  runtime unmatched-brace diagnostic. Scoped lint exited 0 with one existing
  upload-thumbnail warning. Targeted diff checks were clean apart from normal
  Windows line-ending notices.
- **Limitations:** Upload, replace, remove, narrow responsive viewport, and
  destructive storage flows were not browser-executed to avoid production
  storage/database mutation; the protected lifecycle/storage tests cover them.
  The Campus link briefly reported `Map not found` in the local route shell;
  direct floor-route reload and persistence remained valid. `agent-browser`
  was unavailable, so the available in-app browser automation surface was
  used. Required Graphify refresh again hit `[WinError 5] Access is denied`.
- **Evidence:** `docs/reports/2026-09-11-floor-plan-transform-phase4-gate.md`.
- **Next:** Stop and wait for explicit approval before any follow-up work.

## 2026-09-11 — NAVI Studio Unified POI System Phase 1 audit gate

- **Done:** Completed the read-only Area/POI/Building/rendering/search/
  routing/persistence/publish audit and wrote the required A–N report at
  `navi-next/progress/PHASE-1-POI-SYSTEM-AUDIT-2026-09-11.md`.
- **Scope boundary:** No production source, tests, fixtures, authored data,
  schema, migration, publish, deployment, or Phase 2 editor work was started.
  The existing dirty checkout was preserved.
- **Verification:** Report structure checks found all A–N sections, all 15
  required answers, and the exact final gate lines. Focused baselines passed
  authoring/editor 10 files / 192 tests, core/editor 6 files / 97 tests,
  runtime 3 files / 40 tests, and app navigation/map 4 files / 77 tests.
  The separately classified compiler fixture baseline retained two existing
  `HALLWAY_DISCONNECTED` failures; repository TypeScript retained the known
  unmatched-brace diagnostic at
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`.
- **Gate:** `PASS WITH CONDITIONS`. Conditions are the documented lossless
  `Floor.pois` persistence gap in the active Studio bridge, the unresolved
  authoring-to-runtime destination contract, and incomplete active-editor POI
  selection/rendering integration.
- **Next:** Stop and wait for review before any Phase 2 implementation.

## 2026-09-11 — NAVI Studio Unified POI System Phase 2 gate

- **Done:** Selected the minimal Strategy C contract: existing floor-owned
  `PointOfInterest` / `Floor.pois` remains the sole authored POI identity;
  Areas remain a separate compatibility input; no schema bump or second POI
  store was introduced.
- **Implementation:** Added the missing optional `f.pois` projection to
  `navi-next/packages/editor/src/graph-adapter.ts`. Added the focused
  `poi-contract-persistence.test.ts` suite covering graph/snapshot/reload,
  multiple POIs, legacy absence, Area parity, command history, save-after-
  history, and routing-topology immutability.
- **Verification:** The final Phase 2 matrix passed **9 files / 153 tests** in
  4.81s; the new focused suite passed **4/4 tests**. Targeted ESLint passed
  with 0 errors and 3 inherited adapter warnings. The repository typecheck
  retained the known runtime `TS1005` unmatched-brace error, and Graphify
  refresh retained the known Windows `[WinError 5] Access is denied` boundary;
  both are classified in `errors/ERRORS.md`.
- **Report:**
  `navi-next/progress/PHASE-2-POI-CONTRACT-PERSISTENCE-GATE-2026-09-11.md`
  contains sections A–J and ends with `PHASE 2 GATE: PASS` plus one
  recommendation line.
- **Boundary:** No Phase 3/4 UI, geometry, 2.5D, search, destination,
  arrival, publish, deployment, migration, or unrelated topology work was
  started. The existing dirty checkout was preserved.
- **Next:** Stop and wait for explicit review before Phase 3.

## 2026-09-12 — NAVI Studio Unified POI System Phase 3A Task 2 RED

- **Done:** Wrote and verified the Phase 3 SPEC/PLAN and added the focused
  point-only RED tests for the active Studio lookup, renderer/source/layer,
  Inspector command routing, campus tool entry, and map placement/selection
  seams.
- **Verification:** The default sequential Vitest invocation hit the known
  Windows `spawn EPERM` config-startup boundary. The unchanged elevated rerun
  collected **4 files / 8 tests** and failed all 8 intended assertions: the
  current active surface has no POI lookup/rendering source/Inspector/tool or
  interaction integration yet. No production code was changed at RED.
- **Scope:** Existing Phase 2 undo/redo, save/reload, Area compatibility, and
  topology-neutrality tests remain protected; no Circle/Rectangle/Polygon,
  second POI collection, graph connectivity, or Phase 4 behavior was added.
- **Next:** T3 — add typed POI selection/lookup and the dedicated Inspector,
  then rerun the focused tests before moving to renderer/interaction work.

## 2026-09-12 — NAVI Studio Unified POI System Phase 3A Task 3 GREEN

- **Done:** Added `PoiSelector`, POI lookup in shared selectors and property
  resolution, and the dedicated point POI Inspector. The Inspector preserves
  the authored ID and dispatches only `poi.update` and `poi.delete`.
- **Verification:** Focused identity/Inspector rerun passed **5/5 tests**.
  The two remaining failures in the combined POI fixture are the expected
  renderer/source seams reserved for T4.
- **Tooling:** Required `graphify update .` was attempted after the source
  edits and retained the known Windows `[WinError 5] Access is denied`
  boundary; generated graph output was not touched.
- **Next:** T4 — integrate point GeoJSON/source/layer lifecycle, campus tool
  exposure, floor-local point placement, selection, and hover state.

## 2026-09-12 — NAVI Studio Unified POI System Phase 3A Task 4 GREEN

- **Done:** Added the canonical `pois` FeatureCollection, promoted
  `navi-pois` source, active-floor point layer, campus POI tool entry, and
  active controller support for floor-local point placement, selection, and
  hover feature state. EditorBridge now preserves POI building/floor scope
  when it reconstructs a selector from legacy state.
- **Verification:** The focused 3A matrix passed **5 files / 14 tests**. The
  adjacent editor/Studio regression matrix passed **8 files / 80 tests**; the
  selection/bridge matrix passed **5 files / 73 tests**.
- **Scope:** No Circle/Rectangle/Polygon contract, second POI collection,
  graph connectivity, Roads, Areas, RouteNetworks, search, destination, or
  arrival behavior was added.
- **Tooling:** Required `graphify update .` was attempted after the T4 source
  edits and again retained `[WinError 5] Access is denied`; generated output
  was preserved.
- **Next:** T5 — run the complete 3A gate, protected Phase 2 matrix, hygiene
  classification, report, and stop before 3B.

## 2026-09-12 — NAVI Studio Unified POI System Phase 3A gate

- **Done:** Completed the point-only Studio slice: typed POI selection and
  Inspector routing, floor-local point rendering, active-floor source/layer,
  campus point placement, select/hover state, specialized create/update/delete
  dispatch, and scoped EditorBridge selection recovery.
- **Verification:** The final focused 3A/regression matrix passed **16 files /
  130 tests**. The protected Phase 2 persistence/history/topology matrix
  passed **9 files / 153 tests**. Targeted production lint exited 0 with 0
  errors and 6 existing warnings; `git diff --check` exited 0. The root and
  editor package typechecks retain documented unrelated baselines, and the
  required Graphify refresh retains the known Windows access-denied boundary.
- **Report:**
  `navi-next/progress/PHASE-3A-POI-STUDIO-INTEGRATION-GATE-2026-09-12.md`
  records the exact commands, counts, protected constraints, limitations, and
  the verdict `3A — PASS WITH CONDITIONS`.
- **Boundary:** Browser validation is pending; no browser evidence is claimed.
  3B/3C/3D, geometry contracts, Phase 4 search/destination/arrival work, and
  topology changes were not started. Stop here for separate continuation
  approval.

## 2026-09-12 — NAVI Unified POI System Phase 3B B1 specification and plan

- **Done:** Read the approved Phase 3B brief and preserved the Phase 2/3A
  gates. Inspected the narrow reusable seams for `LocalCoord`, polygon
  validation, rectangle primitives, coordinate transforms, specialized POI
  commands, GraphAdapter, snapshot serialization, and `createDocument`.
- **Decision:** Use one `PointOfInterestGeometry` discriminated union with
  local Point/Circle/axis-aligned normalized Rectangle/open ordered Polygon
  variants. Legacy position-only points remain canonical and are lazily
  resolved; non-point records persist geometry without a competing position.
- **Artifacts:** Added the Phase 3B SPEC section, visible root TODO, and
  `docs/superpowers/plans/2026-09-12-unified-poi-phase3b.md`. B1 is checked;
  B2 RED is the only active task. No production code or geometry authoring UI
  has been changed.
- **Verification:** SPEC/PLAN/report-path checks passed; the detailed plan
  contains no forbidden placeholders and leaves 3C/3D unchecked.
- **Next:** B2 — write and run the failing contract, validation,
  command/history, persistence, Area, and topology-protection tests before
  changing production types.

## 2026-09-12 — NAVI Unified POI System Phase 3B B2 RED gate

- **Done:** Added test-only coverage for the typed Point/Circle/Rectangle/Polygon geometry contract, validation rules, specialized POI command behavior, exact undo/redo restoration, graph snapshot reload, Area preservation, and topology neutrality.
- **Files:** `navi-next/packages/core/src/validation/poi-geometry.test.ts`, `navi-next/packages/editor/src/__tests__/poi-geometry-contract.test.ts`.
- **Verification:** Default Vitest startup reproduced the known Windows `spawn EPERM`; the identical approved external run collected 21 tests and failed for the intended pre-implementation reasons: missing core helpers, legacy-only POI handlers, and the reader synthesizing position while dropping geometry.
- **Next:** B3 — implement the core POI geometry union, resolver, and validation without touching command or UI seams.

## 2026-09-12 — NAVI Unified POI System Phase 3B B3 core contract

- **Done:** Added `PointOfInterestGeometry` with point, circle, normalized axis-aligned rectangle, and open ordered polygon variants; made explicit geometry mutually exclusive with legacy `position`; exported pure validation and compatibility resolver helpers from `@navi/core`.
- **Files:** `navi-next/packages/core/src/types/entities.ts`, `navi-next/packages/core/src/validation/poi-geometry.ts`, `navi-next/packages/core/src/index.ts`.
- **Verification:** Focused core contract test passed **1 file / 16 tests** through the approved external Vitest runner. The default runner reproduced the already logged Windows `spawn EPERM` startup boundary.
- **Next:** B4 — extend the existing specialized `poi.create`, `poi.update`, and `poi.delete` command path and the graph reload reader; keep 3A point consumers compatible.

## 2026-09-12 — NAVI Unified POI System Phase 3B B4 command and reload integration

- **Done:** Extended the existing specialized POI create/update/delete handlers to accept one validated spatial source, switch shapes without changing IDs, and restore exact representations through inverse commands. The graph reload reader now preserves `geometry` without dual-writing `position`; point-only GeoJSON and Inspector consumers resolve legacy/explicit points through the core helper and defer non-point rendering/editing.
- **Files:** `navi-next/packages/editor/src/commands/feature-handlers.ts`, `navi-next/packages/editor/src/context/create-editor-context.ts`, `navi-next/packages/editor/src/rendering/geojson.ts`, `navi-next/packages/editor/src/panels/properties/poi-props.tsx`.
- **Verification:** New Phase 3B contract matrix passed **2 files / 21 tests**. Adjacent Phase 2 persistence plus Phase 3A point-consumer matrix passed **6 files / 31 tests**.
- **Next:** B5 — run the protected Phase 2/3A regression matrix, final hygiene/constraint checks, refresh Graphify, write the Phase 3B report, and stop before 3C/3D.

## 2026-09-12 — NAVI Unified POI System Phase 3B gate

- **Done:** Completed the authorized 3B geometry-contract slice and stopped at the contract boundary. `Floor.pois` remains canonical; legacy points, explicit point/circle/rectangle/polygon records, validation, commands/history, reload, Areas, and topology neutrality are covered.
- **Verification:** Final 3B matrix passed **2 files / 21 tests**; protected Phase 2 passed **9 files / 153 tests**; protected Phase 3A passed **16 files / 130 tests**; focused new-file ESLint and whitespace checks passed. Known Vitest sandbox, root/editor typecheck, broader lint, and Graphify conditions are documented.
- **Report:** `navi-next/progress/PHASE-3B-POI-GEOMETRY-CONTRACT-GATE-2026-09-12.md` records the full evidence and exact verdict `3B — PASS WITH CONDITIONS`.
- **Stop:** Do not begin 3C, 3D, shape authoring/rendering, appearance, search, destination, arrival, publish, or routing work in this continuation.

## 2026-09-12 — NAVI Unified POI System Phase 3C C1 specification and bounded audit

- **Done:** Read the required Phase 2, Phase 3A, Phase 3B, SPEC, PLAN, and
  prior Phase 3 plan artifacts. Queried Graphify before source search and
  inspected only the active ToolDock, point POI controller/tool path,
  SelectionOverlay, EntityRenderer/GeoJSON/layers, AreaTracer preview
  convention, command/history seam, and CoordinateTransformer.
- **Decision:** Circle and Rectangle use direct transient map pointer state;
  Polygon uses a dedicated no-snap POI state and Enter/Finish completion,
  borrowing only the AreaTracer preview convention. The active road snap path,
  route graph, and existing vertex editor are not reusable for POIs. Persisted
  shapes stay in the existing `navi-pois` source; previews use a disposable
  Studio-only source.
- **Artifacts:** Added the Phase 3C SPEC section, root visible TODO, and
  `docs/superpowers/plans/2026-09-12-unified-poi-phase3c.md`. C1 is checked;
  C2 RED is the only active task. No application production source changed.
- **Verification:** Stable-phrase structure checks passed for the new spec and
  plan sections; root `git diff --check` reported only normal LF/CRLF notices.
- **Next:** C2 — add and run failing geometry authoring, rendering, ToolDock,
  Inspector, cancellation, selection, and topology tests before production
  implementation.

## 2026-09-12 — NAVI Unified POI System Phase 3C C2 RED gate

- **Done:** Added test-only RED coverage for local circle radius,
  axis-aligned rectangle normalization, open polygon ordering and invalid
  drafts, transient shape commit/cancel/finish behavior, persisted shape
  GeoJSON/layers, ToolDock geometry leaves, polygon selection, and the shared
  Inspector geometry label.
- **Verification:** The default focused Vitest command reproduced the known
  `spawn EPERM` startup boundary. The identical elevated rerun collected
  **8 files / 44 tests** and reached the intended RED state: 7 assertion
  failures plus 2 missing-module suites for the not-yet-created pure helper
  and authoring component. Existing point POI tests in the same batch remained
  green.
- **Scope:** No application production source changed at C2. Phase 2/3A/3B
  protected suites were not weakened; no routing, Area, Building, Phase 3D,
  or Phase 4 behavior was added.
- **Next:** C3 — implement the pure local geometry helper first, then rerun
  its focused tests before adding the active Studio authoring component.

## 2026-09-12 — NAVI Unified POI System Phase 3C C3 local geometry helpers

- **Done:** Added the pure `LocalCoord` authoring helpers for local distance,
  normalized axis-aligned rectangles, open circle/rectangle display points,
  and validated Point/Circle/Rectangle/Polygon geometry construction. The
  helper has no road, graph, Area, or routing dependency.
- **Verification:** The elevated Vitest output showed **4/4 helper tests
  passing**. The repository include configuration also collected the new C4
  component test, which correctly remained unresolved until that component is
  implemented; this is recorded separately from the helper result.
- **Next:** C4 — implement transient preview/commit state, cancellation and
  finish behavior, ToolDock geometry leaves, and active Studio mounting.

## 2026-09-12 — NAVI Unified POI System Phase 3C C4 authoring integration

- **Done:** Added the dedicated transient Circle/Rectangle/Polygon authoring
  component with local coordinate conversion, disposable preview source/layers,
  cancel/finish controls, one specialized `poi.create` commit, and stable POI
  selection. Exposed Point/Circle/Rectangle/Polygon as one campus POI flyout and
  kept the legacy point controller path intact.
- **Verification:** The elevated focused C4 matrix passed **4 files / 23
  tests** covering helper geometry, circle commit/selection, rectangle cancel,
  polygon finish, ToolDock leaves, and registry IDs. The default runner hit the
  known Windows `spawn EPERM` startup boundary first.
- **Constraints:** No road snapping, Areas, Buildings, graph nodes/edges, or
  route commands were added.

## 2026-09-12 — NAVI Unified POI System Phase 3C C5 persisted shape rendering

- **Done:** Persisted Circle/Rectangle/Polygon POIs now render as display
  polygons in the existing `navi-pois` source, while point POIs remain point
  features. Added fixed 2D shape fill/outline layers, feature-state selection
  and hover hit targets for all shapes, and a shared Inspector geometry readout.
- **Verification:** The elevated focused C5 matrix passed **5 files / 42 tests**
  covering GeoJSON transformation, layer paint contracts, renderer layer
  registration, polygon selection, and the shared Inspector. The default runner
  hit the known Windows `spawn EPERM` startup boundary first.
- **Next:** C6 — run the complete 3C and protected Phase 2/3A/3B matrices,
  classify hygiene/type/lint/Graphify baselines, and attempt safe browser
  validation.

## 2026-09-12 — NAVI wall enclosure topology T1/T2

- **Done:** Added RED wall-enclosure characterizations for dangling traversals,
  exterior/interior input order, and reversed authored wall directions. Updated
  the planar half-edge derivation to require a closed simple cycle, track and
  mark traversed edges safely, and retain only the bounded clockwise winding
  emitted by the existing right-face traversal.
- **Verification:** The focused topology suite passed **3/3 tests**. The
  existing geometry, topology, W5 derived-room, wall-tool, and wall-command
  suites passed **6 files / 99 tests**.
- **Next:** T3 — verify command and MapLibre/rendering isolation, then run the
  final gate and update the error ledger.

## 2026-09-12 — NAVI wall enclosure topology final gate

- **Done:** Completed the bounded wall topology repair and added the required
  audit report at `docs/audits/2026-09-12-wall-enclosure-topology-audit.md`.
  Invalid open/repeated/exterior walks can no longer become purple derived
  partitions; authored intersections, deletion recomputation, and wall
  persistence remain intact.
- **Verification:** Final focused gate passed **10 files / 132 tests**; the
  post-review source/test rerun passed **2 files / 22 tests**. Changed source
  lint had **0 errors** with one pre-existing `_doors` warning.
  Changed artifacts have no trailing whitespace. Root/editor typecheck remains
  blocked only by the documented unrelated parse/rootDir/type debt. Graphify
  refresh was attempted and recorded as the known `[WinError 5]` boundary.
- **Next:** Stop at the completed wall-enclosure scope; no unrelated editor,
  routing, floor-plan transform, Room, or deployment work is authorized here.

## 2026-09-12 — NAVI Unified POI System Phase 3C C6/C7 gate

- **Done:** Completed the Phase 3C geometry-authoring slice for Point, Circle,
  Rectangle, and Polygon, including active Studio tools, transient preview and
  cancellation, specialized POI commands, stable selection, persisted 2D
  rendering, Inspector identity, and topology-neutral lifecycle coverage.
- **Verification:** The final 3C matrix passed **9 files / 52 tests**;
  protected Phase 3B passed **2 files / 21 tests**, protected Phase 3A passed
  **16 files / 135 tests** (including additive shape assertions), and protected
  Phase 2 passed **9 files / 153 tests**. New Phase 3C lint and scoped hygiene
  checks passed. Known root/editor typecheck, shared-seam lint, Vitest startup,
  Graphify permission, and browser-fixture conditions remain classified in the
  gate report.
- **Report:** Verified
  `navi-next/progress/PHASE-3C-POI-GEOMETRY-AUTHORING-GATE-2026-09-12.md`
  with the required A–L sections, `NO TOPOLOGY MUTATION`, browser pending
  status, and exactly one final verdict: **3C — PASS WITH CONDITIONS**.
- **Stop:** Phase 3D and Phase 4 were not started. The Phase 3C visible TODO is
  complete; no further implementation is authorized in this slice.

## 2026-09-12 — NAVI Unified POI System Phase 3D D2 RED

- **Done:** Added the Phase 3D RED suite for the additive appearance contract,
  specialized command/history behavior, graph snapshot reload, resolved POI
  GeoJSON, POI extrusion/layer registration, Inspector controls, and 2.5D hit
  testing. No production source was changed.
- **Verification:** The default focused Vitest command stopped at the known
  Windows `spawn EPERM` config boundary. The identical approved elevated run
  collected **8 files / 52 tests** and reported **40 passed / 12 failed**;
  every failure was an expected absent-Phase-3D behavior assertion, with no
  missing-module or malformed-fixture collection failure.
- **Next:** D3 — implement only the additive core appearance contract,
  validation/resolution, specialized command/history behavior, and reload
  preservation; then rerun the D3 RED-to-GREEN seams.

## 2026-09-12 — NAVI Unified POI System Phase 3D D3 core/persistence

- **Done:** Added the optional `PointOfInterest.appearance` contract with
  Marker/2D/2.5D modes, default resolution, bounded finite extrusion height,
  geometry compatibility validation, specialized POI command validation and
  exact optional-field undo/delete restoration, plus reader preservation.
  `Floor.pois` remains the only canonical collection; GraphAdapter and the
  serializer remain unchanged.
- **Verification:** Fresh elevated verification passed **5 files / 26 tests**,
  including the new reject-before-mutation test and the protected Phase 2 POI
  persistence/topology suite. Required Graphify refresh reproduced the known
  `[WinError 5]` permission boundary and was logged separately.
- **Next:** D4 — add resolved POI GeoJSON appearance properties, the POI-only
  extrusion layer and filters, active-floor behavior, and shared extrusion
  hit-testing without touching graph connectivity.

## 2026-09-12 — NAVI Unified POI System Phase 3D D4 rendering

- **Done:** Added resolved mode/height/base properties to the existing POI
  GeoJSON source, a POI-only feature-state-aware `fill-extrusion` layer,
  mode-specific 2D/extrusion/marker filters, and shared 2.5D click/hover hit
  testing. Active-floor filtering remains on the existing shared POI source.
  No graph, road, Area, Building, or navigation state was added.
- **Verification:** Fresh elevated verification passed **4 files / 43 tests**,
  including GeoJSON base derivation, layer paint/filter seams, renderer layer
  registration, active-floor filtering, and 2.5D selection. Required Graphify
  refresh reproduced the known `[WinError 5]` permission boundary and was
  logged separately.
- **Next:** D5 — add the minimal appearance mode/conditional-height Inspector
  controls, routed only through `poi.update`, then verify the full focused
  Phase 3D suite.

## 2026-09-12 — NAVI Unified POI System Phase 3D D5 Inspector

- **Done:** Added the bounded Inspector appearance control. Legacy/point POIs
  show a disabled Marker mode; shaped POIs can choose 2D or 2.5D; only 2.5D
  exposes finite-height editing. All edits dispatch the existing specialized
  `poi.update` command and no color/navigation/Building/Area controls were
  introduced.
- **Verification:** Fresh elevated verification passed **3 files / 25 tests**,
  including persisted-height visibility and the protected POI geometry suite.
  Required Graphify refresh reproduced the known `[WinError 5]` permission
  boundary and was logged separately.
- **Next:** D6 — run the full Phase 3D focused matrix plus protected Phase 3C,
  3B, 3A, and Phase 2 matrices; then perform scoped lint/type/hygiene,
  Graphify classification, and the safe browser attempt.

## 2026-09-12 — NAVI Unified POI System Phase 3D D6 verification

- **Verification:** The complete Phase 3D matrix passed **8 files / 55 tests**.
  Protected Phase 3C passed **9 files / 73 tests** (the accepted 3C files with
  additive Phase 3D assertions), Phase 3B passed **2 files / 21 tests**, Phase
  3A passed **16 files / 141 tests**, and Phase 2 passed **9 files / 153
  tests**. No protected assertion was weakened.
- **Classification:** Root typecheck remains blocked only by the known
  unrelated runtime `TS1005` parse error. The editor/core package checks retain
  the documented cross-package/rootDir and legacy model/fixture diagnostics;
  the new Phase 3D core/command/persistence files lint clean. Broader shared
  renderer/controller lint retains inherited explicit-`any`/React-ref debt.
  Scoped `git diff --check` and new-file whitespace scans are clean. Graphify
  again returned the known `[WinError 5]` permission boundary.
- **Browser:** The read-only available Studio inspection timed out on an
  existing authored/remote tab; no data was changed. The prior safe local
  fixture remains blocked by its no-floor-plan setup modal. **BROWSER
  VALIDATION PENDING.**
- **Next:** D7 — write and verify the required Phase 3D A–K gate report with
  the exact verdict and explicit topology/geometry protection.

## 2026-09-12 — NAVI Unified POI System Phase 3D D7 gate report

- **Report:** Created and verified
  `navi-next/progress/PHASE-3D-POI-APPEARANCE-2_5D-GATE-2026-09-12.md` with
  sections A–K, the final appearance/mode contract, rendering and Inspector
  behavior, history/persistence, explicit `NO TOPOLOGY MUTATION`, explicit
  geometry protection, exact automated counts, browser status, limitations,
  and all 15 Phase 3 readiness answers.
- **Verification:** The report-contract probe found **11 sections**, exactly
  **one** 3D verdict, the required topology and geometry statements, and
  `BROWSER VALIDATION PENDING`; the report has no trailing whitespace.
- **Verdict:** The 3D gate is **PASS WITH CONDITIONS**, conditioned on the
  classified browser/tooling limitations only. No critical extrusion,
  persistence, geometry, or topology blocker was found.
- **Next:** D8 — rerun the consolidated protected matrices without code
  changes, write the final Phase 3 report, verify its exact final line, and
  stop before Phase 4.

## 2026-09-12 — NAVI Unified POI System Phase 3D D8 consolidated gate

- **Verification:** Reran the final matrices without production changes:
  Phase 3D passed **8 files / 55 tests**, Phase 3C passed **9 files / 73
  tests**, Phase 3B passed **2 files / 21 tests**, Phase 3A passed **16 files /
  141 tests**, and protected Phase 2 passed **9 files / 153 tests**.
- **Report:** Created and verified
  `navi-next/progress/PHASE-3-POI-STUDIO-AUTHORING-GATE-2026-09-12.md` with
  one overall `PASS WITH CONDITIONS` gate, canonical identity and geometry
  coverage, appearance/2.5D behavior, persistence/topology evidence, the
  browser pending condition, and the exact Phase 4 recommendation.
- **Hygiene:** The report-contract probe found exactly one overall verdict,
  the exact final recommendation, and zero trailing whitespace. The scoped
  root workflow-document diff check passed; the repository-wide baseline
  findings were left untouched and logged in `errors/ERRORS.md`.
- **Stop condition:** Phase 3 is complete at the Studio authoring boundary;
  no Phase 4 implementation was started.

## 2026-09-12 — NAVI Unified POI System Phase 4A T1 SPEC/PLAN

- **Specification:** Added the Phase 4A compiler/runtime identity contract to
  `spec/SPEC.md`, including the seven-representation audit, canonical
  `Floor.pois` rule, additive runtime POI contract, deterministic geometry and
  collision rules, topology invariants, compatibility policy, and the explicit
  4B–4D boundary.
- **Plan:** Added the visible 4A TODO and task plan to `plan/PLAN.md`, plus the
  detailed design and execution plan at
  `docs/superpowers/specs/2026-09-12-unified-poi-phase4a-design.md` and
  `docs/superpowers/plans/2026-09-12-unified-poi-phase4a.md`.
- **Verification:** All four files exist; exactly one 4A TODO is
  `in_progress`; the contract probe found the required `nodeId`, transformer,
  seven-representation, and 4B-boundary statements.
- **Next:** 4A-T2 — add focused compiler tests and observe RED before any
  production implementation.

## 2026-09-12 — NAVI Unified POI System Phase 4A T2 compiler RED

- **Test:** Added
  `navi-next/packages/compiler/src/__tests__/poi-projection.test.ts` before
  production implementation. It covers all authored geometry forms, stable
  identity, transformer-derived world coordinates, floor-geometry parity,
  graph-derived coexistence/collision, source immutability, and the deferred
  search/spatial boundary.
- **Verification:** `npm test -- --run
  packages/compiler/src/__tests__/poi-projection.test.ts --reporter=dot`
  collected one file and reached **2 intentional RED tests**. The first
  stopped at the existing explicit-shape `p.position` access; the second
  observed missing graph-derived provenance/geometry. The runner itself
  started normally; no `spawn EPERM` occurred.
- **Protection:** No production or existing test assertions were modified.
- **Next:** 4A-T3 — add package/runtime RED coverage for authored no-node
  records while preserving legacy graph-node reference rejection.

## 2026-09-12 — NAVI Unified POI System Phase 4A T3 package/runtime RED

- **Tests:** Added
  `navi-next/packages/runtime/src/loader/__tests__/poi-runtime-contract.test.ts`
  and `navi-next/packages/publisher/src/__tests__/poi-runtime-contract.test.ts`.
  The cases require authored no-node identity/geometry/appearance to survive
  runtime conversion and package serialization while retaining legacy node
  reference validation.
- **Verification:** The package-local runtime command collected 2 files and
  **12 tests**, with the existing 11 reference-validator tests passing and the
  new authored conversion assertion intentionally RED. The package-local
  publisher command collected its new file and reached the intended missing
  additive-field assertion. A first root-level publisher path correctly
  returned `No test files found`; the package-local rerun is the valid evidence.
- **Protection:** The legacy missing-node rejection remained green; no
  production or existing test assertion was weakened.
- **Next:** 4A-T4 — implement the compiler projection and shape-safe
  floor-geometry representative path.

## 2026-09-12 — NAVI Unified POI System Phase 4A T4 compiler projection

- **Implementation:** Added the additive runtime POI provenance/geometry/
  appearance contract and optional `nodeId` in
  `navi-next/packages/core/src/types/navigation-artifacts.ts`. Added the
  transformer-backed projection at
  `navi-next/packages/compiler/src/emitter/poi-projection.ts`, connected it to
  V2 `buildArtifacts`, and changed floor-geometry POI emission to use the
  deterministic representative resolver for every geometry form.
- **Verification:** Focused projection plus existing artifact-emitter suites
  passed **2 files / 25 tests**. The new suite proves all five authored forms,
  stable IDs, world transforms, metadata/category/appearance, floor-geometry
  compatibility, graph-derived coexistence/collision, search/spatial deferral,
  source immutability, and graph neutrality.
- **Baseline classification:** The adjacent V2 integration suite still reports
  the known `HALLWAY_DISCONNECTED` fixture baseline; temporary diagnostics
  showed three disconnected components before `compileV2` success evaluation.
  No POI projection error was implicated.
- **Next:** 4A-T5 — map additive POI fields through publisher serialization,
  runtime conversion, reference validation, and round-trip verification.

## 2026-09-12 — NAVI Unified POI System Phase 4A T5 package/runtime compatibility

- **Implementation:** Extended the package POI contract with optional
  `nodeId`, provenance, `floorId`, world geometry, and appearance. Publisher
  serialization and runtime conversion map the fields explicitly. Reference
  validation and `RoundTripVerifier` skip only authored/no-node entries and
  continue rejecting present or legacy missing-node references.
- **Verification:** Package-local runtime suites passed **2 files / 12 tests**;
  package-local publisher suites passed **3 files / 35 tests**, including the
  new authored round-trip case and all existing legacy checks.
- **Compatibility:** Package major/schema remains `1.0.0`; fields are
  additive and old graph-derived fields remain available.
- **Next:** 4A-T6 — run the complete focused 4A gate, protected Phase 2/3
  matrices, type/lint/hygiene checks, and the required Graphify refresh.

## 2026-09-12 — NAVI Unified POI System Phase 4A T6 verification gate

- **Focused 4A evidence:** Compiler projection plus artifact-emitter suites
  passed **2 files / 25 tests**. Runtime package suites passed **2 files / 12
  tests**. Publisher package suites passed **3 files / 35 tests**.
- **Protected evidence:** The Phase 2 persistence/topology matrix passed **9
  files / 153 tests**. Phase 3A passed **16 files / 141 tests**, Phase 3B
  passed **2 files / 21 tests**, Phase 3C passed **9 files / 59 tests**, and
  Phase 3D passed **8 files / 55 tests**. The default protected runner hit the
  known Windows `spawn EPERM` startup boundary; the identical approved
  elevated commands passed.
- **Hygiene:** Scoped diff check and exact-file trailing-whitespace scan were
  clean. Package-wide TypeScript and scoped ESLint retain unrelated baseline
  diagnostics documented in `errors/ERRORS.md`. The required `graphify update .`
  retry returned the known `[WinError 5] Access is denied` boundary; generated
  graph output was not edited.
- **Next:** 4A-T7 — write the exact Phase 4A gate report, record the final
  verdict, and stop before 4B.

## 2026-09-12 — NAVI Unified POI System Phase 4A T7 gate report

- **Report:** Wrote the required report at
  `navi-next/progress/PHASE-4A-POI-COMPILER-RUNTIME-IDENTITY-GATE-2026-09-12.md`.
  It contains sections A–L, the canonical-source and topology constraints,
  the package/runtime parity evidence, all protected matrix counts, and one
  formal 4A verdict.
- **Verification:** The report-contract probe found all A–L headings and
  exactly one formal verdict, `4A — PASS WITH CONDITIONS`. The final report
  whitespace scan and scoped root workflow-document `git diff --check` both
  returned clean.
- **Stop condition:** Phase 4A is closed with conditions documented in the
  report and error ledger. Phase 4B, 4C, and 4D were not started.

## 2026-09-12 — NAVI Unified POI System Phase 4B T1 SPEC/PLAN

- **Audit:** Traced the existing compiler `buildSearchIndex`, Phase 4A
  `buildPOIIndex`, publisher search-file mapping, runtime converter/search
  engine/service, public-store normalization, and the Search/Explore UI.
  Authored `Floor.pois` are currently absent from `SearchIndex`; graph-derived
  POIs remain indexed with graph `nodeId`.
- **Contract:** Added the 4B no-node authored search contract: stable authored
  ID, `type: 'poi'`, representative position, category/safe scalar metadata
  tokens, building/floor context, and authored provenance. Spatial indexing,
  graph connectivity, destination resolution, routing, and arrival remain
  explicitly deferred.
- **Plan:** Wrote the root SPEC/PLAN additions and detailed artifacts at
  `docs/superpowers/specs/2026-09-12-unified-poi-phase4b-design.md` and
  `docs/superpowers/plans/2026-09-12-unified-poi-phase4b.md`.
- **Verification:** All four planning paths resolve; required no-node,
  canonical-source, spatial-boundary, and 4C/4D exclusion probes are present;
  `git diff --check` is clean. One initial root-relative path probe was
  corrected and recorded in `errors/ERRORS.md`.
- **Next:** 4B-T2 — add focused compiler search-projection RED tests before
  production implementation.

## 2026-09-12 — NAVI Unified POI System Phase 4B T2 compiler RED

- **Tests:** Extended the Phase 4A authored POI compiler fixture to require
  one `type: 'poi'` search entry per canonical authored ID, optional/no
  `nodeId`, category/provenance/context, representative position, and safe
  name/category/metadata tags across all supported geometry forms.
- **Verification:** The exact focused command collected 3 files / 60 tests;
  2 files / 59 tests passed and 1 intentional test failed because authored
  POIs are not yet in `SearchIndex`. No `spawn EPERM` occurred.
- **Protection:** The existing graph-derived POI, spatial-cell, input-document,
  and navigation-graph snapshot assertions remain in the fixture. The current
  dirty-worktree modifications in core/compiler production files predate this
  T2 test-only change and were not rewritten.
- **Next:** 4B-T3 — add package/runtime no-node search-contract RED tests while
  retaining legacy graph-reference validation.

## 2026-09-12 — NAVI Unified POI System Phase 4B T3 runtime/publisher RED

- **Tests:** Added no-node authored search fixtures to runtime SearchEngine,
  SearchService, runtime conversion, and publisher package serialization.
  Coverage requires normalized category matching plus category, provenance,
  source ID, position, floor/floorId, and building context.
- **Verification:** Runtime package-local command collected 3 files / 34 tests;
  31 passed and 3 intended failures exposed the missing implementation seams.
  Publisher package-local command collected 1 file / 2 tests; 1 passed and 1
  intended serialization failure exposed the missing fields. Legacy reference
  validation and existing search tests remained green.
- **Protection:** Commands ran from the owning package roots, avoiding the
  previously recorded root/package path mismatch. No production file was
  changed for the RED checkpoint.
- **Next:** 4B-T4 — add public-store and discovery UI RED tests for preserving
  `poi`, category matching, context, and no-route behavior.

## 2026-09-12 — NAVI Unified POI System Phase 4B T4 public discovery RED

- **Tests:** Added raw published-payload coverage for authored `poi` search
  identity, optional node, category/provenance/floor context, and normalized
  category search. Added Explore contract and UI coverage for POI categories,
  multi-word discovery, building handoff, and no navigation push.
- **Verification:** The focused public command collected 3 files / 50 tests;
  47 passed and 3 intentional failures exposed the missing normalizer,
  category-order, and display-label seams. No runner startup failure occurred.
- **Protection:** Existing public-store routing/recent-destination behavior,
  Explore building handoff, and stable destination tests remained green. The
  SearchPage was not changed because it has no existing focused test seam and
  remains navigation-oriented.
- **Next:** 4B-T5 — implement the compiler authored search projection without
  changing graph emission or the spatial index.

## 2026-09-12 — NAVI Unified POI System Phase 4B T5 compiler search projection

- **Implementation:** Made core/package search `nodeId` optional and added
  additive category, floor identity, provenance, and source ID fields. Built
  the canonical `poiIndex` before `searchIndex`, then projected each authored
  Phase 4A POI exactly once with stable ID, representative world position,
  safe scalar metadata key/value tags, and no graph reference. Graph-derived
  and document-derived search records remain intact; the spatial index is
  unchanged.
- **Verification:** The focused compiler command passed 3 files / 60 tests.
  It covers point, circle, rectangle, polygon, stable identity, context,
  metadata/category matching, collision/coexistence, source immutability, and
  graph/node/edge/spatial neutrality. Scoped `git diff --check` passed.
- **Condition:** Required `graphify update .` returned the known managed
  Windows `[WinError 5] Access is denied`; generated output was not edited and
  the condition is recorded in `errors/ERRORS.md`.
- **Next:** 4B-T6 — map the additive search fields through publisher/runtime
  conversion, normalize public search, and make ranking category-safe.

## 2026-09-12 — NAVI Unified POI System Phase 4B T6 package/runtime/public search

- **Implementation:** Publisher and runtime conversion now preserve optional
  search `nodeId`, category, floor ID, provenance, source ID, and position.
  Runtime SearchEngine tokenization normalizes underscores/hyphens and scores
  the additive category field; SearchService exposes representative position,
  POI category, and provenance context without requiring a route node. Public
  types/parser preserve `poi`, optional node identity, package `lat/lng`, and
  additive context; public search matches all normalized name/category/tag
  tokens while retaining legacy rank order.
- **Verification:** Runtime package-local matrix passed 3 files / 34 tests;
  publisher package-local matrix passed 1 file / 2 tests. The public-store
  parser/search portion passed; only the two known Explore UI expectations
  remained in the combined 3-file / 50-test public command.
- **Protection:** Existing graph-backed search, legacy reference validation,
  recent destinations, route behavior, and package compatibility tests stayed
  green. No graph, spatial index, destination resolver, or routing code was
  changed.
- **Next:** 4B-T7 — add POI category/label/context to Explore and guard the
  navigation-oriented Search page for authored no-node results.

## 2026-09-12 — NAVI Unified POI System Phase 4B T7 discovery UI

- **Implementation:** Explore now exposes `poi` categories, token-aware
  category/name filtering, human-readable POI category labels, and the
  existing building-sheet handoff. The public Search page preserves
  node-backed navigation but sends authored no-node results to Explore by
  building context instead of `/map/navigate`; the public Navigate picker and
  demo search also exclude/label no-node results safely.
- **Verification:** The focused public matrix passed 3 files / 50 tests.
  Scoped UI/public diff hygiene passed. Existing building/room Explore handoff,
  routing, recent destination, and stable destination tests remained green.
- **Condition:** The required Graphify refresh again returned the known managed
  Windows `[WinError 5] Access is denied`; generated output was untouched and
  the condition is recorded in `errors/ERRORS.md`.
- **Next:** 4B-T8 — run the complete focused/protected verification matrices,
  classify tooling/browser conditions, and write the final A–M gate report.

## 2026-09-12 — NAVI Unified POI System Phase 4B T8 gate

- **Verification:** Fresh Phase 4B compiler search passed 3 files / 60 tests;
  runtime search/service/contract/reference validation passed 4 files / 44;
  publisher contract/package-builder passed 2 files / 26; and public store,
  Explore contracts, and Explore UI passed 3 files / 50. Protected Phase 2
  passed 9 files / 153, Phase 3A passed 16 / 141, Phase 3B passed 2 / 21,
  the exact Phase 3C plan set passed 9 / 63, and Phase 3D passed 8 / 55.
- **Checks:** Scoped application/root `git diff --check` and the untracked
  Phase 4B whitespace scan were clean. Root TypeScript stopped at the known
  unrelated runtime fixture parse error. Scoped ESLint retained 13 inherited
  errors and 2 warnings. Graphify refresh remained blocked by `[WinError 5]`
  and generated output was preserved.
- **Report:** Created
  `navi-next/progress/PHASE-4B-POI-SEARCH-DISCOVERY-GATE-2026-09-12.md`
  with the required A–M sections, topology NO answers, bounded conditions,
  and one `4B — PASS WITH CONDITIONS` verdict.
- **Boundary:** No browser mutation was performed; no 4C/4D, destination,
  routing, arrival, nearby, or graph-connectivity work was started. T1–T8 are
  complete and the workflow stops at the Phase 4B gate.

## 2026-09-12 — NAVI Unified POI System Phase 4C T1 routing audit and plan

- **Implementation:** Read the Phase 2, Phase 3, Phase 4A, and Phase 4B gate
  reports and audited the bounded runtime/public routing seams. Confirmed that
  current A* accepts graph node IDs, `RoutingEngine` owns request-local private
  adjacency, and `SpatialQueryService` supplies safe point/segment helpers when
  used on a fresh local index. Classified editor graph syncing, junction,
  entrance-access, and authored topology helpers as forbidden for ordinary POI
  resolution.
- **Planning:** Added the Phase 4C WHAT-only contract to `spec/SPEC.md`, the
  executable task/TODO list to `plan/PLAN.md`, and the detailed implementation
  plan at `navi-next/docs/superpowers/plans/2026-09-12-unified-poi-phase4c.md`.
  The selected architecture is an isolated graph clone with a request-local
  virtual target and proportional edge projection; the plan explicitly stops
  before Phase 4D arrival behavior.
- **Verification:** Planning artifacts exist; scoped `git diff --check`
  completed without content findings. The first bounded audit path probe was
  logged in `errors/ERRORS.md` and did not change source.
- **Next:** 4C-T2 — add and run the failing runtime destination/geometry tests
  before writing production resolver code.

## 2026-09-12 — NAVI Unified POI System Phase 4C T2 runtime RED

- **Implementation:** Added only the RED runtime contracts for authored,
  node-less POI destination resolution and the additive NavigationService
  boundary. Fixtures cover Point, Circle, Rectangle, Polygon, same-floor and
  outdoor scope, ineligible metadata, typed failures, deterministic ties, and
  base-graph snapshot expectations.
- **Verification:** From `navi-next/packages/runtime`, the focused Vitest run
  collected 2 files / 11 tests and produced 10 intentional failures with 1
  sentinel pass. The missing production seams are retained as the 4C-T2
  implementation contract; no existing route code changed.
- **Next:** 4C-T3 — add RED tests for request-local overlay construction,
  interior-edge projection, cost/eligibility preservation, and repeated-request
  topology immutability.

## 2026-09-12 — NAVI Unified POI System Phase 4C T3 overlay RED

- **Implementation:** Added the request-local overlay RED matrix for interior
  edge targets, directional eligibility, proportional generalized cost,
  repeated requests, sequential POI isolation, and unchanged ordinary
  node-to-node routing.
- **Verification:** From `navi-next/packages/runtime`, Vitest collected 1 file
  / 5 tests and reached 5 intentional failures at the unimplemented POI route
  boundary. No production routing code changed.
- **Next:** 4C-T4 — add public adapter/store/Navigate RED coverage for a stable
  no-node authored POI handoff and preview-only behavior.

## 2026-09-12 — NAVI Unified POI System Phase 4C T4 public RED

- **Implementation:** Added only public RED coverage for the pure POI route
  adapter, separate public POI destination state, and Navigate selection of an
  authored no-node search result without a fabricated graph node.
- **Verification:** The combined public command collected 3 files / 28 tests
  with 4 intentional POI failures and 1 existing development-simulator
  failure. The standalone Navigate file reproduced the same 1 new POI failure
  plus the known simulator baseline; existing navigation tests otherwise
  passed. No production code changed.
- **Next:** 4C-T5 — implement the typed resolver and isolated graph overlay
  behind the now-failing runtime contracts.

## 2026-09-12 — NAVI Unified POI System Phase 4C T5 resolver and overlay

- **Implementation:** Added the typed destination request/failure contract and
  a pure runtime resolver for Point, Circle, Rectangle, and Polygon POIs.
  Candidate selection is scope-aware, bounded to the named approach radius,
  deterministic, and filters ineligible/vehicle-only edges. Successful
  resolution returns a fresh graph clone with a temporary target and projected
  edge policies; the source graph remains untouched.
- **Verification:** The focused pure-resolver command from
  `navi-next/packages/runtime` passed 1 file / 9 tests. It covers geometry
  validation, indoor floor isolation, outdoor eligibility, typed failures,
  deterministic ties, and source-graph immutability.
- **Condition:** A fixture-context assertion mistake was recorded and fixed in
  `errors/ERRORS.md`; no production topology or editor code was involved.
- **Next:** 4C-T6 — integrate the resolver through `RoutingEngine` and
  `NavigationService`, preserving the existing node-to-node path.

## 2026-09-12 — NAVI Unified POI System Phase 4C T6 runtime integration

- **Implementation:** `RoutingEngine` now accepts additive traversal providers,
  resolves authored no-node POIs through a request-local overlay, preserves
  original directional eligibility and terrain-aware cost on projected edge
  segments, and attaches stable POI destination metadata to the route.
  Graph-derived node-backed POIs continue through the existing node route.
  `NavigationService` exposes the package-backed destination request boundary.
- **Verification:** The focused runtime command passed 3 files / 15 tests;
  the complete runtime routing plus NavigationService matrix passed 14 files /
  128 tests. Scoped runtime `git diff --check` passed.
- **Conditions:** Runtime `npm run typecheck` remains stopped by the known
  malformed identity-comparison fixture at line 255; `graphify update .`
  remains blocked by `[WinError 5] Access is denied`. Both are recorded in the
  error ledger and no generated graph output was edited.
- **Next:** 4C-T7 — add the public route-preview adapter, separate POI
  destination state, and Search → Navigate handoff without a fake node.

## 2026-09-12 — NAVI Unified POI System Phase 4C T7 public preview handoff

- **Implementation:** Added a transient public POI-index adapter, stable POI
  destination metadata on `NavRoute`, separate `poiDestination` store state,
  authored no-node search selection, and route-preview rendering. Public route
  steps map the request-local runtime target to the stable POI ID only at the
  preview boundary; the temporary ID is not stored or exposed. Start/Swap and
  active-session entry remain unavailable for POI previews.
- **Verification:** The focused public command collected 3 files / 28 tests;
  27 passed and the one remaining failure is the pre-existing development
  simulator mock mismatch. Public route/store/Explore regressions passed 4
  files / 78 tests. Scoped ESLint passed with no findings, and scoped diff
  hygiene was clean.
- **Condition:** Root TypeScript still stops at the known runtime fixture
  parse error; no new Phase 4C diagnostic was reported.
- **Next:** 4C-T8 — run protected Phase 2/3/4A/4B and routing matrices, make a
  safe browser attempt, write the A–N gate report, and stop before 4D.

## 2026-09-12 — NAVI Unified POI System Phase 4C T8 verification and gate

- **Implementation:** Completed the Phase 4C verification boundary after the
  runtime request contract, geometry-aware resolver, request-local overlay,
  RoutingEngine/NavigationService integration, and public Search → Navigate
  preview handoff. No Phase 4D arrival or session-completion work was started.
- **Verification:** The focused runtime matrix passed 3 files / 15 tests.
  The public focused matrix passed 27 of 28 tests; its only failure is the
  known Navigate development-simulator baseline. Protected Phase 2 passed
  9/153, Phase 3A 16/141, Phase 3B 2/21, Phase 3C 9/59, and Phase 3D 8/55.
  Phase 4A compiler/runtime/publisher matrices passed 25/25, 13/13, and
  36/36. Phase 4B compiler/runtime/publisher/public matrices passed 60/60,
  44/44, 26/26, and 50/50. Existing runtime routing passed 128/128;
  road/EntranceAccess/RouteNetwork regressions passed 144/144; public route
  regressions passed 78/78. Scoped lint and diff hygiene passed.
- **Conditions:** Typechecks retain the known malformed runtime fixture parse
  error; Graphify refresh retains the managed `[WinError 5] Access is denied`
  boundary; and the safe browser inspection timed out without any UI action.
  These conditions are recorded in the gate report and error ledger.
- **Gate report:** Wrote
  `navi-next/progress/PHASE-4C-POI-DESTINATION-RESOLUTION-GATE-2026-09-12.md`
  with sections A–N, one formal verdict, topology evidence, exact commands,
  conditions, and the required stop line.
- **Next:** No Phase 4D work. Await any separate authorization after the 4C
  gate and its documented conditions.
## 2026-09-12 — NAVI Unified POI System Phase 4D T1 bounded lifecycle audit

- **Scope:** Read the required Phase 2, Phase 3, Phase 4A, Phase 4B, and
  Phase 4C gate reports; audited the current preview → Start →
  `NavigationSession` → progress/instruction/off-route/arrival → End path,
  including public POI destination state, the Phase 4C route adapter,
  indoor-floor controller, QR localization seam, camera policy, heading, and
  foreground geolocation ownership.
- **Reuse:** The existing preview `NavRoute`, stable `NavRoute.destination`,
  `findDestinationRoute`, `computeRouteProgress`, instruction rendering,
  off-route precedence, `useGeolocation`, heading, camera, indoor controller,
  and QR contracts.
- **Additive extension:** A centralized runtime POI geometry-arrival helper,
  an explicit session POI target/context input, stable destination exposure in
  `NavigationContext`, arrival latching/idempotency, public POI Start handoff,
  and a meaningful final POI instruction.
- **Do not change:** Phase 4C resolver/A*/overlay behavior, Roads,
  RoadJunctions, SeparatedCrossings, EntranceAccess, RouteNetworks,
  `CampusDocument`, Studio persistence, camera/location/heading/QR ownership,
  or automatic rerouting (not present in the current authoritative flow).
- **Verification:** Required reports and all bounded lifecycle source seams
  were inspected before any production edit. No production code changed in
  this task.
- **Next:** T2 — write the Phase 4D SPEC/PLAN and visible TODO, then begin
  RED tests.

## 2026-09-12 — NAVI Unified POI System Phase 4D T2 specification and plan

- **Implementation contract:** Authored POI active navigation reuses the
  existing Phase 4C preview route and stable `NavRoute.destination`; it adds
  only transient runtime POI geometry/context for arrival evaluation.
- **Arrival policy:** Centralized bounded 15 m tolerance; legacy/explicit
  Point, Circle, Rectangle, and Polygon geometry; open-ring boundary handling;
  required building/floor context for indoor POIs; endpoint-only arrival is
  forbidden; arrival is latched and idempotent.
- **Protected seams:** Existing route progress, instructions, off-route
  precedence, camera, heading, geolocation watcher, QR, floor transitions,
  topology, Phase 4C resolver/overlay, and legacy destination paths remain
  reuse-or-do-not-change boundaries.
- **Artifacts:** Updated `spec/SPEC.md`, `plan/PLAN.md`, and `TODO.md`; wrote
  `navi-next/docs/superpowers/plans/2026-09-12-unified-poi-phase4d.md`.
- **Verification:** `rg` confirmed the Phase 4D sections/tasks are present;
  no production code changed in T2.
- **Next:** T3 — add and execute RED runtime/session tests before any
  production implementation.

## 2026-09-12 — NAVI Unified POI System Phase 4D T3 runtime/session RED

- **Tests added:** Runtime geometry-arrival contract and an authored-POI
  `NavigationSession` contract at
  `navi-next/packages/runtime/src/routing/__tests__/poi-arrival.test.ts` and
  `navi-next/src/components/map/__tests__/NavigationSession.poi.test.tsx`.
- **RED evidence:** The session command collected **1 file / 5 tests** and
  reached **2 intended failures / 3 passes**: endpoint-only arrival and wrong
  context are not protected by the current implementation. The runtime file
  stops at the intentionally missing `../poi-arrival` module before collection.
- **Harness corrections:** Explicit Vitest imports were added to the new test;
  each import omission was recorded in `errors/ERRORS.md`. No production code
  changed.
- **Next:** T4 — add public Start/identity/cleanup/final-instruction RED
  assertions, preserving the known simulator baseline separately.

## 2026-09-12 — NAVI Unified POI System Phase 4D T4 public RED

- **Tests extended:** The Navigate public fixture now requires authored POI
  Start/active handoff, stable session identity, preview-route reuse, End
  cleanup, and POI-specific final instruction wording; the adapter test locks
  the final label.
- **RED evidence:** Focused public command collected **2 files / 26 tests**;
  **23 passed**, **2 intended 4D failures**, and **1 known development-
  simulator baseline failure**. No production public code changed.
- **Protected assumptions:** `toNode` remains null for the authored POI; the
  test captures `poiDestination`/`route.destination`, not a fabricated node,
  and restores the destination-route mock after each test.
- **Next:** T5 — implement the pure runtime arrival policy and additive
  NavigationSession/Context support.

## 2026-09-12 — NAVI Unified POI System Phase 4D T5 centralized arrival GREEN

- **Implementation:** Added the pure runtime `poi-arrival` policy with a
  centralized 15 m tolerance, legacy/explicit Point, Circle, Rectangle, and
  Polygon geometry distance checks, open-ring normalization, and required
  building/floor context protection. Exported it through the runtime routing
  boundary and integrated it into `NavigationSession` as a transient POI
  target matched to stable `route.destination` identity. Added route-scoped
  arrival latching/idempotency while preserving ordinary node arrival,
  progress, off-route, floor, heading, geolocation, and context behavior.
- **Verification:** Runtime geometry focused suite passed **1 file / 7 tests**.
  Authored-POI `NavigationSession` suite passed **1 file / 5 tests**.
  Existing session/context/location/heading/indoor/floor matrix passed **8
  files / 70 tests**. No Phase 4C resolver or topology files were modified.
- **Harness condition:** The runtime suite initially exposed a missing explicit
  Vitest import; the test-only correction is recorded in `errors/ERRORS.md`
  and the rerun is green.
- **Next:** T6 — implement public POI Start handoff, final approach copy,
  and cleanup guards.

## 2026-09-12 — NAVI Unified POI System Phase 4D T6 public navigation GREEN

- **Implementation:** Added safe transient lookup of the published POI record
  for active-session evaluation, enabled authored no-node POI Start while
  preserving the existing preview route and stable `NavRoute.destination`,
  kept `toNode` null and Swap unavailable, and passed the normalized POI into
  `NavigationSession`. Public guidance now presents POI name/category/context,
  rewrites the terminal adapter instruction to `Arrive at <label>`, and says
  `Continue to <label>` when the route endpoint is reached before geometry
  arrival. Existing End/Change cleanup remains authoritative.
- **Verification:** Final focused runtime geometry passed **1 file / 7 tests**;
  session arrival/idempotency/completion passed **1 file / 6 tests**; the
  public Phase4C/4D matrix passed **27/28**, with only the known development-
  simulator baseline failing. The protected public route/store matrix passed
  **4 files / 78 tests**. Scoped ESLint passed after replacing the React
  state/ref latch attempts with a per-session `useSyncExternalStore` latch.
- **Conditions:** The runtime/app typechecks still stop at the known malformed
  `data-identity-comparison.test.ts:255` fixture; no new TypeScript diagnostic
  appeared. Worker-runner and latch investigations are recorded in the error
  ledger.
- **Next:** T7 — run the final focused/protected navigation and topology
  verification, Graphify refresh, safe browser attempt, and write the A–P gate
  report before stopping.

## 2026-09-12 — NAVI Unified POI System Phase 4D T7 verification and gate

- **Verification:** Fresh focused runtime arrival passed **1 file / 7 tests**;
  fresh `NavigationSession` POI arrival/idempotency passed **1 file / 6
  tests**; the public authored POI lifecycle/topology run collected **3 files
  / 28 tests**, with **27 passed** and only the known development-simulator
  assertion failing. Scoped ESLint and the Phase 4D tracked-path diff check
  exited 0.
- **Protection:** The protected Phase 2/3/4A/4B/4C, routing/A*,
  road/connectivity, camera/location, progress/floor, and QR/deep-link
  matrices are recorded in the gate report with exact commands and counts.
  The current Phase 2 serialized run passed **8 files / 141 tests**; no
  persistence/topology assertion was weakened.
- **Topology:** The public lifecycle test snapshots nodes and edges before
  Start, after Start, and after End; all are unchanged. No persistent POI
  graph node/edge, road, access, route-network, document, or authored
  geometry mutation was introduced.
- **Report:** Wrote
  `navi-next/progress/PHASE-4D-POI-ARRIVAL-NAVIGATION-GATE-2026-09-12.md`
  with sections A–P, one formal verdict, all topology NO answers, exact
  verification commands/counts, browser/device conditions, and 18 readiness
  answers. The verdict is `4D — PASS WITH CONDITIONS`.
- **Conditions:** Browser validation is pending after the safe read-only
  Studio tab timed out; physical-device validation is pending; the known
  malformed runtime fixture blocks typecheck; Graphify refresh remains
  blocked by `[WinError 5] Access is denied`; broad diff check retains
  unrelated dirty-worktree whitespace findings. These are recorded in
  `errors/ERRORS.md`.
- **Stop:** No Phase 5, deployment, real campus-data mutation, or physical
  device claim was made.
- **Next:** Human review → consolidated Phase 4 gate.

## 2026-09-12 — Room tool recognition investigation (3 of 6 rooms) — read-only

- **Report:** User asked why the Room tool only recognizes 3 of 6 visually enclosed offices in Octagon GF (screenshot outliner: "Rooms (3)").
- **Findings:** The Room tool hit-tests only wall-derived faces (`floor-derived-rooms`); `roomAttributes.declare` re-runs `deriveRooms()` and rejects any unknown faceId ("Derived face not found"). Recognized count therefore equals the number of valid closed faces in the authored wall graph. The current engine accepts only closed, simple, bounded (CW) half-edge cycles; dangling partitions (bridges) are excluded; faces <= 4 m2 or aspect ratio > 5:1 are classified `utility` and dropped (room-derivation.ts).
- **Verification:** Focused geometry suite `wall-enclosure-topology + room-derivation + w5-derived-rooms` -> 3 files / 41 tests passed (current tree).
- **Open observation:** The live Octagon GF (`osm-bldg-888209287`, floor `flr-1-erhz`) currently stores 0 walls / 0 roomAttributes in the running graph store; the server snapshot for `map-map-1-k6bv` still names the building "Bldg No. 30" with no Octagon walls; earlier sessions recorded "Sync failed - changes saved locally" on this building. Possible unsynced-work loss; needs user confirmation before any fix.
- **Next:** User to confirm/restore the wall state; exact per-wall closure diagnosis follows once the geometry exists. No mutations performed; no fix attempted.
## 2026-09-12 — Room recognition divergence between browsers — root cause found

- **Symptom:** User's browser shows only 3 recognized rooms on Octagon/GF while the Playwright browser and the server show all 6.
- **Proof the data is correct:** Server snapshot (`map-map-1-k6bv`, updated 2026-09-12T08:50Z) stores 11 walls + 6 `roomAttributes` for `osm-bldg-888209287` floor `flr-1-erhz`. Running those exact wall coordinates through `wallsToSegments -> deriveRooms`: 11 segments -> 6 enclosed regions (areas 28.17/29.55/34.50/35.09/28.55/29.13) -> 6 rooms, faceIds `face-1czfxww, face-bfs9g6, face-zfuy3d, face-znqic5, face-ze0ae7, face-11kyqc4` — identical to the 6 declared roomAttributes. Temp diagnostic test was run then removed.
- **Root cause (user's browser):** Stale/divergent local graph snapshot that never adopts the newer server state. `src/store/graph-store.ts` `loadMapData` (CASE B, lines ~327-358): the server freshness check only runs when `locallySynced && localServerTimestamp`; when the local copy has unsynced changes/no matching fingerprint the store skips the fetch entirely and keeps local. Additionally `syncToSupabase` (lines ~418-425) records `serverTimestamp` from the LOCAL clock, so the `serverTimestamp > localServerTimestamp` comparison can declare stale local data "newer" than the server. `reSync()` (lines ~458-476) only pushes local -> server, which would overwrite the good server state with the broken local state.
- **Verification:** Diagnostic test pass (6 rooms from server walls); focused regression trio still 41/41.
- **Next:** User refreshes their tab from server (incognito or clear `navi-graph-map-map-1-k6bv` + `navi-sync-status-map-map-1-k6bv` and reload). Propose store conflict/staleness fix for approval.

## 2026-09-12 — Floor editor: removed misleading snap indicator

- **Implementation:** Removed the `floor-snap` source / `floor-snap-indicator` MapLibre layer and its dead `@navi/core` SnapEngine wiring from `src/components/floor-editor/FloorEditorCanvas.tsx` (import, `snapEngineRef`, populate effects, mousemove `findSnap` block). The point-placement preview (entrance/stair/elevator) is untouched. Updated `production-route-characterization.test.tsx` (source list + stale SnapEngine comments). Spec/plan: `spec/` + `plan/REMOVE-FLOOR-SNAP-INDICATOR.md`.
- **Why:** the indicator was feedback-only (no click path read it), asserted snap rules that contradicted real placement (wall snap = 0.5 m endpoint via `SNAP_CONFIGS`; rooms declare wall faces; route/point tools use raw cursor), lingered after the pointer stopped, and painted 5 m-grid dots in empty space. User-approved removal.
- **Verification:** focused `src/components/floor-editor/__tests__` → 392/397 passed; both updated characterization tests pass; the 5 failures are pre-existing baselines (route authoring node counts/commands + ComponentProperties labels) with zero references to the removed layer; scoped ESLint shows only pre-existing `any`/unused-var debt; `npx tsc --noEmit` reports only the documented `data-identity-comparison.test.ts(255,3)` baseline; dev route `/studio/verify-removal/edit/building/bogus/floor/0` compiles and loads with 0 console errors.
- **Next:** re-add snap feedback only if wall drawing needs it, wired to the real `snapPoint`/`SNAP_CONFIGS` result and cleared on `mouseleave`.
## 2026-09-12 — Graph-store staleness fix (approved) — COMPLETE

- **Deliverable:** `src/store/graph-store.ts` now detects stale/dirty local snapshots against the server instead of silently keeping them:
  - `loadMapData` always runs a server freshness check (no more skip when local is unsynced).
  - Content-based comparison via normalized fingerprints (key-order insensitive, ignores volatile `updatedAt`) — no clock authority.
  - Outcomes: identical -> synced; server differs + local clean -> adopt server; server differs + local dirty -> `syncStatus: 'conflict'` with actionable message; fetch failure/empty server -> keep local (offline fallback preserved).
  - `syncToSupabase` never stamps the marker with the local clock and refuses to push while a conflict is unresolved.
  - New `adoptServerSnapshot()` backs up the local copy to `navi-graph-backup-<mapId>` then loads the server version.
  - `reSync()` guards: refuses to overwrite a differing server snapshot unless `{ force: true }`.
- **UI:** `ContextHeader` gains an `Outdated` conflict state with a "Load server version" action; `FloorEditor` maps `syncStatus: 'conflict'` and wires the action.
- **Hardening:** `EditorBridge` (3 fire-and-forget `save()` sites) and `InteractionController` building-move save now catch rejections — a blocked sync must not surface as an unhandled rejection (observed live before the hardening).
- **Artifacts:** `spec/GRAPH-STORE-STALENESS-FIX.md`, `plan/GRAPH-STORE-STALENESS-FIX.md`.
- **Verification:**
  - New `src/store/graph-store-conflict.test.ts` 7/7; existing `graph-store.test.ts` 3/3; `graph-store-road-routing.test.ts` 1/1.
  - `ContextHeader.test.tsx` 10/10 (includes conflict + action).
  - Broader affected matrix: 12 files / 112 tests passed; post-hardening rerun src/store + InteractionController: 10 files / 97 tests passed.
  - Scoped lint: all changed files clean (remaining findings are pre-existing debt in FloorEditor.tsx / one pre-existing `as any` in graph-store.test.ts).
  - `tsc --noEmit`: only the documented baseline `data-identity-comparison.test.ts` TS1005 diagnostic; none in changed files.
  - Live end-to-end: the running app logged the conflict detection and blocked an autosave overwrite for `map-map-1-k6bv` (server version newer than the browser's local copy) — exactly the incident class this fix targets.
- **Observation (unrelated):** a transient `snapEngineRef is not defined` ReferenceError appeared in the dev log referencing a stale compiled FloorEditorCanvas chunk; no such symbol exists in the current source tree. Not attributed to this change.
- **Next:** User reloads the affected browser -> `Outdated` pill -> "Load server version" to get the 6-room server state. Watch for false-positive conflicts in normal multi-tab use.

## 2026-09-13 — Task 14: Browser verification + full suite + logs (indoor route junctions)

- **What was done:** Updated `navi-next/e2e-floor-editor-stabilization.mjs` for the indoor route junction feature. The disposable fixture now seeds two route nodes (`route-fixture-1`, `route-fixture-2`) plus one connecting edge (`route-fixture-edge-1`). The obsolete `Door route node` combobox and `Connect Door to Route` button steps were replaced by the new pick flow: `Connect to Route…` then a canvas click on the route node (node picks connect directly, no prompt). A second Door is created and connected to the route edge: the click on the edge shows the `Create junction and connect door?` prompt (`[data-testid="door-route-connect-prompt"]`), Yes splits the edge and adds the door connector. In the Navigation tab the Route tool authors a free vertex and then clicks an existing edge, showing `Connect to this route network?` (`[data-testid="route-connection-prompt"]`), Yes splits and connects through the junction.
- **Brief deviations (all evidence-driven, recorded in `errors/ERRORS.md`):** `featureCenter` now averages LineString coordinates (it previously produced NaN for route edges); the route graph is revealed via Navigation Preview -> Graph before the picks (route layers are hidden by default in Architecture and MapLibre only queries rendered layers) and hidden again for the Door canvas interactions so route overlays do not steal selection; the Route toast is dismissed with its own `Dismiss route message` control before confirming the junction prompt; the Route-tool edge count asserts net +2 (split removes the original edge: -1 +2 halves +1 authored path), not the brief's +3; the "2D keeps authored objects" check asserts both authored Doors.
- **Verification (browser):** Started `npm run dev` (fresh server, port 3000), polled until ready, ran `node e2e-floor-editor-stabilization.mjs` (headless Chromium, disposable authenticated map shell, Graph API intercepted) -> `FLOOR EDITOR BROWSER VALIDATION — PASS (34/34)`, exit 0. Key evidence: door segment junction `{id: route-node-5-9f2f, type: waypoint, position: {x: -0.24, y: 0}}` with `incident: 3` and edges `2 -> 4`; Route tool junction edges `4 -> 6`; Door save/reload and simulated HTTP-409 recovery checks pass; zero uncaught page errors; disposable shell removed; the dev-server process tree started for the run was stopped and port 3000 verified free.
- **Verification (full suite):** `npm test -- --reporter=dot` -> `Test Files 15 failed | 530 passed (545)`, `Tests 29 failed | 5594 passed | 8 skipped (5631)`, duration 175.27s, exit 1. None of the 15 failing files intersect the plan diff (`git diff --name-only a16ba2d..HEAD`, 21 files) and no plan test fails, so all failures are classified pre-existing dirty-tree baseline (the 2026-09-12 ledger entry recorded 16 failed suites / 32 failed tests before this plan): `__tests__/walking-skeleton.test.ts`, `src/services/__tests__/compiler-adapter.test.ts` (deleted legacy `golden-campus` import), compiler fixture/topology suites (`compile-v2-integration`, `compile-v2-regression`, `phase-6-cross-producer-parity`, `phase-6b-canonical-contract`, `published-artifacts-pipeline`, `reconstructed-pipeline`, `w11c-navigation-compiler-gate`), `packages/editor` routing/topology suites (`routing-validation`, `topology-audit`), `src/engine/__tests__/routing-runtime-validation.test.ts`, the two known floor-editor baselines (`route-network-maplibre`, `semantic-room-interaction`), and the known navigation dev-panel baseline (`src/app/(public)/map/navigate/page.test.tsx`).
- **Commit:** `8bec805` — `test(e2e): verify route junctions and door segment connects in the browser` (only `e2e-floor-editor-stabilization.mjs` staged; 79 insertions, 5 deletions, including the pre-existing rectangle-authoring checks carried by the working tree).
- **Next:** None for this plan; report at `navi-next/.superpowers/sdd/irj-reports/task-14-report.md`. Follow-up candidates (not fixed, out of scope): the Route toast overlapping/blocking the door junction prompt, and Architecture hiding Route layers by default so the door pick requires manually revealing the graph.

## 2026-09-13 — Task 14 Fix wave 1: Route toast pointer-events + door-pick layer auto-reveal

- **What was done:** Fixed the two Important UX defects found in Task 14 browser verification.
  - `src/components/floor-editor/FloorEditor.tsx`: the route authoring toast container now uses `pointerEvents: 'none'` with `pointerEvents: 'auto'` on the `Dismiss route message` button (precedent: `rectangleMessage`), so the toast no longer intercepts the junction prompt's Yes/No clicks.
  - `handleStartRouteConnect` now enables the `nodes`/`edges` layers (mirrors the Navigation-mode effect), so the Door `Connect to Route…` pick works with the default hidden route layers in Architecture.
  - `e2e-floor-editor-stabilization.mjs`: removed both workarounds (Dismiss-before-Yes; Navigation Preview → Graph layer enable before the first pick) and added two proof checks: `door pick auto-reveals the hidden route layers` and `junction prompt is confirmed with the route toast still visible`; a `waitForFunction` now requires both route layers to be visible after starting the pick. The later `Graph` hide before the Door canvas interactions is unchanged.
- **Verification:** Focused vitest `production-route-characterization` + `semantic-room-properties` → 2 files / 94 tests passed. Browser `node e2e-floor-editor-stabilization.mjs` → `FLOOR EDITOR BROWSER VALIDATION — PASS (36/36)`; door section clicked Yes directly through the visible toast with no manual layer enabling; zero uncaught page errors; disposable shell removed. Scoped eslint: e2e clean; `FloorEditor.tsx` only the pre-existing baseline with zero findings on changed lines. Dev server: pre-existing `next dev` on port 3000 (PID 16996, started from this repo) hot-recompiled the fixes; left untouched.
- **Commit:** `0e37f95` — `fix(floor-editor): reveal route layers on door pick and pass clicks through the route toast` (only the two files staged).
- **Next:** None. Task 14 report updated with a `Fix wave 1` section at `navi-next/.superpowers/sdd/irj-reports/task-14-report.md`.

## 2026-09-13 — Navi Studio → Routes data-sync investigation

- **What was investigated:** Read-only comparison of the live `map-map-1-k6bv` Studio, Routes/Route Testing, deployed graph/public-campus endpoints, Studio persistence source, runtime consumer source, and the optimistic-concurrency migration. User screenshots were treated as evidence only.
- **Finding:** The live Studio retained local edits but repeatedly logged `syncToSupabase blocked while a server conflict is unresolved`; the server revision was `2026-09-13T09:12:40.365798Z`. The top badge still said `All changes saved` because the EditorBridge adapter does not await the graph-store save and `SaveStatus` reads only workflow state.
- **Runtime proof:** `/api/graph` and `/api/public-campus` both returned the unchanged server graph at `29 buildings / 53 nodes / 50 edges`; public source was `graph_snapshots`, revision `null`; `/api/published-map` returned 404. The server edges had no authored stair/slope metadata. The 29 persisted server building records comprise 27 `osm-bldg-*` records plus 2 custom records; their exact seed/test provenance is not exposed by the read-only API.
- **Verification:** Final repeat probe reproduced `graph=29/53/50`, `public=graph_snapshots rev=null 29/53/50`, `published=404`; the live Studio console still reproduced the conflict warning. No edit, force-resync, publish, cache clear, or database mutation was performed.
- **Artifacts:** `spec/NAVI-STUDIO-ROUTE-DATA-SYNC-INVESTIGATION-2026-09-13.md`, `plan/NAVI-STUDIO-ROUTE-DATA-SYNC-INVESTIGATION-2026-09-13.md`, `plan/NAVI-STUDIO-ROUTE-DATA-SYNC-INVESTIGATION-2026-09-13-TODO.md`, and `progress/NAVI-STUDIO-ROUTE-DATA-SYNC-INVESTIGATION-2026-09-13.md`.
- **Next:** A separate, user-approved fix task should resolve/merge the conflict safely, await graph persistence, surface conflict status in the Studio header, then validate and publish if required.

## 2026-09-13 - ROU Task 9: Browser verification + full suite + logs

- **Delivered:** Extended `e2e-floor-editor-stabilization.mjs` with: orphan Door fixture + silent auto-adoption assertion on floor open (and persistence across save/reload); Outliner nesting (`Doors (` under the owning Room, no `Unassigned Doors` while all assigned); manual `Reconcile room ownership` idempotence (floor snapshot byte-identical); panel `Duplicate` (count +1, new id, ~0.5 m x/y offset, same canonical `roomId`, no `routeConnection`, selection follows); `Ctrl+D` duplicate + `Ctrl+Z` removal; duplicate persistence across save/reload; and a semantic canonical-ownership block (two fixture wall enclosures, Room tool declaration, attribute-only declaration via the production `roomAttributes.declare` command) with per-door `roomId`/ownership assertions. Added `waitForSnapshot`/`waitForSourceFeatures` polling for the debounced autosave (ERRORS.md timing entry).
- **Browser:** fresh `npm run dev` on :3000 (stale listener PID 16996 stopped first) + `node e2e-floor-editor-stabilization.mjs` → `FLOOR EDITOR BROWSER VALIDATION — FAIL (55/57)`. All 48 pre-existing checks and 7 of 9 new checks pass; the 2 semantic Door checks expose a real product defect (see ERRORS.md entry) — the created Doors were placed correctly inside their faces but resolved `{status:'ambiguous'}` against every derived face.
- **Defect evidence:** offline reproduction with the fixture walls: `resolveUniqueRoomOwner({x:11.94,y:4.02}, collectFloorRoomOwnershipPolygons(floor))` → `{status:'ambiguous', candidateRoomIds:[A,B]}` although the point is inside A only; `{x:25.42,y:-19.54}` (outside both) also → ambiguous.
- **Suite:** `npm test` → **Test Files 15 failed | 533 passed (548); Tests 29 failed | 5649 passed | 8 skipped (5686)** — exactly the pre-existing baseline (15 files / 29 tests), no new failures; failures untouched.
- **Commit:** `c532f80` — `test(e2e): verify room hierarchy, reconcile and door duplication`; only `e2e-floor-editor-stabilization.mjs` staged (+168/−9), `git diff --check` clean.
- **Report:** `.superpowers/sdd/ro-reports/task-9-report.md`.

## 2026-09-13 - ROU Task 9 fix wave: degenerate ring edges

- **Defect:** `pointOnSegment` treated the duplicated closing vertex of wall-derived room rings (and any zero-length segment) as containing every point (`cross = 0` and `dot = 0` satisfied `0 >= 0 && 0 <= 0`), so every derived face "contained" every door position; floors with ≥2 semantic Rooms resolved every door `ambiguous` and never assigned a canonical `roomId`.
- **Fix:** `packages/editor/src/geometry/room-ownership.ts` `pointOnSegment` now rejects (near-)zero-length segments (`lengthSq <= 1e-18`) before the cross/dot math; boundary points are still detected by the adjacent non-degenerate edges, so shared-wall `ambiguous` semantics are unchanged. Commit `0820454` — `fix(editor): ignore degenerate ring edges in room containment` (geometry + test only, +77/−1, parent `c532f80`, not amended).
- **TDD:** RED on the two new `room-ownership` cases before the fix (`{x:2,y:2}` inside adjacent rooms → `ambiguous`; far point → `assigned`); GREEN 11/11 after (new shared-wall and shared-corner ambiguity pins kept passing). Regressions `door-ownership-reconcile` + `spatial-door-handlers` 24/24. `npx eslint` on the two changed files exit 0.
- **Browser:** fresh `npm run dev` on :3000 + `node e2e-floor-editor-stabilization.mjs` → `FLOOR EDITOR BROWSER VALIDATION — PASS (57/57)`; the two semantic ownership checks now pass with canonical ids `room-1-zu4b` and `semantic-room-face-97xrm4`; the server started here was stopped afterwards.
- **Ledger/report:** `errors/ERRORS.md` entry updated with Fix/Verification; `.superpowers/sdd/ro-reports/task-9-report.md` Fix wave section.

## 2026-09-13 - ROU Task 9 final review fix: no-op reconcile guard + stale ownership heal + duplicate angle/Ctrl+Shift+D

- **F1:** `needsDoorOwnershipReconcile(floor)` — a pure predicate sharing the handler's `requiredOwnershipTarget` decision core and exported from `@navi/editor` — now gates the `FloorEditor.tsx` auto-effect, so opening a floor / changing the room set with nothing to fix no longer dispatches, commits, bumps the version, or dirties the project for autosave. Deps remain `[buildingId, currentFloorId, roomIdFingerprint]`; `skipHooks: true` unchanged; the first open with an orphan still dispatches (predicate true).
- **F2:** a canonical `roomId` with missing/stale `ownership` is healed to `{ status: 'assigned' }` (roomId kept, journaled, included in the change set; inverse restores the pre-command pair byte-exact). Geometry never overrides the assignment.
- **F3/F4:** `buildDuplicatedDoor` copies `angle` when present and omits it when absent; the Ctrl+D branch requires `!e.shiftKey`, so Ctrl+Shift+D no longer duplicates.
- **Tests:** RED first (7 new assertions failed; one RED fixture destructuring typo corrected and ledgered). GREEN: `door-ownership-reconcile` + `door-duplicate` + `spatial-door-handlers` + `room-ownership` → **52/52**; app suites `semantic-room-properties` + `production-route-characterization` → **104/104**; `eslint` on the five editor files exit 0 (`FloorEditor.tsx` retains only pre-existing baseline violations in untouched hunks); `git diff --check` clean. Predicate unit-tested; no FloorEditor render test added because the harness mounts `FloorOutliner` with mocked services (stated in the report).
- **Browser:** fresh `npm run dev` + `node e2e-floor-editor-stabilization.mjs` → `FLOOR EDITOR BROWSER VALIDATION — PASS (57/57)`, including `seeded orphan Door is silently adopted … on floor open`; server stopped afterwards, port 3000 free.
- **Commits:** `c0d8856` — `fix(editor): heal stale door ownership and add reconcile predicate`; `0eb37e8` — `fix(floor-editor): guard no-op reconcile, copy door angle, ignore Ctrl+Shift+D` (new commits on `0820454`, staged exactly 3+3 files).
- **Report:** `.superpowers/sdd/ro-reports/task-9-report.md` §10.

## 2026-09-13 — NAVI Studio sync recovery: verification and safe-write gate

- **Implementation verified:** the Studio persistence adapter now awaits and propagates the graph-store save promise; workflow state observes graph sync status/error and cannot become saved while sync is pending, conflicted, or failed; publish is gated on a synced graph; top Studio status exposes conflict/error text and explicit load/review/confirmed-force recovery actions.
- **Runtime contract:** fallback `/api/public-campus` shaping now carries saved traces and POIs in addition to nodes, edges, buildings, components, and doors. The integration fixture covers a newly authored building, stair route/node, steep slope/authored routing metadata, and POI through save → `/api/graph` → `/api/public-campus`.
- **Verification:** elevated focused matrix passed **13 files / 77 tests**; production `npm run build` passed after the sandbox worker-spawn retry; new/API lint passed; scoped `git diff --check` passed. Repository `npx tsc --noEmit` remains blocked only by the unrelated pre-existing runtime fixture syntax error at `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`. `graphify update .` remains blocked by Windows `WinError 5: Access is denied`.
- **Live GET evidence:** `/api/graph` 200 (29 buildings / 34 floor records / 53 nodes / 50 edges, revision `2026-09-13T10:10:07.45635+00:00`); matching `/api/campuses` row reports `building_count=29`; `/api/public-campus` 200 with `source=graph_snapshots` and 29/53/50 (deployed fallback currently exposes 1 trace/1 POI); `/api/published-map` 404. No production POST or publish request was issued.
- **Gate result:** exact Studio-local JSON and stable-ID/content comparison are unavailable through the supported browser context, while the fresh server revision drifted from the earlier observation. Legacy `osm-bldg-*` and other server-only records were not deleted; no server sync, force overwrite, final write backup, or publication was attempted. Continue only after an exact local export and explicit authoritative merge decision.

## 2026-09-13 — Studio save banner administrator contract (presentation only)

- **Scope:** `save-status-model.ts`, `SaveStatus.tsx`, `FloorEditor.tsx` ContextHeader tooltip string, and their tests. `graph-store.ts`, `packages/editor/`, and all recovery behavior (handlers, store calls, force-overwrite confirmation dialog) were untouched.
- **Contract:** conflict banner title `Changes not synced` with a fixed preservation body; primary actions `Review conflict` (same handler) and `Load server version`; `Force overwrite` plus the raw `diagnostic` moved under an `Advanced recovery` disclosure. Offline sync error maps to `Saved on this device` with no recovery actions; other sync errors keep `Save failed — changes preserved` with a human-readable detail. Raw `syncError`/`saveError` now live only in `SaveStatusModel.diagnostic`.
- **Verification:** `npx vitest run` focused gate (save-status-model + SaveStatus + studio-persistence) -> 3 files / 12 tests passed; extra FloorEditor render suites -> 2 files / 12 tests passed. `npx eslint` on the five changed files: four clean; `FloorEditor.tsx` retains only the pre-existing 28-problem baseline (none on changed lines).
- **Graph:** `graphify update .` succeeded (26410 nodes / 38567 edges / 2098 communities); the previous `WinError 5` did not recur.
