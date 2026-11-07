# Smooth terrain sculpting and blended import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (owner rule: no subagents, inline). Steps use
> checkbox (`- [ ]`) syntax. **Task 0 ends in a STOP for the owner's decision.**

**Goal:** Sculpting moves the ground every frame without freezes on ASU-IBAJAY (29 padded buildings + TopoExport), and
an imported TopoExport ground blends into the flat surroundings.

**Architecture:** A fit index makes height lookups cheap; an in-memory height field (final ground + edits, 1 m grid)
answers lookups and is updated by rectangle; the brush runs once per animation frame; the 3D preview is rebuilt per
32 m chunk; a Web Worker builds elevation tiles and contours from a copy of the field and only changed tiles are
refreshed. The import gets an optional `importBlend` (shift to 0 m + edge ease-out).

**Tech Stack:** TypeScript, `@navi/core`, React 19 / Next 16, MapLibre GL 5.24 (`map.refreshTiles`), Web Workers,
vitest, Playwright lane `e2e/save-v2`.

**Spec:** `docs/superpowers/specs/2026-11-07-navi-terrain-smooth-editing-and-import-blend.md`
(evidence: `docs/testing/2026-11-07-terrain-lag-investigation.md`).

## Global Constraints

- Targets (spec, exact): lookup ≤ 1 µs with 29 pads (Node); held 2 s stroke: no main-thread task > 50 ms, brush work
  ≤ 4 ms per frame; release: no task > 50 ms; 3D on: full picture ≤ 1 s, no task > 100 ms.
- Raise/Lower rate stays `RAISE_RATE_M_PER_S = 1.5` (full strength, brush centre), dragging or holding.
- `importBlend` defaults: `zeroM` = lowest imported base inside the boundary; `edgeM` = 40 (slider 10–100); curve
  smoothstep. Inside the boundary only the shift applies (true slopes).
- Import copy: checkbox "Blend into the surroundings"; inputs "0 m height (m above sea level)", "Edge blend (m)";
  reference `{ name: 'Campus ground (from TopoExport)', zeroMeaning: '0 m = <zeroM, 1 decimal> m above sea level' }`.
- No SharedArrayBuffer; no server/database change; Dev Supabase untouched; nothing pushed.
- Gates before every commit: `bash .superpowers/sdd/2026-11-02-navi-terrain-2.5d-stairs-ramps/gates.sh` (regressed 0;
  tsc 1122 / 1122 / clean folders 0); `git checkout -- demo-output packages/compiler/src/__tests__/__snapshots__` after
  test runs. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A stroke cancelled with Esc after the field was updated in place → the field and preview return exactly to the
   committed ground (Task 5/7 tests).
2. Undo/redo of a stroke and of a non-tile command (boundary, building ground) → the field matches a fresh rebuild
   (Task 5 test compares field vs composer at sample points).
3. A building whose follow-ground base changes because a stroke touched its footprint → its pad updates in the
   field too, also for cells outside the stroke rectangle but inside that pad (Task 4 test).
4. Worker not available or failing (old browser, CSP) → tiles still come from the main thread (slower, correct)
   (Task 8 test).
5. A campus with no import (flat start / contours base) or without a boundary → no blend, no crash (Task 2 test).

---

### Task 0: Prototype gate (throwaway) — STOP for the owner

**Branch:** `spike/terrain-height-field` from `feat/terrain-2.5d` HEAD, worktree under `.navi-worktrees/`; never merged.
**Fixture to keep (committed to `feat/terrain-2.5d` later in Task 1):** `packages/core/src/terrain/__tests__/fixtures/ibajay-campus.json`
(boundary + 29 footprints, from navi-studio-v2, read-only).

- [ ] **Step 1:** Node benchmark (vitest file in the spike) on the fixture + TopoExport: lookup cost with a fit index
  (bounding-box test), height-field build time, 30 m brush rectangle update time, chunk mesh rebuild time, elevation
  tile from the field. Record numbers.
- [ ] **Step 2:** Browser: on the spike branch wire the minimum (field-backed lookups, frame brush, chunked preview,
  one module worker building DEM tiles, `map.refreshTiles` on release) into the terrain route; measure with a
  Playwright probe on the local lane (held 2 s stroke long tasks; release long tasks; 3D-on time). Confirm module
  workers load under `next dev` (Turbopack) and in `next build`.
