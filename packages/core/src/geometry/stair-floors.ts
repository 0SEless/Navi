import type { Floor, Staircase, StairLevelGeometry } from '../types/entities'
import { buildStairAssetVolumes, stairTopShape, stairLandingExitEdge, type StairAssetInput, type StairTopInput } from './stair-assets'
import type { LatLng, LocalCoord } from '../types/coordinates'
import { CoordinateTransformer } from '../coordinates/transformer'

/**
 * Which floor draws a stair (2026-11-16, whole-building view). A stair set to climb To a floor has its flight on its
 * From floor and only its top (`role: 'top'`, stairwell + top landing) on the To floor. Every other level is a flight
 * drawn on its own floor, exactly as before (older multi-floor stairs). A floor without geometry draws nothing.
 */

const levelKeys = (stair: Staircase): number[] =>
  Object.keys(stair.levels ?? {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b)

/** The floor whose drawing holds the stair's flight. */
export function stairFlightFloor(stair: Staircase): number {
  const flight = levelKeys(stair).find((level) => stair.levels[level]?.role !== 'top')
  return flight ?? stair.fromLevel
}

/** Does this stair climb To a floor (its upper floor holds a top)? */
export function stairHasTop(stair: Staircase): boolean {
  return Object.values(stair.levels ?? {}).some((level) => level?.role === 'top')
}

/** Stairs whose flight is drawn on `level`. */
export function stairFlightsOnFloor(stairs: readonly Staircase[], level: number): Array<{ stair: Staircase; geometry: StairLevelGeometry }> {
  return stairs.flatMap((stair) => {
    const geometry = stair.levels?.[level]
    return geometry && geometry.role !== 'top' ? [{ stair, geometry }] : []
  })
}

/** Stairs that arrive on `level` from below: only their top is drawn there. */
export function stairTopsOnFloor(stairs: readonly Staircase[], level: number): Array<{ stair: Staircase; geometry: StairLevelGeometry; fromLevel: number }> {
  return stairs.flatMap((stair) => {
    const geometry = stair.levels?.[level]
    return geometry?.role === 'top' ? [{ stair, geometry, fromLevel: stairFlightFloor(stair) }] : []
  })
}

/** The stair's climb in metres: for a stair with a top, From to To from the floors' elevations; else its own/floor height. */
export function stairRise(stair: Staircase, floors: readonly Pick<Floor, 'level' | 'elevation' | 'height'>[]): number {
  const fromLevel = stairFlightFloor(stair)
  const from = floors.find((f) => f.level === fromLevel)
  const to = stair.toLevel > fromLevel && stairHasTop(stair) ? floors.find((f) => f.level === stair.toLevel) : undefined
  if (from && to && Number.isFinite(to.elevation - from.elevation) && to.elevation > from.elevation) return to.elevation - from.elevation
  const flight = stair.levels?.[fromLevel]
  if (flight?.height !== undefined) return flight.height
  return (flight && undesignedStairRise(flight, fromLevel, floors)) ?? from?.height ?? 3.5
}

/**
 * A stair drawn with the Stair tool (no design, no To floor, no height of its own; ASU's stairs, owner 2026-11-17)
 * on `level`: it climbs to the next floor up; on the top floor it is where the stair below arrives, so it does not
 * climb (0). Undefined for any other stair (its caller keeps its own rule).
 */
export function undesignedStairRise(geometry: Pick<StairLevelGeometry, 'drawing' | 'height'>, level: number, floors: readonly Pick<Floor, 'level' | 'elevation'>[]): number | undefined {
  if (geometry.drawing || geometry.height !== undefined) return undefined
  const here = floors.find((f) => f.level === level)
  const above = floors.filter((f) => f.level > level && Number.isFinite(f.elevation)).sort((a, b) => a.level - b.level)[0]
  if (!above) return 0
  return here && Number.isFinite(here.elevation) && above.elevation > here.elevation ? above.elevation - here.elevation : undefined
}

/**
 * A floor's stair inputs for the 2.5D builders: the flights drawn here (rise from the floors) and the stairs arriving
 * from below (built from their flight's geometry on the From floor, so the top lines up with the flight).
 */
export function floorStairInputs(stairs: readonly Staircase[], floors: readonly (Pick<Floor, 'level' | 'elevation' | 'height'> & Partial<Pick<Floor, 'walls' | 'openings'>>)[], level: number, outline?: readonly LocalCoord[]): { flights: StairAssetInput[]; tops: StairTopInput[] } {
  const elevation = floors.find(floor => floor.level === level)?.elevation
  const groundLanding = !floors.some(floor => elevation !== undefined && floor.elevation < elevation)
  const flights = stairFlightsOnFloor(stairs, level).map(({ stair, geometry }) => {
    const doorwayAt = stairDoorwayAt(stair, floors)
    // With the building outline, a stair starting outside its (upper) floor gets its entry platform (owner 2026-11-19).
    const entry = outline ? stairEntryPlatform(stair, floors, outline) : undefined
    return { id: stair.id, ...geometry, groundLanding, rotation: geometry.rotation ?? 0, height: stairRise(stair, floors), ...(stairHasTop(stair) ? { arrivalLanding: true } : {}), ...(doorwayAt ? { doorwayAt } : {}),
      ...(entry ? { entryPlatform: { ring: entry.ring, railed: entry.railed } } : {}) }
  })
  const tops = stairTopsOnFloor(stairs, level).flatMap(({ stair, geometry, fromLevel }) => {
    const flight = stair.levels?.[fromLevel]
    const doorwayAt = stairDoorwayAt(stair, floors)
    return flight ? [{ id: stair.id, ...flight, landingExit: geometry.landingExit, landingExitSpan: geometry.landingExitSpan,
      rotation: flight.rotation ?? 0, height: stairRise(stair, floors), fromLevel, ...(doorwayAt ? { doorwayAt } : {}) }] : []
  })
  return { flights, tops }
}

/**
 * Where a stair's top lands (the middle of its top landing), worked out from its flight — so the To floor's top point
 * always follows the flight when it is moved, rotated, resized or turned. Absent when the flight cannot be built.
 */
type StairFloorHeights = readonly Pick<Floor, 'level' | 'elevation' | 'height'>[]

function stairTopRing(stair: Staircase, floors: StairFloorHeights): number[][] {
  const from = stairFlightFloor(stair)
  const flight = stair.levels?.[from]
  if (!flight) return []
  return stairTopShape({ id: stair.id, ...flight, rotation: flight.rotation ?? 0, height: stairRise(stair, floors), fromLevel: from })?.landing ?? []
}

export function stairTopPosition(stair: Staircase, floors: StairFloorHeights): LocalCoord | undefined {
  const ring = stairTopRing(stair, floors)
  if (ring.length === 0) return undefined
  const exit = stair.levels[stairFlightFloor(stair)]?.landingExit ?? stair.levels[stair.toLevel]?.landingExit
  if (exit && ring.length === 4) {
    const edge = stairLandingExitEdge(ring, exit)
    const a = ring[edge], b = ring[(edge + 1) % 4]
    return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 }
  }
  return { x: ring.reduce((sum, p) => sum + p[0], 0) / ring.length, y: ring.reduce((sum, p) => sum + p[1], 0) / ring.length }
}

