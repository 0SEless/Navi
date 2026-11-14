# Door and Window Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct opening behaviour, standard 2D plan symbols, a built-in catalog of door and window looks (including jalousie), and better Studio controls, all visual only.

**Architecture:**
- One core resolver, `resolveDoorStyle` / `resolveWindowStyle`, turns stored fields (plus defaults) into an effective style.
- Core builders turn that style into 3D volumes (existing `door-assets.ts` / `window-assets.ts`) and 2D plan symbols (new `opening-symbols.ts`).
- Studio and NAVI Web consume both through the existing `buildFloorArchitectureAssets` and the floor-editor preview. Controls dispatch the existing `door.update` / `opening.update` commands.

**Tech Stack:** TypeScript, React (Next 16), MapLibre layers (`fill-extrusion`, `line`, `symbol`), vitest 4.

**Spec:** `docs/superpowers/specs/2026-11-13-door-window-assets-design.md`

## Global Constraints

- **Session rules (owner):** no staging or commits, and no Save/Done/Publish. Before the first edit, make a separate checkpoint (the Codex checkpoint pattern) and keep the existing one untouched.
- **Tests:** focused and serial. `NODE_OPTIONS=--max-old-space-size=512 npx vitest run <files> --no-file-parallelism`. No full build.
- **Every new field is optional, and absence renders exactly as today.** Today's defaults: hinge at the **start** end, leaf rotates toward the wall's **left** side (+normal), `doorAppearance` absent → `solid` (`double-solid` for `doorType: 'double'`), `doorPose` absent → `closed`, `windowAppearance` absent → `open`.
- **Visual only:** no navigation, compiler-graph or routing code may read the new fields.
- **Built-in library only:** materials `wood #8B5E3C`, `painted-steel #6B7280`, `aluminium #C0C7CF`, `fire-red #B91C1C`. Glass: `clear` (cyan, opacity 0.35), `frosted` (white, 0.55), `tinted` (slate, 0.45).
- 2D symbols are visible at zoom ≥ 18 only.
- At most 40 solids per opening. Invalid input is omitted and reported, never guessed.
- `doorType` stays a closed enum (`opening`, `standard`, `fire`, `double`, `sliding`) with its navigation meaning unchanged.

## Review Focus

