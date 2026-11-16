# Whole-building view and floor-to-floor stairs — design

Status: draft for owner approval (2026-11-16). Branch `feat/save-v2`. Not committed (owner approves commits).

## Intent

For the presentation on Thursday, Nov 19, NAVI Web shows buildings in 2.5D when zoomed in and during
navigation, and a building with stairs should show real stairs that connect its floors. Today the floor editor
edits one floor at a time and each stair is drawn per floor and linked to the next, so nobody can see how they
fit, and a floor 1 stair shows up on floor 2 (bug).

The owner wants to **see the whole building while editing**: floors stacked at their real heights, place a stair
on one floor and see it climb to the floor above — inside or outside the walls — with no guessing of heights.

First target: the **ComDev building** stair tower (owner photo 1): outside the building's end, climb, half-landing,
U-turn, climb to the next floor, repeated per floor, solid low side walls (parapets). Next: the CS building's outside
stair along its wall with a platform at the top (photos 3, 4).

## Owner decisions

- Building-attached stairs are **part of the building** (floor editor), not terrain structures; they show without
  terrain. Free-standing hillside stairs stay in the terrain editor.
- The floor editor gets a **whole-building view**: all floors stacked at real height; each floor can be shown or
  hidden; you **edit the active floor** while the others show faded.
- A stair connects **From one floor To a floor above**; its height comes from the floors, never typed.
- The U-Shape stair type becomes real, with a **Sides** setting (Open / Railing / Solid wall).
- Floor 2 shows the **top of the stair** and a hollow stairwell, not a second stair.
- Outside stairs connect: bottom to the campus walkway, top attaches to the upper floor's hallway at that floor's height (no doors).

## Goals

1. **Whole-building view** in the floor editor: floors stacked at `Floor.elevation`, a list to pick the active floor
   and show/hide each floor; active floor fully drawn and editable, others faded and not editable.
2. **From/To stair**: placed on the active floor (From), with **To** chosen from the floors above. Rise =
   `To.elevation − From.elevation`, kept in sync if floor heights change.
3. Height visible while editing: panel line "Climbs 3.50 m — Floor 1 (0.00 m) → Floor 2 (3.50 m) · 20 × 0.175 m";
   tag "↑ Floor 2" at the stair top in the view; red top + Validate warning when the stair doesn't reach the To floor
   or its top meets nothing walkable.
4. Stair types: **Straight** and **U-Shape** (with **Turn** Left/Right), both with **Sides** and a **Top landing
   length**.
5. The To floor shows the stair's **top**: a dashed, non-walkable stairwell outline with "↓ Floor 1" and a solid
   top landing (walkable). For a stair inside the building outline the To floor's slab is cut open above the flight
   in 2.5D; outside the outline nothing is cut.
