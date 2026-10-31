# Existing Architecture Inventory

## Editor and document

- `packages/core/src/types/document.ts`: optional `terrainAreas` and `terrainVerticalDatum` on `CampusDocument`; absent legacy fields remain valid.
- `packages/core/src/types/entities.ts`: stable-ID `TerrainArea` polygon with uniform authored elevation; one shared authored campus-local datum. Not a mesh.
- `packages/core/src/geometry/terrain-polygon.ts`: finite geographic point, simple/non-degenerate polygon, datum and overlap validation.
- `src/components/studio/TerrainAreaAuthoring.tsx`: campus `StudioCanvas` MapLibre authoring; draw/select/inspect, dispatch create/update/delete. Boundary vertex drag updates on drag-end.
- `packages/editor/src/commands/terrain-area-handlers.ts`, registry, `CommandDispatcher`, `DocumentStore`: reversible commands. `packages/editor/src/history.ts`: undo/redo, inverse commands where present, otherwise whole-document snapshots, memory estimation/eviction. Grid history should use bounded sparse tile deltas.
- `StudioWorkspace.tsx`: Explorer, map, optional right inspector, top Save, bottom ToolDock. Terrain is campus-level, not Floor Editor data.

## Persistence/recovery

`src/services/scoped-change-detection.ts` puts boundary, legacy areas, terrain polygons and datum in one `terrain:<campusId>` scope. `scoped-save-document-session.ts` compares baseline and saves changed scope only on explicit Save. `scoped-campus-save.ts` handles checksum/replay/atomic batches. `scoped-postgres-adapter.ts` stores operations and full campus checkpoints every 25 revisions by default. `scoped-campus-snapshot.ts` verifies/reconstructs terrain. `studio-local-drafts.ts` stores checksummed authored document/graph in IndexedDB; `graph-store.ts` schedules local-draft save at zero delay after mutation when the opt-in mode is enabled.

## Coordinates, publish and runtime

`packages/core/src/coordinates/transformer.ts` owns world/building/floor transforms. Grid distances need a shared projected campus-meter frame, never degree-space arithmetic. `Building.baseElevation` means meters above sea level; `Floor.elevation` is relative to building base. Terrain uses authored campus-local datum; there is no safe automatic conversion.

Compiler `artifacts.ts` validates/carries optional terrain polygons/datum; publish route accepts them. E8.5 `ExploreMap` mounts `TerrainLayer`, which displays GeoJSON fill/outline through MapLibre: plan-view only. No height-grid or mesh contract exists. Old bundles without these optional fields remain compatible.

MapLibre is present; no installed Three.js/R3F package was found in the inspected dependency set. Building fill-extrusion is not an editable terrain grid renderer. New renderer dependency requires later approval and benchmarking.
