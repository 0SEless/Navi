# Task 2.4 Report — Building Tracing Tool

## Status: Complete

## Files Changed

| File | Change |
|------|--------|
| `navi-next/src/types/studio-types.ts:13` | Added `'building'` to `StudioTool` union type |
| `navi-next/src/components/studio/BuildingTracer.tsx` | **Created** — `useBuildingTracer` hook with 2.5D fill-extrusion preview |
| `navi-next/src/components/studio/StudioCanvas.tsx` | Integrated hook, cursor/dragPan handling, and `addBuilding` on completion |

## How It Works

- **`useBuildingTracer(map, onComplete)`** mirrors `useCampusBoundary`'s pattern:
  - Adds a dedicated geojson source with three layers: `fill-extrusion` (violet, 15m height, 30% opacity), `line` (dashed outline), and `circle` (vertices)
  - When `tool === 'building'`, left-click adds a vertex, double-click closes the polygon (min 3 points required)
  - On completion, calls `onComplete` with `{ id, points }`, then clears drawing
  - On tool switch away, clears state and re-enables `doubleClickZoom`

- **StudioCanvas** integration:
  - Calls `useBuildingTracer` with a callback that computes centroid and calls `addBuilding`
  - Added `'building'` to cursor (crosshair) and `dragPan.disable()` checks
  - Added `addBuilding` to the store destructuring

## Concerns

None.
