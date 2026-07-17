# Architecture Audit: Dead Code, Legacy Systems, Duplicates, and Parallel Implementations

**Audit Date:** 2026-07-15  
**Scope:** `navi-next/` (application + packages)  
**Repository Root:** `C:\Users\Administrator\Desktop\CODEme\Navi`  
**App Dir:** `navi-next/`

---

## Existing Migraton Context

An excellent **[LEGACY_TO_NEW_MIGRATION_MATRIX.md](./LEGACY_TO_NEW_MIGRATION_MATRIX.md)** already documents 18 subsystems in the legacy→new transition. This audit complements it by:

1. Providing a **file-by-file inventory** of the studio, stores, services, and packages
2. Detecting **dead code** not covered by the matrix
3. Identifying **package-vs-app overlap** and type duplication
4. Surfacing **broken imports and orphaned functions**
5. Assessing **rendering system coexistence**

---

## Section 1: Studio Components (`src/components/studio/`)

### 1.1 Rendering Sub-directory

| File | Classification | Notes | Suggested Action |
|------|---------------|-------|-----------------|
| `constants.ts` | **LEGACY** | Defines `LYR` (l-* layers) and `SRC` (s-* sources). Part of old rendering system. | Consolidate into new system; remove once `MapRenderer` and `NavigationGraphRenderer` migrate |
| `layers.ts` | **LEGACY** | `addSourcesAndLayers()` registers old l-* layers/s-* sources. The function `addGraphSourcesAndLayers` is **referenced by NavigationGraphRenderer but does not exist here** — broken import. | Fix or remove the dead import; migrate to `@navi/editor` layer system |
| `geojson.ts` | **LEGACY** | Builds GeoJSON from old `NavNode`/`NavEdge`/`Building`/`TracePath` types. Duplicates logic in `packages/editor/src/rendering/geojson.ts` | Remove when `NavigationGraphRenderer` is replaced |
| `MapRenderer.tsx` | **HYBRID** | Imports from BOTH `@/store/graph-store` (old) and `@navi/editor` (new). Pushes to old layers (SRC.BUILDINGS, etc) but reads CampusDocument via `useEditor`. | Consolidate to single data source (CampusDocument). Per matrix item #17. |
| `EntityRendererBridge.tsx` | **NEW** | Creates `EntityRenderer` instance (new architecture). Uses `LAYER_IDS` from `@navi/editor` (navi-* prefixes). Manages building visibility via `useStudioStore`. | **CRITICAL: StudioCanvas does NOT mount this.** The bridge exists but is unused. Either mount it or remove it. |
| `NavigationGraphRenderer.tsx` | **HYBRID** | Uses `@/store/graph-store` and old `LYR`/`SRC` constants. Has **dead import** of `addGraphSourcesAndLayers` (function doesn t exist). Duplicates style objects (OSM_STYLE, SATELLITE_STYLE) shared with MapRenderer. | Fix import or align with new rendering pipeline |

### 1.2 Core Canvas Components

| File | Classification | Notes | Suggested Action |
|------|---------------|-------|-----------------|
| `StudioCanvas.tsx` | **NEW** (architectural) | Root canvas component. Per its own comment, it MUST NOT import stores. It only mounts `MapRenderer`, `InteractionController`, `ViewportController`, `SelectionOverlay`, etc. | **Does NOT mount**, note. Either integrate or reconcile per migration plan. |
| `StudioCanvas.legacy.tsx` | **LEGACY** | 896-line monolith. Directly imports both stores, manages map rendering, click handlers, drawing — all in one file. **Not imported anywhere.** | **DELETE** — dead code |
| `EditorBridge.tsx` | **BRIDGE** | Creates editor context ONCE from initial graph. Bridges SelectionManager ↔ Zustand bidirectionally. This is the essential glue layer. | **KEEP** until migration complete |
| `StudioWorkspace.tsx` | **NEW** | Uses `EditorBridge`, imports `PropertiesPanel` from `@navi/editor`. Orchestrates layout. | **KEEP** |
| `InteractionController.tsx` | **HYBRID** | 366 lines. Routes map events to either registry tools or legacy Zustand handlers. Uses old `LYR`/`SRC` constants for hit-testing. Refers to `SRC.DRAWING` and `LYR.NODES`. | Per matrix item #2 — large refactor needed |
| `useToolController.ts` | **NEW** | 25 lines. Bridges tool events from editor event bus. Minor — keeps the connection. | **KEEP** |
| `ViewportController.tsx` | **HYBRID** | Uses `useEditor` from `@navi/editor`. | **KEEP** |
| `SelectionOverlay.tsx` | **HYBRID** | Uses `useSelection` from `@navi/editor` but writes to old `s-nodes`/`s-nodes-connection` MapLibre sources. | Migrate to new selection layer sources |
| `ConfirmOverlayAdapter.tsx` | **BRIDGE** | Syncs `DrawingSession` pendingConfirm → Zustand. Temporary adapter. | **DELETE** when ConfirmOverlay is migrated |
| `ConfirmOverlay.tsx` | **HYBRID** | Confirmation UI for entity creation. Reads from Zustand, dispatches via editor dispatcher. | Per matrix item #11 |
| `ConfirmBar.tsx` | **LEGACY** | Inline confirm/cancel bar for drawing tools. | Refactor to use DrawingSession directly |
| `DrawingOverlay.tsx` | **UNKNOWN** | Drawing overlay for ephemeral geometry. | Review if needed alongside registry tool previews |
| `PreviewOverlay.tsx` | **UNKNOWN** | Preview overlay. | Review if obsoleted by EntityRenderer |

