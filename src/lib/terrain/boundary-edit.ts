import type { LatLng } from '@navi/core'
import { openRing } from './terrain-start'

/** The middle of each edge of the boundary, including the closing edge (last corner back to the first). */
export function edgeMidpoints(points: LatLng[]): LatLng[] {
  const ring = openRing(points)
  return ring.map((p, i) => {
    const q = ring[(i + 1) % ring.length]
    return { lat: (p.lat + q.lat) / 2, lng: (p.lng + q.lng) / 2 }
  })
}

/** A new corner on edge `edgeIndex` (between corner edgeIndex and the next one). */
export function insertCorner(points: LatLng[], edgeIndex: number, at: LatLng): LatLng[] {
  const ring = openRing(points)
  return [...ring.slice(0, edgeIndex + 1), { lat: at.lat, lng: at.lng }, ...ring.slice(edgeIndex + 1)]
}

/** The boundary without corner `index`, or null when fewer than 3 corners would be left. */
export function removeCorner(points: LatLng[], index: number): LatLng[] | null {
  const ring = openRing(points)
  if (ring.length <= 3) return null
  return ring.filter((_, i) => i !== index)
}
