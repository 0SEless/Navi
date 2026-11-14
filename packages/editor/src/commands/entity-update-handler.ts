import { floorConnectionProblem } from '../geometry/floor-connections'
import { recordChange } from '@navi/core'
import type { CampusDocument } from '@navi/core'
import type { CommandHandler, MutationResult } from './types'
import { recalculateBuilding } from './floor-handlers'
import { buildRoadJunctionMovePlan, type RoadJunctionMoveRequest } from './road-junction-geometry'

export function detectEntityType(document: CampusDocument, id: string): string {
  for (const bld of document.buildings) {
    if (bld.id === id) return 'building'
    for (const flr of bld.floors) {
      if (flr.id === id) return 'floor'
      for (const rm of flr.rooms) if (rm.id === id) return 'room'
      for (const hw of flr.hallways) if (hw.id === id) return 'hallway'
      for (const st of flr.staircases) if (st.id === id) return 'staircase'
      for (const el of flr.elevators) if (el.id === id) return 'elevator'
      for (const ent of flr.entrances) if (ent.id === id) return 'entrance'
    }
  }
  for (const rd of document.roads) if (rd.id === id) return 'road'
  for (const pan of document.panoramas) if (pan.id === id) return 'panorama'
  for (const qr of document.qrCheckpoints) if (qr.id === id) return 'checkpoint'
  return 'unknown'
}

function resolveEntity(document: CampusDocument, id: string): Record<string, any> | null {
  for (const bld of document.buildings) {
    if (bld.id === id) return bld as any
    for (const flr of bld.floors) {
      if (flr.id === id) return flr as any
      for (const rm of flr.rooms) if (rm.id === id) return rm as any
      for (const hw of flr.hallways) if (hw.id === id) return hw as any
      for (const st of flr.staircases) if (st.id === id) return st as any
      for (const el of flr.elevators) if (el.id === id) return el as any
      for (const ent of flr.entrances) if (ent.id === id) return ent as any
    }
  }
  for (const rd of document.roads) if (rd.id === id) return rd as any
  for (const pan of document.panoramas) if (pan.id === id) return pan as any
  for (const qr of document.qrCheckpoints) if (qr.id === id) return qr as any
  return null
}

