# NAVI Web Navigation: Gate Screen, Safe Starting Points, Active Navigation

## Status

Design agreed in brainstorming on 2026-11-02. Waiting for owner review of this written spec before an implementation plan is written.

Sub-project 3 of 4. Builds on the campus-only map from sub-project 2 (`2026-11-02-navi-terrain-2.5d-stairs-design.md`, Section 5).

## Goal

NAVI is a navigation app for inside the campus only. Visitors and new students find a destination and are guided there, from a screen at the gate or on their phone, without trusting GPS more than it deserves.

## Out of scope

- Panoramas / street-view photos: removed from NAVI's scope by the owner. Removing the existing panorama fields and code (`hasPanorama`, panorama hotspots) is a separate cleanup task, not part of this design.
- 3D routes as a navigation feature. Navigation is 2D; the route line follows the terrain and stairs as defined in sub-project 2.
- Anything outside the campus boundary.

## Existing behaviour (verified from code, 2026-11-02)

- Navigation stages: `setup → route-preview → active → arrived` (`src/lib/navigation-experience.ts`).
- Starting point search ("Search a supported origin"), QR scanning and QR deep links (`src/components/map/QRScanner.tsx`, `src/hooks/useQrNavigateDeepLink.ts`) on `src/app/(public)/map/navigate/page.tsx`.
- Remaining distance, ETA, step browsing, off-route status.
- Progress comes only from GPS projection onto the route (`computeRouteProgress`).
- GPS is snapped to the nearest route point without using its accuracy (`packages/runtime/src/position/position-engine.ts` stores `accuracy` but does not use it).
- No gate screen (kiosk) mode. No shortening of the walked part of the route line was found.

## Design

### 1. Gate screen mode (Proposed)

- A gate screen is anchored to an existing QR checkpoint, for example "Main Gate". It opens at a URL for that checkpoint (for example `/kiosk/<checkpointId>`), so no new data type is needed.
- The start is fixed at that checkpoint. The screen shows search only: the user picks a destination and sees the route from the gate.
- Large touch-friendly controls. Returns to the start screen after about 60 s without use.
- **Continue on your phone**: the screen shows a QR code that opens the same route on a phone, ready to start.

### 2. Safe starting points on phones (Proposed)

In order of reliability:

1. **Scan a QR** at a checkpoint or door.
2. **Search where you are**: any room, building or place can be a starting point ("CS302", "3rd floor, Computer Science").
3. **GPS as a suggestion only**: "You seem to be near the Library (±25 m). Is that right?" The user must confirm. GPS is ignored when its accuracy is worse than 15 m, and while the user is inside a building (from their last confirmed position until the route leaves through an entrance).

### 3. Active navigation (Agreed flow)

1. Set the start (QR, search, gate screen, or confirmed GPS).
2. Choose a destination.
3. **Preview**: whole route, distance, time, stairs and floor changes; **Start**.
4. **Navigate**:
   - The walked part of the line disappears; only the way ahead stays bright.
   - Instruction card at the top ("In 20 m, turn left at the Library", "Take the stairs up to 3F") with a preview of the next instruction.
   - The map follows the user and turns to the walking direction; the user can switch to north-up.
   - Bottom bar: remaining distance, time, **End**.
   - At an entrance or stairs, the map switches to that floor's plan.
5. **Arrive**: "You've arrived at CS302", then end.

### 4. How progress moves (Agreed)

- **Following GPS**: outdoors with accuracy 15 m or better, progress moves by itself.
- **Step by step**: otherwise the user taps **Next** (or swipes) at each instruction's landmark, and the line shortens to that point.
- **QR re-anchor**: scanning any QR during navigation jumps progress to that exact point.
- A small label always shows the current mode ("Following GPS" / "Tap Next at each step").
- **"You seem off the route"** appears only in GPS mode with accuracy 15 m or better, and offers **Recalculate** or **I'm fine**.

## Error handling

- A QR checkpoint without a routing anchor keeps today's message ("no routing anchor is published") and asks for another start.
- If the destination cannot be reached, the preview says so and shows no Start button.
- Losing GPS during "Following GPS" switches to step by step and says so.

## Testing

- Unit: progress source selection (accuracy ≤ 15 m outdoors → GPS; worse or indoors → step by step), GPS suggestion requires confirmation, QR re-anchor sets progress, off-route only in GPS mode, trimmed route line from the current progress.
- Unit: gate screen fixed start, idle reset, hand-off QR contains the route.
- Existing navigation suites stay green.
- Browser: gate screen route to a 3F room; phone flow with QR start, step-by-step progress, floor switch at the stairs, arrival.

## Open items

- Which campus places get gate screens and QR checkpoints (owner and campus staff).
- Instruction wording in English only, or also Filipino (not discussed; English assumed).
