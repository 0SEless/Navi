import { describe, expect, it } from 'vitest'
import { stairRise, type CampusDocument, type Staircase } from '@navi/core'
import { CommandDispatcher } from '../dispatcher'
import { CommandRegistry } from '../registry'
import { featureCreateHandler, featureDeleteHandler, featureUpdateHandler } from '../feature-handlers'
import { proposeStairCutout, stairSetToFloorHandler } from '../stair-to-floor-handler'
import { detachedStairCutouts } from '../../geometry/stair-top-reach'
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

  it('a drawn Floor 2 stair does not auto-link to a stair below it', () => {
    const { d, e } = placed()
    e.run('feature.create', { buildingId: 'b', floor: 1, id: 'middle', featureType: 'staircase', position: { x: 1, y: 2 }, rotation: 0, drawing })
    const middle = d.buildings[0].staircases!.find(item => item.id === 'middle')!
    expect(middle.links?.below).toBeUndefined()
    expect(stairOf(d).links?.above).toBeUndefined()
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

  it('a straight stair moved by position alone: its outline and its top follow it', () => {
    const d = campus()
    const e = editor(d)
    const straight = { definitionId: 'stair', properties: { stepCount: 20, stepWidth: 1.5, stepDepth: 0.3, direction: 'south', preset: 'straight', topLandingM: 2 } }
    e.run('feature.create', { buildingId: 'b', floor: 0, id: 's', featureType: 'staircase', position: { x: 0, y: 13.6 }, rotation: 90, drawing: straight })
    e.run('stair.setToFloor', { featureId: 's', toLevel: 1 })
    const top = { ...stairOf(d).levels[1].position }
    e.run('feature.update', { featureId: 's', level: 0, patch: { position: { x: 0, y: 12.55 } } })
    const ys = stairOf(d).levels[0].polygon!.points.map((p) => p.y)
    expect(Math.min(...ys)).toBeCloseTo(12.55 - 0.75, 6)
    expect(stairOf(d).levels[1].position.y).toBeCloseTo(top.y - 1.05, 6)
  })

  describe('outside stair cutout confirmation', () => {
    const box = (level: number) => [
      { id: `n${level}`, start: { x: -11.6, y: 11.7 }, end: { x: 11.6, y: 11.7 }, height: 3.5, thickness: 0.2 },
      { id: `e${level}`, start: { x: 11.6, y: 11.7 }, end: { x: 11.6, y: -11.7 }, height: 3.5, thickness: 0.2 },
      { id: `s${level}`, start: { x: 11.6, y: -11.7 }, end: { x: -11.6, y: -11.7 }, height: 3.5, thickness: 0.2 },
      { id: `w${level}`, start: { x: -11.6, y: -11.7 }, end: { x: -11.6, y: 11.7 }, height: 3.5, thickness: 0.2 },
    ]
    const straight = { definitionId: 'stair', properties: { stepCount: 20, stepWidth: 1.5, stepDepth: 0.3, direction: 'south', preset: 'straight', topLandingM: 2 } }
    function walled(y = 12.55) {
      const d = campus()
      for (const f of d.buildings[0].floors) Object.assign(f, { walls: box(f.level), openings: [] })
      const e = editor(d)
      e.run('feature.create', { buildingId: 'b', floor: 0, id: 's', featureType: 'staircase', position: { x: 0, y }, rotation: 90, drawing: straight })
      e.run('stair.setToFloor', { featureId: 's', toLevel: 1 })
      return { d, e }
    }
    const openingsOn = (d: CampusDocument, level: number) => ((d.buildings[0].floors.find((f) => f.level === level) as unknown as { openings?: Array<Record<string, unknown>> }).openings ?? [])

    function confirm(d: CampusDocument, e: ReturnType<typeof editor>) {
      const proposal = proposeStairCutout(d.buildings[0], stairOf(d))!
      expect(proposal).toBeDefined()
      expect(e.run('stair.setToFloor', { featureId: 's', toLevel: 1, cutout: {
        wallId: proposal.wallId, offset: proposal.offset, width: proposal.width,
      } }).success).toBe(true)
    }

    // Owner 2026-11-19: a stair arriving at a balcony railing / half-wall needs an opening there too.
    it('opens a 1 m railing where the stair arrives, as tall as the railing', () => {
      const { d, e } = walled()
      const upper = d.buildings[0].floors.find((f) => f.level === 1)!
      upper.walls!.find((w) => w.id === 'n1')!.height = 1
      confirm(d, e)
      expect(openingsOn(d, 1)).toEqual([expect.objectContaining({ type: 'door', wallId: 'n1', height: 1, sillHeight: 0, frameless: true })])
    })

    it('keeps the wall intact until an explicit cutout is applied', () => {
      const { d, e } = walled()
      expect(openingsOn(d, 1)).toHaveLength(0)
      confirm(d, e)
      expect(openingsOn(d, 1)).toEqual([expect.objectContaining({
        type: 'door', wallId: 'n1', doorAppearance: 'open', height: 2.1, sillHeight: 0, frameless: true,
      })])
      expect(openingsOn(d, 1)[0].offset).toBeCloseTo(6.6, 1)
      expect(openingsOn(d, 1)[0].width).toBeCloseTo(2, 1)
      expect(openingsOn(d, 0)).toHaveLength(0)
      expect(e.history.undo()).toBe(true)
      expect(openingsOn(d, 1)).toHaveLength(0)
    })

    it('marks a confirmed cutout for review after moving the stair away and clears the flag on undo', () => {
      const { d, e } = walled()
      confirm(d, e)
      const saved = structuredClone(openingsOn(d, 1))
      e.run('feature.update', { featureId: 's', level: 0, patch: { position: { x: 0, y: 20 } } })
      expect(openingsOn(d, 1)).toEqual(saved)
      expect(detachedStairCutouts(d.buildings[0], stairOf(d))).toHaveLength(1)
      expect(e.history.undo()).toBe(true)
      expect(detachedStairCutouts(d.buildings[0], stairOf(d))).toHaveLength(0)
    })

    it('preserves an explicitly applied wall cutout when the stair stays on its floor or is deleted', () => {
      const { d, e } = walled()
      confirm(d, e)
      const saved = structuredClone(openingsOn(d, 1))
      e.run('stair.setToFloor', { featureId: 's', toLevel: 0 })
      expect(openingsOn(d, 1)).toEqual(saved)
      expect(e.run('feature.delete', { featureId: 's' }).success).toBe(true)
      expect(openingsOn(d, 1)).toEqual(saved)
    })

    it('a stair inside the building never cuts the outer wall', () => {
      const { d } = walled(9.5)
      expect(openingsOn(d, 1)).toHaveLength(0)
    })
  })
})

