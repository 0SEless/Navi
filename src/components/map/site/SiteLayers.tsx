'use client'

import { useEffect, useRef } from 'react'
import type maplibregl from 'maplibre-gl'
import type { ExpressionSpecification } from 'maplibre-gl'
import { buildRouteRibbon, createSiteGround, createSiteSurface, roadSurfacePolygons, type SiteArtifact } from '@navi/core'
import { demTileUrl, registerTerrainProtocol, terrainTileCache } from '@/lib/terrain/dem-protocol'
import { PATH_COLOR, ROAD_COLOR, roadMarkings } from '@/lib/terrain/road-markings'
import { createMeshLayer, type MeshLayer } from '@/lib/three-d/mesh-layer'
import type { Building } from '@/types/nav-types'
import { siteContourLines, siteGroundArea, siteOrigin, siteSlabFeatures, siteStructuresMesh } from './site-data'

type LatLng = { lat: number; lng: number }

const SCHEME = 'navi-site'
const DEM_HILLSHADE = 'site-dem-hillshade'
const DEM_TERRAIN = 'site-dem-terrain'
/** The visitor campus is green (the owner's target picture); Studio stays neutral for editing. */
const GRASS = '#c9dcb4'
const MARKING_WIDTH: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 16, 0.5, 20, 2]

export const SITE_LAYER = {
  ground: 'site-ground',
  hillshade: 'site-hillshade',
  contours: 'site-contours',
  roads: 'site-roads',
  roadEdges: 'site-road-edges',
  roadCentre: 'site-road-centre',
  slabs: 'site-slabs',
  structures: 'site-structures',
  route: 'site-route',
} as const

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

/** Adds a GeoJSON source (or replaces its data). */
function geojson(map: maplibregl.Map, id: string, data: GeoJSON.FeatureCollection | GeoJSON.Feature): void {
  const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined
  if (source) source.setData(data)
  else map.addSource(id, { type: 'geojson', data })
}

/**
 * The published campus on NAVI Web (Task 15, campus only): green ground clipped to the boundary, hillshade
 * and 3D terrain from the baked heights, roads with the Studio markings, stairs and ramps, building slabs
 * (3D) and the route as a ribbon on the surface (3D; 2D keeps the route line). Drawn under the app's own
 * layers (buildings, rooms, route line).
 */
