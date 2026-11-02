# NAVI Terrain, 2.5D Buildings, Stairs and Ramps — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Owner rule: no subagents — use executing-plans.**

**Goal:** Admins sculpt the campus ground, place buildings and floors at real heights, connect floors to roads with outdoor stairs and ramps, and visitors see that campus (only the campus) on NAVI Web from one published package.

**Architecture:** Pure terrain and structure maths live in `packages/core` (`terrain/`, `structures/`) so Studio, the publish server and NAVI Web share one implementation. Terrain changes are Save v2 binary `terrain-tile` parts carried on the document as base64 tiles; stairs and presets are new free map parts. Studio gets a separate terrain workspace route; rendering uses MapLibre 5.24 `raster-dem` fed through `addProtocol` plus one custom WebGL mesh layer (no new dependency). Publishing bakes one terrain file plus road surfaces and structures into the artifacts.

**Tech Stack:** TypeScript, Next.js (App Router), React, Zustand, MapLibre GL 5.24 (`addProtocol`, `raster-dem`, `hillshade`, `color-relief`, `fill-extrusion`, custom layers), vitest, Playwright, PostgreSQL (Save v2 `studio` schema).

**Spec:** `docs/superpowers/specs/2026-11-02-navi-terrain-2.5d-stairs-ramps-design.md` (approved 2026-11-02). Throwaway rendering test that proved the approach: `C:\Users\Administrator\AppData\Local\Temp\claude\C--Users-Administrator-Desktop-CODEme-Navi-navi-next\96a0ec9e-4c91-444b-a8d7-6f9f704664e5\scratchpad\terrain-spike\index.html` (reference only, may be gone; the mesh maths is restated in Task 11).

## Global Constraints