1. **A free legacy door (no `wallAttachment`) with `swingSide` set:** its swing must use the door's `rotation` as the wall direction, not snap to some wall. Test in Task 3.
2. **A double door with `hingeSide: 'end'`:** hinge side doesn't apply to double doors. Both leaves stay mirrored at the outer jambs, and `swingSide` still flips both. Tests in Tasks 3 and 4.
3. **An archway (`doorType: 'opening'`) with a stored `doorOperation: 'hinged'`:** archway wins (operation `none`, no leaf, no arc). Test in Task 2.
4. **Sliding panels at the "open" pose:** must stay within the opening's width plus one panel width, never past the wall end. Test in Task 3.
5. **Apply-to-similar when one matching door is locked or invalid:** the whole command fails with nothing changed, and no partial history entry. Test in Task 12.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/types/enums.ts` | New enums: `DOOR_OPERATIONS`, `HINGE_SIDES`, `SWING_SIDES`, `OPENING_MATERIALS`, `GLASS_TYPES`, `WINDOW_APPEARANCES`, `WINDOW_POSES` |
| `packages/core/src/types/entities.ts` | Optional fields on `RoomDoor`, `Opening` |
| `packages/core/src/assets/opening-style.ts` (new) | `resolveDoorStyle`, `resolveWindowStyle`: stored fields → effective style |
| `packages/core/src/assets/opening-catalog.ts` (new, Phase 2) | Presets and the materials palette |
| `packages/core/src/geometry/door-assets.ts`, `window-assets.ts` | 3D volumes driven by the effective style |
| `packages/core/src/geometry/opening-symbols.ts` (new) | 2D plan symbols |
| `packages/editor/src/commands/feature-handlers.ts` | Validate new fields in `door.create`/`door.update`/`opening.create`/`opening.update`; new `door.applyAppearanceToSimilar` |
| `src/lib/floor-architecture-assets.ts`, `src/components/floor-editor/floor-architecture-preview.ts` | Pass symbols and colours through |
| `src/components/floor-editor/FloorEditorCanvas.tsx`, NAVI Web map layers (`src/components/map/*` using `NavigationRenderModel`) | Draw symbols; `['get','color']` on extrusions |
| `src/components/floor-editor/DoorAppearanceProperties.tsx`, `OpeningProperties.tsx`, new `OpeningThumbnail.tsx` | Controls |

---

## Phase 1: correctness

### Task 1: Data fields, validation and save round trip

**Files:** Modify `enums.ts`, `entities.ts`, `feature-handlers.ts` (door.create ~457, door.update ~547, opening create/update). Test: `packages/editor/src/commands/__tests__/door-style-fields.test.ts` (new), `src/studio-v2/parts/split-join.test.ts` (add a case).

**Interfaces — Produces:**
- `DoorOperation = 'hinged'|'sliding'|'folding'|'rolling'|'none'`
- `HingeSide = 'start'|'end'`
- `SwingSide = 'left'|'right'`
- Optional fields `doorOperation`, `hingeSide`, `swingSide` on `RoomDoor` and on `Opening` (door type).

- [ ] **Step 1: Write failing tests**
  - `door.update accepts hingeSide/swingSide/doorOperation and stores them`
  - `door.update rejects swingSide 'up' with error 'Swing side must be left or right'`
  - `door.update undo restores the previous absence exactly (fields deleted, not undefined)`
  - Split-join case: `round-trips a floor whose door and opening carry hingeSide 'end', swingSide 'right', doorOperation 'sliding'`, using `stripVolatile` equality, as in the file's existing cases.
- [ ] **Step 2:** Run the two test files and expect FAIL.
- [ ] **Step 3:** Add the enums and fields. Validate in the four handlers with the same pattern as `DOOR_APPEARANCES` (lines 485/568). Errors: `'Door operation must be hinged, sliding, folding, rolling or none'`, `'Hinge side must be start or end'`, `'Swing side must be left or right'`.
- [ ] **Step 4:** Run and expect PASS.
- [ ] **Step 5:** Ledger line: `Task 1: complete`. No commit.

### Task 2: Effective style resolver

**Files:** Create `packages/core/src/assets/opening-style.ts`, export it from the core index. Test: `packages/core/src/assets/__tests__/opening-style.test.ts`.

**Interfaces — Produces:**
- Types (in `enums.ts`, no stored fields yet): `OpeningMaterial = 'wood'|'painted-steel'|'aluminium'|'fire-red'`, `GlassType = 'clear'|'frosted'|'tinted'`.
- `resolveDoorStyle(door: Pick<RoomDoor,'doorType'|'doorAppearance'|'doorPose'|'doorOperation'|'hingeSide'|'swingSide'> & {assetPreset?: string; material?: OpeningMaterial; glass?: GlassType}): DoorStyle`
- `DoorStyle = { operation: DoorOperation; leaves: 1|2; hingeSide: HingeSide; swingSide: SwingSide; pose: 'closed'|'ajar'|'open'; panel: 'solid'|'glass'|'half-glass'|'none'; material: OpeningMaterial|null; glass: GlassType; fire: boolean }`

- [ ] **Step 1: Write failing tests**, with exact expectations:
  - `{doorType:'standard'}` → `{operation:'hinged', leaves:1, hingeSide:'start', swingSide:'left', pose:'closed', panel:'solid', fire:false}`
  - `doorType 'double'` → leaves 2, panel solid
  - `doorType 'sliding'` → operation sliding
  - `doorType 'fire'` → fire true, operation hinged
  - `doorType 'opening'` with `doorOperation:'hinged'` → operation `none`, panel `none` (Review Focus 3)
  - `doorAppearance 'glass'` → panel glass
  - `'double-glass'` → leaves 2, panel glass
  - `doorAppearance 'open'` → operation none
  - Explicit `doorOperation:'folding'` on a standard door → folding
- [ ] **Step 2:** Run and expect FAIL.
- [ ] **Step 3:** Implement as a pure function. Precedence: archway → explicit `doorOperation` → doorType-derived → appearance-derived. Material and glass are `null`/`'clear'` until Task 8.
- [ ] **Step 4:** Run and expect PASS. **Step 5:** Ledger.

### Task 3: 3D door volumes follow the style (hinge, swing, sliding, fire)

**Files:** Modify `packages/core/src/geometry/door-assets.ts` (aperture build ~133–150; leaf loop ~180–210). Test: `packages/core/src/geometry/__tests__/door-assets.test.ts`.

**Interfaces — Consumes:** `resolveDoorStyle` (Task 2). **Produces:** unchanged `buildDoorAssetVolumes(walls, openings, doors, base)`. Feature properties gain `operation`, `leaf` and `fire: boolean`.

- [ ] **Step 1: Write failing tests**
  - `absent new fields produce byte-identical volumes to the pre-change snapshot`. Record the snapshot from the current code first, for: standard closed, ajar and open; double; glass; archway.
  - `hingeSide 'end' puts the ajar leaf pivot at width - breadth`
  - `swingSide 'right' mirrors the ajar leaf across the wall (normal coordinate sign flips)`
  - `double door ignores hingeSide and swingSide 'right' flips both leaves` (Review Focus 2)
  - `sliding door never rotates; open pose shifts panel along the wall and stays within [0, width + panelWidth] and inside the wall length` (Review Focus 4)
  - `fire door frame depth is 1.5x standard and features carry fire:true`
  - `free legacy door with swingSide 'right' uses its rotation as wall direction` (Review Focus 1)
- [ ] **Step 2:** Run and expect FAIL (the snapshot test passes; the rest fail).
- [ ] **Step 3:** Implement:
  - Hinge pivot comes from `hingeSide`.
  - The rotation sign is `swingSide === 'right' ? -1 : 1`.
  - Sliding: two panels each `width/2 + overlap(0.05)`, translated along the wall by pose (closed 0, ajar 0.5, open 1.0 × panel width) and clamped (Review Focus 4).
  - Fire: frame depth × 1.5.
- [ ] **Step 4:** Run and expect PASS. Also run `src/components/floor-editor/__tests__/door-production-path.test.ts`. **Step 5:** Ledger.

### Task 4: 2D plan symbols (hinged, double, sliding, archway, fire, basic windows)

**Files:** Create `packages/core/src/geometry/opening-symbols.ts`, export it from the index. Test: `packages/core/src/geometry/__tests__/opening-symbols.test.ts`.

**Interfaces — Produces:**
- `buildOpeningPlanSymbols(walls: readonly Wall[], openings: readonly Opening[], doors: readonly DoorAssetInput[]): { lines: FeatureCollection<LineString>; markers: FeatureCollection<Point> }`
- Every feature has properties `{ id, openingId?|doorId?, kind: 'leaf'|'arc'|'panel'|'arrow'|'jamb'|'window-face'|'window-glass'|'hatch'|'zigzag'|'shutter'|'fire', color? }`.
- Building-local coordinates, like the volumes.

- [ ] **Step 1: Write failing tests**
  - `hinged single: one leaf line from the hinge, length = leaf width, and one arc of 25 points (24 segments) with radius = leaf width on the swing side`
  - `swingSide right puts the arc on the other side of the wall`
  - `double: two leaves, two arcs meeting at the centre`
  - `sliding: two parallel panel lines inside the wall thickness, plus one arrow; no arc`
  - `archway: two jamb ticks only`
  - `fire: hinged symbols plus one 'fire' marker point at the opening centre`
  - `window fixed/two-pane/open: three window lines (face, glass, face) across the thickness; two-pane splits the glass line in two`
  - `invalid door (no wall, no rotation) yields no features and does not throw`
- [ ] **Step 2:** FAIL. **Step 3:** Implement using the same aperture resolution as `door-assets.ts`. Extract a shared `resolveApertures(walls, openings, doors)` into that file instead of duplicating it, and export it for this file. **Step 4:** PASS. **Step 5:** Ledger.

### Task 5: Draw symbols in Studio and NAVI Web

**Files:** Modify `src/lib/floor-architecture-assets.ts` (add `symbols`), `src/components/floor-editor/floor-architecture-preview.ts`, `FloorEditorCanvas.tsx` (near layers ~157–237), and the NAVI Web layer setup consuming `NavigationRenderModel`. Test: `src/lib/__tests__/floor-architecture-assets.test.ts` (extend or create) and `src/components/floor-editor/__tests__/opening-symbol-layers.test.ts` (new, with the existing MapLibre mock pattern).

**Interfaces — Consumes:** `buildOpeningPlanSymbols` (Task 4). **Produces:** `FloorArchitectureAssets.symbols: { lines; markers }`, in world coordinates via the existing transformer path.

- [ ] **Step 1: Write failing tests**
  - `buildFloorArchitectureAssets returns symbols in world coordinates`
  - `Studio adds layers 'floor-opening-symbols-lines' and 'floor-opening-symbols-fire' with minzoom 18`
  - `existing door/window fill layers keep their ids but use opacity 0.2`
  - `NAVI Web adds the same two layers with minzoom 18`
- [ ] **Step 2:** FAIL. **Step 3:** Implement. Line colours by kind: leaf `#047857`, arc `#047857` dashed `[2,2]`, window lines `#0284C7`, fire text "F" `#B91C1C`. **Step 4:** PASS. **Step 5:** Ledger.

### Task 6: Hinge, Swing and Flip controls

**Files:** Modify `src/components/floor-editor/DoorAppearanceProperties.tsx`. Wire the **F** key in `FloorEditor.tsx` (selected door only, architecture workspace, not while typing in an input). Test: `src/components/floor-editor/__tests__/DoorAppearanceProperties.test.tsx`.

**Interfaces — Consumes:** `door.update` patch with `hingeSide`/`swingSide` (Task 1). `onUpdate` patch type is widened to include them.

- [ ] **Step 1: Write failing tests**
  - `Hinge toggle (start/end) sends {hingeSide:'end'}`
  - `Swing toggle sends {swingSide:'right'}`
  - `Flip button swaps swingSide (absent → 'right')`
  - `F key on a selected door dispatches one door.update with swapped swingSide; ignored when focus is in an input`
  - `archway and disabled states disable all three controls`
  - `double door hides Hinge, keeps Swing and Flip`
- [ ] **Step 2:** FAIL. **Step 3:** Implement. In Phase 1 the toggles apply immediately (one `door.update` each); the existing Apply button stays for appearance and pose until Task 12. **Step 4:** PASS. **Step 5:** Ledger.

### Task 7: Visual-only guarantee

**Files:** Test only: `packages/compiler/src/__tests__/appearance-invariance.test.ts` (new).

- [ ] **Step 1:** Write `compiled navigation graph and artifacts are identical when only appearance fields change`:
  - Compile a fixture floor with doors and windows.
  - Set every new field (`doorOperation`, `hingeSide`, `swingSide`, and later `assetPreset`/`material`/`glass`/`windowAppearance`/`windowPose`) plus `doorAppearance`/`doorPose`.
  - Compile again.
  - Compare `canonicalJson` of the graph and route artifacts, excluding decorative door metadata the emitter passes through on purpose. List those keys explicitly in the test.
- [ ] **Step 2:** Run. Expected: PASS without production changes. If it fails, a navigation path reads an appearance field: fix that path, not the test. **Step 3:** Ledger. Phase 1 gate: run all Phase 1 test files together, serially.

---

## Phase 2: catalog

### Task 8: Catalog, materials and glass fields

**Files:** Create `packages/core/src/assets/opening-catalog.ts`. Modify `enums.ts`, `entities.ts`, `feature-handlers.ts` and `opening-style.ts`. Tests: `opening-catalog.test.ts`, extend `opening-style.test.ts` and `door-style-fields.test.ts`.

**Interfaces — Consumes:** `OpeningMaterial`, `GlassType` (Task 2). **Produces:**
- Fields `assetPreset?: string`, `material?: OpeningMaterial`, `glass?: GlassType` on `RoomDoor` and `Opening`.
- `OPENING_MATERIAL_COLORS: Record<OpeningMaterial,string>` and `GLASS_STYLES: Record<GlassType,{color:string;opacity:number}>`, with the Global Constraints values.
- `DOOR_PRESETS` with ids `door.wood.single`, `door.wood.half-glass`, `door.steel.single`, `door.fire.single`, `door.glass.single`, `door.wood.double`, `door.glass.double`, `door.glass.sliding`, `door.folding`, `door.rollup`, `door.archway`.
- Each preset has `{ id; label; operation; leaves; panel; material; glass; defaultWidth; defaultHeight }`.
- `findDoorPreset(id): DoorPreset | undefined`.

- [ ] **Step 1: Failing tests:**
  - `11 door presets with unique ids and the labels from the spec table`
  - `resolveDoorStyle applies preset defaults, then explicit material/glass override them`
  - `unknown assetPreset falls back to today's look and does not throw`
  - `door.update rejects unknown assetPreset 'door.castle' with 'Unknown door preset'`
- [ ] **Step 2** FAIL → **Step 3** implement → **Step 4** PASS → **Step 5** Ledger.

### Task 9: Materials in 3D; folding and roll-up doors

**Files:** `door-assets.ts`, `FloorEditorCanvas.tsx` and the NAVI Web extrusion layers. Tests: `door-assets.test.ts`, `opening-symbol-layers.test.ts`.

- [ ] **Step 1: Failing tests:**
  - `every door feature carries color from resolveDoorStyle; absent material keeps today's colour`
  - `folding: 4 panels in a zigzag; open pose folds to <= 25% of the opening width`
  - `rolling: closed = full slat panel, ajar = half height plus head box, open = head box only`
  - `glass features carry glass opacity`
  - `extrusion layers use ['get','color'] with today's colour as fallback`
- [ ] **Step 2–5** as usual.

### Task 10: Folding and roll-up 2D symbols

**Files:** `opening-symbols.ts`. Test: `opening-symbols.test.ts`.

- [ ] **Step 1:** Failing tests:
  - `folding: one zigzag polyline across the opening with 2 × panels + 1 points`
  - `rolling: dashed shutter line plus two head-box ticks`
- [ ] **Steps 2–5.**

### Task 11: Thumbnails

**Files:** Create `src/components/floor-editor/OpeningThumbnail.tsx`. Test: `__tests__/OpeningThumbnail.test.tsx`.

**Interfaces — Produces:** `<OpeningThumbnail preset={DoorPreset|WindowPreset} size={64} />`. It renders an SVG with a plan view (from `buildOpeningPlanSymbols` on a synthetic 1 m wall) above a front elevation (a frame rectangle plus panel or glass fill in the material colour).

- [ ] **Step 1:** Failing tests:
  - `renders one svg per preset with aria-label = preset label`
  - `fire preset shows the red F`
  - `sliding preset shows an arrow`
- [ ] **Steps 2–5.**

### Task 12: Appearance panel: grid, swatches, apply immediately, apply to similar

**Files:**
- `DoorAppearanceProperties.tsx` (becomes the "Appearance" section)
- `feature-handlers.ts`: new command `door.applyAppearanceToSimilar`
- Tests: `DoorAppearanceProperties.test.tsx`, `packages/editor/src/commands/__tests__/apply-appearance-to-similar.test.ts`

**Interfaces — Produces:** command `door.applyAppearanceToSimilar`
- Payload `{ buildingId, floorId, sourceDoorId, fields: Array<'assetPreset'|'material'|'glass'|'doorOperation'|'doorPose'|'hingeSide'|'swingSide'> }`.
- Matches doors on the same floor with the same effective operation and |width − source width| ≤ 0.1 m.
- One history entry. The inverse restores every target exactly.

- [ ] **Step 1: Failing tests:**
  - `selecting a thumbnail dispatches one door.update {assetPreset}`
  - `material swatch dispatches {material}`
  - `glass choice is hidden for presets without glass`
  - `no Apply button remains; pose select applies on change`
  - `apply-to-similar shows "Apply to 3 similar doors" and undo restores all 3 in one step`
  - `apply-to-similar fails atomically when one target is locked or invalid; document unchanged, no history entry` (Review Focus 5)
- [ ] **Steps 2–5.** Phase 2 gate: run all Phase 1 and 2 files serially.

---

## Phase 3: windows

### Task 13: Window data fields

**Files:** `enums.ts`, `entities.ts`, `feature-handlers.ts`, `opening-style.ts`, `opening-catalog.ts`. Tests: extend `opening-style.test.ts`, `door-style-fields.test.ts` (window cases) and `split-join.test.ts`.

**Interfaces — Produces:**
- `windowAppearance` adds `'jalousie'|'sliding'|'casement'|'awning'|'transom'|'vent-block'`.
- `windowPose?: 'closed'|'open'`.
- `resolveWindowStyle(opening): { type; pose; material; glass }`.
- `WINDOW_PRESETS`, ids `window.fixed`, `window.two-pane`, `window.sliding`, `window.casement`, `window.awning`, `window.jalousie`, `window.transom`, `window.vent-block`, `window.open`. Transom default sill is 2.1 m.

- [ ] **Steps 1–5:**
  - `opening.update accepts each new windowAppearance and rejects 'stained'`
  - `windowPose only valid for casement/awning`
  - Round trip.

### Task 14: Window 3D volumes

**Files:** `window-assets.ts`. Test: `window-assets.test.ts`.

- [ ] **Step 1:** Failing tests:
  - `jalousie: 8 tilted slats (default) within the aperture, tilt 0 closed / 60° open`
  - `sliding: two overlapping panes`
  - `casement open rotates the pane about its side; awning about its top`
  - `transom default sits at sill 2.1 m`
  - `vent-block: grid of solids, no glass`
  - `existing fixed/two-pane/open volumes unchanged (snapshot)`
  - `<= 40 solids`
- [ ] **Steps 2–5.**

### Task 15: Window symbols, thumbnails and panel

**Files:** `opening-symbols.ts`, `OpeningThumbnail.tsx`, `OpeningProperties.tsx`. Tests: the matching test files.

- [ ] **Step 1:** Failing tests:
  - `jalousie adds hatch strokes`
  - `sliding offsets the glass line in two halves`
  - `casement/awning add a dashed swing indicator`
  - `window panel shows 9 thumbnails, applies on click, shows Position only for casement/awning`
- [ ] **Steps 2–5.** Phase 3 gate: all task test files, serially.

### Task 16: Real-Studio check (no save)

- [ ] On localhost:3001 (check port 3001 and the existing launcher/watchdog first), open a test campus floor with walls in my own tab. Place one door per preset and one window per preset in an **unsaved** draft.
- [ ] Check the 2D symbols at zoom 18+, the 2.5D look, Flip and F, and apply-to-similar with its single undo.
- [ ] Run Suggest connections once to confirm door links still work.
- [ ] Leave without saving, force-release only my locks, and record the results in the handoff file.
