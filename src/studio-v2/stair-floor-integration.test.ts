// @vitest-environment node
import { expect, it } from 'vitest'
import { CoordinateTransformer, stairTopShape, type CampusDocument, type Floor, type Wall } from '@navi/core'
import { entranceAccessAssignHandler, featureUpdateHandler, roomAccessAssignHandler, stairSetToFloorHandler } from '@navi/editor'
import { entranceOutdoorConnectHandler } from '@navi/editor/src/commands/floor-route-workflow'
import { proposeStairCutout } from '@navi/editor/src/commands/stair-to-floor-handler'
import { booleanPointInPolygon, point } from '@turf/turf'
import { buildFloorArchitecturePreview } from '@/components/floor-editor/floor-architecture-preview'
import { wholeBuildingPieces } from '@/components/floor-editor/whole-building'
import { buildFromCampusBundle } from '@/components/map/NavigationRenderModel'
import { floorArchitectureFeatures, selectFloorArchitecture } from '@/components/map/layers/FloorArchitectureLayer'
import { findNavRoute } from '@/lib/findRoute'
import { parsePublicCampus } from '@/store/public-store'
import { joinParts } from './parts/join'
import { splitDocument } from './parts/split'
import { createPublishHandlers } from './server/publish-handlers'
import { publicCampusPayload } from './server/public-campus-payload'
import type { StudioRepo } from './server/studio-repo'

const deck = (x0: number, y0: number, x1: number, y1: number) =>
  [{ x: x0, y: y1 }, { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }]
const world = (x: number, y: number) => ({ lat: 11.818 + y / 111320, lng: 122.17 + x / (111320 * Math.cos(11.818 * Math.PI / 180)) })
const wall = (id: string, start: Wall['start'], end: Wall['end']): Wall => ({ id, start, end, height: 2.7, thickness: 0.15 })

function fixture(outdoor: boolean): CampusDocument {
  const floor = (level: number, positions: Array<[number, number]>, links: Array<[number, number]>): Floor => ({
    id: `f${level}`, level, label: `Floor ${level + 1}`, elevation: level * 3.5, height: 3.5, metadata: {},
    walls: deck(-8, -5, 8, 5).map((a, i, ring) => wall(`wall-${level}-${i}`, a, ring[(i + 1) % ring.length])),
    rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [],
    routeNetwork: {
      nodes: positions.map(([x, y], i) => ({ id: `node-${level}-${i}`, position: { x, y }, type: 'waypoint', floor: level })),
      edges: links.map(([a, b], i) => ({ id: `walk-${level}-${i}`, from: `node-${level}-${a}`, to: `node-${level}-${b}`,
        type: 'walk', distance: Math.hypot(positions[a][0] - positions[b][0], positions[a][1] - positions[b][1]) })),
    },
  })
  const lower = floor(1, [[-5.5, -3], [-5.5, 2]], [[0, 1]])
  const upper = floor(2, [[4, -3.5], [4, -0.65], [-4, -3.5]], [[0, 1], [0, 2]])
  if (outdoor) {
    lower.walls = [wall('lower-wall', { x: -8, y: -1 }, { x: 8, y: -1 })]
    upper.walls = [
      wall('landing-wall', { x: -8, y: -1 }, { x: 8, y: -1 }),
      wall('rear', { x: -8, y: -5 }, { x: 8, y: -5 }),
    ]
  }
  return {
    schemaVersion: 1, version: 0, metadata: { campusId: 'stage1', name: 'Stair QA', description: '', lastModified: '', editorVersion: 'test' },
    buildings: [{ id: 'b', name: 'Stair building', code: 'QA', category: 'academic', description: '',
      baseElevation: 0, height: 10.5, footprint: { points: deck(-8, -5, 8, 5).map(({ x, y }) => world(x, y)) },
      floors: [lower, upper], verticalConnectors: [], color: '#536a60', aliases: [], metadata: {},
      staircases: [{ id: 's', buildingId: 'b', name: 'Straight stair', type: 'open', accessible: false, fromLevel: 1, toLevel: 1,
        levels: { 1: { position: { x: 0, y: 0 }, rotation: 0, polygon: { points: deck(-5, -1, 5, 1) }, look: { underneath: 'open' } } } }],
    }],
    roads: [{ id: 'road', name: 'Approach', polyline: { points: outdoor ? [world(-9, 3), world(-3, 3)] : [world(-10, -5), world(-10, -1)] },
      width: 2, surface: 'paved', type: 'pedestrian', routing: { feature: 'normal' }, metadata: {} }],
    panoramas: [], qrCheckpoints: [], areas: [],
  }
}

