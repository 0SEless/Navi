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

## 2026-07-09: SelectionManager get version() clashes with BaseEditorService.readonly version
- **Error**: `TypeError: Cannot set property version of #<SelectionManager> which has only a getter` — SelectionManager defined `get version()` as an accessor, but `BaseEditorService` has `readonly version = '1.0.0'` (a value property). When the parent constructor runs, it assigns `this.version = '1.0.0'`, which collides with the subclass getter.
- **Cause**: TypeScript compiles `readonly version = '1.0.0'` into a field assignment in the constructor. ES2022 class field semantics make this a `[[Set]]` on the instance, which conflicts with a getter-only accessor on the subclass prototype.
- **Fix**: Renamed `get version()` → `get revision()` and `_version` → `_revision` in SelectionManager. The BaseEditorService property `version` remains untouched.
- **Prevention**: Before defining a getter in a subclass, check if any ancestor has a value property with the same name. Prefer distinct names like `revision`, `counter`, `stamp` for internal versioning when extending a service base class.
- **Related tasks**: T4
- **Related files**: `packages/editor/src/selection.ts`, `packages/editor/src/context/service-registry.ts`

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

## 2026-07-08: Checksum/Size Mismatch in Manifest Validation
- **Error**: Release validation failed on checksum and size for all 4 artifact files. Manifest checksums did not match actual file contents.
- **Cause**: Manifest was computed using `JSON.stringify(obj)` (compact/minified) while files were written with `JSON.stringify(obj, null, 2)` (pretty-printed). The checksum and byte size from the compact form didn't match the pretty-printed file on disk.
- **Fix**: In `packages/compiler/src/publisher/index.ts`, computed checksums AFTER stringifying each file's actual content (`sha256(files['navigation.graph.json'])`), not from the raw data object.
- **Prevention**: Always compute checksums from the exact bytes written to disk, not from the data structure. Use a `Record<string, string>` for file contents, compute checksums from the strings, then write.
- **Related files**: `packages/compiler/src/publisher/index.ts`, `scripts/validate-release.ts`

## 2026-07-08: Publisher Creating Empty Search/Building Artifacts
- **Error**: Published `search.index.json` contained `{"version":"1.0.0","entries":[]}` and `building-index.json` was also empty, even though the campus data had rooms and buildings.
- **Cause**: Publisher created artifact structures inline with hardcoded empty arrays instead of calling `generateArtifacts()` from artifact-generator.ts.
- **Fix**: Replaced inline artifact construction with `generateArtifacts(campus, extraction)` which builds search index, POI data, and building index from the actual campus document and extraction data. Also added `extraction` field to `CompileResult` so the publisher can access it.
- **Prevention**: Don't duplicate artifact generation logic. Always call the shared `generateArtifacts()` which is the single source of truth.
- **Related files**: `packages/compiler/src/publisher/index.ts`, `packages/compiler/src/types/index.ts`

## 2026-07-08: ExtractionCoordinator Produces Zero Results
- **Error**: `compile()` returned 0 nodes and 0 edges. Navigation graph was empty despite valid campus document with 24 rooms and 4 roads.
- **Cause**: `ExtractionCoordinator` is a framework pattern with no concrete extractors registered. `coordinator.extractAll()` iterated over an empty `extractors` array and returned nothing.
- **Fix**: Created `directExtract()` in `packages/compiler/src/extractors/direct-extract.ts` — a self-contained function that directly converts CampusDocument rooms/roads/entrances into `ExtractionResult`. Updated `compile()` to use `directExtract()` instead of the empty coordinator.
- **Prevention**: Don't use framework patterns (coordinator/extractor) without registering at least one concrete implementation. Prefer direct functional conversion for straightforward data transformations.
- **Related files**: `packages/compiler/src/extractors/direct-extract.ts`, `packages/compiler/src/pipeline/compile.ts`

