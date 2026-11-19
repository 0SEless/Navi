import { collectFloorDoors, isRouteEdgeType, isRouteNodeType, ROUTE_NETWORK_THRESHOLDS, stairRouteLine, stairTopEnd, structureSampler, toLocal } from '@navi/core'
import type { Building, CampusDocument, Floor, LatLng, Road, RouteEdge, RouteNode, Staircase } from '@navi/core'
import type { ValidationIssue } from '../../snapshot'
import type { ValidationContext, ValidationProfileId, ValidationRule } from '../types'

type RouteProfile = ValidationProfileId | 'publish'
type RouteLayer = 'navigation' | 'access'

interface RouteIssueScope {
  buildingId: string
  floorId: string
  layer: RouteLayer
}

interface RouteFloorGraph {
  nodes: RouteNode[]
  edges: RouteEdge[]
  nodeById: Map<string, RouteNode>
  adjacency: Map<string, Set<string>>
  componentByNode: Map<string, string>
  components: string[][]
}

function hash(value: string): string {
  let result = 0
  for (let index = 0; index < value.length; index++) {
    result = ((result << 5) - result) + value.charCodeAt(index)
    result |= 0
  }
  return Math.abs(result).toString(36)
}

function severityFor(profile: RouteProfile): 'error' | 'warning' {
  return profile === 'publish' || profile === 'strict' ? 'error' : 'warning'
}

function issue(
  ruleId: string,
  profile: RouteProfile,
  message: string,
  targets: Array<{ entityId: string; entityType: string }>,
  scope?: RouteIssueScope,
): ValidationIssue {
  const targetKey = targets.map((target) => `${target.entityType}:${target.entityId}`).join('|')
  return {
    issueId: `${ruleId}:${hash(`${message}|${targetKey}`)}`,
    ruleId,
    severity: severityFor(profile),
    message,
    targets,
    ...scope,
  }
}

function routeNetworkOf(floor: Floor): { nodes: unknown; edges: unknown } | null {
  const network = floor.routeNetwork as unknown
  if (network === undefined) return null
  if (!network || typeof network !== 'object') return { nodes: undefined, edges: undefined }
  return network as { nodes: unknown; edges: unknown }
}

function buildRouteFloorGraph(floor: Floor): RouteFloorGraph {
  const network = routeNetworkOf(floor)
  const nodes = Array.isArray(network?.nodes) ? network.nodes as RouteNode[] : []
  const edges = Array.isArray(network?.edges) ? network.edges as RouteEdge[] : []
  const nodeById = new Map<string, RouteNode>()
  for (const node of nodes) {
    if (typeof node?.id === 'string' && !nodeById.has(node.id)) nodeById.set(node.id, node)
  }

  const adjacency = new Map<string, Set<string>>()
  for (const node of nodeById.values()) adjacency.set(node.id, new Set())
  for (const edge of edges) {
    if (!nodeById.has(edge?.from) || !nodeById.has(edge?.to) || edge.from === edge.to) continue
    adjacency.get(edge.from)!.add(edge.to)
    adjacency.get(edge.to)!.add(edge.from)
  }

  const componentByNode = new Map<string, string>()
  const components: string[][] = []
  for (const node of nodeById.values()) {
    if (componentByNode.has(node.id)) continue
    const component: string[] = []
    const queue = [node.id]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (componentByNode.has(current)) continue
      componentByNode.set(current, node.id)
      component.push(current)
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!componentByNode.has(neighbor)) queue.push(neighbor)
      }
    }
    components.push(component.sort())
  }

  components.sort((left, right) => right.length - left.length || left[0].localeCompare(right[0]))
  return { nodes, edges, nodeById, adjacency, componentByNode, components }
}

function hasRoutePath(graph: RouteFloorGraph, nodeId: string, rootComponents: ReadonlySet<string>): boolean {
  const componentId = graph.componentByNode.get(nodeId)
  if (!componentId) return false
  const neighbors = graph.adjacency.get(nodeId)
  return (neighbors?.size ?? 0) > 0 && rootComponents.has(componentId)
}

function rootComponents(floor: Floor, graph: RouteFloorGraph): Set<string> {
  const entranceRoots = new Set<string>()
  for (const access of floor.entranceAccess ?? []) {
    const componentId = graph.componentByNode.get(access.indoorRouteNodeId)
    if (componentId) entranceRoots.add(componentId)
  }
  if (entranceRoots.size > 0) return entranceRoots
  // The main (largest) route group, named the way componentByNode names it (its first-visited point). The group's
  // node list is sorted, so its first entry is not that name (2026-11-16: upper floors failed this check).
  const main = graph.components[0]?.[0]
  const mainId = main !== undefined ? graph.componentByNode.get(main) : undefined
  return mainId ? new Set([mainId]) : new Set()
}

