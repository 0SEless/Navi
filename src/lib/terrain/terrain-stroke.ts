import {
  applyDab,
  createTerrainSampler,
  decodeTile,
  encodeTile,
  flattenDab,
  GRID_MARGIN_METERS,
  smoothDab,
  toLocal,
  type BrushSettings,
  type CampusDocument,
  type CellLimit,
  type TileId,
} from '@navi/core'
import type { Command } from '@navi/editor'

export type BrushTool = 'raise-lower' | 'smooth' | 'flatten'

/**
 * Raise/Lower strength, sculpt-tool style (tuned by the owner on the prototype, 2026-11-07): moving, each dab (a
 * quarter brush apart) changes the ground by MOVE_STEP_FRACTION of the brush size — one pass ≈ 11 % of the brush
 * size; holding still, it keeps changing at HOLD_RATE_FRACTION of the brush size per second. Both are scaled by
 * strength and the brush profile. A frame counts at most MAX_HOLD_FRAME_S of holding (a stalled frame does not jump).
 */
export const MOVE_STEP_FRACTION = 0.045
export const HOLD_RATE_FRACTION = 0.5625
export const MAX_HOLD_FRAME_S = 0.25

/** Metres one Raise/Lower dab moves the ground under the brush centre (before strength and profile). */
export function brushStepM(sizeM: number, motion: { moving: true } | { moving: false; seconds: number }): number {
  return motion.moving ? MOVE_STEP_FRACTION * sizeM : HOLD_RATE_FRACTION * sizeM * Math.min(MAX_HOLD_FRAME_S, Math.max(0, motion.seconds))
}

export interface TerrainStroke {
  /** Working tiles of this stroke (the terrain maps draw them while painting). */
  readonly workingTiles: Map<TileId, Int16Array>
  /** Applies one dab; false when the point is outside the grid area (nothing changes). */
  /** Raise/Lower: `stepM` metres at the centre (default one moving step). */
  dab(p: { lat: number; lng: number }, stepM?: number): boolean
  /** The single undoable command for the whole stroke, or null when nothing changed. */
  finish(): Command | null
}

/** The grid area: the boundary's bounding box plus the 20 m margin (local metres). */
export function gridArea(document: CampusDocument): CellLimit | null {
  const terrain = document.terrain
  const ring = document.boundary?.points ?? []
  if (!terrain || ring.length < 3) return null
  const local = ring.map((p) => toLocal(terrain.grid, p))
  return {
    minX: Math.floor(Math.min(...local.map((p) => p.x)) - GRID_MARGIN_METERS),
    minY: Math.floor(Math.min(...local.map((p) => p.y)) - GRID_MARGIN_METERS),
    maxX: Math.ceil(Math.max(...local.map((p) => p.x)) + GRID_MARGIN_METERS),
    maxY: Math.ceil(Math.max(...local.map((p) => p.y)) + GRID_MARGIN_METERS),
  }
}

/**
 * One terrain.apply-tiles for the tiles an edit touched: unchanged tiles are left out and a tile back
 * at all zeros is removed (flat ground never stores a tile). null when nothing changed.
 */
export function tilesCommand(document: CampusDocument, workingTiles: Map<TileId, Int16Array>, touched: Iterable<TileId>, label: string): Command | null {
  const tiles: Record<string, string | null> = {}
  for (const id of touched) {
    const cells = workingTiles.get(id)
    if (!cells) continue
    const encoded = document.terrainTiles?.[id]
    const before = encoded ? decodeTile(encoded) : null
    const same = before ? before.every((value, i) => value === cells[i]) : cells.every((value) => value === 0)
    if (same) continue
    tiles[id] = cells.every((value) => value === 0) ? null : encodeTile(cells)
  }
  if (Object.keys(tiles).length === 0) return null
  return { id: 'terrain.apply-tiles', label, payload: { tiles } }
}

export function createTerrainStroke(document: CampusDocument, tool: BrushTool, settings: BrushSettings): TerrainStroke | null {
  const terrain = document.terrain
  const limit = gridArea(document)
  if (!terrain || !limit) return null
  const workingTiles = new Map<TileId, Int16Array>()
  const touched = new Set<TileId>()
  const loadTile = (id: TileId) => {
    const encoded = document.terrainTiles?.[id]
    return encoded ? decodeTile(encoded) : null
  }
  const sampler = createTerrainSampler(document, { tilesOverride: workingTiles })!
  let flattenTarget: number | null = null
  let finished = false

  return {
    workingTiles,
    dab(p, stepM) {
      if (finished) return false
      const at = toLocal(terrain.grid, p)
      if (at.x < limit.minX || at.x > limit.maxX || at.y < limit.minY || at.y > limit.maxY) return false
      let changed: Set<TileId>
      if (tool === 'smooth') changed = smoothDab(workingTiles, loadTile, sampler, at, settings, limit)
      else if (tool === 'flatten') {
        flattenTarget ??= sampler.heightAt(Math.round(at.x), Math.round(at.y))
        changed = flattenDab(workingTiles, loadTile, sampler, at, { ...settings, targetM: flattenTarget }, limit)
      } else {
        changed = applyDab(workingTiles, loadTile, sampler, at, settings, stepM ?? brushStepM(settings.sizeM, { moving: true }), limit)
      }
      changed.forEach((id) => touched.add(id))
      return true
    },
    finish() {
      if (finished) return null
      finished = true
      return tilesCommand(document, workingTiles, touched, tool === 'smooth' ? 'Smooth ground' : tool === 'flatten' ? 'Flatten ground' : 'Shape ground')
    },
  }
}
