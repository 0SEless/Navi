# Legacy → New Architecture Migration Matrix

## Current State

NAVI Studio has **two editing engines** running in parallel:

```
                    NAVI Studio

                 StudioToolbar
                      │
       ┌──────────────┴──────────────┐
       │                             │
Legacy Editing Engine          New Editing Engine
(legacy fallback)              (target architecture)

useStudioStore                 CampusDocument
InteractionController          ToolRegistry
BuildingTracer                 CommandBus
Legacy Canvas                  Editor Services
Zustand                        Event Bus
Graph class                    GraphAdapter

       │                             │
       └──────────────┬──────────────┘
                      │
                Same UI / Same Project
```

**Goal**: Replace every legacy editing subsystem with its new-architecture equivalent while preserving behavior, then delete the legacy code.

---

## Subsystem Migration Matrix

### 1. Tool Activation

| Property | Legacy | New |
|----------|--------|-----|
| **File** | `useStudioStore.setTool()` — `studio-store.ts` | `ToolRegistry.activate(id)` — `packages/editor/src/tools/registry.ts` |
| **Behavior** | Sets `tool` in Zustand, used by InteractionController for cursor/dragPan routing | Sets `_activeId`, emits to subscribers, used by StudioToolbar for highlight |
| **Used by UI** | InteractionController reads `useStudioStore.tool` for legacy routing | StudioToolbar reads `toolRegistry.activeToolId` for button highlight |
| **Status** | 🟡 PARTIAL — toolbar calls `toolRegistry.activate(t)` only (line 101). No legacy `setTool()` call. But InteractionController still reads `useStudioStore.tool` for legacy fallback. |
| **Fix** | Remove `useStudioStore.tool` dependency from InteractionController. Route all tool state exclusively through ToolRegistry. |
| **Legacy removable?** | ✅ Yes — InteractionController can read `toolRegistryRef.current` instead of `toolRef.current` |

### 2. Canvas Event Routing

| Property | Legacy | New |
|----------|--------|-----|
| **File** | `InteractionController.tsx` (473 lines, hybrid) | `InteractionController.tsx` (calls both paths) |
| **Behavior** | Routes map events (click, dblclick, mousedown, mousemove, mouseup, keydown) to either registry tools or legacy Zustand handlers | Routes to registry tools first, falls back to legacy |
| **Status** | 🟡 PARTIAL — Hybrid routing works but has two sources of truth. Registry tools get events first, except `select` (which is a stub and gets skipped). Legacy tools handle the rest. |
| **Fix** | Implement `entityAtEvent()` in `select-tool.ts`, then route `select` events through registry tool. Migrate legacy handlers (route, building, boundary, room) to registry tools one by one. |
| **Legacy removable?** | 🔴 No — legacy path still handles route/building/boundary/room/asset tools |

### 3. Selection

| Property | Legacy | New |
|----------|--------|-----|
| **File** | `useStudioStore.setSelectedNodeId() / setActiveBuilding() / setSelectedTraceId()` | `SelectionManager` — `packages/editor/src/selection.ts` (245 lines) |
| **Behavior** | Hit-test on map click → set state in Zustand | Entity-based selection with `select()`, `toggle()`, `clear()`, `single`/`multiple` modes |
| **Status** | 🟢 WORKING — `EditorBridge.tsx` syncs both directions with loop guard |
| **Legacy removable?** | ✅ Yes — SelectionManager is fully functional as the single source of truth |

### 4. Building Drawing (Polygon)

| Property | Legacy | New |
|----------|--------|-----|
| **File** | `BuildingTracer.tsx` (139 lines) + legacy handlers in InteractionController | `drawBuildingTool` — `packages/editor/src/tools/draw-building-tool.ts` (54 lines) |
| **Behavior** | Click-to-define polygon vertices with purple extrusion preview, cyan dashed outline, white vertex circles. ConfirmBar/ConfirmOverlay integration. | Click-to-define vertices, dispatches `building.create` via CommandBus on Enter |
| **Status** | 🟡 PARTIAL — Legacy BuildingTracer has richer visual preview (purple fill-extrusion, cyan outline, vertex circles). Registry tool is minimal. |
| **Fix** | Port visual preview layer definitions from BuildingTracer into `draw-building-tool.ts`. Add ConfirmBar/ConfirmOverlay integration to registry tool. |
| **Legacy removable?** | 🔴 No — BuildingTracer preview + ConfirmBar integration not yet in registry tool |

