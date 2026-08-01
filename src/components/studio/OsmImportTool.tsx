'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { genId, useEditor } from '@navi/editor'
import { useCurrentTool } from './useCurrentTool'
import type { LatLng } from '@/types/nav-types'
import type { DrawingSessionValue } from './useDrawingSession'

const SNAP_THRESHOLD_PX = 12
const OSM_SOURCE = 'osm-import-drawing'
const OSM_FILL = 'osm-import-fill'
const OSM_LINE = 'osm-import-line'
const OSM_VERTICES = 'osm-import-vertices'

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

export interface OsmImportResult {
  count: number
  success: boolean
  error?: string
}

function addSourceAndLayers(map: maplibregl.Map) {
  if (map.getSource(OSM_SOURCE)) return
  map.addSource(OSM_SOURCE, { type: 'geojson', data: EMPTY_FC })
  map.addLayer({
    id: OSM_FILL, type: 'fill', source: OSM_SOURCE,
    paint: { 'fill-color': '#10B981', 'fill-opacity': 0.12 },
  })
  map.addLayer({
    id: OSM_LINE, type: 'line', source: OSM_SOURCE,
    paint: { 'line-color': '#10B981', 'line-width': 3, 'line-dasharray': [4, 4] },
  })
  map.addLayer({
    id: OSM_VERTICES, type: 'circle', source: OSM_SOURCE,
    paint: {
      'circle-radius': 6, 'circle-color': '#10B981',
      'circle-stroke-width': 2, 'circle-stroke-color': '#FFFFFF',
    },
  })
}

function renderDrawing(map: maplibregl.Map, points: LatLng[]) {
  const features: GeoJSON.Feature[] = []
  if (points.length >= 1) {
    const coords = points.map((p) => [p.lng, p.lat] as [number, number])
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
    const src = map.getSource(OSM_SOURCE) as maplibregl.GeoJSONSource
    if (src) src.setData({ type: 'FeatureCollection', features })
  } catch { /* source not ready */ }
}

function clearDrawing(map: maplibregl.Map) {
  try {
    const src = map.getSource(OSM_SOURCE) as maplibregl.GeoJSONSource
    if (src) src.setData(EMPTY_FC)
  } catch { /* source not ready */ }
}

export function useOsmImportTool(
  map: maplibregl.Map | null,
  onComplete?: (result: OsmImportResult) => void,
  drawing?: DrawingSessionValue,
) {
  const tool = useCurrentTool()
  const pointsRef = useRef<LatLng[]>([])
  const onCompleteRef = useRef(onComplete)
  const drawingRef = useRef(drawing)
  const { services } = useEditor()
  const dispatcherRef = useRef(services?.get('dispatcher'))
  dispatcherRef.current = services?.get('dispatcher')
  drawingRef.current = drawing

  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  // Init sources
  useEffect(() => {
    if (!map) return
    addSourceAndLayers(map)
  }, [map])

  // Sync from external drawPoints changes
  useEffect(() => {
    if (!map || tool !== 'import-osm' || !drawingRef.current) return
    pointsRef.current = [...drawingRef.current.drawPoints]
    renderDrawing(map, pointsRef.current)
  }, [map, tool])

  // Main drawing interaction
  useEffect(() => {
    if (!map) return
    const m = map
    if (tool !== 'import-osm') {
      pointsRef.current = []
      clearDrawing(map)
      map.doubleClickZoom?.enable()
      return
    }

    map.doubleClickZoom?.disable()

    async function completePolygon() {
      if (pointsRef.current.length < 3) return
      const points = [...pointsRef.current]

      // Clear drawing immediately
      pointsRef.current = []
      clearDrawing(m)
      drawingRef.current?.clearDrawPoints()

      // Call OSM API
      try {
        const res = await fetch('/api/osm-buildings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boundary: points }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const bldgs: Array<{
          id: string; name: string; footprint: LatLng[]; height: number; color: string; center: LatLng
        }> = data.buildings ?? []

        // Dispatch building.create for each OSM building
        let created = 0
        const disp = dispatcherRef.current
        if (disp) {
          for (const b of bldgs) {
            const id = genId('bldg')
            const result = disp.execute({
              id: 'building.create',
              label: 'Import from OSM',
              payload: {
                id,
                name: b.name || `Building ${b.id}`,
                code: '',
                footprint: { points: b.footprint },
                floors: [{
                  id: genId('flr'), level: 0, label: 'Ground Floor',
                  elevation: 0, height: 3.5,
                  rooms: [], hallways: [], staircases: [], elevators: [],
                  entrances: [], connectorStops: [], metadata: {},
                }],
                height: b.height || 15,
                color: b.color || '#1C6BEB',
              },
            })
            if (!result || result.success !== false) created++
          }
        }

        if (created > 0 || bldgs.length === 0) {
          onCompleteRef.current?.({ count: created, success: true })
        } else {
          onCompleteRef.current?.({ count: 0, success: false, error: 'Failed to create buildings' })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        onCompleteRef.current?.({ count: 0, success: false, error: msg })
      }
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
      renderDrawing(map, pointsRef.current)
      drawingRef.current?.setDrawPoints(pointsRef.current)
    }

    const handleDblClick = () => completePolygon()

    map.on('click', handleClick)
    map.on('dblclick', handleDblClick)

    return () => {
      map.off('click', handleClick)
      map.off('dblclick', handleDblClick)
      map.doubleClickZoom?.enable()
      pointsRef.current = []
      clearDrawing(map)
      drawingRef.current?.clearDrawPoints()
    }
  }, [map, tool])
}