6. **Route network**: one stair = one up/down connection. Bottom end on the From floor, top end on the To floor; both
   connect to routes. For an outside stair the bottom end works like a building entrance (map editor "Connect to
   route"), and the top end attaches to the To floor's walkable floor (hallway, corridor, balcony or room) at
   that floor's height, with a visible link line. Doors play no part in stairs.
7. Shown in NAVI Web wherever the building's floors are shown (zoomed in, navigation), drawn once at the right
   height.
8. Bug fixed: a stair is never drawn as a full stair on a floor other than its From floor.

## Non-goals

- Editing several floors at once in the stacked view (clicking floor 3's walls while floor 1 is active).
- L-Shape and Spiral stairs, ramps and bridges (CS ramp to floor 3 comes later, same From/To idea).
- Terrain/ground heights; NAVI Web flat-ground switch and zoom-out block view (separate task, same week).
- Converting existing per-floor linked stairs; they keep working as they are.

## Anti-goals

- A stair that looks connected but isn't in the route network (or the reverse).
- Changing how existing saved stairs look, route or save.
- Writing to the saved ASU campus (`map-asu-ibajay`) without the owner's OK each time.

## Approaches considered

- **A. Real stairs in the floor editor (chosen)**, extended to a whole-building view with From/To stairs. Reuses the
  stair entity (it already has `fromLevel`, `toLevel` and per-floor `levels`), links, routing and the 2.5D stair
  builder. Works with no terrain.
- B. Terrain structure engine tied to the building: has landings and railings but is site-level and ground-based.
- C. Assemble from straight stairs + a landing room + walls: no code, rough look, messy links.
- Within A, editing: **active floor with others faded (chosen)** vs editing anywhere in the stack (every tool would
  need height-aware picking; too risky before Thursday).

## How it fits the existing data

`Staircase` already has `fromLevel`, `toLevel` and `levels` (geometry per access floor). A From/To stair is one
`Staircase` with `fromLevel = From`, `toLevel = To`:
- `levels[From]`: the flight's footprint/drawing (position, rotation, preset, steps, turn, sides, top landing length).
- `levels[To]`: the top end only — top landing and its route connection — marked so renderers draw it as a stairwell
  top, not a stair. (Builder picks the exact marker; it must not be mistaken for a full stair by any reader.)
- `links` stays for the existing per-floor linked stairs; From/To stairs don't need it.

Height: rise is derived from the two floors' `elevation`; the existing per-level `height` override remains for old
stairs only. Builder confirms where floor elevations are computed so the stair updates when a floor height changes.

The bug most likely comes from readers drawing `levels[floor]` as a full stair on every access floor; the builder
reproduces it first, writes a failing test, then fixes it so only the From floor draws the flight.

## Stair shapes

Straight: as today. U-Shape (builder may refine numbers, not the rule):
- Flight 1 has `ceil(n/2)` steps, flight 2 the rest; each step rises `rise / n`.
- Flight 1 climbs along `direction`; a half-landing spans both flights at the far end (depth = flight width) at
  flight 1's top height; flight 2 climbs back beside flight 1 on the `turn` side to the full rise.
- 0.2 m gap between flights (holds the middle wall). Footprint = `2 × width + 0.2` by `ceil(n/2) × stepDepth + width`.
- Top landing length (both types): extra level landing at the top, along the flight direction, default = flight
  width; this is the platform in CS photo 3.

Sides (both types; absent = Open, so old stairs are unchanged):
- Open: no sides.
- Railing: thin dark rail about 0.9 m above the treads, stepped per tread.
- Solid wall: parapet about 1.0 m above the treads on the outer sides (and between U flights), stepped per tread,
  in the floor's wall colour.
MapLibre extrusions cannot slope, so stepped pieces are accepted.

My call: hide L-Shape and Spiral from the Type list until they are drawn; stairs already using them keep their marker.

## Editing flow

1. Open the building in the floor editor → whole-building view; pick Floor 1 as active (Floor 2, 3 faded above).
2. Stair tool → choose Straight or U-Shape → place it (inside or outside the walls) → To defaults to the floor above.
3. The view shows the stair rising to Floor 2's faded slab; panel shows the climb line.
4. Doors play no part in stairs. The top landing sits at Floor 2's height and attaches to Floor 2's walkable floor
   (hallway, corridor, balcony or room drawn on Floor 2), inside or outside the building alike. It snaps to the
   nearest walkable area within about 1.5 m and joins Floor 2's route there; if it touches none, the top is red with
   "Top doesn't reach Floor 2's hallway".
5. Switch active floor to Floor 2: the stair shows as stairwell + top landing; the link to Floor 2's hallway is visible.
6. Outside stair: in the map editor, its bottom appears as a connectable point (like an entrance); "Connect to route".

One Undo step per placement or property change; unchanged Apply makes no Undo step.

## Route network

The compiler makes one vertical connection per From/To stair between its bottom point (From floor) and top point
(To floor). Bottom of an outside stair = an outdoor way into the building (like an entrance); top = joins the To
floor's route where its top landing touches the hallway. Validate warns when either end is unconnected. Existing linked stairs compile as today.
Builder checks the vertical-transition and graph-adapter code and the compiler's entrance rules.

## NAVI Web

Wherever the open building's floors are drawn (zoomed in, navigation), each From/To stair is drawn once, from its
From floor's height to its To floor's height, with sides, plus stairwell cut-outs for inside stairs. Builder confirms
each caller of the stair asset builder (floor editor preview, NAVI Web floor architecture, stacked floors).

## Proof

- Unit: U-shape step heights rise across both flights; landing height; footprint; left/right mirror; sides pieces;
  rise follows floor elevations; old stairs (no sides/turn, per-floor links) unchanged.
- Bug: failing test first, then fix.
- Routing: a From/To stair (inside and outside) gives one vertical connection; outside bottom connects like an
  entrance; Validate warnings for unconnected ends.
- Save round-trip, compiler and publisher keep the new fields; Undo exact.
- Browser check on a test campus (never the saved ASU campus): 3-floor test building, an inside straight stair 1→2
  and an outside U-stair tower 1→2→3 with solid sides; whole-building view, Floor 2 view, NAVI Web zoomed in and a
  route over the stairs. Screenshots for the owner.
- Then, with the owner's OK only, build ComDev's stair tower on ASU.

## Left to the builder

Exact numbers within the rules, colours, fade strength, the floor list layout, the marker for a stair's top-only
level, snap distance tuning.