/** Outward direction of the selected landing edge. */
export function stairTopExitDirection(
  stair: Staircase,
  floors: StairFloorHeights,
  exit = stair.levels[stairFlightFloor(stair)]?.landingExit ?? stair.levels[stair.toLevel]?.landingExit,
): LocalCoord | undefined {
  if (!exit) return undefined
  const ring = stairTopRing(stair, floors)
  if (ring.length !== 4) return undefined
  const edge = stairLandingExitEdge(ring, exit)
  const a = ring[edge], b = ring[(edge + 1) % 4]
  const c = ring[(edge + 2) % 4], d = ring[(edge + 3) % 4]
  const x = a[0] + b[0] - c[0] - d[0], y = a[1] + b[1] - c[1] - d[1]
  const length = Math.hypot(x, y)
  return length > 0 ? { x: x / length, y: y / length } : undefined
}

/**
 * The middle of an outside stair's automatic doorway (2026-11-17): the opening on its To floor marked with its id
 * (metadata.stairId), on the wall it is cut in. Undefined for a stair without one.
 */
export function stairDoorwayAt(stair: Staircase, floors: readonly Partial<Pick<Floor, 'level' | 'walls' | 'openings'>>[]): LocalCoord | undefined {
  if (!stairHasTop(stair)) return undefined
  const to = floors.find((f) => f.level === stair.toLevel)
  const opening = to?.openings?.find((o) => o.metadata?.stairId === stair.id)
  const wall = opening && to?.walls?.find((w) => w.id === opening.wallId)
  if (!opening || !wall) return undefined
  const len = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
  if (!(len > 0)) return undefined
  const t = (opening.offset + opening.width / 2) / len
  return { x: wall.start.x + (wall.end.x - wall.start.x) * t, y: wall.start.y + (wall.end.y - wall.start.y) * t }
}

