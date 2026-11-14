'use client'
import { useEffect } from 'react'
import type maplibregl from 'maplibre-gl'
import type { FloorArchitectureRenderData } from '@/components/map/NavigationRenderModel'
import { styleReady } from '@/lib/terrain/style-ready'
import { levelOnGround } from '@/components/map/site/level-on-ground'
import { OPENING_SYMBOL_LAYER_IDS, doorExtrusionColor, syncOpeningSymbolLayers } from '@/lib/opening-symbol-layers'

export type StackedFloorArchitecture = FloorArchitectureRenderData & {
  /** The heights of the stacked floors, lowest first: each gets its own floor slab. */
  stackElevations: number[]
  /** The spaces each stacked floor's walls enclose, in the same order (its slab). */
  stackFaces: Array<Array<Array<{ lat: number; lng: number }>>>
  /** Each stacked floor's own walls, in the same order (its floor plate). */
  stackWalls: GeoJSON.FeatureCollection[]
}

const stackKinds = ['walls', 'frames', 'panels', 'stairs', 'glass'] as const

/**
 * The chosen floor of the open building standing on every floor below it (a stack, like the building);
 * floors above are left off so the chosen one is visible. Door symbols and the 2D stand-ins
 * (modeledIds) belong to the chosen floor only.
 */
export function selectFloorArchitecture(records: FloorArchitectureRenderData[] | undefined, context: { active: boolean; buildingId?: string }, floor: number, pitched: boolean): StackedFloorArchitecture | undefined {
  if (!pitched || !context.active || !context.buildingId) return undefined
  const own = records?.filter(record => record.buildingId === context.buildingId) ?? []
  const chosen = own.find(record => record.floor === floor)
  if (!chosen) return undefined
  const heightOf = (record: FloorArchitectureRenderData) => Number.isFinite(record.elevation) ? record.elevation : record.floor
  const stack = own.filter(record => record === chosen || heightOf(record) < heightOf(chosen)).sort((a, b) => heightOf(a) - heightOf(b))
  const merged = {
    ...chosen,
    stackElevations: stack.map(record => Number.isFinite(record.elevation) ? record.elevation : 0),
    stackFaces: stack.map(record => record.floorFaces ?? []),
    stackWalls: stack.map(record => record.walls),
  } as StackedFloorArchitecture
  for (const kind of stackKinds) merged[kind] = { type: 'FeatureCollection', features: stack.flatMap(record => record[kind]?.features ?? []) } as typeof chosen[typeof kind]
  return merged
}
export function floorArchitectureFallback<T extends { id: string; buildingId: string; floor: number }>(records: T[], architecture: FloorArchitectureRenderData | undefined, kind: keyof FloorArchitectureRenderData['modeledIds']): T[] {
  return architecture ? records.filter(record => record.buildingId !== architecture.buildingId || record.floor !== architecture.floor || !architecture.modeledIds[kind].includes(record.id)) : records
}
const kinds = stackKinds
const colors = { walls: '#cbd5e1', frames: '#64748b', panels: '#a88463', stairs: '#94a3b8', glass: '#7dd3fc' }
/** The open floor's own floor: an opaque slab over the whole outline (owner 2026-11-14: never see the ground
 * under a floor). A 30 cm floor on top of the floor level; its base reaches down into the ground. */
const FLOOR_SLAB_TOP_M = 0.3
const FLOOR_SLAB_COLOR = '#e9ebee'
const layerKinds = ['floor', ...kinds, 'highlight'] as const
const HIGHLIGHT_COLOR = '#2563eb'
type LayerKind = (typeof layerKinds)[number]
export interface FloorArchitectureLayerProps {
  map: maplibregl.Map | null
  architecture?: FloorArchitectureRenderData
  /** On 3D terrain: the campus ground and the building's floor height, so every piece stands level. */
  level?: { ground: (p: { lat: number; lng: number }) => number; floorM: number }
  /** The open floor's areas (the building outline, its rooms and hallways): the floor slab covers them all. */
  floorAreas?: ReadonlyArray<ReadonlyArray<{ lat: number; lng: number }>>
  /** The picked room: a blue patch on top of its floor (its floor's height above the building base). */
  highlight?: { ring: ReadonlyArray<{ lat: number; lng: number }>; elevation: number }
}

type Pt = [number, number]
const ringArea = (ring: Pt[]) => Math.abs(ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1] }, 0)) / 2
function hull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Pt[] = [], upper: Pt[] = []
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p) }
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p) }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/**
 * Where the floor plan's walls stand past the building outline, the slab also covers what the walls enclose
 * (their outer hull) — only for a roughly box-shaped building, so an L-shaped one never gets floor in its notch.
 */
