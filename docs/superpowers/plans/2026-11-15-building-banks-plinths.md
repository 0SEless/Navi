# Buildings Meet the Hill: Banks and Plinths — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat 2.5 m shelf and cliffs around buildings with an uphill walkway + automatic bank and a downhill plinth, in Studio and NAVI Web; make stairs and ramps attach flush to buildings and road edges; show NAVI Web's 2.5D floors in the terrain editor so both views match (owner 2026-11-15).

**Architecture:** A per-building "ground around" setting resolved in `@navi/core` (old `pad` values map to it). The terrain sampler's fit step computes, per point, the building contribution order-independently (deepest cut / highest fill across buildings, inside-outline always wins). Plinths are drawn, not sculpted: a shared core function makes thin wall pieces that MapLibre extrudes from the ground outside up to the floor.

**Tech Stack:** TypeScript, vitest (serial, memory-limited), MapLibre fill-extrusion, React 19.

**Spec:** `docs/superpowers/specs/2026-11-15-building-banks-plinths-design.md`

## Global Constraints

- Inside every building outline the ground is at floor height (owner rule, unchanged).
- Walkway 1 m at floor height; bank slopes: Gentle 1 in 3 (1/3), Normal 1 in 2 (1/2, default), Steep 1 in 1 (1).
- Bank reach capped at 30 m from the walls.
- Floor height rule unchanged (Fixed / Follow the ground = average under the outline).
- A graded road wins on its own surface; ungraded roads follow the bank.
- No DB migration; nothing saved without the owner pressing Done; no commits without owner approval.
- Live check only on the QA map (CODEX TEST map-map-1-375k); never ASU, never Done. No scratch files under `src/` while port 3001 runs.

## Review Focus

1. Two buildings whose banks overlap: no seam or step where one bank ends and the other begins (order-independent min).
2. A building on flat ground: no bank, no plinth, nothing changes outside the outline.
3. A follow-the-ground building whose average sits above every edge (fully downhill on all sides): plinths all round, no fill.
4. A building with fewer than 3 outline points or a zero-length wall: no crash, no plinth piece.
5. A graded road running inside a bank: the road surface stays level across (road wins on its surface).

---

### Task 1: Ground-around setting in core

**Files:** Modify `packages/core/src/types/entities.ts` (Building.ground), Create `packages/core/src/terrain/ground-around.ts`, export from `packages/core/src/terrain/index.ts`. Test: `packages/core/src/terrain/__tests__/ground-around.test.ts`.

**Interfaces — Produces:**
- `Building.ground?: { baseMode; pad: GroundFit; around?: GroundAround; bankSlope?: BankSlope }`
- `type GroundAround = 'bank' | 'slopes' | 'leave'`; `type BankSlope = 'gentle' | 'normal' | 'steep'`
- `BANK_SLOPES: Record<BankSlope, number>` = `{ gentle: 1/3, normal: 0.5, steep: 1 }`; `WALKWAY_M = 1`; `BANK_REACH_M = 30`
- `groundAroundOf(building: Building): { around: GroundAround; slope: number }`

- [ ] Test: missing ground / any old `pad` value (off, raise, lower, both) → `{ around: 'bank', slope: 0.5 }`; `around: 'slopes', bankSlope: 'gentle'` → `{ around: 'slopes', slope: 1/3 }`; unknown strings → bank/normal.
- [ ] Run, see it fail (module missing). Implement. Run, pass.

### Task 2: Banks and slopes in the terrain sampler

**Files:** Modify `packages/core/src/terrain/compose.ts` (pads → building ground step, fitAt), `packages/core/src/terrain/height-field.ts` (building refresh box = outline + WALKWAY_M + BANK_REACH_M). Test: `packages/core/src/terrain/__tests__/banks.test.ts`.

**Interfaces — Consumes:** Task 1. **Produces:** unchanged sampler API.

Per point p outside every outline, with d = distance to a building's outline, base = that building's floor, g = ground:
- cut (bank and slopes): if g > base and d ≤ WALKWAY_M + BANK_REACH_M: allowed = base + slope·max(0, d − WALKWAY_M); target = min(target, allowed)
- fill (slopes only): if g < base: allowed = base − slope·max(0, d − WALKWAY_M); target = max(target, allowed)
- leave: no change outside. Start target = g; building delta = target − g. Inside an outline: base − g (always wins).
- Order in fitAt: inside outline → building; on a graded road surface → road; building delta ≠ 0 → building; else road blend.

