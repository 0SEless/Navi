import { describe, it, expect } from 'vitest'
import { roadConnectivityValidator } from './road-connectivity'
import type { CampusDocument } from '@navi/core'

function makeDoc(overrides?: Partial<CampusDocument>): CampusDocument {
  return {
    schemaVersion: 1,
    metadata: { name: 'test', description: '', lastModified: '', editorVersion: '1' },
    buildings: [{
      id: 'bld-1', name: 'A', code: '', category: 'academic', description: '',
      footprint: { points: [{ lat: 0, lng: 0 }] }, baseElevation: 0, height: 10,
      color: '#000', aliases: [], metadata: {},
      floors: [{
        id: 'flr-1', level: 0, label: 'G', elevation: 0,
        rooms: [], hallways: [], staircases: [], elevators: [],
        entrances: [{ id: 'ent-1', label: 'Main', position: { lat: 0, lng: 0 }, level: 0, type: 'main', hasQR: false, hasPanorama: false }],
        metadata: {},
      }],
    }],
    roads: [{ id: 'road-1', name: 'Main Rd', polyline: { points: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }] }, width: 5, surface: 'asphalt', type: 'arterial', metadata: {} }],
    panoramas: [], qrCheckpoints: [],
    ...overrides,
  }
}

describe('roadConnectivityValidator', () => {
  it('returns no issues for valid roads with >=2 points', () => {
    const doc = makeDoc()
    const issues = roadConnectivityValidator.validate(doc)
    expect(issues).toHaveLength(0)
  })

  it('flags road with fewer than 2 points', () => {
    const doc = makeDoc()
    doc.roads = [{ id: 'road-1', name: 'Short', polyline: { points: [] }, width: 5, surface: 'asphalt', type: 'arterial', metadata: {} }]
    const issues = roadConnectivityValidator.validate(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('warning')
  })

  it('flags road referencing non-existent entrance', () => {
    const doc = makeDoc()
    doc.roads = [{ id: 'road-1', name: 'Bad', polyline: { points: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }] }, width: 5, surface: 'asphalt', type: 'arterial', connectorEntranceId: 'nonexistent', metadata: {} }]
    const issues = roadConnectivityValidator.validate(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('error')
  })
})