it('automatically connects an existing stair foot and selected side landing to their floor routes in one undo step', () => {
  const d = campus()
  const e = editor(d)
  const b = d.buildings[0]
  const route = (level: number, y: number) => ({
    nodes: [{ id: 'a' + level, type: 'waypoint', floor: level, position: { x: -4, y } },
      { id: 'z' + level, type: 'waypoint', floor: level, position: { x: 6, y } }],
    edges: [{ id: 'edge' + level, type: 'walk', from: 'a' + level, to: 'z' + level, distance: 10 }],
  })
  for (const f of b.floors.slice(0, 2)) {
    const y = f.level ? 2 : 0
    f.routeNetwork = route(f.level, y) as typeof f.routeNetwork
    f.walls = [{ id: 'far', start: { x: -6, y: 5 }, end: { x: 7, y: 5 }, height: 3, thickness: 0.2 }]
    f.hallways = [{ id: 'h', name: 'Corridor', width: 2, polyline: { points: [{ x: -4, y }, { x: 6, y }] } }] as typeof f.hallways
  }
  const design = { definitionId: 'stair', properties: { stepCount: 4, stepWidth: 2, stepDepth: 0.5, direction: 'east', preset: 'straight' } }
  expect(e.run('feature.create', { buildingId: 'b', floor: 0, id: 's', featureType: 'staircase', position: { x: 0, y: 0 }, rotation: 0, drawing: design }).success).toBe(true)
  const before = structuredClone(b.floors.slice(0, 2).map(f => f.routeNetwork))
  expect(e.run('stair.setToFloor', { featureId: 's', toLevel: 1, landingExit: 'left', autoConnect: true }).success).toBe(true)
  const s = stairOf(d)
  expect(s.levels[0].landingExit).toBe('left')
  expect(s.levels[0].routeConnection).toBeDefined()
  expect(s.levels[1].position).toEqual({ x: 2, y: 1 })
  expect(s.levels[1].routeConnection).toBeDefined()
  expect(e.history.undo()).toBe(true)
  expect(b.floors.slice(0, 2).map(f => f.routeNetwork)).toEqual(before)
})

