# NAVI E8.4 Terrain Authoring Foundation

## Status

Proposed; implementation is waiting for owner approval.

## Goal and boundaries

Add a campus-level authoring surface for finite-elevation terrain polygons. The authored records are terrain areas, not a continuous terrain mesh. Keep current persistence auth, opt-in behavior, and E5 routing intact. Do not add terrain brushes, smoothing, grading, or runtime publishing support in this track.

## Existing architecture

- `CampusDocument` is the authored document; floors are nested under buildings and are not the right place for campus terrain.
- Existing `Area` records are compatibility projected into the graph and may migrate to POIs. The graph adapter also projects only the legacy area fields.
- Existing campus `terrain` scope currently carries the campus boundary and compatibility `areas`. The snapshot applies that scope back to `CampusDocument`.
- Studio already has campus map polygon drawing, command dispatch, Explorer selection, a properties panel, a MapLibre renderer, and explicit Save with the E5 scoped persistence workflow.

## Proposed design

1. Add an additive `terrainAreas?: TerrainArea[]` authored field and optional structured `terrainVerticalDatum?: TerrainVerticalDatum` on `CampusDocument`. The single campus datum identifies the campus-local reference and states that elevations are authored, not surveyed. `TerrainArea` contains stable `id`, `name`, ordered `LatLng[]` boundary points, `color`, and finite `elevationMeters` relative to that datum; areas do not define their own datum. Require at least three finite coordinates, valid ranges, a nondegenerate simple polygon, a nonempty campus datum, and a finite elevation before accepting a create/update command. Preserve vertex order and serialize coordinates in authored order; do not round coordinates during canonical document serialization.
2. Keep `CampusDocument.areas` untouched. Extend the existing campus `terrain` projection and reconstruction to include `terrainAreas` and `terrainVerticalDatum`; this retains the existing E5 scope identity and isolates geometry from building, route, and campus-settings scopes.
3. Add a campus-level Terrain panel/tool alongside the map, not within a floor editor. Reuse campus map polygon drawing and the existing command/DocumentStore pathway. Selection shows the polygon with a distinct outline and an inspector with name, campus datum, and elevation in meters. Commands create, update polygon/elevation, and delete records; use existing command history where it supports inverses. Boundary adjustment should use a single edit gesture/command at gesture completion, not one command per pointer move; no network writes occur during the gesture, and explicit Save produces at most one campus terrain-scope commit.
4. Render terrain polygons from the authored document as their own MapLibre source/layers, with selected-state styling and datum/elevation labeling in the inspector. Detect intersecting terrain polygons with differing elevations and visibly flag them as conflicts; allow overlap and never merge or resolve areas automatically. Do not convert them to generic `Area` or POI records.
5. Keep feature flags disabled by default. Explicit Save must use the authenticated E5 synthetic route and report success only after the durable acknowledgment verifies. Preserve the local draft on failure/conflict.
6. Exercise the existing browser publish flow and record that the legacy runtime contract remains valid. If it has no terrain field, state that terrain areas are not published/rendered by the user runtime.

## Tests and evidence

- Core serialization and command validation/inverse tests.
- Terrain scope diff/reconstruction tests proving terrain-only edits leave other scopes unchanged.
- Map/editor tests for draw/select/inspect/edit/delete and deterministic polygon round trips.
- Browser acceptance against synthetic E5: draw, set datum and elevation, edit, explicit save, close context, reload in a new context, and compare exact authored terrain.
- Gesture instrumentation: pointer event count, document notifications, save candidates, HTTP requests, and committed revision counts.
- PostgreSQL queries for scope/revision/receipt/checksum/reconstruction and unchanged scope heads.
- Publish regression, focused test/lint/typecheck, and diagnostic comparison to E8.3's 1,124 baseline.

## Refined invariants

- A legacy document with no terrain fields remains semantically unchanged after hydration; absent optional fields stay absent and do not make the document dirty.
- E8.4 uses one campus-wide terrain scope. Individual polygons do not receive independent revisions.
- Terrain area elevations are authored attributes relative to the campus-local datum; they do not imply a continuous or surveyed terrain mesh.

## Approval question

Approve this proposal, especially the separate `terrainAreas` collection and campus-level datum, before implementation begins.
