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
