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

export const roadConnectivityValidator: ValidatorPlugin = {
  id: 'road-connectivity',
  label: 'Road Connectivity',
  scope: 'entity',
  cost: 'cheap',
  validate(document: CampusDocument): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const entranceIds = new Set<string>()
    for (const bld of document.buildings) {
      for (const floor of bld.floors) {
        for (const ent of floor.entrances) entranceIds.add(ent.id)
      }
    }

    for (const road of document.roads) {
      if (!road.polyline || !road.polyline.points || road.polyline.points.length < 2) {
        issues.push({
          id: `road-connectivity:${road.id}:${hash('dangling')}`,
          severity: 'warning',
          category: 'connectivity',
          scope: 'entity',
          entityId: road.id,
          entityType: 'road',
          message: `Road "${road.id}" has fewer than 2 points (dangling road)`,
          fixable: false,
          validatorId: 'road-connectivity',
        })
      }
      if (road.connectorEntranceId && !entranceIds.has(road.connectorEntranceId)) {
        issues.push({
          id: `road-connectivity:${road.id}:${hash('missing-entrance')}`,
          severity: 'error',
          category: 'connectivity',
          scope: 'entity',
          entityId: road.id,
          entityType: 'road',
          message: `Road "${road.id}" references non-existent entrance "${road.connectorEntranceId}"`,
          fixable: false,
          validatorId: 'road-connectivity',
        })
      }
    }
    return issues
  },
}
