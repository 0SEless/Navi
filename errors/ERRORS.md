# Errors Log

## 2026-07-15: Blank map — footprint shape mismatch across graph/document boundary
- **Error**: Studio editor center blank (no map overlays); preview page shows OSM tiles but no building extrusions.
- **Cause**: Building `footprint` shape is inconsistent across the codebase. The graph `Building` type (`nav-types.ts:46`) defines `footprint: LatLng[]` (direct array), but:
  - `ConfirmOverlay.tsx:38` stores `footprint: { points: LatLng[] }` (object).
  - `createDocument` (`create-editor-context.ts:212`) reads `b.footprint?.points` but graph buildings from `CreateMapWizard` and `Graph.fromJSON` have `footprint` as `LatLng[]` array → `b.footprint?.points` is `undefined` → document building gets empty `footprint.points = []`.
  - `buildingsToGeoJSON` (`document-adapters.ts:12-14`) then throws `TypeError` on `b.footprint.points[0].lng` because `points` is empty. This throw is BEFORE the `try/catch` in `MapRenderer.renderAll`, so the entire render effect aborts — no buildings, nodes, or edges get `setData` → blank center.
- **Fix**:
  1. `create-editor-context.ts:80-86`: Normalize footprint from both `LatLng[]` array and `{ points }` object shapes using `Array.isArray(rawFootprint) ? rawFootprint : (rawFootprint?.points ?? [])`.
  2. `document-adapters.ts:4-19`: `buildingsToGeoJSON` now filters out buildings with empty/missing `footprint.points` instead of throwing.
  3. `useEntrancePlacer.ts:47,59`: Guard `b.footprint.points` with optional chaining + `?? []`.
- **Prevention**: When converting between graph and document models, inspect the actual runtime shape of nested fields. Add a test that feeds buildings with both footprint shapes and asserts correct GeoJSON output.

## 2026-07-15: `createDocument` missing required `version` field
- **Error**: `tsc --noEmit` reported `TS2741: Property 'version' is missing in type ... but required in type 'CampusDocument'`. Runtime: `document.version` is `undefined` — `validation-engine.ts:52` reads it for change tracking.
- **Cause**: `create-editor-context.ts` returned `{ schemaVersion: 1, ... }` but omitted the required `version: number` field from `CampusDocument`. The `create-document.test.ts` test expected `doc.version` to be `1` (line 56) but was also broken because `createDocument` wasn't exported.
- **Fix**: Added `version: 1` to `createDocument` return. Also exported `createDocument` so the test can import it.
- **Prevention**: When implementing a `CampusDocument` factory, include ALL required fields from the type definition. Run `tsc --noEmit` on the package after changes.

## 2026-07-15: MapPreview `buildBuildingGeo` crashes on `{ points }` footprint shape
- **Error**: Preview page shows OSM tiles but no building extrusions when stored building footprint is the object shape `{ points: LatLng[] }` instead of `LatLng[]` array.
- **Cause**: `MapPreview.tsx:42-66` `buildBuildingGeo` unconditionally reads `b.footprint` as an array (`b.footprint.length`, `b.footprint.map`, `b.footprint[0]`). When `b.footprint` is `{ points: [...] }` (object), `b.footprint.length` is `undefined` → falls into else branch which calls `b.footprint.reduce(...)` → `TypeError: b.footprint.reduce is not a function`.
- **Fix**: Rewrote `buildBuildingGeo` to normalize footprint from both shapes (identical pattern as `createDocument` fix), filter out buildings with <3 points, and produce valid GeoJSON.
- **Prevention**: All code reading building footprints must handle both `LatLng[]` array and `{ points: LatLng[] }` object shapes until the data model is unified.

