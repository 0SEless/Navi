import type { CampusDocument } from '@navi/core'
import type {
  CompilerStagePlugin,
  CompilerStageInput,
  CompilerStageOutput,
  NavNode,
  NavEdge,
  ParsedDocument,
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
 * Stage 3: Build Edges — Connects nodes based on entity relationships.
 * Room↔Hallway, Hallway↔Entrance, Entrance↔Road, etc.
 */
export class BuildEdgesStage implements CompilerStagePlugin {
  id = 'compiler-build-edges-stage'
  targetStage = 'build-edges' as const
  mode = 'replace' as const
  meta = {
    name: 'Build Edges Stage',
    version: '1.0.0',
    description: 'Creates edges between nodes based on entity relationships and proximity',
  }

  execute(input: CompilerStageInput, _next: (input: CompilerStageInput) => CompilerStageOutput): CompilerStageOutput {
    const nodes = input.nodes
    const parsed = input.context?.parsed as ParsedDocument | undefined

    if (!nodes || !parsed) {
      return { errors: [{ code: 'MISSING_INPUT', message: 'BuildEdgesStage requires nodes and parsed document' }] }
    }

    const edges = buildEdges(nodes, parsed)
    return { edges }
  }
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}--${b}` : `${b}--${a}`
}

export function buildEdges(nodes: NavNode[], parsed: ParsedDocument): NavEdge[] {
  const edges: NavEdge[] = []
  const seen = new Set<string>()
  let idx = 0

  // Group nodes by building+floor
  const byFloor = new Map<string, NavNode[]>()
  for (const node of nodes) {
    const key = `${node.buildingId}:${node.floor}`
    if (!byFloor.has(key)) byFloor.set(key, [])
    byFloor.get(key)!.push(node)
  }

  // Within each floor: connect rooms to nearest hallway/entrance
  for (const [, floorNodes] of byFloor) {
    const spaceNodes = floorNodes.filter(n => n.type === 'space')
    const corridorNodes = floorNodes.filter(n => n.type === 'corridor')
    const transitionNodes = floorNodes.filter(n => n.type === 'transition')

    for (const sn of spaceNodes) {
      // Nearest corridor (hallway)
      let bestCorridorDist = Infinity
      let bestCorridor: NavNode | null = null
      for (const cn of corridorNodes) {
        const d = haversine(sn.position, cn.position)
        if (d < bestCorridorDist) { bestCorridorDist = d; bestCorridor = cn }
      }
      if (bestCorridor && bestCorridorDist < 200) {
        const key = edgeKey(sn.id, bestCorridor.id)
        if (!seen.has(key)) {
          seen.add(key)
          edges.push({
            id: `edge-${idx++}`,
            from: sn.id,
            to: bestCorridor.id,
            type: 'walk',
            distance: bestCorridorDist,
            weight: bestCorridorDist,
          })
        }
      }

      // Nearest transition (entrance)
      let bestTransDist = Infinity
      let bestTrans: NavNode | null = null
      for (const tn of transitionNodes) {
        const d = haversine(sn.position, tn.position)
        if (d < bestTransDist) { bestTransDist = d; bestTrans = tn }
      }
      if (bestTrans && bestTrans.id !== bestCorridor?.id && bestTransDist < 200) {
        const key = edgeKey(sn.id, bestTrans.id)
        if (!seen.has(key)) {
          seen.add(key)
          edges.push({
            id: `edge-${idx++}`,
            from: sn.id,
            to: bestTrans.id,
            type: 'walk',
            distance: bestTransDist,
            weight: bestTransDist,
          })
        }
      }

      // Connect nearby rooms on same floor (within 50m)
      for (const sn2 of spaceNodes) {
        if (sn2.id >= sn.id) continue
        const d = haversine(sn.position, sn2.position)
        if (d > 0 && d < 50) {
          const key = edgeKey(sn.id, sn2.id)
          if (!seen.has(key)) {
            seen.add(key)
            edges.push({
              id: `edge-${idx++}`,
              from: sn.id,
              to: sn2.id,
              type: 'walk',
              distance: d,
              weight: d,
            })
          }
        }
      }
    }

    // Connect transitions to nearest corridor
    for (const tn of transitionNodes) {
      let bestDist = Infinity
      let bestNode: NavNode | null = null
      for (const cn of corridorNodes) {
        const d = haversine(tn.position, cn.position)
        if (d < bestDist) { bestDist = d; bestNode = cn }
      }
      if (bestNode && bestDist < 200) {
        const key = edgeKey(tn.id, bestNode.id)
        if (!seen.has(key)) {
          seen.add(key)
          edges.push({
            id: `edge-${idx++}`,
            from: tn.id,
            to: bestNode.id,
            type: 'walk',
            distance: bestDist,
            weight: bestDist,
          })
        }
      }
    }

    // Connect corridor end-to-end (hallway segments)
    // Group corridor nodes by entityId
    const byEntity = new Map<string, NavNode[]>()
    for (const cn of corridorNodes) {
      const eid = String(cn.properties.entityId || '')
      if (!byEntity.has(eid)) byEntity.set(eid, [])
      byEntity.get(eid)!.push(cn)
    }
    for (const [, group] of byEntity) {
      for (let i = 0; i < group.length - 1; i++) {
        const d = haversine(group[i].position, group[i + 1].position)
        const key = edgeKey(group[i].id, group[i + 1].id)
        if (!seen.has(key)) {
          seen.add(key)
          edges.push({
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
  }

  return edges
}
