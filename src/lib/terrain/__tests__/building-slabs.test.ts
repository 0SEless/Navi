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
  // Ground 10 m, base 12 m (Fixed), floors at 0 / 3.5 / 7 m, 3.5 m high: roof at 22.5 m. The building's outline
  // is its own floor (owner 2026-11-14), so the ground under it is filled to 12 m and the block stands from there.
  it('each building is one solid block from the ground to its roof (walls, no floating roof)', () => {
    const d = doc()
    const features = buildSlabFeatures(d, createTerrainSampler(d)!, {}).features
    expect(features).toHaveLength(1)
    expect(features[0].properties).toMatchObject({ kind: 'block', buildingId: 'b1', base: 0 })
    expect(features[0].properties!.top).toBeCloseTo(10.5, 6)
  })

  it('a building standing on the ground: a block from the ground to its roof', () => {
    const d = doc()
    d.buildings[0].baseElevation = 10
    const block = buildSlabFeatures(d, createTerrainSampler(d)!, {}).features[0].properties!
    expect(block.base).toBe(0)
    expect(block.top).toBeCloseTo(10.5, 6)
  })

  it("the roof follows the building's height (as the map editor and NAVI Web), not its floor count", () => {
    const d = doc()
    d.buildings[0].baseElevation = 10
    d.buildings[0].height = 15
    d.buildings[0].floors = [floor('f1', 0)] as unknown as Building['floors']
    const block = buildSlabFeatures(d, createTerrainSampler(d)!, {}).features[0].properties!
    expect(block.top).toBeCloseTo(15, 6)
  })

  it('without a height the roof is its floors (older buildings)', () => {
    const d = doc()
    d.buildings[0].baseElevation = 10
    ;(d.buildings[0] as { height?: number }).height = undefined
    const block = buildSlabFeatures(d, createTerrainSampler(d)!, {}).features[0].properties!
    expect(block.top).toBeCloseTo(10.5, 6)
  })

  it('cut away: the block stops at the chosen floor, whose floor shows on top', () => {
    const d = doc()
    const features = buildSlabFeatures(d, createTerrainSampler(d)!, { cutAboveFloorId: 'f2' }).features
    expect(features).toHaveLength(1)
    expect(features[0].properties).toMatchObject({ kind: 'cut', floorId: 'f2', base: 0 })
    expect(features[0].properties!.top).toBeCloseTo(12 + 3.5 - 12, 6)
  })

  it('cut at a ground floor that sits on the ground keeps a slab of thickness (never zero height)', () => {
    const d = doc()
    d.buildings[0].baseElevation = 10
    const cut = buildSlabFeatures(d, createTerrainSampler(d)!, { cutAboveFloorId: 'f1' }).features[0].properties!
    expect(cut.top).toBeCloseTo(0.25, 6)
  })

  it('a draft base moves that building only (live Shift+Z drag)', () => {
    const d = doc()
    const sampler = createTerrainSampler(d)!
    const top = (fc: GeoJSON.FeatureCollection) => fc.features[0].properties!.top as number
    // Base 9 (draft): roof at 9 + 10.5 = 19.5 m, 7.5 m above the saved floor pad (12 m) until the drag is saved.
    expect(top(buildSlabFeatures(d, sampler, { baseOverride: { buildingId: 'b1', baseM: 9 } }))).toBeCloseTo(7.5, 6)
    expect(top(buildSlabFeatures(d, sampler, { baseOverride: { buildingId: 'other', baseM: 9 } }))).toBeCloseTo(10.5, 6)
  })
})
