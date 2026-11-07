// How an outdoor stair or ramp joins the route network (2026-11-07): the route at its low end, and at its high end
// either the entrance on the floor it reaches (with that entrance's indoor route node) or another route. Pure: the map
// editor shows this as the suggestion, the owner confirms (or picks another route), and the editor writes it.
import type { LatLng, LocalCoord } from '../types/coordinates'
import type { CampusDocument } from '../types/document'
import type { Road } from '../types/entities'
import { ROUTE_NETWORK_THRESHOLDS } from '../route-network/definitions'
import { resolveStructureEnds } from './compose'
import { toLatLng, toLocal } from './grid'
import { structureSampler } from './site-artifact'
import { structureCentreline } from './structure-marking'
import type { TerrainGrid } from './types'

/** Same reach as starting a floor route at an entrance (ENTRANCE_ROUTE_START_TOLERANCE_METERS). */
export const STAIR_ENTRANCE_REACH_M = 3

export type StairEndRoute = {
  roadId: string
  kind: 'road-endpoint' | 'road-segment' | 'existing-junction'
  position: LatLng
  junctionId?: string
}
export type StairTop =
  | { kind: 'entrance'; buildingId: string; floorId: string; entranceId: string; indoorRouteNodeId: string; replacesRoadId?: string }
  | { kind: 'route'; route: StairEndRoute }
  | { kind: 'missing'; reason: 'entrance' | 'indoor-route'; buildingId: string; floorId: string }
export interface StairConnection {
  structureId: string
  /** Bottom → top, one point per metre. */
  centreline: LatLng[]
  bottom: StairEndRoute | null
  top: StairTop | null
}

export interface StairConnectionOptions {
  /** Building-local metres on a floor → map position (the editor's coordinate transformer). */
  toWorld(buildingId: string, level: number, local: LocalCoord): LatLng | null
}

/** The road the editor made for this stair (routing.structureId), if any. */
export function stairRouteOf(doc: CampusDocument, structureId: string): Road | null {
  return (doc.roads ?? []).find((road) => road.routing?.structureId === structureId) ?? null
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

/** The point of `road` nearest to `at`, as a connection candidate (junction or endpoint when within the snap radius). */
export function routeCandidate(doc: CampusDocument, grid: TerrainGrid, road: Road, at: LatLng): { candidate: StairEndRoute; distance: number } | null {
  const pts = (road.polyline?.points ?? []).map((p) => toLocal(grid, p))
  if (pts.length < 2) return null
  const q = toLocal(grid, at)
  let best: { p: { x: number; y: number }; d: number } | null = null
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / len2)) : 0
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    const d = dist(p, q)
    if (!best || d < best.d) best = { p, d }
  }
  if (!best) return null
  const snap = ROUTE_NETWORK_THRESHOLDS.snapRadiusMeters
  for (const junction of doc.roadJunctions ?? []) {
    if (!junction.roadIds.includes(road.id)) continue
    if (dist(toLocal(grid, junction.position), best.p) <= snap) {
      return { candidate: { roadId: road.id, kind: 'existing-junction', position: junction.position, junctionId: junction.id }, distance: best.d }
    }
  }
  for (const end of [pts[0], pts[pts.length - 1]]) {
    if (dist(end, best.p) <= snap) return { candidate: { roadId: road.id, kind: 'road-endpoint', position: toLatLng(grid, end) }, distance: best.d }
  }
  return { candidate: { roadId: road.id, kind: 'road-segment', position: toLatLng(grid, best.p) }, distance: best.d }
}

/** null when the stair is unknown or an end cannot be resolved. */
export function suggestStairConnection(doc: CampusDocument, structureId: string, opts: StairConnectionOptions): StairConnection | null {
  const structure = (doc.structures ?? []).find((s) => s.id === structureId)
  const sampler = structureSampler(doc)
  if (!structure || !sampler) return null
  const ends = resolveStructureEnds(doc, sampler, structure)
  const line = structureCentreline(doc, structure)
  if (!ends || !line) return null
  // The high end is the top; a level stair counts its slab end (else its start) as the top.
  const startIsTop = ends.start.h > ends.end.h || (ends.start.h === ends.end.h && structure.end.kind !== 'slab')
  const top = startIsTop ? structure.start : structure.end
  const bottom = startIsTop ? structure.end : structure.start
  const centreline = startIsTop ? [...line].reverse() : line
  const grid = sampler.grid

  const onRoad = (end: typeof bottom, at: LatLng): StairEndRoute | null => {
    if (end.kind !== 'road') return null
    const road = doc.roads.find((r) => r.id === end.roadId)
    if (!road) return null
    const found = routeCandidate(doc, grid, road, at)
    // The end lies on the road's surface: accept anything within half its width (plus the snap radius).
    return found && found.distance <= road.width / 2 + ROUTE_NETWORK_THRESHOLDS.snapRadiusMeters ? found.candidate : null
  }

  let topChoice: StairTop | null = null
  const topAt = centreline[centreline.length - 1]
  if (top.kind === 'road') {
    const route = onRoad(top, topAt)
    topChoice = route ? { kind: 'route', route } : null
  } else if (top.kind === 'slab') {
    const building = doc.buildings.find((b) => b.id === top.buildingId)
    const floor = building?.floors.find((f) => f.id === top.floorId)
    if (building && floor) {
      const here = toLocal(grid, topAt)
      let entrance: { id: string; position: LocalCoord; d: number } | null = null
      for (const e of floor.entrances ?? []) {
        const world = opts.toWorld(building.id, floor.level, e.position)
        if (!world) continue
        const d = dist(toLocal(grid, world), here)
        if (d <= STAIR_ENTRANCE_REACH_M && (!entrance || d < entrance.d)) entrance = { id: e.id, position: e.position, d }
      }
      if (!entrance) topChoice = { kind: 'missing', reason: 'entrance', buildingId: building.id, floorId: floor.id }
      else {
        const nodes = floor.routeNetwork?.nodes ?? []
        const existing = (floor.entranceAccess ?? []).find((a) => a.entranceId === entrance!.id)
        let nodeId = existing && nodes.some((n) => n.id === existing.indoorRouteNodeId) ? existing.indoorRouteNodeId : null
        if (!nodeId) {
          let best: { id: string; d: number } | null = null
          for (const n of nodes) {
            const d = dist(n.position, entrance.position)
            if (d <= STAIR_ENTRANCE_REACH_M && (!best || d < best.d)) best = { id: n.id, d }
          }
          nodeId = best?.id ?? null
        }
        topChoice = nodeId
          ? {
              kind: 'entrance', buildingId: building.id, floorId: floor.id, entranceId: entrance.id, indoorRouteNodeId: nodeId,
              ...(existing?.outdoorRouteId ? { replacesRoadId: existing.outdoorRouteId } : {}),
            }
          : { kind: 'missing', reason: 'indoor-route', buildingId: building.id, floorId: floor.id }
      }
    }
  }

  return { structureId, centreline, bottom: onRoad(bottom, centreline[0]), top: topChoice }
}
