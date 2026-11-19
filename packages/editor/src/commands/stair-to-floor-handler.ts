import { recordChange, stairFlightFloor, stairFootPosition, buildingOutlineLocal, stairEntryPlatform, stairHasTop, stairTopPosition, type Building, type CampusDocument, type Opening, type Staircase } from '@navi/core'
import { stairTopReach, type StairTopReach } from '../geometry/stair-top-reach'
import { suggestFloorConnections } from '../geometry/floor-connections'
import { floorConnectionsApplyHandler } from './floor-route-workflow'
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

    const exit = payload.landingExit
    if (exit !== undefined && exit !== 'auto' && exit !== 'front' && exit !== 'left' && exit !== 'right') {
      return { success: false, error: 'Select Auto, Front, Left, or Right for the landing exit.' }
    }
    const cutout = payload.cutout as CutoutRequest | undefined
    if (cutout) {
      if (toLevel !== stair.toLevel || exit !== undefined || !stairHasTop(stair)) return { success: false, error: 'Set the arrival floor and exit before making a cutout.' }
      const error = applyStairCutout(building, stair, cutout)
      if (error) return { success: false, error }
    }

    const keepTop = stairHasTop(stair) && toLevel === stair.toLevel
    if (exit === 'auto') delete flight.landingExit
    else if (exit !== undefined) flight.landingExit = exit

    for (const key of keepTop ? [] : Object.keys(stair.levels)) {
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
    if (toLevel > from && !keepTop) {
      clearFeatureLinks(building, 'staircase', stair.id)
      const position = stairTopPosition(stair, building.floors) ?? { ...flight.position }
      stair.levels[toLevel] = { role: 'top', position, rotation: flight.rotation ?? 0 }
    }
    const reach = syncLandingExit(building, stair)
    if (stairHasTop(stair)) {
      const top = stair.levels[toLevel]
      if (!reach.ok && exit !== undefined) top.routeConnectionManaged = true
      if (top.routeConnection && (!reach.ok || syncFeatureRoutePort(building, stair, toLevel))) {
        const targetFloor = building.floors.find(floor => floor.level === toLevel)!
        const link = top.routeConnection
        delete top.routeConnection
        top.routeConnectionManaged = true
        removeFeatureRoutePort(targetFloor, link, building)
      }
    }
    if (payload.autoConnect === true && stairHasTop(stair)) {
      // Only the selected stair is eligible. Keep any existing foot link and never create a corridor.
      if (!flight.routeConnection && !flight.landing) {
        const foot = stairFootPosition(stair, building.floors, buildingOutlineLocal(building))
        if (foot) flight.landing = { position: foot }
      }
      openEntryRailing(building, stair)
      for (const level of [from, toLevel]) {
        const geometry = stair.levels[level]
        if (geometry.routeConnection) continue
        geometry.routeConnectionManaged = true
        if (level === toLevel && !reach.ok) continue
        const floor = building.floors.find(f => f.level === level)!
        const proposal = suggestFloorConnections(building, floor).find(row => row.portKey === `stair:${stair.id}`)
        if (proposal?.accepted && !proposal.existing) {
          floorConnectionsApplyHandler.execute(document, { buildingId: building.id, floorId: floor.id, connections: [proposal] })
        }
      }
    }
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
  const flight = stair.levels[stairFlightFloor(stair)]
  if (flight) top.rotation = flight.rotation ?? 0
  const reach = syncLandingExit(building, stair)
  const problem = syncFeatureRoutePort(building, stair, stair.toLevel)
  const targetFloor = building.floors.find(floor => floor.level === stair.toLevel)
  if (targetFloor && top.routeConnection && (problem || !reach.ok)) {
    const link = top.routeConnection
    delete top.routeConnection
    top.routeConnectionManaged = true
    removeFeatureRoutePort(targetFloor, link, building)
  }
}

/** The flight stores the requested side. The destination stores the confirmed exit. */
function syncLandingExit(building: Building, stair: Staircase): StairTopReach {
  const reach = stairTopReach(building, stair)
  const top = stair.levels[stair.toLevel]
  if (top?.role === 'top') {
    if (reach.ok) {
      top.landingExit = reach.exit
      top.landingExitSpan = reach.span
    } else {
      delete top.landingExit
      delete top.landingExitSpan
    }
    top.position = reach.ok ? reach.point : stairTopPosition(stair, building.floors) ?? top.position
  }
  return reach
}

/** Preferred clear height of a confirmed stair cutout, metres. */
export const STAIR_OPENING_HEIGHT_M = 2.1
const openingId = (stair: Staircase) => `${stair.id}-top-opening`

type CutoutRequest = { wallId: string; offset: number; width: number }

