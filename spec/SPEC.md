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

---

# Production Studio conflict recovery action

## What

The exact red Studio synchronization-conflict banner must expose an obvious
`Re-sync` action that safely retries preserved local work through the existing
save queue/CAS path. Missed acknowledgements must auto-heal without a second
POST, genuine divergence must preserve both sides, and authentication failures
must be labeled as authentication failures.

## Success Criteria

1. The rendered conflict banner shows `Re-sync` beside its warning.
2. Local-ahead recovery posts through the normal queue with the latest server revision and records the acknowledgement.
3. Server-equals-local with a stale marker adopts the server revision without POSTing.
4. Genuine divergence and retry failure leave local data preserved and conflict visible.
5. HTTP authentication failures show the sign-in-again message, while Road Recovery remains unchanged.

## Known Pitfalls

- Do not remove the conflict gate from normal autosave.
- Do not force overwrite or add a new endpoint.
- Preserve the existing server fingerprint and CAS revision boundaries.
- Focused Vitest workers and Graphify may require the documented Windows elevated path.
