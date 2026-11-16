import { describe, expect, it } from 'vitest'
import { stairRise, type CampusDocument, type Staircase } from '@navi/core'
import { CommandDispatcher } from '../dispatcher'
import { CommandRegistry } from '../registry'
import { featureCreateHandler, featureDeleteHandler, featureUpdateHandler } from '../feature-handlers'
import { stairSetToFloorHandler } from '../stair-to-floor-handler'
import { cleanupFloorRoutingReferences } from '../routing-relationship-cleanup'
import { DocumentEventBus } from '../../eventbus'
import { HistoryStack } from '../../history'
import { DocumentStore } from '../../context/document-store'

function campus(): CampusDocument {
  return {
    schemaVersion: 1, version: 1, metadata: { campusId: 'c', name: 'C', description: '', lastModified: '', editorVersion: 'test' },
    roads: [], panoramas: [], qrCheckpoints: [], areas: [],
    buildings: [{
      id: 'b', name: 'B', code: 'B', category: 'academic', description: '', baseElevation: 0, height: 10.5,
      footprint: { points: [] }, verticalConnectors: [], color: '#000', aliases: [], metadata: {},
      floors: [0, 1, 2].map((level) => ({ id: `f${level}`, level, label: `Floor ${level + 1}`, elevation: level * 3.5, height: 3.5, rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], metadata: {} })),
    }],
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
  const run = (id: string, payload: Record<string, unknown>) => dispatcher.execute({ id, label: id, payload })
  return { run, history }
}
const drawing = { definitionId: 'stair', properties: { stepCount: 20, stepWidth: 1.2, stepDepth: 0.3, direction: 'east', preset: 'ushape' } }
const stairOf = (d: CampusDocument) => (d.buildings[0].staircases as Staircase[]).find((s) => s.id === 's')!

