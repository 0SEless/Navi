import type { CampusDocument } from '@navi/core'
import { latLngEquals, localCoordEquals } from '@navi/core'
import type { ValidatorPlugin, ValidationIssue } from '../registry'

function issue(entityId: string, entityType: 'building' | 'room', message: string, index: number): ValidationIssue {
  return {
    id: `polygon-closure:${entityId}:${hash(message)}`,
    severity: 'error',
    category: 'geometry',
    scope: 'entity',
    entityId,
    entityType,
    message,
    fixable: false,
    validatorId: 'polygon-closure',
  }
}

function hash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(36)
}

export const polygonClosureValidator: ValidatorPlugin = {
  id: 'polygon-closure',
  label: 'Polygon Closure',
  scope: 'entity',
  cost: 'cheap',
  validate(document: CampusDocument): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    let idx = 0
    for (const bld of document.buildings) {
      if (bld.footprint.points.length < 3) {
        issues.push(issue(bld.id, 'building', `Building "${bld.name}" footprint has fewer than 3 points`, idx++))
        continue
      }
      const first = bld.footprint.points[0]
      const last = bld.footprint.points[bld.footprint.points.length - 1]
      if (!latLngEquals(first, last)) {
        issues.push(issue(bld.id, 'building', `Building "${bld.name}" footprint is not closed (first point ≠ last point)`, idx++))
      }
      for (const floor of bld.floors) {
        for (const room of floor.rooms) {
          if (room.polygon.points.length < 3) {
            issues.push(issue(room.id, 'room', `Room "${room.name}" has fewer than 3 points`, idx++))
            continue
          }
          const rf = room.polygon.points[0]
          const rl = room.polygon.points[room.polygon.points.length - 1]
          if (!localCoordEquals(rf, rl)) {
            issues.push(issue(room.id, 'room', `Room "${room.name}" polygon is not closed`, idx++))
          }
        }
      }
    }
    return issues
  },
}
