# PLAN — Terrain redesign, section 3: Shift+Z height editing (2026-11-06)

Spec: `docs/superpowers/specs/2026-11-06-navi-terrain-redesign-section-3-height-editing.md`.
Branch `feat/terrain-2.5d` (worktree `.navi-worktrees/navi-save-v2`). Inline, test-first, no subagents.
Every task: RED → GREEN, gates (`.superpowers/sdd/2026-11-02-navi-terrain-2.5d-stairs-ramps/gates.sh`),
commit; notes in `progress/PROGRESS.md` / `errors/ERRORS.md`.

## T1 — Height-edit maths (pure)

`src/lib/terrain/height-edit.ts` + `__tests__/height-edit.test.ts`:
- `metresForDrag(dyPx, { zoom, lat, pitch, fine })` — up = positive; Web-Mercator metres per pixel at
  the zoom/latitude; ×0.1 when fine; rounded to 0.1 m.
- `sideViewCamera(points, kind)` — centre, bearing facing the longest outline edge (building) or across
  the stair path, pitch 75, and the bounds to frame.
- `stepFloor(floors, currentFloorId, deltaM)` — the floor whose elevation is nearest current + delta.
- `padAfterLowering(pad)` — off/undefined → `{ mode: 'lower', blendMeters: 3 }`; anything set → kept.

## T2 — Live drafts on the map

- `buildSlabFeatures(document, sampler, { cutAboveFloorId, baseOverride })` — `baseOverride` moves one
  building's slabs/roof (test in `building-slabs.test.ts`).
- `TerrainMap` takes `draft?: { buildingBase?: { id, baseM }; structure?: Structure }` and uses it for
  the slabs and the stairs mesh (`buildStructuresMesh` on the document with that structure replaced).

## T3 — Height mode controller

`src/components/terrain/HeightEditMode.tsx` + test (fake map):
- Shift+Z toggles (ignored in inputs), Esc leaves; hint when nothing is selected.
- Enter: remember camera → `easeTo(sideViewCamera)`; leave: `easeTo(remembered)`.
- In the mode: `dragPan.disable()`; mousedown starts a drag; mousemove updates the draft + cursor label;
  mouseup dispatches ONE command (building: `building.set-ground` fixed + `padAfterLowering`; stair:
  `structure.replace`); Esc mid-drag clears the draft without a command.
- Tests: enter/leave + camera restore; one command per drag; Esc mid-drag = no command; pad off → lower,
  pad set by hand kept; slab end steps floors; nothing selected → hint, no camera move.

## T4 — Wiring

- Lift the stair selection out of `StructureTool` (controlled `selectedId`), keep the building selection
  in `TerrainTools`; mount `HeightEditMode` with whichever is selected for the active tool.
- Building drags take the building lock first (`ensureZone`); refused → message, no command.
- Brush strokes are off while height mode is on.

## T5 — Browser probe T8

Seeded hall (3 floors) + imported ground + one stair: select the hall, Shift+Z → pitch > 60; drag down
→ base lower, pad lower, ground under the outline = base (±5 cm); undo → back; drag up → ground under
the outline unchanged; stair end raise → `heightOverride`; Esc leaves and the camera returns;
screenshots.

## T6 — Close-out

Whole-lane probe + gates (sequential), progress/handoff notes, one commit.
