'use client'

import { useEffect, useRef } from 'react'
import type maplibregl from 'maplibre-gl'
import type { EntranceRenderData } from '@/components/map/NavigationRenderModel'

const SRC = 'entrances'
const LYR = 'entrances-layer'

export interface EntranceLayerProps {
  map: maplibregl.Map | null
  entrances: EntranceRenderData[]
}

export function EntranceLayer({ map, entrances }: EntranceLayerProps) {
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!map || initializedRef.current) return
    if (map.getSource(SRC)) {
      initializedRef.current = true
      return
    }

    map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: LYR,
      type: 'circle',
      source: SRC,
      paint: {
        'circle-radius': 5,
        'circle-color': '#8B5CF6',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#FFFFFF',
      },
    })

    initializedRef.current = true

    return () => {
      if (map.getLayer(LYR)) map.removeLayer(LYR)
      if (map.getSource(SRC)) map.removeSource(SRC)
      initializedRef.current = false
    }
  }, [map])

  useEffect(() => {
    if (!map || !initializedRef.current) return
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined
    if (!src) return

    const features = entrances.map(e => ({
      type: 'Feature' as const,
      properties: { id: e.id, label: e.label, floor: e.floor, buildingId: e.buildingId },
      geometry: { type: 'Point' as const, coordinates: [e.position.lng, e.position.lat] as [number, number] },
    }))

    src.setData({ type: 'FeatureCollection', features })
  }, [map, entrances])

  return null
}
