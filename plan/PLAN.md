# M2.9 Plan

## Tasks

### T1 — Fix double-click adds 2 points instead of confirming (finding #2)
- **Files**: `src/components/floor-editor/useFloorDrawing.ts`, `FloorEditorCanvas.tsx`
- **Fix**: In `handleMapClick`, skip clicks where `(e.originalEvent as MouseEvent).detail > 1` (double-click part). Move dblclick confirmation into `useFloorDrawing` (expose `handleDblClick` callback), register dblclick handler in FloorEditorCanvas.
- **Acceptance**: Double-click during polygon/line placement adds one point then confirms.

### T2 — Fix as unknown as maplibregl.EventHandler cast (finding #7)
- **File**: `src/components/floor-editor/FloorEditorCanvas.tsx:398,518,525`
- **Fix**: Remove double cast. Define `onMouseDown` as `maplibregl.EventHandler` compatible signature. Since MapLibre overloads `map.on(event, layerId, handler)` where handler receives `MapMouseEvent & { features? }`, extract the features access into a wrapper or use the `map.queryRenderedFeatures()` pattern.
- **Acceptance**: No `as unknown` cast in FloorEditorCanvas drag interaction effect.

### T3 — Fire 'load' event in MapLibre test mock (finding #12)
- **File**: `src/components/floor-editor/__tests__/FloorEditorCanvas.test.tsx`
- **Fix**: In mock MapCtor, fire 'load' event after construction via `setTimeout` or synchronously in constructor.
- **Acceptance**: The 'load' event fires during tests; addSourcesAndLayers is executed.

### T4 — Named constants for ComponentProperties defaults (finding #13)
- **File**: `src/components/floor-editor/ComponentProperties.tsx`
- **Fix**: Extract `DEFAULT_ROOM_WIDTH = 4`, `DEFAULT_ROOM_HEIGHT = 5`, `DEFAULT_FLOOR = 0` constants.
- **Acceptance**: No magic numbers in useState initializers.
