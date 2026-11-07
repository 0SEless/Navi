import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '../../types/document'
import { createTerrainSampler } from '../compose'
import { encodeTile, tileIdOf, TILE_CELLS, toLocal } from '../grid'
import { createHeightField } from '../height-field'
import type { TileId } from '../types'
import { ibajayCampus, ibajayDoc, ibajayGrid } from './ibajay-fixture'

/** A change tile with `cm` in a square of `half` cells around local (cx, cy). */
function bump(cx: number, cy: number, half: number, cm: number): { id: TileId; cells: Int16Array } {
  const col = Math.floor(cx / TILE_CELLS)
  const row = Math.floor(cy / TILE_CELLS)
  const cells = new Int16Array(TILE_CELLS * TILE_CELLS)
  for (let y = cy - half; y <= cy + half; y++) for (let x = cx - half; x <= cx + half; x++) {
    const lx = x - col * TILE_CELLS
    const ly = y - row * TILE_CELLS
    if (lx >= 0 && ly >= 0 && lx < TILE_CELLS && ly < TILE_CELLS) cells[ly * TILE_CELLS + lx] = cm
  }
  return { id: tileIdOf(col, row), cells }
}

function worstDifference(a: (x: number, y: number) => number, b: (x: number, y: number) => number, field: { area: { x0: number; y0: number; cols: number; rows: number } }): number {
  let worst = 0
  const { x0, y0, cols, rows } = field.area
  for (let r = 0; r < rows; r += 3) for (let c = 0; c < cols; c += 3) worst = Math.max(worst, Math.abs(a(x0 + c, y0 + r) - b(x0 + c, y0 + r)))
  return worst
}

const hall = ibajayCampus.footprints[5].map(([lat, lng]) => toLocal(ibajayGrid, { lat, lng })) // Bldg No. 8, 57 m long
const hallWest = { x: Math.round(Math.min(...hall.map((p) => p.x))), y: Math.round(hall.reduce((s, p) => s + p.y, 0) / hall.length) }

describe('height field', () => {
  it('matches the composer at every cell after create', () => {
    const doc = ibajayDoc()
    const field = createHeightField(doc)!
    const s = createTerrainSampler(doc)!
    expect(worstDifference((x, y) => field.heightAt(x, y), (x, y) => s.heightAt(x, y), field)).toBeLessThan(1e-4)
    expect(worstDifference((x, y) => field.changeAt(x, y), (x, y) => s.changeAt(x, y), field)).toBeLessThan(1e-4)
  })

  it('update(rect) after a tile change matches a fresh build', () => {
    const doc = ibajayDoc({ pads: false })
    const field = createHeightField(doc)!
    const { id, cells } = bump(300, 120, 10, 250)
    const next = { ...doc, terrainTiles: { [id]: encodeTile(cells) } } as CampusDocument
    field.update(next, { minX: 290, minY: 110, maxX: 310, maxY: 130 })
    const fresh = createHeightField(next)!
    expect(worstDifference((x, y) => field.heightAt(x, y), (x, y) => fresh.heightAt(x, y), field)).toBeLessThan(1e-4)
  })

  it('a stroke over part of a follow-ground building updates its whole pad (ripple)', () => {
    const doc = ibajayDoc()
    const field = createHeightField(doc)!
    const { id, cells } = bump(hallWest.x, hallWest.y, 4, -450) // dig the west end only
    const next = { ...doc, terrainTiles: { [id]: encodeTile(cells) } } as CampusDocument
    const written = field.update(next, { minX: hallWest.x - 5, minY: hallWest.y - 5, maxX: hallWest.x + 5, maxY: hallWest.y + 5 })
    expect(written.maxX).toBeGreaterThan(Math.max(...hall.map((p) => p.x)))
    const fresh = createHeightField(next)!
    expect(worstDifference((x, y) => field.heightAt(x, y), (x, y) => fresh.heightAt(x, y), field)).toBeLessThan(1e-4)
  })

  it('update with working tiles then without restores exactly (cancel)', () => {
    const doc = ibajayDoc()
    const field = createHeightField(doc)!
    const before = field.heights.slice()
    const { id, cells } = bump(300, 120, 10, 300)
    const rect = { minX: 288, minY: 108, maxX: 312, maxY: 132 }
    field.update(doc, rect, new Map([[id, cells]]))
    expect(field.heights).not.toEqual(before)
    field.update(doc, rect)
    expect(field.heights).toEqual(before)
  })

  it('outside the field a lookup reads its nearest edge', () => {
    const field = createHeightField(ibajayDoc())!
    const { x0, y0, cols } = field.area
    expect(field.heightAt(x0 - 500, y0 + 3)).toBeCloseTo(field.heights[3 * cols], 6)
  })

  it('snapshot copies a rect for a worker', () => {
    const field = createHeightField(ibajayDoc())!
    const snap = field.snapshot({ minX: 100, minY: 100, maxX: 109, maxY: 104 })
    expect(snap.heights.length).toBe(10 * 5)
    expect(snap.heights[0]).toBeCloseTo(field.heightAt(snap.rect.minX, snap.rect.minY), 6)
  })
})