function connectAndReload(outdoor: boolean) {
  const doc = fixture(outdoor)
  const building = doc.buildings[0]
  const [lower, upper] = building.floors
  const stair = building.staircases![0]
  expect(stairSetToFloorHandler.execute(doc, { featureId: stair.id, toLevel: 2, landingExit: 'right', autoConnect: true }).success).toBe(true)
  if (outdoor) {
    expect(upper.openings ?? []).toHaveLength(0)
    const proposal = proposeStairCutout(building, stair)!
    expect(proposal.wallId).toBe('landing-wall')
    expect(stairSetToFloorHandler.execute(doc, { featureId: stair.id, toLevel: 2, autoConnect: true,
      cutout: { wallId: proposal.wallId, offset: proposal.anchorOffset - 0.5, width: 1 },
    }).success).toBe(true)
    expect(entranceOutdoorConnectHandler.execute(doc, { buildingId: 'b', floorId: lower.id, stairId: stair.id, entranceId: 'stair-foot-s',
      outdoorNodeId: 'outside', outdoorRouteId: 'road', outdoorPosition: world(-5.5, 3) }).success).toBe(true)
  } else {
    lower.openings = [{ id: 'lower-aperture', type: 'door', wallId: 'wall-1-0', offset: 7.5, width: 1, height: 2.1, sillHeight: 0, frameless: true, doorAppearance: 'open' }]
    lower.entrances = [{ id: 'entry', label: 'Lower entrance', position: { x: -8, y: -3 }, level: 1,
      type: 'main', hasQR: false, hasPanorama: false, routeNodeId: 'entrance-node' }]
    lower.routeNetwork!.nodes.push({ id: 'entrance-node', type: 'entrance', floor: 1, position: { x: -8, y: -3 } })
    lower.routeNetwork!.edges.push({ id: 'from-entry', from: 'entrance-node', to: 'node-1-0', type: 'walk', distance: 2.5 })
    expect(entranceAccessAssignHandler.execute(doc, { buildingId: 'b', floorId: lower.id, entranceId: 'entry',
      outdoorNodeId: 'outside', indoorRouteNodeId: 'entrance-node', outdoorRouteId: 'road', outdoorPosition: world(-10, -3) }).success).toBe(true)
  }
  upper.rooms.push({ id: 'room', name: 'Audit 301', number: '301', category: 'classroom', polygon: { points: deck(-7, -4.8, -2, -2) }, roomDoors: [], metadata: {} })
  upper.roomAttributes = [{ faceId: 'room', roomId: 'room', name: 'Audit 301', searchable: true }]
  expect(roomAccessAssignHandler.execute(doc, { buildingId: 'b', floorId: upper.id, faceId: 'room', routeNodeId: 'node-2-2' }).success).toBe(true)
  const reloaded = joinParts(JSON.parse(JSON.stringify(splitDocument(doc).parts)))
  expect(reloaded.buildings[0].staircases).toEqual([stair])
  expect(reloaded.buildings[0].floors.map(f => [f.id, f.elevation, f.routeNetwork, f.openings, f.entranceAccess]))
    .toEqual(building.floors.map(f => [f.id, f.elevation, f.routeNetwork, f.openings, f.entranceAccess]))
  expect(stair.levels[1].routeConnection).toBeDefined()
  expect(stair.levels[2].routeConnection).toBeDefined()
  expect(reloaded.buildings[0].floors[1].entrances).toHaveLength(0)
  return reloaded
}

async function publishAndRoute(doc: CampusDocument, outdoor: boolean) {
  const campusId = doc.metadata.campusId
  const parts = splitDocument(doc).parts.map(part => ({ ...part, partKey: part.key, versionNo: 1, checksum: '0'.repeat(64), contentBase64: part.contentBase64 ?? null }))
  let publication: Record<string, unknown> | undefined
  const repo: Pick<StudioRepo, 'roleOf' | 'partsAtCommit' | 'recordPublication'> = {
    roleOf: async () => 'owner',
    partsAtCommit: async () => ({ status: 'ok', commitNo: 9, parts }),
    recordPublication: async (_campus: string, _commit: number, artifacts: Record<string, unknown>) => {
      publication = artifacts
      return { status: 'ok', publicationNo: 1 }
    },
  }
  const handlers = createPublishHandlers({ repo: repo as StudioRepo, verifyPrincipal: async () => ({
    ok: true, principal: { id: 'test', email: 'test@example.invalid', role: 'campus_admin', method: 'supabase' },
  }) })
  const response = await handlers.publish(new Request('http://localhost/api/studio/v2/publish', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ campusId, commitNo: 9 }),
  }))
  expect(response.status, await response.text()).toBe(200)
  expect(publication).toBeDefined()
  const { bundle } = parsePublicCampus(publicCampusPayload(campusId, publication!), campusId)!
  const room = bundle.searchEntries.find(entry => entry.nodeId && entry.label.startsWith('Audit 301'))!
  const source = outdoor
    ? bundle.nodes.find(node => node.buildingId === '__outdoor__' && bundle.edges.some(edge => edge.from === node.id || edge.to === node.id))
    : bundle.nodes.filter(node => node.buildingId === 'b' && node.floor === 1).sort((a, b) => {
      const near = world(-5.5, -3)
      const distance = (p: typeof a.position) => Math.hypot(p.lat - near.lat, p.lng - near.lng)
      return distance(a.position) - distance(b.position)
    })[0]
  expect(source).toBeDefined()
  expect(room).toBeDefined()
  const route = findNavRoute(bundle.nodes, bundle.edges, source!.id, room.nodeId!)!
  expect(route).toBeTruthy()
  expect([...new Set(route.steps.map(step => step.floor))]).toEqual(outdoor ? [0, 1, 2] : [1, 2])
  expect(bundle.edges.filter(edge => edge.type === 'stairs')).toHaveLength(1)
  expect(route.steps.some(step => bundle.edges.some(edge => edge.id === step.edgeId && edge.type === 'stairs'))).toBe(true)
  return bundle
}

