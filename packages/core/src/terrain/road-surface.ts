import type { CampusDocument } from '../types/document'
import { surfaceHeightAt, type TerrainSampler } from './compose'
import { toLatLng, toLocal } from './grid'
import type { SiteRoadSurface } from './site-artifact'

type Point = { x: number; y: number }

const MITER_LIMIT = 2

/** Every road with its width and end heights: typed heights in Typed mode, else the surface under its ends. */
export function siteRoadSurfaces(doc: CampusDocument, sampler: TerrainSampler): SiteRoadSurface[] {
  return (doc.roads ?? []).flatMap((road) => {
    const polyline = road.polyline?.points ?? []
    if (polyline.length < 2) return []
    // A route made over an outdoor stair or ramp is for navigation only: the stair itself is what visitors see.
    if (road.routing?.structureId) return []
    const typed = road.heightMode === 'typed'
    const start = typed && Number.isFinite(road.routing?.startElevationMeters) ? road.routing!.startElevationMeters! : surfaceHeightAt(doc, sampler, polyline[0])
    const end = typed && Number.isFinite(road.routing?.endElevationMeters) ? road.routing!.endElevationMeters! : surfaceHeightAt(doc, sampler, polyline[polyline.length - 1])
    return [{ id: road.id, polyline: polyline.map((p) => ({ lat: p.lat, lng: p.lng })), width: road.width, type: String(road.type), startHeightM: start, endHeightM: end }]
  })
}

function normalOf(a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  return { x: -dy / len, y: dx / len }
}

/** One side of the road, `side` = +1 left / −1 right; miter joins, bevelled past miter limit 2. */
function offsetSide(line: Point[], hw: number, side: number): Point[] {
  const out: Point[] = []
  const normals = line.slice(1).map((p, i) => {
    const n = normalOf(line[i], p)
    return { x: n.x * side, y: n.y * side }
  })
  line.forEach((p, i) => {
    if (i === 0 || i === line.length - 1) {
      const n = normals[Math.min(i, normals.length - 1)]
      out.push({ x: p.x + n.x * hw, y: p.y + n.y * hw })
      return
    }
    const n1 = normals[i - 1]
    const n2 = normals[i]
    const mx = n1.x + n2.x
    const my = n1.y + n2.y
    const mlen = Math.hypot(mx, my)
    const cos = mlen < 1e-9 ? 0 : (mx / mlen) * n1.x + (my / mlen) * n1.y
    const miter = cos > 1e-9 ? hw / cos : Infinity
    if (miter <= MITER_LIMIT * hw) {
      out.push({ x: p.x + (mx / mlen) * miter, y: p.y + (my / mlen) * miter })
    } else {
      out.push({ x: p.x + n1.x * hw, y: p.y + n1.y * hw }, { x: p.x + n2.x * hw, y: p.y + n2.y * hw })
    }
  })
  return out
}

/** A line alongside the road at `offsetM` from its centre line: + to the left, − to the right (markings). */
export function offsetRoadLine(road: SiteRoadSurface, offsetM: number): Array<{ lat: number; lng: number }> {
  if (road.polyline.length < 2) return []
  const frame = { originLat: road.polyline[0].lat, originLng: road.polyline[0].lng }
  const line = road.polyline.map((p) => toLocal(frame, p))
  return offsetSide(line, Math.abs(offsetM), offsetM >= 0 ? 1 : -1).map((p) => toLatLng(frame, p))
}

/**
 * Each road as a polygon at its width (both sides offset by half the width), for MapLibre `fill`
 * layers that drape on the terrain. Properties: id, type, width, startHeightM, endHeightM.
 */
/** Distance (m) from p to a polyline, all in one local frame. */
function distanceToPolyline(p: { x: number; y: number }, line: Array<{ x: number; y: number }>): number {
  let best = Infinity
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i]
    const dx = b.x - a.x, dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
  }
  return best
}

export function roadSurfacePolygons(roads: SiteRoadSurface[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
  // Every road in one frame, to tell a free road end from one that joins another road.
  const first = roads.find((r) => r.polyline.length > 0)?.polyline[0]
  const shared = { originLat: first?.lat ?? 0, originLng: first?.lng ?? 0 }
  const lines = roads.filter((r) => r.polyline.length >= 2 && r.width > 0).map((r) => ({ id: r.id, hw: r.width / 2, line: r.polyline.map((p) => toLocal(shared, p)) }))
  const joinsAnother = (roadId: string, end: { lat: number; lng: number }) => {
    const p = toLocal(shared, end)
    return lines.some((o) => o.id !== roadId && distanceToPolyline(p, o.line) <= o.hw + 0.5)
  }
  for (const road of roads) {
    if (road.polyline.length < 2 || !(road.width > 0)) continue
    const frame = { originLat: road.polyline[0].lat, originLng: road.polyline[0].lng }
    const line = road.polyline.map((p) => toLocal(frame, p))
    const hw = road.width / 2
    const ring = [...offsetSide(line, hw, 1), ...offsetSide(line, hw, -1).reverse()]
    ring.push(ring[0])
    features.push({
      type: 'Feature',
      properties: { id: road.id, type: road.type, width: road.width, startHeightM: road.startHeightM, endHeightM: road.endHeightM },
      geometry: { type: 'Polygon', coordinates: [ring.map((p) => {
        const q = toLatLng(frame, p)
        return [q.lng, q.lat]
      })] },
    })
    // Rounded free ends (dead ends); an end that joins another road just runs into it (no blob past its far side).
    const ends = [{ local: line[0], world: road.polyline[0] }, { local: line[line.length - 1], world: road.polyline[road.polyline.length - 1] }]
    for (const { local: end, world } of ends) {
      if (joinsAnother(road.id, world)) continue
      const disc = Array.from({ length: 25 }, (_, i) => {
        const a = (i % 24) / 24 * Math.PI * 2
        const q = toLatLng(frame, { x: end.x + Math.cos(a) * hw, y: end.y + Math.sin(a) * hw })
        return [q.lng, q.lat]
      })
      features.push({ type: 'Feature', properties: { id: road.id, type: road.type, width: road.width, cap: true }, geometry: { type: 'Polygon', coordinates: [disc] } })
    }
  }
  return { type: 'FeatureCollection', features }
}
