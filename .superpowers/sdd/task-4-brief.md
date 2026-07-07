### Task 4: Route Endpoint Extend via Drag

**Files:**
- Modify: `navi-next/src/components/studio/useVertexEditor.ts`

**Interfaces:**
- Consumes: `useVertexEditor(map, trace, onSave)` — same API
- Produces: dragging an endpoint vertex (index 0 or last) outward beyond the adjacent point appends a new segment instead of moving the point

Detection logic: When the dragged endpoint's distance to the adjacent point increases (compared to pre-drag), it's an extend. When it decreases, it's a normal move.

- [ ] **Step 1: Add extend detection in useVertexEditor**

In `handleMouseDown`, store the original adjacent point position. In `handleMouseMove`, detect extend for endpoints.

Add after `const dragStartRef = useRef<LatLng | null>(null)` (line 62):
```ts
const dragOriginalsRef = useRef<{ adjacentPoint?: LatLng; isEndpoint: boolean }>({ isEndpoint: false })
```

In `handleMouseDown` (line 144–150), after setting `selectedIdxRef.current = idx`:
```ts
dragOriginalsRef.current = {
  isEndpoint: idx === 0 || idx === pointsRef.current.length - 1,
  adjacentPoint: idx === 0 && pointsRef.current.length > 1
    ? { ...pointsRef.current[1] }
    : idx === pointsRef.current.length - 1 && pointsRef.current.length > 1
      ? { ...pointsRef.current[pointsRef.current.length - 2] }
      : undefined,
}
```

Modify `handleMouseMove` (around line 152–159) to add endpoint extend detection:
```ts
const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
  if (selectedIdxRef.current == null || !dragStartRef.current) return
  const idx = selectedIdxRef.current
  const { isEndpoint, adjacentPoint } = dragOriginalsRef.current

  if (isEndpoint && adjacentPoint) {
    const distToAdj = haversine(
      { lat: e.lngLat.lat, lng: e.lngLat.lng },
      adjacentPoint
    )
    const originalDist = haversine(
      dragStartRef.current,
      adjacentPoint
    )
    if (distToAdj > originalDist * 1.1) {
      // Extend: keep original endpoint, append new point
      const newPoints = [...pointsRef.current]
      const insertAt = idx === 0 ? 0 : newPoints.length
      newPoints.splice(insertAt, 0, { lat: e.lngLat.lat, lng: e.lngLat.lng })
      pointsRef.current = newPoints
      selectedIdxRef.current = insertAt
      updateDisplay(newPoints, insertAt)
      return
    }
  }

  // Normal move
  const newPoints = [...pointsRef.current]
  newPoints[idx] = { lat: e.lngLat.lat, lng: e.lngLat.lng }
  pointsRef.current = newPoints
  updateDisplay(newPoints, idx)
}
```

Import `haversine` from geo-utils:
Add at top of file: `import { haversine } from '@/engine/geo-utils'`

- [ ] **Step 2: Verify build compiles**

Run: `cd navi-next && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add navi-next/src/components/studio/useVertexEditor.ts
git commit -m "feat(route): endpoint drag extends route instead of moving vertex"
```
