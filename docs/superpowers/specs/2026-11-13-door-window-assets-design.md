# Door and window assets: design (all three phases)

Date: 2026-11-13. Status: draft for owner review. Not committed (session rule).

## Goal

Make doors and windows read correctly and look right in Studio (2D and 2.5D) and NAVI Web:
- correct opening behaviour per door type
- standard plan symbols
- a small catalog of real-world looks, including window types common on Philippine campuses

Door and window looks stay **visual only**. They never change navigation routes.

## Today (verified 2026-11-13)

| Area | Today | Problem |
|---|---|---|
| Door look (`doorAppearance`) | `solid`, `glass`, `double-solid`, `double-glass`, `open` | Fine, but a dropdown with no preview |
| Door pose (`doorPose`) | `closed`, `ajar` (30°), `open` (90°) | No hinge side or swing direction; the leaf always opens the same way |
| Door type (`doorType`) | `standard`, `opening`, `fire`, `double`, `sliding` | Only `opening` and `double` change the 3D. `fire` looks standard. `sliding` swings like a hinged door |
| Window look (`windowAppearance`) | `open`, `fixed`, `two-pane` | No jalousie/louvre, sliding, casement, awning, transom or vent block |
| 2D plan | Door: green rectangle or 6 px green line with a "D"; window: 4 px blue line (`FloorEditorCanvas.tsx` ~157–237) | No swing arc, so swing can't be read from the plan |
| Materials | One fixed colour per piece | No wood/steel/aluminium/glass choice |
| Controls | `DoorAppearanceProperties.tsx`, `OpeningProperties.tsx`: dropdowns plus an "Apply" button | No preview, no thumbnails, no apply-to-similar |

Geometry lives in `packages/core/src/geometry/door-assets.ts` and `window-assets.ts`. NAVI Web gets the same fields through `NavigationRenderModel.ts`.

## Principles

