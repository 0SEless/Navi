import type { CampusDocument } from '@navi/core'
import type { ValidatorPlugin, ValidationIssue, CampusEntityType } from '../registry'

function issue(id: string, labels: string[]): ValidationIssue {
  return {
    id: `duplicate-ids:${id}:${hash(id)}`,
    severity: 'error',
    category: 'duplicate',
    scope: 'campus',
    entityId: id,
    entityType: null,
    message: `Duplicate entity ID "${id}" (${labels.join(', ')})`,
    fixable: false,
    validatorId: 'duplicate-ids',
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
        addId(seen, floor.id, `Floor "${floor.label}"`)
        for (const room of floor.rooms) addId(seen, room.id, `Room "${room.name}"`)
        for (const hw of floor.hallways) addId(seen, hw.id, `Hallway "${hw.name}"`)
        for (const st of floor.staircases) addId(seen, st.id, `Staircase "${st.name}"`)
        for (const el of floor.elevators) addId(seen, el.id, `Elevator "${el.name}"`)
        for (const ent of floor.entrances) addId(seen, ent.id, `Entrance "${ent.label}"`)
      }
    }
    for (const road of document.roads) addId(seen, road.id, `Road "${road.id}"`)
    for (const pano of document.panoramas) addId(seen, pano.id, `Panorama "${pano.id}"`)
    for (const qr of document.qrCheckpoints) addId(seen, qr.id, `QR Checkpoint "${qr.id}"`)

    for (const [id, labels] of seen) {
      if (labels.length > 1) {
        issues.push(issue(id, labels))
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
