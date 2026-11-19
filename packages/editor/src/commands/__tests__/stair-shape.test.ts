import { expect, it } from 'vitest'
import type { CampusDocument, Floor, Staircase, Wall } from '@navi/core'
import { CommandDispatcher } from '../dispatcher'
import { CommandRegistry } from '../registry'
import { featureCreateHandler, featureDeleteHandler, featureUpdateHandler } from '../feature-handlers'
import { stairSetShapeHandler, stairSetToFloorHandler } from '../stair-to-floor-handler'
import { DocumentEventBus } from '../../eventbus'
import { HistoryStack } from '../../history'
import { DocumentStore } from '../../context/document-store'

// Owner 2026-11-19 (ASU Tourism): a U-stair drawn as a straight box arrives facing away from the corridor and never
// links. Type: U-Shape on a drawn stair fills the same box with two flights, so it arrives back beside its foot.
const W = (id: string, ax: number, ay: number, bx: number, by: number): Wall => ({ id, start: { x: ax, y: ay }, end: { x: bx, y: by }, height: 3.2, thickness: 0.2 })
const box = [{ x: 3.4, y: -9 }, { x: 2, y: -9 }, { x: 2, y: -1 }, { x: 3.4, y: -1 }]

function campus(boxPoints = box): CampusDocument {
  // Both floors: the corridor route runs behind the stair's foot (y = -12).
  const floors = [0, 1].map((level) => ({
    id: `f${level}`, level, label: `Floor ${level + 1}`, elevation: level * 3.5, height: 3.5, metadata: {},
    rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], openings: [],
    walls: [W(`n${level}`, -15, 10, 15, 10), W(`e${level}`, 15, 10, 15, -14), W(`s${level}`, 15, -14, -15, -14), W(`w${level}`, -15, -14, -15, 10)],
    routeNetwork: { nodes: [{ id: `a${level}`, type: 'waypoint', floor: level, position: { x: -14, y: -12 } }, { id: `z${level}`, type: 'waypoint', floor: level, position: { x: 14, y: -12 } }],
      edges: [{ id: `h${level}`, type: 'walk', from: `a${level}`, to: `z${level}`, distance: 28 }] },
  })) as unknown as Floor[]
  const stair = { id: 's', buildingId: 'b', name: 'Stair', type: 'open', accessible: false, fromLevel: 0, toLevel: 0,
    levels: { 0: { position: { x: 2.7, y: -5 }, rotation: 2.86, polygon: { points: boxPoints } } } } as unknown as Staircase
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
  for (const h of [featureCreateHandler, featureDeleteHandler, featureUpdateHandler, stairSetToFloorHandler, stairSetShapeHandler]) registry.register(h)
  const dispatcher = new CommandDispatcher(registry, document, eventBus)
  const history = new HistoryStack(dispatcher, document, registry, 20, store)
  dispatcher.addPreHook(history)
  dispatcher.addPostHook(history)
  return { run: (id: string, payload: Record<string, unknown>) => dispatcher.execute({ id, label: id, payload }), history }
}
const stairOf = (d: CampusDocument) => d.buildings[0].staircases![0]

it('a drawn stair made U-Shape arrives beside its foot and links to the corridor behind it', () => {
  const d = campus()
  const e = editor(d)
  expect(e.run('stair.setToFloor', { featureId: 's', toLevel: 1, autoConnect: true }).success).toBe(true)
  // Straight, it arrives at the far end facing away from the corridor: no link up there.
  expect(stairOf(d).levels[1].routeConnection).toBeUndefined()
  expect(e.run('stair.setShape', { featureId: 's', shape: 'ushape' }).success).toBe(true)
  const s = stairOf(d)
  expect(s.levels[0].polygon).toBeUndefined()
  expect(s.levels[0].drawing?.properties).toMatchObject({ preset: 'ushape', fromBox: box })
  expect(s.levels[1].routeConnection).toBeDefined()
  expect(s.levels[0].routeConnection).toBeDefined()
  expect(s.levels[1].position.y).toBeLessThan(-9 + 1e-6)
  // One undo step brings the box back, unlinked at the top as before.
  expect(e.history.undo()).toBe(true)
  expect(stairOf(d).levels[0].polygon?.points).toEqual(box)
  expect(stairOf(d).levels[0].drawing).toBeUndefined()
  expect(stairOf(d).levels[1].routeConnection).toBeUndefined()
})

it('Straight brings back the box that was drawn', () => {
  const d = campus()
  const e = editor(d)
  e.run('stair.setToFloor', { featureId: 's', toLevel: 1, autoConnect: true })
  e.run('stair.setShape', { featureId: 's', shape: 'ushape' })
  expect(e.run('stair.setShape', { featureId: 's', shape: 'straight' }).success).toBe(true)
  const flight = stairOf(d).levels[0]
  expect(flight.polygon?.points).toEqual(box)
  expect(flight.rotation).toBe(2.86)
  expect(flight.drawing).toBeUndefined()
})

it('the Turn of a U-Shape made from a box can be changed', () => {
  const d = campus()
  const e = editor(d)
  e.run('stair.setToFloor', { featureId: 's', toLevel: 1, autoConnect: true })
  e.run('stair.setShape', { featureId: 's', shape: 'ushape' })
  const right = stairOf(d).levels[1].position.x
  expect(e.run('stair.setShape', { featureId: 's', shape: 'ushape', turn: 'left' }).success).toBe(true)
  expect(stairOf(d).levels[0].drawing?.properties.turn).toBe('left')
  expect(stairOf(d).levels[1].position.x).not.toBeCloseTo(right, 1)
})

it('refuses a box too narrow for two flights, saying so', () => {
  const d = campus([{ x: 3, y: -9 }, { x: 2, y: -9 }, { x: 2, y: -1 }, { x: 3, y: -1 }])
  const result = editor(d).run('stair.setShape', { featureId: 's', shape: 'ushape' })
  expect(result.success).toBe(false)
  expect(result.error).toMatch(/1\.2 m/)
  expect(stairOf(d).levels[0].polygon).toBeDefined()
})
