'use client'

import { useEffect, useRef } from 'react'
import maplibregl, { type ExpressionSpecification } from 'maplibre-gl'
import { splitRouteByFloor } from '@/lib/route-floors'
import { cssVar } from '@/components/map/mapTheme'
import type { NavigationSegment } from '@/components/map/NavigationContext'

interface RouteLineProps {
  map: maplibregl.Map | null
  route: { path: string[]; cost: number; leadIn?: { lat: number; lng: number } | null } | null
  getNodePosition: (nodeId: string) => { lat: number; lng: number } | undefined
  /** Floor of a route node — enables per-floor emphasis. */
  getNodeFloor?: (nodeId: string) => number | undefined
  /** Building of a route node ('' or '__outdoor__' = outdoors): outdoor parts are always loud. */
  getNodeBuilding?: (nodeId: string) => string | undefined
  /** Floor to highlight in the route color (others render dimmed). */
  activeFloor?: number
  /** Whether this route layer owns the camera fit. Canonical Navigate opts out. */
  fitCamera?: boolean
  /**
   * Current navigation phase. Drives EMPHASIS only — when the user is actively
   * navigating indoors/floor-transition the route is rendered loud; outdoor/
   * entrance phases render it quiet. Does NOT redefine the visual language.
   */
  navigationSegment?: NavigationSegment | null
}

const LAYER_IDS = ['route-glow', 'route-casing', 'route-core', 'route-flow'] as const
const SOURCE_ID = 'route'

// Centralized route styling (spec §4.4) — resolves theme tokens at runtime.
const ROUTE_COLOR = cssVar('--navi-route', '#3B82F6')
const ROUTE_DIM = cssVar('--navi-route-dim', '#94A3B8')
const ROUTE_FLOW = cssVar('--navi-route-flow', '#FFFFFF')

// Active = loud (theme route color), inactive = quiet (dim). The SAME mechanism
// is reused for both floor-based and navigation-segment-based emphasis.
const ACTIVE_COLOR: ExpressionSpecification = [
  'case',
  ['==', ['get', 'active'], 1], ROUTE_COLOR,
  ROUTE_DIM,
]

export function removeRouteLayers(map: maplibregl.Map | null | undefined) {
  if (!map) return
  try {
    for (const id of LAYER_IDS) {
      if (map.getLayer(id)) map.removeLayer(id)
    }
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
  } catch {
    // The map was already removed (its style is gone, e.g. on page change); nothing left to clean up.
  }
}

export function RouteLine({ map, route, getNodePosition, getNodeFloor, getNodeBuilding, activeFloor, navigationSegment, fitCamera = true }: RouteLineProps) {
  // Re-fit the camera only when the route itself changes, not on floor switches.
  const fittedPathRef = useRef('')

  useEffect(() => {
    if (!map) return
    return () => removeRouteLayers(map)
  }, [map])

  useEffect(() => {
    if (!map) return
    if (!route || (route.path.length < 2 && !route.leadIn)) {
      removeRouteLayers(map)
      return
    }

    const posById = new Map<string, [number, number]>()
    for (const nodeId of route.path) {
      const pos = getNodePosition(nodeId)
      if (pos) posById.set(nodeId, [pos.lng, pos.lat] as [number, number])
    }

    const segments = getNodeFloor
      ? splitRouteByFloor(route.path, getNodeFloor)
      : [{ floor: undefined, nodes: route.path }]

    const floorSet = new Set(segments.map((s) => s.floor))
    const multiFloor = getNodeFloor !== undefined && floorSet.size > 1

    const features: GeoJSON.Feature[] = []
    const allCoords: [number, number][] = []
    for (const seg of segments) {
      const coords: [number, number][] = []
      for (const nodeId of seg.nodes) {
        const c = posById.get(nodeId)
        if (c) coords.push(c)
      }
      if (seg === segments[0] && route.leadIn && coords.length > 0) coords.unshift([route.leadIn.lng, route.leadIn.lat])
      if (coords.length < 2) continue
      allCoords.push(...coords)
      // Emphasis: on a multi-floor route the shown floor's part is loud and the other floors' parts dim. A one-floor
      // route is always loud, outdoors too (owner 2026-11-18: "really highlight the route that we are traversing").
      const outdoors = getNodeBuilding !== undefined && seg.nodes.some((id) => { const b = getNodeBuilding(id); return !b || b === '__outdoor__' })
      const active = multiFloor && !outdoors ? (seg.floor === activeFloor ? 1 : 0) : 1
      features.push({
        type: 'Feature',
        properties: { active },
        geometry: { type: 'LineString', coordinates: coords },
      })
    }
    if (features.length === 0) {
      removeRouteLayers(map)
      return
    }

    const routeData: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features }
    const existingSource = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    if (existingSource) {
      existingSource.setData(routeData)
    } else {
      map.addSource(SOURCE_ID, {
      type: 'geojson',
        data: routeData,
      })
    }

    // A bold, glowing route (owner 2026-11-18: "really highlight the route that we are traversing"): a wide soft glow,
    // a white edge and a thick core, all growing with zoom. Inactive parts (other floors, quiet phases) stay thin and dim.
    const active = (on: number, off: number): ExpressionSpecification => ['case', ['==', ['get', 'active'], 1], on, off]
    const byZoom = (z14: [number, number], z18: [number, number], z21: [number, number]): ExpressionSpecification => [
      'interpolate', ['linear'], ['zoom'],
      14, active(...z14), 18, active(...z18), 21, active(...z21),
    ]
    if (!map.getLayer('route-glow')) map.addLayer({
      id: 'route-glow',
      type: 'line',
      source: SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ACTIVE_COLOR,
        'line-width': byZoom([14, 6], [28, 10], [44, 14]),
        'line-opacity': active(0.45, 0.08),
        'line-blur': byZoom([6, 3], [10, 4], [14, 6]),
      },
    })

    if (!map.getLayer('route-casing')) map.addLayer({
      id: 'route-casing',
      type: 'line',
      source: SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#FFFFFF',
        'line-width': byZoom([7, 3.5], [13, 5], [19, 7]),
        'line-opacity': active(0.95, 0.4),
      },
    })

    if (!map.getLayer('route-core')) map.addLayer({
      id: 'route-core',
      type: 'line',
      source: SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ACTIVE_COLOR,
        'line-width': byZoom([4.5, 2], [9, 3], [14, 4.5]),
        'line-opacity': active(1, 0.45),
      },
    })

    if (!map.getLayer('route-flow')) map.addLayer({
      id: 'route-flow',
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': ROUTE_FLOW,
        'line-width': 2,
        'line-dasharray': [0.5, 2],
        'line-opacity': ['case', ['==', ['get', 'active'], 1], 1, 0.2],
      },
    })

    const pathKey = route.path.join('\u0000')
    if (fitCamera && pathKey !== fittedPathRef.current) {
      fittedPathRef.current = pathKey
      if (allCoords.length > 0) {
        const first = allCoords[0]
        const bounds = allCoords.reduce(
          (b, c) => b.extend(c),
          new maplibregl.LngLatBounds(first, first),
        )
        map.fitBounds(bounds, { padding: 80 })
      }
    }

  }, [activeFloor, fitCamera, getNodeBuilding, getNodeFloor, getNodePosition, map, navigationSegment, route])

  return null
}
