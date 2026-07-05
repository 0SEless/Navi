'use client'

import { useCallback, useRef, useEffect, useReducer, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { useGraphStore } from '@/store/graph-store'
import type { LatLng, Component, ComponentType } from '@/types/nav-types'
import type { StudioTool } from '@/types/studio-types'
import { drawReducer } from './draw-reducer'

const DRAW_SRC = 'floor-draw-preview'

function addDrawLayers(map: maplibregl.Map) {
  if (map.getSource(DRAW_SRC)) return
  map.addSource(DRAW_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  // preview line (trace)
  map.addLayer({ id: 'floor-draw-line', type: 'line', source: DRAW_SRC, filter: ['==', ['get', 'type'], 'line'], paint: { 'line-color': '#F59E0B', 'line-width': 3, 'line-opacity': 0.7, 'line-dasharray': [4, 3] } })
  // preview polygon fill + outline (room)
  map.addLayer({ id: 'floor-draw-polygon-fill', type: 'fill', source: DRAW_SRC, filter: ['==', ['get', 'type'], 'polygon'], paint: { 'fill-color': '#10B981', 'fill-opacity': 0.15 } })
  map.addLayer({ id: 'floor-draw-polygon-outline', type: 'line', source: DRAW_SRC, filter: ['==', ['get', 'type'], 'polygon'], paint: { 'line-color': '#10B981', 'line-width': 2, 'line-dasharray': [4, 3] } })
  // preview width buffer (hallway)
  map.addLayer({ id: 'floor-draw-buffer-fill', type: 'fill', source: DRAW_SRC, filter: ['==', ['get', 'type'], 'buffer'], paint: { 'fill-color': '#10B981', 'fill-opacity': 0.15 } })
  map.addLayer({ id: 'floor-draw-buffer-outline', type: 'line', source: DRAW_SRC, filter: ['==', ['get', 'type'], 'buffer'], paint: { 'line-color': '#10B981', 'line-width': 2, 'line-dasharray': [4, 3] } })
  // placement vertices
  map.addLayer({ id: 'floor-draw-vertices', type: 'circle', source: DRAW_SRC, filter: ['==', ['get', 'type'], 'vertex'], paint: { 'circle-radius': 8, 'circle-color': '#F59E0B', 'circle-stroke-width': 3, 'circle-stroke-color': '#FFFFFF' } })
  // placed item icons (door, stairs, elevator, asset)
  map.addLayer({ id: 'floor-draw-placed', type: 'circle', source: DRAW_SRC, filter: ['==', ['get', 'type'], 'placed'], paint: { 'circle-radius': 10, 'circle-color': '#8B5CF6', 'circle-stroke-width': 3, 'circle-stroke-color': '#FFFFFF' } })
  map.addLayer({
    id: 'floor-draw-placed-label', type: 'symbol', source: DRAW_SRC, filter: ['==', ['get', 'type'], 'placed'],
    layout: { 'text-field': ['get', 'label'], 'text-size': 10, 'text-offset': [0, -1.5], 'text-anchor': 'bottom' },
    paint: { 'text-color': '#1E293B', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1 },
  })
}

function updatePreview(map: maplibregl.Map, features: GeoJSON.Feature[]) {
  const src = map.getSource(DRAW_SRC) as maplibregl.GeoJSONSource
  if (src) src.setData({ type: 'FeatureCollection', features })
}

function clearPreview(map: maplibregl.Map) {
  try {
    const src = map.getSource(DRAW_SRC) as maplibregl.GeoJSONSource
    if (src) src.setData({ type: 'FeatureCollection', features: [] })
  } catch { /* map may have been removed */ }
}

function pointsToLine(points: LatLng[]): GeoJSON.Feature {
  return {
    type: 'Feature', properties: { type: 'line' },
    geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat] as [number, number]) },
  }
}

function pointsToPolygon(points: LatLng[]): GeoJSON.Feature {
  return {
    type: 'Feature', properties: { type: 'polygon' },
    geometry: { type: 'Polygon', coordinates: [[...points.map((p) => [p.lng, p.lat] as [number, number]), [points[0].lng, points[0].lat] as [number, number]]] },
  }
}

function pointsToVertices(points: LatLng[]): GeoJSON.Feature[] {
  return points.map((p, i) => ({
    type: 'Feature' as const, properties: { type: 'vertex', index: i },
    geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] as [number, number] },
  }))
}

