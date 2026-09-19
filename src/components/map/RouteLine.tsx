'use client'

import { useEffect, useRef } from 'react'
import maplibregl, { type ExpressionSpecification } from 'maplibre-gl'
import { splitRouteByFloor } from '@/lib/route-floors'
import { cssVar } from '@/components/map/mapTheme'
import type { NavigationSegment } from '@/components/map/NavigationContext'

interface RouteLineProps {
  map: maplibregl.Map | null
  route: { path: string[]; cost: number } | null
  getNodePosition: (nodeId: string) => { lat: number; lng: number } | undefined
  /** Floor of a route node — enables per-floor emphasis. */
  getNodeFloor?: (nodeId: string) => number | undefined
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

const LAYER_IDS = ['route-glow', 'route-core', 'route-flow'] as const
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

function removeRouteLayers(map: maplibregl.Map | null | undefined) {
  if (!map) return
  for (const id of LAYER_IDS) {
    if (map.getLayer(id)) map.removeLayer(id)
  }
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
}

export function RouteLine({ map, route, getNodePosition, getNodeFloor, activeFloor, navigationSegment, fitCamera = true }: RouteLineProps) {
  // Re-fit the camera only when the route itself changes, not on floor switches.
  const fittedPathRef = useRef('')

  useEffect(() => {
    if (!map) return

    removeRouteLayers(map)

    if (!route || route.path.length < 2) return

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
      if (coords.length < 2) continue
      allCoords.push(...coords)
      // Emphasis: floor-based when multi-floor; otherwise driven by the
      // navigation phase (loud indoors, quiet outdoor/entrance). Same `active`
      // channel as always — emphasis, never a restyle.
      const active = multiFloor
        ? (seg.floor === activeFloor ? 1 : 0)
        : (navigationSegment === 'indoor' || navigationSegment === 'floor-transition' ? 1 : 0)
      features.push({
        type: 'Feature',
        properties: { active },
        geometry: { type: 'LineString', coordinates: coords },
      })
    }
    if (features.length === 0) return

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features },
    })

    map.addLayer({
      id: 'route-glow',
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': ACTIVE_COLOR,
        'line-width': 12,
        'line-opacity': ['case', ['==', ['get', 'active'], 1], 0.3, 0.08],
        'line-blur': 4,
      },
    })

    map.addLayer({
      id: 'route-core',
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': ACTIVE_COLOR,
        'line-width': ['case', ['==', ['get', 'active'], 1], 4, 2.5],
        'line-opacity': ['case', ['==', ['get', 'active'], 1], 1, 0.45],
      },
    })

    map.addLayer({
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

    return () => {
      try { removeRouteLayers(map) } catch { /* map may be gone */ }
    }
  }, [activeFloor, fitCamera, getNodeFloor, getNodePosition, map, navigationSegment, route])

  return null
}