## 2026-07-15: G4 — `entity.delete` had no registered handler (no-op delete)
- **Error**: `building-props.tsx` called `dispatcher.execute({ id: 'entity.delete', payload: { entityId } })` but no handler was registered for `entity.delete`; the building delete button did nothing.
- **Cause**: Per-entity delete handlers (`room.delete`, `building.delete`, …) existed and were registered, but the canonical `entity.delete` command (used by the editor spec for Delete/Backspace) was never implemented/registered.
- **Fix**: Added `entityDeleteHandler` (generic, resolves by `entityId` via `detectEntityType`) and registered it in `create-editor-context.ts`. All live delete entry points (controller Delete key, Explorer, panels) now route through it.
- **Prevention**: When wiring a UI action to a command id, verify the handler is registered in `create-editor-context.ts`; prefer a single generic `entity.delete` over type-specific `*.delete` handlers for UI-triggered deletes.

## 2026-07-14: Gate 4B e2e — Seed graph format mismatch
- **Error**: Published navigation.graph.json had 0 nodes despite seeding rooms/hallways
- **Cause**: Building `floors: []` (empty array) meant `createDocument` produced a building with 0 floors; components were never applied
- **Fix**: Added `floors: [{ id: 'flr-0', level: 0, label: 'Ground Floor', elevation: 0 }]` and proper `components` with world-coordinate polygons
- **Prevention**: Check `createDocument()` logic — components are grouped by `buildingId:floor` and only applied during `rawFloors.map()`. If floors array is empty, components are never merged into the document.

## 2026-07-14: EntityRenderer.syncAll dropped roads/rooms/hallways
- **Error**: After mounting `EntityRenderer`, only buildings + QR rendered; roads, rooms, hallways, entrances, etc. were silently absent.
- **Cause**: `ENTITY_SOURCE_MAP` in `packages/editor/src/rendering/entity-renderer.ts` mapped entity types to SINGULAR source keys (`road`, `building`, ...) but `documentToGeoJSON` returns PLURAL GeoJSON FeatureCollection keys (`roads`, `buildings`, ...). The lookup missed for every plural key, so only the special-cased `buildings` path worked.
- **Fix**: Changed `ENTITY_SOURCE_MAP` to use plural keys matching `documentToGeoJSON` output; removed the now-redundant `buildings` special-case.
- **Prevention**: When mapping between two symbol tables (entity type → source id), assert the keys come from the SAME vocabulary. Add a test that feeds each entity type and asserts its source receives features.
- **Related tasks**: Renderer decomposition (ADR 004)

## 2026-07-14: EntityRenderer.init() never created sources (load-gating)
- **Error**: `EntityRenderer` mounted but `navi-roads`/`navi-buildings` sources were missing, so nothing rendered.
- **Cause**: `init()` gated all `setup()` (source/layer creation) behind `map.loaded()` or a `'load'` listener. The React bridge (`EntityRendererBridge`) mounts the renderer only AFTER the map's `load` event has already fired, so the listener never triggered and `setup()` never ran.
- **Fix**: `setup()` now runs unconditionally in `init()` (still also registers a `'load'` listener for style reloads), mirroring the legacy `MapRenderer` pattern.
- **Prevention**: Renderer init must not depend on a map event that may have already fired before the component mounts. Prefer unconditional setup + optional reload listener.
- **Related tasks**: Renderer decomposition (ADR 004)

## 2026-07-14: P1.2 Seam 1 — editor test "describe is not defined"
- **Error**: New `campus-loader.test.ts` failed to load with `ReferenceError: describe is not defined`, while sibling `create-document.test.ts` passed.
- **Cause**: vitest globals are NOT auto-injected for this file; `create-document.test.ts` explicitly imports `{ describe, it, expect } from 'vitest'`, which `campus-loader.test.ts` omitted.
- **Fix**: Added `import { describe, it, expect } from 'vitest'` to the new test file.
- **Prevention**: Every new editor-package test file must explicitly import test globals from `'vitest'`; don't rely on global injection.
- **Related tasks**: T1.2 (persistence inversion)

