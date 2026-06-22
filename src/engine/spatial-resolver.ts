import type { Graph } from './graph'
import type { LatLng, NavNode } from '@/types/nav-types'
import { haversine } from './a-star'

export interface ResolveOptions {
  floor?: number
  maxDistance?: number
  type?: 'gps' | 'qr'
  qrNodeId?: string
}

export function resolvePosition(
  graph: Graph,
  coordinates: LatLng,
  options?: ResolveOptions
): NavNode | null {
  const opts = options ?? {}

  if (opts.type === 'qr' && opts.qrNodeId) {
    return graph.getNode(opts.qrNodeId) ?? null
  }

  const maxDistance = opts.maxDistance ?? 50
  const nodes = opts.floor !== undefined
    ? graph.nodes.filter((n) => n.floor === opts.floor)
    : graph.nodes

  let nearest: NavNode | null = null
  let minDist = maxDistance

  for (const node of nodes) {
    const d = haversine(coordinates, node.position)
    if (d < minDist) {
      minDist = d
      nearest = node
    }
  }

  return nearest
}
