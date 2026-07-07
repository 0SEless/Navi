### Task 2: Fix `removeTrace` for Shared Junction Nodes

**Files:**
- Modify: `navi-next/src/engine/graph.ts`
- Create: `navi-next/src/engine/__tests__/graph-remove-trace.test.ts`

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
