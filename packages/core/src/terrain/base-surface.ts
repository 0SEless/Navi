import { toLocal } from './grid'
import type { TerrainBaseSource, TerrainGrid } from './types'

type Point = { x: number; y: number }

interface MeshIndex {
  xs: Float64Array
  ys: Float64Array
  hs: Float64Array
  triangles: Array<[number, number, number]>
  /** Triangles per 10 m bucket, keyed "bx,by". */
  buckets: Map<string, number[]>
}

interface ContourIndex {
  lines: Array<{ elevationM: number; points: Point[] }>
}

const BUCKET_METERS = 10
const meshCache = new WeakMap<TerrainBaseSource, { grid: TerrainGrid; index: MeshIndex }>()
const contourCache = new WeakMap<TerrainBaseSource, { grid: TerrainGrid; index: ContourIndex }>()

function sameGrid(a: TerrainGrid, b: TerrainGrid): boolean {
  return a.originLat === b.originLat && a.originLng === b.originLng
}

function meshIndex(source: Extract<TerrainBaseSource, { kind: 'mesh' }>, grid: TerrainGrid): MeshIndex {
  const cached = meshCache.get(source)
  if (cached && sameGrid(cached.grid, grid)) return cached.index
  const n = source.vertices.length
  const xs = new Float64Array(n)
  const ys = new Float64Array(n)
  const hs = new Float64Array(n)
  source.vertices.forEach(([lat, lng, h], i) => {
    const p = toLocal(grid, { lat, lng })
    xs[i] = p.x
    ys[i] = p.y
    hs[i] = h
  })
  const buckets = new Map<string, number[]>()
  source.triangles.forEach(([a, b, c], t) => {
    const minX = Math.floor(Math.min(xs[a], xs[b], xs[c]) / BUCKET_METERS)
    const maxX = Math.floor(Math.max(xs[a], xs[b], xs[c]) / BUCKET_METERS)
    const minY = Math.floor(Math.min(ys[a], ys[b], ys[c]) / BUCKET_METERS)
    const maxY = Math.floor(Math.max(ys[a], ys[b], ys[c]) / BUCKET_METERS)
    for (let bx = minX; bx <= maxX; bx++) {
      for (let by = minY; by <= maxY; by++) {
        const key = `${bx},${by}`
        const list = buckets.get(key)
        if (list) list.push(t)
        else buckets.set(key, [t])
      }
    }
  })
  const index = { xs, ys, hs, triangles: source.triangles, buckets }
  meshCache.set(source, { grid, index })
  return index
}

function contourIndex(source: Extract<TerrainBaseSource, { kind: 'contours' }>, grid: TerrainGrid): ContourIndex {
  const cached = contourCache.get(source)
  if (cached && sameGrid(cached.grid, grid)) return cached.index
  const index = { lines: source.lines.map((line) => ({ elevationM: line.elevationM, points: line.points.map((p) => toLocal(grid, p)) })) }
  contourCache.set(source, { grid, index })
  return index
}

function sampleMesh(index: MeshIndex, x: number, y: number): number | null {
  const candidates = index.buckets.get(`${Math.floor(x / BUCKET_METERS)},${Math.floor(y / BUCKET_METERS)}`)
  if (!candidates) return null
  const { xs, ys, hs } = index
  for (const t of candidates) {
    const [a, b, c] = index.triangles[t]
    const det = (ys[b] - ys[c]) * (xs[a] - xs[c]) + (xs[c] - xs[b]) * (ys[a] - ys[c])
    if (det === 0) continue
    const wa = ((ys[b] - ys[c]) * (x - xs[c]) + (xs[c] - xs[b]) * (y - ys[c])) / det
    const wb = ((ys[c] - ys[a]) * (x - xs[c]) + (xs[a] - xs[c]) * (y - ys[c])) / det
    const wc = 1 - wa - wb
    const eps = -1e-9
    if (wa >= eps && wb >= eps && wc >= eps) return wa * hs[a] + wb * hs[b] + wc * hs[c]
  }
  return null
}

function distanceToPolyline(points: Point[], x: number, y: number): number {
  if (points.length === 1) return Math.hypot(x - points[0].x, y - points[0].y)
  let best = Infinity
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const dx = points[i].x - a.x
    const dy = points[i].y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2))
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)))
  }
  return best
}

/**
 * Nearest contour line (e0, d0) and the nearest line of another elevation (e1, d1):
 * height = e0 + (e1 − e0) · d0 / (d0 + d1). One elevation only → e0.
 */
function sampleContours(index: ContourIndex, x: number, y: number): number | null {
  const nearestByElevation = new Map<number, number>()
  for (const line of index.lines) {
    const d = distanceToPolyline(line.points, x, y)
    const current = nearestByElevation.get(line.elevationM)
    if (current === undefined || d < current) nearestByElevation.set(line.elevationM, d)
  }
  const ranked = [...nearestByElevation].sort((a, b) => a[1] - b[1])
  if (ranked.length === 0) return null
  const [e0, d0] = ranked[0]
  if (ranked.length === 1 || d0 === 0) return e0
  const [e1, d1] = ranked[1]
  return e0 + ((e1 - e0) * d0) / (d0 + d1)
}

/** Base ground height in metres at local (x, y), or null outside the source. */
export function sampleBase(source: TerrainBaseSource, grid: TerrainGrid, x: number, y: number): number | null {
  return source.kind === 'mesh' ? sampleMesh(meshIndex(source, grid), x, y) : sampleContours(contourIndex(source, grid), x, y)
}
