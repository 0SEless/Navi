# Interior Canvas Specification v1

Date: 2026-07-19
Status: Draft
Parent: Interior Editor Workspace v1
Next: Interior Tool System

## Purpose

Define how the indoor navigation model gets created — the authoring surface, drawing model, and construction order. This document is behavior-first. It answers *how does the indoor map get created?*, not *what does it look like?*

---

## 1. Canvas Philosophy

The Interior Canvas is a CAD-like authoring surface for creating a building's indoor navigation model. It combines a floor plan reference image with editable vector geometry and navigation data.

**It is a geometry authoring environment. It never edits navigation behavior.**
**Navigation behavior is derived by the Graph Compiler.**

Every tool in the Canvas edits geometry or metadata. No tool edits compiled artifacts (nodes, edges, routing preferences). The Canvas creates and edits the source data that the Graph Compiler transforms into the navigation graph.

It is NOT:
- A map rendering engine (MapLibre owns that)
- A general-purpose drawing tool (it only draws navigation entities)
- A design tool (it models real physical spaces)

The canvas produces one output: a structured indoor navigation graph that the NAVI runtime uses for routing.

---

## 2. Coordinate System

Four coordinate spaces must coexist. Their relationship must be clearly defined to prevent alignment bugs.

### World Coordinates (WGS84 — lat/lng)

The outdoor reference frame. Used only for:
- Building footprint position
- Entrance geolocation
- Outdoor-to-indoor graph connection

The canvas never edits in world space, but every entity must be convertible to it for routing.

### Floor Coordinates (meters, local origin)

The authoring frame. Each floor has a local origin (0,0) that corresponds to the building's footprint corner after calibration.

All drawing, snapping, and navigation logic operates in floor coordinates.

### Pixel Coordinates (screen space)

Temporary mapping from floor coordinates to screen pixels. Determined by:
- Current zoom level
- Pan offset
- Device pixel ratio

Pixel coordinates are ephemeral — they are recalculated on every frame and never stored.

### Navigation Coordinates (graph node positions)

Subset of floor coordinates. Every navigation node (hallway endpoint, space anchor, stair connection, elevator connection) is stored as a floor-coordinate point.

### Conversion Chain

```
Pixel (screen)  ←  Floor (meters)  ←  World (lat/lng)
```

Upload calibration establishes the Floor→World mapping. The canvas UI handles Pixel→Floor. The runtime handles Floor→World.

---

## 3. Layer Stack

Rendered bottom to top. Every layer is optional except Grid.

| Order | Layer | Type | Description |
|-------|-------|------|-------------|
| 1 | Grid | Background | Fixed grid for alignment. Spacing = 1m. Subdivisions at 0.25m. |
| 2 | Reference Floor Plan | Image | Uploaded and calibrated floor plan. Immutable once calibrated. |
| 3 | Hallways | Vector | Polygon/polyline overlay for corridors. |
| 4 | Spaces | Vector | Polygon overlay for spaces. |
| 5 | Stairs / Elevators | Vector | Marker + connector overlay for vertical circulation. |
| 6 | Entrances | Marker | Building entrance markers at floor boundary. |
| 7 | Panorama Nodes | Marker | 360° photo capture points. |
| 8 | Navigation Graph | Graph | Routing nodes and edges derived from geometry. |
| 9 | Interaction Handles | Overlay | Draggable vertices, midpoints, rotation handles. |
| 10 | Selection Overlay | Overlay | Highlighted geometry, bounding box, transform controls. |

Layers 1–8 are data layers. Layers 9–10 are interaction layers. Interaction layers never persist.

---

## 4. Floor Plan Lifecycle

```
Empty
  │
  ├── [Upload Image] ──────────────────┐
  │                                    │
  ▼                                    │
Calibrating                            │
  │                                    │
  ├── [Set Scale & Origin]             │
  │                                    │
  ▼                                    │
Reference Active ──────────────────────┤
  │                                    │
  ├── [Replace] → Upload (recalibrate) │
  │                                    │
  ├── [Remove] → Empty                 │
  │                                    │
  ▼                                    │
Locked (geometry depends on it)        │
  │                                    │
  └── Force Remove (destroys geometry) │
                                       │
  [Start Drawing] ─────────────────────┘
```

### Upload
- Supported: PNG, JPEG, PDF (rasterized)
- Max resolution: 4096×4096 px
- Stored per-floor, not per-building