function structureIssues(
  buildingId: string,
  floor: Floor,
  profile: RouteProfile,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const network = routeNetworkOf(floor)
  if (!network) return issues
  const scope: RouteIssueScope = { buildingId, floorId: floor.id, layer: 'navigation' }
  const addIssue = (ruleId: string, message: string, targets: Array<{ entityId: string; entityType: string }>) => {
    issues.push(issue(ruleId, profile, message, targets, scope))
  }

  if (!Array.isArray(network.nodes)) {
    addIssue('route-network-structure', `Floor "${floor.label || floor.id}" route network nodes must be an array`, [{ entityId: floor.id, entityType: 'floor' }])
  }
  if (!Array.isArray(network.edges)) {
    addIssue('route-network-structure', `Floor "${floor.label || floor.id}" route network edges must be an array`, [{ entityId: floor.id, entityType: 'floor' }])
  }

  const graph = buildRouteFloorGraph(floor)
  const nodeIds = new Set<string>()
  for (const [index, node] of graph.nodes.entries()) {
    const nodeId = typeof node?.id === 'string' && node.id.length > 0 ? node.id : `${floor.id}:node:${index}`
    const target = { entityId: nodeId, entityType: 'route-node' }
    if (nodeIds.has(nodeId)) {
      addIssue('route-network-structure', `Route node "${nodeId}" is duplicated on floor "${floor.label || floor.id}"`, [target])
    }
    nodeIds.add(nodeId)
    if (typeof node?.id !== 'string' || node.id.length === 0) {
      addIssue('route-network-structure', `Route node at index ${index} has no valid id`, [target])
    }
    if (!isRouteNodeType(node?.type)) {
      addIssue('route-network-structure', `Route node "${nodeId}" has an invalid type`, [target])
    }
    if (!Number.isFinite(node?.position?.x) || !Number.isFinite(node?.position?.y)) {
      addIssue('route-network-structure', `Route node "${nodeId}" has an invalid local position`, [target])
    }
  }

  const edgeIds = new Set<string>()
  for (const [index, edge] of graph.edges.entries()) {
    const edgeId = typeof edge?.id === 'string' && edge.id.length > 0 ? edge.id : `${floor.id}:edge:${index}`
    const edgeTarget = { entityId: edgeId, entityType: 'route-edge' }
    if (edgeIds.has(edgeId)) {
      addIssue('route-network-structure', `Route edge "${edgeId}" is duplicated on floor "${floor.label || floor.id}"`, [edgeTarget])
    }
    edgeIds.add(edgeId)
    if (typeof edge?.id !== 'string' || edge.id.length === 0) {
      addIssue('route-network-structure', `Route edge at index ${index} has no valid id`, [edgeTarget])
    }
    if (!isRouteEdgeType(edge?.type)) {
      addIssue('route-network-structure', `Route edge "${edgeId}" has an invalid type`, [edgeTarget])
    }
    if (!Number.isFinite(edge?.distance) || edge.distance < 0) {
      addIssue('route-network-structure', `Route edge "${edgeId}" has an invalid distance`, [edgeTarget])
    }
    for (const endpoint of [edge?.from, edge?.to]) {
      if (typeof endpoint !== 'string' || endpoint.length === 0) {
        addIssue('route-network-structure', `Route edge "${edgeId}" has a missing endpoint`, [edgeTarget])
      } else if (!graph.nodeById.has(endpoint)) {
        addIssue('route-network-structure', `Route edge "${edgeId}" references missing route node "${endpoint}"`, [edgeTarget, { entityId: endpoint, entityType: 'route-node' }])
      }
    }
    if (edge?.from === edge?.to && typeof edge?.from === 'string') {
      addIssue('route-network-structure', `Route edge "${edgeId}" cannot connect a node to itself`, [edgeTarget, { entityId: edge.from, entityType: 'route-node' }])
    }
  }

  return issues
}

/**
 * Route points that give a route group its own way in (owner 2026-11-19 stair check): an entrance linked to the
 * outdoor walk, or a stair/lift link on this floor whose stair/lift also reaches another floor. Publish's
 * building-wide "reachable from an entrance" check still catches a group that is truly cut off.
 */
function ownWayIn(building: { staircases?: Array<{ levels?: Record<number, { routeConnection?: { anchorNodeId?: string; targetRouteNodeId?: string } }> }>; elevators?: Array<{ levels?: Record<number, { routeConnection?: { anchorNodeId?: string; targetRouteNodeId?: string } }> }> }, floor: Floor): Set<string> {
  const ids = new Set<string>()
  for (const access of floor.entranceAccess ?? []) if (access.outdoorRouteId && access.indoorRouteNodeId) ids.add(access.indoorRouteNodeId)
  for (const feature of [...(building.staircases ?? []), ...(building.elevators ?? [])]) {
    const levels = Object.entries(feature.levels ?? {})
    const here = feature.levels?.[floor.level]?.routeConnection
    if (!here || !levels.some(([level, geometry]) => Number(level) !== floor.level && geometry?.routeConnection)) continue
    for (const id of [here.anchorNodeId, here.targetRouteNodeId]) if (id) ids.add(id)
  }
  return ids
}

function disconnectedIssues(
  buildingId: string,
  floor: Floor,
  graph: RouteFloorGraph,
  profile: RouteProfile,
  wayIn: ReadonlySet<string> = new Set(),
): ValidationIssue[] {
  if (graph.nodes.length === 0) return []
  const issues: ValidationIssue[] = []
  const scope: RouteIssueScope = { buildingId, floorId: floor.id, layer: 'navigation' }
  const disconnected = (graph.components.length > 1
    ? graph.components.slice(1)
    : graph.components.filter((component) => component.every((nodeId) => (graph.adjacency.get(nodeId)?.size ?? 0) === 0)))
    // A joined-up group (two or more points) with its own way in is reachable; a lone point stays an error.
    .filter((component) => !(component.length > 1 && component.some((nodeId) => wayIn.has(nodeId))))

  for (const component of disconnected) {
    const first = component[0]
    const message = component.length === 1
      ? `Route node "${first}" has no edge to the indoor route on floor "${floor.label || floor.id}"`
      : `Route component on floor "${floor.label || floor.id}" needs a connection to the main indoor route (${component.join(', ')})`
    issues.push(issue('route-network-disconnected', profile, message, component.map((nodeId) => ({ entityId: nodeId, entityType: 'route-node' })), scope))
  }
  return issues
}

