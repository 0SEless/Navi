# NAVI terrain: smooth sculpting and a blended TopoExport import

Date: 2026-11-07. Status: **Agreed** in chat ("ALRIGHT MAKE IT A PLAN BUT IF IT IS AWFULL THEN WE WILL SWITCH WITH THE
MANUAL RAISE"). Branch `feat/terrain-2.5d`. Evidence: `docs/testing/2026-11-07-terrain-lag-investigation.md`.

## Why

- **Lag (Verified, measured on a copy of ASU-IBAJAY):** the owner's recording shows ~9 s without a screen update while
  painting. Causes, biggest first: the paint preview is rebuilt from scratch every dab (≈ 0.5 s per dab with the 29
  building pads); building pads make every height lookup 9× slower (0.5 → 4.7 µs; no "is it near?" test); elevation
  tiles (65 536 lookups each, ≈ 0.3 s), contour lines (0.1–0.2 s) and the preview all run on the main thread; every
  change reloads every elevation tile of 4 sources by changing their URL.
- **Import does not blend (owner):** the TopoExport ground is in metres above sea level (3.5–35 m) while the map around
  it is flat at 0 m, so the campus reads as a raised chunk, not land rising from the road. The owner wants it lower so
  it blends — or, if that looks awful, to drop the import and raise the hill by hand.

## Goals (what the owner gets)

1. **Sculpting feels like a game editor:** the ground moves under the brush every frame, dragging or holding, at a
   steady rate; the page never freezes.
2. **An imported TopoExport ground blends in:** the campus's low side sits at street level (0 m) and the ground eases
   down to it outside the campus boundary — no cliff, no raised shelf.
3. Nothing else changes for the owner: same tools, layers, keys, colours, saving, NAVI Web.

## Targets (checked by automated tests on the ASU-IBAJAY copy: 29 buildings with pads + the TopoExport ground)

| Moment | Target |
|---|---|
| Height lookup (Node) | ≤ 1 µs with all 29 pads |
| While sculpting (browser) | no main-thread task longer than 50 ms during a 2 s held stroke; brush work ≤ 4 ms per frame |
| Releasing a stroke (browser) | no main-thread task longer than 50 ms |
| Turning on 3D (browser) | first full 3D picture within 1 s, no task longer than 100 ms |

## Design

1. **Fit index (pads and roads).** Each building pad and fitted road keeps its bounding box grown by its blend
   distance; a height lookup only checks fits whose box contains the point. Same results, ≥ 5× faster lookups.
   Follow-ground building bases are recomputed only for buildings whose footprint touches a changed area.
2. **Height field.** One in-memory grid of the final ground (base + edits + pads + roads) at 1 m over the campus box
   plus margins, plus a grid of the edits alone (for the Changes colours). A lookup is a grid read. A brush or command
   recomputes only the changed rectangle; anything else rebuilds the grid (a few hundred milliseconds at most, once).
   The existing composer stays as the exact reference that fills the grid and that publishing (bake) uses.
3. **Frame-based brush.** While the button is down, one brush step per screen frame: it walks from the last brush
   point to the pointer (dabs a quarter brush apart) and shares that frame's time between them, so dragging and
   holding raise at the same 1.5 m/s (full strength, brush centre). Work never queues up.
4. **Chunked preview.** The live 3D preview is split into 32 × 32 m chunks; a frame rebuilds only the chunks the
   brush touched, and draws only cells this stroke changed (no flicker over untouched ground).
5. **Background worker + targeted refresh.** A Web Worker holds a copy of the height field and builds elevation tiles
   and contour lines; the page sends it only the changed rectangle on release. Only the elevation tiles overlapping
   the change are reloaded (`map.refreshTiles`, Verified present in our MapLibre 5.24), not every tile.
6. **Blended import.** A new optional terrain setting `importBlend: { zeroM, edgeM }`: the imported base is shifted so
   `zeroM` (default: the lowest imported ground inside the campus boundary) becomes 0 m, and outside the boundary the
   base eases to 0 m over `edgeM` metres (default 40 m, smooth curve). Inside the boundary heights keep their true
   differences (slopes, stairs and ramps stay correct). The import panel gets "Blend into the surroundings" (on by
   default), the 0 m height (prefilled with the lowest point, editable) and the edge distance (10–100 m). The reference
   reads "Campus ground (from TopoExport)" — "0 m = <the 0 m height> m above sea level".

## Decision gate (before the real build)

A throwaway prototype (Task 0) measures the targets above on the ASU-IBAJAY copy and shows the owner the blended
import on their campus. **The owner decides:** if the blend looks awful, the import blend (design 6) is dropped and
the hill is raised by hand — the speed work (designs 1–5) goes ahead either way, because manual raising needs it.
If a speed target cannot be met in the prototype, the plan stops and the options (three.js terrain on the GPU) come
back to the owner.

## Constraints

- Stored data: only the optional `terrain.importBlend` is added; no server or database change (Verified: nothing on the
  server validates terrain fields). The protected Dev Supabase is never touched.
- NAVI Web gets the same ground through publishing (bake uses the composer, which includes the blend).
- Workers: module workers via `new Worker(new URL('…', import.meta.url), { type: 'module' })` (Unverified with Next 16
  Turbopack — the prototype checks). No SharedArrayBuffer (it needs cross-origin isolation headers that can block
  outside map tiles); the worker gets copies of the changed rectangles.
- Nothing pushed; owner tests on the preview.

## Not in this work

- Buildings and lowering ("sink with the ground / lowest point / keep flat under it") — a separate decision.
- A three.js or fully GPU terrain renderer (fallback only if the gate fails).
- Contour labels, ramp marks, Shift+Z framing/sensitivity, Height colour range (open items from the test record).
