# Route System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the hierarchical route system with auto-connect, vertex editing UX fixes, shared junction node lifecycle, and proper layer visibility toggling.

**Architecture:** The route system uses `TracePath` as the data model (arterial/connector type, manual width, colored points). Routes compile into graph nodes via `compileTrace()` and auto-connect via `syncTraceIntersections()` which creates shared junction nodes with `traceIds[]`. Vertex editing uses a separate overlay layer system (`useVertexEditor`) with GeoJSON sources for vertices/midpoints/edges.

**Tech Stack:** Next.js (App Router), Zustand, MapLibre GL JS, TypeScript

## Global Constraints

- All `TracePath` mutations must call `recompileTrace` + `syncTraceIntersections`
- `feature-state` is MapLibre's mechanism for highlight — using `setFeatureState({ source, id }, { selected: true/false })`
- `promoteId: 'id'` is set on GeoJSON sources for feature-state to work
- `routeWidth` stored in studio-store, clamped 2–24 via `Math.max(2, Math.min(24, width))`
- All GeoJSON `setData()` calls clear `feature-state` — must be re-applied after `syncAllData`

---
### Task 1: Fix Vertex Editor Bugs (midpoint filter + handle size)

**Files:**
- Modify: `navi-next/src/components/studio/useVertexEditor.ts`

**Interfaces:**
- Consumes: same `useVertexEditor(map, trace, onSave)` API
- Produces: vertex handles visible at 8px+, midpoint circles at correct positions, midpoint click adds vertex

Current state of the vertex layers:

| Layer | Filter (current) | What it actually shows | What it SHOULD show |
|-------|-------------------|----------------------|---------------------|
| `VERTEX_MIDPOINT_LAYER` | `['==', ['get', 'segment'], -1]` | Vertices (segment === -1) | Midpoints (segment !== -1) |
| `VERTEX_LAYER` | none | All features | Vertices only |

The vertex circles are 2.5px at zoom 15 — too small to click. Need 8px.

- [ ] **Step 1: Fix VERTEX_MIDPOINT_LAYER filter and enlarge handles**

In `useVertexEditor.ts`, replace the two `map.addLayer` calls in `addVertexLayers` (lines 48–50):

**Old (lines 48–50):**
```ts
map.addLayer({ id: VERTEX_EDGE_LAYER, type: 'line', source: VERTEX_SOURCE, paint: { 'line-color': '#F59E0B', 'line-width': 2, 'line-dasharray': [2, 2] } })
map.addLayer({ id: VERTEX_MIDPOINT_LAYER, type: 'circle', source: VERTEX_SOURCE, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 1.5, 20, 4], 'circle-color': '#94A3B8', 'circle-stroke-width': 1, 'circle-stroke-color': '#1E293B', 'circle-opacity': 0.6 }, filter: ['==', ['get', 'segment'], -1] })
map.addLayer({ id: VERTEX_LAYER, type: 'circle', source: VERTEX_SOURCE, paint: {     'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, ['case', ['boolean', ['get', 'selected'], false], 4, 2.5], 20, ['case', ['boolean', ['get', 'selected'], false], 8, 6]], 'circle-color': '#F59E0B', 'circle-stroke-width': 2, 'circle-stroke-color': '#1E293B' } })
```

**New:**
```ts
map.addLayer({ id: VERTEX_EDGE_LAYER, type: 'line', source: VERTEX_SOURCE, paint: { 'line-color': '#F59E0B', 'line-width': 2, 'line-dasharray': [2, 2] } })
map.addLayer({ id: VERTEX_MIDPOINT_LAYER, type: 'circle', source: VERTEX_SOURCE, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 3, 20, 6], 'circle-color': '#94A3B8', 'circle-stroke-width': 1, 'circle-stroke-color': '#1E293B', 'circle-opacity': 0.6 }, filter: ['!=', ['get', 'segment'], -1] })
map.addLayer({ id: VERTEX_LAYER, type: 'circle', source: VERTEX_SOURCE, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, ['case', ['boolean', ['get', 'selected'], false], 12, 8], 20, ['case', ['boolean', ['get', 'selected'], false], 18, 14]], 'circle-color': '#F59E0B', 'circle-stroke-width': 2, 'circle-stroke-color': '#1E293B' }, filter: ['==', ['get', 'segment'], -1] })
```