function floorConsistencyIssues(
  buildingId: string,
  floor: Floor,
  graph: RouteFloorGraph,
  profile: RouteProfile,
): ValidationIssue[] {
  return graph.nodes
    .filter((node) => node.floor !== floor.level)
    .map((node) => issue(
      'route-floor-consistency',
      profile,
      `Route node "${node.id}" declares floor ${node.floor}, but it belongs to floor ${floor.level}`,
      [{ entityId: node.id, entityType: 'route-node' }, { entityId: floor.id, entityType: 'floor' }],
      { buildingId, floorId: floor.id, layer: 'navigation' },
    ))
}

function roomAccessIssues(
  buildingId: string,
  floor: Floor,
  graph: RouteFloorGraph,
  profile: RouteProfile,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const scope: RouteIssueScope = { buildingId, floorId: floor.id, layer: 'access' }
  const roots = rootComponents(floor, graph)
  for (const attributes of floor.roomAttributes ?? []) {
    const roomId = attributes.roomId ?? attributes.faceId
    const roomName = attributes.name || attributes.code || roomId
    for (const access of attributes.accessPoints ?? []) {
      const roomTarget = { entityId: roomId, entityType: 'room' }
      if (!access || typeof access.routeNodeId !== 'string' || access.routeNodeId.length === 0) {
        issues.push(issue('route-room-access', profile, `Room "${roomName}" has an access point without a route node`, [roomTarget], scope))
        continue
      }
      const routeTarget = { entityId: access.routeNodeId, entityType: 'route-node' }
      if (!graph.nodeById.has(access.routeNodeId)) {
        issues.push(issue('route-room-access', profile, `Room "${roomName}" access point references missing route node "${access.routeNodeId}"`, [roomTarget, routeTarget], scope))
        continue
      }
      if (!hasRoutePath(graph, access.routeNodeId, roots)) {
        issues.push(issue('route-room-access', profile, `Room "${roomName}" access point is not connected to the hallway route`, [roomTarget, routeTarget], scope))
      }
    }
  }
  return issues
}