### 5. Route/Trace Drawing

| Property | Legacy | New |
|----------|--------|-----|
| **File** | `useStudioStore.addTracePoint()`, `useStudioStore.setPendingConfirm()` | `drawRoadTool` — `packages/editor/src/tools/draw-road-tool.ts` (51 lines) |
| **Behavior** | Click-to-define waypoints with dashed cyan line preview, width controls, ConfirmOverlay with name/type/color/width form | Click-to-define vertices, dispatches `road.create` via CommandBus on Enter |
| **Status** | 🟡 PARTIAL — Legacy route tool has richer ConfirmOverlay (name input, type toggle, color swatches, width stepper). Registry tool is minimal. |
| **Fix** | Port ConfirmOverlay form to registry tool's finish flow. Add width/name/type/color to `road.create` payload. |
| **Legacy removable?** | 🔴 No — ConfirmOverlay integration not yet in registry tool |

### 6. Room Drawing

| Property | Legacy | New |
|----------|--------|-----|
| **File** | `InteractionController` mousedown→mouseup drag rectangle (lines 273-384) | `drawRoomTool` — `packages/editor/src/tools/draw-room-tool.ts` (60 lines) |
| **Behavior** | Drag to create rectangle → polygon bounds → `addComponentWithPolygon` → Graph mutation | Click-to-define polygon vertices (screen coords `{x,y}`) → dispatches `room.create` |
| **Status** | 🟡 PARTIAL — Legacy uses drag-rectangle (intuitive). Registry tool has bug: stores screen coords `{x,y}` instead of `{lat,lng}`. |
| **Fix** | Fix `drawRoomTool` to store `{lat, lng}` instead of `{x, y}`. Optionally port drag-rectangle to registry tool. |
| **Legacy removable?** | 🔴 No — room creation still relies on legacy path |

### 7. Hallway Drawing

| Property | Legacy | New |
|----------|--------|-----|
| **File** | Not implemented in legacy route | `drawHallwayTool` — `packages/editor/src/tools/draw-hallway-tool.ts` (59 lines) |
| **Behavior** | N/A (no legacy Hallway tool) | Click-to-define polyline vertices (screen coords `{x,y}`) → dispatches `hallway.create` |
| **Status** | 🟠 BUGGY — Registry tool exists but stores screen coords `{x,y}` instead of `{lat,lng}`. Same bug as Room tool. |
| **Fix** | Fix `drawHallwayTool` to store `{lat, lng}` instead of `{x, y}`. |
| **Legacy removable?** | ✅ Already new-only |

### 8. Point Placement (Entrance, Staircase, Elevator)

| Property | Legacy | New |
|----------|--------|-----|
| **File** | Not in legacy (delegated to registry) | `placeEntranceTool`, `placeStaircaseTool`, `placeElevatorTool` |
| **Behavior** | Legacy: handled via InteractionController fallback to registry (line 174) | Single click → dispatches entity.create → auto-returns to select |
| **Status** | 🟢 WORKING — Registry tools are functional. InteractionController routes events to them correctly. |
| **Fix** | None needed |
| **Legacy removable?** | ✅ Already new-only |

### 9. Building Adjust (Drag)

| Property | Legacy | New |
|----------|--------|-----|
| **File** | `InteractionController` handleMouseDown/Move/Up (lines 254-370) with `buildingDragRef` | `buildingAdjustTool` — `packages/editor/src/tools/building-adjust-tool.ts` |
| **Behavior** | Click "Adjust" in properties → mousedown on building → drag → real-time footprint update via GeoJSON mutation → mouseup commits with `updateBuilding` | Similar: mousedown detects building via `pointInPolygon`, mousemove mutates `CampusDocument.footprint.points` directly, mouseup dispatches `entity.update` |
| **Status** | 🟢 WORKING — Both legacy and registry paths exist. InteractionController routes building-adjust exclusively to registry tool (line 249). |
| **Fix** | None needed — already using registry tool exclusively |
| **Legacy removable?** | ✅ Already using registry tool |

### 10. Canvas Drawing Preview

