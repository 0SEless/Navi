import { describe, expect, it } from 'vitest'
import {
  clampCm,
  decodeTile,
  encodeTile,
  gridOriginForBoundary,
  parseTileId,
  tileIdOf,
  tileOfCell,
  toLatLng,
  toLocal,
  TILE_CELLS,
} from '../grid'
import type { TerrainGrid } from '../types'

const grid: TerrainGrid = { originLat: 11.815874, originLng: 122.168548 }

describe('terrain grid', () => {
  it('toLocal/toLatLng round-trip within 1 mm', () => {
    for (const p of [{ x: 0, y: 0 }, { x: 537.3, y: 393.1 }, { x: -20, y: 15.5 }, { x: 999, y: -1000 }, { x: 0.001, y: 750 }]) {
      const back = toLocal(grid, toLatLng(grid, p))
      expect(Math.abs(back.x - p.x)).toBeLessThan(0.001)
      expect(Math.abs(back.y - p.y)).toBeLessThan(0.001)
    }
  })

  it('tileOfCell maps negative cells to negative tiles', () => {
    expect(tileOfCell(-1, 0)).toEqual({ col: -1, row: 0, i: 127 })
    expect(tileOfCell(128, 129)).toEqual({ col: 1, row: 1, i: 1 * 128 + 0 })
    expect(tileOfCell(-129, -1)).toEqual({ col: -2, row: -1, i: 127 * 128 + 127 })
  })

  it('parses tile ids and rejects malformed ones', () => {
    expect(parseTileId(tileIdOf(-3, 7))).toEqual({ col: -3, row: 7 })
    expect(tileIdOf(-1, 0)).toBe('-1_0')
    expect(() => parseTileId('a_b')).toThrow()
    expect(() => parseTileId('1_2_3')).toThrow()
    expect(() => parseTileId('1.5_2')).toThrow()
  })

  it('clamps centimetres to Int16 and rounds', () => {
    expect(clampCm(40000)).toBe(32767)
    expect(clampCm(-40000)).toBe(-32768)
    expect(clampCm(12.6)).toBe(13)
  })

  it('encodeTile/decodeTile round-trip', () => {
    const cells = new Int16Array(TILE_CELLS * TILE_CELLS)
    cells[0] = -32768
    cells[1] = 32767
    cells[16383] = -5
    const decoded = decodeTile(encodeTile(cells))
    expect(Array.from(decoded)).toEqual(Array.from(cells))
    expect(() => decodeTile('AAAA')).toThrow()
  })

  it('gridOriginForBoundary is 20 m south and west of the boundary minimum', () => {
    const boundary = [
      { lat: 11.816, lng: 122.169 },
      { lat: 11.8195, lng: 122.1735 },
      { lat: 11.817, lng: 122.172 },
    ]
    const g = gridOriginForBoundary(boundary)
    const corner = toLocal(g, { lat: 11.816, lng: 122.169 })
    expect(Math.abs(corner.x - 20)).toBeLessThan(0.01)
    expect(Math.abs(corner.y - 20)).toBeLessThan(0.01)
  })
})
