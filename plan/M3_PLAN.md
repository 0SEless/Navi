# M3: Campus Authoring — Execution Plan

## Reorganized Task Order (per architecture review)

```
Commands first (foundation for everything)
  ↓
Rendering with preview layer (see what you're editing)
  ↓
Floor Manager (needed before room editing)
  ↓
Calibration UI (needed before room tracing)
  ↓
Properties Panel (tools open properties after entity creation)
  ↓
Asset Manager (needed for panorama image uploads)
  ↓
Geometry Drawing Tools (building, room, hallway, road — complex, poly-based)
  ↓
Placement Tools (entrance, stair, elevator, panorama, QR — simple, point-based)
  ↓
Graph Adapter (migration)
  ↓
Tests (120+)
  ↓
Demo Campus Authoring (final validation — recreate ASU-Ibajay campus)
```

**New document:** `docs/spatial-editing-workflow.md` — defines interaction model for every tool.

**Follow-up (post-M3):** Vertex editing (move/insert/delete), edge splitting, polygon transformation — tracked as M3.5.

---

## Wave 1 — Remaining Commands (T3.1–T3.8)

All follow the pattern established in M2: `entity.create`, `entity.rename`, `entity.delete` handlers. Each registers in `CommandRegistry`, emits appropriate event, declares inverse where possible.

### T3.1 — Room Commands

**Files:** `packages/editor/src/commands/room-handlers.ts`, `packages/editor/src/commands/room-handlers.test.ts`

**Handlers:**
- `room.create` — inserts Room into Floor.rooms[], validates polygon (≥3 pts, closed, inside building footprint)
- `room.rename` — updates name
- `room.delete` — removes Room, emits `entity.deleted`

**Inverse:** create ↔ delete; rename ↔ rename(previousName)

**Acceptance:** Room created in correct building/floor; polygon validated; undo restores exact state.

---

### T3.2 — Hallway Commands

**Files:** `packages/editor/src/commands/hallway-handlers.ts`, `packages/editor/src/commands/hallway-handlers.test.ts`

**Handlers:**
- `hallway.create` — inserts Hallway into Floor.hallways[]
- `hallway.rename` — updates name
- `hallway.delete` — removes Hallway

**Acceptance:** Hallway created with polyline; undo removes it.

---

### T3.3 — Road Commands

**Files:** `packages/editor/src/commands/road-handlers.ts`, `packages/editor/src/commands/road-handlers.test.ts`

**Handlers:**
- `road.create` — inserts Road into CampusDocument.roads[]
- `road.rename` — updates name
- `road.delete` — removes Road

**Acceptance:** Road created with polyline and width; undo works.

---

### T3.4 — Entrance Commands

**Files:** `packages/editor/src/commands/entrance-handlers.ts`, `packages/editor/src/commands/entrance-handlers.test.ts`

**Handlers:**
- `entrance.create` — inserts Entrance into Floor.entrances[]
- `entrance.delete` — removes Entrance

**Acceptance:** Entrance placed on floor; undo removes it.

---

### T3.5 — Staircase Commands

**Files:** `packages/editor/src/commands/staircase-handlers.ts`, `packages/editor/src/commands/staircase-handlers.test.ts`

**Handlers:**
- `staircase.create` — inserts Staircase
- `staircase.delete` — removes Staircase

**Acceptance:** Staircase placed; undo works.

---

### T3.6 — Elevator Commands

**Files:** `packages/editor/src/commands/elevator-handlers.ts`, `packages/editor/src/commands/elevator-handlers.test.ts`

**Handlers:**
- `elevator.create` — inserts Elevator
- `elevator.delete` — removes Elevator

**Acceptance:** Elevator placed; undo works.

---

### T3.7 — Panorama Commands

**Files:** `packages/editor/src/commands/panorama-handlers.ts`, `packages/editor/src/commands/panorama-handlers.test.ts`

**Handlers:**
- `panorama.create` — inserts Panorama (with imageAssetId, heading, hotspots)
- `panorama.delete` — removes Panorama
- `panorama.addHotspot` — adds hotspot to panorama
- `panorama.removeHotspot` — removes hotspot from panorama

**Acceptance:** Panorama with image and hotspots created; undo deletes it.

---

### T3.8 — QR Checkpoint Commands

**Files:** `packages/editor/src/commands/qr-handlers.ts`, `packages/editor/src/commands/qr-handlers.test.ts`