function entranceAccessIssues(
  buildingId: string,
  floor: Floor,
  graph: RouteFloorGraph,
  profile: RouteProfile,
  roadIds: ReadonlySet<string>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const scope: RouteIssueScope = { buildingId, floorId: floor.id, layer: 'access' }
  const roots = rootComponents(floor, graph)
  const entranceIds = new Set(floor.entrances.map((entrance) => entrance.id))
  const assignedEntranceIds = new Set(
    (floor.entranceAccess ?? [])
      .map((access) => access.entranceId)
      .filter((entranceId): entranceId is string => typeof entranceId === 'string' && entranceId.trim().length > 0),
  )

  for (const entrance of floor.entrances) {
    const legacyConnectorRoadId = entrance.metadata?.connectorRoadId
    const hasLegacyExplicitConnector = typeof legacyConnectorRoadId === 'string' && legacyConnectorRoadId.trim().length > 0
    if (entrance.indoorOnly === true) {
      const target = [{ entityId: entrance.id, entityType: 'entrance' }]
      if (assignedEntranceIds.has(entrance.id) || entrance.connectorRoadId || hasLegacyExplicitConnector) {
        issues.push(issue('route-entrance-access', profile, `Remove the outdoor route assignment from indoor-only entrance "${entrance.id}".`, target, scope))
      }
      const nodeId = entrance.routeConnection?.anchorNodeId ?? entrance.routeNodeId
      if (!nodeId || !hasRoutePath(graph, nodeId, roots)) {
        issues.push(issue('route-entrance-access', profile, `Connect indoor-only entrance "${entrance.id}" to the route on floor "${floor.label || floor.id}".`, target, scope))
      }
      continue
    }
    if (!assignedEntranceIds.has(entrance.id) && !hasLegacyExplicitConnector) {
      issues.push(issue(
        'route-entrance-access',
        profile,
        `Entrance "${entrance.id}" has no explicit outdoor route assignment`,
        [{ entityId: entrance.id, entityType: 'entrance' }],
        scope,
      ))
    }
  }

  for (const access of floor.entranceAccess ?? []) {
    const entranceTarget = { entityId: access.entranceId, entityType: 'entrance' }
    if (!entranceIds.has(access.entranceId)) {
      issues.push(issue('route-entrance-access', profile, `Entrance access references missing entrance "${access.entranceId}"`, [entranceTarget], scope))
    }
    if (typeof access.outdoorNodeId !== 'string' || access.outdoorNodeId.trim().length === 0) {
      issues.push(issue('route-entrance-access', profile, `Entrance "${access.entranceId}" has no outdoor navigation node`, [entranceTarget], scope))
    }

    const hasOutdoorRouteId = access.outdoorRouteId !== undefined
    const hasOutdoorPosition = access.outdoorPosition !== undefined
    if (hasOutdoorRouteId !== hasOutdoorPosition) {
      issues.push(issue(
        'route-entrance-access',
        profile,
        `Entrance "${access.entranceId}" outdoor route assignment must include both a route ID and an exact position`,
        [entranceTarget],
        scope,
      ))
    } else if (hasOutdoorRouteId && hasOutdoorPosition) {
      if (typeof access.outdoorRouteId !== 'string' || access.outdoorRouteId.trim().length === 0) {
        issues.push(issue('route-entrance-access', profile, `Entrance "${access.entranceId}" has no valid outdoor route ID`, [entranceTarget], scope))
      } else if (!roadIds.has(access.outdoorRouteId)) {
        issues.push(issue('route-entrance-access', profile, `Entrance "${access.entranceId}" references missing outdoor route "${access.outdoorRouteId}"`, [entranceTarget, { entityId: access.outdoorRouteId, entityType: 'road' }], scope))
      }
      if (!Number.isFinite(access.outdoorPosition?.lat) || !Number.isFinite(access.outdoorPosition?.lng)) {
        issues.push(issue('route-entrance-access', profile, `Entrance "${access.entranceId}" has an invalid outdoor route position`, [entranceTarget], scope))
      }
    }

    if (typeof access.indoorRouteNodeId !== 'string' || access.indoorRouteNodeId.trim().length === 0) {
      issues.push(issue('route-entrance-access', profile, `Entrance "${access.entranceId}" has no indoor route point. Connect it to an indoor route on this floor.`, [entranceTarget], scope))
      continue
    }
    const indoorTarget = { entityId: access.indoorRouteNodeId, entityType: 'route-node' }
    if (!graph.nodeById.has(access.indoorRouteNodeId)) {
      issues.push(issue('route-entrance-access', profile, `Entrance "${access.entranceId}" references missing indoor route node "${access.indoorRouteNodeId}"`, [entranceTarget, indoorTarget], scope))
      continue
    }
    if (!hasRoutePath(graph, access.indoorRouteNodeId, roots)) {
      const label = floor.label || floor.id
      const hasValidOutdoorRoute = typeof access.outdoorRouteId === 'string' && roadIds.has(access.outdoorRouteId) &&
        Number.isFinite(access.outdoorPosition?.lat) && Number.isFinite(access.outdoorPosition?.lng)
      const outside = hasValidOutdoorRoute ? ' is linked to an outdoor route.' : ' needs an indoor connection.'
      const message = `Entrance "${access.entranceId}"${outside} Connect its indoor route point to the route on floor "${label}".`
      issues.push(issue('route-entrance-access', profile, message, [entranceTarget, indoorTarget], scope))
    }
  }
  return issues
}

/**
 * Stair route links (2026-11-07): a road made over an outdoor stair (routing.structureId) must still match its stair —
 * the stair exists, the route still reaches its entrance on the floor the stair arrives at, the joined route exists,
 * and the path's ends are where the stair's ends are. Errors in Publish, so a broken stair route never reaches visitors.
 */
function stairRouteIssues(document: CampusDocument, profile: RouteProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const grid = structureSampler(document)?.grid
  const roadIds = new Set((document.roads ?? []).map((road) => road.id))
  for (const road of document.roads ?? []) {
    const structureId = road.routing?.structureId
    if (!structureId) continue
    const report = (reason: string) => issues.push(issue('route-stair', profile, `Stair route out of step: ${reason}`, [{ entityId: structureId, entityType: 'structure' }, { entityId: road.id, entityType: 'road' }]))
    const structure = (document.structures ?? []).find((s) => s.id === structureId)
    if (!structure) {
      report('the stair was deleted')
      continue
    }
    const links = document.buildings.flatMap((building) => building.floors.flatMap((floor) => (floor.entranceAccess ?? [])
      .filter((access) => access.outdoorRouteId === road.id)
      .map((access) => ({ building, floor, access }))))
    const top = stairTopEnd(document, structure)
    if (top?.kind === 'slab') {
      if (links.length === 0 || links.some(({ floor, access }) => !(floor.entrances ?? []).some((e) => e.id === access.entranceId))) {
        report('the entrance was deleted')
        continue
      }
      if (links.some(({ building, floor }) => building.id !== top.buildingId || floor.id !== top.floorId)) {
        report('the top end is on another floor')
        continue
      }
    }
    const joined = (document.roadJunctions ?? []).some((j) => j.roadIds.includes(road.id) && j.roadIds.some((id) => id !== road.id && roadIds.has(id)))
    if (!joined) {
      report('the joined route was deleted')
      continue
    }
    const line = stairRouteLine(document, structure)
    const points = road.polyline?.points ?? []
    if (!line || !grid || points.length < 2) {
      report('the stair moved away from its route')
      continue
    }
    const far = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const p = toLocal(grid, a)
      const q = toLocal(grid, b)
      return Math.hypot(p.x - q.x, p.y - q.y) > ROUTE_NETWORK_THRESHOLDS.snapRadiusMeters + road.width / 2
    }
    if (far(points[points.length - 1], line[line.length - 1]) || far(points[0], line[0])) report('the stair moved away from its route')
  }
  return issues
}

