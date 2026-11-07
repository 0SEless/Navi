import { describe, expect, it } from 'vitest'
import { suggestStairConnection, toLatLng, type CampusDocument, type TerrainGrid } from '@navi/core'
import { CommandDispatcher } from '../dispatcher'
import { CommandRegistry } from '../registry'
import { roadCreateHandler, roadDeleteHandler } from '../road-handlers'
import { entranceAccessAssignHandler, entranceAccessUnassignHandler } from '../route-access-handlers'
import { structureHandlers } from '../structure-handlers'
import { DocumentEventBus } from '../../eventbus'
import { HistoryStack } from '../../history'
import { DocumentStore } from '../../context/document-store'
import { stairConnectCommands, stairDisconnectCommands, STAIR_ROUTE_ID_PREFIX } from '../stair-route'

const grid: TerrainGrid = { originLat: 11.8, originLng: 122.1 }
const ll = (x: number, y: number) => toLatLng(grid, { x, y })
const toWorld = (_b: string, _l: number, p: { x: number; y: number }) => ll(p.x, p.y)

/** The Computer Science case: lower road r1, a stair up the hall's east side to the 2F entrance e2. */
export function stairCampus(opts: { form?: 'stairs' | 'ramp'; linkedTo?: string; bottomOnGround?: boolean } = {}): CampusDocument {
  const f2 = {
    id: 'f2', level: 1, label: '2F', elevation: 3, height: 3, rooms: [], hallways: [], staircases: [], elevators: [], connectorStops: [], parametricComponents: [], metadata: {},
    entrances: [{ id: 'e2', label: 'East door', position: { x: 19.5, y: 5 }, level: 1, type: 'main', hasQR: false, hasPanorama: false }],
    routeNetwork: { nodes: [{ id: 'n2', type: 'junction', position: { x: 18, y: 5 }, floor: 1 }], edges: [] },
    ...(opts.linkedTo ? { entranceAccess: [{ entranceId: 'e2', outdoorNodeId: 'N-entrance-access-e2', indoorRouteNodeId: 'n2', outdoorRouteId: opts.linkedTo, outdoorPosition: ll(30, 40) }] } : {}),
  }
  return {
    schemaVersion: 1, version: 1, metadata: { campusId: 'c', name: 'C', description: '', lastModified: '', editorVersion: 'test' },
    panoramas: [], qrCheckpoints: [], areas: [], roadJunctions: [], separatedCrossings: [],
    terrain: { reference: { name: 'Flat', zeroMeaning: 'z' }, grid, colorRange: { minM: 0, maxM: 10 } },
    boundary: { points: [ll(-50, -50), ll(100, -50), ll(100, 60), ll(-50, 60)] },
    buildings: [{
      id: 'hall', name: 'Hall', code: 'H', category: 'academic', description: '', baseElevation: 0, height: 6,
      footprint: { points: [ll(0, 0), ll(20, 0), ll(20, 10), ll(0, 10), ll(0, 0)] },
      floors: [{ ...f2, id: 'f1', level: 0, label: '1F', elevation: 0, entrances: [], routeNetwork: undefined, entranceAccess: undefined }, f2],
      verticalConnectors: [], color: '#000', aliases: [], metadata: {},
    }],
    roads: [
      { id: 'r1', name: 'Lower road', polyline: { points: [ll(40, -20), ll(40, 30)] }, width: 4, surface: 'paved', type: 'pedestrian', metadata: {} },
      { id: 'r2', name: 'Upper road', polyline: { points: [ll(-20, 40), ll(60, 40)] }, width: 4, surface: 'paved', type: 'pedestrian', metadata: {} },
    ],
    structures: [{
      id: 's1', form: opts.form ?? 'stairs', presetId: 'p', width: 2, underneath: 'open', railings: 'both',
      start: { kind: 'slab', buildingId: 'hall', floorId: 'f2', edgeIndex: 1, edgeT: 0.5 },
      end: opts.bottomOnGround ? { kind: 'ground', position: ll(40.8, 5) } : { kind: 'road', roadId: 'r1', position: ll(40.8, 5) },
    }],
  } as unknown as CampusDocument
}

