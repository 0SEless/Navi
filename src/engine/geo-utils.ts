import type { LatLng } from '../types/nav-types'

export function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const aVal =
    sinDLat * sinDLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinDLng * sinDLng
  return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal))
}

export function lineSegmentIntersection(
  a: LatLng, b: LatLng, c: LatLng, d: LatLng
): LatLng | null {
  const cross2D = (px: number, py: number, qx: number, qy: number) =>
    px * qy - py * qx

  const bx_ax = b.lng - a.lng
  const by_ay = b.lat - a.lat
  const dx_cx = d.lng - c.lng
  const dy_cy = d.lat - c.lat
  const cx_ax = c.lng - a.lng
  const cy_ay = c.lat - a.lat

  const denom = cross2D(bx_ax, by_ay, dx_cx, dy_cy)
  if (Math.abs(denom) < 1e-10) return null

  const t = cross2D(cx_ax, cy_ay, dx_cx, dy_cy) / denom
  const u = cross2D(cx_ax, cy_ay, bx_ax, by_ay) / denom

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      lat: a.lat + t * by_ay,
      lng: a.lng + t * bx_ax,
    }
  }

  return null
}

export function closestPointOnSegment(p: LatLng, a: LatLng, b: LatLng): LatLng {
  const abx = b.lng - a.lng
  const aby = b.lat - a.lat
  const apx = p.lng - a.lng
  const apy = p.lat - a.lat
  const dot = apx * abx + apy * aby
  const len2 = abx * abx + aby * aby

  if (len2 === 0) return a

  const t = Math.max(0, Math.min(1, dot / len2))

  return {
    lat: a.lat + t * aby,
    lng: a.lng + t * abx,
  }
}

export function pointToSegmentDistance(p: LatLng, a: LatLng, b: LatLng): number {
  const closest = closestPointOnSegment(p, a, b)
  return haversine(p, closest)
}
