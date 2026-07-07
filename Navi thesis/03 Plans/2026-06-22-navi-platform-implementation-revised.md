# NAVI Platform — Revised Implementation Plan (Remaining Tasks)

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement task-by-task.
> **Context:** Tasks 1-12 from the original plan are already implemented in the codebase. This plan covers the 6 remaining tasks, adapted to match the actual codebase conventions.

## Actual Codebase Conventions (MANDATORY)

### Import style
```typescript
import type { NavNode, NavEdge, LatLng } from '@/types/nav-types'
import { useGraphStore } from '@/store/graph-store'
```

### Key types (from src/types/nav-types.ts)
- `Graph.findPath(fromId, toId)` returns `PathResult | null` — `PathResult` has `{ path: string[], cost: number, steps: PathStep[] }`
- `Graph.getNearestNode(position: LatLng, maxDistance = 50): NavNode | null`
- `Graph.getNode(id): NavNode | undefined`
- `Graph.toJSON(): GraphSnapshot` — returns `{ version, campusId, buildings, nodes, edges, components, traces, exportedAt }`
- `Graph.fromJSON(snapshot): Graph` — static factory
- Nodes have `label` field in type def, but `name` is used at runtime in many places
- Nodes have `hasQr?: boolean`, `hasPanorama?: boolean` at runtime (via legacy types)
- `LatLng` = `{ lat: number; lng: number; elevation?: number }`

### Stores
- `useGraphStore` — `graph: Graph`, `syncToSupabase()`, `fetchFromSupabase()`, `save()`, `load()`, `syncStatus`
- `useStudioStore` — `tool: StudioTool`, `activeFloor: number`, `editorMode`, `layers`, `tracePoints`

### Map
- MapLibre GL JS, OSM raster tile style, centered at [122.0922, 11.8195], zoom 17
- StudioCanvas already renders buildings, nodes, edges, rooms, traces
- PublicMap.tsx already renders building outlines + basic route

### Available dependencies (already installed)
- `maplibre-gl`, `html5-qrcode`, `pannellum`, `@turf/turf`, `zustand`

### Code style
- No semicolons, single quotes, 2-space indent
- `'use client'` directive for all client components
- `import type` for type-only imports
- Path alias `@/` maps to `./src/`

---

## Remaining Tasks

### Task A: Spatial Resolver (`src/engine/spatial-resolver.ts`)

**What:** A pure engine module providing GPS and QR-based position snapping.

**API:**
```typescript
function resolvePosition(
  graph: Graph,
  coordinates: LatLng,
  options?: { floor?: number; maxDistance?: number; type?: 'gps' | 'qr'; qrNodeId?: string }
): NavNode | null
```

**Logic:**
- If `type === 'qr'` and `qrNodeId` is given, call `graph.getNode(qrNodeId)` directly
- Otherwise, use haversine-based nearest-node search (like `graph.findNearestNode` but filterable by floor and node type)
- Return `null` if no node within `maxDistance`

**Test:** `src/engine/__tests__/spatial-resolver.test.ts`
- Returns nearest node for GPS coordinates
- Finds node by QR node ID
- Returns null when no node in range
- Respects floor filter

---

### Task B: 2.5D Building Extrusion (`src/components/map/CampusMap.tsx`)

**What:** Add a MapLibre `fill-extrusion` layer to CampusMap.tsx for 3D building visualization.

**CampusMap.tsx is currently empty** (0 lines). Create a full component:

**Spec:**
```tsx
'use client'
import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useGraphStore } from '@/store/graph-store'
import type { Building } from '@/types/nav-types'

const OSM_STYLE = { version: 8, sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256 } }, layers: [{ id: 'osm', type: 'raster', source: 'osm' }] }

export function CampusMap() {
  // Map ref, init map centered at [122.0922, 11.8195], zoom 17
  // On load: add 3D buildings source + fill-extrusion layer
  // Watch graph.buildings — update source data
  // Extrusion color: ASU Green #0F5132, opacity 0.8
  // Height from building.height, base from building.baseElevation
}
```

