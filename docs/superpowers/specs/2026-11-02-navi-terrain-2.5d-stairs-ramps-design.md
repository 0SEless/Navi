# NAVI Terrain, 2.5D Buildings, Stairs and Ramps

## Status

Approved by the owner 2026-11-02 (ramps and road surfaces added the same day). Design agreed section by section in brainstorming (2026-11-01 to 2026-11-02). Waiting for owner review of this written spec before an implementation plan is written.

Sub-project 2 of 4. It replaces the E8.4 terrain-area design (`2026-10-30-navi-e84-terrain-authoring-design.md`): the owner chose "surface only", so named terrain areas are dropped.

Claim labels: **Agreed** (owner decided), **Verified** (checked in code or in the throwaway test), **Proposed** (designed here, approved with the section), **Unknown** (to check during planning).

## Goal

Model the hillside campus like clay in a sandbox, place buildings and their floors at their real heights, connect floors to roads with good-looking stairs, and show the result to visitors as the campus base map, offline, in one package.

## Out of scope

- Walkways, bridges, platforms, centre rails and half-circle landings (later; the data model leaves room for them).
- Uploaded textures and imported building 3D models (later sub-project; both need cloud file storage, which Save v2 does not have).
- Anything outside the campus boundary in NAVI Web.
- Navigation behaviour (sub-project 3) and route linking tools (sub-project 1).

## 1. Ground model

### Layers (Agreed)

1. **Base ground**, built from an imported source (TopoExport `.glb` ground mesh or GeoJSON contours) or from contours traced in Studio. Studio stores the small source, not a grid, so the base can always be rebuilt.
2. **Your changes**: brush and lasso edits stored as raise/lower amounts.
3. **Fits**: automatic shaping around buildings, roads and paths, worked out from their settings (off, raise only, lower only, both; blend width).

Final ground = base + changes + fits. Studio computes fits live; publishing bakes everything into one terrain file.

### Grid and storage (Agreed)

- 1 m height grid over the campus boundary plus a 20 m margin.
- Changes are Int16 centimetres of raise (+) or lower (−); the baked terrain file stores final heights as Int16 centimetres relative to the campus height reference (±327 m range).
- Changes are stored in 128 m × 128 m tiles as `terrain-tile` parts (Verified: the part kind already exists in `src/studio-v2/parts/part-keys.ts`). Only touched tiles exist; an absent tile means "no change". One tile is at most 32 KB.
- The grid origin is fixed when terrain is first created and never moves.
- The base source and the height reference are stored in the `terrain` part.
- Terrain parts belong to the `terrain` lock zone (Agreed: terrain stays locked).

### Height reference (Agreed)

Set once at the top of the terrain workspace: a name and what 0 m means. An import sets it to "sea level (from the imported data)". Building `baseElevation` is already "metres above sea level" (Verified, `entities.ts`).

### Import (Proposed, approved with Section 1)

