'use client'

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEditor, useEditingEngine } from '@navi/editor'
import type { Command } from '@navi/editor'
import { useFloorComponents, useFloorComponent, useFloorRenderVersion, useFloorCampusId } from '@/hooks/floor-graph-selectors'
import type { Building, LatLng, Component } from '@/types/nav-types'
import { SnapEngine, DEFAULT_SNAP_CONFIG } from '@navi/core'
import type { StudioTool, LayerVisibility } from '@/types/studio-types'
import { useFloorDrawing } from './useFloorDrawing'
import { extractHallwayData } from '@/types/hallway-types'
import { FloorPlanAlignment } from './FloorPlanAlignment'
import { useEditablePathEditor, type ConstraintProvider } from './useEditablePathEditor'
import { LinearGeometryOverlay, type LocalToLngLat, type LngLatToLocal } from './LinearGeometryOverlay'
import { HallwayRenderer } from './HallwayRenderer'
import type { ToLatLng } from './LinearGeometryRenderer'
import type { EditablePath } from '@/types/path-types'
import { genId } from '@navi/editor'

const BLANK_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [],
}

const CURSOR_MAP: Record<string, string> = {
  select: 'grab',
  room: 'crosshair',
  entrance: 'crosshair',
  stairs: 'crosshair',
  elevator: 'crosshair',
  hallway: 'crosshair',
  align: 'move',
}

function computeFloorPlanCoords(
  footprint: LatLng[],
  alignment?: { offset?: { x: number; y: number }; scale?: number; rotation?: number },
): [[number, number], [number, number], [number, number], [number, number]] {
  if (!alignment || footprint.length < 3) {
    // Default: stretch to footprint bounding box
    const bounds = new maplibregl.LngLatBounds()
    footprint.forEach((p) => bounds.extend([p.lng, p.lat]))
    const ne = bounds.getNorthEast()
    const sw = bounds.getSouthWest()
    return [[sw.lng, ne.lat], [ne.lng, ne.lat], [ne.lng, sw.lat], [sw.lng, sw.lat]]
  }

  // Convert lat/lng footprint to local meters around centroid
  const centroid = footprint.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 })
  centroid.lat /= footprint.length
  centroid.lng /= footprint.length

  const R = 6371000
  const rad = (alignment.rotation ?? 0) * Math.PI / 180
  const scale = alignment.scale ?? 1
  const ox = alignment.offset?.x ?? 0
  const oy = alignment.offset?.y ?? 0

  // Project 4 corners from lat/lng to local meters, apply transform, project back
  const cornersLatLng: LatLng[] = []
  const bounds = new maplibregl.LngLatBounds()
  footprint.forEach((p) => bounds.extend([p.lng, p.lat]))
  const ne = bounds.getNorthEast()
  const sw = bounds.getSouthWest()

  for (const ll of [
    { lat: ne.lat, lng: sw.lng },  // top-left
    { lat: ne.lat, lng: ne.lng },  // top-right
    { lat: sw.lat, lng: ne.lng },  // bottom-right
    { lat: sw.lat, lng: sw.lng },  // bottom-left
  ]) {
    // To local meters
    const dxRaw = (ll.lng - centroid.lng) * Math.cos(centroid.lat * Math.PI / 180) * R
    const dyRaw = (ll.lat - centroid.lat) * R
    // Apply transform
    const tx = dxRaw * Math.cos(rad) - dyRaw * Math.sin(rad)
    const ty = dxRaw * Math.sin(rad) + dyRaw * Math.cos(rad)
    const dx = tx * scale + ox
    const dy = ty * scale + oy
    // Back to lat/lng
    cornersLatLng.push({
      lat: centroid.lat + dy / R,
      lng: centroid.lng + dx / (Math.cos(centroid.lat * Math.PI / 180) * R),
    })
  }

  return [
    [cornersLatLng[0].lng, cornersLatLng[0].lat],
    [cornersLatLng[1].lng, cornersLatLng[1].lat],
    [cornersLatLng[2].lng, cornersLatLng[2].lat],
    [cornersLatLng[3].lng, cornersLatLng[3].lat],
  ]
}

function getFp(b: Building): LatLng[] {
  const f = b.footprint
  return Array.isArray(f) ? f : (f as any)?.points ?? []
}

function buildBuildingGeo(building: Building): GeoJSON.FeatureCollection {
  const fp = getFp(building)
  if (fp.length === 0) {
    return { type: 'FeatureCollection', features: [] }
  }
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { id: building.id, name: building.name, color: building.color || '#1C6EBB', height: building.height || 15 },
      geometry: {
        type: 'Polygon',
        coordinates: fp.length >= 3
          ? [[...fp.map((p) => [p.lng, p.lat] as [number, number]), [fp[0].lng, fp[0].lat] as [number, number]]]
          : (() => {
              const c = fp.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 })
              const avg = { lat: c.lat / fp.length, lng: c.lng / fp.length }
              return [[
                [avg.lng - 0.0003, avg.lat - 0.0003],
                [avg.lng + 0.0003, avg.lat - 0.0003],
                [avg.lng + 0.0003, avg.lat + 0.0003],
                [avg.lng - 0.0003, avg.lat + 0.0003],
                [avg.lng - 0.0003, avg.lat - 0.0003],
              ]]
            })(),
      },
    }],
  }
}