/**
 * Rooms visitors can't be routed to (2026-11-08): the compiler joins a room to the route network through its doors
 * (in-room or floor-level, assigned) or its room links (access points). A room with neither compiles and is listed in
 * NAVI Web's search, but no route reaches it. A warning, never a block.
 */
function unreachableRoomIssues(document: CampusDocument, profile: RouteProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const building of document.buildings ?? []) {
    for (const floor of building.floors ?? []) {
      const linked = new Set<string>()
      for (const attributes of floor.roomAttributes ?? []) {
        if ((attributes.accessPoints ?? []).length > 0) {
          linked.add(attributes.faceId)
          if (attributes.roomId) linked.add(attributes.roomId)
        }
      }
      for (const door of floor.doors ?? []) {
        if (door.roomId && (!door.ownership || door.ownership.status === 'assigned')) linked.add(door.roomId)
      }
      for (const room of floor.rooms ?? []) {
        const inRoomDoors = (room as { roomDoors?: unknown[] }).roomDoors ?? []
        if (linked.has(room.id) || inRoomDoors.length > 0) continue
        const found = issue(
          'route-room-unreachable', profile,
          `Room "${room.name || room.id}" can't be reached: add a door or link it to the floor's route`,
          [{ entityId: room.id, entityType: 'room' }],
          { buildingId: building.id, floorId: floor.id, layer: 'access' },
        )
        issues.push({ ...found, severity: 'warning' })
      }
    }
  }
  return issues
}

// ── Reach checks (owner 2026-11-19 ASU-IBAJAY check) ──
// Studio said "0 problems" while Publish refused the campus (COMDEV Floor 3 cut off), and VOAG, single rooms and several
// stairs could not be reached. These say so while editing. Warnings only: Publish's own compile check still decides.

const warning = (...args: Parameters<typeof issue>): ValidationIssue => ({ ...issue(...args), severity: 'warning' })
const floorName = (floor: Floor) => floor.label || floor.id
type FloorGraphs = ReadonlyMap<number, { floor: Floor; graph: RouteFloorGraph }>

/** Metres from a point to a road's centre line (flat earth around the point; roads are short). */
function distanceToRoad(point: LatLng, road: Road): number {
  const points = road.polyline?.points ?? []
  const kx = 111320 * Math.cos(point.lat * Math.PI / 180)
  const local = (p: LatLng) => ({ x: (p.lng - point.lng) * kx, y: (p.lat - point.lat) * 111320 })
  if (points.length === 1) return Math.hypot(local(points[0]).x, local(points[0]).y)
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < points.length - 1; i++) {
    const a = local(points[i]), b = local(points[i + 1])
    const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy
    const t = length2 > 0 ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / length2)) : 0
    best = Math.min(best, Math.hypot(a.x + t * dx, a.y + t * dy))
  }
  return best
}

/**
 * Entrance links to a spot the road no longer passes (the road was moved or reshaped after linking). Publish joins a
 * link to its road only within ROUTE_NETWORK_THRESHOLDS.dedupeMergeMeters, so beyond that the building is cut off from
 * outside without any other message (ASU VOAG: 0.64 m).
 */
function offRoadLinks(floor: Floor, roads: ReadonlyMap<string, Road>): Array<{ entranceId: string; road: Road; metres: number }> {
  const found: Array<{ entranceId: string; road: Road; metres: number }> = []
  for (const access of floor.entranceAccess ?? []) {
    const road = access.outdoorRouteId ? roads.get(access.outdoorRouteId) : undefined
    const at = access.outdoorPosition
    if (!road || !at || !Number.isFinite(at.lat) || !Number.isFinite(at.lng)) continue
    const metres = distanceToRoad(at, road)
    if (metres > ROUTE_NETWORK_THRESHOLDS.dedupeMergeMeters) found.push({ entranceId: access.entranceId, road, metres })
  }
  return found
}

function entranceOffRoadIssues(buildingId: string, floor: Floor, roads: ReadonlyMap<string, Road>, profile: RouteProfile): ValidationIssue[] {
  return offRoadLinks(floor, roads).map(({ entranceId, road, metres }) => {
    const label = floor.entrances.find((entrance) => entrance.id === entranceId)?.label || entranceId
    return warning('route-entrance-off-road', profile,
      `Entrance "${label}" on ${floorName(floor)} is linked to "${road.name || road.id}" at a spot ${metres.toFixed(1)} m away from it (the road moved after it was linked), so visitors can't get in here. Connect the entrance to the road again.`,
      [{ entityId: entranceId, entityType: 'entrance' }, { entityId: road.id, entityType: 'road' }],
      { buildingId, floorId: floor.id, layer: 'access' })
  })
}

/** Stairs drawn on separate floors and linked floor to floor (links.below/above) form one chain, as Publish joins them. */
function stairChains(stairs: readonly Staircase[]): Map<string, string> {
  const byId = new Map(stairs.map((stair) => [stair.id, stair]))
  const floors = (stair: Staircase) => Object.keys(stair.levels ?? {}).map(Number).filter(Number.isInteger)
  const below = (stair: Staircase) => {
    const partner = stair.links?.below ? byId.get(stair.links.below) : undefined
    if (!partner || partner.links?.above !== stair.id || floors(partner).length === 0 || floors(stair).length === 0) return undefined
    return Math.max(...floors(partner)) + 1 === Math.min(...floors(stair)) ? partner : undefined
  }
  const roots = new Map<string, string>()
  for (const stair of stairs) {
    let root = stair
    const seen = new Set([stair.id])
    for (let next = below(root); next && !seen.has(next.id); next = below(root)) { seen.add(next.id); root = next }
    roots.set(stair.id, root.id)
  }
  return roots
}

