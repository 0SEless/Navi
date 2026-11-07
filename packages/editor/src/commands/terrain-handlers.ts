import { gridOriginForBoundary, recordChange } from '@navi/core'
import type { CampusDocument, CampusTerrain, TerrainBaseSource, TerrainReference, TileId } from '@navi/core'
import type { Command, CommandHandler, MutationResult } from './types'

// Terrain plan commands: the terrain settings (`terrain`) and the change tiles (`terrainTiles`).
// Every command records exactly what it replaced so undo restores it, including absence.

type Tiles = Record<TileId, string>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isReference(value: unknown): value is TerrainReference {
  return isRecord(value) && typeof value.name === 'string' && value.name.trim() !== ''
    && typeof value.zeroMeaning === 'string' && value.zeroMeaning.trim() !== ''
}

function isColorRange(value: unknown): value is CampusTerrain['colorRange'] {
  return isRecord(value) && Number.isFinite(value.minM) && Number.isFinite(value.maxM)
}

function snapshot(document: CampusDocument): { terrain: CampusTerrain | null; tiles: Tiles | null } {
  return {
    terrain: document.terrain ? structuredClone(document.terrain) : null,
    tiles: document.terrainTiles ? { ...document.terrainTiles } : null,
  }
}

function restoreCommand(previous: { terrain: CampusTerrain | null; tiles: Tiles | null }, label: string): Command {
  return { id: 'terrain.restore', label, payload: { terrain: previous.terrain, tiles: previous.tiles } }
}

/**
 * Creates the campus terrain (grid fixed at the boundary's south-west corner minus 20 m) or updates
 * its reference, base and colour range; the grid never moves. `clearTiles: true` also removes all
 * changes, in the same undo step (re-import "Clear my changes").
 */
export const terrainSetupHandler: CommandHandler = {
  id: 'terrain.setup',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    if (!isReference(payload.reference)) return { success: false, error: 'Name the height reference and say what 0 m means.' }
    if (payload.colorRange !== undefined && !isColorRange(payload.colorRange)) return { success: false, error: 'The colour range needs finite minM and maxM.' }
    const previous = snapshot(document)
    let grid = document.terrain?.grid
    if (!grid) {
      const points = document.boundary?.points ?? []
      if (points.length < 3) return { success: false, error: 'Draw the campus boundary first' }
      grid = gridOriginForBoundary(points)
    }
    const base = payload.base !== undefined ? (structuredClone(payload.base) as TerrainBaseSource) : document.terrain?.base
    const terrain: CampusTerrain = {
      reference: structuredClone(payload.reference),
      grid,
      ...(base ? { base } : {}),
      colorRange: isColorRange(payload.colorRange) ? { ...payload.colorRange } : document.terrain?.colorRange ?? { minM: 0, maxM: 40 },
    }
    document.terrain = terrain
    if (payload.clearTiles === true) delete document.terrainTiles
    recordChange(document, { entityId: 'terrain', entityType: 'terrain', operation: previous.terrain ? 'updated' : 'created' })
    return { success: true, entityId: 'terrain', data: { previous } }
  },
  inverse(_payload: Record<string, unknown>, result: MutationResult): Command | null {
    const previous = result.data?.previous as ReturnType<typeof snapshot> | undefined
    return previous ? restoreCommand(previous, 'Undo terrain setup') : null
  },
}

/** Sets (string) or removes (null) change tiles; removing the last tile removes `terrainTiles`. */
export const terrainApplyTilesHandler: CommandHandler = {
  id: 'terrain.apply-tiles',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    if (!document.terrain) return { success: false, error: 'Set up the terrain first.' }
    if (!isRecord(payload.tiles)) return { success: false, error: 'No tiles to apply.' }
    const hadTiles = document.terrainTiles !== undefined
    const before: Record<string, string | null> = {}
    const tiles: Tiles = { ...(document.terrainTiles ?? {}) }
    for (const [id, value] of Object.entries(payload.tiles)) {
      if (value !== null && typeof value !== 'string') return { success: false, error: `Tile "${id}" must be base64 or null.` }
      before[id] = tiles[id as TileId] ?? null
      if (value === null) delete tiles[id as TileId]
      else tiles[id as TileId] = value
    }
    if (Object.keys(tiles).length > 0) document.terrainTiles = tiles
    else delete document.terrainTiles
    recordChange(document, { entityId: 'terrain-tiles', entityType: 'terrain', operation: 'updated' })
    return { success: true, entityId: 'terrain-tiles', data: { before, hadTiles } }
  },
  inverse(_payload: Record<string, unknown>, result: MutationResult): Command | null {
    const before = result.data?.before as Record<string, string | null> | undefined
    if (!before) return null
    return { id: 'terrain.apply-tiles', label: 'Undo terrain edit', payload: { tiles: before } }
  },
}

/** Puts back a terrain snapshot (null = absent) for undo; its own inverse puts back what it replaced. */
export const terrainRestoreHandler: CommandHandler = {
  id: 'terrain.restore',
  execute(document: CampusDocument, payload: Record<string, unknown>): MutationResult {
    const previous = snapshot(document)
    if (payload.terrain === null) delete document.terrain
    else if (isRecord(payload.terrain)) document.terrain = structuredClone(payload.terrain) as unknown as CampusTerrain
    if (payload.tiles === null) delete document.terrainTiles
    else if (isRecord(payload.tiles)) document.terrainTiles = { ...(payload.tiles as Tiles) }
    recordChange(document, { entityId: 'terrain', entityType: 'terrain', operation: 'restored' })
    return { success: true, entityId: 'terrain', data: { previous } }
  },
  inverse(_payload: Record<string, unknown>, result: MutationResult): Command | null {
    const previous = result.data?.previous as ReturnType<typeof snapshot> | undefined
    return previous ? restoreCommand(previous, 'Redo terrain setup') : null
  },
}
