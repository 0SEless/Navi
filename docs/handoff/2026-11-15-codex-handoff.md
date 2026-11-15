# NAVI handoff for Codex — 2026-11-15

Presentation: **November 19**. Owner (Jeperson) drives; ask before anything irreversible.

## Where things are

- **Repo / worktree:** `D:\CODEme\Navi\.navi-worktrees\navi-save-v2`, branch **`feat/save-v2`**. Work only here.
- **Last commit:** `d3abbbc` (pushed to `origin/feat/save-v2`). Push with `env -u GITHUB_TOKEN git push origin feat/save-v2`.
- **Uncommitted (23 changed + 9 new files, all tested, not yet committed — owner has not approved this commit yet):**
  road platforms + seamless junctions, Set-to-height/Smooth/Lasso/Slope runaway fix, Remove spikes, road banks,
  stair road ends on the road edge, OSM tile zoom cap, "Map not found" fix. See "Done this session" below.
- **Dev server:** `http://localhost:3001`, started by `scripts/save-v2/import-data/start-savev2-local.ps1`
  (memory watchdog: `scripts/save-v2/import-data/watchdog-savev2.ps1`, stops Next above 3 GB). Check port 3001
  before starting anything; never run two dev servers.
- **Live campus:** ASU Ibajay, campus id **`map-asu-ibajay`** on Supabase project **navi-studio-v2**
  (`ztbnicoiwjghzttchqmp`). Last saved commit **#55** (everything from this session's edits is saved, no local
  draft left).
- **Plans/specs/ledger:** `docs/superpowers/specs/2026-11-15-*.md`, `docs/superpowers/plans/2026-11-15-*.md`,
  ledger `.superpowers/sdd/2026-11-15-building-banks-plinths/progress.md` (git-ignored, has every ruling).

## Owner rules (still in force)

- Never press **Save / Done / Publish** or write saved campus data without the owner's explicit OK each time.
- Never write the old `navi-development` database or the trial campus **`map-map-5-0y27`** (the Studio list card
  for it is also titled "ASU-IBAJAY" — the real one is `map-asu-ibajay`, 20 buildings).
- No commits without the owner's approval; never expose `.env.import.local`; don't use Validate's "clear reference"
  autofixes; keep tests focused, serial, memory-limited; avoid a full build.
- Do not create scratch files under `src/` while the dev server runs (Tailwind scans them; a deleted file breaks
  `globals.css` until `.next/dev/cache/turbopack` is cleared and the server restarted).
- No ground inside any building outline (walls included).
- **Roads are the ground ("the road is the terrain itself")**: a road's height comes only from the road — its ends,
  its pins and the roads it meets — never from the hill. No bumps, no waves.
- The in-app browser blocks `confirm()`. Studio now *sets aside* unsaved work on a blocked "Restore it?" (never
  deletes it); a **Restore** button in the terrain top bar / save status brings it back. Save often.

## Test commands

```bash
cd /d/CODEme/Navi/.navi-worktrees/navi-save-v2
NODE_OPTIONS=--max-old-space-size=3072 npx vitest run --no-file-parallelism packages/core packages/editor/src/commands src/lib src/components/terrain src/components/map/site src/studio-v2/parts
NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit   # filter the output to the files you changed; the repo has ~5000 old errors
```

Last run: **2181 passed, 3 failed**. The 3 failures are pre-existing (entrance handlers, `handlers.test.ts` and
`handlers-edge-cases.test.ts`: commit `f98f666` moved entrances to building-local x/y, tests still pass lat/lng).
Also pre-existing elsewhere: `publish.test.ts` "commit whose parts differ", 7 StudioWorkspace/validation-workspace
tests (mock lacks `useWorkflow`), HomeDashboard 2, navigate dev-sim 1, 4 floor-editor tests.

## How the terrain works now (key code)

- `packages/core/src/terrain/compose.ts` — `createTerrainSampler`: base + sculpting tiles + meshes = ground; then
  buildings (inside outline = floor; uphill 1 m walkway + bank 1/3·1/2·1; downhill plinth, no fill; "slopes" fills;
  "leave") and roads (`fitAt`).
