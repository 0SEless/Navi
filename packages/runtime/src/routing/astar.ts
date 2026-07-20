import type { NavigationGraph, NavNode, NavEdge } from '@navi/core'
import type { LatLng } from '@navi/core'

function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinDLng * sinDLng
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

interface AdjacencyEntry {
  nodeId: string
  edge: NavEdge
}

export class AStar {
  private nodes = new Map<string, NavNode>()
  private adjacency = new Map<string, AdjacencyEntry[]>()

  constructor(graph: NavigationGraph) {
    for (const node of graph.nodes) {
      this.nodes.set(node.id, node)
    }
    for (const edge of graph.edges) {
      const from = this.adjacency.get(edge.from) ?? []
      from.push({ nodeId: edge.to, edge })
      this.adjacency.set(edge.from, from)
      const to = this.adjacency.get(edge.to) ?? []
      to.push({ nodeId: edge.from, edge })
      this.adjacency.set(edge.to, to)
    }
  }

  findPath(fromId: string, toId: string): { path: string[]; distance: number } | null {
    const fromNode = this.nodes.get(fromId)
    const toNode = this.nodes.get(toId)
    if (!fromNode || !toNode) return null

    const open = new Set<string>([fromId])
    const cameFrom = new Map<string, string>()
    const gScore = new Map<string, number>([[fromId, 0]])
    const fScore = new Map<string, number>([[fromId, haversine(fromNode.position, toNode.position)]])

    while (open.size > 0) {
      let current = ''
      let currentF = Infinity
      for (const id of open) {
        const f = fScore.get(id) ?? Infinity
        if (f < currentF) { current = id; currentF = f }
      }

      if (current === toId) {
        const path: string[] = []
        let node = current
        while (node) {
          path.unshift(node)
          node = cameFrom.get(node) ?? ''
        }
        return { path, distance: gScore.get(toId) ?? 0 }
      }

      open.delete(current)
      const neighbors = this.adjacency.get(current) ?? []
      for (const neighbor of neighbors) {
        const tentativeG = (gScore.get(current) ?? 0) + neighbor.edge.weight
        if (tentativeG < (gScore.get(neighbor.nodeId) ?? Infinity)) {
          cameFrom.set(neighbor.nodeId, current)
          gScore.set(neighbor.nodeId, tentativeG)
          const target = this.nodes.get(neighbor.nodeId)
          if (target) {
            fScore.set(neighbor.nodeId, tentativeG + haversine(target.position, toNode.position))
          }
          open.add(neighbor.nodeId)
        }
      }
    }

    return null
  }
}
