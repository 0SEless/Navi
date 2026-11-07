# Terrain editor — manual test record (2026-11-07)

Where: preview https://navi-next-savev2-navi01.vercel.app, campus ASU-IBAJAY (`map-map-5-0y27`), the owner's
Chrome (1920 × 945), Studio → Terrain. Tester: Claude, at the owner's request ("test it one by one and record
the test … especially in 3D mode"). Every test edit was undone afterwards (Ctrl+Z, 40×); nothing was saved.

How it was measured: strokes were driven by a page script (real mouse events on the map canvas, one every
16 ms) that timed the work done per mouse event and listened for long tasks (> 50 ms on the main thread).
The map and document were read through React internals (the test hooks are off in the preview build).

## Results, tool by tool

| # | Tool / feature | 2D | 3D | Speed | Result |
|---|---|---|---|---|---|
| 1 | Opening Terrain | Campus, street map, boundary, buildings | — | — | Works |
| 2 | Raise / Lower (B) | Raises; contour lines show it | Raises; hill visible | 2.4–6.6 ms per mouse move (worst 33 ms); one 65–69 ms pause on release | **Bug (fixed): too weak while dragging, too strong while holding** — see A |
| 3 | Lower only | — | — | — | **Owner: "cannot lower anything"** — same cause as A (fixed) |
| 4 | Live 3D preview while painting | — | Shows (≈ 50 000 vertices) | — | **Bug (fixed): flickering sheet over unchanged ground** — see B |
| 5 | Smooth (S) | Works (peak 6.21 → 6.15 m, spread) | — | 2.4 ms per move | Works |
| 6 | Flatten (F) | Works (plateau held at the start height) | Plateau visible | 2.3 ms per move | Works |
| 7 | Slope (P) | Works (4 m → 0 m ramp) | Visible | — | Works; default width 4 m |
| 8 | Lasso (L) | Works ("Set height to" 3 m) | Block clearly visible | — | Works |
| 9 | Reset (R) | Works (removed the test cone) | — | — | Works |
| 10 | Height picker (H) | Works (picked 3 m, switched the brush to "Set to height") | — | — | Works |
| 11 | Contour pen (C) | Line added, "Generate surface" enabled (not run) | — | — | Works |
| 12 | Buildings (U) + Shift+Z | Selects; side panel | Height mode opens | — | Works, but see D and E |
| 13 | Stairs (T) | Click places a stair (0 steps until its ends are dragged) | — | — | Works as designed |
| 14 | Edit boundary (E) | 15 corners + 15 "+" markers | — | — | Works (not changed) |
| 15 | Import terrain | Panel opens; Keep / Clear my changes | — | — | Works |
| 16 | Colours: Changes | Clear terracotta on edits | — | — | Works |
| 17 | Colours: Height | Almost the same as Off | — | — | **Weak** — see F |
| 18 | Layers: street map off/on, Height ×3 | Works | Relief reads clearly without the street map | — | Works; see G |
| 19 | Undo (Ctrl+Z) | Reverted every test edit | — | — | Works |
| 20 | Buildings in 3D | — | Speckled floors, floating roofs, no walls | — | **Bug (fixed)** — see C |
| 21 | Imported ground (owner's TopoExport) | — | 25–30 m cliff where the import ends; boundary drawn at the bottom | — | **Bug (fixed)** — see H |

Performance verdict: painting is smooth in 2D and 3D — a few milliseconds of work per mouse move and one
pause of about 65 ms when a stroke is released (the ground is redrawn once). No freezes.

## Findings

**A. Raise/Lower strength (fixed).** Each dab moved the ground a fixed 0.1 m; dabs come every quarter
brush of travel, and every 80 ms while the button is held still. So a normal drag barely changed the ground
(about 0.4 m per pass at 100 %), while a pause shot it up (one held stroke made an 18.5 m cone). Lowering
worked, but was too small to see — the owner's "cannot lower anything". Now time-based: 1.5 m per second
under the brush centre at full strength, dragging or holding; a rested mouse counts at most 250 ms.

**B. Paint preview flicker (fixed).** The 3D preview drew a sheet over the whole box of every changed cell
in a tile — earlier strokes and the flat ground between them too. Where it lay exactly on the ground it
flickered (white speckle). It now draws only the cells the current stroke changes.

**C. Buildings (fixed).** A building standing on the ground got a zero-height ground-floor slab that
flickered in the ground surface (the speckled floors in the owner's screenshot), and a one-floor building
showed as a floor plate plus a floating roof — no walls. Buildings are now solid blocks from the ground to
the roof, in Studio and on NAVI Web. "Cut away above" a floor stops the block at that floor.

**D. Shift+Z side view is far away (open).** The camera centres the selected building but at 75° tilt and
zoom 18.5 it sits small in the distance, behind nearer buildings. Proposal: zoom in until the building
fills about a third of the view.

**E. Shift+Z drag is very sensitive (open).** An 80 px drag lifted CANTEEN by 17 m (the drag follows the
map scale). Shift gives ×0.1. Proposal: a fixed rate such as 0.05 m per pixel.

**F. Height colours wash out on flat-start ground (open).** The colour range of a flat start is fixed at
0–40 m; with 0–18 m of ground the colours barely show. Proposal: fit the range to the actual heights.

**G. 3D relief hard to read under the street map (open).** With the street map on and the ground half
see-through, the shape reads mainly through the contour lines; with the street map off it reads clearly.
Proposal: in 3D, raise the ground's opacity or strengthen the hillshade.

**H. Cliff at the edge of an imported ground (fixed).** Past the edge of the TopoExport area the ground
height fell to 0 m: a cliff, and the campus boundary drawn at its foot ("misaligned"). The ground now
continues from the nearest edge of the import (Studio and the published NAVI Web ground).

**I. Small things (open).** The area-tool panels (Lasso, Slope, Reset, Contour pen) still use plain
unstyled buttons; the cursor height label updates only when the mouse moves (stale right after an edit);
a raised building with "Fixed height" sits on a solid column from the ground (by design — a foundation).

**J. Blank map in a fresh view-only tab (not reproduced reliably).** Twice a newly opened tab showed an empty
map until it was touched; every layer and its data were present, with no errors. It fits Chrome not painting
a freshly opened automation tab; it did not happen in the owner's own tab. Watch for it.

## Fix commits (branch feat/terrain-2.5d)

- e21e0b2 — no flicker from zero-height ground slabs or the paint preview over unchanged ground
- 97bd98e — ground past an import continues; time-based raise/lower; buildings with walls