/** Opening id for the gap where a stair's entry platform meets its floor's railing or wall. */
export const stairEntryOpeningId = (stairId: string) => `${stairId}-entry-opening`

/**
 * Owner 2026-11-19: where a stair's entry platform meets its floor, the corridor railing (or wall) there is opened so
 * you can walk from the floor onto the platform. Only when no opening is already there; undone with the stair command.
 */
function openEntryRailing(building: Building, stair: Staircase): void {
  const entry = stairEntryPlatform(stair, building.floors, buildingOutlineLocal(building))
  const floor = building.floors.find(f => f.level === stairFlightFloor(stair))
  if (!floor) return
  // The stair's own entry gap follows its platform (owner 2026-11-19: the gap did not line up after the platform moved
  // or changed): drop the old one, then cut it where the platform meets the floor now.
  if (floor.openings?.some(o => o.id === stairEntryOpeningId(stair.id))) {
    floor.openings = floor.openings.filter(o => o.id !== stairEntryOpeningId(stair.id))
  }
  if (!entry?.contact || !floor.walls?.length) return
  // A wall the platform crosses or touches (a platform reaching past the railing onto the corridor crosses it).
  for (const wall of floor.walls) {
    const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y, len = Math.hypot(dx, dy)
    if (!(len > 0)) continue
    const along = entry.ring.map(v => ((v.x - wall.start.x) * dx + (v.y - wall.start.y) * dy) / len)
    const side = entry.ring.map(v => ((v.y - wall.start.y) * dx - (v.x - wall.start.x) * dy) / len)
    const band = (wall.thickness ?? 0.2) / 2 + 0.05
    if (Math.min(...side) > band || Math.max(...side) < -band) continue
    const t0 = Math.max(0, Math.min(...along)), t1 = Math.min(len, Math.max(...along))
    if (t1 - t0 < 0.5) continue
    if (floor.openings?.some(o => o.wallId === wall.id && o.offset < t1 - 1e-6 && o.offset + o.width > t0 + 1e-6)) return
    floor.openings = [...(floor.openings ?? []), {
      id: stairEntryOpeningId(stair.id), type: 'door', wallId: wall.id, offset: t0, width: t1 - t0,
      height: Math.min(STAIR_OPENING_HEIGHT_M, wall.height), sillHeight: 0, frameless: true, doorAppearance: 'open',
      metadata: { stairEntryId: stair.id },
    } as Opening]
    return
  }
}

export function proposeStairCutout(building: Building, stair: Staircase) {
  if (stairTopReach(building, stair).ok) return undefined
  const reach = stairTopReach(building, stair, true)
  if (!reach.ok || !reach.wall) return undefined
  const floor = building.floors.find(f => f.level === stair.toLevel)
  const { wall, t0, t1, offset: anchorOffset } = reach.wall
  // Railings and half-walls can be opened too (owner 2026-11-19); the opening is then as tall as the wall.
  if (!floor) return undefined
  return { wallId: wall.id, offset: t0, width: t1 - t0, anchorOffset, wall, floor }
}

function applyStairCutout(building: Building, stair: Staircase, request: CutoutRequest): string | undefined {
  const proposal = proposeStairCutout(building, stair)
  if (!proposal || proposal.wallId !== request.wallId) return 'Choose the wall where the landing meets the hallway.'
  const { offset, width } = request
  const { wall, floor } = proposal
  if (![offset, width].every(Number.isFinite) || width < 0.5 || offset < proposal.offset - 0.001
      || offset + width > proposal.offset + proposal.width + 0.001
      || offset > proposal.anchorOffset - 0.25 + 1e-6 || offset + width < proposal.anchorOffset + 0.25 - 1e-6) {
    return 'Keep the opening within the wall and across the stair approach.'
  }
  if (floor.openings?.some(o => o.wallId === wall.id && o.offset < offset + width - 1e-6 && o.offset + o.width > offset + 1e-6)) {
    return 'The proposed cutout overlaps an existing opening. Adjust its position or width.'
  }
  if (floor.openings?.some(o => o.id === openingId(stair))) return 'Review the existing stair cutout on this floor before placing another.'
  const previous = floor.openings
  floor.openings = [...(previous ?? []), {
    id: openingId(stair), type: 'door', wallId: wall.id, offset, width,
    height: Math.min(STAIR_OPENING_HEIGHT_M, wall.height), sillHeight: 0, frameless: true, doorAppearance: 'open',
    metadata: { stairId: stair.id, automatic: false },
  }]
  if (!stairTopReach(building, stair).ok) {
    if (previous) floor.openings = previous
    else delete floor.openings
    return 'The opening must connect the selected stair edge to the hallway.'
  }
  return undefined
}
