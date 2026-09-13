# Floor Editor Stabilization Audit

Date: 2026-09-13

## Scope

This audit precedes production edits for the Floor Editor Stabilization ticket. It identifies the current implementation, reusable primitives, and confirmed gaps across Door, Stair, Elevator, Entrance, 2.5D rendering, Outliner, room ownership, routing, Window UI, and stale local/server synchronization.

## Current architecture

- `src/components/floor-editor/FloorEditor.tsx` owns the active tool, 2D/2.5D mode, selected entity, and Inspector/Outliner composition.
- `src/components/floor-editor/FloorEditorCanvas.tsx` owns the MapLibre sources/layers, floor projections, selection, wall-junction editing, polygon body/vertex editing, and the optional Canvas overlay.
- `src/components/floor-editor/useFloorDrawing.ts` owns polygon/line authoring and dispatches commands. Wall authoring now supplies existing wall bodies to snapping, preserving the Comsai room-candidate fix.
- `src/components/floor-editor/POIGeometryAuthoring.tsx` (under `src/components/studio`) owns drag authoring for POI circle/rectangle and polygon geometry, with explicit indoor/outdoor context resolution and persistence through `poi.create`.
- `src/components/floor-editor/FloorOutliner.tsx` groups floor components by type, but category rows are currently always expanded and there is no room-parent hierarchy.
- `src/components/floor-editor/ComponentProperties.tsx` is the current Inspector. It exposes semantic room, entrance, route, and stair/elevator range fields, but not a shared rectangle transform contract for Door/Stair/Elevator.
- `packages/editor/src/tools/door-tool.ts` is a two-click, same-wall opening tool. It dispatches `opening.create` with wall ID, offset, and width.
- `packages/editor/src/tools/stair-tool.ts` and `elevator-tool.ts` dispatch a single point placement. Neither supports drag preview, rectangle geometry, move/resize/rotate, or a shared edit session.
- `packages/editor/src/tools/poi-tool.ts` is a point/QR tool. Rectangle POI authoring is implemented separately in the Studio hook rather than in this canonical tool.
- `packages/editor/src/rendering/entity-renderer.ts` is an event-driven document renderer for the newer editor architecture. It filters indoor entities by active floor and POIs by `showOnMap`, and listens to `document.changed` for undo/redo.
- `src/components/floor-editor/FloorEditorCanvas.tsx` also maintains a legacy MapLibre renderer. In 2.5D it toggles layer visibility and camera pitch while still using separately built room, stair/elevator, opening, and route sources.

## Reusable interaction primitives

1. `useEditablePolygonEditor` and the MapLibre vertex/body drag code in `FloorEditorCanvas.tsx` provide move and vertex resize for polygon components, but have no rotation handle and are not a generic rectangle session.
2. `FloorPlanAlignment.tsx` provides a complete move/resize/rotate handle interaction, but its state is a floor-plan image alignment model and cannot be reused directly for authored entities.
3. `POIGeometryAuthoring.tsx` provides the closest production rectangle authoring behavior: click-drag preview, local/world context validation, commit, selection, and persistence. Its edit path is in `src/components/studio/usePoiEditor*` and should be extracted/adapted rather than duplicated.
4. `LinearGeometryOverlay` and `useEditablePathEditor` are appropriate for open polylines (hallways/routes), not rectangle entities.

## Confirmed gaps by ticket area

### Door

- Current production tool is wall-attached and line/span based.
- Doors are rendered from canonical `Floor.openings` as wall-derived lines.
- There is no rectangle body, rotation handle, room-parent field, reparent/unassigned state, or explicit route anchor/connection edit flow for a Door object.
- Existing opening schema must remain readable for migration/backward compatibility while the authoring authority is defined.

### Stair and Elevator

- Creation is point-click only (`feature.create` / `elevator.create`).
- Existing floor component projection can display polygons when present, and `FloorEditorCanvas` already supports body/vertex edits for stair/elevator polygons.
- Creation does not create a rectangle, does not share POI-style preview/edit interactions, and Inspector fields do not expose transform/rotation.
- Vertical semantics (`fromLevel`/`toLevel` and elevator level records) must survive geometry extraction.

### Entrance visibility and routing

- Outdoor route selection is already an explicit picker flow and must not be redesigned.
- Entrance rendering has point layers and relationship overlays, but selection priority competes with structural layers and active-source state needs browser verification.
- Indoor entrance access is represented by `Floor.entranceAccess`; route geometry is in `Floor.routeNetwork`. The current route authoring code contains explicit start validation and must not auto-connect arbitrary nodes.

### 2.5D

- `FloorEditorCanvas` keeps MapLibre mounted in both modes, changes camera pitch, and toggles independent layer visibility.
- Derived rooms, openings, stairs/elevators, and route edges have separate sources. The source population effects are keyed to document/render versions, while the mode effect only changes layout/camera.
- `EntityRenderer` and `renderer-2_5d.ts` are separate rendering architectures. The audit did not yet establish one authoritative 2.5D population root cause; this requires a focused lifecycle test and browser trace before altering rendering.

### Outliner

- Floors are collapsible.
- Component type groups are not collapsible and are not nested under room ownership/categories.
- Selection is synchronized for active-floor items through `onSelect`, but room-parent child selection is not represented.

### Room ownership

- Semantic rooms are wall-derived faces with `RoomAttributes.faceId` identity.
- Existing `RoomDoor` and `Opening` types do not define a rectangle Door parent/child contract.
- No centralized automatic parent assignment/reparenting helper was found during this audit.

### Window

- Window creation/rendering/schema support exists. The ticket requests hiding/removing authoring affordances while preserving data; this is a UI/tool registry change, not a schema deletion.

### Stale local/server state

- Existing errors document an unresolved graph-store save conflict and a browser tab with unsaved local state.
- The safe contract is: clean local + newer server adopts server; dirty local + newer server surfaces a conflict without mutation; server timestamp is authoritative; never call an unconditional server-load action automatically.
- This requires focused store tests and browser verification with a disposable fixture. It must not discard the user's currently unsaved production tab.

## Protected behavior

- Preserve the Comsai wall-body snapping fix in `useFloorDrawing.ts` and `packages/editor/src/geometry/snapping.ts`.
- Preserve explicit outdoor route picker behavior and route-start validation.
- Preserve Window data/schema and existing published rendering.
- Do not directly mutate production Supabase rows or choose a destructive server/local resolution for the open production tab without explicit user authorization.

## Implementation decomposition

The work should be staged into separate plans/tasks:

1. Shared rectangle interaction contract and Door/Stair/Elevator authoring/editing.
2. Room parent assignment and explicit Door route anchor/connection behavior.
3. Entrance visibility/selection and route-source verification.
4. Outliner hierarchy and selection synchronization.
5. 2.5D population lifecycle/root-cause fix.
6. Window authoring affordance removal.
7. Stale local/server conflict handling.

Each stage requires focused tests, the existing protected regression matrix, and real browser verification before it is marked complete.
