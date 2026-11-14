'use client'
import { useEffect } from 'react'
import maplibregl from 'maplibre-gl'
import { groundPointUnder } from '@/lib/raised-label'
import { cssVar } from '@/components/map/mapTheme'

const SOURCE = 'raised-room-labels'
const ROOM_LABELS_LAYER = 'rooms-labels'

export interface RaisedRoomLabelsProps {
  map: maplibregl.Map | null
  /** The open floor's rooms; null when no floor is open in 2.5D (the normal room names then show). */
  rooms: ReadonlyArray<{ id: string; name: string; center: { lat: number; lng: number } }> | null
  /** Metres above sea level of the open floor's surface (building floor + the floor's height + its slab). */
  surfaceM: number
}

/**
 * Room names on a floor opened in 2.5D. MapLibre draws labels on the ground, so a name for a raised floor is
 * placed where the camera's line of sight through the room's raised centre reaches the ground: on screen it
 * sits over the room. Recomputed as the camera moves; the normal ground-level names are hidden meanwhile.
 */
export function RaisedRoomLabels({ map, rooms, surfaceM }: RaisedRoomLabelsProps) {
  useEffect(() => {
    if (!map || !rooms) return
    let frame = 0
    const features = (): GeoJSON.FeatureCollection => {
      // MapLibre 5: the camera's place and altitude (metres above sea level) live on the transform.
      const transform = map.transform as unknown as { getCameraLngLat?: () => maplibregl.LngLat; getCameraAltitude?: () => number }
      const camera = transform.getCameraLngLat && transform.getCameraAltitude
        ? maplibregl.MercatorCoordinate.fromLngLat(transform.getCameraLngLat(), transform.getCameraAltitude())
        : null
      const out: GeoJSON.Feature[] = []
      for (const room of rooms) {
        if (!room.name) continue
        let groundM = 0
        try { groundM = (map.getTerrain() ? map.queryTerrainElevation([room.center.lng, room.center.lat]) : 0) ?? 0 } catch { groundM = 0 }
        const raised = maplibregl.MercatorCoordinate.fromLngLat(room.center, Math.max(surfaceM, groundM))
        const ground = maplibregl.MercatorCoordinate.fromLngLat(room.center, groundM)
        const at = camera ? groundPointUnder(camera, raised, ground.z) : null
        const lngLat = at ? new maplibregl.MercatorCoordinate(at.x, at.y, 0).toLngLat() : room.center
        out.push({ type: 'Feature', properties: { name: room.name }, geometry: { type: 'Point', coordinates: [lngLat.lng, lngLat.lat] } })
      }
      return { type: 'FeatureCollection', features: out }
    }
    const sync = () => {
      try {
        if (!map.isStyleLoaded() && !map.getStyle()) return
        const data = features()
        const source = map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined
        if (source) source.setData(data)
        else map.addSource(SOURCE, { type: 'geojson', data })
        if (!map.getLayer(SOURCE)) {
          map.addLayer({
            id: SOURCE, type: 'symbol', source: SOURCE,
            layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-allow-overlap': false },
            paint: { 'text-color': cssVar('--navi-text-secondary', '#334155'), 'text-halo-color': cssVar('--navi-card', '#FFFFFF'), 'text-halo-width': 1.5 },
          })
        } else map.moveLayer(SOURCE)
        if (map.getLayer(ROOM_LABELS_LAYER)) map.setLayoutProperty(ROOM_LABELS_LAYER, 'visibility', 'none')
      } catch { /* style not ready or map removed */ }
    }
    const onMove = () => {
      if (frame) return
      frame = requestAnimationFrame(() => { frame = 0; sync() })
    }
    sync()
    map.on('move', onMove)
    map.on('idle', sync)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      map.off('move', onMove)
      map.off('idle', sync)
      try {
        if (map.getLayer(SOURCE)) map.removeLayer(SOURCE)
        if (map.getSource(SOURCE)) map.removeSource(SOURCE)
        if (map.getLayer(ROOM_LABELS_LAYER)) map.setLayoutProperty(ROOM_LABELS_LAYER, 'visibility', 'visible')
      } catch { /* map removed */ }
    }
  }, [map, rooms, surfaceM])
  return null
}
