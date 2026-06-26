'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useGraphStore } from '@/store/graph-store'
import type { Building } from '@/types/nav-types'

interface CampusMapProps {
  center?: [number, number]
  zoom?: number
  interactive?: boolean
  onMapLoaded?: (map: maplibregl.Map) => void
}

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

const CAMPUS_CENTER = { lat: 11.8195, lng: 122.0922 }
const SOURCE_ID = 'campus-buildings'
const LAYER_ID = 'campus-buildings-extrusion'

function buildBuildingGeo(buildings: Building[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: buildings.map((b) => {
      const center = b.center ?? CAMPUS_CENTER
      return {
        type: 'Feature',
        properties: {
          id: b.id,
          name: b.name,
          height: b.height ?? 10,
          base_elevation: b.baseElevation ?? 0,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [center.lng - 0.0003, center.lat - 0.0003],
            [center.lng + 0.0003, center.lat - 0.0003],
            [center.lng + 0.0003, center.lat + 0.0003],
            [center.lng - 0.0003, center.lat + 0.0003],
            [center.lng - 0.0003, center.lat - 0.0003],
          ]],
        },
      }
    }),
  }
}

function addSourceAndLayer(map: maplibregl.Map) {
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer({
    id: LAYER_ID,
    type: 'fill-extrusion',
    source: SOURCE_ID,
    paint: {
      'fill-extrusion-color': '#0F5132',
      'fill-extrusion-opacity': 0.8,
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-base': ['get', 'base_elevation'],
    },
  })
}

function syncBuildings(map: maplibregl.Map, buildings: Building[]) {
  try {
    const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource
    if (src) src.setData(buildBuildingGeo(buildings))
  } catch {
    /* source not ready */
  }
}

export default function CampusMap({
  center = [122.0922, 11.8195],
  zoom = 17,
  interactive = true,
  onMapLoaded,
}: CampusMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)

  const buildings = useGraphStore((s) => s.graph.buildings)

  useEffect(() => {
    if (mapRef.current) return
    let mounted = true
    const map = new maplibregl.Map({
      container: mapContainerRef.current!,
      style: OSM_STYLE,
      center,
      zoom,
      interactive,
    })
    map.on('load', () => {
      if (!mounted) return
      addSourceAndLayer(map)
      readyRef.current = true
      syncBuildings(map, buildings)
      onMapLoaded?.(map)
    })
    mapRef.current = map
    return () => {
      mounted = false
      map.remove()
      mapRef.current = null
      readyRef.current = false
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    syncBuildings(map, buildings)
  }, [buildings])

  return <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
}
