# PLAN — Terrain redesign, section 4: roads, zoom limits, boundary, tool keys (2026-11-07)

Spec: `docs/superpowers/specs/2026-11-07-navi-terrain-redesign-section-4-roads-zoom-boundary-keys.md`.
Branch `feat/terrain-2.5d` (worktree `.navi-worktrees/navi-save-v2`). Inline, test-first, no subagents.
Every task: RED → GREEN, gates (`.superpowers/sdd/2026-11-02-navi-terrain-2.5d-stairs-ramps/gates.sh`),
commit; notes in `progress/PROGRESS.md` / `errors/ERRORS.md`.

## T1 — Camera limits (pure + map)

- `src/lib/terrain/camera-limits.ts`: `campusCameraLimits(boundary, size)` → `{ maxBounds, minZoom,
  maxZoom: 21, maxPitch: 80 }` (box + half its size each side; minZoom = fit zoom − 1).
- `TerrainMap` applies them on load and when the boundary changes (`setMaxBounds`, `setMinZoom`,
  `setMaxZoom`, `setMaxPitch`).
- Tests: limits contain the campus with the margin; minZoom one below the fit; no boundary → no limits.

## T2 — Boundary always visible + soft outside

- `boundaryVeil(boundary)` → a world polygon with the boundary as its hole (core-free helper in
  `src/lib/terrain/boundary-veil.ts`); `TerrainMap` adds a fill (`terrain-outside`, light veil ~35 %)
  under the road surfaces and the boundary line on top of it, in every view.
- Tests: the veil's hole is the boundary ring; empty boundary → no veil; layer order (veil under road
  surfaces, boundary line above them).

## T3 — Road styling

- Fix the road/path split: `pedestrian` = path (light paving), others = road (asphalt).
- `roadMarkings(roads)` (`src/lib/terrain/road-markings.ts`): edge lines (both offsets of each road
  polygon outline) for roads; a centre line for roads ≥ 5 m wide; nothing for paths.
- `RoadSurfaceLayer` adds the markings as line layers (white edges; white dashed centre) above the
  surface; the grey 2 px `terrain-roads` line is no longer shown; the Roads switch hides all of them.
- Tests: pedestrian gets the path colour; markings per road kind and width; switch hides all.

## T4 — One key per tool

- `ToolEntry.key` for every tool; the dock shows the letter (badge + tooltip).
- `useTerrainShortcuts` maps the keys to tools (ignored in fields, with Ctrl/Alt/Meta, and while height
  mode is on; locked tools only when editing; Move and Stairs always).
- Tests: each key selects its tool; typing in an input does not; Ctrl+key does not; height mode blocks.

## T5 — Browser probe T10

Zoom out/pan far → clamped to the campus; boundary + veil layers present in the flat and tilted views;
road surface colours (road vs path), centre and edge markings present; keys V/B/S/T/E switch the dock's
pressed tool; screenshots.

## T6 — Close-out

Whole-lane probe + gates (sequential), progress/handoff notes, one commit.
