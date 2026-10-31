# Published Terrain Contract

## Data path

`CampusDocument` is authoritative. `buildArtifacts()` copies its `terrainAreas` and `terrainVerticalDatum` into `NavigationArtifacts`; compiler validation rejects malformed terrain. The publish artifact shape and `PublishedCampus` expose the same optional fields. `/api/public-campus` transports them, `public-store` retains them in `CampusBundle`, and `TerrainLayer` projects the polygon coordinates into GeoJSON.

## Shape and semantics

- Each `TerrainArea` keeps its stable ID, name, styling color, ordered geographic vertices, and finite `elevationMeters` value.
- One structured campus-local `TerrainVerticalDatum` describes the shared zero reference and marks values `authored-not-surveyed`.
- Elevation is authored height relative to that campus datum. It is not survey/GPS precision, floor-relative height, navigation topology, or a visual extrusion height.
- Runtime GeoJSON closes and normalizes the render-only outer ring to counter-clockwise winding. The source document coordinates are not rounded or reordered.
- The overlay is a 2D thematic polygon layer. Discrete polygon values do not claim a continuous or physically resolved terrain surface.

## Version and compatibility

The fields are additive and optional; no independent terrain format version or artifact version bump was introduced. A legacy artifact with both fields absent is accepted and produces no terrain UI. Invalid or mismatched terrain is rejected through existing compiler/publication validation. Building, routing, campus boundary and legacy-area fields remain separate; terrain is not converted to legacy areas or POIs.

## Camera extent

The runtime map frame now unions the navigation graph bounds with the valid terrain polygon vertices. This corrects the observed case where graph bounds described a small route but excluded an authored terrain polygon. It affects camera framing only; graph nodes, route calculations and topology are unchanged. Legacy bundles retain their graph bounds because they contain no terrain.

## Forward compatibility

Future building and road elevations should reference the same campus datum while retaining their own authored geometry. A later terrain mesh may be derived from authored polygons or denser elevation samples, but must keep geographic, campus-local horizontal and campus-local vertical coordinates distinct. Those later derivations remain outside E8.5.
