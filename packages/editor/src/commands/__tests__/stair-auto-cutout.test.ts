import { expect, it } from 'vitest'
import type { CampusDocument, Floor, Staircase, Wall } from '@navi/core'
import { CommandDispatcher } from '../dispatcher'
import { CommandRegistry } from '../registry'
import { featureCreateHandler, featureDeleteHandler, featureUpdateHandler } from '../feature-handlers'
import { stairSetToFloorHandler } from '../stair-to-floor-handler'
import { DocumentEventBus } from '../../eventbus'
import { HistoryStack } from '../../history'
import { DocumentStore } from '../../context/document-store'

// Owner 2026-11-19 (ASU Tourism, COMDEV): when a wall stands between a stair end and its floor's route, Auto-connect
// cuts a doorway in that wall by itself and links the stair, instead of refusing ("Connection crosses a wall").
const W = (id: string, ax: number, ay: number, bx: number, by: number, height = 3.2): Wall => ({ id, start: { x: ax, y: ay }, end: { x: bx, y: by }, height, thickness: 0.2 })
const outer = (level: number) => [W(`n${level}`, -15, 10, 15, 10), W(`e${level}`, 15, 10, 15, -14), W(`s${level}`, 15, -14, -15, -14), W(`w${level}`, -15, -14, -15, 10)]

function campus(extra: Record<number, { walls?: Wall[]; routeY?: number }>): CampusDocument {
  const floors = [0, 1].map((level) => {
    const y = extra[level]?.routeY ?? 0
    return { id: `f${level}`, level, label: `Floor ${level + 1}`, elevation: level * 3.5, height: 3.5, metadata: {},
      rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [],
      walls: [...outer(level), ...(extra[level]?.walls ?? [])], openings: [],
      routeNetwork: { nodes: [{ id: `a${level}`, type: 'waypoint', floor: level, position: { x: -14, y } }, { id: `z${level}`, type: 'waypoint', floor: level, position: { x: 14, y } }],
        edges: [{ id: `h${level}`, type: 'walk', from: `a${level}`, to: `z${level}`, distance: 28 }] } }
  }) as unknown as Floor[]
  // A Stair-tool stair (outline only, first edge = bottom step) climbing north from y = -9 to y = -1 at x 2..3.2.
  const stair = { id: 's', buildingId: 'b', name: 'Stair', type: 'open', accessible: false, fromLevel: 0, toLevel: 0,
    levels: { 0: { position: { x: 2.6, y: -5 }, rotation: 0, polygon: { points: [{ x: 3.2, y: -9 }, { x: 2, y: -9 }, { x: 2, y: -1 }, { x: 3.2, y: -1 }] } } } } as unknown as Staircase
  return {
    schemaVersion: 1, version: 1, metadata: { campusId: 'c', name: 'C', description: '', lastModified: '', editorVersion: 'test' },
    roads: [], panoramas: [], qrCheckpoints: [], areas: [],
    buildings: [{ id: 'b', name: 'B', code: 'B', category: 'academic', description: '', baseElevation: 0, height: 7,
      footprint: { points: [] }, verticalConnectors: [], color: '#000', aliases: [], metadata: {}, floors, staircases: [stair] }],
  } as unknown as CampusDocument
}

function editor(document: CampusDocument) {
  const eventBus = new DocumentEventBus()
  const store = new DocumentStore(document, eventBus)
  const registry = new CommandRegistry()
  for (const h of [featureCreateHandler, featureDeleteHandler, featureUpdateHandler, stairSetToFloorHandler]) registry.register(h)
  const dispatcher = new CommandDispatcher(registry, document, eventBus)
  const history = new HistoryStack(dispatcher, document, registry, 20, store)
  dispatcher.addPreHook(history)
  dispatcher.addPostHook(history)
  return { run: (payload: Record<string, unknown>) => dispatcher.execute({ id: 'stair.setToFloor', label: 'stair', payload }), history }
}
const stairOf = (d: CampusDocument) => d.buildings[0].staircases![0]
const openings = (d: CampusDocument, level: number) => d.buildings[0].floors.find((f) => f.level === level)!.openings ?? []

