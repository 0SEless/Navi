'use client'

import { useRef, useEffect, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useGraphStore } from '@/store/graph-store'
import type { Building, LatLng } from '@/types/nav-types'
import type { StudioTool, LayerVisibility } from '@/types/studio-types'
import { useFloorDrawing, computeWidthBuffer } from './useFloorDrawing'

const BLANK_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [],
}

const CURSOR_MAP: Record<string, string> = {
  select: 'default',
  room: 'crosshair',
  entrance: 'crosshair',
  stairs: 'crosshair',
  elevator: 'crosshair',
  hallway: 'crosshair',
}

function buildBuildingGeo(building: Building): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { id: building.id, name: building.name, color: building.color || '#1C6EBB', height: building.height || 15 },
      geometry: {
        type: 'Polygon',
        coordinates: building.footprint.length >= 3
          ? [[...building.footprint.map((p) => [p.lng, p.lat] as [number, number]), [building.footprint[0].lng, building.footprint[0].lat] as [number, number]]]
          : (() => {
              const c = building.footprint.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 })
              const avg = { lat: c.lat / building.footprint.length, lng: c.lng / building.footprint.length }
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
  const srcs = ['floor-buildings', 'floor-floorplan', 'floor-rooms', 'floor-hallways', 'floor-elevator-areas']
  for (const s of srcs) {
    if (map.getSource(s)) return
  }
  map.addSource('floor-buildings', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'floor-buildings-fill', type: 'fill', source: 'floor-buildings', paint: { 'fill-color': '#1C6BEB', 'fill-opacity': 0.06 } })
  map.addLayer({ id: 'floor-buildings-outline', type: 'line', source: 'floor-buildings', paint: { 'line-color': '#475569', 'line-width': 2, 'line-dasharray': [3, 3] } })

  map.addSource('floor-floorplan', { type: 'image', url: '', coordinates: [[0, 0], [0, 0], [0, 0], [0, 0]] })
  map.addLayer({ id: 'floor-floorplan-layer', type: 'raster', source: 'floor-floorplan', paint: { 'raster-opacity': 0.7 } })

  map.addSource('floor-rooms', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'floor-rooms-fill', type: 'fill', source: 'floor-rooms', paint: { 'fill-color': '#10B981', 'fill-opacity': 0.15 } })
  map.addLayer({ id: 'floor-rooms-outline', type: 'line', source: 'floor-rooms', paint: { 'line-color': '#10B981', 'line-width': 2 } })

  map.addSource('floor-hallways', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'floor-hallways-fill', type: 'fill', source: 'floor-hallways', paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.85 } })
  map.addLayer({ id: 'floor-hallways-outline', type: 'line', source: 'floor-hallways', paint: { 'line-color': '#64748B', 'line-width': 1.5 } })
  map.addSource('floor-hallway-centerlines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'floor-hallway-centerlines-layer', type: 'line', source: 'floor-hallway-centerlines', paint: { 'line-color': '#FFFFFF', 'line-width': 2, 'line-dasharray': [3, 4], 'line-opacity': 0.8 } })

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

  map.addSource('floor-vertex-handles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: 'floor-vertex-handles-layer', type: 'circle', source: 'floor-vertex-handles', paint: { 'circle-radius': 6, 'circle-color': '#FFFFFF', 'circle-stroke-width': 2, 'circle-stroke-color': '#1C6BEB' } })
}

interface FloorEditorCanvasProps {
  building: Building
  floor: number
  tool: StudioTool
  layers: LayerVisibility
  selectedId?: string | null
  onSelect?: (id: string | null) => void
}

export function FloorEditorCanvas({ building, floor, tool, layers, selectedId, onSelect }: FloorEditorCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null)
  const readyRef = useRef(false)

  const graph = useGraphStore((s) => s.graph)
  const campusId = graph.buildings[0]?.campusId ?? ''

  // Wire drawing interactions (state-driven so hook sees map after init)
  const { drawMode, pendingPolygon, hallwayWidth, setHallwayWidth, confirm: confirmDrawing, cancel: cancelDrawing, removeLastPoint } = useFloorDrawing({ map: mapInstance, buildingId: building.id, campusId, floor, tool, onSelect })

  useEffect(() => {
    if (mapRef.current) return
    let mounted = true
    const c = building.center ?? building.footprint[0] ?? { lat: 11.8195, lng: 122.0922 }
    const map = new maplibregl.Map({
      container: mapContainerRef.current!,
      style: BLANK_STYLE,
      center: [c.lng, c.lat],
      zoom: 18,
      pitch: 0,
    })
    map.on('load', () => {
      if (!mounted) return
      addSourcesAndLayers(map)
      readyRef.current = true
      setMapInstance(map)
      if (building.footprint.length >= 2) {
        const bounds = new maplibregl.LngLatBounds()
        building.footprint.forEach((p) => bounds.extend([p.lng, p.lat]))
        map.fitBounds(bounds, { padding: 60 })
      }
      const bldgSrc = map.getSource('floor-buildings') as maplibregl.GeoJSONSource
      if (bldgSrc) bldgSrc.setData(buildBuildingGeo(building))
    })
    mapRef.current = map
    return () => { mounted = false; map.remove(); mapRef.current = null; setMapInstance(null); readyRef.current = false }
  }, [building])

  // Floor plan image overlay via ImageSource.updateImage()
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const imgUrl = building.floorPlanUrls?.[floor]
    const src = map.getSource('floor-floorplan') as maplibregl.ImageSource | undefined
    if (!src) return
    if (imgUrl && building.footprint.length >= 3) {
      const bounds = new maplibregl.LngLatBounds()
      building.footprint.forEach((p) => bounds.extend([p.lng, p.lat]))
      const ne = bounds.getNorthEast()
      const sw = bounds.getSouthWest()
      src.updateImage({
        url: imgUrl,
        coordinates: [
          [sw.lng, ne.lat],
          [ne.lng, ne.lat],
          [ne.lng, sw.lat],
          [sw.lng, sw.lat],
        ],
      })
    } else {
      src.updateImage({ url: '', coordinates: [[0, 0], [0, 0], [0, 0], [0, 0]] })
    }
  }, [building.floorPlanUrls, floor, building.footprint])

  // Sync rooms + hallways for this floor
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const floorComponents = graph.components.filter((c) => c.buildingId === building.id && c.floor === floor)

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

    const hallwayFeatures: GeoJSON.Feature[] = floorComponents
      .filter((c) => c.type === 'hallway' && c.polygon && c.polygon.length >= 2)
      .map((c) => {
        const width = c.dimensions?.width ?? 3
        const buffer = computeWidthBuffer(c.polygon!, width)
        return {
          type: 'Feature' as const,
          properties: { id: c.id, name: c.name },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [[...buffer.map((p) => [p.lng, p.lat] as [number, number]), [buffer[0].lng, buffer[0].lat] as [number, number]]],
          },
        }
      })

    const hallwayCenterlineFeatures: GeoJSON.Feature[] = floorComponents
      .filter((c) => c.type === 'hallway' && c.polygon && c.polygon.length >= 2)
      .map((c) => ({
        type: 'Feature' as const,
        properties: { id: c.id, name: c.name },
        geometry: {
          type: 'LineString' as const,
          coordinates: c.polygon!.map((p) => [p.lng, p.lat] as [number, number]),
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
      const hallSrc = map.getSource('floor-hallways') as maplibregl.GeoJSONSource
      if (hallSrc) hallSrc.setData({ type: 'FeatureCollection', features: hallwayFeatures })
      const hallCenterSrc = map.getSource('floor-hallway-centerlines') as maplibregl.GeoJSONSource
      if (hallCenterSrc) hallCenterSrc.setData({ type: 'FeatureCollection', features: hallwayCenterlineFeatures })
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
    } catch { /* source not ready */ }
  }, [graph.components, graph.traces, building.id, floor])

  // Selection highlight
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const src = map.getSource('floor-selection') as maplibregl.GeoJSONSource
    if (!src) return
    if (!selectedId) {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }
    const comp = graph.components.find((c) => c.id === selectedId)
    if (!comp) { src.setData({ type: 'FeatureCollection', features: [] }); return }

    if (comp.polygon && comp.polygon.length >= (comp.type === 'hallway' ? 2 : 3)) {
      if (comp.type === 'hallway') {
        const width = comp.dimensions?.width ?? 3
        const buffer = computeWidthBuffer(comp.polygon, width)
        src.setData({
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', properties: { type: 'fill' }, geometry: { type: 'Polygon', coordinates: [[...buffer.map((p) => [p.lng, p.lat] as [number, number]), [buffer[0].lng, buffer[0].lat] as [number, number]]] } },
            { type: 'Feature', properties: { type: 'line' }, geometry: { type: 'LineString', coordinates: [...comp.polygon.map((p) => [p.lng, p.lat] as [number, number]), [comp.polygon[0].lng, comp.polygon[0].lat] as [number, number]] } },
          ],
        })
      } else {
        src.setData({
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', properties: { type: 'fill' }, geometry: { type: 'Polygon', coordinates: [[...comp.polygon.map((p) => [p.lng, p.lat] as [number, number]), [comp.polygon[0].lng, comp.polygon[0].lat] as [number, number]]] } },
            { type: 'Feature', properties: { type: 'line' }, geometry: { type: 'LineString', coordinates: [...comp.polygon.map((p) => [p.lng, p.lat] as [number, number]), [comp.polygon[0].lng, comp.polygon[0].lat] as [number, number]] } },
          ],
        })
      }
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
  }, [selectedId, graph.components])

  // Layer visibility
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const visibilityMap: Record<string, boolean> = {
      'floor-floorplan-layer': layers.floor_plan,
      'floor-buildings-fill': layers.buildings,
      'floor-buildings-outline': layers.buildings,
      'floor-rooms-fill': layers.rooms,
      'floor-rooms-outline': layers.rooms,
      'floor-hallways-fill': layers.hallways,
      'floor-hallways-outline': layers.hallways,
      'floor-hallway-centerlines-layer': layers.hallways,
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
      } catch { /* layer not found */ }
    }
  }, [layers])

  // Shared store actions
  const removeComponent = useGraphStore((s) => s.removeComponent)
  const updateComponent = useGraphStore((s) => s.updateComponent)
  const saveGraph = useGraphStore((s) => s.save)

  // Vertex handles + dragging for polygon components
  const dragRef = useRef<{ vertexIndex: number; componentId: string } | null>(null)
  const workingPolygonRef = useRef<LatLng[] | null>(null)

  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const src = map.getSource('floor-vertex-handles') as maplibregl.GeoJSONSource
    if (!src) return
    if (!selectedId) { src.setData({ type: 'FeatureCollection', features: [] }); return }
    const comp = graph.components.find((c) => c.id === selectedId)
    if (!comp || !comp.polygon || comp.polygon.length < 2) {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }
    src.setData({
      type: 'FeatureCollection',
      features: comp.polygon.map((p, i) => ({
        type: 'Feature' as const,
        properties: { vertexIndex: i, componentId: comp.id },
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] as [number, number] },
      })),
    })
  }, [selectedId, graph.components])

  // Drag vertex interaction
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const canvas = map.getCanvas()
    let pendingFrame: number | null = null

    const onMouseDown = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
      if (!e.features || e.features.length === 0) return
      const props = e.features[0].properties as Record<string, unknown>
      const vIdx = props.vertexIndex as number
      const cId = props.componentId as string
      if (vIdx == null || !cId) return
      const comp = graph.components.find((c) => c.id === cId)
      if (!comp?.polygon) return
      dragRef.current = { vertexIndex: vIdx, componentId: cId }
      workingPolygonRef.current = comp.polygon.map((p) => ({ ...p }))
      canvas.style.cursor = 'grabbing'
    }

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      const drag = dragRef.current
      const working = workingPolygonRef.current
      if (!drag || !working) return
      working[drag.vertexIndex] = { lat: e.lngLat.lat, lng: e.lngLat.lng }

      if (pendingFrame != null) return
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = null
        const drag = dragRef.current
        const working = workingPolygonRef.current
        if (!drag || !working) return

        const comp = graph.components.find((c) => c.id === drag.componentId)
        if (!comp) return
        const isRoom = comp.type === 'room'
        const isHallway = comp.type === 'hallway'
        const isElevator = comp.type === 'elevator'
        const srcId = isRoom ? 'floor-rooms' : isHallway ? 'floor-hallways' : isElevator ? 'floor-elevator-areas' : undefined

        // Live preview: update the polygon source
        if (srcId && working.length >= (isHallway ? 2 : 3)) {
          const src = map.getSource(srcId) as maplibregl.GeoJSONSource
          if (src) {
            const existing = (src as unknown as { _data?: GeoJSON.FeatureCollection })._data
            const features = existing ? [...existing.features] : []
            const origId = features.findIndex((f) => f.properties?.id === drag.componentId)
            if (origId >= 0) {
              if (isHallway) {
                const width = comp.dimensions?.width ?? 3
                const buffer = computeWidthBuffer(working, width)
                features[origId] = {
                  type: 'Feature',
                  properties: { id: comp.id, name: comp.name },
                  geometry: { type: 'Polygon', coordinates: [[...buffer.map((p) => [p.lng, p.lat] as [number, number]), [buffer[0].lng, buffer[0].lat] as [number, number]]] },
                }
              } else {
                features[origId] = {
                  type: 'Feature',
                  properties: { id: comp.id, name: comp.name },
                  geometry: { type: 'Polygon', coordinates: [[...working.map((p) => [p.lng, p.lat] as [number, number]), [working[0].lng, working[0].lat] as [number, number]]] },
                }
              }
              src.setData({ type: 'FeatureCollection', features })
            }
          }
        }

        // Update vertex handles position
        const handleSrc = map.getSource('floor-vertex-handles') as maplibregl.GeoJSONSource
        if (handleSrc) {
          handleSrc.setData({
            type: 'FeatureCollection',
            features: working.map((p, i) => ({
              type: 'Feature' as const,
              properties: { vertexIndex: i, componentId: drag.componentId },
              geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] as [number, number] },
            })),
          })
        }

        // Update centerline during hallway drag
        if (isHallway) {
          const clSrc = map.getSource('floor-hallway-centerlines') as maplibregl.GeoJSONSource
          if (clSrc) {
            const existing = (clSrc as unknown as { _data?: GeoJSON.FeatureCollection })._data
            const features = existing ? [...existing.features] : []
            const origId = features.findIndex((f) => f.properties?.id === drag.componentId)
            if (origId >= 0) {
              features[origId] = {
                type: 'Feature',
                properties: { id: comp.id, name: comp.name },
                geometry: { type: 'LineString', coordinates: working.map((p) => [p.lng, p.lat] as [number, number]) },
              }
              clSrc.setData({ type: 'FeatureCollection', features })
            }
          }
        }

        // Update selection highlight
        if (isRoom || isHallway || isElevator) {
          const selSrc = map.getSource('floor-selection') as maplibregl.GeoJSONSource
          if (selSrc && working.length >= (isHallway ? 2 : 3)) {
            if (isHallway) {
              const width = comp.dimensions?.width ?? 3
              const buffer = computeWidthBuffer(working, width)
              selSrc.setData({
                type: 'FeatureCollection',
                features: [
                  { type: 'Feature', properties: { type: 'fill' }, geometry: { type: 'Polygon', coordinates: [[...buffer.map((p) => [p.lng, p.lat] as [number, number]), [buffer[0].lng, buffer[0].lat] as [number, number]]] } },
                  { type: 'Feature', properties: { type: 'line' }, geometry: { type: 'LineString', coordinates: [...working.map((p) => [p.lng, p.lat] as [number, number]), [working[0].lng, working[0].lat] as [number, number]] } },
                ],
              })
            } else {
              selSrc.setData({
                type: 'FeatureCollection',
                features: [
                  { type: 'Feature', properties: { type: 'fill' }, geometry: { type: 'Polygon', coordinates: [[...working.map((p) => [p.lng, p.lat] as [number, number]), [working[0].lng, working[0].lat] as [number, number]]] } },
                  { type: 'Feature', properties: { type: 'line' }, geometry: { type: 'LineString', coordinates: [...working.map((p) => [p.lng, p.lat] as [number, number]), [working[0].lng, working[0].lat] as [number, number]] } },
                ],
              })
            }
          }
        }
      })
    }

    const onMouseUp = () => {
      if (pendingFrame != null) { cancelAnimationFrame(pendingFrame); pendingFrame = null }
      const drag = dragRef.current
      const working = workingPolygonRef.current
      if (!drag || !working) return
      dragRef.current = null
      workingPolygonRef.current = null
      canvas.style.cursor = CURSOR_MAP[tool] ?? 'default'

      // Commit to store
      updateComponent(drag.componentId, { polygon: working })
      saveGraph()
    }

    const onVertexEnter = () => { canvas.style.cursor = 'grab' }
    const onVertexLeave = () => { if (!dragRef.current) canvas.style.cursor = CURSOR_MAP[tool] ?? 'default' }

    map.on('mouseenter', 'floor-vertex-handles-layer', onVertexEnter)
    map.on('mouseleave', 'floor-vertex-handles-layer', onVertexLeave)
    map.on('mousedown', 'floor-vertex-handles-layer', onMouseDown as unknown as maplibregl.EventHandler)
    map.on('mousemove', onMouseMove)
    map.on('mouseup', onMouseUp)
    return () => {
      if (pendingFrame != null) cancelAnimationFrame(pendingFrame)
      map.off('mouseenter', 'floor-vertex-handles-layer', onVertexEnter)
      map.off('mouseleave', 'floor-vertex-handles-layer', onVertexLeave)
      map.off('mousedown', 'floor-vertex-handles-layer', onMouseDown as unknown as maplibregl.EventHandler)
      map.off('mousemove', onMouseMove)
      map.off('mouseup', onMouseUp)
    }
  }, [selectedId, graph.components, tool, updateComponent, saveGraph])

  // Keyboard shortcuts
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const canvas = map.getCanvas()
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (drawMode !== 'idle') {
          cancelDrawing()
        } else if (selectedId) {
          onSelect?.(null)
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        removeComponent(selectedId)
        saveGraph()
        onSelect?.(null)
      }
    }
    canvas.addEventListener('keydown', handleKey)
    canvas.setAttribute('tabindex', '0')
    return () => canvas.removeEventListener('keydown', handleKey)
  }, [selectedId, onSelect, removeComponent, saveGraph, drawMode, cancelDrawing])

  // Cursor based on tool
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    map.getCanvas().style.cursor = CURSOR_MAP[tool] ?? 'default'
  }, [tool])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
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
          <button onClick={() => { removeComponent(selectedId); saveGraph(); onSelect?.(null) }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6, border: 'none', background: '#EF4444', color: '#fff', fontSize: 11, cursor: 'pointer' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