**Handlers:**
- `qr.create` — inserts QRCheckpoint
- `qr.delete` — removes QRCheckpoint

**Acceptance:** QR checkpoint placed; undo works.

---

## Wave 2 — Rendering with Preview Layer (T3.9)

### T3.9 — Entity Rendering on Canvas

**Files:** `packages/editor/src/rendering/`, `packages/editor/src/rendering/layers.ts`

**What:** MapLibre GL layers and GeoJSON sources for each entity type.

**Layer stack (bottom to top):**

```
 1. Base map tiles (existing MapLibre)
 2. Floor plan images (calibrated overlays)
 3. Building footprints (fill + outline, per-building color)
 4. Room polygons (fill + outline, per-category color)
 5. Hallway polylines (with width visualization)
 6. Road polylines (with width visualization)
 7. Entrance markers (Point icons)
 8. Staircase markers (Point icons)
 9. Elevator markers (Point icons)
10. Panorama markers (Point icons)
11. QR markers (Point icons)
12. Selection overlays (highlight stroke + vertex handles)
13. Hover highlight (lighter stroke, pointer cursor)
14. Snap indicators (dots + distance labels)
15. Preview layer (tool in-progress geometry — dashed, semi-transparent)
16. Validation overlays (red/gold border + error icons)
```

**Layer ownership:**

| Layer | Owner | Update trigger |
|-------|-------|----------------|
| Entity layers (3–11) | Renderer | `entity.created/updated/deleted` |
| Selection overlay | SelectionManager | `selection.changed`, `hover.changed` |
| Snap layer | Active tool | `pointermove` |
| Preview layer | Active tool | `pointermove`, `pointerdown` |
| Validation overlay | ValidationRegistry | After validation run |

**Preview layer** — dedicated MapLibre source/layer pair. The active tool writes temporary geometry here during drawing. It is separate from committed entity layers so tools never touch `CampusDocument` during preview. On tool finish, preview is cleared and the real entity is rendered via the entity layer.

**Selection rendering:**
- Selected: blue highlight stroke, vertex dots at each point
- Hovered: lighter stroke, pointer cursor
- Active floor: full opacity; inactive floors: 30% opacity

**Acceptance:** All entity types render on canvas; preview layer shows tool geometry; selection overlay renders on top; colors per category.

---

## Wave 3 — Floor Manager (T3.10)

### T3.10 — Floor Manager

**Files:** `packages/editor/src/panels/floor-manager.tsx`, `packages/editor/src/panels/floor-manager.test.tsx`

**What:** UI for managing floors within a building.

```
Operations:
├── Add floor (level = building.floors.length, label = "Floor N")
├── Rename floor (inline edit)
├── Duplicate floor (copies rooms/hallways with new IDs)
├── Delete floor (confirmation, cascade deletes rooms/hallways)
├── Reorder floor (change level number)
├── Toggle visibility
├── Toggle lock
└── Set active floor
```

**Integration:** Lives in left sidebar below building tree. Only visible when a building is selected.

**Active floor rules:**
- Exactly one floor active per building at a time
- Switching buildings switches to last-active floor
- Room/hallway/entrance tools require active floor (disable + tooltip if none)
- Inactive floors render at 30% opacity on canvas
- Locked floors show lock icon, skip all mutation attempts

**Acceptance:** Floors can be added/renamed/deleted/reordered; active floor determines visible layer; duplicate copies rooms.

---

## Wave 4 — Calibration UI (T3.11)

### T3.11 — Floor Plan Calibration UI

**Files:** `packages/editor/src/panels/calibration.tsx`, `packages/editor/src/panels/calibration-tool.ts`

**What:** Visual calibration of floor plan images to geographic coordinates. Lives near Floor Manager because tracing rooms depends on calibrated floor plans.

**Workflow:**
1. Upload floor plan image (triggers asset import via Asset Manager)
2. Image appears as semi-transparent overlay on canvas
3. Click two or more control points on the image
4. Enter corresponding real-world coordinates for each
5. Compute affine transform (from `@navi/core` calibration module)
6. Validate: overlay aligns with building footprint
7. Save calibration data to floor's `svgOverlayId` + calibration metadata

**Integration:** Activates when "Calibrate Floor" is clicked in Layers panel or Floor Manager.

**Acceptance:** Image loads as overlay; control points clickable; transform computed; overlay aligns with footprint; calibration persists with floor.

---

