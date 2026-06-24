'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useGraphStore } from '@/store/graph-store'
import { RouteLine } from '@/components/map/RouteLine'
import { QRScanner } from '@/components/map/QRScanner'
import { useGeolocation } from '@/hooks/useGeolocation'
import { resolvePosition } from '@/engine/spatial-resolver'
import type { LatLng, PathResult } from '@/types/nav-types'

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

export function PublicMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null)
  const graph = useGraphStore((s) => s.graph)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [path, setPath] = useState<PathResult | null>(null)

  const getNodePosition = useCallback((nodeId: string) => {
    const node = graph.getNode(nodeId)
    return node ? node.position : undefined
  }, [graph])

  const geo = useGeolocation()
  const [userNodeId, setUserNodeId] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)

  const handleQrScan = useCallback((nodeId: string) => {
    setScanning(false)
    setQrError(null)
    const resolved = graph.getNode(nodeId)
    if (resolved) {
      setFrom(resolved.id)
      setUserNodeId(resolved.id)
      userNodeRef.current = resolved.id
    }
  }, [graph, setFrom])
  const userNodeRef = useRef<string | null>(null)
  const userMarkerRef = useRef<maplibregl.Marker | null>(null)

  // Resolve geolocation to nearest nav node
  useEffect(() => {
    if (geo.latitude == null || geo.longitude == null) return
    if (graph.nodes.length === 0) return
    const resolved = resolvePosition(
      graph as any,
      { lat: geo.latitude, lng: geo.longitude },
      { maxDistance: 50 },
    )
    if (resolved) {
      setUserNodeId(resolved.id)
      userNodeRef.current = resolved.id
      if (!from) setFrom(resolved.id)
    }
  }, [geo.latitude, geo.longitude, graph])

  // Show/hide user location marker on the map
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!geo.latitude || !geo.longitude) {
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      return
    }
    if (!userMarkerRef.current) {
      const el = document.createElement('div')
      el.style.width = '16px'
      el.style.height = '16px'
      el.style.background = '#3b82f6'
      el.style.border = '3px solid white'
      el.style.borderRadius = '50%'
      el.style.boxShadow = '0 0 8px rgba(59,130,246,0.6)'
      el.style.pointerEvents = 'none'
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([geo.longitude, geo.latitude])
        .addTo(map)
      userMarkerRef.current = marker
    } else {
      userMarkerRef.current.setLngLat([geo.longitude, geo.latitude])
    }
  }, [mapInstance, geo.latitude, geo.longitude])

  useEffect(() => {
    if (mapRef.current) return
    const map = new maplibregl.Map({
      container: mapContainerRef.current!,
      style: OSM_STYLE,
      center: [122.0922, 11.8195],
      zoom: 17,
    })
    mapRef.current = map
    setMapInstance(map)
    return () => { map.remove(); mapRef.current = null; setMapInstance(null) }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    const buildingFeatures = graph.buildings.map((b) => ({
      type: 'Feature' as const,
      id: b.id,
      properties: { name: b.name, code: b.code },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [b.outline?.map((p) => [p.lng, p.lat]) ?? []],
      },
    }))

    try {
      if (!map.getSource('public-buildings')) {
        map.addSource('public-buildings', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: buildingFeatures },
        })
        map.addLayer({
          id: 'public-buildings-fill',
          type: 'fill',
          source: 'public-buildings',
          paint: { 'fill-color': '#1C6BEB', 'fill-opacity': 0.15 },
        })
        map.addLayer({
          id: 'public-buildings-outline',
          type: 'line',
          source: 'public-buildings',
          paint: { 'line-color': '#1C6BEB', 'line-width': 2 },
        })
      } else {
        const src = map.getSource('public-buildings') as maplibregl.GeoJSONSource
        src.setData({ type: 'FeatureCollection', features: buildingFeatures })
      }
    } catch { /* map not ready yet */ }
  }, [mapInstance, graph])

  const handleRoute = useCallback(() => {
    if (!from || !to) return
    const result = graph.findPath(from, to)
    setPath(result)
  }, [graph, from, to])

  const nodeOptions = graph.nodes
    .filter((n) => n.type !== 'corner')
    .map((n) => ({ id: n.id, name: n.name, type: n.type }))

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 10, background: 'var(--navi-card)', borderBottom: '1px solid var(--navi-border)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={from} onChange={(e) => setFrom(e.target.value)}
          style={{ background: 'var(--navi-content)', border: '1px solid var(--navi-border)', borderRadius: 5, padding: '5px 8px', color: 'var(--navi-text)', fontSize: 11 }}>
          <option value="">From...</option>
          {nodeOptions.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        <select value={to} onChange={(e) => setTo(e.target.value)}
          style={{ background: 'var(--navi-content)', border: '1px solid var(--navi-border)', borderRadius: 5, padding: '5px 8px', color: 'var(--navi-text)', fontSize: 11 }}>
          <option value="">To...</option>
          {nodeOptions.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        <button onClick={handleRoute}
          style={{ padding: '5px 12px', background: 'var(--navi-primary)', border: 'none', borderRadius: 5, color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          Route
        </button>
        <button onClick={() => setScanning(true)}
          style={{ padding: '5px 10px', background: scanning ? 'var(--navi-success)' : 'var(--navi-content)', border: '1px solid var(--navi-border)', borderRadius: 5, color: scanning ? 'white' : 'var(--navi-text-secondary)', fontSize: 11, cursor: 'pointer' }}>
          {scanning ? 'Scanning...' : 'QR Scan'}
        </button>
        {geo.loading && <span style={{ color: 'var(--navi-text-secondary)', fontSize: 10 }}>locating...</span>}
        {userNodeId && <span style={{ color: 'var(--navi-success)', fontSize: 10 }}>{userNodeId}</span>}
      </div>

      <div ref={mapContainerRef} style={{ flex: 1 }} />

      <RouteLine map={mapInstance} route={path as { path: string[]; cost: number } | null} getNodePosition={getNodePosition} />

      {path && (
        <div style={{ padding: 10, background: 'var(--navi-card)', borderTop: '1px solid var(--navi-border)', maxHeight: 180, overflowY: 'auto' }}>
          <div style={{ color: 'var(--navi-text-secondary)', fontSize: 10, fontWeight: 600, marginBottom: 4 }}>ROUTE ({Math.round(path.cost)}m)</div>
          {path.steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, padding: '2px 0', fontSize: 10, color: 'var(--navi-text)' }}>
              <span style={{ color: 'var(--navi-text-secondary)', minWidth: 14 }}>{i + 1}.</span>
              <span style={{ flex: 1 }}>{step.instruction}</span>
              {step.distance > 0 && <span style={{ color: 'var(--navi-text-secondary)' }}>{Math.round(step.distance)}m</span>}
            </div>
          ))}
        </div>
      )}

      {scanning && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(15,23,42,0.9)', display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 280, height: 280, borderRadius: 12, overflow: 'hidden' }}>
            <QRScanner
              onScan={handleQrScan}
              onError={(err) => setQrError(err)}
            />
          </div>
          {qrError && <p style={{ color: 'var(--navi-error)', fontSize: 12, marginTop: 8 }}>{qrError}</p>}
          <button onClick={() => { setScanning(false); setQrError(null) }}
            style={{ marginTop: 14, padding: '7px 24px', background: 'var(--navi-error)', border: 'none', borderRadius: 6, color: 'white', fontSize: 12, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