export function SiteLayers({ map, site, buildings, threeD, contours, routePath = null }: {
  map: maplibregl.Map | null
  site: SiteArtifact
  buildings: Building[]
  threeD: boolean
  contours: boolean
  routePath?: LatLng[] | null
}) {
  const ground = useRef(createSiteGround(site))
  const meshes = useRef<{ structures: MeshLayer; route: MeshLayer } | null>(null)
  const version = useRef(0)

  // The DEM protocol reads the latest site's ground.
  useEffect(() => {
    if (!site.terrain) return
    return registerTerrainProtocol(SCHEME, () => (lat, lng) => ground.current({ lat, lng }))
  }, [site.terrain])

  // Sources and layers for this site.
  useEffect(() => {
    if (!map) return
    ground.current = createSiteGround(site)
    version.current += 1
    terrainTileCache.invalidate('all')
    const anchor = map.getStyle().layers.find((l) => l.id !== 'background' && !l.id.startsWith('site-'))?.id
    const add = (layer: Parameters<maplibregl.Map['addLayer']>[0]) => {
      if (!map.getLayer((layer as { id: string }).id)) map.addLayer(layer, anchor)
    }
    const added: string[] = []
    const sources: string[] = []
    const track = (layerId: string) => added.push(layerId)

    geojson(map, SITE_LAYER.ground, siteGroundArea(site))
    sources.push(SITE_LAYER.ground)
    add({ id: SITE_LAYER.ground, type: 'fill', source: SITE_LAYER.ground, paint: { 'fill-color': GRASS } })
    track(SITE_LAYER.ground)

    if (site.terrain) {
      const dem = { type: 'raster-dem' as const, tiles: [demTileUrl(SCHEME, version.current)], tileSize: 256, encoding: 'mapbox' as const, maxzoom: 16 }
      if (!map.getSource(DEM_HILLSHADE)) map.addSource(DEM_HILLSHADE, dem)
      if (!map.getSource(DEM_TERRAIN)) map.addSource(DEM_TERRAIN, dem)
      sources.push(DEM_HILLSHADE, DEM_TERRAIN)
      add({ id: SITE_LAYER.hillshade, type: 'hillshade', source: DEM_HILLSHADE, paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#5f7356', 'hillshade-highlight-color': '#ffffff' } })
      track(SITE_LAYER.hillshade)
    }

    geojson(map, SITE_LAYER.roads, roadSurfacePolygons(site.roads))
    geojson(map, 'site-road-markings', roadMarkings(site.roads))
    sources.push(SITE_LAYER.roads, 'site-road-markings')
    add({ id: SITE_LAYER.roads, type: 'fill', source: SITE_LAYER.roads, paint: { 'fill-color': ['match', ['get', 'type'], 'pedestrian', PATH_COLOR, ROAD_COLOR], 'fill-opacity': 0.95 } })
    add({ id: SITE_LAYER.roadEdges, type: 'line', source: 'site-road-markings', filter: ['==', ['get', 'kind'], 'edge'], paint: { 'line-color': '#ffffff', 'line-opacity': 0.9, 'line-width': MARKING_WIDTH } })
    add({ id: SITE_LAYER.roadCentre, type: 'line', source: 'site-road-markings', filter: ['==', ['get', 'kind'], 'centre'], paint: { 'line-color': '#ffffff', 'line-opacity': 0.9, 'line-width': MARKING_WIDTH, 'line-dasharray': [4, 4] } })
    track(SITE_LAYER.roads)
    track(SITE_LAYER.roadEdges)
    track(SITE_LAYER.roadCentre)

    geojson(map, SITE_LAYER.slabs, siteSlabFeatures(site, buildings))
    sources.push(SITE_LAYER.slabs)
    add({
      id: SITE_LAYER.slabs, type: 'fill-extrusion', source: SITE_LAYER.slabs, layout: { visibility: 'none' },
      paint: { 'fill-extrusion-color': ['match', ['get', 'kind'], 'roof', '#7fa36b', '#ecebe6'], 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'top'], 'fill-extrusion-opacity': 1 },
    })
    track(SITE_LAYER.slabs)

    const { origin, mesh } = siteStructuresMesh(site)
    const structures = createMeshLayer(SITE_LAYER.structures, origin)
    const route = createMeshLayer(SITE_LAYER.route, origin)
    structures.setMesh(mesh)
    add(structures)
    add(route)
    track(SITE_LAYER.structures)
    track(SITE_LAYER.route)
    meshes.current = { structures, route }

    return () => {
      meshes.current = null
      for (const id of [...added, SITE_LAYER.contours]) if (map.getLayer(id)) map.removeLayer(id)
      for (const id of [...sources, SITE_LAYER.contours]) if (map.getSource(id)) map.removeSource(id)
    }
  }, [map, site, buildings])

  // 2D / 3D: terrain, slabs and the mesh heights.
  useEffect(() => {
    if (!map) return
    map.setTerrain(threeD && site.terrain ? { source: DEM_TERRAIN, exaggeration: 1 } : null)
    if (map.getLayer(SITE_LAYER.slabs)) map.setLayoutProperty(SITE_LAYER.slabs, 'visibility', threeD ? 'visible' : 'none')
    meshes.current?.structures.setVerticalScale(threeD ? 1 : 0)
    meshes.current?.route.setVerticalScale(threeD ? 1 : 0)
  }, [map, site, buildings, threeD])

  // Contour lines every 5 m, on request.
  useEffect(() => {
    if (!map) return
    if (contours) {
      geojson(map, SITE_LAYER.contours, siteContourLines(site, 5))
      if (!map.getLayer(SITE_LAYER.contours)) {
        map.addLayer({ id: SITE_LAYER.contours, type: 'line', source: SITE_LAYER.contours, paint: { 'line-color': '#6b5b3e', 'line-opacity': 0.5, 'line-width': 0.8 } }, map.getLayer(SITE_LAYER.roads) ? SITE_LAYER.roads : undefined)
      }
    } else if (map.getLayer(SITE_LAYER.contours)) {
      map.removeLayer(SITE_LAYER.contours)
    }
  }, [map, site, contours])

  // The route as a ribbon on the surface (3D only; 2D keeps the app's route line).
  useEffect(() => {
    const route = meshes.current?.route
    if (!route) return
    route.setMesh(threeD && routePath && routePath.length >= 2
      ? buildRouteRibbon(routePath, createSiteSurface(site), siteOrigin(site))
      : new Float32Array(0))
  }, [map, site, buildings, threeD, routePath])

  return null
}