### 1.3 Explorer Components

| File | Classification | Notes | Suggested Action |
|------|---------------|-------|-----------------|
| `Explorer.tsx` | **NEW** | Uses `@navi/editor` types. | **KEEP** |
| `ExplorerPanel.tsx` | **NEW** | Uses `@navi/editor`. | **KEEP** |
| `ExplorerTree.tsx` | **NEW** | Uses `@navi/editor`. | **KEEP** |
| `ExplorerItem.tsx` | **NEW** | Uses `@navi/editor` and `SelectionOrigin`. | **KEEP** |
| `ExplorerSearch.tsx` | **NEW** | | **KEEP** |
| `ExplorerContextMenu.tsx` | **NEW** | | **KEEP** |
| `getExplorerActions.ts` | **NEW** | Uses `@navi/editor` types. | **KEEP** |
| `resolveGraphNodeSelection.ts` | **NEW** | Uses `@navi/editor` and `@navi/core`. Entity resolution. | **KEEP** |

### 1.4 Tool/Interaction Utilities

| File | Classification | Notes | Suggested Action |
|------|---------------|-------|-----------------|
| `useDrawingSession.tsx` | **NEW** | Context-based drawing state for ephemeral tool sessions. | **KEEP** |
| `useVertexEditor.ts` | **HYBRID** | Uses `@navi/editor` `useEditor`. Per matrix item #12, no new-architecture equivalent. | Per matrix |
| `useEntrancePlacer.ts` | **NEW** | Uses `@navi/editor` `useEditor`. | **KEEP** |

### 1.5 Other Studio Components

| File | Classification | Notes | Suggested Action |
|------|---------------|-------|-----------------|
| `StudioToolbar.tsx` | **NEW** | Uses `@navi/editor`. | **KEEP** |
| `ComponentPalette.tsx` | **UNKNOWN** | | Review |
| `CampusBoundary.tsx` | **UNKNOWN** | | Review |
| `BuildingTracer.tsx` | **LEGACY** | Part of old building drawing path. Per matrix item #4. | Replace when `drawBuildingTool` grows richer |
| `FloorTabs.tsx` | **NEW** | Uses `@navi/editor`. | **KEEP** |
| `MapCard.tsx` | **UNKNOWN** | | Review |
| `MapPreview.tsx` | **LEGACY** | Uses `@/store/graph-store`. | Migrate to new sources |
| `CreateMapWizard.tsx` | **LEGACY** | Uses `@/store/graph-store`. | Migrate when campus creation moves to new system |
| `StoreInitializer.tsx` | **UNKNOWN** | | Review |

### 1.6 Legacy Panel Components (`src/components/studio/legacy/`)

| File | Classification | Notes | Suggested Action |
|------|---------------|-------|-----------------|
| `MetadataPanel.tsx` | **LEGACY** | Uses `@/store/graph-store`. Replaced by `@navi/editor` PropertiesPanel. | **DELETE** — dead code |
| `NodePropertiesPanel.tsx` | **LEGACY** | Uses `@/store/graph-store`. Replaced by `@navi/editor` PropertiesPanel. | **DELETE** — dead code |
| `RightPanel.tsx` | **LEGACY** | Uses `@/store/graph-store`. Replaced by `@navi/editor` PropertiesPanel. | **DELETE** — dead code |
| `StaircasePropertiesPanel.tsx` | **LEGACY** | Uses `@/store/graph-store`. Replaced. | **DELETE** — dead code |
| `TracePropertiesPanel.tsx` | **LEGACY** | Uses `@/store/graph-store`. Replaced. | **DELETE** — dead code |