/** Furthest gap an entry platform bridges between a stair's foot and its floor, metres. */
const ENTRY_REACH_M = 4
/** Shortest entry platform, metres (room to stand before the first step). */
const MIN_ENTRY_DEPTH_M = 1
/** An edge this close to the floor's outline touches it (no railing there; you walk on). */
const ENTRY_TOUCH_M = 0.1

export interface StairEntryPlatform {
  /** Four corners, building-local; edge 0 is the stair's bottom step. */
  ring: LocalCoord[]
  /** Per edge (ring[i] → ring[i + 1]): true where the platform is open to the outside and gets a railing. */
  railed: boolean[]
  /** The edge where the platform meets the floor, or null when it could not reach the floor. */
  contact: [LocalCoord, LocalCoord] | null
}

/**
 * The building outline in building-local metres, framed as the editor and the compiler frame it (origin = the average
 * of all footprint points, the building's rotation in degrees).
 */
export function buildingOutlineLocal(building: { id: string; footprint?: unknown; rotation?: number }): LocalCoord[] {
  const raw = building.footprint as { points?: LatLng[] } | LatLng[] | undefined
  const points = (Array.isArray(raw) ? raw : raw?.points ?? []).filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
  if (points.length < 3) return []
  const origin = { lat: points.reduce((s, p) => s + p.lat, 0) / points.length, lng: points.reduce((s, p) => s + p.lng, 0) / points.length }
  const transformer = new CoordinateTransformer()
  transformer.registerBuilding({ buildingId: building.id, origin, rotation: building.rotation ?? 0 })
  const local = points.map((p) => transformer.worldToBuildingLocal(p, building.id)).filter((p): p is LocalCoord => !!p)
  const [first, last] = [local[0], local[local.length - 1]]
  return local.length > 3 && Math.hypot(first.x - last.x, first.y - last.y) < 1e-6 ? local.slice(0, -1) : local
}

const insideRing = (p: LocalCoord, ring: readonly LocalCoord[]): boolean => {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}
const distanceToRing = (p: LocalCoord, ring: readonly LocalCoord[]): number => ring.reduce((best, a, i) => {
  const b = ring[(i + 1) % ring.length], dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy
  const t = len > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0
  return Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
}, Infinity)
/** On the floor: inside the outline, or on its edge. */
const onFloor = (p: LocalCoord, outline: readonly LocalCoord[]) => insideRing(p, outline) || distanceToRing(p, outline) <= 0.01

/**
 * Owner 2026-11-19: a stair whose bottom step is outside its floor (an upper floor's corridor edge) gets an entry
 * platform at its foot, in the stair's own look, filling the gap to the floor, with railings on its open sides.
 * Ground-floor stairs start on the ground and get none. Undefined when no platform is needed.
 */