## 2026-07-15: InteractionController.tsx:317 GeoJSON `Feature` type error (RESOLVED)
- **Error**: `tsc --noEmit` reported `InteractionController.tsx(317,60): Type '{ type: string; properties: {...}; geometry: {...} }[]' is not assignable to type 'Feature<Geometry, GeoJsonProperties>[]'` in the building-drag `handleMouseMove` (inline feature objects passed to `buildingSrc.setData`).
- **Cause**: Inline GeoJSON feature literals without explicit `GeoJSON.Feature` typing. Pre-existing, unrelated to P1.2 Seam 2 logic.
- **Resolution (incidental, not a dedicated cleanup)**: During G6-completion the building-drag handler was rewritten to publish a `features: GeoJSON.Feature[]` array (typed) to `previewFeatures` instead of writing `SRC.BUILDINGS` directly. The explicit `GeoJSON.Feature[]` typing eliminated the error. No separate typing pass was needed.
- **Prevention**: When building GeoJSON feature arrays for `setData`, declare the variable as `GeoJSON.Feature[]` (or cast) so inline literals are type-checked against the GeoJSON spec.
- **Related tasks**: G6 single-writer completion (ADR 006)


## 2026-07-15: Dead drag systems referenced removed helpers after tool-switch deletion (PREVENTED)
- **Error (near-miss)**: After removing dragVertexRef/uildingDragRef declarations and their handleClick early-returns, 
px tsc reported Cannot find name 'setCurrentPoints' at InteractionController.tsx(233,9) plus dragVertexRef/uildingDragRef still referenced in handleMouseMove (~187) and handleMouseUp (~200-267) dead drag blocks.
- **Cause**: Removing the tool-mode switch(tool) made the dragVertexRef/uildingDragRef drag systems unreachable, but their handler bodies (which called already-deleted setCurrentPoints, getCurrentPoints, indNearestVertex helpers) were not deleted in the same pass.
- **Resolution**: Deleted the dead handleMouseMove (dragVertexRef preview) and handleMouseUp (uildingDragRef.updateBuilding/save + dragVertexRef.setCurrentPoints) blocks. tsc clean.
- **Prevention**: When removing a dispatch switch, delete every handler body it could reach (drag systems, helpers) in the SAME pass and run 	sc immediately. Confirm registry-tool ownership (building-adjust-tool owns building drag) before deleting legacy equivalents.
- **Related tasks**: M1 (IC tool switch), G6 (drawing preview single-writer).

## 2026-07-15: `git stash` / `git stash pop` corrupted the live working tree (DATA-LOSS NEAR-MISS)
- **Error**: Attempted to discard generated `demo-output/` artifacts via a `git stash` → `git stash pop` dance. Instead the live P1.2 working tree was corrupted: a stale `git stash pop stash@{0}` overlaid an OLDER "WIP on master" stash onto it, overwriting uncommitted changes. The building-extrusion edits (layers.ts `BUILDING_EXTRUSION` + `buildingExtrusionPaint`, entity-renderer.ts extrusion layer def, geojson.ts `base_elevation`) were reverted to the older stash's versions and lost; `tsc --noEmit -p packages/editor/tsconfig.json` jumped from 1 pre-existing error to dozens of spurious errors across `core/geometry`, `editor/context/create-editor-context` (`createDocument` not exported), `editor/canvas/MapCanvas`, `editor/commands`, etc. — none present before the pop.
- **Cause**: The stash command ran as `git stash 2>&1 | Select-Object -First 3` in PowerShell. The broken pipe (and CRLF-normalization warnings on stdout) caused the process to fail/abort BEFORE a stash capturing the current tree was actually created. The following `git stash pop stash@{0}` therefore applied a PRE-EXISTING old stash (an earlier P1.2 checkpoint predating the extrusion edits) onto the live tree. That pop aborted on untracked `demo-output/` entries ("not a tracked file") but had already 3-way-merged / overwritten other tracked files with the older versions.
- **Fix (in progress)**:
  - `EntityRendererBridge.tsx` (untracked) retained its `BUILDING_EXTRUSION` visibility-toggle edit — confirmed present.
  - Re-applied the 3 extrusion edits (layers.ts `BUILDING_EXTRUSION` + `buildingExtrusionPaint()`; entity-renderer.ts extrusion layer def registered before fill/outline; geojson.ts `base_elevation: b.baseElevation ?? 0`).
  - Broader tree still inconsistent (dozens of tsc errors from overwritten files). Recovery plan: check `git status` for an in-progress merge / conflict markers; if present, `git merge --abort` / `git reset --merge` to restore the pre-pop working tree. If the pop fully aborted (no merge state), reconstruct the overwritten files' intended content from the plan docs (M1 InteractionController, G4 `createDocument`, etc. are reproducible). Then re-run tsc to confirm only the known `entity-renderer.ts(122,11)` pre-existing error remains.
