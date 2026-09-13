import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { doorCreateHandler, doorRouteConnectHandler, doorUpdateHandler } from '../feature-handlers'

function doc(): CampusDocument {
  return {
    schemaVersion: 1, version: 0,
    metadata: { campusId: 'c', name: 'C', description: '', lastModified: '', editorVersion: '' },
    buildings: [{ id: 'b', name: 'B', code: 'B', category: 'academic', description: '', footprint: { points: [] }, baseElevation: 0, height: 3, verticalConnectors: [], color: '#000', aliases: [], metadata: {}, floors: [{
      id: 'f', level: 0, label: 'GF', elevation: 0, height: 3,
      rooms: [
        { id: 'r1', name: 'One', number: '1', category: 'classroom', polygon: { points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }] }, roomDoors: [], metadata: {} },
        { id: 'r2', name: 'Two', number: '2', category: 'classroom', polygon: { points: [{ x: 6, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }, { x: 6, y: 4 }] }, roomDoors: [], metadata: {} },
      ],
      hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], metadata: {},
      routeNetwork: { nodes: [{ id: 'route-1', type: 'waypoint', position: { x: 8, y: 2 }, floor: 0 }], edges: [] },
    }] }],
    roads: [], panoramas: [], qrCheckpoints: [],
  }
}

const rectangle = (minX: number, maxX: number) => ({ type: 'rectangle' as const, min: { x: minX, y: 1 }, max: { x: maxX, y: 3 }, rotation: 0 })