- **TopoExport `.glb`**: read only the `TPX_Ground_*` mesh (Verified on the ASU-Ibajay export: 588 points, about 20 m apart, 1.8–35.5 m, local metres from the frame's south-west corner). Buildings and roads in the file are ignored.
- **GeoJSON contours**: line features with an `elevation` property. Surface built from the lines.
- Coordinates in UTM (EPSG:326xx/327xx, read from the file's `crs`) are converted to map coordinates by Studio. A `.glb` needs its frame: the matching frame GeoJSON, or the user places the corner.
- Re-importing later asks: keep my changes, or clear them.
- Source limits stated in the UI: the TopoExport data comes from a 30 m elevation model, so it gives the hill's broad shape and can be off by a few metres.

### Colours in the editor (Agreed)

- **Heights view**: green at the campus's lowest ground → yellow → red at the highest (about 0–40 m for ASU-Ibajay), fixed when set or imported, not shifting while sculpting.
- **Changes view**: raised red, lowered blue, scale ±5 m.
- These colours appear only in the editor.

### Size estimate

About 211,000 heights for ASU-Ibajay (537 m × 393 m): about 420 KB raw, an estimated 100–250 KB compressed in the published package.

## 2. Terrain workspace

### Getting in and out (Agreed)

- A **Terrain** button opens a separate workspace; **Done** saves terrain changes and returns. If the save fails, the user stays with the message.
- Opening asks for the terrain lock. If another admin holds it, the workspace opens view-only and shows their name.
- First visit with no terrain: Import ground, Trace contours over a tracing image, or Start flat (name the reference).

### Layout (Agreed, layout "C")

- Top bar: height reference, view switch (Heights / Changes / Contours), exaggeration ×1–×5, Undo/Redo, save status, Done.
- Left rail: Raise/Lower, Smooth, Flatten, Slope, Lasso (set / raise by / lower by), Height picker, Building pad, Reset, Contour pen.
- Right panel: tool settings; layers (buildings, roads and paths, structures, contour lines, tracing image kept on this computer only).
- Main view: top view. A live mini 3D window (drag, tilt, rotate; swap to make 3D the main view; pop out). Editing works in both.

### Brushes (Agreed)

- Shapes: circle, oval, rectangle, triangle, with rotation.
- Profiles: flat top, smooth, linear, hard.
- Modes: raise only, lower only, set to height.
- Size 1–60 m, strength 1–100%, target height typed or picked.
- Shortcuts: `B` brush, `[` `]` size, `Shift` opposite, `Alt`+click pick height, `Ctrl+Z`/`Ctrl+Y`, `Ctrl+S`.
- One stroke or lasso action is one undo step. Only tiles under the brush are recalculated while painting. Edits outside the grid are ignored and the brush outline turns grey.

### Campus boundary (Agreed)

An **Edit boundary** tool (here and in campus settings). Growing the boundary adds grid area (base where available, otherwise flat). Shrinking hides ground outside the boundary but keeps it, so nothing is lost by mistake.

## 3. Buildings on the terrain

### Base height (Agreed)

- **Follow ground** (default): average ground height under the building outline; updates when nearby ground changes.
- **Fixed**: typed, or dragged up/down in 3D. **Snap to ground** returns to Follow ground.

### Building pad (Agreed)

Per-building pad settings: off, raise only, lower only, both (default), blend width (default 3 m). The pad is a fit computed from building settings, so changing it needs only that building's lock, never the terrain lock.

### After import (Agreed)

When an import finishes, Studio offers (ticked by default) to set all buildings to Follow ground. Buildings set to Fixed keep their height.

### Floors in 3D (Agreed)

- Every floor is a solid, opaque slab at its real height (base height + `Floor.elevation`). Slab shape = building outline (Verified: floors have no outline of their own).
- **Cut away above** hides the slabs above a selected floor.
- The floor plan editor is unchanged.
- No publish warning about doors being above or below the ground.

## 4. Stairs

### Concept (Agreed)

- Structures are visual only. Routes are drawn over them with the route tools; a route on a structure takes its height from the structure surface.
- First version (owner, 2026-11-02): **outdoor stairs first, then ramps**. Both use the stretch block, presets and the same 3D drawing.

### Ramps (Agreed, owner 2026-11-02)

- A ramp is the same stretch block with a smooth sloped top instead of steps; open or solid underneath; railings like stairs.
- Landings are placed by the user (drag along the ramp). The panel shows the slope (for example "1:10") and the run between landings.
- No pass/fail mark until the owner confirms the BP 344 limit (1:12 or 1:20); after that the panel marks slopes and runs that exceed it. Nothing blocks publishing.

### Stretch block (Agreed)

1. Place a block; it sits on the ground.
2. Stretch one end to a floor slab edge (it snaps at that floor's height and slides along the edge).
3. Stretch the other end to a road, path or the ground (it takes that height).
4. Bend handle for curves.

### Stair shape (Proposed)

- Risers about 0.175 m (count = rise ÷ 0.175, rounded), treads 0.30 m.
- When the stair is longer than the steps need, the extra becomes flat landings; the user drags where the flight starts and ends.
- Underneath: **open** (smooth sloped slab underneath, 0.2 m thick) or **solid** (sides go down into the ground).
- Railings: left, right or both; posts every 1.2 m, top rail 0.95 m and mid rail 0.45 m above the slope line.
- Panel shows steps, riser, tread, flight length and hints like "needs 5.7 m, drawn 4.0 m". Nothing blocks publishing.
- Handles are drawn at their real height (not on the ground).

### Presets (Agreed)

- A preset has a **shape** (width, steps, landings, railing sides, open/solid) and a **look** (material per part: treads, sides, underside, railing; railing style: posts and rails, vertical bars, glass panels, solid low wall).
- **Swap preset** replaces the design and keeps both ends and the route.
- Admins can save an adjusted stair as a new preset. A starter set ships with Studio.
- First version: built-in material library only, shipped with the app.

### Saving and following (Proposed)

- Stairs and presets are saved as two new free part kinds (no lock): `map/structure` (one per stair) and `map/structure-preset` (one per preset).
- When the building moves or floor heights change, the stair's top end follows. If the building is deleted, the stair keeps its last height and shows a marker.
- Wheelchair access stays a setting on the route, not the stair.

### Roads as the outdoor route network (Agreed, owner 2026-11-02)

The outdoor route network is the roads and paths. In the terrain workspace's 3D view and in NAVI Web, each road and path is drawn as a surface at its own width lying on the terrain, so what visitors see as roads is exactly the network routes use.

### Road and path heights (Agreed)

Each road gets a height setting: **Follow ground** (default) or **Typed** (existing `startElevationMeters`/`endElevationMeters`). Follow ground reads the surface under the route, including stairs. Publishing writes those heights into the package without overwriting the saved road. Roads that already have typed heights keep them.

### Rendering (Verified in a throwaway test, 2026-11-02)

- MapLibre's normal 3D layer (`fill-extrusion`) lifts each block by the ground height at the block's centre and sinks blocks with base 0 by 10 m. It can only draw flat-topped boxes, which gave jagged stairs.
- MapLibre's custom 3D layer (raw WebGL, no new dependency) draws real meshes: treads, risers, smooth sloped underside, solid sides, landings, railings following the slope. Rebuilding a 55 m stair took about 1 ms.
- Ground heights generated in the browser matched MapLibre's terrain heights within 5 cm at four points, and meshes sat on the terrain.
- Not yet solved: drawing handles at their real height; textures (needs UV mapping in the same layer).

## 5. NAVI Web: campus-only terrain map

### Campus only (Agreed with the owner's panel)

- Nothing is drawn outside the campus boundary: no street map, no town. Outside is a plain background.
- The view is locked to the campus (pan and zoom limits).
- "Only in the campus" means the map shows only the campus; the app does not refuse to open off campus.

### Look (Agreed)

- Inside the boundary: NAVI's own ground in a soft natural colour with hillshade, plus roads and paths, buildings and stairs. Optional faint contour lines every 5 m.
- 2D top view by default. A 3D view is optional and only for looking around.
- The route line follows the terrain like the road it is on; on stairs it follows the stair surface.

### Publishing (Agreed)

1. Studio computes the final ground and bakes one terrain file (1 m, Int16 cm, campus plus margin).
2. The file goes into the campus package with the campus data and the stairs and presets used.
3. NAVI Web turns it into terrain in the browser through `maplibregl.addProtocol` (Verified in the test).

### Safety rules (Agreed)

- A campus without terrain shows flat ground, as today.
- The terrain file belongs to its publication; visitors never get terrain from one publication with roads from another.
- Studio preview shows exactly what visitors see.

### Unknown

Whether NAVI Web already keeps the published campus package for offline use. The plan checks this first; if not, offline storage becomes a task.

## Build order (Proposed)

1. Ground model, import and the terrain part data (no UI beyond import), with the baked file.
2. Terrain workspace: views, brushes, lasso, boundary edit, mini 3D.
3. Buildings on terrain: follow ground, pads, solid floor slabs in 3D.
4. Custom 3D layer and outdoor stairs: stretch block, shape maths, open/solid, railings, presets, built-in materials; roads drawn as surfaces on the terrain; road Follow ground.
5. Ramps: smooth sloped stretch block, user-placed landings, slope readout.
6. NAVI Web: campus-only map, hillshade ground, terrain from the package, roads as surfaces, route line on terrain, stairs and ramps.

Each phase ends with the existing gates green (vitest compare, tsc gate, DB tests, Save v2 browser probe).

## Testing

- Unit: grid/tile maths (tile addressing, Int16 limits, absent tiles), base from `.glb` and from contours, final = base + changes + fits, colour scale, follow-ground average, pad fits, stair maths (riser count, landings, "needs X m"), road surface heights.
- Save v2: terrain-tile parts save and reload; terrain lock respected; stairs and presets save as free parts.
- Rendering: the stair mesh builder is pure and tested by geometry (vertex counts, underside straight, rails follow the slope line).
- Browser: import the ASU-Ibajay TopoExport files, sculpt, place a building, stretch a stair from 3F to a road, publish, open NAVI Web, check terrain, stair and route line.

## Open items

- BP 344 ramp slope (1:12 or 1:20) — needed only when ramps are added.
- Offline package caching in NAVI Web (Unknown above).
- Uploaded textures and building 3D models: later sub-project with a cloud storage design.
