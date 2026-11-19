import { boxStairAsUShape, BOX_U_MIN_FLIGHT_M, U_STAIR_GAP, recordChange, stairFlightFloor, stairRise, stairFootPosition, buildingOutlineLocal, stairEntryPlatform, stairHasTop, stairTopPosition, type Building, type CampusDocument, type Floor, type LocalCoord, type Opening, type Staircase, type Wall } from '@navi/core'
import { stairTopReach, type StairTopReach } from '../geometry/stair-top-reach'
import { floorDoorSpans, getFloorPorts, suggestFloorConnections } from '../geometry/floor-connections'
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
    let reach = syncLandingExit(building, stair)
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
      // Owner 2026-11-19: a wall between a stair end and the route gets a doorway cut by Auto-connect itself. Each end
      // being (re)connected first drops the doorways it cut before, so they follow the stair.
      for (const level of [from, toLevel]) {
        const floor = building.floors.find(f => f.level === level)
        if (floor && !stair.levels[level]?.routeConnection) clearAutoCuts(floor, stair, level)
      }
      if (!stair.levels[toLevel].routeConnection) {
        reach = syncLandingExit(building, stair)
        if (!reach.ok && cutTopWay(building, stair)) reach = syncLandingExit(building, stair)
      }
      for (const level of [from, toLevel]) {
        const geometry = stair.levels[level]
        if (geometry.routeConnection) continue
        geometry.routeConnectionManaged = true
        if (level === toLevel && !reach.ok) continue
        const floor = building.floors.find(f => f.level === level)!
        const suggest = () => suggestFloorConnections(building, floor).find(row => row.portKey === `stair:${stair.id}`)
        let proposal = suggest()
        if (proposal && !proposal.accepted && !proposal.existing && proposal.target && proposal.message?.startsWith('Connection crosses a wall')) {
          const port = getFloorPorts(building, floor).find(p => p.key === `stair:${stair.id}`)
          // Only from inside the building: an outside stair's foot links to the outdoor walk, never through the facade.
          const cut = port && insideBuilding(building, port.position) ? cutDoorways(floor, stair, level, wallsInTheWay(floor, [port.position, proposal.target.position])) : []
          if (cut.length > 0) {
            proposal = suggest()
            if (!proposal?.accepted) floor.openings = (floor.openings ?? []).filter(o => !cut.includes(o.id))
          }
        }
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
 * Type for a stair drawn with the Stair tool (owner 2026-11-19, ASU Tourism): U-Shape fills the drawn box with two
 * flights (arriving back beside the foot); Straight brings the drawn box back. Its top and both route links follow
 * (Auto-connect runs again), all in one undo step.
 */
export const stairSetShapeHandler: CommandHandler = {
  id: 'stair.setShape',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const featureId = payload.featureId as string
    const shape = payload.shape
    const turn = payload.turn === 'left' ? 'left' : 'right'
    const building = document.buildings.find((b) => (b.staircases ?? []).some((s) => s.id === featureId))
    const stair = building?.staircases?.find((s) => s.id === featureId)
    if (!building || !stair) return { success: false, error: `Stair not found: ${featureId}` }
    if (shape !== 'ushape' && shape !== 'straight') return { success: false, error: 'Choose Straight or U-Shape.' }
    const from = stairFlightFloor(stair)
    const flight = stair.levels[from]
    if (!flight) return { success: false, error: 'This stair has no drawing on its floor.' }
    const before = structuredClone(building.staircases ?? [])
    const networks = building.floors.map((f) => ({ id: f.id, present: Object.hasOwn(f, 'routeNetwork'), value: structuredClone(f.routeNetwork), openings: structuredClone(f.openings) }))
    const drawnBox = flight.drawing?.properties.fromBox
    if (shape === 'ushape') {
      const source = drawnBox
        ? { position: flight.position, rotation: flight.drawing!.properties.fromBoxRotation ?? 0, polygon: { points: drawnBox }, look: flight.look }
        : flight.drawing ? undefined : flight
      if (!source?.polygon) return { success: false, error: 'Only a stair drawn with the Stair tool can be made U-Shape here.' }
      const u = boxStairAsUShape(source, stairRise(stair, building.floors), turn)
      if (!u) return { success: false, error: `This box is too narrow or short for a U-Shape stair: two flights side by side need at least ${(2 * BOX_U_MIN_FLIGHT_M + U_STAIR_GAP).toFixed(1)} m of width.` }
      flight.position = u.position
      flight.rotation = u.rotation
      flight.drawing = u.drawing
      delete flight.polygon
    } else {
      if (!drawnBox) return { success: false, error: 'This stair has no drawn box to go back to.' }
      flight.polygon = { points: drawnBox.map((p) => ({ ...p })) }
      flight.rotation = flight.drawing!.properties.fromBoxRotation ?? 0
      flight.position = { x: drawnBox.reduce((s, p) => s + p.x, 0) / drawnBox.length, y: drawnBox.reduce((s, p) => s + p.y, 0) / drawnBox.length }
      // What was chosen while it was U-Shape (railings, underneath, platforms) stays with the box.
      const chosen = flight.drawing!.properties
      const look = { ...(flight.look ?? {}) }
      for (const key of ['railings', 'railingStyle', 'underneath', 'entryRailing', 'exitRailing'] as const) {
        if (chosen[key] !== undefined) (look as Record<string, unknown>)[key] = chosen[key]
      }
      if (Object.keys(look).length > 0) flight.look = look
      delete flight.drawing
    }
    // The foot moved within the box: its route link follows it, or is dropped for Auto-connect to make again.
    if (flight.landing && !flight.landing.polygon) delete flight.landing
    const footFloor = building.floors.find((f) => f.level === from)
    if (flight.routeConnection && footFloor && syncFeatureRoutePort(building, stair, from)) {
      const link = flight.routeConnection
      delete flight.routeConnection
      removeFeatureRoutePort(footFloor, link, building)
    }
    if (stairHasTop(stair)) {
      const result = stairSetToFloorHandler.execute(document, { featureId, toLevel: stair.toLevel, autoConnect: true })
      if (!result.success) return result
    }
    recordChange(document, { entityId: featureId, entityType: 'staircase', operation: 'updated' })
    return { success: true, entityId: featureId, data: { before, networks } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): Command | null {
    const before = result.data?.before
    if (!before) return null
    return { id: 'stair.setToFloor', label: 'Undo stair type', payload: { featureId: payload.featureId, restoreStairs: before, restoreNetworks: result.data?.networks } }
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

/** Width of a doorway Auto-connect cuts in a wall between a stair end and the route, metres. */
export const STAIR_AUTO_CUT_WIDTH_M = 1.2
/** Auto-connect opens at most this many walls for one stair end; farther routes need a drawn route. */
const MAX_AUTO_CUTS = 2
const autoCutId = (stair: Staircase, level: number, wallId: string) => `${stair.id}-cut-${level}-${wallId}`

/** Walls (not kerbs) the walk along `path` passes through where they have no floor-level door, and where along each. */
function wallsInTheWay(floor: Floor, path: readonly LocalCoord[]): Array<{ wall: Wall; along: number }> {
  const found: Array<{ wall: Wall; along: number }> = []
  for (const wall of floor.walls ?? []) {
    if (Number(wall.height) <= 0.3) continue
    const sx = wall.end.x - wall.start.x, sy = wall.end.y - wall.start.y, length = Math.hypot(sx, sy)
    if (!(length > 0)) continue
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1], rx = b.x - a.x, ry = b.y - a.y, det = rx * sy - ry * sx
      if (Math.abs(det) < 1e-12) continue
      const t = ((wall.start.x - a.x) * sy - (wall.start.y - a.y) * sx) / det
      const u = ((wall.start.x - a.x) * ry - (wall.start.y - a.y) * rx) / det
      if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) continue
      const along = u * length
      if (floorDoorSpans(floor, wall.id).some(span => along >= span.start - 1e-6 && along <= span.end + 1e-6)) continue
      found.push({ wall, along })
      break
    }
  }
  return found
}

