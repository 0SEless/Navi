import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { deriveScopedDocumentChanges } from './scoped-change-detection'

function makeDocument(): CampusDocument {
  return {
    schemaVersion: 1,
    version: 1,
    metadata: { campusId: 'campus-1', name: 'Campus', description: '', lastModified: '2026-10-30T00:00:00.000Z', editorVersion: '1.5' },
    buildings: [{
      id: 'building-1', name: 'Library', floors: [{
        id: 'floor-1', level: 0, rooms: [{ id: 'room-1', name: 'A' }], walls: [], doors: [], entrances: [],
        routeNetwork: { nodes: [{ id: 'route-node-1', type: 'walk', position: { x: 0, y: 0 }, floor: 0 }], edges: [] },
      }],
      verticalTransitions: [],
    } as unknown as CampusDocument['buildings'][number]],
    roads: [{ id: 'road-1', name: 'Main', polyline: [{ lat: 1, lng: 2 }, { lat: 2, lng: 3 }], width: 2, surface: 'paved', type: 'road', metadata: {} } as unknown as CampusDocument['roads'][number]],
    panoramas: [], qrCheckpoints: [], areas: [], boundary: { points: [{ lat: 1, lng: 2 }] },
  } as CampusDocument
}

const clone = (document: CampusDocument) => structuredClone(document)

describe('scoped document change detection', () => {
  it('classifies room, wall, door and entrance edits under the owning building id', () => {
    const before = makeDocument()
    const after = clone(before)
    after.buildings[0].floors[0].rooms[0].name = 'Study room'
    after.buildings[0].floors[0].walls = [{ id: 'wall-1' } as never]
    after.buildings[0].floors[0].doors = [{ id: 'door-1' } as never]
    after.buildings[0].floors[0].entrances = [{ id: 'entrance-1' } as never]

    const result = deriveScopedDocumentChanges(before, after, 'campus-1')
    expect(result.status).toBe('classified')
    if (result.status !== 'classified') return
    expect(result.multiScope).toBe(false)
    expect(result.operations.map((operation) => operation.scope)).toEqual([{ kind: 'building', id: 'building-1' }])
  })

  it('classifies floor route-network edits under a building routing scope', () => {
    const before = makeDocument()
    const after = clone(before)
    after.buildings[0].floors[0].routeNetwork!.nodes[0].position.x = 4

    const result = deriveScopedDocumentChanges(before, after, 'campus-1')
    expect(result).toMatchObject({ status: 'classified', multiScope: false, operations: [{ scope: { kind: 'routing', id: 'building-1' } }] })
  })

  it('returns an explicit multi-scope batch for simultaneous building and road edits', () => {
    const before = makeDocument()
    const after = clone(before)
    after.buildings[0].name = 'Learning Center'
    after.roads[0].width = 3

    const result = deriveScopedDocumentChanges(before, after, 'campus-1')
    expect(result.status).toBe('classified')
    if (result.status !== 'classified') return
    expect(result.multiScope).toBe(true)
    expect(result.operations.map((operation) => operation.scope)).toEqual([
      { kind: 'building', id: 'building-1' },
      { kind: 'routing', id: 'campus-1' },
    ])
  })

  it('deduplicates unchanged content and ignores editor version and save timestamps', () => {
    const before = makeDocument()
    const after = clone(before)
    after.version = 2
    after.metadata.lastModified = '2026-10-30T00:01:00.000Z'
    after.metadata.editorVersion = '1.5.1'

    expect(deriveScopedDocumentChanges(before, after, 'campus-1')).toEqual({ status: 'unchanged' })
  })

  it('classifies boundary and area changes as terrain', () => {
    const before = makeDocument()
    const after = clone(before)
    after.areas = [{ id: 'area-1', name: 'Plaza', points: [{ lat: 1, lng: 2 }], color: '#ffffff' }]

    expect(deriveScopedDocumentChanges(before, after, 'campus-1')).toMatchObject({
      status: 'classified', operations: [{ scope: { kind: 'terrain', id: 'campus-1' } }],
    })
  })

  it('classifies authored terrain area and datum changes only into the existing terrain scope', () => {
    const before = makeDocument()
    const after = clone(before)
    after.terrainVerticalDatum = {
      kind: 'campus-local', name: 'Synthetic local datum', zeroReference: 'Benchmark zero', elevationStatus: 'authored-not-surveyed',
    }
    after.terrainAreas = [{
      id: 'terrain-1', name: 'North lawn', points: [{ lat: 1, lng: 2 }, { lat: 1, lng: 2.001 }, { lat: 1.001, lng: 2.001 }],
      color: '#22aa66', elevationMeters: 3.25,
    }]

    const result = deriveScopedDocumentChanges(before, after, 'campus-1')
    expect(result).toMatchObject({ status: 'classified', multiScope: false, operations: [{ scope: { kind: 'terrain', id: 'campus-1' } }] })
    if (result.status !== 'classified') return
    expect(result.operations).toHaveLength(1)
    expect(result.operations[0].content).toMatchObject({ terrainAreas: after.terrainAreas, terrainVerticalDatum: after.terrainVerticalDatum })
  })

  it('rejects unsupported panorama changes without returning partial operations', () => {
    const before = makeDocument()
    const after = clone(before)
    after.panoramas = [{ id: 'pano-1', label: 'View', position: { lat: 1, lng: 2 }, heading: 0, imageAssetId: 'asset', hotspots: [] } as never]

    expect(deriveScopedDocumentChanges(before, after, 'campus-1')).toMatchObject({ status: 'rejected', code: 'UNSUPPORTED_CHANGE' })
  })

  it('rejects a document whose campus identity does not match the active campus', () => {
    const before = makeDocument()
    const after = clone(before)
    after.buildings[0].name = 'Changed'

    expect(deriveScopedDocumentChanges(before, after, 'different-campus')).toMatchObject({ status: 'rejected', code: 'CAMPUS_IDENTITY_MISMATCH' })
  })

  it('rejects duplicate building identities instead of guessing ownership', () => {
    const before = makeDocument()
    const after = clone(before)
    after.buildings.push(structuredClone(after.buildings[0]))
    after.buildings[1].name = 'Ambiguous duplicate'

    expect(deriveScopedDocumentChanges(before, after, 'campus-1')).toMatchObject({ status: 'rejected', code: 'AMBIGUOUS_SCOPE' })
  })
})
