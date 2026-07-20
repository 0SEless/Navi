import type { LoadedPackage } from '../loader'
import type { Route } from '../routing/route'
import { RoutingEngine } from '../routing/routing-engine'
import type { NavNode, LatLng, RoutePreferences } from '@navi/core'

export interface NearestNodeResult {
  nodeId: string
  distance: number
}

function haversine(a: LatLng, b: LatLng): number {
  const R = 6371000
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinDLng * sinDLng
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function findClosestNode(nodes: NavNode[], position: LatLng): NearestNodeResult | null {
  if (nodes.length === 0) return null
  let best: NavNode = nodes[0]
  let bestDist = haversine(position, best.position)
  for (let i = 1; i < nodes.length; i++) {
    const d = haversine(position, nodes[i].position)
    if (d < bestDist) { best = nodes[i]; bestDist = d }
  }
  return { nodeId: best.id, distance: Math.round(bestDist * 100) / 100 }
}

export class NavigationService {
  private engine: RoutingEngine
  private nodes: NavNode[]

  constructor(pkg: LoadedPackage) {
    this.engine = new RoutingEngine(pkg.graph)
    this.nodes = pkg.graph.nodes
  }

  findRoute(fromId: string, toId: string, _preferences?: RoutePreferences): Route | null {
    return this.engine.findRoute(fromId, toId)
  }

  nearestNode(position: LatLng): NearestNodeResult | null {
    return findClosestNode(this.nodes, position)
  }

  nearestEntrance(position: LatLng): NearestNodeResult | null {
    const entrances = this.nodes.filter(n => n.type === 'transition')
    if (entrances.length === 0) return null
    return findClosestNode(entrances, position)
  }

  isReachable(fromId: string, toId: string): boolean {
    return this.engine.findRoute(fromId, toId) !== null
  }
}
