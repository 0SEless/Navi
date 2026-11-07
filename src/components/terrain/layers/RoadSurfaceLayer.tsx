'use client'

import { useEffect } from 'react'
import type maplibregl from 'maplibre-gl'
import type { ExpressionSpecification } from 'maplibre-gl'
import { roadSurfacePolygons, siteRoadSurfaces, type CampusDocument, type TerrainSampler } from '@navi/core'
import { FIRST_OVERLAY_LAYER, ROAD_SURFACE_LAYER } from '@/lib/terrain/terrain-view'
import { PATH_COLOR, ROAD_COLOR, roadMarkings } from '@/lib/terrain/road-markings'

export { PATH_COLOR, ROAD_COLOR, ROAD_SURFACE_LAYER }

export const ROAD_SURFACE_SOURCE = 'terrain-road-surfaces'
export const ROAD_MARKINGS_SOURCE = 'terrain-road-markings'
export const ROAD_EDGE_LAYER = 'terrain-road-edges'
export const ROAD_CENTRE_LAYER = 'terrain-road-centre'
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
const MARKING_WIDTH: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 16, 0.5, 20, 2]

/** Every road as a surface polygon at its width (empty until there is ground). */
export function roadSurfaceData(document: CampusDocument, sampler: TerrainSampler | null): GeoJSON.FeatureCollection {
  return sampler ? roadSurfacePolygons(siteRoadSurfaces(document, sampler)) : EMPTY
}

function setData(map: maplibregl.Map, id: string, data: GeoJSON.FeatureCollection): void {
  const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined
  if (source) source.setData(data)
  else map.addSource(id, { type: 'geojson', data })
}

/**
 * Adds (once) or updates the roads under the road outlines: asphalt or paving surfaces at their width,
 * white edge lines and a dashed centre line on two-lane roads. MapLibre drapes them on the terrain.
 * The Roads switch (`visible`) shows or hides them together.
 */
export function attachRoadSurfaces(map: maplibregl.Map, document: CampusDocument, sampler: TerrainSampler | null, visible: boolean): void {
  const roads = sampler ? siteRoadSurfaces(document, sampler) : []
  setData(map, ROAD_SURFACE_SOURCE, roads.length > 0 ? roadSurfacePolygons(roads) : EMPTY)
  setData(map, ROAD_MARKINGS_SOURCE, roads.length > 0 ? roadMarkings(roads) : EMPTY)
  const before = map.getLayer(FIRST_OVERLAY_LAYER) ? FIRST_OVERLAY_LAYER : undefined
  if (!map.getLayer(ROAD_SURFACE_LAYER)) {
    map.addLayer({
      id: ROAD_SURFACE_LAYER, type: 'fill', source: ROAD_SURFACE_SOURCE,
      paint: { 'fill-color': ['match', ['get', 'type'], 'pedestrian', PATH_COLOR, ROAD_COLOR], 'fill-opacity': 0.95 },
    }, before)
  }
  if (!map.getLayer(ROAD_EDGE_LAYER)) {
    map.addLayer({
      id: ROAD_EDGE_LAYER, type: 'line', source: ROAD_MARKINGS_SOURCE, filter: ['==', ['get', 'kind'], 'edge'],
      paint: { 'line-color': '#ffffff', 'line-opacity': 0.9, 'line-width': MARKING_WIDTH },
    }, before)
  }
  if (!map.getLayer(ROAD_CENTRE_LAYER)) {
    map.addLayer({
      id: ROAD_CENTRE_LAYER, type: 'line', source: ROAD_MARKINGS_SOURCE, filter: ['==', ['get', 'kind'], 'centre'],
      paint: { 'line-color': '#ffffff', 'line-opacity': 0.9, 'line-width': MARKING_WIDTH, 'line-dasharray': [4, 4] },
    }, before)
  }
  for (const id of [ROAD_SURFACE_LAYER, ROAD_EDGE_LAYER, ROAD_CENTRE_LAYER]) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
}

/** The roads drawn as surfaces with their markings on the terrain map. */
export function RoadSurfaceLayer({ map, document, sampler, visible }: {
  map: maplibregl.Map | null
  document: CampusDocument
  sampler: TerrainSampler | null
  visible: boolean
}) {
  useEffect(() => {
    if (map) attachRoadSurfaces(map, document, sampler, visible)
  }, [map, document, sampler, visible])
  return null
}
