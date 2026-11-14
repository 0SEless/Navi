'use client'

import { useEffect, useRef } from 'react'
import type maplibregl from 'maplibre-gl'
import type { ExpressionSpecification } from 'maplibre-gl'
import { buildRouteRibbon, createSiteGround, createSiteSurface, DEFAULT_TERRAIN_LOOK, roadSurfacePolygons, terrainLookRelief, terrainLookStyle, type SiteArtifact, type TerrainLook } from '@navi/core'
import { demTileUrl, registerTerrainProtocol, terrainTileCache } from '@/lib/terrain/dem-protocol'
import { PATH_COLOR, ROAD_COLOR, roadMarkings } from '@/lib/terrain/road-markings'
import { createMeshLayer, type MeshLayer } from '@/lib/three-d/mesh-layer'
import type { Building } from '@/types/nav-types'
import { siteContourLines, siteGroundArea, siteOrigin, siteStructuresMesh } from './site-data'

type LatLng = { lat: number; lng: number }

const SCHEME = 'navi-site'
const DEM_HILLSHADE = 'site-dem-hillshade'
const DEM_TERRAIN = 'site-dem-terrain'
/** The map's plain background outside the campus (NavigationMap's campus-only style). */
const OUTSIDE_COLOR = '#e9eee6'
/** Width (px) of the soft shadow drawn just outside the campus edge. */
const FRAME_SHADOW_WIDTH = 18
const MARKING_WIDTH: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 16, 0.5, 20, 2]

