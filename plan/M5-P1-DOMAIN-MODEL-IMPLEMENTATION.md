# M5 Phase 1 — Domain Model Implementation

**Goal:** Implement the new entity model from ADR 008 without changing any user-visible behavior. The editor compiles, all tests pass, nothing new is visible.

**Contract:** ADR 008 (`05 Decisions/ADR 008 - Multi-Floor Navigation Model.md`)

**Domain Model Spec:** `spec/M5-DOMAIN-MODEL.md`

---

## Migration Checklist

| # | Task | Files | Acceptance |
|---|------|-------|------------|
| T1 | Add `ConnectorStop` entity to `@navi/core` types | `packages/core/src/types/` | Type defined, serializable, round-trip test passes |
| T2 | Add `VerticalConnector` entity to `@navi/core` types (replace Staircase/Elevator) | `packages/core/src/types/` | Type replaces `Staircase`/`Elevator`, backward-compat import exists |
| T3 | Add `RoomDoor` entity to `@navi/core` types | `packages/core/src/types/` | Type defined, Room.doors becomes RoomDoor[] |
| T4 | Introduce `Anchor` base hierarchy (Panorama, QR, BLE, ARMarker) | `packages/core/src/types/` | Panorama extends Anchor, QR extends Anchor, BLE extends Anchor, ARMarker extends Anchor |
| T5 | Add `NavigationArtifacts` bundle type | `packages/core/src/types/` | Bundle wraps NavGraph + SearchIndex + SpatialIndex + BuildingIndex |
| T6 | Update `CampusDocument` to include new entities | `packages/core/src/types/document.ts` | Building has verticalConnectors[], Floor has connectorStops[], Room has doors[], Floor has anchors[] |
| T7 | Update serialization (serialize/deserialize round-trip) | `packages/core/src/serialization/` | All new entities serialize/deserialize losslessly |
| T8 | Update command handlers (building, floor, room, staircase, elevator, panorama, qr) | `packages/editor/src/commands/` | Commands compile against new types, existing behavior preserved |
| T9 | Update GraphAdapter | `packages/editor/src/graph-adapter.ts` | Adapter reads new entity structure, produces same graph output |
| T10 | Update validation rules | `packages/editor/src/validation/` | Orphan detection covers connector stops, anchor hierarchy |
| T11 | Update campus-loader | `packages/editor/src/context/campus-loader.ts` | Legacy loader populates new entities |
| T12 | Update `create-editor-context.ts` | `packages/editor/src/context/` | Document factory creates new entities |
| T13 | Run full test suite | — | `npm test` passes, no regressions |
| T14 | Run E2E gates | — | `e2e-p1.1-gate5-uat.mjs` passes |

---

## T1: ConnectorStop entity

```ts
// packages/core/src/types/connector-stop.ts
interface ConnectorStop {
  id: string;
  connectorId: string;
  floorId: string;
  position: LocalCoord;
  label?: string;
  rotation?: number;
  landingPolygon?: LocalPolygon;
  connectedHallwayId?: string;
  panorama?: Panorama;   // inline ownership
  qr?: QR;               // inline ownership
  accessible: boolean;
  metadata?: Record<string, unknown>;
}
```

## T2: VerticalConnector entity

```ts
// packages/core/src/types/vertical-connector.ts
type ConnectorBehavior = "stairs" | "elevator";  // future: "escalator" | "ramp"

interface VerticalConnector {
  id: string;
  buildingId: string;
  name: string;
  behavior: ConnectorBehavior;
  accessible: boolean;
  emergencyOnly: boolean;
  bidirectional: boolean;
  baseCost: number;
  capacity?: number;
  stops: ConnectorStop[];
}
```

**Migration:** Keep `Staircase` and `Elevator` as deprecated re-exports or aliases during transition. Remove in M5 Phase 2.

## T3: RoomDoor entity

```ts
// packages/core/src/types/room-door.ts
interface RoomDoor {
  id: string;
  position: LocalCoord;
  width?: number;
  accessible: boolean;
  isDefault: boolean;
  isEmergencyExit: boolean;
  label?: string;
}
```

**Migration:** `Room.doors` changes from `LocalCoord[]` to `RoomDoor[]`. Old callers that access `room.doors[0]` as a coordinate will break — must update to `room.doors[0].position`.

## T4: Anchor hierarchy

```ts
// packages/core/src/types/anchor.ts
interface Anchor { id: string; floorId: string; position: LocalCoord; }
interface VisualAnchor extends Anchor { icon?: string; label?: string; }
interface Panorama extends VisualAnchor { panoramaId: string; heading?: number; pitch?: number; }
interface QR extends VisualAnchor { url: string; label: string; }
interface BLE extends Anchor { uuid: string; major?: number; minor?: number; }
interface ARMarker extends VisualAnchor { markerType: "image" | "model" | "plane"; assetUrl?: string; }
```

**Migration:** `Panorama` and `QRCheckpoint` types remain as aliases for backward compat during transition.

## T5: NavigationArtifacts

```ts
// packages/core/src/types/navigation-artifacts.ts
interface NavigationArtifacts {
  graph: NavigationGraph;
  searchIndex: SearchIndex;
  spatialIndex: SpatialIndex;
  buildingIndex: BuildingIndex;
}
```

## T6: CampusDocument updates

```ts
// packages/core/src/types/document.ts
interface Building {
  // ...existing fields...
  verticalConnectors: VerticalConnector[];
}

interface Floor {
  // ...existing fields...
  connectorStops: ConnectorStop[];
  anchors: Anchor[];
}

interface Room {
  // ...existing fields...
  doors: RoomDoor[];
}
```

## Error Prevention

Before each task, check these precedent errors:

- **S-006 cascade deletion:** New entities (ConnectorStop, Anchor) must have delete cascades. Follow the pattern in `building-delete-handler.ts` and `floor-delete-handler.ts`.
- **S-009 genId:** All new entities use `genId(prefix)` from `@navi/editor/id.ts`. No `Date.now()` or `Math.random()` ID generation.
- **S-005 selection short-circuit:** SelectionManager already short-circuits on id-equality for all entity types. New entity IDs will work automatically.
- **S-002 history:** All commands call `documentStore.commit()` after mutation. New entity handlers must follow this contract.

## Serialization Considerations

- `ConnectorStop` embeds `Panorama` and `QR` inline — the serializer must handle nested entity serialization.
- Backward compat: `Staircase` → `VerticalConnector` migration must handle legacy serialized documents. The deserializer should detect old format and convert.
- `RoomDoor` replaces `LocalCoord[]` — old documents with `doors: [{lat, lng}]` must be handled during the migration window.

## Test Strategy

- Unit tests: each new type serializes/deserializes losslessly
- Unit tests: `ConnectorStop` panorama/qr owned inline, not cross-referenced
- Integration tests: `createDocument()` with new fields produces valid CampusDocument
- E2E: gate5 (UAT) passes with no visible changes
