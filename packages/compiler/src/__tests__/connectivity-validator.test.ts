import { describe, it, expect } from 'vitest'
import { validateConnectivity } from '../connectivity/validator'
import type { ConnectivityGraph, WaypointNode, EntrancePortalNode, SkeletonEdge, PortalEdge } from '../types'

function makeWaypoint(id: string, entityId?: string, floor = 0, buildingId = 'b1'): WaypointNode {
  return { id, kind: 'waypoint', position: { lat: 14.0, lng: 121.0 }, floor, buildingId, source: { entityId: entityId || id, entityType: 'waypoint', generatorId: 'test' } }
}

function makeEntrancePortal(id: string): EntrancePortalNode {
  return { id, kind: 'entrance_portal', position: { lat: 14.0, lng: 121.0 }, outdoorPosition: { lat: 14.0, lng: 121.0 }, indoorPosition: { lat: 14.001, lng: 121.001 }, floor: 0, buildingId: 'b1', entranceId: `${id}_ent`, accessible: true, source: { entityId: `${id}_ent`, entityType: 'entrance', generatorId: 'test' } }
}

function makeSkeletonEdge(id: string, from: string, to: string, distance = 10): SkeletonEdge {
  return { id, kind: 'skeleton', from, to, distance, source: { entityId: id, entityType: 'skeleton', generatorId: 'test' } }
}

function makePortalEdge(id: string, nodeId: string, distance = 1): PortalEdge {
  return { id, kind: 'portal', nodeId, distance, source: { entityId: id, entityType: 'portal', generatorId: 'test' } }
}

function makeGraph(overrides?: Partial<ConnectivityGraph>): ConnectivityGraph {
  return {
    nodes: [],
    edges: [],
    metadata: { campusId: 'campus-1', buildingCount: 1, floorCount: 1, generatedAt: 0 },
    diagnostics: [],
    ...overrides,
  }
}

describe('validateConnectivity', () => {
  it('returns zero diagnostics for a connected graph with entrance', () => {
    const ep = makeEntrancePortal('ep1')
    const wp1 = makeWaypoint('wp1')
    const wp2 = makeWaypoint('wp2')
    const sk = makeSkeletonEdge('sk1', 'ep1', 'wp1', 5)
    const sk2 = makeSkeletonEdge('sk2', 'wp1', 'wp2', 10)
    const pe = makePortalEdge('pe1', 'ep1', 1)
    const graph = makeGraph({ nodes: [ep, wp1, wp2], edges: [sk, sk2, pe] })
    const report = validateConnectivity(graph)
    expect(report.diagnostics.filter(d => d.severity === 'error')).toEqual([])
  })

  it('detects an orphan waypoint with zero incident edges', () => {
    const wp = makeWaypoint('orphan-wp', 'entity-orphan')
    const graph = makeGraph({ nodes: [wp] })
    const report = validateConnectivity(graph)
    const orphans = report.diagnostics.filter(d => d.code === 'SKELETON_DANGLING')
    expect(orphans.length).toBe(1)
    expect(orphans[0].sourceEntityId).toBe('entity-orphan')
    expect(orphans[0].severity).toBe('warning')
  })

  it('detects a dangling edge referencing a non-existent node', () => {
    const wp = makeWaypoint('wp1')
    const sk = makeSkeletonEdge('sk1', 'wp1', 'ghost-node', 10)
    const graph = makeGraph({ nodes: [wp], edges: [sk] })
    const report = validateConnectivity(graph)
    const dangles = report.diagnostics.filter(d => d.code === 'EDGE_ORPHANED')
    expect(dangles.length).toBe(1)
    expect(dangles[0].severity).toBe('error')
  })

  it('detects disconnected component not reachable from entrance', () => {
    const ep = makeEntrancePortal('ep1')
    const wp1 = makeWaypoint('reachable-wp')
    const wp2 = makeWaypoint('isolated-wp')
    const sk = makeSkeletonEdge('sk1', 'ep1', 'wp1', 10)
    // wp2 has no edge connecting it to ep1/wp1
    const graph = makeGraph({ nodes: [ep, wp1, wp2], edges: [sk] })
    const report = validateConnectivity(graph)
    const disconn = report.diagnostics.filter(d => d.code === 'HALLWAY_DISCONNECTED')
    expect(disconn.length).toBeGreaterThanOrEqual(1)
  })

  it('reports correct metrics for a healthy graph', () => {
    const ep = makeEntrancePortal('ep1')
    const wp1 = makeWaypoint('wp1'); const wp2 = makeWaypoint('wp2'); const wp3 = makeWaypoint('wp3')
    const sk1 = makeSkeletonEdge('sk1', 'ep1', 'wp1', 5)
    const sk2 = makeSkeletonEdge('sk2', 'wp1', 'wp2', 5)
    const sk3 = makeSkeletonEdge('sk3', 'wp2', 'wp3', 5)
    const pe = makePortalEdge('pe1', 'ep1', 1)
    const graph = makeGraph({ nodes: [ep, wp1, wp2, wp3], edges: [sk1, sk2, sk3, pe] })
    const report = validateConnectivity(graph)
    expect(report.metrics.reachableWaypoints).toBe(3)
    expect(report.metrics.orphanedWaypoints).toBe(0)
    expect(report.metrics.disconnectedComponents).toBe(0)
  })

  it('reports metrics with orphaned waypoints', () => {
    const ep = makeEntrancePortal('ep1')
    const wp1 = makeWaypoint('wp1')
    const wp2 = makeWaypoint('orphan-wp') // no edges
    const sk = makeSkeletonEdge('sk1', 'ep1', 'wp1', 5)
    const pe = makePortalEdge('pe1', 'ep1', 1)
    const graph = makeGraph({ nodes: [ep, wp1, wp2], edges: [sk, pe] })
    const report = validateConnectivity(graph)
    expect(report.metrics.orphanedWaypoints).toBe(1)
    expect(report.metrics.reachableWaypoints).toBe(1)
  })

  it('is read-only: does not mutate the input graph', () => {
    const wp = makeWaypoint('wp1')
    const sk = makeSkeletonEdge('sk1', 'wp1', 'wp2', 10)
    const graph = makeGraph({ nodes: [wp], edges: [sk] })
    const before = JSON.stringify(graph)
    validateConnectivity(graph)
    expect(JSON.stringify(graph)).toBe(before)
  })

  it('ignores portal edges for incident count (orphan detection)', () => {
    // A waypoint connected only by portal edges should be orphaned
    const ep = makeEntrancePortal('ep1')
    const wp = makeWaypoint('orphan-wp') // only incident is portal, not counted
    const pe = makePortalEdge('pe1', 'ep1', 1)
    const graph = makeGraph({ nodes: [ep, wp], edges: [pe] })
    const report = validateConnectivity(graph)
    const orphans = report.diagnostics.filter(d => d.code === 'SKELETON_DANGLING')
    expect(orphans.length).toBe(1)
  })

  it('passes validation for graph with multiple entrances', () => {
    const ep1 = makeEntrancePortal('ep1')
    const ep2 = makeEntrancePortal('ep2')
    const wp1 = makeWaypoint('wp1'); const wp2 = makeWaypoint('wp2')
    const sk1 = makeSkeletonEdge('sk1', 'ep1', 'wp1', 5)
    const sk2 = makeSkeletonEdge('sk2', 'wp1', 'wp2', 10)
    const pe1 = makePortalEdge('pe1', 'ep1', 1)
    const pe2 = makePortalEdge('pe2', 'ep2', 1)
    const graph = makeGraph({ nodes: [ep1, ep2, wp1, wp2], edges: [sk1, sk2, pe1, pe2] })
    const report = validateConnectivity(graph)
    expect(report.diagnostics.filter(d => d.severity === 'error')).toEqual([])
    expect(report.metrics.reachableWaypoints).toBe(2)
  })
})

