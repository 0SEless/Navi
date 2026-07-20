import type { NavigationGraph, NavNode, NavEdge } from '@navi/core'
import { AStar } from './astar'
import { type Route, type RouteStep, type Instruction, type InstructionType } from './route'

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
}

function haversineDist(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinDLng * sinDLng
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const lat1 = a.lat * Math.PI / 180
  const lat2 = b.lat * Math.PI / 180
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function turnInstruction(prevBearing: number, currBearing: number): InstructionType | null {
  const diff = ((currBearing - prevBearing + 540) % 360) - 180
  if (diff > 30) return 'turn_right'
  if (diff < -30) return 'turn_left'
  return null
}

export class RoutingEngine {
  private astar: AStar
  private nodes = new Map<string, NavNode>()
  private edgesByNode = new Map<string, NavEdge[]>()

  constructor(graph: NavigationGraph) {
    this.astar = new AStar(graph)
    for (const node of graph.nodes) {
      this.nodes.set(node.id, node)
    }
    for (const edge of graph.edges) {
      const from = this.edgesByNode.get(edge.from) ?? []
      from.push(edge)
      this.edgesByNode.set(edge.from, from)
    }
  }

  findRoute(fromId: string, toId: string): Route | null {
    const result = this.astar.findPath(fromId, toId)
    if (!result) return null

    const fromNode = this.nodes.get(fromId)
    const toNode = this.nodes.get(toId)
    if (!fromNode || !toNode) return null

    const path: RouteStep[] = result.path.map(id => {
      const n = this.nodes.get(id)!
      return { nodeId: id, label: n.label, position: n.position, floor: n.floor, buildingId: n.buildingId }
    })

    const instructions: Instruction[] = []
    let prevBearing: number | null = null

    for (let i = 0; i < result.path.length - 1; i++) {
      const curr = this.nodes.get(result.path[i])!
      const next = this.nodes.get(result.path[i + 1])!
      const edges = this.edgesByNode.get(curr.id) ?? []
      const edge = edges.find(e => e.to === next.id || e.from === next.id)

      if (i < result.path.length - 2) {
        const currBearing = bearing(curr.position, next.position)
        if (prevBearing !== null) {
          const turn = turnInstruction(prevBearing, currBearing)
          if (turn) {
            instructions.push({ type: turn, text: turn === 'turn_left' ? 'Turn left' : 'Turn right', distance: 0, fromNode: curr.id, toNode: next.id })
          }
        }
        // Track bearing of this segment for comparison on the next iteration
        prevBearing = currBearing
      }

      const edgeTypeMap: Record<string, InstructionType> = { stairs: 'stairs', elevator: 'elevator', walk: 'walk', transition: 'walk' }
      const instType = edge ? edgeTypeMap[edge.type] ?? 'walk' : 'walk'
      const dist = edge ? edge.distance : haversineDist(curr.position, next.position)
      const edgeLabel = edge ? `${instType === 'stairs' ? 'stairs' : 'walk'} to ${next.label}` : `Walk to ${next.label}`
      instructions.push({ type: instType, text: edgeLabel, distance: dist, fromNode: curr.id, toNode: next.id })
    }

    instructions.push({ type: 'arrive', text: 'You have arrived', distance: 0, fromNode: toId, toNode: toId })

    const totalDistance = instructions.reduce((sum, i) => sum + i.distance, 0)
    const totalDuration = totalDistance / 1.4
    const travelTime = { seconds: Math.round(totalDuration), minutes: Math.round(totalDuration / 60), formatted: formatDuration(totalDuration) }

    return { path, instructions, totalDistance, totalDuration, fromLabel: fromNode.label, toLabel: toNode.label, travelTime }
  }
}