/** The route point a stair/lift end is joined to on its floor, if any. */
function joinedPoint(graph: RouteFloorGraph | undefined, link: { anchorNodeId?: string; targetRouteNodeId?: string } | undefined): string | undefined {
  if (!graph || !link) return undefined
  return [link.anchorNodeId, link.targetRouteNodeId].find((id): id is string => !!id && graph.nodeById.has(id))
}

function stairLinkIssues(building: Building, graphs: FloorGraphs, profile: RouteProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if ((building.floors ?? []).length < 2) return issues
  const stairs = building.staircases ?? []
  const chains = stairChains(stairs)
  const chainSize = new Map<string, number>()
  for (const root of chains.values()) chainSize.set(root, (chainSize.get(root) ?? 0) + 1)
  for (const stair of stairs) {
    const levels = Object.keys(stair.levels ?? {}).map(Number).filter(Number.isInteger).sort((a, b) => a - b)
    const name = stair.name || stair.id
    const target = [{ entityId: stair.id, entityType: 'staircase' }]
    if (levels.length === 1 && (chainSize.get(chains.get(stair.id) ?? stair.id) ?? 1) === 1) {
      const floor = building.floors.find((candidate) => candidate.level === levels[0])
      issues.push(warning('route-stair-link', profile,
        `Stair "${name}" stands on ${floor ? floorName(floor) : `level ${levels[0]}`} only, so visitors can't use it to change floors. Set its To floor (or link it to the stair above or below).`,
        target, floor ? { buildingId: building.id, floorId: floor.id, layer: 'navigation' } : undefined))
      continue
    }
    for (const level of levels) {
      const entry = graphs.get(level)
      if (!entry || entry.graph.nodes.length === 0) continue
      if (joinedPoint(entry.graph, stair.levels[level]?.routeConnection)) continue
      const end = stair.levels[level]?.role === 'top' ? 'top' : levels.length > 1 && level === levels[0] ? 'foot' : 'end'
      issues.push(warning('route-stair-link', profile,
        `Stair "${name}" ${end} on ${floorName(entry.floor)} is not joined to this floor's route. Select the stair and press Auto-connect (or draw a route to it).`,
        target, { buildingId: building.id, floorId: entry.floor.id, layer: 'navigation' }))
    }
  }
  return issues
}

/**
 * Floors no visitor can reach: no route point on them is reached from an entrance linked to the outdoor walk, walking
 * the floors' routes and the stairs/lifts joined to the route on both floors (ASU COMDEV Floor 3, VOAG).
 */
function floorReachIssues(building: Building, graphs: FloorGraphs, roads: ReadonlyMap<string, Road>, profile: RouteProfile): ValidationIssue[] {
  const key = (level: number, id: string) => `${level}\u0000${id}`
  const adjacency = new Map<string, string[]>()
  const join = (a: string, b: string) => {
    adjacency.set(a, [...(adjacency.get(a) ?? []), b])
    adjacency.set(b, [...(adjacency.get(b) ?? []), a])
  }
  for (const [level, { graph }] of graphs) {
    for (const [id, neighbours] of graph.adjacency) for (const other of neighbours) join(key(level, id), key(level, other))
  }
  const chains = stairChains(building.staircases ?? [])
  const features: Array<{ chain: string; levels: Staircase['levels'] }> = [
    ...(building.staircases ?? []).map((stair) => ({ chain: `stair:${chains.get(stair.id) ?? stair.id}`, levels: stair.levels })),
    ...(building.elevators ?? []).map((lift) => ({ chain: `lift:${lift.id}`, levels: lift.levels as Staircase['levels'] })),
  ]
  const ends = new Map<string, Array<{ level: number; point: string }>>()
  for (const { chain, levels } of features) {
    for (const [levelKey, geometry] of Object.entries(levels ?? {})) {
      const level = Number(levelKey)
      const point = joinedPoint(graphs.get(level)?.graph, geometry?.routeConnection)
      if (point) ends.set(chain, [...(ends.get(chain) ?? []), { level, point }])
    }
  }
  for (const list of ends.values()) {
    const sorted = [...list].sort((a, b) => a.level - b.level)
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i + 1].level === sorted[i].level + 1) join(key(sorted[i].level, sorted[i].point), key(sorted[i + 1].level, sorted[i + 1].point))
    }
  }
  const queue: string[] = []
  let linkedOutside = false
  for (const [level, { floor, graph }] of graphs) {
    const offRoad = new Set(offRoadLinks(floor, roads).map((link) => link.entranceId))
    for (const access of floor.entranceAccess ?? []) {
      linkedOutside = true
      // Linked to a road (still on it), or straight to an outdoor route point.
      const onRoad = access.outdoorRouteId ? roads.has(access.outdoorRouteId) && !offRoad.has(access.entranceId) : !!access.outdoorNodeId
      if (onRoad && graph.nodeById.has(access.indoorRouteNodeId)) queue.push(key(level, access.indoorRouteNodeId))
    }
    for (const entrance of floor.entrances ?? []) {
      const legacy = (entrance as { metadata?: Record<string, unknown> }).metadata?.connectorRoadId
      const point = entrance.routeConnection?.anchorNodeId ?? entrance.routeNodeId
      if (typeof legacy !== 'string' || legacy.trim().length === 0) continue
      linkedOutside = true
      if (point && graph.nodeById.has(point)) queue.push(key(level, point))
    }
  }
  // A building not linked to the outdoor walk anywhere yet is still being drawn; Publish does not ask for it either.
  if (!linkedOutside) return []
  const reached = new Set(queue)
  while (queue.length > 0) {
    for (const next of adjacency.get(queue.shift()!) ?? []) if (!reached.has(next)) { reached.add(next); queue.push(next) }
  }
  const issues: ValidationIssue[] = []
  for (const [level, { floor, graph }] of [...graphs].sort((a, b) => a[0] - b[0])) {
    if (graph.nodes.length === 0 || graph.nodes.some((routeNode) => reached.has(key(level, routeNode.id)))) continue
    issues.push(warning('route-floor-unreachable', profile,
      `${floorName(floor)} of "${building.name || building.id}" can't be reached: no entrance on it is linked to the outdoor walk, and no stair or lift joined to the route on both floors leads to it. Visitors can't be routed to its rooms.`,
      [{ entityId: floor.id, entityType: 'floor' }], { buildingId: building.id, floorId: floor.id, layer: 'navigation' }))
  }
  return issues
}

