'use client'

import { useEffect } from 'react'
import type maplibregl from 'maplibre-gl'
import { roadSurfacePolygons, siteRoadSurfaces, type CampusDocument, type TerrainSampler } from '@navi/core'
import { FIRST_OVERLAY_LAYER, ROAD_SURFACE_LAYER } from '@/lib/terrain/terrain-view'

export { ROAD_SURFACE_LAYER }

export const ROAD_SURFACE_SOURCE = 'terrain-road-surfaces'
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

/** Every road as a surface polygon at its width (empty until there is ground). */
export function roadSurfaceData(document: CampusDocument, sampler: TerrainSampler | null): GeoJSON.FeatureCollection {
  return sampler ? roadSurfacePolygons(siteRoadSurfaces(document, sampler)) : EMPTY
}

/** Adds (once) or updates the road surface fill under the road lines; MapLibre drapes fills on the terrain. */
export function attachRoadSurfaces(map: maplibregl.Map, data: GeoJSON.FeatureCollection, visible: boolean): void {
  const source = map.getSource(ROAD_SURFACE_SOURCE) as maplibregl.GeoJSONSource | undefined
  if (source) source.setData(data)
  else map.addSource(ROAD_SURFACE_SOURCE, { type: 'geojson', data })
  if (!map.getLayer(ROAD_SURFACE_LAYER)) {
    map.addLayer({
      id: ROAD_SURFACE_LAYER, type: 'fill', source: ROAD_SURFACE_SOURCE,
      paint: { 'fill-color': ['match', ['get', 'type'], 'pathway', '#d6d3d1', '#a8a29e'], 'fill-opacity': 0.9 },
    }, map.getLayer(FIRST_OVERLAY_LAYER) ? FIRST_OVERLAY_LAYER : undefined)
  }
  map.setLayoutProperty(ROAD_SURFACE_LAYER, 'visibility', visible ? 'visible' : 'none')
}

/** The roads drawn as surfaces at their width on the terrain map. */
export function RoadSurfaceLayer({ map, document, sampler, visible }: {
  map: maplibregl.Map | null
  document: CampusDocument
  sampler: TerrainSampler | null
  visible: boolean
}) {
  useEffect(() => {
    if (map) attachRoadSurfaces(map, roadSurfaceData(document, sampler), visible)
  }, [map, document, sampler, visible])
  return null
}
