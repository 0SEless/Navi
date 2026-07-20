import { describe, it, expect } from 'vitest'
import { normalizeConnectivity } from '../connectivity/normalizer'
import type { PrimitiveGraph, WaypointNode, EntrancePortalNode, POINode, SkeletonEdge, AccessEdge, PortalEdge } from '../types'

function makeWp(id: string, lat = 14.0, lng = 121.0, floor = 0, buildingId = 'b1'): WaypointNode {
  return { id, kind: 'waypoint', position: { lat, lng }, floor, buildingId, source: { entityId: id, entityType: 'waypoint', generatorId: 'test' } }
}

function makeEp(id: string): EntrancePortalNode {
  return { id, kind: 'entrance_portal', position: { lat: 14.0, lng: 121.0 }, outdoorPosition: { lat: 14.0, lng: 121.0 }, indoorPosition: { lat: 14.001, lng: 121.001 }, floor: 0, buildingId: 'b1', entranceId: `${id}_ent`, accessible: true, source: { entityId: `${id}_ent`, entityType: 'entrance', generatorId: 'test' } }
}

function makePOI(id: string): POINode {
  return { id, kind: 'poi', label: 'POI', position: { lat: 14.0, lng: 121.0 }, floor: 0, buildingId: 'b1', poiCategory: 'room', source: { entityId: id, entityType: 'poi', generatorId: 'test' } }
}

function makeSk(id: string, from: string, to: string, distance = 10): SkeletonEdge {
  return { id, kind: 'skeleton', from, to, distance, source: { entityId: id, entityType: 'skeleton', generatorId: 'test' } }
}

function makeAc(id: string, from: string, to: string, distance = 5): AccessEdge {
  return { id, kind: 'access', from, to, distance, accessType: 'door', source: { entityId: id, entityType: 'access', generatorId: 'test' } }
}

function makePe(id: string, nodeId: string): PortalEdge {
  return { id, kind: 'portal', nodeId, distance: 1, source: { entityId: id, entityType: 'portal', generatorId: 'test' } }
}

function makeGraph(overrides?: Partial<PrimitiveGraph>): PrimitiveGraph {
  return {
    nodes: [],
    edges: [],
    metadata: { campusId: 'campus-1', buildingCount: 1, floorCount: 1, generatedAt: 0 },
    diagnostics: [],
    ...overrides,
  }
}

