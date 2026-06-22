import type { LatLng, TracePath } from '../types/nav-types'

export interface IntersectionPoint {
  lat: number
  lng: number
  traceAIndex: number
  traceBIndex: number
}

function crossProduct(o: LatLng, a: LatLng, b: LatLng): number {
  return (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng)
}

function onSegment(p: LatLng, q: LatLng, r: LatLng): boolean {
  return (
    q.lat <= Math.max(p.lat, r.lat) &&
    q.lat >= Math.min(p.lat, r.lat) &&
    q.lng <= Math.max(p.lng, r.lng) &&
    q.lng >= Math.min(p.lng, r.lng)
  )
}

function segmentsIntersect(p1: LatLng, q1: LatLng, p2: LatLng, q2: LatLng): LatLng | null {
  const o1 = crossProduct(p1, q1, p2)
  const o2 = crossProduct(p1, q1, q2)
  const o3 = crossProduct(p2, q2, p1)
  const o4 = crossProduct(p2, q2, q1)

  if (o1 === 0 && onSegment(p1, p2, q1)) return p2
  if (o2 === 0 && onSegment(p1, q2, q1)) return q2
  if (o3 === 0 && onSegment(p2, p1, q2)) return p1
  if (o4 === 0 && onSegment(p2, q1, q2)) return q1

  if (
    (o1 > 0) !== (o2 > 0) &&
    (o3 > 0) !== (o4 > 0)
  ) {
    const d1x = q1.lng - p1.lng
    const d1y = q1.lat - p1.lat
    const d2x = q2.lng - p2.lng
    const d2y = q2.lat - p2.lat
    const denom = d1x * d2y - d1y * d2x
    if (denom === 0) return null
    const t = ((p2.lng - p1.lng) * d2y - (p2.lat - p1.lat) * d2x) / denom
    return {
      lat: p1.lat + t * d1y,
      lng: p1.lng + t * d1x,
    }
  }

  return null
}

export function findLineIntersections(
  traceA: LatLng[],
  traceB: LatLng[]
): IntersectionPoint[] {
  const results: IntersectionPoint[] = []
  for (let i = 0; i < traceA.length - 1; i++) {
    for (let j = 0; j < traceB.length - 1; j++) {
      const pt = segmentsIntersect(traceA[i], traceA[i + 1], traceB[j], traceB[j + 1])
      if (pt) {
        results.push({
          lat: pt.lat,
          lng: pt.lng,
          traceAIndex: i,
          traceBIndex: j,
        })
      }
    }
  }
  return results
}

export function findEndpointNodes(trace: TracePath): LatLng[] {
  if (trace.points.length === 0) return []
  if (trace.points.length === 1) return [trace.points[0]]
  return [trace.points[0], trace.points[trace.points.length - 1]]
}

function haversine(a: LatLng, b: LatLng): number {
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

export function findProximityConnections(
  point: LatLng,
  candidates: LatLng[],
  maxDistance: number
): LatLng[] {
  return candidates.filter((c) => haversine(point, c) <= maxDistance)
}