/** Route lines that pass through a wall where the wall has no floor-level opening, door or entrance (raised windows don't count). */
function throughWallIssues(buildingId: string, floor: Floor, graph: RouteFloorGraph, profile: RouteProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const walls = (floor.walls ?? []).filter((wall) => !(Number(wall.height) <= 0.3))
  if (walls.length === 0) return issues
  const doors = new Map<string, Array<{ start: number; end: number }>>()
  const addDoor = (wallId: string, start: number, end: number) => doors.set(wallId, [...(doors.get(wallId) ?? []), { start, end }])
  for (const opening of floor.openings ?? []) {
    // Any opening that starts at floor level lets visitors through (ASU: a glass front drawn as a window with a 0 m sill).
    if ((opening.sillHeight ?? 0) <= 0.05) addDoor(opening.wallId, opening.offset, opening.offset + opening.width)
  }
  // Doors and entrances placed on a wall without being attached to it (ASU Octagon) still open it where they stand.
  const placed: Array<{ position: { x: number; y: number }; width: number; depth: number }> = []
  for (const door of collectFloorDoors({ ...floor, rooms: (floor.rooms ?? []) as never })) {
    const at = door.wallAttachment
    if (at?.wallId) addDoor(at.wallId, at.offset - door.width / 2, at.offset + door.width / 2)
    else if (door.position && Number.isFinite(door.width)) placed.push({ position: door.position, width: door.width, depth: Number(door.depth) || 0 })
  }
  for (const entrance of floor.entrances ?? []) {
    if (entrance.position) placed.push({ position: entrance.position, width: Number((entrance as { width?: number }).width) || 1.5, depth: 0 })
  }
  for (const wall of walls) {
    const sx = wall.end.x - wall.start.x, sy = wall.end.y - wall.start.y, length = Math.hypot(sx, sy)
    if (!(length > 0)) continue
    for (const item of placed) {
      const along = ((item.position.x - wall.start.x) * sx + (item.position.y - wall.start.y) * sy) / length
      const across = Math.abs((item.position.x - wall.start.x) * sy - (item.position.y - wall.start.y) * sx) / length
      if (across <= Math.max(wall.thickness ?? 0.2, item.depth) / 2 + 0.2 && along >= -item.width / 2 && along <= length + item.width / 2) {
        addDoor(wall.id, along - item.width / 2, along + item.width / 2)
      }
    }
  }
  for (const edge of graph.edges) {
    const a = graph.nodeById.get(edge?.from)?.position, b = graph.nodeById.get(edge?.to)?.position
    if (!a || !b || ![a.x, a.y, b.x, b.y].every(Number.isFinite)) continue
    for (const wall of walls) {
      const sx = wall.end.x - wall.start.x, sy = wall.end.y - wall.start.y, length = Math.hypot(sx, sy)
      const rx = b.x - a.x, ry = b.y - a.y, det = rx * sy - ry * sx
      if (!(length > 0) || Math.abs(det) < 1e-12) continue
      const t = ((wall.start.x - a.x) * sy - (wall.start.y - a.y) * sx) / det // along the route line
      const u = ((wall.start.x - a.x) * ry - (wall.start.y - a.y) * rx) / det // along the wall
      if (t <= 1e-6 || t >= 1 - 1e-6 || u < -1e-9 || u > 1 + 1e-9) continue
      const offset = u * length
      if ((doors.get(wall.id) ?? []).some((span) => offset >= span.start - 0.05 && offset <= span.end + 0.05)) continue
      issues.push(warning('route-through-wall', profile,
        `A route line on ${floorName(floor)} goes through a wall with no door there. Add a doorway to the wall or redraw the route around it.`,
        [{ entityId: edge.id, entityType: 'route-edge' }, { entityId: wall.id, entityType: 'wall' }],
        { buildingId, floorId: floor.id, layer: 'navigation' }))
      break
    }
  }
  return issues
}

