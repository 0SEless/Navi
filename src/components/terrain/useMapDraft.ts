'use client'

import { useEffect, useRef } from 'react'
import type maplibregl from 'maplibre-gl'
import { styleReady } from '@/lib/terrain/style-ready'

type LatLng = { lat: number; lng: number }

const DRAFT_SOURCE = 'terrain-draft'

/**
 * While `active`, map clicks add points (Escape clears is handled by the caller); the points are drawn
 * as a dashed polygon (`closed`) or line, with dots at the vertices.
 */
export function useMapDraft(map: maplibregl.Map | null, opts: { active: boolean; points: LatLng[]; closed: boolean; onPoint: (p: LatLng) => void }): void {
  const latest = useRef(opts)
  latest.current = opts

  useEffect(() => {
    if (!map) return
    const onClick = (event: maplibregl.MapMouseEvent) => {
      if (!latest.current.active || event.originalEvent.altKey) return
      latest.current.onPoint({ lat: event.lngLat.lat, lng: event.lngLat.lng })
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
  }, [map])

  useEffect(() => {
    if (!map) return
    const draw = () => {
      if (!styleReady(map)) return
      if (!map.getSource(DRAFT_SOURCE)) {
        map.addSource(DRAFT_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({ id: `${DRAFT_SOURCE}-line`, type: 'line', source: DRAFT_SOURCE, paint: { 'line-color': '#7c3aed', 'line-width': 2, 'line-dasharray': [2, 1] } })
        map.addLayer({ id: `${DRAFT_SOURCE}-dots`, type: 'circle', source: DRAFT_SOURCE, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 4, 'circle-color': '#7c3aed' } })
      }
      const { points, closed, active } = latest.current
      const coordinates = points.map((p) => [p.lng, p.lat])
      const features: GeoJSON.Feature[] = active ? coordinates.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } })) : []
      if (active && coordinates.length >= 2) {
        features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: closed && coordinates.length >= 3 ? [...coordinates, coordinates[0]] : coordinates } })
      }
      ;(map.getSource(DRAFT_SOURCE) as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features })
    }
    draw()
    map.on('idle', draw)
    return () => {
      map.off('idle', draw)
    }
  }, [map, opts.points, opts.closed, opts.active])
}
