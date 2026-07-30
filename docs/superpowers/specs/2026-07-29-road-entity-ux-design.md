# Road Entity UX Redesign

**Date:** 2026-07-29
**Status:** Approved

## Problem Summary

1. **Color not persisting** — road creation ignores the metadata payload, so user-selected color is lost and falls back to blue
2. **Properties panel not showing** — `selectedTraceId` is never bridged to the editor's SelectionManager, so road selection produces no UI feedback
3. **No post-creation color editing** — `RoadProperties` panel lacks a color picker
4. **Select vs Edit conflated** — clicking a road immediately enters vertex editing (showing nodes/edges) instead of first selecting it and showing properties
5. **Road width not real-world** — stored meter value is used as raw pixels, making roads appear to grow/shrink unphysically with zoom

## 1. Color Persistence Fix

**File:** `packages/editor/src/commands/road-handlers.ts` (line 32)

**Change:** `metadata: {}` → `metadata: (payload.metadata as Record<string, unknown>) || {}`

The ConfirmOverlay passes `metadata: { color: traceColor }` in the payload, but the handler discards it.

## 2. Properties Panel Bridge

**File:** `src/components/studio/EditorBridge.tsx` (line 161)

**Change:** Add `selectedTraceId` to the bridge's legacy ID check:

```typescript
const legacyId = s.selectedTraceId ?? s.selectedNodeId ?? s.activeBuildingId
```

`findEntityById` already resolves road IDs (`path: 'road'`) and the `PropertiesPanel` renders `<RoadProperties>`.

## 3. Enhanced RoadProperties Panel

**File:** `packages/editor/src/panels/properties/road-props.tsx`

**Additions:**
- **Color picker** — 15-swatch palette (same as ConfirmOverlay), reads/writes `metadata.color`
- **"Edit Road" button** — calls `setVertexEditing('trace', roadId)` to enter vertex editing mode
- Width slider retains range 2–20 meters

## 4. Select vs Edit Separation

### InteractionController

**File:** `src/components/studio/InteractionController.tsx` (lines 202–209)

**Change:** Trace click should ONLY select — remove `setVertexEditing` call:

```typescript
if (hitTrace) {
  const tid = hitTrace.properties?.id
  if (tid) { useStudioStore.getState().setSelectedTraceId(tid); return }
}
```

Selection now shows the road's Properties Panel only — no nodes/edges.

### Vertex Editing Entry

**Via "Edit Road" button** in `RoadProperties` component — calls `setVertexEditing('trace', roadId)`.

**Result:** Nodes/edges only appear during explicit edit mode. MapRenderer's `preEditLayerVisRef` forces nodes visible during editing and restores to hidden on exit.

## 5. Fixed Real-World Width Rendering

### Paint Expressions

**Files:** 
- `packages/core/src/rendering/road-layers.ts` (`roadTracePaint`, `roadOutlinePaint`)
- `packages/editor/src/rendering/layers.ts`

**Current:** `'line-width': ['get', 'width']` — raw pixel value, no zoom scaling.

**Target:** Zoom-dependent line width using `['interpolate', ['linear'], ['zoom'], ...]` that converts the road's meter-width to screen pixels.

Precomputed meters-per-pixel at key zoom levels (at equator, cos(lat) ≈ 1):

| Zoom | px/meter | 8m road |
|------|----------|---------|
| 10   | 0.15     | ~1 px   |
| 12   | 0.60     | ~5 px   |
| 14   | 2.39     | ~19 px  |
| 16   | 9.57     | ~77 px  |
| 18   | 38.28    | ~306 px |
| 20   | 153.11   | ~1225 px|

### Clamping

Apply `minScreenWidthPx: 4` and `maxScreenWidthPx: 24` to prevent vanishing at low zoom or absurd thickness at high zoom:
- At zoom 10–12: any road is at least 4px wide
- At zoom 18+: any road is at most 24px wide (even an 8m arterial)

### Expression

```typescript
['interpolate', ['linear'], ['zoom'],
  10, ['max', 4, ['*', ['get', 'width'], 0.15]],
  12, ['max', 4, ['*', ['get', 'width'], 0.60]],
  14, ['min', ['*', ['get', 'width'], 2.39], 24],
  16, ['min', ['*', ['get', 'width'], 9.57], 24],
  18, ['min', ['*', ['get', 'width'], 38.28], 24],
  20, ['min', ['*', ['get', 'width'], 153.11], 24],
]
```

Outline width is the same expression + 2px, clamped at the same limits.

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/editor/src/commands/road-handlers.ts` | Bug fix | Preserve metadata payload |
| `src/components/studio/EditorBridge.tsx` | Bug fix | Bridge `selectedTraceId` |
| `packages/editor/src/panels/properties/road-props.tsx` | Enhancement | Add color picker + Edit button |
| `src/components/studio/InteractionController.tsx` | Enhancement | Remove auto-vertex-editing on trace click |
| `packages/core/src/rendering/road-layers.ts` | Enhancement | Zoom-dependent width expressions |
| `packages/editor/src/rendering/layers.ts` | Enhancement | Zoom-dependent width expressions |

## Acceptance Criteria

1. Road color set in ConfirmOverlay persists after save and reload
2. Selecting a road (single click) shows Properties Panel with road's name, width, surface, type, color
3. "Edit Road" button activates vertex editing — nodes appear, vertices draggable
4. Road line width maintains consistent real-world scale across zoom levels
5. All existing tests continue to pass (1252/1253, 1 pre-existing unrelated failure)
