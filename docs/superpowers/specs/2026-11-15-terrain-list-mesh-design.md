# Terrain list, terrain mesh and road grading

Date: 2026-11-15 · Status: draft for owner approval (revised the same day: side view, Keep bumps / Smooth out,
sliding lines instead of free sideways points, shared junction heights — owner agreed to all four) · Owner wants the whole scope built today (before the
19 November presentation).

## Intent and why

The owner (and their groupmates, who are not CAD or terrain experts) shape the ASU Ibajay hillside in Studio's
terrain editor. Today every tool paints the ground once (brush, Flatten, Lasso, Slope): an edit cannot be selected
again, adjusted or moved, so precise work (a flat road, a level yard, a steep bank at the front gate) means
repainting by feel and starting over for every correction. Roads lie on whatever bumps are under them.

The owner wants **one clear, smooth way to shape the ground with precise control and live feedback**, built
around a workflow they already know from digital art: a **mesh** with points and lines they drag, laid over an
area they declare first, editable again at any time from a list. **Ease of use is the top priority.**

Research behind the design (2026-11-15): roads that own their ground (Cities: Skylines, Unreal landscape splines,
InfraWorks roadside grading with a smooth vs follow-terrain profile choice); stamped pads with a typed height
(SketchUp Stamp, whose missing numeric height is its top complaint; Civil 3D pads); non-destructive edit layers
(Unreal landscape edit layers); spot heights with smooth fill between (Genesis II). Brush flattening is reported as
hard to master (Planet Zoo / Planet Coaster players), so the brush stays for rough work only.

## Goals

1. **Terrain list**: one panel listing everything that shapes the ground, each item selectable, editable, hideable
   and deletable at any time, in this fixed priority order (higher wins where they overlap):
   Buildings (their own floors, as today) > Roads > Meshes (in list order) > Sculpting > Original ground.
2. **Terrain mesh**: lasso an area; a grid of points and lines appears over it as a see-through sheet; select a
   Point, a whole Row, a whole Column, or a Box of points; drag ▲/▼ to bulge up or down; slide a whole line along
   the mesh to move where a slope starts or ends; Soft makes neighbours follow smoothly; add lines for finer
   control; a **side view** strip shows the selected row, column or road as a slice with points dragged straight
   up and down against the ground before; each mesh either **keeps the ground's bumps** or **smooths them out**; type exact heights or pick them from
   the map; the ground under the sheet updates **live**; Confirm keeps the mesh as a list item, Cancel leaves the
   ground exactly as it was.
3. **Road grading**: a road can grade the ground under and beside it: Grade ground (Off / Raise only / Lower only /
   Raise and lower), Edge width, a **Smooth ↔ Follow hill** slider, and optional height pins along the road. The
   grading moves with the road.
4. **Sculpting layer**: every existing painted edit (brush, Flatten, Lasso, Slope, Reset, contour surface) lives in
   one "Sculpting" item that can be hidden (view only) or cleared.
5. **Helpers**: a live height readout under the cursor, and a **Too steep** colour view.
6. Everything is undoable, saved with the campus through Save v2, and NAVI Web shows exactly the graded result.

## Non-goals

- New brush types, or making old painted strokes individually editable (they stay inside Sculpting).
- Curved road plan shapes or road banking.
- Real 3D overhangs or caves (the ground stays a height field).

## Anti-goals (failure even if it works)

- A mesh changing ground **outside its lasso outline**.
- Rogue behaviour: a drag affecting points the owner did not select (beyond the Soft radius they set), or a mesh
  that can fold over itself (lines never cross: there is no free sideways dragging of single points).
- A new mesh changing the ground before the owner has moved anything.
- A step in the ground where two graded roads meet.
- A save that needs a Save v2 database change (no new part type, no migration).
- NAVI Web showing ground that differs from Studio.
- Existing campuses changing look: with no meshes or graded roads, the ground is exactly as today.

## Constraints

- Terrain is a height field: original ground (imported) plus change tiles (Sculpting) plus fits computed on the fly
  in `createTerrainSampler` (building pads, road fits) — `packages/core/src/terrain/compose.ts`. Publish bakes the
  sampler's result into the site artifact, so NAVI Web follows automatically.
- Save v2 stores the campus as typed parts with a fixed list of part kinds in the database; the `terrain` part
  accepts extra fields, roads are `map/road` parts. No new part kind.
- Editing requires the Save v2 terrain lock, like every terrain tool.

## Approaches considered

- **A. Meshes and road grading as editable layers in the terrain engine (chosen).** The sampler evaluates
  meshes and road grading on the fly like building pads; live preview recomputes only the tiles under the edited
  mesh. One source of truth; nothing is baked unless the owner chooses Merge.
- **B. A separate 3D mesh object merged into the ground on Confirm.** Rejected: two copies of the ground that drift
  apart; re-editing means un-merging (the restart problem the owner wants to avoid).
- **C. Dragging the terrain's own 1 m grid points.** Rejected: thousands of points, jagged results, rogue edits.

## Design (decided)

### Data

- `CampusTerrain.meshes?: TerrainMesh[]` (inside the `terrain` part; list order = priority among meshes):
  ```
  TerrainMesh {
    id, name,
    outline: LatLng[]            // the lasso area (≥ 3 points); the hard limit
    origin: { x, y }, angleRad   // the grid's frame in terrain-grid metres (aligned to the outline's longest edge)
    rowsAt: number[], colsAt: number[]   // each line's position along the frame (metres, strictly increasing,
                                 //   ≥ 2 each); sliding a line changes one entry and can never pass a neighbour
    mode: 'keep-bumps' | 'smooth'        // default 'keep-bumps'
    z: number[]                  // rows × cols, row-major. keep-bumps: metres added to the ground below;
                                 //   smooth: absolute heights (m)
    edgeWidthM: number           // fade from full effect to none, measured inward from the outline
    softM: number                // the Soft radius the editor uses when dragging (saved for next time)
    hidden?: boolean             // view-only toggle in Studio; Publish ignores it (see below)
  }
  ```
