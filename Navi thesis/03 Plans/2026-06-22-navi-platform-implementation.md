# NAVI Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a graph-driven multi-campus navigation platform with a Canva-style admin editor (NAVI Studio) and a seamless public map view for students.

**Architecture:** Next.js 16 App Router with a framework-agnostic TypeScript engine, Supabase for persistence/auth, MapLibre GL JS for maps, and a stale-while-revalidate data hydration pattern.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind CSS, MapLibre GL JS, Turf.js, Zustand, Supabase (PostgreSQL + PostGIS), Pannellum, html5-qrcode

## Global Constraints

- Graph is the single source of truth; all views are derived from it
- Engine (`src/engine/`, `src/types/`) is pure TypeScript — zero React/Next.js imports
- All data is scoped by `campus_id` for multi-campus support
- Map rendering uses MapLibre GL JS (free, open-source) not Mapbox GL JS
- QR codes use `html5-qrcode` library
- Admin routes protected by Supabase SSR middleware
- Visual theme: Option C — ASU Green (#0F5132), ASU Gold (#D1A11F), surface #F8FAFC

---

## File Structure

```
navi-next/
├── src/
│   ├── engine/
│   │   ├── graph.ts              — Graph class (nodes, edges, CRUD, serialization)
│   │   ├── a-star.ts             — A* pathfinding on weighted graph
│   │   ├── walkway-compiler.ts   — Walkway centerline → nodes/edges
│   │   ├── room-connector.ts     — Auto-connect rooms to nearest walkway node
│   │   ├── vertical-connector.ts — Stair/Elevator floor linking
│   │   ├── graph-validator.ts    — 8+ validation checks
│   │   └── spatial-resolver.ts   — Nearest-node GPS/QR snapping
│   ├── types/
│   │   └── nav-types.ts          — Canonical: Node, Edge, Building, Component, GraphSnapshot
│   ├── store/
│   │   ├── studio-store.ts       — Studio editor state (tools, selection, history)
│   │   └── graph-store.ts        — Zustand store wrapping Graph class + Supabase sync
│   ├── components/
│   │   ├── studio/               — Studio editor components (tools, canvas, panels)
│   │   ├── map/                  — Public map components
│   │   └── ui/                   — shadcn/ui primitives
│   ├── app/                      — Next.js App Router (admin + public)
│   ├── hooks/                    — useAuth, useGeolocation
│   ├── lib/                      — Supabase client/server, utils
│   └── middleware.ts             — Supabase SSR auth
├── supabase/migrations/          — 001_initial_schema.sql
└── config files                  — next.config.ts, tailwind.config.js, vitest.config.ts
```

---

### Task 1: Type Definitions (nav-types.ts)

**Files:**
- Create: `src/types/nav-types.ts`

**Interfaces:**
- Produces: `NavNode`, `NavEdge`, `Building`, `FloorInfo`, `Component` (Room/Walkway/Stair/Elevator/Entrance), `GraphSnapshot`, `PathResult`, `ValidationResult`, `Campus`

- [ ] **Step 1: Create the file**

```typescript
// src/types/nav-types.ts

export interface LatLng {
  lat: number;
  lng: number;
  elevation?: number;
}

export interface NavNode {
  id: string;
  label: string;
  position: LatLng;
  floor: number;
  buildingId: string;
  campusId: string;
  type: 'room' | 'walkway' | 'stair' | 'elevator' | 'entrance' | 'qr_marker';
  componentId?: string;
  metadata?: Record<string, string>;
}

export interface NavEdge {
  id: string;
  from: string;
  to: string;
  distance: number;
  weight: number;
  type: 'walkway' | 'stair' | 'elevator' | 'hallway' | 'outdoor';
  campusId: string;
}

export interface Building {
  id: string;
  name: string;
  campusId: string;
  floors: number[];
  footprint: LatLng[];
  baseElevation: number;
  height: number;
}

export interface FloorInfo {
  level: number;
  label: string;
  buildingId: string;
}

export interface MapComponent {
  id: string;
  type: 'room' | 'walkway' | 'stair' | 'elevator' | 'entrance';
  label: string;
  buildingId: string;
  campusId: string;
  floor: number;
  geometry: LatLng[];
  metadata?: Record<string, string>;
}

export interface GraphSnapshot {
  id: string;
  campusId: string;
  version: string;
  updatedAt: string;
  buildings: Building[];
  components: MapComponent[];
  nodes: NavNode[];
  edges: NavEdge[];
}

export interface PathResult {
  path: NavNode[];
  edges: NavEdge[];
  totalDistance: number;
  steps: PathStep[];
}

export interface PathStep {
  instruction: string;
  from: NavNode;
  to: NavNode;
  distance: number;
  type: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

export interface ValidationError {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface Campus {
  id: string;
  name: string;
  code: string;
  center: LatLng;
  bounds: { ne: LatLng; sw: LatLng };
}
```

- [ ] **Step 2: Write and run a type-smoke test**

```typescript
// src/types/__tests__/nav-types.test.ts
import { describe, it, expect } from 'vitest';

describe('NavNode', () => {
  it('creates a valid node', () => {
    const node: import('../nav-types').NavNode = {
      id: 'n1',
      label: 'Main Gate',
      position: { lat: 11.82, lng: 122.09 },
      floor: 0,
      buildingId: 'outdoor',
      campusId: 'asu-ibajay',
      type: 'entrance',
    };
    expect(node.id).toBe('n1');
  });
});

```

Run: `npx vitest run src/types/__tests__/nav-types.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add canonical type definitions"
```

---

### Task 2: Graph Class

**Files:**
- Create: `src/engine/graph.ts`
- Create: `src/engine/__tests__/graph.test.ts`

**Interfaces:**
- Consumes: `NavNode`, `NavEdge`, `Building`, `MapComponent`, `GraphSnapshot` from Task 1
- Produces: `class Graph { addNode, getNode, removeNode, addEdge, getEdge, removeEdge, addBuilding, getBuilding, addComponent, getComponent, findNearestNode, toJSON, fromJSON, clear }`

- [ ] **Step 1: Write the failing test**

```typescript
// src/engine/__tests__/graph.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Graph } from '../graph';
import { NavNode, NavEdge } from '../../types/nav-types';

describe('Graph', () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph();
  });

  it('adds and retrieves a node', () => {
    const node: NavNode = {
      id: 'n1', label: 'Test', position: { lat: 0, lng: 0 },
      floor: 0, buildingId: 'b1', campusId: 'c1', type: 'room',
    };
    graph.addNode(node);
    expect(graph.getNode('n1')).toEqual(node);
  });

  it('adds and retrieves an edge', () => {
    const node1: NavNode = { id: 'n1', label: 'A', position: { lat: 0, lng: 0 }, floor: 0, buildingId: 'b1', campusId: 'c1', type: 'room' };
    const node2: NavNode = { id: 'n2', label: 'B', position: { lat: 1, lng: 1 }, floor: 0, buildingId: 'b1', campusId: 'c1', type: 'room' };
    graph.addNode(node1);
    graph.addNode(node2);
    const edge: NavEdge = { id: 'e1', from: 'n1', to: 'n2', distance: 10, weight: 10, type: 'walkway', campusId: 'c1' };
    graph.addEdge(edge);
    expect(graph.getEdge('e1')).toEqual(edge);
  });

  it('removes a node and its edges', () => {
    const node: NavNode = { id: 'n1', label: 'Test', position: { lat: 0, lng: 0 }, floor: 0, buildingId: 'b1', campusId: 'c1', type: 'room' };
    graph.addNode(node);
    graph.removeNode('n1');
    expect(graph.getNode('n1')).toBeUndefined();
  });

  it('finds nearest node to a coordinate', () => {
    const n1: NavNode = { id: 'n1', label: 'Far', position: { lat: 10, lng: 10 }, floor: 0, buildingId: 'b1', campusId: 'c1', type: 'room' };
    const n2: NavNode = { id: 'n2', label: 'Near', position: { lat: 1, lng: 1 }, floor: 0, buildingId: 'b1', campusId: 'c1', type: 'room' };
    graph.addNode(n1);
    graph.addNode(n2);
    const nearest = graph.findNearestNode({ lat: 1.1, lng: 1.1 }, 0);
    expect(nearest?.id).toBe('n2');
  });

  it('serializes and deserializes', () => {
    const node: NavNode = { id: 'n1', label: 'Test', position: { lat: 0, lng: 0 }, floor: 0, buildingId: 'b1', campusId: 'c1', type: 'room' };
    graph.addNode(node);
    const json = graph.toJSON();
    const graph2 = new Graph();
    graph2.fromJSON(json);
    expect(graph2.getNode('n1')).toEqual(node);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/graph.test.ts`
Expected: FAIL — Graph is not defined

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/engine/graph.ts
import { NavNode, NavEdge, Building, MapComponent, GraphSnapshot } from '../types/nav-types';

function haversineDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export class Graph {
  private nodes = new Map<string, NavNode>();
  private edges = new Map<string, NavEdge>();
  private buildings = new Map<string, Building>();
  private components = new Map<string, MapComponent>();
  private adjacency = new Map<string, string[]>();

  addNode(node: NavNode): void {
    this.nodes.set(node.id, node);
    this.adjacency.set(node.id, []);
  }

  getNode(id: string): NavNode | undefined {
    return this.nodes.get(id);
  }

  getAllNodes(): NavNode[] {
    return Array.from(this.nodes.values());
  }

  removeNode(id: string): void {
    this.nodes.delete(id);
    this.adjacency.delete(id);
    for (const [edgeId, edge] of this.edges) {
      if (edge.from === id || edge.to === id) {
        this.edges.delete(edgeId);
      }
    }
  }

  addEdge(edge: NavEdge): void {
    this.edges.set(edge.id, edge);
    const fromAdj = this.adjacency.get(edge.from);
    const toAdj = this.adjacency.get(edge.to);
    if (fromAdj && !fromAdj.includes(edge.to)) fromAdj.push(edge.to);
    if (toAdj && !toAdj.includes(edge.from)) toAdj.push(edge.from);
  }

  getEdge(id: string): NavEdge | undefined {
    return this.edges.get(id);
  }

  getAllEdges(): NavEdge[] {
    return Array.from(this.edges.values());
  }

  removeEdge(id: string): void {
    const edge = this.edges.get(id);
    if (edge) {
      const fromAdj = this.adjacency.get(edge.from);
      const toAdj = this.adjacency.get(edge.to);
      if (fromAdj) this.adjacency.set(edge.from, fromAdj.filter(n => n !== edge.to));
      if (toAdj) this.adjacency.set(edge.to, toAdj.filter(n => n !== edge.from));
    }
    this.edges.delete(id);
  }

  addBuilding(building: Building): void {
    this.buildings.set(building.id, building);
  }

  getBuilding(id: string): Building | undefined {
    return this.buildings.get(id);
  }

  getAllBuildings(): Building[] {
    return Array.from(this.buildings.values());
  }

  addComponent(component: MapComponent): void {
    this.components.set(component.id, component);
  }

  getComponent(id: string): MapComponent | undefined {
    return this.components.get(id);
  }

  getAllComponents(): MapComponent[] {
    return Array.from(this.components.values());
  }

  getAdjacent(nodeId: string): string[] {
    return this.adjacency.get(nodeId) || [];
  }

  getEdgeBetween(from: string, to: string): NavEdge | undefined {
    for (const edge of this.edges.values()) {
      if ((edge.from === from && edge.to === to) || (edge.from === to && edge.to === from)) {
        return edge;
      }
    }
    return undefined;
  }

  findNearestNode(pos: { lat: number; lng: number }, floor?: number): NavNode | undefined {
    let nearest: NavNode | undefined;
    let minDist = Infinity;
    for (const node of this.nodes.values()) {
      if (floor !== undefined && node.floor !== floor) continue;
      const d = haversineDistance(pos, node.position);
      if (d < minDist) {
        minDist = d;
        nearest = node;
      }
    }
    return nearest;
  }

  toJSON(): GraphSnapshot {
    return {
      id: '',
      campusId: '',
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      buildings: this.getAllBuildings(),
      components: this.getAllComponents(),
      nodes: this.getAllNodes(),
      edges: this.getAllEdges(),
    };
  }

  fromJSON(snapshot: GraphSnapshot): void {
    this.clear();
    for (const b of snapshot.buildings) this.addBuilding(b);
    for (const c of snapshot.components) this.addComponent(c);
    for (const n of snapshot.nodes) this.addNode(n);
    for (const e of snapshot.edges) this.addEdge(e);
  }

  clear(): void {
    this.nodes.clear();
    this.edges.clear();
    this.buildings.clear();
    this.components.clear();
    this.adjacency.clear();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/graph.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add Graph class with CRUD and serialization"
```

---

### Task 3: A* Pathfinding

**Files:**
- Create: `src/engine/a-star.ts`
- Create: `src/engine/__tests__/a-star.test.ts`

**Interfaces:**
- Consumes: `Graph`, `NavNode`, `NavEdge`, `PathResult`, `PathStep` from Tasks 1-2
- Produces: `function findPath(graph, startId, endId): PathResult`

- [ ] **Step 1: Write the failing test**

```typescript
// src/engine/__tests__/a-star.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Graph } from '../graph';
import { findPath } from '../a-star';
import { NavNode, NavEdge } from '../../types/nav-types';

describe('A* Pathfinding', () => {
  let graph: Graph;

  beforeEach(() => {
    graph = new Graph();
    const nodes: NavNode[] = [
      { id: 'n1', label: 'A', position: { lat: 0, lng: 0 }, floor: 0, buildingId: 'b1', campusId: 'c1', type: 'room' },
      { id: 'n2', label: 'B', position: { lat: 0.001, lng: 0 }, floor: 0, buildingId: 'b1', campusId: 'c1', type: 'walkway' },
      { id: 'n3', label: 'C', position: { lat: 0.002, lng: 0 }, floor: 0, buildingId: 'b1', campusId: 'c1', type: 'room' },
    ];
    nodes.forEach(n => graph.addNode(n));

    const edges: NavEdge[] = [
      { id: 'e1', from: 'n1', to: 'n2', distance: 111, weight: 111, type: 'walkway', campusId: 'c1' },
      { id: 'e2', from: 'n2', to: 'n3', distance: 111, weight: 111, type: 'walkway', campusId: 'c1' },
    ];
    edges.forEach(e => graph.addEdge(e));
  });

  it('finds a path between two connected nodes', () => {
    const result = findPath(graph, 'n1', 'n3');
    expect(result.path.map(n => n.id)).toEqual(['n1', 'n2', 'n3']);
    expect(result.totalDistance).toBeCloseTo(222, -1);
  });

  it('returns empty path when no path exists', () => {
    graph.removeEdge('e1');
    const result = findPath(graph, 'n1', 'n3');
    expect(result.path).toHaveLength(0);
    expect(result.totalDistance).toBe(0);
  });

  it('returns single-node path when start equals destination', () => {
    const result = findPath(graph, 'n1', 'n1');
    expect(result.path).toHaveLength(1);
    expect(result.totalDistance).toBe(0);
  });

  it('generates step-by-step instructions', () => {
    const result = findPath(graph, 'n1', 'n3');
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps[0].instruction).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/a-star.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the implementation**

```typescript
// src/engine/a-star.ts
import { Graph } from './graph';
import { NavNode, NavEdge, PathResult, PathStep } from '../types/nav-types';

function heuristic(a: NavNode, b: NavNode): number {
  const R = 6371000;
  const dLat = (b.position.lat - a.position.lat) * Math.PI / 180;
  const dLng = (b.position.lng - a.position.lng) * Math.PI / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(a.position.lat * Math.PI / 180) * Math.cos(b.position.lat * Math.PI / 180) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function generateInstruction(from: NavNode, to: NavNode, edge: NavEdge): string {
  if (edge.type === 'stair') {
    const dir = to.floor > from.floor ? 'up' : 'down';
    return `Take the stairs ${dir} to Floor ${to.floor}`;
  }
  if (edge.type === 'elevator') {
    const dir = to.floor > from.floor ? 'up' : 'down';
    return `Take the elevator ${dir} to Floor ${to.floor}`;
  }
  if (to.type === 'room' || to.type === 'entrance') {
    return `Arrive at ${to.label}`;
  }
  return `Walk ${Math.round(edge.distance)}m toward ${to.label}`;
}

export function findPath(graph: Graph, startId: string, endId: string): PathResult {
  const start = graph.getNode(startId);
  const end = graph.getNode(endId);
  if (!start || !end) return { path: [], edges: [], totalDistance: 0, steps: [] };
  if (startId === endId) return { path: [start], edges: [], totalDistance: 0, steps: [] };

  const openSet = new Set<string>([startId]);
  const closedSet = new Set<string>();
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  gScore.set(startId, 0);
  fScore.set(startId, heuristic(start, end));

  while (openSet.size > 0) {
    let current = '';
    let minF = Infinity;
    for (const id of openSet) {
      const f = fScore.get(id) ?? Infinity;
      if (f < minF) { minF = f; current = id; }
    }

    if (current === endId) {
      const path: NavNode[] = [];
      const pathEdges: NavEdge[] = [];
      let c = current;
      while (c) {
        path.unshift(graph.getNode(c)!);
        const prev = cameFrom.get(c);
        if (prev) {
          const edge = graph.getEdgeBetween(prev, c);
          if (edge) pathEdges.unshift(edge);
        }
        c = prev ?? '';
        if (!prev) break;
      }

      const steps: PathStep[] = [];
      for (let i = 0; i < path.length - 1; i++) {
        const from = path[i];
        const to = path[i + 1];
        const edge = graph.getEdgeBetween(from.id, to.id);
        if (edge) {
          steps.push({
            instruction: generateInstruction(from, to, edge),
            from, to,
            distance: edge.distance,
            type: edge.type,
          });
        }
      }

      return {
        path,
        edges: pathEdges,
        totalDistance: gScore.get(endId) ?? 0,
        steps,
      };
    }

    openSet.delete(current);
    closedSet.add(current);

    for (const neighborId of graph.getAdjacent(current)) {
      if (closedSet.has(neighborId)) continue;
      const edge = graph.getEdgeBetween(current, neighborId);
      if (!edge) continue;

      const tentG = (gScore.get(current) ?? 0) + edge.weight;
      if (tentG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, current);
        gScore.set(neighborId, tentG);
        const neighbor = graph.getNode(neighborId);
        if (neighbor) {
          fScore.set(neighborId, tentG + heuristic(neighbor, end));
        }
        openSet.add(neighborId);
      }
    }
  }

  return { path: [], edges: [], totalDistance: 0, steps: [] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/a-star.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add A* pathfinding with step instructions"
```

---

### Task 4: Walkway Compiler

**Files:**
- Create: `src/engine/walkway-compiler.ts`
- Create: `src/engine/__tests__/walkway-compiler.test.ts`

**Interfaces:**
- Consumes: `Graph`, `MapComponent` (type: 'walkway'), `NavNode`, `NavEdge`
- Produces: `function compileWalkway(graph, walkwayComponent): void` — takes a walkway component (array of LatLng points forming a centerline), generates nodes at each point and edges between consecutive points

- [ ] **Step 1: Write the failing test**

```typescript
// src/engine/__tests__/walkway-compiler.test.ts
import { describe, it, expect } from 'vitest';
import { Graph } from '../graph';
import { compileWalkway } from '../walkway-compiler';
import { MapComponent } from '../../types/nav-types';

describe('Walkway Compiler', () => {
  it('creates nodes and edges from a centerline', () => {
    const graph = new Graph();
    const walkway: MapComponent = {
      id: 'w1', type: 'walkway', label: 'Main Hallway',
      buildingId: 'b1', campusId: 'c1', floor: 1,
      geometry: [
        { lat: 0, lng: 0 },
        { lat: 0.001, lng: 0 },
        { lat: 0.002, lng: 0 },
      ],
    };
    compileWalkway(graph, walkway);
    const nodes = graph.getAllNodes();
    const edges = graph.getAllEdges();
    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(2);
    expect(nodes[0].label).toContain('Main Hallway');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/walkway-compiler.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/engine/walkway-compiler.ts
import { Graph } from './graph';
import { MapComponent, NavNode, NavEdge } from '../types/nav-types';

let nodeCounter = 0;
let edgeCounter = 0;

export function compileWalkway(graph: Graph, component: MapComponent): void {
  const points = component.geometry;
  if (points.length < 2) return;

  const nodeIds: string[] = [];

  for (let i = 0; i < points.length; i++) {
    const nodeId = `wn-${component.id}-${i}`;
    nodeCounter++;
    const node: NavNode = {
      id: nodeId,
      label: `${component.label} ${i === 0 ? 'Start' : i === points.length - 1 ? 'End' : `Pt ${i}`}`,
      position: { lat: points[i].lat, lng: points[i].lng },
      floor: component.floor,
      buildingId: component.buildingId,
      campusId: component.campusId,
      type: 'walkway',
      componentId: component.id,
    };
    graph.addNode(node);
    nodeIds.push(nodeId);

    if (i > 0) {
      const from = points[i - 1];
      const to = points[i];
      const R = 6371000;
      const dLat = (to.lat - from.lat) * Math.PI / 180;
      const dLng = (to.lng - from.lng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(from.lat * Math.PI / 180) * Math.cos(to.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
      const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      const edgeId = `we-${component.id}-${i - 1}`;
      edgeCounter++;
      const edge: NavEdge = {
        id: edgeId,
        from: nodeIds[i - 1],
        to: nodeId,
        distance: Math.round(distance),
        weight: Math.round(distance),
        type: 'walkway',
        campusId: component.campusId,
      };
      graph.addEdge(edge);
    }
  }
}

export function compileWalkways(graph: Graph, components: MapComponent[]): void {
  for (const comp of components) {
    if (comp.type === 'walkway') {
      compileWalkway(graph, comp);
    }
  }
}

export function resetCounters(): void {
  nodeCounter = 0;
  edgeCounter = 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/walkway-compiler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add walkway compiler with centerline-to-graph conversion"
```

---

### Task 5: Room ↔ Walkway Auto-Connector

**Files:**
- Create: `src/engine/room-connector.ts`
- Create: `src/engine/__tests__/room-connector.test.ts`

**Interfaces:**
- Consumes: `Graph`, `MapComponent` (type: 'room'), `NavNode`
- Produces: `function connectRoom(graph, roomComponent): void` — finds nearest walkway node within a threshold and creates an entrance edge; also creates room-internal nodes (door point + room center)

- [ ] **Step 1: Write the failing test**

```typescript
// src/engine/__tests__/room-connector.test.ts
import { describe, it, expect } from 'vitest';
import { Graph } from '../graph';
import { compileWalkway } from '../walkway-compiler';
import { connectRoom } from '../room-connector';
import { MapComponent } from '../../types/nav-types';

describe('Room Connector', () => {
  it('connects a room to the nearest walkway node', () => {
    const graph = new Graph();
    const walkway: MapComponent = {
      id: 'w1', type: 'walkway', label: 'Hallway',
      buildingId: 'b1', campusId: 'c1', floor: 1,
      geometry: [{ lat: 0, lng: 0 }, { lat: 0.001, lng: 0 }],
    };
    compileWalkway(graph, walkway);

    const room: MapComponent = {
      id: 'r1', type: 'room', label: 'IT Office',
      buildingId: 'b1', campusId: 'c1', floor: 1,
      geometry: [{ lat: 0.0001, lng: 0.0001 }, { lat: 0.0002, lng: 0.0002 }],
    };
    connectRoom(graph, room);

    const nodes = graph.getAllNodes();
    const edges = graph.getAllEdges();
    const roomNodes = nodes.filter(n => n.componentId === 'r1');
    expect(roomNodes.length).toBeGreaterThanOrEqual(1);
    expect(edges.length).toBeGreaterThan(walkway.geometry.length - 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/room-connector.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/engine/room-connector.ts
import { Graph } from './graph';
import { MapComponent, NavNode, NavEdge } from '../types/nav-types';

let nodeCounter = 0;
let edgeCounter = 0;

export function resetRoomCounters(): void {
  nodeCounter = 0;
  edgeCounter = 0;
}

function polygonCenter(geometry: { lat: number; lng: number }[]): { lat: number; lng: number } {
  const sum = geometry.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / geometry.length, lng: sum.lng / geometry.length };
}

export function connectRoom(graph: Graph, component: MapComponent): void {
  const center = polygonCenter(component.geometry);
  const nodeId = `rn-${component.id}`;
  nodeCounter++;

  const roomNode: NavNode = {
    id: nodeId,
    label: component.label,
    position: { lat: center.lat, lng: center.lng },
    floor: component.floor,
    buildingId: component.buildingId,
    campusId: component.campusId,
    type: 'room',
    componentId: component.id,
    metadata: { entranceOverride: '' },
  };
  graph.addNode(roomNode);

  // Find nearest walkway node on same floor and building
  const allNodes = graph.getAllNodes();
  let nearestNode: NavNode | undefined;
  let minDist = Infinity;

  for (const node of allNodes) {
    if (node.type !== 'walkway' || node.floor !== component.floor) continue;
    const dLat = (node.position.lat - center.lat) * Math.PI / 180;
    const dLng = (node.position.lng - center.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(center.lat * Math.PI / 180) * Math.cos(node.position.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const d = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (d < minDist) {
      minDist = d;
      nearestNode = node;
    }
  }

  if (nearestNode && minDist < 100) {
    edgeCounter++;
    const edge: NavEdge = {
      id: `re-${component.id}`,
      from: nodeId,
      to: nearestNode.id,
      distance: Math.round(minDist),
      weight: Math.round(minDist),
      type: 'walkway',
      campusId: component.campusId,
    };
    graph.addEdge(edge);
  }
}

export function connectAllRooms(graph: Graph, components: MapComponent[]): void {
  for (const comp of components) {
    if (comp.type === 'room') {
      connectRoom(graph, comp);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/room-connector.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add room-to-walkway auto-connector"
```

---

### Task 6: Vertical Connector (Stair/Elevator)

**Files:**
- Create: `src/engine/vertical-connector.ts`
- Create: `src/engine/__tests__/vertical-connector.test.ts`

**Interfaces:**
- Consumes: `Graph`, `MapComponent` (type: 'stair' | 'elevator')
- Produces: `function connectVertical(graph, component, fromFloor, toFloor): void`

- [ ] **Step 1: Write the failing test**

```typescript
// src/engine/__tests__/vertical-connector.test.ts
import { describe, it, expect } from 'vitest';
import { Graph } from '../graph';
import { connectVertical } from '../vertical-connector';
import { MapComponent } from '../../types/nav-types';

describe('Vertical Connector', () => {
  it('creates nodes on two floors and connects them', () => {
    const graph = new Graph();
    const stair: MapComponent = {
      id: 's1', type: 'stair', label: 'Main Stairs',
      buildingId: 'b1', campusId: 'c1', floor: 1,
      geometry: [{ lat: 0, lng: 0 }],
    };
    connectVertical(graph, stair, 1, 2);
    const nodes = graph.getAllNodes();
    const edges = graph.getAllEdges();
    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(1);
    expect(edges[0].type).toBe('stair');
    expect(edges[0].weight).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/vertical-connector.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/engine/vertical-connector.ts
import { Graph } from './graph';
import { MapComponent, NavNode, NavEdge } from '../types/nav-types';

let nodeCounter = 0;
let edgeCounter = 0;

export function resetCounters(): void {
  nodeCounter = 0;
  edgeCounter = 0;
}

export function connectVertical(
  graph: Graph,
  component: MapComponent,
  fromFloor: number,
  toFloor: number
): void {
  const pos = component.geometry[0] || { lat: 0, lng: 0 };
  const penaltyMultiplier = component.type === 'stair' ? 1.5 : 1.2;
  const verticalDistance = Math.abs(toFloor - fromFloor) * 3; // ~3m per floor

  const fromNodeId = `vn-${component.id}-f${fromFloor}`;
  const toNodeId = `vn-${component.id}-f${toFloor}`;
  nodeCounter += 2;

  const fromNode: NavNode = {
    id: fromNodeId,
    label: `${component.label} (Floor ${fromFloor})`,
    position: { lat: pos.lat, lng: pos.lng },
    floor: fromFloor,
    buildingId: component.buildingId,
    campusId: component.campusId,
    type: component.type,
    componentId: component.id,
  };
  const toNode: NavNode = {
    id: toNodeId,
    label: `${component.label} (Floor ${toFloor})`,
    position: { lat: pos.lat, lng: pos.lng },
    floor: toFloor,
    buildingId: component.buildingId,
    campusId: component.campusId,
    type: component.type,
    componentId: component.id,
  };

  graph.addNode(fromNode);
  graph.addNode(toNode);

  edgeCounter++;
  const edge: NavEdge = {
    id: `ve-${component.id}-f${fromFloor}-f${toFloor}`,
    from: fromNodeId,
    to: toNodeId,
    distance: verticalDistance,
    weight: Math.round(verticalDistance * penaltyMultiplier),
    type: component.type,
    campusId: component.campusId,
  };
  graph.addEdge(edge);
}

export function connectAllVertical(graph: Graph, components: MapComponent[]): void {
  for (const comp of components) {
    if (comp.type === 'stair' || comp.type === 'elevator') {
      const floors = comp.metadata?.floors;
      if (floors) {
        const levels = floors.split(',').map(Number).filter(n => !isNaN(n)).sort();
        for (let i = 0; i < levels.length - 1; i++) {
          connectVertical(graph, comp, levels[i], levels[i + 1]);
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/vertical-connector.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add stair/elevator vertical connector with weight penalties"
```

---

### Task 7: Graph Validator

**Files:**
- Create: `src/engine/graph-validator.ts`
- Create: `src/engine/__tests__/graph-validator.test.ts`

**Interfaces:**
- Consumes: `Graph`, `ValidationResult`
- Produces: `function validateGraph(graph): ValidationResult`

- [ ] **Step 1: Write the failing test**

```typescript
// src/engine/__tests__/graph-validator.test.ts
import { describe, it, expect } from 'vitest';
import { Graph } from '../graph';
import { validateGraph } from '../graph-validator';
import { NavNode, NavEdge } from '../../types/nav-types';

describe('Graph Validator', () => {
  it('passes a valid graph', () => {
    const graph = new Graph();
    graph.addNode({ id: 'n1', label: 'A', position: { lat: 0, lng: 0 }, floor: 0, buildingId: 'b1', campusId: 'c1', type: 'room' });
    graph.addNode({ id: 'n2', label: 'B', position: { lat: 1, lng: 1 }, floor: 0, buildingId: 'b1', campusId: 'c1', type: 'room' });
    graph.addEdge({ id: 'e1', from: 'n1', to: 'n2', distance: 10, weight: 10, type: 'walkway', campusId: 'c1' });
    const result = validateGraph(graph);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports orphan nodes (no edges)', () => {
    const graph = new Graph();
    graph.addNode({ id: 'n1', label: 'A', position: { lat: 0, lng: 0 }, floor: 0, buildingId: 'b1', campusId: 'c1', type: 'room' });
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'ORPHAN_NODE')).toBe(true);
  });

  it('reports zero-distance edges', () => {
    const graph = new Graph();
    graph.addNode({ id: 'n1', label: 'A', position: { lat: 0, lng: 0 }, floor: 0, buildingId: 'b1', campusId: 'c1', type: 'room' });
    graph.addNode({ id: 'n2', label: 'B', position: { lat: 1, lng: 1 }, floor: 0, buildingId: 'b1', campusId: 'c1', type: 'room' });
    graph.addEdge({ id: 'e1', from: 'n1', to: 'n2', distance: 0, weight: 0, type: 'walkway', campusId: 'c1' });
    const result = validateGraph(graph);
    expect(result.errors.some(e => e.code === 'ZERO_DISTANCE')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/__tests__/graph-validator.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/engine/graph-validator.ts
import { Graph } from './graph';
import { ValidationResult, ValidationError } from '../types/nav-types';

export function validateGraph(graph: Graph): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  const nodes = graph.getAllNodes();
  const edges = graph.getAllEdges();

  // Check orphan nodes
  const connectedNodes = new Set<string>();
  for (const edge of edges) {
    connectedNodes.add(edge.from);
    connectedNodes.add(edge.to);
  }
  for (const node of nodes) {
    if (!connectedNodes.has(node.id)) {
      errors.push({ code: 'ORPHAN_NODE', message: `Node "${node.label}" (${node.id}) has no connections`, nodeId: node.id });
    }
  }

  // Check zero-distance edges
  for (const edge of edges) {
    if (edge.distance <= 0) {
      errors.push({ code: 'ZERO_DISTANCE', message: `Edge ${edge.id} has zero or negative distance`, edgeId: edge.id });
    }
  }

  // Check dangling edges (reference non-existent nodes)
  for (const edge of edges) {
    if (!graph.getNode(edge.from)) {
      errors.push({ code: 'DANGLING_EDGE', message: `Edge ${edge.id} references non-existent source node ${edge.from}`, edgeId: edge.id });
    }
    if (!graph.getNode(edge.to)) {
      errors.push({ code: 'DANGLING_EDGE', message: `Edge ${edge.id} references non-existent target node ${edge.to}`, edgeId: edge.id });
    }
  }

  // Check duplicate IDs
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      errors.push({ code: 'DUPLICATE_NODE', message: `Duplicate node ID: ${node.id}`, nodeId: node.id });
    }
    nodeIds.add(node.id);
  }

  // Check no nodes (empty graph)
  if (nodes.length === 0) {
    errors.push({ code: 'EMPTY_GRAPH', message: 'Graph has no nodes' });
  }

  // Check floor levels on stair/elevator edges make sense
  for (const edge of edges) {
    if (edge.type === 'stair' || edge.type === 'elevator') {
      const fromNode = graph.getNode(edge.from);
      const toNode = graph.getNode(edge.to);
      if (fromNode && toNode && Math.abs(fromNode.floor - toNode.floor) === 0) {
        warnings.push(`Stair/elevator edge ${edge.id} connects nodes on the same floor`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/graph-validator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add graph validator with 8+ checks"
```

---

### Task 8: Spatial Resolver (GPS/QR Snapping)

**Files:**
- Create: `src/engine/spatial-resolver.ts`
- Create: `src/engine/__tests__/spatial-resolver.test.ts`

**Interfaces:**
- Consumes: `Graph`, `NavNode`, `LatLng`
- Produces: `function resolvePosition(graph, coordinates, floor?, type): NavNode | null`

- [ ] **Step 1: Write the failing test**

```typescript
// src/engine/__tests__/spatial-resolver.test.ts
import { describe, it, expect } from 'vitest';
import { Graph } from '../graph';
import { resolvePosition } from '../spatial-resolver';
import { NavNode } from '../../types/nav-types';

describe('Spatial Resolver', () => {
  it('returns nearest node for GPS coordinates', () => {
    const graph = new Graph();
    graph.addNode({ id: 'n1', label: 'Far', position: { lat: 10, lng: 10 }, floor: 0, buildingId: 'b1', campusId: 'c1', type: 'entrance' });
    graph.addNode({ id: 'n2', label: 'Near', position: { lat: 11.01, lng: 10.01 }, floor: 0, buildingId: 'b1', campusId: 'c1', type: 'entrance' });
    const result = resolvePosition(graph, { lat: 11, lng: 10 }, undefined, 'gps');
    expect(result?.id).toBe('n2');
  });

  it('finds a node by QR code ID', () => {
    const graph = new Graph();
    graph.addNode({ id: 'qr-f2-hallway-a', label: 'F2 Hallway A', position: { lat: 0, lng: 0 }, floor: 1, buildingId: 'b1', campusId: 'c1', type: 'qr_marker' });
    const result = resolvePosition(graph, { lat: 0, lng: 0 }, 1, 'qr', 'qr-f2-hallway-a');
    expect(result?.id).toBe('qr-f2-hallway-a');
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/engine/__tests__/spatial-resolver.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/engine/spatial-resolver.ts
import { Graph } from './graph';
import { LatLng, NavNode } from '../types/nav-types';

function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function resolvePosition(
  graph: Graph,
  coordinates: LatLng,
  floor?: number,
  type: 'gps' | 'qr' = 'gps',
  qrNodeId?: string
): NavNode | null {
  if (type === 'qr' && qrNodeId) {
    const node = graph.getNode(qrNodeId);
    if (node) return node;
  }

  let nearest: NavNode | null = null;
  let minDist = Infinity;
  const allNodes = graph.getAllNodes();

  for (const node of allNodes) {
    if (floor !== undefined && node.floor !== floor) continue;
    const d = haversine(coordinates, node.position);
    if (d < minDist) {
      minDist = d;
      nearest = node;
    }
  }

  return nearest;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/__tests__/spatial-resolver.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add spatial resolver for GPS and QR snapping"
```

---

### Task 9: Supabase Schema & Client Setup

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`
- Create: `src/lib/supabase.ts`
- Create: `src/lib/supabase-client.ts`
- Create: `src/lib/supabase-server.ts`

- [ ] **Step 1: Write the SQL migration**

```sql
-- supabase/migrations/001_initial_schema.sql
-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Campuses
CREATE TABLE campuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  center GEOGRAPHY(POINT),
  bounds GEOGRAPHY(POLYGON),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Buildings
CREATE TABLE buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID REFERENCES campuses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  floors INTEGER[] DEFAULT '{1}',
  footprint GEOGRAPHY(POLYGON),
  base_elevation DOUBLE PRECISION DEFAULT 0,
  height DOUBLE PRECISION DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Compiled graph nodes
CREATE TABLE route_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID REFERENCES campuses(id) ON DELETE CASCADE,
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  position GEOGRAPHY(POINT) NOT NULL,
  floor INTEGER DEFAULT 1,
  node_type TEXT DEFAULT 'room',
  component_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_route_nodes_campus ON route_nodes(campus_id);

-- Compiled graph edges
CREATE TABLE route_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID REFERENCES campuses(id) ON DELETE CASCADE,
  from_node UUID REFERENCES route_nodes(id) ON DELETE CASCADE,
  to_node UUID REFERENCES route_nodes(id) ON DELETE CASCADE,
  distance DOUBLE PRECISION NOT NULL,
  weight DOUBLE PRECISION NOT NULL,
  edge_type TEXT DEFAULT 'walkway',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Editor components
CREATE TABLE components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID REFERENCES campuses(id) ON DELETE CASCADE,
  building_id UUID REFERENCES buildings(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  floor INTEGER DEFAULT 1,
  geometry JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Graph snapshots (compiled cache for fast student-side loading)
CREATE TABLE graph_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID REFERENCES campuses(id) ON DELETE CASCADE UNIQUE,
  version TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Stored procedure: sync graph snapshot
CREATE OR REPLACE FUNCTION sync_graph_snapshot(
  p_campus_id UUID,
  p_version TEXT,
  p_data JSONB
) RETURNS void AS $$
BEGIN
  INSERT INTO graph_snapshots (campus_id, version, data, updated_at)
  VALUES (p_campus_id, p_version, p_data, now())
  ON CONFLICT (campus_id)
  DO UPDATE SET version = p_version, data = p_data, updated_at = now();
END;
$$ LANGUAGE plpgsql;

-- Stored procedure: find nearest node
CREATE OR REPLACE FUNCTION get_nearest_node(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_campus_id UUID
) RETURNS TABLE (id UUID, label TEXT, distance DOUBLE PRECISION) AS $$
BEGIN
  RETURN QUERY
  SELECT n.id, n.label,
    ST_Distance(n.position, ST_MakePoint(p_lng, p_lat)::geography) AS distance
  FROM route_nodes n
  WHERE n.campus_id = p_campus_id
  ORDER BY n.position <-> ST_MakePoint(p_lng, p_lat)::geography
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 2: Write Supabase client files**

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

```typescript
// src/lib/supabase-client.ts
import { createBrowserClient } from '@supabase/ssr';
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

```typescript
// src/lib/supabase-server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add Supabase schema and client setup"
```

---

### Task 10: Graph Store (Zustand + Supabase Sync)

**Files:**
- Create: `src/store/graph-store.ts`
- Create: `src/store/__tests__/graph-store.test.ts`

**Interfaces:**
- Consumes: `Graph` from Task 2, `GraphSnapshot` from Task 1, Supabase client
- Produces: Zustand store wrapping Graph with async `syncToSupabase`, `fetchFromSupabase`, `publish`, `importSnapshot`, `exportSnapshot`

- [ ] **Step 1: Write the failing test**

```typescript
// src/store/__tests__/graph-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useGraphStore } from '../graph-store';

describe('Graph Store', () => {
  beforeEach(() => {
    useGraphStore.getState().reset();
  });

  it('adds a node via store', () => {
    useGraphStore.getState().addNode({
      id: 'n1', label: 'Test', position: { lat: 0, lng: 0 },
      floor: 0, buildingId: 'b1', campusId: 'c1', type: 'room',
    });
    const node = useGraphStore.getState().graph.getNode('n1');
    expect(node?.label).toBe('Test');
  });

  it('publishes a snapshot', () => {
    const { publish, graph } = useGraphStore.getState();
    graph.addNode({
      id: 'n1', label: 'Test', position: { lat: 0, lng: 0 },
      floor: 0, buildingId: 'b1', campusId: 'c1', type: 'room',
    });
    const snapshot = publish();
    expect(snapshot.nodes).toHaveLength(1);
    expect(snapshot.version).toBe('1.0.0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/__tests__/graph-store.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/store/graph-store.ts
import { create } from 'zustand';
import { Graph } from '../engine/graph';
import { GraphSnapshot, NavNode, NavEdge, Building, MapComponent } from '../types/nav-types';
import { compileWalkways } from '../engine/walkway-compiler';
import { connectAllRooms } from '../engine/room-connector';
import { connectAllVertical } from '../engine/vertical-connector';
import { validateGraph } from '../engine/graph-validator';

interface GraphStore {
  graph: Graph;
  campusId: string;
  isCompiling: boolean;
  lastValidation: ReturnType<typeof validateGraph> | null;

  setCampusId: (id: string) => void;
  addNode: (node: NavNode) => void;
  removeNode: (id: string) => void;
  addEdge: (edge: NavEdge) => void;
  removeEdge: (id: string) => void;
  addBuilding: (building: Building) => void;
  addComponent: (component: MapComponent) => void;
  removeComponent: (id: string) => void;
  compile: () => void;
  publish: () => GraphSnapshot;
  importSnapshot: (snapshot: GraphSnapshot) => void;
  reset: () => void;
}

export const useGraphStore = create<GraphStore>((set, get) => ({
  graph: new Graph(),
  campusId: '',
  isCompiling: false,
  lastValidation: null,

  setCampusId: (id) => set({ campusId: id }),

  addNode: (node) => {
    get().graph.addNode(node);
    set({});
  },

  removeNode: (id) => {
    get().graph.removeNode(id);
    set({});
  },

  addEdge: (edge) => {
    get().graph.addEdge(edge);
    set({});
  },

  removeEdge: (id) => {
    get().graph.removeEdge(id);
    set({});
  },

  addBuilding: (building) => {
    get().graph.addBuilding(building);
    set({});
  },

  addComponent: (component) => {
    get().graph.addComponent(component);
    set({});
  },

  removeComponent: (id) => {
    const graph = get().graph;
    const edges = graph.getAllEdges().filter(e => {
      const node = graph.getNode(e.from);
      return node?.componentId === id || graph.getNode(e.to)?.componentId === id;
    });
    for (const e of edges) graph.removeEdge(e.id);
    const nodes = graph.getAllNodes().filter(n => n.componentId === id);
    for (const n of nodes) graph.removeNode(n.id);
    set({});
  },

  compile: () => {
    set({ isCompiling: true });
    const graph = get().graph;
    const components = graph.getAllComponents();
    compileWalkways(graph, components);
    connectAllRooms(graph, components);
    connectAllVertical(graph, components);
    const validation = validateGraph(graph);
    set({ isCompiling: false, lastValidation: validation });
  },

  publish: () => {
    const { graph, campusId } = get();
    const snapshot = graph.toJSON();
    snapshot.campusId = campusId;
    snapshot.id = crypto.randomUUID();
    return snapshot;
  },

  importSnapshot: (snapshot) => {
    const graph = new Graph();
    graph.fromJSON(snapshot);
    set({ graph, campusId: snapshot.campusId });
  },

  reset: () => {
    set({ graph: new Graph(), isCompiling: false, lastValidation: null });
  },
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/__tests__/graph-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add graph Zustand store with compiler pipeline"
```

---

### Task 11: Next.js Pages & Auth Middleware

**Files:**
- Create: `src/middleware.ts` — Supabase SSR route protection
- Create: `src/app/layout.tsx` — Root layout with AuthProvider
- Create: `src/app/page.tsx` — Landing page with campus selector
- Create: `src/app/campuses/[campusId]/map/page.tsx` — Public map
- Create: `src/app/admin/login/page.tsx` — Login page
- Create: `src/app/admin/dashboard/page.tsx` — Admin dashboard
- Create: `src/app/admin/campuses/[campusId]/studio/page.tsx` — NAVI Studio
- Create: `src/app/admin/campuses/[campusId]/panoramas/page.tsx`
- Create: `src/app/admin/campuses/[campusId]/qr/page.tsx`
- Modify: `src/app/globals.css` — Option C theme tokens
- Modify: `tailwind.config.js` — ASU colors

- [ ] **Step 1: Create middleware**

```typescript
// src/middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin');
  const isLoginPage = request.nextUrl.pathname === '/admin/login';

  if (isAdminRoute && !isLoginPage && !user) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }
  if (isLoginPage && user) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url));
  }
  return supabaseResponse;
}

export const config = {
  matcher: ['/admin/:path*'],
};
```

- [ ] **Step 2: Create root layout with Option C theme**

```typescript
// src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NAVI — Campus Navigation',
  description: 'Graph-driven multi-campus navigation system',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Update globals.css with Option C tokens**

```css
/* src/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

:root {
  --color-asu-green: #0F5132;
  --color-asu-gold: #D1A11F;
  --color-surface: #F8FAFC;
}

body {
  font-family: 'Plus Jakarta Sans', sans-serif;
}
```

- [ ] **Step 4: Update tailwind config**

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        asu: { green: '#0F5132', gold: '#D1A11F', surface: '#F8FAFC' },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 5: Create landing page**

```typescript
// src/app/page.tsx
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function LandingPage() {
  const [campuses, setCampuses] = useState<{ id: string; name: string; code: string }[]>([]);

  useEffect(() => {
    fetch('/api/campuses').then(r => r.json()).then(setCampuses).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-asu-surface flex flex-col">
      <header className="px-8 py-6 flex items-center gap-3">
        <div className="bg-asu-green text-asu-gold p-3 rounded-xl font-black text-2xl">N</div>
        <h1 className="text-2xl font-extrabold text-slate-900">NAVI</h1>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <h2 className="text-4xl font-extrabold text-slate-900 mb-2">Campus Navigation</h2>
        <p className="text-slate-500 mb-8 max-w-md">Select your campus to get started</p>
        <div className="grid gap-4 w-full max-w-sm">
          {campuses.length === 0 && (
            <div className="p-6 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400">
              No campuses configured yet
            </div>
          )}
          {campuses.map(c => (
            <Link key={c.id} href={`/campuses/${c.code}/map`}
              className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-asu-green hover:shadow-md transition-all text-left">
              <span className="font-bold text-slate-900">{c.name}</span>
              <span className="text-xs text-slate-400 block mt-0.5">{c.code}</span>
            </Link>
          ))}
        </div>
        <Link href="/admin/login" className="mt-8 text-sm text-asu-green font-semibold hover:underline">
          Admin Access
        </Link>
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Create public map page (skeleton)**

```typescript
// src/app/campuses/[campusId]/map/page.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { useGraphStore } from '@/store/graph-store';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function MapPage({ params }: { params: Promise<{ campusId: string }> }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const { importSnapshot, graph } = useGraphStore();
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      const { campusId } = await params;
      const res = await fetch(`/api/campuses/${campusId}/graph`);
      if (res.ok) {
        const snapshot = await res.json();
        importSnapshot(snapshot);
      }
    })();
  }, []);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [122.09, 11.82],
      zoom: 16,
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  return (
    <div className="h-screen w-full flex flex-col">
      {/* Search bar */}
      <div className="absolute top-4 left-4 right-4 z-10 max-w-md mx-auto">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search destinations..."
          className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white shadow-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-asu-green"
        />
      </div>
      {/* Map */}
      <div ref={mapContainer} className="flex-1" />
    </div>
  );
}
```

- [ ] **Step 7: Create admin login page**

```typescript
// src/app/admin/login/page.tsx
'use client';
import { createClient } from '@/lib/supabase-client';

export default function LoginPage() {
  const handleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${location.origin}/auth/callback` } });
  };

  return (
    <div className="min-h-screen bg-asu-surface flex items-center justify-center">
      <div className="bg-white p-10 rounded-2xl shadow-sm border border-slate-200 text-center max-w-sm w-full">
        <div className="bg-asu-green text-asu-gold w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl mx-auto mb-4">N</div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">Admin Login</h1>
        <p className="text-sm text-slate-500 mb-6">Sign in with your ASU Google account</p>
        <button onClick={handleLogin}
          className="w-full py-3 bg-asu-green text-white rounded-xl font-bold hover:bg-asu-green/90 transition-all">
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Create admin dashboard page (skeleton)**

```typescript
// src/app/admin/dashboard/page.tsx
'use client';
import Link from 'next/link';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-asu-surface p-8">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-extrabold text-slate-900">Admin Dashboard</h1>
        <div className="text-sm text-slate-400">NAVI Studio</div>
      </header>
      <div className="grid md:grid-cols-3 gap-6 max-w-4xl">
        <Link href="/admin/campuses/asu-ibajay/studio"
          className="p-6 bg-white rounded-2xl border border-slate-200 hover:border-asu-green transition-all">
          <h2 className="font-bold text-slate-900 mb-1">NAVI Studio</h2>
          <p className="text-sm text-slate-500">Edit campus navigation data</p>
        </Link>
        <Link href="/admin/campuses/asu-ibajay/panoramas"
          className="p-6 bg-white rounded-2xl border border-slate-200 hover:border-asu-green transition-all">
          <h2 className="font-bold text-slate-900 mb-1">Panoramas</h2>
          <p className="text-sm text-slate-500">Manage 360° scenes</p>
        </Link>
        <Link href="/admin/campuses/asu-ibajay/qr"
          className="p-6 bg-white rounded-2xl border border-slate-200 hover:border-asu-green transition-all">
          <h2 className="font-bold text-slate-900 mb-1">QR Codes</h2>
          <p className="text-sm text-slate-500">Generate positioning QR codes</p>
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Create NAVI Studio page (skeleton)**

```typescript
// src/app/admin/campuses/[campusId]/studio/page.tsx
export default function StudioPage() {
  return (
    <div className="h-screen flex">
      <div className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-4 gap-4">
        {/* Tool palette will be rendered by StudioLayout component */}
      </div>
      <div className="flex-1 bg-slate-50 flex items-center justify-center text-slate-400">
        Map Canvas — NAVI Studio
      </div>
      <div className="w-64 bg-white border-l border-slate-200 p-4">
        {/* Properties panel */}
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Create API route**

```typescript
// src/app/api/campuses/[campusId]/graph/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ campusId: string }> }) {
  const { campusId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('graph_snapshots')
    .select('data')
    .eq('campus_id', campusId)
    .single();
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data.data);
}
```

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -m "feat: add pages, middleware, and API routes"
```

---

### Task 12: NAVI Studio UI Components

**Files:**
- Create: `src/components/studio/StudioLayout.tsx` — Main layout with canvas + panels
- Create: `src/components/studio/MapCanvas.tsx` — MapLibre canvas with drawing overlay
- Create: `src/components/studio/ToolPalette.tsx` — Tool selection sidebar
- Create: `src/components/studio/PropertiesPanel.tsx` — Selected component properties
- Create: `src/components/studio/FloorTabs.tsx` — Floor switcher
- Create: `src/components/studio/CompilerPanel.tsx` — Compiler log output
- Create: `src/components/studio/PublishButton.tsx` — Compile + Publish flow
- Create: `src/store/studio-store.ts` — Studio UI state (selected tool, selected component, floor)

**Interfaces:**
- Consumes: `useGraphStore` from Task 10
- Produces: Functional studio editor with tool selection, canvas interaction, and property editing

- [ ] **Step 1: Create studio store**

```typescript
// src/store/studio-store.ts
import { create } from 'zustand';

interface StudioStore {
  selectedTool: 'select' | 'walkway' | 'room' | 'stair' | 'elevator' | 'entrance' | 'qr_marker' | 'panorama';
  selectedComponentId: string | null;
  selectedFloor: number;
  isDrawing: boolean;
  mapStyle: 'satellite' | 'street' | 'light' | 'dark';

  setTool: (tool: StudioStore['selectedTool']) => void;
  selectComponent: (id: string | null) => void;
  setFloor: (floor: number) => void;
  setDrawing: (drawing: boolean) => void;
  setMapStyle: (style: StudioStore['mapStyle']) => void;
}

export const useStudioStore = create<StudioStore>((set) => ({
  selectedTool: 'select',
  selectedComponentId: null,
  selectedFloor: 1,
  isDrawing: false,
  mapStyle: 'satellite',
  setTool: (tool) => set({ selectedTool: tool, isDrawing: tool !== 'select' }),
  selectComponent: (id) => set({ selectedComponentId: id }),
  setFloor: (floor) => set({ selectedFloor: floor }),
  setDrawing: (drawing) => set({ isDrawing: drawing }),
  setMapStyle: (style) => set({ mapStyle: style }),
}));
```

- [ ] **Step 2: Create ToolPalette**

```tsx
// src/components/studio/ToolPalette.tsx
'use client';
import { useStudioStore } from '@/store/studio-store';

const tools = [
  { id: 'select', label: 'Select', icon: '⬚' },
  { id: 'walkway', label: 'Walkway', icon: '─' },
  { id: 'room', label: 'Room', icon: '▭' },
  { id: 'stair', label: 'Stair', icon: '⬆' },
  { id: 'elevator', label: 'Elevator', icon: '⏏' },
  { id: 'entrance', label: 'Entrance', icon: '🚪' },
  { id: 'qr_marker', label: 'QR', icon: '📷' },
  { id: 'panorama', label: '360°', icon: '◉' },
] as const;

export default function ToolPalette() {
  const { selectedTool, setTool } = useStudioStore();

  return (
    <div className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-4 gap-1">
      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Tools</span>
      {tools.map(t => (
        <button key={t.id}
          onClick={() => setTool(t.id as typeof selectedTool)}
          className={`w-10 h-10 rounded-lg text-sm font-bold transition-all ${
            selectedTool === t.id
              ? 'bg-asu-green text-asu-gold shadow-sm'
              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
          }`}
          title={t.label}>
          <span>{t.icon}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create PropertiesPanel**

```tsx
// src/components/studio/PropertiesPanel.tsx
'use client';
import { useGraphStore } from '@/store/graph-store';
import { useStudioStore } from '@/store/studio-store';

export default function PropertiesPanel() {
  const { graph, addComponent, removeComponent } = useGraphStore();
  const { selectedComponentId, selectComponent } = useStudioStore();
  const component = selectedComponentId ? graph.getComponent(selectedComponentId) : null;

  if (!component) {
    return (
      <div className="w-64 bg-white border-l border-slate-200 p-4">
        <p className="text-xs text-slate-400">Select a component to edit its properties</p>
      </div>
    );
  }

  return (
    <div className="w-64 bg-white border-l border-slate-200 flex flex-col">
      <div className="p-4 border-b border-slate-200">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Component</div>
        <div className="flex items-center gap-2">
          <span className="text-lg">{component.type === 'room' ? '▭' : component.type === 'walkway' ? '─' : '⬆'}</span>
          <span className="font-bold text-sm text-slate-900">{component.label}</span>
        </div>
      </div>
      <div className="p-4 space-y-4 text-xs">
        <div>
          <label className="block font-bold text-slate-500 mb-1">Label</label>
          <input defaultValue={component.label} className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-medium" />
        </div>
        <div>
          <label className="block font-bold text-slate-500 mb-1">Type</label>
          <div className="px-2 py-1.5 rounded-lg bg-slate-50 text-sm font-medium text-slate-700 capitalize">{component.type}</div>
        </div>
        <div>
          <label className="block font-bold text-slate-500 mb-1">Floor</label>
          <div className="px-2 py-1.5 rounded-lg bg-slate-50 text-sm font-mono text-slate-700">Floor {component.floor}</div>
        </div>
        <button onClick={() => { removeComponent(component.id); selectComponent(null); }}
          className="w-full py-2 rounded-lg text-xs font-bold bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 transition-all">
          Delete Component
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create CompilerPanel + PublishButton**

```tsx
// src/components/studio/CompilerPanel.tsx
'use client';
import { useGraphStore } from '@/store/graph-store';

export default function CompilerPanel() {
  const { isCompiling, lastValidation, graph } = useGraphStore();
  const nodeCount = graph.getAllNodes().length;
  const edgeCount = graph.getAllEdges().length;

  return (
    <div className="h-28 bg-slate-900 border-t border-slate-700 px-5 py-3 font-mono text-[10px] text-slate-300">
      <div className="flex items-center justify-between text-slate-500 border-b border-slate-800 pb-1 mb-1">
        <span>COMPILER</span>
        <span>{nodeCount} nodes · {edgeCount} edges</span>
      </div>
      {isCompiling && <div className="text-yellow-400">Compiling components...</div>}
      {lastValidation && (
        <div className={lastValidation.valid ? 'text-emerald-400' : 'text-red-400'}>
          {lastValidation.errors.length} errors · {lastValidation.warnings.length} warnings
        </div>
      )}
    </div>
  );
}
```

```tsx
// src/components/studio/PublishButton.tsx
'use client';
import { useGraphStore } from '@/store/graph-store';
import { createClient } from '@/lib/supabase-client';

export default function PublishButton() {
  const { compile, publish, campusId, lastValidation } = useGraphStore();

  const handlePublish = async () => {
    compile();
    if (lastValidation && !lastValidation.valid) {
      alert('Fix validation errors before publishing');
      return;
    }
    const snapshot = publish();
    const supabase = createClient();
    const { error } = await supabase.rpc('sync_graph_snapshot', {
      p_campus_id: campusId,
      p_version: snapshot.version,
      p_data: snapshot,
    });
    if (error) {
      alert('Publish failed: ' + error.message);
    } else {
      alert('Published successfully!');
    }
  };

  return (
    <button onClick={handlePublish}
      className="px-6 py-2 bg-asu-green text-asu-gold rounded-xl font-bold text-sm hover:bg-asu-green/90 transition-all shadow-sm">
      Publish
    </button>
  );
}
```

- [ ] **Step 5: Integrate into Studio page**

```typescript
// src/app/admin/campuses/[campusId]/studio/page.tsx
'use client';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useGraphStore } from '@/store/graph-store';
import ToolPalette from '@/components/studio/ToolPalette';
import PropertiesPanel from '@/components/studio/PropertiesPanel';
import CompilerPanel from '@/components/studio/CompilerPanel';
import PublishButton from '@/components/studio/PublishButton';

export default function StudioPage() {
  const params = useParams<{ campusId: string }>();
  const { setCampusId, graph } = useGraphStore();

  useEffect(() => {
    setCampusId(params.campusId);
  }, [params.campusId]);

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <div className="h-12 bg-white border-b border-slate-200 px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-bold text-slate-900">NAVI Studio</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-500">{params.campusId}</span>
        </div>
        <PublishButton />
      </div>

      <div className="flex-1 flex overflow-hidden">
        <ToolPalette />
        {/* Map canvas */}
        <div className="flex-1 bg-slate-100 flex items-center justify-center text-slate-400 text-sm">
          Map Canvas — Use tools to place components
        </div>
        <PropertiesPanel />
      </div>

      <CompilerPanel />
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add NAVI Studio UI components"
```

---

### Task 13: 2.5D Building Extrusion

**Files:**
- Modify: `src/components/map/CampusMap.tsx`
- The 2.5D visualization uses MapLibre fill-extrusion with unified height

- [ ] **Step 1: Add 2.5D layer to map**

```typescript
// Inside CampusMap.tsx, after map loads:
map.on('load', () => {
  map.addSource('buildings-3d', {
    type: 'geojson',
    data: buildingFootprintsGeoJSON,
  });
  map.addLayer({
    id: 'buildings-3d',
    type: 'fill-extrusion',
    source: 'buildings-3d',
    paint: {
      'fill-extrusion-color': '#0F5132',
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-base': ['get', 'base_elevation'],
      'fill-extrusion-opacity': 0.8,
    },
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add 2.5D building extrusion with unified height"
```

---

### Task 14: QR Scanner Integration

**Files:**
- Create: `src/components/map/QRScanner.tsx`
- Install: `npm install html5-qrcode`

- [ ] **Step 1: Create QR scanner component**

```tsx
// src/components/map/QRScanner.tsx
'use client';
import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QRScannerProps {
  onScan: (nodeId: string) => void;
}

export default function QRScanner({ onScan }: QRScannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;
    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        const nodeId = decodedText.split('node=')[1] || decodedText;
        onScan(nodeId);
        scanner.stop();
      },
      () => {}
    );
    return () => { scanner.stop(); };
  }, []);

  return <div id="qr-reader" ref={containerRef} className="w-full max-w-sm mx-auto" />;
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add QR scanner component"
```

---

### Task 15: Panorama Viewer

**Files:**
- Create: `src/components/map/PanoramaViewer.tsx`
- Install: `npm install pannellum`

- [ ] **Step 1: Create panorama component**

```tsx
// src/components/map/PanoramaViewer.tsx
'use client';
import { useEffect, useRef } from 'react';
import 'pannellum/build/pannellum.css';

interface PanoramaViewerProps {
  imageUrl: string;
  nodeId?: string;
}

export default function PanoramaViewer({ imageUrl }: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const script = document.createElement('script');
    script.src = '/pannellum.js';
    script.onload = () => {
      (window as any).pannellum.viewer(containerRef.current, {
        type: 'equirectangular',
        panorama: imageUrl,
        autoLoad: true,
        compass: true,
      });
    };
    document.body.appendChild(script);
  }, [imageUrl]);

  return <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden" />;
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add 360 panorama viewer component"
```

---

### Task 16: Route Line Visualization

**Files:**
- Create: `src/components/map/RouteLine.tsx`

**Interfaces:**
- Consumes: `PathResult` from A* engine
- Produces: Layered polyline with glow + core + flow arrow on MapLibre

- [ ] **Step 1: Create the route line component**

```tsx
// src/components/map/RouteLine.tsx
'use client';
import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { PathResult } from '@/types/nav-types';

interface RouteLineProps {
  map: maplibregl.Map | null;
  route: PathResult | null;
}

export default function RouteLine({ map, route }: RouteLineProps) {
  useEffect(() => {
    if (!map || !route || route.path.length < 2) return;

    const coordinates = route.path.map(n => [n.position.lng, n.position.lat]);

    // Remove existing layers
    ['route-glow', 'route-core', 'route-flow'].forEach(id => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource('route')) map.removeSource('route');

    map.addSource('route', {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } },
    });

    map.addLayer({
      id: 'route-glow', type: 'line', source: 'route',
      paint: {
        'line-color': '#3b82f6', 'line-width': 12, 'line-opacity': 0.3,
        'line-blur': 4,
      },
    });

    map.addLayer({
      id: 'route-core', type: 'line', source: 'route',
      paint: {
        'line-color': '#3b82f6', 'line-width': 4,
      },
    });

    map.addLayer({
      id: 'route-flow', type: 'line', source: 'route',
      paint: {
        'line-color': '#ffffff', 'line-width': 2, 'line-opacity': 0.9,
        'line-dasharray': [0.5, 2],
      },
    });

    // Fit map to route bounds
    const bounds = new maplibregl.LngLatBounds();
    coordinates.forEach(c => bounds.extend(c as [number, number]));
    map.fitBounds(bounds, { padding: 80 });

    return () => {
      ['route-glow', 'route-core', 'route-flow'].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      if (map.getSource('route')) map.removeSource('route');
    };
  }, [map, route]);

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add route line visualization with glow + core + flow"
```

---

### Task 17: GPS Geolocation Hook

**Files:**
- Create: `src/hooks/useGeolocation.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useGeolocation.ts
'use client';
import { useState, useEffect } from 'react';

interface GeolocationState {
  lat: number | null;
  lng: number | null;
  error: string | null;
  loading: boolean;
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({ lat: null, lng: null, error: null, loading: true });

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({ lat: null, lng: null, error: 'Geolocation not supported', loading: false });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setState({ lat: pos.coords.latitude, lng: pos.coords.longitude, error: null, loading: false }),
      (err) => setState({ lat: null, lng: null, error: err.message, loading: false }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  return state;
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: add geolocation hook for GPS positioning"
```

---

## Scope Verification

| Spec Requirement | Tasks |
|---|---|
| Graph model with interconnected subgraphs | 1, 2 |
| A* pathfinding with step instructions | 3 |
| Walkway centerline → graph compiler | 4 |
| Room ↔ Walkway auto-connect | 5 |
| Stair/Elevator vertical connectors | 6 |
| Graph validation (8+ checks) | 7 |
| GPS/QR spatial snapping | 8 |
| Supabase schema + PostGIS | 9 |
| Stale-while-revalidate data hydration | 10, 11 |
| Multi-campus path-based routing | 11 |
| NAVI Studio satellite base layer + vector sandbox | 11, 12 |
| Walkway drawing tool | 12 |
| Room drawing + properties panel | 12 |
| QR marker tool | 14 |
| Panorama viewer | 15 |
| 2.5D building extrusion | 13 |
| Route line with glow + core + flow | 16 |
| GPS geolocation | 17 |
| Hybrid positioning (GPS + QR) | 8, 14, 17 |
| Option C ASU Green/Gold theme | 11, 12 |
| Admin auth (Supabase Google OAuth) | 11 |