| Property | Legacy | New |
|----------|--------|-----|
| **File** | `DrawingOverlay.tsx` (reads from `useStudioStore` drawPoints/tracePoints) + `InteractionController.updateDrawPreview()` | `InteractionController.updateDrawPreview()` writes to `SRC.DRAWING` GeoJSON |
| **Behavior** | Both push ephemeral geometry to `s-drawing` MapLibre source | Both use same MapLibre source |
| **Status** | 🟡 PARTIAL — Registry drawing tools update preview via `updateDrawPreview()` in InteractionController. Legacy tools push through DrawingOverlay. Two sources compete for the same MapLibre source. |
| **Fix** | Unify to single preview path through registry tools only |
| **Legacy removable?** | ✅ Yes — registry tools' updateDrawPreview() is sufficient |

### 11. ConfirmBar / ConfirmOverlay

| Property | Legacy | New |
|----------|--------|-----|
| **File** | `ConfirmBar.tsx`, `ConfirmOverlay.tsx` (read from `useStudioStore.pendingConfirm`) | Same components, but registry tools don't use them |
| **Behavior** | Legacy tools set `pendingConfirm` → ConfirmBar shows point count + Confirm/Cancel → ConfirmOverlay shows entity form → dispatches creation | Registry tools dispatch immediately on Enter without confirmation UI |
| **Status** | 🟡 PARTIAL — Registry tools skip the confirm flow entirely. ConfirmBar/ConfirmOverlay only work with legacy tools. |
| **Fix** | Wire registry tools to use ConfirmOverlay for entity name/options before dispatch. Or keep registry tools as direct-dispatch and add a Toast/undo fallback. |
| **Legacy removable?** | 🔴 No — confirm flow not yet wired to registry tools |

### 12. Vertex Editing

| Property | Legacy | New |
|----------|--------|-----|
| **File** | `useVertexEditor.ts` + `InteractionController` vertex drag (lines 141-156, 280-307) | Not implemented in new architecture |
| **Behavior** | Near-click detection → drag vertex → real-time preview → mouseup commits new points | N/A |
| **Status** | 🟡 PARTIAL — Works through legacy path only |
| **Fix** | Port to new architecture as a VertexEdit tool or include in selectTool |
| **Legacy removable?** | 🔴 No — no new-architecture equivalent |

### 13. Undo/Redo

| Property | Legacy | New |
|----------|--------|-----|
| **File** | `GraphStore` manual undo (not well-defined) | `HistoryStack` — `packages/editor/src/services/history-stack.ts` |
| **Behavior** | N/A (legacy undo is ad-hoc) | Command-based undo/redo with inverse commands or snapshots |
| **Status** | 🟢 WORKING — HistoryStack is integrated into StudioToolbar undo/redo buttons |
| **Legacy removable?** | ✅ Already new-only |

### 14. Validation

| Property | Legacy | New |
|----------|--------|-----|
| **File** | `graph-validator.ts` (engine layer) | `ValidationEngine` — `packages/editor/src/services/validation-engine.ts` |
| **Behavior** | 10 validation checks on Graph integrity | Three-tier validation (advisory/blocking) on CampusDocument |
| **Status** | 🟢 WORKING — ValidationEngine is integrated. Legacy graph-validator still exists but is unused by Studio. |
| **Legacy removable?** | ✅ Yes — can delete `graph-validator.ts` |

### 15. Publish Pipeline

| Property | Legacy | New |
|----------|--------|-----|
| **File** | Direct API calls | `PublishService` — `packages/editor/src/services/publish-service.ts` |
| **Behavior** | Manual POST to /api/compile | Validation → Compilation → Artifact upload → Status tracking |
| **Status** | 🟢 WORKING — PublishService integrated in StudioToolbar |
| **Legacy removable?** | ✅ Already new-only |

### 16. Data Persistence (Save)

| Property | Legacy | New |
|----------|--------|-----|
| **File** | `useGraphStore.save()` — writes to localStorage + Supabase | `WorkflowService.save()` — delegates to `PersistenceService` |
| **Behavior** | Zustand middleware: 2s debounce → localStorage → Supabase sync | Command-based: document changed → auto-save → status tracking |
| **Status** | 🟢 WORKING — WorkflowService save is integrated in StudioToolbar. Legacy graph-store still runs in parallel. |
| **Fix** | Unify persistence to single path. Currently both save independently. |
| **Legacy removable?** | 🔴 No — graph-store still persists the legacy Graph class |

### 17. Map Rendering

| Property | Legacy | New |
|----------|--------|-----|
| **File** | `MapRenderer.tsx` (reads from both Graph and CampusDocument) | Same MapRenderer |
| **Behavior** | Pushes GeoJSON from `Graph` (legacy) + `CampusDocument` (new) to MapLibre layers | Both sources update the same layers |
| **Status** | 🟢 WORKING — MapRenderer reads from both sources. Redundant but not harmful. |
| **Fix** | Consolidate to single data source (CampusDocument via GraphAdapter) |
| **Legacy removable?** | 🔴 No — still reads Graph directly for some render data |

