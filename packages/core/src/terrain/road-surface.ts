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
export function roadSurfacePolygons(roads: SiteRoadSurface[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []
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
  }
  return { type: 'FeatureCollection', features }
}