export function computeWidthBuffer(centerline: LatLng[], totalWidth: number): LatLng[] {
  if (centerline.length < 2) return centerline
  const hw = totalWidth / 2
  const avgLat = centerline.reduce((s, p) => s + p.lat, 0) / centerline.length
  const mpd = 111320 * Math.cos(avgLat * Math.PI / 180)
  const mLat = 111320

  const offsets: { lat: number; lng: number }[] = []

  for (let i = 0; i < centerline.length; i++) {
    const p = centerline[i]
    let angle: number

    if (i === 0) {
      angle = Math.atan2(
        (centerline[1].lat - p.lat) * mLat,
        (centerline[1].lng - p.lng) * mpd
      )
    } else if (i === centerline.length - 1) {
      angle = Math.atan2(
        (p.lat - centerline[i - 1].lat) * mLat,
        (p.lng - centerline[i - 1].lng) * mpd
      )
    } else {
      const aIn = Math.atan2(
        (p.lat - centerline[i - 1].lat) * mLat,
        (p.lng - centerline[i - 1].lng) * mpd
      )
      const aOut = Math.atan2(
        (centerline[i + 1].lat - p.lat) * mLat,
        (centerline[i + 1].lng - p.lng) * mpd
      )
      const x = Math.cos(aIn) + Math.cos(aOut)
      const y = Math.sin(aIn) + Math.sin(aOut)
      angle = Math.atan2(y, x)
    }

    const perp = angle + Math.PI / 2
    offsets.push({
      lat: (hw / mLat) * Math.sin(perp),
      lng: (hw / mpd) * Math.cos(perp),
    })
  }

  const left = centerline.map((p, i) => ({ lat: p.lat + offsets[i].lat, lng: p.lng + offsets[i].lng }))
  const right = centerline.map((p, i) => ({ lat: p.lat - offsets[i].lat, lng: p.lng - offsets[i].lng }))

  return [...left, ...right.reverse()]
}

function pointsToBuffer(points: LatLng[], width: number): GeoJSON.Feature {
  const buffer = computeWidthBuffer(points, width)
  return {
    type: 'Feature', properties: { type: 'buffer' },
    geometry: { type: 'Polygon', coordinates: [[...buffer.map((p) => [p.lng, p.lat] as [number, number]), [buffer[0].lng, buffer[0].lat] as [number, number]]] },
  }
}

function placedItem(position: LatLng, label: string): GeoJSON.Feature {
  return {
    type: 'Feature', properties: { type: 'placed', label },
    geometry: { type: 'Point', coordinates: [position.lng, position.lat] },
  }
}

interface UseFloorDrawingOptions {
  map: maplibregl.Map | null
  buildingId: string
  campusId: string
  floor: number
  tool: StudioTool
  onSelect?: (id: string | null) => void
}