function transformer() {
  const result = new CoordinateTransformer()
  result.registerBuilding({ buildingId: 'b', origin: world(0, 0), rotation: 0 })
  return result
}

it('publishes road-to-room routing through the compact outdoor stair and a narrow confirmed opening', async () => {
  const doc = connectAndReload(true)
  const building = doc.buildings[0], upper = building.floors[1], stair = building.staircases![0]
  expect(upper.openings).toEqual([expect.objectContaining({ width: 1, frameless: true, wallId: 'landing-wall' })])
  expect(stair.levels[2]).toMatchObject({ landingExit: 'right', landingExitSpan: [0.25, 0.75], position: { x: 4, y: -1 } })
  const shape = stairTopShape({ ...stair.levels[1], id: stair.id, height: 3.5, fromLevel: 1 })!
  expect(shape.integrated).toBe(true)
  expect(shape.landing.every(([x, y]) => x <= 5 && Math.abs(y) <= 1)).toBe(true)
  const view = buildFloorArchitecturePreview(upper, building.id, transformer(), building.staircases, building.floors)
  const stairs = view.stairs.features
  expect(stairs.some(feature => feature.properties?.partType === 'top-landing')).toBe(false)
  expect(stairs.some(feature => String(feature.id).startsWith('s:top-guard:1:0'))).toBe(true)
  expect(stairs.some(feature => String(feature.id).startsWith('s:top-guard:1:1'))).toBe(true)
  await publishAndRoute(doc, true)
  const opening = structuredClone(upper.openings)
  expect(featureUpdateHandler.execute(doc, { featureId: stair.id, level: 1, patch: { rotation: 90, position: { x: 0, y: 12 } } }).success).toBe(true)
  expect(stair.levels[2].routeConnection).toBeUndefined()
  expect(building.floors[0].entranceAccess?.some(entry => entry.entranceId === 'stair-foot-s')).toBe(false)
  expect(upper.openings).toEqual(opening)
})

it('publishes a single indoor staircase and renders its arrival and cut slab from both floors', async () => {
  const doc = connectAndReload(false)
  const building = doc.buildings[0], [lower, upper] = building.floors, projection = transformer()
  const source = buildFloorArchitecturePreview(lower, building.id, projection, building.staircases, building.floors)
  const destination = buildFloorArchitecturePreview(upper, building.id, projection, building.staircases, building.floors)
  const stack = wholeBuildingPieces(building, lower.level, new Set(), projection)
  const meshHeights = [...destination.stairMesh!.mesh].filter((_, index) => index % 9 === 2)
  expect(source.stairMesh).toBeTruthy()
  expect(meshHeights.some(height => height < -0.1)).toBe(true)
  expect(meshHeights.some(height => Math.abs(height) < 0.001)).toBe(true)
  expect(stack.stairMeshes).toHaveLength(0) // the active source renders the flight once
  expect(stack.floors.features.some(slab => slab.geometry.coordinates.length === 2)).toBe(true)
  expect(destination.stairs.features.some(feature => feature.properties?.partType === 'well-guard')).toBe(true)

  const bundle = await publishAndRoute(doc, false)
  const model = buildFromCampusBundle(bundle)
  const visitor = selectFloorArchitecture(model.indoor.architecture, { active: true, buildingId: 'b' }, 2, true)!
  const upperSlab = floorArchitectureFeatures(visitor).floor.features.filter(feature => feature.properties?.floorElevation === 7)
  const probe = (x: number) => {
    const geo = world(x, 0)
    return upperSlab.some(feature => booleanPointInPolygon(point([geo.lng, geo.lat]), feature as GeoJSON.Feature<GeoJSON.Polygon>))
  }
  expect(visitor.stackStairMeshes.filter(Boolean)).toHaveLength(1)
  expect(probe(0)).toBe(false)
  expect(probe(4)).toBe(true)
})
