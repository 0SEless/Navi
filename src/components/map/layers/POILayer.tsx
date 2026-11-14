'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import type maplibregl from 'maplibre-gl'
import type { PoiRenderData } from '@/components/map/NavigationRenderModel'
import { cssVar } from '@/components/map/mapTheme'

// ── Constants ──────────────────────────────────────────────────

const SRC = 'pois'
const LYR = 'pois-layer'
const LABELS = 'pois-labels'
const SHAPES = 'poi-shapes'
const SHAPE_FILL = 'poi-shapes-fill'
const SHAPE_LINE = 'poi-shapes-line'
const SHAPE_RAISED = 'poi-shapes-raised'
const DEFAULT_POI_COLOR = '#7C3AED'

// ── Props ──────────────────────────────────────────────────────

export interface POILayerProps {
  map: maplibregl.Map | null
  pois: PoiRenderData[]
  buildingId?: string
  floor?: number
  /** Temporarily revealed hidden POIs (e.g. a hidden-but-searchable match). */
  revealedIds?: readonly string[]
  onPoiClick?: (poiId: string) => void
}

// ── Helpers ────────────────────────────────────────────────────

/**
 * Build POI point features. POIs carry accent color (spec §5.3) so they read
 * as distinct from the quiet neutral room/hallway geometry.
 *
 * Visibility: `showOnMap === false` POIs are omitted unless they are in the
 * transient `revealedIds` set (public search reveal). The reveal is never
 * persisted; clearing the search restores the hidden state.
 */
export function buildPoiGeoJSON(pois: PoiRenderData[], revealedIds?: readonly string[]) {
  const revealed = new Set(revealedIds ?? [])
  const visible = pois.filter(p => p.showOnMap !== false || revealed.has(p.id))
  return {
    type: 'FeatureCollection' as const,
    features: visible.map(p => ({
      type: 'Feature' as const,
      id: p.id,
      properties: {
        id: p.id,
        name: p.name,
        buildingId: p.buildingId,
        floor: p.floor,
        category: p.category ?? '',
        revealed: revealed.has(p.id),
        // A POI with its own shape is drawn as that shape; the dot is only for the rest.
        marker: !p.shape,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [p.position.lng, p.position.lat] as [number, number],
      },
    })),
  }
}

/** Shaped POIs (2D flat, 2.5D raised) in their authored colour; hidden ones stay off unless revealed. */
export function buildPoiShapesGeoJSON(pois: PoiRenderData[], revealedIds?: readonly string[]) {
  const revealed = new Set(revealedIds ?? [])
  const shaped = pois.filter(p => p.shape && p.shape.length >= 3 && (p.showOnMap !== false || revealed.has(p.id)))
  return {
    type: 'FeatureCollection' as const,
    features: shaped.map(p => {
      const ring = p.shape!.map(q => [q.lng, q.lat] as [number, number])
      const [first, last] = [ring[0], ring[ring.length - 1]]
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])
      return {
        type: 'Feature' as const,
        id: p.id,
        properties: {
          id: p.id,
          name: p.name,
          mode: p.appearance?.mode ?? '2d',
          color: p.appearance?.color ?? DEFAULT_POI_COLOR,
          height: p.appearance?.height ?? 0,
        },
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
      }
    }),
  }
}

// ── Component ──────────────────────────────────────────────────

