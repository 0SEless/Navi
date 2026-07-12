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

export const floorMetadataValidator: ValidatorPlugin = {
  id: 'floor-metadata',
  label: 'Floor Metadata',
  scope: 'building',
  cost: 'cheap',
  validate(document: CampusDocument): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    for (const bld of document.buildings) {
      for (const floor of bld.floors) {
        if (!floor.id || floor.id.trim() === '') {
          issues.push({
            id: `floor-metadata:${floor.id ?? 'unknown'}:${hash('missing-id')}`,
            severity: 'error',
            category: 'metadata',
            scope: 'floor',
            entityId: floor.id,
            entityType: 'floor',
            message: `Floor in building "${bld.name}" has no ID`,
            fixable: false,
            validatorId: 'floor-metadata',
          })
        }
        if (typeof floor.level !== 'number') {
          issues.push({
            id: `floor-metadata:${floor.id}:${hash('missing-level')}`,
            severity: 'warning',
            category: 'metadata',
            scope: 'floor',
            entityId: floor.id,
            entityType: 'floor',
            message: `Floor "${floor.label}" has no level number`,
            fixable: false,
            validatorId: 'floor-metadata',
          })
        }
      }
    }
    return issues
  },
}
