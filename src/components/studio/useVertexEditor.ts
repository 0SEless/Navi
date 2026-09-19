'use client'

import { useCallback, useRef, useEffect } from 'react'
import maplibregl from 'maplibre-gl'
import { useEditor, useEditingEngine } from '@navi/editor'
import { useStudioStore } from '@/store/studio-store'
import type { LatLng } from '@/types/nav-types'
import { haversine } from '@/engine/geo-utils'

const VERTEX_SOURCE = 'vertex-source'
const VERTEX_LAYER = 'vertex-points'
const VERTEX_EDGE_LAYER = 'vertex-edges'
const VERTEX_MIDPOINT_LAYER = 'vertex-midpoints'

// Safe query wrapper that checks if layer exists before querying
function safeQueryRenderedFeatures(
  map: maplibregl.Map,
  point: maplibregl.PointLike,
  options: { layers: string[] }
): maplibregl.MapboxGeoJSONFeature[] {
  try {
    // Check if all requested layers exist
    const layersExist = options.layers.every(layer => map.getLayer(layer))
    if (!layersExist) return []
    return map.queryRenderedFeatures(point, options)
  } catch {
    return []
  }
}

function pointsToLineCoords(points: LatLng[]): [number, number][] {
  return points.map((p) => [p.lng, p.lat] as [number, number])
}

function buildEdgeGeo(points: LatLng[]): GeoJSON.FeatureCollection {
  if (points.length < 2) return { type: 'FeatureCollection', features: [] }
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: pointsToLineCoords(points) },
    }],
  }
}

function buildMidpointGeo(points: LatLng[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const mid = {
      lat: (points[i].lat + points[i + 1].lat) / 2,
      lng: (points[i].lng + points[i + 1].lng) / 2,
    }
    features.push({
      type: 'Feature',
      properties: { segment: i },
      geometry: { type: 'Point', coordinates: [mid.lng, mid.lat] },
    })
  }
  return { type: 'FeatureCollection', features }
}

function addVertexLayers(map: maplibregl.Map) {
  try {
    if (!map.getSource(VERTEX_SOURCE)) {
      map.addSource(VERTEX_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    }
    if (!map.getLayer(VERTEX_EDGE_LAYER)) {
      map.addLayer({ id: VERTEX_EDGE_LAYER, type: 'line', source: VERTEX_SOURCE, paint: { 'line-color': '#F59E0B', 'line-width': 2, 'line-dasharray': [2, 2] } })
    }
    if (!map.getLayer(VERTEX_MIDPOINT_LAYER)) {
      map.addLayer({ id: VERTEX_MIDPOINT_LAYER, type: 'circle', source: VERTEX_SOURCE, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 4, 20, 8], 'circle-color': '#94A3B8', 'circle-stroke-width': 1, 'circle-stroke-color': '#1E293B', 'circle-opacity': 0.6 }, filter: ['!=', ['get', 'segment'], -1] })
    }
    if (!map.getLayer(VERTEX_LAYER)) {
      map.addLayer({ id: VERTEX_LAYER, type: 'circle', source: VERTEX_SOURCE, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, ['case', ['boolean', ['get', 'selected'], false], 12, 8], 20, ['case', ['boolean', ['get', 'selected'], false], 18, 14]], 'circle-color': '#F59E0B', 'circle-stroke-width': 2, 'circle-stroke-color': '#1E293B' }, filter: ['==', ['get', 'segment'], -1] })
    }

    // Keep edit controls above authored roads/buildings after every style
    // rebuild. `moveLayer` is best-effort because MapLibre can be between
    // style states while a basemap is being replaced.
    for (const layerId of [VERTEX_EDGE_LAYER, VERTEX_MIDPOINT_LAYER, VERTEX_LAYER]) {
      if (map.getLayer(layerId)) {
        try { map.moveLayer(layerId) } catch { /* style is still settling */ }
      }
    }
  } catch {
    // The style can be unavailable for one render tick; style.load retries it.
  }
}

/**
 * Vertex editor for road geometry.
 *
 * Reads the current road (via edit target ID matching road ID) from
 * CampusDocument and edits its polyline points through commands.
 * The GraphAdapter (when wired) will regenerate compiled traces
 * from the updated Road entity.
 */
