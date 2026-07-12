# M3.2.2 Wave B — Document Migration

## Prerequisites
- M3.2.2 Wave A complete (selectors exist, all components import from selectors)
- `CoordinateTransformer` from `@navi/core` understands `buildingLocalToWorld` / `worldToBuildingLocal`
- All 896 tests pass

---

## T1 — Fix createDocument + register CoordinateTransformer service

**Description:** The document currently stores rooms/hallways with empty geometry. Fix this by extracting entity data from `graph.components` during document creation, converting world→local coords via CoordinateTransformer. Also register the transformer as an editor service.

**Files to touch:**
- `packages/editor/src/context/create-editor-context.ts`

**Changes:**
1. Create `CoordinateTransformer` at the start of `createEditorContext`
2. Register building-local systems from graph building footprints (compute centroid + rotation)
3. Pass transformer to `createDocument()` 
4. In `createDocument(graph, transformer?)`: for each building floor, match `graph.components` by buildingId+floor+type, convert polygon/polyline/position world→local via `transformer.worldToBuildingLocal()`, populate the document entity
5. Register transformer in service registry as `'transformer'`

**Acceptance:** `createEditorContext().document.buildings[].floors[].rooms[].polygon.points` has local-coord data (not empty).

---

## T2 — Update selectors to read from CampusDocument

**Description:** Replace `useGraphStore` reads in `floor-graph-selectors.ts` with `useEditor()` + `useDocumentSelector()`. Convert document entities (LocalCoord) back to Component[] shape (LatLng) via CoordinateTransformer for backward compat with canvas render code.

**Files to touch:**
- `src/hooks/floor-graph-selectors.ts`

**Changes:**
1. Import `useEditor` from `@navi/editor`, `useDocumentSelector` from `@navi/editor`, `CoordinateTransformer` from `@navi/core`
2. `useFloorComponents(buildingId, floor)`: use `useDocumentSelector` to get building floor's rooms + hallways, convert LocalPolygon→LatLng[] via `transformer.buildingLocalToWorld()`, return `Component[]`
3. `useFloorComponent(id)`: use `findEntity(document, id)` + convert geometry
4. `useFloorComponentsAll(buildingId)`: same as #2 but aggregate all floors
5. `useFloorRenderVersion()` → `useDocumentVersion()`
6. `useFloorCampusId()` → read from document
7. `useFloorSyncStatus/Error`: Keep as-is (sync is unrelated to document)
8. `useLegacyBuilding(buildingId)` → `useBuilding(buildingId)` from `@navi/editor`
9. `useFloorPlanUrls()` → build from document floor planImageIds
10. `countFloorComponents()`, `findGraphBuilding()`: one-shot reads from document via `useEditor().getState()` equivalent
11. Remove `useGraphStore` import entirely

**Critical:** CoordinateTransformer must be accessed via `useEditor().services.get('transformer')`. The selector functions need to handle the case where transformer is null gracefully (return empty array).

**Acceptance:** Same `Component[]` shape returned with correct world-coordinate polygons matching previous graph-store output.

---

## T3 — FloorEditorCanvas dispatches commands

**Description:** Replace all graph-store write calls in FloorEditorCanvas with command dispatches.

**Files to touch:**
- `src/components/floor-editor/FloorEditorCanvas.tsx`

**Changes:**
1. Remove `useGraphStore` import
2. Import `useEditor` from `@navi/editor`
3. Replace `removeComponent(componentId)` → `services.get('dispatcher').execute({ id: 'room.delete'|'hallway.delete'|..., label: ..., payload: { ... } })`
4. Replace `updateComponent(componentId, partial)` → `services.get('dispatcher').execute({ id: 'entity.update', label: 'Update Entity', payload: { entityId, changes } })`
5. Handle edge cases: determine command type based on component type field

**Acceptance:** No more useGraphStore calls in canvas file. All mutations go through dispatcher.

---

## T4 — useFloorDrawing dispatches commands

**Description:** Replace graph-store write calls in useFloorDrawing.

**Files to touch:**
- `src/components/floor-editor/useFloorDrawing.ts`

**Changes:**
1. Replace `addComponentWithPolygon({type:'room', polygon, ...})` → `dispatcher.execute({ id: 'room.create', label: 'Create Room', payload: { buildingId, floorId, name, points: localPolygon } })`
2. Replace `updateBuilding(buildingId, patch)` → `dispatcher.execute({ id: 'building.update', ... })`
3. Remove `save()` calls
4. Use `useEditor()` to get dispatcher and document

**Acceptance:** Room creation dispatches `room.create` command.

---

## T5 — FloorOutliner dispatches commands

**Description:** Replace graph-store write calls in FloorOutliner.

**Files to touch:**
- `src/components/floor-editor/FloorOutliner.tsx`

**Changes:**
1. Replace `removeComponent(id)` → determine entity type from component and dispatch appropriate delete command
2. Remove `save()` calls
3. Use `useEditor()` for dispatcher

**Acceptance:** Entity deletion dispatches delete commands.

---

## T6 — ComponentProperties dispatches commands

**Description:** Replace graph-store write calls in ComponentProperties.

**Files to touch:**
- `src/components/floor-editor/ComponentProperties.tsx`

**Changes:**
1. Replace `updateComponent(id, changes)` → `dispatcher.execute({ id: 'entity.update', ... })`
2. Replace `removeComponent(id)` → delete command
3. Replace `updateBuilding(id, changes)` → `dispatcher.execute({ id: 'building.update', ... })`
4. Remove `save()` calls
5. Use `useEditor()` for dispatcher

**Acceptance:** Property updates and deletions dispatch commands.

---

## Verification

Each task must pass:
1. `npx tsc --noEmit` — no new type errors in changed files
2. `npx vitest run` — all 896+ tests pass
3. No regressions in FloorEditor interaction
