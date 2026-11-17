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

## Stair looks (2026-11-17, late; owner: "add some design on the stairs … 50% or 70% of the railing will be
## cemented, then there will be a railing" and "the stair is still hollow … put a block there")
- New railing style **Half wall + rail** (`half-wall`): concrete wall 0.6 m above the slope with a metal rail on top
  (0.95 m); **Solid wall** is now really solid to 0.95 m. Before this, mesh.ts ignored railingStyle entirely (Bars and
  Glass still look like Posts and rails).
- Stair-tool stairs (no design) have a `look` on their level geometry (railings / railingStyle / underneath),
  default: both sides, half wall, solid. Panel shows Railings / Railing style / Underneath for them
  (`ToolStairLook` in StairClimbProperties → feature.update `patch.look`); compiler publishes `look`.
- A stair outside the floor's walls (walls not on all four sides of its centre) is filled down to the ground:
  `buildFloorArchitectureAssets({ ground })` → `floorStairMesh(..., ground)`. NAVI Web passes the building's lowest
  floor; the floor editor's faded floors pass 0 (the edited floor). terrain-floors.ts not changed (shared terrain work).
- Solid stairs are closed at both ends (mesh.ts end caps): the top end used to show the hollow inside.
- U-stair turn platform: railing on every edge no flight joins (`buildRailingMesh` in mesh.ts, `edgeJoinsSteps` in
  floor-stair-mesh.ts). Panel **Platform railing** (U-Shape only): Same as stair (default) / None / Posts and rails /
  Half wall + rail / Solid wall → drawing `platformRailingStyle`.
- mesh.ts and structures/types.ts also hold someone else's uncommitted "platforms to a floor" (decks/landingFloors)
  work; only my hunks were staged. When decks land, the half walls should open where a deck meets the flight.
- Owner wants next (interviewed 2026-11-17): stairs drawn like a route — Stair tool: click start, click each turn
  (= rest platform), double-click end; heights split evenly by default, a typed height per platform; a platform can
  "open onto" a floor it is level with (doorway + route). Not started. The normal Stair tool today makes only
  outline stairs (no Type/U, no landings); designed stairs exist only via script.
- Machine memory: vitest workers time out when the dev server and tests run together and memory is low; stop the
  server (port 3001) for test runs. Don't put temp test files under packages/*/src or src/ while the server runs.

## User app review fixes (2026-11-18; tested in the student app with ASU via NAVI_WEB_LOCAL_PREVIEW_CAMPUSES)
- Real names: destination/start use the place name (src/lib/route-directions.ts `readablePlaceLabel`), never route
  point ids like "N-112".
- Readable directions: `describeDirections` groups route points into walk / turn left-right / enter-exit /
  stairs-elevator / arrive with rounded distances (ComDev: 28 steps -> 4). Entering a building onto an upper floor
  (hillside) is "enter", not stairs. Next/Back jump a whole direction; route preview "All steps" uses them too.
- Navigate layout: active card compact and at the bottom (one status line, no raw type badge, no legend), map buttons
  move up during navigation; recent destinations hide once a destination is set; readable "No route" card with a hint.
- See-through panels fixed: Tailwind 3 cannot do `bg-[var(--navi-x)]/95` (no CSS at all); replaced with
  `bg-[color:color-mix(in_srgb,var(--navi-x)_95%,transparent)]` in 10 user-app files.
- Camera faces the building's front: `focusCamera(..., front)` + `buildingFront(nodes, id)` (main/front-named
  entrance, else lowest floor). Search results now fly to the building too (ExploreMap reacts to a picked building
  with its card open; zoom-selection does not fly).
- Hidden roads: `siteRoadSurfaces` skips roads with displayMode "navigation-only" (ASU has 5).
- Still open from the review: campus is forgotten on page refresh (blank Explore); many ASU rooms are named just
  "Room"; map does not follow the current step during navigation; Home screen polish; ASU Computer Science upper
  floors not connected to routes (data). No POI exists at the north road end near the Tourism Building (owner adds).

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
