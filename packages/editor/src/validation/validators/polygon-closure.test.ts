import { describe, it, expect } from 'vitest'
import { polygonClosureValidator } from './polygon-closure'
import { createDocument, createBuilding, createFloor, createRoom } from '../../../test-helpers'

describe('polygonClosureValidator', () => {
  it('returns no issues for a valid document', () => {
    const doc = createDocument()
    expect(polygonClosureValidator.validate(doc)).toHaveLength(0)
  })

  it('flags an unclosed building footprint', () => {
    const doc = createDocument()
    doc.buildings[0].footprint.points = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 0 },
    ]
    const issues = polygonClosureValidator.validate(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0].entityId).toBe(doc.buildings[0].id)
  })

  it('flags a building with fewer than 3 points', () => {
    const doc = createDocument()
    doc.buildings[0].footprint.points = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
    ]
    const issues = polygonClosureValidator.validate(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('fewer than 3')
  })

  it('flags an unclosed room polygon', () => {
    const doc = createDocument()
    const floor = createFloor({ rooms: [createRoom()] })
    floor.rooms[0].polygon.points = [
      { x: 0, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 0 },
    ]
    doc.buildings[0].floors = [floor]
    const issues = polygonClosureValidator.validate(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0].entityId).toBe(floor.rooms[0].id)
  })
})
