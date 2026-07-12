import type { CampusDocument } from '@navi/core'
import type { ValidatorPlugin, ValidationIssue } from '../registry'

export const duplicateIdsValidator: ValidatorPlugin = {
  id: 'duplicate-ids',
  label: 'Duplicate IDs',
  scope: 'campus',
  cost: 'cheap',
  validate(document: CampusDocument): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const seen = new Map<string, string[]>()

    for (const bld of document.buildings) {
      addId(seen, bld.id, `Building "${bld.name}"`)
      for (const floor of bld.floors) {
        addId(seen, floor.id, `Floor "${floor.name}"`)
        for (const room of floor.rooms) {
          addId(seen, room.id, `Room "${room.name}"`)
        }
      }
    }

    for (const [id, labels] of seen) {
      if (labels.length > 1) {
        issues.push({
          id: `dup-${id}`,
          severity: 'error',
          category: 'duplicate',
          scope: 'campus',
          entityId: id,
          entityType: null,
          message: `Duplicate entity ID "${id}" (${labels.join(', ')})`,
          fixable: false,
          validatorId: 'duplicate-ids',
        })
      }
    }

    return issues
  },
}

function addId(seen: Map<string, string[]>, id: string, label: string): void {
  const entries = seen.get(id)
  if (entries) {
    entries.push(label)
  } else {
    seen.set(id, [label])
  }
}
