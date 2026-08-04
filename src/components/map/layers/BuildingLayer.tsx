'use client'

import { useEffect, useRef } from 'react'
import type maplibregl from 'maplibre-gl'
import type { BuildingRenderData } from '@/components/map/NavigationRenderModel'

// ── Constants ──────────────────────────────────────────────────

const SRC = 'buildings'
const LYR = {
  FILL: 'buildings-fill',
  OUTLINE: 'buildings-outline',
  EXTRUSION: 'buildings-extrusion',
  LABELS: 'buildings-labels',
} as const

// ── Props ──────────────────────────────────────────────────────

export interface BuildingLayerProps {
  map: maplibregl.Map | null
  buildings: BuildingRenderData[]
  showLabels?: boolean
  showExtrusion?: boolean
  selectedBuildingId?: string | null
  onBuildingClick?: (buildingId: string) => void
}

// ── Component ──────────────────────────────────────────────────

export function BuildingLayer({
  map,
  buildings,
  showLabels = true,
  showExtrusion = true,
  selectedBuildingId,
  onBuildingClick,
}: BuildingLayerProps) {
  const initializedRef = useRef(false)

  // Initialize sources and layers
  useEffect(() => {
    if (!map || initializedRef.current) return
    if (map.getSource(SRC)) {
      initializedRef.current = true
      return
    }

    map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

    // Fill layer
    map.addLayer({
      id: LYR.FILL,
      type: 'fill',
      source: SRC,
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 0.45,
          0.25,
        ],
      },
    })

    // Outline layer
    map.addLayer({
      id: LYR.OUTLINE,
      type: 'line',
      source: SRC,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 3,
          2,
        ],
        'line-opacity': 0.9,
      },
    })

    // Extrusion layer (3D buildings)
    if (showExtrusion) {
      map.addLayer({
        id: LYR.EXTRUSION,
        type: 'fill-extrusion',
        source: SRC,
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'base_elevation'],
          'fill-extrusion-opacity': 0.55,
        },
      })
    }

    // Labels layer
    if (showLabels) {
      map.addLayer({
        id: LYR.LABELS,
        type: 'symbol',
        source: SRC,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#0F172A',
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 2,
        },
      })
    }

    initializedRef.current = true

    return () => {
      // Cleanup layers and source
      ;[LYR.LABELS, LYR.EXTRUSION, LYR.OUTLINE, LYR.FILL].forEach(l => {
        if (map.getLayer(l)) map.removeLayer(l)
      })
      if (map.getSource(SRC)) map.removeSource(SRC)
      initializedRef.current = false
    }
  }, [map, showLabels, showExtrusion])

  // Sync building data
  useEffect(() => {
    if (!map || !initializedRef.current) return
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined
    if (!src) return

    const features = buildings
      .filter(b => b.footprint.length >= 3)
      .map(b => ({
        type: 'Feature' as const,
        id: b.id,
        properties: {
          id: b.id,
          name: b.name,
          color: b.color,
          height: b.height,
          base_elevation: 0,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [b.footprint.map(p => [p.lng, p.lat] as [number, number])],
        },
      }))

    src.setData({ type: 'FeatureCollection', features })
    map.triggerRepaint()
  }, [map, buildings])

  // Sync selection state
  useEffect(() => {
    if (!map || !initializedRef.current) return
    // Clear all selections
    const features = map.querySourceFeatures(SRC, { sourceLayer: '' })
    for (const f of features) {
      if (f.id) {
        try { map.setFeatureState({ source: SRC, id: f.id }, { selected: false }) } catch {}
      }
    }
    // Set new selection
    if (selectedBuildingId) {
      try { map.setFeatureState({ source: SRC, id: selectedBuildingId }, { selected: true }) } catch {}
    }
  }, [map, selectedBuildingId])

  // Click handler
  useEffect(() => {
    if (!map || !onBuildingClick) return

    const handler = (e: maplibregl.MapMouseEvent & { features?: any[] }) => {
      if (e.features && e.features.length > 0) {
        const id = e.features[0].properties?.id
        if (id) onBuildingClick(id)
      }
    }

    map.on('click', LYR.FILL, handler)
    return () => { map.off('click', LYR.FILL, handler) }
  }, [map, onBuildingClick])

  // Hover cursor
  useEffect(() => {
    if (!map) return

    const onMouseEnter = () => { map.getCanvas().style.cursor = 'pointer' }
    const onMouseLeave = () => { map.getCanvas().style.cursor = '' }

    map.on('mouseenter', LYR.FILL, onMouseEnter)
    map.on('mouseleave', LYR.FILL, onMouseLeave)
    return () => {
      map.off('mouseenter', LYR.FILL, onMouseEnter)
      map.off('mouseleave', LYR.FILL, onMouseLeave)
    }
  }, [map])

  return null // This is a headless layer component
}