export function useVertexEditor(map: maplibregl.Map | null) {
  const editTargetType = useStudioStore((s) => s.editTargetType)
  const editTargetId = useStudioStore((s) => s.editTargetId)
  const isVertexEditing = useStudioStore((s) => s.isVertexEditing)
  const setVertexEditing = useStudioStore((s) => s.setVertexEditing)

  const { document, services } = useEditor()
  const editEngine = useEditingEngine()
  const dispatcher = services.get('dispatcher')!
  const workflow = services.get('workflow')!

  const currentEditRoad =
    editTargetType === 'trace' && editTargetId
      ? document.roads.find((r) => r.id === editTargetId) ?? null
      : null

  const pointsRef = useRef<LatLng[]>(currentEditRoad?.polyline.points ?? [])
  const selectedIdxRef = useRef<number | null>(null)
  const dragStartRef = useRef<LatLng | null>(null)
  const dragOriginalsRef = useRef<{ adjacentPoint?: LatLng; isEndpoint: boolean }>({ isEndpoint: false })

  useEffect(() => {
    pointsRef.current = currentEditRoad?.polyline.points ?? []
  }, [currentEditRoad])

  const handleSave = useCallback((points: LatLng[]) => {
    if (currentEditRoad) {
      editEngine.begin({ kind: 'modifyGeometry', entityId: currentEditRoad.id, geometry: { polyline: { points } } })
      editEngine.doCommit()
      dispatcher.execute({
        id: 'entity.update',
        label: 'Update Road Geometry',
        payload: { entityId: currentEditRoad.id, changes: { polyline: { points } } },
      })
      workflow.save('manual')
    }
  }, [currentEditRoad, editEngine, dispatcher, workflow])

  const updateDisplay = useCallback((points: LatLng[], selectedIdx?: number) => {
    if (!map || !map.getSource(VERTEX_SOURCE)) return
    const src = map.getSource(VERTEX_SOURCE) as maplibregl.GeoJSONSource
    if (src) {
      src.setData({
        type: 'FeatureCollection',
        features: [
          ...points.map((p, i) => ({
            type: 'Feature' as const,
            properties: { index: i, selected: i === selectedIdx || false, segment: -1 },
            geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] as [number, number] },
          })),
          ...buildEdgeGeo(points).features,
          ...buildMidpointGeo(points).features,
        ],
      })
    }
  }, [map])

  useEffect(() => {
    if (!map) return
    addVertexLayers(map)

    // Re-add vertex layers after style changes (e.g., when switching basemaps)
    // This ensures vertex layers survive map.setStyle() calls
    const onStyleLoad = () => {
      addVertexLayers(map)
      if (isVertexEditing && currentEditRoad) {
        updateDisplay(pointsRef.current)
      }
    }
    map.on('style.load', onStyleLoad)

    return () => {
      map.off('style.load', onStyleLoad)
    }
  }, [map, isVertexEditing, currentEditRoad, updateDisplay])

  // Disable MapLibre interactions that fight vertex editing:
  // - dragPan pans the map while dragging a vertex (vertex "escapes" the cursor)
  // - doubleClickZoom zooms the map when double-clicking to enter vertex edit
  // Both are restored when editing ends (or the hook unmounts mid-edit).
  useEffect(() => {
    if (!map) return
    if (isVertexEditing) {
      map.dragPan.disable()
      map.doubleClickZoom.disable()
    } else {
      map.dragPan.enable()
      map.doubleClickZoom.enable()
    }
    return () => {
      if (isVertexEditing) {
        try {
          map.dragPan.enable()
          map.doubleClickZoom.enable()
        } catch {
          /* map may already be removed (StrictMode / unmount) */
        }
      }
    }
  }, [map, isVertexEditing])

  // Toggle vertex editing visibility
  useEffect(() => {
    if (!map || !isVertexEditing || !currentEditRoad) return
    updateDisplay(pointsRef.current)
  }, [isVertexEditing, currentEditRoad, map, updateDisplay])

  // Clean up on disable
  useEffect(() => {
    if (!map || isVertexEditing) return
    try {
      const src = map.getSource(VERTEX_SOURCE) as maplibregl.GeoJSONSource
      if (src) src.setData({ type: 'FeatureCollection', features: [] })
    } catch { /* ok */ }
  }, [isVertexEditing, map])

  // Vertex click to select
  useEffect(() => {
    if (!map || !isVertexEditing) return
    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const features = safeQueryRenderedFeatures(map, e.point, { layers: [VERTEX_LAYER] })
      if (features.length > 0) {
        const idx = features[0].properties?.index as number
        if (idx != null) selectedIdxRef.current = idx
        updateDisplay(pointsRef.current, idx)
        return
      }
      const midFeatures = safeQueryRenderedFeatures(map, e.point, { layers: [VERTEX_MIDPOINT_LAYER] })
      if (midFeatures.length > 0) {
        const segIdx = midFeatures[0].properties?.segment as number
        if (segIdx != null && pointsRef.current.length > 1) {
          const mid = {
            lat: (pointsRef.current[segIdx].lat + pointsRef.current[segIdx + 1].lat) / 2,
            lng: (pointsRef.current[segIdx].lng + pointsRef.current[segIdx + 1].lng) / 2,
          }
          const newPoints = [...pointsRef.current]
          newPoints.splice(segIdx + 1, 0, mid)
          pointsRef.current = newPoints
          updateDisplay(newPoints)
        }
        return
      }
      selectedIdxRef.current = null
      updateDisplay(pointsRef.current)
    }
    map.on('click', handleClick)
    return () => { map.off('click', handleClick) }
  }, [map, isVertexEditing, updateDisplay])

  // Vertex drag
  useEffect(() => {
    if (!map || !isVertexEditing) return
    const handleMouseDown = (e: maplibregl.MapMouseEvent) => {
      const features = safeQueryRenderedFeatures(map, e.point, { layers: [VERTEX_LAYER] })
      if (features.length > 0) {
        const idx = features[0].properties?.index as number
        selectedIdxRef.current = idx
        dragStartRef.current = { lat: e.lngLat.lat, lng: e.lngLat.lng }
        dragOriginalsRef.current = {
          isEndpoint: idx === 0 || idx === pointsRef.current.length - 1,
          adjacentPoint: idx === 0 && pointsRef.current.length > 1
            ? { ...pointsRef.current[1] }
            : idx === pointsRef.current.length - 1 && pointsRef.current.length > 1
              ? { ...pointsRef.current[pointsRef.current.length - 2] }
              : undefined,
        }
      }
    }
    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (selectedIdxRef.current == null || !dragStartRef.current) return
      const idx = selectedIdxRef.current
      const { isEndpoint, adjacentPoint } = dragOriginalsRef.current

      if (isEndpoint && adjacentPoint) {
        const distToAdj = haversine(
          { lat: e.lngLat.lat, lng: e.lngLat.lng },
          adjacentPoint,
        )
        const originalDist = haversine(dragStartRef.current, adjacentPoint)
        if (distToAdj > originalDist * 1.1) {
          const newPoints = [...pointsRef.current]
          const insertAt = idx === 0 ? 0 : newPoints.length
          newPoints.splice(insertAt, 0, { lat: e.lngLat.lat, lng: e.lngLat.lng })
          pointsRef.current = newPoints
          selectedIdxRef.current = insertAt
          updateDisplay(newPoints, insertAt)
          dragOriginalsRef.current = {
            ...dragOriginalsRef.current,
            adjacentPoint: idx === 0
              ? { ...pointsRef.current[1] }
              : { ...pointsRef.current[pointsRef.current.length - 2] },
          }
          return
        }
      }

      const newPoints = [...pointsRef.current]
      newPoints[idx] = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      pointsRef.current = newPoints
      updateDisplay(newPoints, idx)
    }
    const handleMouseUp = () => {
      if (selectedIdxRef.current != null) {
        handleSave(pointsRef.current)
      }
      dragStartRef.current = null
    }
    const handleContextMenu = (e: maplibregl.MapMouseEvent) => {
      e.originalEvent.preventDefault()
      const features = safeQueryRenderedFeatures(map, e.point, { layers: [VERTEX_LAYER] })
      if (features.length > 0 && pointsRef.current.length > 2) {
        const idx = features[0].properties?.index as number
        const newPoints = [...pointsRef.current]
        newPoints.splice(idx, 1)
        pointsRef.current = newPoints
        selectedIdxRef.current = null
        updateDisplay(newPoints)
        handleSave(newPoints)
      }
    }
    map.on('mousedown', handleMouseDown)
    map.on('mousemove', handleMouseMove)
    map.on('mouseup', handleMouseUp)
    map.on('contextmenu', handleContextMenu)
    return () => {
      map.off('mousedown', handleMouseDown)
      map.off('mousemove', handleMouseMove)
      map.off('mouseup', handleMouseUp)
      map.off('contextmenu', handleContextMenu)
    }
  }, [map, isVertexEditing, updateDisplay, handleSave])

  return { active: isVertexEditing, getPoints: () => pointsRef.current, cancel: () => setVertexEditing(null, null) }
}
