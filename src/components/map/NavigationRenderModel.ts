import type { NavNode, NavEdge, Building, LatLng } from '@/types/nav-types'
import type { NavigationGraph } from '@navi/core'
import type { NavNode as CompilerNavNode, NavEdge as CompilerNavEdge } from '@navi/core'
import { deriveBuildingFootprint } from '@/lib/campus-geometry'

// ── Types ─────────────────────────────────────────────────────

export interface BuildingRenderData {
  id: string
  name: string
  footprint: LatLng[]
  color: string
  height: number
  floors: number
  entrances: { id: string; label: string; position: LatLng; floor: number }[]
  nodeIds: string[]
}

export interface EntranceRenderData {
  id: string
  label: string
  position: LatLng
  floor: number
  buildingId: string
}

export interface NavigationRenderModel {
  buildings: BuildingRenderData[]
  entrances: EntranceRenderData[]
  boundary: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null
  nodes: NavNode[]
  edges: NavEdge[]
}

// ── Building color palette ─────────────────────────────────────

const BUILDING_COLORS = [
  '#3B82F6', // blue
  '#059669', // green
  '#8B5CF6', // purple
  '#F59E0B', // amber
  '#EF4444', // red
  '#06B6D4', // cyan
  '#EC4899', // pink
  '#14B8A6', // teal
  '#F97316', // orange
  '#6366F1', // indigo
]

// ── Type Mappers ───────────────────────────────────────────────

function mapCompilerNodeType(type: CompilerNavNode['type']): NavNode['type'] {
  switch (type) {
    case 'space': return 'room'
    case 'corridor': return 'hallway'
    case 'transition': return 'connector_stop'
    case 'intersection': return 'intersection'
    case 'poi': return 'room'
    case 'waypoint': return 'walkway'
    case 'outdoor': return 'outdoor'
    case 'entrance': return 'building_entrance'
    default: return 'walkway'
  }
}

function mapCompilerEdgeType(type: CompilerNavEdge['type']): NavEdge['type'] {
  switch (type) {
    case 'walk': return 'walkway'
    case 'stairs': return 'stair'
    case 'elevator': return 'elevator'
    case 'transition': return 'transition'
    default: return 'walkway'
  }
}

function compilerToAStar(node: CompilerNavNode, campusId: string): NavNode {
  return {
    id: node.id,
    label: node.label || node.id,
    name: node.label || undefined,
    position: node.position,
    floor: node.floor,
    buildingId: node.buildingId || '',
    campusId,
    type: mapCompilerNodeType(node.type),
    hasQr: (node.properties?.hasQr as boolean) ?? false,
    hasPanorama: (node.properties?.hasPanorama as boolean) ?? false,
  }
}

// ── Adapter ────────────────────────────────────────────────────

/**
 * Convert NavigationGraph nodes/edges into BuildingRenderData.
 * Groups nodes by buildingId, derives footprints from node positions.
 */
export function buildFromNavigationGraph(
  graph: NavigationGraph,
  existingBuildings?: Building[],
): NavigationRenderModel {
  const compilerNodes = graph.nodes
  const campusId = graph.campusId || 'campus'

  // Convert all compiler nodes to A* format first
  const aStarNodes = compilerNodes.map(n => compilerToAStar(n, campusId))

  // Group A* nodes by buildingId
  const buildingNodeMap = new Map<string, NavNode[]>()
  for (const node of aStarNodes) {
    const bid = node.buildingId || '_outdoor'
    if (!buildingNodeMap.has(bid)) buildingNodeMap.set(bid, [])
    buildingNodeMap.get(bid)!.push(node)
  }

  const buildings: BuildingRenderData[] = []
  let colorIdx = 0

  for (const [buildingId, nodes] of buildingNodeMap) {
    if (buildingId === '_outdoor') continue

    // Create a synthetic Building object for deriveBuildingFootprint
    const existing = existingBuildings?.find(b => b.id === buildingId)
    const floorSet = new Set(nodes.map(n => n.floor))
    const floorList = [...floorSet].sort((a, b) => a - b)
    const syntheticBuilding: Building = {
      id: buildingId,
      name: existing?.name || buildingId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      campusId,
      floors: existing?.floors ?? floorList,
      footprint: existing?.footprint ?? [],
      baseElevation: existing?.baseElevation ?? 0,
      height: existing?.height ?? Math.max(3, floorList.length * 3),
      color: existing?.color || BUILDING_COLORS[colorIdx % BUILDING_COLORS.length],
      code: existing?.code || buildingId.slice(0, 4).toUpperCase(),
      category: existing?.category || 'academic',
      outline: existing?.outline,
      entrances: existing?.entrances ?? nodes
        .filter(n => n.type === 'building_entrance')
        .map(n => ({
          id: n.id,
          label: n.label || n.id,
          position: n.position,
          floor: n.floor,
        })),
    }

    // Derive footprint using the shared utility
    const footprint = deriveBuildingFootprint(syntheticBuilding, aStarNodes)

    if (!footprint || footprint.length < 3) continue

    // Determine floors
    const minFloor = Math.min(...floorSet)
    const maxFloor = Math.max(...floorSet)
    const floorCount = maxFloor - minFloor + 1

    // Collect entrances
    const entrances = syntheticBuilding.entrances.map(e => ({
      id: e.id,
      label: e.label || e.id,
      position: e.position,
      floor: e.floor,
    }))

    buildings.push({
      id: buildingId,
      name: syntheticBuilding.name,
      footprint,
      color: syntheticBuilding.color ?? BUILDING_COLORS[colorIdx % BUILDING_COLORS.length],
      height: syntheticBuilding.height ?? Math.max(3, floorCount * 3),
      floors: floorCount,
      entrances,
      nodeIds: nodes.map(n => n.id),
    })

    colorIdx++
  }

  // Compute boundary from metadata
  const bb = graph.metadata?.boundingBox
  const boundary = bb ? {
    minLat: bb.minLat,
    maxLat: bb.maxLat,
    minLng: bb.minLng,
    maxLng: bb.maxLng,
  } : null

  // Convert compiler edges to A* format
  const convertedEdges: NavEdge[] = graph.edges.map(e => ({
    id: e.id,
    from: e.from,
    to: e.to,
    distance: e.distance,
    weight: e.weight,
    type: mapCompilerEdgeType(e.type),
    campusId,
  }))

  // Collect all entrances
  const allEntrances: EntranceRenderData[] = buildings.flatMap(b =>
    b.entrances.map(e => ({
      ...e,
      buildingId: b.id,
    }))
  )

  return {
    buildings,
    entrances: allEntrances,
    boundary,
    nodes: aStarNodes,
    edges: convertedEdges,
  }
}