## 2026-07-08: ReferenceError — entranceNodes Used Before Initialization
- **Error**: `ReferenceError: Cannot access 'entranceNodes' before initialization` when running buildGraph().
- **Cause**: The room-to-entrance connection block referenced `entranceNodes` (defined with `const`) before the `const entranceNodes = ...` declaration appeared later in the function. `const` variables are in the temporal dead zone until declaration.
- **Fix**: Moved `entranceNodes` and `corridorNodes` declarations to before the room-to-entrance block (removed duplicate declarations from the entrance-to-corridor block).
- **Prevention**: All `const` variable declarations that are used across multiple code blocks should be declared at the top of the function scope.
- **Related files**: `packages/compiler/src/artifacts/artifact-generator.ts`

## 2026-07-08: No Route Found Between Buildings and Roads
- **Error**: A* routing returned no path between building rooms (e.g., Main Lobby) and corridor endpoints. The graph had 36 nodes and 4 edges (corridor segments), but no connections to building interiors.
- **Cause**: buildGraph() created corridor edges and building nodes, but no edges connected buildings to the road network. Rooms and entrances were isolated subgraphs.
- **Fix**: Added nearest-neighbor edge generation in buildGraph(): (1) connect each room to the nearest entrance on the same building/floor, (2) connect nearby rooms on the same floor (<50m) to form a walkable mesh, (3) connect each entrance to the nearest corridor endpoint (<200m). Tracked seen connections with a Set to avoid duplicate edges.
- **Prevention**: Graph construction must connect all subgraphs (buildings ↔ entrances ↔ roads) into a single connected component for routing to work.
- **Related files**: `packages/compiler/src/artifacts/artifact-generator.ts`

## 2026-07-08: road.points is Undefined in directExtract
- **Error**: `TypeError: Cannot read properties of undefined (reading 'length')` at directExtract line 50.
- **Cause**: The road objects in the campus document have `polyline.points` (e.g., `{id: "road-1", polyline: {points: [{lat, lng}, ...]}}`), not a direct `points` property.
- **Fix**: Changed from `road.points` to `road.polyline?.points ?? (road as any).points` with a fallback check.
- **Prevention**: Always inspect the actual data structure before writing extraction code. Check a sample object with `console.log(JSON.stringify(...))`.
- **Related files**: `packages/compiler/src/extractors/direct-extract.ts`

## 2026-07-08: Rooms Use Local x/y Coordinates Instead of Lat/Lng
- **Error**: Rooms have `polygon.points` with `{x, y}` (meters from building origin), but the navigation graph requires `{lat, lng}` coordinates.
- **Cause**: The campus document stores room geometry in local building coordinates (x/y in meters), with the building's footprint providing the lat/lng origin reference.
- **Fix**: Added `localToLatLng()` conversion function in direct-extract.ts that converts local (x,y) to (lat,lng) using the building footprint centroid as the origin and 1° ≈ 111,320m approximation.
- **Prevention**: Coordinate system conversions (local x/y ↔ lat/lng) need to be handled explicitly with the correct reference point (building footprint centroid or entrance lat/lng).
- **Related files**: `packages/compiler/src/extractors/direct-extract.ts`

## 2026-07-08: M6 Release & Evaluation — Security Audit
- **Audit**: Manual code review of compiler, runtime, publisher, and scripts
- **Method**: STRIDE threat classification across 8 source files
- **Findings**: 10 threats identified (1 closed/mitigated, 1 accepted risk, 8 open)
- **Severity**: 3 P0 (input validation, prototype pollution, integrity verification), 3 P1, 2 P2
- **Action**: SECURITY.md written to `navi-next/SECURITY.md`
- **Related entries**: T1, T9, T2 — the three P0 threats should be resolved before next milestone

## 2026-07-09: Localhost E2E Testing — Bugs Found
- **Error**: Seven bugs discovered during systematic localhost testing of all pages, APIs, and data pipeline.

### B1 — OSM Buildings API returns 502 with default radius (0.01°)
- **Error**: GET `/api/osm-buildings` with default radius (0.01°) returns 502 Bad Gateway from Overpass API. Larger radius (0.02°) works.
- **Cause**: Default radius too small for the ASU Ibajay area — Overpass finds no buildings and errors. Not a code bug per se (network/API timing), but the default should be larger.
- **Fix**: Increase default radius from 0.01° to 0.02° in `route.ts:76`.
- **Prevention**: Test API endpoints with multiple geographic areas before setting defaults.
- **Related files**: `src/app/api/osm-buildings/route.ts`