Changes:
1. `VERTEX_MIDPOINT_LAYER` filter: `['==', ...]` → `['!=', ...]` — now shows midpoints, not vertices
2. `VERTEX_MIDPOINT_LAYER` radius: `1.5 → 3` at zoom 15, `4 → 6` at zoom 20
3. `VERTEX_LAYER` filter: added `filter: ['==', ['get', 'segment'], -1]` — now shows only vertices, not midpoints
4. `VERTEX_LAYER` radius: unselected `2.5 → 8` at zoom 15, `6 → 14` at zoom 20; selected `4 → 12` at zoom 15, `8 → 18` at zoom 20

- [ ] **Step 2: Verify the build compiles**

Run: `cd navi-next && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add navi-next/src/components/studio/useVertexEditor.ts
git commit -m "fix(route): fix vertex midpoint filter and enlarge handles to 8px"
```

---
### Task 2: Fix `removeTrace` for Shared Junction Nodes

**Files:**
- Modify: `navi-next/src/engine/graph.ts`

**Interfaces:**
- Consumes: `Graph.removeTrace(id)` currently deletes all nodes with `metadata.traceId === id`, ignoring `traceIds[]`
- Produces: `Graph.removeTrace(id)` removes the trace's ID from shared nodes' `traceIds[]`, only deletes a node when no other routes reference it

Current `removeTrace` (lines 203–218) has a bug: it only checks `node.metadata?.traceId === id`, which won't match nodes created by `syncTraceIntersections` that use `metadata.traceIds[]`. It also deletes fully-owned nodes even when another route still references them.

- [ ] **Step 1: Write the failing test**

Create `navi-next/src/engine/__tests__/graph-remove-trace.test.ts`:
```ts
import { Graph } from '../graph'
import type { TracePath, NavNode } from '@/types/nav-types'

function makeGraph(): Graph {
  const g = new Graph()
  g.campusId = 'test-campus'
  return g
}

function makeTrace(overrides: Partial<TracePath> = {}): TracePath {
  return {
    id: 'trace-1',
    name: 'Test Path',
    floor: 0,
    points: [
      { lat: 10, lng: 20 },
      { lat: 10.001, lng: 20.001 },
    ],
    type: 'arterial',
    ...overrides,
  }
}

describe('Graph.removeTrace', () => {
  it('should not delete nodes shared with other traces', () => {
    const g = makeGraph()
    const sharedNode: NavNode = {
      id: 'shared-node',
      label: 'Junction',
      name: 'Junction',
      type: 'intersection',
      buildingId: '',
      campusId: '',
      floor: 0,
      position: { lat: 10.0005, lng: 20.0005 },
      metadata: { traceIds: ['trace-1', 'trace-2'], connectionNode: true },
    }
    const ownedNode: NavNode = {
      id: 'owned-node',
      label: 'Path Node',
      name: 'Path Node',
      type: 'intersection',
      buildingId: '',
      campusId: '',
      floor: 0,
      position: { lat: 10, lng: 20 },
      metadata: { traceId: 'trace-1' },
    }
    g.addNode(sharedNode)
    g.addNode(ownedNode)
    g.addTrace(makeTrace())
    g.addTrace(makeTrace({ id: 'trace-2' }))

    g.removeTrace('trace-1')

    // shared node should still exist (referenced by trace-2)
    expect(g.getNode('shared-node')).toBeDefined()
    // owned node should be deleted
    expect(g.getNode('owned-node')).toBeUndefined()
    // shared node's traceIds should no longer contain trace-1
    const remaining = g.getNode('shared-node')!
    const traceIds = remaining.metadata?.traceIds as string[]
    expect(traceIds).toEqual(['trace-2'])
  })

  it('should delete shared node when last reference is removed', () => {
    const g = makeGraph()
    const node: NavNode = {
      id: 'node',
      label: 'Junction',
      name: 'Junction',
      type: 'intersection',
      buildingId: '',
      campusId: '',
      floor: 0,
      position: { lat: 10, lng: 20 },
      metadata: { traceIds: ['trace-1'], connectionNode: true },
    }
    g.addNode(node)
    g.addTrace(makeTrace())

    g.removeTrace('trace-1')

    expect(g.getNode('node')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd navi-next && npx vitest run src/engine/__tests__/graph-remove-trace.test.ts`
