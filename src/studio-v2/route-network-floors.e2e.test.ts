// @vitest-environment node
// Outdoor → indoor → stairs → upper floors (2026-11-08). A three-floor building assembled with Studio's own commands
// (route points, entrance link, the floor editor's stair, room links), then compiled and read as NAVI Web reads it.
import { describe, expect, it } from 'vitest'
import { CampusCompiler } from '@navi/compiler'
import type { CampusDocument } from '@navi/core'
import {
  CommandDispatcher,
  CommandRegistry,
  entranceAccessAssignHandler,
  entranceCreateHandler,
  featureCreateHandler,
  roomAccessAssignHandler,
  routeEdgeCreateHandler,
  routeNodeCreateHandler,
  stairSetToFloorHandler,
  type Command,
} from '@navi/editor'
import { DocumentEventBus } from '@navi/editor/src/eventbus'
import { buildArtifactsBlob } from './server/artifacts-blob'
import { publicCampusPayload } from './server/public-campus-payload'
import { parsePublicCampus } from '@/store/public-store'
import { findNavRoute } from '@/lib/findRoute'
import type { CampusBundle } from '@/types/nav-types'

const LAT = 11.8172
const LNG = 122.1702
const METER_PER_DEG = 111320
/** Building-local metres → map position (the compiler's own conversion; the footprint is symmetric about LAT/LNG). */
const ll = (x: number, y: number) => ({ lat: LAT + y / METER_PER_DEG, lng: LNG + x / (METER_PER_DEG * Math.cos((LAT * Math.PI) / 180)) })

const floor = (id: string, level: number, label: string, rooms: Array<{ id: string; name: string; at: number }> = []) => ({
  id, level, label, shortLabel: label, elevation: level * 3.5, height: 3.5, visible: true, locked: false,
  hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], metadata: {},
  rooms: rooms.map((r) => ({ id: r.id, name: r.name, number: r.id.toUpperCase(), category: 'classroom', roomDoors: [], polygon: { points: [{ x: r.at - 3, y: 2 }, { x: r.at + 3, y: 2 }, { x: r.at + 3, y: 7 }, { x: r.at - 3, y: 7 }, { x: r.at - 3, y: 2 }] } })),
  roomAttributes: rooms.map((r) => ({ faceId: r.id, roomId: r.id, name: r.name })),
})

/** A 30 × 15 m building east of nothing, a road 10 m beyond its east wall; 1F, 2F, 3F. */
function campus(): CampusDocument {
  return {
    schemaVersion: 1, version: 1, connectivitySemanticsVersion: '1.0.0',
    metadata: { campusId: 'floors', name: 'Floors', description: '', lastModified: '', editorVersion: 'test' },
    buildings: [{
      id: 'cs', name: 'Computer Science', code: 'CS', category: 'academic', description: '', baseElevation: 0, height: 10.5,
      footprint: { points: [ll(-15, -7.5), ll(15, -7.5), ll(15, 7.5), ll(-15, 7.5)] },
      floors: [floor('f1', 0, '1F'), floor('f2', 1, '2F', [{ id: 'lab201', name: 'Lab 201', at: -8 }]), floor('f3', 2, '3F', [{ id: 'off301', name: 'Office 301', at: -8 }])],
      verticalConnectors: [], color: '#000', aliases: [], metadata: {},
    }],
    roads: [{ id: 'r1', name: 'East road', polyline: { points: [ll(25, -40), ll(25, 40)] }, width: 6, surface: 'paved', type: 'pedestrian', routing: { feature: 'normal' }, metadata: {} }],
    roadJunctions: [], separatedCrossings: [], panoramas: [], qrCheckpoints: [], areas: [],
  } as unknown as CampusDocument
}

function studio(document: CampusDocument) {
  const registry = new CommandRegistry()
  for (const h of [entranceCreateHandler, entranceAccessAssignHandler, featureCreateHandler, roomAccessAssignHandler, routeNodeCreateHandler, routeEdgeCreateHandler, stairSetToFloorHandler]) registry.register(h)
  const dispatcher = new CommandDispatcher(registry, document, new DocumentEventBus())
  return (command: Omit<Command, 'label'>) => {
    const result = dispatcher.execute({ label: command.id, ...command } as Command)
    if (!result.success) throw new Error(`${command.id}: ${result.error}`)
    return result
  }
}