it('cuts a doorway where a wall stands between the stair top and the route, then links the top', () => {
  // Upper floor: a wall at y = -0.5 between the arrival (y = -1) and the corridor route (y = 0), 0.5 m off the landing.
  const d = campus({ 1: { walls: [W('divider', -15, -0.5, 15, -0.5)] } })
  const e = editor(d)
  expect(e.run({ featureId: 's', toLevel: 1, autoConnect: true }).success).toBe(true)
  expect(stairOf(d).levels[1].routeConnection).toBeDefined()
  const cut = openings(d, 1)
  expect(cut).toHaveLength(1)
  expect(cut[0]).toMatchObject({ type: 'door', wallId: 'divider', sillHeight: 0, height: 2.1, frameless: true, metadata: { automatic: true } })
  // The doorway is in front of the stair (x 2..3.2 is 17..18.2 along the wall from x = -15).
  const middle = cut[0].offset + cut[0].width / 2
  expect(middle).toBeGreaterThan(16.5)
  expect(middle).toBeLessThan(18.7)
  expect(cut[0].width).toBeCloseTo(1.2, 1)
  // One undo step takes back the doorway and the link.
  expect(e.history.undo()).toBe(true)
  expect(openings(d, 1)).toEqual([])
  expect(stairOf(d).levels[1]?.routeConnection).toBeUndefined()
})

it('cuts a doorway where a wall stands between the stair foot and the route on its own floor', () => {
  // Lower floor: corridor route at y = -13, a wall at y = -11 between it and the foot (y = -9).
  const d = campus({ 0: { routeY: -13, walls: [W('divider0', -15, -11, 15, -11)] } })
  const e = editor(d)
  expect(e.run({ featureId: 's', toLevel: 1, autoConnect: true }).success).toBe(true)
  expect(stairOf(d).levels[0].routeConnection).toBeDefined()
  expect(openings(d, 0)).toEqual([expect.objectContaining({ wallId: 'divider0', type: 'door', metadata: expect.objectContaining({ automatic: true }) })])
  expect(stairOf(d).levels[1].routeConnection).toBeDefined()
  expect(openings(d, 1)).toEqual([])
})

it('opens a wall right against the arrival by itself', () => {
  // Upper floor: a wall across the arrival at y = -0.9 (against the landing), corridor route behind it.
  const d = campus({ 1: { walls: [W('across', -15, -0.9, 15, -0.9)] } })
  expect(editor(d).run({ featureId: 's', toLevel: 1, autoConnect: true }).success).toBe(true)
  expect(stairOf(d).levels[1].routeConnection).toBeDefined()
  expect(openings(d, 1)).toEqual([expect.objectContaining({ wallId: 'across', type: 'door', metadata: expect.objectContaining({ automatic: true }) })])
})

it('cuts nothing when the route is already in reach', () => {
  const d = campus({})
  expect(editor(d).run({ featureId: 's', toLevel: 1, autoConnect: true }).success).toBe(true)
  expect(stairOf(d).levels[1].routeConnection).toBeDefined()
  expect(openings(d, 0)).toEqual([])
  expect(openings(d, 1)).toEqual([])
})

it('does not carve through more than two walls to reach a far route', () => {
  const d = campus({ 1: { walls: [W('d1', -15, -0.5, 15, -0.5), W('d2', -15, 2, 15, 2), W('d3', -15, 4, 15, 4)], routeY: 6 } })
  expect(editor(d).run({ featureId: 's', toLevel: 1, autoConnect: true }).success).toBe(true)
  expect(stairOf(d).levels[1].routeConnection).toBeUndefined()
  expect(openings(d, 1)).toEqual([])
})

it('moves its own doorway when the stair is moved and connected again', () => {
  const d = campus({ 1: { walls: [W('divider', -15, -0.5, 15, -0.5)] } })
  const e = editor(d)
  e.run({ featureId: 's', toLevel: 1, autoConnect: true })
  const flight = stairOf(d).levels[0]
  flight.polygon = { points: flight.polygon!.points.map((p) => ({ x: p.x - 6, y: p.y })) }
  flight.position = { x: flight.position.x - 6, y: flight.position.y }
  delete flight.routeConnection
  for (const level of [0, 1]) {
    const link = stairOf(d).levels[level]?.routeConnection
    const network = d.buildings[0].floors[level].routeNetwork!
    if (link) network.edges = network.edges.filter((edge) => edge.id !== link.connectorEdgeId)
    delete stairOf(d).levels[level]?.routeConnection
  }
  expect(e.run({ featureId: 's', toLevel: 1, autoConnect: true }).success).toBe(true)
  const cut = openings(d, 1)
  expect(cut).toHaveLength(1)
  const middle = cut[0].offset + cut[0].width / 2
  expect(middle).toBeGreaterThan(10.5)
  expect(middle).toBeLessThan(12.7)
})