---

## Section 2: Stores (`src/store/`)

| File | Classification | Notes | Suggested Action |
|------|---------------|-------|-----------------|
| `graph-store.ts` | **LEGACY** (still needed) | 280-line Zustand store wrapping the old `Graph` class. Persists to localStorage + Supabase. Still used by EditorBridge, MapRenderer, InteractionController, and many other components. The new architecture uses `DocumentStore` + `ServiceRegistry` instead. | Keep during migration; eventually replace with new persistence layer |
| `studio-store.ts` | **LEGACY** (still needed) | 129-line Zustand store for tool state, layer visibility, drawing state, selection. Actively used by old and hybrid components. EditorBridge syncs selection bidirectionally with new SelectionManager. | Keep as bridge; gradually remove fields as they migrate |
| `campus-map-store.ts` | **LEGACY** (still needed) | 191-line Zustand store for dashboard map list (create/update/delete campus maps). localStorage + Supabase. No new-system equivalent exists yet. | **KEEP** until dashboard module is migrated |
| `public-store.ts` | **KEEP** | 104-line Zustand store for the public-facing mobile app (bottom sheet, navigation state, recent destinations). Independent of the editor architecture. | **KEEP** |
| `ui-store.ts` | **DEAD** | 50-line Zustand store. Defines `Tool`, `MapView`, `EditorMode`, `BuildingBoxMode` — completely different types from the active stores. **Not imported by any file in `src/`.** | **DELETE** — dead code |

---

## Section 3: Services (`src/services/`)

| File | Classification | Notes | Suggested Action |
|------|---------------|-------|-----------------|
| `compiler-adapter.ts` | **NEW** | `createCompilerAdapter()` — client-side adapter that POSTs to `/api/compile`. Used by `EditorBridge` via `NavigationCompiler`. | **KEEP** |
| `compiler-server.ts` | **SERVER-SIDE** | `CampusCompilerAdapter` class — dynamically imports `@navi/compiler` server-side. Used in API routes (not directly imported by client components). | **KEEP** but verify all API routes use this, not the old adapter |

---

## Section 4: Packages vs App Overlap

### 4.1 Repeated Type Definitions

| Concept | App (`src/types/nav-types.ts`) | Package (`@navi/core`) |
|---------|-------------------------------|------------------------|
| Building | `Building` — flat, uses `LatLng[]` footprint, `floors: number[]`, direct LatLng coords | `Building` — nested `Floor[]`, uses `WorldPolygon` for footprint, `LocalCoord` for indoor entities |
| Room | Not in nav-types (part of `Component`) | `Room` — with `LocalPolygon`, building-local coords |
| Edge | `NavEdge` — `from`, `to`, `distance`, `type` string union | `NavEdge` from `@navi/compiler` — similar but from compiler output |
| Node | `NavNode` — `position: LatLng`, `floor: number`, `type` string union | `NavNode` from `@navi/compiler` — similar |
| Coordinates | `LatLng` — `{lat, lng, elevation?}` | `LatLng` — same shape in `@navi/core` |

**Assessment:** The old `nav-types.ts` types are tied to the legacy `Graph` class. The new `@navi/core` types are richer with building-local coordinate systems. The `createDocument()` function in `create-editor-context.ts` is a **massive adapter** (170+ lines) that transforms old Graph data into the new `CampusDocument` format. This is the single largest bridge in the system.

### 4.2 Repeated Rendering Logic

| Logic | App (`src/components/studio/rendering/`) | Package (`packages/editor/src/rendering/`) |
|-------|------------------------------------------|--------------------------------------------|
| Building GeoJSON | `geojson.ts:buildBuildingGeo()` | `geojson.ts:buildingToFeature()` + `document-adapters.ts:buildingsToGeoJSON()` |
| Edge GeoJSON | `geojson.ts:buildEdgeGeo()` | Not in editor package (graph is compiled artifact) |
| Node GeoJSON | `geojson.ts:buildNodeGeo()` | Not in editor package |
| Layer paint styles | `layers.ts` defines paint inline | `layers.ts` uses separate paint functions (`buildingFillPaint()`, etc.) |
| Layer ID scheme | `LYR` from `constants.ts` — `l-buildings-fill`, `s-buildings`, etc. | `LAYER_IDS` / `SOURCE_IDS` — `navi-building-fill`, `navi-buildings`, etc. |