## Wave 5 — Properties Panel (T3.12–T3.20)

Per-entity property editors. Each opens when its entity type is selected. Subscribes to `entity.updated` for live refresh.

### T3.12 — Building Properties

**Files:** `packages/editor/src/panels/properties/building-props.tsx`

**Fields:** name (text), code (text), category (dropdown), description (textarea), color (color picker), baseElevation (number), height (number), aliases (tag list)

**Acceptance:** All fields render; changes dispatch commands; validation errors shown inline.

### T3.13 — Floor Properties

**Files:** `packages/editor/src/panels/properties/floor-props.tsx`

**Fields:** label (text), level (number, read-only), elevation (number), planImageId (asset picker)

**Acceptance:** Floor metadata editable; plan image shown as thumbnail.

### T3.14 — Room Properties

**Files:** `packages/editor/src/panels/properties/room-props.tsx`

**Fields:** name (text), number (text), category (dropdown), capacity (number)

**Acceptance:** Room properties editable; polygon shown as mini preview.

### T3.15 — Hallway Properties

**Files:** `packages/editor/src/panels/properties/hallway-props.tsx`

**Fields:** name (text), width (number slider), color (color picker)

**Acceptance:** Hallway width adjustable.

### T3.16 — Road Properties

**Files:** `packages/editor/src/panels/properties/road-props.tsx`

**Fields:** name (text), width (number slider), surface (dropdown), type (dropdown)

**Acceptance:** Road surface and type selectable.

### T3.17 — Entrance Properties

**Files:** `packages/editor/src/panels/properties/entrance-props.tsx`

**Fields:** label (text), type (dropdown), hasQR (toggle), hasPanorama (toggle)

**Acceptance:** Entrance type editable.

### T3.18 — Staircase Properties

**Files:** `packages/editor/src/panels/properties/staircase-props.tsx`

**Fields:** name (text), fromLevel (number), toLevel (number), type (dropdown)

**Acceptance:** Staircase levels and type editable.

### T3.19 — Elevator Properties

**Files:** `packages/editor/src/panels/properties/elevator-props.tsx`

**Fields:** name (text), fromLevel (number), toLevel (number)

**Acceptance:** Elevator levels editable.

### T3.20 — Panorama + QR Properties

**Files:** `packages/editor/src/panels/properties/panorama-props.tsx`, `packages/editor/src/panels/properties/qr-props.tsx`

**Fields:**
- Panorama: label (text), heading (number slider), imageAssetId (asset picker), hotspots (list, add/remove)
- QR: label (text), code (text), connectorNodeId (read-only)

**Acceptance:** Panorama heading and hotspots adjustable; QR code editable.

---

## Wave 6 — Asset Manager (T3.21)

### T3.21 — Asset Manager

**Files:** `packages/editor/src/asset-manager.ts`, `packages/editor/src/asset-manager.test.ts`

**What:** Manages imported assets (floor plan images, panorama images) with dedup and orphan cleanup. Placed here because Panorama tool depends on it.

```
AssetManager:
├── import(path) → AssetEntry (xxHash64 → same content returns same entry)
├── get(id) → AssetEntry | undefined
├── remove(id) → void (blocks if entity references it)
├── has(id) → boolean
├── references(id) → string[] (which entities use this asset)
├── list() → AssetEntry[]
└── cleanup() → removes unreferenced assets

AssetEntry {
  id: string (xxHash64)
  fileName: string
  mimeType: string
  size: number
  contentHash: string
  storagePath: string
  importedAt: string
}
```

**Acceptance:** Import returns same entry for duplicate content; orphan cleanup removes unreferenced files; remove blocks if entity references asset.

---

## Wave 7 — Geometry Drawing Tools (T3.22–T3.25)

All tools follow the same pattern:

```
activate() → cursor change, enter drawing mode
onPointerDown() → add vertex
onPointerMove() → rubber-band preview on Preview Layer, snap indicators
onDblClick() / onKeyDown(Enter) → finish
onKeyDown(Escape) → cancel, clear preview
onKeyDown(Backspace) → undo last vertex (keep drawing)
finish() → validate → dispatch command → clear preview → exit to SelectTool
```

**Common behavior:**
- Status bar shows "Click to place vertex +N" / "Enter to finish"
- Tool preview rendered on isolated Preview Layer (never touches CampusDocument)
- EntityAtPoint disabled during drawing
- Validation runs on preview (live error display, not blocking)

