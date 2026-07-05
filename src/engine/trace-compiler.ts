import type { TracePath, NavNode, NavEdge, LatLng } from '../types/nav-types'
import { findEndpointNodes, findProximityConnections } from './intersection-engine'

export interface CompileTraceResult {
  nodes: NavNode[]
  edges: NavEdge[]
}

let _idCounter = 0
export function genId(prefix: string): string {
  _idCounter++
  return `${prefix}${String(_idCounter).padStart(4, '0')}`
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

function pointToLatLng(pt: LatLng): string {
  return `${pt.lat.toFixed(6)},${pt.lng.toFixed(6)}`
}

export function compileTrace(
  trace: TracePath,
  existingNodes: NavNode[],
  existingEdges: NavEdge[],
  roomNodes?: NavNode[]
): CompileTraceResult {
  if (trace.metadata?.role === 'wall') return { nodes: [], edges: [] }

  const nodes: NavNode[] = []
  const edges: NavEdge[] = []
  const generatedNodePositions = new Set<string>()

  // 1. Collect node positions from trace endpoints and all points
  const nodePositions: LatLng[] = []
  const endpoints = findEndpointNodes(trace)
  for (const ep of endpoints) {
    const key = pointToLatLng(ep)
    if (!generatedNodePositions.has(key)) {
      nodePositions.push(ep)
      generatedNodePositions.add(key)
    }
  }
  for (const pt of trace.points) {
    const key = pointToLatLng(pt)
    if (!generatedNodePositions.has(key)) {
      nodePositions.push(pt)
      generatedNodePositions.add(key)
    }
  }

  // 2. Create nodes
  const nodeMap = new Map<string, NavNode>()
  for (const pos of nodePositions) {
    const id = genId('N')
    const key = pointToLatLng(pos)
    const node: NavNode = {
      id, label: `${trace.name ?? 'Path'} Node`,
      name: `${trace.name ?? 'Path'} Node`,
      type: 'intersection',
      buildingId: trace.buildingId ?? '',
      campusId: trace.campusId ?? '',
      floor: trace.floor,
      position: pos,
    }
    nodeMap.set(key, node)
    nodes.push(node)
  }

  // 3. Create edges between consecutive trace points
  for (let i = 0; i < trace.points.length - 1; i++) {
    const fromKey = pointToLatLng(trace.points[i])
    const toKey = pointToLatLng(trace.points[i + 1])
    const fromNode = nodeMap.get(fromKey)
    const toNode = nodeMap.get(toKey)
    if (fromNode && toNode) {
      const edgeExists = existingEdges.some(
        (e) => (e.from === fromNode.id && e.to === toNode.id) ||
               (e.from === toNode.id && e.to === fromNode.id)
      )
      if (!edgeExists && fromNode.id !== toNode.id) {
        edges.push({
          id: genId('E'),
          from: fromNode.id, to: toNode.id,
          type: 'walk',
          distance: haversine(fromNode.position, toNode.position),
          weight: haversine(fromNode.position, toNode.position),
          campusId: trace.campusId ?? '',
        })
      }
    }
  }

  // 4. Connect to nearby room nodes
  const allRoomNodes = [...(roomNodes ?? []), ...existingNodes.filter(n => n.type === 'room')]
  for (const node of nodes) {
    const nearbyRooms = findProximityConnections(node.position, allRoomNodes.map(n => n.position), 10)
    for (const roomPos of nearbyRooms) {
      const roomNode = allRoomNodes.find(
        (n) => n.position.lat === roomPos.lat && n.position.lng === roomPos.lng
      )
      if (roomNode) {
        const edgeExists = existingEdges.some(
          (e) => (e.from === node.id && e.to === roomNode.id) ||
                 (e.from === roomNode.id && e.to === node.id)
        )
        if (!edgeExists) {
          edges.push({
            id: genId('E'),
            from: node.id, to: roomNode.id,
            type: 'transition',
            distance: haversine(node.position, roomNode.position),
            weight: haversine(node.position, roomNode.position),
            campusId: trace.campusId ?? '',
          })
        }
      }
    }
  }

  return { nodes, edges }
}
