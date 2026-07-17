# NAVI Rendering Architecture

**Frozen at:** `checkpoint/pre-stabilization` (commit `57600fd`)
**Date:** 2026-07-15

---

## Table of Contents

1. [Overview — Dual Rendering Systems](#1-overview--dual-rendering-systems)
2. [Legacy System: MapRenderer](#2-legacy-system-maprenderer)
3. [Legacy System: NavigationGraphRenderer](#3-legacy-system-navigationgraphrenderer)
4. [New System: EntityRenderer](#4-new-system-entityrenderer)
5. [Bridge: EntityRendererBridge](#5-bridge-entityrendererbridge)
6. [Layer Naming Conflict](#6-layer-naming-conflict)
7. [GeoJSON Pipeline](#7-geojson-pipeline)
8. [How They Coexist](#8-how-they-coexist)
9. [Critical Section — The Layer Duplication Bug](#9-critical-section--the-layer-duplication-bug)

---

## 1. Overview — Dual Rendering Systems

The Studio has **two parallel rendering systems** writing to the same MapLibre map. They layer naming conflict is the primary concern for the recovery agent.

| System | File | Layer prefix | What it renders |
|--------|------|-------------|-----------------|
| **Legacy** | `MapRenderer.tsx` | `l-` | Buildings, nodes, edges, traces, drawing overlay |
| **Legacy** | `NavigationGraphRenderer.tsx` | `l-` (same) | Compiled NavNodes/NavEdges (redundantly) |
| **New** | `EntityRenderer` (class) | `navi-` | Buildings, rooms, hallways, roads, entrances, staircases, elevators, panoramas, QR codes, selection overlay, preview |
| **Bridge** | `EntityRendererBridge.tsx` | `navi-` | Instantiates EntityRenderer, applies visibility toggles |

---

## 2. Legacy System: MapRenderer

### File
`navi-next/src/components/studio/rendering/MapRenderer.tsx`

### What it renders
- **Buildings** — GeoJSON polygons from `document.buildings` via `buildingsToGeoJSON()`
- **Nodes** — Graph navigation nodes (filtered by active floor, excluding `HIDDEN_NODE_TYPES`)
- **Connection nodes** — Nodes with `metadata.connectionNode === true` (rendered as larger cyan circles)
- **Edges** — Graph edges between visible nodes
- **Traces** — Road/trace paths via `roadsToTracesGeoJSON()`
- **Drawing overlay** — Ephemeral drawing state (via `SRC.DRAWING` source, managed by InteractionController)

### Layer names (from `constants.ts`)

| Constant | Layer ID | Type | Source |
|----------|----------|------|--------|
| `LYR.BUILDINGS_FILL` | `l-buildings-fill` | fill | `s-buildings` |
| `LYR.BUILDINGS_EXTRUSION` | `l-buildings-extrusion` | fill-extrusion | `s-buildings` |
| `LYR.BUILDINGS_OUTLINE` | `l-buildings-outline` | line | `s-buildings` |
| `LYR.EDGES` | `l-edges` | line | `s-edges` |
| `LYR.NODES` | `l-nodes` | circle | `s-nodes` |
| `LYR.NODES_CONNECTION` | `l-nodes-connection` | circle | `s-nodes-connection` |
| `LYR.TRACES_LINE` | `l-traces-line` | line | `s-traces` |
| `LYR.TRACES_INNER` | `l-traces-inner` | line | `s-traces` |
| `LYR.DRAWING_LINE` | `l-drawing-line` | line | `s-drawing` |
| `LYR.DRAWING_POINTS` | `l-drawing-points` | circle | `s-drawing` |

### Source IDs (from `constants.ts`)

| Constant | Source ID |
|----------|-----------|
| `SRC.BUILDINGS` | `s-buildings` |
| `SRC.EDGES` | `s-edges` |
| `SRC.NODES` | `s-nodes` |
| `SRC.NODES_CONNECTION` | `s-nodes-connection` |
| `SRC.TRACES` | `s-traces` |
| `SRC.DRAWING` | `s-drawing` |

### Key behaviors
- **Filtering:** Renders only the active floor. Hides `room`, `staircase`, `elevator` node types.
- **Visibility toggles:** Reads `useStudioStore.layers` — toggles nodes, edges, buildings.
- **Style switching:** Swaps between OSM and Satellite basemaps by calling `map.setStyle()`.
- **Vertex editing:** Forces nodes visible during vertex edit mode.
- **Re-render trigger:** `graph`, `document`, `activeFloor`, `docVersion` changes.
- **Style reload:** Re-registers on `map.on('style.load')` since `setStyle()` destroys all sources.
- **Renders null:** The component returns `null` — all rendering is via MapLibre side-effects.

### GeoJSON builders
File: `navi-next/src/components/studio/rendering/geojson.ts`

| Function | Purpose |
|----------|---------|
| `buildNodeGeo(nodes)` | Circle features for regular nodes |
| `buildConnectionNodeGeo(nodes)` | Circle features for connection nodes |
| `buildEdgeGeo(edges, nodes)` | Line features for edges |

---

## 3. Legacy System: NavigationGraphRenderer

### File
`navi-next/src/components/studio/rendering/NavigationGraphRenderer.tsx`

### What it renders
The **compiled** navigation graph (NavNodes / NavEdges) — a derived artifact of CampusDocument via GraphAdapter + compiler.

### Layer names
Uses the **same** `l-` prefix constants as `MapRenderer` (`LYR.NODES`, `LYR.NODES_CONNECTION`, `LYR.EDGES`).

### Key behaviors
- **Duplicate rendering concern:** This renderer and `MapRenderer` both push data to the same `s-nodes`, `s-edges`, `s-nodes-connection` sources and `l-` layers. The `MapRenderer` sets building data first, then `NavigationGraphRenderer` overwrites node/edge data.
- **Source registration:** Uses `addGraphSourcesAndLayers()` from `layers.ts` — but `addSourcesAndLayers()` already creates these. The graph variant checks `map.getSource(SRC.NODES)` and skips if already present.
- **No building/trace rendering:** Only nodes and edges (the compiled graph).
- **Render trigger:** `graph`, `renderVersion`, `activeFloor`.

### Registration guards
`addGraphSourcesAndLayers()` in `layers.ts` checks if `map.getSource(SRC.NODES)` exists before registering — but both `addSourcesAndLayers()` (called by `MapRenderer`) and `addGraphSourcesAndLayers()` (called by `NavigationGraphRenderer`) use the same source/layer constants. The first to run wins; the second skips.

---

## 4. New System: EntityRenderer

### File
`packages/editor/src/rendering/entity-renderer.ts`

### What it renders
Authored campus geometry from `CampusDocument`:

| Source ID | Layer IDs | Entity type |
|-----------|-----------|-------------|
| `navi-buildings` | `navi-building-fill`, `navi-building-outline`, `navi-building-extrusion` | Buildings |
| `navi-rooms` | `navi-room-fill`, `navi-room-outline` | Rooms |
| `navi-hallways` | `navi-hallway-line` | Hallways |
| `navi-roads` | `navi-road-line` | Roads |
| `navi-entrances` | `navi-entrance-icon` | Entrances |
| `navi-staircases` | `navi-staircase-icon` | Staircases |
| `navi-elevators` | `navi-elevator-icon` | Elevators |
| `navi-panoramas` | `navi-panorama-icon` | Panoramas |
| `navi-qr` | `navi-qr-icon` | QR codes |
| `navi-preview` | `navi-preview-layer` | Ephemeral preview geometry |
| `navi-selection` | `navi-selection-overlay`, `navi-hover-highlight`, `navi-validation-overlay` | Selection/hover/validation |

### Layer IDs (from `packages/editor/src/rendering/layers.ts`)

```typescript
export const LAYER_IDS = {
  BUILDING_FILL: 'navi-building-fill',
  BUILDING_OUTLINE: 'navi-building-outline',
  BUILDING_EXTRUSION: 'navi-building-extrusion',
  ROOM_FILL: 'navi-room-fill',
  ROOM_OUTLINE: 'navi-room-outline',
  HALLWAY_LINE: 'navi-hallway-line',
  ROAD_LINE: 'navi-road-line',
  ENTRANCE_ICON: 'navi-entrance-icon',
  STAIRCASE_ICON: 'navi-staircase-icon',
  ELEVATOR_ICON: 'navi-elevator-icon',
  PANORAMA_ICON: 'navi-panorama-icon',
  QR_ICON: 'navi-qr-icon',
  SELECTION_OVERLAY: 'navi-selection-overlay',
  HOVER_HIGHLIGHT: 'navi-hover-highlight',
  PREVIEW: 'navi-preview-layer',
  VALIDATION_OVERLAY: 'navi-validation-overlay',
}
```

### Source IDs (from `packages/editor/src/rendering/layers.ts`)

```typescript
export const SOURCE_IDS = {
  BUILDINGS: 'navi-buildings',
  ROOMS: 'navi-rooms',
  HALLWAYS: 'navi-hallways',
  ROADS: 'navi-roads',
  ENTRANCES: 'navi-entrances',
  STAIRCASES: 'navi-staircases',
  ELEVATORS: 'navi-elevators',
  PANORAMAS: 'navi-panoramas',
  QR: 'navi-qr',
  PREVIEW: 'navi-preview',
  SELECTION: 'navi-selection',
}
```

### Paint styles (from `packages/editor/src/rendering/layers.ts`)

Color scheme is per-category:
- **Buildings:** Academic `#4A90D9`, Residential `#7B68EE`, Administrative `#2E8B57`, etc.
- **Rooms:** Classroom `#87CEEB`, Office `#98FB98`, Lab `#FFD700`, Restroom `#DDA0DD`, etc.
- **Entity icons:** Entrance `#FF8C00`, Staircase `#20B2AA`, Elevator `#9370DB`, Panorama `#FF69B4`, QR `#32CD32`

### Architecturally significant behavior

- **Class-based** (not a React component). Instantiated in `EntityRendererBridge.tsx` with a `RendererOptions` object.
- **Event-driven sync:** Listens to `DocumentEventBus` for `entity.created`, `entity.deleted`, `entity.updated` — re-syncs all data on any event (no per-entity partial updates).
- **Lifecycle:** `init()` → `destroy()`. Init adds sources and layers on `map.on('load')` or immediately if the map is already loaded.
- **Coordinate transformer:** Accepts an optional `CoordinateTransformer` from `@navi/core` for projection conversions.
- **Preview layer:** `setPreview(geometry)` / `clearPreview()` for showing ephemeral geometry while drawing.
- **Selection layer:** `updateSelection(coords)` / `clearSelection()` for selection highlight polygons.

---

## 5. Bridge: EntityRendererBridge

### File
`navi-next/src/components/studio/rendering/EntityRendererBridge.tsx`

This React component bridges the class-based `EntityRenderer` into the Studio's React tree.

### Responsibilities
1. **Instantiates** `EntityRenderer` with the current document, event bus, selection manager, and viewport from the editor context.
2. **Owns lifecycle** — creates on mount, destroys on unmount.
3. **Applies visibility** — reads `useStudioStore.layers.buildings` and toggles the `navi-building-*` layers.
4. **One-time init** — `useEffect` with `ref.current` guard ensures single instantiation.

**It does NOT currently toggle non-building entity visibility** (rooms, hallways, roads, icons) — only buildings. The other `layers` fields (`rooms`, `hallways`, `assets`) from `studio-store` are not wired to `EntityRenderer` layers.

---

## 6. Layer Naming Conflict

### Legacy system
- **Prefix:** `l-` (e.g., `l-buildings-fill`, `l-nodes`, `l-edges`)
- **Sources:** `s-` (e.g., `s-buildings`, `s-nodes`)
- **Defined in:** `src/components/studio/rendering/constants.ts`

### New system (EntityRenderer)
- **Prefix:** `navi-` (e.g., `navi-building-fill`, `navi-rooms`, `navi-road-line`)
- **Sources:** `navi-` (e.g., `navi-buildings`, `navi-rooms`)
- **Defined in:** `packages/editor/src/rendering/layers.ts`

Both systems register sources and layers on the **same** MapLibre map instance. They use **different** layer IDs, so they coexist without MapLibre throwing errors. However, they render the **same** building geometry twice — once from `MapRenderer` (onto `l-buildings-fill`) and once from `EntityRenderer` (onto `navi-building-fill`).

### Impact
- **Double rendering** — buildings appear twice. The `EntityRendererBridge` attempts to mitigate this by wiring `layers.buildings` to the `navi-building-*` layers, but the legacy `MapRenderer` independently manages its own `l-buildings-*` visibility through `setLayerVisibility` in `MapRenderer.tsx`.
- **If both are visible:** Users see two overlapping translucent building fills.
- **If one is toggled off:** The other remains visible unless both systems toggle in lockstep.

---

## 7. GeoJSON Pipeline

### Legacy pipeline
1. `MapRenderer.renderAll()` → calls `addSourcesAndLayers()` (idempotent, checks source existence)
2. Filters nodes/edges by active floor
3. Separates connection nodes from regular nodes
4. Calls `buildNodeGeo()`, `buildConnectionNodeGeo()`, `buildEdgeGeo()`, `buildingsToGeoJSON()`, `roadsToTracesGeoJSON()`
5. Calls `source.setData()` for each source

### New pipeline
1. `EntityRenderer.init()` → calls `addSources()` + `addLayers()`
2. `EntityRenderer.syncAll()` → calls `documentToGeoJSON(document)` from `packages/editor/src/rendering/geojson.ts`
3. Iterates over `SOURCE_IDS` map, calling `updateSource()` for each entity type
4. Listens to `entity.created/updated/deleted` events → re-syncs everything

---

## 8. How They Coexist

The rendering stack in `StudioCanvas.tsx` mounts all renderers on the same map:

```tsx
{mapInstance && <MapRenderer map={mapInstance} />}           {/* Legacy: l- layers */}
{mapInstance && <EntityRendererBridge map={mapInstance} />}  {/* New: navi- layers */}
{/* Note: NavigationGraphRenderer is NOT rendered here in StudioCanvas */}
```

**NavigationGraphRenderer** is not mounted in `StudioCanvas.tsx` but exists in the codebase as a self-contained component. It may be used elsewhere or was part of a previous iteration.

---

## 9. Critical Section — The Layer Duplication Bug

The key finding for the recovery agent:

1. **Two sets of layers for the same data.** `MapRenderer` writes building polygons to `l-buildings-fill/l-outline/l-extrusion`. `EntityRenderer` writes the same buildings to `navi-building-fill/navi-building-outline/navi-building-extrusion`.

2. **Visibility toggle mismatch.** `MapRenderer` manages `l-buildings-*` visibility via `LYR.BUILDINGS_FILL`, `LYR.BUILDINGS_EXTRUSION`, `LYR.BUILDINGS_OUTLINE` (all `l-` prefixed). `EntityRendererBridge` manages `navi-building-*` visibility. If `layers.buildings` is toggled, both effect hooks fire — but if one fails or runs first, the other persists.

3. **Style reload destroys all layers.** When `MapRenderer` switches from OSM to Satellite style via `map.setStyle()`, **all** sources and layers are destroyed. `MapRenderer` handles `style.load` to re-register its `l-` layers. But `EntityRenderer`'s `navi-` layers may be re-created only if `EntityRendererBridge` detects the style load — which it currently does NOT (no `style.load` listener).

**Recommendation for rebuild:** Remove the legacy `MapRenderer` and keep only `EntityRenderer`. The legacy `NavigationGraphRenderer` should also be removed or replaced with a dedicated compiled-graph renderer that uses `navi-` prefixed layers.
