# M3.2.2 Wave B — FloorEditor reads from CampusDocument + writes via Commands

## What

Migrate FloorEditor subsystem from reading `graph.components` via graph-store to reading entity geometry from **CampusDocument** (the source document), and from writing through graph-store actions to dispatching **commands**.

## Success Criteria

1. `createDocument(graph)` populates floor-level entities (rooms, hallways, staircases, elevators, entrances) with real geometry from `graph.components`, converting world coords → local coords via `CoordinateTransformer`
2. `CoordinateTransformer` registered as an editor service, initialized with building-local systems from building footprints
3. `floor-graph-selectors.ts` reads from `CampusDocument` via `useEditor()` + `useDocumentSelector()`, converting local-coord geometry back to world-coord `Component[]` for backward compat
4. FloorEditorCanvas dispatches `room.delete` / `hallway.delete` / `entity.update` commands instead of `removeComponent()` / `updateComponent()`
5. useFloorDrawing dispatches `room.create` instead of `addComponentWithPolygon()`
6. FloorOutliner dispatches entity delete commands instead of `removeComponent()`
7. ComponentProperties dispatches `entity.update` / delete commands instead of `updateComponent()` / `removeComponent()`
8. All 896+ tests pass; no new type errors

## Known Pitfalls
- CoordinateTransformer must be initialized before createDocument to convert graph components (world→local)
- World→local and local→world round-trip must be exact (test with real building footprints)
- GraphAdapter.sync() must run after document mutations to keep graph-store in sync for navigation compiler
