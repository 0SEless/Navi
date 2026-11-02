import {
  createTerrainSampler,
  decodeTile,
  lassoOp,
  resetOp,
  slopeOp,
  toLocal,
  type CampusDocument,
  type TerrainBaseSource,
  type TileId,
} from '@navi/core'
import type { Command } from '@navi/editor'
import { tilesCommand } from './terrain-stroke'

type LatLng = { lat: number; lng: number }

function workspace(document: CampusDocument) {
  const terrain = document.terrain
  if (!terrain) return null
  const tiles = new Map<TileId, Int16Array>()
  const loadTile = (id: TileId) => {
    const encoded = document.terrainTiles?.[id]
    return encoded ? decodeTile(encoded) : null
  }
  const sampler = createTerrainSampler(document, { tilesOverride: tiles })!
  const local = (p: LatLng) => toLocal(terrain.grid, p)
  return { tiles, loadTile, sampler, local }
}

/** Lasso (set / raise by / lower by) inside the drawn polygon, as one undo step. */
export function lassoCommand(document: CampusDocument, polygon: LatLng[], op: { kind: 'set' | 'raise-by' | 'lower-by'; meters: number }): Command | null {
  const w = workspace(document)
  if (!w || polygon.length < 3) return null
  const touched = lassoOp(w.tiles, w.loadTile, w.sampler, polygon.map(w.local), op)
  return tilesCommand(document, w.tiles, touched, op.kind === 'set' ? 'Set area height' : op.kind === 'raise-by' ? 'Raise area' : 'Lower area')
}

/** A straight slope between two points at the given heights, `widthM` wide. */
export function slopeCommand(document: CampusDocument, from: LatLng & { h: number }, to: LatLng & { h: number }, widthM: number): Command | null {
  const w = workspace(document)
  if (!w) return null
  const touched = slopeOp(w.tiles, w.loadTile, w.sampler, { ...w.local(from), h: from.h }, { ...w.local(to), h: to.h }, widthM)
  return tilesCommand(document, w.tiles, touched, 'Make slope')
}

/** Removes the changes inside the polygon (back to the base ground). */
export function resetCommand(document: CampusDocument, polygon: LatLng[]): Command | null {
  const w = workspace(document)
  if (!w || polygon.length < 3) return null
  const touched = resetOp(w.tiles, w.loadTile, polygon.map(w.local))
  return tilesCommand(document, w.tiles, touched, 'Reset ground')
}

/** terrain.setup payload that makes traced contour lines the base ("Generate surface"). */
export function contoursSetupPayload(document: CampusDocument, lines: Array<{ elevationM: number; points: LatLng[] }>): Record<string, unknown> {
  const heights = lines.map((line) => line.elevationM)
  const base: TerrainBaseSource = { kind: 'contours', lines: lines.map((line) => ({ elevationM: line.elevationM, points: line.points.map((p) => ({ lat: p.lat, lng: p.lng })) })), sourceNote: 'Traced contour lines' }
  return {
    reference: document.terrain?.reference ?? { name: 'Traced contours', zeroMeaning: 'The lowest traced line is its own height' },
    base,
    colorRange: { minM: Math.min(...heights), maxM: Math.max(...heights) },
  }
}
