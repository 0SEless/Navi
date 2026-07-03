'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { useStudioStore } from '@/store/studio-store'
import type { LatLng } from '@/types/nav-types'

const TRACER_SOURCE = 'building-tracer-drawing'
const TRACER_EXTRUSION = 'building-tracer-extrusion'
const TRACER_LINE = 'building-tracer-line'
const TRACER_VERTICES = 'building-tracer-vertices'

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

export interface BuildingFootprint {
  id: string
  points: LatLng[]
}

function addTracerSourceAndLayers(map: maplibregl.Map) {
  if (map.getSource(TRACER_SOURCE)) return
  map.addSource(TRACER_SOURCE, { type: 'geojson', data: EMPTY_FC })
  map.addLayer({
    id: TRACER_EXTRUSION, type: 'fill-extrusion', source: TRACER_SOURCE,
    paint: {
      'fill-extrusion-color': '#8B5CF6',
      'fill-extrusion-opacity': 0.3,
      'fill-extrusion-height': 15,
    },
  })
  map.addLayer({
    id: TRACER_LINE, type: 'line', source: TRACER_SOURCE,
    paint: { 'line-color': '#8B5CF6', 'line-width': 3, 'line-dasharray': [4, 4] },
  })
  map.addLayer({
    id: TRACER_VERTICES, type: 'circle', source: TRACER_SOURCE,
    paint: {
      'circle-radius': 6, 'circle-color': '#8B5CF6',
      'circle-stroke-width': 2, 'circle-stroke-color': '#FFFFFF',
    },
  })
}

function renderTracerDrawing(map: maplibregl.Map, points: LatLng[]) {
  const features: GeoJSON.Feature[] = []
  if (points.length >= 1) {
    const coords = points.map((p) => [p.lng, p.lat])
    if (points.length >= 3) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]]] },
        properties: {},
      })
    }
    if (points.length >= 2) {
      const lineCoords = points.length >= 3 ? [...coords, coords[0]] : coords
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: lineCoords },
        properties: {},
      })
    }
    for (const p of points) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: {},
      })
    }
  }
  try {
    const src = map.getSource(TRACER_SOURCE) as maplibregl.GeoJSONSource
    if (src) src.setData({ type: 'FeatureCollection', features })
  } catch { console.warn('[BuildingTracer] render source not ready') }
}

function clearTracerDrawing(map: maplibregl.Map) {
  try {
    const src = map.getSource(TRACER_SOURCE) as maplibregl.GeoJSONSource
    if (src) src.setData(EMPTY_FC)
  } catch { console.warn('[BuildingTracer] clear source not ready') }
}

export function useBuildingTracer(
  map: maplibregl.Map | null,
  onComplete?: (footprint: BuildingFootprint) => void,
) {
  const tool = useStudioStore((s) => s.tool)
  const pointsRef = useRef<LatLng[]>([])
  const onCompleteRef = useRef(onComplete)

  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  useEffect(() => {
    if (!map) return
    addTracerSourceAndLayers(map)
  }, [map])

  useEffect(() => {
    if (!map) return
    if (tool !== 'building') {
      pointsRef.current = []
      clearTracerDrawing(map)
      map.doubleClickZoom?.enable()
      return
    }

    map.doubleClickZoom?.disable()

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      pointsRef.current = [...pointsRef.current, { lat: e.lngLat.lat, lng: e.lngLat.lng }]
      renderTracerDrawing(map, pointsRef.current)
    }

    const handleDblClick = () => {
      if (pointsRef.current.length < 3) return
      const result: BuildingFootprint = {
        id: `building-footprint-${Date.now()}`,
        points: [...pointsRef.current],
      }
      onCompleteRef.current?.(result)
      pointsRef.current = []
      clearTracerDrawing(map)
    }

    map.on('click', handleClick)
    map.on('dblclick', handleDblClick)

    return () => {
      map.off('click', handleClick)
      map.off('dblclick', handleDblClick)
      map.doubleClickZoom?.enable()
      pointsRef.current = []
      clearTracerDrawing(map)
    }
  }, [map, tool])
}
