'use client'

import { useEffect, useRef, useState, createContext, useContext } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { SiteArtifact } from '@navi/core'
import { exposeTerrainMapForProbe } from '@/studio-v2/client/test-hooks'

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
  maxPitch?: number
  maxZoom?: number
  minZoom?: number
  showZoomControls?: boolean
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null
  fitBoundsOnChange?: boolean
  style?: React.CSSProperties
  className?: string
  onMapReady?: (map: maplibregl.Map) => void
  /** Terrain plan Task 15: a published campus. The map is campus only (no OSM base) and stays on it. */
  site?: SiteArtifact | null
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

/** Campus only: a plain background; the site layers draw the campus itself. */
const CAMPUS_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': '#e9eee6' } }],
}

const CAMPUS_MARGIN_M = 50
/**
 * The campus zoom-out limit never goes above this: the navigation camera's top view caps the max zoom
 * at 16 (NAVIGATION_TOP_MAX_ZOOM), and MapLibre refuses a max zoom below the min zoom.
 */
const CAMPUS_MAX_MIN_ZOOM = 15

/** The campus box plus 50 m on every side: [[west, south], [east, north]]. */
export function campusMaxBounds(boundary: Array<{ lat: number; lng: number }>): [[number, number], [number, number]] | null {
  if (boundary.length < 3) return null
  const lats = boundary.map((p) => p.lat)
  const lngs = boundary.map((p) => p.lng)
  const s = Math.min(...lats)
  const n = Math.max(...lats)
  const dLat = CAMPUS_MARGIN_M / 111320
  const dLng = CAMPUS_MARGIN_M / (111320 * Math.cos((((s + n) / 2) * Math.PI) / 180))
  return [[Math.min(...lngs) - dLng, s - dLat], [Math.max(...lngs) + dLng, n + dLat]]
}

// ── Component ──────────────────────────────────────────────────

export default function NavigationMap({
  center = [122.1677, 11.8197],
  zoom = 16,
  pitch = 0,
  maxPitch = 60,
  maxZoom = 22,
  minZoom = 12,
  showZoomControls = true,
  bounds,
  fitBoundsOnChange = true,
  style,
  className,
  onMapReady,
  site = null,
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
      style: site ? CAMPUS_STYLE : OSM_STYLE,
      center,
      zoom,
      pitch,
      maxPitch,
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
      // Campus only: the view stays on the campus and zooms out no further than the whole campus.
      const limits = site ? campusMaxBounds(site.boundary) : null
      if (site && limits) {
        mapInstance.setMaxBounds(limits)
        const lats = site.boundary.map((p) => p.lat)
        const lngs = site.boundary.map((p) => p.lng)
        const whole = mapInstance.cameraForBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]])
        if (whole?.zoom !== undefined) mapInstance.setMinZoom(Math.min(whole.zoom, CAMPUS_MAX_MIN_ZOOM))
      }
      mapRef.current = mapInstance
      setMap(mapInstance)
      setIsReady(true)
      onMapReady?.(mapInstance)
    })

    const unexpose = exposeTerrainMapForProbe('web', mapInstance)
    return () => {
      unexpose()
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

  // MapLibre listens to window resize events, but flex siblings (such as the
  // expanding route dock) can resize this container without resizing the window.
  useEffect(() => {
    const container = containerRef.current
    if (!map || !container || typeof ResizeObserver === 'undefined') return

    const resizeObserver = new ResizeObserver(() => {
      if (container.clientWidth === 0 || container.clientHeight === 0) return
      map.resize()
    })
    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [map])

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
