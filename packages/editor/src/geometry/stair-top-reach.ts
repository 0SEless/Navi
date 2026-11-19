import { stairTopShape, stairFlightFloor, stairLandingExitEdge, stairRise, type StairLandingExit, type Building, type LocalCoord, type Staircase } from '@navi/core'
import type { Wall } from '@navi/core'
import { deriveRooms } from './room-derivation'
import { floorBackboneEdges, floorDoorSpans } from './floor-connections'

/** How close a stair's top platform must be to a wall's face to land against it, metres. */
export const AGAINST_WALL_M = 0.15

/**
 * The wall an OUTSIDE stair's top platform lands against (2026-11-17), with the stretch of it the platform covers
 * (metres from the wall start). Undefined for a platform inside the building's walls or not against any wall.
 */
export function wallAgainstLanding(walls: readonly Wall[], landing: ReadonlyArray<{ x: number; y: number }>, exitEdge: number, includeInterior = false): { wall: Wall; t0: number; t1: number } | undefined {
  if (walls.length === 0 || landing.length < 3) return undefined
  const centre = { x: landing.reduce((s, p) => s + p.x, 0) / landing.length, y: landing.reduce((s, p) => s + p.y, 0) / landing.length }
  const faces = deriveRooms(walls.map((w) => ({ id: w.id, sourceWallId: w.id, start: w.start, end: w.end })), [])
  if (!includeInterior && faces.some((f) => inside(centre, f.polygon.points))) return undefined
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
  | { ok: true; targetId: string; point: LocalCoord; exit: StairLandingExit; span: Span; openingId?: string; wall?: NonNullable<ReturnType<typeof wallAgainstLanding>> & { offset: number } }
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
function wallCoversPoint(wall: Wall, point: P): boolean {
  const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y
  const len = Math.hypot(dx, dy)
  const t = ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / len
  return t >= -0.25 && t <= len + 0.25
}

/** Only a route crossing the actual pad edge away from its corners counts. */
function routeCrossing(a: P, b: P, interior: P, from: P, to: P): P | undefined {
  const dx = b.x - a.x, dy = b.y - a.y
  const rx = to.x - from.x, ry = to.y - from.y
  const det = dx * ry - dy * rx
  if (Math.abs(det) < 1e-9) return
  const x = from.x - a.x, y = from.y - a.y
  const along = (x * ry - y * rx) / det
  const route = (x * dy - y * dx) / det
  const interiorSide = dx * (interior.y - a.y) - dy * (interior.x - a.x)
  const fromSide = dx * (from.y - a.y) - dy * (from.x - a.x)
  const toSide = dx * (to.y - a.y) - dy * (to.x - a.x)
  if (fromSide * interiorSide >= -1e-9 && toSide * interiorSide >= -1e-9) return
  const margin = 0.25 / Math.hypot(dx, dy)
  // An authored endpoint on a rotated edge can round just outside the segment.
  if (along < margin || along > 1 - margin || route < -1e-9 || route > 1 + 1e-9) return
  return { x: a.x + along * dx, y: a.y + along * dy }
}

/** Check a usable span centered on the route anchor, so a touching corner cannot pass. */
function exitGap(a: P, b: P, shape: readonly P[], closed: boolean, slack: number): number {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const sampleOffset = length > 0 ? Math.min(0.25 / length, 0.5) : 0
  const boundary = edges(shape, closed)
  return Math.max(...[0.5 - sampleOffset, 0.5, 0.5 + sampleOffset].map(t => {
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    if (closed && inside(p, shape)) return 0
    const d = boundary.reduce((best, [start, end]) => Math.min(best, segDist(p, start, end)), Infinity)
    return Math.max(0, d - slack)
  }))
}

type Span = readonly [number, number]

function openingOffset(wall: Wall, point: P) {
  const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y
  return ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / Math.hypot(dx, dy)
}

function intervalOnEdge(start: number, end: number, a: number, b: number): Span | undefined {
  if (!(end > start) || Math.abs(b - a) < 1e-6) return
  const t0 = (start - a) / (b - a), t1 = (end - a) / (b - a)
  const low = Math.max(0, Math.min(t0, t1)), high = Math.min(1, Math.max(t0, t1))
  if (high > low) return [low, high]
}

/** Expand only within the connected hallway contact containing the route anchor. */
function expandContact(bounds: Span, center: number, length: number, touches: (t: number) => boolean): Span {
  const step = Math.max(0.05 / length, 1 / 1200)
  const extend = (limit: number, direction: number) => {
    let t = center
    while (t !== limit) {
      const next = direction < 0 ? Math.max(limit, t - step) : Math.min(limit, t + step)
      if (!touches(next)) break
      t = next
    }
    return t
  }
  return [extend(bounds[0], -1), extend(bounds[1], 1)]
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
  const top = stairTopShape({ id: stair.id, ...flight, rotation: flight.rotation ?? 0, height: stairRise(stair, building.floors), fromLevel: from })
  if (!top) return { ok: false, reason: 'no-walkable' }
  const landing: P[] = top.landing.map(([x, y]) => ({ x, y }))
  const candidates: Array<{ id: string; shape: P[]; closed: boolean; slack: number; route?: boolean }> = []
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
        candidates.push({ id: edge.id, shape: [from, end], closed: false, slack: 0, route: true })
      }
    }
  }
  const sides: StairLandingExit[] = flight.landingExit ? [flight.landingExit] : ['front', 'left', 'right']
  type Candidate = Extract<StairTopReach, { ok: true }> & { distance: number }
  let reachable: Candidate | undefined
  let blocked: Candidate | undefined
  for (const exit of sides) {
    const edge = stairLandingExitEdge(top.landing, exit)
    const a = landing[edge], b = landing[(edge + 1) % 4]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    const at = (t: number): P => ({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })
    const fraction = (point: P) => ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / (length * length)
    const host = wallAgainstLanding(walls, landing, edge, true)
    const alongWall = host && ((p: P) => openingOffset(host.wall, p))
    const covered = host && alongWall ? intervalOnEdge(host.t0, host.t1, alongWall(a), alongWall(b)) : undefined
    for (const candidate of candidates) {
      const crossing = top.integrated && candidate.route
        ? routeCrossing(a, b, landing[(edge + 2) % 4], candidate.shape[0], candidate.shape[1]) : undefined
      const point = crossing ?? at(0.5)
      const contact = fraction(point)
      const distance = crossing ? 0 : exitGap(a, b, candidate.shape, candidate.closed, candidate.slack)
      if (distance > STAIR_TOP_REACH_M) continue
      const result = { ok: true as const, targetId: candidate.id, exit, distance }
      if (host && covered && alongWall && wallCoversPoint(host.wall, point)) {
        const wall = { ...host, offset: alongWall(point) }
        const door = floorDoorSpans(to, host.wall.id).flatMap(opening => {
          const span = intervalOnEdge(Math.max(host.t0, opening.start), Math.min(host.t1, opening.end), alongWall(a), alongWall(b))
          if (!span || (span[1] - span[0]) * length < 0.5 - 1e-6) return []
          const margin = 0.25 / length
          const anchor = Math.max(span[0] + margin, Math.min(span[1] - margin, contact))
          const next = at(anchor)
          // A drawn route alone only establishes walkable contact at its crossing.
          if (crossing && Math.abs(contact - anchor) * length > STAIR_TOP_REACH_M) return []
          if (!crossing && exitGap(at(anchor - margin), at(anchor + margin), candidate.shape, candidate.closed, candidate.slack) > STAIR_TOP_REACH_M) return []
          return [{ openingId: opening.id, span, point: next, shift: Math.abs(anchor - contact) }]
        }).sort((first, second) => first.shift - second.shift)[0]
        if (door) {
          if (!reachable || distance < reachable.distance - 1e-6) {
            reachable = { ...result, openingId: door.openingId, span: door.span, point: door.point, wall }
          }
        } else if (!blocked || distance < blocked.distance - 1e-6) {
          blocked = { ...result, point, span: covered, wall }
        }
        continue
      }
      const available: Span = !covered ? [0, 1] : contact < covered[0] ? [0, covered[0]] : [covered[1], 1]
      const margin = 0.25 / length
      const span = crossing
        ? [Math.max(available[0], contact - margin), Math.min(available[1], contact + margin)] as const
        : expandContact(available, contact, length, t => exitGap(at(t), at(t), candidate.shape, candidate.closed, candidate.slack) <= STAIR_TOP_REACH_M)
      if ((span[1] - span[0]) * length < 0.5 - 1e-6) continue
      if (!reachable || distance < reachable.distance - 1e-6) reachable = { ...result, point, span }
    }
  }
  const result = reachable ?? (allowUncutWall ? blocked : undefined)
  if (!result) return { ok: false, reason: blocked ? 'no-opening' : 'no-walkable' }
  const { distance: _distance, ...resolved } = result
  return resolved
}

export function detachedStairCutouts(building: Building, stair: Staircase, reach = stairTopReach(building, stair)) {
  const activeId = reach.ok ? reach.openingId : undefined
  return building.floors.flatMap(floor => (floor.openings ?? []).filter(opening =>
    opening.metadata?.stairId === stair.id && (floor.level !== stair.toLevel || opening.id !== activeId))
    .map(opening => ({ floor, opening })))
}
