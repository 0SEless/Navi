### Task 1: Extend Type Definitions

**Files:**
- Modify: `src/types/nav-types.ts`
- Create: `src/types/studio-types.ts`
- Test: `src/types/__tests__/types.test.ts`

**Interfaces:**
- Consumes: existing NavNode, NavEdge, Component, LatLng types
- Produces: `TracePath`, `FloorPlan`, `EdgeTypeExtended` (union), `StudioTool`, `EditorMode`, `LayerType`, extended `Component` with polygon, extended `CompileResult` with polygon

- [ ] **Step 1: Write failing type tests**

```typescript
// src/types/__tests__/types.test.ts
import { describe, it, expect } from 'vitest'
import type { TracePath, FloorPlan } from '../nav-types'
import type { StudioTool, EditorMode, LayerType } from '../studio-types'

describe('TracePath', () => {
  it('accepts valid trace path data', () => {
    const trace: TracePath = {
      id: 'T001',
      buildingId: 'BLD01',
      floor: 1,
      points: [{ lat: 11.8195, lng: 122.0922 }, { lat: 11.8196, lng: 122.0923 }],
      type: 'hallway',
    }
    expect(trace.id).toBe('T001')
    expect(trace.points.length).toBe(2)
  })
})

describe('FloorPlan', () => {
  it('accepts valid floor plan data', () => {
    const fp: FloorPlan = {
      buildingId: 'BLD01',
      floor: 1,
      imageUrl: 'https://example.com/floor1.png',
      uploadedAt: '2026-06-21T00:00:00Z',
    }
    expect(fp.imageUrl).toContain('example.com')
  })
})

describe('StudioTool', () => {
  it('accepts all tool values', () => {
    const tools: StudioTool[] = ['select', 'move', 'trace', 'room', 'asset', 'qr', 'pano', 'route_test']
    expect(tools).toHaveLength(8)
  })
})

describe('EditorMode', () => {
  it('accepts all mode values', () => {
    const modes: EditorMode[] = ['campus', 'building', 'floor']
    expect(modes).toHaveLength(3)
  })
})

describe('LayerType', () => {
  it('accepts all layer values', () => {
    const layers: LayerType[] = ['osm', 'satellite', 'floor_plan', 'buildings', 'rooms', 'hallways', 'assets', 'nodes', 'edges', 'labels']
    expect(layers).toHaveLength(10)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `TracePath`, `FloorPlan`, `StudioTool`, `EditorMode`, `LayerType` not defined

- [ ] **Step 3: Add new types to `nav-types.ts`**

Add after existing imports:

```typescript
// ---- Trace Path ----

export interface TracePath {
  id: string
  name?: string
  buildingId?: string
  campusId?: string
  floor: number
  points: LatLng[]
  type: 'hallway' | 'path'
  metadata?: Record<string, unknown>
}

// ---- Floor Plan ----

export interface FloorPlan {
  buildingId: string
  floor: number
  imageUrl: string
  uploadedAt: string
}
```

Extend the `EdgeType` union to include the new values:

```typescript
export type EdgeType =
  | 'walk'          // NEW: hallways, corridors, outdoor paths (V1 default)
  | 'transition'    // NEW: outdoor→entrance, entrance→hallway, floor-to-floor
  | 'restricted'    // NEW: faculty/admin-only zones
  | 'walkway'       // existing (kept for backward compat)
  | 'stairs'
  | 'corridor'
  | 'elevator'
  | 'ramp'
  | 'wall'
```

Add `polygon` field to `Component`:

```typescript
export interface Component {
  id: string
  type: ComponentType
  name: string
  buildingId: string
  floor: number
  position: LatLng
  polygon?: LatLng[]    // NEW: polygon vertices (for room/restroom types)
  dimensions?: {
    width: number
    height: number
    rotation?: number
  }
  connections?: string[]
  metadata?: Record<string, unknown>
}
```

Add polygon to `CompileResult` in `src/engine/component-compiler.ts`:

```typescript
export interface CompileResult {
  nodes: NavNode[]
  edges: NavEdge[]
  polygon?: LatLng[]   // NEW: for room types — the room outline
}
```

- [ ] **Step 4: Create `src/types/studio-types.ts`**

```typescript
// ---- Studio UI Types ----

export type StudioTool =
  | 'select'
  | 'move'
  | 'trace'
  | 'room'
  | 'asset'
  | 'qr'
  | 'pano'
  | 'route_test'

export type EditorMode = 'campus' | 'building' | 'floor'

export type LayerType =
  | 'osm'
  | 'satellite'
  | 'floor_plan'
  | 'buildings'
  | 'rooms'
  | 'hallways'
  | 'assets'
  | 'nodes'
  | 'edges'
  | 'labels'

export type TraceMode = 'hallway' | 'path'

export type RoomPreset = 'rectangle' | 'lshape' | 'freeform'

export interface StudioViewState {
  center: { lat: number; lng: number }
  zoom: number
  activeFloor: number
  activeBuildingId: string | null
}

export interface LayerVisibility {
  osm: boolean
  satellite: boolean
  floor_plan: boolean
  buildings: boolean
  rooms: boolean
  hallways: boolean
  assets: boolean
  nodes: boolean
  edges: boolean
  labels: boolean
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all 4 test suites pass

- [ ] **Step 6: Commit**

```bash
git add src/types/nav-types.ts src/types/studio-types.ts src/types/__tests__/types.test.ts src/engine/component-compiler.ts
git commit -m "feat: extend types for NAVI Studio (TracePath, FloorPlan, new edge types, polygon rooms)"
```
