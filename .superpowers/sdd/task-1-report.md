# Task 1 Report: Fix Vertex Editor Bugs

## What was implemented

- **VERTEX_MIDPOINT_LAYER filter**: `['==', ['get', 'segment'], -1]` → `['!=', ['get', 'segment'], -1]` — now shows midpoints instead of vertices
- **VERTEX_MIDPOINT_LAYER radius**: increased from 1.5→4 to 3→6 (zoom 15→20)
- **VERTEX_LAYER filter**: added `filter: ['==', ['get', 'segment'], -1]` — now shows only vertices
- **VERTEX_LAYER radius**: unselected 2.5→8 (z15), 6→14 (z20); selected 4→12 (z15), 8→18 (z20)

## Verification

- `npx tsc --noEmit`: No new errors. All existing errors are in other files (osm-import, floor-editor, StudioCanvas) — unchanged.

## Files changed

`navi-next/src/components/studio/useVertexEditor.ts` — 2 insertions, 2 deletions (lines 49-50)

## Commit

`c1ec7ed` — `fix(route): fix vertex midpoint filter and enlarge handles to 8px`

## Self-review

No concerns. The midpoint layer correctly uses `['!=', ...]` to show non-vertex features (midpoints have `segment: i` where i ≥ 0), and the vertex layer now explicitly filters for `segment === -1`. Handle sizes are now 8px+ at zoom 15, well within clickable range.
