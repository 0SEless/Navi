import { buildStairTopVolumes, stairFlightFloor, stairRise, type Building, type LocalCoord, type Staircase } from '@navi/core'
import { deriveRooms } from './room-derivation'

/**
 * How close the top landing must come to the upper floor's walkable area, metres. Owner 2026-11-16: a stair 1.15 m
 * off the wall "is just floating there" — the top must touch the floor, so only a small tolerance (half a wall).
 */
export const STAIR_TOP_REACH_M = 0.15

type P = { x: number; y: number }
export type StairTopReach =
  | { ok: true; targetId: string; point: LocalCoord }
  | { ok: false; reason: 'no-to-floor' | 'no-walkable' }

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
/** Gap between two shapes (0 when they overlap); `closed` = polygon, else a polyline. */
function gap(a: readonly P[], b: readonly P[], bClosed: boolean): number {
  if (bClosed && a.some((p) => inside(p, b))) return 0
  if (a.length > 2 && b.some((p) => inside(p, a))) return 0
  let best = Infinity
  for (const p of a) for (const [s, t] of edges(b, bClosed)) best = Math.min(best, segDist(p, s, t))
  for (const p of b) for (const [s, t] of edges(a, true)) best = Math.min(best, segDist(p, s, t))
  return best
}

/**
 * Does a stair's top reach the floor it climbs to? (owner 2026-11-16: no doors — the top lands on the upper floor's
 * walkable floor.) Walkable = rooms and balconies drawn there, spaces its walls enclose, and its hallways (by their
 * width). The top landing reaches when it touches one of them (within STAIR_TOP_REACH_M).
 */
export function stairTopReach(building: Building, stair: Staircase): StairTopReach {
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
  let best: { id: string; d: number } | undefined
  for (const c of candidates) {
    const d = Math.max(0, gap(landing, c.shape, c.closed) - c.slack)
    if (!best || d < best.d) best = { id: c.id, d }
  }
  if (!best || best.d > STAIR_TOP_REACH_M) return { ok: false, reason: 'no-walkable' }
  const centre = { x: landing.reduce((s, p) => s + p.x, 0) / landing.length, y: landing.reduce((s, p) => s + p.y, 0) / landing.length }
  return { ok: true, targetId: best.id, point: centre }
}