### B2 — POST /api/campus-maps requires `payload` wrapper key
- **Error**: POST to `/api/campus-maps` with `{map_id, data}` fails with 500. Body must be wrapped in `{payload: {...}}` to match RPC parameter name.
- **Cause**: `supabase.rpc("sync_campus_map", body)` passes body properties as named RPC parameters. The RPC expects a single `payload` parameter. Direct API callers have no way to know this.
- **Fix**: Wrap body in `{payload: body}` in the API route before passing to RPC. Or document the expected format.
- **Prevention**: API routes that proxy to RPC functions should normalize the body format before forwarding.
- **Related files**: `src/app/api/campus-maps/route.ts`

### B3 — POST /api/graph FK violation on building_id
- **Error**: Syncing graph data to Supabase fails with `foreign key constraint "route_nodes_building_id_fkey"` when corridor nodes have `buildingId: ""`.
- **Cause**: `sync_graph_snapshot` RPC inserts `n->>'buildingId'` directly into `route_nodes.building_id`. Nodes with `buildingId: ""` (corridors, 8 out of 36) cause FK violation since no building exists with `id = ""`.
- **Fix**: Updated RPC to use `NULLIF(n->>'buildingId', '')` so empty strings become NULL, which satisfies the nullable FK constraint.
- **Detection**: 500 error when POSTing compiled graph. Also detectable at compile time by validating FK references before DB insert.
- **Prevention**: Any JSON field that maps to a nullable FK should convert empty-string to NULL on insert. Consider a pre-insert validation step in the API route.
- **Related files**: `migration fix_graph_sync_null_building_id`, `packages/compiler/src/artifacts/artifact-generator.ts` (corridor nodes emit buildingId: "")

### B4 — POST /api/campus-maps also affected by payload wrapper
- **Error**: Same as B2 but for the DELETE endpoint and potentially the POST endpoint.
- **Cause**: `supabase.rpc("delete_campus_map", { map_id_param: mapId })` — the RPC parameter name `map_id_param` isn't obvious to API callers.
- **Fix**: Normalize parameter names in the API route to match RPC expectations.
- **Related files**: `src/app/api/campus-maps/route.ts`

### B5 — Dev server background jobs unreliable on Windows
- **Error**: Multiple attempts to start Next.js dev server via PowerShell background jobs failed — jobs terminate silently due to PS job limitations with interactive processes.
- **Cause**: `Start-Job` / `Start-Process` for npx/node processes have unreliable behavior on Windows (especially with `npx`). Process handles get orphaned.
- **Workaround**: Use `Start-Process powershell -ArgumentList "-NoExit", "-Command", "npx next dev -p 3000"` or run directly in terminal.
- **Related files**: —

### B6 — Invoke-WebRequest corrupts Unicode in JSON payloads
- **Error**: POSTing JSON with Unicode characters (em-dash `—`, accented chars) via PowerShell `Invoke-WebRequest` causes 400 Bad Request with JSON parse errors.
- **Cause**: PowerShell's `Invoke-WebRequest` sends strings with default encoding that mangled non-ASCII bytes. `ConvertTo-Json` produces valid JSON but the HTTP request encodes it incorrectly.
- **Workaround**: Use `node -e` with `http.request()` for POST requests with Unicode content. Or explicitly encode as UTF-8 bytes.
- **Related files**: —

### B7 — 19/20 pages tested, all 200 OK except POST-only endpoints
- **Error**: `/api/floor-plans` returns 405 Method Not Allowed on GET — expected behavior (POST-only file upload endpoint).
- **Verdict**: Not a bug. API is correctly restricted to POST. Move along.
- **Related files**: `src/app/api/floor-plans/route.ts`

