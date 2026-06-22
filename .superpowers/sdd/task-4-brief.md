### Task 4: Refactor Component Compiler for Polygon Output

**Files:**
- Modify: `src/engine/component-compiler.ts`
- Test: `src/engine/__tests__/component-compiler.test.ts`

**Context:** `CompileResult` already has `polygon?: LatLng[]` (added in Task 1). But `compileRoom()` doesn't compute or return it. You need to compute the polygon from the existing corner positions and return it.

**Restroom note:** `restroom` type uses `compileRoom` as its compiler (line 282), so it automatically gets polygon support once `compileRoom` is updated.

- [ ] **Step 1: Write failing polygon output test**

```typescript
// src/engine/__tests__/component-compiler.test.ts
import { describe, it, expect } from 'vitest'
import { compileComponent } from '../component-compiler'
import type { Component, Building } from '@/types/nav-types'

describe('compileComponent polygon output', () => {
  const building: Building = {
    id: 'BLD01', name: 'Test', description: '',
    center: { lat: 11.8195, lng: 122.0922 }, floors: 3,
  }
  const buildings = new Map<string, Building>([['BLD01', building]])

  it('compileRoom returns polygon with 4 vertices', () => {
    const room: Component = {
      id: 'C001', type: 'room', name: 'Room 101',
      buildingId: 'BLD01', floor: 1,
      position: { lat: 11.8195, lng: 122.0922 },
      dimensions: { width: 6, height: 8 },
    }
    const result = compileComponent(room, {
      buildings,
      existingNodes: [],
      existingEdges: [],
      componentId: 'C001',
    })
    expect(result.polygon).toBeDefined()
    expect(result.polygon!.length).toBe(4)
    // Polygon should form a closed rectangle around the center
    const poly = result.polygon!
    expect(poly[0].lat).toBeLessThan(room.position.lat) // SW
    expect(poly[2].lat).toBeGreaterThan(room.position.lat) // NE
  })

  it('compileRoom outputs center node + 4 wall edges', () => {
    const room: Component = {
      id: 'C002', type: 'room', name: 'Lab 1',
      buildingId: 'BLD01', floor: 1,
      position: { lat: 11.8195, lng: 122.0922 },
      dimensions: { width: 4, height: 5 },
    }
    const result = compileComponent(room, {
      buildings,
      existingNodes: [],
      existingEdges: [],
      componentId: 'C002',
    })
    expect(result.nodes.length).toBe(5) // 4 corners + 1 center
    expect(result.nodes.filter(n => n.type === 'room')).toHaveLength(1)
    expect(result.nodes.filter(n => n.type === 'corner')).toHaveLength(4)
    // Wall edges
    const wallEdges = result.edges.filter(e => e.type === 'wall')
    expect(wallEdges).toHaveLength(4)
  })

  it('compileRestroom also returns polygon', () => {
    const restroom: Component = {
      id: 'C003', type: 'restroom', name: 'CR 1',
      buildingId: 'BLD01', floor: 1,
      position: { lat: 11.8195, lng: 122.0922 },
      dimensions: { width: 3, height: 3 },
    }
    const result = compileComponent(restroom, {
      buildings,
      existingNodes: [],
      existingEdges: [],
      componentId: 'C003',
    })
    expect(result.polygon).toBeDefined()
    expect(result.polygon!.length).toBe(4)
  })

  it('compileStair does not return polygon', () => {
    const stair: Component = {
      id: 'C004', type: 'stair', name: 'Stair A',
      buildingId: 'BLD01', floor: 0,
      position: { lat: 11.8195, lng: 122.0922 },
    }
    const result = compileComponent(stair, {
      buildings,
      existingNodes: [],
      existingEdges: [],
      componentId: 'C004',
    })
    expect(result.polygon).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — polygon is undefined

- [ ] **Step 3: Modify `compileRoom` to compute and return polygon**

In `compileRoom`, the 4 corners are already computed. Compute the polygon array (SW, SE, NE, NW) and return it:

At line 74, after computing all 4 corners, add:
```typescript
const polygon: LatLng[] = [
  { lat: component.position.lat - dLat, lng: component.position.lng - dLng }, // SW
  { lat: component.position.lat - dLat, lng: component.position.lng + dLng }, // SE
  { lat: component.position.lat + dLat, lng: component.position.lng + dLng }, // NE
  { lat: component.position.lat + dLat, lng: component.position.lng - dLng }, // NW
]
```

Then change line 140 return from:
```typescript
return { nodes: [...cornerNodes, centerNode], edges }
```
to:
```typescript
return { nodes: [...cornerNodes, centerNode], edges, polygon }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/component-compiler.ts src/engine/__tests__/component-compiler.test.ts
git commit -m "feat: component compiler emits polygon geometry for rooms"
```
