import type { NavNode, NavEdge, LatLng, PathResult } from '../types/nav-types'

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

function buildAdjacencyList(edges: NavEdge[]): Record<string, { nodeId: string; weight: number }[]> {
  const adj: Record<string, { nodeId: string; weight: number }[]> = {}
  for (const e of edges) {
    if (!adj[e.from]) adj[e.from] = []
    if (!adj[e.to]) adj[e.to] = []
    adj[e.from].push({ nodeId: e.to, weight: e.distance })
    adj[e.to].push({ nodeId: e.from, weight: e.distance })
  }
  return adj
}

function heuristic(a: LatLng, b: LatLng): number {
  return haversine(a, b)
}

function generateInstructions(path: string[], nodes: NavNode[]): PathStep[] {
  return path.map((nodeId, i) => {
    const node = nodes.find((n) => n.id === nodeId)!
    const prev = i > 0 ? nodes.find((n) => n.id === path[i - 1]) : null
    const dist = prev ? Math.round(heuristic(prev.position, node.position)) : 0
    let instruction = 'Start here'
    if (i > 0 && i < path.length - 1) {
      instruction = `Continue to ${node.name}`
    } else if (i === path.length - 1) {
      instruction = 'Destination reached'
    }
    return { nodeId, instruction, distance: dist }
  })
}

export function aStar(
  nodes: NavNode[],
  edges: NavEdge[],
  startId: string,
  endId: string
): PathResult | null {
  const adj = buildAdjacencyList(edges)
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const start = nodeMap[startId]
  const end = nodeMap[endId]
  if (!start || !end) return null

  const openSet = new Set([startId])
  const gScore: Record<string, number> = {}
  const fScore: Record<string, number> = {}
  const cameFrom: Record<string, string> = {}

  for (const n of nodes) {
    gScore[n.id] = Infinity
    fScore[n.id] = Infinity
  }
  gScore[startId] = 0
  fScore[startId] = heuristic(start.position, end.position)

  while (openSet.size > 0) {
    const current = [...openSet].reduce((best, id) =>
      fScore[id] < fScore[best] ? id : best, [...openSet][0]
    )
    if (current === endId) {
      const path: string[] = []
      let c: string | undefined = current
      while (c) {
        path.unshift(c)
        c = cameFrom[c]
      }
      return {
        path,
        cost: gScore[endId],
        steps: generateInstructions(path, nodes),
      }
    }
    openSet.delete(current)
    for (const neighbor of adj[current] ?? []) {
      const tentative = gScore[current] + neighbor.weight
      if (tentative < gScore[neighbor.nodeId]) {
        cameFrom[neighbor.nodeId] = current
        gScore[neighbor.nodeId] = tentative
        fScore[neighbor.nodeId] = tentative + heuristic(
          nodeMap[neighbor.nodeId].position,
          end.position
        )
        openSet.add(neighbor.nodeId)
      }
    }
  }
  return null
}

export function getAdjacencyList(edges: NavEdge[]): Record<string, { nodeId: string; weight: number }[]> {
  return buildAdjacencyList(edges)
}

export { haversine }
