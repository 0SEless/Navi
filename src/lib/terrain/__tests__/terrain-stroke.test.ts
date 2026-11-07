import { describe, expect, it } from 'vitest'
import { decodeTile, toLatLng, type BrushSettings, type CampusDocument, type TerrainGrid } from '@navi/core'
import { brushStepM, createTerrainStroke, HOLD_RATE_FRACTION, MOVE_STEP_FRACTION } from '../terrain-stroke'

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

  it('Lower only digs the ground down (negative change)', () => {
    const stroke = createTerrainStroke(doc(), 'raise-lower', { ...settings, mode: 'lower' })!
    for (let x = 30; x <= 60; x += 2) stroke.dab(ll(x, 40))
    const cells = decodeTile((stroke.finish()!.payload.tiles as Record<string, string>)['0_0'])
    expect(cells[40 * 128 + 45]).toBeLessThan(0)
  })

  it('brushStepM: moving 4.5 % of the brush size per dab; holding 56.25 % per second, at most 0.25 s a frame', () => {
    expect(MOVE_STEP_FRACTION).toBe(0.045)
    expect(HOLD_RATE_FRACTION).toBe(0.5625)
    expect(brushStepM(10, { moving: true })).toBeCloseTo(0.45, 9)
    expect(brushStepM(10, { moving: false, seconds: 0.1 })).toBeCloseTo(0.5625, 9)
    expect(brushStepM(10, { moving: false, seconds: 3 })).toBeCloseTo(10 * 0.5625 * 0.25, 9)
  })

  it('a dab raises the brush centre by its step (hard profile, full strength)', () => {
    const stroke = createTerrainStroke(doc(), 'raise-lower', settings)!
    stroke.dab(ll(45, 40), 0.5)
    const cells = decodeTile((stroke.finish()!.payload.tiles as Record<string, string>)['0_0'])
    expect(cells[40 * 128 + 45]).toBe(50)
  })

  it('without a step a dab uses one moving step (a tap)', () => {
    const stroke = createTerrainStroke(doc(), 'raise-lower', settings)!
    stroke.dab(ll(45, 40))
    const cells = decodeTile((stroke.finish()!.payload.tiles as Record<string, string>)['0_0'])
    expect(cells[40 * 128 + 45]).toBe(Math.round(MOVE_STEP_FRACTION * settings.sizeM * 100))
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
    flatten.dab(ll(40, 40)) // first dab on the raised spot (one moving step of a 10 m brush: 0.45 m)
    flatten.dab(ll(60, 40)) // flat ground pulled up to it
    const cells = decodeTile((flatten.finish()!.payload.tiles as Record<string, string>)['0_0'])
    expect(cells[40 * 128 + 60]).toBe(Math.round(MOVE_STEP_FRACTION * 10 * 100))
  })

  it('no terrain → no stroke', () => {
    const d = doc()
    delete d.terrain
    expect(createTerrainStroke(d, 'raise-lower', settings)).toBeNull()
  })
})
