'use client'

import { useEffect } from 'react'
import type maplibregl from 'maplibre-gl'
import { cssVar } from '@/components/map/mapTheme'
import { styleReady } from '@/lib/terrain/style-ready'

const SRC = 'route-floor'
const EDGE = 'route-floor-edge'
const CORE = 'route-floor-core'

/**
 * The route lying on the 2.5D floors (owner 2026-11-18): strips from routeFloorRibbons, drawn as thin 3D slabs at each
 * floor's height so they show on the floor (the flat route line is hidden under the raised floors).
 */
export function RouteFloorLayer({ map, data }: { map: maplibregl.Map | null; data: GeoJSON.FeatureCollection }) {
  useEffect(() => {
    if (!map) return
    const sync = () => {
      if (!styleReady(map)) return
      try {
        const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined
        if (src) src.setData(data)
        else map.addSource(SRC, { type: 'geojson', data })
        const layer = (id: string, part: string, color: string) => {
          if (map.getLayer(id)) return
          map.addLayer({
            id, type: 'fill-extrusion', source: SRC, filter: ['==', ['get', 'part'], part],
            paint: { 'fill-extrusion-color': color, 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': 1 },
          })
        }
        layer(EDGE, 'edge', '#FFFFFF')
        layer(CORE, 'core', cssVar('--navi-route', '#3B82F6'))
      } catch { /* map removed */ }
    }
    sync()
    map.on('styledata', sync)
    return () => { map.off('styledata', sync) }
  }, [map, data])

  useEffect(() => {
    if (!map) return
    return () => {
      try {
        for (const id of [CORE, EDGE]) if (map.getLayer(id)) map.removeLayer(id)
        if (map.getSource(SRC)) map.removeSource(SRC)
      } catch { /* map removed */ }
    }
  }, [map])
  return null
}
