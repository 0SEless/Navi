import { describe, expect, it } from 'vitest'
import { toLatLng } from '../grid'
import { plinthFeatures } from '../plinth'
import type { TerrainGrid } from '../types'

const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
const square = [ll(0, 0), ll(10, 0), ll(10, 10), ll(0, 10)]
const slopeNorth = (_x: number, y: number) => 0.5 * y // 0 m at the south wall, 5 m at the north wall

describe('plinth pieces', () => {
  it('only where the ground is below the floor: the downhill walls, about as tall as the drop', () => {
    const pieces = plinthFeatures(square, 4, grid, slopeNorth, 'b1')
    expect(pieces.length).toBeGreaterThan(0)
    for (const piece of pieces) {
      expect(piece.properties).toEqual(expect.objectContaining({ kind: 'plinth', buildingId: 'b1', base: 0 }))
      expect(piece.properties!.top).toBeGreaterThanOrEqual(0.1)
    }
    const south = pieces.filter((p) => (p.geometry.coordinates[0] as number[][]).every(([, lat]) => lat <= ll(0, 0.01).lat))
    expect(south.length).toBeGreaterThanOrEqual(4) // 10 m wall in pieces of at most 3 m
    expect(Math.max(...south.map((p) => p.properties!.top as number))).toBeCloseTo(4, 0)
  })

  it('no plinth on flat ground at the floor', () => {
    expect(plinthFeatures(square, 0, grid, () => 0, 'b1')).toEqual([])
  })

  it('a building above the ground on every side gets plinths on all four walls', () => {
    expect(plinthFeatures(square, 3, grid, () => 0, 'b1').length).toBeGreaterThanOrEqual(16)
  })

  it('bad outlines give nothing and never NaN', () => {
    expect(plinthFeatures([ll(0, 0), ll(5, 0)], 3, grid, () => 0, 'b1')).toEqual([])
    const repeated = plinthFeatures([ll(0, 0), ll(0, 0), ll(5, 0), ll(5, 5), ll(5, 5)], 3, grid, () => 0, 'b1')
    for (const p of repeated) expect(Number.isFinite(p.properties!.top)).toBe(true)
  })
})
