import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '../../types/document'
import { createTerrainSampler } from '../compose'
import { applyDab, brushWeight, smoothDab, type BrushSettings } from '../brush'
import { decodeTile, encodeTile, tileIdOf, TILE_CELLS } from '../grid'
import type { TileId } from '../types'

const base: BrushSettings = { shape: 'circle', rotationDeg: 0, sizeM: 10, aspect: 1, profile: 'hard', strength: 1, mode: 'raise' }

function flatDoc(tiles?: Record<string, string>): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: {}, buildings: [], roads: [], panoramas: [], qrCheckpoints: [],
    terrain: { reference: { name: 'T', zeroMeaning: 'z' }, grid: { originLat: 11.8, originLng: 122.1 }, colorRange: { minM: 0, maxM: 40 } },
    ...(tiles ? { terrainTiles: tiles } : {}),
  } as unknown as CampusDocument
}

/** A working-tile stroke over a document: tiles start from the document's tiles. */
function stroke(doc: CampusDocument) {
  const tiles = new Map<TileId, Int16Array>()
  const loadTile = (id: TileId) => {
    const encoded = doc.terrainTiles?.[id]
    return encoded ? decodeTile(encoded) : null
  }
  const sampler = () => createTerrainSampler(doc, { tilesOverride: tiles })!
  const cell = (x: number, y: number) => tiles.get(tileIdOf(Math.floor(x / TILE_CELLS), Math.floor(y / TILE_CELLS)))?.[(y % TILE_CELLS) * TILE_CELLS + (x % TILE_CELLS)] ?? 0
  return { tiles, loadTile, sampler, cell }
}

describe('brushWeight', () => {
  it('circle hard weight is 1 inside and 0 outside', () => {
    expect(brushWeight(base, 0, 0)).toBe(1)
    expect(brushWeight(base, 4.9, 0)).toBe(1)
    expect(brushWeight(base, 5.1, 0)).toBe(0)
  })

  it('rotated rectangle weight follows rotation', () => {
    const rect: BrushSettings = { ...base, shape: 'rectangle', aspect: 0.2 } // 10 m × 2 m
    expect(brushWeight(rect, 4, 0)).toBe(1)
    expect(brushWeight(rect, 0, 4)).toBe(0)
    const turned = { ...rect, rotationDeg: 90 }
    expect(brushWeight(turned, 4, 0)).toBe(0)
    expect(brushWeight(turned, 0, 4)).toBe(1)
  })

  it('profiles fall off from the centre', () => {
    const linear = { ...base, profile: 'linear' as const }
    expect(brushWeight(linear, 2.5, 0)).toBeCloseTo(0.5, 6)
    const smooth = { ...base, profile: 'smooth' as const }
    expect(brushWeight(smooth, 2.5, 0)).toBeCloseTo(0.5, 6)
    expect(brushWeight(smooth, 1, 0)).toBeGreaterThan(brushWeight(linear, 1, 0))
    const flat = { ...base, profile: 'flat' as const }
    expect(brushWeight(flat, 2, 0)).toBe(1)
    expect(brushWeight(flat, 4.5, 0)).toBeGreaterThan(0)
    expect(brushWeight(flat, 4.5, 0)).toBeLessThan(1)
  })

  it('a triangle points north and is empty beyond its corners', () => {
    const tri = { ...base, shape: 'triangle' as const }
    expect(brushWeight(tri, 0, 0)).toBe(1)
    expect(brushWeight(tri, 0, 4.9)).toBe(1) // apex direction
    expect(brushWeight(tri, 0, -4.9)).toBe(0) // past the flat side
  })
})

describe('applyDab', () => {
  it('raise adds stepM × strength × weight in centimetres', () => {
    const s = stroke(flatDoc())
    const touched = applyDab(s.tiles, s.loadTile, s.sampler(), { x: 20, y: 20 }, base, 0.1)
    expect([...touched]).toEqual(['0_0'])
    expect(s.cell(20, 20)).toBe(10)
    expect(s.cell(40, 40)).toBe(0)
  })

  it('raise stroke clamps at Int16 max', () => {
    const s = stroke(flatDoc())
    for (let i = 0; i < 500; i++) applyDab(s.tiles, s.loadTile, s.sampler(), { x: 20, y: 20 }, base, 10)
    expect(s.cell(20, 20)).toBe(32767)
  })

  it('lower then raise by the same amount returns to 0', () => {
    const s = stroke(flatDoc())
    applyDab(s.tiles, s.loadTile, s.sampler(), { x: 20, y: 20 }, { ...base, mode: 'lower' }, 0.5)
    expect(s.cell(20, 20)).toBe(-50)
    applyDab(s.tiles, s.loadTile, s.sampler(), { x: 20, y: 20 }, base, 0.5)
    expect(s.cell(20, 20)).toBe(0)
  })

  it('set moves toward target', () => {
    const s = stroke(flatDoc())
    applyDab(s.tiles, s.loadTile, s.sampler(), { x: 20, y: 20 }, { ...base, mode: 'set', targetM: 4, strength: 0.5 }, 0.1)
    expect(s.cell(20, 20)).toBe(200)
    applyDab(s.tiles, s.loadTile, s.sampler(), { x: 20, y: 20 }, { ...base, mode: 'set', targetM: 4, strength: 1 }, 0.1)
    expect(s.cell(20, 20)).toBe(400)
  })

  it('a stroke starts from the document tile', () => {
    const cells = new Int16Array(TILE_CELLS * TILE_CELLS).fill(300)
    const s = stroke(flatDoc({ '0_0': encodeTile(cells) }))
    applyDab(s.tiles, s.loadTile, s.sampler(), { x: 20, y: 20 }, base, 0.1)
    expect(s.cell(20, 20)).toBe(310)
    expect(s.cell(100, 100)).toBe(300)
  })

  it('smooth reduces a spike', () => {
    const cells = new Int16Array(TILE_CELLS * TILE_CELLS)
    cells[20 * TILE_CELLS + 20] = 900
    const s = stroke(flatDoc({ '0_0': encodeTile(cells) }))
    smoothDab(s.tiles, s.loadTile, s.sampler(), { x: 20, y: 20 }, { ...base, mode: 'raise', sizeM: 4 })
    expect(s.cell(20, 20)).toBeLessThan(900)
    expect(s.cell(20, 20)).toBeGreaterThan(0)
    expect(s.cell(21, 20)).toBeGreaterThan(0)
  })

  it('cells outside `limit` are not touched', () => {
    const s = stroke(flatDoc())
    applyDab(s.tiles, s.loadTile, s.sampler(), { x: 20, y: 20 }, base, 0.1, { minX: 0, minY: 0, maxX: 20, maxY: 100 })
    expect(s.cell(20, 20)).toBe(10)
    expect(s.cell(22, 20)).toBe(0)
  })
})
