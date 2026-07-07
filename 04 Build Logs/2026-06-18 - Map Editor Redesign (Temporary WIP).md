# Build Log — Map Editor Redesign (WIP / Temporary)

> **Status**: ⚠️ Draft / Not final — needs rework. The current implementation doesn't match what was intended.

## Goal
Rebuild the MapEditor from an SVG-based abstract schematic into a MapLibre-powered real-map editor with building boxing, node pinning, path recording, and GPX import for the NAVI admin dashboard.

## What was done

### MapLibre Integration
- Replaced the 1065-line SVG-only MapEditor with a native MapLibre GL JS canvas
- OSM raster tiles centered on ASU Ibajay (11.81802°N, 122.17081°E)
- MapLibre GeoJSON layers for buildings (fill + outline), nodes (circle + inner + label), edges (line)
- Drawing preview via a temporary GeoJSON source (no SVG overlay)

### Tools implemented
- **Select** — click buildings/nodes/edges to select, click empty to deselect
- **Add Node** — click on map to place a node, auto-detects building proximity
- **Add Edge** — click source node → click target node (Esc to cancel)
- **Building Box** — two modes: Rectangle (click-drag) and Polygon (click corners, double-click to finish); modal for name/code/floors/color
- **Pan** — drag to move the map
- **Delete** — click a node or edge to remove it
- **Import GPX** — upload `.gpx` file → parses waypoints → creates nodes + edges

### View toggle
- 🗺 **Real Map** — MapLibre with native layers
- 📐 **Auto SVG** — auto-generated schematic projected from GPS coordinates
- 📄 **Classic** — read-only reference of the original Figma SVG

### RouteTesting
- Updated to use shared GPS-aware data and haversine distance

## Files created/changed
```
src/pages/
  MapEditor.tsx              — rewritten orchestrator (toolbar, view toggle, side panel, building modal)
  RouteTesting.tsx           — updated to use GPS data + projection
  map-editor/
    types.ts                 — shared GPS types (CampusBuilding, NavNode, NavEdge, etc.)
    mockData.ts              — ASU Ibajay GPS coordinates, haversine distance, helpers
    RealMapView.tsx          — MapLibre map + GeoJSON layers + click/draw event handlers
    AutoSvgView.tsx          — auto-generated schematic from GPS bounds
    mock-walk.gpx            — test GPX walk trace for import
```

## Known issues / Not intended
- [ ] Building border workflow doesn't feel right yet
- [ ] Node placement needs more intuitive interaction
- [ ] Tool behavior needs refinement — buttons don't all work as expected
- [ ] The overall UX isn't smooth enough
- [ ] Auto Nodes button was removed per user request
- [ ] SVG was removed per user request — now fully native MapLibre

## Next steps (to be re-planned)
- Re-think the building border drawing UX
- Improve node/edge interaction flow
- Make the admin map recording workflow actually intuitive
- Possibly revisit whether native MapLibre layers or an SVG hybrid is more appropriate for editing
