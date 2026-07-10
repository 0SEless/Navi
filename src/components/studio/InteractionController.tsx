'use client'

import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { useGraphStore } from '@/store/graph-store'
import { useStudioStore } from '@/store/studio-store'
import { SRC, LYR, syncAllData } from './StudioCanvas'
import type { LatLng } from '@/types/nav-types'

interface InteractionControllerProps {
  map: maplibregl.Map
  onSetRoomDrag?: (drag: { start: LatLng; current: LatLng } | null) => void
}

export function InteractionController({ map, onSetRoomDrag }: InteractionControllerProps) {
  const toolRef = useRef(useStudioStore.getState().tool)
  const tracePointsRef = useRef(useStudioStore.getState().tracePoints)
  const drawPointsRef = useRef(useStudioStore.getState().drawPoints)
  const graphRef = useRef(useGraphStore.getState().graph)
  const activeFloorRef = useRef(useStudioStore.getState().activeFloor)
  const activeBuildingIdRef = useRef(useStudioStore.getState().activeBuildingId)
  const selectedNodeRef = useRef(useStudioStore.getState().selectedNodeId)
  const adjustBuildingIdRef = useRef(useStudioStore.getState().adjustBuildingId)
  const dragVertexRef = useRef<{ index: number; points: LatLng[]; source: 'trace' | 'draw' } | null>(null)
  const buildingDragRef = useRef<{ buildingId: string; originalFootprint: LatLng[]; startPoint: LatLng } | null>(null)
  const lastSelectedNodeRef = useRef<string | null>(null)

  const setRoomDragRef = useRef(onSetRoomDrag)
  useEffect(() => { setRoomDragRef.current = onSetRoomDrag }, [onSetRoomDrag])

  useEffect(() => {
    const unsub = useStudioStore.subscribe((state) => {
      toolRef.current = state.tool
      tracePointsRef.current = state.tracePoints
      drawPointsRef.current = state.drawPoints
      activeFloorRef.current = state.activeFloor
      activeBuildingIdRef.current = state.activeBuildingId
      selectedNodeRef.current = state.selectedNodeId
      adjustBuildingIdRef.current = state.adjustBuildingId
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = useGraphStore.subscribe((state) => {
      graphRef.current = state.graph
    })
    return () => unsub()
  }, [])

  function getCurrentPoints() {
    const curTool = toolRef.current
    if (curTool === 'route') return tracePointsRef.current
    if (curTool === 'building' || curTool === 'boundary') return drawPointsRef.current
    return []
  }

  function setCurrentPoints(points: LatLng[]) {
    const curTool = toolRef.current
    if (curTool === 'route') { useStudioStore.getState().setTracePoints(points) }
    if (curTool === 'building' || curTool === 'boundary') { useStudioStore.getState().setDrawPoints(points) }
  }

  function findNearestVertex(mouseScreen: { x: number; y: number }, m: maplibregl.Map, points: LatLng[]): number {
    const THRESHOLD = 10
    let nearest = -1
    let nearestDist = THRESHOLD
    for (let i = 0; i < points.length; i++) {
      const screen = m.project([points[i].lng, points[i].lat])
      const dx = screen.x - mouseScreen.x
      const dy = screen.y - mouseScreen.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = i
      }
    }
    return nearest
  }

  useEffect(() => {
    if (!map) return

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (dragVertexRef.current) { dragVertexRef.current = null; return }
      if (buildingDragRef.current) { buildingDragRef.current = null; map.dragPan.enable(); return }
      const curTool = toolRef.current
      const pos = { lat: e.lngLat.lat, lng: e.lngLat.lng }

      if (curTool === 'route') {
        const points = tracePointsRef.current
        const nearIdx = findNearestVertex(e.point, map, points)
        if (nearIdx >= 0) {
          dragVertexRef.current = { index: nearIdx, points: [...points], source: 'trace' }
          return
        }
        useStudioStore.getState().addTracePoint(pos)
        return
      }
      if (curTool === 'asset') {
        useGraphStore.getState().addComponent({ id: `comp-${Date.now()}`, type: 'room', name: 'Asset', buildingId: activeBuildingIdRef.current ?? '', floor: activeFloorRef.current, position: pos })
        return
      }
      if (curTool === 'select') {
        const features = map.queryRenderedFeatures(e.point)
        const hitNode = features.find((f) => f.layer.id === LYR.NODES || f.layer.id === LYR.NODES_CONNECTION)
        if (hitNode) {
          const nodeId = hitNode.properties?.id as string | null
          lastSelectedNodeRef.current = nodeId
          useStudioStore.getState().setSelectedNodeId(nodeId)
          return
        }
        const hitBuilding = features.find((f) => f.layer.id === LYR.BUILDINGS_EXTRUSION || f.layer.id === LYR.BUILDINGS_FILL)
        if (hitBuilding) {
          const bid = hitBuilding.properties?.id
          if (bid) useStudioStore.getState().setActiveBuilding(bid)
          return
        }
        const hitTrace = features.find((f) => f.layer.id === LYR.TRACES_LINE || f.layer.id === LYR.TRACES_INNER)
        if (hitTrace) {
          const tid = hitTrace.properties?.id
          if (tid) { useStudioStore.getState().setSelectedTraceId(tid); return }
        }
        lastSelectedNodeRef.current = null
        useStudioStore.getState().setSelectedNodeId(null)
        useStudioStore.getState().setSelectedTraceId(null)
        return
      }
    }

    const handleDblClick = () => {
      const curTool = toolRef.current
      if (curTool === 'route' && tracePointsRef.current.length >= 2) {
        useStudioStore.getState().setPendingConfirm('route', [...tracePointsRef.current])
      }
    }

    let dragStart: LatLng | null = null

    const handleMouseDown = (e: maplibregl.MapMouseEvent) => {
      if (e.originalEvent.button !== 0) return
      const curTool = toolRef.current
      if (curTool === 'select' && adjustBuildingIdRef.current) {
        const features = map.queryRenderedFeatures(e.point)
        const hitBuilding = features.find((f) =>
          (f.layer.id === LYR.BUILDINGS_EXTRUSION || f.layer.id === LYR.BUILDINGS_FILL) &&
          f.properties?.id === adjustBuildingIdRef.current
        )
        if (hitBuilding) {
          const building = graphRef.current.buildings.find(b => b.id === adjustBuildingIdRef.current)
          if (building) {
            buildingDragRef.current = {
              buildingId: adjustBuildingIdRef.current,
              originalFootprint: building.footprint.map(p => ({ ...p })),
              startPoint: { lat: e.lngLat.lat, lng: e.lngLat.lng },
            }
            map.dragPan.disable()
            return
          }
        }
      }
      if (curTool === 'room') {
        dragStart = { lat: e.lngLat.lat, lng: e.lngLat.lng }
        setRoomDragRef.current?.({ start: dragStart, current: dragStart })
        return
      }
      if (curTool === 'route' || curTool === 'building' || curTool === 'boundary') {
        const points = getCurrentPoints()
        const nearIdx = findNearestVertex(e.point, map, points)
        if (nearIdx >= 0) {
          dragVertexRef.current = { index: nearIdx, points: [...points], source: curTool === 'route' ? 'trace' : 'draw' }
        }
      }
    }

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      const drag = dragVertexRef.current
      if (drag) {
        drag.points[drag.index] = { lat: e.lngLat.lat, lng: e.lngLat.lng }
        const coords = drag.points.map((p) => [p.lng, p.lat])
        const drawFeatures: GeoJSON.Feature[] = []
        drawFeatures.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} })
        for (const p of drag.points) {
          drawFeatures.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: {} })
        }
        try {
          const src = map.getSource(SRC.DRAWING) as maplibregl.GeoJSONSource
          if (src) src.setData({ type: 'FeatureCollection', features: drawFeatures })
        } catch {}
        return
      }
      if (dragStart && toolRef.current === 'room') {
        setRoomDragRef.current?.({ start: dragStart, current: { lat: e.lngLat.lat, lng: e.lngLat.lng } })
      }
      const buildingDrag = buildingDragRef.current
      if (buildingDrag) {
        const dLat = e.lngLat.lat - buildingDrag.startPoint.lat
        const dLng = e.lngLat.lng - buildingDrag.startPoint.lng
        const buildingSrc = map.getSource(SRC.BUILDINGS) as maplibregl.GeoJSONSource
        if (buildingSrc) {
          const features = graphRef.current.buildings.map((bb) => {
            const footprint = bb.id === buildingDrag.buildingId
              ? buildingDrag.originalFootprint.map(p => ({ lat: p.lat + dLat, lng: p.lng + dLng }))
              : bb.footprint
            return {
              type: 'Feature',
              properties: { id: bb.id, name: bb.name, color: bb.color || '#1C6BEB', height: bb.height || 15 },
              geometry: {
                type: 'Polygon',
                coordinates: [footprint.map(p => [p.lng, p.lat]).concat([[footprint[0].lng, footprint[0].lat]])],
              },
            }
          })
          buildingSrc.setData({ type: 'FeatureCollection', features })
        }
        return
      }
    }

    const handleMouseUp = (e: maplibregl.MapMouseEvent) => {
      const drag = dragVertexRef.current
      if (drag) {
        setCurrentPoints(drag.points)
        dragVertexRef.current = null
        return
      }
      const buildingDrag = buildingDragRef.current
      if (buildingDrag) {
        map.dragPan.enable()
        const dLat = e.lngLat.lat - buildingDrag.startPoint.lat
        const dLng = e.lngLat.lng - buildingDrag.startPoint.lng
        if (dLat !== 0 || dLng !== 0) {
          const movedFootprint = buildingDrag.originalFootprint.map(p => ({
            lat: p.lat + dLat,
            lng: p.lng + dLng,
          }))
          const centroid = {
            lat: movedFootprint.reduce((s, p) => s + p.lat, 0) / movedFootprint.length,
            lng: movedFootprint.reduce((s, p) => s + p.lng, 0) / movedFootprint.length,
          }
          useGraphStore.getState().updateBuilding(buildingDrag.buildingId, { footprint: movedFootprint, center: centroid })
          useGraphStore.getState().save()
        }
        useStudioStore.getState().setAdjustBuilding(null)
        buildingDragRef.current = null
        syncAllData(map, graphRef.current, activeFloorRef.current)
        return
      }
      if (dragStart && toolRef.current === 'room') {
        const start = dragStart
        const end = { lat: e.lngLat.lat, lng: e.lngLat.lng }
        const polygon = [
          { lat: Math.min(start.lat, end.lat), lng: Math.min(start.lng, end.lng) },
          { lat: Math.min(start.lat, end.lat), lng: Math.max(start.lng, end.lng) },
          { lat: Math.max(start.lat, end.lat), lng: Math.max(start.lng, end.lng) },
          { lat: Math.max(start.lat, end.lat), lng: Math.min(start.lng, end.lng) },
        ]
        const center = { lat: (start.lat + end.lat) / 2, lng: (start.lng + end.lng) / 2 }
        useGraphStore.getState().addComponentWithPolygon({ id: `comp-${Date.now()}`, type: 'room', name: 'Room', buildingId: activeBuildingIdRef.current ?? '', floor: activeFloorRef.current, position: center, polygon })
        dragStart = null
        setRoomDragRef.current?.(null)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (buildingDragRef.current) {
          buildingDragRef.current = null
          map.dragPan.enable()
          syncAllData(map, graphRef.current, activeFloorRef.current)
          return
        }
        if (lastSelectedNodeRef.current) {
          try {
            map.setFeatureState({ source: SRC.NODES, id: lastSelectedNodeRef.current }, { selected: false })
            map.setFeatureState({ source: SRC.NODES_CONNECTION, id: lastSelectedNodeRef.current }, { selected: false })
          } catch { /* ok */ }
          lastSelectedNodeRef.current = null
        }
        useStudioStore.getState().clearTracePoints()
        useStudioStore.getState().clearDrawPoints()
        setRoomDragRef.current?.(null)
        useStudioStore.getState().setVertexEditing(null, null)
      }
      if (e.key === 'Delete' && selectedNodeRef.current) {
        if (lastSelectedNodeRef.current) {
          try {
            map.setFeatureState({ source: SRC.NODES, id: lastSelectedNodeRef.current }, { selected: false })
            map.setFeatureState({ source: SRC.NODES_CONNECTION, id: lastSelectedNodeRef.current }, { selected: false })
          } catch { /* ok */ }
          lastSelectedNodeRef.current = null
        }
        graphRef.current.removeNode(selectedNodeRef.current)
        useStudioStore.getState().setSelectedNodeId(null)
      }
    }

    map.on('click', handleClick)
    map.on('dblclick', handleDblClick)
    map.on('mousedown', handleMouseDown)
    map.on('mousemove', handleMouseMove)
    map.on('mouseup', handleMouseUp)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      map.off('click', handleClick)
      map.off('dblclick', handleDblClick)
      map.off('mousedown', handleMouseDown)
      map.off('mousemove', handleMouseMove)
      map.off('mouseup', handleMouseUp)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [map])

  return null
}
