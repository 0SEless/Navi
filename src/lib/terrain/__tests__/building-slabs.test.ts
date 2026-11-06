import { describe, expect, it } from 'vitest'
import { createTerrainSampler, toLatLng, type Building, type CampusDocument, type TerrainBaseSource } from '@navi/core'
import { buildSlabFeatures } from '../building-slabs'

const grid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })

function plane(h: number): TerrainBaseSource {
  const v = (x: number, y: number): [number, number, number] => {
    const p = ll(x, y)
    return [p.lat, p.lng, h]
  }
  return { kind: 'mesh', vertices: [v(-200, -200), v(200, -200), v(200, 200), v(-200, 200)], triangles: [[0, 1, 2], [0, 2, 3]], sourceNote: 'test' }
}

const floor = (id: string, elevation: number) => ({ id, level: 0, label: id, elevation, height: 3.5, rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], metadata: {} })

function doc(): CampusDocument {
  const ring = [ll(0, 0), ll(20, 0), ll(20, 10), ll(0, 10), ll(0, 0)]
  const b = {
    id: 'b1', name: 'Hall', code: 'H', category: 'academic', description: '', footprint: { points: ring }, baseElevation: 12, height: 10.5,
    floors: [floor('f1', 0), floor('f2', 3.5), floor('f3', 7)], verticalConnectors: [], color: '#000', aliases: [], metadata: {},
  } as unknown as Building
  return {
    schemaVersion: 1, version: 0, metadata: {}, roads: [], panoramas: [], qrCheckpoints: [], buildings: [b],
    terrain: { reference: { name: 'T', zeroMeaning: 'z' }, grid, base: plane(10), colorRange: { minM: 0, maxM: 40 } },
  } as unknown as CampusDocument
}

describe('buildSlabFeatures', () => {
  it('slab heights subtract ground at centroid', () => {
    const d = doc()
    const features = buildSlabFeatures(d, createTerrainSampler(d)!, {}).features
    // ground 10 m, base 12 m (fixed): floors at 12, 15.5, 19 → slabs relative to the ground at the centroid.
    const slabs = features.filter((f) => f.properties?.kind === 'slab').map((f) => [f.properties?.base, f.properties?.top])
    expect(slabs[0][0]).toBe(0) // ground floor slab sinks into the ground
    expect(slabs[0][1]).toBeCloseTo(2, 6)
    expect(slabs[1][0]).toBeCloseTo(5.25, 6)
    expect(slabs[1][1]).toBeCloseTo(5.5, 6)
    expect(slabs[2][1]).toBeCloseTo(9, 6)
    expect(features.find((f) => f.properties?.kind === 'roof')?.properties?.top).toBeCloseTo(12.5, 6)
  })

  it('cut away omits higher floors', () => {
    const d = doc()
    const features = buildSlabFeatures(d, createTerrainSampler(d)!, { cutAboveFloorId: 'f2' }).features
    expect(features.filter((f) => f.properties?.kind === 'slab')).toHaveLength(2)
    expect(features.some((f) => f.properties?.kind === 'roof')).toBe(false)
  })

  it('a draft base moves that building only (live Shift+Z drag)', () => {
    const d = doc()
    const sampler = createTerrainSampler(d)!
    const moved = buildSlabFeatures(d, sampler, { baseOverride: { buildingId: 'b1', baseM: 9 } })
    const kept = buildSlabFeatures(d, sampler, { baseOverride: { buildingId: 'other', baseM: 9 } })
    const top = (fc: GeoJSON.FeatureCollection, floorId: string) => fc.features.find((f) => f.properties?.floorId === floorId)!.properties!.top as number
    // Ground 10 at the centroid: base 9 puts floor 2 (3.5 m up) at 12.5 m, 2.5 m above the ground.
    expect(top(moved, 'f2')).toBeCloseTo(2.5, 6)
    expect(top(kept, 'f2')).toBeCloseTo(12 + 3.5 - 10, 6)
  })
})

