### Task 3: Build Trace Compiler Engine Module

**Files:**
- Create: `src/engine/trace-compiler.ts`
- Test: `src/engine/__tests__/trace-compiler.test.ts`

**Interfaces:**
- Consumes: `TracePath`, `NavNode`, `NavEdge`, `LatLng`, `IntersectionPoint`, `findLineIntersections`, `findEndpointNodes` from intersection-engine
- Produces: `CompileTraceResult { nodes: NavNode[], edges: NavEdge[] }`, function: `compileTrace()`

**Note from controller:** The test checks `n.metadata?.source === 'intersection'` for intersection-generated nodes. You will need to set `metadata.source` on those nodes in the implementation. The brief's implementation code omits this — you must add it.

- [ ] **Step 1: Write failing trace compiler tests**

```typescript
// src/engine/__tests__/trace-compiler.test.ts
import { describe, it, expect } from 'vitest'
import type { TracePath, NavNode, NavEdge } from '@/types/nav-types'
import { compileTrace, type CompileTraceResult } from '../trace-compiler'

describe('compileTrace', () => {
  const hallway: TracePath = {
    id: 'T001',
    name: 'Main Hallway',
    buildingId: 'BLD01',
    floor: 1,
    points: [
      { lat: 11.8195, lng: 122.0922 },
      { lat: 11.8196, lng: 122.0923 },
      { lat: 11.8197, lng: 122.0924 },
    ],
    type: 'hallway',
  }

  it('generates endpoint nodes for a simple trace', () => {
    const result = compileTrace(hallway, [], [], [])
    expect(result.nodes.length).toBeGreaterThanOrEqual(2)
    const firstNode = result.nodes[0]
    expect(firstNode.type).toBe('intersection')
    expect(firstNode.floor).toBe(1)
    expect(firstNode.buildingId).toBe('BLD01')
  })

  it('generates edges between consecutive nodes', () => {
    const result = compileTrace(hallway, [], [], [])
    expect(result.edges.length).toBeGreaterThanOrEqual(1)
    for (const edge of result.edges) {
      expect(edge.type).toBe('walk')
    }
  })

  it('generates nodes at intersection points', () => {
    const existingTrace: TracePath = {
      id: 'T002',
      floor: 1,
      points: [
        { lat: 11.8190, lng: 122.0923 },
        { lat: 11.8200, lng: 122.0923 },
      ],
      type: 'hallway',
    }
    const result = compileTrace(hallway, [existingTrace], [], [])
    const intersectionNodes = result.nodes.filter(
      (n) => n.metadata?.source === 'intersection'
    )
    expect(intersectionNodes.length).toBeGreaterThanOrEqual(1)
  })

  it('generates edges to existing room entrance nodes within proximity', () => {
    const roomNode: NavNode = {
      id: 'N010', name: 'Room 101', type: 'room',
      buildingId: 'BLD01', floor: 1,
      position: { lat: 11.81955, lng: 122.09225 },
    }
    const result = compileTrace(hallway, [], [roomNode], [])
    const hasRoomConnection = result.edges.some(
      (e) => e.to === 'N010' || e.from === 'N010'
    )
    expect(hasRoomConnection).toBe(true)
  })

  it('does not duplicate existing edges', () => {
    const firstResult = compileTrace(hallway, [], [], [])
    const firstEdge = firstResult.edges[0]
    const existingEdges: NavEdge[] = [firstEdge]
    const secondResult = compileTrace(hallway, [], [], existingEdges)
    const duplicateCount = secondResult.edges.filter(
      (e) => e.from === firstEdge.from && e.to === firstEdge.to
    ).length
    expect(duplicateCount).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `compileTrace` not defined

- [ ] **Step 3: Write `src/engine/trace-compiler.ts`**

```typescript
import type { TracePath, NavNode, NavEdge, LatLng } from '../types/nav-types'
import { findLineIntersections, findEndpointNodes, findProximityConnections } from './intersection-engine'

export interface CompileTraceResult {
  nodes: NavNode[]
  edges: NavEdge[]
}

