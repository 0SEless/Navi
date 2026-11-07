# NAVI terrain redesign, section 5: the terrain editor opens like NAVI Studio

Date: 2026-11-07. Status: **Agreed** with the owner in chat (design approved: "Yes, write it up").
Branch: `feat/terrain-2.5d` (worktree `navi-save-v2`). Follows sections 1–4 of the terrain redesign.

## Why

The owner tested the preview on their real campus (ASU-IBAJAY, `map-map-5-0y27`) and found:

- Terrain opened on a blank "This campus has no terrain yet" page with choice cards, not on the campus.
- Importing did nothing. Cause (**Verified**, read-only query on navi-studio-v2): the boundary drawn in the
  create-map wizard is saved in the campus settings (`studio.campuses.settings.boundary`, used by the map
  list) but never in the map document (`document.boundary`), and `terrain.setup` refuses without the
  document boundary ("Draw the campus boundary first").
- A stale terrain lock held by the owner's own other tab left them in view-only.

Owner's words, summarised: the street map stays as its own layer and we edit our own ground layer on
top of it; layers can be turned on and off; the ground starts flat so we can raise it by hand, or
import a `.glb` with its `frame.geojson`; it should feel like NAVI Studio but focused on terrain, with
a guide; the boundary drawn at map creation must be used and must be expandable later (for example to
take in a mountain) without making a new map.

## What the owner gets

### 1. Opening Terrain

- Terrain opens straight onto the campus: street map, flat ground at 0 m, buildings, boundary.
- No first-visit page, no choice cards, no "name the height reference" form.
- Just looking changes nothing. The terrain is created on the first edit (brush stroke, boundary
  change, stair) or import, with the reference **"Campus ground"** (0 m = the flat starting ground).
  The owner can rename it later; naming is not asked.
- An import of TopoExport files switches the heights to metres above sea level, as today.

### 2. Boundary

- **One boundary.** When the document has no boundary, Terrain uses the campus settings boundary from
  map creation. It is copied into the document on the first edit, so old maps (ASU-IBAJAY) work.
- Changing the boundary in Terrain also updates the campus settings boundary when the owner presses
  Done, so the main editor, the map list and NAVI Web all show the same boundary.
- **Edit boundary tool** (key E, existing): drag a corner; click on an edge to add a corner there;
  select a corner and press Delete to remove it (a boundary keeps at least 3 corners).
- **Expanding** the boundary adds flat ground at 0 m (or the surrounding imported/brushed heights where
  tiles already exist), ready to raise or import.
- **Shrinking** hides the ground outside the boundary (the existing outside veil) but keeps the tiles,
  so expanding again brings the work back.
- Brushes work inside the boundary only (as today).

### 3. Layout like NAVI Studio (adapted from today's terrain screen, not rebuilt)

- **Left panel: Layers**, each with an eye (on/off):
  street map (+ see-through slider), ground (+ see-through slider), contour lines, buildings
  (the plain building shapes), roads, stairs and ramps, boundary.
  The choices are remembered per browser.
- **Bottom tool dock**, styled like the Studio tool dock: Move, Raise/Lower, Smooth, Flatten,
  Set height, Edit boundary, Stairs, Import terrain. The letter keys stay as they are; the tool
  settings (brush size, strength, target height) show above the dock for the active tool.
- **Top bar** stays: 3D, Colours (Off / Height / Changes), Height ×, Done.
- Everything already built stays: brushes and paint preview, neutral ground, contours, the Colours
  switch, 3D, Shift+Z height mode for buildings and stairs, stairs and ramps, the cursor height label,
  camera limits, road markings.

### 4. Street map underneath

- Studio's terrain editor shows the street map (the same OpenStreetMap tiles as the main editor) as
  the bottom layer. The ground layer draws on top with a see-through slider (starts at 50 %).
- In 3D the street map lies on the hill's shape.
- Studio only. NAVI Web stays campus-only (no outside map tiles), as built in Task 15.

### 5. Import terrain

- A dock button opens the import panel built on 2026-11-07 (files added one at a time or dropped
  together, a list with remove buttons, "Still needed: …", refusals shown).
- With edits already made it offers "Keep my changes" / "Clear my changes", as today.

### 6. First-open guide

- Four short steps, each pointing at its part of the screen: Layers, the tool dock, Import terrain, Done.
- Shown once per browser; a "?" button in the top bar replays it.

### 7. Lock held by yourself

- When the terrain lock is held by the same account (another tab, or a closed tab whose lock has not
  timed out yet), the banner says so and offers **"Take over here"**, which releases the old lock and
  takes it in this tab. A lock held by a different admin stays view-only, as today.

### 8. Cleanup

- The old "Terrain areas" box on the main editor (`TerrainAreaAuthoring`, the developer-looking panel
  with gesture counters) is removed from the Studio canvas.
- The first-visit screen (`TerrainFirstVisit`) is removed; its import panel stays and moves to the dock.

## Not in this section

- 2.5D/3D building models, and hiding the plain building shapes once those exist (separate topic, on hold).
- NAVI Web changes.
- Studio's map preview page loader (existing follow-up).

## Constraints

- The protected Dev Supabase project is never touched. Database work, if any, targets navi-studio-v2
  only and needs the owner's approval first. **Unknown** until the plan reads the code: how the campus
  settings are written today. If keeping the settings boundary in step needs a server or database
  change, the plan says so and that step waits for the owner's approval.
- Terrain zone stays locked; buildings keep their own locks.
- Nothing pushed. The preview is redeployed for the owner's testing.

## How it is checked

- Unit tests for each part (flat start without a terrain part, boundary fallback and copy, add/remove
  corner, layers on/off, dock, import from the dock, guide shown once, take-over offer for the same account).
- The full browser lane (`node e2e/save-v2/run.mjs`), with a new test: a campus whose boundary is only in
  the settings opens Terrain flat, raises a stroke, expands the boundary, imports the TopoExport files
  one at a time, presses Done, and the boundary matches in the settings and the document.
- Gates: vitest regressed 0; tsc at baseline.
- A new preview, then a check in the owner's Chrome on ASU-IBAJAY up to (not including) saving.
