import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import type { ConnectivityGraph, NavigationGraph } from '@navi/compiler'
import { analyzeBuildingConnectivity } from './building-connectivity'

describe('floor-to-floor building reachability', () => {
  it('accepts the outdoor ramp and highlights a missing link without treating a room as a corridor', () => {
    const floors = [0, 1, 2].map(level => ({ id: `f${level}`, level, label: `Floor ${level + 1}`, entrances: [] }))
    const document = { roads: [], buildings: [{ id: 'b', name: 'Example', floors }] } as unknown as CampusDocument
    const node = (id: string, floor: number, buildingId = 'b', room = false) => ({
      id, floor, buildingId, type: room ? 'poi' : 'waypoint', kind: room ? 'poi' : 'waypoint',
      position: { lat: 1, lng: 1 }, source: { entityId: id },
    })
    const nodes = [node('ground', 0), node('second', 1), node('third', 2),
      node('road-low', 0, '__outdoor__'), node('road-high', 0, '__outdoor__'), node('side-room', 1, 'b', true)]
    const edge = (from: string, to: string) => ({ id: from + to, from, to, type: 'walk', distance: 1, weight: 1 })
    const stair = edge('ground', 'second')
    const ramp = edge('road-low', 'road-high')
    const entranceLinks = [edge('second', 'road-low'), edge('road-high', 'third')]
    const roomDetour = [edge('second', 'side-room'), edge('side-room', 'third')]
    const ids = new Map(nodes.map(n => [n.id, [n.id]]))
    const topology = { nodes, edges: [] } as unknown as ConnectivityGraph
    const run = (rampEdges: typeof entranceLinks) => analyzeBuildingConnectivity({
      document, topology, ids, graph: { nodes, edges: [stair, ...entranceLinks, ...roomDetour, ...rampEdges] } as unknown as NavigationGraph,
    }, 'b')

    expect(run([ramp]).floorLinks).toEqual([
      { from: 'f0', to: 'f1', forward: 'indoor', reverse: 'indoor' },
      { from: 'f0', to: 'f2', forward: 'outdoor', reverse: 'outdoor' },
      { from: 'f1', to: 'f2', forward: 'outdoor', reverse: 'outdoor' },
    ])
    expect(run([]).floorLinks.at(-1)).toMatchObject({ forward: 'missing', reverse: 'missing' })
  })
})
