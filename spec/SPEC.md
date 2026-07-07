# Route Connection + Vertex Recompile + Node Selection

## WHAT

Three features for the NAVI studio campus map editor:

### Feature 1: Route-to-Route Intersection (Auto-Connect)
When a new route is saved or edited, detect where its polyline crosses or touches existing routes' polylines. At each crossing, create an intersection node, split the existing route's edge at that point, and connect the new route's endpoint to the intersection node. Also handle the endpoint-overlapping-centerline case (T-junction).

### Feature 2: Recompile Trace on Vertex Edit
When a user adjusts route vertices via the "Edit Vertices" button (vertex drag/add/delete), the TracePath's points array is updated, but the compiled graph nodes/edges are stale. A `recompileTrace` method removes old compiled nodes/edges and re-runs compileTrace with the updated points, including re-running intersection detection.

### Feature 3: Selected Node Visual Highlight
When a user clicks a node with the Select tool, the node should visually change color/size to indicate it's selected. Deselect on clicking empty space or pressing Escape.

## Success Criteria

1. **Route auto-connect**: Drawing a connector route that crosses/touches an arterial route creates an intersection node at the crossing. The two routes are connected in the graph. Deleting one route doesn't orphan the intersection node if the other route still references it.

2. **Vertex recompile**: Dragging a trace vertex via "Edit Vertices" updates the graph nodes/edges to match the new trace shape. Old nodes at old positions are removed.

3. **Node highlight**: Clicking a node changes its color from amber (#F59E0B) to cyan (#22D3EE) and increases radius. Clicking empty space restores it. Pressing Escape deselects.

4. **No regressions**: Existing graph operations (add/remove traces, add/remove nodes/edges, syncAllData) continue working. React #185 infinite loop is not reintroduced.

## Pitfalls from ERRORS.md

- **React #185**: All new mutation methods must invalidate `_cachedNodes`, `_cachedEdges`, and `_cachedTraces` after any change
- **Trace intersection edge splitting**: When splitting an existing route's edge at a crossing, the intersection node must track ALL route IDs that reference it via `traceIds: string[]`. When removing a trace, intersection nodes shared with other traces must not be deleted.
