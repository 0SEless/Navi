import type { NavEdge, NavNode, LatLng } from '@/types/nav-types'
import { distanceMeters } from '@navi/core'

export { distanceMeters }

export interface NearestNodeResult {
  node: NavNode
  distanceMeters: number
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
  /** When given, only points the route network reaches (on some edge) can be the start. */
  edges?: NavEdge[],
): NearestNodeResult | null {
  nodes = edges ? routableNodes(nodes, edges) : nodes
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

/** The points some route edge touches: a start or destination anywhere else could never be routed from or to. */
export function routableNodes(nodes: NavNode[], edges: NavEdge[]): NavNode[] {
  const linked = new Set<string>()
  for (const edge of edges) {
    linked.add(edge.from)
    linked.add(edge.to)
  }
  return nodes.filter((node) => linked.has(node.id))
}
