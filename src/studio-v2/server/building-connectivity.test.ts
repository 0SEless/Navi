import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { analyzeBuildingConnectivity } from './building-connectivity'
import type { ConnectivityGraph, NavigationGraph } from '@navi/compiler'

const wp = (id: string, buildingId: string, floor = 0) => ({
  id, kind: 'waypoint' as const, buildingId, floor, position: { lat: 10, lng: 20 },
  source: { entityId: id === 'road-start' ? 'road' : id, entityType: 'route-node', generatorId: 'test' },
})
const indoor = wp('entry', 'building')
const hall = wp('hall', 'building')
const upper = wp('upper', 'building', 1)
const island = wp('island', 'building', 1)
const start = wp('road-start', '__outdoor__')
const roadEnd = wp('road-end', '__outdoor__')
const isolated = wp('anchor', '__outdoor__')
const base = { distance: 1, type: 'walk' as const, weight: 1 }
function edge(id: string, from: string, to: string) { return { id, from, to, ...base } }
function fixture(joinOutdoor: boolean) {
  const nodes = [start, roadEnd, isolated, indoor, hall, upper, island]
  const document = { roads: [{ id: 'road', name: 'Main Road' }], buildings: [{
    id: 'building', name: 'Test Hall', floors: [
      { id: 'ground', level: 0, label: 'Ground Floor', entrances: [{ id: 'door', label: 'Door' }, { id: 'unassigned', label: 'Other door' }],
        entranceAccess: [{ entranceId: 'door', outdoorRouteId: 'road', indoorRouteNodeId: 'entry' }] },
      { id: 'second', level: 1, label: 'Floor 2', entrances: [] },
    ],
  }] } as unknown as CampusDocument
  const graph = { nodes: nodes.map(n => ({ ...n, type: 'waypoint' })),
    edges: [edge('road', start.id, roadEnd.id), edge('hall', indoor.id, hall.id), edge('join-stair', hall.id, upper.id),
      edge('bridge', isolated.id, indoor.id), ...(joinOutdoor ? [edge('join-road', roadEnd.id, isolated.id)] : [])],
  } as unknown as NavigationGraph
  const topology = { nodes, edges: [
    { ...edge('road', start.id, roadEnd.id), kind: 'skeleton', source: { entityId: 'road' } },
    { ...edge('bridge', isolated.id, indoor.id), kind: 'access', accessType: 'entrance_bridge', source: { entityId: 'door' } },
  ] } as unknown as ConnectivityGraph
  const ids = new Map(nodes.map(n => [n.id, [n.id]]))
  return { document, graph, topology, ids }
}

describe('building connectivity', () => {
  it('reports an assigned entrance whose outdoor point is isolated from the selected road', () => {
    const result = analyzeBuildingConnectivity(fixture(false), 'building', 'road')
    expect(result.origin?.label).toBe('Main Road')
    expect(result.floors[0].entrances[0]).toMatchObject({ outdoor: 'unreachable', indoor: 'connected' })
    expect(result.floors[0].entrances[1].outdoor).toBe('unassigned')
    expect(result.floors[1].groups.every(group => group.reachable === 0)).toBe(true)
  })
  it('reaches the entrance and upper floor through the draft graph and exposes a separate upper cluster', () => {
    const result = analyzeBuildingConnectivity(fixture(true), 'building', 'road')
    expect(result.floors[0].entrances[0]).toMatchObject({ outdoor: 'connected', indoor: 'connected' })
    expect(result.floors[1].groups.map(group => [group.total, group.reachable])).toEqual([[1, 0], [1, 1]])
  })
})
