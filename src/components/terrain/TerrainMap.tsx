'use client'

import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { contourSegments, toLatLng, toLocal, type CampusDocument, type TerrainSampler } from '@navi/core'
import { demTileUrl } from '@/lib/terrain/dem-protocol'
import { buildSlabFeatures } from '@/lib/terrain/building-slabs'
import { buildStructuresMesh } from '@/lib/terrain/structure-mesh'
import { createMeshLayer, meshLayerByMap, type MeshLayer } from '@/lib/three-d/mesh-layer'
import { RoadSurfaceLayer } from './layers/RoadSurfaceLayer'
import { CHANGES_SCHEME, HEIGHTS_SCHEME } from '@/lib/terrain/use-terrain-sampler'
import { exposeTerrainMapForProbe } from '@/studio-v2/client/test-hooks'
import { applyTerrainView, CHANGES_SOURCE, CONTOUR_LAYER, CONTOUR_SOURCE, HILLSHADE_LAYER, overlayAnchor, RELIEF_SOURCE, TERRAIN_SOURCE, type TerrainView } from '@/lib/terrain/terrain-view'

const HILLSHADE_SOURCE = 'terrain-hillshade-dem'
const BOUNDARY_SOURCE = 'terrain-boundary'
const BUILDINGS_SOURCE = 'terrain-buildings'
const ROADS_SOURCE = 'terrain-roads'
const SLABS_SOURCE = 'terrain-slabs'
const STRUCTURES_LAYER = 'terrain-structures'
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
export const GROUND_COLOR = '#e9e3d6'

export interface TerrainMapProps {
  document: CampusDocument
  sampler: TerrainSampler | null
  /** Changes whenever the ground may have changed; reloads the terrain tiles. */
  version: number
  view: TerrainView
  exaggeration: number
  pitch: number
  /** Gives the parent the map (brush tools attach their pointer handlers to it). */
  onMap?: (map: maplibregl.Map | null) => void
  /** Show/hide: buildings, roads, contour lines over any view. */
  layers?: { buildings: boolean; roads: boolean; contours: boolean }
  /** 3D: hide the floors above this one (and the roof). */
  cutAboveFloorId?: string | null
}

function boundaryOf(document: CampusDocument) {
  return document.boundary?.points ?? []
}

function overlayData(document: CampusDocument) {
  const ring = boundaryOf(document)
  const boundary: GeoJSON.FeatureCollection = ring.length >= 3
    ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [...ring, ring[0]].map((p) => [p.lng, p.lat]) } }] }
    : EMPTY
  const buildings: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: document.buildings.filter((b) => (b.footprint?.points?.length ?? 0) >= 3).map((b) => ({
      type: 'Feature', properties: { id: b.id, name: b.name },
      geometry: { type: 'LineString', coordinates: b.footprint.points.map((p) => [p.lng, p.lat]) },
    })),
  }
  const roads: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: document.roads.filter((r) => (r.polyline?.points?.length ?? 0) >= 2).map((r) => ({
      type: 'Feature', properties: { id: r.id },
      geometry: { type: 'LineString', coordinates: r.polyline.points.map((p) => [p.lng, p.lat]) },
    })),
  }
  return { boundary, buildings, roads }
}

/** Contour lines every 1 m (major every 5 m) over the boundary box, sampled every 2 m. */
function contourData(document: CampusDocument, sampler: TerrainSampler | null): GeoJSON.FeatureCollection {
  const ring = boundaryOf(document)
  if (!sampler || ring.length < 3) return EMPTY
  const local = ring.map((p) => toLocal(sampler.grid, p))
  const bbox = {
    minX: Math.min(...local.map((p) => p.x)) - 20, minY: Math.min(...local.map((p) => p.y)) - 20,
    maxX: Math.max(...local.map((p) => p.x)) + 20, maxY: Math.max(...local.map((p) => p.y)) + 20,
  }
  const levels = contourSegments((x, y) => sampler.heightAt(x, y), bbox, { step: 1, cell: 2 })
  return {
    type: 'FeatureCollection',
    features: levels.flatMap((level) => level.segments.map(([a, b]) => {
      const pa = toLatLng(sampler.grid, a)
      const pb = toLatLng(sampler.grid, b)
      return {
        type: 'Feature' as const,
        properties: { elevation: level.elevationM, major: Math.abs(level.elevationM % 5) < 1e-6 },
        geometry: { type: 'LineString' as const, coordinates: [[pa.lng, pa.lat], [pb.lng, pb.lat]] },
      }
    })),
  }
}

