import { describe, expect, it } from 'vitest'
import type { CampusDocument } from '@navi/core'
import { stairFootPosition } from '@navi/core'
import { entranceOutdoorConnectHandler, stairFootEnsureHandler, stairFootEntranceId, stairFootRemoveHandler } from '../floor-route-workflow'

// Owner 2026-11-18: an outside stair (Computer Science) should connect to the outdoor route network (the main road),
// with a picker in the stair panel, and "None" allowed.

// A Stair-tool stair on the ground floor: outline 1.2 m wide, climbing east from x=10 to x=16; a stair route point
// on it; the building walls far away.
function fixture(): CampusDocument {
  return {
    schemaVersion: 1, version: 0, metadata: { campusId: 'c' }, roads: [],
    buildings: [{
      id: 'b',
      floors: [
        { id: 'f0', level: 0, elevation: 0, height: 3.5, entrances: [], rooms: [], hallways: [], doors: [], staircases: [], elevators: [],
          routeNetwork: { nodes: [{ id: 'stair-node', type: 'transition', position: { x: 13, y: 0 }, floor: 0 }], edges: [] } },
        { id: 'f1', level: 1, elevation: 3.5, height: 3.5, entrances: [], rooms: [], hallways: [], doors: [], staircases: [], elevators: [] },
      ],
      staircases: [{ id: 's', buildingId: 'b', name: 'East stair', type: 'standard', accessible: false, fromLevel: 0, toLevel: 0,
        levels: { 0: { position: { x: 13, y: 0 }, rotation: 0, polygon: { points: [{ x: 10, y: 0.6 }, { x: 10, y: -0.6 }, { x: 16, y: -0.6 }, { x: 16, y: 0.6 }] } } } }],
    }],
  } as unknown as CampusDocument
}

describe('the foot of a stair', () => {
  it('is just outside its lowest step', () => {
    const doc = fixture()
    const b = doc.buildings[0]
    const foot = stairFootPosition(b.staircases![0], b.floors)!
    // The stair climbs from one of its short ends; the foot is about half a metre past that end, on its centre line.
    expect(Math.abs(foot.y)).toBeLessThan(0.05)
    expect(foot.x < 10 || foot.x > 16).toBe(true)
    expect(Math.min(Math.abs(foot.x - 10), Math.abs(foot.x - 16))).toBeCloseTo(0.5, 1)
  })
})

describe('stair.foot.ensure / stair.foot.remove', () => {
  const p = { buildingId: 'b', floorId: 'f0', featureId: 's' }

  it('creates an entrance at the foot with a route point joined to the stair, once', () => {
    const doc = fixture()
    const r = stairFootEnsureHandler.execute(doc, p)
    expect(r.success).toBe(true)
    expect(r.entityId).toBe(stairFootEntranceId('s'))
    const f = doc.buildings[0].floors[0]
    const entrance = f.entrances.find((e) => e.id === stairFootEntranceId('s'))!
    expect(entrance.label).toBe('East stair (foot)')
    const port = entrance.routeNodeId!
    expect(f.routeNetwork!.nodes.some((n) => n.id === port)).toBe(true)
    expect(f.routeNetwork!.edges.some((e) => (e.from === port && e.to === 'stair-node') || (e.to === port && e.from === 'stair-node'))).toBe(true)
    // Again: nothing new.
    stairFootEnsureHandler.execute(doc, p)
    expect(f.entrances.filter((e) => e.id === stairFootEntranceId('s'))).toHaveLength(1)
    expect(f.routeNetwork!.edges).toHaveLength(1)
  })

  it('then connects outdoors with the entrance picker command, and None removes all of it', () => {
    const doc = fixture()
    const before = structuredClone(doc.buildings[0].floors[0])
    stairFootEnsureHandler.execute(doc, p)
    expect(entranceOutdoorConnectHandler.execute(doc, { buildingId: 'b', floorId: 'f0', entranceId: stairFootEntranceId('s'), outdoorNodeId: 'main-road-7' }).success).toBe(true)
    const f = doc.buildings[0].floors[0]
    expect(f.entranceAccess?.[0]).toMatchObject({ entranceId: stairFootEntranceId('s'), outdoorNodeId: 'main-road-7' })
    expect(stairFootRemoveHandler.execute(doc, p).success).toBe(true)
    expect(f.entrances).toEqual(before.entrances)
    expect(f.entranceAccess ?? []).toEqual([])
    expect(f.routeNetwork).toEqual(before.routeNetwork)
  })

  it('undo restores the floor exactly', () => {
    const doc = fixture()
    const before = structuredClone(doc.buildings[0].floors[0])
    const r = stairFootEnsureHandler.execute(doc, p)
    const undo = stairFootEnsureHandler.inverse!(p, r)!
    expect(stairFootEnsureHandler.execute(doc, undo.payload).success).toBe(true)
    expect(doc.buildings[0].floors[0]).toEqual(before)
  })

  it('an unknown stair fails without changing anything', () => {
    const doc = fixture()
    const before = JSON.stringify(doc)
    expect(stairFootEnsureHandler.execute(doc, { ...p, featureId: 'nope' }).success).toBe(false)
    expect(JSON.stringify(doc)).toBe(before)
  })
})

it('creates and links the stair foot only when a manual road choice succeeds', () => {
  const doc = fixture()
  const floor = doc.buildings[0].floors[0]
  const before = structuredClone(floor)
  const payload = { buildingId: 'b', floorId: 'f0', stairId: 's', entranceId: stairFootEntranceId('s') }
  expect(entranceOutdoorConnectHandler.execute(doc, { ...payload, outdoorNodeId: '' }).success).toBe(false)
  expect(floor).toEqual(before)
  expect(entranceOutdoorConnectHandler.execute(doc, { ...payload, floorId: 'f1', outdoorNodeId: 'road' }).success).toBe(false)
  expect(doc.buildings[0].floors[1].entrances).toEqual([])
  const choice = { ...payload, outdoorNodeId: 'road' }
  const result = entranceOutdoorConnectHandler.execute(doc, choice)
  expect(result.success).toBe(true)
  expect(floor.entranceAccess?.[0]).toMatchObject({ entranceId: payload.entranceId, outdoorNodeId: 'road', indoorRouteNodeId: floor.entrances[0].routeNodeId })
  expect(floor.routeNetwork?.edges).toHaveLength(1)
  expect(entranceOutdoorConnectHandler.execute(doc, entranceOutdoorConnectHandler.inverse!(choice, result)!.payload).success).toBe(true)
  expect(floor).toEqual(before)
})
