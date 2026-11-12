import type { CampusDocument } from '@navi/core'
import type { OldMapExport, TrialTerrainExport } from './types'

const TERRAIN_FIELDS = ['terrain', 'terrainAreas', 'terrainVerticalDatum'] as const

/**
 * The old authored document, plus the old campus boundary and the trial campus terrain.
 * Nothing else is taken from the trial campus; inputs are not changed.
 */
export function buildImportDocument(old: OldMapExport, trial: TrialTerrainExport): CampusDocument {
  const doc = structuredClone(old.document)
  doc.boundary = { points: structuredClone(old.boundary) }
  for (const field of TERRAIN_FIELDS) {
    if (trial.terrain[field] !== undefined) doc[field] = structuredClone(trial.terrain[field])
  }
  doc.terrainTiles = Object.fromEntries(trial.tiles.map((tile) => [tile.tileId, tile.contentBase64]))
  return doc as unknown as CampusDocument
}
