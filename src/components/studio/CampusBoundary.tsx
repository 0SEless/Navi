'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { genId } from '@navi/editor'
import { useCurrentTool } from './useCurrentTool'
import type { LatLng } from '@/types/nav-types'
import type { DrawingSessionValue } from './useDrawingSession'

const SNAP_THRESHOLD_PX = 12
const BOUNDARY_SOURCE = 'campus-boundary-drawing'
const BOUNDARY_FILL = 'campus-boundary-fill'
const BOUNDARY_LINE = 'campus-boundary-line'
const BOUNDARY_VERTICES = 'campus-boundary-vertices'

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

export interface BoundaryPolygon {
  id: string
  points: LatLng[]
}

export interface CampusBoundaryOptions {
  /** Tool ID that triggers this hook (default: 'boundary') */
  toolId?: string
  /** Skip the confirm bar and auto-complete (default: false) */
  autoConfirm?: boolean
  /** Called when polygon is completed in autoConfirm mode */
  onAutoConfirm?: (polygon: BoundaryPolygon) => void
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
  options?: CampusBoundaryOptions,
) {
  const tool = useCurrentTool()
  const toolId = options?.toolId ?? 'boundary'
  const pointsRef = useRef<LatLng[]>([])
  const onCompleteRef = useRef(onComplete)
  const drawingRef = useRef(drawing)
  drawingRef.current = drawing

  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  useEffect(() => {
    if (!map) return
    addBoundarySourceAndLayers(map)
  }, [map])

  // Sync visual when drawPoints changes externally (undo/cancel)
  useEffect(() => {
    if (!map || tool !== toolId || !drawingRef.current) return
    pointsRef.current = [...drawingRef.current.drawPoints]
    renderBoundaryDrawing(map, pointsRef.current)
  }, [map, tool, toolId])

  useEffect(() => {
    const d = drawingRef.current
    if (!map) return
    if (tool !== toolId) {
      pointsRef.current = []
      clearBoundaryDrawing(map)
      map.doubleClickZoom?.enable()
      return
    }

    map.doubleClickZoom?.disable()

    function completePolygon() {
      if (pointsRef.current.length < 3) return
      const result: BoundaryPolygon = {
        id: genId('campus-boundary'),
        points: [...pointsRef.current],
      }

      if (options?.autoConfirm && options?.onAutoConfirm) {
        options.onAutoConfirm(result)
        pointsRef.current = []
        clearBoundaryDrawing(map)
        d?.clearDrawPoints()
        return
      }

      onCompleteRef.current?.(result)
      pointsRef.current = []
      clearBoundaryDrawing(map)
      d?.clearDrawPoints()
    }

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const pos = { lat: e.lngLat.lat, lng: e.lngLat.lng }

      if (pointsRef.current.length >= 3) {
        const first = pointsRef.current[0]
        const firstScreen = map.project([first.lng, first.lat])
        const dx = e.point.x - firstScreen.x
        const dy = e.point.y - firstScreen.y
        if (Math.sqrt(dx * dx + dy * dy) <= SNAP_THRESHOLD_PX) {
          completePolygon()
          return
        }
      }

      pointsRef.current = [...pointsRef.current, pos]
      renderBoundaryDrawing(map, pointsRef.current)
      d?.setDrawPoints(pointsRef.current)
    }

    const handleDblClick = () => completePolygon()

    map.on('click', handleClick)
    map.on('dblclick', handleDblClick)

    return () => {
      map.off('click', handleClick)
      map.off('dblclick', handleDblClick)
      map.doubleClickZoom?.enable()
      pointsRef.current = []
      clearBoundaryDrawing(map)
      d?.clearDrawPoints()
    }
  }, [map, tool])
}
