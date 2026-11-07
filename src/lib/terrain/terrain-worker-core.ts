// The terrain worker's logic as plain functions (smooth sculpting, 2026-11-07): it keeps a copy of the height field
// and builds elevation tiles and contour lines from it, so the page's main thread stays free. terrain-worker.ts only
// wires this to `self.onmessage`; tests call it directly.
import { toLocal, type Rect, type TerrainGrid } from '@navi/core'
import { encodeDemTile } from './dem-encode'
import { contourGeoJson } from './contour-geojson'

export interface FieldArea { x0: number; y0: number; cols: number; rows: number }

export type WorkerMessage =
  | { kind: 'init'; grid: TerrainGrid; area: FieldArea; heights: Float32Array; changes: Float32Array }
  | { kind: 'patch'; rect: Rect; heights: Float32Array; changes: Float32Array }
  | { kind: 'tile'; id: number; scheme: 'heights' | 'changes'; z: number; x: number; y: number }
  | { kind: 'contours'; id: number; bbox: Rect }

export interface WorkerReply { id: number; pixels?: Uint8ClampedArray<ArrayBuffer>; geojson?: GeoJSON.FeatureCollection; error?: string }

/** Bilinear read; outside the field, its nearest edge (as HeightField does). */
function read(arr: Float32Array, a: FieldArea, x: number, y: number): number {
  const fx = Math.min(a.cols - 1.000001, Math.max(0, x - a.x0))
  const fy = Math.min(a.rows - 1.000001, Math.max(0, y - a.y0))
  const c = Math.floor(fx)
  const r = Math.floor(fy)
  const tx = fx - c
  const ty = fy - r
  const i = r * a.cols + c
  return arr[i] * (1 - tx) * (1 - ty) + arr[i + 1] * tx * (1 - ty) + arr[i + a.cols] * (1 - tx) * ty + arr[i + a.cols + 1] * tx * ty
}

export function createWorkerCore() {
  let grid: TerrainGrid | null = null
  let area: FieldArea | null = null
  let heights: Float32Array | null = null
  let changes: Float32Array | null = null

  /** Handles one message: a reply (with the buffers to transfer) for requests, null for init/patch. */
  function handle(m: WorkerMessage): { reply: WorkerReply; transfer: ArrayBuffer[] } | null {
    if (m.kind === 'init') {
      grid = m.grid
      area = m.area
      heights = m.heights
      changes = m.changes
      return null
    }
    if (m.kind === 'patch') {
      if (!area || !heights || !changes) return null
      const w = m.rect.maxX - m.rect.minX + 1
      const h = m.rect.maxY - m.rect.minY + 1
      for (let row = 0; row < h; row++) {
        const at = (m.rect.minY - area.y0 + row) * area.cols + (m.rect.minX - area.x0)
        heights.set(m.heights.subarray(row * w, row * w + w), at)
        changes.set(m.changes.subarray(row * w, row * w + w), at)
      }
      return null
    }
    if (!grid || !area || !heights || !changes) return { reply: { id: m.id, error: 'not ready' }, transfer: [] }
    const g = grid
    const a = area
    if (m.kind === 'tile') {
      const arr = m.scheme === 'heights' ? heights : changes
      const pixels = encodeDemTile(m.z, m.x, m.y, (lat, lng) => {
        const p = toLocal(g, { lat, lng })
        return read(arr, a, p.x, p.y)
      })
      return { reply: { id: m.id, pixels }, transfer: [pixels.buffer] }
    }
    const hs = heights
    return { reply: { id: m.id, geojson: contourGeoJson((x, y) => read(hs, a, x, y), g, m.bbox) }, transfer: [] }
  }

  return { handle }
}
