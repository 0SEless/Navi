'use client'

import { useCallback, useRef, useEffect } from 'react'
import maplibregl from 'maplibre-gl'
import { useStudioStore } from '@/store/studio-store'
import type { LatLng, TracePath } from '@/types/nav-types'

const VERTEX_SOURCE = 'vertex-source'
const VERTEX_LAYER = 'vertex-points'
const VERTEX_EDGE_LAYER = 'vertex-edges'
const VERTEX_MIDPOINT_LAYER = 'vertex-midpoints'

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
  if (map.getSource(VERTEX_SOURCE)) return
  map.addSource(VERTEX_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({ id: VERTEX_EDGE_LAYER, type: 'line', source: VERTEX_SOURCE, paint: { 'line-color': '#F59E0B', 'line-width': 2, 'line-dasharray': [2, 2] } })
  map.addLayer({ id: VERTEX_MIDPOINT_LAYER, type: 'circle', source: VERTEX_SOURCE, paint: { 'circle-radius': 4, 'circle-color': '#94A3B8', 'circle-stroke-width': 1, 'circle-stroke-color': '#1E293B', 'circle-opacity': 0.6 }, filter: ['==', ['get', 'segment'], -1] })
  map.addLayer({ id: VERTEX_LAYER, type: 'circle', source: VERTEX_SOURCE, paint: { 'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 7, 5], 'circle-color': '#F59E0B', 'circle-stroke-width': 2, 'circle-stroke-color': '#1E293B' } })
}

export function useVertexEditor(
  map: maplibregl.Map | null,
  trace: TracePath | null,
  onSave: (points: LatLng[]) => void,
) {
  const isVertexEditing = useStudioStore((s) => s.isVertexEditing)
  const setVertexEditing = useStudioStore((s) => s.setVertexEditing)
  const pointsRef = useRef<LatLng[]>(trace?.points ?? [])
  const selectedIdxRef = useRef<number | null>(null)
  const dragStartRef = useRef<LatLng | null>(null)

  useEffect(() => {
    pointsRef.current = trace?.points ?? []
  }, [trace])

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
  }, [map])

  // Toggle vertex editing visibility
  useEffect(() => {
    if (!map || !isVertexEditing || !trace) return
    updateDisplay(pointsRef.current)
  }, [isVertexEditing, trace, map, updateDisplay])

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
      const features = map.queryRenderedFeatures(e.point, { layers: [VERTEX_LAYER] })
      if (features.length > 0) {
        const idx = features[0].properties?.index as number
        if (idx != null) selectedIdxRef.current = idx
        updateDisplay(pointsRef.current, idx)
        return
      }
      // Double-click on midpoint to add vertex
      const midFeatures = map.queryRenderedFeatures(e.point, { layers: [VERTEX_MIDPOINT_LAYER] })
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
      const features = map.queryRenderedFeatures(e.point, { layers: [VERTEX_LAYER] })
      if (features.length > 0) {
        const idx = features[0].properties?.index as number
        selectedIdxRef.current = idx
        dragStartRef.current = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      }
    }
    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (selectedIdxRef.current == null || !dragStartRef.current) return
      const idx = selectedIdxRef.current
      const newPoints = [...pointsRef.current]
      newPoints[idx] = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      pointsRef.current = newPoints
      updateDisplay(newPoints, idx)
    }
    const handleMouseUp = () => {
      if (selectedIdxRef.current != null) {
        onSave(pointsRef.current)
      }
      dragStartRef.current = null
    }
    const handleContextMenu = (e: maplibregl.MapMouseEvent) => {
      e.originalEvent.preventDefault()
      const features = map.queryRenderedFeatures(e.point, { layers: [VERTEX_LAYER] })
      if (features.length > 0 && pointsRef.current.length > 2) {
        const idx = features[0].properties?.index as number
        const newPoints = [...pointsRef.current]
        newPoints.splice(idx, 1)
        pointsRef.current = newPoints
        selectedIdxRef.current = null
        updateDisplay(newPoints)
        onSave(newPoints)
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
  }, [map, isVertexEditing, updateDisplay, onSave])

  return { active: isVertexEditing, getPoints: () => pointsRef.current, cancel: () => setVertexEditing(null, null) }
}
