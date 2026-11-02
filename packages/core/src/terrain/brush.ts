import type { TerrainSampler } from './compose'
import { clampCm, tileIdOf, tileOfCell, TILE_CELLS } from './grid'
import type { TileId } from './types'

export interface BrushSettings {
  shape: 'circle' | 'oval' | 'rectangle' | 'triangle'
  /** Counter-clockwise, degrees. */
  rotationDeg: number
  /** Diameter (or long side), metres, 1–60. */
  sizeM: number
  /** Short side ÷ long side for oval and rectangle. */
  aspect: number
  profile: 'flat' | 'smooth' | 'linear' | 'hard'
  /** 0.01–1. */
  strength: number
  mode: 'raise' | 'lower' | 'set'
  /** Set mode (and Flatten): the height to move toward. */
  targetM?: number
}

export type TileLoader = (id: TileId) => Int16Array | null
export interface CellLimit { minX: number; minY: number; maxX: number; maxY: number }

/** Profile over normalised distance r (0 at the centre, 1 at the edge). */
function profileWeight(profile: BrushSettings['profile'], r: number): number {
  switch (profile) {
    case 'hard': return 1
    case 'linear': return 1 - r
    case 'smooth': return 0.5 * (1 + Math.cos(Math.PI * r))
    case 'flat': return r <= 0.6 ? 1 : 0.5 * (1 + Math.cos((Math.PI * (r - 0.6)) / 0.4))
  }
}

/** 0..1 weight of the brush at offset (dx, dy) metres from its centre. */
export function brushWeight(s: BrushSettings, dx: number, dy: number): number {
  const angle = (-s.rotationDeg * Math.PI) / 180
  const x = dx * Math.cos(angle) - dy * Math.sin(angle)
  const y = dx * Math.sin(angle) + dy * Math.cos(angle)
  const a = s.sizeM / 2
  const b = (s.sizeM / 2) * (s.shape === 'oval' || s.shape === 'rectangle' ? s.aspect : 1)
  let r: number
  switch (s.shape) {
    case 'circle':
    case 'oval':
      r = Math.hypot(x / a, y / b)
      break
    case 'rectangle':
      r = Math.max(Math.abs(x) / a, Math.abs(y) / b)
      break
    case 'triangle': {
      // Equilateral, circumradius a, apex north: distance to each side over the inradius (a / 2).
      const inradius = a / 2
      const c = Math.cos(Math.PI / 6)
      r = Math.max(-y, c * x + 0.5 * y, -c * x + 0.5 * y) / inradius
      break
    }
  }
  if (!(r <= 1)) return 0
  return Math.max(0, profileWeight(s.profile, Math.max(0, r)))
}

function tileFor(tiles: Map<TileId, Int16Array>, loadTile: TileLoader, cx: number, cy: number): { tile: Int16Array; id: TileId; i: number } {
  const { col, row, i } = tileOfCell(cx, cy)
  const id = tileIdOf(col, row)
  let tile = tiles.get(id)
  if (!tile) {
    tile = loadTile(id)?.slice() ?? new Int16Array(TILE_CELLS * TILE_CELLS)
    tiles.set(id, tile)
  }
  return { tile, id, i }
}

/** The cells a brush at `at` may touch, with their weights (strength included). */
function cellsUnder(at: { x: number; y: number }, s: BrushSettings, limit?: CellLimit): Array<{ cx: number; cy: number; w: number }> {
  const reach = (s.sizeM / 2) * Math.max(1, s.aspect) * Math.SQRT2
  const cells: Array<{ cx: number; cy: number; w: number }> = []
  for (let cx = Math.floor(at.x - reach); cx <= Math.ceil(at.x + reach); cx++) {
    for (let cy = Math.floor(at.y - reach); cy <= Math.ceil(at.y + reach); cy++) {
      if (limit && (cx < limit.minX || cx > limit.maxX || cy < limit.minY || cy > limit.maxY)) continue
      const w = brushWeight(s, cx - at.x, cy - at.y) * s.strength
      if (w > 0) cells.push({ cx, cy, w })
    }
  }
  return cells
}

/**
 * One dab into the stroke's working tiles. Raise/lower change the ground by stepM · strength · weight;
 * set moves the final height toward targetM by strength · weight of the difference. Values are
 * whole centimetres, clamped to Int16 (never wrapped). Returns the touched tiles.
 */
export function applyDab(
  tiles: Map<TileId, Int16Array>,
  loadTile: TileLoader,
  sampler: TerrainSampler,
  at: { x: number; y: number },
  s: BrushSettings,
  stepM: number,
  limit?: CellLimit,
): Set<TileId> {
  const touched = new Set<TileId>()
  const target = s.targetM
  const deltas = cellsUnder(at, s, limit).map(({ cx, cy, w }) => {
    if (s.mode === 'set') return { cx, cy, cm: target === undefined ? 0 : (target - sampler.heightAt(cx, cy)) * w * 100 }
    return { cx, cy, cm: (s.mode === 'raise' ? 1 : -1) * stepM * w * 100 }
  })
  for (const { cx, cy, cm } of deltas) {
    if (cm === 0) continue
    const { tile, id, i } = tileFor(tiles, loadTile, cx, cy)
    tile[i] = clampCm(tile[i] + cm)
    touched.add(id)
  }
  return touched
}

/** Moves each cell toward the mean of its 3 × 3 neighbourhood by strength · weight. */
export function smoothDab(tiles: Map<TileId, Int16Array>, loadTile: TileLoader, sampler: TerrainSampler, at: { x: number; y: number }, s: BrushSettings, limit?: CellLimit): Set<TileId> {
  const touched = new Set<TileId>()
  const deltas = cellsUnder(at, s, limit).map(({ cx, cy, w }) => {
    let sum = 0
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) sum += sampler.heightAt(cx + dx, cy + dy)
    return { cx, cy, cm: (sum / 9 - sampler.heightAt(cx, cy)) * w * 100 }
  })
  for (const { cx, cy, cm } of deltas) {
    if (cm === 0) continue
    const { tile, id, i } = tileFor(tiles, loadTile, cx, cy)
    tile[i] = clampCm(tile[i] + cm)
    touched.add(id)
  }
  return touched
}

/** Like set, toward the height under the stroke's first dab (the caller passes it as targetM). */
export function flattenDab(tiles: Map<TileId, Int16Array>, loadTile: TileLoader, sampler: TerrainSampler, at: { x: number; y: number }, s: BrushSettings, limit?: CellLimit): Set<TileId> {
  return applyDab(tiles, loadTile, sampler, at, { ...s, mode: 'set' }, 0, limit)
}
