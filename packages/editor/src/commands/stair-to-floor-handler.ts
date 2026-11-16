import { buildStairTopVolumes, recordChange, stairFlightFloor, stairHasTop, stairRise, stairTopPosition, type Building, type CampusDocument, type Opening, type Staircase } from '@navi/core'
import { wallAgainstLanding } from '../geometry/stair-top-reach'
import { removeFeatureRoutePort, syncFeatureRoutePort } from '../geometry/feature-route-port'
import { clearFeatureLinks } from '../navigation/feature-links'
import type { Command, CommandHandler, MutationResult } from './types'

/**
 * Whole-building view (2026-11-16): a stair placed on one floor climbs To a chosen floor above. Its flight stays on
 * the From floor; the To floor holds only its top (`role: 'top'`) at the top landing. To = the From floor makes it a
 * one-floor stair again. A stair that climbs to a floor connects by itself, so its old per-floor links are dropped.
 * Undo restores the building's stairs exactly (the stair and any partner it was linked to).
 */
export const stairSetToFloorHandler: CommandHandler = {
  id: 'stair.setToFloor',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const featureId = payload.featureId as string
    const building = document.buildings.find((b) => (b.staircases ?? []).some((s) => s.id === featureId))
    const stair = building?.staircases?.find((s) => s.id === featureId)
    if (!building || !stair) return { success: false, error: `Stair not found: ${featureId}` }
    const before = structuredClone(building.staircases ?? [])
    // Route networks of every floor, so undo also brings back a connector removed with an old top (review I2).
    const networks = building.floors.map((f) => ({ id: f.id, present: Object.hasOwn(f, 'routeNetwork'), value: structuredClone(f.routeNetwork), openings: structuredClone(f.openings) }))

    if (Object.prototype.hasOwnProperty.call(payload, 'restoreStairs')) {
      building.staircases = structuredClone(payload.restoreStairs as Staircase[])
      for (const saved of (payload.restoreNetworks as typeof networks | undefined) ?? []) {
        const floor = building.floors.find((f) => f.id === saved.id)
        if (!floor) continue
        if (saved.present) floor.routeNetwork = structuredClone(saved.value)
        else delete floor.routeNetwork
        if (saved.openings === undefined) delete floor.openings
        else floor.openings = structuredClone(saved.openings)
      }
      recordChange(document, { entityId: featureId, entityType: 'staircase', operation: 'updated' })
      return { success: true, entityId: featureId, data: { before, networks } }
    }

    const toLevel = payload.toLevel as number
    const from = stairFlightFloor(stair)
    const flight = stair.levels[from]
    if (!flight) return { success: false, error: 'This stair has no drawing on its floor.' }
    if (!Number.isInteger(toLevel) || toLevel < from) return { success: false, error: 'A stair can only climb to a floor above it.' }
    if (!building.floors.some((f) => f.level === toLevel)) return { success: false, error: 'That floor does not exist in this building.' }

    for (const key of Object.keys(stair.levels)) {
      const level = Number(key)
      if (level === from) continue
      // Its route connector on that floor goes with it (no dead-end branch left behind).
      const connection = stair.levels[level]?.routeConnection
      const floor = building.floors.find((f) => f.level === level)
      delete stair.levels[level]
      if (connection && floor) removeFeatureRoutePort(floor, connection, building)
    }
    stair.fromLevel = from
    stair.toLevel = toLevel
    if (toLevel > from) {
      clearFeatureLinks(building, 'staircase', stair.id)
      const position = stairTopPosition(stair, building.floors) ?? { ...flight.position }
      stair.levels[toLevel] = { role: 'top', position, rotation: flight.rotation ?? 0 }
    }
    syncStairTopOpening(building, stair)
    recordChange(document, { entityId: featureId, entityType: 'staircase', operation: 'updated' })
    return { success: true, entityId: featureId, data: { before, networks } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const before = result.data?.before
    if (!before) return null
    return { id: 'stair.setToFloor', label: 'Undo stair floor', payload: { featureId: payload.featureId, restoreStairs: before, restoreNetworks: result.data?.networks } }
  },
}

/**
 * Keeps a stair's top on its To floor where its flight now arrives (2026-11-16, review C1): after the flight is moved,
 * rotated, resized or re-turned, the top point and any route connection on the To floor follow it. Deterministic, so
 * re-running it after an undo restores the previous top exactly.
 */
export function syncStairTop(building: Building, stair: Staircase): void {
  if (!stairHasTop(stair)) return
  const top = stair.levels[stair.toLevel]
  if (!top || top.role !== 'top') return
  const position = stairTopPosition(stair, building.floors)
  if (!position) return
  top.position = position
  const flight = stair.levels[stairFlightFloor(stair)]
  if (flight) top.rotation = flight.rotation ?? 0
  syncFeatureRoutePort(building, stair, stair.toLevel)
  syncStairTopOpening(building, stair)
}

/** Height of the automatic doorway an outside stair's top gets in the wall it lands against, metres. */
export const STAIR_OPENING_HEIGHT_M = 2.1
const openingId = (stair: Staircase) => `${stair.id}-top-opening`

/**
 * Owner 2026-11-17 ("there isn't even an opening, so how can you enter?"): an outside stair whose top platform lands
 * against a wall of the floor it climbs to gets an open doorway (no door panel) in that wall, as wide as the platform
 * along the wall. It follows the stair, and is removed when the stair moves away, climbs elsewhere or stays on its
 * floor. Stairs inside the building never cut a wall. Deterministic, so undo of the stair restores it exactly.
 */
export function syncStairTopOpening(building: Building, stair: Staircase): void {
  const id = openingId(stair)
  for (const floor of building.floors) if (floor.openings?.some((o) => o.id === id)) floor.openings = floor.openings.filter((o) => o.id !== id)
  if (!stairHasTop(stair)) return
  const to = building.floors.find((f) => f.level === stair.toLevel)
  const from = stairFlightFloor(stair)
  const flight = stair.levels[from]
  const walls = to?.walls ?? []
  if (!to || !flight || walls.length === 0) return
  const top = buildStairTopVolumes([{ id: stair.id, ...flight, rotation: flight.rotation ?? 0, height: stairRise(stair, building.floors), fromLevel: from }], 0).landings.features[0]
  const landing = top?.geometry.coordinates[0].slice(0, -1).map(([x, y]) => ({ x, y })) ?? []
  if (landing.length < 3) return
  const best = wallAgainstLanding(walls, landing)
  if (!best) return
  const opening: Opening = {
    id, type: 'door', wallId: best.wall.id, offset: best.t0, width: best.t1 - best.t0,
    height: Math.min(STAIR_OPENING_HEIGHT_M, best.wall.height ?? STAIR_OPENING_HEIGHT_M), sillHeight: 0, doorAppearance: 'open',
    metadata: { stairId: stair.id, automatic: true },
  }
  to.openings = [...(to.openings ?? []), opening]
}

