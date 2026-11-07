import { describe, expect, it } from 'vitest'
import { decodeTile, toLatLng, type BrushSettings, type CampusDocument, type TerrainGrid } from '@navi/core'
import { createTerrainStroke, RAISE_RATE_M_PER_S } from '../terrain-stroke'

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

/** A clock that moves 100 ms on every read: each dab is 100 ms after the previous one. */
function ticking(): () => number {
  let t = 0
  return () => (t += 100)
}

describe('terrain stroke', () => {
  it('one stroke dispatches exactly one terrain.apply-tiles', () => {
    const stroke = createTerrainStroke(doc(), 'raise-lower', settings, ticking())!
    for (let x = 30; x <= 60; x += 2) expect(stroke.dab(ll(x, 40))).toBe(true)
    const command = stroke.finish()!
    expect(command.id).toBe('terrain.apply-tiles')
    const tiles = command.payload.tiles as Record<string, string>
    expect(Object.keys(tiles)).toEqual(['0_0'])
    const cells = decodeTile(tiles['0_0'])
    expect(cells[40 * 128 + 45]).toBeGreaterThan(0)
    expect(stroke.finish()).toBeNull()
  })

  it('Lower only digs the ground down (negative change)', () => {
    const stroke = createTerrainStroke(doc(), 'raise-lower', { ...settings, mode: 'lower' }, ticking())!
    for (let x = 30; x <= 60; x += 2) stroke.dab(ll(x, 40))
    const cells = decodeTile((stroke.finish()!.payload.tiles as Record<string, string>)['0_0'])
    expect(cells[40 * 128 + 45]).toBeLessThan(0)
  })

  it('raise is time-based: a second under the brush raises about RAISE_RATE_M_PER_S at full strength, dragging or holding', () => {
    let now = 0
    const stroke = createTerrainStroke(doc(), 'raise-lower', settings, () => now)!
    // Ten dabs on one spot, 100 ms apart (holding still, or a slow drag): the first counts as 80 ms.
    for (let i = 0; i < 10; i++) {
      stroke.dab(ll(45, 40))
      now += 100
    }
    const cells = decodeTile((stroke.finish()!.payload.tiles as Record<string, string>)['0_0'])
    const expectedCm = RAISE_RATE_M_PER_S * (0.08 + 9 * 0.1) * 100
    expect(RAISE_RATE_M_PER_S).toBe(1.5)
    expect(cells[40 * 128 + 45]).toBeGreaterThan(expectedCm - 2)
    expect(cells[40 * 128 + 45]).toBeLessThan(expectedCm + 2)
  })

  it('a long pause between dabs counts at most 250 ms (no jump after the mouse rested)', () => {
    let now = 0
    const stroke = createTerrainStroke(doc(), 'raise-lower', settings, () => now)!
    stroke.dab(ll(45, 40))
    now += 5000
    stroke.dab(ll(45, 40))
    const cells = decodeTile((stroke.finish()!.payload.tiles as Record<string, string>)['0_0'])
    expect(cells[40 * 128 + 45]).toBeLessThanOrEqual(Math.round(RAISE_RATE_M_PER_S * (0.08 + 0.25) * 100) + 1)
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
    flatten.dab(ll(40, 40)) // first dab on the raised spot (the first raise dab counts 80 ms: 0.12 m)
    flatten.dab(ll(60, 40)) // flat ground pulled up to it
    const cells = decodeTile((flatten.finish()!.payload.tiles as Record<string, string>)['0_0'])
    expect(cells[40 * 128 + 60]).toBe(Math.round(RAISE_RATE_M_PER_S * 0.08 * 100))
  })

  it('no terrain → no stroke', () => {
    const d = doc()
    delete d.terrain
    expect(createTerrainStroke(d, 'raise-lower', settings)).toBeNull()
  })
})