- [ ] **Step 3:** Blend demo: apply `zeroM` = lowest point, `edgeM` = 40 to the TopoExport base on the spike; deploy
  the spike as its own preview deployment (its deployment URL only — the `navi-next-savev2-navi01` alias stays on
  `feat/terrain-2.5d`, so the deploy script's alias step is skipped for the spike); screenshots in 2D and 3D.
- [ ] **Step 4:** STOP. Report numbers vs targets and the screenshots + preview link to the owner. Owner decides:
  (a) blend OK → continue with all tasks; (b) blend awful → skip Tasks 2–3 (manual raise), continue the rest;
  (c) a speed target missed → stop, return to options. Ledger the decision verbatim.

### Task 1: Fit index (pads and roads)

**Files:** Modify `packages/core/src/terrain/compose.ts`; create `packages/core/src/terrain/__tests__/compose-fit-index.test.ts`;
add fixture `packages/core/src/terrain/__tests__/fixtures/ibajay-campus.json`; create `packages/core/src/terrain/__tests__/perf.test.ts`.

**Interfaces:** Produces: `createTerrainSampler` unchanged signature/results; internally each `PadEntry`/`RoadEntry`
gains `box: { minX; minY; maxX; maxY }` (ring/line bbox grown by `fit.blendMeters` + half width); `fitAt` skips entries
whose box does not contain the point. Exported helper for later tasks:
`fitsTouching(sampler: TerrainSampler, rect: Rect): Rect` — the union of `rect` and the boxes of fits/building
footprints it touches (used for ripple). `type Rect = { minX: number; minY: number; maxX: number; maxY: number }`
exported from `packages/core/src/terrain/types.ts`.

- [ ] Step 1 (RED): `compose-fit-index.test.ts` — `results equal the unindexed composer at 2 000 random points` (keep a
  copy of today's `fitAt` as a test-local reference); `fitsTouching grows a rect to the pad boxes it touches`.
  `perf.test.ts` — `heightAt with the 29 ASU-IBAJAY pads costs ≤ 1 µs` (average over 200 000 calls; skipped unless
  `PERF=1` so CI noise does not fail normal runs; the lane script sets it).
- [ ] Step 2: run `npx vitest run packages/core/src/terrain/__tests__/compose-fit-index.test.ts` — Expected: FAIL.
- [ ] Step 3: implement; Step 4: tests PASS and `PERF=1 npx vitest run packages/core/src/terrain/__tests__/perf.test.ts` PASS.
- [ ] Step 5: gates; commit `perf(terrain): fit index — lookups skip far pads and roads`.

### Task 2: Blended import (core) — skip if the owner chose (b)

**Files:** `packages/core/src/terrain/types.ts` (`CampusTerrain.importBlend?: { zeroM: number; edgeM: number }`),
`packages/core/src/terrain/compose.ts` (blended base), `packages/editor/src/commands/terrain-handlers.ts`
(`terrain.setup` accepts/validates `importBlend`: finite `zeroM`, `edgeM` in 10–100), `packages/core/src/terrain/base-surface.ts`
(`lowestBaseInside(source, grid, boundaryLocal): number`); tests in `compose.test.ts`, `terrain-handlers` tests, `bake` test.

**Interfaces:** `blendedBaseAt(raw: number, distanceOutsideM: number, blend): number` =
`(raw − zeroM) · (1 − smoothstep(0, edgeM, distanceOutsideM))`, `distanceOutsideM` = 0 inside the boundary.

- [ ] Step 1 (RED): `inside the boundary heights shift by zeroM (slopes kept)`; `edgeM outside the boundary the ground is 0 m`;
  `half way out it is smoothstep-blended`; `no boundary or no importBlend: unchanged`; `bake uses the blend`;
  `terrain.setup rejects edgeM 5 and NaN zeroM`; `lowestBaseInside finds the minimum inside the boundary`.
- [ ] Steps 2–4: RED → implement → GREEN (`npx vitest run packages/core/src/terrain packages/editor/src/commands`).
- [ ] Step 5: gates; commit `feat(terrain): blended import base (importBlend)`.

### Task 3: Import panel blend options — skip if (b)

**Files:** `src/components/terrain/TerrainImportPanel.tsx`, its test.
- [ ] Step 1 (RED): `blend is on by default and 0 m height is prefilled with the lowest point`; `the import payload carries
  importBlend and the Global Constraints reference copy`; `unticking blend sends no importBlend and the sea-level reference`;
  `edge blend slider is limited to 10–100`.
- [ ] Steps 2–4: RED → implement (compute the lowest point after reading the files, before Import) → GREEN.
- [ ] Step 5: gates; commit `feat(terrain): import panel — blend into the surroundings`.

### Task 4: Height field (core)

**Files:** create `packages/core/src/terrain/height-field.ts` (+ export from `index.ts`), `__tests__/height-field.test.ts`, perf cases in `perf.test.ts`.

**Interfaces:**
```ts
export interface HeightField {
  readonly grid: TerrainGrid
  readonly area: { x0: number; y0: number; cols: number; rows: number }  // 1 m cells, local metres
  readonly heights: Float32Array   // final ground
  readonly changes: Float32Array   // edits only (metres)
  heightAt(x: number, y: number): number   // bilinear; outside the area: the composer
  changeAt(x: number, y: number): number
  update(doc: CampusDocument, rect: Rect, tilesOverride?: Map<TileId, Int16Array>): Rect  // returns the rect actually rewritten (with pad/base ripple)
  snapshot(rect: Rect): { rect: Rect; heights: Float32Array; changes: Float32Array }      // copies for the worker
}
export function createHeightField(doc: CampusDocument, opts?: { marginM?: number }): HeightField | null
```
Area = boundary box + max(`GRID_MARGIN_METERS`, `importBlend.edgeM`) + `marginM` (default 20).

- [ ] Step 1 (RED): `matches the composer at every cell after create`; `update(rect) after a tile change matches a fresh
  build`; `a stroke over part of a follow-ground building updates its whole pad (ripple)`; `update with tilesOverride then
  without restores exactly (cancel)`; perf (PERF=1): `build ≤ 400 ms`, `30 m brush update ≤ 2 ms`.
- [ ] Steps 2–4: RED → implement → GREEN.
- [ ] Step 5: gates; commit `feat(terrain): height field with rectangle updates`.

### Task 5: Studio reads the height field

**Files:** `src/lib/terrain/use-terrain-sampler.ts` (field-backed sampler: `heightAt/changeAt/groundAt` from the field;
`markTerrainDirty(rect)` → `field.update`; unmarked or `'all'` → rebuild), `TerrainWorkspaceRoute.tsx` (marks tile
commands by their tiles' rect, as today), tests `use-terrain-sampler.test.tsx`.
- [ ] Step 1 (RED): `a tile command updates only its rect`; `undo of a stroke matches a fresh build`; `a non-tile command
  (boundary.set, building.set-ground) rebuilds`; `the sampler identity stays the same across rect updates` (no React
  re-creation storms).
- [ ] Steps 2–4; Step 5: gates; commit `perf(terrain): Studio reads the height field`.

### Task 6: Frame-based brush

**Files:** `src/lib/terrain/terrain-stroke.ts` (`dab(p, seconds)` replaces the injected clock), `src/components/terrain/useTerrainStroke.ts`
(pointer moves only record the latest point; a `requestAnimationFrame` loop places dabs along the path every
`max(0.5, sizeM/4)` m and splits the frame's time between them, capped at 0.25 s per frame; the 80 ms interval is removed),
tests in both.
- [ ] Step 1 (RED): `a 1 s hold at 60 fps raises ~1.5 m at full strength`; `a 1 s drag over a point raises it in proportion
  to the time the brush covered it`; `a slow frame (200 ms) never applies more than 0.25 s`; `mouseup applies the pending
  path then dispatches once`; existing stroke tests keep passing.
- [ ] Steps 2–4; Step 5: gates; commit `feat(terrain): brush runs once per frame`.

### Task 7: Chunked preview

**Files:** `src/lib/three-d/mesh-layer.ts` (`setChunk(key: string, mesh: Float32Array)`, `clearChunks()`; draws all chunks),
`src/lib/three-d/terrain-preview.ts` (32 m chunks from the field; rebuild chunks touched by the frame's rect; skip cells
equal to the stroke-start copy), tests.
- [ ] Step 1 (RED): `one frame rebuilds only touched chunks`; `cells unchanged since the stroke start are not drawn`;
  `cancel clears all chunks`; perf (PERF=1): `a 30 m brush frame rebuild ≤ 3 ms`.
- [ ] Steps 2–4; Step 5: gates; commit `perf(terrain): chunked paint preview`.

### Task 8: Worker for tiles and contours; refresh only changed tiles

**Files:** create `src/lib/terrain/terrain-worker.ts` (module worker: `init`, `patch`, `tile`, `contours`), `src/lib/terrain/terrain-worker-client.ts`
(promise API, fallback to main thread when `Worker` is missing or errors), modify `dem-protocol.ts` (`registerTerrainProtocol`
asks the client), `use-terrain-sampler.ts` (send `field.snapshot(rect)` on update), `TerrainMap.tsx` (on a rect update
`map.refreshTiles(id, tilesIn(rect))` for the four DEM sources instead of `setTiles` with a new version; contours from
the worker), tests.
- [ ] Step 1 (RED): `tilesIn(rect) lists the z/x/y of loaded tiles overlapping the rect`; `the client falls back to the main
  thread when the worker fails` (fake Worker that throws); `a patch then a tile request returns the patched heights`
  (worker logic tested as plain functions in `terrain-worker-core.ts`).
- [ ] Steps 2–4; Step 5: gates; commit `perf(terrain): tiles and contours in a worker; refresh only changed tiles`.

### Task 9: Browser performance test, lane, preview, owner test

**Files:** `e2e/save-v2/terrain.spec.ts` — new `T14 — performance on ASU-IBAJAY` (seed the fixture campus with the
TopoExport import and follow-ground pads; PerformanceObserver long tasks; held 2 s stroke; release; 3D on) asserting the
Global Constraints targets; plus the full lane.
- [ ] Step 1: write T14, run `node e2e/save-v2/run.mjs -g "T14"` — Expected PASS (any failure → systematic-debugging).
- [ ] Step 2: full lane `node e2e/save-v2/run.mjs` (background) — Expected all pass.
- [ ] Step 3: gates; progress notes; commit `test(terrain): performance targets on the ASU-IBAJAY copy`.
- [ ] Step 4: deploy the preview (`bash scripts/save-v2/deploy-preview.sh`); owner tests (re-import with blend).
