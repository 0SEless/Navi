import type { TerrainSampler } from './compose'
import type { TileLoader } from './brush'
import { clampCm, tileIdOf, tileOfCell, TILE_CELLS } from './grid'
import type { TileId } from './types'

type Point = { x: number; y: number }

function inside(p: Point, ring: Point[]): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

function onEdge(p: Point, ring: Point[]): boolean {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (Math.abs(cross) > 1e-9) continue
    if (p.x >= Math.min(a.x, b.x) - 1e-9 && p.x <= Math.max(a.x, b.x) + 1e-9 && p.y >= Math.min(a.y, b.y) - 1e-9 && p.y <= Math.max(a.y, b.y) + 1e-9) return true
  }
  return false
}

/** Every cell (integer metre point) inside or on the polygon. */
function cellsIn(polygon: Point[]): Point[] {
  if (polygon.length < 3) return []
  const cells: Point[] = []
  for (let x = Math.ceil(Math.min(...polygon.map((p) => p.x))); x <= Math.floor(Math.max(...polygon.map((p) => p.x))); x++) {
    for (let y = Math.ceil(Math.min(...polygon.map((p) => p.y))); y <= Math.floor(Math.max(...polygon.map((p) => p.y))); y++) {
      const p = { x, y }
      if (inside(p, polygon) || onEdge(p, polygon)) cells.push(p)
    }
  }
  return cells
}

function write(tiles: Map<TileId, Int16Array>, loadTile: TileLoader, touched: Set<TileId>, x: number, y: number, update: (cm: number) => number): void {
  const { col, row, i } = tileOfCell(x, y)
  const id = tileIdOf(col, row)
  let tile = tiles.get(id)
  if (!tile) {
    tile = loadTile(id)?.slice() ?? new Int16Array(TILE_CELLS * TILE_CELLS)
    tiles.set(id, tile)
  }
  const next = clampCm(update(tile[i]))
  if (next !== tile[i]) {
    tile[i] = next
    touched.add(id)
  }
}

/** Lasso: set the final height to `meters`, or raise / lower the ground by `meters`, inside the polygon. */
export function lassoOp(
  tiles: Map<TileId, Int16Array>,
  loadTile: TileLoader,
  sampler: TerrainSampler,
  polygon: Point[],
  op: { kind: 'set' | 'raise-by' | 'lower-by'; meters: number },
): Set<TileId> {
  const touched = new Set<TileId>()
  const cells = cellsIn(polygon)
  const deltas = cells.map((c) => (op.kind === 'set' ? (op.meters - sampler.heightAt(c.x, c.y)) * 100 : (op.kind === 'raise-by' ? 1 : -1) * op.meters * 100))
  cells.forEach((c, k) => write(tiles, loadTile, touched, c.x, c.y, (cm) => cm + deltas[k]))
  return touched
}

/** Slope: inside a `widthM` band along from→to, the final height runs linearly from from.h to to.h. */
export function slopeOp(
  tiles: Map<TileId, Int16Array>,
  loadTile: TileLoader,
  sampler: TerrainSampler,
  from: Point & { h: number },
  to: Point & { h: number },
  widthM: number,
): Set<TileId> {
  const touched = new Set<TileId>()
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return touched
  const half = widthM / 2
  const reach = half + 1
  const updates: Array<{ x: number; y: number; cm: number }> = []
  for (let x = Math.floor(Math.min(from.x, to.x) - reach); x <= Math.ceil(Math.max(from.x, to.x) + reach); x++) {
    for (let y = Math.floor(Math.min(from.y, to.y) - reach); y <= Math.ceil(Math.max(from.y, to.y) + reach); y++) {
      const t = ((x - from.x) * dx + (y - from.y) * dy) / len2
      if (t < -1e-9 || t > 1 + 1e-9) continue
      const distance = Math.abs((x - from.x) * dy - (y - from.y) * dx) / Math.sqrt(len2)
      if (distance > half + 1e-9) continue
      const target = from.h + (to.h - from.h) * Math.min(Math.max(t, 0), 1)
      updates.push({ x, y, cm: (target - sampler.heightAt(x, y)) * 100 })
    }
  }
  for (const u of updates) write(tiles, loadTile, touched, u.x, u.y, (cm) => cm + u.cm)
  return touched
}

/** Reset: removes every change inside the polygon (back to the imported or traced base). */
export function resetOp(tiles: Map<TileId, Int16Array>, loadTile: TileLoader, polygon: Point[]): Set<TileId> {
  const touched = new Set<TileId>()
  for (const c of cellsIn(polygon)) write(tiles, loadTile, touched, c.x, c.y, () => 0)
  return touched
}
