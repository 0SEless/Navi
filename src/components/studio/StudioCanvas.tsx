'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useGraphStore } from '@/store/graph-store'
import { useStudioStore } from '@/store/studio-store'
import type { NavNode, NavEdge, LatLng, Building, TracePath } from '@/types/nav-types'
import type { Graph } from '@/engine/graph'
import { useCampusBoundary, type BoundaryPolygon } from './CampusBoundary'
import { useBuildingTracer, type BuildingFootprint } from './BuildingTracer'
import { useVertexEditor } from './useVertexEditor'
import { Trash2, Check, X } from 'lucide-react'

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

const SRC = { BUILDINGS: 's-buildings', EDGES: 's-edges', NODES: 's-nodes', NODES_CONNECTION: 's-nodes-connection', TRACES: 's-traces', DRAWING: 's-drawing' } as const
const LYR = { BUILDINGS_FILL: 'l-buildings-fill', BUILDINGS_EXTRUSION: 'l-buildings-extrusion', BUILDINGS_OUTLINE: 'l-buildings-outline', EDGES: 'l-edges', NODES: 'l-nodes', NODES_CONNECTION: 'l-nodes-connection', TRACES_LINE: 'l-traces-line', TRACES_INNER: 'l-traces-inner', DRAWING_LINE: 'l-drawing-line', DRAWING_POINTS: 'l-drawing-points' } as const
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

