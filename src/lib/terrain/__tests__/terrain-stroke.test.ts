import { describe, expect, it } from 'vitest'
import { decodeTile, toLatLng, type BrushSettings, type CampusDocument, type TerrainGrid } from '@navi/core'
import { createTerrainStroke } from '../terrain-stroke'

const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
const settings: BrushSettings = { shape: 'circle', rotationDeg: 0, sizeM: 6, aspect: 1, profile: 'hard', strength: 1, mode: 'raise' }

function doc(): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: {}, buildings: [], roads: [], panoramas: [], qrCheckpoints: [],
    boundary: { points: [ll(20, 20), ll(100, 20), ll(100, 80), ll(20, 80)] },
    terrain: { reference: { name: 'T', zeroMeaning: 'z' }, grid, colorRange: { minM: 0, maxM: 40 } },
  } as unknown as CampusDocument
}

describe('terrain stroke', () => {
  it('one stroke dispatches exactly one terrain.apply-tiles', () => {
    const stroke = createTerrainStroke(doc(), 'raise-lower', settings)!
    for (let x = 30; x <= 60; x += 2) expect(stroke.dab(ll(x, 40))).toBe(true)
    const command = stroke.finish()!
    expect(command.id).toBe('terrain.apply-tiles')
    const tiles = command.payload.tiles as Record<string, string>
    expect(Object.keys(tiles)).toEqual(['0_0'])
    const cells = decodeTile(tiles['0_0'])
    expect(cells[40 * 128 + 45]).toBeGreaterThan(0)
    expect(stroke.finish()).toBeNull()
  })

  it('outside-grid dabs are ignored', () => {
    const stroke = createTerrainStroke(doc(), 'raise-lower', settings)!
    expect(stroke.dab(ll(500, 500))).toBe(false)
    expect(stroke.finish()).toBeNull()
  })

  it('a stroke with no ground change gives no command', () => {
    const stroke = createTerrainStroke(doc(), 'smooth', settings)!
    stroke.dab(ll(40, 40))
    expect(stroke.finish()).toBeNull()
  })

  it('flatten holds the height under the first dab', () => {
    const d = doc()
    const raise = createTerrainStroke(d, 'raise-lower', { ...settings, sizeM: 10 })!
    raise.dab(ll(40, 40))
    d.terrainTiles = raise.finish()!.payload.tiles as Record<`${number}_${number}`, string>
    const flatten = createTerrainStroke(d, 'flatten', { ...settings, sizeM: 4 })!
    flatten.dab(ll(40, 40)) // first dab on the raised spot (0.10 m)
    flatten.dab(ll(60, 40)) // flat ground pulled up to it
    const cells = decodeTile((flatten.finish()!.payload.tiles as Record<string, string>)['0_0'])
    expect(cells[40 * 128 + 60]).toBe(10)
  })

  it('no terrain → no stroke', () => {
    const d = doc()
    delete d.terrain
    expect(createTerrainStroke(d, 'raise-lower', settings)).toBeNull()
  })
})