- [ ] Tests (base plane rising 0.25 m per m in +y, building square 20×20 at floor 5):
  - inside outline = 5 exactly;
  - uphill at d = 0.5 → 5 (walkway); at d = 5 (normal) → 5 + 0.5·4 = 7 (or the hill if lower); far beyond → the hill;
  - steep vs gentle at d = 5: 9 vs 6.33;
  - downhill (bank): ground untouched; downhill (slopes): raised to base − slope·(d−1) where hill is lower;
  - leave: everything outside untouched;
  - Review Focus 1: two buildings 6 m apart → no jump > 0.3 m between neighbouring 1 m samples across the gap;
  - Review Focus 2: flat ground → outside untouched;
  - Review Focus 5: graded road along the uphill side → heightAt across the road equal within 0.1;
  - existing excavation/pad tests updated to the new rule (ledger each changed expectation).
- [ ] Run fail, implement, run core terrain suite: all pass.

### Task 3: Plinth pieces (core)

**Files:** Create `packages/core/src/terrain/plinth.ts`, export. Test: `packages/core/src/terrain/__tests__/plinth.test.ts`.

**Interfaces — Produces:** `plinthFeatures(ring: LatLng[], baseM: number, grid: TerrainGrid, heightAt: (x: number, y: number) => number, buildingId: string): GeoJSON.Feature<GeoJSON.Polygon>[]` — walls split into pieces ≤ 3 m; each piece a quad from the wall to 0.4 m outside; properties `{ kind: 'plinth', buildingId, base: 0, top: baseM − ground at the piece centre }`; only pieces with top ≥ 0.1 m.

- [ ] Tests: square on a slope → pieces only on the downhill side, top ≈ base − ground there; flat ground → none; Review Focus 4: 2-point ring and repeated points → [] / no NaN; Review Focus 3: building above ground on all sides → pieces on all four walls.
- [ ] Run fail, implement, pass.

### Task 4: Editor command accepts the new setting

**Files:** Modify `packages/editor/src/commands/building-ground-handlers.ts`. Test: its existing test file.

- [ ] Test: `building.set-ground` with `{ around: 'slopes', bankSlope: 'steep' }` stores both and undo restores the previous ground; invalid values → error "Choose bank and plinth, slopes all round or leave the hill."; pad-only payloads still work.
- [ ] Run fail, implement, pass.

### Task 5: Studio — panel and plinths

**Files:** Modify `src/components/terrain/BuildingGroundPanel.tsx` (replace Pad select + Blend with "Ground around" select [Bank and plinth / Slopes all round / Leave the hill as it is] and "Bank slope" select [Gentle / Normal / Steep], hidden for leave), `src/lib/terrain/building-slabs.ts` (append `plinthFeatures`), `src/components/terrain/TerrainMap.tsx` (colour `kind` 'plinth' → `#8f96a3`). Tests: BuildingGroundPanel test, building-slabs test.

- [ ] Tests: selecting "Slopes all round" sends `{ baseMode, around: 'slopes', bankSlope: 'normal' }`; slope select sends bankSlope; slabs on a slope include `kind: 'plinth'` features.
- [ ] Run fail, implement, pass.

### Task 6: NAVI Web plinths

**Files:** Modify `src/components/map/site/site-data.ts` (`siteSlabFeatures` appends plinth pieces using `siteGroundSampler(site)`), `src/components/map/site/SiteLayers.tsx` (plinth colour). Test: SiteLayers / site-data tests.

- [ ] Test: a site on a slope → plinth features for the downhill wall. Run fail, implement, pass.

### Task 7: Stairs and ramps attach to buildings and road edges

**Files:** Modify `src/lib/terrain/structure-snap.ts`; the structure geometry resolver in `@navi/core` (where a `road` end becomes a point and height). Tests: `src/lib/terrain/__tests__/structure-snap.test.ts`, core structure tests.

