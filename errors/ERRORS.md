# Error Log

## 2026-07-16: No errors during M4 freeze session

This session was a planning and design session only:
- ADR 008 written (no implementation errors)
- Domain model spec finalized (no implementation errors)
- Release tag created (no implementation errors)
- Implementation plan created (no implementation errors)

### Prevention carried forward

Before writing any M5 Phase 1 code, the following known error patterns are documented:

1. **S-006 cascade deletion:** New entity types (ConnectorStop, Anchor) must have proper delete cascades. Already handled by building/floor handler pattern — extend to new types.
2. **S-009 genId compliance:** All new entity IDs must use `genId(prefix)` from `@navi/editor/id.ts`. No `Date.now()` or `Math.random()`.
3. **S-005 selection:** SelectionManager works by entity ID — new entities work automatically, no special handling needed.
4. **S-002 history contract:** All command handlers must call `documentStore.commit()` after mutation. New entity handlers follow this by convention.
5. **Compiler boundary:** New entities should never appear in NavNode/NavEdge types. The compiler intermediate representation (Navigation Primitives) is the translation layer.

## 2026-07-16: M5 Phase 1 Implementation

### Errors Encountered

1. **`floor.connectorStops is not iterable` at graph-adapter.ts:190**
   - **Cause**: New required field `connectorStops` was missing from test factories (`data-round-trip.test.ts`, `create-editor-context.ts:createDocument()`, `height-regression.test.ts`). The GraphAdapter's `sync` method iterated `floor.connectorStops` which was `undefined`.
   - **Fix**: Added `connectorStops: []` to all floor objects in test factories and `createDocument()`. Same for `verticalConnectors: []` on buildings and `roomDoors: []` on rooms.
   - **Prevention**: Any code that constructs `Floor`, `Building`, or `Room` objects must include the new required fields. Use the shared `test-helpers.ts` `createFloor()`, `createBuilding()`, `createRoom()` functions which now include defaults.

2. **`serializer.ts` TS2352: CampusDocument cast failed**  
   - **Cause**: After `validateDocument` was changed to assert `Record<string, unknown>`, the `as CampusDocument` cast was too aggressive for TypeScript.
   - **Fix**: Changed to `as unknown as CampusDocument` double cast.
   - **Prevention**: When chaining assertion functions that narrow to `Record<string, unknown>`, use `as unknown as TargetType`.

3. **`roundTrip()` failed for documents without new fields**  
   - **Cause**: `JSON.stringify` strips `undefined` values. Documents without `verticalConnectors: []` would serialize without the key, but after `migrateDocument` adds it, the JSON strings differ.
   - **Fix**: Added `migrateDocument()` call in `deserializeDocument()` that defaults all new fields to `[]`.
   - **Prevention**: Any new required array field must be added to `migrateDocument()` for backward compatibility.

## 2026-07-17: M6.5a/M6.5b verification + registry cleanup

### Errors Encountered

1. **Loader rejects artifact with schemaVersion '1.0.0' (UNSUPPORTED_VERSION)**
    - **Error**: Panorama loader test failed with UNSUPPORTED_VERSION: Expected schema version 1.0, got 1.0.0. The hydrator (rtifact-hydrator.ts) compares the *artifact file's* schemaVersion against the validator's supportedSchemaVersion: '1.0' (exact string match), NOT the manifest entry.
    - **Cause**: Test fixtures wrote graph/panorama files with schemaVersion: '1.0.0'. The publisher default is '1.0.0' but real publish flows pass '1.0' via schemaVersions.
    - **Fix**: Test fixtures use schemaVersion: '1.0' for artifact files AND manifest artifact entries.
    - **Prevention**: Any hand-written loader test fixture must use '1.0' for the artifact *file's* schemaVersion. The loader reads schemaVersion from the file content, not the manifest.

2. **Bogus duplicate directory 
evi-next**
    - **Error**: Several bash cd commands accidentally used 
evi-next (typo of 
avi-next), causing "no tests" / module-not-found confusion and editing files in the wrong place.
    - **Cause**: 
