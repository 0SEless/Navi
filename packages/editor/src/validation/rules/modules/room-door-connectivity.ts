import type { ValidationRule, ValidationContext } from '../types'
import type { ValidationIssue } from '../../snapshot'
import { collectCanonicalRoomIds, collectFloorDoors } from '@navi/core'

export const roomDoorConnectivityRule: ValidationRule = {
  ruleId: 'room-door-connectivity',
  description: 'Room Door Connectivity',
  category: 'connectivity',
  defaultSeverity: 'error',
  profiles: ['draft', 'publish', 'strict'],
  // A connection depends on route nodes/edges and semantic room metadata too.
  affinity: 'global',

  execute(context: ValidationContext): ReadonlyArray<ValidationIssue> {
    const issues: ValidationIssue[] = []

    for (const bld of context.document.buildings) {
      for (const floor of bld.floors) {
        const doors = collectFloorDoors(floor)
        const roomIds = collectCanonicalRoomIds(floor)
        const hallwayIds = new Set(floor.hallways.map(hallway => hallway.id))
        const nodes = new Map((floor.routeNetwork?.nodes ?? []).map(node => [node.id, node]))
        const edges = new Map((floor.routeNetwork?.edges ?? []).map(edge => [edge.id, edge]))
        const hasRoutes = nodes.size > 0 && edges.size > 0
        const hasLegacyHallways = floor.hallways.some(hallway => hallway.polyline.points.length >= 2)
        const needsNetwork = !hasRoutes && !hasLegacyHallways
          && (doors.length > 0 || roomIds.size > 0)
        const scope = { buildingId: bld.id, floorId: floor.id, layer: 'access' as const }
        // Full entity identities, not room/message hashes or list indexes: two
        // doors in one room must retain distinct, stable React keys.
        const identity = (entityId: string, problem: string) =>
          `room-door-connectivity:${JSON.stringify([bld.id, floor.id, entityId, problem])}`

        if (needsNetwork) {
          issues.push({
            issueId: identity(floor.id, 'network-not-mapped'),
            ruleId: 'room-door-connectivity',
            severity: 'warning',
            message: `${bld.name} / ${floor.label || floor.id}: indoor route network has not been mapped yet; add routes before connecting the unassigned doors.`,
            targets: [{ entityId: floor.id, entityType: 'floor' }],
            ...scope,
          })
        }

        for (const door of doors) {
          const report = (problem: string, message: string, severity: ValidationIssue['severity'] = 'error') => {
            issues.push({
              issueId: identity(door.id, problem),
              ruleId: 'room-door-connectivity',
              severity,
              message: `Door "${door.name || door.id}"${door.roomId ? ` in room "${door.roomId}"` : ''}: ${message}`,
              targets: [
                ...(door.roomId ? [{ entityId: door.roomId, entityType: 'room' }] : []),
                { entityId: door.id, entityType: 'door' },
              ],
              location: door.position,
              ...scope,
            })
          }

          // An assigned modern connection is authoritative. Never hide a broken
          // assignment by falling back to an unrelated or empty legacy field.
          if (door.routeConnection !== undefined) {
            const connection = door.routeConnection
            if (!connection || ![connection.anchorNodeId, connection.targetRouteNodeId, connection.connectorEdgeId]
              .every(id => typeof id === 'string' && id.trim().length > 0)) {
              report('route-assignment-invalid', 'route assignment must identify an anchor node, target node, and connector edge.')
              continue
            }
            const anchor = nodes.get(connection.anchorNodeId)
            const target = nodes.get(connection.targetRouteNodeId)
            const connector = edges.get(connection.connectorEdgeId)
            if (!anchor) {
              report('route-anchor-missing', `route anchor "${connection.anchorNodeId}" does not exist on this floor.`)
            } else if (anchor.floor !== floor.level) {
              report('route-anchor-floor', `route anchor "${anchor.id}" declares floor ${anchor.floor}, but this door belongs to floor ${floor.level}.`)
            }
            if (!target) {
              report('route-target-missing', `route target "${connection.targetRouteNodeId}" does not exist on this floor.`)
            } else if (target.floor !== floor.level) {
              report('route-target-floor', `route target "${target.id}" declares floor ${target.floor}, but this door belongs to floor ${floor.level}.`)
            }
            if (!connector) {
              report('route-connector-missing', `connector edge "${connection.connectorEdgeId}" does not exist on this floor.`)
            } else if (connection.anchorNodeId === connection.targetRouteNodeId
              || !((connector.from === connection.anchorNodeId && connector.to === connection.targetRouteNodeId)
                || (connector.to === connection.anchorNodeId && connector.from === connection.targetRouteNodeId))) {
              report('route-connector-endpoints', `connector edge "${connector.id}" does not join the assigned anchor and target nodes.`)
            }
            continue
          }

          // An explicit legacy destination is still a reference to validate.
          // A type alone was the old editor's default, not an assigned link.
          if (door.connectedToId !== undefined && typeof door.connectedToId !== 'string') {
            report('legacy-destination-invalid', 'assigned legacy destination must be a room or hallway ID string.')
            continue
          }
          if (typeof door.connectedToId === 'string' && door.connectedToId.trim().length > 0) {
            if (door.connectedToType === 'room') {
              if (!roomIds.has(door.connectedToId)) report('legacy-room-missing', `references non-existent room "${door.connectedToId}" on the same floor.`)
            } else if (door.connectedToType === 'hallway') {
              if (!hallwayIds.has(door.connectedToId)) report('legacy-hallway-missing', `references non-existent hallway "${door.connectedToId}" on the same floor.`)
            } else {
              report('legacy-type-missing', `destination "${door.connectedToId}" has no valid room or hallway type.`)
            }
            continue
          }

          // One floor summary replaces a warning per door until routes exist.
          // Assigned broken references above are always reported individually.
          if (!needsNetwork) report('route-not-assigned', 'no route assigned yet; connect this door to the indoor route network.', 'warning')
        }
      }
    }

    return issues
  },
}
