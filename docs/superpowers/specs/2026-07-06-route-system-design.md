# Route System Design — Hierarchical Routes with Auto-Connect

**Date:** 2026-07-06
**Status:** Draft
**Author:** AI-assisted design via brainstorming session

## Overview

Design and implement a hierarchical route system for the NAVI studio campus map editor. Routes follow a blood-vessel model with three tiers: Arterial (campus trunk paths), Connector (branches to building zones), and Interior (inside-building hallways, handled in floor editor).

Routes auto-connect when they touch or cross by sharing junction nodes. Node/edge layers are hidden during normal viewing and visible only during vertex editing. Route width is admin-set (2–24 slider), uniform along the route.

---

## A. Data Model

### Keep Current `TracePath`

```ts
export interface TracePath {
  id: string;
  campus_id: string;
  type: 'arterial' | 'connector'; // interior handled in floor editor
  points: [number, number][];
  color: string;           // admin-chosen
  width: number;           // 2–24 in pixels
  label?: string;
}
```

- Interior routes exist as a separate concept in the floor editor (building → floor → interior path)
- No new top-level route type needed

### Graph Node Model (existing, extended)

```ts
interface GraphNode {
  id: string;
  pos: [number, number];
  floor: number;
  type: 'intersection' | ...;
  traceIds: string[];  // routes this node belongs to (shared ownership)
}
```

- `traceIds` array tracks all routes that reference this node
- When deleting a route, remove its ref from `traceIds`, do NOT delete the node unless `traceIds` is empty

---

## B. Visualization

### Normal Viewing (default state)
- Routes render as colored polylines using existing `RoutePath` layer (mapbox vector source)
- **NODES / NODES_CONNECTION / EDGES layers hidden** — set `visibility: 'none'`
- Node circles do not appear unless vertex editing is active
- Navigation overlay is a separate temporary polyline layer on top of everything

### Vertex Editing Mode (`isVertexEditing` flag in store)
- NODES / NODES_CONNECTION / EDGES layers become visible
- Vertex handles appear larger (~8px circles) — users click and drag these
- Non-editing routes still show as polylines but their nodes remain hidden (only the trace being edited shows vertices)

### Route Width
- Admin sets width per-route via a slider (2–24)
- Value stored in `TracePath.width`
- Applied to the route polyline layer via `line-width` paint property (no data mutation)
- Uniform along the entire route — not variable-width

### Navigation Path
- When user requests navigation, a temporary overlay polyline is drawn
- Color: distinct (e.g. bright blue with glow), clear from route colors
- Rendered as a separate layer above all route layers
- Does NOT modify any `TracePath` data

---

## C. Auto-Connect (Shared Junction Nodes)

Connecting routes share junction nodes. This uses the blood-vessel model — routes merge at common points rather than overlapping.

### Endpoint Snapping
- When a route endpoint is within 5m of another route's segment, it snaps to create a shared junction node
- The endpoint position is adjusted to match the nearest point on the existing segment
- A junction node is created/updated with both routes' IDs in `traceIds`

### Crossing Detection
- When two route segments cross (geometric intersection), a shared junction node is created at the intersection point
- Both route segments are split at that point
- The intersection node's `traceIds` includes both routes

### Implementation: `syncTraceIntersections`
- Called after any route mutation (add, update, delete)
- Logic:
  1. For each endpoint of the added/updated trace, find nearest segment on any other trace within 5m
  2. If found, create/update a shared junction node at the snapped position
  3. Split both affected edges at the junction node
  4. For all segments of the new trace, check if they cross any segment of any other trace
  5. If crossing found, create junction node at intersection, split both edges

### Node Lifecycle
- Nodes track `traceIds: string[]` — every node knows which routes reference it
- When a route is deleted:
  1. Remove its ID from each node's `traceIds`
  2. Delete any node whose `traceIds` becomes empty
  3. If a node was a segment split point, re-merge the adjacent segments if node is deleted

---

## D. Editing

### Two Entry Points
1. **Click node on map** → `selectedNodeId` → `NodePropertiesPanel` shows node info + lists routes it belongs to → "Edit Vertices" button per route → enters vertex editing for that trace
2. **Click route on map** → `selectedTraceId` → `TracePropertiesPanel` shows route info → "Edit Vertices" button → enters vertex editing for that trace

