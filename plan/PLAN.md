# M2.8 Plan

## Tasks

### T1 — Fix floor plan image never loading (finding #1)
- **File**: `src/components/floor-editor/FloorEditorCanvas.tsx:181-204`
- **Fix**: Add `mapInstance` to dependency array
- **Acceptance**: Floor plan effect re-runs after map load, calls `src.updateImage()` with actual URL
- **Error prevention**: Stale closure — the effect body uses `mapRef.current` which is always current

### T2 — Guard empty footprint in buildBuildingGeo (finding #5)
- **File**: `src/components/floor-editor/FloorEditorCanvas.tsx:26-50`
- **Fix**: Return empty FeatureCollection when `building.footprint.length === 0`
- **Acceptance**: Zero-length footprint produces `{ type: 'FeatureCollection', features: [] }`

### T3 — Skip empty URL in floor plan updateImage (finding #6)
- **File**: `src/components/floor-editor/FloorEditorCanvas.tsx:201-203`
- **Fix**: Only call `src.updateImage()` when `imgUrl` is truthy
- **Acceptance**: No fetch to `""` (current page URL) when no floor plan URL

### T4 — Remove graph.traces from unused dependency array (finding #4)
- **File**: `src/components/floor-editor/FloorEditorCanvas.tsx:280`
- **Fix**: Remove `graph.traces` from useEffect dependency list
- **Acceptance**: Effect works identically; deps only contain used values

### T5 — Auto-focus canvas for keyboard shortcuts (finding #8)
- **File**: `src/components/floor-editor/FloorEditorCanvas.tsx:531-553`
- **Fix**: Call `canvas.focus()` after map load; register `keydown` on window instead of canvas
- **Acceptance**: Delete/Backspace and Escape work without manual canvas click

### T6 — Log warnings in empty catch blocks (finding #9)
- **File**: `src/components/floor-editor/FloorEditorCanvas.tsx:279, 357`
- **Fix**: Replace empty catch blocks with `console.warn` including source identifier
- **Acceptance**: Catch blocks log useful context instead of silently swallowing

### T7 — Wrap toggleLayer in useCallback (finding #15)
- **File**: `src/components/floor-editor/FloorEditor.tsx:68-70`
- **Fix**: Wrap `toggleLayer` in `useCallback`
- **Acceptance**: Function reference stable across renders (no measurable perf impact, but consistent with codebase patterns)
