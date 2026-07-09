import { describe, it, expect } from 'vitest'
import { serializeDocument, deserializeDocument, roundTrip } from './serializer'
import type { CampusDocument } from '../types'
import type { BuildingCategory } from '../types'

function makeTestDoc(): CampusDocument {
  return {
    schemaVersion: 1,
    metadata: {
      name: 'ASU Ibajay',
      description: 'Test campus',
      lastModified: new Date('2026-07-08').toISOString(),
      editorVersion: '0.1.0',
    },
    buildings: [
      {
        id: 'bld-main',
        name: 'Main Building',
        code: 'MAIN',
        category: 'academic' as BuildingCategory,
        description: 'Main academic building',
        footprint: {
          points: [
            { lat: 33.42, lng: -111.93 },
            { lat: 33.43, lng: -111.93 },
            { lat: 33.43, lng: -111.92 },
            { lat: 33.42, lng: -111.92 },
            { lat: 33.42, lng: -111.93 },
          ],
        },
        baseElevation: 0,
        height: 15,
        floors: [
          {
            id: 'flr-g',
            level: 0,
            label: 'Ground Floor',
            elevation: 0,
            rooms: [
              {
                id: 'rm-101',
                name: 'Room 101',
                number: '101',
                category: 'classroom',
                polygon: {
                  points: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                    { x: 10, y: 8 },
                    { x: 0, y: 8 },
                    { x: 0, y: 0 },
                  ],
                },
                capacity: 40,
                metadata: {},
              },
            ],
            hallways: [],
            staircases: [],
            elevators: [],
            entrances: [
              {
                id: 'ent-main',
                label: 'Main Entrance',
                position: { lat: 33.425, lng: -111.925 },
                level: 0,
                type: 'main',
                hasQR: true,
                hasPanorama: false,
              },
            ],
          },
        ],
        color: '#336699',
        aliases: [],
        metadata: {},
      },
    ],
    roads: [],
    panoramas: [],
    qrCheckpoints: [],
  }
}

describe('serialization', () => {
  it('serializes and deserializes round-trip', () => {
    const doc = makeTestDoc()
    const result = roundTrip(doc)
    expect(result.success).toBe(true)
  })

  it('throws on invalid JSON', () => {
    expect(() => deserializeDocument('not json')).toThrow()
  })

  it('throws on missing buildings array', () => {
    expect(() => deserializeDocument('{"schemaVersion":1,"metadata":{},"roads":[],"panoramas":[],"qrCheckpoints":[]}')).toThrow('buildings')
  })

  it('preserves all fields through round-trip', () => {
    const doc = makeTestDoc()
    const json = serializeDocument(doc)
    const restored = deserializeDocument(json)

    expect(restored.metadata.name).toBe('ASU Ibajay')
    expect(restored.buildings).toHaveLength(1)
    expect(restored.buildings[0].floors).toHaveLength(1)
    expect(restored.buildings[0].floors[0].rooms).toHaveLength(1)
    expect(restored.buildings[0].floors[0].rooms[0].name).toBe('Room 101')
    expect(restored.buildings[0].floors[0].rooms[0].polygon.points).toHaveLength(5)
    expect(restored.buildings[0].floors[0].entrances).toHaveLength(1)
  })

  it('coordinate types survive round-trip', () => {
    const doc = makeTestDoc()
    const json = serializeDocument(doc)
    const restored = deserializeDocument(json)

    const room = restored.buildings[0].floors[0].rooms[0]
    expect(room.polygon.points[0]).toHaveProperty('x')
    expect(room.polygon.points[0]).toHaveProperty('y')
    expect(room.polygon.points[0]).not.toHaveProperty('lat')

    const entrance = restored.buildings[0].floors[0].entrances[0]
    expect(entrance.position).toHaveProperty('lat')
    expect(entrance.position).toHaveProperty('lng')
  })
})