- **Roads** (`compose.ts` + `road-grade.ts`): every road whose `groundFit.mode` is not `'off'` (none = Raise and lower,
  3 m shoulder) is a **platform**: level across, straight grades between control points (`platformProfile`).
  `grade.shape: 'follow'` keeps the old smoothed profile. Stair routes (`routing.structureId`) never shape ground.
  `junctionShapes`: **T** — the side road yields inside the main road and starts at its edge height; **X** — both
  roads level across the crossing square. Own pins inside a junction are ignored. Beside a road: level shoulder
  (Edge width), then a 1-in-2 bank back to the hill (reach 40 m, 5 m ease).
- **Brushes** (`brush.ts`, `area-ops.ts`): Set-to-height, Flatten, Smooth, Lasso set, Slope compare with
  `sampler.sculptedAt` (the layer they write). They used the final height before → runaway sculpting (−283…+203 m)
  beside buildings. `remove-spikes.ts` + Terrain list → Sculpting → **spikes** button cleans it (ASU: 1,102 cells
  fixed and saved).
- **Stairs**: `src/lib/terrain/structure-snap.ts` (point inside a building → nearest wall; anywhere on a road → road
  edge), `resolveStructureEnds` puts road ends on the road edge facing the stair; `structure-profile.ts` = stair
  landings, steepness, typed landing heights.
- **Terrain editor 3D**: `TerrainFloorsLayer` shows the open building's floors like NAVI Web; plinths in
  `building-slabs.ts` / `site-data.ts`.

## Done this session on ASU (saved, #52–#55)

- New 8 m stair from **paakyat** (top) down to road **15** (bottom), full-length flight (22 steps), connected to the
  walking routes; the old Untitled road `T-1-awth` under it deleted.
- paakyat: 8 pins — even climb to 3.8 m at 44 m, then level 3.8 m to the end. Road 15: even descent 1.51 → 0 m, then
  level. Untitled `T-1-nnxz`: Platform, its 4.83 m pin at the paakyat junction is now overruled.
- Sculpting spikes removed (1,102 cells).

## Still to do (owner's list, in order)

1. **Commit** the uncommitted work above (ask the owner first), then push for the preview.
2. **Data steps left on ASU roads** (rule is fine; data is not):
   - `T-1-s0k2` (7 m) has ends ~4 m apart on a cliff edge → pin its ends or flatten the cliff; `T-30-m7ld` steps where
     it joins it.
   - `T-2-xerv`: 0.64 m step at its end on the Untitled road; `T-1-z1n8`, `T-9-vt2m`: < 0.3 m at their ends.
   - Untitled `T-1-nnxz` overlaps the ADMINISTRATIVE BUILDING corner by ~1.6 m (road 5 m wide, centre line 0.9–1.5 m
     from the wall) → shift it ~2 m or narrow it (owner to choose).
3. **Building levels** (from the owner's photos): ComDev 2nd floor = **7.99 m** (floor 4.49 + 3.5). Raise to 7.99 m and
   half-bury with banks: **Sports and Cultural Office, ASU Ibajay Hotel, HM Building 2, HM Building**. Level the study
   area / walkway near ComDev at 7.99 m. Ask the owner: which building is "**Kamsai**" (its stair is buried under the
   terrain) and whether "**AB**" means the ASU Ibajay Hotel.
4. **Stairs from the photos**: hotel → stairs down → plaza with tables → stairs down → paakyat. Use stair landings +
   steepness; attach ends to walls/road edges; Connect to route in the main editor. Show the owner before saving.
5. **Admin plinth colour**: the grey band around the Admin building is its plinth (floor fixed 2.79 m, ground lower on
   one side) — owner wants it to read as part of the building → use the wall colour.
6. Check the road in front of the Computer Science building (zigzag cliff) now that roads are platforms.
7. Before publishing: Validate, then Publish (owner's OK).

## Gotchas

- Navigating between the map editor and the terrain editor reloads the Studio session; in the in-app browser that
  sets unsaved work aside — press **Restore** or save first.
- A core code change makes the open page fully reload (same effect).
- `terrain.apply-tiles` is the one-undo-step way to write sculpting; `road.set-grade` for road grade/pins;
  `building.set-ground` for floor mode, Ground around, Bank slope.
- QA campus `map-map-1-375k` has one set-aside local draft (a stair part) that is not ours — leave it.