describe('spatial Door commands', () => {
  it('assigns, reparents, and clears Room ownership from rectangle containment', () => {
    const document = doc()
    expect(doorCreateHandler.execute(document, { buildingId: 'b', floorId: 'f', door: { id: 'd', name: 'Main Door', doorType: 'standard', position: { x: 2, y: 2 }, width: 2, depth: 2, rotation: 0, geometry: rectangle(1, 3), metadata: {} } }).success).toBe(true)
    expect(document.buildings[0].floors[0].doors?.[0]).toMatchObject({ roomId: 'r1', ownership: { status: 'assigned' } })

    doorUpdateHandler.execute(document, { doorId: 'd', patch: { position: { x: 8, y: 2 }, geometry: rectangle(7, 9) } })
    expect(document.buildings[0].floors[0].doors?.[0]).toMatchObject({ roomId: 'r2', ownership: { status: 'assigned' } })

    doorUpdateHandler.execute(document, { doorId: 'd', patch: { position: { x: 5, y: 8 }, geometry: { type: 'rectangle', min: { x: 4.5, y: 7.5 }, max: { x: 5.5, y: 8.5 }, rotation: 0 } } })
    expect(document.buildings[0].floors[0].doors?.[0].roomId).toBeUndefined()
    expect(document.buildings[0].floors[0].doors?.[0].ownership).toEqual({ status: 'unassigned' })
  })

  it('creates a Door anchor and connector only to the explicitly selected route node', () => {
    const document = doc()
    doorCreateHandler.execute(document, { buildingId: 'b', floorId: 'f', door: { id: 'd', doorType: 'standard', position: { x: 2, y: 2 }, width: 2, depth: 1, rotation: 0, geometry: rectangle(1, 3), metadata: {} } })

    const result = doorRouteConnectHandler.execute(document, { doorId: 'd', routeNodeId: 'route-1' })
    const floor = document.buildings[0].floors[0]
    const door = floor.doors?.[0]
    expect(result.success).toBe(true)
    expect(door?.routeConnection?.targetRouteNodeId).toBe('route-1')
    expect(floor.routeNetwork?.nodes.find(node => node.id === door?.routeConnection?.anchorNodeId)).toMatchObject({ type: 'portal', position: { x: 2, y: 2 } })
    expect(floor.routeNetwork?.edges.find(edge => edge.id === door?.routeConnection?.connectorEdgeId)).toMatchObject({ from: door?.routeConnection?.anchorNodeId, to: 'route-1', type: 'walk' })
    expect(floor.routeNetwork?.nodes).toHaveLength(2)
    expect(floor.routeNetwork?.edges).toHaveLength(1)
  })

  it('moves its owned route anchor with the Door and restores topology on undo', () => {
    const document = doc()
    doorCreateHandler.execute(document, { buildingId: 'b', floorId: 'f', door: { id: 'd', doorType: 'standard', position: { x: 2, y: 2 }, width: 2, depth: 1, geometry: rectangle(1, 3), metadata: {} } })
    doorRouteConnectHandler.execute(document, { doorId: 'd', routeNodeId: 'route-1' })
    const floor = document.buildings[0].floors[0]
    const connection = floor.doors?.[0].routeConnection

    const result = doorUpdateHandler.execute(document, { doorId: 'd', patch: { position: { x: 4, y: 2 }, geometry: rectangle(3, 5) } })
    expect(floor.routeNetwork?.nodes.find(node => node.id === connection?.anchorNodeId)?.position).toEqual({ x: 4, y: 2 })
    expect(floor.routeNetwork?.edges.find(edge => edge.id === connection?.connectorEdgeId)?.distance).toBe(4)

    const inverse = doorUpdateHandler.inverse({ doorId: 'd' }, result)
    expect(inverse).not.toBeNull()
    doorUpdateHandler.execute(document, inverse!.payload)
    expect(floor.doors?.[0].position).toEqual({ x: 2, y: 2 })
    expect(floor.routeNetwork?.nodes.find(node => node.id === connection?.anchorNodeId)?.position).toEqual({ x: 2, y: 2 })
    expect(floor.routeNetwork?.edges.find(edge => edge.id === connection?.connectorEdgeId)?.distance).toBeCloseTo(Math.hypot(6, 0))
  })

  it('connects a Door to a route segment through a real shared junction', () => {
    const document = doc()
    const floor = document.buildings[0].floors[0]
    floor.routeNetwork!.nodes.push({ id: 'route-2', type: 'waypoint', position: { x: 2, y: 2 }, floor: 0 })
    floor.routeNetwork!.edges.push({ id: 'edge-1-2', from: 'route-1', to: 'route-2', type: 'walk', distance: 6 })
    doorCreateHandler.execute(document, { buildingId: 'b', floorId: 'f', door: { id: 'd', doorType: 'standard', position: { x: 2, y: 2 }, width: 2, depth: 1, geometry: rectangle(1, 3), metadata: {} } })

    const result = doorRouteConnectHandler.execute(document, { doorId: 'd', segment: { edgeId: 'edge-1-2', position: { x: 5, y: 2 } } })

    expect(result.success).toBe(true)
    const door = floor.doors?.[0]
    const junctionId = door?.routeConnection?.targetRouteNodeId
    expect(junctionId).toBeTruthy()
    expect(floor.routeNetwork?.edges.find(e => e.id === 'edge-1-2')).toBeUndefined()
    expect(floor.routeNetwork?.nodes.find(n => n.id === junctionId)).toMatchObject({ type: 'waypoint', position: { x: 5, y: 2 } })
    expect(floor.routeNetwork?.edges.filter(e => e.from === junctionId || e.to === junctionId)).toHaveLength(3)
  })

  it('restores the split network byte-exact when a segment Door connection is undone', () => {
    const document = doc()
    const floor = document.buildings[0].floors[0]
    floor.routeNetwork!.nodes.push({ id: 'route-2', type: 'waypoint', position: { x: 2, y: 2 }, floor: 0 })
    floor.routeNetwork!.edges.push({ id: 'edge-1-2', from: 'route-1', to: 'route-2', type: 'walk', distance: 6 })
    doorCreateHandler.execute(document, { buildingId: 'b', floorId: 'f', door: { id: 'd', doorType: 'standard', position: { x: 2, y: 2 }, width: 2, depth: 1, geometry: rectangle(1, 3), metadata: {} } })
    const before = JSON.parse(JSON.stringify(floor))

    const result = doorRouteConnectHandler.execute(document, { doorId: 'd', segment: { edgeId: 'edge-1-2', position: { x: 5, y: 2 } } })
    const inverse = doorRouteConnectHandler.inverse({ doorId: 'd' }, result)
    expect(inverse).not.toBeNull()
    doorRouteConnectHandler.execute(document, inverse!.payload as Record<string, unknown>)

    expect(JSON.parse(JSON.stringify(floor))).toEqual(before)
  })
})
