import { expect, it } from 'vitest'
import { resizeRectangleFootprint, type CampusDocument, type Floor, type Staircase } from '@navi/core'
import { CommandDispatcher } from '../dispatcher'
import { CommandRegistry } from '../registry'
import { featureCreateHandler, featureDeleteHandler, featureUpdateHandler } from '../feature-handlers'
import { stairSetShapeHandler, stairSetToFloorHandler } from '../stair-to-floor-handler'
import { resolveLevelGeometry } from '../../geometry/resolve-level-geometry'
import { DocumentEventBus } from '../../eventbus'
import { HistoryStack } from '../../history'
import { DocumentStore } from '../../context/document-store'

// Owner 2026-11-19: dragging a U-Shape stair's corner in 2D moved only that point and the stair snapped back. It must
// resize like a straight stair — the box follows the drag and both flights fill it, keeping the U shape.
const box = [{ x: 3.4, y: -9 }, { x: 2, y: -9 }, { x: 2, y: -1 }, { x: 3.4, y: -1 }]

function campus(): CampusDocument {
  const floors = [0, 1].map((level) => ({
    id: `f${level}`, level, label: `Floor ${level + 1}`, elevation: level * 3.5, height: 3.5, metadata: {},
    rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], openings: [], walls: [],
    routeNetwork: { nodes: [], edges: [] },
  })) as unknown as Floor[]
  const stair = { id: 's', buildingId: 'b', name: 'Stair', type: 'open', accessible: false, fromLevel: 0, toLevel: 0,
    levels: { 0: { position: { x: 2.7, y: -5 }, rotation: 0, polygon: { points: box } } } } as unknown as Staircase
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
const outline = (d: CampusDocument) => resolveLevelGeometry(stairOf(d), 0).polygon!.points.slice(0, 4)
const side = (r: ReadonlyArray<{ x: number; y: number }>, i: number) => Math.hypot(r[(i + 1) % 4].x - r[i].x, r[(i + 1) % 4].y - r[i].y)
const centre = (r: ReadonlyArray<{ x: number; y: number }>) => ({ x: r.reduce((s, p) => s + p.x, 0) / 4, y: r.reduce((s, p) => s + p.y, 0) / 4 })

/** What the 2D editor sends after dragging corner `corner` of the stair's outline to `to` (as FloorEditorCanvas does). */
function drag(d: CampusDocument, corner: number, to: { x: number; y: number }) {
  const points = resizeRectangleFootprint(outline(d), corner, to)!
  return { featureId: 's', level: 0, patch: { position: centre(points), rotation: stairOf(d).levels[0].rotation, polygon: { points } } }
}

function uStair() {
  const d = campus()
  const e = editor(d)
  expect(e.run('stair.setToFloor', { featureId: 's', toLevel: 1, autoConnect: false }).success).toBe(true)
  expect(e.run('stair.setShape', { featureId: 's', shape: 'ushape' }).success).toBe(true)
  return { d, e }
}

it('dragging a corner of a U-Shape stair resizes the whole box, keeping its shape', () => {
  const { d, e } = uStair()
  const before = outline(d)
  // Pull the far corner 0.6 m further out along both sides of the box.
  const far = before.reduce((best, p) => (p.x + p.y > best.x + best.y ? p : best))
  const index = before.indexOf(far)
  const result = e.run('feature.update', drag(d, index, { x: far.x + 0.6, y: far.y + 0.6 }))
  expect(result.success).toBe(true)
  const after = outline(d)
  // Still a rectangle (four right angles), bigger on both sides, the opposite corner where it was.
  for (let i = 0; i < 4; i++) {
    const a = after[i], b = after[(i + 1) % 4], c = after[(i + 2) % 4]
    expect((b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)).toBeCloseTo(0, 6)
  }
  expect(side(after, 0) + side(after, 1)).toBeGreaterThan(side(before, 0) + side(before, 1) + 1)
  const opposite = before[(index + 2) % 4]
  expect(after.some((p) => Math.hypot(p.x - opposite.x, p.y - opposite.y) < 1e-6)).toBe(true)
  const props = stairOf(d).levels[0].drawing!.properties
  expect(props.preset).toBe('ushape')
  expect(props.stepWidth).toBeGreaterThan(0.6)
  // The drawn box follows too, so Straight brings back the box as dragged.
  expect(e.run('stair.setShape', { featureId: 's', shape: 'straight' }).success).toBe(true)
  const back = stairOf(d).levels[0].polygon!.points
  expect(side(back, 0) * side(back, 1)).toBeCloseTo(side(after, 0) * side(after, 1), 6)
})

it('one undo step brings the U-Shape stair back to its size', () => {
  const { d, e } = uStair()
  const before = outline(d)
  const props = { ...stairOf(d).levels[0].drawing!.properties }
  e.run('feature.update', drag(d, 2, { x: before[2].x + 0.5, y: before[2].y + 0.5 }))
  expect(e.history.undo()).toBe(true)
  expect(stairOf(d).levels[0].drawing!.properties).toEqual(props)
  outline(d).forEach((p, i) => { expect(p.x).toBeCloseTo(before[i].x, 6); expect(p.y).toBeCloseTo(before[i].y, 6) })
})

it('refuses a drag that leaves no room for two flights, saying so', () => {
  const { d, e } = uStair()
  const before = outline(d)
  const props = { ...stairOf(d).levels[0].drawing!.properties }
  // Squeeze the box to 0.9 m wide (two 0.5 m flights and the 0.2 m gap need 1.2 m).
  const widthEdge = Math.abs(side(before, 0) - 1.4) < Math.abs(side(before, 1) - 1.4) ? 0 : 1
  const a = before[widthEdge + 1], b = before[widthEdge]
  const pulled = { x: b.x + (a.x - b.x) * (0.9 / 1.4), y: b.y + (a.y - b.y) * (0.9 / 1.4) }
  const result = e.run('feature.update', drag(d, widthEdge + 1, pulled))
  expect(result.success).toBe(false)
  expect(result.error).toMatch(/1\.2 m/)
  expect(stairOf(d).levels[0].drawing!.properties).toEqual(props)
})

it('moving a U-Shape stair (no resize) keeps its size', () => {
  const { d, e } = uStair()
  const before = outline(d)
  const props = { ...stairOf(d).levels[0].drawing!.properties }
  const points = before.map((p) => ({ x: p.x + 2, y: p.y - 1 }))
  expect(e.run('feature.update', { featureId: 's', level: 0, patch: { position: centre(points), rotation: stairOf(d).levels[0].rotation, polygon: { points } } }).success).toBe(true)
  expect(stairOf(d).levels[0].drawing!.properties.stepWidth).toBeCloseTo(props.stepWidth as number, 6)
  expect(stairOf(d).levels[0].drawing!.properties.stepDepth).toBeCloseTo(props.stepDepth as number, 6)
  outline(d).forEach((p, i) => { expect(p.x).toBeCloseTo(before[i].x + 2, 6); expect(p.y).toBeCloseTo(before[i].y - 1, 6) })
})