export const SITE_LAYER = {
  ground: 'site-ground',
  relief: 'site-relief',
  hillshade: 'site-hillshade',
  outside: 'site-outside',
  frameShadow: 'site-frame-shadow',
  frameEdge: 'site-frame-edge',
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
 * The published campus on NAVI Web (Task 15, campus only): ground in the chosen look (the visitor's choice, else
 * the owner's `site.look`, else green terraces) with height colours and crisp hill shading, a veil outside the
 * boundary, 3D terrain from the baked heights, roads with the Studio markings, stairs and ramps, and the route as
 * a ribbon on the surface (3D; 2D keeps the route line). Buildings are drawn once, solid, by BuildingLayer.
 * Drawn under the app's own layers (buildings, rooms, route line).
 */
export function SiteLayers({ map, site, buildings, threeD, contours, routePath = null, look }: {
  map: maplibregl.Map | null
  site: SiteArtifact
  buildings: Building[]
  threeD: boolean
  contours: boolean
  routePath?: LatLng[] | null
  /** The visitor's look on this device; absent = the owner's look. */
  look?: TerrainLook
}) {
  const activeLook = look ?? site.look ?? DEFAULT_TERRAIN_LOOK
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
    add({ id: SITE_LAYER.ground, type: 'fill', source: SITE_LAYER.ground, paint: { 'fill-color': terrainLookStyle(activeLook).ground } })
    track(SITE_LAYER.ground)

    if (site.terrain) {
      const dem = { type: 'raster-dem' as const, tiles: [demTileUrl(SCHEME, version.current)], tileSize: 256, encoding: 'mapbox' as const, maxzoom: 17 }
      if (!map.getSource(DEM_HILLSHADE)) map.addSource(DEM_HILLSHADE, dem)
      if (!map.getSource(DEM_TERRAIN)) map.addSource(DEM_TERRAIN, dem)
      sources.push(DEM_HILLSHADE, DEM_TERRAIN)
      add({ id: SITE_LAYER.hillshade, type: 'hillshade', source: DEM_HILLSHADE, paint: { 'hillshade-method': 'multidirectional' } })
      track(SITE_LAYER.hillshade)
    }

    // A veil over everything outside the boundary: the height colours and shading cover the whole terrain grid.
    geojson(map, SITE_LAYER.outside, outsideBoundary(site.boundary))
    sources.push(SITE_LAYER.outside)
    add({ id: SITE_LAYER.outside, type: 'fill', source: SITE_LAYER.outside, paint: { 'fill-color': OUTSIDE_COLOR } })
    track(SITE_LAYER.outside)

    // The frame: a soft shadow just outside the edge (like a model on a table) and a thin crisp edge.
    geojson(map, 'site-frame', { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: frameRing(site.boundary) } })
    sources.push('site-frame')
    add({ id: SITE_LAYER.frameShadow, type: 'line', source: 'site-frame', layout: { 'line-join': 'round' }, paint: {
      'line-color': '#1f2a1a', 'line-opacity': 0.22, 'line-width': FRAME_SHADOW_WIDTH, 'line-blur': 12, 'line-offset': FRAME_SHADOW_WIDTH / 2,
    } })
    add({ id: SITE_LAYER.frameEdge, type: 'line', source: 'site-frame', layout: { 'line-join': 'round' }, paint: {
      'line-color': 'rgba(45,55,40,0.55)', 'line-width': 1.5,
    } })
    track(SITE_LAYER.frameShadow)
    track(SITE_LAYER.frameEdge)

    geojson(map, SITE_LAYER.roads, roadSurfacePolygons(site.roads))
    geojson(map, 'site-road-markings', roadMarkings(site.roads))
    sources.push(SITE_LAYER.roads, 'site-road-markings')
    add({ id: SITE_LAYER.roads, type: 'fill', source: SITE_LAYER.roads, paint: { 'fill-color': ['match', ['get', 'type'], 'pedestrian', PATH_COLOR, ROAD_COLOR], 'fill-opacity': 0.95 } })
    add({ id: SITE_LAYER.roadEdges, type: 'line', source: 'site-road-markings', filter: ['==', ['get', 'kind'], 'edge'], paint: { 'line-color': '#ffffff', 'line-opacity': 0.9, 'line-width': MARKING_WIDTH } })
    add({ id: SITE_LAYER.roadCentre, type: 'line', source: 'site-road-markings', filter: ['==', ['get', 'kind'], 'centre'], paint: { 'line-color': '#ffffff', 'line-opacity': 0.9, 'line-width': MARKING_WIDTH, 'line-dasharray': [4, 4] } })
    track(SITE_LAYER.roads)
    track(SITE_LAYER.roadEdges)
    track(SITE_LAYER.roadCentre)

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
      try {
        for (const id of [...added, SITE_LAYER.relief, SITE_LAYER.contours]) if (map.getLayer(id)) map.removeLayer(id)
        for (const id of [...sources, SITE_LAYER.contours]) if (map.getSource(id)) map.removeSource(id)
      } catch { /* the map was already removed (leaving the page) */ }
    }
  }, [map, site, buildings])

  // 2D / 3D: terrain and the mesh heights.
  useEffect(() => {
    if (!map) return
    map.setTerrain(threeD && site.terrain ? { source: DEM_TERRAIN, exaggeration: 1 } : null)
    meshes.current?.structures.setVerticalScale(threeD ? 1 : 0)
    meshes.current?.route.setVerticalScale(threeD ? 1 : 0)
  }, [map, site, buildings, threeD])

  // The ground look: ground colour, height colours (none for Neutral) and tinted hill shading.
  useEffect(() => {
    if (!map) return
    const style = terrainLookStyle(activeLook)
    if (map.getLayer(SITE_LAYER.ground)) map.setPaintProperty(SITE_LAYER.ground, 'fill-color', style.ground)
    if (map.getLayer(SITE_LAYER.hillshade)) {
      map.setPaintProperty(SITE_LAYER.hillshade, 'hillshade-shadow-color', style.shading.shadow)
      map.setPaintProperty(SITE_LAYER.hillshade, 'hillshade-highlight-color', style.shading.highlight)
      map.setPaintProperty(SITE_LAYER.hillshade, 'hillshade-exaggeration', style.shading.exaggeration)
    }
    const stops = site.terrain ? terrainLookRelief(activeLook, site.terrain.minM, site.terrain.maxM) : null
    if (!stops) {
      if (map.getLayer(SITE_LAYER.relief)) map.removeLayer(SITE_LAYER.relief)
      return
    }
    const color = ['interpolate', ['linear'], ['elevation'], ...stops.flat()] as unknown as ExpressionSpecification
    if (map.getLayer(SITE_LAYER.relief)) map.setPaintProperty(SITE_LAYER.relief, 'color-relief-color', color)
    else map.addLayer({ id: SITE_LAYER.relief, type: 'color-relief', source: DEM_HILLSHADE, paint: { 'color-relief-color': color, 'color-relief-opacity': 1 } } as never, map.getLayer(SITE_LAYER.hillshade) ? SITE_LAYER.hillshade : undefined)
  }, [map, site, buildings, activeLook])

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

/** The world minus the campus boundary (GeoJSON polygon with the boundary as its hole). */
function outsideBoundary(boundary: LatLng[]): GeoJSON.Feature {
  const ring = boundary.map((p) => [p.lng, p.lat])
  if (ring.length > 0 && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push(ring[0])
  const world = [[-179.9, -85], [179.9, -85], [179.9, 85], [-179.9, 85], [-179.9, -85]]
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: ring.length >= 4 ? [world, ring] : [world] } }
}

/**
 * The boundary as a closed line running counter-clockwise in lng/lat, so the outside is on its visual right
 * (MapLibre's positive line-offset side): the frame shadow can then be pushed outward.
 */
export function frameRing(boundary: LatLng[]): number[][] {
  const ring = boundary.map((p) => [p.lng, p.lat])
  if (ring.length === 0) return ring
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) ring.push([...ring[0]])
  let twiceArea = 0
  for (let i = 0; i < ring.length - 1; i++) twiceArea += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  return twiceArea < 0 ? ring.reverse() : ring
}
