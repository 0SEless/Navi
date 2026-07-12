import { describe, it, expect } from 'vitest'
import { referenceValidator } from './reference'
import type { CampusDocument } from '@navi/core'

function makeDoc(overrides?: Partial<CampusDocument>): CampusDocument {
  return {
    schemaVersion: 1,
    metadata: { name: 'test', description: '', lastModified: '', editorVersion: '1' },
    buildings: [{
      id: 'bld-1', name: 'A', code: '', category: 'academic', description: '',
      footprint: { points: [{ lat: 0, lng: 0 }] }, baseElevation: 0, height: 10,
      color: '#000', aliases: [], metadata: {},
      floors: [{ id: 'flr-1', level: 0, label: 'G', elevation: 0, rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], metadata: {} }],
    }],
    roads: [], panoramas: [], qrCheckpoints: [],
    ...overrides,
  }
}

describe('referenceValidator', () => {
  it('returns no issues for valid document', () => {
    const doc = makeDoc()
    const issues = referenceValidator.validate(doc)
    expect(issues).toHaveLength(0)
  })
})