function reachIssues(document: CampusDocument, profile: RouteProfile): ValidationIssue[] {
  const roads = new Map((document.roads ?? []).map((road) => [road.id, road]))
  const issues: ValidationIssue[] = []
  for (const building of document.buildings ?? []) {
    const graphs = new Map<number, { floor: Floor; graph: RouteFloorGraph }>()
    for (const floor of building.floors ?? []) if (routeNetworkOf(floor)) graphs.set(floor.level, { floor, graph: buildRouteFloorGraph(floor) })
    if (graphs.size === 0) continue
    for (const { floor, graph } of graphs.values()) {
      issues.push(...entranceOffRoadIssues(building.id, floor, roads, profile))
      issues.push(...throughWallIssues(building.id, floor, graph, profile))
    }
    issues.push(...stairLinkIssues(building, graphs, profile))
    issues.push(...floorReachIssues(building, graphs, roads, profile))
  }
  return issues
}

/** Pure route checks shared by the validation engine and the Floor Editor panel. */
export function validateRouteNetwork(document: CampusDocument, profile: RouteProfile = 'publish'): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const roadIds = new Set((document.roads ?? []).map((road) => road.id))
  for (const building of document.buildings ?? []) {
    for (const floor of building.floors ?? []) {
      if (!routeNetworkOf(floor) && !floor.entrances?.some(entrance => entrance.indoorOnly === true)) continue
      const graph = buildRouteFloorGraph(floor)
      issues.push(...structureIssues(building.id, floor, profile))
      issues.push(...disconnectedIssues(building.id, floor, graph, profile, ownWayIn(building, floor)))
      issues.push(...floorConsistencyIssues(building.id, floor, graph, profile))
      issues.push(...roomAccessIssues(building.id, floor, graph, profile))
      issues.push(...entranceAccessIssues(building.id, floor, graph, profile, roadIds))
    }
  }
  issues.push(...stairRouteIssues(document, profile))
  issues.push(...unreachableRoomIssues(document, profile))
  issues.push(...reachIssues(document, profile))
  return issues
}

function rule(ruleId: string, description: string, select: (issues: ValidationIssue[]) => ValidationIssue[]): ValidationRule {
  return {
    ruleId,
    description,
    category: 'navigation',
    defaultSeverity: 'error',
    profiles: ['draft', 'publish', 'strict'],
    affinity: 'global',
    execute: (context: ValidationContext) => select(validateRouteNetwork(context.document, context.profile)),
  }
}

export const routeNetworkStructureRule = rule(
  'route-network-structure',
  'Route nodes and edges have valid identifiers, types, coordinates, endpoints, and distances',
  (issues) => issues.filter((issue) => issue.ruleId === 'route-network-structure'),
)

export const routeNetworkDisconnectedRule = rule(
  'route-network-disconnected',
  'Authored route nodes form one connected navigable network',
  (issues) => issues.filter((issue) => issue.ruleId === 'route-network-disconnected'),
)

export const routeRoomAccessRule = rule(
  'route-room-access',
  'Semantic Room access points resolve to reachable route nodes',
  (issues) => issues.filter((issue) => issue.ruleId === 'route-room-access'),
)

export const routeEntranceAccessRule = rule(
  'route-entrance-access',
  'Entrance bridges resolve to reachable indoor route nodes and an outdoor reference',
  (issues) => issues.filter((issue) => issue.ruleId === 'route-entrance-access'),
)

export const routeFloorConsistencyRule = rule(
  'route-floor-consistency',
  'Route nodes declare the floor that owns them',
  (issues) => issues.filter((issue) => issue.ruleId === 'route-floor-consistency'),
)

export const routeStairRule = rule(
  'route-stair',
  'Routes over outdoor stairs and ramps match their stair',
  (issues) => issues.filter((issue) => issue.ruleId === 'route-stair'),
)

export const routeRoomUnreachableRule: ValidationRule = {
  ...rule('route-room-unreachable', 'Every room has a door or a room link, so visitors can be routed to it', (issues) => issues.filter((issue) => issue.ruleId === 'route-room-unreachable')),
  defaultSeverity: 'warning',
}

const warningRule = (ruleId: string, description: string): ValidationRule => ({
  ...rule(ruleId, description, (issues) => issues.filter((issue) => issue.ruleId === ruleId)),
  defaultSeverity: 'warning',
})
export const routeFloorUnreachableRule = warningRule('route-floor-unreachable', 'Every floor with a route can be reached from an entrance linked to the outdoor walk')
export const routeStairLinkRule = warningRule('route-stair-link', "Every stair end is joined to its floor's route, and every stair reaches another floor")
export const routeEntranceOffRoadRule = warningRule('route-entrance-off-road', 'Entrance links to the outdoor walk still sit on their road')
export const routeThroughWallRule = warningRule('route-through-wall', 'Route lines pass walls only through doors')

export const routeNetworkRules: ReadonlyArray<ValidationRule> = [
  routeStairRule,
  routeRoomUnreachableRule,
  routeFloorUnreachableRule,
  routeStairLinkRule,
  routeEntranceOffRoadRule,
  routeThroughWallRule,
  routeNetworkStructureRule,
  routeNetworkDisconnectedRule,
  routeRoomAccessRule,
  routeEntranceAccessRule,
  routeFloorConsistencyRule,
]
