import { describe, it, expect } from 'vitest'
import type { CampusDocument } from './document'

function makeMinimalDoc(): CampusDocument {
  return {
    schemaVersion: 1,
    metadata: {
      name: 'Test Campus',
      description: 'Minimal test',
      lastModified: new Date().toISOString(),
      editorVersion: '0.1.0',
    },
    buildings: [],
    roads: [],
    panoramas: [],
    qrCheckpoints: [],
  }
}

describe('CampusDocument', () => {
  it('creates an empty document', () => {
    const doc = makeMinimalDoc()
    expect(doc.schemaVersion).toBe(1)
    expect(doc.buildings).toEqual([])
  })

  it('accepts a building with floors', () => {
    const doc = makeMinimalDoc()
    doc.buildings.push({
      id: 'bld-1',
      name: 'Engineering',
      code: 'ENG',
      category: 'academic',
      description: '',
      footprint: { points: [{ lat: 33.42, lng: -111.93 }, { lat: 33.43, lng: -111.93 }, { lat: 33.43, lng: -111.92 }, { lat: 33.42, lng: -111.92 }, { lat: 33.42, lng: -111.93 }] },
      baseElevation: 0,
      height: 20,
      floors: [{
        id: 'flr-1',
        level: 0,
        label: 'Ground Floor',
        elevation: 0,
        rooms: [],
        hallways: [],
        staircases: [],
        elevators: [],
        metadata: {},
        entrances: [{
          id: 'ent-1',
          label: 'Main Entrance',
          position: { lat: 33.425, lng: -111.925 },
          level: 0,
          type: 'main',
          hasQR: true,
          hasPanorama: false,
        }],
      }],
      color: '#336699',
      aliases: [],
      metadata: {},
    })
    expect(doc.buildings).toHaveLength(1)
    expect(doc.buildings[0].floors).toHaveLength(1)
    expect(doc.buildings[0].floors[0].entrances).toHaveLength(1)
  })
})
