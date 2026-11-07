# NAVI: outdoor stairs in the map editor, connected to routes, and a preview before publishing

Date: 2026-11-07. Status: **Written, waiting for owner review.** Branch `feat/save-v2` (worktree `navi-save-v2`).

## Why

- **Stairs are not part of navigation (Verified in code).** An outdoor stair or ramp is placed in the terrain editor and
  knows its two ends — the top end a building's floor edge (`StructureEnd` `slab`: building, floor, edge), the bottom
  end a road (`road`: road id, position) or the ground. But it is only drawn ("Outdoor structures: visual only. Routes
  are drawn over them with the route tools", `packages/core/src/structures/types.ts`). Nothing joins it to the route
  network, so visitors are never routed over it.
- **The map editor does not show stairs (Verified).** Roads and routes are drawn in the map editor, which has no stairs
  on it, so there is nothing to connect to.
- **No real preview before publishing (Verified).** The Studio Preview page (`/studio/<id>/preview`, `MapPreview.tsx`)
  is a flat map of the buildings. The ground, roads as surfaces, stairs and routes are only seen on NAVI Web after
  Publish.

## Decisions already made (owner, 2026-11-07)

- The terrain editor and the map editor stay **two editors**. Stairs and ramps are still placed and shaped in the
  terrain editor (opened with **Terrain** in the map editor's top bar).
- The map editor shows each saved stair as a **flat marking** — no 3D in the map editor.
- Connecting is a click flow: **click the stair → Connect to route → click a route → Confirm.**
- The owner asked for a **preview before publishing**.

## What the owner gets

1. In the map editor every outdoor stair and ramp is visible as a marking, and can be connected to the routes in a few
   clicks; NAVI suggests the right route so usually one click on Confirm is enough.
2. After connecting, visitors are routed over the stair — up to the right floor of the right building.
3. A **Preview** that shows the saved campus exactly as visitors will see it on NAVI Web (ground, roads, stairs,
   buildings, 3D, search and a route test), without publishing.
4. Nothing changes in how stairs are shaped, how roads are drawn, saving, or publishing.

## Design

### 1. Stair markings in the map editor

- Each stair: its outline (the run between both ends, at its width) with a line across for every step and an arrow
  pointing uphill. Each ramp: the outline with an arrow uphill, no step lines. Drawn flat on the map under routes and
  labels, in the editor's neutral colours.
- A marking shows its state: **not connected** (dashed outline), **connected** (solid), **out of step** (warning colour,
  see 4).
- Clicking a marking selects the stair and opens its panel on the right: name/preset, which building and floor the top
  end reaches, which road the bottom end touches, its connection state, and the buttons **Connect to route** /
  **Disconnect** and **Edit in terrain editor** (opens the terrain editor on that stair).
- Markings are read-only in the map editor (the shape is changed in the terrain editor).
- Unverified: whether the map editor's document already carries `structures` (it is built by `EditorBridge` from the
  graph store). The plan checks this first; if not, the map editor reads the saved `map/structure` parts.

### 2. Connect to route

Click **Connect to route** on a selected stair:

1. **Bottom end.** NAVI pre-selects the road the bottom end already touches (from the stair). If the bottom end is on
   the ground, nothing is pre-selected. The owner may click any other route line instead. The pick uses the same pick
   distance as the other route tools.
2. **Top end.** NAVI looks for an **entrance on the floor the top end reaches**, near that end (within 3 m — the same
   tolerance the floor editor uses to start a route at an entrance). If one is found it is pre-selected. If none is
   found the panel says **"Add an entrance on <floor> here first"** with a button that opens the floor editor on that
   floor at that edge; Confirm is disabled until an entrance exists. A stair whose top end is on the ground or a road
   (not a building) connects route-to-route instead.
3. **Confirm** writes, as one undo step:
   - a **stair path**: a road/path from the bottom end to the top end along the stair's centre line, with
     `routing.feature = 'stairs'` (or `'ramp'`, with the ramp's slope class) — the outdoor route type NAVI already
     routes and already marks as not step-free (Verified: `RoadRoutingFeature`, parity test P5);
   - a **road junction** joining the stair path to the chosen route at the bottom;
   - an **entrance link** (`EntranceAccess`) from the stair path's top end to the chosen entrance, so the route
     continues into that floor's indoor routes.
   The stair path remembers its stair (`routing.structureId`), and its heights follow the stair surface (roads already
   take their height from the surface under them, including stairs).
4. **Disconnect** removes exactly what Confirm wrote (one undo step).

Saving: the stair path, junction and entrance link are ordinary road / junction / floor data, saved with the existing
parts — no new part kind, no server or database change. The floor's entrance link lives in that building's floor data,
so connecting needs that building's edit lock (the existing building lock; the panel says who holds it if someone else
does).

### 3. The Computer Science building case (rule)

- A stair **inside the building's walls** (between floors) is an indoor stair: placed in the floor editor; it already
  links floors.
- A stair **outside the walls, even attached to the building** (CS building's outer stair) is an outdoor stair:
  placed in the terrain editor, connected here. Its top end reaches a floor through an entrance placed on that floor.
  A building can have entrances on several floors (1F at the lower road, 2F at the top of the outer stair) — each is its
  own way in.

### 4. Keeping it in step

- If the stair is moved or reshaped in the terrain editor, or its building's floor heights change, its stair path is
  recomputed in the **same undo step** (the path follows the stair; the junction and entrance link keep their ids).
- If that is not possible (the stair was deleted, its top end moved to another floor, the chosen route or entrance was
  deleted), **Validate** shows a route error on the stair — "Stair route out of step: <reason>" — with a **Fix** that
  disconnects and reopens Connect. Route errors already block publishing (Verified: R33 gate in
  `publish-handlers.ts`), so a broken stair route never reaches visitors.

### 5. Preview before publishing

- A new **Preview** button in the map editor's top bar (next to Publish) opens the existing preview address
  `/studio/<id>/preview`, now showing the **NAVI Web visitor map** of the **latest saved version**: campus-only map,
  ground, roads as surfaces, stairs, buildings, 2D/3D, search, and a route test from A to B (to try a stair route).
- A banner says **"Preview — not published. Showing the version saved at <time>."** Unsaved changes are not in the
  preview; if there are any, the Preview button asks **"Save first?"** (Save and preview / Preview last save).
- Built on the server from the saved version with the same steps as Publish (join the saved parts, route check,
  compile, visitor map package) **without writing a publication**. Problems are listed the same way Publish lists them,
  so the preview doubles as a dry run of Publish.
- Only admins who can edit the campus can open it; nothing is cached for visitors.

## Constraints

- No database or server schema change; the preview is a new read-only server route next to the publish route.
- Dev Supabase untouched; Save v2 data stays on navi-studio-v2; nothing to production.
- Existing roads, entrances and published campuses are untouched until an admin connects a stair.
- Plain-language UI text as written above.

## Not in this work

- Combining the two editors (discussed; the owner chose two editors).
- 3D in the map editor.
- Automatic connecting without Confirm, and the door auto-connect / stair-landing work of the route-linking spec
  (2026-11-02), which stays its own sub-project.
- Elevators and indoor stairs (floor editor, unchanged).

## Testing

- Unit: marking geometry (step lines, arrow), suggestion of bottom road and top entrance, Confirm/Disconnect as one
  undo step each, recompute after a stair move, the out-of-step problems.
- Browser lane: connect a stair on the ASU-IBAJAY copy, route test in the preview goes up the stair into 2F, publish,
  NAVI Web routes the same way; preview without publishing writes no publication. Parity test P11 (the preview page
  renders the saved campus) is updated to the visitor map.