/** Cuts a doorway centred on each crossing (all or none). Returns the new opening ids. */
function cutDoorways(floor: Floor, stair: Staircase, level: number, crossings: ReadonlyArray<{ wall: Wall; along: number }>): string[] {
  if (crossings.length === 0 || crossings.length > MAX_AUTO_CUTS) return []
  const cuts: Opening[] = []
  for (const { wall, along } of crossings) {
    const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
    const width = Math.min(STAIR_AUTO_CUT_WIDTH_M, length)
    const offset = Math.max(0, Math.min(length - width, along - width / 2))
    if ((floor.openings ?? []).some(o => o.wallId === wall.id && o.offset < offset + width - 1e-6 && o.offset + o.width > offset + 1e-6)) return []
    cuts.push({
      id: autoCutId(stair, level, wall.id), type: 'door', wallId: wall.id, offset, width,
      height: Math.min(STAIR_OPENING_HEIGHT_M, wall.height), sillHeight: 0, frameless: true, doorAppearance: 'open',
      metadata: { stairCutFor: stair.id, automatic: true },
    } as Opening)
  }
  floor.openings = [...(floor.openings ?? []), ...cuts]
  return cuts.map(cut => cut.id)
}

/** Inside the building's outline (true when it has none, as in a building still being drawn). */
function insideBuilding(building: Building, point: LocalCoord): boolean {
  const ring = buildingOutlineLocal(building)
  if (!ring || ring.length < 3) return true
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

/** Drops the doorways Auto-connect cut for this stair end before (its own wall cutout at the top included). */
function clearAutoCuts(floor: Floor, stair: Staircase, level: number): void {
  if (!floor.openings?.length) return
  floor.openings = floor.openings.filter(o => {
    const metadata = o.metadata as { stairCutFor?: string; stairId?: string; automatic?: boolean } | undefined
    if (metadata?.automatic !== true) return true
    if (metadata.stairCutFor === stair.id && o.id.startsWith(`${stair.id}-cut-${level}-`)) return false
    return !(level === stair.toLevel && metadata.stairId === stair.id && o.id === openingId(stair))
  })
}

/**
 * The top lands on the floor but a wall stands in the way (owner 2026-11-19, ASU): open the wall the landing is
 * against (its own cutout), or the walls on the walk from the landing to the route. True when the top now reaches.
 */
function cutTopWay(building: Building, stair: Staircase): boolean {
  const blocked = stairTopReach(building, stair, true)
  const floor = building.floors.find(f => f.level === stair.toLevel)
  if (!blocked.ok || !floor) return false
  const previous = floor.openings
  if (blocked.wall) {
    const proposal = proposeStairCutout(building, stair)
    if (!proposal || floor.openings?.some(o => o.wallId === proposal.wallId && o.offset < proposal.offset + proposal.width - 1e-6 && o.offset + o.width > proposal.offset + 1e-6)) return false
    floor.openings = [...(floor.openings ?? []), {
      id: openingId(stair), type: 'door', wallId: proposal.wallId, offset: proposal.offset, width: proposal.width,
      height: Math.min(STAIR_OPENING_HEIGHT_M, proposal.wall.height), sillHeight: 0, frameless: true, doorAppearance: 'open',
      metadata: { stairId: stair.id, automatic: true },
    } as Opening]
  } else if (!blocked.path || !insideBuilding(building, blocked.path[0]) || cutDoorways(floor, stair, stair.toLevel, wallsInTheWay(floor, blocked.path)).length === 0) {
    return false
  }
  if (stairTopReach(building, stair).ok) return true
  if (previous) floor.openings = previous
  else delete floor.openings
  return false
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
