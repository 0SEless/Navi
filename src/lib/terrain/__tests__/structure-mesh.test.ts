import { describe, expect, it } from 'vitest'
import { createTerrainSampler, toLatLng, type CampusDocument, type Structure } from '@navi/core'
import { buildStructuresMesh, presetFor } from '../structure-mesh'

const grid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })

function doc(structures: Structure[]): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: {}, buildings: [], roads: [], panoramas: [], qrCheckpoints: [],
    terrain: { reference: { name: 'Test', zeroMeaning: 'Sea level' }, grid, colorRange: { minM: 0, maxM: 40 } },
    structures,
  } as unknown as CampusDocument
}

const stair = (id: string, extra: Partial<Structure> = {}): Structure => ({
  id, form: 'stairs', presetId: 'plain-stair', width: 1.5, underneath: 'open', railings: 'both',
  start: { kind: 'ground', position: ll(0, 0) },
  end: { kind: 'ground', position: ll(3, 0) },
  heightOverride: { end: 1.4 },
  ...extra,
})

describe('buildStructuresMesh', () => {
  it('draws every structure into one mesh (9 floats per vertex)', () => {
    const b = stair('b', { start: { kind: 'ground', position: ll(10, 0) }, end: { kind: 'ground', position: ll(14, 2) } })
    const mesh = (structures: Structure[]) => { const d = doc(structures); return buildStructuresMesh(d, createTerrainSampler(d)!) }
    const meshA = mesh([stair('a')])
    const meshB = mesh([b])
    const both = mesh([stair('a'), b])
    expect(meshA.length).toBeGreaterThan(0)
    expect(both.length % 9).toBe(0)
    expect(both.length).toBe(meshA.length + meshB.length)
    expect(Array.from(both.subarray(meshA.length))).toEqual(Array.from(meshB))
  })

  it('a slab end whose building is gone and has no last position is left out', () => {
    const d = doc([stair('a', { start: { kind: 'slab', buildingId: 'gone', floorId: 'f', edgeIndex: 0, edgeT: 0 } })])
    expect(buildStructuresMesh(d, createTerrainSampler(d)!).length).toBe(0)
  })

  it('presets: the campus’s own first, then built-in, else the plain stair', () => {
    const own = { id: 'mine', name: 'Mine', form: 'stairs' as const, shape: { width: 2, underneath: 'open' as const, railings: 'none' as const }, look: { tread: 'wood', side: 'wood', under: 'wood', railing: 'steel', railingStyle: 'bars' as const } }
    const d = { ...doc([]), structurePresets: [own] } as CampusDocument
    expect(presetFor(d, 'mine').name).toBe('Mine')
    expect(presetFor(d, 'hillside-stair').name).toBe('Hillside stair')
    expect(presetFor(d, 'unknown').id).toBe('plain-stair')
  })
})
