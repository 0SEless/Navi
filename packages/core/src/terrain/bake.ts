import type { CampusDocument } from '../types/document'
import { createTerrainSampler } from './compose'
import { clampCm, encodeInt16, GRID_MARGIN_METERS, toLatLng, toLocal } from './grid'
import type { BakedTerrain } from './types'

/** The final ground over the boundary's bounding box + 20 m, 1 m cells, Int16 cm, row-major from the south-west. */
export function bakeTerrain(doc: CampusDocument): BakedTerrain | null {
  const sampler = createTerrainSampler(doc)
  const boundary = doc.boundary?.points ?? []
  if (!sampler || boundary.length < 3) return null
  const local = boundary.map((p) => toLocal(sampler.grid, p))
  const x0 = Math.floor(Math.min(...local.map((p) => p.x)) - GRID_MARGIN_METERS + 1e-6)
  const x1 = Math.ceil(Math.max(...local.map((p) => p.x)) + GRID_MARGIN_METERS - 1e-6)
  const y0 = Math.floor(Math.min(...local.map((p) => p.y)) - GRID_MARGIN_METERS + 1e-6)
  const y1 = Math.ceil(Math.max(...local.map((p) => p.y)) + GRID_MARGIN_METERS - 1e-6)
  const cols = x1 - x0 + 1
  const rows = y1 - y0 + 1
  const cells = new Int16Array(cols * rows)
  let min = Infinity
  let max = -Infinity
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cm = clampCm(sampler.heightAt(x0 + col, y0 + row) * 100)
      cells[row * cols + col] = cm
      if (cm < min) min = cm
      if (cm > max) max = cm
    }
  }
  const origin = toLatLng(sampler.grid, { x: x0, y: y0 })
  return { originLat: origin.lat, originLng: origin.lng, cols, rows, cellMeters: 1, heightsCm: encodeInt16(cells), minM: min / 100, maxM: max / 100 }
}
