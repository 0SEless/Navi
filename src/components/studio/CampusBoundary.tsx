'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { genId } from '@navi/editor'
import { useCurrentTool } from './useCurrentTool'
import type { LatLng } from '@/types/nav-types'
import type { DrawingSessionValue } from './useDrawingSession'

const BOUNDARY_SOURCE = 'campus-boundary-drawing'
const BOUNDARY_FILL = 'campus-boundary-fill'
const BOUNDARY_LINE = 'campus-boundary-line'
const BOUNDARY_VERTICES = 'campus-boundary-vertices'

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

export interface BoundaryPolygon {
  id: string
  points: LatLng[]
}

function addBoundarySourceAndLayers(map: maplibregl.Map) {
  if (map.getSource(BOUNDARY_SOURCE)) return
  map.addSource(BOUNDARY_SOURCE, { type: 'geojson', data: EMPTY_FC })
  map.addLayer({
    id: BOUNDARY_FILL, type: 'fill', source: BOUNDARY_SOURCE,
    paint: { 'fill-color': '#F97316', 'fill-opacity': 0.1 },
  })
  map.addLayer({
    id: BOUNDARY_LINE, type: 'line', source: BOUNDARY_SOURCE,
    paint: { 'line-color': '#F97316', 'line-width': 3, 'line-dasharray': [4, 4] },
  })
  map.addLayer({
    id: BOUNDARY_VERTICES, type: 'circle', source: BOUNDARY_SOURCE,
    paint: {
      'circle-radius': 6, 'circle-color': '#F97316',
      'circle-stroke-width': 2, 'circle-stroke-color': '#FFFFFF',
    },
  })
}

function renderBoundaryDrawing(map: maplibregl.Map, points: LatLng[]) {
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
    const src = map.getSource(BOUNDARY_SOURCE) as maplibregl.GeoJSONSource
    if (src) src.setData({ type: 'FeatureCollection', features })
  } catch { /* source not ready */ }
}

function clearBoundaryDrawing(map: maplibregl.Map) {
  try {
    const src = map.getSource(BOUNDARY_SOURCE) as maplibregl.GeoJSONSource
    if (src) src.setData(EMPTY_FC)
  } catch { console.warn('[CampusBoundary] clear source not ready') }
}

export function useCampusBoundary(
  map: maplibregl.Map | null,
  onComplete?: (polygon: BoundaryPolygon) => void,
  drawing?: DrawingSessionValue,
) {
  const tool = useCurrentTool()
  const pointsRef = useRef<LatLng[]>([])
  const onCompleteRef = useRef(onComplete)

  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  useEffect(() => {
    if (!map) return
    addBoundarySourceAndLayers(map)
  }, [map])

  // Sync visual when drawPoints changes externally (undo/cancel)
  useEffect(() => {
    if (!map || tool !== 'boundary' || !drawing) return
    pointsRef.current = [...drawing.drawPoints]
    renderBoundaryDrawing(map, pointsRef.current)
  }, [map, tool, drawing?.drawPoints])

  useEffect(() => {
    if (!map) return
    if (tool !== 'boundary') {
      pointsRef.current = []
      clearBoundaryDrawing(map)
      map.doubleClickZoom?.enable()
      return
    }

    map.doubleClickZoom?.disable()

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      pointsRef.current = [...pointsRef.current, { lat: e.lngLat.lat, lng: e.lngLat.lng }]
      renderBoundaryDrawing(map, pointsRef.current)
      drawing?.setDrawPoints(pointsRef.current)
    }

    const handleDblClick = () => {
      if (pointsRef.current.length < 3) return
      const result: BoundaryPolygon = {
        id: genId('campus-boundary'),
        points: [...pointsRef.current],
      }
      onCompleteRef.current?.(result)
      pointsRef.current = []
      clearBoundaryDrawing(map)
      drawing?.clearDrawPoints()
    }

    map.on('click', handleClick)
    map.on('dblclick', handleDblClick)

    return () => {
      map.off('click', handleClick)
      map.off('dblclick', handleDblClick)
      map.doubleClickZoom?.enable()
      pointsRef.current = []
      clearBoundaryDrawing(map)
      drawing?.clearDrawPoints()
    }
  }, [map, tool, drawing])
}
