'use client'

import { useRef, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useCampusMapStore } from '@/store/campus-map-store'
import { useGraphStore } from '@/store/graph-store'
import { ArrowLeft, Edit, Satellite, Map } from 'lucide-react'

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

const SATELLITE_STYLE = {
  version: 8 as const,
  sources: {
    satellite: {
      type: 'raster' as const,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '&copy; Esri',
    },
  },
  layers: [{ id: 'satellite', type: 'raster' as const, source: 'satellite' as const }],
}

interface MapPreviewProps {
  mapId: string
}

export function MapPreview({ mapId }: MapPreviewProps) {
  const router = useRouter()
  const campusMap = useCampusMapStore((s) => s.maps.find((m) => m.id === mapId))
  const loadMapData = useGraphStore((s) => s.loadMapData)
  const graph = useGraphStore((s) => s.graph)

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [satellite, setSatellite] = useState(false)

  useEffect(() => {
    loadMapData(mapId)
  }, [mapId, loadMapData])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const center = campusMap?.center ?? { lat: 11.8195, lng: 122.0922 }
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [center.lng, center.lat],
      zoom: 17,
      pitch: 60,
      maxPitch: 85,
    })
    mapRef.current = map

    map.on('load', () => {
      if (!campusMap) return

      map.addSource('buildings-extrusion', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'buildings-extrusion-fill',
        type: 'fill-extrusion',
        source: 'buildings-extrusion',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-opacity': 0.85,
          'fill-extrusion-base': 0,
        },
      })
    })
  }, [campusMap])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const buildings = graph.buildings
    if (buildings.length === 0) return

    const src = map.getSource('buildings-extrusion') as maplibregl.GeoJSONSource
    if (!src) return

    const features: GeoJSON.Feature[] = buildings.map((b) => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          ...b.footprint.map((p) => [p.lng, p.lat] as [number, number]),
          [b.footprint[0].lng, b.footprint[0].lat] as [number, number],
        ]],
      },
      properties: {
        id: b.id,
        name: b.name,
        height: b.height || 15,
        color: b.color || '#1C6BEB',
      },
    }))

    src.setData({ type: 'FeatureCollection', features })
  }, [graph])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const style = satellite ? SATELLITE_STYLE : OSM_STYLE
    map.setStyle(style)
    const currentCampusMap = campusMap
    if (currentCampusMap) {
      map.once('style.load', () => {
        map.addSource('buildings-extrusion', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.addLayer({
          id: 'buildings-extrusion-fill',
          type: 'fill-extrusion',
          source: 'buildings-extrusion',
          paint: {
            'fill-extrusion-color': ['get', 'color'],
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-opacity': 0.85,
            'fill-extrusion-base': 0,
          },
        })
      })
    }
  }, [satellite, campusMap])

  if (!campusMap) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--navi-text-secondary)', fontSize: 13 }}>
        Map not found
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 10, display: 'flex', gap: 8 }}>
        <button
          onClick={() => router.push('/studio')}
          style={{
            padding: '7px 12px',
            borderRadius: 8,
            border: '1px solid var(--navi-border)',
            background: 'var(--navi-card)',
            color: 'var(--navi-text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          <ArrowLeft size={14} /> Back
        </button>
      </div>

      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex', gap: 8 }}>
        <button
          onClick={() => setSatellite(!satellite)}
          style={{
            padding: '7px 14px',
            borderRadius: 8,
            border: '1px solid var(--navi-border)',
            background: satellite ? 'var(--navi-primary)' : 'var(--navi-card)',
            color: satellite ? '#fff' : 'var(--navi-text)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 600,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          {satellite ? <Satellite size={14} /> : <Map size={14} />}
          {satellite ? 'Satellite' : 'OSM'}
        </button>
        <button
          onClick={() => router.push(`/studio/${mapId}/edit`)}
          style={{
            padding: '7px 14px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--navi-primary)',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
            fontWeight: 600,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}
        >
          <Edit size={14} /> Edit Map
        </button>
      </div>

      <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
        <div style={{
          background: 'var(--navi-card)',
          border: '1px solid var(--navi-border)',
          borderRadius: 8,
          padding: '8px 16px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navi-text)' }}>{campusMap.name}</div>
          <div style={{ fontSize: 11, color: 'var(--navi-text-secondary)' }}>
            {campusMap.schoolName}{campusMap.campusName ? ` · ${campusMap.campusName}` : ''}
          </div>
        </div>
      </div>

      <div ref={containerRef} style={{ flex: 1 }} />
    </div>
  )
}
