'use client'

import { useEffect } from 'react'
import maplibregl from 'maplibre-gl'

interface RouteLineProps {
  map: maplibregl.Map | null
  route: { path: string[]; cost: number } | null
  getNodePosition: (nodeId: string) => { lat: number; lng: number } | undefined
}

const LAYER_IDS = ['route-glow', 'route-core', 'route-flow'] as const
const SOURCE_ID = 'route'

function removeRouteLayers(map: maplibregl.Map) {
  for (const id of LAYER_IDS) {
    if (map.getLayer(id)) map.removeLayer(id)
  }
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
}

export function RouteLine({ map, route, getNodePosition }: RouteLineProps) {
  useEffect(() => {
    if (!map) return

    removeRouteLayers(map)

    if (!route || route.path.length < 2) return

    const coords: [number, number][] = []
    for (const nodeId of route.path) {
      const pos = getNodePosition(nodeId)
      if (pos) coords.push([pos.lng, pos.lat] as [number, number])
    }

    if (coords.length < 2) return

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      }],
    }

    map.addSource(SOURCE_ID, { type: 'geojson', data: geojson })

    map.addLayer({
      id: 'route-glow',
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': '#3b82f6',
        'line-width': 12,
        'line-opacity': 0.3,
        'line-blur': 4,
      },
    })

    map.addLayer({
      id: 'route-core',
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': '#3b82f6',
        'line-width': 4,
      },
    })

    map.addLayer({
      id: 'route-flow',
      type: 'line',
      source: SOURCE_ID,
      paint: {
        'line-color': '#ffffff',
        'line-width': 2,
        'line-dasharray': [0.5, 2],
      },
    })

    const first = coords[0]
    const bounds = coords.reduce(
      (b, c) => b.extend(c as [number, number]),
      new maplibregl.LngLatBounds(first, first),
    )
    map.fitBounds(bounds, { padding: 80 })

    return () => {
      try { removeRouteLayers(map) } catch { /* map may be gone */ }
    }
  }, [map, route, getNodePosition])

  return null
}
