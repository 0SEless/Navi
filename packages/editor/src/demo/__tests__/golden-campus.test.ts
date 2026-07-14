import { describe, it, expect } from 'vitest'
import { createGoldenCampus } from '../golden-campus'

describe('Golden Campus', () => {
  it('creates a campus with 1 building', () => {
    const campus = createGoldenCampus()
    expect(campus.buildings).toHaveLength(1)
  })

  it('has building named "Building A"', () => {
    const campus = createGoldenCampus()
    expect(campus.buildings[0].name).toBe('Building A')
  })

  it('has 1 floor', () => {
    const campus = createGoldenCampus()
    expect(campus.buildings[0].floors).toHaveLength(1)
  })

  it('has 2 rooms (101, 102)', () => {
    const campus = createGoldenCampus()
    const rooms = campus.buildings[0].floors[0].rooms
    expect(rooms).toHaveLength(2)
    expect(rooms.map(r => r.name)).toContain('Room 101')
    expect(rooms.map(r => r.name)).toContain('Room 102')
  })

  it('has 1 hallway', () => {
    const campus = createGoldenCampus()
    const hallways = campus.buildings[0].floors[0].hallways
    expect(hallways).toHaveLength(1)
  })

  it('has 1 entrance', () => {
    const campus = createGoldenCampus()
    const entrances = campus.buildings[0].floors[0].entrances
    expect(entrances).toHaveLength(1)
  })

  it('has valid schemaVersion', () => {
    const campus = createGoldenCampus()
    expect(campus.schemaVersion).toBe(1)
  })
})
