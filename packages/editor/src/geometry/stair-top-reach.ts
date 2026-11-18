import { buildStairTopVolumes, stairFlightFloor, stairLandingExitEdge, stairRise, type StairLandingExit, type Building, type LocalCoord, type Staircase } from '@navi/core'
import type { Wall } from '@navi/core'
import { deriveRooms } from './room-derivation'
import { floorBackboneEdges } from './floor-connections'

/** How close a stair's top platform must be to a wall's face to land against it, metres. */
export const AGAINST_WALL_M = 0.15

/**
 * The wall an OUTSIDE stair's top platform lands against (2026-11-17), with the stretch of it the platform covers
 * (metres from the wall start). Undefined for a platform inside the building's walls or not against any wall.
 */
export function wallAgainstLanding(walls: readonly Wall[], landing: ReadonlyArray<{ x: number; y: number }>, exitEdge: number): { wall: Wall; t0: number; t1: number } | undefined {
  if (walls.length === 0 || landing.length < 3) return undefined
  const centre = { x: landing.reduce((s, p) => s + p.x, 0) / landing.length, y: landing.reduce((s, p) => s + p.y, 0) / landing.length }
  const faces = deriveRooms(walls.map((w) => ({ id: w.id, sourceWallId: w.id, start: w.start, end: w.end })), [])
  if (faces.some((f) => inside(centre, f.polygon.points))) return undefined
  const contact = [landing[exitEdge], landing[(exitEdge + 1) % landing.length]]
  let best: { wall: Wall; t0: number; t1: number; gap: number } | undefined
  for (const wall of walls) {
    const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y, len = Math.hypot(dx, dy)
    if (!(len > 0)) continue
    const ux = dx / len, uy = dy / len
    const along = contact.map((p) => (p.x - wall.start.x) * ux + (p.y - wall.start.y) * uy)
    const across = contact.map((p) => Math.abs(-(p.x - wall.start.x) * uy + (p.y - wall.start.y) * ux))
    const t0 = Math.max(0, Math.min(...along)), t1 = Math.min(len, Math.max(...along))
    const gap = Math.max(...across) - (wall.thickness ?? 0.2) / 2
    if (t1 - t0 < 0.5 || gap > AGAINST_WALL_M) continue
    if (!best || gap < best.gap) best = { wall, t0, t1, gap }
  }
  return best && { wall: best.wall, t0: best.t0, t1: best.t1 }
}

/**
 * How close the top landing must come to the upper floor's walkable area, metres. Owner 2026-11-16: a stair 1.15 m
 * off the wall "is just floating there" — the top must touch the floor, so only a small tolerance (half a wall).
 */
export const STAIR_TOP_REACH_M = 0.15

type P = { x: number; y: number }
export type StairTopReach =
  | { ok: true; targetId: string; point: LocalCoord; exit: StairLandingExit }
  | { ok: false; reason: 'no-to-floor' | 'no-walkable' | 'no-opening' }

const segDist = (p: P, a: P, b: P): number => {
  const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy
  const t = len > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}
const inside = (p: P, ring: readonly P[]): boolean => {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}
const edges = (ring: readonly P[], closed: boolean): Array<[P, P]> =>
  ring.slice(0, closed ? ring.length : ring.length - 1).map((a, i) => [a, ring[(i + 1) % ring.length]] as [P, P])
/** Check a usable span centered on the route anchor, so a touching corner cannot pass. */
function exitGap(a: P, b: P, shape: readonly P[], closed: boolean, slack: number): number {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  if (!(length > 0)) return Infinity
  const sampleOffset = Math.min(0.25 / length, 0.5)
  const boundary = edges(shape, closed)
  return Math.max(...[0.5 - sampleOffset, 0.5, 0.5 + sampleOffset].map(t => {
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    if (closed && inside(p, shape)) return 0
    const d = boundary.reduce((best, [start, end]) => Math.min(best, segDist(p, start, end)), Infinity)
    return Math.max(0, d - slack)
  }))
}