/** Each floor's route: a line from the stair landing (x 0) west to its room door (x −8); 1F also east to the door (x 14.5). */
function authorRoutes(run: ReturnType<typeof studio>) {
  for (const [floorId, level] of [['f1', 0], ['f2', 1], ['f3', 2]] as const) {
    const node = (id: string, x: number, type = 'waypoint') => run({ id: 'route.node.create', payload: { buildingId: 'cs', floorId, node: { id, type, position: { x, y: 0 }, floor: level } } })
    node(`${floorId}-stair`, 0, 'transition')
    node(`${floorId}-west`, -8)
    run({ id: 'route.edge.create', payload: { buildingId: 'cs', floorId, edge: { from: `${floorId}-stair`, to: `${floorId}-west`, type: 'walk' } } })
    if (floorId === 'f1') {
      node('f1-door', 14.5, 'entrance')
      run({ id: 'route.edge.create', payload: { buildingId: 'cs', floorId, edge: { from: 'f1-door', to: 'f1-stair', type: 'walk' } } })
    }
  }
  // The east door on 1F, linked to the road (Studio's entrance link).
  run({ id: 'entrance.create', payload: { buildingId: 'cs', floorId: 'f1', id: 'e1', label: 'East door', position: { x: 15, y: 0 }, level: 0, type: 'main' } })
  run({ id: 'entrance.access.assign', payload: { buildingId: 'cs', floorId: 'f1', entranceId: 'e1', outdoorNodeId: 'x', indoorRouteNodeId: 'f1-door', outdoorRouteId: 'r1', outdoorPosition: ll(25, 0) } })
  // Each room linked to its floor's route (Studio's room link).
  run({ id: 'room.access.assign', payload: { buildingId: 'cs', floorId: 'f2', faceId: 'lab201', routeNodeId: 'f2-west' } })
  run({ id: 'room.access.assign', payload: { buildingId: 'cs', floorId: 'f3', faceId: 'off301', routeNodeId: 'f3-west' } })
}

/** The floor editor's stair (or lift) tool, once on each floor: each one connects to the one below as it is placed. */
function placeOnEachFloor(run: ReturnType<typeof studio>, featureType: 'staircase' | 'elevator') {
  // Each floor draws its own (a slightly different spot per floor, as real stairs are).
  for (const level of [0, 1, 2]) {
    run({ id: 'feature.create', payload: { buildingId: 'cs', floor: level, id: `${featureType}-${level}`, featureType, position: { x: level * 0.5, y: -2 }, rotation: 0, fromLevel: level, toLevel: level } })
  }
}

function visitor(doc: CampusDocument): { bundle: CampusBundle; errors: string[] } {
  const compiled = new CampusCompiler().compileV2(doc)
  if (!compiled.graph) return { bundle: null as never, errors: (compiled.errors ?? []).map((e) => `${e.code}: ${e.message}`) }
  const blob = buildArtifactsBlob({ ...(compiled.artifacts as unknown as Record<string, unknown>), navigationGraph: compiled.graph } as never, doc.metadata.campusId, 1, 1)
  const parsed = parsePublicCampus(publicCampusPayload(doc.metadata.campusId, blob as Record<string, unknown>), doc.metadata.campusId)!
  return { bundle: parsed.bundle, errors: (compiled.errors ?? []).map((e) => `${e.code}: ${e.message}`) }
}

/** From a point on the road to a room: the floors it passes and whether it climbs. */
function routeTo(bundle: CampusBundle, label: string) {
  const room = bundle.searchEntries.find((e) => e.label.startsWith(label) && e.nodeId)
  // A point on the road the route network reaches (road points carry the compiler's '__outdoor__' building).
  const road = bundle.nodes.find((n) => n.buildingId === '__outdoor__' && bundle.edges.some((e) => e.from === n.id || e.to === n.id))
  if (!room || !road) return { found: false as const, why: !room ? `no search entry for ${label}` : 'no road point' }
  const route = findNavRoute(bundle.nodes, bundle.edges, road.id, room.nodeId!)
  if (!route) return { found: false as const, why: 'no route' }
  return { found: true as const, floors: [...new Set(route.steps.map((s) => s.floor))], climbs: route.steps.filter((s) => s.type === 'stairs').length, metres: Math.round(route.totalDistance) }
}

