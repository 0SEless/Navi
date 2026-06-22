### Task 11: Build Public Map View

**Files:**
- Create: `src/components/map/PublicMap.tsx`
- Modify: `src/app/(public)/map/page.tsx`

**Context:** There's already an existing public map page at `src/app/(public)/map/page.tsx`. Replace its placeholder content with a functional map.

- [ ] **Step 1: Read existing `src/app/(public)/map/page.tsx`**

- [ ] **Step 2: Create `src/components/map/PublicMap.tsx`**

```typescript
'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useGraphStore } from '@/store/graph-store'
import type { LatLng, PathResult } from '@/types/nav-types'

const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' as const }],
}

export function PublicMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const graph = useGraphStore((s) => s.graph)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [path, setPath] = useState<PathResult | null>(null)

  // Initialize map
  useEffect(() => {
    if (mapRef.current) return
    const map = new maplibregl.Map({
      container: mapContainerRef.current!,
      style: OSM_STYLE,
      center: [122.0922, 11.8195],
      zoom: 17,
    })
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Render buildings and route when graph/path changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    // Buildings layer
    const buildingFeatures = graph.buildings.map((b) => ({
      type: 'Feature' as const,
      id: b.id,
      properties: { name: b.name, code: b.code },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [b.outline?.map((p) => [p.lng, p.lat]) ?? []],
      },
    }))

    const routeFeatures = path
      ? [{
          type: 'Feature' as const,
          properties: {},
          geometry: {
            type: 'LineString' as const,
            coordinates: path.path.map((nid) => {
              const node = graph.getNode(nid)
              return node ? [node.position.lng, node.position.lat] : null
            }).filter(Boolean),
          },
        }]
      : []

    // Add sources for buildings and route
    try {
      if (!map.getSource('public-buildings')) {
        map.addSource('public-buildings', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: buildingFeatures },
        })
        map.addLayer({
          id: 'public-buildings-fill',
          type: 'fill',
          source: 'public-buildings',
          paint: { 'fill-color': '#1C6BEB', 'fill-opacity': 0.15 },
        })
        map.addLayer({
          id: 'public-buildings-outline',
          type: 'line',
          source: 'public-buildings',
          paint: { 'line-color': '#1C6BEB', 'line-width': 2 },
        })
      } else {
        const src = map.getSource('public-buildings') as maplibregl.GeoJSONSource
        src.setData({ type: 'FeatureCollection', features: buildingFeatures })
      }

      if (routeFeatures.length > 0) {
        if (!map.getSource('public-route')) {
          map.addSource('public-route', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: routeFeatures },
          })
          map.addLayer({
            id: 'public-route-line',
            type: 'line',
            source: 'public-route',
            paint: { 'line-color': '#06B6D4', 'line-width': 4, 'line-opacity': 0.8 },
          })
        } else {
          const src = map.getSource('public-route') as maplibregl.GeoJSONSource
          src.setData({ type: 'FeatureCollection', features: routeFeatures })
        }
      } else if (map.getSource('public-route')) {
        const src = map.getSource('public-route') as maplibregl.GeoJSONSource
        src.setData({ type: 'FeatureCollection', features: [] })
      }
    } catch { /* map not ready yet */ }
  }, [graph, path])

  const handleRoute = useCallback(() => {
    if (!from || !to) return
    const result = graph.findPath(from, to)
    setPath(result)
  }, [graph, from, to])

  const nodeOptions = graph.nodes
    .filter((n) => n.type !== 'corner' && n.type !== 'wall')
    .map((n) => ({ id: n.id, name: n.name, type: n.type }))

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Search / route panel */}
      <div style={{ padding: 12, background: '#0D1526', borderBottom: '1px solid #1E3A5F', display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={from} onChange={(e) => setFrom(e.target.value)}
          style={{ background: '#111827', border: '1px solid #1E3A5F', borderRadius: 5, padding: '6px 8px', color: '#E2E8F0', fontSize: 11 }}>
          <option value="">From...</option>
          {nodeOptions.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        <select value={to} onChange={(e) => setTo(e.target.value)}
          style={{ background: '#111827', border: '1px solid #1E3A5F', borderRadius: 5, padding: '6px 8px', color: '#E2E8F0', fontSize: 11 }}>
          <option value="">To...</option>
          {nodeOptions.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        <button onClick={handleRoute}
          style={{ padding: '6px 14px', background: '#1C6BEB', border: 'none', borderRadius: 5, color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          Route
        </button>
      </div>

      {/* Map */}
      <div ref={mapContainerRef} style={{ flex: 1 }} />

      {/* Route steps */}
      {path && (
        <div style={{ padding: 12, background: '#0D1526', borderTop: '1px solid #1E3A5F', maxHeight: 200, overflowY: 'auto' }}>
          <div style={{ color: '#94A3B8', fontSize: 10, fontWeight: 600, marginBottom: 6 }}>ROUTE ({Math.round(path.cost)}m)</div>
          {path.steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 11, color: '#E2E8F0' }}>
              <span style={{ color: '#475569', minWidth: 16 }}>{i + 1}.</span>
              <span style={{ flex: 1 }}>{step.instruction}</span>
              {step.distance > 0 && <span style={{ color: '#475569' }}>{Math.round(step.distance)}m</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Update `src/app/(public)/map/page.tsx`**

```typescript
'use client'

import { useEffect } from 'react'
import { PublicMap } from '@/components/map/PublicMap'
import { useGraphStore } from '@/store/graph-store'

export default function MapPage() {
  const load = useGraphStore((s) => s.load)

  useEffect(() => {
    load()
  }, [load])

  return <PublicMap />
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/map/PublicMap.tsx src/app/\(public\)/map/page.tsx
git commit -m "feat: add public map view with routing"
```