function wallHullArea(outline: ReadonlyArray<{ lat: number; lng: number }> | undefined, walls: GeoJSON.FeatureCollection | undefined): Array<{ lat: number; lng: number }> | null {
  if (!outline || outline.length < 3 || !walls?.features.length) return null
  const outlinePts = outline.map((p) => [p.lng, p.lat] as Pt)
  const outlineHull = hull(outlinePts)
  if (ringArea(outlinePts) < 0.9 * ringArea(outlineHull)) return null
  const pts: Pt[] = [...outlinePts]
  for (const f of walls.features) {
    const g = f.geometry
    const polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []
    for (const poly of polys) for (const p of poly[0] ?? []) pts.push([p[0], p[1]])
  }
  const all = hull(pts)
  if (ringArea(all) <= ringArea(outlineHull) * (1 + 1e-9)) return null
  return all.map(([lng, lat]) => ({ lat, lng }))
}

function highlightPatch(highlight: FloorArchitectureLayerProps['highlight']): GeoJSON.FeatureCollection {
  if (!highlight || highlight.ring.length < 3) return { type: 'FeatureCollection', features: [] }
  const ring = highlight.ring.map((p) => [p.lng, p.lat])
  const [first, last] = [ring[0], ring[ring.length - 1]]
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first])
  const top = highlight.elevation + FLOOR_SLAB_TOP_M
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { base: top, height: top + 0.06 }, geometry: { type: 'Polygon', coordinates: [ring] } }] }
}

/** One slab per stacked floor at its height; the lowest one reaches down into the ground. */
/**
 * A floor's whole plate (rooms and open hallways): the area its own walls span, for a roughly box-shaped
 * building; null for an L-shaped one (its notch must stay open) or a floor without walls.
 */
function floorPlate(outline: ReadonlyArray<{ lat: number; lng: number }> | undefined, walls: GeoJSON.FeatureCollection | undefined): Array<{ lat: number; lng: number }> | null {
  if (!outline || outline.length < 3 || !walls?.features.length) return null
  const outlinePts = outline.map((p) => [p.lng, p.lat] as Pt)
  if (ringArea(outlinePts) < 0.9 * ringArea(hull(outlinePts))) return null
  const pts: Pt[] = []
  for (const f of walls.features) {
    const g = f.geometry
    const polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []
    for (const poly of polys) for (const p of poly[0] ?? []) pts.push([p[0], p[1]])
  }
  const plate = hull(pts)
  return plate.length >= 3 ? plate.map(([lng, lat]) => ({ lat, lng })) : null
}

function floorSlab(areas: FloorArchitectureLayerProps['floorAreas'], walls?: GeoJSON.FeatureCollection, elevations: number[] = [0], faces: Array<Array<Array<{ lat: number; lng: number }>>> = [], levelWalls: GeoJSON.FeatureCollection[] = []): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  const toWalls = wallHullArea(areas?.[0], walls)
  const levels = elevations.length ? elevations : [0]
  levels.forEach((elevation, index) => {
    // A floor's slab is the spaces its own walls enclose, so it never shows floor outside that floor's walls;
    // a floor without walls falls back to the outline (and the open floor's rooms).
    const own = faces[index] ?? []
    const plate = floorPlate(areas?.[0], levelWalls[index])
    const levelAreas = own.length || plate ? [...(plate ? [plate] : []), ...own] : [...(areas ?? []), ...(toWalls ? [toWalls] : [])]
    for (const area of levelAreas) {
      if (area.length < 3) continue
      const ring = area.map((p) => [p.lng, p.lat])
      const [first, last] = [ring[0], ring[ring.length - 1]]
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first])
      const base = index === 0 ? -50 : elevation
      features.push({ type: 'Feature', properties: { base, height: elevation + FLOOR_SLAB_TOP_M }, geometry: { type: 'Polygon', coordinates: [ring] } })
    }
  })
  return { type: 'FeatureCollection', features }
}

