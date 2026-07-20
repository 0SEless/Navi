import { haversineDistance } from '@navi/core'
import type {
  PrimitiveGraph,
  PrimitiveNode,
  PrimitiveEdge,
  CompilerDiagnostic,
  DoorSpec,
} from '../types'

let seqId = 0
function nextId(prefix: string): string {
  return `${prefix}-${++seqId}`
}

function findNearestWaypoint(pos: { lat: number; lng: number }, nodes: PrimitiveNode[], floor: number): PrimitiveNode | null {
  let best: PrimitiveNode | null = null
  let bestDist = Infinity
  for (const node of nodes) {
    if (node.kind !== 'waypoint') continue
    if (node.floor !== floor) continue
    const d = haversineDistance(pos, node.position)
    if (d < bestDist) {
      bestDist = d
      best = node
    }
  }
  return best
}

export interface ConnectResult {
  edges: PrimitiveEdge[]
  diagnostics: CompilerDiagnostic[]
}

/**
 * Phase 2.3: Connect & Resolve.
 *
 * This is the ONLY phase that performs spatial search (nearest-neighbor).
 * After this phase, no spatial search ever occurs again.
 *
 * Responsibilities:
 *  - AccessEdge generation: doors → nearest waypoint
 *  - TransitionEdge generation: connector stops → paired edges
 *  - PortalEdge generation: entrance portal → implicit edge
 *  - Entrance-to-road connection: entrance → nearest road waypoint
 */
