# RC-POLYGON-ENGINE

**Prerequisite:** ADR-016 (Geometry Engine Principles) — this spec builds on the contract defined there.

**Mission:** Build a geometry engine for closed shapes, just as the Linear Geometry Engine became the geometry engine for paths. The engine edits polygons. It never knows what a room, building footprint, campus boundary, or restricted area is.

---

## Canonical Model

```ts
interface Vertex {
  x: number
  y: number
}

interface PolygonRing {
  vertices: Vertex[]
  closed: boolean
}

interface EditablePolygon {
  id: string
  rings: PolygonRing[]        // rings[0] = outer, rings[1..n] = holes
  readOnly?: boolean
}
```

Invariant: `rings.length >= 1`. `rings[0]` is always the outer ring. Holes (`rings[1..n]`) are structurally present in the data model from day one but editing of holes is deferred to RC-5.

The data model never changes later — exactly the same philosophy as `ArcSegment` in LGE.

---

## Engine Responsibilities

### Editing

| Operation | Description |
|-----------|-------------|
| `moveVertex(polygon, vertexIndex, position)` | Move a single vertex |
| `insertVertex(polygon, edgeIndex, position)` | Insert a vertex on an edge |
| `deleteVertex(polygon, vertexIndex)` | Remove a vertex (min 3 remain) |
| `splitEdge(polygon, edgeIndex, t)` | Split edge at parameter t |
| `closePolygon(polygon)` | Close the ring (connect last→first) |
| `setVertex(polygon, vertexIndex, position)` | Absolute position set |

### Analysis

| Operation | Description |
|-----------|-------------|
| `area(polygon)` | Signed area (positive = CCW) |
| `perimeter(polygon)` | Sum of edge lengths |
| `winding(polygon)` | `'cw'` or `'ccw'` |
| `boundingBox(polygon)` | `{ minX, minY, maxX, maxY }` |
| `selfIntersects(polygon)` | True if any edges cross |
| `convexity(polygon)` | `'convex'` or `'concave'` (future) |

### Constraints

| Constraint | Description |
|------------|-------------|
| `snap(polygon, vertexIndex, snapTargets)` | Snap to nearby vertices, edges, grid |
| `minEdgeLength(polygon, threshold)` | Prevent sub-threshold edges |
| `minArea(polygon, threshold)` | Prevent zero-area polygons |
| `deduplicateVertices(polygon)` | Remove duplicate adjacent vertices |

---

## Session

Mirrors LGE exactly:

```
EditablePolygon
       ↓
EditablePolygonSession
       ↓
useEditablePolygonEditor()
       ↓
  PolygonOverlay
       ↓
  PolygonRenderer
```

### EditablePolygonSession

```ts
interface EditablePolygonSession {
  polygon: EditablePolygon
  hoveredVertex: number | null
  hoveredEdge: number | null
  draggedVertex: number | null
  mode: 'idle' | 'dragging' | 'inserting' | 'drawing'
  history: HistoryStack<EditablePolygon>
}
```

### useEditablePolygonEditor()

```ts
function useEditablePolygonEditor(
  polygon: EditablePolygon,
  options?: PolygonEditorOptions
): {
  state: EditablePolygonSession
  handlers: PolygonHandlers       // onPointerDown, onPointerMove, etc.
  operations: PolygonOperations   // moveVertex, insertVertex, etc.
}
```

Reuses existing LGE patterns: pointer interaction, hover state, snapping providers, constraint providers, overlay architecture.

---

## PolygonOverlay

Canvas-level visual feedback during editing:

- Vertex handles (drag circles)
- Edge midpoints (insertion targets)
- Hover highlights (vertex + edge glow)
- Preview geometry during drag
- Closure indicator (when near first vertex)

Same overlay contract as `PathOverlay` in LGE.

---

## PolygonRenderer

A single generic renderer:

```ts
interface PolygonRendererStyle {
  fillColor: string
  strokeColor: string
  strokeWidth: number
  opacity: number
}

function PolygonRenderer(props: {
  polygon: EditablePolygon
  style: PolygonRendererStyle
}): JSX.Element
```

Domain renderers compose it:

```text
RoomRenderer → PolygonRenderer { fillColor: room.color, ... }

BuildingFootprintRenderer → PolygonRenderer { fillColor: building.color, ... }

CampusBoundaryRenderer → PolygonRenderer { fillColor: 'transparent', strokeColor: '#000', ... }
```

This matches the Parametric Engine pattern: one renderer, themed consumers.

---

## Diagnostics (Integration Points)

Listed for the Diagnostic Engine — not yet implemented:

| Code | Severity | Description |
|------|----------|-------------|
| `POLYGON_SELF_INTERSECTION` | error | Edges cross |
| `POLYGON_INVALID_WINDING` | warning | Outer ring is CW instead of CCW |
| `POLYGON_DUPLICATE_VERTEX` | warning | Adjacent duplicate coordinates |
| `POLYGON_ZERO_AREA` | error | Polygon has no area |
| `POLYGON_OUTSIDE_PARENT` | error | Polygon extends beyond parent bounds |
| `POLYGON_OVERLAP` | warning | Polygon overlaps another (future) |
| `POLYGON_MIN_EDGE` | info | Edge below minimum length |

---

## Engine Evolution Strategy

```
RC-1    Single ring editing (create, move, insert, delete vertices)
RC-2    Measurements (area, perimeter, bounding box)
RC-3    Constraints (snap, min edge, min area, deduplicate)
RC-4    Diagnostics integration (self-intersection, winding, zero-area)
RC-5    Multiple rings (hole editing)
```

RC-1 is the implementation milestone. RC-2 through RC-5 are planned but not scheduled.

---

## Non-goals (explicit)

- No hole/ring editing in RC-1 (data model supports it, UI doesn't)
- No polygon boolean operations (union, subtract, intersect)
- No bezier/spline curves on polygon edges
- No texture or pattern fills (those belong in renderers, not the engine)
- No metadata editing (name, color, type — belongs in Inspector)

---

## Acceptance Criteria

1. Create a polygon with 3+ vertices via the editor
2. Move a vertex by dragging
3. Insert a vertex by clicking on an edge midpoint
4. Delete a vertex (min 3 remain)
5. Close the polygon (last vertex snaps to first)
6. Area and perimeter are reported for a given polygon
7. Self-intersecting polygon is detected
8. Polygon renders with configurable fill/stroke style
9. Multiple renderers (Room, Building, Boundary) consume PolygonRenderer
10. All existing tests still pass

---

## Related

- ADR-016 — Geometry Engine Principles (constitution this engine follows)
- `spec/RC-PARAMETRIC-ENGINE.md` — established the single-renderer/themed-consumers pattern
- LGE (`src/components/floor-editor/`) — session/hook/overlay pattern this engine mirrors