### T3.22 — DrawBuildingTool

**Files:** `packages/editor/src/tools/draw-building-tool.ts`, `packages/editor/src/tools/draw-building-tool.test.ts`

**Behavior per `docs/spatial-editing-workflow.md`**:
- Click vertices on map → footprint polygon
- Rubber-band line from last vertex to cursor
- Snap to: grid, other building vertices, road endpoints
- Enter/dblclick → auto-close polygon
- Validate: ≥3 points, closed, no self-intersection
- Dispatch `building.create`

**Acceptance:** Polygon drawn on map; vertices snap; validation errors shown; command dispatched on finish.

### T3.23 — DrawRoomTool

**Files:** `packages/editor/src/tools/draw-room-tool.ts`, `packages/editor/src/tools/draw-room-tool.test.ts`

**Precondition:** Active floor must be set (else tool disables with tooltip).

**Behavior:**
- Click vertices on active floor → room polygon
- Snap to: grid, building footprint, wall intersections, room adjacency
- Validate: inside building footprint, no overlap with existing rooms (warning)
- Dispatch `room.create`

**Acceptance:** Room drawn on active floor; polygon validated; command dispatched.

### T3.24 — DrawHallwayTool

**Files:** `packages/editor/src/tools/draw-hallway-tool.ts`, `packages/editor/src/tools/draw-hallway-tool.test.ts`

**Precondition:** Active floor set.

**Behavior:**
- Click points → polyline centerline, width defaults to 3m
- Snap to: room entrances, other hallway endpoints
- Validate: ≥2 points
- Dispatch `hallway.create`

**Acceptance:** Hallway polyline drawn; snap to entrance works.

### T3.25 — DrawRoadTool

**Files:** `packages/editor/src/tools/draw-road-tool.ts`, `packages/editor/src/tools/draw-road-tool.test.ts`

**Behavior:**
- Click points → road polyline in world coords, width defaults to 6m, surface="paved"
- Snap to: building entrances, other roads
- Dispatch `road.create`

**Acceptance:** Road polyline drawn; entrances snap to road.

---

## Wave 8 — Placement Tools (T3.26–T3.30)

Placement tools are simpler than geometry tools — single click to place, no polygon/polyline drawing.

### T3.26 — PlaceEntranceTool

**Files:** `packages/editor/src/tools/place-entrance-tool.ts`, `packages/editor/src/tools/place-entrance-tool.test.ts`

**Precondition:** Active floor set.

**Behavior:**
- Hover near wall → wall segment highlights, midpoint snap shown
- Click → entrance placed on nearest polygon edge
- Orientation computed perpendicular to wall, outward
- Dispatch `entrance.create`

### T3.27 — PlaceStaircaseTool

**Files:** `packages/editor/src/tools/place-staircase-tool.ts`, `packages/editor/src/tools/place-staircase-tool.test.ts`

**Behavior:** Click → staircase at position. fromLevel=current floor, toLevel=current+1.

### T3.28 — PlaceElevatorTool

**Files:** `packages/editor/src/tools/place-elevator-tool.ts`, `packages/editor/src/tools/place-elevator-tool.test.ts`

**Behavior:** Click → elevator at position. fromLevel=0, toLevel=max-1.

### T3.29 — PlacePanoramaTool

**Files:** `packages/editor/src/tools/place-panorama-tool.ts`, `packages/editor/src/tools/place-panorama-tool.test.ts`

**Behavior:** Click → panorama at position. Opens image upload dialog (Asset Manager integration). Default heading=0, empty hotspots. Deferred: hotspot editor UI (edit in properties panel).

### T3.30 — PlaceQRCodeTool

**Files:** `packages/editor/src/tools/place-qr-tool.ts`, `packages/editor/src/tools/place-qr-tool.test.ts`

**Behavior:** Click → QR checkpoint at position. Default code = auto-generated UUID.

---

## Wave 9 — Graph Adapter (T3.31)

### T3.31 — GraphDocumentAdapter

**Files:** `src/engine/graph/graph-adapter.ts` (in navi-next/src/)

**What:** Bridges legacy `Graph` class to `CampusDocument` for Strangler Fig migration.

```
GraphDocumentAdapter:
├── toDocument(graph: Graph): CampusDocument
├── fromDocument(doc: CampusDocument): Graph
├── applyMutation(doc: CampusDocument, mutation): CampusDocument
└── sync(doc: CampusDocument, graph: Graph): { doc, graph }
```

