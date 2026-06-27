'use client'

import { useRef, useEffect, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useGraphStore } from '@/store/graph-store'
import { useStudioStore } from '@/store/studio-store'
import type { NavNode, NavEdge, LatLng, Building } from '@/types/nav-types'
import type { Graph } from '@/engine/graph'
import { useCampusBoundary, type BoundaryPolygon } from './CampusBoundary'
import { useBuildingTracer, type BuildingFootprint } from './BuildingTracer'

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

function getInitialStyle() {
  if (typeof window !== 'undefined') {
    return OSM_STYLE
  }
  return FALLBACK_STYLE
}

const SRC = {
  BUILDINGS: 'studio-buildings',
  NODES: 'studio-nodes',
  EDGES: 'studio-edges',
  DRAWING: 'studio-drawing',
  TRACE: 'studio-trace',
  ROOMS: 'studio-rooms',
}

const LYR = {
  BUILDINGS_FILL: 'studio-buildings-fill',
  BUILDINGS_OUTLINE: 'studio-buildings-outline',
  BUILDINGS_EXTRUSION: 'studio-buildings-extrusion',
  EDGES: 'studio-edges',
  NODES: 'studio-nodes',
  NODES_INNER: 'studio-nodes-inner',
  NODES_LABEL: 'studio-nodes-label',
  DRAWING_LINE: 'studio-drawing-line',
  DRAWING_POINTS: 'studio-drawing-points',
  TRACE_LINE: 'studio-trace-line',
  TRACE_POINTS: 'studio-trace-points',
  ROOMS_FILL: 'studio-rooms-fill',
  ROOMS_OUTLINE: 'studio-rooms-outline',
}

function buildBuildingGeo(buildings: Building[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: buildings.map((b) => ({
      type: 'Feature',
      properties: { id: b.id, name: b.name, color: b.color || '#1C6BEB', height: b.height || 15 },
      geometry: {
        type: 'Polygon',
        coordinates: b.footprint.length >= 3
          ? [[...b.footprint.map((p) => [p.lng, p.lat] as [number, number]), [b.footprint[0].lng, b.footprint[0].lat] as [number, number]]]
          : (() => {
              const c = b.footprint.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 })
              const avg = { lat: c.lat / b.footprint.length, lng: c.lng / b.footprint.length }
              return [[
                [avg.lng - 0.0003, avg.lat - 0.0003],
                [avg.lng + 0.0003, avg.lat - 0.0003],
                [avg.lng + 0.0003, avg.lat + 0.0003],
                [avg.lng - 0.0003, avg.lat + 0.0003],
                [avg.lng - 0.0003, avg.lat - 0.0003],
              ]]
            })(),
      },
    })),
  }
}

function buildNodeGeo(nodes: NavNode[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: nodes.map((n) => ({
      type: 'Feature',
      properties: { id: n.id, label: n.label, type: n.type },
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
        properties: { id: e.id, type: e.type },
        geometry: {
          type: 'LineString',
          coordinates: [[from.position.lng, from.position.lat], [to.position.lng, to.position.lat]],
        },
      }
    }).filter(Boolean) as GeoJSON.Feature[],
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

  map.addSource(SRC.NODES, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: LYR.NODES, type: 'circle', source: SRC.NODES, paint: { 'circle-radius': 5, 'circle-color': '#F59E0B', 'circle-stroke-width': 2, 'circle-stroke-color': '#1E293B' } })

  map.addSource(SRC.DRAWING, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: LYR.DRAWING_LINE, type: 'line', source: SRC.DRAWING, paint: { 'line-color': '#F59E0B', 'line-width': 3, 'line-dasharray': [4, 4], 'line-opacity': 0.6 } })
  map.addLayer({ id: LYR.DRAWING_POINTS, type: 'circle', source: SRC.DRAWING, paint: { 'circle-radius': 5, 'circle-color': '#F59E0B', 'circle-opacity': 0.7 } })

  map.addSource(SRC.ROOMS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: LYR.ROOMS_FILL, type: 'fill', source: SRC.ROOMS, paint: { 'fill-color': '#10B981', 'fill-opacity': 0.15 } })
  map.addLayer({ id: LYR.ROOMS_OUTLINE, type: 'line', source: SRC.ROOMS, paint: { 'line-color': '#10B981', 'line-width': 2 } })
}

