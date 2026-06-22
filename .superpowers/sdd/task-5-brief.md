### Task 5: Extend Graph Class with Trace Operations

**Files:**
- Modify: `src/engine/graph.ts`
- Test: `src/engine/__tests__/graph.test.ts`

**Context:** `GraphSnapshot` currently lacks `traces` field. Need to add trace CRUD + serialization.

- [ ] **Step 1: Read current `src/engine/graph.ts` and `src/engine/__tests__/graph.test.ts`**

- [ ] **Step 2: Add trace operations tests to existing `graph.test.ts`**

Append these tests (after the last `describe` block):

```typescript
import type { TracePath } from '@/types/nav-types'

describe('Graph trace operations', () => {
  let graph: Graph

  beforeEach(() => {
    graph = new Graph()
  })

  it('adds and retrieves traces', () => {
    const trace: TracePath = {
      id: 'T001', floor: 0,
      points: [{ lat: 11.8195, lng: 122.0922 }, { lat: 11.8196, lng: 122.0923 }],
      type: 'hallway',
    }
    graph.addTrace(trace)
    expect(graph.traces).toHaveLength(1)
    expect(graph.getTrace('T001')?.id).toBe('T001')
  })

  it('removes trace and its generated nodes/edges', () => {
    const trace: TracePath = {
      id: 'T001', floor: 0,
      points: [{ lat: 11.8195, lng: 122.0922 }, { lat: 11.8196, lng: 122.0923 }],
      type: 'hallway',
    }
    graph.addTraceWithCompile(trace, [])
    expect(graph.traces).toHaveLength(1)
    const nodeCount = graph.nodes.length
    graph.removeTrace('T001')
    expect(graph.traces).toHaveLength(0)
    expect(graph.nodes.length).toBeLessThan(nodeCount)
  })

  it('sets edges with new edge types', () => {
    graph.addNode({ id: 'N001', name: 'A', type: 'intersection', floor: 0, position: { lat: 0, lng: 0 } })
    graph.addNode({ id: 'N002', name: 'B', type: 'intersection', floor: 0, position: { lat: 0, lng: 1 } })
    graph.addEdge({ id: 'E001', from: 'N001', to: 'N002', type: 'walk', distance: 100 })
    const edge = graph.getEdge('E001')
    expect(edge?.type).toBe('walk')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — trace operations not defined on Graph

- [ ] **Step 4: Add trace operations to `Graph` class**

Add import:
```typescript
import type { TracePath } from '../types/nav-types'
import { compileTrace } from './trace-compiler'
```

In the class body, add `_traces` map and operations:

```typescript
private _traces: Map<string, TracePath> = new Map()

// ---- Trace Operations ----

get traces(): TracePath[] {
  return Array.from(this._traces.values())
}

getTrace(id: string): TracePath | undefined {
  return this._traces.get(id)
}

addTrace(trace: TracePath): void {
  this._traces.set(trace.id, trace)
}

removeTrace(id: string): void {
  this._traces.delete(id)
  for (const node of this.nodes) {
    if (node.metadata?.traceId === id) {
      this._nodes.delete(node.id)
    }
  }
  for (const [eid, edge] of this._edges) {
    if (!this._nodes.has(edge.from) || !this._nodes.has(edge.to)) {
      this._edges.delete(eid)
    }
  }
}

addTraceWithCompile(
  trace: TracePath,
  roomNodes: NavNode[]
): void {
  const existingTraces = this.traces
  const result = compileTrace(
    trace,
    existingTraces,
    this.nodes,
    this.edges,
    roomNodes
  )
  this.addTrace(trace)
  for (const node of result.nodes) {
    node.metadata = { ...node.metadata, traceId: trace.id }
    this.addNode(node)
  }
  for (const edge of result.edges) {
    this.addEdge(edge)
  }
}

setTraces(traces: TracePath[]): void {
  this._traces.clear()
  for (const t of traces) this._traces.set(t.id, t)
}
```

**IMPORTANT:** `GraphSnapshot` is defined in `src/types/nav-types.ts` (line 125). Add `traces?: TracePath[]` field to the interface there. Also ensure `TracePath` is imported there if not already.

```typescript
// In src/types/nav-types.ts, add traces to GraphSnapshot:
export interface GraphSnapshot {
  version: string
  campusId: string
  buildings: Building[]
  nodes: NavNode[]
  edges: NavEdge[]
  components: Component[]
  traces?: TracePath[]
  exportedAt: string
}
```

Update `toJSON`:
```typescript
toJSON(): GraphSnapshot {
  return {
    version: '1.0.0',
    campusId: 'asu-ibajay',
    buildings: this.buildings,
    nodes: this.nodes,
    edges: this.edges,
    components: this.components,
    traces: this.traces,
    exportedAt: new Date().toISOString(),
  }
}
```

Update `fromJSON`:
```typescript
static fromJSON(snapshot: GraphSnapshot): Graph {
  const graph = new Graph()
  graph.setBuildings(snapshot.buildings)
  graph.setNodes(snapshot.nodes)
  graph.setEdges(snapshot.edges)
  graph.setComponents(snapshot.components ?? [])
  graph.setTraces(snapshot.traces ?? [])
  return graph
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/engine/graph.ts src/engine/__tests__/graph.test.ts
git commit -m "feat: extend Graph with trace operations and new edge types"
```
