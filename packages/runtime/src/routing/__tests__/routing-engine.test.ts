import { describe, it, expect } from 'vitest'
import { RoutingEngine } from '../routing-engine'
import type { NavigationGraph } from '@navi/core'

function makeGraph(overrides?: Partial<NavigationGraph>): NavigationGraph {
  return {
    version: '1.0.0',
    campusId: 'test',
    createdAt: '',
    checksum: '',
    nodes: [
      { id: 'a', label: 'Entrance', type: 'transition', position: { lng: 121.0, lat: 14.0 }, floor: 1, buildingId: 'b1', properties: {} },
      { id: 'b', label: 'Hallway', type: 'corridor', position: { lng: 121.0005, lat: 14.0 }, floor: 1, buildingId: 'b1', properties: {} },
      { id: 'c', label: 'Room 101', type: 'space', position: { lng: 121.001, lat: 14.0 }, floor: 1, buildingId: 'b1', properties: {} },
    ],
    edges: [
      { id: 'e1', from: 'a', to: 'b', type: 'walk', distance: 50, weight: 50 },
      { id: 'e2', from: 'b', to: 'c', type: 'walk', distance: 40, weight: 40 },
    ],
    metadata: { nodeCount: 3, edgeCount: 2, buildings: 1, floors: 1, boundingBox: { minLng: 121, maxLng: 121.001, minLat: 14, maxLat: 14.001 } },
    ...overrides,
  }
}

describe('RoutingEngine', () => {
  it('finds a route between two connected nodes', () => {
    const engine = new RoutingEngine(makeGraph())
    const route = engine.findRoute('a', 'c')
    expect(route).not.toBeNull()
    expect(route!.path.map(s => s.nodeId)).toEqual(['a', 'b', 'c'])
  })

  it('returns null for unreachable nodes', () => {
    const engine = new RoutingEngine(makeGraph())
    const route = engine.findRoute('a', 'nonexistent')
    expect(route).toBeNull()
  })

  it('returns instructions with arrive at end', () => {
    const engine = new RoutingEngine(makeGraph())
    const route = engine.findRoute('a', 'c')!
    expect(route.instructions[route.instructions.length - 1].type).toBe('arrive')
  })

  it('computes total distance and duration', () => {
    const engine = new RoutingEngine(makeGraph())
    const route = engine.findRoute('a', 'c')!
    expect(route.totalDistance).toBeGreaterThan(0)
    expect(route.totalDuration).toBeGreaterThan(0)
  })

  it('includes fromLabel and toLabel', () => {
    const engine = new RoutingEngine(makeGraph())
    const route = engine.findRoute('a', 'c')!
    expect(route.fromLabel).toBe('Entrance')
    expect(route.toLabel).toBe('Room 101')
  })

  it('routing API works through engine', async () => {
    const { RuntimeEngine } = await import('../../engine/runtime-engine')
    const { load } = await import('../../loader')
    const { resolve } = await import('path')

    const fixturesDir = resolve(__dirname, '../../../test/fixtures')
    const result = await load(fixturesDir)
    expect(result.success).toBe(true)
    if (!result.success) return
    const engine = new RuntimeEngine(result.package)
    const route = engine.navigation.findRoute('n1', 'n3')
    expect(route).not.toBeNull()
  })
})
