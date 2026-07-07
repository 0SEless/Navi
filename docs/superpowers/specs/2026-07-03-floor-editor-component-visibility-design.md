# Floor Editor: Component Visibility & Visual Identity

## Problem

The floor editor (`/studio/:id/edit/building/:buildingId/floor/:floor`) does not render all component types on the map canvas. Users cannot see stairs, elevators, or entrances after placing them. The "Upload a floor plan" overlay blocks the view and misleads users into thinking they need a floor plan to use the editor.

## Success Criteria

1. All component types (room, hallway, stair, elevator, entrance, restroom) render on the map canvas immediately after placement
2. Each component type has a distinct visual identity (different color/shape)
3. The "Upload floor plan" overlay does not block component visibility
4. Placement is "snappy" — the component appears within the same render cycle

## Non-Goals

- Floor plan image overlay alignment (indoor navigation is logic-based, not geo-based)
- Component image icons (can be added layer as a future enhancement)
- Wall/door tool implementation (exists in ComponentPalette but not wired)

## Design

### Files Touched

| File | Change |
|------|--------|
| `src/components/floor-editor/FloorEditor.tsx` | Replace blocking overlay with non-intrusive banner |
| `src/components/floor-editor/FloorEditorCanvas.tsx` | Add point-component rendering layers + sync |

### 1. Fix the Overlay (FloorEditor.tsx:99-106)

Replace the `position: absolute; inset: 0` overlay that covers the entire canvas with a thin banner at the top:

```
if (!building.floorPlanUrls?.[floor]) {
  // Show thin banner instead of blocking overlay
}
```

If no floor plan exists, show a small info bar (32px height, semi-transparent) at the top of the canvas: "No floor plan — components display on dark background. Upload one in the Building panel." This should NOT cover or block interaction with the map.

### 2. Add Point-Component Source (FloorEditorCanvas.tsx)

Add a new GeoJSON source `floor-point-items` in `addSourcesAndLayers()`:

```typescript
map.addSource('floor-point-items', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
```

Three rendering layers:

| Layer ID | Type | Filter | Paint |
|----------|------|--------|-------|
| `floor-items-stairs` | circle | `type === 'stair'` | circle-radius: 10, circle-color: #F97316, circle-stroke: #fff, circle-stroke-width: 2 |
| `floor-items-elevator` | circle | `type === 'elevator'` | circle-radius: 10, circle-color: #7C3AED, circle-stroke: #fff, circle-stroke-width: 2 |
| `floor-items-entrance` | circle | `type === 'entrance'` | circle-radius: 8, circle-color: #F59E0B, circle-stroke: #fff, circle-stroke-width: 2 |

Plus symbol layers for type labels:
| Layer ID | Type | Filter | Layout |
|----------|------|--------|--------|
| `floor-items-stairs-label` | symbol | `type === 'stair'` | text-field: "S", text-size: 11, text-color: #fff |
| `floor-items-elevator-label` | symbol | `type === 'elevator'` | text-field: "E", text-size: 11, text-color: #fff |
| `floor-items-entrance-label` | symbol | `type === 'entrance'` | text-field: "⬇", text-size: 10, text-color: #fff |

### 3. Sync Point Components (FloorEditorCanvas.tsx)

Extend the existing sync effect (lines 167-200) to also push stairs, elevators, and entrances to `floor-point-items`:

```typescript
const pointFeatures = floorComponents
  .filter((c) => c.type === 'stair' || c.type === 'elevator' || c.type === 'entrance')
  .map((c) => ({
    type: 'Feature' as const,
    properties: { id: c.id, name: c.name, type: c.type },
    geometry: { type: 'Point' as const, coordinates: [c.position.lng, c.position.lat] },
  }))

const pointSrc = map.getSource('floor-point-items') as maplibregl.GeoJSONSource
if (pointSrc) pointSrc.setData({ type: 'FeatureCollection', features: pointFeatures })
```

### 4. Layer Visibility Wiring

Wire the new point-component layers to the existing `assets` layer toggle:

```typescript
'floor-items-stairs': layers.assets,
'floor-items-stairs-label': layers.assets,
'floor-items-elevator': layers.assets,
'floor-items-elevator-label': layers.assets,
'floor-items-entrance': layers.assets,
'floor-items-entrance-label': layers.assets,
```

### Future Visual Enhancements (Not in Scope)

- Image icons for stair/elevator/entrance via `map.loadImage()` + `map.addImage()`
- Context-click to change color per component
- Room dimension labels on hover
