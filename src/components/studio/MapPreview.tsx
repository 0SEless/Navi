'use client'

import { useRef, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useCampusMapStore } from '@/store/campus-map-store'
import { useGraphStore } from '@/store/graph-store'
import type { Building } from '@/types/nav-types'
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

const SRC = 'preview-buildings'
const LYR = 'preview-buildings-extrusion'
const BOUNDARY_SRC = 'preview-boundary'

function buildBuildingGeo(buildings: Building[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: buildings.map((b) => ({
      type: 'Feature',
      properties: { id: b.id, name: b.name, color: b.color || '#1C6BEB', height: b.height || 15 },
      geometry: {
        type: 'Polygon',
        coordinates: b.footprint.length >= 3
          ? [[...b.footprint.map((p) => [p.lng, p.lat] as [number, number]), [b.footprint[0].lng, b.footprint[0].lat] as [number, number]]]
          : (() => {
              const c = b.footprint.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 })
              const avg = { lat: c.lat / b.footprint.length, lng: c.lng / b.footprint.length }
              return [[
                [avg.lng - 0.0003, avg.lat - 0.0003],
                [avg.lng + 0.0003, avg.lat - 0.0003],
                [avg.lng + 0.0003, avg.lat + 0.0003],
                [avg.lng - 0.0003, avg.lat + 0.0003],
                [avg.lng - 0.0003, avg.lat - 0.0003],
              ]]
            })(),
      },
    })),
  }
}

function initSources(map: maplibregl.Map) {
  if (map.getSource(SRC)) return
  map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: LYR, type: 'fill-extrusion', source: SRC, paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': 0.85, 'fill-extrusion-base': 0 } })
}

function addBoundarySource(map: maplibregl.Map) {
  if (map.getSource(BOUNDARY_SRC)) return
  map.addSource(BOUNDARY_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'preview-boundary-fill', type: 'fill', source: BOUNDARY_SRC, paint: { 'fill-color': '#94A3B8', 'fill-opacity': 0.15 } })
  map.addLayer({ id: 'preview-boundary-outline', type: 'line', source: BOUNDARY_SRC, paint: { 'line-color': '#94A3B8', 'line-width': 2, 'line-dasharray': [4, 2], 'line-opacity': 0.5 } })
}

function syncBoundary(map: maplibregl.Map, boundary: { lat: number; lng: number }[]) {
  if (!boundary || boundary.length < 3) return
  const src = map.getSource(BOUNDARY_SRC) as maplibregl.GeoJSONSource
  if (!src) return
  const coords = boundary.map((p) => [p.lng, p.lat] as [number, number])
  src.setData({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]]] }, properties: {} }],
  })
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
  const initRef = useRef(false)

  useEffect(() => {
    loadMapData(mapId)
  }, [mapId, loadMapData])

  // Init map once
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
      initSources(map)
      addBoundarySource(map)
      initRef.current = true
      // Sync buildings immediately — data may have loaded before map was ready
      const src = map.getSource(SRC) as maplibregl.GeoJSONSource
      if (src && graph.buildings.length > 0) src.setData(buildBuildingGeo(graph.buildings))
    })
  }, [campusMap, graph.buildings])

  // Sync buildings whenever they change
  useEffect(() => {
    const map = mapRef.current
    if (!map || !initRef.current || graph.buildings.length === 0) return
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource
    if (src) src.setData(buildBuildingGeo(graph.buildings))
  }, [graph.buildings])

  // Satellite toggle
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setStyle(satellite ? SATELLITE_STYLE : OSM_STYLE)
    map.once('style.load', () => { initSources(map); addBoundarySource(map) })
  }, [satellite])

  // Boundary sync
  useEffect(() => {
    const map = mapRef.current
    if (!map || !campusMap?.boundary || campusMap.boundary.length < 3) return
    syncBoundary(map, campusMap.boundary)
  }, [campusMap?.boundary])

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