**Assessment:** Complete duplication of rendering pipeline. The old system renders the legacy Graph model directly; the new system renders the CampusDocument model. **MapRenderer.tsx feeds both** — old NavNode/ NavEdge data goes into `s-nodes`/`s-edges` via `geojson.ts` functions, while CampusDocument buildings/roads go into `s-buildings`/`s-traces` via `buildingsToGeoJSON`/`roadsToTracesGeoJSON` from `@navi/editor`.

### 4.3 Repeated A* Routing

| File | App (`src/engine/a-star.ts`) | Package (`packages/runtime/src/routing/astar.ts`) |
|------|-----------------------------|---------------------------------------------------|
| Lines | 224 | 83 |
| Types | `NavNode`/`NavEdge` from `@/types/nav-types` | `NavNode`/`NavEdge` from `@navi/compiler` |
| Heuristic | Haversine (local) | Haversine (local) |
| Result | `PathResult` with instructions | `{path, distance}` |

**Assessment:** Both implement the same A* algorithm. The app version produces human-readable turn-by-turn instructions (200+ lines of instruction generation). The package version is more focused (data-only path). **Keep both** — they serve different contexts (studio editing vs runtime navigation). But refactor `haversine` into a shared utility.

### 4.4 Repeated Geometry Utilities

| File | What | Package Equivalent |
|------|------|--------------------|
| `src/engine/geo-utils.ts` | haversine, line intersection | `packages/core/src/geometry/polygon.ts`, `topology.ts` |
| `src/engine/geometry.ts` | convexHull | `packages/core/src/geometry/polygon.ts` has this |
| `src/engine/spatial-resolver.ts` | spatial queries | `packages/core/src/geometry/spatial-index.ts` |
| `src/engine/intersection-engine.ts` | intersection logic | Various files in `packages/core/src/geometry/` |

**Assessment:** The `src/engine/` directory predates the extraction to `@navi/core`/`@navi/compiler`. Much of this logic may now be redundant.

### 4.5 Repeated Compiler Logic

| File | App | Package |
|------|-----|---------|
| `src/engine/component-compiler.ts` (349 lines) | Compiles Component → NavNode/NavEdge | `packages/compiler/` — full document compiler |
| `src/engine/trace-compiler.ts` (133 lines) | Compiles TracePath → nodes/edges | `packages/compiler/src/pipeline/` — has build stages |

**Assessment:** The app-level compilers are legacy and operate on the old `Graph` class. The `@navi/compiler` package is the new pipeline. The `createCompilerAdapter` in `compiler-adapter.ts` is the intended bridge.

---

## Section 5: Dead Code Detection

### 5.1 Files with `.legacy.` Suffix

| File | Status |
|------|--------|
| `src/components/studio/StudioCanvas.legacy.tsx` | **DEAD** — not imported anywhere |

### 5.2 Unused Imports / Broken References

| File | Issue |
|------|-------|
| `src/components/studio/rendering/NavigationGraphRenderer.tsx` | Imports `addGraphSourcesAndLayers` from `./layers` — **function does not exist** (only `addSourcesAndLayers` does). Both are imported and `addGraphSourcesAndLayers` is called on line 71, which will throw at runtime. |

### 5.3 Dead Stores

| Store | Status |
|-------|--------|
| `src/store/ui-store.ts` | **DEAD** — zero imports from any other file |

### 5.4 Legacy Panel Directory

| Directory | Status |
|-----------|--------|
| `src/components/studio/legacy/` | All 5 files are **DEAD** — replaced by `@navi/editor` PropertiesPanel |

### 5.5 Import Analysis: What Uses `@/store/graph-store` vs `@navi/editor`