- `Road.groundFit` (existing: mode + `blendMeters` = Edge width) plus
  `Road.grade?: { smoothness: number (0 = follow hill … 1 = smooth); pins?: Array<{ alongM: number; heightM: number }> }`.
- `CampusTerrain.sculptingHidden?: boolean` (view-only in Studio).

### Ground computation (core sampler)

Order, from bottom: original ground → Sculpting (change tiles) → meshes in list order → road grading → building
floors. Each layer replaces the height below it inside its area, faded by its edge:

- **Mesh**: for a point inside the outline, find its place in the grid frame (a rotation, then its cell from
  `rowsAt` / `colsAt`; the grid stays rectangular so there is nothing to invert or fold), and read a smooth value
  through the grid's `z` (Catmull-Rom across rows and columns). *Keep bumps*: the value is added to the ground
  below. *Smooth out*: the value replaces it. Either way the effect is weighted from 1 (at `edgeWidthM` or more
  inside the outline) to 0 (at the outline). Points outside the outline are never changed; inside the outline but
  beyond the grid's outer lines, the outer lines' values continue. A new mesh is keep-bumps with every `z` = 0, so
  it changes nothing. Switching mode converts `z` (ground at each point added or subtracted) so the points stay
  where they are.
- **Road grading**: the road's profile is the ground along its centreline, smoothed over a window from ~4 m
  (Follow hill) to ~60 m (Smooth), passing exactly through any pins; across the road the ground is set to the
  profile, and beyond the road edge it blends over the Edge width, honouring Raise only / Lower only. **Where
  graded roads meet (ends within a road's half width of another road), they share one height at that junction**
  (the mean of their profiles there, or a pin if one sits on it), and each profile is eased to it, so there is no
  step.
- **Hidden** meshes and a hidden Sculpting layer are hidden only in Studio's view; **Publish always uses every
  item** (so a hide can never ship a different campus by accident).

### Studio: the Terrain list (left panel)

Replaces the Layers panel's top part (layer visibility toggles move into a compact row). Groups: Buildings, Roads,
Meshes, Sculpting, Original ground. Clicking an item selects it on the map and opens its panel on the right; the eye
hides it; meshes can be dragged to reorder; each item has Delete (undoable). Map look and Road style stay below.

### Studio: Mesh tool (M)

1. Draw the lasso (click points, double-click/Enter to close). A mesh of 4 × 4 lines fills the outline's box,
   aligned to its longest edge, with every point at the current ground height. Nothing changes yet; the sheet is
   drawn see-through over the ground.
2. Selection bar: **Point / Row / Column / Box**, **Shift** adds to the selection, **Soft** slider (0–30 m),
   **+ Line** (click a sheet edge to insert a row or column there, heights interpolated).
3. Drag handles (reusing the stairs' drag arrows): **▲/▼** changes the selected points' heights; hovering a
   line shows ▲/▼ for that line; with a Row or Column selected, the **side arrows slide that whole line** along the
   mesh (it stops before its neighbours). The panel has **Keep bumps / Smooth out**.
   **Side view**: selecting a row, a column or (in Grade) a road opens a strip along the bottom of the view showing
   that slice from the side: the ground before (grey dashes), the result, and the points, dragged straight up and
   down with their heights shown; it and the 3D view update each other live.
   With Soft > 0, unselected points within the radius follow with a smooth falloff. Every point shows its height;
   the panel accepts typed heights and **Pick from map**; **Level all** switches the mesh to Smooth out and sets
   every point to one height (a flat platform).
4. **Live preview**: while dragging, only the tiles under the mesh are recomputed; the previewed ground is tinted.
5. **Confirm** saves the mesh as a list item (one undo step for the whole session of edits since opening); **Cancel**
   restores the ground; **Merge into ground** (in the item's menu) bakes it into Sculpting and removes the mesh.

### Studio: Grade tool (G)

Click a road: its panel shows Grade ground, Edge width, Smooth ↔ Follow hill, and its pins (click on the road to add
one, pre-filled with the ground height; retype or remove). Changes preview live and are one undo step each.

### Studio: helpers

- Height readout: the existing cursor height label, always on in the Mesh and Grade tools.
- **Too steep** toggle in the top bar: ground steeper than 1 : 4 tinted amber, steeper than 1 : 2 tinted red.

### Commands (all undoable)

`terrain.mesh.add`, `terrain.mesh.update`, `terrain.mesh.remove`, `terrain.mesh.reorder`, `terrain.mesh.merge`,
`road.set-grade`, `terrain.sculpting.clear`, `terrain.set-view` (hidden flags). `terrain.setup` keeps meshes.

## Testing

Core tests for every rule above (outline as a hard limit, edge fade, a new mesh changing nothing, both modes and
the mode switch, line sliding limits, smooth surface, priority order, road profile smoothing and pins, shared
junction heights, Publish ignoring hidden flags); command tests (each command and its undo);
Save v2 split/join round trip with meshes and graded roads; component tests for the list, the selection modes, the side view and
Confirm/Cancel; a live check on ASU (front gate slope, a flat platform, a graded road) in Studio and in the local
NAVI Web view.

## Left to the builder

- Exact layout, icons and keyboard details, matching the mockup shown to the owner on 2026-11-15.
- Smoothing window shape and default Soft radius; the default grid size for very long or thin outlines.
- How live preview reuses the existing terrain tile worker/override path.
- Performance targets: dragging stays smooth (preview updates within ~100 ms) on ASU-sized meshes.
