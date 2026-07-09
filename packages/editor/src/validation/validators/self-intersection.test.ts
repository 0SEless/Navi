import { describe, it, expect } from 'vitest'
import { selfIntersectionValidator } from './self-intersection'
import { createDocument, createBuilding, createFloor, createRoom } from '../../../test-helpers'

describe('selfIntersectionValidator', () => {
  it('returns no issues for a valid document', () => {
    const doc = createDocument()
    expect(selfIntersectionValidator.validate(doc)).toHaveLength(0)
  })

  it('detects self-intersecting building footprint (bowtie)', () => {
    const doc = createDocument()
    doc.buildings[0].footprint.points = [
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 0 },
      { lat: 0, lng: 0 },
    ]
    const issues = selfIntersectionValidator.validate(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0].entityId).toBe(doc.buildings[0].id)
  })

  it('detects self-intersecting room polygon', () => {
    const doc = createDocument()
    const floor = createFloor({ rooms: [createRoom()] })
    floor.rooms[0].polygon.points = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ]
    doc.buildings[0].floors = [floor]
    const issues = selfIntersectionValidator.validate(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0].entityId).toBe(floor.rooms[0].id)
  })
})
