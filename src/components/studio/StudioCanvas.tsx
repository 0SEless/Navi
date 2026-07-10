'use client'

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useGraphStore } from '@/store/graph-store'
import { useStudioStore } from '@/store/studio-store'
import type { NavNode, NavEdge, LatLng, Building, TracePath } from '@/types/nav-types'
import type { Graph } from '@/engine/graph'
import { useCampusBoundary, type BoundaryPolygon } from './CampusBoundary'
import { useBuildingTracer, type BuildingFootprint } from './BuildingTracer'
import { useVertexEditor } from './useVertexEditor'
import { ConfirmBar } from './ConfirmBar'
import { SelectionOverlay } from './SelectionOverlay'
import { DrawingOverlay } from './DrawingOverlay'
import { PreviewOverlay } from './PreviewOverlay'
import { DrawingSessionProvider, type DrawingSessionValue } from './useDrawingSession'
import { ViewportController } from './ViewportController'
import { useToolController } from './useToolController'
import { InteractionController } from './InteractionController'

const FALLBACK_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background' as const,
      paint: { 'background-color': '#1a1a2e' },
    },
  ],
}

const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' as const }],
}

const SATELLITE_STYLE = {
  version: 8 as const,
  sources: {
    satellite: {
      type: 'raster' as const,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    },
  },
  layers: [{ id: 'satellite', type: 'raster' as const, source: 'satellite' as const }],
}

export const SRC = { BUILDINGS: 's-buildings', EDGES: 's-edges', NODES: 's-nodes', NODES_CONNECTION: 's-nodes-connection', TRACES: 's-traces', DRAWING: 's-drawing' } as const
export const LYR = { BUILDINGS_FILL: 'l-buildings-fill', BUILDINGS_EXTRUSION: 'l-buildings-extrusion', BUILDINGS_OUTLINE: 'l-buildings-outline', EDGES: 'l-edges', NODES: 'l-nodes', NODES_CONNECTION: 'l-nodes-connection', TRACES_LINE: 'l-traces-line', TRACES_INNER: 'l-traces-inner', DRAWING_LINE: 'l-drawing-line', DRAWING_POINTS: 'l-drawing-points' } as const
const HIDDEN_NODE_TYPES = new Set(['room', 'staircase', 'elevator'])

const CURSOR_CROSSHAIR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cline x1='12' y1='2' x2='12' y2='10' stroke='%23000' stroke-width='2'/%3E%3Cline x1='12' y1='14' x2='12' y2='22' stroke='%23000' stroke-width='2'/%3E%3Cline x1='2' y1='12' x2='10' y2='12' stroke='%23000' stroke-width='2'/%3E%3Cline x1='14' y1='12' x2='22' y2='12' stroke='%23000' stroke-width='2'/%3E%3C/svg%3E") 12 12, crosshair`

function getInitialStyle() {
  if (typeof window !== 'undefined') {
    return OSM_STYLE
  }
  return FALLBACK_STYLE
}

function buildBuildingGeo(buildings: Building[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: buildings.map((b) => ({
      type: 'Feature',
      properties: { id: b.id, name: b.name, color: b.color || '#1C6BEB', height: b.height || 15 },
      geometry: {
        type: 'Polygon',
        coordinates: [b.footprint.map((p) => [p.lng, p.lat] as [number, number]).concat([[b.footprint[0].lng, b.footprint[0].lat] as [number, number]])],
      },
    })),
  }
}

function buildNodeGeo(nodes: NavNode[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: nodes.map((n) => ({
      type: 'Feature',
      properties: { id: n.id, type: n.type },
      geometry: { type: 'Point', coordinates: [n.position.lng, n.position.lat] },
    })),
  }
}

function buildConnectionNodeGeo(nodes: NavNode[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: nodes.map((n) => ({
      type: 'Feature',
      properties: { id: n.id, connection: true },
      geometry: { type: 'Point', coordinates: [n.position.lng, n.position.lat] },
    })),
  }
}

