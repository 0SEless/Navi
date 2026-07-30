'use client'

import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { genId, useEditor } from '@navi/editor'
import { useGraphStore } from '@/store/graph-store'
import { useStudioStore } from '@/store/studio-store'
import { SRC, LYR, CURSOR_CROSSHAIR, CURSOR_HAND } from './rendering/constants'
import { useCurrentTool } from './useCurrentTool'
import type { LatLng } from '@/types/nav-types'
import type { DrawingSessionValue } from './useDrawingSession'

interface InteractionControllerProps {
  map: maplibregl.Map
  onSetRoomDrag?: (drag: { start: LatLng; current: LatLng } | null) => void
  drawing: DrawingSessionValue
}

export function InteractionController({ map, onSetRoomDrag, drawing }: InteractionControllerProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
  const { services } = useEditor()
  const dispatcherRef = useRef(services.get('dispatcher'))
  dispatcherRef.current = services.get('dispatcher')
  const toolRegistry = services.get('toolRegistry')!
  const toolRef = useRef(toolRegistry.activeToolId)
  const tracePointsRef = useRef(drawing.tracePoints)
  const drawPointsRef = useRef(drawing.drawPoints)
  const graphRef = useRef(useGraphStore.getState().graph)
  const activeFloorRef = useRef(useStudioStore.getState().activeFloor)
  const activeBuildingIdRef = useRef(useStudioStore.getState().activeBuildingId)
  const selectedNodeRef = useRef(useStudioStore.getState().selectedNodeId)
  const selectedTraceRef = useRef<string | null>(null)
  const positionEditTargetRef = useRef(useStudioStore.getState().positionEditTarget)
  const dragVertexRef = useRef<{ index: number; points: LatLng[]; source: 'trace' | 'draw' } | null>(null)
  const buildingDragRef = useRef<{ buildingId: string; originalFootprint: LatLng[]; startPoint: LatLng } | null>(null)
  const lastSelectedNodeRef = useRef<string | null>(null)
  const hoveredBldgRef = useRef<string | null>(null)
  const hoveredAreaRef = useRef<string | null>(null)

  const tool = useCurrentTool()

  const drawingRef = useRef(drawing)
  drawingRef.current = drawing
  const setRoomDragRef = useRef(onSetRoomDrag)
  useEffect(() => { setRoomDragRef.current = onSetRoomDrag }, [onSetRoomDrag])

  // ── Cursor + dragPan management ──
  useEffect(() => {
    const canvas = map.getCanvas()
    if (tool === 'route' || tool === 'room' || tool === 'asset' || tool === 'boundary' || tool === 'building' || tool === 'area') {
      canvas.style.cursor = CURSOR_CROSSHAIR
    } else if (tool === 'select') {
      canvas.style.cursor = ''
    } else {
      canvas.style.cursor = ''
    }
    // Clear building hover state when leaving select tool
    if (tool !== 'select' && hoveredBldgRef.current) {
      map.setFeatureState({ source: SRC.BUILDINGS, id: hoveredBldgRef.current }, { hover: false })
      hoveredBldgRef.current = null
    }
    if (tool === 'route' || tool === 'room' || tool === 'boundary' || tool === 'building' || tool === 'area' || tool === 'vertex') {
      map.dragPan.disable()
    } else {
      map.dragPan.enable()
    }
  }, [tool, map])

  useEffect(() => {
    const unsubDrawing = drawingRef.current.subscribe(() => {
      tracePointsRef.current = drawing.tracePoints
      drawPointsRef.current = drawing.drawPoints
    })
    const unsubStore = useStudioStore.subscribe((state) => {
      activeFloorRef.current = state.activeFloor
      activeBuildingIdRef.current = state.activeBuildingId
      selectedNodeRef.current = state.selectedNodeId
      selectedTraceRef.current = state.selectedTraceId
      positionEditTargetRef.current = state.positionEditTarget
    })
    const unsubTool = toolRegistry.subscribe(() => {
      toolRef.current = toolRegistry.activeToolId
    })
    return () => { unsubDrawing(); unsubStore(); unsubTool() }
  }, [toolRegistry, drawing])

  useEffect(() => {
    const unsub = useGraphStore.subscribe((state) => {
      graphRef.current = state.graph
    })
    return () => unsub()
  }, [])

  // Building selection highlight
  useEffect(() => {
    if (!map) return
    const unsub = useStudioStore.subscribe((state) => {
      const src = map.getSource('s-building-selection') as maplibregl.GeoJSONSource
      if (!src) return
      const bid = state.activeBuildingId
      if (!bid) { src.setData({ type: 'FeatureCollection', features: [] }); return }
      const building = graphRef.current.buildings.find(b => b.id === bid)
      if (!building) return
      const fp = building.footprint
      if (fp.length < 3) return
      src.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [fp.map(p => [p.lng, p.lat]).concat([[fp[0].lng, fp[0].lat]])],
          },
        }],
      })
    })
    return () => unsub()
  }, [map])

  function setCurrentPoints(points: LatLng[]) {
    const curTool = toolRef.current
    if (curTool === 'route') { drawingRef.current.setTracePoints(points) }
    if (curTool === 'building' || curTool === 'boundary' || curTool === 'area') { drawingRef.current.setDrawPoints(points) }
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

    function updateBuildingSelection(id: string | null) {
      const src = map.getSource('s-building-selection') as maplibregl.GeoJSONSource
      if (!src) return
      if (!id) { src.setData({ type: 'FeatureCollection', features: [] }); return }
      const building = graphRef.current.buildings.find(b => b.id === id)
      if (!building) return
      const fp = building.footprint
      if (fp.length < 3) return
      src.setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [fp.map(p => [p.lng, p.lat]).concat([[fp[0].lng, fp[0].lat]])],
          },
        }],
      })
    }

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
        tracePointsRef.current = [...points, pos]
        drawingRef.current.addTracePoint(pos)
        return
      }
      if (curTool === 'asset') {
        useGraphStore.getState().addComponent({ id: genId('comp'), type: 'room', name: 'Asset', buildingId: activeBuildingIdRef.current ?? '', floor: activeFloorRef.current, position: pos })
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
          if (bid) { useStudioStore.getState().setActiveBuilding(bid); updateBuildingSelection(bid) }
          return
        }
        const hitTrace = features.find((f) => f.layer.id === LYR.TRACES_LINE || f.layer.id === LYR.TRACES_INNER)
        if (hitTrace) {
          const tid = hitTrace.properties?.id
          if (tid) {
            useStudioStore.getState().setSelectedTraceId(tid)
            return
          }
        }
        lastSelectedNodeRef.current = null
        useStudioStore.getState().setSelectedNodeId(null)
        useStudioStore.getState().setSelectedTraceId(null)
        useStudioStore.getState().setActiveBuilding(null)
        return
      }
    }

    const handleDblClick = () => {
      const curTool = toolRef.current
      if (curTool === 'route' && tracePointsRef.current.length >= 2) {
        drawingRef.current.requestConfirm('route')
      }
      if (curTool === 'select' && selectedTraceRef.current) {
        useStudioStore.getState().setVertexEditing('trace', selectedTraceRef.current)
      }
    }

    let dragStart: LatLng | null = null

    const handleMouseDown = (e: maplibregl.MapMouseEvent) => {
      if (e.originalEvent.button !== 0) return
      const curTool = toolRef.current
      if (curTool === 'select' && positionEditTargetRef.current?.type === 'building') {
        const targetId = positionEditTargetRef.current.id
        const features = map.queryRenderedFeatures(e.point)
        const hitBuilding = features.find((f) =>
          (f.layer.id === LYR.BUILDINGS_EXTRUSION || f.layer.id === LYR.BUILDINGS_FILL) &&
          f.properties?.id === targetId
        )
        if (hitBuilding) {
          const building = graphRef.current.buildings.find(b => b.id === targetId)
          if (building) {
            buildingDragRef.current = {
              buildingId: targetId,
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
      if (curTool === 'route' || curTool === 'building' || curTool === 'boundary' || curTool === 'area') {
        const points = curTool === 'route' ? tracePointsRef.current : drawPointsRef.current
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
              type: 'Feature' as const,
              properties: { id: bb.id, name: bb.name, color: bb.color || '#1C6BEB', height: bb.height || 15 },
              geometry: {
                type: 'Polygon' as const,
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
          dispatcherRef.current?.execute({ id: 'entity.update', payload: { entityId: buildingDrag.buildingId, changes: { footprint: { points: movedFootprint } } } })
        }
        useStudioStore.getState().setPositionEditTarget(null)
        buildingDragRef.current = null
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
        useGraphStore.getState().addComponentWithPolygon({ id: genId('comp'), type: 'room', name: 'Room', buildingId: activeBuildingIdRef.current ?? '', floor: activeFloorRef.current, position: center, polygon })
        dragStart = null
        setRoomDragRef.current?.(null)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (buildingDragRef.current) {
          buildingDragRef.current = null
          map.dragPan.enable()
          useGraphStore.setState((s) => ({ renderVersion: s.renderVersion + 1 }))
          return
        }
        useStudioStore.getState().setPositionEditTarget(null)
        if (lastSelectedNodeRef.current) {
          try {
            map.setFeatureState({ source: SRC.NODES, id: lastSelectedNodeRef.current }, { selected: false })
            map.setFeatureState({ source: SRC.NODES_CONNECTION, id: lastSelectedNodeRef.current }, { selected: false })
          } catch { /* ok */ }
          lastSelectedNodeRef.current = null
        }
        tracePointsRef.current = []
        drawPointsRef.current = []
        drawingRef.current.clearTracePoints()
        drawingRef.current.clearDrawPoints()
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
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        const curTool = toolRef.current
        if (curTool === 'route' && tracePointsRef.current.length > 0) {
          tracePointsRef.current = tracePointsRef.current.slice(0, -1)
          drawingRef.current.undoLastPoint()
        } else if ((curTool === 'building' || curTool === 'boundary' || curTool === 'area') && drawPointsRef.current.length > 0) {
          drawPointsRef.current = drawPointsRef.current.slice(0, -1)
          drawingRef.current.undoLastDrawPoint()
        }
        return
      }
      if (e.key === 'Enter') {
        const curTool = toolRef.current
        if (curTool === 'route' || curTool === 'building' || curTool === 'boundary' || curTool === 'area') {
          drawingRef.current.requestConfirm(curTool as 'route' | 'building' | 'boundary' | 'area')
        }
        return
      }
    }

    const ENTITY_LAYERS = [LYR.BUILDINGS_FILL, LYR.BUILDINGS_EXTRUSION, LYR.NODES, LYR.NODES_CONNECTION, LYR.TRACES_LINE, LYR.TRACES_INNER, LYR.AREAS_FILL]

    const handleEntityEnter = (e: maplibregl.MapMouseEvent) => {
      const curTool = toolRef.current
      if (curTool !== 'select') return
      const canvas = map.getCanvas()
      canvas.style.cursor = CURSOR_HAND
      const layerId = e.features?.[0]?.layer?.id
      if (!layerId) return
      if (layerId === LYR.BUILDINGS_FILL || layerId === LYR.BUILDINGS_EXTRUSION) {
        const bid = e.features[0].properties?.id as string | undefined
        if (bid) {
          hoveredBldgRef.current = bid
          map.setFeatureState({ source: SRC.BUILDINGS, id: bid }, { hover: true })
        }
        return
      }
      if (layerId === LYR.AREAS_FILL) {
        const aid = e.features[0].properties?.id as string | undefined
        const name = e.features[0].properties?.name as string | undefined
        if (aid) {
          hoveredAreaRef.current = aid
          map.setFeatureState({ source: SRC.AREAS, id: aid }, { hover: true })
          if (name) setTooltip({ x: e.point.x, y: e.point.y, text: name })
        }
        return
      }
      if (layerId === LYR.NODES_CONNECTION) {
        setTooltip({ x: e.point.x, y: e.point.y, text: 'Connection point' })
      }
    }

    const handleEntityLeave = () => {
      const canvas = map.getCanvas()
      const ct = toolRef.current
      canvas.style.cursor = ct === 'route' || ct === 'room' || ct === 'asset' || ct === 'boundary' || ct === 'building' || ct === 'area' ? CURSOR_CROSSHAIR : ''
      if (hoveredBldgRef.current) {
        map.setFeatureState({ source: SRC.BUILDINGS, id: hoveredBldgRef.current }, { hover: false })
        hoveredBldgRef.current = null
      }
      if (hoveredAreaRef.current) {
        map.setFeatureState({ source: SRC.AREAS, id: hoveredAreaRef.current }, { hover: false })
        hoveredAreaRef.current = null
      }
      setTooltip(null)
    }

    map.on('click', handleClick)
    map.on('dblclick', handleDblClick)
    map.on('mousedown', handleMouseDown)
    map.on('mousemove', handleMouseMove)
    map.on('mouseup', handleMouseUp)
    for (const l of ENTITY_LAYERS) {
      map.on('mouseenter', l, handleEntityEnter)
      map.on('mouseleave', l, handleEntityLeave)
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      if (hoveredBldgRef.current) map.setFeatureState({ source: SRC.BUILDINGS, id: hoveredBldgRef.current }, { hover: false })
      hoveredBldgRef.current = null
      if (hoveredAreaRef.current) map.setFeatureState({ source: SRC.AREAS, id: hoveredAreaRef.current }, { hover: false })
      hoveredAreaRef.current = null
      map.off('click', handleClick)
      map.off('dblclick', handleDblClick)
      map.off('mousedown', handleMouseDown)
      map.off('mousemove', handleMouseMove)
      map.off('mouseup', handleMouseUp)
      for (const l of ENTITY_LAYERS) {
        map.off('mouseenter', l, handleEntityEnter)
        map.off('mouseleave', l, handleEntityLeave)
      }
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [map])

  return (
    <>
      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x + 12, top: tooltip.y - 12,
          background: '#0F172A', color: '#fff', padding: '4px 10px', borderRadius: 6,
          fontSize: 11, whiteSpace: 'nowrap', zIndex: 20, pointerEvents: 'none',
          boxShadow: '0 2px 10px rgba(0,0,0,0.4)', border: '1px solid #334155',
        }}>
          {tooltip.text}
        </div>
      )}
    </>
  )
}
