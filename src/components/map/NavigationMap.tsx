'use client'

import { useEffect, useRef, useState, createContext, useContext } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// ── Map Context ────────────────────────────────────────────────

export interface NavigationMapContextValue {
  map: maplibregl.Map | null
  isReady: boolean
}

const NavigationMapContext = createContext<NavigationMapContextValue>({
  map: null,
  isReady: false,
})

export function useNavigationMap() {
  return useContext(NavigationMapContext)
}

// ── Props ──────────────────────────────────────────────────────

export interface NavigationMapProps {
  center?: [number, number]
  zoom?: number
  pitch?: number
  maxZoom?: number
  minZoom?: number
  showZoomControls?: boolean
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null
  fitBoundsOnChange?: boolean
  style?: React.CSSProperties
  className?: string
  onMapReady?: (map: maplibregl.Map) => void
  children?: React.ReactNode
}

// ── Base Style ─────────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────

export default function NavigationMap({
  center = [122.1677, 11.8197],
  zoom = 16,
  pitch = 0,
  maxZoom = 22,
  minZoom = 12,
  showZoomControls = true,
  bounds,
  fitBoundsOnChange = true,
  style,
  className,
  onMapReady,
  children,
}: NavigationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [map, setMap] = useState<maplibregl.Map | null>(null)
  const [isReady, setIsReady] = useState(false)

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const mapInstance = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center,
      zoom,
      pitch,
      maxZoom,
      minZoom,
      attributionControl: false,
    })

    mapInstance.addControl(new maplibregl.NavigationControl({
      showCompass: false,
      showZoom: showZoomControls,
    }), 'bottom-right')
    mapInstance.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    // Suppress tile fetch errors (e.g., zoom beyond OSM tile coverage)
    mapInstance.on('error', (e) => {
      if (e.error?.status === 0 || `${e.error}`.includes('Failed to fetch') || `${e.error}`.includes('CORS')) return
      console.error(e.error)
    })

    mapInstance.on('load', () => {
      mapRef.current = mapInstance
      setMap(mapInstance)
      setIsReady(true)
      onMapReady?.(mapInstance)
    })

    return () => {
      try { mapInstance.remove() } catch {}
      mapRef.current = null
      setMap(null)
      setIsReady(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fit bounds when data arrives
  useEffect(() => {
    if (!map || !bounds || !fitBoundsOnChange) return
    const bb = bounds
    map.fitBounds(
      [[bb.minLng, bb.minLat], [bb.maxLng, bb.maxLat]],
      { padding: 60, duration: 800, maxZoom: 18 }
    )
  }, [bounds, fitBoundsOnChange, map])

  return (
    <NavigationMapContext.Provider value={{ map, isReady }}>
      <div
        ref={containerRef}
        className={className}
        style={{ width: '100%', height: '100%', ...style }}
      />
      {isReady && children}
    </NavigationMapContext.Provider>
  )
}