function addSourcesAndLayers(map: maplibregl.Map) {
  const srcs = ['floor-buildings', 'floor-floorplan', 'floor-rooms', 'floor-elevator-areas']
  for (const s of srcs) {
    if (map.getSource(s)) return
  }
  map.addSource('floor-buildings', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'floor-buildings-fill', type: 'fill', source: 'floor-buildings', paint: { 'fill-color': '#1C6BEB', 'fill-opacity': 0.06 } })
  map.addLayer({ id: 'floor-buildings-outline', type: 'line', source: 'floor-buildings', paint: { 'line-color': '#475569', 'line-width': 2, 'line-dasharray': [3, 3] } })

  // floor-plan image source is added dynamically in the updateImage useEffect
  // floor-floorplan layer added dynamically with the image source

  map.addSource('floor-rooms', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'floor-rooms-fill', type: 'fill', source: 'floor-rooms', paint: { 'fill-color': '#10B981', 'fill-opacity': 0.15 } })
  map.addLayer({ id: 'floor-rooms-outline', type: 'line', source: 'floor-rooms', paint: { 'line-color': '#10B981', 'line-width': 2 } })

  // Hallway sources/layers are now managed by HallwayRenderer → LinearGeometryRenderer

  map.addSource('floor-elevator-areas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'floor-elevator-areas-fill', type: 'fill', source: 'floor-elevator-areas', paint: { 'fill-color': '#7C3AED', 'fill-opacity': 0.2 } })
  map.addLayer({ id: 'floor-elevator-areas-outline', type: 'line', source: 'floor-elevator-areas', paint: { 'line-color': '#7C3AED', 'line-width': 2 } })

  map.addSource('floor-assets', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'floor-assets-layer', type: 'symbol', source: 'floor-assets', layout: { 'icon-image': 'marker', 'icon-size': 0.8, 'text-field': ['get', 'name'], 'text-offset': [0, -1.5], 'text-size': 10 } })

  map.addSource('floor-nodes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'floor-nodes-layer', type: 'circle', source: 'floor-nodes', paint: { 'circle-radius': 4, 'circle-color': '#8B5CF6', 'circle-opacity': 0.7 } })

  map.addSource('floor-edges', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'floor-edges-layer', type: 'line', source: 'floor-edges', paint: { 'line-color': '#8B5CF6', 'line-width': 1.5, 'line-opacity': 0.4, 'line-dasharray': [4, 2] } })

  map.addSource('floor-labels', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'floor-labels-layer', type: 'symbol', source: 'floor-labels', layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, 0] }, paint: { 'text-color': '#94A3B8', 'text-halo-color': '#1E293B', 'text-halo-width': 1 } })

  map.addSource('floor-point-items', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'floor-items-stairs', type: 'circle', source: 'floor-point-items', filter: ['==', ['get', 'type'], 'stair'], paint: { 'circle-radius': 10, 'circle-color': '#F97316', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 } })
  map.addLayer({ id: 'floor-items-stairs-label', type: 'symbol', source: 'floor-point-items', filter: ['==', ['get', 'type'], 'stair'], layout: { 'text-field': 'S', 'text-size': 11, 'text-allow-overlap': true }, paint: { 'text-color': '#FFFFFF' } })
  map.addLayer({ id: 'floor-items-entrance', type: 'circle', source: 'floor-point-items', filter: ['==', ['get', 'type'], 'entrance'], paint: { 'circle-radius': 8, 'circle-color': '#F59E0B', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 } })
  map.addLayer({ id: 'floor-items-entrance-label', type: 'symbol', source: 'floor-point-items', filter: ['==', ['get', 'type'], 'entrance'], layout: { 'text-field': '\u2B07', 'text-size': 10, 'text-allow-overlap': true }, paint: { 'text-color': '#FFFFFF' } })

  map.addSource('floor-selection', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'floor-selection-fill', type: 'fill', source: 'floor-selection', filter: ['==', ['get', 'type'], 'fill'], paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.2 } })
  map.addLayer({ id: 'floor-selection-outline', type: 'line', source: 'floor-selection', filter: ['==', ['get', 'type'], 'line'], paint: { 'line-color': '#FFFFFF', 'line-width': 3, 'line-opacity': 0.9 } })
  // Hallway selection visuals are managed by LinearGeometryOverlay

  map.addSource('floor-hover', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'floor-hover-fill', type: 'fill', source: 'floor-hover', paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.1 } })
  map.addLayer({ id: 'floor-hover-outline', type: 'line', source: 'floor-hover', paint: { 'line-color': '#FFFFFF', 'line-width': 2, 'line-opacity': 0.5 } })

  map.addSource('floor-vertex-handles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'floor-vertex-handles-layer', type: 'circle', source: 'floor-vertex-handles', filter: ['!=', ['get', 'type'], 'midpoint'], paint: { 'circle-radius': 8, 'circle-color': '#FFFFFF', 'circle-stroke-width': 3, 'circle-stroke-color': '#1C6BEB' } })
  map.addLayer({ id: 'floor-midpoint-handles-layer', type: 'circle', source: 'floor-vertex-handles', filter: ['==', ['get', 'type'], 'midpoint'], paint: { 'circle-radius': 5, 'circle-color': '#1C6BEB', 'circle-opacity': 0.6, 'circle-stroke-width': 0 } })

  map.addSource('floor-snap', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'floor-snap-indicator', type: 'circle', source: 'floor-snap', paint: { 'circle-radius': 7, 'circle-color': '#3B82F6', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff', 'circle-opacity': 0.9 } } as any)

  map.addSource('floor-point-preview', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'floor-point-preview-layer', type: 'circle', source: 'floor-point-preview', paint: { 'circle-radius': 8, 'circle-color': '#3B82F6', 'circle-opacity': 0.4, 'circle-stroke-width': 2, 'circle-stroke-color': '#3B82F6' } } as any)
}

interface FloorEditorCanvasProps {
  building: Building
  floor: number
  tool: StudioTool
  layers: LayerVisibility
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  planAlignment?: { offset?: { x: number; y: number }; scale?: number; rotation?: number; opacity?: number }
  alignMode?: boolean
  readOnly?: boolean
  locked?: boolean
  onAlignmentChange?: (align: { offset?: { x: number; y: number }; scale?: number; rotation?: number; opacity?: number }) => void
}

function componentToFeature(c: Component, overridePolygon?: LatLng[]): GeoJSON.Feature | null {
  const polygon = overridePolygon ?? c.polygon
  if (!polygon || polygon.length < 3) return null
  return {
    type: 'Feature', properties: { id: c.id, name: c.name },
    geometry: { type: 'Polygon', coordinates: [[...polygon.map((p) => [p.lng, p.lat] as [number, number]), [polygon[0].lng, polygon[0].lat] as [number, number]]] },
  }
}

function componentToEditablePath(c: Component): EditablePath | null {
  if (c.type !== 'hallway') return null
  const data = extractHallwayData(c)
  if (!data?.centerline || data.centerline.length < 2) return null
  const cl = data.centerline
  return {
    id: c.id,
    vertices: cl.map((p, i) => ({ id: `${c.id}-v${i}`, x: p.lng, y: p.lat })),
    segments: Array.from({ length: cl.length - 1 }, (_, i) => ({
      id: `${c.id}-s${i}`, startVertexId: `${c.id}-v${i}`, endVertexId: `${c.id}-v${i + 1}`, type: 'straight' as const,
    })),
    closed: false,
    readOnly: true,
  }
}

export function FloorEditorCanvas({ building, floor, tool, layers, selectedId, onSelect, planAlignment, alignMode, readOnly, locked, onAlignmentChange }: FloorEditorCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null)
  const readyRef = useRef(false)

  const floorComponents = useFloorComponents(building.id, floor)
  const selectedComponent = useFloorComponent(selectedId)
  const renderVersion = useFloorRenderVersion()
  const campusId = useFloorCampusId()

  const editor = useEditor()
  const dispatcher = editor.services.get('dispatcher')!
  const transformer = editor.transformer
  const buildingFp = Array.isArray(building.footprint) ? building.footprint : (building.footprint as any)?.points ?? []

  const editEngine = useEditingEngine()

  // Ref for drag interaction closures
  const floorComponentsRef = useRef(floorComponents)
  useEffect(() => { floorComponentsRef.current = floorComponents }, [floorComponents])
  const selectedComponentRef = useRef(selectedComponent)
  useEffect(() => { selectedComponentRef.current = selectedComponent }, [selectedComponent])
  const toolRef = useRef(tool)
  useEffect(() => { toolRef.current = tool }, [tool])
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])

  const snapEngineRef = useRef<SnapEngine | null>(null)

  // Wire drawing interactions (state-driven so hook sees map after init)
  const { drawMode, pendingPolygon, hallwayWidth, setHallwayWidth, confirm: confirmDrawing, cancel: cancelDrawing, removeLastPoint } = useFloorDrawing({ map: mapInstance, buildingId: building.id, campusId, floor, tool, onSelect, editEngine })

  // ---- New Architecture: Linear Geometry Editing for Hallways ----

  // Identity projection — path uses x=lng, y=lat
  const project = useCallback<LocalToLngLat>((x, y) => [x, y], [])
  const unproject = useCallback<LngLatToLocal>((lng, lat) => ({ x: lng, y: lat }), [])
  const toLatLng = useCallback<ToLatLng>((x, y) => ({ lat: y, lng: x }), [])

  // Build EditablePath from selected hallway
  const selectedHallwayPath = useMemo<EditablePath | null>(() => {
    if (selectedComponent?.type !== 'hallway') return null
    const data = extractHallwayData(selectedComponent)
    if (!data?.centerline || data.centerline.length < 2) return null
    return {
      id: selectedComponent.id,
      vertices: data.centerline.map((p, i) => ({ id: `hw-v${i}`, x: p.lng, y: p.lat })),
      segments: Array.from({ length: data.centerline.length - 1 }, (_, i) => ({
        id: `hw-s${i}`, startVertexId: `hw-v${i}`, endVertexId: `hw-v${i + 1}`, type: 'straight' as const,
      })),
      closed: false,
      readOnly: readOnly ?? false,
    }
  }, [selectedComponent, readOnly])

  // Working copy updated during drag — drives overlay + renderer
  const [workingPath, setWorkingPath] = useState<EditablePath | null>(null)
  const displayPath = workingPath ?? selectedHallwayPath
  const hasDraggedRef = useRef(false)

  const handleVertexMoved = useCallback((vertexId: string, newPos: { x: number; y: number }) => {
    hasDraggedRef.current = true
    setWorkingPath((prev) => {
      if (!prev) return prev
      return { ...prev, vertices: prev.vertices.map((v) => v.id === vertexId ? { ...v, x: newPos.x, y: newPos.y } : v) }
    })
  }, [])

  const commitWorkingPath = useCallback((path: EditablePath) => {
    if (!transformer || !selectedId || !building) return
    const localPoints = path.vertices.map((v) =>
      transformer.worldToBuildingLocal({ lat: v.y, lng: v.x }, building.id) ?? { x: 0, y: 0 },
    )
    dispatcher.execute({
      id: 'entity.update', label: 'Edit hallway',
      payload: { entityId: selectedId, changes: { polyline: { points: localPoints } } },
    })
  }, [transformer, selectedId, building, dispatcher])

  const constraintProvider = useCallback<ConstraintProvider>((pos, origin, shift) => {
    if (!shift) return pos
    const dx = pos.x - origin.x
    const dy = pos.y - origin.y
    const angle = Math.atan2(dy, dx)
    const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
    const dist = Math.sqrt(dx * dx + dy * dy)
    return { x: origin.x + Math.cos(snapAngle) * dist, y: origin.y + Math.sin(snapAngle) * dist }
  }, [])

  const pathEditor = useEditablePathEditor({
    path: displayPath ?? { id: '', vertices: [], segments: [], closed: false, readOnly: true },
    readOnly: !displayPath || readOnly,
    constraintProvider,
    onVertexMoved: handleVertexMoved,
    onVertexInserted: useCallback((segmentId: string, pos: { x: number; y: number }) => {
      const path = selectedHallwayPath
      if (!path || !transformer || !selectedId || !building) return
      const segIdx = path.segments.findIndex((s) => s.id === segmentId)
      if (segIdx < 0) return
      const before = path.vertices[segIdx]
      const after = path.vertices[segIdx + 1]
      if (!before || !after) return
      const local = transformer.worldToBuildingLocal({ lat: pos.y, lng: pos.x }, building.id) ?? { x: 0, y: 0 }
      dispatcher.execute({
        id: 'entity.update', label: 'Insert hallway vertex',
        payload: { entityId: selectedId, changes: { polyline: { points: [...path.vertices.slice(0, segIdx + 1).map((v) => transformer.worldToBuildingLocal({ lat: v.y, lng: v.x }, building.id) ?? { x: 0, y: 0 }), local, ...path.vertices.slice(segIdx + 1).map((v) => transformer.worldToBuildingLocal({ lat: v.y, lng: v.x }, building.id) ?? { x: 0, y: 0 })] } } },
      })
    }, [selectedHallwayPath, transformer, selectedId, building, dispatcher]),
    onVertexDeleted: useCallback((vertexId: string) => {
      const path = selectedHallwayPath
      if (!path || !transformer || !selectedId || !building) return
      const idx = path.vertices.findIndex((v) => v.id === vertexId)
      if (idx < 0) return
      const remaining = path.vertices.filter((_, i) => i !== idx)
      if (remaining.length < 2) return
      const localPoints = remaining.map((v) => transformer.worldToBuildingLocal({ lat: v.y, lng: v.x }, building.id) ?? { x: 0, y: 0 })
      dispatcher.execute({
        id: 'entity.update', label: 'Delete hallway vertex',
        payload: { entityId: selectedId, changes: { polyline: { points: localPoints } } },
      })
    }, [selectedHallwayPath, transformer, selectedId, building, dispatcher]),
  })

  // Detect drag end and commit
  const prevDraggingRef = useRef(false)
  useEffect(() => {
    if (prevDraggingRef.current && !pathEditor.session.isDragging && hasDraggedRef.current && workingPath) {
      commitWorkingPath(workingPath)
      setWorkingPath(null)
      hasDraggedRef.current = false
    }
    prevDraggingRef.current = pathEditor.session.isDragging
  }, [pathEditor.session.isDragging, workingPath, commitWorkingPath])

  useEffect(() => {
    if (mapRef.current) return
    let mounted = true
    const c = building.center ?? buildingFp[0] ?? { lat: 11.8195, lng: 122.0922 }
    const map = new maplibregl.Map({
      container: mapContainerRef.current!,
      style: BLANK_STYLE,
      center: [c.lng, c.lat],
      zoom: 18,
      pitch: 0,
      attributionControl: false,
    })
    map.on('load', () => {
      if (!mounted) return
      addSourcesAndLayers(map)
      readyRef.current = true
      setMapInstance(map)
      if (buildingFp.length >= 2) {
        const bounds = new maplibregl.LngLatBounds()
        buildingFp.forEach((p) => bounds.extend([p.lng, p.lat]))
        map.fitBounds(bounds, { padding: 60 })
      }
      const bldgSrc = map.getSource('floor-buildings') as maplibregl.GeoJSONSource
      if (bldgSrc) bldgSrc.setData(buildBuildingGeo(building))
    })
    mapRef.current = map
    return () => { mounted = false; map.remove(); mapRef.current = null; setMapInstance(null); readyRef.current = false }
  }, [building])

  // Floor plan image overlay — add source + layer dynamically when URL available
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const level = building.floors?.[floor]
    const imgUrl = building.floorPlanUrls?.[level ?? floor]
    if (!imgUrl || buildingFp.length < 3) return
    let src = map.getSource('floor-floorplan') as maplibregl.ImageSource | undefined
    if (!src) {
      map.addSource('floor-floorplan', { type: 'image', url: imgUrl, coordinates: computeFloorPlanCoords(buildingFp, planAlignment) })
      map.addLayer({ id: 'floor-floorplan-layer', type: 'raster', source: 'floor-floorplan', paint: { 'raster-opacity': 0.7 } })
    } else {
      src.updateImage({ url: imgUrl, coordinates: computeFloorPlanCoords(buildingFp, planAlignment) })
    }
    if (planAlignment?.opacity != null) {
      map.setPaintProperty('floor-floorplan-layer', 'raster-opacity', planAlignment.opacity)
    }
  }, [building.floorPlanUrls, floor, buildingFp, mapInstance, planAlignment])

  // Sync rooms + hallways for this floor
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return

    const roomFeatures: GeoJSON.Feature[] = floorComponents
      .filter((c) => c.type === 'room' && c.polygon && c.polygon.length >= 3)
      .map((c) => ({
        type: 'Feature' as const,
        properties: { id: c.id, name: c.name },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[...c.polygon!.map((p) => [p.lng, p.lat] as [number, number]), [c.polygon![0].lng, c.polygon![0].lat] as [number, number]]],
        },
      }))

    const elevatorAreaFeatures: GeoJSON.Feature[] = floorComponents
      .filter((c) => c.type === 'elevator' && c.polygon && c.polygon.length >= 3)
      .map((c) => ({
        type: 'Feature' as const,
        properties: { id: c.id, name: c.name },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[...c.polygon!.map((p) => [p.lng, p.lat] as [number, number]), [c.polygon![0].lng, c.polygon![0].lat] as [number, number]]],
        },
      }))

    try {
      const roomSrc = map.getSource('floor-rooms') as maplibregl.GeoJSONSource
      if (roomSrc) roomSrc.setData({ type: 'FeatureCollection', features: roomFeatures })
      const elevAreaSrc = map.getSource('floor-elevator-areas') as maplibregl.GeoJSONSource
      if (elevAreaSrc) elevAreaSrc.setData({ type: 'FeatureCollection', features: elevatorAreaFeatures })

      const pointFeatures = floorComponents
        .filter((c) => c.type === 'stair' || c.type === 'entrance')
        .map((c) => ({
          type: 'Feature' as const,
          properties: { id: c.id, name: c.name, type: c.type },
          geometry: { type: 'Point' as const, coordinates: [c.position.lng, c.position.lat] as [number, number] },
        }))
      const pointSrc = map.getSource('floor-point-items') as maplibregl.GeoJSONSource | undefined
      if (pointSrc) pointSrc.setData({ type: 'FeatureCollection', features: pointFeatures })
    } catch { console.warn('FloorEditorCanvas: source not ready for setData') }
  }, [floorComponents, renderVersion])

  // Selection highlight
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const src = map.getSource('floor-selection') as maplibregl.GeoJSONSource
    if (!src) return
    if (!selectedId || !selectedComponent) {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }
    const comp = selectedComponent

    // Hallway selection visuals are managed by LinearGeometryOverlay
    if (comp.type === 'hallway') {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }
    const minPoints = 3
    if (comp.polygon && comp.polygon.length >= minPoints) {
      src.setData({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { type: 'fill' }, geometry: { type: 'Polygon', coordinates: [[...comp.polygon.map((p) => [p.lng, p.lat] as [number, number]), [comp.polygon[0].lng, comp.polygon[0].lat] as [number, number]]] } },
          { type: 'Feature', properties: { type: 'line' }, geometry: { type: 'LineString', coordinates: [...comp.polygon.map((p) => [p.lng, p.lat] as [number, number]), [comp.polygon[0].lng, comp.polygon[0].lat] as [number, number]] } },
        ],
      })
    } else if (comp.position) {
      const r = 6
      const d = r * 0.00001
      const p = comp.position
      src.setData({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { type: 'fill' }, geometry: { type: 'Polygon', coordinates: [[[p.lng - d, p.lat - d], [p.lng + d, p.lat - d], [p.lng + d, p.lat + d], [p.lng - d, p.lat + d], [p.lng - d, p.lat - d]]] } },
          { type: 'Feature', properties: { type: 'line' }, geometry: { type: 'LineString', coordinates: [[p.lng - d, p.lat - d], [p.lng + d, p.lat - d], [p.lng + d, p.lat + d], [p.lng - d, p.lat + d], [p.lng - d, p.lat - d]] } },
        ],
      })
    }
  }, [selectedId, selectedComponent, renderVersion])

  // Layer visibility
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const visibilityMap: Record<string, boolean> = {
      'floor-floorplan-layer': layers.floor_plan,
      'floor-buildings-fill': alignMode ?? false,
      'floor-buildings-outline': alignMode ?? false,
      'floor-rooms-fill': layers.rooms,
      'floor-rooms-outline': layers.rooms,
      'floor-elevator-areas-fill': layers.hallways,
      'floor-elevator-areas-outline': layers.hallways,
      'floor-assets-layer': layers.assets,
      'floor-items-stairs': layers.assets,
      'floor-items-stairs-label': layers.assets,
      'floor-items-entrance': layers.assets,
      'floor-items-entrance-label': layers.assets,
      'floor-nodes-layer': layers.nodes,
      'floor-edges-layer': layers.edges,
      'floor-labels-layer': layers.labels,
    }
    for (const [id, visible] of Object.entries(visibilityMap)) {
      try {
        if (visible) map.setLayoutProperty(id, 'visibility', 'visible')
        else map.setLayoutProperty(id, 'visibility', 'none')
      } catch { console.warn('FloorEditorCanvas: layer not found for visibility toggle', id) }
    }
  }, [layers, alignMode])

  // Vertex handles + dragging for polygon components
  const dragRef = useRef<{ vertexIndex: number; componentId: string } | null>(null)
  const moveDragRef = useRef<{ componentId: string; originalPolygon: LatLng[]; startLatLng: { lat: number; lng: number } } | null>(null)
  const workingPolygonRef = useRef<LatLng[] | null>(null)

  const deleteVertex = useCallback((cId: string, vIdx: number) => {
    const comp = floorComponentsRef.current.find((c) => c.id === cId)
    if (!comp?.polygon) return
    if (comp.type === 'hallway') return
    const minPoints = 3
    if (comp.polygon.length <= minPoints) return
    const newPolygon = comp.polygon.filter((_, i) => i !== vIdx)
    if (transformer) {
      const localPoints = newPolygon.map((p) => transformer.worldToBuildingLocal(p, building.id) ?? { x: 0, y: 0 })
      dispatcher.execute({ id: 'entity.update', label: `Delete ${comp.type} vertex`, payload: { entityId: cId, changes: { polygon: { points: localPoints } } } })
    }
  }, [dispatcher, transformer, building.id])

  const insertVertex = useCallback((cId: string, segIdx: number) => {
    const comp = floorComponentsRef.current.find((c) => c.id === cId)
    if (!comp?.polygon || segIdx >= comp.polygon.length - 1) return
    if (comp.type === 'hallway') return
    const mid = {
      lat: (comp.polygon[segIdx].lat + comp.polygon[segIdx + 1].lat) / 2,
      lng: (comp.polygon[segIdx].lng + comp.polygon[segIdx + 1].lng) / 2,
    }
    const newPolygon = [...comp.polygon.slice(0, segIdx + 1), mid, ...comp.polygon.slice(segIdx + 1)]
    if (transformer) {
      const localPoints = newPolygon.map((p) => transformer.worldToBuildingLocal(p, building.id) ?? { x: 0, y: 0 })
      dispatcher.execute({ id: 'entity.update', label: `Insert ${comp.type} vertex`, payload: { entityId: cId, changes: { polygon: { points: localPoints } } } })
    }
  }, [dispatcher, transformer, building.id])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const src = map.getSource('floor-vertex-handles') as maplibregl.GeoJSONSource
    if (!src) return
    if (readOnly) { src.setData({ type: 'FeatureCollection', features: [] }); return }
    if (!selectedId || !selectedComponent) { src.setData({ type: 'FeatureCollection', features: [] }); return }
    // Hallway vertex handles are managed by LinearGeometryOverlay
    if (selectedComponent.type === 'hallway') {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }
    if (!selectedComponent.polygon || selectedComponent.polygon.length < 2) {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }
    const vertices: GeoJSON.Feature[] = selectedComponent.polygon.map((p, i) => ({
      type: 'Feature' as const,
      properties: { type: 'vertex', vertexIndex: i, componentId: selectedComponent.id },
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] as [number, number] },
    }))
    src.setData({ type: 'FeatureCollection', features: vertices })
  }, [selectedId, selectedComponent, renderVersion, readOnly])

  // Snap overlay + point placement preview
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return

    // Init SnapEngine and populate from current components
    const engine = new SnapEngine()
    snapEngineRef.current = engine

    const populateEngine = () => {
      engine.clear()
      const comps = floorComponentsRef.current
      for (const c of comps) {
        if (c.polygon && c.polygon.length >= 2) {
          for (let i = 0; i < c.polygon.length; i++) {
            engine.addVertex(c.polygon[i], c.id, 'vertex')
            engine.addEdge(c.polygon[i], c.polygon[(i + 1) % c.polygon.length], c.id)
          }
        }
        if (c.type === 'hallway' && c.polygon && c.polygon.length >= 2) {
          for (let i = 0; i < c.polygon.length - 1; i++) {
            engine.addVertex(c.polygon[i], c.id, 'vertex')
            engine.addEdge(c.polygon[i], c.polygon[i + 1], c.id)
          }
        }
        if (c.position) {
          engine.addVertex(c.position, c.id, 'vertex')
        }
        if (c.type === 'entrance' && c.position) {
          engine.addEntrance(c.position, c.id)
        }
      }
    }
    populateEngine()

    const onMove = (e: maplibregl.MapMouseEvent) => {
      const curTool = toolRef.current
      const pos = { lat: e.lngLat.lat, lng: e.lngLat.lng }

      // Snap indicator
      const target = engine.findSnap(pos, DEFAULT_SNAP_CONFIG)
      const snapSrc = map.getSource('floor-snap') as maplibregl.GeoJSONSource
      if (snapSrc) {
        snapSrc.setData(target
          ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [target.position.lng, target.position.lat] }, properties: { type: target.type, distance: target.distance } }] }
          : { type: 'FeatureCollection', features: [] })
      }

      // Point placement preview
      const previewSrc = map.getSource('floor-point-preview') as maplibregl.GeoJSONSource
      if (previewSrc) {
        if (curTool === 'entrance' || curTool === 'stairs' || curTool === 'elevator') {
          previewSrc.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [pos.lng, pos.lat] }, properties: {} }] })
        } else {
          previewSrc.setData({ type: 'FeatureCollection', features: [] })
        }
      }
    }

    map.on('mousemove', onMove)

    // Re-populate when floor components change
    const unsub = () => { populateEngine() }

    return () => {
      map.off('mousemove', onMove)
      snapEngineRef.current = null
    }
  }, [mapInstance, readyRef.current])

  // Re-populate snap engine when components change
  useEffect(() => {
    if (!snapEngineRef.current || !mapRef.current?.loaded()) return
    const engine = snapEngineRef.current
    engine.clear()
    const comps = floorComponentsRef.current
    for (const c of comps) {
      if (c.polygon && c.polygon.length >= 2) {
        for (let i = 0; i < c.polygon.length; i++) {
          engine.addVertex(c.polygon[i], c.id, 'vertex')
          engine.addEdge(c.polygon[i], c.polygon[(i + 1) % c.polygon.length], c.id)
        }
      }
      if (c.type === 'hallway' && c.polygon && c.polygon.length >= 2) {
        for (let i = 0; i < c.polygon.length - 1; i++) {
          engine.addVertex(c.polygon[i], c.id, 'vertex')
          engine.addEdge(c.polygon[i], c.polygon[i + 1], c.id)
        }
      }
      if (c.position) {
        engine.addVertex(c.position, c.id, 'vertex')
      }
      if (c.type === 'entrance' && c.position) {
        engine.addEntrance(c.position, c.id)
      }
    }
  }, [floorComponents, renderVersion])

  // Drag vertex interaction
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    if (readOnly) return
    const canvas = map.getCanvas()
    let pendingFrame: number | null = null

    const onMouseDown = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      if (!e.features || e.features.length === 0) return
      const props = e.features[0].properties as Record<string, unknown>
      const cId = props.componentId as string
      const vIdx = props.vertexIndex as number
      const segIdx = props.segmentIndex as number
      if (!cId) return
      const isDblClick = (e.originalEvent as MouseEvent).detail === 2
      if (isDblClick) {
        if (vIdx != null) {
          deleteVertex(cId, vIdx)
        } else if (segIdx != null) {
          insertVertex(cId, segIdx)
        }
        return
      }
      if (vIdx == null) return
      const comp = floorComponentsRef.current.find((c) => c.id === cId)
      if (!comp?.polygon) return
      dragRef.current = { vertexIndex: vIdx, componentId: cId }
      workingPolygonRef.current = comp.polygon.map((p) => ({ ...p }))
      canvas.style.cursor = 'grabbing'
    }

    const onBodyMouseDown = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      if (tool !== 'select') return
      if (!e.features || e.features.length === 0) return
      const props = e.features[0].properties as Record<string, unknown>
      const cId = props.id as string
      if (!cId) return
      const comp = floorComponentsRef.current.find((c) => c.id === cId)
      if (!comp?.polygon) return
      if (comp.type !== 'room' && comp.type !== 'hallway' && comp.type !== 'elevator') return
      // Hallway body drag is handled by useEditablePathEditor
      if (comp.type === 'hallway') return
      moveDragRef.current = {
        componentId: cId,
        originalPolygon: comp.polygon.map((p) => ({ ...p })),
        startLatLng: { lat: e.lngLat.lat, lng: e.lngLat.lng },
      }
      workingPolygonRef.current = comp.polygon.map((p) => ({ ...p }))
      canvas.style.cursor = 'grabbing'
    }

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      // Body drag translates entire polygon before vertex drag check
      if (moveDragRef.current) {
        const deltaLat = e.lngLat.lat - moveDragRef.current.startLatLng.lat
        const deltaLng = e.lngLat.lng - moveDragRef.current.startLatLng.lng
        const working = workingPolygonRef.current
        if (working) {
          for (let i = 0; i < moveDragRef.current.originalPolygon.length; i++) {
            working[i] = { lat: moveDragRef.current.originalPolygon[i].lat + deltaLat, lng: moveDragRef.current.originalPolygon[i].lng + deltaLng }
          }
        }
      }
      const drag = dragRef.current ?? moveDragRef.current
      const working = workingPolygonRef.current
      if (!drag || !working) return
      // Vertex index only applies to vertex drags; for body drag all points are already set above
      if (dragRef.current) {
        working[dragRef.current.vertexIndex] = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      }

      if (pendingFrame != null) return
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = null
        const drag = dragRef.current ?? moveDragRef.current
        const working = workingPolygonRef.current
        if (!drag || !working) return

        const allFloor = floorComponentsRef.current
        const comp = allFloor.find((c) => c.id === drag.componentId)
        if (!comp) return
        const isRoom = comp.type === 'room'
        const isElevator = comp.type === 'elevator'
        const srcId = isRoom ? 'floor-rooms' : isElevator ? 'floor-elevator-areas' : undefined

        if (srcId && working.length >= 3) {
          const src = map.getSource(srcId) as maplibregl.GeoJSONSource
          if (src) {
            const features: GeoJSON.Feature[] = []
            for (const c of allFloor) {
              if (c.type !== comp.type || !c.polygon) continue
              const f = componentToFeature(c, c.id === drag.componentId ? working : undefined)
              if (f) features.push(f)
            }
            src.setData({ type: 'FeatureCollection', features })
          }
        }

        const handleSrc = map.getSource('floor-vertex-handles') as maplibregl.GeoJSONSource
        if (handleSrc) {
          const handleFeatures: GeoJSON.Feature[] = working.map((p, i) => ({
            type: 'Feature' as const,
            properties: { type: 'vertex', vertexIndex: i, componentId: drag.componentId },
            geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] as [number, number] },
          }))
          handleSrc.setData({ type: 'FeatureCollection', features: handleFeatures })
        }

        if (isRoom || isElevator) {
          const selSrc = map.getSource('floor-selection') as maplibregl.GeoJSONSource
          if (selSrc && working.length >= 3) {
            selSrc.setData({
              type: 'FeatureCollection',
              features: [
                { type: 'Feature', properties: { type: 'fill' }, geometry: { type: 'Polygon', coordinates: [[...working.map((p) => [p.lng, p.lat] as [number, number]), [working[0].lng, working[0].lat] as [number, number]]] } },
                { type: 'Feature', properties: { type: 'line' }, geometry: { type: 'LineString', coordinates: [...working.map((p) => [p.lng, p.lat] as [number, number]), [working[0].lng, working[0].lat] as [number, number]] } },
              ],
            })
          }
        }
      })
    }

    const onMouseUp = () => {
      if (pendingFrame != null) { cancelAnimationFrame(pendingFrame); pendingFrame = null }
      const vertexDrag = dragRef.current
      const bodyDrag = moveDragRef.current
      const drag = vertexDrag ?? bodyDrag
      const working = workingPolygonRef.current
      if (!drag || !working) return
      dragRef.current = null
      moveDragRef.current = null
      workingPolygonRef.current = null
      canvas.style.cursor = CURSOR_MAP[tool] ?? 'default'

      const comp = floorComponentsRef.current.find((c) => c.id === drag.componentId)
      if (comp && transformer) {
        const localPoints: { x: number; y: number }[] = []
        for (const p of working) {
          const local = transformer.worldToBuildingLocal(p, building.id)
          if (local) localPoints.push(local)
        }
        const changes: Record<string, unknown> = { polygon: { points: localPoints } }

        if (bodyDrag) {
          const origLocal = transformer.worldToBuildingLocal(bodyDrag.originalPolygon[0], building.id)
          const deltaX = origLocal ? (localPoints[0]?.x ?? 0) - origLocal.x : 0
          const deltaY = origLocal ? (localPoints[0]?.y ?? 0) - origLocal.y : 0
          editEngine.begin({ kind: 'move', entityId: drag.componentId, deltaX, deltaY })
          editEngine.doCommit()
        } else if (vertexDrag) {
          const vIdx = vertexDrag.vertexIndex
          editEngine.begin({ kind: 'resize', entityId: drag.componentId, vertexIndex: vIdx, newX: localPoints[vIdx]?.x ?? 0, newY: localPoints[vIdx]?.y ?? 0 })
          editEngine.doCommit()
        }

        dispatcher.execute({
          id: 'entity.update',
          label: bodyDrag ? `Move ${comp.type}` : vertexDrag ? `Resize ${comp.type}` : `Update ${comp.type}`,
          payload: { entityId: drag.componentId, changes },
        })
      }
    }

    const SELECTABLE_FILL_LAYERS = ['floor-rooms-fill', 'floor-elevator-areas-fill']
    const SELECTABLE_POINT_LAYERS = ['floor-items-stairs', 'floor-items-entrance', 'floor-nodes-layer']

    const onHoverMove = (e: maplibregl.MapMouseEvent) => {
      const curTool = toolRef.current
      if (curTool !== 'select') {
        if (canvas.style.cursor !== CURSOR_MAP[curTool]) canvas.style.cursor = CURSOR_MAP[curTool] ?? 'default'
        const hoverSrc = map.getSource('floor-hover') as maplibregl.GeoJSONSource
        if (hoverSrc) hoverSrc.setData({ type: 'FeatureCollection', features: [] })
        return
      }
      const allLayers = [...SELECTABLE_FILL_LAYERS, ...SELECTABLE_POINT_LAYERS]
      const features = map.queryRenderedFeatures(e.point, { layers: allLayers })
      const hoverSrc = map.getSource('floor-hover') as maplibregl.GeoJSONSource
      if (features.length > 0) {
        canvas.style.cursor = 'pointer'
        if (hoverSrc) {
          const feat = features[0]
          const geom = feat.geometry
          if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
            hoverSrc.setData({ type: 'FeatureCollection', features: [feat] })
          } else {
            hoverSrc.setData({ type: 'FeatureCollection', features: [] })
          }
        }
      } else {
        canvas.style.cursor = CURSOR_MAP[curTool] ?? 'default'
        if (hoverSrc) hoverSrc.setData({ type: 'FeatureCollection', features: [] })
      }
    }

    const onClickSelect = (e: maplibregl.MapMouseEvent) => {
      if (toolRef.current !== 'select') return
      const allLayers = [...SELECTABLE_FILL_LAYERS, ...SELECTABLE_POINT_LAYERS]
      const features = map.queryRenderedFeatures(e.point, { layers: allLayers })
      if (features.length > 0) {
        const props = features[0].properties as Record<string, unknown>
        const cId = props.id as string
        if (cId) onSelectRef.current?.(cId)
      }
    }

    const onVertexEnter = () => { canvas.style.cursor = 'grab' }
    const onVertexLeave = () => { if (!dragRef.current) canvas.style.cursor = CURSOR_MAP[tool] ?? 'default' }
    const onMidpointEnter = () => { canvas.style.cursor = 'copy' }
    const onMidpointLeave = () => { if (!dragRef.current) canvas.style.cursor = CURSOR_MAP[tool] ?? 'default' }

    map.on('mouseenter', 'floor-vertex-handles-layer', onVertexEnter)
    map.on('mouseleave', 'floor-vertex-handles-layer', onVertexLeave)
    map.on('mouseenter', 'floor-midpoint-handles-layer', onMidpointEnter)
    map.on('mouseleave', 'floor-midpoint-handles-layer', onMidpointLeave)
    map.on('mousedown', 'floor-vertex-handles-layer', onMouseDown as (e: maplibregl.MapMouseEvent) => void)
    map.on('mousedown', 'floor-midpoint-handles-layer', onMouseDown as (e: maplibregl.MapMouseEvent) => void)
    map.on('mousedown', 'floor-rooms-fill', onBodyMouseDown as (e: maplibregl.MapMouseEvent) => void)
    map.on('mousedown', 'floor-elevator-areas-fill', onBodyMouseDown as (e: maplibregl.MapMouseEvent) => void)
    map.on('click', onClickSelect)
    map.on('mousemove', onMouseMove)
    map.on('mousemove', onHoverMove)
    map.on('mouseup', onMouseUp)
    return () => {
      if (pendingFrame != null) cancelAnimationFrame(pendingFrame)
      map.off('mouseenter', 'floor-vertex-handles-layer', onVertexEnter)
      map.off('mouseleave', 'floor-vertex-handles-layer', onVertexLeave)
      map.off('mouseenter', 'floor-midpoint-handles-layer', onMidpointEnter)
      map.off('mouseleave', 'floor-midpoint-handles-layer', onMidpointLeave)
      map.off('mousedown', 'floor-vertex-handles-layer', onMouseDown as (e: maplibregl.MapMouseEvent) => void)
      map.off('mousedown', 'floor-midpoint-handles-layer', onMouseDown as (e: maplibregl.MapMouseEvent) => void)
      map.off('mousedown', 'floor-rooms-fill', onBodyMouseDown as (e: maplibregl.MapMouseEvent) => void)
      map.off('mousedown', 'floor-elevator-areas-fill', onBodyMouseDown as (e: maplibregl.MapMouseEvent) => void)
      map.off('click', onClickSelect)
      map.off('mousemove', onMouseMove)
      map.off('mousemove', onHoverMove)
      map.off('mouseup', onMouseUp)
    }
  }, [selectedId, floorComponents, tool, dispatcher, transformer, renderVersion, editEngine, building.id, readOnly, onSelect])

  // Keyboard shortcuts (window-level — no canvas focus needed)
  useEffect(() => {
    if (readOnly) return
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return
      if (e.key === 'Escape') {
        if (drawMode !== 'idle') {
          cancelDrawing()
        } else if (selectedId) {
          onSelect?.(null)
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        if (selectedComponent) {
          editEngine.begin({ kind: 'delete', entityIds: [selectedId] })
          const commitResult = editEngine.doCommit()

          const cmdId = ({ room: 'room.delete', hallway: 'hallway.delete', stair: 'staircase.delete', elevator: 'elevator.delete', entrance: 'entrance.delete', restroom: 'room.delete' })[selectedComponent.type]
          const payloadKey = ({ room: 'roomId', hallway: 'hallwayId', stair: 'staircaseId', elevator: 'elevatorId', entrance: 'entranceId', restroom: 'roomId' })[selectedComponent.type]
          if (cmdId && payloadKey) {
            dispatcher.execute({ id: cmdId, label: `Delete ${selectedComponent.type}`, payload: { [payloadKey]: selectedId } })
          }
        }
        onSelect?.(null)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedId, onSelect, selectedComponent, dispatcher, drawMode, cancelDrawing, readOnly])

  // Align mode cursor
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    map.getCanvas().style.cursor = CURSOR_MAP[tool] ?? 'default'
  }, [tool, alignMode])

  const hasFloorPlan = !!building.floorPlanUrls?.[floor]
  const floorPlanCoords = alignMode && buildingFp.length >= 3 && hasFloorPlan
    ? computeFloorPlanCoords(buildingFp, planAlignment)
    : null

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
      {alignMode && mapInstance && floorPlanCoords && (
        <FloorPlanAlignment
          map={mapInstance}
          floorPlanCoords={floorPlanCoords}
          buildingFp={buildingFp}
          alignment={planAlignment ?? {}}
          locked={locked}
          onChange={(a) => onAlignmentChange?.({ ...planAlignment, ...a })}
        />
      )}
      {mapInstance && floorComponents.filter((c) => c.type === 'hallway').map((c) => {
        const path = componentToEditablePath(c)
        const data = extractHallwayData(c)
        if (!path || !data) return null
        return (
          <HallwayRenderer
            key={c.id}
            map={mapInstance}
            path={path}
            toLatLng={toLatLng}
            width={data.width}
            visible={layers.hallways}
          />
        )
      })}
      {displayPath && mapInstance && tool === 'select' && (
        <LinearGeometryOverlay
          map={mapInstance}
          path={displayPath}
          session={pathEditor.session}
          project={project}
          unproject={unproject}
          onVertexPointerDown={pathEditor.onVertexPointerDown}
          onSegmentPointerDown={pathEditor.onSegmentPointerDown}
          onPointerMove={pathEditor.onPointerMove}
          onPointerUp={pathEditor.onPointerUp}
          insertVertex={(segmentId) => pathEditor.insertVertex(segmentId)}
          setHoveredVertex={pathEditor.setHoveredVertex}
          setHoveredSegment={pathEditor.setHoveredSegment}
          enabled={true}
        />
      )}
      {drawMode !== 'idle' && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 6, background: '#1E293B', borderRadius: 8, padding: '4px 6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 10, alignItems: 'center',
        }}>
          <span style={{ fontSize: 10, color: '#94A3B8', padding: '0 4px' }}>
            {pendingPolygon.length} point{pendingPolygon.length !== 1 ? 's' : ''} (need {tool === 'hallway' ? 2 : 3})
          </span>
          <button onClick={removeLastPoint} disabled={pendingPolygon.length < 1}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 6, border: 'none', background: pendingPolygon.length < 1 ? '#374151' : '#475569', color: pendingPolygon.length < 1 ? '#6B7280' : '#fff', fontSize: 11, cursor: pendingPolygon.length < 1 ? 'not-allowed' : 'pointer' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
          {tool === 'hallway' && (
            <>
              <button onClick={() => setHallwayWidth(Math.max(1, hallwayWidth - 0.5))}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, border: 'none', background: '#475569', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
                −
              </button>
              <span style={{ fontSize: 10, color: '#F59E0B', padding: '0 2px', minWidth: 24, textAlign: 'center' }}>
                {hallwayWidth.toFixed(1)}m
              </span>
              <button onClick={() => setHallwayWidth(Math.min(10, hallwayWidth + 0.5))}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, border: 'none', background: '#475569', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
                +
              </button>
            </>
          )}
          <button onClick={confirmDrawing} disabled={pendingPolygon.length < (tool === 'hallway' ? 2 : 3)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, border: 'none', background: pendingPolygon.length < (tool === 'hallway' ? 2 : 3) ? '#374151' : '#10B981', color: pendingPolygon.length < (tool === 'hallway' ? 2 : 3) ? '#6B7280' : '#fff', fontSize: 11, cursor: pendingPolygon.length < (tool === 'hallway' ? 2 : 3) ? 'not-allowed' : 'pointer' }}>
            ✓ Confirm
          </button>
          <button onClick={cancelDrawing}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, border: 'none', background: '#EF4444', color: '#fff', fontSize: 11, cursor: 'pointer' }}>
            ✗ Cancel
          </button>
        </div>
      )}
      {selectedId && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 6, background: '#1E293B', borderRadius: 8, padding: '4px 6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 10,
        }}>
          <button onClick={() => {
            if (selectedComponent) {
              editEngine.begin({ kind: 'delete', entityIds: [selectedId] })
              editEngine.doCommit()
              const cmdId = ({ room: 'room.delete', hallway: 'hallway.delete', stair: 'staircase.delete', elevator: 'elevator.delete', entrance: 'entrance.delete', restroom: 'room.delete' })[selectedComponent.type]
              const payloadKey = ({ room: 'roomId', hallway: 'hallwayId', stair: 'staircaseId', elevator: 'elevatorId', entrance: 'entranceId', restroom: 'roomId' })[selectedComponent.type]
              if (cmdId && payloadKey) {
                dispatcher.execute({ id: cmdId, label: `Delete ${selectedComponent.type}`, payload: { [payloadKey]: selectedId } })
              }
            }
            onSelect?.(null)
          }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, border: 'none', background: '#EF4444', color: '#fff', fontSize: 11, cursor: 'pointer' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