it('keeps a requested side guarded when it misses the destination hallway', () => {
  const d = campus()
  const e = editor(d)
  const drawing = { definitionId: 'stair', properties: { stepCount: 4, stepWidth: 2, stepDepth: 0.5, direction: 'east', preset: 'straight' } }
  e.run('feature.create', { buildingId: 'b', floor: 0, id: 's', featureType: 'staircase', position: { x: 0, y: 0 }, rotation: 0, drawing })
  expect(e.run('stair.setToFloor', { featureId: 's', toLevel: 1, landingExit: 'right', autoConnect: true }).success).toBe(true)
  const stair = stairOf(d)
  expect(stair.levels[0].landingExit).toBe('right')
  expect(stair.levels[1].landingExit).toBeUndefined()
  expect(stair.levels[1].routeConnection).toBeUndefined()
  expect(d.buildings[0].floors[1].openings ?? []).toEqual([])
})

// A long rectangle already ends in a level mesh platform inside its footprint.
it('routes from the existing flat platform through the open end of a partial wall', () => {
  const d = campus()
  const b = d.buildings[0]
  const [lower, upper] = b.floors
  const flight = { position: { x: 0, y: 0 }, rotation: 0, confirmCutout: true, landingExit: 'left' as const,
    polygon: { points: [{ x: -6, y: 1.5 }, { x: -6, y: -1.5 }, { x: 6, y: -1.5 }, { x: 6, y: 1.5 }] } }
  b.staircases = [{ id: 's', name: 'Outdoor stair', buildingId: b.id, type: 'open', accessible: false,
    fromLevel: 0, toLevel: 1, levels: { 0: flight, 1: { role: 'top', rotation: 0,
      position: { x: 6, y: 0 }, landing: { position: { x: -40, y: 0 } } } } }]
  lower.walls = [{ id: 'lower-wall', start: { x: -9, y: 4 }, end: { x: 0, y: 4 }, height: 3, thickness: 0.15 }]
  upper.walls = [{ id: 'partial-wall', start: { x: 0, y: -1.5 }, end: { x: 4, y: -1.5 }, height: 3, thickness: 0.15 }]
  function route(level: number, x: number, y: number) {
    return { nodes: [
      { id: 'a', position: { x, y }, type: 'waypoint' as const, floor: level },
      { id: 'b', position: { x, y: y + 4 }, type: 'waypoint' as const, floor: level },
    ], edges: [{ id: 'walk', from: 'a', to: 'b', type: 'walk' as const, distance: 4 }] }
  }
  lower.routeNetwork = route(0, -6.5, -2)
  upper.routeNetwork = route(1, 5.5, -4)
  const run = editor(d)
  expect(run.run('stair.setToFloor', { featureId: 's', toLevel: 1, autoConnect: true }).success).toBe(true)
  const stair = stairOf(d)
  expect(stair.levels[0].routeConnection).toBeDefined()
  expect(stair.levels[0].landingExit).toBe('left')
  expect(stair.levels[1].routeConnection).toBeUndefined()
  expect(run.run('stair.setToFloor', { featureId: 's', toLevel: 1, landingExit: 'right', autoConnect: true }).success).toBe(true)
  expect(stair.levels[1]).toMatchObject({ landingExit: 'right', position: { x: 5.5, y: -1.5 } })
  expect(stair.levels[1].routeConnection).toBeDefined()
  expect(upper.openings ?? []).toEqual([])
  expect(run.history.undo()).toBe(true)
  expect(stairOf(d).levels[1].routeConnection).toBeUndefined()
})
