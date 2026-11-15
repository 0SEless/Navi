import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '../../types/document'
import { toLatLng, toLocal } from '../grid'
import { createTerrainSampler, resolveStructureEnds } from '../compose'
import type { CampusTerrain, TerrainBaseSource, TerrainGrid } from '../types'

// Owner 2026-11-15: a stair saved with its end in the middle of a road did not meet the road. A road end now
// always resolves to the road's edge, on the side the stair comes from.
const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
const flat = (): TerrainBaseSource => {
  const v = (x: number, y: number): [number, number, number] => { const p = ll(x, y); return [p.lat, p.lng, 5] }
  return { kind: 'mesh', vertices: [v(-200, -200), v(200, -200), v(200, 200), v(-200, 200)], triangles: [[0, 1, 2], [0, 2, 3]], sourceNote: 'test' }
}
function doc(endAt: { x: number; y: number }, otherY: number): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: {}, buildings: [], panoramas: [], qrCheckpoints: [],
    roads: [{ id: 'r1', name: 'r1', polyline: { points: [ll(0, 0), ll(100, 0)] }, width: 6, surface: 'asphalt', type: 'connector', metadata: {} }],
    structures: [{ id: 's', form: 'stairs', presetId: 'p', width: 2, underneath: 'open', railings: 'none',
      start: { kind: 'ground', position: ll(50, otherY) }, end: { kind: 'road', roadId: 'r1', position: ll(endAt.x, endAt.y) } }],
    terrain: { reference: { name: 'T', zeroMeaning: 'z' }, grid, base: flat(), colorRange: { minM: 0, maxM: 40 } } as CampusTerrain,
  } as unknown as CampusDocument
}

describe('stair road ends land on the road edge', () => {
  it('an end saved on the centre line moves to the edge facing the stair', () => {
    const d = doc({ x: 50, y: 0 }, 15)
    const r = resolveStructureEnds(d, createTerrainSampler(d)!, d.structures![0])!
    expect(r.end.x).toBeCloseTo(50, 3)
    expect(r.end.y).toBeCloseTo(3, 3)
    const south = doc({ x: 50, y: 1 }, -15)
    const rs = resolveStructureEnds(south, createTerrainSampler(south)!, south.structures![0])!
    expect(rs.end.y).toBeCloseTo(-3, 3)
  })

  it('an end already off the road stays where it is', () => {
    const d = doc({ x: 50, y: 8 }, 15)
    const r = resolveStructureEnds(d, createTerrainSampler(d)!, d.structures![0])!
    const q = toLocal(grid, ll(50, 8))
    expect(r.end.y).toBeCloseTo(q.y, 3)
  })
})