evi-next is a stale duplicate created by the path typo � it contains only a stray copy of panorama-loader.test.ts and no loader source.
    - **Fix**: Deleted 
evi-next after verifying no unique content; re-ran all edits against 
avi-next.
    - **Prevention**: All work lives in 
avi-next. Never cd to 
evi-next. If a cd reports module-not-found or "0 tests", check the path spelling first.

3. **Duplicate const panoramaSchema in package-builder.ts**
    - **Error**: Publisher test reported Identifier 'panoramaSchema' has already been declared.
    - **Cause**: M6.5a T3 edit appended a second const panoramaSchema = ... line.
    - **Fix**: Removed the duplicate declaration.
    - **Prevention**: When appending to a function, diff the surrounding lines � the compiler/edit step must not leave doubled statements.

4. **M6.5a describe block broke build-artifacts.test.ts brace structure**
    - **Error**: Transform failed: Unexpected token / orphaned describes � the M6.5a describe('PanoramaIndex') block was inserted but left the original describe('SearchIndex'...) orphaned (no parent describe).
    - **Cause**: Edit inserted the new describe after the top-level describe closed, splitting the structure.
    - **Fix**: Rewrote the file with all sub-describes (PanoramaIndex, SearchIndex, SpatialIndex, BuildingIndex, POIIndex) nested under one top-level describe('buildArtifacts').
    - **Prevention**: When inserting a describe block into a test file, verify the outer describe still wraps it; run the single test file before moving on.

5. **M7.0: `roomId` does not exist on `SearchResult`**
   - **Error**: `Property 'roomId' does not exist on type 'SearchResult'` caught by `tsc --noEmit`.
   - **Cause**: Reference service referenced `suggestion.roomId` but `SearchResult` has `nodeId`, not `roomId`.
   - **Fix**: Changed `suggestion.roomId` → `suggestion.nodeId`.
   - **Prevention**: Run `tsc --noEmit` on new code before committing. Reference only fields documented in the capability's interface.

6. **M7.0: Incorrect relative import path in composition contract test**
   - **Error**: `Cannot find module '../engine'` — test at `src/composition/__tests__/foo.test.ts` needs `'../../engine'`.
   - **Cause**: Three levels of nesting from `__tests__/` to engine dir.
   - **Fix**: Changed `'../engine'` → `'../../engine'`.
   - **Prevention**: Verify import depth when creating files in subdirectories. Pattern: `src/composition/*.ts` uses `'../engine'`, `src/composition/__tests__/*.ts` uses `'../../engine'`.

7. **Production CommandRegistry CRUD floor handlers missing**
   - **Error**: `create-editor-context.ts` only registered `floorManageHandler` (no-op, id: `floor.manage`). FloorManagerDialog dispatches `floor.create`, `floor.rename`, `floor.delete`, `floor.duplicate` — would throw "Unknown command" in production.
   - **Cause**: Previous sessions added floor CRUD handlers to test registries but never registered them in the production context.
   - **Fix**: Registered `floorCreateHandler`, `floorRenameHandler`, `floorDeleteHandler`, `floorDuplicateHandler`, and `floorReorderHandler` in `create-editor-context.ts`.
   - **Prevention**: When adding new command handlers, register them in `create-editor-context.ts` alongside the test registries. Run `dispatcher.test.ts` integration test that exercises production registration path.

8. **Regression: e2e tests used pre-M6 engine API (engine.search.query, engine.routing.findRoute)**
    - **Error**: walking-skeleton.test.ts and egression-pipeline.test.ts failed after M6.1/M6.2 replaced PositionAPI/SearchAPI/engine.routing with capability services.
    - **Cause**: Those tests predated the capability refactor and referenced removed methods.
    - **Fix**: Updated to engine.search.search(query) (returns SearchResult[] with .title, not .entry.label) and engine.navigation.findRoute(...).
    - **Prevention**: Any test touching RuntimeEngine must use the capability surface (engine.search, engine.navigation, engine.buildings, engine.location, engine.panoramas). engine.routing / engine.search.query no longer exist.