function syncAllData(map: maplibregl.Map, graph: Graph, activeFloor: number) {
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

function updateDrawingSource(map: maplibregl.Map | null, features: GeoJSON.Feature[]) {
  if (!map) return
  try {
    const src = map.getSource(SRC.DRAWING) as maplibregl.GeoJSONSource
    if (src) src.setData({ type: 'FeatureCollection', features })
  } catch { /* source not ready */ }
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
  const addComponent = useGraphStore((s) => s.addComponent)
  const addComponentWithPolygon = useGraphStore((s) => s.addComponentWithPolygon)
  const tool = useStudioStore((s) => s.tool)
  const activeFloor = useStudioStore((s) => s.activeFloor)
  const layers = useStudioStore((s) => s.layers)
  const tracePoints = useStudioStore((s) => s.tracePoints)
  const addTracePoint = useStudioStore((s) => s.addTracePoint)
  const setTracePoints = useStudioStore((s) => s.setTracePoints)
  const clearTracePoints = useStudioStore((s) => s.clearTracePoints)
  const setPendingConfirm = useStudioStore((s) => s.setPendingConfirm)
  const pendingConfirm = useStudioStore((s) => s.pendingConfirm)
  const setActiveBuilding = useStudioStore((s) => s.setActiveBuilding)
  const activeBuildingId = useStudioStore((s) => s.activeBuildingId)
  const setSelectedTraceId = useStudioStore((s) => s.setSelectedTraceId)
  const drawPoints = useStudioStore((s) => s.drawPoints)
  const setDrawPoints = useStudioStore((s) => s.setDrawPoints)
  const clearDrawPoints = useStudioStore((s) => s.clearDrawPoints)
  const undoLastTracePoint = useStudioStore((s) => s.undoLastTracePoint)
  const editTargetType = useStudioStore((s) => s.editTargetType)
  const isVertexEditing = useStudioStore((s) => s.isVertexEditing)
  const editTargetId = useStudioStore((s) => s.editTargetId)
  const setVertexEditing = useStudioStore((s) => s.setVertexEditing)
  const updateTrace = useGraphStore((s) => s.updateTrace)
  const recompileTrace = useGraphStore((s) => s.recompileTrace)
  const updateBuilding = useGraphStore((s) => s.updateBuilding)
  const save = useGraphStore((s) => s.save)
  const adjustBuildingId = useStudioStore((s) => s.adjustBuildingId)
  const setAdjustBuilding = useStudioStore((s) => s.setAdjustBuilding)
  const selectedNode = useStudioStore((s) => s.selectedNodeId)
  const setSelectedNode = useStudioStore((s) => s.setSelectedNodeId)
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

  const toolRef = useRef(tool)
  const tracePointsRef = useRef(tracePoints)
  const graphRef = useRef(graph)
  const activeFloorRef = useRef(activeFloor)
  const activeBuildingIdRef = useRef(activeBuildingId)
  const selectedNodeRef = useRef(selectedNode)
  const drawPointsRef = useRef(drawPoints)
  const dragVertexRef = useRef<{ index: number; points: LatLng[]; source: 'trace' | 'draw' } | null>(null)
  const adjustBuildingIdRef = useRef(adjustBuildingId)
  const buildingDragRef = useRef<{ buildingId: string; originalFootprint: LatLng[]; startPoint: LatLng } | null>(null)
  const lastSelectedNodeRef = useRef<string | null>(null)

  useEffect(() => { toolRef.current = tool }, [tool])
  useEffect(() => { tracePointsRef.current = tracePoints }, [tracePoints])
  useEffect(() => { graphRef.current = graph }, [graph])
  useEffect(() => { activeFloorRef.current = activeFloor }, [activeFloor])
  useEffect(() => { activeBuildingIdRef.current = activeBuildingId }, [activeBuildingId])
  useEffect(() => { adjustBuildingIdRef.current = adjustBuildingId }, [adjustBuildingId])
  useEffect(() => { selectedNodeRef.current = selectedNode }, [selectedNode])
  useEffect(() => { drawPointsRef.current = drawPoints }, [drawPoints])

  function getCurrentPoints() {
    const curTool = toolRef.current
    if (curTool === 'route') return tracePointsRef.current
    if (curTool === 'building' || curTool === 'boundary') return drawPointsRef.current
    return []
  }

  function setCurrentPoints(points: LatLng[]) {
    const curTool = toolRef.current
    if (curTool === 'route') { setTracePoints(points) }
    if (curTool === 'building' || curTool === 'boundary') { setDrawPoints(points) }
  }

  function findNearestVertex(mouseScreen: { x: number; y: number }, map: maplibregl.Map, points: LatLng[]): number {
    const THRESHOLD = 10
    let nearest = -1
    let nearestDist = THRESHOLD
    for (let i = 0; i < points.length; i++) {
      const screen = map.project([points[i].lng, points[i].lat])
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
    if (mapRef.current) return
    let mounted = true
    const c = center ?? { lat: 11.8195, lng: 122.0922 }
    const map = new maplibregl.Map({
      container: mapContainerRef.current!,
      style: getInitialStyle(),
      center: [c.lng, c.lat],
      zoom: 17,
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
        const ct = toolRef.current
        const canvas = map.getCanvas()
        if (ct === 'select') canvas.style.cursor = 'pointer'
        else canvas.style.cursor = ct === 'route' || ct === 'room' || ct === 'asset' || ct === 'boundary' || ct === 'building' ? CURSOR_CROSSHAIR : ''
      })
      readyRef.current = true
      setMapInstance(map)
      syncAllData(map, graphRef.current, activeFloorRef.current)
    })
    mapRef.current = map
    return () => { mounted = false; map.remove() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!readyRef.current || !mapRef.current) return
    const map = mapRef.current
    syncAllData(map, graphRef.current, activeFloorRef.current)
    // Restore selected node highlight after data refresh (feature-state cleared by setData)
    if (selectedNodeRef.current) {
      try {
        map.setFeatureState({ source: SRC.NODES, id: selectedNodeRef.current }, { selected: true })
      } catch { /* node may no longer exist */ }
    }
  }, [graph, activeFloor, renderVersion])

  useEffect(() => {
    if (!selectedBuilding || !mapRef.current || !readyRef.current) return
    const map = mapRef.current
    const b = selectedBuilding
    const opts = { pitch: map.getPitch(), bearing: map.getBearing(), duration: 500 }
    if (b.footprint.length >= 2) {
      const bounds = new maplibregl.LngLatBounds()
      b.footprint.forEach((p) => bounds.extend([p.lng, p.lat]))
      map.fitBounds(bounds, { padding: 120, ...opts })
    } else if (b.center) {
      map.flyTo({ center: [b.center.lng, b.center.lat], zoom: 18, ...opts })
    }
  }, [selectedBuilding, readyRef])

  useEffect(() => {
    const map = mapRef.current
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
        addTracePoint(pos)
        return
      }
      if (curTool === 'asset') {
        addComponent({ id: `comp-${Date.now()}`, type: 'room', name: 'Asset', buildingId: activeBuildingIdRef.current ?? '', floor: activeFloorRef.current, position: pos })
        return
      }
      if (curTool === 'select') {
        const features = map.queryRenderedFeatures(e.point)
        const hitNode = features.find((f) => f.layer.id === LYR.NODES || f.layer.id === LYR.NODES_CONNECTION)
        if (hitNode) {
          const nodeId = hitNode.properties?.id as string | null
          // Deselect previous
          if (lastSelectedNodeRef.current && lastSelectedNodeRef.current !== nodeId) {
            try {
              map.setFeatureState({ source: SRC.NODES, id: lastSelectedNodeRef.current }, { selected: false })
              map.setFeatureState({ source: SRC.NODES_CONNECTION, id: lastSelectedNodeRef.current }, { selected: false })
            } catch { /* ok */ }
          }
          // Select new
          if (nodeId) {
            try {
              const layerId = hitNode.layer.id
              const source = layerId === LYR.NODES_CONNECTION ? SRC.NODES_CONNECTION : SRC.NODES
              map.setFeatureState({ source, id: nodeId }, { selected: true })
            } catch { /* ok */ }
            lastSelectedNodeRef.current = nodeId
          }
          setSelectedNode(nodeId)
          return
        }
        const hitBuilding = features.find((f) => f.layer.id === LYR.BUILDINGS_EXTRUSION || f.layer.id === LYR.BUILDINGS_FILL)
        if (hitBuilding) {
          const bid = hitBuilding.properties?.id
          if (bid) setActiveBuilding(bid)
          return
        }
        const hitTrace = features.find((f) => f.layer.id === LYR.TRACES_LINE || f.layer.id === LYR.TRACES_INNER)
        if (hitTrace) {
          const tid = hitTrace.properties?.id
          if (tid) { setSelectedTraceId(tid); return }
        }
        // Deselect
        if (lastSelectedNodeRef.current) {
          try {
            map.setFeatureState({ source: SRC.NODES, id: lastSelectedNodeRef.current }, { selected: false })
            map.setFeatureState({ source: SRC.NODES_CONNECTION, id: lastSelectedNodeRef.current }, { selected: false })
          } catch { /* ok */ }
          lastSelectedNodeRef.current = null
        }
        setSelectedNode(null)
        setSelectedTraceId(null)
        return
      }
    }

    const handleDblClick = () => {
      const curTool = toolRef.current
      if (curTool === 'route' && tracePointsRef.current.length >= 2) {
        setPendingConfirm('route', [...tracePointsRef.current])
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
        setRoomDrag({ start: dragStart, current: dragStart })
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
        updateDrawingSource(mapRef.current, drawFeatures)
        return
      }
      if (dragStart && toolRef.current === 'room') {
        setRoomDrag({ start: dragStart, current: { lat: e.lngLat.lat, lng: e.lngLat.lng } })
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
          updateBuilding(buildingDrag.buildingId, { footprint: movedFootprint, center: centroid })
          save()
        }
        setAdjustBuilding(null)
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
        addComponentWithPolygon({ id: `comp-${Date.now()}`, type: 'room', name: 'Room', buildingId: activeBuildingIdRef.current ?? '', floor: activeFloorRef.current, position: center, polygon })
        dragStart = null
        setRoomDrag(null)
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
        // Deselect node visually
        if (lastSelectedNodeRef.current) {
          try {
            map.setFeatureState({ source: SRC.NODES, id: lastSelectedNodeRef.current }, { selected: false })
            map.setFeatureState({ source: SRC.NODES_CONNECTION, id: lastSelectedNodeRef.current }, { selected: false })
          } catch { /* ok */ }
          lastSelectedNodeRef.current = null
        }
        clearTracePoints(); clearDrawPoints(); setRoomDrag(null); setVertexEditing(null, null)
      }
      if (e.key === 'Delete' && selectedNodeRef.current) {
        // Deselect before deleting
        if (lastSelectedNodeRef.current) {
          try {
            map.setFeatureState({ source: SRC.NODES, id: lastSelectedNodeRef.current }, { selected: false })
            map.setFeatureState({ source: SRC.NODES_CONNECTION, id: lastSelectedNodeRef.current }, { selected: false })
          } catch { /* ok */ }
          lastSelectedNodeRef.current = null
        }
        graphRef.current.removeNode(selectedNodeRef.current)
        setSelectedNode(null)
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      setVis(LYR.NODES, true)
      setVis(LYR.NODES_CONNECTION, true)
    } else {
      // Restore to user's layer preference
      setVis(LYR.NODES, layers.nodes)
      setVis(LYR.NODES_CONNECTION, layers.nodes)
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
      syncAllData(map, graphRef.current, activeFloorRef.current)
    })
  }, [layers.satellite, mapInstance])

  useCampusBoundary(mapInstance, (result: BoundaryPolygon) => {
    setPendingConfirm('boundary', result.points)
  })

  useBuildingTracer(mapInstance, (result: BuildingFootprint) => {
    setPendingConfirm('building', result.points)
  })

  useEffect(() => {
    const m = mapRef.current
    if (!m || !readyRef.current) return
    const drawFeatures: GeoJSON.Feature[] = []

    if (tracePoints.length > 0 && tool === 'route') {
      const coords = tracePoints.map((p) => [p.lng, p.lat])
      drawFeatures.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} })
      for (const p of tracePoints) {
        drawFeatures.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: {} })
      }
    }

    if (pendingConfirm && pendingConfirm.points.length >= 2) {
      const isPolygon = pendingConfirm.type === 'building' || pendingConfirm.type === 'boundary'
      const coords = pendingConfirm.points.map((p) => [p.lng, p.lat])
      if (isPolygon && pendingConfirm.points.length >= 3) {
        drawFeatures.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]]] },
          properties: { pending: true },
        })
      }
      drawFeatures.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: isPolygon && pendingConfirm.points.length >= 3 ? [...coords, coords[0]] : coords },
        properties: { pending: true },
      })
      for (const p of pendingConfirm.points) {
        drawFeatures.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { pending: true } })
      }
    }

    if (roomDrag && tool === 'room') {
      const s = roomDrag.start; const c = roomDrag.current
      drawFeatures.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[s.lng, s.lat], [c.lng, s.lat], [c.lng, c.lat], [s.lng, c.lat], [s.lng, s.lat]]] },
        properties: {},
      })
    }

    updateDrawingSource(m, drawFeatures)
  }, [tracePoints, roomDrag, tool, pendingConfirm])

  const showConfirmBar =
    tool === 'route' && tracePoints.length > 0 ||
    (tool === 'building' || tool === 'boundary') && drawPoints.length > 0

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

  const minPoints = tool === 'route' ? 2 : 3
  const canConfirm = tool === 'route' ? tracePoints.length >= 2 : drawPoints.length >= 3
  const currentPoints = tool === 'route' ? tracePoints : drawPoints
  const toolLabel =
    tool === 'route' ? 'Campus route' :
    tool === 'building' ? 'Building footprint' :
    tool === 'boundary' ? 'Campus boundary' : ''

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
      {showConfirmBar && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 6, background: '#1E293B', borderRadius: 8, padding: '4px 6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 10, alignItems: 'center',
        }}>
          <span style={{
            fontSize: 10, color: '#06B6D4',
            padding: '0 4px', fontWeight: 600, whiteSpace: 'nowrap',
          }}>
            {toolLabel}
          </span>
          <span style={{ fontSize: 10, color: '#94A3B8', padding: '0 4px' }}>
            {currentPoints.length} point{currentPoints.length !== 1 ? 's' : ''} (need {minPoints})
          </span>
          {tool === 'route' && (
            <>
              <button onClick={() => setRouteWidth(routeWidth - 1)}
                style={{
                  width: 24, height: 24, borderRadius: 4, border: 'none',
                  background: '#475569', color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, lineHeight: 1,
                }}
              >−</button>
              <span style={{ fontSize: 10, color: '#06B6D4', fontWeight: 600, minWidth: 16, textAlign: 'center' }}>
                {routeWidth}
              </span>
              <button onClick={() => setRouteWidth(routeWidth + 1)}
                style={{
                  width: 24, height: 24, borderRadius: 4, border: 'none',
                  background: '#475569', color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, lineHeight: 1,
                }}
              >+</button>
            </>
          )}
          <button onClick={handleUndo} disabled={currentPoints.length < 1}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 6,
              border: 'none', background: currentPoints.length < 1 ? '#374151' : '#475569',
              color: currentPoints.length < 1 ? '#6B7280' : '#fff', fontSize: 11,
              cursor: currentPoints.length < 1 ? 'not-allowed' : 'pointer',
            }}
          >
            <Trash2 size={12} />
          </button>
          <button onClick={handleConfirm} disabled={!canConfirm}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6,
              border: 'none', background: !canConfirm ? '#374151' : '#10B981',
              color: !canConfirm ? '#6B7280' : '#fff', fontSize: 11,
              cursor: !canConfirm ? 'not-allowed' : 'pointer',
            }}
          >
            <Check size={12} /> Confirm
          </button>
          <button onClick={handleCancel}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6,
              border: 'none', background: '#EF4444', color: '#fff', fontSize: 11, cursor: 'pointer',
            }}
          >
            <X size={12} /> Cancel
          </button>
        </div>
      )}
    </div>
  )
}