describe('outdoor → indoor → stairs → upper floors', () => {
  it('stairs placed on 1F, 2F and 3F connect as placed: road → door → 1F → stairs → 2F → 3F → Office 301', () => {
    const doc = campus()
    const run = studio(doc)
    authorRoutes(run)
    placeOnEachFloor(run, 'staircase')
    const stairs = doc.buildings[0].staircases ?? []
    expect(stairs.map((s) => s.links)).toEqual([{ above: 'staircase-1' }, { below: 'staircase-0', above: 'staircase-2' }, { below: 'staircase-1' }])
    const { bundle, errors } = visitor(doc)
    expect(errors).toEqual([])
    expect(routeTo(bundle, 'Lab 201')).toMatchObject({ found: true, floors: [0, 1] })
    const office = routeTo(bundle, 'Office 301')
    expect(office).toMatchObject({ found: true, floors: [0, 1, 2] })
    if (office.found) expect(office.climbs).toBeGreaterThanOrEqual(1)
  })

  it('the same with lifts', () => {
    const doc = campus()
    const run = studio(doc)
    authorRoutes(run)
    placeOnEachFloor(run, 'elevator')
    const { bundle, errors } = visitor(doc)
    expect(errors).toEqual([])
    const room = bundle.searchEntries.find((e) => e.label.startsWith('Office 301') && e.nodeId)!
    const road = bundle.nodes.find((n) => n.buildingId === '__outdoor__' && bundle.edges.some((e) => e.from === n.id || e.to === n.id))!
    const route = findNavRoute(bundle.nodes, bundle.edges, road.id, room.nodeId!)
    expect(route).not.toBeNull()
    expect(route!.steps.some((s) => s.type === 'elevator')).toBe(true)
  })

  it('a stair on 1F alone connects nothing: upper floors are unreachable (Validate warns about it)', () => {
    const doc = campus()
    const run = studio(doc)
    authorRoutes(run)
    run({ id: 'feature.create', payload: { buildingId: 'cs', floor: 0, id: 'lonely', featureType: 'staircase', position: { x: 0, y: -2 }, rotation: 0, fromLevel: 0, toLevel: 0 } })
    expect(doc.buildings[0].staircases?.[0].links).toBeUndefined()
    expect(visitor(doc).errors.some((e) => e.startsWith('HALLWAY_DISCONNECTED'))).toBe(true)
  })

  // 2026-11-16 (ComDev stair tower): an outside U-stair drawn on 1F that climbs To 2F; its foot is an entrance linked
  // to the road, its top lands on 2F's route. Road → stair foot → climb → 2F → Lab 201, without the building's door.
  it('an outside stair from 1F To 2F: road → stair foot → climbs → 2F → Lab 201', () => {
    const doc = campus()
    const run = studio(doc)
    const node = (floorId: string, level: number, id: string, x: number, y: number, type = 'waypoint') =>
      run({ id: 'route.node.create', payload: { buildingId: 'cs', floorId, node: { id, type, position: { x, y }, floor: level } } })
    const drawing = { definitionId: 'stair', properties: { stepCount: 20, stepWidth: 1.2, stepDepth: 0.3, direction: 'east', preset: 'ushape', sides: 'wall' } }
    run({ id: 'feature.create', payload: { buildingId: 'cs', floor: 0, id: 'tower', featureType: 'staircase', position: { x: 18, y: 0 }, rotation: 0, drawing } })
    run({ id: 'stair.setToFloor', payload: { featureId: 'tower', toLevel: 1 } })
    const top = doc.buildings[0].staircases![0].levels[1]
    expect(top.role).toBe('top')
    // 1F: the stair foot, an entrance linked to the road.
    node('f1', 0, 'foot', 18, 0, 'entrance')
    node('f1', 0, 'foot-stair', 18, 0.5, 'transition')
    run({ id: 'route.edge.create', payload: { buildingId: 'cs', floorId: 'f1', edge: { from: 'foot', to: 'foot-stair', type: 'walk' } } })
    run({ id: 'entrance.create', payload: { buildingId: 'cs', floorId: 'f1', id: 'e-foot', label: 'Stair foot', position: { x: 18, y: 0 }, level: 0, type: 'main' } })
    run({ id: 'entrance.access.assign', payload: { buildingId: 'cs', floorId: 'f1', entranceId: 'e-foot', outdoorNodeId: 'x', indoorRouteNodeId: 'foot', outdoorPosition: ll(25, 0), outdoorRouteId: 'r1' } })
    // 2F: from the top landing along the corridor to Lab 201.
    node('f2', 1, 'f2-top', top.position.x, top.position.y, 'transition')
    node('f2', 1, 'f2-west', -8, 0)
    run({ id: 'route.edge.create', payload: { buildingId: 'cs', floorId: 'f2', edge: { from: 'f2-top', to: 'f2-west', type: 'walk' } } })
    run({ id: 'room.access.assign', payload: { buildingId: 'cs', floorId: 'f2', faceId: 'lab201', routeNodeId: 'f2-west' } })
    const { bundle } = visitor(doc)
    const lab = routeTo(bundle, 'Lab 201')
    expect(lab).toMatchObject({ found: true, floors: [0, 1] })
    if (lab.found) expect(lab.climbs).toBeGreaterThanOrEqual(1)
  })
})