// New-style entrance links (EntranceAccess) replace the door's portal with an 'entrance_bridge' access edge between
// the outdoor route and the indoor route. They are ways into the building too (2026-11-08).
describe('validateConnectivity with new-style entrance links', () => {
  const bridge = (id: string, from: string, to: string, accessType = 'entrance_bridge') => ({
    id, kind: 'access' as const, from, to, distance: 2, accessType, source: { entityId: 'ent-1', entityType: 'entrance', generatorId: 'test' },
  })

  it('a campus whose only way in is an entrance link has no disconnected waypoints', () => {
    const road1 = makeWaypoint('road-1', 'road', 0, '')
    const road2 = makeWaypoint('road-2', 'road', 0, '')
    const hall1 = makeWaypoint('hall-1')
    const hall2 = makeWaypoint('hall-2')
    const graph = makeGraph({
      nodes: [road1, road2, hall1, hall2],
      edges: [makeSkeletonEdge('r', 'road-1', 'road-2'), bridge('CA-EA-ent-1', 'road-2', 'hall-1'), makeSkeletonEdge('h', 'hall-1', 'hall-2')],
    })
    expect(validateConnectivity(graph).diagnostics.filter((d) => d.code === 'HALLWAY_DISCONNECTED')).toEqual([])
  })

  it('a building no link reaches is still reported', () => {
    const graph = makeGraph({
      nodes: [makeWaypoint('road-1', 'road', 0, ''), makeWaypoint('hall-1'), makeWaypoint('island-1', 'island', 0, 'b2'), makeWaypoint('island-2', 'island', 0, 'b2')],
      edges: [bridge('CA-EA-ent-1', 'road-1', 'hall-1'), makeSkeletonEdge('i', 'island-1', 'island-2')],
    })
    const disconnected = validateConnectivity(graph).diagnostics.filter((d) => d.code === 'HALLWAY_DISCONNECTED')
    expect(disconnected).toHaveLength(1)
    expect(disconnected[0].relatedNodeIds?.slice().sort()).toEqual(['island-1', 'island-2'])
  })

  it('other access edges (a stair or lift stop) are not ways in', () => {
    const graph = makeGraph({
      nodes: [makeWaypoint('wp-1'), makeWaypoint('wp-2')],
      edges: [bridge('AE-1', 'wp-1', 'wp-2', 'transition')],
    })
    expect(validateConnectivity(graph).diagnostics.filter((d) => d.code === 'HALLWAY_DISCONNECTED')).toHaveLength(1)
  })
})
