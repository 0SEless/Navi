import type {
  CompilerStagePlugin,
  CompilerStageInput,
  CompilerStageOutput,
  NavNode,
  NavEdge,
  ParsedDocument,
  CompileStats,
  CompileWarning,
  CompileError,
} from '../../types'

/**
 * Stage 6: Validate — Checks connectivity, reports orphaned nodes,
 * computes compile stats.
 */
export class ValidateStage implements CompilerStagePlugin {
  id = 'compiler-validate-stage'
  targetStage = 'validate' as const
  mode = 'replace' as const
  meta = {
    name: 'Validate Stage',
    version: '1.0.0',
    description: 'Validates graph connectivity and computes compile statistics',
  }

  execute(input: CompilerStageInput, _next: (input: CompilerStageInput) => CompilerStageOutput): CompilerStageOutput {
    const nodes = input.nodes
    const edges = input.edges
    const parsed = input.context?.parsed as ParsedDocument | undefined

    if (!nodes || !edges) {
      return { errors: [{ code: 'MISSING_INPUT', message: 'ValidateStage requires nodes and edges' }] }
    }

    const result = validateGraph(nodes, edges, parsed)
    return {
      warnings: result.warnings,
      context: { stats: result.stats, ...input.context },
    }
  }
}

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinDLng * sinDLng
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export function validateGraph(
  nodes: NavNode[],
  edges: NavEdge[],
  parsed?: ParsedDocument,
): {
  warnings: CompileWarning[]
  errors: CompileError[]
  stats: CompileStats
} {
  const warnings: CompileWarning[] = []
  const errors: CompileError[] = []
  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Build adjacency
  const adjacency = new Map<string, string[]>()
  for (const node of nodes) {
    adjacency.set(node.id, [])
  }
  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to)
    adjacency.get(edge.to)?.push(edge.from)
  }

  // Check for orphaned rooms
  for (const node of nodes) {
    if (node.type === 'space') {
      const neighbors = adjacency.get(node.id) || []
      if (neighbors.length === 0) {
        warnings.push({
          code: 'ORPHANED_ROOM',
          message: `"${node.label}" has no connections`,
          entityId: node.id,
        })
      }
    }
  }

  // Check for orphaned entrances
  for (const node of nodes) {
    if (node.properties.entityType === 'entrance') {
      const neighbors = adjacency.get(node.id) || []
      if (neighbors.length === 0) {
        warnings.push({
          code: 'ORPHANED_ENTRANCE',
          message: `Entrance "${node.label}" has no connections`,
          entityId: node.id,
        })
      }
    }
  }

  // Find disconnected components (BFS from first node)
  const visited = new Set<string>()
  const componentSizes: number[] = []

  for (const node of nodes) {
    if (visited.has(node.id)) continue

    // BFS
    const queue = [node.id]
    visited.add(node.id)
    let size = 0
    while (queue.length > 0) {
      const current = queue.shift()!
      size++
      for (const neighbor of adjacency.get(current) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push(neighbor)
        }
      }
    }
    componentSizes.push(size)
  }

  // If multiple components, report warnings for all but the largest
  if (componentSizes.length > 1) {
    const sorted = [...componentSizes].sort((a, b) => b - a)
    const largest = sorted[0]
    for (let i = 1; i < sorted.length; i++) {
      warnings.push({
        code: 'DISCONNECTED_COMPONENT',
        message: `Found disconnected component with ${sorted[i]} node(s) — may not be reachable`,
        entityId: '',
      })
    }
  }

  // Connectivity score: percentage of nodes in the largest component
  const largestComponent = Math.max(...componentSizes, 0)
  const connectivityScore = nodes.length > 0 ? largestComponent / nodes.length : 1

  // Compute total route length
  let totalRouteLength = 0
  for (const edge of edges) {
    totalRouteLength += edge.distance
  }

  // Count buildings and floors
  const buildingSet = new Set(nodes.map(n => n.buildingId).filter(Boolean))
  const floorSet = new Set(nodes.map(n => `${n.buildingId}:${n.floor}`))
  const roomCount = nodes.filter(n => n.type === 'space').length
  const hallwayCount = nodes.filter(n => n.type === 'corridor').length

  const stats: CompileStats = {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    buildingsProcessed: buildingSet.size,
    floorsProcessed: floorSet.size,
    roomsProcessed: roomCount,
    hallwaysProcessed: hallwayCount,
    totalRouteLength: Math.round(totalRouteLength),
    connectivityScore: Math.round(connectivityScore * 100) / 100,
  }

  return { warnings, errors, stats }
}