function syncAllData(map: maplibregl.Map, graph: Graph, activeFloor: number) {
  const filteredNodes = graph.nodes.filter((n: NavNode) => n.floor === activeFloor)
  const filteredEdges = graph.edges.filter((e: NavEdge) => {
    const from = graph.getNode(e.from)
    const to = graph.getNode(e.to)
    return from?.floor === activeFloor && to?.floor === activeFloor
  })
  const buildingGeo = buildBuildingGeo(graph.buildings)
  const nodeGeo = buildNodeGeo(filteredNodes)
  const edgeGeo = buildEdgeGeo(filteredEdges, filteredNodes)
  try {
    const buildingSrc = map.getSource(SRC.BUILDINGS) as maplibregl.GeoJSONSource
    const nodeSrc = map.getSource(SRC.NODES) as maplibregl.GeoJSONSource
    const edgeSrc = map.getSource(SRC.EDGES) as maplibregl.GeoJSONSource
    if (buildingSrc) buildingSrc.setData(buildingGeo)
    if (nodeSrc) nodeSrc.setData(nodeGeo)
    if (edgeSrc) edgeSrc.setData(edgeGeo)
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
  const addComponent = useGraphStore((s) => s.addComponent)
  const addComponentWithPolygon = useGraphStore((s) => s.addComponentWithPolygon)
  const addBuilding = useGraphStore((s) => s.addBuilding)
  const addTrace = useGraphStore((s) => s.addTrace)
  const tool = useStudioStore((s) => s.tool)
  const activeFloor = useStudioStore((s) => s.activeFloor)
  const editorMode = useStudioStore((s) => s.editorMode)
  const layers = useStudioStore((s) => s.layers)
  const tracePoints = useStudioStore((s) => s.tracePoints)
  const addTracePoint = useStudioStore((s) => s.addTracePoint)
  const clearTracePoints = useStudioStore((s) => s.clearTracePoints)
  const setPendingConfirm = useStudioStore((s) => s.setPendingConfirm)
  const pendingConfirm = useStudioStore((s) => s.pendingConfirm)
  const setActiveBuilding = useStudioStore((s) => s.setActiveBuilding)
  const activeBuildingId = useStudioStore((s) => s.activeBuildingId)

  const [cursorLL, setCursorLL] = useState<LatLng | null>(null)
  const [roomDrag, setRoomDrag] = useState<{ start: LatLng; current: LatLng } | null>(null)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  const toolRef = useRef(tool)
  const tracePointsRef = useRef(tracePoints)
  const graphRef = useRef(graph)
  const activeFloorRef = useRef(activeFloor)
  const selectedNodeRef = useRef(selectedNode)
  useEffect(() => { toolRef.current = tool }, [tool])
  useEffect(() => { tracePointsRef.current = tracePoints }, [tracePoints])
  useEffect(() => { graphRef.current = graph }, [graph])
  useEffect(() => { activeFloorRef.current = activeFloor }, [activeFloor])
  useEffect(() => { selectedNodeRef.current = selectedNode }, [selectedNode])

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
      readyRef.current = true
      setMapInstance(map)
      syncAllData(map, graphRef.current, activeFloorRef.current)
    })
    map.on('error', (e) => {
      console.error('[StudioCanvas] Map error:', e)
      if (e.error?.message?.includes('Style is not done loading') || e.error?.message?.includes('style')) {
        console.warn('[StudioCanvas] Style load failed, switching to fallback')
        map.setStyle(FALLBACK_STYLE)
        map.once('style.load', () => {
          addSourcesAndLayers(map)
          readyRef.current = true
          setMapInstance(map)
          syncAllData(map, graphRef.current, activeFloorRef.current)
        })
      }
    })
    mapRef.current = map
    return () => { mounted = false; map.remove(); mapRef.current = null; readyRef.current = false; setMapInstance(null) }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    syncAllData(map, graph, activeFloor)
  }, [graph, activeFloor])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const curTool = toolRef.current
      const pos = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      if (curTool === 'trace' || curTool === 'route_test') { addTracePoint(pos); return }
      if (curTool === 'asset') {
        addComponent({ id: `comp-${Date.now()}`, type: 'room', name: 'Asset', buildingId: activeBuildingId ?? '', floor: activeFloorRef.current, position: pos })
        return
      }
      if (curTool === 'select') {
        const features = map.queryRenderedFeatures(e.point)
        const hitNode = features.find((f) => f.layer.id === LYR.NODES)
        if (hitNode) { setSelectedNode(hitNode.properties?.id ?? null); return }
        const hitBuilding = features.find((f) => f.layer.id === LYR.BUILDINGS_EXTRUSION || f.layer.id === LYR.BUILDINGS_FILL)
        if (hitBuilding) {
          const bid = hitBuilding.properties?.id
          if (bid) setActiveBuilding(bid)
          return
        }
        setSelectedNode(null)
        return
      }
    }

    const handleDblClick = () => {
      const curTool = toolRef.current
      if ((curTool === 'trace' || curTool === 'route_test') && tracePointsRef.current.length >= 2) {
        setPendingConfirm('trace', [...tracePointsRef.current])
      }
    }

    let dragStart: LatLng | null = null

    const handleMouseDown = (e: maplibregl.MapMouseEvent) => {
      if (e.originalEvent.button !== 0) return
      if (toolRef.current === 'room') {
        dragStart = { lat: e.lngLat.lat, lng: e.lngLat.lng }
        setRoomDrag({ start: dragStart, current: dragStart })
      }
    }

    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      setCursorLL({ lat: e.lngLat.lat, lng: e.lngLat.lng })
      if (dragStart && toolRef.current === 'room') {
        setRoomDrag({ start: dragStart, current: { lat: e.lngLat.lat, lng: e.lngLat.lng } })
      }
    }

    const handleMouseUp = (e: maplibregl.MapMouseEvent) => {
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
        addComponentWithPolygon({ id: `comp-${Date.now()}`, type: 'room', name: 'Room', buildingId: activeBuildingId ?? '', floor: activeFloorRef.current, position: center, polygon })
        dragStart = null
        setRoomDrag(null)
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { clearTracePoints(); setRoomDrag(null) }
      if (e.key === 'Delete' && selectedNodeRef.current) {
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
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const canvas = map.getCanvas()
    if (tool === 'trace' || tool === 'route_test' || tool === 'room' || tool === 'asset' || tool === 'boundary' || tool === 'building') canvas.style.cursor = 'crosshair'
    else if (tool === 'select') canvas.style.cursor = 'pointer'
    else canvas.style.cursor = ''
    if (tool === 'trace' || tool === 'route_test' || tool === 'room' || tool === 'boundary' || tool === 'building') map.dragPan.disable()
    else map.dragPan.enable()
  }, [tool])

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

    if (tracePoints.length > 0 && (tool === 'trace' || tool === 'route_test')) {
      const coords = tracePoints.map((p) => [p.lng, p.lat])
      drawFeatures.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} })
      for (const p of tracePoints) {
        drawFeatures.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: {} })
      }
    }

    if (pendingConfirm && pendingConfirm.points.length >= 2) {
      const coords = pendingConfirm.points.map((p) => [p.lng, p.lat])
      if (pendingConfirm.points.length >= 3) {
        drawFeatures.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]]] },
          properties: { pending: true },
        })
      }
      drawFeatures.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: pendingConfirm.points.length >= 3 ? [...coords, coords[0]] : coords },
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

    try {
      const src = m.getSource(SRC.DRAWING) as maplibregl.GeoJSONSource
      if (src) src.setData({ type: 'FeatureCollection', features: drawFeatures })
    } catch { /* source not ready */ }
  }, [tracePoints, roomDrag, tool, pendingConfirm])

  return <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
}