- **Prevention**: NEVER pipe `git stash` through `Select-Object`/`head` (broken pipe can kill the process before it finishes — no "Saved working directory" line appears). To discard generated artifacts, use `git checkout -- <path>` or `git clean -fd <path>` directly — not a stash/pop dance. Before popping, confirm with `git stash list` that a NEW stash was actually created, and pop that explicit ref (`git stash pop "stash@{N}"`), not a stale `stash@{0}`.
- **Related tasks**: M1 (IC tool switch), building-height regression fix.

## 2026-07-15: Client bundle pulled Node built-ins (`fs`, `crypto`) via `@navi/compiler` barrel (BUILD ERROR)
- **Error**: `next build` (Turbopack) failed with `Module not found: Can't resolve 'fs'` at `packages/compiler/src/publisher/index.ts` (import trace: `compiler-adapter.ts` → `@navi/compiler` barrel → `EditorBridge.tsx` client component). `crypto` (`createHash`, used by `CampusCompiler` + artifact builders) would have failed next for the same reason.
- **Cause**: (1) The shared `@navi/compiler` barrel (`packages/compiler/src/index.ts`) statically re-exported `publish` from `./publisher`, which imports `fs`/`path`/`crypto`. ESM hoists that import, so any consumer of the barrel — even one that never uses `publish` — pulls `publisher` (and `fs`) into its bundle. (2) `src/services/compiler-adapter.ts` (imported by client `EditorBridge.tsx`) statically imported `CampusCompiler` + artifact builders (`crypto`) and `EditorBridge` injected the client-side `CampusCompilerAdapter` into `NavigationCompiler`, dragging `crypto` into the browser. This contradicts the documented design (compilation should be server-side via `/api/compile`).
- **Fix**:
  - Removed `export { publish } from './publisher'` from `packages/compiler/src/index.ts`; added `"./publisher": "./src/publisher/index.ts"` subpath export in `packages/compiler/package.json`; pointed `scripts/publish.ts` + `scripts/demo-run.ts` at `@navi/compiler/publisher` (Node/server-only).
  - Rewrote `src/services/compiler-adapter.ts` to drop the static `@navi/compiler` import and the client-side `CampusCompilerAdapter`; kept only the fetch-based `createCompilerAdapter()` (no Node built-ins in the client bundle).
  - `src/app/api/compile/route.ts` now computes and returns the full artifact set (`navigationGraph`, `stats`, `searchIndex`, `poiData`, `buildingIndex`) so client behavior is preserved.
  - `src/components/studio/EditorBridge.tsx` now injects `createCompilerAdapter()` instead of `new CampusCompilerAdapter()`.
- **Prevention**: Never statically re-export server-only modules (Node built-ins) from a barrel also imported by client components. Keep `@navi/compiler`'s Node-dependent code (publisher, `CampusCompiler`) out of the client graph via a server-only subpath, and route client compilation through `/api/compile`. Use type-only imports of `@navi/compiler` types in client code.
- **Related tasks**: P1.2 migration; client/server build separation.
