import { toLatLng, toLocal } from './grid'
import type { TerrainGrid } from './types'

type LatLng = { lat: number; lng: number }

const PIECE_M = 3
const DEPTH_M = 0.4
const MIN_TOP_M = 0.1

/**
 * Plinths (owner 2026-11-15, banks and plinths): downhill the ground is not filled, so the building shows its
 * base wall from the ground up to its floor. Each wall is split into pieces of at most 3 m, each a thin quad
 * 0.4 m outside the wall. MapLibre lifts a fill-extrusion by the ground under its own centre, so a piece is drawn
 * from 0 up to (floor − ground at its centre); only pieces at least 0.1 m tall are kept.
 */
export function plinthFeatures(
  ring: LatLng[],
  baseM: number,
  grid: TerrainGrid,
  heightAt: (x: number, y: number) => number,
  buildingId: string,
): GeoJSON.Feature<GeoJSON.Polygon>[] {
  const pts = ring.map((p) => toLocal(grid, p))
  const open = pts.length > 1 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y ? pts.slice(0, -1) : pts
  if (open.length < 3) return []
  let area = 0
  for (let i = 0; i < open.length; i++) {
    const a = open[i]
    const b = open[(i + 1) % open.length]
    area += a.x * b.y - b.x * a.y
  }
  if (Math.abs(area) < 1e-9) return []
  const outwardSign = area > 0 ? 1 : -1 // counter-clockwise: outward is to the right of each edge
  const features: GeoJSON.Feature<GeoJSON.Polygon>[] = []
  for (let i = 0; i < open.length; i++) {
    const a = open[i]
    const b = open[(i + 1) % open.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) continue
    const nx = (outwardSign * dy) / len * DEPTH_M
    const ny = (outwardSign * -dx) / len * DEPTH_M
    const pieces = Math.ceil(len / PIECE_M)
    for (let k = 0; k < pieces; k++) {
      const p0 = { x: a.x + (dx * k) / pieces, y: a.y + (dy * k) / pieces }
      const p1 = { x: a.x + (dx * (k + 1)) / pieces, y: a.y + (dy * (k + 1)) / pieces }
      const quad = [p0, p1, { x: p1.x + nx, y: p1.y + ny }, { x: p0.x + nx, y: p0.y + ny }]
      const cx = quad.reduce((s, q) => s + q.x, 0) / 4
      const cy = quad.reduce((s, q) => s + q.y, 0) / 4
      const top = baseM - heightAt(cx, cy)
      if (!Number.isFinite(top) || top < MIN_TOP_M) continue
      const coords = [...quad, quad[0]].map((q) => { const g = toLatLng(grid, q); return [g.lng, g.lat] })
      features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: { kind: 'plinth', buildingId, base: 0, top } })
    }
  }
  return features
}
