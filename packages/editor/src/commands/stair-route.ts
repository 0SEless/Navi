// Stair route links (2026-11-07): Connect writes, as one batch (one undo step), a route over an outdoor stair or ramp —
// a road marked stairs/ramp from the bottom end to the top end, joined to the chosen route at the bottom, and linked
// to the top floor's entrance (or joined to a route at the top). Disconnect removes exactly that and puts back the
// entrance's previous outdoor link. Callers run the commands with dispatcher.executeBatch.
import { ROUTE_NETWORK_THRESHOLDS, routeCandidate, stairRouteLine, stairRouteOf, structureSampler, toLocal, type CampusDocument, type EntranceAccess, type LatLng, type StairConnection, type StairEndRoute } from '@navi/core'
import type { Command } from './types'
import type { RoadConnectionRequest } from './road-connectivity'

export const STAIR_ROUTE_ID_PREFIX = 'rd-stair-'
/** Where a replaced entrance link is kept on the stair's road, so Disconnect can put it back. */
const PREVIOUS_ACCESS_KEY = 'stairPreviousAccess'

const request = (pointIndex: number, route: StairEndRoute): RoadConnectionRequest => ({
  pointIndex,
  action: 'connect',
  kind: route.kind,
  targetRoadId: route.roadId,
  ...(route.junctionId ? { junctionId: route.junctionId } : {}),
  position: route.position,
})

export function stairConnectCommands(document: CampusDocument, connection: StairConnection): Command[] | { error: string } {
  const structure = (document.structures ?? []).find((s) => s.id === connection.structureId)
  if (!structure) return { error: 'This stair no longer exists.' }
  if (stairRouteOf(document, structure.id)) return { error: 'This stair is already connected.' }
  if (!connection.bottom) return { error: 'Pick the route at the bottom of the stair.' }
  const top = connection.top
  if (!top) return { error: 'Pick the route at the top of the stair.' }
  if (top.kind === 'missing') {
    return { error: top.reason === 'entrance' ? 'Add an entrance on this floor first.' : "Connect this entrance to the floor's routes first." }
  }
  const points = connection.centreline
  if (points.length < 2) return { error: 'This stair is too short to connect.' }
  const roadId = `${STAIR_ROUTE_ID_PREFIX}${structure.id}`

  let previous: EntranceAccess | undefined
  if (top.kind === 'entrance') {
    const floor = document.buildings.find((b) => b.id === top.buildingId)?.floors.find((f) => f.id === top.floorId)
    previous = floor?.entranceAccess?.find((a) => a.entranceId === top.entranceId)
  }
  const connections = [request(0, connection.bottom), ...(top.kind === 'route' ? [request(points.length - 1, top.route)] : [])]
  const commands: Command[] = [{
    id: 'road.create',
    label: structure.form === 'ramp' ? 'Connect ramp to route' : 'Connect stair to route',
    payload: {
      id: roadId,
      name: '',
      points,
      type: 'pedestrian',
      width: structure.width,
      routing: { feature: structure.form === 'ramp' ? 'ramp' : 'stairs', structureId: structure.id },
      heightMode: 'follow-surface',
      connections,
      metadata: previous ? { [PREVIOUS_ACCESS_KEY]: structuredClone(previous) } : {},
    },
  }]
  if (top.kind === 'entrance') {
    commands.push({
      id: 'entrance.access.assign',
      label: 'Link stair to entrance',
      payload: {
        buildingId: top.buildingId,
        floorId: top.floorId,
        entranceId: top.entranceId,
        outdoorNodeId: roadId,
        indoorRouteNodeId: top.indoorRouteNodeId,
        outdoorRouteId: roadId,
        outdoorPosition: points[points.length - 1],
      },
    })
  }
  return commands
}

export function stairDisconnectCommands(document: CampusDocument, structureId: string): Command[] {
  const road = stairRouteOf(document, structureId)
  if (!road) return []
  const commands: Command[] = []
  const previous = road.metadata?.[PREVIOUS_ACCESS_KEY] as EntranceAccess | undefined
  for (const building of document.buildings) {
    for (const floor of building.floors) {
      for (const access of floor.entranceAccess ?? []) {
        if (access.outdoorRouteId !== road.id) continue
        commands.push(previous && previous.entranceId === access.entranceId
          ? {
              id: 'entrance.access.assign',
              label: 'Restore entrance link',
              payload: { buildingId: building.id, floorId: floor.id, ...structuredClone(previous) },
            }
          : {
              id: 'entrance.access.unassign',
              label: 'Unlink stair from entrance',
              payload: { buildingId: building.id, floorId: floor.id, entranceId: access.entranceId },
            })
      }
    }
  }
  commands.push({ id: 'road.delete', label: 'Disconnect stair', payload: { roadId: road.id } })
  return commands
}

/**
 * After a stair edit (same mutation, so one undo step): its route takes the stair's new line, width and form; the
 * junctions at its ends slide along the joined routes; the entrance link's outdoor position moves to the top end.
 * Nothing happens when the stair cannot be resolved — validation then reports the stair route out of step.
 */
export function followStairRoute(document: CampusDocument, structureId: string): void {
  const road = stairRouteOf(document, structureId)
  const structure = (document.structures ?? []).find((s) => s.id === structureId)
  const grid = structureSampler(document)?.grid
  if (!road || !structure || !grid) return
  const line = stairRouteLine(document, structure)
  if (!line || line.length < 2) return
  const old = road.polyline.points
  const near = (a: LatLng, b: LatLng) => {
    const p = toLocal(grid, a)
    const q = toLocal(grid, b)
    return Math.hypot(p.x - q.x, p.y - q.y) <= ROUTE_NETWORK_THRESHOLDS.snapRadiusMeters
  }
  const slide = (oldEnd: LatLng | undefined, index: number) => {
    if (!oldEnd) return
    for (const junction of document.roadJunctions ?? []) {
      if (!junction.roadIds.includes(road.id) || !near(junction.position, oldEnd)) continue
      const other = document.roads.find((r) => r.id !== road.id && junction.roadIds.includes(r.id))
      const found = other ? routeCandidate(document, grid, other, line[index]) : null
      if (!other || !found || found.distance > other.width / 2 + ROUTE_NETWORK_THRESHOLDS.snapRadiusMeters) continue
      junction.position = { ...found.candidate.position }
      line[index] = { ...found.candidate.position }
    }
  }
  slide(old[0], 0)
  slide(old[old.length - 1], line.length - 1)
  road.polyline.points = line
  road.width = structure.width
  road.routing = { ...road.routing, feature: structure.form === 'ramp' ? 'ramp' : 'stairs', structureId }
  for (const building of document.buildings) {
    for (const floor of building.floors) {
      for (const access of floor.entranceAccess ?? []) {
        if (access.outdoorRouteId === road.id) access.outdoorPosition = { ...line[line.length - 1] }
      }
    }
  }
}
