# Terrain list, terrain mesh and road grading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editable terrain shaping in Studio: a Terrain list, a lasso-bounded mesh with a side view and live preview, and road grading, all saved with the campus and baked for NAVI Web.

**Architecture:** Meshes and road grading are data on the campus document, evaluated on the fly by the terrain sampler (`createTerrainSampler`), which Studio's height field, the DEM tiles and the publish bake already read. Meshes fold into `groundAt` (so roads and building pads sit on meshed ground); road grading replaces the road fit's profile. Studio edits a draft mesh through a sampler override for live preview and commits it with one command.

**Tech Stack:** TypeScript, React 19, Next.js 16, MapLibre 5.24, vitest (serial, `NODE_OPTIONS=--max-old-space-size=600..900`).

**Spec:** `docs/superpowers/specs/2026-11-15-terrain-list-mesh-design.md`

## Global Constraints

- Work only in `D:\CODEme\Navi\.navi-worktrees\navi-save-v2`, branch `feat/save-v2`. No commits without the owner's approval (commit steps below are "stage only" until then).
- No Save v2 database change: no new part kind, no migration. Meshes live in the `terrain` part; grading in each `map/road` part.
- A campus without meshes, graded roads or hidden flags must produce exactly the ground it produces today (parity test in Task 2).
- A mesh never changes ground outside its outline. A new mesh changes nothing. Lines never cross. No step where graded roads meet.
- Publish and bake ignore `hidden` / `sculptingHidden`.
- Priority where things overlap: Buildings > Roads > Meshes (list order, later wins) > Sculpting > Original ground.
- Never press Save, Done or Publish on the owner's campus, and never open ASU's terrain editor (owner's lock and draft). Live checks use a scratch campus created locally and never saved, or component tests.
- One dev server (:3001), tests focused and serial, no full build.
- UI copy: sentence case; labels exactly as in the spec ("Keep bumps", "Smooth out", "Grade ground", "Edge width", "Smooth ↔ Follow hill", "Too steep", "Level all", "Confirm", "Cancel", "Merge into ground").

## Review Focus

1. A stored mesh with bad data (fewer than 3 outline points, `rowsAt`/`colsAt` not strictly increasing, `z` of the wrong length, non-finite numbers) is skipped by the sampler, not a crash and not a changed ground. → test in Task 1.
2. Two meshes overlapping: the later one in the list wins inside both; each still fades at its own outline. → test in Task 2.
3. A road with a zero-length or 2-point line and grading on: no NaN, ground finite. → test in Task 3.
4. A large mesh or 30 meshes: `heightAt` far from every mesh costs no mesh evaluation (box index). → test in Task 2 (evaluation counter).
5. Hiding a mesh or Sculpting in Studio never changes `bakeTerrain` output. → test in Task 2.

---

### Task 1: Mesh maths (pure)

**Files:**
- Create: `packages/core/src/terrain/mesh.ts`, `packages/core/src/terrain/__tests__/mesh.test.ts`
- Modify: `packages/core/src/terrain/types.ts` (types), `packages/core/src/terrain/index.ts` (export)

**Interfaces — Produces:**
```ts
export interface TerrainMesh {
  id: string; name: string
  outline: LatLng[]                       // ≥ 3
  origin: { x: number; y: number }; angleRad: number   // grid frame in terrain-grid metres
  rowsAt: number[]; colsAt: number[]      // metres along the frame's v / u axis, strictly increasing, ≥ 2 each
  mode: 'keep-bumps' | 'smooth'
  z: number[]                             // rowsAt.length × colsAt.length, row-major
  edgeWidthM: number; softM: number; hidden?: boolean
}
// CampusTerrain gains: meshes?: TerrainMesh[]; sculptingHidden?: boolean
export function isValidMesh(mesh: unknown): mesh is TerrainMesh
export function newMesh(id: string, name: string, outline: LatLng[], grid: TerrainGrid): TerrainMesh
//   frame aligned to the outline's longest edge; 4 × 4 lines evenly over the outline's box in that frame;
//   mode 'keep-bumps', z all 0, edgeWidthM 3, softM 6
export function meshFrame(mesh: TerrainMesh, grid: TerrainGrid): { outline: Point[]; box: Box; toUV(p: Point): { u: number; v: number }; toXY(u: number, v: number): Point }
export function meshValueAt(mesh: TerrainMesh, u: number, v: number): number   // Catmull-Rom over rows and cols; beyond the outer lines the outer value continues
export function meshWeightAt(frame, mesh: TerrainMesh, p: Point): number       // 0 outside the outline; smoothstep(distance inside / edgeWidthM); 1 when edgeWidthM is 0 and inside
export function meshPointXY(mesh: TerrainMesh, grid: TerrainGrid, row: number, col: number): Point
export function setMeshMode(mesh: TerrainMesh, mode: TerrainMesh['mode'], groundBelowAt: (x: number, y: number) => number, grid: TerrainGrid): TerrainMesh  // converts z so every point's resulting height is unchanged
export function slideLine(mesh: TerrainMesh, axis: 'row' | 'col', index: number, toMetres: number): TerrainMesh  // clamped to stay ≥ 0.5 m from both neighbours; outer lines clamp one-sided
export function insertLine(mesh: TerrainMesh, axis: 'row' | 'col', atMetres: number): TerrainMesh  // new line's z from meshValueAt; no-op within 0.5 m of an existing line
export function nudgePoints(mesh: TerrainMesh, grid: TerrainGrid, selected: ReadonlyArray<{ row: number; col: number }>, deltaM: number, softM: number): TerrainMesh
//   selected points += deltaM; unselected points within softM of the nearest selected point += deltaM × smoothstep falloff (1 at 0 m → 0 at softM)
export function levelMesh(mesh: TerrainMesh, heightM: number, groundBelowAt, grid): TerrainMesh  // mode 'smooth', all z = heightM
```

- [ ] **Step 1: failing tests** (`mesh.test.ts`), one `it` each:
  - `newMesh`: 4 × 4, z all 0, `isValidMesh` true; frame's u axis parallel to the longest outline edge (rotated rectangle outline → `angleRad` ≈ its angle).
  - `isValidMesh` false for: 2-point outline, `rowsAt: [0, 0]`, `z` length ≠ rows × cols, `z` containing NaN (Review Focus 1).
  - `meshValueAt` returns the exact `z` at each grid point; between two equal points equals them; beyond the outer line equals the outer line's value.
  - `meshWeightAt`: 0 just outside the outline; 1 at `edgeWidthM` inside; strictly between at half; 1 everywhere inside when `edgeWidthM` is 0.
  - `setMeshMode` keep-bumps → smooth on sloped ground `g(x) = 0.5x`: each `z` becomes `g(point) + old z`; back again restores the original `z` (±1e-6).
  - `slideLine`: row 1 of rows `[0, 10, 20, 30]` to 25 → 19.5; to −5 → 0.5; `rowsAt` stays strictly increasing.
  - `insertLine` at 15 on a tilted plane keeps `meshValueAt` unchanged at 5 sample points (±1e-6) and adds one row.
  - `nudgePoints` with `softM` 0 changes only the selected points; with `softM` 15 on 10 m spacing, the neighbour moves by a fraction in (0, 1) of delta and a point 20 m away does not move.
  - `levelMesh` → mode `'smooth'`, every z = height.
- [ ] **Step 2:** run `NODE_OPTIONS=--max-old-space-size=600 npx vitest run packages/core/src/terrain/__tests__/mesh.test.ts` → FAIL (module missing).
- [ ] **Step 3:** implement `mesh.ts` and the types.
- [ ] **Step 4:** run again → PASS.

### Task 2: Meshes in the ground (sampler, height field, bake)

**Files:**
- Modify: `packages/core/src/terrain/compose.ts`, `packages/core/src/terrain/height-field.ts`
- Test: `packages/core/src/terrain/__tests__/mesh-ground.test.ts` (new), existing `compose*.test.ts`, `height-field.test.ts`, `site-artifact.test.ts` stay green

**Interfaces — Consumes:** Task 1. **Produces:**
```ts
// TerrainSamplerOptions gains:
meshesOverride?: TerrainMesh[]   // replaces doc.terrain.meshes (the Mesh tool's live draft)
studioView?: boolean             // true: honour mesh.hidden and terrain.sculptingHidden; default false (bake / publish)
// TerrainSampler gains:
sculptedAt(x: number, y: number): number   // base + change tiles (what groundAt was)
// groundAt becomes: sculptedAt with every valid, non-hidden-in-view mesh applied in list order
//   keep-bumps: h += value × weight      smooth: h += (value − h) × weight
// changeAt unchanged (change tiles only; 0 while sculptingHidden in studioView)
export function meshReachBoxes(doc: CampusDocument, grid: TerrainGrid): Rect[]   // each valid mesh's outline box + 1 m
```
`height-field.ts`: `padBoxes` also includes every building without a pad (footprint box grown by 2.5 + 1 m — today they are skipped although the sampler flattens them), every mesh reach box, and every graded road's box (line box grown by half width + blend + 1 m).

- [ ] **Step 1: failing tests** (`mesh-ground.test.ts`, using `compose.test.ts`'s `doc` / `terrainOf` / `planeBase` helpers copied locally):
  - Parity: for the Ibajay fixture (`ibajayDoc()`), 300 sample points give identical `heightAt` with `meshes: undefined` and `meshes: []` as before this task (snapshot the pre-change values by computing with a doc that has no `terrain.meshes`).
  - A new mesh (`newMesh`) changes nothing: `heightAt` equal at 50 points inside the outline (±1e-9).
  - Keep-bumps: z all 2 on bumpy ground → inside (beyond the edge width) height = ground + 2; outside the outline exactly unchanged; at the outline exactly unchanged.
  - Smooth: `levelMesh(…, 5)` → 5.000 inside beyond the edge width on a slope.
  - Two overlapping meshes levelled to 3 and 7: inside both (beyond both edge widths) → 7 with order [a, b], 3 with [b, a] (Review Focus 2).
  - A building pad over a mesh still wins: inside the footprint the height is the building base.
  - `meshesOverride` replaces the document's meshes.
  - `studioView: true` skips a `hidden` mesh; default does not; `bakeTerrain(doc)` is byte-identical with `hidden` true or false and with `sculptingHidden` true or false (Review Focus 5).
  - Box index: with 30 meshes, sampling 1 000 points > 50 m from all of them calls `meshValueAt` 0 times (spy via `vi.spyOn` on the module export) (Review Focus 4).
  - Invalid mesh in the document: ground equals the no-mesh ground, no throw (Review Focus 1).
  - Height field: after adding a mesh, `field.update(doc, meshBox)` makes `field.heightAt` match the sampler inside the mesh; a no-pad building's surroundings match the sampler after `update` on a rect touching its footprint.
- [ ] **Step 2:** run the file → FAIL.
- [ ] **Step 3:** implement. `pads` base uses `effectiveBuildingBase` on the new `groundAt` (buildings follow meshed ground).
- [ ] **Step 4:** run `npx vitest run packages/core/src/terrain` → all PASS (existing 113 + new).

### Task 3: Road grading profile and junctions

**Files:**
- Create: `packages/core/src/terrain/road-grade.ts`, `packages/core/src/terrain/__tests__/road-grade.test.ts`
- Modify: `packages/core/src/types/entities.ts` (`Road.grade`), `packages/core/src/terrain/compose.ts` (use it), `packages/core/src/terrain/index.ts`

**Interfaces — Produces:**
```ts
// Road gains: grade?: { smoothness: number /* 0 follow hill … 1 smooth */; pins?: Array<{ alongM: number; heightM: number }> }
export interface RoadProfile { lengthM: number; heightAtAlong(s: number): number }
export function roadGradeProfile(line: Point[], groundAt: (x: number, y: number) => number, grade: NonNullable<Road['grade']>, ends: { start?: number; end?: number }): RoadProfile
//   samples the centreline every 1 m; moving-average window = 4 + 56 × smoothness metres (clamped to the length);
//   passes exactly through pins and through ends.start / ends.end when given, easing to them over the window
export function junctionHeights(roads: Array<{ id: string; line: Point[]; halfWidth: number; profile: RoadProfile; pinAt(s: number): number | null }>): Map<string, { start?: number; end?: number }>
//   an end within another road's halfWidth + 0.5 m of that road's line is a junction; its height = a pin there if any,
//   else the mean of the two profiles at that place; returned per road end
```
`compose.ts`: for a road with `groundFit` on **and** `grade` present, the fit uses the junction-eased profile (two passes: raw profiles → junction heights → final profiles); without `grade` the existing straight `roadProfile` is unchanged. Typed end heights (`heightMode === 'typed'`) act as end pins.

- [ ] **Step 1: failing tests:**
  - Smoothness 1 on ground `0.1x + sin bumps (±1 m)` over 120 m: the profile's second difference max is < 5 % of the raw ground's; smoothness 0 stays within 0.6 m of the raw ground everywhere.
  - A pin `{ alongM: 40, heightM: 9 }` → `heightAtAlong(40)` = 9 (±1e-6), continuous (no jump > 0.3 m per metre step).
  - Two roads meeting in a T, different profile heights at the joint (3 and 5): both final profiles = 4 at the junction; with a pin 6 on the junction → 6.
  - In the sampler: the ground across a graded road (inside its width) equals the profile at that station; at the T there is no step: heights 0.5 m either side of the joint differ by < 0.15 m.
  - 2-point and zero-length roads with grading: finite heights, no throw (Review Focus 3).
  - A road with `groundFit` but no `grade` gives exactly the pre-task ground (existing fit tests stay green).
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** `npx vitest run packages/core/src/terrain` → PASS.

### Task 4: Commands and saving

**Files:**
- Modify: `packages/editor/src/commands/terrain-handlers.ts`, `packages/editor/src/commands/index.ts`, `packages/editor/src/context/create-editor-context.ts`, `src/studio-v2/parts/content-rules.ts`
- Create: `packages/editor/src/commands/road-grade-handlers.ts`
- Test: `packages/editor/src/commands/__tests__/terrain-mesh-handlers.test.ts` (new), `src/studio-v2/parts/split-join.test.ts` (add cases), `src/studio-v2/parts/content-rules.test.ts` (add case)

**Interfaces — Produces (command ids and payloads):**
- `terrain.mesh.add { mesh }` · `terrain.mesh.update { mesh }` (same id replaces) · `terrain.mesh.remove { meshId }` · `terrain.mesh.reorder { meshId, toIndex }` · `terrain.mesh.merge { meshId }` (writes the mesh's effect into the change tiles over its outline box, then removes it; needs the existing tile-writing helper `terrain.apply-tiles` uses) · `terrain.sculpting.clear {}` (deletes `terrainTiles`) · `terrain.set-view { meshId?, hidden?, sculptingHidden? }` — all undone through the existing terrain snapshot/`terrain.restore` path (snapshot already covers `terrain` and `terrainTiles`).
- `road.set-grade { roadId, groundFit?: GroundFit, grade?: Road['grade'] | null }` with its own inverse (previous `groundFit` / `grade`).
- `terrain.setup` keeps `meshes` and `sculptingHidden`.
- Content rule: `terrain` part's `terrain.meshes`, when present, must be an array.

- [ ] **Step 1: failing tests:** each command's effect; each undo restores the document deeply equal; invalid payloads refused (`isValidMesh` false, unknown ids, `smoothness` outside 0–1, pins outside the road length); `terrain.mesh.merge` leaves `heightAt` unchanged (±0.02 m at 100 points inside) with the mesh gone; split → join round trip of a document with two meshes, `sculptingHidden`, and a road with `groundFit` + `grade` is deeply equal; content rule rejects `meshes: {}`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement; register handlers. **Step 4:** run those files plus `packages/editor/src/commands/__tests__/terrain-handlers.test.ts` and `src/studio-v2/parts` → PASS.

### Task 5: Mesh editing session (pure state)

**Files:**
- Create: `src/lib/terrain/mesh-session.ts`, `src/lib/terrain/__tests__/mesh-session.test.ts`

**Interfaces — Consumes:** Task 1. **Produces:**
```ts
export type MeshSelectMode = 'point' | 'row' | 'col' | 'box'
export interface MeshSession { original: TerrainMesh | null /* null = new */; draft: TerrainMesh; mode: MeshSelectMode; selected: Array<{ row: number; col: number }> }
export function openSession(mesh: TerrainMesh, isNew: boolean): MeshSession
export function selectAt(s: MeshSession, hit: { row: number; col: number }, additive: boolean): MeshSession   // expands to the row / column in those modes
export function selectBox(s: MeshSession, rows: [number, number], cols: [number, number], additive: boolean): MeshSession
export function selectLine(s: MeshSession, axis: 'row' | 'col', index: number, additive: boolean): MeshSession
export function dragHeight(s: MeshSession, grid: TerrainGrid, deltaM: number): MeshSession          // nudgePoints with draft.softM
export function typeHeight(s: MeshSession, grid: TerrainGrid, groundBelowAt, heightM: number): MeshSession  // selected points' resulting height = heightM in either mode
export function sessionCommand(s: MeshSession): Command | null   // terrain.mesh.add / .update; null when draft deep-equals original
export function pointHeights(mesh: TerrainMesh, grid, groundBelowAt): number[]   // resulting height at each point, for labels
```
- [ ] **Step 1: failing tests:** row mode click selects every point of that row; Shift adds a second row; box selects the rectangle of indices; `dragHeight` moves only the selection when `softM` is 0; `typeHeight` in keep-bumps makes the point's resulting height exactly the typed value; `sessionCommand` → `terrain.mesh.add` for a new mesh, `terrain.mesh.update` for an edited one, null when unchanged.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.

### Task 6: Side view (profile slice)

**Files:**
- Create: `src/lib/terrain/profile-slice.ts`, `src/lib/terrain/__tests__/profile-slice.test.ts`, `src/components/terrain/ProfileStrip.tsx`, `src/components/terrain/__tests__/ProfileStrip.test.tsx`

**Interfaces — Produces:**
```ts
export interface ProfileSlice { lengthM: number; before: Array<{ s: number; h: number }>; after: Array<{ s: number; h: number }>; handles: Array<{ key: string; s: number; h: number }> }
export function meshLineSlice(mesh: TerrainMesh, axis: 'row' | 'col', index: number, grid: TerrainGrid, before: (x: number, y: number) => number, after: (x: number, y: number) => number): ProfileSlice  // sampled every 1 m along the line across the outline box
export function roadSlice(line: Point[], pins: Array<{ alongM: number; heightM: number }>, before, after): ProfileSlice
// <ProfileStrip slice onDragHandle(key, newHeightM) onAddHandle?(s) /> — SVG strip, grey dashed "before", solid "after", round handles with height labels, vertical drag only
```
- [ ] **Step 1: failing tests:** slice of a row has one handle per column at the right `s`; `before`/`after` sampled from the two functions; component renders one `role="slider"` per handle with `aria-valuenow` = height (2 decimals); ArrowUp on a focused handle calls `onDragHandle(key, h + 0.1)`; pointer drag upward by N px calls it with a larger height.
- [ ] **Step 2–4:** FAIL → implement → PASS.

### Task 7: Mesh tool in the terrain editor (live preview)

**Files:**
- Create: `src/components/terrain/tools/MeshTool.tsx`, `src/components/terrain/MeshPanel.tsx`, `src/components/terrain/layers/MeshSheetLayer.tsx`, tests beside them in `__tests__/`
- Modify: `src/components/terrain/TerrainToolRail.tsx` (tools `mesh` key `m`, `grade` key `g`), `src/components/terrain/TerrainTools.tsx`, `src/components/terrain/TerrainWorkspaceRoute.tsx` (pass `meshesOverride` + `studioView: true` into `useTerrainSampler`; mark the draft mesh's box dirty on each draft change), `src/lib/terrain/use-terrain-sampler.ts` (accept the two options; a sampler with `meshesOverride` is not field-backed, like `tilesOverride`)

**Interfaces — Consumes:** Tasks 1, 2, 4, 5, 6. **Produces:** `TerrainTools` prop `onMeshDraft(mesh: TerrainMesh | null)`; `MeshTool` props `{ map, document, sampler, active, dispatch, onDraft, requestedMeshId }`.

Behaviour (spec "Studio: Mesh tool"): lasso via the existing `useMapDraft` (closed polygon) → `newMesh` → session; `MeshSheetLayer` draws the outline (dashed), grid lines, points and their height labels as map layers; clicking a point / line selects per mode; ▲/▼ and line-slide handles reuse the `StructureHandles` marker pattern; the panel has Select (Point / Row / Column / Box), Soft, + Line, Keep bumps / Smooth out, Height (typed), Pick from map, Edge width, Level all, Confirm, Cancel, Delete mesh; the `ProfileStrip` shows the selected row or column. Confirm dispatches `sessionCommand`; Cancel drops the draft. While a draft is open, the ground under it is tinted (a translucent fill of the outline in `MeshSheetLayer`) so preview and saved ground are told apart.

- [ ] **Step 1: failing component tests** (fake map as in `SiteLayers.test.tsx`): the rail shows Mesh and Grade; with a session open the panel lists the controls above by accessible name; clicking Row then a point calls back with the whole row selected; Confirm dispatches `terrain.mesh.add` once with a valid mesh and clears the draft; Cancel dispatches nothing and calls `onDraft(null)`; a draft change calls `onDraft` with the draft (live preview feed); `MeshSheetLayer` adds its sources/layers and removes them on unmount without throwing when the map is gone.
- [ ] **Step 2–4:** FAIL → implement → PASS; then `npx vitest run src/components/terrain src/lib/terrain` → PASS.

### Task 8: Grade tool for roads

**Files:**
- Create: `src/components/terrain/tools/GradeTool.tsx`, `src/components/terrain/RoadGradePanel.tsx`, tests in `__tests__/`
- Modify: `src/components/terrain/TerrainTools.tsx`

Behaviour: with tool `grade`, clicking within a road's half width selects it (nearest centreline); the panel shows Grade ground (Off / Raise only / Lower only / Raise and lower), Edge width (0–20 m), Smooth ↔ Follow hill (slider 0–1), and pins (click on the road adds one at that station with the current ground height; each has a typed height and Remove); the `ProfileStrip` shows `roadSlice`; every change dispatches `road.set-grade` (one undo step each).

- [ ] **Step 1: failing tests:** panel controls by accessible name; choosing "Raise and lower" dispatches `road.set-grade` with `groundFit.mode: 'both'` and a default `grade { smoothness: 0.5 }`; moving the slider dispatches the new smoothness; adding and removing a pin dispatch the right pins; Off dispatches `groundFit.mode: 'off'`.
- [ ] **Step 2–4:** FAIL → implement → PASS.

### Task 9: Terrain list

**Files:**
- Create: `src/components/terrain/TerrainListPanel.tsx`, `src/components/terrain/__tests__/TerrainListPanel.test.tsx`
- Modify: `src/components/terrain/TerrainLayersPanel.tsx` (the list sits above the layer toggles, which become a compact row), `src/components/terrain/TerrainTools.tsx`

Behaviour: groups Buildings (count), Roads (graded ones named "… · graded"), Meshes (each: name, eye, Delete, drag or ▲▼ to reorder, menu "Merge into ground"), Sculpting (eye, Clear with a confirm), Original ground (no actions). Clicking a mesh switches to the Mesh tool with that mesh open; clicking a road switches to Grade with it selected. Eye → `terrain.set-view`; Delete → `terrain.mesh.remove`; reorder → `terrain.mesh.reorder`; Merge → `terrain.mesh.merge`; Clear → `terrain.sculpting.clear`.

- [ ] **Step 1: failing tests:** renders the five groups and item names; each action dispatches its command with the right payload; Clear asks before dispatching; controls disabled when not editing.
- [ ] **Step 2–4:** FAIL → implement → PASS.

### Task 10: Too steep view and height readout

**Files:**
- Create: `src/lib/terrain/steepness.ts`, `src/lib/terrain/__tests__/steepness.test.ts`, `src/components/terrain/layers/SteepLayer.tsx`
- Modify: `src/components/terrain/TerrainTopBar.tsx` (toggle "Too steep"), `src/components/terrain/TerrainTools.tsx` (CursorHeight always on for `mesh` and `grade`)

**Interfaces — Produces:** `steepnessImage(field: HeightField): { width: number; height: number; data: Uint8ClampedArray }` — 1 px per metre; slope = max height difference to the 4 neighbours per metre; transparent below 1 : 4 (0.25), amber `rgba(239,159,39,0.55)` from 0.25, red `rgba(226,75,74,0.6)` from 0.5. `SteepLayer` shows it as a MapLibre `image` source over the field's box, refreshed when the sampler version changes.

- [ ] **Step 1: failing tests:** a flat field → all transparent; a 1 : 3 slope → amber everywhere inside; a 1 : 1.5 slope → red; the toggle has `aria-pressed`.
- [ ] **Step 2–4:** FAIL → implement → PASS.

### Task 11: End-to-end check

- [ ] Run `npx tsc --noEmit -p tsconfig.json` → no new errors.
- [ ] Run `npx vitest run packages/core/src/terrain packages/editor/src/commands src/studio-v2/parts src/components/terrain src/lib/terrain src/components/map/site` → PASS except failures recorded as pre-existing.
- [ ] Live, on a scratch campus (never ASU, never Save): draw a mesh, drag a row up, see the ground follow; slide a line; Smooth out + Level all; Confirm; reopen from the list; grade a road with a pin; two roads meeting show no step; Too steep tints a steep bank. Screenshot each. (That hidden items still publish is proven by the bake test in Task 2; a scratch campus is never saved, so NAVI Web cannot show it.)
- [ ] `graphify update .`
- [ ] Report to the owner; ask before committing.
