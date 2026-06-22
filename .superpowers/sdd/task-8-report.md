# Task 8 & 9 Report: Studio Workspace, Canvas, Panels, Toolbar

## Files Created

| # | File | Lines | Purpose |
|---|------|-------|---------|
| 1 | `src/components/studio/StudioWorkspace.tsx` | 21 | Main layout: toolbar top, panels left/right, canvas center |
| 2 | `src/components/studio/StudioCanvas.tsx` | 228 | MapLibre canvas with OSM, GeoJSON layers, tool interactions |
| 3 | `src/components/studio/StudioToolbar.tsx` | 87 | Tool selector (6 tools), editor mode toggle, floor picker |
| 4 | `src/components/studio/LayersPanel.tsx` | 62 | Layer visibility toggles (10 layers with icons) |
| 5 | `src/components/studio/PropertiesPanel.tsx` | 71 | Building properties panel + graph stats footer |

## Dependencies Referenced

- `@/store/studio-store` — `useStudioStore` (tool, editorMode, activeFloor, layers, tracePoints)
- `@/store/graph-store` — `useGraphStore` (graph, addTrace, addComponent, addComponentWithPolygon)
- `@/types/studio-types` — `StudioTool`, `LayerVisibility`
- `@/types/nav-types` — `NavNode`, `NavEdge`, `LatLng`
- `maplibre-gl` — MapLibre GL JS for rendering
- `lucide-react` — icons in toolbar/panels

## Key Design Decisions

- **Canvas adapts `RealMapView.tsx` patterns** — same OSM style, GeoJSONsource/layer architecture, ref-based stale closure avoidance, `syncAllData` pattern
- **Drawing preview** — trace points/line and room drag polygon rendered via `SRC.DRAWING` GeoJSON source, cleared on tool switch
- **Room tool** — click-drag draws rectangle, polygon calculated from start/end lat-lng bounds
- **Trace tool** — click places points (accumulated in `studio-store.tracePoints`), double-click creates the `TracePath` via `graphStore.addTrace`
- **Delete/escape** — `Delete` removes selected node from graph, `Escape` cancels in-progress draws
- **Throttled cursor** — crosshair for draw tools, pointer for select, default for move/route_test

## Test Results

```
✓ 8 test files passed
✓ 57 tests passed
```

## Commit

`3032745` - `feat: add NAVI Studio workspace layout, canvas, panels, and toolbar`

## Deviations

None.
