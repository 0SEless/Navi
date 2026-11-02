# NAVI Route Linking: Leeway, Door Auto-Connect, Stair Entry Points

## Status

Design agreed in brainstorming on 2026-11-02. Waiting for owner review of this written spec before an implementation plan is written.

Sub-project 1 of 4 (route linking → terrain, 2.5D and stairs → NAVI Web navigation → building 3D models).

## Goal

Make connecting the route network fast and accurate in Studio:

1. Connecting to a route line no longer needs a pixel-perfect click.
2. Doors are linked to their floor's route network with one gesture, or automatically, and an automatic link is never a slanted shortcut, never crosses a wall and never leaves the floor.
3. On upper floors, the stair (or elevator) landing is the floor's entry point, linked to that floor's route network the same way.

The per-floor workflow this supports:

1. Place the doors.
2. Draw the floor's route network.
3. Connect the route network to the floor's entry points: entrances on the ground floor, stair or elevator landings on upper floors.
4. Auto-connect the doors.

## Out of scope

- Automatic wall detection from floor plan images (tested, then dropped by the owner; walls stay manual).
- Automatic linking to outdoor roads. Linking an entrance to an outdoor road stays a manual step on the campus map.
- Cleaning up the older link fields (`Entrance.connectorRoadId`, `Road.connectorEntranceId`). New code writes only the current link records; old fields are left untouched.
- Any change to how routes are compiled, how NAVI Web shows stairs, or the internal 0.5 m merge rule.

## Existing behaviour (verified from code, 2026-11-02)

- Pick radius for connecting to route junctions and lines is `ROUTE_NETWORK_THRESHOLDS.snapRadiusMeters = 0.5` m in world space (`packages/core/src/route-network/definitions.ts`, used by `useVertexEditor.ts`, `road-connectivity.ts`, `road-junction-geometry.ts`). Starting a route at an entrance allows `ENTRANCE_ROUTE_START_TOLERANCE_METERS = 3` (`src/components/floor-editor/entrance-route-authoring.ts`).
- Building entrance to indoor route: `Floor.entranceAccess[]` (`EntranceAccess`: `entranceId`, `outdoorNodeId`, `indoorRouteNodeId`, optional `outdoorRouteId` + `outdoorPosition`). The compiler treats a record as authoritative as soon as it exists, even if an endpoint is missing, and then suppresses the legacy entrance fallback (`canonical-access-compiler.ts`, "Presence establishes authority").
- Room door to route: `Floor.roomAttributes[].accessPoints[]` (`RoomAccess`) link a room to route nodes.
- Stairs: `Staircase` has `levels` (access floors) and `VerticalTransition.connections[]` holds one `{ floorId, routeNodeId }` per floor.
- New campuses use canonical connectivity: lines that cross do not connect unless a junction is authored.

## Design

### 1. Pick leeway (screen space)

- Hit-testing for route lines, route points, junctions, doors and entry points uses a screen radius of 14 px, converted to metres at the current zoom.
- Before the click, the target is highlighted: a magnet dot on a line, a ring on a point or junction.
- The stored position is exact: a click on a line places the point on the line, not at the cursor.
- `snapRadiusMeters`, `dedupeMergeMeters` and every data threshold stay unchanged. Only pointer hit-testing changes.

### 2. Link gesture

- Drag from a door or an entry point to a route line or route point and release.
- Dropping on a line adds a route point on the line at the drop position (splitting the edge). Dropping on a point uses it.
- What gets written:
  - Room door: the room's access point to that route node (`RoomAccess`).
  - Stair or elevator landing: that floor's `VerticalTransition` connection to that route node.
  - Building entrance (indoor side): the route node at the entrance that the entrance's `EntranceAccess.indoorRouteNodeId` will use.
- A building entrance's `EntranceAccess` record is written only when both sides exist (indoor node and outdoor road). A half-made record is never saved, because a partial record disables the legacy fallback and can make the building unreachable.
- Unknown: how the current floor editor keeps the chosen indoor route start for an entrance before its outdoor side exists. The implementation plan must read that flow first and reuse it; if it needs a new field, the plan proposes it.
- The same accuracy rules as auto-connect apply to manual links: a link that would cross a wall shows red and is not saved.
- Unlinked doors and entry points show a hollow marker.

### 3. Auto-connect doors

A **Connect doors** action on a floor proposes links, shows them as a preview, lets the admin untick any, then applies the rest in one undo step.

A proposed link must pass every rule; otherwise the door is skipped, never guessed:

1. Same floor and same building only. Never to outdoor roads, never to another floor.
2. A straight line from the door to the nearest point on a route line of that floor, meeting the line at a right angle. If the right-angle point falls off the end of the line, the link may go to the line's end point only if it still passes rules 3–5.
3. It crosses no wall (except through the door's own opening) and stays inside the building outline.
4. Room doors link from the hallway side of the door, so the link never crosses the room.
5. Length at most 5 m.

Skipped doors are listed with the reason, for example "no straight path without crossing a wall" or "nearest route is 7.2 m away".

### 4. Entry points

- Every stair or elevator landing on a floor shows as an entry point marker on that floor, styled like an entrance.
- It is linked with the link gesture or by auto-connect (the same rules; the landing replaces the door).
- New check **"floor can't be reached"**: a floor that has a route network but whose route network connects to no entrance and no stair or elevator landing. Severity: warning (publishing with warnings is allowed after confirmation, R70).

## Error handling

- A link whose target route point was deleted is removed together with that point by the existing relationship cleanup, and the door returns to "unlinked".
- Auto-connect on a floor with no route network does nothing and says "Draw the floor's route network first".
- All link edits go through the existing command system, so undo/redo and Save v2 drafts work unchanged.

## Testing

- Unit tests for the auto-connect rules: perpendicular link accepted; link through a wall rejected; link leaving the outline rejected; room-side link rejected; >5 m rejected; skip reasons reported.
- Unit tests that `EntranceAccess` is only written with both sides present.
- Unit tests for the "floor can't be reached" check (ground floor with entrance passes; upper floor linked only through a stair passes; floor linked to nothing warns).
- Pointer tests: a click 10 px from a line at two zoom levels connects; stored geometry lies exactly on the line.
- Existing route network, compiler and floor editor suites stay green (vitest compare against the recorded baseline; tsc gate).
- Browser check on a two-floor fixture: draw routes, link the stair landing on 2F, auto-connect doors, publish, route from the entrance to a 2F room in NAVI Web.
