import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { scopedContentChecksum } from './scoped-campus-save'
import { applyScopedCampusSnapshot, type ScopedCampusSnapshot } from './scoped-campus-snapshot'

function fixture(): CampusDocument {
  return {
    schemaVersion: 1,
    version: 1,
    metadata: { campusId: 'snapshot-campus', name: 'Synthetic campus', description: '', lastModified: '', editorVersion: 'test' },
    buildings: [
      { id: 'building-a', name: 'Old name', code: 'A', category: 'academic', description: '', footprint: { points: [] }, baseElevation: 0, height: 10, floors: [], verticalConnectors: [], color: '#123456', aliases: [], metadata: {} },
      { id: 'building-b', name: 'Unchanged building', code: 'B', category: 'academic', description: '', footprint: { points: [] }, baseElevation: 0, height: 10, floors: [], verticalConnectors: [], color: '#654321', aliases: [], metadata: {} },
    ],
    roads: [],
    panoramas: [],
    qrCheckpoints: [],
    boundary: { points: [{ lat: 0, lng: 0 }, { lat: 1, lng: 0 }, { lat: 1, lng: 1 }] },
  }
}

describe('applyScopedCampusSnapshot', () => {
  it('reconstructs committed scopes on the current document and leaves unrelated scopes unchanged', async () => {
    const campusId = 'snapshot-campus'
    const scopes = {
      'building:building-a': {
        scope: { kind: 'building' as const, id: 'building-a' }, revision: 1,
        content: { id: 'building-a', name: 'Committed name', code: 'A', category: 'academic', description: '', footprint: { points: [] }, baseElevation: 0, height: 10, floors: [], verticalConnectors: [], color: '#123456', aliases: [], metadata: {} },
      },
      [`routing:${campusId}`]: {
        scope: { kind: 'routing' as const, id: campusId }, revision: 0,
        content: { roads: [{ id: 'road-committed', name: 'Committed road' }], roadJunctions: [], separatedCrossings: [] },
      },
      [`terrain:${campusId}`]: {
        scope: { kind: 'terrain' as const, id: campusId }, revision: 0,
        content: {
          boundary: { points: [{ lat: 2, lng: 2 }, { lat: 3, lng: 2 }, { lat: 3, lng: 3 }] }, areas: [],
          terrainAreas: [{ id: 'terrain-1', name: 'North lawn', points: [{ lat: 2.1, lng: 2.1 }, { lat: 2.1, lng: 2.2 }, { lat: 2.2, lng: 2.2 }], color: '#22aa66', elevationMeters: 2.75 }],
          terrainVerticalDatum: { kind: 'campus-local', name: 'Synthetic local datum', zeroReference: 'Benchmark zero', elevationStatus: 'authored-not-surveyed' },
        },
      },
    }
    const storedScopes = Object.fromEntries(Object.entries(scopes).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, {
      ...value,
      contentChecksum: scopedContentChecksum(value.content),
    }]))
    const snapshot: ScopedCampusSnapshot = {
      campusId,
      revision: 1,
      checksum: scopedContentChecksum({ campusId, revision: 1, scopes: storedScopes }),
      scopes: storedScopes,
    }

    const result = await applyScopedCampusSnapshot(fixture(), snapshot)

    expect(result.buildings.find((building) => building.id === 'building-a')?.name).toBe('Committed name')
    expect(result.buildings.find((building) => building.id === 'building-b')?.name).toBe('Unchanged building')
    expect(result.roads).toMatchObject([{ id: 'road-committed' }])
    expect(result.boundary?.points[0]).toEqual({ lat: 2, lng: 2 })
    expect(result.terrainAreas?.[0]).toEqual({ id: 'terrain-1', name: 'North lawn', points: [{ lat: 2.1, lng: 2.1 }, { lat: 2.1, lng: 2.2 }, { lat: 2.2, lng: 2.2 }], color: '#22aa66', elevationMeters: 2.75 })
    expect(result.terrainVerticalDatum).toEqual({ kind: 'campus-local', name: 'Synthetic local datum', zeroReference: 'Benchmark zero', elevationStatus: 'authored-not-surveyed' })
    expect(result.areas).toEqual([])
  })

  it('rejects a snapshot whose campus or scope checksum does not match', async () => {
    const campusId = 'snapshot-campus'
    const snapshot = {
      campusId,
      revision: 1,
      checksum: '0'.repeat(64),
      scopes: {
        [`terrain:${campusId}`]: {
          scope: { kind: 'terrain', id: campusId }, revision: 1,
          contentChecksum: '0'.repeat(64), content: { boundary: null, areas: [] },
        },
      },
    } as ScopedCampusSnapshot

    await expect(applyScopedCampusSnapshot(fixture(), snapshot)).rejects.toThrow(/checksum/i)
  })

  it('keeps absent optional terrain fields absent when reconstructing a legacy terrain scope', async () => {
    const campusId = 'snapshot-campus'
    const content = { boundary: null, areas: [] }
    const scopes = {
      [`terrain:${campusId}`]: {
        scope: { kind: 'terrain' as const, id: campusId }, revision: 1,
        content, contentChecksum: scopedContentChecksum(content),
      },
    }
    const snapshot: ScopedCampusSnapshot = {
      campusId, revision: 1,
      checksum: scopedContentChecksum({ campusId, revision: 1, scopes }), scopes,
    }
    const result = await applyScopedCampusSnapshot(fixture(), snapshot)
    expect(result.terrainAreas).toBeUndefined()
    expect(result.terrainVerticalDatum).toBeUndefined()
  })
})
