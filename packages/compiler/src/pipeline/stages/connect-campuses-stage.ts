import type {
  CompilerStagePlugin,
  CompilerStageInput,
  CompilerStageOutput,
  NavNode,
  NavEdge,
} from '../../types'

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinDLng * sinDLng
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/**
 * Stage 4: Connect Campuses — Cross-building connections,
 * entrance-to-road, outdoor path connectivity.
 */
export class CampusConnectorStage implements CompilerStagePlugin {
  id = 'compiler-connect-campuses-stage'
  targetStage = 'connect-campuses' as const
  mode = 'replace' as const
  meta = {
    name: 'Campus Connector Stage',
    version: '1.0.0',
    description: 'Connects buildings to roads for cross-campus navigation',
  }

  execute(input: CompilerStageInput, _next: (input: CompilerStageInput) => CompilerStageOutput): CompilerStageOutput {
    const nodes = input.nodes
    const edges = input.edges
    if (!nodes || !edges) {
      return { errors: [{ code: 'MISSING_INPUT', message: 'CampusConnectorStage requires nodes and edges' }] }
    }

    const result = connectCampuses(nodes, edges)
    return {
      nodes: result.nodes,
      edges: result.edges,
      warnings: result.warnings,
    }
  }
}

export function connectCampuses(
  nodes: NavNode[],
  edges: NavEdge[],
): { nodes: NavNode[]; edges: NavEdge[]; warnings: { code: string; message: string; entityId: string }[] } {
  const warnings: { code: string; message: string; entityId: string }[] = []
  const newEdges = [...edges]
  let idx = edges.length
  const seen = new Set<string>()

  const edgeKey = (a: string, b: string) => a < b ? `${a}--${b}` : `${b}--${a}`
  for (const e of edges) {
    seen.add(edgeKey(e.from, e.to))
  }

  // Find entrance nodes (building entry points)
  const entranceNodes = nodes.filter(n =>
    n.type === 'transition' && n.properties.entityType === 'entrance',
  )

  // Find road corridor nodes (outdoor paths)
  const roadNodes = nodes.filter(n =>
    n.type === 'corridor' && n.properties.entityType === 'road',
  )

  // Connect each entrance to the nearest road endpoint within 200m
  for (const en of entranceNodes) {
    let bestDist = Infinity
    let bestNode: NavNode | null = null
    for (const rn of roadNodes) {
      const d = haversine(en.position, rn.position)
      if (d < bestDist) { bestDist = d; bestNode = rn }
    }
    if (bestNode && bestDist < 200) {
      const key = edgeKey(en.id, bestNode.id)
      if (!seen.has(key)) {
        seen.add(key)
        newEdges.push({
          id: `edge-${idx++}`,
          from: en.id,
          to: bestNode.id,
          type: 'walk',
          distance: bestDist,
          weight: bestDist,
        })
      }
    } else if (bestNode) {
      warnings.push({
        code: 'DISTANT_ENTRANCE',
        message: `Entrance "${en.label}" is ${bestDist.toFixed(0)}m from nearest road`,
        entityId: en.id,
      })
    } else {
      warnings.push({
        code: 'UNCONNECTED_ENTRANCE',
        message: `Entrance "${en.label}" has no road connection`,
        entityId: en.id,
      })
    }
  }

  // Connect road segments end-to-end
  const byEntity = new Map<string, NavNode[]>()
  for (const rn of roadNodes) {
    const eid = String(rn.properties.entityId || '')
    if (!byEntity.has(eid)) byEntity.set(eid, [])
    byEntity.get(eid)!.push(rn)
  }
  for (const [, group] of byEntity) {
    for (let i = 0; i < group.length - 1; i++) {
      const d = haversine(group[i].position, group[i + 1].position)
      const key = edgeKey(group[i].id, group[i + 1].id)
      if (!seen.has(key)) {
        seen.add(key)
        newEdges.push({
          id: `edge-${idx++}`,
          from: group[i].id,
          to: group[i + 1].id,
          type: 'walk',
          distance: d,
          weight: d,
        })
      }
    }
  }

  return { nodes, edges: newEdges, warnings }
}