/** One terrain map (top view or 3D): hillshade, height or change colours, contours, campus outlines. */
export function TerrainMap({ document, sampler, version, view, exaggeration, pitch, onMap, layers = { buildings: true, roads: true, contours: false }, cutAboveFloorId = null }: TerrainMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [ready, setReady] = useState(false)
  // Tilted = shown in 3D. Follows the live pitch: tilting the top view (pinch, right-drag) raises the hill.
  const [tilted, setTilted] = useState(pitch > 0)
  const structuresRef = useRef<{ layer: MeshLayer; origin: string } | null>(null)
  const latest = useRef({ document, sampler, version, view, exaggeration })
  latest.current = { document, sampler, version, view, exaggeration }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ring = boundaryOf(latest.current.document)
    const lngs = ring.map((p) => p.lng)
    const lats = ring.map((p) => p.lat)
    const dem = (scheme: string) => ({ type: 'raster-dem' as const, tiles: [demTileUrl(scheme, latest.current.version)], tileSize: 256, encoding: 'mapbox' as const, maxzoom: 16 })
    const map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {
          [TERRAIN_SOURCE]: dem(HEIGHTS_SCHEME),
          [RELIEF_SOURCE]: dem(HEIGHTS_SCHEME),
          [HILLSHADE_SOURCE]: dem(HEIGHTS_SCHEME),
          [CHANGES_SOURCE]: dem(CHANGES_SCHEME),
          [CONTOUR_SOURCE]: { type: 'geojson', data: EMPTY },
          [BOUNDARY_SOURCE]: { type: 'geojson', data: EMPTY },
          [BUILDINGS_SOURCE]: { type: 'geojson', data: EMPTY },
          [ROADS_SOURCE]: { type: 'geojson', data: EMPTY },
          [SLABS_SOURCE]: { type: 'geojson', data: EMPTY },
        },
        layers: [
          // Neutral ground (owner 2026-11-06): sand-grey with a warm hillshade, like TopoExport.
          { id: 'terrain-background', type: 'background', paint: { 'background-color': GROUND_COLOR } },
          { id: HILLSHADE_LAYER, type: 'hillshade', source: HILLSHADE_SOURCE, paint: { 'hillshade-exaggeration': 0.5, 'hillshade-shadow-color': '#6f6455', 'hillshade-highlight-color': '#fffdf7', 'hillshade-accent-color': '#8c8170' } },
          { id: 'terrain-roads', type: 'line', source: ROADS_SOURCE, paint: { 'line-color': '#6b7280', 'line-width': 2 } },
          { id: 'terrain-buildings', type: 'line', source: BUILDINGS_SOURCE, paint: { 'line-color': '#1f2937', 'line-width': 1.5 } },
          { id: 'terrain-boundary', type: 'line', source: BOUNDARY_SOURCE, paint: { 'line-color': '#2563eb', 'line-width': 2, 'line-dasharray': [3, 2] } },
          // Solid floor slabs and roofs (3D only): opaque, so lower floors are hidden.
          { id: 'terrain-slabs', type: 'fill-extrusion', source: SLABS_SOURCE, layout: { visibility: pitch > 0 ? 'visible' : 'none' }, paint: {
            'fill-extrusion-color': ['match', ['get', 'kind'], 'roof', '#475569', '#94a3b8'],
            'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'top'], 'fill-extrusion-opacity': 1,
          } },
        ],
      },
      center: ring.length > 0 ? [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2] : [0, 0],
      zoom: 16,
      pitch,
      maxPitch: 85,
      attributionControl: false,
    })
    mapRef.current = map
    const unexpose = exposeTerrainMapForProbe(pitch > 0 ? '3d' : 'top', map)
    map.on('pitch', () => {
      const now = map.getPitch() > 2
      setTilted((was) => (was === now ? was : now))
    })
    map.on('load', () => {
      // The main view keeps the campus clear of the tool rail, the side panel and the layers panel.
      const padding = container.clientWidth > 700 ? { top: 40, left: 160, right: 280, bottom: 250 } : 30
      if (ring.length >= 3) map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding, duration: 0, pitch })
      setReady(true)
    })
    onMap?.(map)
    return () => {
      unexpose()
      onMap?.(null)
      mapRef.current = null
      structuresRef.current = null
      setReady(false)
      map.remove()
    }
    // The map is created once; later props are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    applyTerrainView(map as unknown as Parameters<typeof applyTerrainView>[0], {
      view, exaggeration, colorRange: document.terrain?.colorRange ?? { minM: 0, maxM: 40 }, threeD: tilted,
    })
  }, [ready, view, exaggeration, document.terrain?.colorRange, tilted])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    for (const [id, scheme] of [[TERRAIN_SOURCE, HEIGHTS_SCHEME], [RELIEF_SOURCE, HEIGHTS_SCHEME], [HILLSHADE_SOURCE, HEIGHTS_SCHEME], [CHANGES_SOURCE, CHANGES_SCHEME]] as const) {
      const source = map.getSource(id) as maplibregl.RasterDEMTileSource | undefined
      source?.setTiles([demTileUrl(scheme, version)])
    }
    const { boundary, buildings, roads } = overlayData(document)
    ;(map.getSource(BOUNDARY_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(boundary)
    ;(map.getSource(BUILDINGS_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(buildings)
    ;(map.getSource(ROADS_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(roads)
  }, [ready, version, document])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !sampler) return
    ;(map.getSource(SLABS_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(buildSlabFeatures(document, sampler, { ...(cutAboveFloorId ? { cutAboveFloorId } : {}) }))
    map.setLayoutProperty('terrain-slabs', 'visibility', tilted && layers.buildings ? 'visible' : 'none')
  }, [ready, version, document, sampler, cutAboveFloorId, tilted, layers.buildings])

  // Stairs and ramps: one 3D mesh around the terrain grid origin; flat on the map in the top view.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !sampler) return
    const origin = `${sampler.grid.originLat},${sampler.grid.originLng}`
    if (structuresRef.current?.origin !== origin) {
      if (map.getLayer(STRUCTURES_LAYER)) map.removeLayer(STRUCTURES_LAYER)
      const layer = createMeshLayer(STRUCTURES_LAYER, { lat: sampler.grid.originLat, lng: sampler.grid.originLng })
      map.addLayer(layer)
      meshLayerByMap.set(map, layer)
      structuresRef.current = { layer, origin }
    }
    structuresRef.current.layer.setMesh(buildStructuresMesh(document, sampler))
  }, [ready, document, sampler])

  useEffect(() => {
    structuresRef.current?.layer.setVerticalScale(tilted ? exaggeration : 0)
  }, [ready, sampler, tilted, exaggeration])

  const showContours = layers.contours
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !showContours) return
    ;(map.getSource(CONTOUR_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(contourData(document, sampler))
  }, [ready, showContours, version, document, sampler])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.setLayoutProperty('terrain-buildings', 'visibility', layers.buildings ? 'visible' : 'none')
    map.setLayoutProperty('terrain-roads', 'visibility', layers.roads ? 'visible' : 'none')
    // Contour lines (every 1 m, stronger every 5 m) over any colours, under the road surfaces and outlines.
    if (layers.contours) {
      if (!map.getLayer(CONTOUR_LAYER)) map.addLayer({ id: CONTOUR_LAYER, type: 'line', source: CONTOUR_SOURCE, paint: { 'line-color': '#7c5c3b', 'line-opacity': ['case', ['==', ['get', 'major'], true], 0.85, 0.4], 'line-width': ['case', ['==', ['get', 'major'], true], 1.3, 0.6] } }, overlayAnchor(map))
    } else if (map.getLayer(CONTOUR_LAYER)) map.removeLayer(CONTOUR_LAYER)
  }, [ready, layers.buildings, layers.roads, layers.contours])

  return (
    <>
      <div ref={containerRef} data-terrain-map={pitch > 0 ? '3d' : 'top'} style={{ position: 'absolute', inset: 0 }} />
      <RoadSurfaceLayer map={ready ? mapRef.current : null} document={document} sampler={sampler} visible={layers.roads} />
    </>
  )
}