### Calibration
- User sets two known points: assigns floor coordinates (meters) to pixel positions
- Canvas computes scale (px/m) and rotation
- After calibration, the image is locked in position — it cannot be accidentally moved

### Replace
- Re-upload a new image for the same floor
- If geometry exists: keep geometry, recalibrate image to match existing scale
- If geometry depends on specific image features: user may need to re-align

### Remove
- If no geometry exists: image removed, floor returns to Empty
- If geometry exists: warn user, force remove destroys geometry

### Start Drawing (no image)
- Canvas enters Drawing state with Grid only (no reference layer)
- User traces spaces and hallways freehand
- All coordinates are relative to floor origin (0,0)

---

## 5. Drawing Model

### Space Geometry

- Spaces are **closed polygons** (4+ vertices)
- Spaces may share walls with adjacent spaces (adjacent edges snap)
- Spaces must not overlap (validation error)
- Minimum space area: 1m²
- Vertices can be added/removed after creation

### Hallway Geometry

- Hallways are **closed polygons** or **open polylines** with a defined width
- If polyline + width: defined by path and width property (editable)
- If polygon: defined by explicit vertices (like spaces)
- Hallways may intersect (corridors crossing is normal)
- Hallway width is uniform per segment

### Space-Hallway Relationship

- Spaces connect to hallways via shared edges (doors are implicit)
- A space must have at least one hallway adjacency to be reachable
- If a space has no hallway adjacency, it is unreachable (validation warning)

### Vertical Entities (Stairs / Elevators)

- Represented as **point markers** on each connected floor
- Paired: Stair A on Floor 1 connects to Stair A on Floor 2
- Visualized as icon + label on each floor
- Connection is defined by matching identifier across floors, not by canvas position

### Entrance Markers

- Placed on the perimeter of a floor plan
- Linked to the building footprint (which side of the building)
- Outdoor graph connects to entrance markers

### Panorama Nodes

- Point markers placed in spaces or hallways
- Store: position (floor coords), heading (degrees), capture date
- No geometry — purely informational markers for the runtime

---

## 6. Selection

| Action | Behavior |
|--------|----------|
| Single click | Select one entity. Deselect all others. |
| Shift + click | Toggle entity in current selection set. |
| Drag (empty space) | Box select — select all entities within rectangle. |
| Double click | Select entity + enter vertex edit mode. |
| Escape | Deselect all. |
| Delete | Delete selected entities (with confirmation if destructive). |
| Click on empty canvas | Deselect all. |

Selection is exclusive by default, additive with Shift.

---

## 7. Navigation Graph

This is the core output of the Interior Canvas.

### Graph Structure

- **Nodes**: hallway endpoints, space centers (derived), stair points, elevator points, entrance points, panorama points
- **Edges**: hallway paths (auto-generated from hallway geometry), space→hallway connections (auto-generated at shared edges), stair/elevator connections (cross-floor, manually linked)

### Automatic Generation

When hallways are drawn, their routing paths are generated automatically by the Graph Compiler. The administrator never sees or edits these — they only see the hallway shape they drew. When spaces are created adjacent to hallways, a connection edge is generated at the shared boundary.

### Manual Overrides

Administrators can:
- Add waypoint nodes (for complex intersections)
- Add/remove edges (for custom routing)
- Mark edges as one-way
- Set edge weight (length in meters — auto-calculated, manually overridable)

### Node Types

| Type | Auto-generated | Connectable To |
|------|---------------|----------------|
| Hallway endpoint | Yes (at ends and turns) | Space anchor, stair, elevator, entrance |
| Space anchor | Yes (centroid of space) | Hallway endpoint |
| Stair point | No (placed manually) | Stair point on another floor |
| Elevator point | No (placed manually) | Elevator point on another floor |
| Entrance point | Yes (at entrance marker) | Nearest hallway endpoint |
| Panorama point | Yes (at panorama marker) | Nearest hallway endpoint or space anchor |
| Waypoint | No (placed manually) | Any node |

---

## 8. Canvas States

