# Architecture Audit — M5 Phase 1 Bridge Dependencies

## Achieved: Entity Model Independence

The new domain model (ConnectorStop, VerticalConnector, RoomDoor, Anchor hierarchy) is fully independent of the legacy navigation graph (Graph/GraphAdapter):

| Component | Depends on Legacy Graph? | Depends on New Model? |
|-----------|-------------------------|----------------------|
| `core/src/types/entities.ts` | No | Self-contained |
| `core/src/serialization/serializer.ts` | No | New fields serialized normally |
| `core/src/ownership/ownership-graph.ts` | No | Validates new entities only |
| `editor/src/graph-adapter.ts` | Yes (bridges new→legacy) | Reads new entities, writes legacy graph |
| `editor/src/validation/rules/modules/connector-connectivity.ts` | No | Walks CampusDocument directly |
| `editor/src/validation/rules/modules/room-door-connectivity.ts` | No | Walks CampusDocument directly |

## Remaining Bridge Dependencies

1. **`editor/src/context/create-editor-context.ts:createDocument()`** — Legacy graph→CampusDocument reconstruction. Now correctly defaults `[]` for new fields but does not reconstruct them (no legacy equivalent exists).

2. **`editor/src/context/campus-loader.ts`** — Loads legacy graphs → converts via `createDocument()`. The migration fills defaults. No data loss since new entities didn't exist in legacy format.

3. **`editor/src/rendering/`** — EntityRenderer reads CampusDocument (not legacy graph). New entity types are not yet rendered, but rendering is M5 Phase 2.

## Verification

- Core typecheck: 0 new errors (2 pre-existing)
- All 85 test files pass (767 tests)
- Backward-compat: old documents without new fields get defaults via migration
