# Whole-building view and floor-to-floor stairs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the floor editor, see the whole building stacked, place a stair on the active floor that climbs To a chosen
upper floor (Straight or U-Shape, with Sides), whose top attaches to that floor's walkable area and routes; show it
once, correctly, in the floor editor and NAVI Web; fix "floor 1 stair shown on floor 2".

**Architecture:** A From/To stair is one existing `Staircase` with `fromLevel`/`toLevel`: `levels[from]` holds the
flight, `levels[to]` holds only the top (`role: 'top'`). One shared selector decides what each floor draws (flight vs
top), and every reader switches to it — that is also the bug fix. Shape geometry lives in core
(`stair-assets.ts`); the floor editor gains a stacked-floors layer with the active floor editable.

**Tech Stack:** TypeScript, React/Next.js, MapLibre fill-extrusion, Vitest. Monorepo packages `@navi/core`,
`@navi/editor`, `@navi/compiler`.

**Spec:** `docs/superpowers/specs/2026-11-16-u-shape-stair-design.md`

## Global Constraints

- Work only in `D:\CODEme\Navi\.navi-worktrees\navi-save-v2`, branch `feat/save-v2`.
- **No commits without the owner's OK.** Each task ends with a checkpoint: run tests, then ask the owner to commit.
- Never press Save / Done / Publish or write saved campus data; never write `map-asu-ibajay`, `map-map-5-0y27` or the
  old `navi-development` DB. Browser checks use a test campus only.
- Leave the 50 already-modified files (terrain/structures work, incl. `packages/core/src/structures/*`) untouched
  except where a task names them.
- Dev server: `http://localhost:3001` via `scripts/save-v2/import-data/start-savev2-local.ps1` only; never two servers.
  No scratch files under `src/` while it runs.
- Tests serial and memory-limited:
  `NODE_OPTIONS=--max-old-space-size=3072 npx vitest run --no-file-parallelism <paths>`.
  Types: `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit` filtered to changed files (~5000 old errors).
- Old stairs (no `role`, no `turn`/`sides`/`topLandingM`, per-floor `links`) must look, route and save exactly as today.
- Numbers from the spec: U gap **0.2 m**; landing depth = flight width; parapet **1.0 m** above treads; rail
  **0.9–0.95 m** above treads; top snap distance **1.5 m**; flight 1 = `ceil(n/2)` steps.
- Copy: panel line `Climbs {rise} m — {From label} ({fromElev} m) → {To label} ({toElev} m) · {n} × {riser} m`;
  warning `Top doesn't reach {To label}'s hallway`; view tag `↑ {To label}`; stairwell label `↓ {From label}`.
- Doors play no part in stairs.

## Review Focus

1. **Floor heights change after the stair exists** → stair rise and steps re-fit; top stays on the To floor
   (test in Task 1: `stairRise` reads live elevations; Task 5: changing a floor height re-renders the stair).
2. **To floor deleted, or stair moved so To ≤ From** → stair falls back to a one-floor stair, no orphan `levels[to]`,
   no crash (test in Task 5).