### 18. Properties Panel

| Property | Legacy | New |
|----------|--------|-----|
| **File** | Legacy: embedded in StudioCanvas area | `packages/editor/src/panels/properties/` (entity-type-specific editors) |
| **Behavior** | Shows entity properties for selected item | Renders property editor matching selected entity type |
| **Status** | 🟢 WORKING — Properties panel uses new architecture |
| **Legacy removable?** | ✅ Already new-only |

---

## Summary

| # | Subsystem | Legacy | New | State | Action |
|---|-----------|--------|-----|-------|--------|
| 1 | Tool activation | `useStudioStore.tool` | `ToolRegistry.activeToolId` | 🟡 PARTIAL | Remove legacy `tool` from InteractionController |
| 2 | Event routing | `InteractionController` (hybrid) | ToolRegistry event dispatch | 🟡 PARTIAL | Route all events through registry tools |
| 3 | Selection | Zustand selection state | `SelectionManager` | 🟢 WORKING | Can delete legacy selection state |
| 4 | Building drawing | `BuildingTracer` (richer preview) | `drawBuildingTool` | 🟡 PARTIAL | Port visual preview + ConfirmBar |
| 5 | Route drawing | `addTracePoint()` + ConfirmOverlay | `drawRoadTool` | 🟡 PARTIAL | Port ConfirmOverlay form |
| 6 | Room drawing | Drag-rectangle | `drawRoomTool` (buggy) | 🟡 PARTIAL | Fix coords, port drag |
| 7 | Hallway drawing | Not implemented | `drawHallwayTool` (buggy) | 🟠 BUGGY | Fix coords |
| 8 | Point placement | Not implemented | 3 tools (entrance/stair/elevator) | 🟢 WORKING | None needed |
| 9 | Building adjust | Drag with buildingDragRef | `buildingAdjustTool` | 🟢 WORKING | None needed |
| 10 | Drawing preview | `DrawingOverlay` + `updateDrawPreview()` | Same | 🟡 PARTIAL | Unify to single path |
| 11 | Confirm flow | `ConfirmBar` + `ConfirmOverlay` | Not wired to registry tools | 🟡 PARTIAL | Wire registry tools to confirm flow |
| 12 | Vertex editing | `useVertexEditor` | Not implemented | 🟡 PARTIAL | Port to new architecture |
| 13 | Undo/redo | Ad-hoc | `HistoryStack` | 🟢 WORKING | None needed |
| 14 | Validation | `graph-validator.ts` | `ValidationEngine` | 🟢 WORKING | Delete legacy |
| 15 | Publish | Direct API | `PublishService` | 🟢 WORKING | None needed |
| 16 | Persistence | `useGraphStore.save()` | `WorkflowService.save()` | 🟡 PARTIAL | Unify save path |
| 17 | Rendering | `MapRenderer` (dual source) | Same | 🟡 PARTIAL | Consolidate to single source |
| 18 | Properties panel | Embedded | `packages/editor/panels/properties/` | 🟢 WORKING | None needed |

---

## Migration Priority Order

### Tier 1 — Fix bugs in new registry tools (low effort, high impact)
1. Fix `entityAtEvent()` in `select-tool.ts` — implement actual hit-testing via `map.queryRenderedFeatures`
2. Fix `drawRoomTool` — store `{lat, lng}` instead of `{x, y}`
3. Fix `drawHallwayTool` — store `{lat, lng}` instead of `{x, y}`

### Tier 2 — Port legacy behaviors to registry tools (medium effort)
4. Wire registry drawing tools to ConfirmBar/ConfirmOverlay
5. Port building visual preview layers from BuildingTracer to draw-building-tool
6. Port route ConfirmOverlay form to draw-road-tool
7. Port room drag-rectangle behavior to draw-room-tool

### Tier 3 — Unify event routing (high impact, risky)
8. Remove `useStudioStore.tool` dependency from InteractionController
9. Route all events exclusively through ToolRegistry
10. Delete InteractionController legacy fallback after all tools migrated

### Tier 4 — Cleanup (safe)
11. Delete `graph-validator.ts`
12. Consolidate MapRenderer to single source
13. Unify persistence path
