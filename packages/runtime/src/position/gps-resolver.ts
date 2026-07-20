import type { LatLng } from '@navi/core'
import type { NavNode } from '@navi/core'

function haversineDist(a: LatLng, b: LatLng): number {
  const R = 6371000
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinDLng * sinDLng
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export class GpsResolver {
  private nodes: NavNode[]

  constructor(nodes: NavNode[]) {
    this.nodes = nodes
  }

  snap(position: LatLng, floor?: number): { node: NavNode; distance: number } | null {
    let best: { node: NavNode; distance: number } | null = null
    for (const node of this.nodes) {
      if (floor !== undefined && node.floor !== floor) continue
      const dist = haversineDist(position, node.position)
      if (!best || dist < best.distance) {
        best = { node, distance: dist }
      }
    }
    return best
  }
}