export function useFloorDrawing({ map, buildingId, campusId, floor, tool, onSelect }: UseFloorDrawingOptions) {
  const addComponentWithPolygon = useGraphStore((s) => s.addComponentWithPolygon)
  const updateBuilding = useGraphStore((s) => s.updateBuilding)
  const save = useGraphStore((s) => s.save)

  const [drawState, dispatch] = useReducer(drawReducer, { drawMode: 'idle', pendingPoints: [], pendingPolygon: [] })
  const [hallwayWidth, setHallwayWidth] = useState(3)
  const toolRef = useRef(tool)
  useEffect(() => { toolRef.current = tool }, [tool])

  // Initialize layers
  useEffect(() => {
    if (!map) return
    addDrawLayers(map)
    return () => { clearPreview(map) }
  }, [map])

  // Reset state on tool change
  useEffect(() => {
    dispatch({ type: 'RESET' })
    if (map) clearPreview(map)
  }, [tool, map])

  // Update preview
  useEffect(() => {
    if (!map) return
    const features: GeoJSON.Feature[] = []
    if (drawState.drawMode === 'placing-points' && drawState.pendingPoints.length > 0) {
      features.push(pointsToLine(drawState.pendingPoints), ...pointsToVertices(drawState.pendingPoints))
    }
    if (drawState.drawMode === 'placing-polygon' && drawState.pendingPolygon.length > 0) {
      if (toolRef.current === 'hallway') {
        features.push(pointsToBuffer(drawState.pendingPolygon, hallwayWidth), pointsToLine(drawState.pendingPolygon), ...pointsToVertices(drawState.pendingPolygon))
      } else {
        features.push(pointsToPolygon(drawState.pendingPolygon), ...pointsToVertices(drawState.pendingPolygon))
      }
    }
    updatePreview(map, features)
  }, [map, drawState.drawMode, drawState.pendingPoints, drawState.pendingPolygon, hallwayWidth])

  const confirmPolygon = useCallback(() => {
    const tool = toolRef.current
    if (tool !== 'room' && tool !== 'hallway' && tool !== 'elevator') return
    const minPoints = tool === 'hallway' ? 2 : 3
    if (drawState.pendingPolygon.length < minPoints || !map) return

    const id = `${tool}-${Date.now()}`
    const graph = useGraphStore.getState().graph
    const existingCount = graph.components.filter(
      (c) => c.type === tool && c.buildingId === buildingId && c.floor === floor
    ).length

    const name = tool === 'room' ? `Room ${existingCount + 1}` : `${tool.charAt(0).toUpperCase() + tool.slice(1)} ${existingCount + 1}`

    const component: Component = {
      id,
      type: tool,
      name,
      buildingId,
      campusId,
      floor,
      position: drawState.pendingPolygon[0],
      polygon: drawState.pendingPolygon,
      range: tool === 'elevator' ? { from: 0, to: 2 } : undefined,
      dimensions: tool === 'hallway' ? { width: hallwayWidth } : undefined,
    }
    addComponentWithPolygon(component)
    save()
    dispatch({ type: 'RESET' })
    clearPreview(map)
    onSelect?.(id)
  }, [drawState.pendingPolygon, map, addComponentWithPolygon, floor, buildingId, campusId, save, onSelect, hallwayWidth])

  const placeComponent = useCallback((position: LatLng, type: ComponentType) => {
    const id = `${type}-${Date.now()}`
    const component: Component = {
      id,
      type,
      name: type.charAt(0).toUpperCase() + type.slice(1),
      buildingId,
      campusId,
      floor,
      position,
      range: type === 'stair' || type === 'elevator' ? { from: floor, to: floor + 1 } : undefined,
    }
    addComponentWithPolygon(component)
    if (type === 'entrance') {
      const graph = useGraphStore.getState().graph
      const building = graph.buildings.find((b) => b.id === buildingId)
      if (building) {
        updateBuilding(buildingId, {
          entrances: [...(building.entrances ?? []), { id, position, floor, label: 'Entrance' }],
        })
      }
    }
    save()
    onSelect?.(id)
    // Show brief placement feedback
    if (map) {
      const feedback = placedItem(position, type.charAt(0).toUpperCase() + type.slice(1))
      updatePreview(map, [feedback])
      setTimeout(() => { if (map) clearPreview(map) }, 1500)
    }
  }, [addComponentWithPolygon, buildingId, campusId, floor, save, map, onSelect, updateBuilding])

  // Map click handler
  const handleMapClick = useCallback((e: maplibregl.MapMouseEvent) => {
    const currentTool = toolRef.current
    if (currentTool === 'select') {
      const layers = ['floor-rooms-fill', 'floor-rooms-outline', 'floor-hallways-fill', 'floor-hallways-outline', 'floor-hallway-centerlines-layer', 'floor-elevator-areas-fill', 'floor-elevator-areas-outline', 'floor-draw-placed']
      const features = map!.queryRenderedFeatures(e.point, { layers })
      if (features.length > 0) {
        onSelect?.(features[0].properties?.id as string ?? null)
      } else {
        onSelect?.(null)
      }
      return
    }

    const pos: LatLng = { lat: e.lngLat.lat, lng: e.lngLat.lng }

    switch (currentTool) {
      case 'room':
      case 'hallway':
      case 'elevator':
        dispatch({ type: 'ADD_POLYGON_POINT', point: pos })
        break
      case 'entrance':
        placeComponent(pos, 'entrance')
        break
      case 'stairs':
        placeComponent(pos, 'stair')
        break
    }
  }, [map, placeComponent, onSelect])

  // Right-click to cancel
  useEffect(() => {
    if (!map) return
    const handleContext = (e: maplibregl.MapMouseEvent) => {
      if (drawState.drawMode !== 'idle') {
        e.originalEvent.preventDefault()
        dispatch({ type: 'RESET' })
        clearPreview(map)
      }
    }
    map.on('contextmenu', handleContext)
    return () => { map.off('contextmenu', handleContext) }
  }, [map, drawState.drawMode])

  // Attach click handler
  useEffect(() => {
    if (!map) return
    map.on('click', handleMapClick)
    return () => { map.off('click', handleMapClick) }
  }, [map, handleMapClick])

  const removeLastPoint = useCallback(() => {
    dispatch({ type: 'REMOVE_LAST_POLYGON_POINT' })
  }, [])

  return { drawMode: drawState.drawMode, pendingPoints: drawState.pendingPoints, pendingPolygon: drawState.pendingPolygon, hallwayWidth, setHallwayWidth, confirm: confirmPolygon, cancel: () => { dispatch({ type: 'RESET' }); if (map) clearPreview(map) }, removeLastPoint }
}