Expected: Tests fail (removeTrace doesn't handle traceIds)

- [ ] **Step 3: Fix `removeTrace` in `graph.ts`**

Replace lines 203–218 with:
```ts
removeTrace(id: string): void {
    this._traces.delete(id)
    const nodesToDelete: string[] = []

    for (const [nid, node] of this._nodes) {
      const meta = node.metadata as Record<string, unknown> | undefined
      if (!meta) continue

      const metaTraceId = meta.traceId as string | undefined
      const metaTraceIds = meta.traceIds as string[] | undefined

      if (metaTraceIds?.includes(id)) {
        // Shared intersection node — remove this trace's ID
        const remaining = metaTraceIds.filter(tid => tid !== id)
        if (remaining.length > 0) {
          node.metadata = { ...meta, traceIds: remaining }
        } else {
          nodesToDelete.push(nid)
        }
      } else if (metaTraceId === id && !metaTraceIds?.length) {
        // Fully owned node (only has traceId, no traceIds array)
        nodesToDelete.push(nid)
      }
    }

    for (const nid of nodesToDelete) {
      this._nodes.delete(nid)
    }

    for (const [eid, edge] of this._edges) {
      if (!this._nodes.has(edge.from) || !this._nodes.has(edge.to)) {
        this._edges.delete(eid)
      }
    }

    this._cachedTraces = null
    this._cachedNodes = null
    this._cachedEdges = null
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd navi-next && npx vitest run src/engine/__tests__/graph-remove-trace.test.ts`
Expected: Both tests PASS

- [ ] **Step 5: Commit**

```bash
git add navi-next/src/engine/graph.ts navi-next/src/engine/__tests__/graph-remove-trace.test.ts
git commit -m "fix(route): removeTrace handles shared junction nodes via traceIds"
```

---
### Task 3: Auto-toggle Node/Edge Layers During Vertex Editing

**Files:**
- Modify: `navi-next/src/components/studio/StudioCanvas.tsx`

**Interfaces:**
- Consumes: `useStudioStore.isVertexEditing`, `useStudioStore.layers`, `useStudioStore.setLayers`
- Produces: NODES/NODES_CONNECTION layers auto-shown during vertex editing, auto-restored on exit

When the user enters vertex editing (`setVertexEditing('trace', id)`), the node layers should appear. On exit, they should return to their previous visibility state.

- [ ] **Step 1: Add auto-layer effect in StudioCanvas.tsx**

Add after the existing layer visibility effect (after line 654):
```tsx
// Auto-show node layers during vertex editing
useEffect(() => {
  const map = mapRef.current
  if (!map || !readyRef.current) return

  const setVis = (layerId: string, visible: boolean) => {
    try { map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none') } catch { /* ok */ }
  }

  if (isVertexEditing) {
    setVis(LYR.NODES, true)
    setVis(LYR.NODES_CONNECTION, true)
  } else {
    // Restore to user's layer preference
    setVis(LYR.NODES, layers.nodes)
    setVis(LYR.NODES_CONNECTION, layers.nodes)
  }
}, [isVertexEditing, mapInstance])
```

You'll need to add `isVertexEditing` to the subscriptions at the top of the component. Add `const isVertexEditing = useStudioStore((s) => s.isVertexEditing)` near the other store subscriptions (around line 238).

- [ ] **Step 2: Verify build compiles**

Run: `cd navi-next && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add navi-next/src/components/studio/StudioCanvas.tsx
git commit -m "feat(route): auto-show node layers during vertex editing"
```

---
### Task 4: Route Endpoint Extend via Drag

**Files:**
- Modify: `navi-next/src/components/studio/useVertexEditor.ts`

**Interfaces:**
- Consumes: `useVertexEditor.onSave(points: LatLng[])` — called on drag end
- Produces: dragging an endpoint vertex (index 0 or last) outward beyond the adjacent point appends a new segment instead of moving the point

Detection logic: When the dragged endpoint's distance to the adjacent point increases (compared to pre-drag), it's an extend. When it decreases, it's a normal move.

- [ ] **Step 1: Add extend detection in useVertexEditor**

In the `handleMouseDown` handler, store the original adjacent point position to compare later. In `handleMouseMove`, detect extend for endpoints.

Modify `useVertexEditor` to track the pre-drag adjacent positions:

Add after `const dragStartRef = useRef<LatLng | null>(null)` (line 62):
```ts
const dragOriginalsRef = useRef<{ adjacentPoint?: LatLng; isEndpoint: boolean }>({ isEndpoint: false })
```

In `handleMouseDown` (line 144–150), after setting `selectedIdxRef.current`:
```ts
dragOriginalsRef.current = {
  isEndpoint: idx === 0 || idx === pointsRef.current.length - 1,
  adjacentPoint: idx === 0 && pointsRef.current.length > 1
    ? { ...pointsRef.current[1] }
    : idx === pointsRef.current.length - 1 && pointsRef.current.length > 1
      ? { ...pointsRef.current[pointsRef.current.length - 2] }
      : undefined,
}
```

Modify `handleMouseMove` (around line 152–159) for endpoint extend:
```ts
const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
  if (selectedIdxRef.current == null || !dragStartRef.current) return
  const idx = selectedIdxRef.current
  const { isEndpoint, adjacentPoint } = dragOriginalsRef.current

  if (isEndpoint && adjacentPoint) {
    const distToAdj = haversine(
      { lat: e.lngLat.lat, lng: e.lngLat.lng },
      adjacentPoint
    )
    const originalDist = haversine(
      dragStartRef.current,
      adjacentPoint
    )
    if (distToAdj > originalDist * 1.1) {
      // Extend: keep original endpoint, append new point
      const newPoints = [...pointsRef.current]
      const insertAt = idx === 0 ? 0 : newPoints.length
      newPoints.splice(insertAt, 0, { lat: e.lngLat.lat, lng: e.lngLat.lng })
      pointsRef.current = newPoints
      selectedIdxRef.current = insertAt
      updateDisplay(newPoints, insertAt)
      return
    }
  }

  // Normal move
  const newPoints = [...pointsRef.current]
  newPoints[idx] = { lat: e.lngLat.lat, lng: e.lngLat.lng }
  pointsRef.current = newPoints
  updateDisplay(newPoints, idx)
}
```

The `haversine` function needs to be available. Import it from `@/engine/geo-utils`:
Add at top of file: `import { haversine } from '@/engine/geo-utils'`

- [ ] **Step 2: Verify build compiles**

Run: `cd navi-next && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add navi-next/src/components/studio/useVertexEditor.ts
git commit -m "feat(route): endpoint drag extends route instead of moving vertex"
```

---
## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| Fix inverted VERTEX_MIDPOINT_LAYER filter | T1 |
| Enlarge vertex handles to ~8px | T1 |
| Hide/auto-show node layers during vertex editing | T3 |
| `removeTrace` handles `traceIds[]` for shared junction nodes | T2 |
| Route endpoint extend via drag | T4 |
| Right-click delete vertex | Already works (lines 166–178) |
| Midpoint click to add vertex | Already works (lines 119–132, filter fix in T1) |
| `syncTraceIntersections` | Already implemented |
| `recompileTrace` | Already implemented |
| NodePropertiesPanel | Already implemented |
| Route width slider (2–24) | Already implemented in store |