it('finds a Floor 3 room and routes to it using two authored stair flights and floor routes', () => {
  const doc = campus()
  const run = studio(doc)
  authorRoutes(run)
  const building = doc.buildings[0]
  for (const floor of building.floors) {
    floor.walls = [{ id: `far-${floor.id}`, start: { x: -15, y: 7 }, end: { x: 15, y: 7 }, height: 3.5, thickness: 0.2 }]
    if (floor.level === 0) continue
    for (const y of [-2, 2]) {
      run({ id: 'route.node.create', payload: { buildingId: 'cs', floorId: floor.id, node: {
        id: `${floor.id}-landing-${y}`, floor: floor.level, type: 'waypoint', position: { x: 3, y },
      } } })
    }
    for (const [from, to] of [[`${floor.id}-landing--2`, `${floor.id}-landing-2`], [`${floor.id}-landing-2`, `${floor.id}-stair`]]) {
      run({ id: 'route.edge.create', payload: { buildingId: 'cs', floorId: floor.id, edge: { from, to, type: 'walk' } } })
    }
  }
  const drawing = { definitionId: 'stair', properties: { stepCount: 4, stepWidth: 2, stepDepth: 0.5, direction: 'east', preset: 'straight' } }
  for (const level of [0, 1]) {
    const featureId = `flight-${level}`
    run({ id: 'feature.create', payload: { buildingId: 'cs', floor: level, id: featureId, featureType: 'staircase',
      position: { x: 0, y: 0 }, rotation: 0, drawing } })
    run({ id: 'stair.setToFloor', payload: { featureId, toLevel: level + 1, autoConnect: true, landingExit: 'front' } })
    const stair = building.staircases!.find(item => item.id === featureId)!
    expect(stair.levels[level].routeConnection).toBeDefined()
    expect(stair.levels[level + 1].routeConnection).toBeDefined()
    expect(stair.links).toBeUndefined()
  }
  const { bundle, errors } = visitor(doc)
  expect(errors).toEqual([])
  expect(routeTo(bundle, 'Office 301')).toMatchObject({ found: true, floors: [0, 1, 2] })
})

it('keeps the indoor-only QR marker without emitting an outdoor entrance', () => {
  const doc = campus()
  const run = studio(doc)
  authorRoutes(run)
  placeOnEachFloor(run, 'staircase')
  const before = visitor(doc).bundle.buildings.find(building => building.id === 'cs')?.entrances?.length ?? 0
  expect(before).toBeGreaterThan(0)
  doc.buildings[0].floors[1].entrances.push({
    id: 'qr-inside', label: 'QR check-in', level: 1, type: 'side', hasQR: true, hasPanorama: false,
    position: { x: 0, y: 0 }, routeNodeId: 'f2-stair', indoorOnly: true,
  })
  const { bundle, errors } = visitor(doc)
  expect(errors).toEqual([])
  expect(bundle.buildings.find(building => building.id === 'cs')!.entrances).toHaveLength(before)
  expect(bundle.components?.find(component => component.id === 'qr-inside')).toMatchObject({
    floor: 1, metadata: { hasQR: true, indoorOnly: true },
  })
  expect(routeTo(bundle, 'Lab 201')).toMatchObject({ found: true })
})

it('publishes the chosen platform edge finish with its doorway and floor', () => {
  const doc = campus()
  const run = studio(doc)
  authorRoutes(run)
  placeOnEachFloor(run, 'staircase')
  const floor = doc.buildings[0].floors[1]
  floor.walls = [{ id: 'platform', start: { x: 0, y: 2 }, end: { x: 8, y: 2 }, thickness: 0.2, height: 3.5, guardStyle: 'half-wall' }]
  floor.openings = [{ id: 'hallway', type: 'door', wallId: 'platform', offset: 2, width: 1.5, height: 2.1, frameless: true, doorAppearance: 'open' }]
  const { bundle, errors } = visitor(doc)
  expect(errors).toEqual([])
  expect(bundle.floorGeometry?.buildings[0].floors.find(f => f.level === 1)).toMatchObject({
    walls: [{ id: 'platform', guardStyle: 'half-wall' }],
    openings: [{ id: 'hallway', wallId: 'platform', offset: 2, frameless: true }],
  })
})