Owner 2026-11-15: a ramp "doesn't touch the building" and "doesn't attach on the edge of the road".
- Road end: snap when the pointer is anywhere on the road surface (within half width + 14 px), not only near the centre line; the end lands on the road **edge** on the pointer's side (centre point + half width along the normal), at the road surface height there. Stored as `{ kind: 'road', roadId, position }` with `position` on the edge (no type change).
- Building end: the stair's top lands flush on the wall line (no gap); find and remove the cause of the gap seen on ASU (test with a stair whose top is a slab end: the first tread/landing edge touches the wall segment within 0.05 m).
- [ ] Tests first for both; run fail; implement; pass.

### Task 8: 2.5D floors in the terrain editor (one view with NAVI Web)

**Files:** Create `src/components/terrain/layers/TerrainFloorsLayer.tsx`; modify `src/components/terrain/TerrainWorkspaceRoute.tsx`, `src/lib/terrain/building-slabs.ts`. Reuse `FloorArchitectureLayer` + `selectFloorArchitecture` (NAVI Web) and `buildFloorArchitecturePreview` (floor editor) — no new drawing code.

- In 3D, the open building (selected in the Buildings tool, or the building a selected stair/ramp attaches to) shows its floors stacked exactly as NAVI Web does: walls, frames, stairs, floor slabs, up to the chosen floor (Cut away above, or the stair's floor); its grey block is hidden while open.
- Other buildings stay blocks (as NAVI Web when zoomed out).
- [ ] Tests: open building → architecture records for each floor with its elevation; its block feature is left out; no building open → blocks only. Run fail; implement; pass. Live: QA map building shows its floors in the terrain editor.

### Task 9: Stair landings, steepness and landing heights

Owner 2026-11-15: "stair, then a flat area, then stair, continuous … adjust its steepness … raised or manually raised".

**Files:** Modify `packages/core/src/structures/types.ts` (Structure), `packages/core/src/structures/stair-shape.ts`, `packages/core/src/terrain/compose.ts` (`structureTopAt`), `packages/core/src/structures/mesh.ts` (treads per flight, landing slabs), `src/lib/terrain/structure-edit.ts`, `src/components/terrain/StructurePanel.tsx`, the structure command's validation in `packages/editor`. Tests: stair-shape, structure mesh, structure-edit, StructurePanel tests.

**Interfaces — Produces (all optional, old saves unchanged):**
- `Structure.landings?: number[]` now used by stairs too (fractions of the path, landing centres).
- `Structure.landingLengthM?: number` (default 1.2; 0.9–5).
- `Structure.landingHeightsM?: Array<number | null>` — same order as `landings`; null = automatic.
- `Structure.steepness?: 'gentle' | 'normal' | 'steep'` — stairs: riser/tread 0.15/0.33, 0.175/0.30 (today), 0.19/0.26; ramps: max slope 1:12, 1:8, 1:5.
- `stairFlights(rise, run, opts): Array<{ startM; endM; fromH; toH; steps; riserM; treadM }>` in stair-shape.ts.

Rules:
- Landings split the path into flights; each landing is flat at its height for `landingLengthM`.
- Automatic landing heights share the rise by each flight's length; a typed landing height is kept, and the flights on either side take the difference.
- Each flight uses the steepness's riser for its step count; its steps take only the length they need; the rest of that flight's stretch is flat, at its top end (a level approach to the landing above it).
- A flight too short for its steps shows the existing hint ("needs X m, drawn Y m").

Panel: "Steepness" select (Gentle / Normal / Steep); "Add landing" for stairs as well as ramps; per landing: position (m along), length (m), height (m, empty = automatic), Remove.

- [ ] Tests: stair with one landing at the middle, rise 3 m → two flights, flat landing at 1.5 m, step counts from 0.175 m risers; typed landing height 2.0 → first flight rises 2.0, second 1.0; steep vs gentle step counts differ; old stair without these fields → identical heights to today; ramp steepness 1:8 caps the slope. Run fail; implement; pass.

### Task 10: Verify

- [ ] `tsc` filtered to changed files: 0 errors. Focused suites: core terrain, editor commands, src/lib/terrain, src/components/terrain, src/components/map/site.
- [ ] Live on QA map: building on a slope shows walkway + bank uphill and plinth downhill; nothing saved. `graphify update .`. Ledger + report rulings.
