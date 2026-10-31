# Implementation and schema

## Campus document

- `terrainAreas?: TerrainArea[]` contains stable-ID authored areas with name, ordered latitude/longitude points, color, and finite `elevationMeters`.
- `terrainVerticalDatum?: TerrainVerticalDatum` is shared at campus level: `{ kind: "campus-local", name, zeroReference, elevationStatus: "authored-not-surveyed" }`.
- Elevations are relative to this one campus datum. The status is explicit that they are authored, not surveyed.
- Old documents with no terrain fields retain their absent fields through hydration, projection, and snapshot reconstruction. They do not become dirty from normalization alone.

## Authoring and validation

`TerrainAreaAuthoring` is mounted on the campus Studio canvas, not on a floor. It provides polygon drawing, selection and inspection, datum/elevation editing, boundary adjustment, and deletion. Dedicated MapLibre source/layers render the authored polygons; selected styling differs from other campus map content. Geometry serialization retains stable ID and ordered vertices; ring closure is added only for GeoJSON rendering.

`isSimpleTerrainPolygon` rejects non-finite/out-of-range coordinates, adjacent duplicate vertices, near-zero area, and self-intersections. Elevation must be finite. Overlap is allowed; differing elevation overlaps receive a visible warning and are not silently merged or resolved.

Command handlers create/update/delete areas and provide inverses for editor history. A completed boundary drag emits one update command at drag end. There is no persistence request while dragging. Explicit Save submits one campus-wide terrain-scope candidate when the terrain projection meaningfully changed; unchanged terrain yields no revision. Other scopes are preserved.

Terrain authoring remains opt-in. This is authored elevation polygon metadata; it is not a continuous terrain surface or mesh and is not coupled to MapLibre's future rendering implementation.

## Key files

- `packages/core/src/types/entities.ts`, `packages/core/src/types/document.ts`
- `packages/core/src/geometry/terrain-polygon.ts`
- `packages/editor/src/commands/terrain-area-handlers.ts`
- `src/services/scoped-change-detection.ts`, `src/services/scoped-campus-snapshot.ts`
- `src/components/studio/TerrainAreaAuthoring.tsx`, `src/components/studio/terrain-area-geojson.ts`
- `e2e/track-e8-4-terrain-authoring.spec.ts`

Design and implementation plan: `docs/superpowers/specs/2026-10-30-navi-e84-terrain-authoring-design.md` and `docs/superpowers/plans/2026-10-30-navi-e84-terrain-authoring.md`.
