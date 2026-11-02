import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '../../types/document'
import { createTerrainSampler } from '../compose'
import { lassoOp, resetOp, slopeOp } from '../area-ops'
import { decodeTile, encodeTile, tileIdOf, TILE_CELLS } from '../grid'
import type { TileId } from '../types'

function doc(tiles?: Record<string, string>): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: {}, buildings: [], roads: [], panoramas: [], qrCheckpoints: [],
    terrain: { reference: { name: 'T', zeroMeaning: 'z' }, grid: { originLat: 11.8, originLng: 122.1 }, colorRange: { minM: 0, maxM: 40 } },
    ...(tiles ? { terrainTiles: tiles } : {}),
  } as unknown as CampusDocument
}

function work(d: CampusDocument) {
  const tiles = new Map<TileId, Int16Array>()
  const loadTile = (id: TileId) => (d.terrainTiles?.[id] ? decodeTile(d.terrainTiles[id]) : null)
  const sampler = createTerrainSampler(d, { tilesOverride: tiles })!
  const cell = (x: number, y: number) => tiles.get(tileIdOf(Math.floor(x / TILE_CELLS), Math.floor(y / TILE_CELLS)))?.[(y % TILE_CELLS) * TILE_CELLS + (x % TILE_CELLS)] ?? 0
  return { tiles, loadTile, sampler, cell }
}

const square = [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }]

describe('area operations', () => {
  it('lasso set flattens inside only', () => {
    const w = work(doc())
    lassoOp(w.tiles, w.loadTile, w.sampler, square, { kind: 'set', meters: 3 })
    expect(w.cell(15, 15)).toBe(300)
    expect(w.cell(25, 15)).toBe(0)
  })

  it('raise-by adds exactly N cm inside', () => {
    const cells = new Int16Array(TILE_CELLS * TILE_CELLS).fill(100)
    const w = work(doc({ '0_0': encodeTile(cells) }))
    lassoOp(w.tiles, w.loadTile, w.sampler, square, { kind: 'raise-by', meters: 0.5 })
    expect(w.cell(15, 15)).toBe(150)
    lassoOp(w.tiles, w.loadTile, w.sampler, square, { kind: 'lower-by', meters: 2 })
    expect(w.cell(15, 15)).toBe(-50)
    expect(w.cell(30, 30)).toBe(100)
  })

  it('slope interpolates linearly along the line', () => {
    const w = work(doc())
    slopeOp(w.tiles, w.loadTile, w.sampler, { x: 10, y: 50, h: 0 }, { x: 30, y: 50, h: 2 }, 4)
    expect(w.cell(10, 50)).toBe(0)
    expect(w.cell(20, 50)).toBe(100)
    expect(w.cell(30, 50)).toBe(200)
    expect(w.cell(20, 51)).toBe(100)
    expect(w.cell(20, 55)).toBe(0)
  })

  it('reset drops all changes inside', () => {
    const cells = new Int16Array(TILE_CELLS * TILE_CELLS).fill(250)
    const w = work(doc({ '0_0': encodeTile(cells) }))
    const touched = resetOp(w.tiles, w.loadTile, square)
    expect([...touched]).toEqual(['0_0'])
    expect(w.cell(15, 15)).toBe(0)
    expect(w.cell(25, 25)).toBe(250)
  })
})
