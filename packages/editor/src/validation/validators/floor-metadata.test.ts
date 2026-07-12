import { describe, it, expect } from 'vitest'
import { floorMetadataValidator } from './floor-metadata'
import type { CampusDocument } from '@navi/core'

function makeDoc(overrides?: Partial<CampusDocument>): CampusDocument {
  return {
    schemaVersion: 1,
    metadata: { name: 'test', description: '', lastModified: '', editorVersion: '1' },
    buildings: [{
      id: 'bld-1', name: 'Building A', code: '', category: 'academic', description: '',
      footprint: { points: [{ lat: 0, lng: 0 }] }, baseElevation: 0, height: 10,
      color: '#000', aliases: [], metadata: {},
      floors: [
        { id: 'flr-1', level: 0, label: 'Ground', elevation: 0, rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], metadata: {} },
      ],
    }],
    roads: [], panoramas: [], qrCheckpoints: [],
    ...overrides,
  }
}

describe('floorMetadataValidator', () => {
  it('returns no issues for valid floors', () => {
    const doc = makeDoc()
    const issues = floorMetadataValidator.validate(doc)
    expect(issues).toHaveLength(0)
  })

  it('flags floor with missing level', () => {
    const doc = makeDoc()
    doc.buildings[0].floors[0] = { id: 'flr-1', level: undefined as any, label: 'Bad', elevation: 0, rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], metadata: {} }
    const issues = floorMetadataValidator.validate(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('warning')
  })
})
