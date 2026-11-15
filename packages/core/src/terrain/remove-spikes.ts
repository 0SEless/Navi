import { decodeTile, encodeTile, parseTileId, TILE_CELLS, tileIdOf } from './grid'
import type { TileId } from './types'

/**
 * Remove spikes (owner 2026-11-15). A Set-to-height bug left runaway sculpting beside buildings (−251 m … +65 m on a
 * 0–15 m hill). Two passes over every sculpted tile:
 *  1. The hill's normal range is the 1st–99th percentile of the sculpted cells, widened by 2 m. Cells outside it are
 *     refilled from their healthy neighbours, edge inwards (mean of the healthy cells among the 8 around).
 *  2. A cell more than 3 m off the middle value of the 8 around it is set to that middle value.
 * Returns only the tiles that changed, and how many cells changed. Pure: the caller applies the tiles as one step.
 */
export function removeSpikes(input: Partial<Record<TileId, string>>): { tiles: Partial<Record<TileId, string>>; cells: number } {
  const grids = new Map<string, Int16Array>()
  for (const [id, encoded] of Object.entries(input)) if (encoded) grids.set(id, decodeTile(encoded))
  if (grids.size === 0) return { tiles: {}, cells: 0 }

  const keyOf = (x: number, y: number) => tileIdOf(Math.floor(x / TILE_CELLS), Math.floor(y / TILE_CELLS))
  const indexOf = (x: number, y: number) => {
    const cx = ((x % TILE_CELLS) + TILE_CELLS) % TILE_CELLS
    const cy = ((y % TILE_CELLS) + TILE_CELLS) % TILE_CELLS
    return cy * TILE_CELLS + cx
  }
  const get = (x: number, y: number): number | null => {
    const t = grids.get(keyOf(x, y))
    return t ? t[indexOf(x, y)] : null
  }
  const set = (x: number, y: number, cm: number) => {
    const id = keyOf(x, y)
    const t = grids.get(id)
    if (!t) return
    t[indexOf(x, y)] = Math.max(-32768, Math.min(32767, Math.round(cm)))
    changedTiles.add(id)
  }
  const changedTiles = new Set<string>()
  const changedCells = new Set<string>()

  // Every cell, in world cell coordinates.
  const cells: Array<[number, number]> = []
  for (const id of grids.keys()) {
    const { col, row } = parseTileId(id)
    for (let y = 0; y < TILE_CELLS; y++) for (let x = 0; x < TILE_CELLS; x++) cells.push([col * TILE_CELLS + x, row * TILE_CELLS + y])
  }

  // 1. Out-of-range cells, refilled from healthy neighbours.
  const painted = cells.map(([x, y]) => get(x, y) as number).filter((v) => v !== 0).sort((a, b) => a - b)
  if (painted.length > 0) {
    const q = (p: number) => painted[Math.min(painted.length - 1, Math.max(0, Math.floor(p * (painted.length - 1))))]
    const lo = q(0.01) - 200
    const hi = q(0.99) + 200
    let bad = new Set(cells.filter(([x, y]) => { const v = get(x, y) as number; return v < lo || v > hi }).map(([x, y]) => `${x},${y}`))
    for (const k of bad) changedCells.add(k)
    for (let guard = 0; bad.size > 0 && guard < 500; guard++) {
      const fixed: Array<[number, number, number]> = []
      for (const k of bad) {
        const [x, y] = k.split(',').map(Number)
        let sum = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          if (bad.has(`${x + dx},${y + dy}`)) continue
          const v = get(x + dx, y + dy)
          if (v === null) continue
          sum += v
          n++
        }
        if (n > 0) fixed.push([x, y, sum / n])
      }
      if (fixed.length === 0) break
      for (const [x, y, v] of fixed) set(x, y, v)
      const next = new Set(bad)
      for (const [x, y] of fixed) next.delete(`${x},${y}`)
      bad = next
    }
  }

  // 2. Single-cell spikes against the middle of the 8 around them.
  for (const [x, y] of cells) {
    const v = get(x, y) as number
    const around: number[] = []
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const n = get(x + dx, y + dy)
      if (n !== null) around.push(n)
    }
    if (around.length < 5) continue
    around.sort((a, b) => a - b)
    const middle = around.length % 2 ? around[(around.length - 1) / 2] : (around[around.length / 2 - 1] + around[around.length / 2]) / 2
    if (Math.abs(v - middle) > 300) {
      set(x, y, middle)
      changedCells.add(`${x},${y}`)
    }
  }

  const tiles: Partial<Record<TileId, string>> = {}
  for (const id of changedTiles) tiles[id as TileId] = encodeTile(grids.get(id)!)
  return { tiles, cells: changedCells.size }
}