### Vertex Editing Mode
- When editing enters: NODES / NODES_CONNECTION layers become visible
- Vertex handles shown as large (-8px) circles — easier to click than current 2.5px
- Midpoints shown as smaller (4px) circles — clicking inserts a new vertex
- **Right-click on vertex** → delete it (if route has > 2 points)
- **Drag vertex** → update position in real-time on the map
- **Drag endpoint outward** → extend route (see Section E)

### On Release (after drag or edit)
1. `updateTrace` — persist new point positions
2. `recompileTrace` — remove old nodes, re-run compileTrace, tag new nodes
3. `syncTraceIntersections` — detect and create shared junctions
4. Save to Supabase

### Layer Behavior
- `layers.nodes` and `layers.nodeConnections` store flags control visibility
- During vertex editing, these flags are set to `true`
- On exit, restored to `false`
- Only the trace being edited shows vertices — other routes stay as polylines

---

## E. Extending Routes

### Mechanism: Drag Endpoint Vertex Outward
- When user grabs an endpoint vertex (first or last point) and drags:
  - **If drag direction is outward** (beyond the adjacent point away from the route body) → extend mode
  - **If drag is toward the interior** → normal vertex move
- In extend mode:
  - A new segment is appended to the route
  - The endpoint follows the cursor
  - On release, the new point is added to `TracePath.points`
  - No separate "extend" button or mode toggle needed

### Detection
- Compare drag position to the adjacent (second or second-to-last) point
- If distance to adjacent point increases → extending
- If distance to adjacent point decreases → moving

---

## F. A* Navigation Integration

Routes compile into graph nodes that A* traverses naturally:

- Each `TracePath.points[i]` becomes a graph node during compile
- Shared junction nodes create connections between different routes
- A* sees the full graph — arterial → connector → destination
- Entrance selection: destination building determines which connector terminus node to target
- Through-building shortcuts: when building interior has components connecting entrances, those are additional graph edges
- Navigation overlay uses same graph data but renders separately

### No Changes Needed to A*
The existing A* implementation already traverses `GraphNode[]` with `GraphEdge[]` connections. Route compilation feeds this graph. Auto-connect ensures cross-route traversal works.

---

## G. Edge Cases & Guardrails

| Scenario | Behavior |
|----------|----------|
| Route with 1 point | Cannot save — blocked in UI |
| Isolated connector (no intersection) | Saves without junction nodes — A* can still reach it |
| Delete a shared node during vertex edit | Only allowed if no other route references it (check `traceIds`) |
| Route deleted while sharing junction | Junction node ID removed from route, node kept if `traceIds` not empty |
| Partial route deletion (delete middle vertex) | Adjacent vertices connected, route saved, intersections re-synced |
| Move all vertices of a route | Allowed — extends to any valid position, intersections re-synced on release |
| Width 0 or negative | Clamped to 2–24 range |

---

## Files Touched

| File | Change |
|------|--------|
| `src/components/studio/NodePropertiesPanel.tsx` | Already created — shows node info + "Edit Vertices" |
| `src/components/studio/RightPanel.tsx` | Already updated — renders NodePropertiesPanel |
| `src/components/studio/StudioCanvas.tsx` | Already updated — layer visibility effect, store-based `selectedNodeId` |
| `src/store/studio-store.ts` | Already updated — `selectedNodeId`, `setSelectedNodeId`, nodes default `true` |
| `src/components/studio/useVertexEditor.ts` | **Fix:** enlarge vertex handles to 8px, fix midpoint filter, add right-click delete, endpoint extend detection |
| `src/engine/graph.ts` | Already updated — `syncTraceIntersections`, `recompileTrace`, `addTraceWithCompile` |
| `src/engine/trace-compiler.ts` | Existing — `compileTrace` creates nodes at each trace point |
| `src/components/studio/TracePropertiesPanel.tsx` | Existing — "Edit Vertices" button |

---

## Acceptance Criteria

1. Admin can create arterial and connector routes with color + width (2–24)
2. Routes that touch or cross auto-create shared junction nodes
3. During normal viewing, node/edge layers are invisible
4. During vertex editing, node layers appear with ~8px vertex handles
5. Dragging endpoint outward extends route; dragging middle point moves it
6. Right-clicking a vertex deletes it (unless route has ≤2 points)
7. A* navigation traverses the full connected graph
8. Deleting a route does not orphan shared junction nodes