/**
 * Does a stair's top reach the floor it climbs to? (owner 2026-11-16: no doors — the top lands on the upper floor's
 * walkable floor.) Walkable = rooms and balconies drawn there, spaces its walls enclose, and its hallways (by their
 * width). The top landing reaches when it touches one of them (within STAIR_TOP_REACH_M).
 */
export function stairTopReach(building: Building, stair: Staircase, allowUncutWall = false): StairTopReach {
  const from = stairFlightFloor(stair)
  const to = stair.toLevel > from ? building.floors.find((f) => f.level === stair.toLevel) : undefined
  const flight = stair.levels[from]
  if (!to || !flight) return { ok: false, reason: 'no-to-floor' }
  const top = buildStairTopVolumes([{ id: stair.id, ...flight, rotation: flight.rotation ?? 0, height: stairRise(stair, building.floors), fromLevel: from }], 0).landings.features[0]
  if (!top) return { ok: false, reason: 'no-walkable' }
  const landing: P[] = top.geometry.coordinates[0].slice(0, -1).map(([x, y]) => ({ x, y }))
  const candidates: Array<{ id: string; shape: P[]; closed: boolean; slack: number }> = []
  for (const room of to.rooms ?? []) if ((room.polygon?.points?.length ?? 0) >= 3) candidates.push({ id: room.id, shape: room.polygon.points, closed: true, slack: 0 })
  const walls = to.walls ?? []
  if (walls.length) {
    deriveRooms(walls.map((w) => ({ id: w.id, sourceWallId: w.id, start: w.start, end: w.end })), []).forEach((face, i) => {
      candidates.push({ id: `${to.id}:space:${i}`, shape: face.polygon.points, closed: true, slack: 0 })
    })
  }
  for (const hall of to.hallways ?? []) {
    const points = hall.polyline?.points ?? []
    if (points.length >= 2) candidates.push({ id: hall.id, shape: points, closed: false, slack: (hall.width ?? 0) / 2 })
  }
  if (to.routeNetwork?.edges?.length) {
    const routeNodes = new Map(to.routeNetwork?.nodes.map(node => [node.id, node.position]))
    for (const edge of floorBackboneEdges(building, to)) {
      if (edge.type !== 'walk') continue
      const from = routeNodes.get(edge.from)
      const end = routeNodes.get(edge.to)
      if (from && end && [from.x, from.y, end.x, end.y].every(Number.isFinite)) {
        candidates.push({ id: edge.id, shape: [from, end], closed: false, slack: 0 })
      }
    }
  }
  const sides: StairLandingExit[] = flight.landingExit ? [flight.landingExit] : ['front', 'left', 'right']
  const ring = top.geometry.coordinates[0]
  let best: { id: string; d: number; edge: number; exit: StairLandingExit; wall?: ReturnType<typeof wallAgainstLanding> } | undefined
  for (const exit of sides) {
    const edge = stairLandingExitEdge(ring, exit)
    const a = landing[edge], b = landing[(edge + 1) % 4]
    const wall = wallAgainstLanding(walls, landing, edge)
    for (const candidate of candidates) {
      const d = exitGap(a, b, candidate.shape, candidate.closed, candidate.slack)
      if (!best || d < best.d - 1e-6 || (Math.abs(d - best.d) <= 1e-6 && wall && !best.wall)) {
        best = { id: candidate.id, d, edge, exit, wall }
      }
    }
  }
  if (!best || best.d > STAIR_TOP_REACH_M) return { ok: false, reason: 'no-walkable' }
  const against = best.wall
  if (against && !allowUncutWall && !(to.openings ?? []).some(o => o.type === 'door' && (o.sillHeight ?? 0) <= 0.05
      && o.wallId === against.wall.id && Math.min(o.offset + o.width, against.t1) - Math.max(o.offset, against.t0) >= 0.5)) {
    return { ok: false, reason: 'no-opening' }
  }
  const a = landing[best.edge], b = landing[(best.edge + 1) % 4]
  return { ok: true, targetId: best.id, exit: best.exit, point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
}