export function stairEditor(document: CampusDocument) {
  const eventBus = new DocumentEventBus()
  const documentStore = new DocumentStore(document, eventBus)
  const registry = new CommandRegistry()
  for (const h of [roadCreateHandler, roadDeleteHandler, entranceAccessAssignHandler, entranceAccessUnassignHandler, ...structureHandlers]) registry.register(h)
  const dispatcher = new CommandDispatcher(registry, document, eventBus)
  const history = new HistoryStack(dispatcher, document, registry, 20, documentStore)
  dispatcher.addPreHook(history)
  dispatcher.addPostHook(history)
  return { dispatcher, history }
}

const connect = (document: CampusDocument) => {
  const suggestion = suggestStairConnection(document, 's1', { toWorld })!
  const commands = stairConnectCommands(document, suggestion)
  if (!Array.isArray(commands)) throw new Error(commands.error)
  return commands
}

describe('Connect to route', () => {
  it('connect writes a stairs path joined to the road and linked to the entrance', () => {
    const document = stairCampus()
    const { dispatcher } = stairEditor(document)
    expect(dispatcher.executeBatch(connect(document)).success).toBe(true)
    const path = document.roads.find((r) => r.id === `${STAIR_ROUTE_ID_PREFIX}s1`)!
    expect(path.routing).toEqual({ feature: 'stairs', structureId: 's1' })
    expect(path.heightMode).toBe('follow-surface')
    expect(path.width).toBe(2)
    expect(document.roadJunctions?.some((j) => j.roadIds.includes(path.id) && j.roadIds.includes('r1'))).toBe(true)
    const access = document.buildings[0].floors[1].entranceAccess!
    expect(access).toHaveLength(1)
    expect(access[0]).toMatchObject({ entranceId: 'e2', indoorRouteNodeId: 'n2', outdoorRouteId: path.id })
    expect(access[0].outdoorPosition).toEqual(path.polyline.points[path.polyline.points.length - 1])
  })

  it('connect then undo restores the document exactly (one history entry)', () => {
    const document = stairCampus()
    const before = structuredClone(document)
    const { dispatcher, history } = stairEditor(document)
    dispatcher.executeBatch(connect(document))
    const after = structuredClone(document)
    expect(history.undo()).toBe(true)
    expect(document.roads).toEqual(before.roads)
    expect(document.roadJunctions).toEqual(before.roadJunctions)
    expect(document.buildings).toEqual(before.buildings)
    expect(history.redo()).toBe(true)
    expect(document.roads).toEqual(after.roads)
    expect(document.buildings).toEqual(after.buildings)
  })

  it('disconnect removes what connect wrote and restores the previous entrance link', () => {
    const document = stairCampus({ linkedTo: 'r2' })
    const before = structuredClone(document.buildings[0].floors[1].entranceAccess)
    const { dispatcher } = stairEditor(document)
    dispatcher.executeBatch(connect(document))
    expect(document.buildings[0].floors[1].entranceAccess![0].outdoorRouteId).toBe(`${STAIR_ROUTE_ID_PREFIX}s1`)
    expect(dispatcher.executeBatch(stairDisconnectCommands(document, 's1')).success).toBe(true)
    expect(document.roads.some((r) => r.routing?.structureId === 's1')).toBe(false)
    expect(document.roadJunctions?.some((j) => j.roadIds.includes(`${STAIR_ROUTE_ID_PREFIX}s1`))).toBe(false)
    expect(document.buildings[0].floors[1].entranceAccess).toEqual(before)
  })

  it('a ramp gets routing.feature ramp', () => {
    const document = stairCampus({ form: 'ramp' })
    const { dispatcher } = stairEditor(document)
    dispatcher.executeBatch(connect(document))
    expect(document.roads.find((r) => r.routing?.structureId === 's1')?.routing?.feature).toBe('ramp')
  })

  it('connect refuses without a bottom route', () => {
    const document = stairCampus({ bottomOnGround: true })
    const suggestion = suggestStairConnection(document, 's1', { toWorld })!
    expect(stairConnectCommands(document, suggestion)).toEqual({ error: 'Pick the route at the bottom of the stair.' })
  })
})