export function POILayer({
  map,
  pois,
  buildingId,
  floor,
  revealedIds,
  onPoiClick,
}: POILayerProps) {
  const initializedRef = useRef(false)
  // Bumped when setup completes, so the data effect below runs even if setup happened
  // outside React (a late 'load'/'sourcedata' event while terrain tiles keep the style loading).
  const [readyTick, setReadyTick] = useState(0)
  const markInitialized = () => { if (!initializedRef.current) { initializedRef.current = true; setReadyTick(t => t + 1) } }
  const hasPopulatedRef = useRef(false)

  useEffect(() => {
    if (!map) return
    if (initializedRef.current) return
    if (map.getSource(SRC)) {
      markInitialized()
      return
    }

    const init = () => {
      if (initializedRef.current) return
      if (map.getSource(SRC)) {
        markInitialized()
        return
      }

      map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addSource(SHAPES, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      // The POI's own shape: flat (2D) or raised (2.5D), in its authored colour.
      map.addLayer({ id: SHAPE_FILL, type: 'fill', source: SHAPES, minzoom: 16, filter: ['==', ['get', 'mode'], '2d'], paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.45 } })
      map.addLayer({ id: SHAPE_LINE, type: 'line', source: SHAPES, minzoom: 16, filter: ['==', ['get', 'mode'], '2d'], paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': 0.9 } })
      map.addLayer({ id: SHAPE_RAISED, type: 'fill-extrusion', source: SHAPES, minzoom: 16, filter: ['==', ['get', 'mode'], '2.5d'], paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-base': 0, 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': 0.85 } })

      // POI marker — accent-colored pin (spec §5.3). Quiet baseline otherwise.
      // A search-revealed hidden POI gets a larger, accented ring so the user
      // notices the temporary reveal.
      map.addLayer({
        id: LYR,
        type: 'circle',
        source: SRC,
        minzoom: 16,
        filter: ['==', ['get', 'marker'], true],
        paint: {
          'circle-radius': ['case', ['boolean', ['get', 'revealed'], false], 9, 7],
          'circle-color': cssVar('--navi-accent', '#7C3AED'),
          'circle-stroke-width': ['case', ['boolean', ['get', 'revealed'], false], 3, 2],
          'circle-stroke-color': ['case',
            ['boolean', ['get', 'revealed'], false], cssVar('--navi-accent', '#7C3AED'),
            cssVar('--navi-card', '#FFFFFF'),
          ],
          'circle-opacity': 0.95,
        },
      })
      // The POI's name under its marker, so a visitor can tell what it is.
      map.addLayer({
        id: LABELS,
        type: 'symbol',
        source: SRC,
        minzoom: 16.5,
        layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true },
        paint: {
          'text-color': cssVar('--navi-accent', '#6D28D9'),
          'text-halo-color': cssVar('--navi-card', '#FFFFFF'),
          'text-halo-width': 1.5,
        },
      })

      markInitialized()
    }

    if (map.isStyleLoaded()) {
      init()
    } else {
      map.on('load', init)
      // Also when any source delivers data: 'load' fires once, and other layers' sources (the site's
      // terrain tiles) can keep the style loading while this layer mounts.
      map.on('sourcedata', init)
    }

    return () => {
      try {
        map.off('load', init)
        map.off('sourcedata', init)
        if (map.getLayer(LABELS)) map.removeLayer(LABELS)
        if (map.getLayer(LYR)) map.removeLayer(LYR)
        for (const id of [SHAPE_RAISED, SHAPE_LINE, SHAPE_FILL]) if (map.getLayer(id)) map.removeLayer(id)
        if (map.getSource(SHAPES)) map.removeSource(SHAPES)
        if (map.getSource(SRC)) map.removeSource(SRC)
      } catch {}
      initializedRef.current = false
      hasPopulatedRef.current = false
    }
  }, [map])

  const setData = useCallback(() => {
    if (!map || !initializedRef.current) return
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined
    if (!src) return

    let filtered = pois
    if (buildingId) filtered = filtered.filter(p => p.buildingId === buildingId)
    if (floor !== undefined) filtered = filtered.filter(p => p.floor === floor)

    src.setData(buildPoiGeoJSON(filtered, revealedIds))
    ;(map.getSource(SHAPES) as maplibregl.GeoJSONSource | undefined)?.setData(buildPoiShapesGeoJSON(filtered, revealedIds))
    hasPopulatedRef.current = true
    map.triggerRepaint()
  }, [map, pois, buildingId, floor, revealedIds])

  useEffect(() => {
    setData()
  }, [setData])

  useEffect(() => {
    if (!map || !initializedRef.current || hasPopulatedRef.current) return
    setData()
  }, [map, pois, readyTick])

  // Click handler
  useEffect(() => {
    if (!map || !onPoiClick) return

    const handler = (e: maplibregl.MapMouseEvent & { features?: any[] }) => {
      if (e.features && e.features.length > 0) {
        const id = e.features[0].properties?.id
        if (id) onPoiClick(id)
      }
    }

    map.on('click', LYR, handler)
    return () => { try { map.off('click', LYR, handler) } catch {} }
  }, [map, onPoiClick])

  // Hover cursor
  useEffect(() => {
    if (!map) return

    const onMouseEnter = () => { map.getCanvas().style.cursor = 'pointer' }
    const onMouseLeave = () => { map.getCanvas().style.cursor = '' }

    map.on('mouseenter', LYR, onMouseEnter)
    map.on('mouseleave', LYR, onMouseLeave)
    return () => {
      try {
        map.off('mouseenter', LYR, onMouseEnter)
        map.off('mouseleave', LYR, onMouseLeave)
      } catch {}
    }
  }, [map])

  return null
}