3. **Old multi-floor stairs with geometry on two floors and no `role`** (likely the bug's data) → drawn as a flight
   only on their lowest floor, top elsewhere (test in Task 1).
4. **Undo/redo of To changes and of U/Sides changes** → exact restore incl. removal of the created top level
   (test in Task 5).
5. **Save → reload round trip and compile → publish** keep `role`, `turn`, `sides`, `topLandingM`
   (test in Task 4).

---

## File Structure

- `packages/core/src/types/entities.ts` — add `role?: 'top'` to `StairLevelGeometry`.
- `packages/core/src/geometry/stair-floors.ts` (new) — which stairs a floor draws, and their rise.
- `packages/core/src/geometry/stair-assets.ts` — Straight/U-Shape flights, landing, top landing, sides; top volumes.
- `src/lib/floor-architecture-assets.ts` — route parapets into `walls`, rails into `frames`.
- Readers switched to the selector: `src/components/floor-editor/floor-architecture-preview.ts`,
  `src/lib/terrain/terrain-floors.ts`, `packages/compiler/src/emitter/artifacts.ts`, `src/hooks/floor-graph-selectors.ts`,
  `src/components/floor-editor/FloorEditorCanvas.tsx:916`, `packages/editor/src/geometry/floor-connections.ts`.
- `packages/editor/src/types/parametric-types.ts` — stair parameters and 2D geometry for U-Shape.
- `packages/editor/src/commands/feature-handlers.ts` — To-floor change creates/removes the top level.
- `packages/editor/src/geometry/stair-top-reach.ts` (new) — does the top touch walkable floor; snap.
- `src/components/floor-editor/StairClimbProperties.tsx` (new) — To floor, climb line, Turn, Sides, Top landing.
- `src/components/floor-editor/WholeBuildingLayer.tsx` (new) + `FloorOutliner.tsx` — stacked faded floors, show/hide.
- `src/components/floor-editor/architecture-3d-projection.ts` — `datumM` for an active floor drawn at its elevation.
- Validation: `packages/editor/src/validation/rules/modules/feature-rules.ts`.

---

### Task 1: Reproduce the bug; shared "what does this floor draw" selector

**Files:**
- Modify: `packages/core/src/types/entities.ts` (`StairLevelGeometry`)
- Create: `packages/core/src/geometry/stair-floors.ts`, export from `packages/core/src/index.ts`
- Test: `packages/core/src/geometry/__tests__/stair-floors.test.ts`

**Interfaces:**
- Produces:
  - `StairLevelGeometry.role?: 'top'`
  - `stairFlightFloor(stair: Staircase): number` — lowest level key that is not `role: 'top'`, else `fromLevel`.
  - `stairFlightsOnFloor(stairs: readonly Staircase[], level: number): Array<{ stair: Staircase; geometry: StairLevelGeometry }>`
  - `stairTopsOnFloor(stairs: readonly Staircase[], level: number): Array<{ stair: Staircase; geometry: StairLevelGeometry; fromLevel: number }>`
    — a level is a top if `role === 'top'`, or (legacy) it is not the stair's flight floor.
  - `stairRise(stair: Staircase, floors: readonly Pick<Floor, 'level' | 'elevation' | 'height'>[]): number`
    — `to.elevation − from.elevation` when `toLevel > fromLevel` and both floors exist; else
    `levels[from].height ?? from.height`.

- [ ] **Step 1: Reproduce in the app.** On a test campus, open a building with stairs on floors 1 and 2, view floor 2
  in 2D and 2.5D, note which stair object appears and its `levels` keys (devtools on the editor store). Record the
  cause in the ledger `.superpowers/sdd/2026-11-16-floor-to-floor-stairs/progress.md`. If the cause is not "a stair
  with geometry on two floors drawn as a flight on both", stop and report before continuing.
- [ ] **Step 2: Write failing tests** in `stair-floors.test.ts`:
  - `flight only on its own floor`: stair `{fromLevel:1,toLevel:2,levels:{1:{...},2:{role:'top',...}}}` →
    `stairFlightsOnFloor([s],1).length===1`, `stairFlightsOnFloor([s],2).length===0`, `stairTopsOnFloor([s],2)[0].fromLevel===1`.
  - `legacy two-floor stair without role draws its flight on the lowest floor only` (levels 1 and 2, no role) → same
    expectations as above.
  - `one-floor stair unchanged`: levels `{1:{...}}` → flight on 1, nothing on 2.
  - `rise follows floor elevations`: floors `[{level:1,elevation:0,height:3.5},{level:2,elevation:3.5,height:3.2}]` →
    `3.5`; change floor 2 elevation to `4.0` → `4.0`.
  - `rise falls back for one-floor stair`: `levels[1].height=3.2` → `3.2`; absent → floor height `3.5`.
- [ ] **Step 3: Run** `... npx vitest run --no-file-parallelism packages/core/src/geometry/__tests__/stair-floors.test.ts` — FAIL (module missing).
- [ ] **Step 4: Implement** the type field and the four functions in `stair-floors.ts`; export from core index.
- [ ] **Step 5: Run** the test — PASS.
- [ ] **Step 6: Checkpoint** — show the owner the bug cause; ask to commit `fix(stairs): one rule for which floor draws a stair`.

---

### Task 2: Stair shapes — U-Shape, landings, Sides in core geometry

**Files:**
- Modify: `packages/core/src/geometry/stair-assets.ts`
- Modify: `src/lib/floor-architecture-assets.ts`
- Test: `packages/core/src/geometry/__tests__/stair-assets-shapes.test.ts`, existing `stair-assets` tests stay green

**Interfaces:**
- Consumes: `StairLevelGeometry.drawing.properties` gains optional `turn?: 'left' | 'right'`,
  `sides?: 'open' | 'railing' | 'wall'`, `topLandingM?: number` (add to the type in `entities.ts`).
- Produces: `buildStairAssetVolumes(inputs, base)` additionally emits features with `partType` `'landing'`,
  `'top-landing'`, `'parapet'`, `'rail'` (same `featureId`), and supports `preset: 'ushape'`.
  `buildFloorArchitectureAssets` puts `parapet` into `walls`, `rail` into `frames`, the rest into `stairs`.

- [ ] **Step 1: Write failing tests** (rise 3.5, 20 steps, width 1.2, depth 0.3, direction east, rotation 0):
  - `ushape footprint`: union bbox of step+landing features = width `2*1.2+0.2 = 2.6`, depth `10*0.3+1.2 = 4.2` (± 1e-6).
  - `ushape heights`: steps sorted by height strictly increase from `0.175` to `3.5`; flight 1 = first 10 steps
    lie on one side of the centre line, flight 2 on the other; landing feature height `= 1.75`.
  - `turn mirrors`: `turn:'left'` puts flight 2 on the opposite side to `turn:'right'` (default right).
  - `top landing`: `topLandingM:2` adds one `top-landing` feature at height `3.5`, length 2 along the exit direction;
    absent → length = flight width.
  - `sides wall`: `parapet` features exist on both outer edges (and the middle for ushape); each parapet piece top =
    its tread height + 1.0.
  - `sides railing`: `rail` pieces with `base` = tread height + 0.9 and `height` = tread height + 0.95.
  - `sides absent = open, straight output unchanged`: snapshot equals current output for an existing straight input.
  - `lshape/spiral still unsupported`: diagnostic `unsupported-preset`, no features.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** in `stair-assets.ts`: a `stairFlights(preset, props, rise)` helper returning flight
  rectangles + landings in the stair's local frame (flight 1 along `direction`, landing at far end, flight 2 back on
  the `turn` side, 0.2 m gap), then the existing step loop per flight; sides as thin (0.12 m) stepped pieces along
  outer edges (and gap centre for U). Rise comes from `input.height` (callers pass `stairRise`).