## 2026-07-09: M3 Wave 3 — Routing Turn Detection Bug in A\*
- **Error**: Turn-by-turn instructions returned "Continue straight" for a clear 90° left turn. All 9 turn instruction scenarios were failing during routing validation testing.
- **Cause**: `generateInstructions()` in `routing-engine.ts` compared `prevBearing` (bearing of the segment from the current node outward) with `segmentBearing` (bearing of the next segment). But `prevBearing` was computed from the current node's outgoing segment, not the incoming path direction. Since both bearings were computed from the same node's outgoing segments, they were often similar even when the path made a real turn.
- **Fix**: Changed `prevBearing` to use the actual incoming path node: compute bearing from the previous path node to the current node before comparing with the bearing from current node to next node.
- **Prevention**: Turn instruction logic must derive `prevBearing` from the path's incoming edge direction, not from any edge in the graph near the current node. Always trace the actual path, not the graph.
- **Related files**: `packages/runtime/src/routing/routing-engine.ts`

## 2026-07-09: M3 Wave 5 — Pipeline Test Used Non-Exported `directExtract`
- **Error**: `pipeline-recovery.test.ts` failed with `TypeError: directExtract is not a function` — the test tried to import `directExtract` from `@navi/compiler`, but it's an internal function not part of the public API.
- **Cause**: `@navi/compiler/src/index.ts` only exports `compile`, `generateArtifacts`, `publish`, and types. `directExtract` is internal to the extractors module.
- **Fix**: Changed the test to use `compile()` result's `extraction` field (already embedded in `CompileResult`) instead of calling `directExtract` separately.
- **Prevention**: Integration tests should only use the public API of dependent packages. Internal functions like `directExtract` should never be imported cross-package. The compiler already exposes everything needed through its documented exports.
- **Related files**: `packages/runtime/src/engine/__tests__/pipeline-recovery.test.ts`