let _idCounter = 0
function genId(prefix: string): string {
  _idCounter++
  return `${prefix}${String(_idCounter).padStart(4, '0')}`
}

function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const aVal =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng * sinDLng
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal))
}

function pointToLatLng(pt: LatLng): string {
  return `${pt.lat.toFixed(6)},${pt.lng.toFixed(6)}`
}

export function compileTrace(
  trace: TracePath,
  existingTraces: TracePath[],
  existingNodes: NavNode[],
  existingEdges: NavEdge[],
  roomNodes?: NavNode[]
): CompileTraceResult {
  const nodes: NavNode[] = []
  const edges: NavEdge[] = []
  const generatedNodePositions = new Set<string>()

  // 1. Find all node positions
  const nodePositions: LatLng[] = []

  // Endpoints of this trace
  const endpoints = findEndpointNodes(trace)
  for (const ep of endpoints) {
    const key = pointToLatLng(ep)
    if (!generatedNodePositions.has(key)) {
      nodePositions.push(ep)
      generatedNodePositions.add(key)
    }
  }

  // All trace points
  for (const pt of trace.points) {
    const key = pointToLatLng(pt)
    if (!generatedNodePositions.has(key)) {
      nodePositions.push(pt)
      generatedNodePositions.add(key)
    }
  }

  // Intersections with other traces
  for (const other of existingTraces) {
    const intersections = findLineIntersections(trace.points, other.points)
    for (const inter of intersections) {
      const key = pointToLatLng(inter)
      if (!generatedNodePositions.has(key)) {
        nodePositions.push({ lat: inter.lat, lng: inter.lng })
        generatedNodePositions.add(key)
      }
    }
  }

  // 2. Create nodes
  const nodeMap = new Map<string, NavNode>()
  for (const pos of nodePositions) {
    const id = genId('N')
    const node: NavNode = {
      id,
      name: `${trace.name ?? 'Path'} Node`,
      type: 'intersection',
      buildingId: trace.buildingId,
      floor: trace.floor,
      position: pos,
    }
    nodeMap.set(pointToLatLng(pos), node)
    nodes.push(node)
  }

  // 3. Create edges between consecutive trace points
  for (let i = 0; i < trace.points.length - 1; i++) {
    const fromKey = pointToLatLng(trace.points[i])
    const toKey = pointToLatLng(trace.points[i + 1])
    const fromNode = nodeMap.get(fromKey)
    const toNode = nodeMap.get(toKey)
    if (fromNode && toNode) {
      const edgeExists = existingEdges.some(
        (e) => (e.from === fromNode.id && e.to === toNode.id) ||
               (e.from === toNode.id && e.to === fromNode.id)
      )
      if (!edgeExists && fromNode.id !== toNode.id) {
        edges.push({
          id: genId('E'),
          from: fromNode.id,
          to: toNode.id,
          type: 'walk',
          distance: haversine(fromNode.position, toNode.position),
        })
      }
    }
  }

  // 4. Connect to nearby room nodes
  const allRoomNodes = [...(roomNodes ?? []), ...existingNodes.filter(n => n.type === 'room')]
  for (const node of nodes) {
    const nearbyRooms = findProximityConnections(node.position, allRoomNodes.map(n => n.position), 10)
    for (const roomPos of nearbyRooms) {
      const roomNode = allRoomNodes.find(
        (n) => n.position.lat === roomPos.lat && n.position.lng === roomPos.lng
      )
      if (roomNode) {
        const edgeExists = existingEdges.some(
          (e) => (e.from === node.id && e.to === roomNode.id) ||
                 (e.from === roomNode.id && e.to === node.id)
        )
        if (!edgeExists) {
          edges.push({
            id: genId('E'),
            from: node.id,
            to: roomNode.id,
            type: 'transition',
            distance: haversine(node.position, roomNode.position),
          })
        }
      }
    }
  }

  return { nodes, edges }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/trace-compiler.ts src/engine/__tests__/trace-compiler.test.ts
git commit -m "feat: add trace compiler for polyline-to-graph conversion"
```