/** All polygons arrive in world coordinates; extrusion heights stay in meters. */
export function FloorArchitectureLayer({ map, architecture, level, floorAreas, highlight }: FloorArchitectureLayerProps) {
  useEffect(() => {
    if (!map) return
    // The ground MapLibre lifts each piece by is its own terrain (tiles at the current detail); the campus
    // sampler is the fallback before the terrain is up.
    const groundAt = (p: { lat: number; lng: number }) => {
      let e: number | null | undefined
      try { e = map.getTerrain?.() ? map.queryTerrainElevation?.([p.lng, p.lat]) : null } catch { e = null }
      return typeof e === 'number' && Number.isFinite(e) ? e : level!.ground(p)
    }
    const empty = { type: 'FeatureCollection' as const, features: [] }
    const shaped = () => {
      const out = {} as Record<LayerKind, GeoJSON.FeatureCollection>
      for (const kind of layerKinds) {
        const data = kind === 'highlight' ? highlightPatch(highlight) : !architecture ? empty : kind === 'floor' ? floorSlab(floorAreas, architecture.walls, (architecture as Partial<StackedFloorArchitecture>).stackElevations, (architecture as Partial<StackedFloorArchitecture>).stackFaces, (architecture as Partial<StackedFloorArchitecture>).stackWalls) : architecture[kind]
        out[kind] = level && architecture ? levelOnGround(data, groundAt, level.floorM) : data
      }
      return out
    }
    let appliedKey = ''
    const keyOf = (data: ReturnType<typeof shaped>) => level ? layerKinds.map(k => data[k].features.map(f => Math.round(Number(f.properties?.base) * 20)).join(',')).join('|') : ''
    const sync = () => {
      if (!styleReady(map)) return
      const shapedData = shaped()
      appliedKey = keyOf(shapedData)
      for (const kind of layerKinds) {
        const id = `floor-architecture-${kind}`
        const data = shapedData[kind]
        const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined
        if (source) source.setData(data)
        else map.addSource(id, { type: 'geojson', data })
        if (!map.getLayer(id)) map.addLayer({ id, source: id, type: 'fill-extrusion', paint: {
          'fill-extrusion-color': kind === 'floor' ? FLOOR_SLAB_COLOR : kind === 'highlight' ? HIGHLIGHT_COLOR : doorExtrusionColor(colors[kind]), 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': kind === 'glass' ? 0.3 : kind === 'highlight' ? 0.85 : 1,
        } })
      }
      syncOpeningSymbolLayers(map, architecture?.symbols, true)
      // Room names go above the 2.5D floor, so the floor never covers them.
      try { if (architecture && map.getLayer(ROOM_LABELS_LAYER)) map.moveLayer(ROOM_LABELS_LAYER) } catch { /* map removed */ }
    }
    // Terrain detail changes as the camera moves; re-level only when a piece would actually move (5 cm).
    const onIdle = () => {
      if (!level || !architecture || !styleReady(map)) return
      const shapedData = shaped()
      const key = keyOf(shapedData)
      if (key === appliedKey) return
      appliedKey = key
      for (const kind of layerKinds) (map.getSource(`floor-architecture-${kind}`) as maplibregl.GeoJSONSource | undefined)?.setData(shapedData[kind])
    }
    map.on('idle', onIdle)
    sync()
    map.on('style.load', sync)
    const onSourceData = () => { if (layerKinds.some(kind => !map.getSource(`floor-architecture-${kind}`) || !map.getLayer(`floor-architecture-${kind}`))) sync() }
    map.on('sourcedata', onSourceData)
    map.on('resize', sync)
    return () => {
      map.off('idle', onIdle)
      map.off('style.load', sync)
      map.off('sourcedata', onSourceData)
      map.off('resize', sync)
      try {
        for (const id of OPENING_SYMBOL_LAYER_IDS) { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id) }
        for (const kind of [...layerKinds].reverse()) { const id = `floor-architecture-${kind}`; if (map.getLayer(id)) map.removeLayer(id) }
        for (const kind of layerKinds) { const id = `floor-architecture-${kind}`; if (map.getSource(id)) map.removeSource(id) }
      } catch { /* the map was already removed (leaving the page) */ }
    }
  }, [map, architecture, level, floorAreas, highlight])

  // While a floor of a building is shown, open that building up: hide its shell and its terrain block,
  // so the walls, doors, windows and stairs inside are visible. Other buildings stay as they are.
  const openBuildingId = architecture?.buildingId
  useEffect(() => {
    if (!map || !openBuildingId) return
    const apply = () => {
      try {
        if (map.getLayer(SHELL_LAYER)) map.setFilter(SHELL_LAYER, ['!=', ['get', 'id'], openBuildingId])
        if (map.getLayer(SLAB_LAYER)) map.setFilter(SLAB_LAYER, ['!=', ['get', 'buildingId'], openBuildingId])
      } catch { /* map removed */ }
    }
    apply()
    // The shell and site layers may be created after this one (terrain campuses load late).
    map.on('sourcedata', apply)
    return () => {
      map.off('sourcedata', apply)
      try {
        if (map.getLayer(SHELL_LAYER)) map.setFilter(SHELL_LAYER, null)
        if (map.getLayer(SLAB_LAYER)) map.setFilter(SLAB_LAYER, null)
      } catch { /* map removed */ }
    }
  }, [map, openBuildingId])
  return null
}

/** The translucent building shell (BuildingLayer) and the solid terrain block (SiteLayers). */
const SHELL_LAYER = 'buildings-extrusion'
/** RoomLayer's room names. */
const ROOM_LABELS_LAYER = 'rooms-labels'
const SLAB_LAYER = 'site-slabs'
