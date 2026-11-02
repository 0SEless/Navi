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

/** Height change per dab for Raise/Lower (scaled by strength and the brush profile). */
export const DAB_STEP_M = 0.1

export interface TerrainStroke {
  /** Working tiles of this stroke (the terrain maps draw them while painting). */
  readonly workingTiles: Map<TileId, Int16Array>
  /** Applies one dab; false when the point is outside the grid area (nothing changes). */
  dab(p: { lat: number; lng: number }): boolean
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
    dab(p) {
      if (finished) return false
      const at = toLocal(terrain.grid, p)
      if (at.x < limit.minX || at.x > limit.maxX || at.y < limit.minY || at.y > limit.maxY) return false
      let changed: Set<TileId>
      if (tool === 'smooth') changed = smoothDab(workingTiles, loadTile, sampler, at, settings, limit)
      else if (tool === 'flatten') {
        flattenTarget ??= sampler.heightAt(Math.round(at.x), Math.round(at.y))
        changed = flattenDab(workingTiles, loadTile, sampler, at, { ...settings, targetM: flattenTarget }, limit)
      } else changed = applyDab(workingTiles, loadTile, sampler, at, settings, DAB_STEP_M, limit)
      changed.forEach((id) => touched.add(id))
      return true
    },
    finish() {
      if (finished) return null
      finished = true
      const tiles: Record<string, string | null> = {}
      for (const id of touched) {
        const cells = workingTiles.get(id)
        if (!cells) continue
        const before = loadTile(id)
        const same = before ? before.every((value, i) => value === cells[i]) : cells.every((value) => value === 0)
        if (same) continue
        // A tile back at all zeros is removed, so flat ground never stores a tile.
        tiles[id] = cells.every((value) => value === 0) ? null : encodeTile(cells)
      }
      if (Object.keys(tiles).length === 0) return null
      return { id: 'terrain.apply-tiles', label: tool === 'smooth' ? 'Smooth ground' : tool === 'flatten' ? 'Flatten ground' : 'Shape ground', payload: { tiles } }
    },
  }
}