describe('stair.setToFloor', () => {
  function placed() {
    const d = campus()
    const e = editor(d)
    expect(e.run('feature.create', { buildingId: 'b', floor: 0, id: 's', featureType: 'staircase', position: { x: 1, y: 2 }, rotation: 0, drawing }).success).toBe(true)
    return { d, e }
  }

  it('To Floor 2 makes the stair climb from Floor 1 to Floor 2 with a top on Floor 2', () => {
    const { d, e } = placed()
    expect(e.run('stair.setToFloor', { featureId: 's', toLevel: 1 }).success).toBe(true)
    const s = stairOf(d)
    expect(s.fromLevel).toBe(0)
    expect(s.toLevel).toBe(1)
    expect(s.levels[1].role).toBe('top')
    expect(s.levels[0].role).toBeUndefined()
    expect(stairRise(s, d.buildings[0].floors)).toBe(3.5)
  })

  it('the top sits at the top landing: past the end of the second flight', () => {
    const { d, e } = placed()
    e.run('stair.setToFloor', { featureId: 's', toLevel: 1 })
    const top = stairOf(d).levels[1].position
    // east, turn right: flight 2 runs back towards -x on the +y side and ends near the start edge
    expect(top.y).toBeGreaterThan(2)
    expect(top.x).toBeLessThan(1 - 4.2 / 2 + 1.2)
  })

  it('To Floor 3 moves the top; To Floor 1 removes it; each undoes exactly', () => {
    const { d, e } = placed()
    const before = structuredClone(stairOf(d))
    e.run('stair.setToFloor', { featureId: 's', toLevel: 1 })
    const atTwo = structuredClone(stairOf(d))
    e.run('stair.setToFloor', { featureId: 's', toLevel: 2 })
    expect(stairOf(d).levels[1]).toBeUndefined()
    expect(stairOf(d).levels[2].role).toBe('top')
    expect(stairRise(stairOf(d), d.buildings[0].floors)).toBe(7)
    e.run('stair.setToFloor', { featureId: 's', toLevel: 0 })
    expect(Object.keys(stairOf(d).levels)).toEqual(['0'])
    expect(stairOf(d).toLevel).toBe(0)
    expect(e.history.undo()).toBe(true)
    expect(e.history.undo()).toBe(true)
    expect(stairOf(d)).toEqual(atTwo)
    expect(e.history.undo()).toBe(true)
    expect(stairOf(d)).toEqual(before)
  })

  it('refuses a floor that does not exist or is below the stair', () => {
    const { e } = placed()
    expect(e.run('stair.setToFloor', { featureId: 's', toLevel: 7 }).success).toBe(false)
    expect(e.run('stair.setToFloor', { featureId: 's', toLevel: -1 }).success).toBe(false)
  })

  it('a stair climbing to a floor drops its old per-floor links (both ways)', () => {
    const { d, e } = placed()
    e.run('feature.create', { buildingId: 'b', floor: 1, id: 'up', featureType: 'staircase', position: { x: 1, y: 2 }, rotation: 0 })
    expect(stairOf(d).links?.above).toBe('up')
    e.run('stair.setToFloor', { featureId: 's', toLevel: 1 })
    expect(stairOf(d).links).toBeUndefined()
    expect((d.buildings[0].staircases as Staircase[]).find((x) => x.id === 'up')!.links).toBeUndefined()
  })

  it('the top follows the flight: moving the stair moves its top by the same amount; undo puts both back', () => {
    const { d, e } = placed()
    e.run('stair.setToFloor', { featureId: 's', toLevel: 1 })
    const before = { ...stairOf(d).levels[1].position }
    expect(e.run('feature.update', { featureId: 's', level: 0, patch: { position: { x: 4, y: 2 } } }).success).toBe(true)
    expect(stairOf(d).levels[1].position.x).toBeCloseTo(before.x + 3, 6)
    expect(stairOf(d).levels[1].position.y).toBeCloseTo(before.y, 6)
    expect(e.history.undo()).toBe(true)
    expect(stairOf(d).levels[1].position).toEqual(before)
  })

  it('the top follows a Turn change (the second flight switches side)', () => {
    const { d, e } = placed()
    e.run('stair.setToFloor', { featureId: 's', toLevel: 1 })
    const right = stairOf(d).levels[1].position.y
    e.run('feature.update', { featureId: 's', level: 0, patch: { drawing: { properties: { turn: 'left' } } } })
    expect(stairOf(d).levels[1].position.y - 2).toBeCloseTo(-(right - 2), 6)
  })

  it("changing To removes the old top's route connector on the old floor; undo brings it back", () => {
    const { d, e } = placed()
    e.run('stair.setToFloor', { featureId: 's', toLevel: 1 })
    const floor2 = d.buildings[0].floors[1] as unknown as { routeNetwork?: { nodes: Array<{ id: string }>; edges: Array<{ id: string }> } }
    const top = stairOf(d).levels[1]
    floor2.routeNetwork = {
      nodes: [{ id: 'anchor', type: 'transition', position: { ...top.position }, floor: 1 }, { id: 'hall', type: 'waypoint', position: { x: 9, y: 9 }, floor: 1 }],
      edges: [{ id: 'conn', from: 'anchor', to: 'hall', type: 'walk', distance: 5 }],
    } as never
    top.routeConnection = { anchorNodeId: 'anchor', targetRouteNodeId: 'hall', connectorEdgeId: 'conn' }
    const connected = structuredClone(floor2.routeNetwork)
    e.run('stair.setToFloor', { featureId: 's', toLevel: 2 })
    expect(floor2.routeNetwork!.edges.map((x) => x.id)).not.toContain('conn')
    expect(floor2.routeNetwork!.nodes.map((x) => x.id)).not.toContain('anchor')
    expect(e.history.undo()).toBe(true)
    expect(floor2.routeNetwork).toEqual(connected)
    expect(stairOf(d).levels[1].routeConnection?.connectorEdgeId).toBe('conn')
  })

  it('deleting the To floor makes it a one-floor stair; deleting the From floor removes the stair (no top left alone)', () => {
    const a = placed()
    a.e.run('stair.setToFloor', { featureId: 's', toLevel: 1 })
    cleanupFloorRoutingReferences(a.d, a.d.buildings[0], a.d.buildings[0].floors[1])
    expect(Object.keys(stairOf(a.d).levels)).toEqual(['0'])
    expect(stairOf(a.d).toLevel).toBe(0)
    const b = placed()
    b.e.run('stair.setToFloor', { featureId: 's', toLevel: 1 })
    cleanupFloorRoutingReferences(b.d, b.d.buildings[0], b.d.buildings[0].floors[0])
    expect(b.d.buildings[0].staircases ?? []).toHaveLength(0)
  })
})

