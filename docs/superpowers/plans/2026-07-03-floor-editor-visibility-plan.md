# Floor Editor Component Visibility Implementation Plan

> **For agentic workers:** Inline execution recommended — 2 files, clear changes.

**Goal:** Make all component types (stairs, elevator, entrance) visible on the floor editor canvas with distinct visual identities.

**Architecture:** Add a new GeoJSON source + 6 rendering layers (3 circles, 3 labels) to the existing MapLibre canvas, extend the data sync effect, replace the blocking overlay with a thin banner.

**Tech Stack:** MapLibre GL JS, Zustand, React, TypeScript

**Files to touch:**
- `navi-next/src/components/floor-editor/FloorEditor.tsx`
- `navi-next/src/components/floor-editor/FloorEditorCanvas.tsx`

---

### Task 1: Fix the "Upload floor plan" overlay

**Files:**
- Modify: `navi-next/src/components/floor-editor/FloorEditor.tsx:99-106`

**Interfaces:**
- Consumes: `building.floorPlanUrls?.[floor]` check
- Produces: Non-blocking banner instead of full-canvas overlay

- [ ] **Step 1: Replace the blocking overlay**

In `FloorEditor.tsx`, replace lines 99-106 with a thin banner:

Change from:
```tsx
{!building.floorPlanUrls?.[floor] && (
  <div style={{
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#0F172A', color: '#475569', fontSize: 13, fontWeight: 500, pointerEvents: 'none', zIndex: 10,
  }}>
    Upload a floor plan image in the Building panel to begin editing
  </div>
)}
```

To:
```tsx
{!building.floorPlanUrls?.[floor] && (
  <div style={{
    position: 'absolute', top: 0, left: 0, right: 0,
    padding: '6px 12px', background: 'rgba(30, 41, 59, 0.9)',
    color: '#94A3B8', fontSize: 11, zIndex: 10,
    display: 'flex', alignItems: 'center', gap: 6,
  }}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    No floor plan — components shown on dark background. Upload one in the Building panel.
  </div>
)}
```

- [ ] **Step 2: Verify the banner renders correctly**

The banner should appear at the top of the canvas area (not overlay), and the map canvas behind it should be fully interactive.

---

### Task 2: Add point-component rendering (stairs, elevator, entrance)

**Files:**
- Modify: `navi-next/src/components/floor-editor/FloorEditorCanvas.tsx`

**Interfaces:**
- Consumes: `graph.components` from Zustand store, filtered by `building.id` and `floor`
- Produces: `floor-point-items` GeoJSON source with 6 layers (3 circle + 3 symbol) on the MapLibre map

- [ ] **Step 1: Add source and layers in `addSourcesAndLayers()`**

After the existing `floor-labels` source/layer block (line 81), add:

```typescript
// Point component items (stairs, elevator, entrance)
map.addSource('floor-point-items', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

map.addLayer({ id: 'floor-items-stairs', type: 'circle', source: 'floor-point-items', filter: ['==', ['get', 'type'], 'stair'], paint: { 'circle-radius': 10, 'circle-color': '#F97316', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 } })
map.addLayer({ id: 'floor-items-stairs-label', type: 'symbol', source: 'floor-point-items', filter: ['==', ['get', 'type'], 'stair'], layout: { 'text-field': 'S', 'text-size': 11, 'text-allow-overlap': true }, paint: { 'text-color': '#FFFFFF' } })

map.addLayer({ id: 'floor-items-elevator', type: 'circle', source: 'floor-point-items', filter: ['==', ['get', 'type'], 'elevator'], paint: { 'circle-radius': 10, 'circle-color': '#7C3AED', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 } })
map.addLayer({ id: 'floor-items-elevator-label', type: 'symbol', source: 'floor-point-items', filter: ['==', ['get', 'type'], 'elevator'], layout: { 'text-field': 'E', 'text-size': 11, 'text-allow-overlap': true }, paint: { 'text-color': '#FFFFFF' } })

map.addLayer({ id: 'floor-items-entrance', type: 'circle', source: 'floor-point-items', filter: ['==', ['get', 'type'], 'entrance'], paint: { 'circle-radius': 8, 'circle-color': '#F59E0B', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 } })
map.addLayer({ id: 'floor-items-entrance-label', type: 'symbol', source: 'floor-point-items', filter: ['==', ['get', 'type'], 'entrance'], layout: { 'text-field': '\u2B07', 'text-size': 10, 'text-allow-overlap': true }, paint: { 'text-color': '#FFFFFF' } })
```

- [ ] **Step 2: Extend the component sync effect**

After the hallway sync block (after `hallSrc.setData(...)` around line 198), add:

```typescript
// Sync point components (stairs, elevator, entrance)
const pointFeatures = floorComponents
  .filter((c) => c.type === 'stair' || c.type === 'elevator' || c.type === 'entrance')
  .map((c) => ({
    type: 'Feature' as const,
    properties: { id: c.id, name: c.name, type: c.type },
    geometry: { type: 'Point' as const, coordinates: [c.position.lng, c.position.lat] as [number, number] },
  }))

const pointSrc = map.getSource('floor-point-items') as maplibregl.GeoJSONSource | undefined
if (pointSrc) pointSrc.setData({ type: 'FeatureCollection', features: pointFeatures })
```

- [ ] **Step 3: Wire new layers to visibility toggles**

In the layer visibility effect (around line 241), add entries for the new layers:

```typescript
'floor-items-stairs': layers.assets,
'floor-items-stairs-label': layers.assets,
'floor-items-elevator': layers.assets,
'floor-items-elevator-label': layers.assets,
'floor-items-entrance': layers.assets,
'floor-items-entrance-label': layers.assets,
```

- [ ] **Step 4: Verify all components render**

1. Open a floor editor page
2. Place a stair → should see orange circle with "S" on the map
3. Place an elevator → should see purple circle with "E"
4. Place an entrance → should see amber circle with down-arrow
5. Toggle "Assets" layer off → all point components disappear
6. Toggle "Assets" layer on → all point components reappear