export const entityUpdateHandler: CommandHandler = {
  id: 'entity.update',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const entityId = payload.entityId as string
    const changes = payload.changes as Record<string, unknown> | undefined
    if (!entityId) return { success: false, error: 'entityId is required' }
    if (!changes) return { success: false, error: 'changes are required' }

    const entity = resolveEntity(document, entityId)
    if (!entity) return { success: false, error: `Entity not found: ${entityId}` }

    const oldValues: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(changes)) {
      oldValues[key] = entity[key]
    }

    // Move only the physical entrance terminal; legacy access may reference a
    // shared corridor waypoint, which must stay in place.
    const entranceFloor = document.buildings.flatMap(b => b.floors).find(f => f.entrances?.some(e => e.id === entityId))
    const previousEntranceNetwork = entranceFloor ? { present: Object.hasOwn(entranceFloor, 'routeNetwork'), value: structuredClone(entranceFloor.routeNetwork) } : undefined
    let nextEntranceNetwork = entranceFloor?.routeNetwork && structuredClone(entranceFloor.routeNetwork)
    if (entranceFloor && changes.position !== undefined && !('restoreEntranceNetwork' in payload)) {
      const position = changes.position as { x: number; y: number }
      if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return { success: false, error: 'Entrance position must be finite.' }
      const entrance = entranceFloor.entrances.find(e => e.id === entityId)!
      const connection = entrance.routeConnection
      const anchor = nextEntranceNetwork?.nodes.find(n => n.id === (connection?.anchorNodeId ?? entrance.routeNodeId))
      if (connection) {
        const target = nextEntranceNetwork?.nodes.find(n => n.id === connection.targetRouteNodeId)
        if (!anchor || !target) return { success: false, error: 'Reconnect this entrance before moving it.' }
        const problem = floorConnectionProblem({ key: `entrance:${entityId}`, kind: 'entrance', id: entityId, label: entrance.label ?? 'Entrance', position }, target.position, entranceFloor)
        if (problem) return { success: false, error: problem }
      }
      if (anchor && (connection || anchor.type === 'entrance')) {
        anchor.position = { ...position }
        for (const edge of nextEntranceNetwork!.edges) {
          if (edge.from !== anchor.id && edge.to !== anchor.id) continue
          const a = nextEntranceNetwork!.nodes.find(n => n.id === edge.from), b = nextEntranceNetwork!.nodes.find(n => n.id === edge.to)
          if (a && b) edge.distance = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y)
        }
      }
    }

    const junctionMoveRequest = payload.junctionMove as RoadJunctionMoveRequest | undefined
    let junctionMoveUndo: RoadJunctionMoveRequest | undefined
    if (junctionMoveRequest) {
      const plan = buildRoadJunctionMovePlan(document, junctionMoveRequest)
      if (!plan || !plan.roads.some((road) => road.roadId === entityId)) {
        return { success: false, error: 'Road junction geometry could not be moved consistently' }
      }

      for (const movedRoad of plan.roads) {
        const road = document.roads.find((candidate) => candidate.id === movedRoad.roadId)!
        road.polyline = { ...road.polyline, points: movedRoad.points.map((point) => ({ ...point })) }
        recordChange(document, { entityId: road.id, entityType: 'road', operation: 'updated' })
      }
      const junction = document.roadJunctions?.find((candidate) => candidate.id === plan.junctionId)
      if (!junction) return { success: false, error: 'Road junction not found' }
      junction.position = { ...plan.position }
      recordChange(document, { entityId: junction.id, entityType: 'roadJunction', operation: 'updated' })
      junctionMoveUndo = {
        junctionId: plan.junctionId,
        position: plan.previousPosition,
        roadGeometry: plan.roads.map((road) => ({ roadId: road.roadId, points: road.previousPoints })),
      }
    }

    for (const [key, value] of Object.entries(changes)) {
      if (junctionMoveRequest && key === 'polyline') continue
      entity[key] = value
    }

    if (entranceFloor) {
      if ('restoreEntranceNetwork' in payload) {
        const state = payload.restoreEntranceNetwork as typeof previousEntranceNetwork
        if (state?.present) entranceFloor.routeNetwork = structuredClone(state.value)
        else delete entranceFloor.routeNetwork
      } else if (nextEntranceNetwork) entranceFloor.routeNetwork = nextEntranceNetwork
    }

    const entityType = detectEntityType(document, entityId)
    if (!junctionMoveRequest || Object.keys(changes).some((key) => key !== 'polyline')) {
      recordChange(document, { entityId, entityType, operation: 'updated' })
    }

    // Recalculate building when floor height or building roofHeight changes
    if (entityType === 'floor' && ('height' in changes)) {
      for (const bld of document.buildings) {
        if (bld.floors.some(f => f.id === entityId)) {
          recalculateBuilding(bld)
          break
        }
      }
    } else if (entityType === 'building' && ('roofHeight' in changes)) {
      const bld = document.buildings.find(b => b.id === entityId)
      if (bld) recalculateBuilding(bld)
    }

    return { success: true, entityId, data: { oldValues, ...(previousEntranceNetwork ? { previousEntranceNetwork } : {}), ...(junctionMoveUndo ? { junctionMoveUndo } : {}) } }
  },
  inverse(payload: Record<string, unknown>, result: MutationResult): any {
    const entityId = payload.entityId as string
    const oldValues = result.data?.oldValues as Record<string, unknown>
    const junctionMoveUndo = result.data?.junctionMoveUndo as RoadJunctionMoveRequest | undefined
    return {
      id: 'entity.update',
      label: 'Undo Property Edit',
      payload: { entityId, changes: oldValues, ...(result.data?.previousEntranceNetwork ? { restoreEntranceNetwork: result.data.previousEntranceNetwork } : {}), ...(junctionMoveUndo ? { junctionMove: junctionMoveUndo } : {}) },
    }
  },
}
