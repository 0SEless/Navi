import { describe, it, expect } from 'vitest'
import { duplicateIdsValidator } from './duplicate-ids'
import { createDocument, createBuilding, createFloor, createRoom } from '../../../test-helpers'

describe('duplicateIdsValidator', () => {
  it('returns no issues for a valid document', () => {
    const doc = createDocument()
    expect(duplicateIdsValidator.validate(doc)).toHaveLength(0)
  })

  it('detects duplicate building IDs', () => {
    const doc = createDocument()
    doc.buildings[1] = createBuilding({ id: doc.buildings[0].id })
    const issues = duplicateIdsValidator.validate(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('error')
    expect(issues[0].message).toContain(doc.buildings[0].id)
  })

  it('detects duplicate room IDs across floors', () => {
    const id = 'dup-room'
    const room = createRoom({ id })
    const floor1 = createFloor({ id: 'flr-1', rooms: [room] })
    const floor2 = createFloor({ id: 'flr-2', rooms: [createRoom({ id })] })
    const bld = createBuilding({ floors: [floor1, floor2] })
    const doc = createDocument({ buildings: [bld] })
    const issues = duplicateIdsValidator.validate(doc)
    expect(issues).toHaveLength(1)
  })
})
