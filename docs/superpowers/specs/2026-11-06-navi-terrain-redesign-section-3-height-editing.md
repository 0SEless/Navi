# SPEC — Terrain redesign, section 3: Shift+Z height editing (2026-11-06)

Owner brief (2026-11-03 feedback, refined 2026-11-06): select a building or a stair, press **Shift+Z**,
the view turns to the side of the object, and the cursor raises or lowers it. Push a building into the
hill and the ground digs out to meet it; raise it above the ground and the gap is left open (the ground
was finished in the terrain setup and stays fixed).

## Facts this builds on (verified in code, 2026-11-06)

- The Buildings tool selects a building by clicking inside its outline (`TerrainTools`); the Stairs tool
  selects a stair by clicking it (`StructureTool`).
- `building.set-ground` sets a building's base mode (`follow-ground` / `fixed`), typed base and pad, as
  one undo step; it needs that building's lock (`ensureZone`).
- A building **pad** with mode **lower** cuts the ground inside the outline down to the base and blends
  it outside over `blendMeters`; it never raises ground (`compose.ts`, `fitApplies`). This is exactly
  the owner's "dig only".
- Stair ends: ground/road ends take the ground height unless `heightOverride` is set; slab ends sit at
  base + floor elevation. `structure.replace` is the one-undo-step edit.
- One map (minimap removed); the **3D** button tilts it; MapLibre `easeTo` moves the camera.

## What changes

1. **Shift+Z** toggles height mode when a building (Buildings tool) or a stair (Stairs tool) is
   selected. With nothing selected it shows a short hint ("Select a building or a stair first").
   **Shift+Z** again or **Esc** leaves the mode.
2. **Side view:** entering the mode remembers the camera, then eases to look at the object from the
   side (pitch about 75°, facing its longest outline edge or across the stair, framed to fit). Leaving
   the mode eases back to the remembered camera.
3. **Drag to change height:** while in the mode, pressing and dragging up/down anywhere on the map
   changes the height (the map does not pan; brushes are off). Screen pixels map to metres at the
   current zoom; holding **Shift** makes it 10× finer; values round to 0.1 m. A label next to the cursor
   shows the result, e.g. "Base 14.5 m (−1.5)".
   - **Building:** the base moves live (slabs and roof follow). On release: one `building.set-ground`
     with base mode **fixed** and the new base. If the pad was **off**, it becomes **lower** with a
     3 m blend (dig only); a pad the owner set by hand is kept.
   - **Stair end:** the end nearest the pointer when the drag starts. Ground/road end → its
     `heightOverride` (live mesh). Slab end → steps from floor to floor of its building (never free
     height, so it always lands on a slab). On release: one `structure.replace`.
4. **One drag = one undo step.** **Esc during a drag** puts the object back (no command).
5. **The ground digs on release** (one terrain refresh, as after a brush stroke) — not live during the
   drag, so dragging stays smooth.

## Owner acceptance contract

| Requirement     | Expected result                                                                 |
| --------------- | ------------------------------------------------------------------------------- |
| Enter / leave   | Shift+Z with a selection enters; Shift+Z or Esc leaves; camera returns          |
| Side view       | The camera looks at the selected object from the side                           |
| Building drag   | Base follows the cursor live; release = one undo step; Fixed at the new base    |
| Dig only        | Lowered below the ground → the ground inside the outline meets the base         |
| Open gap        | Raised above the ground → the ground stays as it was                            |
| Stair ends      | Ground/road end rises/lowers by 0.1 m; slab end steps floor to floor           |
| No surprises    | No panning or painting during the drag; Esc mid-drag restores; nothing else moves |

## Safeguards (standing)

- Building edits take that building's lock first; refused → a message, nothing changes.
- Gates (vitest baseline + tsc) before every commit; whole-lane browser probe at close-out; no push;
  :3000 and the protected Dev Supabase are never touched.

## Out of scope

Keyboard shortcuts for switching tools, zoom limits, road styling, boundary always visible (section 4);
ground reshaping around stairs; building 3D models.