**Reads from Graph:** buildings → buildings[], floors → floors[], rooms → rooms[], roads → roads[]

**Writes to Graph:** After CampusDocument mutation, syncs change to legacy Graph store for backward compatibility.

**Acceptance:** CampusDocument round-trips through Adapter without data loss; existing components continue to work through Graph store.

---

## Wave 10 — Tests (T3.32)

### T3.32 — Comprehensive Tests

**Target: 120+ tests across all M3 modules.**

| Module | Tests | Focus |
|--------|-------|-------|
| Commands (room, hallway, road, etc.) | ~24 | Each CRUD op + inverse |
| Rendering | ~8 | GeoJSON conversion, preview layer |
| Floor Manager | ~8 | CRUD, active floor, visibility |
| Properties Panel (all entities) | ~16 | Render fields, dispatch commands |
| Calibration | ~8 | Transform computation, overlay |
| Asset Manager | ~8 | Import, dedup, cleanup |
| DrawBuildingTool | ~10 | Polygon drawing, snap, validation |
| DrawRoomTool | ~8 | Room inside footprint, adjacency |
| DrawHallwayTool | ~6 | Polyline, width, snap |
| DrawRoadTool | ~4 | Polyline, surface |
| PlaceEntranceTool | ~6 | Wall snap, orientation |
| PlaceStaircase/Elevator | ~4 | Position, levels |
| PlacePanorama/QR | ~4 | Position, asset ref |
| Graph Adapter | ~10 | Round-trip, sync |

---

## Wave 11 — Demo Campus Authoring (T3.33)

### T3.33 — Recreate ASU-Ibajay Campus

**What:** Use the editor end-to-end to recreate the ASU-Ibajay demo campus. This is the final validation that the authoring workflow works.

**Steps:**
1. Create project, name it "ASU-Ibajay"
2. Draw 3 building footprints (Main, Engineering, Library)
3. Add 5+ floors per building
4. Calibrate floor plans
5. Trace 20+ rooms across floors
6. Draw hallways connecting rooms
7. Draw roads connecting building entrances
8. Place entrances on building edges
9. Place staircases connecting floors
10. Place QR checkpoints at key locations
11. Validate — no Tier 1 errors

**Acceptance:** ASU-Ibajay campus exists as a validated CampusDocument, matching the demo dataset spec. All tools used in sequence without errors.

---

## Execution Waves Summary

```
Wave  1: T3.1–T3.8    Commands (parallelizable)
Wave  2: T3.9          Rendering + Preview Layer
Wave  3: T3.10         Floor Manager
Wave  4: T3.11         Calibration UI
Wave  5: T3.12–T3.20   Properties Panel (per-entity, parallelizable)
Wave  6: T3.21         Asset Manager
Wave  7: T3.22–T3.25   Geometry Drawing Tools
Wave  8: T3.26–T3.30   Placement Tools
Wave  9: T3.31         Graph Adapter
Wave 10: T3.32         Tests (120+)
Wave 11: T3.33         Demo Campus Authoring (final validation)
```

## Future: Vertex Editing (M3.5 / M4)

Drawing is only half the editor. Post-M3:

```
Move Vertex     — drag existing vertex to new position
Insert Vertex   — split edge at click point
Delete Vertex   — remove vertex (with min-points guard)
Split Edge      — insert vertex at midpoint
Merge Vertices  — combine two nearby vertices
Move Polygon    — translate entire polygon
Rotate Polygon  — rotate around centroid
Scale Polygon   — scale from centroid
```

Not part of M3 scope, but the architecture supports it: each operation is a command dispatched through the same pipeline.

## Error Prevention

| Error | Prevention |
|-------|------------|
| Tool mutates document directly | Tool only produces commands; never touches CampusDocument |
| Room outside building footprint | Validate polygon is inside footprint before commit |
| Orphan entities on cascade delete | Command handler deletes child entities; validation catches orphans |
| Asset reference to deleted file | Asset manager validates references before allowing remove |
| Floor manager loses active floor state | Viewport persists per-building active floor map |
| Properties panel stale after undo | Subscribe to eventBus for entity updates |
| Graph ↔ Document sync conflict | Adapter uses last-write-wins with timestamp check |
| Panorama with missing image | Asset manager validates image exists on panorama.create |
| Tool state corruption on rapid activate/deactivate | Tool has explicit cleanup in onDeactivate() |
