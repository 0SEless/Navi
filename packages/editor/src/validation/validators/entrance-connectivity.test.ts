import { describe, it, expect } from 'vitest'
import { entranceConnectivityValidator } from './entrance-connectivity'
import type { CampusDocument } from '@navi/core'

function makeDoc(overrides?: Partial<CampusDocument>): CampusDocument {
  return {
    schemaVersion: 1,
    metadata: { name: 'test', description: '', lastModified: '', editorVersion: '1' },
    buildings: [{
      id: 'bld-1', name: 'Building A', code: '', category: 'academic', description: '',
      footprint: { points: [{ lat: 0, lng: 0 }] }, baseElevation: 0, height: 10,
      color: '#000', aliases: [], metadata: {},
      floors: [{
        id: 'flr-1', level: 0, label: 'Ground', elevation: 0,
        rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], metadata: {},
      }],
    }],
    roads: [{ id: 'road-1', name: 'Main Rd', polyline: { points: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }] }, width: 5, surface: 'asphalt', type: 'arterial', metadata: {} }],
    panoramas: [], qrCheckpoints: [],
    ...overrides,
  }
}

describe('entranceConnectivityValidator', () => {
  it('returns no issues for valid entrances', () => {
    const doc = makeDoc()
    doc.buildings[0].floors[0].entrances = [{
      id: 'ent-1', label: 'Main Entrance',
      position: { lat: 0, lng: 0 }, level: 0, type: 'main',
      hasQR: false, hasPanorama: false,
      connectorRoadId: 'road-1',
    }]
    const issues = entranceConnectivityValidator.validate(doc)
    expect(issues).toHaveLength(0)
  })

  it('flags entrance referencing non-existent road', () => {
    const doc = makeDoc()
    doc.buildings[0].floors[0].entrances = [{
      id: 'ent-1', label: 'Bad', position: { lat: 0, lng: 0 }, level: 0, type: 'main',
      hasQR: false, hasPanorama: false,
      connectorRoadId: 'nonexistent',
    }]
    const issues = entranceConnectivityValidator.validate(doc)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('error')
    expect(issues[0].entityId).toBe('ent-1')
  })

  it('returns no issues when connectorRoadId is absent', () => {
    const doc = makeDoc()
    doc.buildings[0].floors[0].entrances = [{
      id: 'ent-1', label: 'Unconnected', position: { lat: 0, lng: 0 }, level: 0, type: 'main',
      hasQR: false, hasPanorama: false,
    }]
    const issues = entranceConnectivityValidator.validate(doc)
    expect(issues).toHaveLength(0)
  })
})