- Work in `C:\Users\Administrator\Desktop\CODEme\Navi\.navi-worktrees\navi-save-v2` on a new branch `feat/terrain-2.5d` cut from `feat/save-v2`. No push. No history rewrite.
- Owner rules: no subagents; never touch the Dev Supabase project `scvgulusmutnzasmgysx`; apply a migration to the cloud project `ztbnicoiwjghzttchqmp` only after the owner approves it in chat; never enter or print secrets; never stop the owner's dev server on :3000.
- All new `CampusDocument`, `Building` and `Road` fields are optional. A document without them hydrates, saves and publishes byte-for-byte as before; absent stays absent and never makes the document dirty.
- No new runtime dependency.
- Grid: cell 1 m; tile 128 × 128 cells; margin 20 m around the boundary; values Int16 centimetres (clamped to −32768…32767, never wrapped); the grid origin never moves after creation.
- Terrain changes and the terrain settings part are in the `terrain` lock zone. Stairs, ramps and presets are free (no lock). Building ground settings are in that building's zone.
- Editor colours: Heights view green `#22c55e` (campus min) → yellow `#eab308` → red `#ef4444` (campus max), fixed until changed; Changes view blue `#3b82f6` (−5 m) → transparent (0) → red `#ef4444` (+5 m). Editor only.
- Building base: Follow ground = mean final ground height over the building outline at 1 m spacing. Pad default `both`, blend 3 m.
- Brushes: size 1–60 m, strength 1–100 %, shapes circle/oval/rectangle/triangle with rotation, profiles flat/smooth/linear/hard, modes raise/lower/set.
- Stairs: riser count = max(1, round(|rise| / 0.175)); tread 0.30 m (shorter only when the run is too short); open underside thickness 0.20 m; railing posts every ~1.2 m; top rail 0.95 m, mid rail 0.45 m above the slope line.
- Ramps: smooth slope; landings placed by the user; slope shown as `1:N`; no pass/fail mark until the owner confirms BP 344 (1:12 or 1:20); nothing blocks publishing.
- NAVI Web draws nothing outside the campus boundary and limits pan/zoom to the campus.
- Gates at the end of every task (all must hold):
  - `npx vitest run --reporter=json --outputFile=.superpowers/sdd/terrain/vitest.json; node scripts/save-v2/compare-vitest.mjs reports/save-v2/baseline-vitest-passed.txt .superpowers/sdd/terrain/vitest.json` → exit 0 (0 regressed)
  - `node scripts/save-v2/tsc-gate.mjs` → errors ≤ 1122 and none under `src/studio-v2/`, `packages/core/src/terrain/`, `packages/core/src/structures/`, `src/components/terrain/`, `src/lib/terrain/`, `src/lib/three-d/` (Task 2 adds these folders to the gate's clean list)
  - DB tasks also: `npx vitest run -c vitest.savev2-db.config.ts` (local Postgres :55434 via `scripts/save-v2/db-up.ps1` + `node scripts/save-v2/db-reset.mjs`) → all pass
  - UI tasks also: `node e2e/save-v2/run.mjs` → 20/20.
- After code changes run `graphify update .` if graphify is installed.

## Review Focus

1. **Legacy and terrain-free campuses** — a campus with no `terrain`, `terrainTiles`, `structures` must load clean (not dirty), publish an identical artifacts blob except for an absent `site` key, and show a flat campus-only map. Test: Task 2 `split/join round-trip leaves a terrain-free document unchanged`, Task 5 `publish without terrain omits site`.
2. **Negative tile indices** — growing the boundary west/south of the origin creates tiles like `-1_0`; they must survive part keys, SQL key normalisation and reload. Test: Task 2 DB test `terrain-tile:-1_0 saves and loads`.
3. **Int16 limits** — repeated raise strokes past +327.67 m clamp, never wrap to negative. Test: Task 8 `raise stroke clamps at Int16 max`.
4. **Degenerate stairs** — rise 0, rise smaller than one riser, run shorter than steps need, zero-length stretch: no NaN, no negative tread, hint shown. Test: Task 11 `stairShape handles zero rise and short runs`.
5. **Locks across zones** — admin A holds the terrain lock; admin B edits a stair (free) and a building pad (building lock) and saves without the terrain lock. Test: Task 2 DB test `structure and building pad save without terrain lock`.

---

## Phase 0 — Check

### Task 0: Record whether NAVI Web keeps the published campus offline

**Files:** none changed; ledger only.

- [ ] **Step 1:** Read `src/store/public-store.ts` (campus loading), `src/app/(public)/map/**`, `public/sw*.js` or any `serviceWorker`/`caches.open`/IndexedDB use under `src/`.
  Run: `grep -rn "serviceWorker\|caches.open\|indexedDB" src public --include=*.ts --include=*.tsx --include=*.js`
- [ ] **Step 2:** Write the finding to the ledger as `Task 0: offline = <yes: how | no>`. If no, add to the ledger: `Ruling: offline caching is out of this plan; owner decides a follow-up` — do not build it here.

## Phase 1 — Data, maths and saving

### Task 1: Terrain grid, codec and types (`packages/core/src/terrain`)

**Files:**
- Create: `packages/core/src/terrain/types.ts`, `packages/core/src/terrain/grid.ts`, `packages/core/src/terrain/index.ts`
- Modify: `packages/core/src/index.ts` (export `./terrain`)
- Test: `packages/core/src/terrain/__tests__/grid.test.ts`

**Interfaces — Produces:**
```ts
// types.ts
export interface TerrainReference { name: string; zeroMeaning: string }
export interface TerrainGrid { originLat: number; originLng: number }          // south-west corner of tile 0_0
export type TerrainBaseSource =
  | { kind: 'mesh'; vertices: Array<[lat: number, lng: number, heightM: number]>; triangles: Array<[number, number, number]>; sourceNote: string }
  | { kind: 'contours'; lines: Array<{ elevationM: number; points: Array<{ lat: number; lng: number }> }>; sourceNote: string }
export interface CampusTerrain { reference: TerrainReference; grid: TerrainGrid; base?: TerrainBaseSource; colorRange: { minM: number; maxM: number } }
export type TileId = `${number}_${number}`
export interface GroundFit { mode: 'off' | 'raise' | 'lower' | 'both'; blendMeters: number }
export interface BakedTerrain { originLat: number; originLng: number; cols: number; rows: number; cellMeters: 1; heightsCm: string /* base64 Int16LE, row-major from south-west */; minM: number; maxM: number }
// grid.ts
export const CELL_METERS = 1, TILE_CELLS = 128, GRID_MARGIN_METERS = 20
export function toLocal(grid: TerrainGrid, p: { lat: number; lng: number }): { x: number; y: number }
export function toLatLng(grid: TerrainGrid, p: { x: number; y: number }): { lat: number; lng: number }
export function tileIdOf(col: number, row: number): TileId
export function parseTileId(id: string): { col: number; row: number }            // throws on malformed
export function tileOfCell(cx: number, cy: number): { col: number; row: number; i: number }
export function clampCm(value: number): number                                    // round + clamp to Int16
export function encodeTile(cells: Int16Array): string                             // base64 of Int16LE, length 128*128
export function decodeTile(base64: string): Int16Array                            // throws when not 32768 bytes
export function gridOriginForBoundary(points: Array<{ lat: number; lng: number }>): TerrainGrid
```
`toLocal`/`toLatLng` use the equirectangular form from the spike: `x = (lng − originLng) · 111320 · cos(originLat)`, `y = (lat − originLat) · 110540`.

- [ ] **Step 1: Write the failing tests** in `grid.test.ts`:
  - `toLocal/toLatLng round-trip within 1 mm` for 5 points within 1 km of the origin.
  - `tileOfCell maps negative cells to negative tiles`: `tileOfCell(-1, 0)` → `{ col: -1, row: 0, i: 127 }`; `tileOfCell(128, 129)` → `{ col: 1, row: 1, i: 1 * 128 + 0 }` (i = localRow·128 + localCol).
  - `parseTileId(tileIdOf(-3, 7))` → `{ col: -3, row: 7 }`; `parseTileId('a_b')` throws.
  - `clampCm(40000) === 32767`, `clampCm(-40000) === -32768`, `clampCm(12.6) === 13`.
  - `encodeTile/decodeTile round-trip` for a tile with values −32768, 0, 32767; `decodeTile('AAAA')` throws.
  - `gridOriginForBoundary` returns a south-west corner 20 m (± 1 cm) south and west of the boundary's minimum.
- [ ] **Step 2:** Run `npx vitest run packages/core/src/terrain/__tests__/grid.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `types.ts`, `grid.ts`, `index.ts` with the signatures above; base64 via `btoa`/`atob` on a `Uint8Array` view (works in Node 18+ and browsers).
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit `feat(core): terrain grid, tile codec and types`.

### Task 2: Document fields and Save v2 parts (terrain tiles, structures, presets)

**Files:**
- Modify: `packages/core/src/types/document.ts` (add `terrain?: CampusTerrain`, `terrainTiles?: Record<TileId, string>`, `structures?: Structure[]`, `structurePresets?: StructurePreset[]`)
- Modify: `packages/core/src/types/entities.ts` (`Building.ground?: { baseMode: 'follow-ground' | 'fixed'; pad: GroundFit }`; `Road.heightMode?: 'follow-surface' | 'typed'`; `Road.groundFit?: GroundFit`)
- Create: `packages/core/src/structures/types.ts` (types below), `packages/core/src/structures/index.ts`
- Modify: `src/studio-v2/parts/part-keys.ts` (kinds `map/structure`, `map/structure-preset`, arity 1, zone null)
- Modify: `src/studio-v2/parts/split.ts`, `join.ts`, `content-rules.ts` (see steps)
- Modify: `src/studio-v2/client/save-controller.ts` (binary parts), `src/studio-v2/client/studio-session.ts:150` (stop filtering out `terrain-tile`)
- Modify: `src/studio-v2/server/publish-handlers.ts:44-55` (`unsupportedParts` accepts `terrain-tile`; `joinParts` gets the binary tiles)
- Create: `supabase/migrations/20261103000000_studio_v2_structures.sql` (part-kind arity: add `map/structure`, `map/structure-preset` → 1; zone null)
- Modify: `scripts/save-v2/tsc-gate.mjs` (clean-path list per Global Constraints)
- Test: `src/studio-v2/parts/split-join.test.ts`, `src/studio-v2/parts/content-rules.test.ts`, `src/studio-v2/parts/part-keys.test.ts`, `src/studio-v2/client/save-controller.test.ts`, new `src/studio-v2/db/terrain-structures.db.test.ts`

**Interfaces — Produces:**
```ts
// packages/core/src/structures/types.ts
export type StructureForm = 'stairs' | 'ramp'
export type StructureEnd =
  | { kind: 'slab'; buildingId: string; floorId: string; edgeIndex: number; edgeT: number }   // edge of the building outline, 0..1 along it
  | { kind: 'road'; roadId: string; position: { lat: number; lng: number } }
  | { kind: 'ground'; position: { lat: number; lng: number } }
export interface Structure {
  id: string; form: StructureForm; presetId: string
  start: StructureEnd; end: StructureEnd; bend?: { lat: number; lng: number }
  width: number; underneath: 'open' | 'solid'; railings: 'none' | 'left' | 'right' | 'both'
  flight?: { startT: number; endT: number }            // stairs: fraction of the run; absent = centred
  landings?: number[]                                  // ramps: fractions of the run where a 1.5 m level landing is centred
  heightOverride?: { start?: number; end?: number }    // metres; absent = from the attachment
}
export interface StructureMaterial { id: string; name: string; color: string }
export interface StructurePreset {
  id: string; name: string; form: StructureForm
  shape: Pick<Structure, 'width' | 'underneath' | 'railings'>
  look: { tread: string; side: string; under: string; railing: string; railingStyle: 'posts-rails' | 'bars' | 'glass' | 'wall' }  // material ids
}
```
- Split: `terrain` part content becomes `{ terrainAreas?, terrainVerticalDatum?, terrain? }`; each `terrainTiles[id]` becomes a `PartRecord` `{ key: 'terrain-tile:<id>', content: null, contentBase64: <tile>, sortKey: null }` (add optional `contentBase64?: string` to `PartRecord`); `structures` and `structurePresets` are map collections (`map/structure`, `map/structure-preset`, optional).
- Join: rebuilds `terrainTiles` from `terrain-tile` parts (base64 kept as-is); absent when there are none.
- `SaveController`: a part with `contentBase64` hashes `fastHash(contentBase64)` and is sent as `{ op: 'put-bin', contentBase64 }`; a hash cache keyed by part key + string identity avoids re-hashing unchanged tiles.
- `content-rules`: `terrain-tile` parts are accepted only as binary of exactly 32768 bytes; `map/structure` requires `id` equal to the key id, `form` in `stairs|ramp`, `width` 0.6–10, `start`/`end` objects; `map/structure-preset` requires `id`, `name`, `form`, `shape`, `look`.

- [ ] **Step 1: Write the failing tests**
  - `split-join.test.ts`: `split/join round-trip leaves a terrain-free document unchanged` (fixtureFull); `terrain tiles split into terrain-tile binary parts and join back` (2 tiles incl. `-1_0`); `structures and presets round-trip in authored order`.
  - `part-keys.test.ts`: `zoneOf('map/structure:s1') === null`; `zoneOf('terrain-tile:-1_0') === 'terrain'`.
  - `content-rules.test.ts`: tile of 32767 bytes → `INVALID_PART`; structure with `width: 20` → `INVALID_PART`; valid structure → no issues.
  - `save-controller.test.ts`: `a changed tile is sent as put-bin`; `an unchanged tile is not re-sent after adoptBaseline`.
  - `terrain-structures.db.test.ts` (withTestDb): `terrain-tile:-1_0 saves and loads` (put-bin round trip through `studio.save` + load); `structure and building pad save without terrain lock` (actor A acquires `terrain`; actor B saves `map/structure:s1` and `building:b1` with B holding `building:b1` → saved); `map/structure-preset key is accepted after the migration`.
- [ ] **Step 2:** Run `npx vitest run src/studio-v2/parts src/studio-v2/client/save-controller.test.ts` → FAIL; DB: `npx vitest run -c vitest.savev2-db.config.ts src/studio-v2/db/terrain-structures.db.test.ts` → FAIL ("Unknown part kind").
- [ ] **Step 3:** Implement the type additions, part kinds, split/join, content rules, SaveController binary path, session load and publish acceptance as listed. Migration: `CREATE OR REPLACE` the arity function with the two kinds added (copy the current body from `20261101000000_studio_v2.sql` and its `zone_of` from `20261102000000_studio_v2_campus_unlocked.sql`), keep `REVOKE ALL … FROM PUBLIC` / `GRANT EXECUTE … TO navi_studio_api`, `SECURITY DEFINER`, `SET search_path = studio, pg_temp`, LF line endings.
- [ ] **Step 4:** `node scripts/save-v2/db-reset.mjs` then re-run both commands → PASS. Run the gates.
- [ ] **Step 5:** Commit `feat(save-v2): terrain tiles, structures and presets as parts`. Ledger: `Task 2: cloud migration pending owner approval`.

### Task 3: Import a base surface (TopoExport `.glb`, GeoJSON contours, UTM)

**Files:**
- Create: `packages/core/src/terrain/utm.ts`, `packages/core/src/terrain/glb-ground.ts`, `packages/core/src/terrain/base-surface.ts`, `packages/core/src/terrain/import.ts`
- Test: `packages/core/src/terrain/__tests__/utm.test.ts`, `glb-ground.test.ts`, `base-surface.test.ts`, `import.test.ts`; fixtures `packages/core/src/terrain/__tests__/fixtures/` (copy the owner's `topoexport_3D_modeling.glb`, `frame.geojson`, `contours_*.geojson` from `C:\Users\Administrator\AppData\Local\Temp\` into fixtures; if missing, ask the owner to re-share)

**Interfaces — Produces:**
```ts
export function utmZoneFromCrs(crsName: string): { zone: number; south: boolean }            // 'urn:ogc:def:crs:EPSG::32651' → {51,false}; 327xx → south; else throws
export function utmToLatLng(e: number, n: number, zone: number, south: boolean): { lat: number; lng: number }
export function readGlbGroundMesh(bytes: Uint8Array): { positions: Float32Array; indices: Uint32Array }   // meshes named /^TPX_Ground/; throws 'No TPX_Ground mesh in this file'
export function sampleBase(source: TerrainBaseSource, grid: TerrainGrid, x: number, y: number): number | null  // metres; null outside the source
export function importTopoExportGlb(glb: Uint8Array, frameGeoJson: unknown): TerrainBaseSource   // frame = the export's frame LineString (south-west corner = GLB origin)
export function importContoursGeoJson(geojson: unknown): TerrainBaseSource                        // LineStrings with properties.elevation; UTM via crs
```
`sampleBase` for `mesh`: barycentric interpolation inside the containing triangle (local metres). For `contours`: at the point, find the nearest line below and the nearest line above (by elevation and planar distance); height = `lowerElev + (upperElev − lowerElev) · dLower / (dLower + dUpper)`; with only one side, the nearest line's elevation.

- [ ] **Step 1: Write the failing tests**
  - `utm.test.ts`: `utmToLatLng(409425.04, 1306328.06, 51, false)` → lat 11.815874 ± 0.00001, lng 122.168548 ± 0.00001; `utmToLatLng(409962.36, 1306721.12, 51, false)` → 11.819443, 122.173470 (± 0.00001) (ASU-Ibajay frame corners, Snyder inverse series); `utmZoneFromCrs('urn:ogc:def:crs:EPSG::32751')` → `{ zone: 51, south: true }`; `utmZoneFromCrs('EPSG:4326')` throws.
  - `glb-ground.test.ts`: the fixture GLB yields 588 vertices and 1080 triangles; z range 1.8–35.5 (±0.05); a GLB without `TPX_Ground` throws the message above.
  - `base-surface.test.ts`: `sampleBase` on a two-triangle square with corner heights 0,10,10,20 at its centre → 10; outside → null; contours 5 m and 10 m lines 10 m apart, point 2.5 m from the 5 m line → 6.25.
  - `import.test.ts`: `importTopoExportGlb(fixture, frame)` vertices' lat/lng lie inside the frame bbox; `importContoursGeoJson(fixture)` returns 9 lines with elevations ⊂ {5,…,35}.
- [ ] **Step 2:** Run `npx vitest run packages/core/src/terrain/__tests__` → FAIL.
- [ ] **Step 3:** Implement. UTM: standard Transverse Mercator inverse (WGS84, k0 0.9996, false easting 500000, false northing 10000000 for south). GLB: parse header + JSON chunk + BIN chunk; read POSITION (float32) and indices (uint16/uint32) accessors; node translation ignored (verified the export has none).
- [ ] **Step 4:** Re-run → PASS. Gates.
- [ ] **Step 5:** Commit `feat(core): import terrain base from TopoExport glb and contour GeoJSON`.

### Task 4: Final ground, fits, follow ground and bake

**Files:**
- Create: `packages/core/src/terrain/compose.ts`, `fits.ts`, `bake.ts`, `color-scale.ts`
- Test: `packages/core/src/terrain/__tests__/compose.test.ts`, `fits.test.ts`, `bake.test.ts`, `color-scale.test.ts`

**Interfaces — Produces:**
```ts
export interface TerrainSampler {
  baseAt(x: number, y: number): number            // metres; 0 where no base
  changeAt(x: number, y: number): number          // metres from tiles (bilinear between cells)
  fitAt(x: number, y: number): number             // metres delta from building pads and road fits
  heightAt(x: number, y: number): number          // base + change + fit
}
export function createTerrainSampler(doc: CampusDocument, opts?: { structuresAsSurface?: boolean }): TerrainSampler | null   // null when doc.terrain is absent
export function followGroundBase(building: Building, groundOnly: (x: number, y: number) => number, grid: TerrainGrid): number  // mean over outline at 1 m
export function effectiveBuildingBase(building: Building, sampler: TerrainSampler, grid: TerrainGrid): number                  // fixed → baseElevation; follow-ground → followGroundBase on base+change (no fits)
export function surfaceHeightAt(doc: CampusDocument, sampler: TerrainSampler, p: { lat: number; lng: number }): number          // top of a structure under p, else heightAt
export function bakeTerrain(doc: CampusDocument): BakedTerrain | null   // boundary bbox + 20 m margin, 1 m cells, heightAt in cm
export function heightsColorStops(minM: number, maxM: number): Array<[number, string]>   // [[min,'#22c55e'],[mid,'#eab308'],[max,'#ef4444']]
export const CHANGES_COLOR_STOPS: Array<[number, string]>                                 // [[-5,'#3b82f6'],[0,'rgba(0,0,0,0)'],[5,'#ef4444']]
```
Fit rule (building pad, mode `both`): inside the outline the ground is set to the building base; within `blendMeters` outside it, `final = ground + (base − ground) · s(d)` with `s` the smoothstep from 1 at the edge to 0 at `blendMeters`. `raise` applies only where `base > ground`; `lower` only where `base < ground`. Road fit: the same along a band of `width/2` around the polyline toward the road's surface height (linear between its start and end heights). Overlapping fits: the building pad wins over a road fit; two pads → the one whose edge is nearer.

- [ ] **Step 1: Write the failing tests**
  - `compose.test.ts`: `no terrain → createTerrainSampler returns null`; `base + one tile change`: base 10 m, tile cell +150 cm → `heightAt` 11.5 at that cell; `absent tile means no change`.
  - `fits.test.ts`: `pad both flattens the outline to the base` (ground slope 0→10 m across a 20 m building, base = mean 5 m, corners read 5.00); `pad blend reaches ground at 3 m`; `pad raise leaves higher ground untouched`; `followGroundBase is the mean over the outline`.
  - `bake.test.ts`: `bake covers boundary bbox + 20 m`; `bake encodes heights in cm row-major from south-west`; `publish without terrain omits site` is in Task 5.
  - `color-scale.test.ts`: `heightsColorStops(0, 40)` → stops at 0, 20, 40 with the three colours.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS; gates.
- [ ] **Step 5:** Commit `feat(core): final ground with building pads, road fits and terrain bake`.

### Task 5: Publish the site artifact and read it in NAVI Web's store

**Files:**
- Create: `packages/core/src/terrain/site-artifact.ts`
- Modify: `src/studio-v2/server/publish-handlers.ts` (after `compileRouteArtifacts`: `const site = buildSiteArtifact(document); if (site) artifacts.site = site`), `src/studio-v2/server/artifacts-blob.ts` (`site?: SiteArtifact` on `PublishArtifactsPayload`; carried verbatim)
- Modify: `src/types/nav-types.ts` (`CampusBundle.site?: SiteArtifact`), `src/store/public-store.ts:~646` (read `artifacts.site` when it is an object with `terrain`/`roads`/`structures`; ignore otherwise)
- Test: `packages/core/src/terrain/__tests__/site-artifact.test.ts`, `src/studio-v2/server/publish.test.ts`, `src/store/__tests__/public-store-site.test.ts`

**Interfaces — Produces:**
```ts
export interface SiteRoadSurface { id: string; polyline: Array<{ lat: number; lng: number }>; width: number; type: string; startHeightM: number; endHeightM: number }
export interface SiteArtifact {
  version: 1
  boundary: Array<{ lat: number; lng: number }>
  terrain: BakedTerrain | null
  roads: SiteRoadSurface[]
  structures: Array<Structure & { resolved: { startHeightM: number; endHeightM: number; path: Array<{ lat: number; lng: number }> } }>
  presets: StructurePreset[]                      // only presets used by structures
  buildings: Array<{ id: string; baseM: number }> // effective base heights
}
export function buildSiteArtifact(doc: CampusDocument): SiteArtifact | null   // null when no boundary
export function createSiteSurface(site: SiteArtifact): (p: { lat: number; lng: number }) => number   // baked terrain (bilinear) or 0, raised to a structure's top where p lies on one
```
Road heights: `typed` → existing `routing.startElevationMeters/endElevationMeters`; otherwise (`follow-surface`, the default) → `surfaceHeightAt` at both ends (flat 0 without terrain). The saved road is not modified.

- [ ] **Step 1: Write the failing tests**
  - `site-artifact.test.ts`: `createSiteSurface returns the stair top over a stair and the ground elsewhere`; `no boundary → null`; `terrain-free campus → terrain null, roads at 0 m`; `follow-surface road reads the stair top` (road end on a stair whose top is 18.34 m → endHeightM 18.34); `typed road keeps its heights`; `only used presets are included`.
  - `publish.test.ts`: `publish without terrain omits site` (artifacts blob deep-equals the pre-change blob for fixtureFull when the fixture has no boundary — assert `!('site' in blob)`); `publish with terrain adds site with baked terrain`.
  - `public-store-site.test.ts`: `bundle.site is set from artifacts.site`; `malformed site is ignored`.
- [ ] **Step 2–4:** Run → FAIL; implement; run → PASS; gates.
- [ ] **Step 5:** Commit `feat(publish): site artifact with baked terrain, road surfaces and structures`.

## Phase 2 — Terrain workspace

### Task 6: Terrain workspace route, lock, first visit, Done

**Files:**
- Create: `src/app/(admin)/studio/[id]/edit/terrain/page.tsx` (same loading pattern as `src/app/(admin)/studio/[id]/edit/page.tsx`: `loadMapData`, `EditorBridge`)
- Create: `src/components/terrain/TerrainWorkspace.tsx`, `TerrainTopBar.tsx`, `TerrainFirstVisit.tsx`, `useTerrainLock.ts`
- Create: `packages/editor/src/commands/terrain-handlers.ts`; Modify `packages/editor/src/commands/index.ts`
- Modify: `src/components/studio/StudioToolbar.tsx` (a **Terrain** button → `/studio/<id>/edit/terrain`)
- Test: `packages/editor/src/commands/__tests__/terrain-handlers.test.ts`, `src/components/terrain/__tests__/TerrainWorkspace.test.tsx`

**Interfaces — Produces (commands, same `MutationResult`/inverse pattern as `terrain-area-handlers.ts`):**
- `terrain.setup` `{ reference: TerrainReference; base?: TerrainBaseSource; colorRange?: {minM,maxM} }` — creates `doc.terrain` (grid from `gridOriginForBoundary(doc.boundary.points)`; fails without a boundary: "Draw the campus boundary first"); later calls update reference/base/colour range, never the grid.
- `terrain.apply-tiles` `{ tiles: Record<TileId, string | null> }` — sets/removes tiles; inverse restores previous values.
- `useTerrainLock(campusId)` → `{ status: 'held' | 'view-only' | 'acquiring'; holderName: string | null }` using the Save v2 zone client for zone `terrain`.
- Import dialog (first visit and later from the top bar): file pickers for `.glb` + frame GeoJSON or a contour GeoJSON; on a campus that already has changes it asks **Keep my changes / Clear my changes**; Clear dispatches `terrain.setup` and `terrain.apply-tiles` (all tiles → null) as one batch (one undo step). After import `colorRange` = min/max of the base over the grid.

- [ ] **Step 1: Write the failing tests**
  - `terrain-handlers.test.ts`: `setup without boundary fails with the message`; `setup creates grid at boundary south-west minus 20 m`; `second setup keeps the grid`; `apply-tiles inverse restores previous tiles and absence`.
  - `terrain-handlers.test.ts` also: `re-import with Clear removes all tiles in one undo step`; `re-import with Keep leaves tiles`.
  - `TerrainWorkspace.test.tsx`: `shows first-visit choices when doc.terrain is absent` (Import ground / Trace contours / Start flat); `view-only banner names the holder when the lock is held by another admin`; `Done saves then navigates back; a failed save keeps the user here with the message`.
- [ ] **Step 2–4:** FAIL → implement → PASS; gates incl. `node e2e/save-v2/run.mjs`.
- [ ] **Step 5:** Commit `feat(studio): terrain workspace route with lock, first visit and Done`.

### Task 7: Terrain rendering in Studio (views, exaggeration, mini 3D)

**Files:**
- Create: `src/lib/terrain/dem-protocol.ts`, `src/components/terrain/TerrainMap.tsx`, `src/components/terrain/TerrainMiniView.tsx`
- Test: `src/lib/terrain/__tests__/dem-protocol.test.ts`, `src/components/terrain/__tests__/TerrainMap.test.tsx`

**Interfaces — Produces:**
```ts
export function encodeDemTile(z: number, x: number, y: number, heightAt: (lat: number, lng: number) => number, size?: 256): Uint8ClampedArray   // mapbox RGB: v = round((h + 10000) * 10)
export function registerTerrainProtocol(scheme: string, getSampler: () => ((lat: number, lng: number) => number) | null): () => void  // returns unregister; PNG via OffscreenCanvas
export function invalidateTerrainTiles(map: maplibregl.Map, sourceId: string): void   // reloads only the source
```
TerrainMap: one MapLibre map with sources `terrain-dem` (`raster-dem`, `encoding: 'mapbox'`, tiles `navi-terrain://{z}/{x}/{y}`, maxzoom 17), layers `hillshade`, `color-relief` (Heights: `heightsColorStops`; Changes: a second protocol `navi-terrain-changes://` encoding `changeAt`, colours `CHANGES_COLOR_STOPS`), contour lines from a `navi-terrain` derived GeoJSON every 1 m (Contours view; label every 5 m). `terrain: { source: 'terrain-dem', exaggeration }` with exaggeration 1–5. TerrainMiniView: a second map sharing the protocol, pitch 60, drag/tilt/rotate; **Swap** exchanges which view is large; **Pop out** opens `window.open` with the same route and `?view=3d`.

- [ ] **Step 1: Write the failing tests**
  - `dem-protocol.test.ts`: `encodeDemTile` of a constant 12.34 m → every pixel decodes to 12.3 ± 0.1; `-10 m decodes back`.
  - `TerrainMap.test.tsx` (maplibre mocked as in existing map tests): `Heights view adds color-relief with heightsColorStops`; `Changes view switches the relief source`; `exaggeration slider sets terrain exaggeration`.
- [ ] **Step 2–4:** FAIL → implement → PASS; gates.
- [ ] **Step 5:** Commit `feat(studio): terrain views, exaggeration and live mini 3D`.

### Task 8: Brushes and strokes

**Files:**
- Create: `packages/core/src/terrain/brush.ts`, `src/components/terrain/TerrainToolRail.tsx`, `src/components/terrain/TerrainToolPanel.tsx`, `src/components/terrain/useTerrainStroke.ts`
- Test: `packages/core/src/terrain/__tests__/brush.test.ts`, `src/components/terrain/__tests__/useTerrainStroke.test.ts`

**Interfaces — Produces:**
```ts
export interface BrushSettings { shape: 'circle' | 'oval' | 'rectangle' | 'triangle'; rotationDeg: number; sizeM: number; aspect: number /* oval/rectangle */; profile: 'flat' | 'smooth' | 'linear' | 'hard'; strength: number /* 0.01..1 */; mode: 'raise' | 'lower' | 'set'; targetM?: number }
export function brushWeight(settings: BrushSettings, dx: number, dy: number): number   // 0..1 at offset from the brush centre
export function applyDab(tiles: Map<TileId, Int16Array>, sampler: TerrainSampler, at: { x: number; y: number }, s: BrushSettings, stepM: number): Set<TileId>  // returns touched tiles
export function smoothDab(tiles: Map<TileId, Int16Array>, sampler: TerrainSampler, at: { x: number; y: number }, s: BrushSettings): Set<TileId>   // moves each cell toward the 3×3 mean by strength·weight
export function flattenDab(tiles: Map<TileId, Int16Array>, sampler: TerrainSampler, at: { x: number; y: number }, s: BrushSettings): Set<TileId>  // like set, target = height under the stroke's first dab
```
Raise/lower add `±stepM · strength · weight` (stepM = 0.10 m per dab); `set` moves the final height toward `targetM` by `strength · weight` of the difference; changes are written as cm into tiles via `clampCm`. A stroke keeps a working `Map<TileId, Int16Array>`; on pointer-up it dispatches one `terrain.apply-tiles` with the touched tiles (one undo step). During the stroke only touched DEM tiles are invalidated. Shortcuts: `B`, `[`/`]` (size ±1 m, shift ±5 m), `Shift` opposite mode while held, `Alt`+click picks `targetM`, `Ctrl+Z/Ctrl+Y`, `Ctrl+S`. Outside the grid the cursor outline turns grey and dabs are ignored.

- [ ] **Step 1: Write the failing tests**
  - `brush.test.ts`: `circle hard weight is 1 inside and 0 outside`; `rotated rectangle weight follows rotation`; `raise stroke clamps at Int16 max` (500 dabs at +10 m on a 300 m cell → 32767); `lower then raise by the same amount returns to 0`; `set moves toward target`; `smooth reduces a spike`.
  - `useTerrainStroke.test.ts`: `one stroke dispatches exactly one terrain.apply-tiles`; `outside-grid dabs are ignored`.
- [ ] **Step 2–4:** FAIL → implement → PASS; gates.
- [ ] **Step 5:** Commit `feat(studio): terrain brushes with shapes, profiles and modes`.

### Task 9: Lasso, slope, height picker, reset, contour pen, boundary edit

**Files:**
- Create: `packages/core/src/terrain/area-ops.ts`, `src/components/terrain/tools/LassoTool.tsx`, `SlopeTool.tsx`, `ContourPenTool.tsx`, `ResetTool.tsx`
- Modify: `src/components/studio/CampusBoundary.tsx` (shared **Edit boundary**), `packages/editor/src/commands/boundary-handlers.ts` (boundary change keeps hidden ground: no tile deletion)
- Test: `packages/core/src/terrain/__tests__/area-ops.test.ts`, `packages/editor/src/commands/__tests__/boundary-terrain.test.ts`

**Interfaces — Produces:**
```ts
export function lassoOp(tiles: Map<TileId, Int16Array>, sampler: TerrainSampler, polygon: Array<{ x: number; y: number }>, op: { kind: 'set' | 'raise-by' | 'lower-by'; meters: number }): Set<TileId>
export function slopeOp(tiles, sampler, from: { x: number; y: number; h: number }, to: { x: number; y: number; h: number }, widthM: number): Set<TileId>
export function resetOp(tiles, polygon): Set<TileId>   // removes changes inside → tiles with all-zero cells are dropped
export function contoursToBase(lines: TerrainBaseSource & { kind: 'contours' }): TerrainBaseSource   // identity wrapper used by "Generate surface"
```
Contour pen draws lines with an elevation; **Generate surface** dispatches `terrain.setup { base: contours }`. Boundary growth adds no tiles (new area reads base or 0); shrinking keeps tiles; the bake uses the current boundary.

**Tracing image (local only):** `src/components/terrain/TracingImageLayer.tsx` — pick an image, place it with 2 corner handles and opacity; stored only in the browser through `src/studio-v2/client/local-reference-store.ts` (key `terrain-tracing:<campusId>`), never in the document or a part. Layers panel (`src/components/terrain/TerrainLayersPanel.tsx`): show/hide buildings, roads and paths, structures, contour lines, tracing image.

- [ ] **Step 1: Write the failing tests** — `lasso set flattens inside only`; `raise-by adds exactly N cm inside`; `slope interpolates linearly along the line`; `reset drops all-zero tiles`; `shrinking the boundary keeps tiles`; `tracing image never enters the document or parts` (after placing one, `splitDocument(doc).parts` contains no key or content mentioning it).
- [ ] **Step 2–4:** FAIL → implement → PASS; gates.
- [ ] **Step 5:** Commit `feat(studio): lasso, slope, reset, contour pen and boundary edit for terrain`.

## Phase 3 — Buildings on the terrain

### Task 10: Follow ground, pads, solid floor slabs, cut away above

**Files:**
- Create: `src/components/terrain/BuildingGroundPanel.tsx`, `src/components/terrain/layers/BuildingSlabsLayer.tsx`
- Create: `packages/editor/src/commands/building-ground-handlers.ts`; Modify `packages/editor/src/commands/index.ts`
- Modify: `src/components/terrain/TerrainFirstVisit.tsx` (after import: "Set all buildings to follow the ground" ticked by default)
- Test: `packages/editor/src/commands/__tests__/building-ground-handlers.test.ts`, `src/components/terrain/__tests__/BuildingSlabsLayer.test.ts`

**Interfaces:**
- Consumes: `effectiveBuildingBase`, `createTerrainSampler` (Task 4).
- Panel: Base mode (Follow ground / Fixed), typed base, **Snap to ground**, pad mode + blend; in 3D a vertical drag handle on a selected Fixed building changes its base (one command on release).
- Produces: command `building.set-ground { buildingId, baseMode, baseElevation?, pad? }` (zone `building:<id>`); `buildSlabFeatures(doc, sampler, opts: { cutAboveFloorId?: string }): GeoJSON.FeatureCollection` — one opaque slab per floor, `base = floorTop − 0.25 − groundAtCentroid`, `top = floorTop − groundAtCentroid` (MapLibre lifts fill-extrusions by the ground at the centroid; ground floor `base = 0` sinks into the ground, which is wanted), floors above `cutAboveFloorId` omitted.

- [ ] **Step 1: Write the failing tests** — `follow-ground base equals the mean under the outline`; `set-ground fixed keeps the typed base`; `import offer sets follow-ground on all non-fixed buildings in one undo step`; `slab heights subtract ground at centroid`; `cut away omits higher floors`.
- [ ] **Step 2–4:** FAIL → implement → PASS; gates.
- [ ] **Step 5:** Commit `feat(studio): buildings follow the ground with pads and solid floor slabs`.

## Phase 4 — Outdoor stairs and roads as surfaces

### Task 11: Stair shape and mesh (pure)

**Files:**
- Create: `packages/core/src/structures/stair-shape.ts`, `packages/core/src/structures/path.ts`, `packages/core/src/structures/mesh.ts`, `packages/core/src/structures/materials.ts`
- Test: `packages/core/src/structures/__tests__/stair-shape.test.ts`, `path.test.ts`, `mesh.test.ts`

**Interfaces — Produces:**
```ts
export function stairShape(riseM: number, runM: number, flight?: { startT: number; endT: number }): { steps: number; riserM: number; treadM: number; flightStartM: number; flightEndM: number; hint: string | null }
// steps = max(1, round(|rise|/0.175)); tread = min(0.30, run/steps); flight centred unless given;
// hint = `needs ${(steps*0.30).toFixed(1)} m, drawn ${run.toFixed(1)} m` when run < steps*0.30; rise 0 → steps 0, hint null
export function structurePath(start: {x:number;y:number}, end: {x:number;y:number}, bend?: {x:number;y:number}): { at(s: number): { p: {x:number;y:number}; n: {x:number;y:number} }; length: number }  // quadratic Bézier, arc-length parameterised (400 samples)
export interface MeshInput { path: ReturnType<typeof structurePath>; startH: number; endH: number; form: StructureForm; width: number; underneath: 'open' | 'solid'; railings: Structure['railings']; flight?: Structure['flight']; landings?: number[]; groundAt(x: number, y: number): number; look: StructurePreset['look']; materials: Record<string, StructureMaterial> }
export function buildStructureMesh(input: MeshInput): Float32Array   // interleaved pos3 nrm3 col3, local metres (x east, y north, z absolute m)
export const BUILT_IN_MATERIALS: Record<string, StructureMaterial>   // concrete #c9c4ba, concrete-dark #a9a397, concrete-side #9d978b, concrete-under #8c867a, painted-green #2f6b3a, painted-black #1f2937, wood #a16207, tile-red #b45309, brick #9a3412, steel #94a3b8
export const BUILT_IN_PRESETS: StructurePreset[]                      // 'plain-stair', 'hillside-stair' (width 4.5, solid), 'open-steel-stair' (open, steel), 'plain-ramp'
```
Mesh (stairs), from the verified test: breakpoints every 0.25 m plus every tread edge; per slice a tread quad at the step height, side quads from the tread down to the bottom line, and (open only) an underside quad; bottom line = `slopeLine(s) − riser − 0.20` (open) or `groundAt − 0.4` per corner (solid); risers at each tread edge; landings flat at start/end heights outside the flight; railings on the chosen sides: posts every `length / round(length/1.2)` from the tread to `slopeLine + 0.95`, top rail tube at `slopeLine + 0.95`, mid rail at `slopeLine + 0.45`, rails following `slopeLine(s)` (linear over the flight, flat on landings).

- [ ] **Step 1: Write the failing tests**
  - `stair-shape.test.ts`: `3.5 m rise over 6 m → 20 steps, riser 0.175, tread 0.30, flight centred`; `stairShape handles zero rise and short runs` (rise 0 → steps 0; rise 0.05 → 1 step; run 2 m for 20 steps → tread 0.10 and hint "needs 6.0 m, drawn 2.0 m"; run 0 → no NaN).
  - `path.test.ts`: `straight path length equals distance`; `bend keeps endpoints fixed`.
  - `mesh.test.ts`: `vertex count is a multiple of 3 and all values are finite`; `open stair underside is a straight line` (all underside z values lie on one line ±1 mm over the flight); `rails follow the slope line` (top-rail z − slopeLine ≡ 0.95 ± 1 mm); `solid stair has no underside quads`.
- [ ] **Step 2–4:** FAIL → implement → PASS; gates.
- [ ] **Step 5:** Commit `feat(core): stair shape maths and structure mesh builder`.

### Task 12: Mesh layer and the stretch-block stair tool in Studio

**Files:**
- Create: `src/lib/three-d/mesh-layer.ts`, `src/components/terrain/tools/StructureTool.tsx`, `src/components/terrain/StructurePanel.tsx`, `src/components/terrain/StructureHandles.tsx`
- Create: `packages/editor/src/commands/structure-handlers.ts` (`structure.create|update|delete`, `structure-preset.create|update|delete`); Modify `index.ts`
- Test: `src/lib/three-d/__tests__/mesh-layer.test.ts`, `packages/editor/src/commands/__tests__/structure-handlers.test.ts`, `src/components/terrain/__tests__/StructureTool.test.tsx`

**Interfaces — Produces:**
```ts
export function createMeshLayer(id: string, origin: { lat: number; lng: number }): maplibregl.CustomLayerInterface & { setMesh(mesh: Float32Array): void }
// model matrix = mainMatrix × translate(O.x,O.y,O.z) × scale(s,−s,s), s = MercatorCoordinate.meterInMercatorCoordinateUnits() at origin; computed in Float64 then uploaded as Float32 (verified approach)
export function projectAtHeight(map: maplibregl.Map, p: { lat: number; lng: number }, heightM: number): { x: number; y: number }   // screen position of a 3D point, for handles
export function snapStructureEnd(doc: CampusDocument, sampler: TerrainSampler, screen: { x: number; y: number }, map: maplibregl.Map, floorId: string | null): StructureEnd   // slab edge within 14 px → slab; road within 14 px → road; else ground
export function resolveStructureEnds(doc: CampusDocument, sampler: TerrainSampler, s: Structure): { start: { x: number; y: number; h: number }; end: { x: number; y: number; h: number } }
```
Tool flow (spec §4): click places a 3 m block on the ground; drag the **start** handle onto a slab edge (floor picked in the panel, default the highest floor whose height is within 0.5 m of the drag or the selected floor) → `StructureEnd.slab`; drag the **end** onto a road/ground; drag the **bend** handle; drag the flight start/end markers. Handles are HTML overlays positioned by `projectAtHeight` each render (fixes "handles sit on the ground"). Panel: form, preset (Swap keeps ends), width, underneath, railings, look per part + railing style, readout (steps, riser, tread, flight, hint). **Save as preset** creates a `structure-preset`. Commands are free-zone; edits during a drag apply on pointer-up (one undo step).

- [ ] **Step 1: Write the failing tests**
  - `mesh-layer.test.ts` (fake GL): `setMesh before onAdd uploads on add`; `vertex count = length/9`.
  - `structure-handlers.test.ts`: `create rejects width outside 0.6–10`; `swap preset keeps start, end and bend`; `delete inverse restores`.
  - `StructureTool.test.tsx`: `start snaps to slab edge within 14 px`; `end snaps to road within 14 px else ground`; `one drag = one command`; `building move → resolveStructureEnds follows the slab`; `deleted building → start keeps last height and shows the marker`.
- [ ] **Step 2–4:** FAIL → implement → PASS; gates incl. browser probe.
- [ ] **Step 5:** Commit `feat(studio): outdoor stairs with stretch block, presets and materials`.

### Task 13: Roads as surfaces; road height mode

**Files:**
- Create: `src/components/terrain/layers/RoadSurfaceLayer.tsx`, `packages/core/src/terrain/road-surface.ts`
- Modify: `packages/editor/src/panels/properties/road-routing-fields.tsx` — add **Height: Follow ground / Typed** (test file `road-routing-props.test.tsx` beside it)
- Test: `packages/core/src/terrain/__tests__/road-surface.test.ts`, `src/components/terrain/__tests__/RoadSurfaceLayer.test.ts`

**Interfaces — Produces:**
```ts
export function roadSurfacePolygons(roads: SiteRoadSurface[]): GeoJSON.FeatureCollection   // polygon per road at its width (offset both sides, round joins approximated by miter limit 2)
```
Studio 3D and NAVI Web draw these as `fill` layers (MapLibre drapes fills on terrain). Typed mode shows the two existing elevation inputs; Follow ground hides them and shows the computed heights read-only.

- [ ] **Step 1: Tests** — `road polygon width equals road width ±1 cm at a straight segment`; `follow-surface is the default when heightMode is absent`; `typed keeps existing values`.
- [ ] **Step 2–4:** FAIL → implement → PASS; gates.
- [ ] **Step 5:** Commit `feat(studio): roads drawn as surfaces on the terrain with a height mode`.

## Phase 5 — Ramps

### Task 14: Ramps

**Files:**
- Modify: `packages/core/src/structures/mesh.ts` (form `ramp`), create `packages/core/src/structures/ramp-shape.ts`, modify `StructurePanel.tsx`, `StructureTool.tsx` (landing markers for ramps)
- Test: `packages/core/src/structures/__tests__/ramp-shape.test.ts`, extend `mesh.test.ts`

**Interfaces — Produces:**
```ts
export function rampShape(riseM: number, runM: number, landings: number[]): { slopeRatio: number | null /* N in 1:N, null when level */; runsBetweenLandingsM: number[]; landingLengthM: 1.5 }
```
Mesh: top surface follows a slope line that is flat over each 1.5 m landing (centred at the fraction given) and linear between; open underside parallel 0.20 m below; railings as for stairs. Panel shows `1:N` and each run length; no pass/fail mark (ledger the BP 344 open item).

- [ ] **Step 1: Tests** — `1 m over 12 m → 1:12`; `landing at 0.5 splits the run into two equal runs minus 1.5 m`; `ramp top surface is level across a landing`; `zero rise → slopeRatio null`.
- [ ] **Step 2–4:** FAIL → implement → PASS; gates.
- [ ] **Step 5:** Commit `feat(studio): ramps with user-placed landings and slope readout`.

## Phase 6 — NAVI Web

### Task 15: Campus-only terrain map in NAVI Web

**Files:**
- Modify: `src/components/map/NavigationMap.tsx` (prop `site?: SiteArtifact`; when present the style is a blank style with background `#e9eee6` instead of `OSM_STYLE`, `maxBounds` = boundary bbox + 50 m, `minZoom` = the zoom `map.cameraForBounds(boundary bbox)` returns at load)
- Create: `src/components/map/site/SiteGroundLayers.tsx` (DEM from `site.terrain` via `registerTerrainProtocol('navi-site', …)`, hillshade, ground fill `#dfe8d8` clipped to the boundary, optional contours every 5 m), `SiteRoadLayer.tsx` (`roadSurfacePolygons`), `SiteStructuresLayer.tsx` (`createMeshLayer` + `buildStructureMesh` with `resolved` heights), `SiteBuildingSlabs.tsx` (3D only)
- Modify: `src/components/public/ExploreMap.tsx` (pass `bundle.site`; mount the site layers; 2D default, a **3D** toggle sets pitch 60 and enables `terrain`; in 2D the route stays `RouteLine`; in 3D `RouteLine` is hidden and the route is drawn as a ribbon in the mesh layer at `createSiteSurface(site)` + 0.05 m, so on stairs and ramps it follows their surface)
- Create: `packages/core/src/structures/route-ribbon.ts` — `buildRouteRibbon(path: Array<{lat:number;lng:number}>, surfaceAt: (p) => number, origin: {lat:number;lng:number}, widthM = 0.6, color = '#2563eb'): Float32Array` (samples every 0.5 m)
- Modify: `src/components/studio/MapPreview.tsx` — mount the same site layers with `buildSiteArtifact(doc)` so Studio's preview shows what visitors see
- Test: `src/components/map/site/__tests__/SiteGroundLayers.test.tsx`, `src/components/public/__tests__/ExploreMap.site.test.tsx`, `packages/core/src/structures/__tests__/route-ribbon.test.ts`

**Interfaces — Consumes:** `SiteArtifact` (Task 5), `registerTerrainProtocol` (Task 7), `roadSurfacePolygons` (Task 13), `createMeshLayer`/`buildStructureMesh` (Tasks 11–12), `buildSlabFeatures` (Task 10).

- [ ] **Step 1: Tests** — `route ribbon z equals the stair surface + 0.05 m on a stair` (route-ribbon.test); `MapPreview mounts the site layers for a campus with a boundary`; `with site: no OSM source is added and maxBounds is set`; `without site.terrain: flat ground, still campus only`; `3D toggle enables terrain and pitch 60`; `contours toggle adds and removes the contour layer`; `structures layer gets one mesh per structure`.
- [ ] **Step 2–4:** FAIL → implement → PASS; gates.
- [ ] **Step 5:** Commit `feat(web): campus-only map with terrain, road surfaces, stairs and ramps`.

## Phase 7 — Acceptance

### Task 16: End-to-end acceptance with the ASU-Ibajay data; cloud gate

**Files:**
- Create: `e2e/save-v2/terrain.spec.ts` (registered in `e2e/save-v2/run.mjs`)

- [ ] **Step 1:** Write the spec: open a seeded campus with a boundary; Terrain → Import ground with the fixture `.glb` + frame; heights range ≈ 1.8–35.5 m shown; raise brush stroke → Changes view shows red; set all buildings to follow ground; Connect a stair from 3F of a building to a road; Done (save "Saved · #N"); Publish (confirm warnings); open `/map/explore` → no OSM requests, terrain source present, one structure mesh; reload Studio → tiles, stair and building ground settings identical.
- [ ] **Step 2:** Run `node e2e/save-v2/run.mjs terrain` → PASS; full probe 20/20 + terrain.
- [ ] **Step 3:** Run every gate. Commit `test(e2e): terrain, stairs and campus-only map acceptance`.
- [ ] **Step 4 ⛔:** Ask the owner to approve applying `20261103000000_studio_v2_structures.sql` to `navi-studio-v2` (`ztbnicoiwjghzttchqmp`). Only on a yes: apply, verify the schema fingerprint matches local, deploy a preview with `bash scripts/save-v2/deploy-preview.sh`, and ask the owner to check `https://navi-next-savev2-navi01.vercel.app`.

---

## Execution notes

- Ledger: `.superpowers/sdd/terrain/progress.md`, first line `# SDD ledger — plan: docs/superpowers/plans/2026-11-02-navi-terrain-2.5d-stairs-ramps.md`.
- Stop for owner review after Task 5 (data + publish), Task 10 (workspace + buildings), Task 14 (stairs + ramps), and at Task 16 Step 4.
- Performance targets (measure, ledger the numbers): a brush dab updates within one frame (≤ 16 ms) on a 600 m × 400 m campus; a 55 m stair mesh rebuild ≤ 5 ms; publish bake of ASU-Ibajay ≤ 2 s.