| Import | Count | Files |
|--------|-------|-------|
| `@/store/graph-store` | 28 | EditorBridge, MapRenderer, NavigationGraphRenderer, InteractionController, CreateMapWizard, MapPreview, legacy panels, floor-editor tests, map components (CampusMap, PublicMap), search, directory, pages (studio/edit, qr, panoramas) |
| `@navi/editor` | 69 | All NEW/hybrid components: StudioWorkspace, StudioToolbar, ExplorerPanel, FloorTabs, PropertiesPanel, EditorBridge, ViewportController, SelectionOverlay, ConfirmOverlay, EntityRendererBridge, floor-editor components, hooks |

### 5.6 E2E Test Files in Root

| File | Status |
|------|--------|
| `e2e-*.mjs` (18 files) | E2E test screenshots and scripts. Assessment needed if these are still running or historical. |
| `e2e-*.png` (16 files) | Screenshots from E2E tests. May be artifacts. |

---

## Section 6: Rendering Systems Comparison

### Old System

| Characteristic | Value |
|----------------|-------|
| **Source IDs** | `s-buildings`, `s-edges`, `s-nodes`, `s-nodes-connection`, `s-traces`, `s-drawing` |
| **Layer IDs** | `l-buildings-fill`, `l-buildings-extrusion`, `l-buildings-outline`, `l-edges`, `l-nodes`, `l-nodes-connection`, `l-traces-line`, `l-traces-inner`, `l-drawing-line`, `l-drawing-points` |
| **Defined in** | `src/components/studio/rendering/constants.ts` |
| **Layers registered by** | `src/components/studio/rendering/layers.ts:addSourcesAndLayers()` |
| **Data pushed by** | `MapRenderer` (buildings from both `Graph` + `CampusDocument`), `NavigationGraphRenderer` (nodes/edges from `Graph`) |
| **Hit-testing** | `InteractionController` using `map.queryRenderedFeatures` with `LYR.NODES`, `LYR.BUILDINGS_EXTRUSION/FILL`, `LYR.TRACES_LINE/INNER` |
| **Selection visual** | `SelectionOverlay` setting `feature-state` on `s-nodes`/`s-nodes-connection` |
| **Drawing preview** | `SRC.DRAWING` source, updated via `DrawingOverlay` + `InteractionController.updateDrawingSource` |

### New System

| Characteristic | Value |
|----------------|-------|
| **Source IDs** | `navi-buildings`, `navi-rooms`, `navi-hallways`, `navi-roads`, `navi-entrances`, `navi-staircases`, `navi-elevators`, `navi-panoramas`, `navi-qr`, `navi-preview`, `navi-selection` |
| **Layer IDs** | `navi-building-fill`, `navi-building-outline`, `navi-building-extrusion`, `navi-room-fill`, `navi-room-outline`, `navi-hallway-line`, `navi-road-line`, `navi-entrance-icon`, `navi-staircase-icon`, `navi-elevator-icon`, `navi-panorama-icon`, `navi-qr-icon`, `navi-selection-overlay`, `navi-hover-highlight`, `navi-preview-layer`, `navi-validation-overlay` |
| **Defined in** | `packages/editor/src/rendering/layers.ts` |
| **Layers registered by** | `EntityRenderer.init()` |
| **Data pushed by** | `EntityRenderer.syncAll()` from `documentToGeoJSON()` |
| **Hit-testing** | Not yet implemented in new select-tool (registry select-tool has stub `entityAtEvent`) |
| **Selection visual** | EntityRenderer has `updateSelection()` method for selection polygon |
| **Drawing preview** | `EntityRenderer.setPreview()` for preview geometry |

### Hybrid Files (use BOTH systems)

| File | Old system | New system |
|------|-----------|------------|
| `MapRenderer.tsx` | Pushes to `s-buildings`, `s-nodes`, `s-edges`, `s-nodes-connection`, `s-traces` using LYR/SRC | Reads document via `useEditor`, calls `buildingsToGeoJSON()` from `@navi/editor` |
| `SelectionOverlay.tsx` | Applies `feature-state` to `s-nodes`/`s-nodes-connection` | Reads selection via `useSelection()` from `@navi/editor` |
| `EntityRendererBridge.tsx` | Reads `layers.buildings` from Zustand (old) | Creates `EntityRenderer` from `@navi/editor`, uses `LAYER_IDS` from new system |

**Critical finding:** `EntityRendererBridge.tsx` exists and works, but **StudioCanvas.tsx does NOT mount it**. It only mounts `MapRenderer` + `NavigationGraphRenderer` (old/hybrid). The `EntityRendererBridge` would add the new `navi-*` layers alongside the old `l-*` layers, creating dual rendering.