```
Empty
  No floor plan. No geometry.

  ↓ [Upload] or [Start Drawing]

Reference Loaded
  Floor plan visible. No geometry yet.

  ↓ [Draw First Entity]

Drawing
  User is creating or editing geometry.

  ↓ [Finish Entity]

Editing
  Selected entities have interaction handles.
  User can move, resize, add/remove vertices.

  ↓ [Validate]

Validation
  Canvas highlights errors and warnings (see §11).

  ↓ [All Clear]

Ready
  Floor has a valid navigation graph.
  Can be published as part of the building.
```

The canvas state is per-floor. Switching floors does not reset the state.

---

## 9. Snapping

All snapping is to floor coordinates (meters), not pixels.

| Snap Type | Target | Tolerance |
|-----------|--------|-----------|
| Grid snap | Grid intersections | 0.25m (subdivision) |
| Vertex snap | Existing entity vertices | 0.5m |
| Midpoint snap | Edge midpoints | 0.5m |
| Edge snap | Existing entity edges | 0.5m |
| Right-angle snap | 0°, 45°, 90° increments | 5° |
| Hallway adjacency | Space edge to hallway edge | 0.1m (auto-merge) |

Users can toggle snapping globally or per-snap-type. Default: all on.

---

## 10. View Controls

| Control | Behavior |
|---------|----------|
| Scroll wheel | Zoom (centered on cursor) |
| Middle mouse drag | Pan |
| Space + drag | Pan (same as Tool Dock Space behavior) |
| Ctrl+0 | Fit all content to viewport |
| Ctrl+1 | Zoom to 100% (1m = 1m on screen at default zoom) |
| Double-click empty | Zoom to fill viewport |

No rotation (interior maps are always north-up).

Mini-map: small overview in the bottom-right corner showing current viewport rectangle over the full floor. Not editable — reference only.

---

## 11. Validation Overlay

Validation runs on demand (user clicks Validate) and automatically after every edit (debounced 2s).

Errors and warnings are rendered directly on the canvas, not just in a panel.

### Error Rendering

| Problem | Visual |
|---------|--------|
| Space not connected to hallway | Space outline turns red |
| Overlapping spaces | Intersection area fills with red stripes |
| Hallway with zero width | Hallway outline turns red |
| Entrance not connected to hallway path | Entrance marker turns red with dashed line to nearest path |
| Stair/elevator missing paired floor connection | Marker shows broken-link icon |
| Self-intersecting polygon | Polygon outline turns red with error marker at intersection |

### Warning Rendering

| Problem | Visual |
|---------|--------|
| Space has no name | Space fill gets yellow tint |
| Unreachable space (connected via single path that could be blocked) | Space outline turns amber with caution icon |
| Panorama node with no heading set | Panorama marker shows yellow dot |
| Dead-end hallway longer than 20m | Hallway end highlights amber |

### Validation Panel

A compact overlay in the canvas corner:

```
Validation

3 errors   2 warnings

[ Fix All ]  [ Dismiss ]
```

Clicking an error/warning in the panel pans the canvas to that location.

---

## 12. Performance Rules

| Scenario | Target |
|----------|--------|
| Floor with 1–50 spaces | 60fps, instant interactions |
| Floor with 50–200 spaces | 60fps, <100ms interaction latency |
| Floor with 200–500 spaces | 30fps+ for view, <200ms interaction |
| Floor with 500+ spaces | Graceful degradation — simplify rendering, disable auto-validation |
| Navigation graph with 1000+ nodes | Spatial indexing (grid cell partitioning), LOD node rendering |
| Floor plan image (>2048px) | Mipmapped, rendered at screen resolution |

Large floors must not crash the editor. At high entity counts, interaction handles and selection overlay should simplify or hide automatically.

---

## 13. Construction Order

The recommended workflow. The canvas should gently guide users through this sequence even without enforcing it.

```
1. Upload Floor Plan (or Start Drawing)
     ↓
2. Calibrate (if uploaded)
     ↓
3. Trace Hallways
     ↓
4. Create Spaces
     ↓
5. Place Entrances
     ↓
6. Connect Stairs
     ↓
7. Connect Elevators
     ↓
8. Place Panoramas
     ↓
9. Validate
     ↓
10. Repeat for each floor
     ↓
11. Exit Interior Editor
```

Each step builds on the previous. Hallways must exist before spaces can connect to them. Entrances must connect to hallways. Stairs/elevators span floors and are the last structural step.

The canvas can suggest the next step if the user appears stuck (e.g., "No spaces yet — would you like to create one?"), but should never block the user from working out of order.
