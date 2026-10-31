# Runtime Visualization

## MapLibre integration

`TerrainLayer` is mounted by the shared `ExploreMap` used in both Explore and Navigate. It owns a dedicated GeoJSON source and fill/outline layers. Style reloads recreate only missing resources; repeated style events do not duplicate sources or layers. The layer uses 2D fill and line styling, elevation classes, and does not use fill extrusion.

The panel identifies each terrain area by name and displays the authored elevation in meters relative to the one campus-local datum, with the explicit “not surveyed” qualification. Users can select an entry or click its polygon to open the inspection panel. The overlay keeps map interaction available outside its compact information panel.

## View bounds correction

The first visual inspection showed that the compiled route graph extent was `121.050000–121.050474` longitude, while the saved terrain area was at `121.052656–121.053572`. Its source feature was present, but the camera framed only the route. `terrainAwareMapBounds()` now unions graph and terrain extents for initial fit and recenter. A regression test covers disjoint bounds, overlapping bounds, and legacy/no-bound cases.

The final browser run reports a rendered terrain feature in the viewport in Explore, the fresh context, and Navigate. The rendered polygon is visible in the screenshots:

- Explore: `logs/e8-5-runtime-terrain.png`
- Navigate: `logs/e8-5-navigate-terrain.png`
- Legacy Explore: `logs/e8-5-legacy-runtime.png`

## Compatibility and runtime behavior

- Terrain-free legacy bundle: terrain panel absent; building search still works.
- Terrain bundle revisions: cache/reload selects revision 2 at 4.5 m; fresh context also loads revision 2.
- Navigate shares the same terrain rendering and elevation inspection.
- No database mutation is triggered by rendering; E5 remains at authored terrain revision 2 after the publish/runtime checks.
- No production performance benchmark was claimed. The final browser acceptance took 23.9 seconds for its test body and 29.2 seconds overall in the local synthetic environment.