export function stairEntryPlatform(stair: Staircase, floors: readonly (Pick<Floor, 'level' | 'elevation' | 'height'> & Partial<Pick<Floor, 'walls' | 'openings'>>)[], outline: readonly LocalCoord[]): StairEntryPlatform | undefined {
  if (outline.length < 3 || floors.length === 0) return undefined
  const level = stairFlightFloor(stair)
  if (level <= Math.min(...floors.map((f) => f.level))) return undefined
  const flight = floorStairInputs([stair], floors, level).flights[0]
  const step = flight && buildStairAssetVolumes([flight], 0).collection.features.find((f) => f.properties?.partType === 'step')
  const ring = step?.geometry.coordinates[0] as number[][] | undefined
  if (!ring || ring.length < 4) return undefined
  const A = { x: ring[0][0], y: ring[0][1] }, B = { x: ring[1][0], y: ring[1][1] }
  const foot = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }
  const upMid = { x: (ring[3][0] + ring[2][0]) / 2, y: (ring[3][1] + ring[2][1]) / 2 }
  const upLen = Math.hypot(upMid.x - foot.x, upMid.y - foot.y), width = Math.hypot(B.x - A.x, B.y - A.y)
  if (!(upLen > 0) || !(width > 0) || onFloor(foot, outline)) return undefined
  const back = { x: -(upMid.x - foot.x) / upLen, y: -(upMid.y - foot.y) / upLen }
  const side = { x: (B.x - A.x) / width, y: (B.y - A.y) / width }
  const at = (p: LocalCoord, d: LocalCoord, s: number) => ({ x: p.x + d.x * s, y: p.y + d.y * s })
  const STEP = 0.05
  let corners: LocalCoord[] | undefined
  // 1) Straight back from the bottom step until the floor.
  for (let d = STEP; d <= ENTRY_REACH_M + 1e-9; d += STEP) {
    if (!onFloor(at(foot, back, d), outline)) continue
    const depth = Math.max(d, MIN_ENTRY_DEPTH_M)
    corners = [A, B, at(B, back, depth), at(A, back, depth)]
    break
  }
  // 2) A stair along the facade: a pad as deep as the stair is wide, widened sideways to the floor.
  if (!corners) {
    const depth = Math.max(width, MIN_ENTRY_DEPTH_M)
    const mid = at(foot, back, depth / 2)
    for (let s = STEP; s <= ENTRY_REACH_M + 1e-9 && !corners; s += STEP) {
      if (onFloor(at(mid, side, width / 2 + s), outline)) corners = [A, at(B, side, s), at(at(B, side, s), back, depth), at(A, back, depth)]
      else if (onFloor(at(mid, side, -(width / 2 + s)), outline)) corners = [at(A, side, -s), B, at(B, back, depth), at(at(A, side, -s), back, depth)]
    }
    corners ??= [A, B, at(B, back, depth), at(A, back, depth)]
  }
  const edges = corners.map((p, i) => [p, corners![(i + 1) % 4]] as [LocalCoord, LocalCoord])
  // An edge touches the floor when both its ends are on it (or within a hair of its edge). A side edge reaching from
  // outside across the facade does not: it keeps its railing.
  const near = (p: LocalCoord) => onFloor(p, outline) || distanceToRing(p, outline) <= ENTRY_TOUCH_M
  const touches = edges.map(([p, q]) => near(p) && near(q))
  const contactIndex = touches[2] ? 2 : touches.findIndex((t, i) => i !== 0 && t)
  return { ring: corners, railed: touches.map((t, i) => i !== 0 && !t), contact: contactIndex >= 0 ? edges[contactIndex] : null }
}

/**
 * Where you step onto a stair (owner 2026-11-18: connect an outside stair to the outdoor route network): half a metre
 * out from the middle of its lowest step's front edge, building-local. Undefined when the stair has no steps.
 */
export function stairFootPosition(stair: Staircase, floors: readonly (Pick<Floor, 'level' | 'elevation' | 'height'> & Partial<Pick<Floor, 'walls' | 'openings'>>)[], outline?: readonly LocalCoord[]): LocalCoord | undefined {
  // With an entry platform, you step onto the stair from the floor where the platform meets it (owner 2026-11-19):
  // 0.3 m onto the floor past the middle of that edge.
  const entry = outline ? stairEntryPlatform(stair, floors, outline) : undefined
  if (entry?.contact) {
    const [p, q] = entry.contact
    const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
    const c = { x: entry.ring.reduce((s, r) => s + r.x, 0) / 4, y: entry.ring.reduce((s, r) => s + r.y, 0) / 4 }
    const len = Math.hypot(m.x - c.x, m.y - c.y)
    return len > 0 ? { x: m.x + (m.x - c.x) / len * 0.3, y: m.y + (m.y - c.y) / len * 0.3 } : m
  }
  const flight = floorStairInputs([stair], floors, stairFlightFloor(stair)).flights[0]
  if (!flight) return undefined
  const step = buildStairAssetVolumes([flight], 0).collection.features.find((f) => f.properties?.partType === 'step')
  const ring = step?.geometry.coordinates[0] as number[][] | undefined
  if (!ring || ring.length < 4) return undefined
  const lo = { x: (ring[0][0] + ring[1][0]) / 2, y: (ring[0][1] + ring[1][1]) / 2 }
  const up = { x: (ring[3][0] + ring[2][0]) / 2, y: (ring[3][1] + ring[2][1]) / 2 }
  const len = Math.hypot(lo.x - up.x, lo.y - up.y)
  if (!(len > 0)) return lo
  return { x: lo.x + ((lo.x - up.x) / len) * 0.5, y: lo.y + ((lo.y - up.y) / len) * 0.5 }
}
