### Task 7: Build Studio Store

**Files:**
- Create: `src/store/studio-store.ts`
- Test: `src/store/__tests__/studio-store.test.ts`

**Context:** `StudioTool`, `EditorMode`, `LayerVisibility`, `StudioViewState` types are already defined in `src/types/studio-types.ts`. Create a new Zustand store for Studio UI state.

- [ ] **Step 1: Read `src/types/studio-types.ts` to understand existing types**

- [ ] **Step 2: Write failing studio store tests**

```typescript
// src/store/__tests__/studio-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useStudioStore } from '../studio-store'

describe('useStudioStore', () => {
  beforeEach(() => {
    useStudioStore.setState({
      tool: 'select',
      editorMode: 'campus',
      activeBuildingId: null,
      activeFloor: 0,
      layers: {
        osm: true, satellite: false, floor_plan: false,
        buildings: true, rooms: true, hallways: true,
        assets: true, nodes: false, edges: false, labels: true,
      },
    })
  })

  it('sets tool', () => {
    useStudioStore.getState().setTool('trace')
    expect(useStudioStore.getState().tool).toBe('trace')
  })

  it('sets editor mode', () => {
    useStudioStore.getState().setEditorMode('building')
    expect(useStudioStore.getState().editorMode).toBe('building')
  })

  it('sets active building', () => {
    useStudioStore.getState().setActiveBuilding('BLD01')
    expect(useStudioStore.getState().activeBuildingId).toBe('BLD01')
  })

  it('sets active floor', () => {
    useStudioStore.getState().setActiveFloor(2)
    expect(useStudioStore.getState().activeFloor).toBe(2)
  })

  it('toggles layer visibility', () => {
    useStudioStore.getState().toggleLayer('nodes')
    expect(useStudioStore.getState().layers.nodes).toBe(true)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `useStudioStore` not defined

- [ ] **Step 4: Create `src/store/studio-store.ts`**

```typescript
import { create } from 'zustand'
import type { StudioTool, EditorMode, LayerVisibility } from '../types/studio-types'

interface StudioState {
  tool: StudioTool
  editorMode: EditorMode
  activeBuildingId: string | null
  activeFloor: number
  layers: LayerVisibility
  isTraceActive: boolean
  traceMode: 'hallway' | 'path'

  setTool: (tool: StudioTool) => void
  setEditorMode: (mode: EditorMode) => void
  setActiveBuilding: (id: string | null) => void
  setActiveFloor: (floor: number) => void
  toggleLayer: (layer: keyof LayerVisibility) => void
  setLayers: (layers: Partial<LayerVisibility>) => void
  setTraceActive: (active: boolean) => void
  setTraceMode: (mode: 'hallway' | 'path') => void

  // Tracing state
  tracePoints: { lat: number; lng: number }[]
  addTracePoint: (point: { lat: number; lng: number }) => void
  clearTracePoints: () => void
  undoLastTracePoint: () => void
}

const defaultLayers: LayerVisibility = {
  osm: true,
  satellite: false,
  floor_plan: false,
  buildings: true,
  rooms: true,
  hallways: true,
  assets: true,
  nodes: false,
  edges: false,
  labels: true,
}

export const useStudioStore = create<StudioState>((set) => ({
  tool: 'select',
  editorMode: 'campus',
  activeBuildingId: null,
  activeFloor: 0,
  layers: { ...defaultLayers },
  isTraceActive: false,
  traceMode: 'hallway',
  tracePoints: [],

  setTool: (tool) => set({ tool }),
  setEditorMode: (mode) => set({ editorMode: mode }),
  setActiveBuilding: (id) => set({ activeBuildingId: id, activeFloor: 0 }),
  setActiveFloor: (floor) => set({ activeFloor: floor }),
  toggleLayer: (layer) => set((s) => ({
    layers: { ...s.layers, [layer]: !s.layers[layer] },
  })),
  setLayers: (layers) => set((s) => ({
    layers: { ...s.layers, ...layers },
  })),
  setTraceActive: (active) => set({
    isTraceActive: active,
    tracePoints: active ? [] : [],
  }),
  setTraceMode: (mode) => set({ traceMode: mode }),

  addTracePoint: (point) => set((s) => ({
    tracePoints: [...s.tracePoints, point],
  })),
  clearTracePoints: () => set({ tracePoints: [] }),
  undoLastTracePoint: () => set((s) => ({
    tracePoints: s.tracePoints.slice(0, -1),
  })),
}))
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/store/studio-store.ts src/store/__tests__/studio-store.test.ts
git commit -m "feat: add studio Zustand store for NAVI Studio state"
```
