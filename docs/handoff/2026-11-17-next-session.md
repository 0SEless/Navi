# Handoff: where we stopped (2026-11-17)

Branch `feat/save-v2` (repo 0SEless/Navi), pushed at 4a8e5035. Full stair history: `2026-11-16-stairs-handoff.md`.
Presentation: Thursday 2026-11-19 (flat 2D campus, 2.5D buildings).

## Done and pushed
- Floor-to-floor stairs: From/To floors, Straight and U-Shape, smooth mesh stairs (terrain stair mesh), railings
  (side + style), Underneath solid/open, Steepness, Landings (position, height, length), Top landing length,
  automatic doorway where an outside stair meets a wall, foot landing, slab hole over inside stairs.
- Floor editor whole-building view (active floor editable, floors above faded).
- NAVI Web: flat ground by default (`flatSite`), smooth stairs, slab holes, door-swing arcs and window lines
  hidden (floor editor keeps them), road design **Campus walkway** as default (grey roads, thin yellow centre,
  warm footpaths with darker edges).
- Checked in the browser on the ASU preview (`/studio/map-asu-ibajay/preview?commit=64&relaxed=1`) and the QA
  campus `map-map-1-375k` (test building "Stair Test Hall", saved #22).

## Next, agreed with the owner (not started)
1. **Zoom-in 2.5D stacked building in Explore.** Zoomed out: solid colour blocks (fill-extrusion), as now.
   Zoomed in on a building: switch to 2.5D with ALL its floors stacked at real heights (whole building visible),
   the current floor highlighted in the building's colour. Zoom out: back to the block. When a building opens,
   the camera pulls back/tilts so the whole stack fits (tall ComDev gets cut off today). Switch zoom ≈ where
   room names become readable (owner may adjust). Owner said NOT to make stacked 2.5D the default at all zooms.
   Where: `src/components/map/layers/FloorArchitectureLayer.tsx` (`selectFloorArchitecture` stacks only floors up
   to the chosen one, for the one open building), `src/components/public/ExploreMap.tsx` (~line 167, 284).
   Every building's floor records are already loaded (`model.indoor.architecture`), so no new data is needed.
   Buildings without floor plans stay blocks.
2. **Name filtering by zoom** (owner: "when I zoom out, it is too much to see"): zoomed out = building names
   only; mid = places (quadrangle, court, waiting shed); close = benches, stores, numbered markers, room names.
   Mostly label layout settings (minzoom / sort key / collision).
3. Still waiting on the owner: hide other floors' route legs (the "tree"), auto-login, a visible Flat/Terrain
   toggle. Later: connect a landing to a floor (decks), stair presets/materials, drag handles.

## FIXED 2026-11-17 (evening): ASU stairs stayed flat in 2.5D
- Cause: the Navigation-mode **Stair** tool makes an undesigned stair (outline only, From = To, auto `links.above`),
  like all of ASU's stairs. On a turned (OSM) building its outline is turned against its saved rotation, and
  `buildStairAssetVolumes` refused it as 'unsupported-footprint' (rectangle check at 1e-8) → no steps, no mesh.
  (The earlier "no custom layer" note was wrong: `map.getStyle()` leaves custom layers out; use `map.getLayer`.)
- Fix: undesigned outlines are checked as rectangles along their own edges (1 mm per metre); steps still come from
  the outline. New `undesignedStairRise` (core stair-floors): such a stair climbs to the next floor up and not at all
  on the top floor; used by `stairRise` and the compiler (artifacts.ts), so editor and NAVI Web agree.
- Checked on the ASU preview (commit 64, relaxed): Computer Science GF + 1F stairs now draw as a 3D switchback at the
  east end; the 2F (top floor) stair no longer climbs through the roof. Designed stairs are unchanged.
- Known: the current floor's flat 2D stair marker (hatched) is still drawn at ground level in NAVI Web.
- Machine memory: vitest workers time out when the dev server and tests run together and memory is low; stop the
  server (port 3001) for test runs. Don't put temp test files under packages/*/src or src/ while the server runs.

## How to run locally
- Worktree `D:\CODEme\Navi\.navi-worktrees\navi-save-v2`. Start the server ONLY with
  `scripts\save-v2\import-data\start-savev2-local.ps1` (port 3001; it sets the Save v2 settings itself — there is
  no .env file here by design; a plain `npx next dev` fails with "Missing Supabase environment variables").
  For scripted editing set `$env:NEXT_PUBLIC_NAVI_SAVE_V2_TEST_HOOKS='1'` first (`window.__naviStudioV2`).
- Tests: `NODE_OPTIONS=--max-old-space-size=3072 npx vitest run --no-file-parallelism <paths>`.
  Known failing before this work: 21 compiler, 4 floor-editor, 3 entrance handler, 1 route-stair, 2 HomeDashboard.
- Plain `tsc` is blocked by the uncommitted `packages/core/src/terrain/__tests__/compose.test.ts`; use a temporary
  tsconfig that excludes it.

## Owner rules (standing)
- Never press Save/Done/Publish or write saved ASU data (map-asu-ibajay) without the owner's explicit OK.
- Never write map-map-5-0y27 or the old navi-development database (scvgulusmutnzasmgysx).
- No commits/pushes without approval; never skip hooks; never expose `.env.import.local`.
- ~80 uncommitted files in the worktree are other terrain work (e.g. plinth removal in SiteLayers/site-data):
  leave them, commit only your own hunks.
- No scratch files under `src/` while the dev server runs. Don't sign in through Google.
