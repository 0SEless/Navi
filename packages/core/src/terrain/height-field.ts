import type { CampusDocument } from '../types/document'
import { createTerrainSampler, type TerrainSampler } from './compose'
import { GRID_MARGIN_METERS, toLocal } from './grid'
import type { Rect, TerrainGrid, TileId } from './types'

/**
 * The final ground in memory (smooth sculpting, 2026-11-07): heights (base + edits + building pads + road fits) and
 * the edits alone, on a 1 m grid over the campus box plus margins. A lookup is a grid read; an edit recomputes only
 * its rectangle — grown to the building pads it touches, because a follow-ground building's base (and so its whole
 * pad) moves when part of its footprint changes. The composer (createTerrainSampler) stays the exact reference that
 * fills the cells and that publishing uses.
 */
export interface HeightField {
  readonly grid: TerrainGrid
  readonly area: { x0: number; y0: number; cols: number; rows: number }
  /** Final ground in metres, row-major from (x0, y0). */
  readonly heights: Float32Array
  /** Edits only, metres. */
  readonly changes: Float32Array
  /** Bilinear; outside the field, its nearest edge. */
  heightAt(x: number, y: number): number
  changeAt(x: number, y: number): number
  /** Recomputes `rect` (grown by the pads it touches) from `doc`, with a stroke's working tiles if given; returns the rewritten rect. */
  update(doc: CampusDocument, rect: Rect, tilesOverride?: Map<TileId, Int16Array>): Rect
  /** Copies of a rect's cells (for a worker). */
  snapshot(rect: Rect): { rect: Rect; heights: Float32Array; changes: Float32Array }
}

/** Each building pad's reach: its footprint box grown by the pad's blend (+1 m). */
function padBoxes(doc: CampusDocument, grid: TerrainGrid): Rect[] {
  const boxes: Rect[] = []
  for (const building of doc.buildings ?? []) {
    const fit = building.ground?.pad
    if (!fit || fit.mode === 'off') continue
    const points = (building.footprint?.points ?? []).map((p) => toLocal(grid, p))
    if (points.length < 3) continue
    const grow = fit.blendMeters + 1
    boxes.push({
      minX: Math.min(...points.map((p) => p.x)) - grow, maxX: Math.max(...points.map((p) => p.x)) + grow,
      minY: Math.min(...points.map((p) => p.y)) - grow, maxY: Math.max(...points.map((p) => p.y)) + grow,
    })
  }
  return boxes
}

const overlaps = (a: Rect, b: Rect) => a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
const union = (a: Rect, b: Rect): Rect => ({ minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) })

/** null without terrain or a boundary (the field covers the boundary's box). */
export function createHeightField(doc: CampusDocument, opts: { marginM?: number } = {}): HeightField | null {
  const first = createTerrainSampler(doc)
  const ring = doc.boundary?.points ?? []
  if (!first || ring.length < 3) return null
  const grid = first.grid
  const local = ring.map((p) => toLocal(grid, p))
  const margin = GRID_MARGIN_METERS + (opts.marginM ?? 20)
  const x0 = Math.floor(Math.min(...local.map((p) => p.x)) - margin)
  const y0 = Math.floor(Math.min(...local.map((p) => p.y)) - margin)
  const cols = Math.ceil(Math.max(...local.map((p) => p.x)) + margin) - x0 + 1
  const rows = Math.ceil(Math.max(...local.map((p) => p.y)) + margin) - y0 + 1
  const heights = new Float32Array(cols * rows)
  const changes = new Float32Array(cols * rows)

  const cellsOf = (r: Rect) => ({
    c0: Math.max(0, Math.floor(r.minX) - x0), c1: Math.min(cols - 1, Math.ceil(r.maxX) - x0),
    r0: Math.max(0, Math.floor(r.minY) - y0), r1: Math.min(rows - 1, Math.ceil(r.maxY) - y0),
  })
  const fill = (s: TerrainSampler, r: Rect): Rect => {
    const { c0, c1, r0, r1 } = cellsOf(r)
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const i = row * cols + col
        heights[i] = s.heightAt(x0 + col, y0 + row)
        changes[i] = s.changeAt(x0 + col, y0 + row)
      }
    }
    return { minX: x0 + c0, minY: y0 + r0, maxX: x0 + c1, maxY: y0 + r1 }
  }
  fill(first, { minX: x0, minY: y0, maxX: x0 + cols - 1, maxY: y0 + rows - 1 })

  const read = (arr: Float32Array, x: number, y: number): number => {
    const fx = Math.min(cols - 1.000001, Math.max(0, x - x0))
    const fy = Math.min(rows - 1.000001, Math.max(0, y - y0))
    const c = Math.floor(fx)
    const r = Math.floor(fy)
    const tx = fx - c
    const ty = fy - r
    const i = r * cols + c
    return arr[i] * (1 - tx) * (1 - ty) + arr[i + 1] * tx * (1 - ty) + arr[i + cols] * (1 - tx) * ty + arr[i + cols + 1] * tx * ty
  }

  return {
    grid,
    area: { x0, y0, cols, rows },
    heights,
    changes,
    heightAt: (x, y) => read(heights, x, y),
    changeAt: (x, y) => read(changes, x, y),
    update(next, rect, tilesOverride) {
      const s = createTerrainSampler(next, tilesOverride ? { tilesOverride } : {})
      if (!s) return rect
      let grown = rect
      for (const box of padBoxes(next, grid)) if (overlaps(box, rect)) grown = union(grown, box)
      return fill(s, grown)
    },
    snapshot(rect) {
      const { c0, c1, r0, r1 } = cellsOf(rect)
      const w = Math.max(0, c1 - c0 + 1)
      const h = Math.max(0, r1 - r0 + 1)
      const hs = new Float32Array(w * h)
      const cs = new Float32Array(w * h)
      for (let row = 0; row < h; row++) {
        const from = (r0 + row) * cols + c0
        hs.set(heights.subarray(from, from + w), row * w)
        cs.set(changes.subarray(from, from + w), row * w)
      }
      return { rect: { minX: x0 + c0, minY: y0 + r0, maxX: x0 + c1, maxY: y0 + r1 }, heights: hs, changes: cs }
    },
  }
}