function buildEdgeGeo(edges: NavEdge[], nodes: NavNode[]): GeoJSON.FeatureCollection {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  return {
    type: 'FeatureCollection',
    features: edges.map((e) => {
      const from = nodeMap.get(e.from)
      const to = nodeMap.get(e.to)
      if (!from || !to) return null
      return {
        type: 'Feature',
        properties: { id: e.id },
        geometry: { type: 'LineString', coordinates: [[from.position.lng, from.position.lat], [to.position.lng, to.position.lat]] },
      }
    }).filter(Boolean) as GeoJSON.Feature[],
  }
}

function buildTracesGeo(traces: TracePath[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: traces.map((t) => ({
      type: 'Feature',
      properties: { id: t.id, name: t.name, type: t.type, color: t.color || '#FFFFFF', width: t.width ?? 8 },
      geometry: {
        type: 'LineString',
        coordinates: t.points.map((p) => [p.lng, p.lat] as [number, number]),
      },
    })),
  }
}

function addSourcesAndLayers(map: maplibregl.Map) {
  if (map.getSource(SRC.BUILDINGS)) return
  map.addSource(SRC.BUILDINGS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: LYR.BUILDINGS_FILL, type: 'fill', source: SRC.BUILDINGS, paint: { 'fill-color': '#1C6BEB', 'fill-opacity': 0.08 } })
  map.addLayer({ id: LYR.BUILDINGS_EXTRUSION, type: 'fill-extrusion', source: SRC.BUILDINGS, paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': 0.65, 'fill-extrusion-base': 0 } })
  map.addLayer({ id: LYR.BUILDINGS_OUTLINE, type: 'line', source: SRC.BUILDINGS, paint: { 'line-color': ['get', 'color'], 'line-width': 2 } })

  map.addSource(SRC.EDGES, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: LYR.EDGES, type: 'line', source: SRC.EDGES, paint: { 'line-color': '#475569', 'line-width': 2 } })

  map.addSource(SRC.NODES, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'id' })
  map.addLayer({ id: LYR.NODES, type: 'circle', source: SRC.NODES, paint: {
    'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 8, 5],
    'circle-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#22D3EE', '#F59E0B'],
    'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 2],
    'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#0E7490', '#1E293B'],
  } })

  map.addSource(SRC.NODES_CONNECTION, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'id' })
  map.addLayer({ id: LYR.NODES_CONNECTION, type: 'circle', source: SRC.NODES_CONNECTION, paint: {
    'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 9, 6],
    'circle-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#67E8F9', '#22D3EE'],
    'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 2.5],
    'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#155E75', '#0E7490'],
  } })

  map.addSource(SRC.TRACES, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: LYR.TRACES_LINE, type: 'line', source: SRC.TRACES, paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': 0.8 }, filter: ['==', ['get', 'type'], 'arterial'] })
  map.addLayer({ id: LYR.TRACES_INNER, type: 'line', source: SRC.TRACES, paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': 0.5 }, filter: ['!=', ['get', 'type'], 'arterial'] })

  map.addSource(SRC.DRAWING, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: LYR.DRAWING_LINE, type: 'line', source: SRC.DRAWING, paint: { 'line-color': '#06B6D4', 'line-width': 3, 'line-dasharray': [4, 4], 'line-opacity': 0.6 } })
  map.addLayer({ id: LYR.DRAWING_POINTS, type: 'circle', source: SRC.DRAWING, paint: { 'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 9, 6], 'circle-color': '#06B6D4', 'circle-opacity': 0.8, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } })
}

export function syncAllData(map: maplibregl.Map, graph: Graph, activeFloor: number) {
  const filteredNodes = graph.nodes.filter((n: NavNode) => n.floor === activeFloor)
  const filteredEdges = graph.edges.filter((e: NavEdge) => {
    const from = graph.getNode(e.from)
    const to = graph.getNode(e.to)
    return from?.floor === activeFloor && to?.floor === activeFloor
  })
  const visibleNodes = filteredNodes.filter((n) => !HIDDEN_NODE_TYPES.has(n.type))
  const connNodes = visibleNodes.filter(n => n.metadata?.connectionNode === true)
  const connNodeIds = new Set(connNodes.map((n) => n.id))
  const regNodes = visibleNodes.filter(n => !connNodeIds.has(n.id))
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id))
  const visibleEdges = filteredEdges.filter((e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to))
  const buildingGeo = buildBuildingGeo(graph.buildings)
  const nodeGeo = buildNodeGeo(regNodes)
  const connNodeGeo = buildConnectionNodeGeo(connNodes)
  const edgeGeo = buildEdgeGeo(visibleEdges, visibleNodes)
  const tracesGeo = buildTracesGeo(graph.traces)
  try {
    const buildingSrc = map.getSource(SRC.BUILDINGS) as maplibregl.GeoJSONSource
    const nodeSrc = map.getSource(SRC.NODES) as maplibregl.GeoJSONSource
    const connNodeSrc = map.getSource(SRC.NODES_CONNECTION) as maplibregl.GeoJSONSource
    const edgeSrc = map.getSource(SRC.EDGES) as maplibregl.GeoJSONSource
    const tracesSrc = map.getSource(SRC.TRACES) as maplibregl.GeoJSONSource
    if (buildingSrc) buildingSrc.setData(buildingGeo)
    if (nodeSrc) nodeSrc.setData(nodeGeo)
    if (connNodeSrc) connNodeSrc.setData(connNodeGeo)
    if (edgeSrc) edgeSrc.setData(edgeGeo)
    if (tracesSrc) tracesSrc.setData(tracesGeo)
  } catch { console.warn('[StudioCanvas] source not ready') }
}

interface StudioCanvasProps {
  center?: { lat: number; lng: number }
}

export function StudioCanvas({ center }: StudioCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null)

  const graph = useGraphStore((s) => s.graph)
  const renderVersion = useGraphStore((s) => s.renderVersion)
  const updateTrace = useGraphStore((s) => s.updateTrace)
  const recompileTrace = useGraphStore((s) => s.recompileTrace)
  const save = useGraphStore((s) => s.save)
  const tool = useStudioStore((s) => s.tool)
  const activeFloor = useStudioStore((s) => s.activeFloor)
  const layers = useStudioStore((s) => s.layers)
  const tracePoints = useStudioStore((s) => s.tracePoints)
  const addTracePoint = useStudioStore((s) => s.addTracePoint)
  const clearTracePoints = useStudioStore((s) => s.clearTracePoints)
  const setPendingConfirm = useStudioStore((s) => s.setPendingConfirm)
  const pendingConfirm = useStudioStore((s) => s.pendingConfirm)
  const activeBuildingId = useStudioStore((s) => s.activeBuildingId)
  const drawPoints = useStudioStore((s) => s.drawPoints)
  const setDrawPoints = useStudioStore((s) => s.setDrawPoints)
  const clearDrawPoints = useStudioStore((s) => s.clearDrawPoints)
  const undoLastTracePoint = useStudioStore((s) => s.undoLastTracePoint)
  const editTargetType = useStudioStore((s) => s.editTargetType)
  const isVertexEditing = useStudioStore((s) => s.isVertexEditing)
  const editTargetId = useStudioStore((s) => s.editTargetId)
  const selectedNode = useStudioStore((s) => s.selectedNodeId)
  const selectedBuilding = activeBuildingId ? graph.buildings.find((b) => b.id === activeBuildingId) ?? null : null

  const currentEditTrace = editTargetType === 'trace' && editTargetId
    ? graph.traces.find((t) => t.id === editTargetId) ?? null
    : null

  useVertexEditor(mapInstance, currentEditTrace, (points) => {
    if (currentEditTrace) {
      updateTrace(currentEditTrace.id, { points })
      recompileTrace(currentEditTrace.id)
      save()
    }
  })

  const [roomDrag, setRoomDrag] = useState<{ start: LatLng; current: LatLng } | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
  const preEditLayerVisRef = useRef<{ nodes: boolean }>({ nodes: true })

useEffect(() => {
    if (mapRef.current) return
    let mounted = true
    const map = new maplibregl.Map({
      container: mapContainerRef.current!,
      style: getInitialStyle(),
    })
    map.on('load', () => {
      if (!mounted) return
      addSourcesAndLayers(map)
      map.on('mouseenter', LYR.NODES_CONNECTION, (e) => {
        setTooltip({ x: e.point.x, y: e.point.y, text: 'Connection point' })
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', LYR.NODES_CONNECTION, () => {
        setTooltip(null)
        const ct = useStudioStore.getState().tool
        const canvas = map.getCanvas()
        if (ct === 'select') canvas.style.cursor = 'pointer'
        else canvas.style.cursor = ct === 'route' || ct === 'room' || ct === 'asset' || ct === 'boundary' || ct === 'building' ? CURSOR_CROSSHAIR : ''
      })
      readyRef.current = true
      setMapInstance(map)
      syncAllData(map, graph, activeFloor)
    })
    mapRef.current = map
    return () => { mounted = false; map.remove() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return
    const map = mapRef.current
    syncAllData(map, graph, activeFloor)
    if (selectedNode) {
      try {
        map.setFeatureState({ source: SRC.NODES, id: selectedNode }, { selected: true })
      } catch { /* node may no longer exist */ }
    }
  }, [graph, activeFloor, renderVersion])

  // Selection highlight is managed by <SelectionOverlay />

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const canvas = map.getCanvas()
    if (tool === 'route' || tool === 'room' || tool === 'asset' || tool === 'boundary' || tool === 'building') canvas.style.cursor = CURSOR_CROSSHAIR
    else if (tool === 'select') canvas.style.cursor = 'pointer'
    else canvas.style.cursor = ''
    if (tool === 'route' || tool === 'room' || tool === 'boundary' || tool === 'building' || tool === 'vertex') map.dragPan.disable()
    else map.dragPan.enable()
  }, [tool])

  // Apply layer visibility toggles
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return

    const setVis = (layerId: string, visible: boolean) => {
      try { map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none') } catch { /* layer may not exist */ }
    }

    setVis(LYR.NODES, layers.nodes)
    setVis(LYR.NODES_CONNECTION, layers.nodes)
    setVis(LYR.EDGES, layers.edges)
    setVis(LYR.BUILDINGS_FILL, layers.buildings)
    setVis(LYR.BUILDINGS_EXTRUSION, layers.buildings)
    setVis(LYR.BUILDINGS_OUTLINE, layers.buildings)
  }, [layers, mapInstance])

  // Auto-show node layers during vertex editing
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return

    const setVis = (layerId: string, visible: boolean) => {
      try { map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none') } catch { /* ok */ }
    }

    if (isVertexEditing) {
      // Snapshot current pre-editing state
      preEditLayerVisRef.current = { nodes: layers.nodes }
      setVis(LYR.NODES, true)
      setVis(LYR.NODES_CONNECTION, true)
    } else {
      // Restore from pre-editing snapshot
      setVis(LYR.NODES, preEditLayerVisRef.current.nodes)
      setVis(LYR.NODES_CONNECTION, preEditLayerVisRef.current.nodes)
    }
  }, [isVertexEditing, mapInstance])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const currentStyle = map.getStyle()
    const isSatellite = currentStyle?.sources?.satellite != null
    const wantsSatellite = layers.satellite
    if (wantsSatellite === isSatellite) return
    const targetStyle = wantsSatellite ? SATELLITE_STYLE : OSM_STYLE
    map.setStyle(targetStyle)
    map.once('style.load', () => {
      addSourcesAndLayers(map)
      syncAllData(map, graph, activeFloor)
    })
  }, [layers.satellite, mapInstance])

  useToolController()

  useCampusBoundary(mapInstance, (result: BoundaryPolygon) => {
    setPendingConfirm('boundary', result.points)
  })

  useBuildingTracer(mapInstance, (result: BuildingFootprint) => {
    setPendingConfirm('building', result.points)
  })

  const routeWidth = useStudioStore((s) => s.routeWidth)
  const setRouteWidth = useStudioStore((s) => s.setRouteWidth)

  const handleConfirm = useCallback(() => {
    if (tool === 'route') {
      if (tracePoints.length >= 2) setPendingConfirm('route', tracePoints)
    }
    if (tool === 'building' && drawPoints.length >= 3) {
      setPendingConfirm('building', drawPoints)
    }
    if (tool === 'boundary' && drawPoints.length >= 3) {
      setPendingConfirm('boundary', drawPoints)
    }
  }, [tool, tracePoints, drawPoints, setPendingConfirm])

  const handleCancel = useCallback(() => {
    if (tool === 'route') { clearTracePoints() }
    clearDrawPoints()
  }, [tool, clearTracePoints, clearDrawPoints])

  const handleUndo = useCallback(() => {
    if (tool === 'route') { undoLastTracePoint() }
    if (tool === 'building' || tool === 'boundary') {
      setDrawPoints(drawPoints.slice(0, -1))
    }
  }, [tool, undoLastTracePoint, drawPoints, setDrawPoints])

  const canConfirm = tool === 'route' ? tracePoints.length >= 2 : drawPoints.length >= 3
  const toolLabel =
    tool === 'route' ? 'Campus route' :
    tool === 'building' ? 'Building footprint' :
    tool === 'boundary' ? 'Campus boundary' : ''

  const drawingSessionValue = useMemo<DrawingSessionValue>(() => ({
    tracePoints,
    drawPoints,
    routeWidth,
    roomDrag,
    pendingConfirm: pendingConfirm as any,
    addTracePoint,
    undoLastPoint: undoLastTracePoint,
    clearTracePoints,
    addDrawPoint,
    undoLastDrawPoint: () => setDrawPoints(drawPoints.slice(0, -1)),
    clearDrawPoints,
    setRoomDrag,
    requestConfirm: () => {
      if (tool === 'route' && tracePoints.length >= 2) {
        setPendingConfirm('route', tracePoints as any)
      } else if ((tool === 'building' || tool === 'boundary') && drawPoints.length >= 3) {
        setPendingConfirm(tool, drawPoints as any)
      }
    },
    confirm: () => {
      const pts = pendingConfirm?.points ?? []
      setPendingConfirm(undefined as any)
      clearTracePoints()
      clearDrawPoints()
      return pts as any
    },
    cancel: () => {
      setPendingConfirm(undefined as any)
      clearTracePoints()
      clearDrawPoints()
    },
    setRouteWidth,
  }), [
    tracePoints, drawPoints, routeWidth, roomDrag, pendingConfirm,
    addTracePoint, undoLastTracePoint, clearTracePoints,
    addDrawPoint, clearDrawPoints, setRoomDrag, setRouteWidth,
    tool, setPendingConfirm,
  ])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
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
      {(tool === 'route' && tracePoints.length > 0) || (tool === 'building' || tool === 'boundary') && drawPoints.length > 0 ? (
        <ConfirmBar
          tracePoints={tracePoints}
          drawPoints={drawPoints}
          routeWidth={routeWidth}
          tool={tool}
          canConfirm={canConfirm}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          onUndo={handleUndo}
          onSetWidth={setRouteWidth}
          toolLabel={toolLabel}
        />
      ) : null}
      <DrawingSessionProvider value={drawingSessionValue}>
        {mapInstance && <DrawingOverlay map={mapInstance} />}
        {mapInstance && <PreviewOverlay map={mapInstance} />}
      </DrawingSessionProvider>
      {mapInstance && <SelectionOverlay map={mapInstance} />}
      {mapInstance && <ViewportController map={mapInstance} initialCenter={center} />}
      {mapInstance && <InteractionController map={mapInstance} onSetRoomDrag={setRoomDrag} />}
    </div>
  )
}
