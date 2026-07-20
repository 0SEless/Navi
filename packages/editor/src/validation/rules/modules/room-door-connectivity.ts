import type { ValidationRule, ValidationContext } from '../types'
import type { ValidationIssue } from '../../snapshot'

function hash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(36)
}

export const roomDoorConnectivityRule: ValidationRule = {
  ruleId: 'room-door-connectivity',
  description: 'Room Door Connectivity',
  category: 'connectivity',
  defaultSeverity: 'error',
  profiles: ['draft', 'publish', 'strict'],
  affinity: 'entity:room_door',

  execute(context: ValidationContext): ReadonlyArray<ValidationIssue> {
    const issues: ValidationIssue[] = []

    for (const bld of context.document.buildings) {
      for (const floor of bld.floors) {
        const roomIds = new Set(floor.rooms.map(r => r.id))
        const hallwayIds = new Set(floor.hallways.map(h => h.id))

        for (const room of floor.rooms) {
          for (const door of room.roomDoors) {
            if (door.connectedToType === 'room' && !roomIds.has(door.connectedToId)) {
              issues.push({
                issueId: `room-door-connectivity:${door.roomId}:${hash('missing-room-' + door.connectedToId)}`,
                ruleId: 'room-door-connectivity',
                severity: 'error',
                message: `Room "${door.roomId}" door references non-existent room "${door.connectedToId}" on same floor`,
                targets: [{ entityId: door.roomId, entityType: 'room' }],
              })
            }
            if (door.connectedToType === 'hallway' && !hallwayIds.has(door.connectedToId)) {
              issues.push({
                issueId: `room-door-connectivity:${door.roomId}:${hash('missing-hallway-' + door.connectedToId)}`,
                ruleId: 'room-door-connectivity',
                severity: 'error',
                message: `Room "${door.roomId}" door references non-existent hallway "${door.connectedToId}" on same floor`,
                targets: [{ entityId: door.roomId, entityType: 'room' }],
              })
            }
          }
        }
      }
    }

    return issues
  },
}
