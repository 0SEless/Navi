import type { Floor, Staircase, StairLevelGeometry } from '../types/entities'
import { buildStairTopVolumes, type StairAssetInput, type StairTopInput } from './stair-assets'
import type { LocalCoord } from '../types/coordinates'

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
export function floorStairInputs(stairs: readonly Staircase[], floors: readonly (Pick<Floor, 'level' | 'elevation' | 'height'> & Partial<Pick<Floor, 'walls' | 'openings'>>)[], level: number): { flights: StairAssetInput[]; tops: StairTopInput[] } {
  const flights = stairFlightsOnFloor(stairs, level).map(({ stair, geometry }) => {
    const doorwayAt = stairDoorwayAt(stair, floors)
    return { id: stair.id, ...geometry, rotation: geometry.rotation ?? 0, height: stairRise(stair, floors), ...(doorwayAt ? { doorwayAt } : {}) }
  })
  const tops = stairTopsOnFloor(stairs, level).flatMap(({ stair, fromLevel }) => {
    const flight = stair.levels?.[fromLevel]
    return flight ? [{ id: stair.id, ...flight, rotation: flight.rotation ?? 0, height: stairRise(stair, floors), fromLevel }] : []
  })
  return { flights, tops }
}

/**
 * Where a stair's top lands (the middle of its top landing), worked out from its flight — so the To floor's top point
 * always follows the flight when it is moved, rotated, resized or turned. Absent when the flight cannot be built.
 */
export function stairTopPosition(stair: Staircase, floors: readonly Pick<Floor, 'level' | 'elevation' | 'height'>[]): LocalCoord | undefined {
  const from = stairFlightFloor(stair)
  const flight = stair.levels?.[from]
  if (!flight) return undefined
  const top = buildStairTopVolumes([{ id: stair.id, ...flight, rotation: flight.rotation ?? 0, height: stairRise(stair, floors), fromLevel: from }], 0).landings.features[0]
  const ring = top?.geometry.coordinates[0].slice(0, -1) ?? []
  if (ring.length === 0) return undefined
  return { x: ring.reduce((sum, p) => sum + p[0], 0) / ring.length, y: ring.reduce((sum, p) => sum + p[1], 0) / ring.length }
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

