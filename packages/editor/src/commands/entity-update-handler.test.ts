import { describe, it, expect } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { entityUpdateHandler } from './entity-update-handler'

function createDoc(): CampusDocument {
  return {
    schemaVersion: 1,
    version: 0,
    metadata: { name: 'test', description: '', lastModified: '', editorVersion: '0.1.0' },
    buildings: [{
      id: 'bld-1', name: 'Main', code: 'M', category: 'academic', description: '',
      footprint: { points: [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 }, { lat: 0.001, lng: 0.001 }, { lat: 0.001, lng: 0 }, { lat: 0, lng: 0 }] },
      baseElevation: 0, height: 20, color: '#4A90D9', aliases: [], metadata: {},
      floors: [{
        id: 'flr-1', level: 0, label: 'Ground', elevation: 0,
        rooms: [{
          id: 'rm-1', name: 'R1', number: '101', category: 'classroom',
          polygon: { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] },
          metadata: {},
        }],
        hallways: [], staircases: [], elevators: [], entrances: [], metadata: {},
      }],
    }],
    roads: [{ id: 'rd-1', name: 'Road', polyline: { points: [{ lat: 0, lng: 0 }, { lat: 0.001, lng: 0.001 }] }, width: 6, surface: 'paved', type: 'service', metadata: {} }],
    panoramas: [], qrCheckpoints: [],
  }
}

describe('entityUpdateHandler', () => {
  it('updates a building property', () => {
    const doc = createDoc()
    const result = entityUpdateHandler.execute(doc, { entityId: 'bld-1', changes: { name: 'Renamed' } })
    expect(result.success).toBe(true)
    expect(doc.buildings[0].name).toBe('Renamed')
  })

  it('updates a room property', () => {
    const doc = createDoc()
    const result = entityUpdateHandler.execute(doc, { entityId: 'rm-1', changes: { name: 'Lab 101' } })
    expect(result.success).toBe(true)
    expect(doc.buildings[0].floors[0].rooms[0].name).toBe('Lab 101')
  })

  it('updates a road property', () => {
    const doc = createDoc()
    const result = entityUpdateHandler.execute(doc, { entityId: 'rd-1', changes: { width: 10 } })
    expect(result.success).toBe(true)
    expect(doc.roads[0].width).toBe(10)
  })

  it('fails for unknown entity', () => {
    const doc = createDoc()
    const result = entityUpdateHandler.execute(doc, { entityId: 'nope', changes: { name: 'X' } })
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('fails without entityId', () => {
    const doc = createDoc()
    const result = entityUpdateHandler.execute(doc, { changes: { name: 'X' } })
    expect(result.success).toBe(false)
  })

  it('generates inverse command', () => {
    const doc = createDoc()
    const result = entityUpdateHandler.execute(doc, { entityId: 'bld-1', changes: { name: 'New' } })
    const inverse = entityUpdateHandler.inverse!({ entityId: 'bld-1', changes: { name: 'New' } }, result)
    expect(inverse).not.toBeNull()
    expect(inverse.payload.entityId).toBe('bld-1')
    expect((inverse.payload.changes as any).name).toBe('Main')
  })
})
