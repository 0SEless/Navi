'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useCampusMapStore } from '@/store/campus-map-store'
import { Search, ArrowLeft, Check, X, Navigation, MapPin } from 'lucide-react'

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

type WizardStep = 'info' | 'map'

interface NominatimResult {
  display_name: string
  lat: string
  lon: string
  boundingbox: string[]
}

export function CreateMapWizard() {
  const router = useRouter()
  const createMap = useCampusMapStore((s) => s.createMap)
  const maps = useCampusMapStore((s) => s.maps)

  const [step, setStep] = useState<WizardStep>('info')
  const [name, setName] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [campusName, setCampusName] = useState('')

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([])
  const [searching, setSearching] = useState(false)

  const [boundaryPoints, setBoundaryPoints] = useState<{ lat: number; lng: number }[]>([])
  const boundarySourceRef = useRef<string>('boundary-drawing')
  const markerRef = useRef<maplibregl.Marker | null>(null)

  const initMap = useCallback(() => {
    if (mapRef.current || !mapContainerRef.current) return
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: OSM_STYLE,
      center: [122.0922, 11.8195],
      zoom: 4,
    })
    map.on('load', () => {
      map.addSource(boundarySourceRef.current, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'boundary-fill',
        type: 'fill',
        source: boundarySourceRef.current,
        paint: { 'fill-color': '#F97316', 'fill-opacity': 0.15 },
      })
      map.addLayer({
        id: 'boundary-line',
        type: 'line',
        source: boundarySourceRef.current,
        paint: { 'line-color': '#F97316', 'line-width': 3, 'line-dasharray': [4, 4] },
      })
      map.addLayer({
        id: 'boundary-vertices',
        type: 'circle',
        source: boundarySourceRef.current,
        paint: {
          'circle-radius': 6,
          'circle-color': '#F97316',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF',
        },
      })
      setMapReady(true)
    })
    mapRef.current = map
  }, [])

  useEffect(() => {
    if (step === 'map') {
      initMap()
    }
  }, [step, initMap])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      setBoundaryPoints((prev) => [...prev, { lat: e.lngLat.lat, lng: e.lngLat.lng }])
    }

    map.on('click', handleClick)
    return () => { map.off('click', handleClick) }
  }, [mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const src = map.getSource(boundarySourceRef.current) as maplibregl.GeoJSONSource
    if (!src) return

    const points = boundaryPoints
    const features: GeoJSON.Feature[] = []

    if (points.length >= 1) {
      for (const p of points) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: {},
        })
      }
    }
    if (points.length >= 2) {
      const coords = points.map((p) => [p.lng, p.lat])
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: points.length >= 3 ? [...coords, coords[0]] : coords,
        },
        properties: {},
      })
    }
    if (points.length >= 3) {
      const coords = points.map((p) => [p.lng, p.lat])
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]]] },
        properties: {},
      })
    }

    src.setData({ type: 'FeatureCollection', features })
  }, [boundaryPoints, mapReady])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&countrycodes=ph`,
        { headers: { 'Accept-Language': 'en' } }
      )
      const data: NominatimResult[] = await res.json()
      setSearchResults(data)
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  const handleSelectLocation = (result: NominatimResult) => {
    const lat = parseFloat(result.lat)
    const lon = parseFloat(result.lon)
    const map = mapRef.current
    if (!map) return

    map.flyTo({ center: [lon, lat], zoom: 17 })

    if (markerRef.current) markerRef.current.remove()
    markerRef.current = new maplibregl.Marker({ color: '#1C6BEB' })
      .setLngLat([lon, lat])
      .addTo(map)

    setSearchResults([])
    setSearchQuery('')
  }

  const handleConfirmBoundary = () => {
    if (boundaryPoints.length < 3) return
    const centroid = {
      lat: boundaryPoints.reduce((s, p) => s + p.lat, 0) / boundaryPoints.length,
      lng: boundaryPoints.reduce((s, p) => s + p.lng, 0) / boundaryPoints.length,
    }
    const mapId = createMap({
      name,
      schoolName,
      campusName: campusName || undefined,
      boundary: boundaryPoints,
      center: centroid,
    })
    if (mapRef.current) mapRef.current.remove()
    router.push(`/studio/${mapId}/edit`)
  }

  const handleCancelBoundary = () => {
    setBoundaryPoints([])
  }

  const canSubmitInfo = name.trim() && schoolName.trim()

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {step === 'info' ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--navi-text)', margin: 0 }}>Create New Map</h2>
              <p style={{ color: 'var(--navi-text-secondary)', fontSize: 12, margin: '4px 0 0' }}>
                Enter the details of your campus map
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text-secondary)' }}>Map Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Main Campus"
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--navi-border)',
                  background: 'var(--navi-card)',
                  color: 'var(--navi-text)',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text-secondary)' }}>School Name *</label>
              <input
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="e.g., Aklan State University"
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--navi-border)',
                  background: 'var(--navi-card)',
                  color: 'var(--navi-text)',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--navi-text-secondary)' }}>Campus (optional)</label>
              <input
                value={campusName}
                onChange={(e) => setCampusName(e.target.value)}
                placeholder="e.g., Ibajay Campus"
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--navi-border)',
                  background: 'var(--navi-card)',
                  color: 'var(--navi-text)',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => router.push('/studio')}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid var(--navi-border)',
                  background: 'var(--navi-card)',
                  color: 'var(--navi-text-secondary)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => setStep('map')}
                disabled={!canSubmitInfo}
                style={{
                  padding: '8px 20px',
                  borderRadius: 6,
                  border: 'none',
                  background: canSubmitInfo ? 'var(--navi-primary)' : 'var(--navi-border)',
                  color: canSubmitInfo ? '#fff' : 'var(--navi-text-secondary)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: canSubmitInfo ? 'pointer' : 'default',
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, padding: 12, display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, display: 'flex', gap: 8, maxWidth: 480, margin: '0 auto' }}>
              <div style={{ flex: 1, display: 'flex', background: 'var(--navi-card)', borderRadius: 8, border: '1px solid var(--navi-border)', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search location..."
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--navi-text)',
                    fontSize: 12,
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleSearch}
                  disabled={searching}
                  style={{
                    padding: '8px 12px',
                    border: 'none',
                    background: 'var(--navi-primary)',
                    color: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Search size={14} />
                </button>
              </div>
              <button
                onClick={() => { if (mapRef.current) mapRef.current.remove(); router.push('/studio') }}
                style={{
                  padding: '8px 12px',
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
          </div>

          {searchResults.length > 0 && (
            <div style={{ position: 'absolute', top: 52, left: '50%', transform: 'translateX(-50%)', zIndex: 10, width: 400, background: 'var(--navi-card)', border: '1px solid var(--navi-border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
              {searchResults.map((result, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectLocation(result)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    borderBottom: i < searchResults.length - 1 ? '1px solid var(--navi-content)' : 'none',
                    background: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 11,
                    color: 'var(--navi-text)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--navi-content)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                >
                  <MapPin size={12} style={{ flexShrink: 0, marginTop: 1, color: 'var(--navi-primary)' }} />
                  <span>{result.display_name}</span>
                </button>
              ))}
            </div>
          )}

          <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            {boundaryPoints.length < 3 && boundaryPoints.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--navi-text-secondary)', background: 'var(--navi-card)', padding: '4px 12px', borderRadius: 6, border: '1px solid var(--navi-border)', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                {3 - boundaryPoints.length} more point{3 - boundaryPoints.length !== 1 ? 's' : ''} needed to close boundary
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleCancelBoundary}
                disabled={boundaryPoints.length === 0}
                style={{
                  padding: '10px 24px',
                  borderRadius: 8,
                  border: '1px solid var(--navi-border)',
                  background: boundaryPoints.length === 0 ? 'var(--navi-content)' : 'var(--navi-card)',
                  color: boundaryPoints.length === 0 ? 'var(--navi-text-secondary)' : '#EF4444',
                  cursor: boundaryPoints.length === 0 ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                  opacity: boundaryPoints.length === 0 ? 0.5 : 1,
                }}
              >
                <X size={16} /> Cancel
              </button>
              <button
                onClick={handleConfirmBoundary}
                disabled={boundaryPoints.length < 3}
                style={{
                  padding: '10px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: boundaryPoints.length >= 3 ? '#10B981' : 'var(--navi-border)',
                  color: boundaryPoints.length >= 3 ? '#fff' : 'var(--navi-text-secondary)',
                  cursor: boundaryPoints.length >= 3 ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  boxShadow: boundaryPoints.length >= 3 ? '0 2px 8px rgba(16,185,129,0.3)' : 'none',
                  opacity: boundaryPoints.length >= 3 ? 1 : 0.5,
                }}
              >
                <Check size={16} /> Confirm Boundary
              </button>
            </div>
          </div>

          <div ref={mapContainerRef} style={{ flex: 1 }} />
        </div>
      )}
    </div>
  )
}
