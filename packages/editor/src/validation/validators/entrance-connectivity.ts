import type { CampusDocument } from '@navi/core'
import type { ValidatorPlugin, ValidationIssue } from '../registry'

function hash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(36)
}

export const entranceConnectivityValidator: ValidatorPlugin = {
  id: 'entrance-connectivity',
  label: 'Entrance Connectivity',
  scope: 'entity',
  cost: 'cheap',
  validate(document: CampusDocument): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const roadIds = new Set(document.roads.map(r => r.id))

    for (const bld of document.buildings) {
      for (const floor of bld.floors) {
        for (const ent of floor.entrances) {
          if (ent.connectorRoadId && !roadIds.has(ent.connectorRoadId)) {
            issues.push({
              id: `entrance-connectivity:${ent.id}:${hash('missing-road')}`,
              severity: 'error',
              category: 'connectivity',
              scope: 'entity',
              entityId: ent.id,
              entityType: 'entrance',
              message: `Entrance "${ent.label}" references non-existent road "${ent.connectorRoadId}"`,
              fixable: false,
              validatorId: 'entrance-connectivity',
            })
          }
        }
      }
    }
    return issues
  },
}
