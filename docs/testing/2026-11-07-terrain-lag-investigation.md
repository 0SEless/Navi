# Terrain editor lag — investigation (2026-11-07)

Owner's question: why is the terrain editor so laggy (screen recording 15:35, ASU-IBAJAY with the imported
TopoExport ground, Lower only, 30 m, 100 %), and why does a building not follow when the ground is lowered?
Investigation only — nothing was changed.

## What the recording shows

16 s at 30 fps (482 frames). Only **13 frames** show any change on screen; one stretch of **269 frames
(≈ 9 s)** shows none. Most seconds have zero visible updates. Between 3 s and 12 s the brush outline does
not move although the cursor does: the page stopped redrawing while painting — the browser's main thread was
busy, not the computer being slow.

## Measurements (offline copy of the campus)

The owner's 29 buildings and boundary (read from navi-studio-v2), the same TopoExport files, every building
"follows the ground" with a pad ("lower", 3 m blend) as after the import. Timed in Node; a browser is about
the same or slower.

| Work | No pads | With the 29 pads | When it happens |
|---|---|---|---|
| One height lookup | 0.53 µs | **4.68 µs (9×)** | Inside everything below |
| One elevation tile (256 × 256 lookups), zoom 16 | 40 ms | **302 ms** | For each tile touched by a change, on release; every tile in view when the whole terrain changes (import, boundary, building ground) or when 3D first loads |
| Elevation tile outside the imported area | 58 ms | 322 ms | Same |
| Contour lines over the campus (538 × 264 m) | 99 ms | 215 ms | After every change |
| Paint preview, one dab (tile already holding earlier edits) | 24 ms | **546 ms** | **Every dab while painting** — every 80 ms while the button is held |
| 40 stroke dabs (the ground change itself) | 9 ms | 7 ms | While painting |

## Causes (most to least important)

1. **The paint preview is rebuilt from scratch on every dab.** It covers the whole area of every tile the
   stroke touches (including earlier edits), and asks for 5 heights per vertex (the height plus 4 for
   shading), plus 8 for the "did this cell change" check. With pads that is about half a second per dab;
   while holding the button a new dab is due every 80 ms, so the page never gets a free moment to draw —
   the 9-second freeze.
2. **Building pads make every height lookup 9× slower.** Each lookup checks all 29 buildings (inside the
   outline? distance to its edge?) with no quick "is this building even near?" test first. This multiplies
   every other cost here.
3. **All terrain work runs on the main thread.** Elevation tiles (65 536 lookups each), contour lines and the
   preview run where the page also handles the mouse and draws. Releasing a stroke redraws the tiles it
   touched (~0.3 s each with pads); a whole-terrain change, or turning on 3D, redraws every tile in view —
   several seconds.
4. **Contour lines are recomputed over the whole campus after every change** (0.1–0.2 s).

Expected effect of fixing them (estimates, to be measured): a bounding-box test before each pad (cause 2)
brings lookups back to about 0.6 µs; a preview limited to the cells near the brush and updated
incrementally (cause 1) brings a dab to a few milliseconds; moving tile and contour work to a Web Worker
(cause 3) keeps the page drawing even when that work is heavy.

## "When we lower the ground, the building doesn't follow"

Measured on Bldg No. 8 (57 m long), lowering only its west end for 3 s:

| | Before | After |
|---|---|---|
| Ground at the west end | 22.4 m | 18.0 m (lowered 4.5 m) |
| Ground at the centre | 24.4 m | 24.4 m |
| Building base | 25.1 m | 24.7 m (moved 0.4 m) |

Why: a building that follows the ground sits at the **average** ground height over its whole footprint.
Lowering one end changes that average only a little, so the building stays almost where it was and floats
above the lowered end. Its pad ("lower" mode) only digs ground that is higher than the building; it never
fills ground back up to it — the owner's earlier rule ("a raised building leaves the gap open"). With
Buildings switched off, the flat pads under the buildings show as platforms in the ground.

Options to decide later: base on the lowest point of the footprint instead of the average; a pad mode that
also fills ("both") so the ground under a building stays at its base; or treat a stroke over a building as
moving the building too.