## 2026-07-09: M3 Wave 4 — Large Doc Performance Test Removed
- **Error**: Performance test for large document compilation (creating a 100-room campus with A\* pathfinding) was removed because it couldn't import `@navi/runtime` routing.
- **Cause**: The performance test lives in `@navi/compiler`, which cannot import `@navi/runtime` (which would create a circular dependency risk and isn't architecturally correct). The test tried to dynamically import it, but the routing functionality is in the runtime package.
- **Fix**: Removed the large document scenario. Small and medium doc tests (both under-budget) remain as adequate compile-time baselines. Large document E2E performance is covered by the pipeline test.
- **Prevention**: Keep compile-time and runtime performance tests in their respective packages. The compiler tests compile time, the runtime tests query time. Don't cross-import.
- **Related files**: `packages/compiler/src/__tests__/performance-baselines.test.ts`

## 2026-07-09: M3 Wave 2 — Compiler Invariants (3 new findings)

### B8 — NavigationSpace.type Not Set by directExtract (TS Type Coverage Gap) ✅ FIXED
- **Error**: `directExtract()` creates `NavigationSpace` objects without the `type` field. TypeScript's `NavigationSpace` interface requires `type: NavigationSpaceType` (e.g., `'room'`), but the runtime object has `type: undefined`. The `as NavigationSpace` cast silences the compiler but doesn't populate the field.
- **Cause**: `direct-extract.ts` line 39-47 pushes a plain object with `area` and `properties` but no `type` field. TypeScript `as NavigationSpace` cast bypasses compile-time checking.
- **Fix**: Added `type: 'room'` to the space object in `directExtract()` line 42.
- **Prevention**: Prefer `satisfies` or inline type annotations over casts. Unit tests should check that required fields are actually populated, not just that the object has the expected shape.
- **Related files**: `packages/compiler/src/extractors/direct-extract.ts`

### B9 — WalkableCorridor.type Casts road.type Without Mapping (Invalid Type Value) ✅ FIXED
- **Error**: `directExtract()` casts `road.type as 'walkway' | 'road' | 'path'` but `road.type` is a `RoadType` (`'arterial' | 'connector' | 'service'`). The resulting `WalkableCorridor.type` is `'connector'` which is NOT a valid `CorridorType` value. The cast lies about the runtime value.
- **Cause**: `direct-extract.ts` line 75: `type: road.type as 'walkway' | 'road' | 'path'` — the method's roadmap-to-corridor mapping was written optimistically assuming road types match corridor types, which they don't.
- **Fix**: Replaced cast with explicit mapping: `Record<RoadType, CorridorType> = { arterial: 'road', connector: 'walkway', service: 'walkway' }`. Also imported `RoadType` from `@navi/core` and `CorridorType` from compiler types.
- **Prevention**: Never use casts to lie about type incompatibilities. Always map between different domain types explicitly. The TypeScript type check should have caught this if not for the cast.
- **Related files**: `packages/compiler/src/extractors/direct-extract.ts`, `packages/compiler/src/types/index.ts`

### B10 — compile() Checksum Includes createdAt Timestamp (Non-Determinism) ✅ FIXED
- **Error**: `compile()` sets `createdAt: new Date().toISOString()` on the graph object, then computes the SHA-256 checksum from `JSON.stringify(graph)`. Since the timestamp changes on every call, two compilations of identical input produce different checksums if they cross a millisecond boundary.
- **Cause**: `compile.ts` line 13-14 sets `createdAt` first, then line 22-23 hashes the entire graph including the timestamp. The checksum should be computed from content-only fields, then `createdAt` and `checksum` should be set afterward.
- **Fix**: Destructure `{ createdAt, checksum, ...contentOnly }` before hashing in both `compile.ts` and `artifact-generator.ts`. `createdAt` remains in the output graph but is excluded from the hash input. Tests now verify deterministic checksums.
- **Prevention**: Any checksum MUST be computed from deterministic, content-only data. Timestamps, random seeds, or nonce values must be excluded from the hash input. Add a test verifying that two calls to `compile()` with the same input produce identical checksums.
- **Related files**: `packages/compiler/src/pipeline/compile.ts`, `packages/compiler/src/artifacts/artifact-generator.ts`

## 2026-07-11: M2.9 FloorEditorCanvas — 4 more review findings fixed
- **Source**: `.planning/phases/floor-editor-review.md` (findings #2, #7, #12, #13)
- **T2** — Double-click added 2 points: `handleMapClick` fires twice on dblclick. Fixed by skipping clicks with `(e.originalEvent as MouseEvent).detail > 1` + register dblclick handler that calls `confirmPolygon`.
- **T7** — `as unknown as maplibregl.EventHandler` cast: unnecessary double cast. Fixed to single `as maplibregl.EventHandler`.
- **T12** — MapLibre mock never fired 'load': `addSourcesAndLayers` never tested. Fixed by adding `setTimeout(() => m.fire('load'), 0)` in MapCtor + mock sources with `setData`/`updateImage` fns.
- **T13** — Magic number defaults in ComponentProperties: `DEFAULT_ROOM_WIDTH`, `DEFAULT_ROOM_HEIGHT`, `DEFAULT_FLOOR` extracted as named constants.
- **Not fixed**: #14 (getState bypass — intentional for callbacks), #16 (save pattern — consistent).
- **Related files**: `FloorEditorCanvas.tsx`, `useFloorDrawing.ts`, `FloorEditorCanvas.test.tsx`, `ComponentProperties.tsx`

## 2026-07-11: M2.8 FloorEditorCanvas Bugs Fixed (7 findings from review)
- **Source**: `.planning/phases/floor-editor-review.md` (16 total findings, 7 fixed)
- **T1 (CRITICAL)** — Floor plan image never loaded: `mapInstance` missing from useEffect deps. Effect never re-ran after `readyRef.current` became true.
- **T2 (HIGH)** — Empty footprint → NaN: `buildBuildingGeo` divided by 0 when `footprint.length === 0`.
- **T3 (HIGH)** — Spurious network request: `updateImage({ url: '', ... })` fetched from current page URL.
- **T4 (HIGH)** — Dead dependency: `graph.traces` in dep array but unused.
- **T5 (MEDIUM)** — Keyboard shortcuts broken: listener on canvas required manual click focus. Changed to `window.addEventListener` with input-element guard.
- **T6 (MEDIUM)** — Silent error swallowing: empty `catch {}` blocks hid setData/layer visibility errors.
- **T7 (INFO)** — Missing memoization: `toggleLayer` not wrapped in `useCallback`.
- **Already fixed by graph.ts caching (2026-07-03)**: findings #3, #10, #11.
- **Deferred**: findings #2 (no dblclick handler exists in current code), #7 (type cast low impact), #12 (test mock), #13-#16 (LOW/INFO).
- **Related files**: `FloorEditorCanvas.tsx`, `FloorEditor.tsx`