---

## Section 7: Key Architectural Observations

### 7.1 The Dual-Graph Problem

The system has **two graph representations**:
1. **Legacy:** `Graph` class in `src/engine/graph.ts` (817 lines) — manages `NavNode[]`, `NavEdge[]`, `Building[]`, `Component[]`, `TracePath[]`. Persists to localStorage. All old components use this.
2. **New:** `CampusDocument` type from `@navi/core` — schema-based, rich types, building-local coordinates. Managed by `DocumentStore`.

The `createDocument()` function (170+ lines in `create-editor-context.ts`) converts legacy Graph → CampusDocument. This is the crucial bridge. But edits made through new tools (registry tools, dispatcher) modify CampusDocument while the old Graph remains unchanged (until Zustand syncs and save() is called).

### 7.2 The Dual-Persistence Problem

- **Legacy:** `useGraphStore.save()` → localStorage → Supabase sync
- **New:** `WorkflowService.save()` → delegates to `PersistenceAdapter` → eventually calls `useGraphStore.save()`

Both run in parallel. The adapter in `EditorBridge.tsx` connects them:
```ts
const persistenceAdapter: PersistenceAdapter = {
  save: () => useGraphStore.getState().save(),
  syncToSupabase: () => useGraphStore.getState().syncToSupabase(),
  publish: async () => ({ success: true, version: '1.0.0' }),
}
```

So new-tool edits ultimately save through the old store. This is pragmatic but means the legacy Graph class remains the source of truth for persistence.

### 7.3 The EditorBridge as Central Glue

`EditorBridge.tsx` does three things:
1. Creates the `EditorContext` once (document + services + transformer)
2. Bridges `SelectionManager` ↔ `useStudioStore` bidirectionally
3. Creates the `PersistenceAdapter` that ties new persistence to old store

This is the key integration point that will need careful management during migration.

### 7.4 The Compilation Pipeline Gap

- **Legacy compile path:** Graph data → in-memory `a-star` routing (in app engine)
- **New compile path:** CampusDocument → POST `/api/compile` → compiler response with NavigationGraph/SearchIndex/POI/BuildingIndex
- The new compile path is **not yet fully utilized** — `NavigationCompiler` exists, `WorkflowService` exists, but the compilation pipeline is still maturing.

---

## Summary: What to Delete Now (Safe)

1. `src/store/ui-store.ts` — zero imports, dead code
2. `src/components/studio/StudioCanvas.legacy.tsx` — replaced by StudioCanvas.tsx
3. `src/components/studio/legacy/` — all 5 files (replaced by @navi/editor PropertiesPanel)
4. Fix `src/components/studio/rendering/NavigationGraphRenderer.tsx` — dead import `addGraphSourcesAndLayers`

## Summary: What to Reconcile (Medium Priority)

1. Decide fate of `EntityRendererBridge.tsx` — mount it in StudioCanvas or remove it
2. Consolidate `MapRenderer.tsx` to single data source (per migration matrix item #17)
3. Remove `src/engine/graph-validator.ts` once ValidationEngine covers all use cases (per matrix item #14)
4. Unify `haverine` implementations across app and packages

## Summary: Major Migration Items (Per Existing Matrix)

The LEGACY_TO_NEW_MIGRATION_MATRIX.md covers 18 migration items across:
- Tool activation (item #1) 
- Event routing (item #2)
- Building drawing (item #4)
- Route drawing (item #5)
- Room drawing (item #6)
- Confirm flow (item #11)
- Vertex editing (item #12)
- Map rendering (item #17)

## Appendix: File Counts

| Directory | File Count | Classification Notes |
|-----------|-----------|---------------------|
| `src/components/studio/` | 37 files | ~12 LEGACY/DEAD, ~15 NEW, ~6 HYBRID, ~4 UNKNOWN |
| `src/components/studio/legacy/` | 5 files | 100% DEAD |
| `src/store/` | 5 stores | 1 DEAD, 3 LEGACY/needed, 1 KEEP |
| `src/services/` | 2 files | Both needed |
| `src/engine/` | 10 files | All LEGACY (predate package extraction) |
| `packages/editor/` | 100+ files | The NEW architecture |
| `packages/core/` | ~20 files | Types + geometry + serialization |
| `packages/compiler/` | ~30 files | Document compiler |
| `packages/runtime/` | ~20 files | Runtime engine (routing, search, position) |

