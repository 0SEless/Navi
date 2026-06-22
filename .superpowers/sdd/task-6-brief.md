### Task 6: Extend Graph Store for Studio Operations

**Files:**
- Modify: `src/store/graph-store.ts`

**Context:** The graph store wraps the `Graph` class with Zustand reactivity. It already has `addComponent` which calls `compileComponent` but doesn't preserve the polygon. You need to add trace operations and fix polygon persistence.

- [ ] **Step 1: Read current `src/store/graph-store.ts`**

- [ ] **Step 2: Update to add trace and polygon room actions**

Changes needed:

**a) Add `TracePath` to imports:**
```typescript
import type { NavNode, NavEdge, Building, Component, GraphSnapshot, TracePath } from '../types/nav-types'
```

**b) Add to `GraphState` interface:**
```typescript
addTrace: (trace: TracePath) => void
removeTrace: (id: string) => void
addComponentWithPolygon: (component: Component) => void
```

**c) Update existing `addComponent` to preserve polygon:**
Change line 111 from `graph.addComponent(component)` to:
```typescript
graph.addComponent({ ...component, polygon: result.polygon ?? component.polygon })
```

**d) Add new store methods inside the store object:**
```typescript
addTrace: (trace) => {
  const roomNodes = get().graph.nodes.filter(n => n.type === 'room')
  get().graph.addTraceWithCompile(trace, roomNodes)
  set({})
},

removeTrace: (id) => {
  get().graph.removeTrace(id)
  set({})
},

addComponentWithPolygon: (component) => {
  const graph = get().graph
  const buildingsMap = new Map(graph.buildings.map((b) => [b.id, b]))
  const result = compileComponent(component, {
    buildings: buildingsMap,
    existingNodes: graph.nodes,
    existingEdges: graph.edges,
    componentId: component.id,
  })
  graph.addComponent({ ...component, polygon: result.polygon ?? component.polygon })
  for (const node of result.nodes) {
    graph.addNode(node)
  }
  for (const edge of result.edges) {
    graph.addEdge(edge)
  }
  set({})
},
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/store/graph-store.ts
git commit -m "feat: extend graph store with trace and polygon room operations"
```