- [ ] **Step 4: Update** `buildFloorArchitectureAssets` routing of part types.
- [ ] **Step 5: Run** both test files — PASS.
- [ ] **Step 6: Checkpoint** — ask to commit `feat(stairs): U-Shape stairs, landings and sides`.

---

### Task 3: Stair tops — stairwell outline and top landing on the To floor

**Files:**
- Modify: `packages/core/src/geometry/stair-assets.ts`
- Test: `packages/core/src/geometry/__tests__/stair-tops.test.ts`

**Interfaces:**
- Produces: `buildStairTopVolumes(tops: readonly StairTopInput[], base: number): { landings: FeatureCollection<Polygon>; wells: FeatureCollection<Polygon> }`
  where `StairTopInput = StairAssetInput & { fromLevel: number }`; `wells` are the flight footprint (2D dashed
  outline + `label: '↓ ' + fromLabel` supplied by callers); `landings` = the top landing slab at `base` (thin, 0.05 m).
  `stairWellHoles(tops): LocalPolygon[]` — flight footprints of tops whose footprint lies inside the building outline,
  for cutting the To floor's slab.

- [ ] **Step 1: Failing tests:** a U-stair top yields 1 well with the full 2.6×4.2 footprint and 1 landing at the
  same place/length as Task 2's top landing; a stair fully outside the outline yields no hole; inside yields one hole.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** reusing Task 2's `stairFlights`. **Step 4: Run** — PASS.
- [ ] **Step 5: Checkpoint** — ask to commit `feat(stairs): stairwell and top landing on the upper floor`.

---

### Task 4: Every reader uses the selector (bug fix), compiler and save keep the new fields

**Files:**
- Modify: `src/components/floor-editor/floor-architecture-preview.ts`, `src/lib/terrain/terrain-floors.ts`,
  `packages/compiler/src/emitter/artifacts.ts`, `src/hooks/floor-graph-selectors.ts`,
  `src/components/floor-editor/FloorEditorCanvas.tsx:916`, `packages/editor/src/geometry/floor-connections.ts`,
  `packages/core/src/serialization/serializer.ts` (only if it drops unknown level fields)
- Test: `src/components/floor-editor/__tests__/floor-architecture-preview.stairs.test.ts`,
  `packages/compiler/src/__tests__/stair-from-to.test.ts`, `packages/core/src/serialization/serializer-features.test.ts`

**Interfaces:**
- Consumes: Task 1 selectors and `stairRise`; Task 2/3 builders.
- Produces: compiler stair component on the To floor carries `metadata.role: 'top'` (no polygon of the flight);
  architecture output for a floor contains its flights + its tops (landings, wells).

