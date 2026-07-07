# Task 2.3: Campus Boundary Drawing Tool

## Created
- `src/components/studio/CampusBoundary.tsx` — `useCampusBoundary(map, onComplete?)` hook that enables polygon drawing on the MapLibre map when `tool === 'boundary'`. Click to place vertices, double-click to close the polygon (requires 3+ points). Owns its own GeoJSON source/layer set (`campus-boundary-drawing`) for rendering the in-progress polygon (fill, dashed line, white-ringed vertices).

## Modified
- `src/types/studio-types.ts` — Added `'boundary'` to the `StudioTool` union type
- `src/components/studio/StudioToolbar.tsx` — Added `MapPin` icon import and `'boundary'` button config (orange #F97316) to `TOOL_CONFIG`
- `src/components/studio/StudioCanvas.tsx` — Imported `useCampusBoundary`/`BoundaryPolygon`; calls the hook with `mapRef.current` and an `onComplete` callback that stores the completed polygon via `addComponentWithPolygon`; added `'boundary'` to cursor (crosshair) and dragPan (disable) conditions

## Concerns
1. **No dedicated boundary data model** — The completed polygon is stored via `addComponentWithPolygon` with type `'room'` as a proxy. A future task should add a dedicated campus boundary entity (e.g., `addCampusBoundary` to graph store) with its own storage and rendering layer.
2. **Task brief file missing** — `task-2.3-brief.md` did not exist at `.superpowers/sdd/task-2.3-brief.md`, so implementation was inferred from the task description and existing codebase patterns.
3. **No Escape/cancel handler** — The boundary tool does not cancel the current drawing on Escape key (unlike trace/room tools). Minor UX gap.
