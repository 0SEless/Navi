import type { TracePath, NavNode, NavEdge, LatLng } from '../types/nav-types'
import { findEndpointNodes } from './intersection-engine'
import { haversine } from './geo-utils'
// Share the engine's single id counter so trace nodes can never collide with
// compiled component nodes (two independent counters produced identical ids
// like N0001, silently overwriting hallway/room nodes in the graph).
import { genId } from './component-compiler'

export interface CompileTraceResult {
  nodes: NavNode[]
  edges: NavEdge[]
}

function pointToLatLng(pt: LatLng): string {
  return `${pt.lat.toFixed(6)},${pt.lng.toFixed(6)}`
}

export function compileTrace(
  trace: TracePath,
  existingNodes: NavNode[],
  existingEdges: NavEdge[],
): CompileTraceResult {
  if (trace.metadata?.role === 'wall') return { nodes: [], edges: [] }

  const nodes: NavNode[] = []
  const edges: NavEdge[] = []
  const generatedNodePositions = new Set<string>()

  // 1. Collect node positions from trace endpoints and all points
  const nodePositions: LatLng[] = []
  const endpoints = findEndpointNodes(trace)
  const endpointKeys = new Set(endpoints.map(pointToLatLng))
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
      // Endpoint availability is distinct from a shared intersection. The
      // renderer uses this marker to expose both ends for explicit authoring;
      // it must never be interpreted as an automatic graph connection.
      metadata: endpointKeys.has(key) ? { roadEndpoint: true } : {},
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

  // 4. NOTE: traces intentionally do NOT connect to room doors. A road→room_door
  //    edge would bypass the building entrance (road → entrance → hallway →
  //    room_door is the ONLY valid path into a building). Buildings link to
  //    traces via their entrances only (see GraphAdapter post-trace pass).

  return { nodes, edges }
}