**Building GeoJSON** — use `b.center` to generate a simple rectangular footprint (±0.0003° around center), with height and base_elevation properties.

**Layers added:**
- `campus-buildings-3d` — type `fill-extrusion`, color `#0F5132`, opacity 0.8, height from property, base from property

---

### Task C: QR Scanner (`src/components/map/QRScanner.tsx`)

**What:** A camera-based QR code scanner component using `html5-qrcode`.

**Spec:**
```tsx
'use client'
import { useEffect, useRef } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

interface QRScannerProps {
  onScan: (nodeId: string) => void
  onError?: (error: string) => void
}

export function QRScanner({ onScan, onError }: QRScannerProps)
```

**Logic:**
- Mount an `Html5Qrcode` instance to `#qr-reader` div element
- Start rear camera (`{ facingMode: 'environment' }`) at 10fps, 250x250 qrbox
- On scanned: parse `node=` param from URL or use raw text, call `onScan`
- Clean up on unmount
- Report camera errors via `onError`

---

### Task D: Panorama Viewer (`src/components/map/PanoramaViewer.tsx`)

**What:** A 360° panorama viewer using Pannellum.

**Spec:**
```tsx
'use client'
import { useEffect, useRef } from 'react'

interface PanoramaViewerProps {
  imageUrl: string
  autoLoad?: boolean
  compass?: boolean
}

export function PanoramaViewer({ imageUrl, autoLoad = true, compass = true }: PanoramaViewerProps)
```

**Logic:**
- Import `pannellum` via script tag or dynamic import
- Use `pannellum.viewer(container, { type: 'equirectangular', panorama: imageUrl, autoLoad, compass })`
- Clean up viewer on unmount
- Container is a full-width/height div with rounded corners

---

### Task E: Route Line Visualizer (`src/components/map/RouteLine.tsx`)

**What:** Renders a multi-layer route line on a MapLibre map with glow + core + flow arrow effect.

**Spec:**
```tsx
'use client'
import { useEffect } from 'react'
import maplibregl from 'maplibre-gl'

interface RouteLineProps {
  map: maplibregl.Map | null
  route: { path: string[]; cost: number } | null  // path = node IDs
  getNodePosition: (nodeId: string) => { lat: number; lng: number } | undefined
}

export function RouteLine({ map, route, getNodePosition }: RouteLineProps)
```

**Layers (3 layers):**
1. `route-glow` — line, color `#3b82f6` (blue), width 12, opacity 0.3, blur 4
2. `route-core` — line, color `#3b82f6`, width 4
3. `route-flow` — line, color `#ffffff`, width 2, dasharray `[0.5, 2]`

**Behavior:**
- Convert route path (node IDs) to coordinate array via `getNodePosition`
- Remove existing route layers before adding new
- Clean up on unmount or route change
- Fit map bounds to route with 80px padding

---

### Task F: GPS Geolocation Hook (`src/hooks/useGeolocation.ts`)

**What:** React hook wrapping the Geolocation API.

**Spec:**
```typescript
'use client'
import { useState, useEffect } from 'react'

interface GeolocationState {
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  error: string | null
  loading: boolean
}

export function useGeolocation(): GeolocationState
```

**Logic:**
- Call `navigator.geolocation.getCurrentPosition()` on mount
- Options: `{ enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }`
- Return latitude, longitude, accuracy, error, loading state
- Fallback if geolocation not supported

---

## Execution Order

All 6 tasks are independent — they touch disjoint files:
- Engine: `src/engine/spatial-resolver.ts` (+ tests)
- Map: `CampusMap.tsx`, `QRScanner.tsx`, `PanoramaViewer.tsx`, `RouteLine.tsx`
- Hook: `useGeolocation.ts`

**Recommended: execute sequentially (one subagent per task) to avoid merge conflicts.**
