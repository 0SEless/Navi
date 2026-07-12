import type { CampusDocument } from '@navi/core'
import { latLngEquals, localCoordEquals } from '@navi/core'
import type { ValidatorPlugin, ValidationIssue } from '../registry'

export const polygonClosureValidator: ValidatorPlugin = {
  id: 'polygon-closure',
  label: 'Polygon Closure',
  scope: 'entity',
  cost: 'cheap',
  validate(document: CampusDocument): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    for (const bld of document.buildings) {
      if (bld.footprint.points.length < 3) {
        issues.push({
          id: `pc-${bld.id}`,
          severity: 'error',
          category: 'geometry',
          scope: 'entity',
          entityId: bld.id,
          entityType: 'building',
          message: `Building "${bld.name}" footprint has fewer than 3 points`,
          fixable: false,
          validatorId: 'polygon-closure',
        })
        continue
      }
      const first = bld.footprint.points[0]
      const last = bld.footprint.points[bld.footprint.points.length - 1]
      if (!latLngEquals(first, last)) {
        issues.push({
          id: `pc-${bld.id}`,
          severity: 'error',
          category: 'geometry',
          scope: 'entity',
          entityId: bld.id,
          entityType: 'building',
          message: `Building "${bld.name}" footprint is not closed (first point ≠ last point)`,
          fixable: false,
          validatorId: 'polygon-closure',
        })
      }

      for (const floor of bld.floors) {
        for (const room of floor.rooms) {
          if (room.polygon.points.length < 3) {
            issues.push({
              id: `pc-${room.id}`,
              severity: 'error',
              category: 'geometry',
              scope: 'entity',
              entityId: room.id,
              entityType: 'room',
              message: `Room "${room.name}" has fewer than 3 points`,
              fixable: false,
              validatorId: 'polygon-closure',
            })
            continue
          }
          const rf = room.polygon.points[0]
          const rl = room.polygon.points[room.polygon.points.length - 1]
          if (!localCoordEquals(rf, rl)) {
            issues.push({
              id: `pc-${room.id}`,
              severity: 'error',
              category: 'geometry',
              scope: 'entity',
              entityId: room.id,
              entityType: 'room',
              message: `Room "${room.name}" polygon is not closed`,
              fixable: false,
              validatorId: 'polygon-closure',
            })
          }
        }
      }
    }

    return issues
  },
}
