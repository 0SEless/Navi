# SPEC — Terrain redesign, section 4: roads, zoom limits, boundary, tool keys (2026-11-07)

Owner brief (2026-11-03 review points 6–9, design agreed in chat 2026-11-07): the roads should give the
feel of the target picture (`docs/vision/2026-11-07-navi-web-target.webp` — a generated image: aim for
the feel, not a copy); zooming must never leave you lost in empty space; the campus boundary, once set,
stays visible; tools switch with one key instead of clicks.

## Facts this builds on (verified in code, 2026-11-07)

- One terrain map (`TerrainMap`): roads are drawn twice — a grey 2 px line (`terrain-roads`) and a fill
  at the road's width (`RoadSurfaceLayer`, `roadSurfacePolygons`). The fill colour matches on a
  `'pathway'` road type that does not exist: road types are `arterial | connector | service | pedestrian`,
  so footpaths get the road colour today (bug, fixed here).
- The boundary is a dashed blue line (`terrain-boundary`) in every view; nothing marks the outside.
- The map has `maxPitch: 85`, no `minZoom` / `maxZoom` / `maxBounds`: panning and zooming are unlimited.
- Keys today: **B** brush, **[ ]** brush size, **Ctrl+Z / Ctrl+Y** undo/redo, **Shift+Z** height mode,
  **Esc** cancel. Tool switching is by clicking the tool dock.

## What changes

1. **Zoom limits.** The view stays on the campus: `maxBounds` = the boundary's box plus a margin of half
   its size on every side; `minZoom` = one level out from the zoom that fits the whole campus; `maxZoom`
   = 21 (a few metres across); `maxPitch` = 80. Limits follow the boundary when it is edited.
2. **Boundary always visible.** The boundary line is drawn in every tool, top view and 3D, above the
   ground colours and under the outlines; Edit boundary keeps its corner handles. Outside the boundary
   the ground is softly faded (a light veil, about 35 %) — the "soft scenery" decision: you always see
   where the campus ends, and nothing outside is hidden.
3. **Road styling.** Roads (`arterial`, `connector`, `service`): dark asphalt surface, thin white edge
   lines along both sides, and a white dashed centre line when the road is at least 5 m wide (two lanes).
   Paths (`pedestrian`): light paving colour, no markings. Markings drape on the terrain like the surface;
   the old grey 2 px line is no longer drawn (the surface and markings replace it). The Roads layer switch
   hides surfaces and markings together.
4. **One key per tool.** V Move · B Raise/Lower · S Smooth · F Flatten · P Slope · L Lasso · U Buildings ·
   T Stairs · H Height picker · R Reset · C Contour pen · E Edit boundary. Each key shows as a small letter
   on its button in the tool dock and in its tooltip. Keys are ignored while typing in a field, with Ctrl,
   Alt or Meta held, and while Shift+Z height mode is on; editing tools need the terrain lock as today
   (Move and Stairs always work). Shift+Z and Esc keep their meaning.

## Owner acceptance contract

| Requirement       | Expected result                                                                  |
| ----------------- | -------------------------------------------------------------------------------- |
| Not lost          | Cannot pan far off the campus; cannot zoom far out or closer than ~a few metres   |
| Boundary          | Visible in every tool, flat and tilted; outside softly faded                      |
| Roads             | Asphalt with white edge lines; centre dashes on roads ≥ 5 m; paths light, no lines |
| Paths fixed       | `pedestrian` roads get the path colour (not the road colour)                     |
| Keys              | Each listed key selects its tool; the dock shows the letter; typing is unaffected |
| No regressions    | Brushes, Shift+Z, stairs, sections 1–3 behaviour unchanged                        |

## Safeguards (standing)

Gates (vitest baseline + tsc) before every commit; whole-lane browser probe at close-out; no push; :3000
and the protected Dev Supabase are never touched.

## Out of scope

Curbs, sidewalks, fences, crosswalks, trees and lawns (later, with the visitor map and the trees step);
the NAVI Web visitor map (Task 15); retaining walls; navigation.
