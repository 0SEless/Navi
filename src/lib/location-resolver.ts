import type { NavNode, LatLng } from '@/types/nav-types'

export interface NearestNodeResult {
  node: NavNode
  distanceMeters: number
}

/** Equirectangular approximation — plenty accurate at campus scale. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = (a.lat - b.lat) * 111320
  const avgLat = ((a.lat + b.lat) / 2) * (Math.PI / 180)
  const dLng = (a.lng - b.lng) * 111320 * Math.cos(avgLat)
  return Math.hypot(dLat, dLng)
}

/**
 * Resolve a GPS coordinate to the nearest routable graph node.
 * `maxDistance` guards against resolving coordinates that are nowhere
 * near the campus (e.g. GPS garbage); returns null beyond it.
 */
export function resolveNearestNode(
  nodes: NavNode[],
  position: LatLng,
  maxDistance = 1500,
): NearestNodeResult | null {
  if (nodes.length === 0) return null
  let nearest = nodes[0]
  let minDist = distanceMeters(position, nearest.position)
  for (let i = 1; i < nodes.length; i++) {
    const dist = distanceMeters(position, nodes[i].position)
    if (dist < minDist) {
      minDist = dist
      nearest = nodes[i]
    }
  }
  if (minDist > maxDistance) return null
  return { node: nearest, distanceMeters: minDist }
}