- [ ] **Step 1: Failing tests:**
  - preview: floor 2 of a building with a 1→2 stair has 0 `step` features and 1 `top-landing`; floor 1 has 20 steps.
  - compiler: 1→2 stair → floor-1 component without `role`, floor-2 component with `metadata.role==='top'`; route
    network has exactly one `stairs` edge between the two transition nodes (`createFloorTransition`).
  - serializer: save→load keeps `role`, `turn`, `sides`, `topLandingM` byte-equal.
  - legacy linked per-floor stairs (two stairs, `links` both ways): compiled output equals the current snapshot.
- [ ] **Step 2: Run** — FAIL. **Step 3: Replace** each `stair.levels?.[floor.level]` read with the selector (flights
  → flight volumes with `height: stairRise(...)`, tops → top volumes). **Step 4: Run** the three files plus
  `packages/compiler` regression snapshot — PASS (update snapshot only if the only diff is the new `role` on true tops;
  show the diff to the owner).
- [ ] **Step 5: Checkpoint** — browser: floor 2 no longer shows floor 1's stair. Ask to commit `fix(stairs): floors draw only their own stairs`.

---

### Task 5: Editing — To floor, climb line, Turn, Sides, Top landing; 2D U-Shape drawing

**Files:**
- Modify: `packages/editor/src/types/parametric-types.ts` (stair definition), `packages/editor/src/commands/feature-handlers.ts`
- Create: `src/components/floor-editor/StairClimbProperties.tsx`; mount in `ComponentProperties.tsx` for stairs
- Test: `packages/editor/src/commands/__tests__/stair-to-floor.test.ts`, `packages/editor/src/types/__tests__/stair-definition.test.ts`,
  `src/components/floor-editor/__tests__/StairClimbProperties.test.tsx`

**Interfaces:**
- Consumes: `stairRise`, `stairFlights` (Task 2).
- Produces: command `feature.update` payload accepts `toLevel`; when `toLevel > fromLevel` it writes
  `levels[toLevel] = { role:'top', position: <top landing centre>, rotation }` and removes any previous top level;
  `toLevel === fromLevel` removes it. Stair parameters: `turn` (Left/Right, U only), `sides` (Open/Railing/Solid wall),
  `topLandingM`; Type options = Straight, U-Shape only.

- [ ] **Step 1: Failing tests:**
  - command: set To 2 on a floor-1 stair → `toLevel===2`, `levels[2].role==='top'`; set To 3 → `levels[2]` gone,
    `levels[3]` top; set To 1 → no top; undo after each restores the exact previous object; unchanged To = no undo entry.
  - command: To floor deleted → stair returns to one floor (`toLevel===fromLevel`, no top level).
  - command: floor 2 elevation changed → `stairRise` of the stair changes (no stored height written).
  - definition: `ushape` 2D geometry has tread lines for both flights, a landing rectangle and a U-shaped arrow
    (polyline with 2 turns); Type options are exactly `['straight','ushape']`.
  - panel: renders `Climbs 3.50 m — Floor 1 (0.00 m) → Floor 2 (3.50 m) · 20 × 0.175 m`; To list holds only floors
    above; Turn hidden for Straight.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Checkpoint** — ask to commit `feat(floor-editor): stairs climb to a chosen floor`.

---

### Task 6: Whole-building view in the floor editor

**Files:**
- Create: `src/components/floor-editor/WholeBuildingLayer.tsx`
- Modify: `src/components/floor-editor/FloorOutliner.tsx` (show/hide per floor + "Whole building" toggle),
  `FloorEditorCanvas.tsx` (mount layer; active floor pieces at their elevation when whole-building is on),
  `architecture-3d-projection.ts` (`datumM`), `src/lib/terrain/terrain-floors.ts` (reuse stack pieces with flat ground, slab holes)
- Test: `src/components/floor-editor/__tests__/WholeBuildingLayer.test.tsx`,
  `src/components/floor-editor/__tests__/architecture-3d-projection.datum.test.ts`

**Interfaces:**
- Consumes: `terrainFloorStack`/`terrainFloorPieces` (existing), Task 3 `stairWellHoles`.
- Produces: `createArchitectureProjection(map, transformer, buildingId, datumM = 0)` — adds `datumM` to every
  projected/picked z. `WholeBuildingLayer({ map, building, activeLevel, hiddenLevels, on })` — draws non-active,
  non-hidden floors at `floor.elevation` with opacity 0.25 and no pointer interaction.

