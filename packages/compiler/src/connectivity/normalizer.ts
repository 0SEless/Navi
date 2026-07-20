import { haversineDistance } from '@navi/core'
import type { PrimitiveGraph, ConnectivityGraph, PrimitiveNode, PrimitiveEdge, CompilerDiagnostic } from '../types'

/**
 * Phase 3.1: Normalize Connectivity.
 *
 * This is the ONLY phase that modifies the PrimitiveGraph.
 * Responsibilities (in order):
 *   1. Snap nearby waypoints within mergeThreshold
 *   2. Remove dangling waypoints (zero incident edges)
 *   3. Repair broken edge references → reconnect to nearest survivor
 *   4. Merge overlapping access edges (same doorway)
 *
 * After this phase, the graph is "clean" — no further spatial repair needed.
 */
export function normalizeConnectivity(
  graph: PrimitiveGraph,
  mergeThreshold: number = 0.5,
): ConnectivityGraph {
  const diagnostics: CompilerDiagnostic[] = [...graph.diagnostics]
  const { nodes, edges } = deepCloneGraph(graph)

  // ── Step 1: Snap nearby waypoints ──
  const removedIds = new Set<string>()
  const mergeMap = new Map<string, string>() // removedId → survivorId

  for (let i = 0; i < nodes.length; i++) {
    if (removedIds.has(nodes[i].id)) continue
    if (nodes[i].kind !== 'waypoint') continue

    for (let j = i + 1; j < nodes.length; j++) {
      if (removedIds.has(nodes[j].id)) continue
      if (nodes[j].kind !== 'waypoint') continue

      const d = haversineDistance(nodes[i].position, nodes[j].position)
      if (d <= mergeThreshold) {
        removedIds.add(nodes[j].id)
        mergeMap.set(nodes[j].id, nodes[i].id)
        diagnostics.push({
          severity: 'info',
          sourceEntityId: graph.metadata.campusId,
          phase: 'connectivity',
          code: 'WAYPOINT_MERGED',
          message: `Waypoint ${nodes[j].id} merged into ${nodes[i].id} (distance ${d.toFixed(2)}m)`,
          relatedNodeIds: [nodes[i].id, nodes[j].id],
        })
      }
    }
  }

  const survivingNodes = nodes.filter(n => !removedIds.has(n.id))

  // ── Step 2: Repair edges referencing removed nodes ──
  const repairedEdges: PrimitiveEdge[] = []
  for (const edge of edges) {
    // Skip portal edges — they don't have from/to
    if (edge.kind === 'portal') {
      repairedEdges.push(edge)
      continue
    }

    let { from, to } = edge
    let repaired = false

    if (removedIds.has(from)) {
      from = mergeMap.get(from) || from
      repaired = true
    }
    if (removedIds.has(to)) {
      to = mergeMap.get(to) || to
      repaired = true
    }

    if (repaired) {
      repairedEdges.push({ ...edge, from, to })
    } else {
      repairedEdges.push(edge)
    }
  }

  // ── Step 3: Remove dangling waypoints (zero incident edges) ──
  const incidentCount = new Map<string, number>()
  for (const node of survivingNodes) {
    incidentCount.set(node.id, 0)
  }
  for (const edge of repairedEdges) {
    if (edge.kind === 'portal') continue
    incidentCount.set(edge.from, (incidentCount.get(edge.from) || 0) + 1)
    incidentCount.set(edge.to, (incidentCount.get(edge.to) || 0) + 1)
  }

  const danglingIds = new Set<string>()
  const finalNodes = survivingNodes.filter(n => {
    if (n.kind !== 'waypoint') return true
    const count = incidentCount.get(n.id) || 0
    if (count === 0) {
      danglingIds.add(n.id)
      diagnostics.push({
        severity: 'warning',
        sourceEntityId: n.source.entityId,
        phase: 'connectivity',
        code: 'SKELETON_DANGLING',
        message: `Waypoint ${n.id} has no incident edges — removed`,
        relatedNodeIds: [n.id],
      })
      return false
    }
    return true
  })

  // ── Step 3b: Reconnect skeleton edges that lost their target ──
  // Find edges where to/from was a dangling node and reconnect to nearest survivors
  const danglingRepairs: Array<{ edge: import('../types').SkeletonEdge; oldId: string; isFrom: boolean }> = []
  for (const edge of repairedEdges) {
    if (edge.kind === 'portal') continue
    if (danglingIds.has(edge.from) && edge.kind === 'skeleton') {
      danglingRepairs.push({ edge, oldId: edge.from, isFrom: true })
    }
    if (danglingIds.has(edge.to) && edge.kind === 'skeleton') {
      danglingRepairs.push({ edge, oldId: edge.to, isFrom: false })
    }
  }

  for (const repair of danglingRepairs) {
    const nearest = findNearestWaypoint(
      finalNodes.find(n => n.id === repair.edge.from || n.id === repair.edge.to)?.position || { lat: 0, lng: 0 },
      finalNodes,
    )
    if (nearest) {
      if (repair.isFrom) {
        repair.edge.from = nearest.id
      } else {
        repair.edge.to = nearest.id
      }
      diagnostics.push({
        severity: 'info',
        sourceEntityId: repair.edge.source.entityId,
        phase: 'connectivity',
        code: 'EDGE_REPAIRED',
        message: `Edge ${repair.edge.id} reconnected to ${nearest.id}`,
        relatedNodeIds: [repair.edge.id, nearest.id],
      })
    }
  }

  // ── Step 4: Merge overlapping access edges ──
  const seenAccessPairs = new Set<string>()
  const dedupedEdges = repairedEdges.filter(edge => {
    if (edge.kind !== 'access') return true
    const key = `${edge.from}|${edge.to}`
    if (seenAccessPairs.has(key)) return false
    seenAccessPairs.add(key)
    return true
  })

  // Build building/floor counts from final nodes
  const buildingIds = new Set(finalNodes.map(n => n.buildingId))
  const floorKeys = new Set(finalNodes.map(n => `${n.buildingId}:${n.floor}`))

  return {
    nodes: finalNodes,
    edges: dedupedEdges,
    metadata: {
      campusId: graph.metadata.campusId,
      buildingCount: buildingIds.size,
      floorCount: floorKeys.size,
      generatedAt: graph.metadata.generatedAt,
    },
    diagnostics,
  }
}

function findNearestWaypoint(pos: { lat: number; lng: number }, nodes: PrimitiveNode[]): PrimitiveNode | null {
  let best: PrimitiveNode | null = null
  let bestDist = Infinity
  for (const node of nodes) {
    if (node.kind !== 'waypoint') continue
    const d = haversineDistance(pos, node.position)
    if (d < bestDist) {
      bestDist = d
      best = node
    }
  }
  return best
}

function deepCloneGraph(graph: PrimitiveGraph): { nodes: PrimitiveNode[]; edges: PrimitiveEdge[] } {
  return {
    nodes: JSON.parse(JSON.stringify(graph.nodes)),
    edges: JSON.parse(JSON.stringify(graph.edges)),
  }
}
