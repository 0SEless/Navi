'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { CampusBundle, LatLng } from '@/types/nav-types'
import { deriveBuildingFootprint } from '@/lib/campus-geometry'
import { usePublicStore } from '@/store/public-store'

/**
 * Presentational explore-campus map. Direct maplibre-gl usage following the
 * house pattern in `src/app/components/RuntimeMapShell.tsx` — no react wrapper.
 *
 * Building polygons come from `deriveBuildingFootprint`: real `footprint`
 * rings when present, convex hull of graph nodes otherwise.
 *
 * Interaction contract (documented for later tasks):
 *  - hover building → pointer cursor + highlight (dedicated highlight source)
 *  - click building → `selectBuilding(building)` + `setSheet('half')`
 *  - the page renders the detail panel while `selectedBuilding` is set
 */

const STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

const DEFAULT_CENTER: [number, number] = [122.168, 11.819]
const DEFAULT_ZOOM = 15

const SRC_BUILDINGS = 'public-buildings'
const SRC_HIGHLIGHT = 'public-highlight'

const LYR_FILL = 'public-buildings-fill'
const LYR_OUTLINE = 'public-buildings-outline'
const LYR_LABELS = 'public-buildings-labels'
const LYR_HIGHLIGHT = 'public-buildings-highlight'

const COLOR_PRIMARY = '#2563EB'
const COLOR_PRIMARY_LIGHT = '#EFF6FF'

/** Resolve a CSS var at runtime; `--navi-primary` etc. may not be in scope at module eval. */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function ringToGeoJSON(ring: LatLng[]): [number, number][] {
  return ring.map((p) => [p.lng, p.lat])
}

function buildingFeature(
  bundle: CampusBundle,
  b: CampusBundle['buildings'][number],
): GeoJSON.Feature<GeoJSON.Polygon> | null {
  const ring = deriveBuildingFootprint(b, bundle.nodes)
  if (!ring || ring.length < 3) return null
  return {
    type: 'Feature',
    id: b.id,
    properties: {
      id: b.id,
      name: b.name,
      code: b.code ?? '',
      label: b.code ?? b.name,
      derived: b.footprint.length < 3,
    },
    geometry: { type: 'Polygon', coordinates: [ringToGeoJSON(ring)] },
  }
}

interface CampusMapProps {
  bundle: CampusBundle
}

export function CampusMap({ bundle }: CampusMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  const selectBuilding = usePublicStore((s) => s.selectBuilding)
  const setSheet = usePublicStore((s) => s.setSheet)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }))
    mapRef.current = map

    const fillColor = cssVar('--navi-primary', COLOR_PRIMARY)

    map.on('load', () => {
      if (map.getSource(SRC_BUILDINGS)) return
      try {
        map.addSource(SRC_BUILDINGS, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.addLayer({
          id: LYR_FILL,
          type: 'fill',
          source: SRC_BUILDINGS,
          paint: {
            'fill-color': fillColor,
            // Derived (hull) buildings sit slightly lighter than footprint polygons.
            'fill-opacity': ['case', ['get', 'derived'], 0.3, 0.45],
          },
        })
        map.addLayer({
          id: LYR_OUTLINE,
          type: 'line',
          source: SRC_BUILDINGS,
          paint: {
            'line-color': fillColor,
            'line-width': ['case', ['get', 'derived'], 1.5, 2.5],
          },
        })
        map.addLayer({
          id: LYR_LABELS,
          type: 'symbol',
          source: SRC_BUILDINGS,
          minzoom: 15.5,
          layout: {
            'text-field': ['get', 'label'],
            'text-size': 11,
            'text-anchor': 'center',
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': cssVar('--navi-text', '#0F172A'),
            'text-halo-color': cssVar('--navi-card', '#FFFFFF'),
            'text-halo-width': 1.5,
          },
        })
        map.addSource(SRC_HIGHLIGHT, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        })
        map.addLayer({
          id: LYR_HIGHLIGHT,
          type: 'fill',
          source: SRC_HIGHLIGHT,
          paint: {
            'fill-color': fillColor,
            'fill-opacity': 0.6,
          },
        })

        syncFeatures(map, bundle)
        fitToBundle(map, bundle)
      } catch (err) {
        console.error('[CampusMap] load handler threw:', err)
      }
    })

    // Hover: pointer cursor + highlight via a dedicated source (setFeatureState
    // would need promoteId wiring; this matches the RouteOverlay setData pattern).
    map.on('mouseenter', LYR_FILL, (e) => {
      if (!e.features?.length) return
      const feature = e.features[0]
      const src = map.getSource(SRC_HIGHLIGHT) as maplibregl.GeoJSONSource | undefined
      src?.setData({
        type: 'FeatureCollection',
        features: [feature as GeoJSON.Feature],
      })
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', LYR_FILL, () => {
      const src = map.getSource(SRC_HIGHLIGHT) as maplibregl.GeoJSONSource | undefined
      src?.setData({ type: 'FeatureCollection', features: [] })
      map.getCanvas().style.cursor = ''
    })
    map.on('click', LYR_FILL, (e) => {
      const feature = e.features?.[0]
      if (!feature) return
      const id = feature.properties?.id as string | undefined
      const building = bundle.buildings.find((b) => b.id === id)
      if (building) {
        selectBuilding(building)
        setSheet('half')
      }
    })

    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) mapRef.current.resize()
    })
    if (containerRef.current) resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, selectBuilding, setSheet])

  // Data can arrive after the style finished loading (map created before the
  // fetch resolves in rare cases) — resync without recreating the map.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    if (!map.getSource(SRC_BUILDINGS)) return
    syncFeatures(map, bundle)
  }, [bundle])

  return <div ref={containerRef} className="h-full w-full" />
}

function syncFeatures(map: maplibregl.Map, bundle: CampusBundle) {
  const src = map.getSource(SRC_BUILDINGS) as maplibregl.GeoJSONSource | undefined
  if (!src) return
  const features = bundle.buildings
    .map((b) => buildingFeature(bundle, b))
    .filter((f): f is GeoJSON.Feature<GeoJSON.Polygon> => f !== null)
  src.setData({ type: 'FeatureCollection', features })
}

function fitToBundle(map: maplibregl.Map, bundle: CampusBundle) {
  if (bundle.boundingBox) {
    const { minLat, maxLat, minLng, maxLng } = bundle.boundingBox
    if (Number.isFinite(minLat) && Number.isFinite(maxLng)) {
      map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 60, maxZoom: 17.5 })
      return
    }
  }
  const first = bundle.buildings[0]
  const center = first?.center
  if (center) {
    map.jumpTo({ center: [center.lng, center.lat], zoom: 16 })
  }
}

export default CampusMap