- [ ] **Step 1: Failing tests:** projection with `datumM:3.5` projects local z=0 to the same screen point as
  `datumM:0` with z=3.5; picking a wall face on the active floor at elevation 3.5 returns the same hit as before;
  layer test: floors 1–3, active 2, hidden {3} → only floor 1 pieces drawn, opacity 0.25; inside stair on floor 1 →
  floor 2 slab has a hole.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement**; in whole-building mode the floor-plan image is hidden while
  pitched (my call; it lies at ground level). **Step 4: Run** — PASS.
- [ ] **Step 5: Browser** (test campus): 3 floors stacked, switch active floor, hide floor 3, editing a wall on floor
  2 in 2.5D still hits correctly. Screenshot.
- [ ] **Step 6: Checkpoint** — ask to commit `feat(floor-editor): whole-building view`.

---

### Task 7: Top reach — snap, red top, Validate warning, route join

**Files:**
- Create: `packages/editor/src/geometry/stair-top-reach.ts`
- Modify: `feature-handlers.ts` (snap on place/move/To change), `feature-rules.ts` (warning), `WholeBuildingLayer.tsx`
  / preview (red top + `↑ Floor 2` tag)
- Test: `packages/editor/src/geometry/__tests__/stair-top-reach.test.ts`, validation rule test beside existing ones

**Interfaces:**
- Produces: `stairTopReach(building: Building, stair: Staircase): { ok: true; targetId: string; point: LocalCoord } | { ok: false; reason: 'no-to-floor' | 'no-walkable' }`
  — walkable = hallways, rooms, balconies (walkable areas) on the To floor; touching = top landing polygon within
  1.5 m of one. `snapStairTop(building, stair): LocalCoord | null` — position shift (≤ 1.5 m) that makes it touch.
  On `ok`, `levels[to].routeConnection` joins the To floor's route at `point` via the existing route-connection
  mechanism (`feature-route-port.ts`).

- [ ] **Step 1: Failing tests:** top landing 1.0 m from a floor-2 hallway → ok, snapped to touch; 3 m away → `no-walkable`
  and Validate warning text `Top doesn't reach Floor 2's hallway`; outside stair touching a balcony area → ok;
  routing: compiled graph has a path from a floor-1 hallway node over the stair to the floor-2 hallway.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Checkpoint** — ask to commit `feat(stairs): stair tops attach to the upper floor`.

---

### Task 8: Outside stair bottom connects to the campus route

**Files:**
- Modify: the map editor's entrance connection path (`src/components/floor-editor/entrance-route-authoring.ts`,
  `OutdoorRoutePicker`/`outdoor-route-picker-model.ts`) and compiler entrance rules
- Test: beside the existing entrance route tests; `src/studio-v2/route-network-floors.e2e.test.ts` new case

**Interfaces:**
- Consumes: `levels[from].routeConnection` (already the same type as a door's).
- Produces: a stair whose flight footprint is outside the building outline lists its bottom as a connectable point
  ("Connect to route") in the map editor; the compiler counts it as a way into the building.

- [ ] **Step 1: Failing e2e case:** outside U-stair 1→2 on a test building, bottom connected to a campus walkway,
  top touching floor-2 hallway → route from the walkway to a floor-2 room exists and uses the stair.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** following how entrances are offered and compiled. **Step 4: Run** — PASS.
- [ ] **Step 5: Checkpoint** — ask to commit `feat(stairs): outside stairs connect to campus routes`.

---

### Task 9: NAVI Web shows the stairs once, and the full browser proof

**Files:**
- Modify (only if needed): `src/components/map/layers/FloorArchitectureLayer.tsx` and the public architecture
  model so tops render as landing/well, parapets with walls, rails with frames
- Test: `src/components/map/layers/__tests__/FloorArchitectureLayer.stairs.test.ts`

- [ ] **Step 1: Failing test:** published architecture for a 1→2 U-stair with Solid wall → floor 1 shows steps +
  parapets; floor 2 shows top landing only; stacked view draws the steps once.
- [ ] **Step 2: Run** — FAIL (or PASS if Task 4 already covered it; then skip Step 3). **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Full lane:** the handoff test command (core, editor commands, lib, terrain, map site, studio parts)
  — no new failures beyond the listed pre-existing ones.
- [ ] **Step 6: Browser proof on a test campus:** 3-floor test building; inside Straight stair 1→2; outside U-stair
  tower 1→2 and 2→3 with Solid wall; whole-building view, floor 2 view, NAVI Web zoomed in, a route over the stairs.
  Screenshots to the owner.
- [ ] **Step 7: Checkpoint** — ask to commit; then ask the owner whether to build ComDev's tower on ASU (separate OK).
