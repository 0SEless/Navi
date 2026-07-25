# RC-POLYGON-ENGINE

**Prerequisite:** ADR-016 (Geometry Engine Principles) — this spec builds on the contract defined there.

**Mission:** Build a geometry engine for closed shapes, just as the Linear Geometry Engine became the geometry engine for paths. The engine edits polygons. It never knows what a room, building footprint, campus boundary, or restricted area is.

---

## Canonical Model

```ts
interface Vertex {
  id: string
  x: number
  y: number
}

interface PolygonEdge {
  id: string
  startVertexId: string
  endVertexId: string
}

interface PolygonRing {
  id: string
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

Ring IDs and vertex IDs survive insertions and deletions — operations reference IDs, not array indices. Edges are computed on demand as first-class interaction targets, mirroring the `Segment` type in EditablePath.

---

## Engine Responsibilities

### Editing

| Operation | Description |
|-----------|-------------|
| `moveVertex(polygon, vertexId, position)` | Move a single vertex by ID |
| `insertVertex(polygon, edgeId, position)` | Insert a vertex on an edge by ID |
| `deleteVertex(polygon, vertexId)` | Remove a vertex (min 3 remain) |
| `splitEdge(polygon, edgeId, t)` | Split edge at parameter t |
| `closePolygon(polygon)` | Close the ring (connect last→first) |
| `setVertex(polygon, vertexId, position)` | Absolute position set by ID |

### Analysis (all pure, deterministic, never mutate)

| Operation | Description |
|-----------|-------------|
| `area(polygon)` | Signed area (positive = CCW). Pure. |
| `perimeter(polygon)` | Sum of edge lengths. Pure. |
| `winding(polygon)` | `'cw'` or `'ccw'`. Pure. |
| `boundingBox(polygon)` | `{ minX, minY, maxX, maxY }`. Pure. |
| `selfIntersects(polygon)` | True if any edges cross. Pure. |
| `convexity(polygon)` | `'convex'` or `'concave'` (future). Pure. |

### Constraints

Hard constraints (cannot happen — prevent the operation):

| Constraint | Description |
|------------|-------------|
| `minVertices(polygon)` | Fewer than 3 vertices after deletion |
| `validCoordinates(polygon)` | NaN or infinite coordinates |

Soft constraints (allowed but emit a diagnostic):

| Constraint | Description |
|------------|-------------|
| `snap(polygon, vertexId, snapTargets)` | Snap to nearby vertices, edges, grid |
| `minEdgeLength(polygon, threshold)` | Warn on sub-threshold edges |
| `minArea(polygon, threshold)` | Warn on zero-area polygons |
| `deduplicateVertices(polygon)` | Remove duplicate adjacent vertices |
| `windingCheck(polygon)` | CW outer ring permitted but warned |

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
  selectedRing: string | null          // ring ID; RC-5 uses this for hole selection
  hoveredVertex: string | null         // vertex ID
  hoveredEdge: string | null           // edge ID
  draggedVertex: string | null         // vertex ID
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
2. Move a vertex by dragging (referenced by ID, not index)
3. Insert a vertex by clicking on an edge midpoint (referenced by edge ID)
4. Delete a vertex (min 3 remain; undo restores it)
5. Close the polygon (last vertex snaps to first)
6. Area and perimeter are reported for a given polygon
7. Self-intersecting polygon is detected
8. Polygon renders with configurable fill/stroke style
9. Multiple renderers (Room, Building, Boundary) consume PolygonRenderer
10. Undo/Redo preserves polygon state through all operations
11. All existing tests still pass

---

## Compatibility

The Polygon Engine does not require an immediate document migration. Existing room polygons and building footprints in `CampusDocument` are adapted to `EditablePolygon` via a stateless adapter, exactly like the Parametric Engine's Compatibility Adapter (RC-2.5):

```text
Current room polygon (Room.polygon)
              ↓
         Adapter
              ↓
      EditablePolygon
```

The adapter is read-only, disposable, and deleted when native storage arrives.

## Future Integration

```
EditablePolygon
       ↓
 PolygonEngine
       ↓
 PolygonRenderer
       ↓
RoomRenderer (or BuildingRenderer, BoundaryRenderer)
       ↓
  Room Compiler (or Building Compiler)
       ↓
 Navigation Package
```

The engine edits. The renderer draws. The compiler processes. The publisher packages. Each layer consumes the previous layer's output — none of them import from the layer below.

## Related

- ADR-016 — Geometry Engine Principles (constitution this engine follows)
- `spec/RC-PARAMETRIC-ENGINE.md` — established the single-renderer/themed-consumers pattern
- LGE (`src/components/floor-editor/`) — session/hook/overlay pattern this engine mirrors
