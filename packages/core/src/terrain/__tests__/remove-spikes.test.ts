import { describe, expect, it } from 'vitest'
import { decodeTile, encodeTile, TILE_CELLS, tileIdOf } from '../grid'
import { removeSpikes } from '../remove-spikes'
import type { TileId } from '../types'

// Owner 2026-11-15: the Set-to-height bug left runaway sculpting (−251 m … +65 m) beside buildings. Remove spikes
// refills cells outside the hill's normal range from the healthy cells around them, and flattens single-cell spikes.
function hill(): Int16Array {
  const t = new Int16Array(TILE_CELLS * TILE_CELLS)
  for (let y = 0; y < TILE_CELLS; y++) for (let x = 0; x < TILE_CELLS; x++) t[y * TILE_CELLS + x] = Math.round(x * 0.1 * 100) // 0 → 12.7 m ramp
  return t
}
const at = (t: Int16Array, x: number, y: number) => t[y * TILE_CELLS + x] / 100

describe('removeSpikes', () => {
  it('a runaway patch and a single spike are put back in line with the hill; good ground is untouched', () => {
    const t = hill()
    for (let y = 40; y < 48; y++) for (let x = 60; x < 64; x++) t[y * TILE_CELLS + x] = -(y - 39) * 800 // −8 … −64 m
    t[100 * TILE_CELLS + 20] = 6500 // +65 m spike
    const id = tileIdOf(0, 0)
    const { tiles, cells } = removeSpikes({ [id]: encodeTile(t) } as Record<TileId, string>)
    const out = decodeTile(tiles[id]!)
    expect(cells).toBe(33)
    for (let y = 40; y < 48; y++) for (let x = 60; x < 64; x++) expect(Math.abs(at(out, x, y) - x * 0.1)).toBeLessThan(0.6)
    expect(Math.abs(at(out, 20, 100) - 2)).toBeLessThan(0.2)
    expect(at(out, 10, 10)).toBeCloseTo(1, 2)
    expect(at(out, 120, 5)).toBeCloseTo(12, 2)
  })

  it('clean sculpting comes back unchanged', () => {
    const id = tileIdOf(0, 0)
    const { tiles, cells } = removeSpikes({ [id]: encodeTile(hill()) } as Record<TileId, string>)
    expect(cells).toBe(0)
    expect(tiles).toEqual({})
  })
})