export function connectPrimitives(
  graph: PrimitiveGraph,
  doorSpecs: DoorSpec[],
): ConnectResult {
  const edges: PrimitiveEdge[] = []
  const diagnostics: CompilerDiagnostic[] = []
  const nodes = graph.nodes

  // Build lookup: connectorId → [TransitionNode] grouped and sorted by floor
  const connectorGroups = new Map<string, PrimitiveNode[]>()
  for (const node of nodes) {
    if (node.kind === 'transition') {
      const group = connectorGroups.get(node.connectorId) || []
      group.push(node)
      connectorGroups.set(node.connectorId, group)
    }
  }

  // Build lookup: entrance portal nodes by id
  const portalNodes = new Map<string, PrimitiveNode>()
  for (const node of nodes) {
    if (node.kind === 'entrance_portal') {
      portalNodes.set(node.id, node)
    }
  }

  // 1. AccessEdge generation
  for (const spec of doorSpecs) {
    const waypoint = findNearestWaypoint(spec.position, nodes, spec.floor)
    if (!waypoint) {
      diagnostics.push({
        severity: 'warning',
        sourceEntityId: spec.doorId,
        phase: 'primitives',
        code: 'DOOR_ORPHANED',
        message: `Door "${spec.doorId}" (room ${spec.roomId}) has no waypoint on floor ${spec.floor}`,
      })
      continue
    }

    // Find the room's POI node
    const poiNode = nodes.find(
      n => n.kind === 'poi' && n.source.entityId === spec.roomId && n.floor === spec.floor,
    )
    if (!poiNode) continue // shouldn't happen if room-extractor ran

    edges.push({
      id: nextId('AE'),
      kind: 'access',
      from: poiNode.id,
      to: waypoint.id,
      distance: haversineDistance(spec.position, waypoint.position),
      accessType: 'door',
      width: spec.width,
      source: {
        entityId: spec.doorId,
        entityType: 'room_door',
        generatorId: 'builtin:connector',
      },
    })
  }

  // 2. TransitionEdge generation
  for (const [connectorId, stops] of connectorGroups) {
    // Sort by floor ascending
    stops.sort((a, b) => a.floor - b.floor)

    for (let i = 0; i < stops.length - 1; i++) {
      const upper = stops[i]
      const lower = stops[i + 1]
      const gap = lower.floor - upper.floor

      if (gap > 1) {
        diagnostics.push({
          severity: 'info',
          sourceEntityId: connectorId,
          phase: 'primitives',
          code: 'VERTICAL_GAP',
          message: `Connector "${connectorId}" skips floor ${upper.floor + 1} between stops at ${upper.floor} and ${lower.floor}`,
          relatedNodeIds: [upper.id, lower.id],
        })
      }

      const tUpper = upper as import('../types').TransitionNode
      const tLower = lower as import('../types').TransitionNode
      edges.push({
        id: nextId('TE'),
        kind: 'transition',
        from: upper.id,
        to: lower.id,
        distance: haversineDistance(upper.position, lower.position),
        behavior: tUpper.behavior,
        baseCost: tUpper.baseCost,
        source: {
          entityId: connectorId,
          entityType: 'vertical_connector',
          generatorId: 'builtin:connector',
        },
      })
    }

    // Single stop → paired
    if (stops.length === 1) {
      diagnostics.push({
        severity: 'warning',
        sourceEntityId: connectorId,
        phase: 'primitives',
        code: 'STOP_UNPAIRED',
        message: `Connector "${connectorId}" has only one stop — no transition edge created`,
        relatedNodeIds: [stops[0].id],
      })
    }
  }

  // 3. Connect transition nodes to nearest waypoint on same floor
  for (const node of nodes) {
    if (node.kind !== 'transition') continue
    const nearest = findNearestWaypoint(node.position, nodes, node.floor)
    if (nearest) {
      edges.push({
        id: nextId('AE'),
        kind: 'access',
        from: node.id,
        to: nearest.id,
        distance: haversineDistance(node.position, nearest.position),
        accessType: 'transition',
        width: 2,
        source: {
          entityId: (node as import('../types').TransitionNode).connectorId,
          entityType: 'vertical_connector',
          generatorId: 'builtin:connector',
        },
      })
    }
  }

  // 4. PortalEdge generation
  for (const node of portalNodes.values()) {
    if (node.kind !== 'entrance_portal') continue
    const portalNode = node as import('../types').EntrancePortalNode
    const d = haversineDistance(portalNode.outdoorPosition, portalNode.indoorPosition)
    edges.push({
      id: nextId('PE'),
      kind: 'portal',
      nodeId: portalNode.id,
      distance: d,
      source: {
        entityId: portalNode.entranceId,
        entityType: 'entrance',
        generatorId: 'builtin:connector',
      },
    })
  }

  // 5. Connect entrance portals to indoor waypoints
  for (const node of portalNodes.values()) {
    if (node.kind !== 'entrance_portal') continue
    const portalNode = node as import('../types').EntrancePortalNode
    const indoorWp = findNearestWaypoint(portalNode.indoorPosition, nodes, portalNode.floor)
    if (indoorWp) {
      edges.push({
        id: nextId('AE'),
        kind: 'access',
        from: portalNode.id,
        to: indoorWp.id,
        distance: haversineDistance(portalNode.indoorPosition, indoorWp.position),
        accessType: 'entrance',
        width: 2,
        source: {
          entityId: portalNode.entranceId,
          entityType: 'entrance',
          generatorId: 'builtin:connector',
        },
      })
    } else {
      diagnostics.push({
        severity: 'warning',
        sourceEntityId: portalNode.entranceId,
        phase: 'primitives',
        code: 'ENTRANCE_UNCONNECTED',
        message: `Entrance "${portalNode.entranceId}" has no waypoint on floor ${portalNode.floor}`,
        relatedNodeIds: [portalNode.id],
      })
    }
  }

  // 6. Entrance-to-road connection
  for (const node of portalNodes.values()) {
    if (node.kind !== 'entrance_portal') continue
    const portalNode = node as import('../types').EntrancePortalNode
    const roadWaypoint = findNearestWaypoint(portalNode.outdoorPosition, nodes, 0)
    if (roadWaypoint) {
      edges.push({
        id: nextId('AE'),
        kind: 'access',
        from: portalNode.id,
        to: roadWaypoint.id,
        distance: haversineDistance(portalNode.outdoorPosition, roadWaypoint.position),
        accessType: 'entrance',
        width: 2,
        source: {
          entityId: portalNode.entranceId,
          entityType: 'entrance',
          generatorId: 'builtin:connector',
        },
      })
    } else {
      diagnostics.push({
        severity: 'info',
        sourceEntityId: portalNode.entranceId,
        phase: 'primitives',
        code: 'ENTRANCE_NO_ROAD',
        message: `Entrance "${portalNode.entranceId}" has no road waypoint nearby`,
        relatedNodeIds: [portalNode.id],
      })
    }
  }

  return { edges, diagnostics }
}
