import { expect, it } from 'vitest'
import type { CampusDocument, Floor, Staircase } from '@navi/core'
import { stairSetToFloorHandler } from '../stair-to-floor-handler'
import { entranceOutdoorConnectHandler } from '../floor-route-workflow'

// Owner 2026-11-19 stair check: a ground-floor stair outside the building, linked to the outdoor walk with "Connect…",
// must also be joined to its own foot — the floor has no route outside the building for it to link to.
const world = (x: number, y: number) => ({ lat: 11.818 + y / 111320, lng: 122.17 + x / (111320 * Math.cos(11.818 * Math.PI / 180)) })
function doc(): CampusDocument {
  const floors = [0, 1].map(level => ({
    id: `f${level}`, level, label: `Floor ${level + 1}`, elevation: level * 3.5, height: 3.5, metadata: {},
    walls: [{ id: `s${level}`, start: { x: 15, y: -10 }, end: { x: -15, y: -10 }, height: 3.2, thickness: 0.2 }],
    rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [],
    routeNetwork: { nodes: [{ id: `w${level}`, position: { x: -14, y: 0 }, type: 'waypoint', floor: level }, { id: `e${level}`, position: { x: 14, y: 0 }, type: 'waypoint', floor: level }],
      edges: [{ id: `h${level}`, from: `w${level}`, to: `e${level}`, type: 'walk', distance: 28 }] },
  })) as unknown as Floor[]
  // Outside the front (y < -10), along the facade, climbing east.
  const stair = { id: 's', buildingId: 'b', name: 'Stair', type: 'open', accessible: false, fromLevel: 0, toLevel: 0,
    levels: { 0: { position: { x: -1, y: -10.7 }, rotation: 0, polygon: { points: [{ x: -5, y: -10.1 }, { x: -5, y: -11.3 }, { x: 3, y: -11.3 }, { x: 3, y: -10.1 }] } } } } as unknown as Staircase
  return { schemaVersion: 1, version: 0, metadata: { campusId: 'c', name: 'C', description: '', lastModified: '', editorVersion: 'test' },
    buildings: [{ id: 'b', name: 'B', code: 'B', category: 'academic', description: '', baseElevation: 0, height: 7, color: '#999', aliases: [], metadata: {}, verticalConnectors: [],
      footprint: { points: [world(-15, 10), world(15, 10), world(15, -10), world(-15, -10)] }, floors, staircases: [stair] }],
    roads: [{ id: 'road', name: 'Walk', polyline: { points: [world(-20, -14), world(20, -14)] }, width: 3, surface: 'paved', type: 'pedestrian', routing: { feature: 'normal' }, metadata: {} }],
    panoramas: [], qrCheckpoints: [], areas: [] } as unknown as CampusDocument
}

it('opens the railing where an entry platform crosses it, even when the platform reaches past the railing', () => {
  const d = doc()
  const b = d.buildings[0]
  // Three floors with a 1 m railing on the front; the 2F->3F stair climbs straight away from the building, its foot
  // 0.6 m off the railing (the 1 m entry platform reaches 0.4 m past it, onto the corridor).
  b.floors.push({ ...structuredClone(b.floors[1]), id: 'f2', level: 2, label: 'Floor 3', elevation: 7 } as Floor)
  for (const f of b.floors) f.walls = [{ id: `rail${f.level}`, start: { x: 15, y: -10 }, end: { x: -15, y: -10 }, height: 1, thickness: 0.2 }]
  b.staircases = [{ id: 's', buildingId: 'b', name: 'Stair', type: 'open', accessible: false, fromLevel: 1, toLevel: 1,
    levels: { 1: { position: { x: 1.4, y: -14.6 }, rotation: 0, polygon: { points: [{ x: 2, y: -10.6 }, { x: 0.8, y: -10.6 }, { x: 0.8, y: -18.6 }, { x: 2, y: -18.6 }] } } } } as unknown as Staircase]
  expect(stairSetToFloorHandler.execute(d, { featureId: 's', toLevel: 2, autoConnect: true }).success).toBe(true)
  const opening = b.floors[1].openings?.find(o => o.id === 's-entry-opening')
  expect(opening).toMatchObject({ wallId: 'rail1', type: 'door', height: 1 })
  // The rail runs from x = 15 to -15: the platform (x 0.8..2.0) is offset 13..14.2 along it.
  expect(opening!.offset).toBeCloseTo(13, 1)
  expect(opening!.width).toBeCloseTo(1.2, 1)
  expect(b.staircases![0].levels[1].routeConnection).toBeDefined()
  // Moved 3 m west and Auto-connect again: the railing gap follows the platform (one gap, at the new place).
  const flight = b.staircases![0].levels[1]
  flight.polygon = { points: flight.polygon!.points.map(p => ({ x: p.x - 3, y: p.y })) }
  flight.position = { x: flight.position.x - 3, y: flight.position.y }
  delete flight.routeConnection
  expect(stairSetToFloorHandler.execute(d, { featureId: 's', toLevel: 2, autoConnect: true }).success).toBe(true)
  const gaps = b.floors[1].openings!.filter(o => o.id === 's-entry-opening')
  expect(gaps).toHaveLength(1)
  expect(gaps[0].offset).toBeCloseTo(16, 1)
})

it('joins an outside stair to its foot when its foot is linked to the outdoor walk', () => {
  const d = doc()
  const b = d.buildings[0], s = b.staircases![0]
  expect(stairSetToFloorHandler.execute(d, { featureId: 's', toLevel: 1, autoConnect: true }).success).toBe(true)
  expect(s.levels[0].routeConnection).toBeUndefined() // nothing on the ground floor outside the building to link to
  const result = entranceOutdoorConnectHandler.execute(d, { buildingId: 'b', floorId: 'f0', stairId: 's', entranceId: 'stair-foot-s',
    outdoorNodeId: 'outside', outdoorRouteId: 'road', outdoorPosition: world(-5.5, -14) })
  expect(result.success, result.error).toBe(true)
  const floor = b.floors[0], link = s.levels[0].routeConnection
  const port = floor.entrances.find(e => e.id === 'stair-foot-s')!.routeNodeId
  expect(link).toBeDefined()
  expect(link!.targetRouteNodeId).toBe(port)
  const edge = floor.routeNetwork!.edges.find(e => e.id === link!.connectorEdgeId)!
  expect([edge.from, edge.to].sort()).toEqual([link!.anchorNodeId, port].sort())
  // Undo restores the stair without the link.
  const undo = entranceOutdoorConnectHandler.inverse!({ buildingId: 'b', floorId: 'f0' }, result)!
  expect(entranceOutdoorConnectHandler.execute(d, undo.payload).success).toBe(true)
  expect(s.levels[0].routeConnection).toBeUndefined()
})