1. **Additive and optional.** Every new field is optional. Absence renders exactly as today, so existing saves (including ASU save #7) look unchanged until someone edits them. No data migration.
2. **Type and style stay separate.**
   - **Operation** says how it opens: hinged, sliding, folding, rolling or none.
   - **Style** says what it looks like: preset, material, glass.
   - `doorType` keeps its navigation meaning (`opening` is always passable) and isn't extended.
3. **One source of geometry.** A core builder produces both the 2D symbol and the 3D volumes, so Studio, thumbnails and NAVI Web always agree.
4. **Built-in library only** (owner rule): fixed presets and materials, no uploads or custom textures.
5. **Visual only.** A test proves that changing any appearance field leaves compiled navigation output byte-identical.

## Data model (new optional fields)

On `RoomDoor` and on door `Opening`s:

| Field | Values | Absent means |
|---|---|---|
| `doorOperation` | `'hinged' \| 'sliding' \| 'folding' \| 'rolling' \| 'none'` | Derived: `opening` → `none`, `sliding` → `sliding`, otherwise `hinged` |
| `hingeSide` | `'start' \| 'end'` (the end of the opening, along the host wall's direction) | `start` |
| `swingSide` | `'left' \| 'right'` (side of the wall, looking from wall start to wall end) | The side `buildDoorAssetVolumes` rotates the leaf toward today, so absent fields render unchanged |
| `assetPreset` | catalog id, e.g. `door.wood.single` | Today's look from `doorAppearance` |
| `material` | `'wood' \| 'painted-steel' \| 'aluminium' \| 'fire-red'` | From the preset |
| `glass` | `'clear' \| 'frosted' \| 'tinted'` | `clear` |

On window `Opening`s:
- `windowAppearance` gains `'jalousie' | 'sliding' | 'casement' | 'awning' | 'transom' | 'vent-block'`. The existing values stay.
- `material` and `glass` work as for doors.
- Casement and awning windows also take `windowPose` (`'closed' | 'open'`).

Hinge and swing are relative to the host wall, never absolute angles, so they stay right when a door is moved along its wall. Free legacy doors with no host wall use the door's `rotation` as the wall direction.

Save v2: these fields live inside floor parts (no new part kinds). `split`/`join` must round-trip them. Content rules must accept them, and a round-trip test proves it.

## The catalog (`packages/core/src/assets/opening-catalog.ts`)

Each preset is data: id, label, operation, leaf count, panel style (solid, glass, half-glass, louvred, slats), default material, glass, and default width and height.

**Doors**

| Preset | Operation | Look |
|---|---|---|
| Wood door | hinged | solid leaf, wood |
| Half-glass wood door | hinged | wood with an upper glass pane |
| Steel door | hinged | painted steel |
| Fire door | hinged | fire-red leaf, thicker frame, red marker on the 2D symbol |
| Glass door | hinged | aluminium frame, full glass |
| Double wood door | hinged, 2 leaves | |
| Double glass door | hinged, 2 leaves | aluminium |
| Sliding glass door | sliding | two panels on a track; one slides over the other |
| Folding door | folding | 4 hinged panels that fold into a zigzag (gym, hall) |
| Roll-up shutter | rolling | slatted shutter with a head box (canteen, storage) |
| Archway | none | frame only (today's `open`) |

**Windows**

| Preset | Look |
|---|---|
| Fixed | single pane |
| Two-pane | today's two-pane |
| Sliding | two panes, one offset |
| Casement | side-hinged pane |
| Awning | top-hinged pane |
| Jalousie / louvre | horizontal glass slats |
| Transom | high, short pane (default sill 2.1 m) |
| Vent block | grid pattern, no glass |
| Open aperture | today's `open` |

**Materials** (fixed palette with one colour each, readable in light and dark): wood `#8B5E3C`, painted steel `#6B7280`, aluminium `#C0C7CF`, fire-red `#B91C1C`. Glass: clear (cyan, 35 % opacity), frosted (white, 55 %), tinted (slate, 45 %).

## 2D plan symbols (`packages/core/src/geometry/opening-symbols.ts`)

`buildOpeningPlanSymbols(walls, openings, doors)` returns GeoJSON lines and polygons in building-local coordinates. Studio's floor canvas and NAVI Web's 2D view both draw them.

- **Hinged single:** leaf line from the hinge, drawn at the current pose (default 90° for the symbol), plus a quarter-circle swing arc of radius equal to the leaf width (24 segments) on the swing side.
- **Hinged double:** two leaves and two arcs meeting in the middle.
- **Sliding:** two parallel offset panel lines inside the wall thickness, with a small arrow along the slide direction.
- **Folding:** zigzag polyline across the opening.
- **Rolling:** a dashed line across the opening, with a short head-box tick on both ends.
- **Archway:** wall gap only, with jamb ticks.
- **Fire door:** hinged symbol plus a small red "F" marker.
- **Windows:** three thin parallel lines across the wall thickness (outer face, glass, inner face). Jalousie adds short hatch strokes. Sliding offsets the middle line in two halves. Casement and awning add a short dashed swing indicator.

Symbols appear from zoom 18, so the campus overview isn't cluttered. The existing green and blue fills stay, lighter, as the selectable hit area.

## 3D volumes (extend `door-assets.ts` and `window-assets.ts`)

- **Hinge and swing:** the leaf pivot uses `hingeSide`, and its rotation sign uses `swingSide`. Ajar and open poses rotate toward the swing side.
- **Sliding:** panels translate along the wall (closed = side by side; ajar = one panel half over the other; open = fully over). They never rotate.
- **Folding:** N narrow panels in a zigzag; the fold angle grows with pose.
- **Rolling:** closed = full slatted panel. Ajar = half-height panel plus head box. Open = head box only.
- **Fire:** frame depth × 1.5, fire-red leaf.
- **Materials:** every feature gets a `color` property, and fill-extrusion layers use `['get','color']`. Glass gets its own opacity layer, as today.
- **Windows:** jalousie = 6–10 thin tilted slats; sliding = two overlapping panes; casement and awning = a pane rotated about its side or top when open; transom = high short pane; vent block = a grid of small solids with no glass.
- **Budget:** at most about 40 solids per opening, and invalid input is omitted, never guessed (same rule as today).

## Studio controls

The "Door representation" section becomes **Appearance** (`DoorAppearanceProperties.tsx`, `OpeningProperties.tsx`):
- A **thumbnail grid** of catalog presets, drawn as small SVGs from the same symbol builder plus a front elevation. The selected card is highlighted, and archway shows for `opening`.
- **Hinge** toggle (start / end), **Swing** toggle (left / right) and a **Flip** button that swaps swing side, also on keyboard **F** while a door is selected.
- **Position**: Closed / Ajar / Open, plus Closed / Open for casement and awning windows.
- **Material** swatches and **Glass** choice where the preset has glass.
- **Changes apply immediately** as one undoable command each; the "Apply" button goes away. Typing in width and height fields still commits on Enter or blur.
- **"Apply to all similar on this floor":** same operation and width within ±0.1 m. One command, undone in one step, with a confirmation that names the count.
- Locked floors and read-only sessions show everything disabled, as today.

## NAVI Web

Uses the same builders, read-only. 2D symbols show at high zoom, and 3D shows materials and pose. Visitors can't change appearance. Navigation and routing don't read any of these fields.

## Testing (per phase, test-first, focused and serial)

- Core builders: symbol shapes for each operation and side (arc radius, arc side, leaf at hinge), sliding translation with no rotation, folding panel count, rolling states, window types, materials on features, budget limits, and bad input omitted.
- Backward compatibility: a door or window with only today's fields renders the same volumes as before (snapshot).
- Save v2: split/join round trip with every new field; content rules accept them.
- Visual only: compiled navigation output is unchanged when only appearance fields change.
- Studio: properties panel tests for presets, flip, apply-immediately, apply-to-similar (one undo), and disabled when locked. One real-Studio check on a test campus, unsaved.

## Phases

**Phase 1: correctness**
- Data fields: `doorOperation`, `hingeSide`, `swingSide`.
- 2D symbols for hinged, double, sliding, archway, fire and windows (fixed, two-pane, open).
- 3D: hinge and swing, sliding translation, fire look.
- Controls: hinge, swing and Flip toggles.
- Done when: a door's swing is readable on the plan and in 2.5D, Flip mirrors both, sliding doors slide, fire doors look distinct, and existing saves look unchanged.

**Phase 2: catalog**
- `assetPreset`, `material` and `glass`; catalog file; thumbnail grid; materials in 3D.
- Folding and roll-up doors; apply-immediately; apply-to-similar.
- Done when: every preset renders in 2D, 3D and as a thumbnail, and apply-to-similar works with one undo.

**Phase 3: windows**
- New `windowAppearance` values, `windowPose`, window symbols and volumes, window thumbnails.
- Done when: all window presets render in 2D, 3D and as thumbnails, including jalousie.

## Out of scope

- Uploaded models or textures, animation in NAVI Web, detecting doors from floor-plan images.
- Accessibility routing flags (automatic doors, step-free). These would change navigation, so they're a separate design.
- Bulk-fixing imported doors. That's separate data repair, together with the proposed `floor-connections.ts` host-wall fix.

## Owner decisions (defaults proposed; confirm or change)

1. **Default swing for doors that have none:** keep today's side (proposed), rather than guessing "into the room".
2. **Materials palette:** wood, painted steel, aluminium, fire-red, plus three glass types (proposed).
3. **Window types:** the 9 listed, with jalousie and transom included because they're common on campus (proposed).
4. **NAVI Web 2D symbols:** show swing arcs to visitors at high zoom (proposed: yes).
5. **Apply-to-similar match rule:** same operation and width within ±0.1 m (proposed).
