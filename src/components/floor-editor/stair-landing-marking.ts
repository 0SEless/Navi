import { buildingOutlineLocal, stairEntryPlatform, stairFlightFloor, stairHasTop, stairLandingExitEdge, stairRise, stairTopShape, type Building, type LocalCoord } from '@navi/core'

export interface StairLandingMarking {
  stairId: string
  /** 'landing': where the stair arrives upstairs. 'entry': the platform at its foot (owner 2026-11-19). */
  kind: 'landing' | 'entry'
  /** "Lands on Floor 3" / "Entry platform" */
  label: string
  /** Building-local metres: the same shape the stair checks and the 2.5D view use. */
  ring: LocalCoord[]
  /** The landing edge people step off (the chosen or confirmed exit), when one is set. */
  exitEdge?: [LocalCoord, LocalCoord]
}

/**
 * Owner 2026-11-19: on a stair's flight floor, draw where it lands upstairs as a rectangle, so the walls and door on the
 * floor above can be placed against it, and the entry platform at its foot when it starts outside the floor.
 */
export function stairLandingMarkings(building: Building, level: number): StairLandingMarking[] {
  const outline = buildingOutlineLocal(building)
  return (building.staircases ?? []).flatMap((stair) => {
    if (stairFlightFloor(stair) !== level) return []
    const flight = stair.levels[level]
    if (!flight || flight.role === 'top') return []
    const markings: StairLandingMarking[] = []
    const entry = stairEntryPlatform(stair, building.floors, outline)
    if (entry) markings.push({ stairId: stair.id, kind: 'entry', label: 'Entry platform', ring: entry.ring })
    if (!stairHasTop(stair)) return markings
    const top = stairTopShape({ id: stair.id, ...flight, rotation: flight.rotation ?? 0, height: stairRise(stair, building.floors), fromLevel: level })
    if (!top || top.landing.length < 3) return markings
    const ring = top.landing.map(([x, y]) => ({ x, y }))
    const to = building.floors.find((floor) => floor.level === stair.toLevel)
    const exit = stair.levels[stair.toLevel]?.landingExit ?? flight.landingExit
    const marking: StairLandingMarking = { stairId: stair.id, kind: 'landing', label: `Lands on ${to?.label ?? `level ${stair.toLevel}`}`, ring }
    if (exit && ring.length === 4) {
      const edge = stairLandingExitEdge(top.landing, exit)
      marking.exitEdge = [ring[edge], ring[(edge + 1) % 4]]
    }
    return [...markings, marking]
  })
}