describe('normalizeConnectivity', () => {
  it('passes through a clean graph unchanged (node/edge count)', () => {
    const wp1 = makeWp('wp1', 14.0, 121.0)
    const wp2 = makeWp('wp2', 14.001, 121.001)
    const sk = makeSk('sk1', 'wp1', 'wp2', 150)
    const graph = makeGraph({ nodes: [wp1, wp2], edges: [sk] })
    const result = normalizeConnectivity(graph, 0.5)
    expect(result.nodes.length).toBe(2)
    expect(result.edges.length).toBe(1)
  })

  it('snaps nearby waypoints within merge threshold', () => {
    // Two waypoints 0.3m apart — should merge (threshold 0.5)
    const wp1 = makeWp('wp1', 14.0, 121.0)
    const wp2 = makeWp('wp2', 14.0, 121.000002) // ~0.2m apart at equator
    const sk = makeSk('sk1', 'wp1', 'wp2', 5)
    const graph = makeGraph({ nodes: [wp1, wp2], edges: [sk] })
    const result = normalizeConnectivity(graph, 0.5)
    expect(result.nodes.length).toBe(1)
    expect(result.diagnostics.some(d => d.code === 'WAYPOINT_MERGED')).toBe(true)
  })

  it('does not snap waypoints beyond merge threshold', () => {
    const wp1 = makeWp('wp1', 14.0, 121.0)
    const wp2 = makeWp('wp2', 14.001, 121.001) // ~150m apart
    const sk = makeSk('sk1', 'wp1', 'wp2', 150)
    const graph = makeGraph({ nodes: [wp1, wp2], edges: [sk] })
    const result = normalizeConnectivity(graph, 0.5)
    expect(result.nodes.length).toBe(2)
  })

  it('repairs edge references when a node is merged', () => {
    const wp1 = makeWp('wp1', 14.0, 121.0)
    const wp2 = makeWp('wp2', 14.0, 121.000002) // will be merged into wp1
    const wp3 = makeWp('wp3', 14.001, 121.001)
    const sk = makeSk('sk1', 'wp2', 'wp3', 150) // wp2 is removed, edge should point to wp1
    const graph = makeGraph({ nodes: [wp1, wp2, wp3], edges: [sk] })
    const result = normalizeConnectivity(graph, 0.5)
    // The edge should now reference wp1 (survivor) instead of wp2
    const edge = result.edges.find(e => e.kind === 'skeleton') as SkeletonEdge
    expect(edge).toBeDefined()
    expect(edge.from).toBe('wp1') // repaired to survivor
    expect(edge.to).toBe('wp3')
  })

  it('removes dangling waypoints with zero incident edges', () => {
    const wp1 = makeWp('wp1', 14.0, 121.0)
    const wp2 = makeWp('wp2', 14.001, 121.001)
    const sk = makeSk('sk1', 'wp1', 'wp2', 150)
    const orphan = makeWp('orphan-wp', 14.01, 121.01)
    const graph = makeGraph({ nodes: [wp1, wp2, orphan], edges: [sk] })
    const result = normalizeConnectivity(graph)
    expect(result.nodes.find(n => n.id === 'orphan-wp')).toBeUndefined()
    expect(result.diagnostics.some(d => d.code === 'SKELETON_DANGLING')).toBe(true)
  })

  it('does not remove non-waypoint nodes from dangling detection', () => {
    const ep = makeEp('ep1')
    const pe = makePe('pe1', 'ep1')
    // entrance_portal has no non-portal edges, but should NOT be removed
    const graph = makeGraph({ nodes: [ep], edges: [pe] })
    const result = normalizeConnectivity(graph)
    expect(result.nodes.find(n => n.id === 'ep1')).toBeDefined()
  })

  it('deduplicates overlapping access edges', () => {
    const wp1 = makeWp('wp1'); const wp2 = makeWp('wp2')
    const sk = makeSk('sk1', 'wp1', 'wp2', 10)
    const ac1 = makeAc('ac1', 'wp1', 'wp2', 2)
    const ac2 = makeAc('ac2', 'wp1', 'wp2', 2) // duplicate
    const graph = makeGraph({ nodes: [wp1, wp2], edges: [sk, ac1, ac2] })
    const result = normalizeConnectivity(graph)
    const accessEdges = result.edges.filter(e => e.kind === 'access')
    expect(accessEdges.length).toBe(1)
  })

  it('preserves portal edges through normalization', () => {
    const ep = makeEp('ep1')
    const wp = makeWp('wp1')
    const sk = makeSk('sk1', 'ep1', 'wp1', 5)
    const pe = makePe('pe1', 'ep1')
    const graph = makeGraph({ nodes: [ep, wp], edges: [sk, pe] })
    const result = normalizeConnectivity(graph)
    const portalEdges = result.edges.filter(e => e.kind === 'portal')
    expect(portalEdges.length).toBe(1)
  })

  it('computes metadata (buildingCount, floorCount) from final nodes', () => {
    const wp1 = makeWp('wp1', 14.0, 121.0, 0, 'b1')
    const wp2 = makeWp('wp2', 14.001, 121.001, 1, 'b1')
    const wp3 = makeWp('wp3', 14.01, 121.01, 0, 'b2')
    const sk1 = makeSk('sk1', 'wp1', 'wp2', 5)
    const sk2 = makeSk('sk2', 'wp2', 'wp3', 200)
    const graph = makeGraph({ nodes: [wp1, wp2, wp3], edges: [sk1, sk2] })
    const result = normalizeConnectivity(graph)
    expect(result.metadata.buildingCount).toBe(2)
    expect(result.metadata.floorCount).toBe(3) // b1:0, b1:1, b2:0
  })
})
