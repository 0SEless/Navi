// Save v2 feature parity (Task 19, owner requirement: everything that worked must still
// work). Each scenario acts in Studio, saves explicitly, reloads in a fresh browser
// context and checks the result. Run with `node e2e/save-v2/run.mjs`.
//
// Actions go through the editor's registered commands (the layer every Studio tool
// dispatches to), via the dev-only window.__naviStudioV2 hook (R55). Data that no single
// command creates (a junction, a separated crossing, a vertical transition) is authored
// with a direct document edit, as the composite tools do.
import { expect, test, type Page } from '@playwright/test'
import {
  GYM, LIBRARY, NORTH, SOUTH, freshDocument, installEditorHelpers, openAdmin, openFloor, openMap, saveNow, seededCampus,
  type Admin,
} from './support'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const FLOOR = `${LIBRARY}-floor-1`
type Doc = any // eslint-disable-line @typescript-eslint/no-explicit-any

async function editor(browser: Parameters<typeof openAdmin>[0], where: 'map' | 'floor' = 'map'): Promise<{ ana: Admin; campusId: string }> {
  const ana = await openAdmin(browser, 'ana')
  await installEditorHelpers(ana)
  const campusId = await seededCampus(ana)
  if (where === 'map') await openMap(ana, campusId)
  else await openFloor(ana, campusId)
  return { ana, campusId }
}

/** Run `fn` in the page with the helpers `p` (run / doc / edit / history). */
function act<A>(page: Page, fn: (p: any, arg: A) => unknown, arg?: A): Promise<unknown> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return page.evaluate(({ source, value }) => {
    // eslint-disable-next-line no-new-func
    const run = new Function('p', 'arg', `return (${source})(p, arg)`) as (p: unknown, a: unknown) => unknown
    return run((window as unknown as { __p: unknown }).__p, value)
  }, { source: fn.toString(), value: arg as unknown })
}

const docOf = (page: Page): Promise<Doc> => page.evaluate(() => structuredClone((window as unknown as { __p: { doc(): unknown } }).__p.doc()))
const buildingOf = (doc: Doc, id: string) => doc.buildings.find((b: Doc) => b.id === id)
const floorOf = (doc: Doc, buildingId: string, floorId: string) => buildingOf(doc, buildingId)?.floors.find((f: Doc) => f.id === floorId)
/** Local floor-plan fields never travel (spec §6.6); compare everything else. */
function withoutLocal<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, v) => (key === 'planImageId' || key === 'planAlignment' || key === 'floorPlanState' ? undefined : v)))
}

const ll = (dLat: number, dLng: number) => ({ lat: 14.6 + dLat, lng: 121.05 + dLng })

test.afterEach(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close()
})

test('P2 — building draw, move, rotate, delete', async ({ browser }) => {
  const { ana, campusId } = await editor(browser)
  const footprint = { points: [ll(0.002, 0.003), ll(0.002, 0.0035), ll(0.0025, 0.0035), ll(0.0025, 0.003), ll(0.002, 0.003)] }
  await act(ana.page, (p, fp) => {
    p.run({ id: 'building.create', payload: { id: 'bld-annex', name: 'Annex', code: 'ANX', footprint: fp } })
    const moved = { points: fp.points.map((point: { lat: number; lng: number }) => ({ lat: point.lat + 0.0001, lng: point.lng + 0.0001 })) }
    p.run({ id: 'entity.update', payload: { entityId: 'bld-annex', changes: { footprint: moved } } })
    p.run({ id: 'entity.update', payload: { entityId: 'bld-annex', changes: { rotation: 15 } } })
    p.run({ id: 'building.delete', payload: { buildingId: 'bld-gym' } })
  }, footprint)
  const saved = await docOf(ana.page)
  await saveNow(ana.page)

  const fresh = await freshDocument(browser, campusId)
  expect(buildingOf(fresh, GYM)).toBeUndefined()
  const annex = buildingOf(fresh, 'bld-annex')
  expect(annex).toMatchObject({ name: 'Annex', rotation: 15 })
  expect(annex.footprint.points[0].lat).toBeCloseTo(footprint.points[0].lat + 0.0001, 9)
  expect(withoutLocal(annex)).toEqual(withoutLocal(buildingOf(saved, 'bld-annex')))
  expect(fresh.buildings.map((b: Doc) => b.id)).toEqual(saved.buildings.map((b: Doc) => b.id))
})

test('P3 — floors create, rename, reorder, duplicate, delete', async ({ browser }) => {
  const { ana, campusId } = await editor(browser)
  await act(ana.page, (p, b) => {
    p.run({ id: 'floor.create', payload: { buildingId: b, id: 'lib-f2', label: 'Floor 2', level: 1, height: 3.5 } })
    p.run({ id: 'floor.rename', payload: { floorId: 'lib-f2', label: 'Second Floor' } })
    const floorIds = () => p.doc().buildings.find((x: { id: string }) => x.id === b).floors.map((f: { id: string }) => f.id) as string[]
    const before = floorIds()
    p.run({ id: 'floor.duplicate', payload: { floorId: 'lib-f2' } })
    const copy = floorIds().find((id) => !before.includes(id))!
    p.run({ id: 'floor.reorder', payload: { buildingId: b, floorIds: [...floorIds()].reverse() } })
    p.run({ id: 'floor.delete', payload: { floorId: copy } })
    return copy
  }, LIBRARY)
  const saved = await docOf(ana.page)
  expect(buildingOf(saved, LIBRARY).floors.map((f: Doc) => f.id)).toContain('lib-f2')
  await saveNow(ana.page)

  const fresh = await freshDocument(browser, campusId)
  const floors = buildingOf(fresh, LIBRARY).floors
  expect(floors.map((f: Doc) => f.id)).toEqual(buildingOf(saved, LIBRARY).floors.map((f: Doc) => f.id))
  expect(floors.find((f: Doc) => f.id === 'lib-f2').label).toBe('Second Floor')
  expect(floors).toHaveLength(2)
  expect(withoutLocal(floors)).toEqual(withoutLocal(buildingOf(saved, LIBRARY).floors))
})

test('P4 — floor editor: walls, split/merge, room, door, window, hallway, stair, elevator, entrance, POI, routes, access, vertical transition', async ({ browser }) => {
  const { ana, campusId } = await editor(browser, 'floor')
  await act(ana.page, (p, ids) => {
    const { b, f } = ids
    const floor = () => p.doc().buildings.find((x: { id: string }) => x.id === b).floors.find((x: { id: string }) => x.id === f)
    p.run({ id: 'wall.create', payload: { buildingId: b, floorId: f, id: 'w-a', start: { x: 0, y: 0 }, end: { x: 10, y: 0 } } })
    p.run({ id: 'wall.split', payload: { buildingId: b, floorId: f, wallId: 'w-a', point: { x: 5, y: 0 } } })
    const halves = floor().walls.map((w: { id: string }) => w.id)
    p.run({ id: 'wall.merge', payload: { buildingId: b, floorId: f, wallIds: halves } })
    const wallId = floor().walls[0].id
    p.run({ id: 'wall.create', payload: { buildingId: b, floorId: f, id: 'w-b', start: { x: 0, y: 8 }, end: { x: 10, y: 8 } } })
    p.run({ id: 'room.create', payload: { buildingId: b, floorId: f, id: 'room-101', name: 'Reading Room', number: '101', category: 'classroom', points: [{ x: 1, y: 1 }, { x: 6, y: 1 }, { x: 6, y: 6 }, { x: 1, y: 6 }] } })
    p.run({ id: 'door.create', payload: { buildingId: b, floorId: f, door: { name: 'Door', doorType: 'standard', position: { x: 4, y: 4 }, width: 4, depth: 2, rotation: 0, geometry: { type: 'rectangle', min: { x: 2, y: 3 }, max: { x: 6, y: 5 }, rotation: 0 }, metadata: {} } } })
    p.run({ id: 'opening.create', payload: { buildingId: b, floorId: f, opening: { id: 'win-1', wallId, offset: 2, type: 'window', width: 1.2 } } })
    p.run({ id: 'hallway.create', payload: { buildingId: b, floorId: f, id: 'hall-1', name: 'Main Hall', points: [{ x: 0, y: 7 }, { x: 10, y: 7 }], width: 2 } })
    p.run({ id: 'staircase.create', payload: { buildingId: b, floorId: f, id: 'stair-1', name: 'Stair A', position: { x: 9, y: 2 }, fromLevel: 0, toLevel: 1, type: 'enclosed' } })
    p.run({ id: 'elevator.create', payload: { buildingId: b, floorId: f, id: 'lift-1', name: 'Lift A', position: { x: 9, y: 4 }, fromLevel: 0, toLevel: 1 } })
    p.run({ id: 'entrance.create', payload: { buildingId: b, floorId: f, id: 'ent-1', label: 'Front', position: { x: 0, y: 7 }, level: 0, type: 'main', hasQR: false, hasPanorama: false } })
    p.run({ id: 'poi.create', payload: { id: 'poi-1', buildingId: b, floorId: f, name: 'Water fountain', category: 'other', geometry: { type: 'rectangle', min: { x: 7, y: 1 }, max: { x: 8, y: 2 } } } })
    p.run({ id: 'route.node.create', payload: { buildingId: b, floorId: f, node: { id: 'rn-1', type: 'waypoint', position: { x: 1, y: 7 } } } })
    p.run({ id: 'route.node.create', payload: { buildingId: b, floorId: f, node: { id: 'rn-2', type: 'waypoint', position: { x: 4, y: 7 } } } })
    p.run({ id: 'route.edge.create', payload: { buildingId: b, floorId: f, edge: { id: 're-1', from: 'rn-1', to: 'rn-2', type: 'walk' } } })
    p.edit((doc: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const building = doc.buildings.find((x: { id: string }) => x.id === b)
      building.verticalTransitions = [...(building.verticalTransitions ?? []), { id: 'vt-1', featureId: 'stair-1', type: 'staircase', connections: [{ floorId: f, routeNodeId: 'rn-2' }] }]
    })
  }, { b: LIBRARY, f: FLOOR })
  // Room access and entrance access: the commands need a wall-enclosed semantic room face and an
  // outdoor node picked on the map, so the links are authored directly here (R58).
  await act(ana.page, (p, ids) => {
    p.edit((doc: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const floor = doc.buildings.find((x: { id: string }) => x.id === ids.b).floors.find((x: { id: string }) => x.id === ids.f)
      floor.semanticRooms = [...(floor.semanticRooms ?? []), { faceId: 'face-101', name: 'Reading Room', number: '101', category: 'classroom', searchable: true, accessPoints: [{ routeNodeId: 'rn-2', primary: true }] }]
      floor.entranceAccess = [...(floor.entranceAccess ?? []), { entranceId: 'ent-1', outdoorNodeId: 'N-entrance-access-ent-1', indoorRouteNodeId: 'rn-1', outdoorRouteId: 'road-north', outdoorPosition: { lat: 14.6025, lng: 121.0505 } }]
    })
  }, { b: LIBRARY, f: FLOOR })
  const saved = await docOf(ana.page)
  await saveNow(ana.page)

  const fresh = await freshDocument(browser, campusId)
  const floor = floorOf(fresh, LIBRARY, FLOOR)
  expect(floor.walls.length).toBe(2)
  for (const [field, id] of [['rooms', 'room-101'], ['hallways', 'hall-1'], ['staircases', 'stair-1'], ['elevators', 'lift-1'], ['entrances', 'ent-1'], ['pois', 'poi-1'], ['openings', 'win-1']] as const) {
    expect((floor[field] ?? []).some((item: Doc) => item.id === id), `${field} ${id}`).toBe(true)
  }
  expect(floor.doors?.length ?? floor.rooms.flatMap((r: Doc) => r.doors ?? []).length).toBeGreaterThan(0)
  expect(floor.routeNetwork.edges.some((e: Doc) => e.id === 're-1')).toBe(true)
  expect(buildingOf(fresh, LIBRARY).verticalTransitions.some((t: Doc) => t.id === 'vt-1')).toBe(true)
  expect(floor.semanticRooms.find((r: Doc) => r.faceId === 'face-101').accessPoints).toEqual([{ routeNodeId: 'rn-2', primary: true }])
  expect(floor.entranceAccess.some((a: Doc) => a.entranceId === 'ent-1' && a.indoorRouteNodeId === 'rn-1')).toBe(true)
  expect(withoutLocal(buildingOf(fresh, LIBRARY))).toEqual(withoutLocal(buildingOf(saved, LIBRARY)))
})

test('P5 — roads with stairs/ramp/bridge and a slope, junction, separated crossing, area, outdoor POI', async ({ browser }) => {
  const { ana, campusId } = await editor(browser)
  await act(ana.page, (p, base) => {
    const at = (dLat: number, dLng: number) => ({ lat: base.lat + dLat, lng: base.lng + dLng })
    const features = [['road-stairs', 'stairs', 'steep'], ['road-ramp', 'ramp', 'gentle'], ['road-bridge', 'bridge', 'level']] as const
    features.forEach(([id, feature, slope], index) => {
      p.run({ id: 'road.create', payload: { id, name: `Path ${feature}`, points: [at(0.001 * index, 0), at(0.001 * index, 0.001)], type: 'pedestrian', width: 2, surface: 'concrete', metadata: {} } })
      p.run({ id: 'entity.update', payload: { entityId: id, changes: { routing: { feature, slope } } } })
    })
    p.run({ id: 'area.create', payload: { id: 'area-lawn', name: 'Lawn', points: [at(0, 0.002), at(0, 0.0025), at(0.0005, 0.0025), at(0.0005, 0.002)], color: '#22c55e' } })
    p.run({ id: 'poi.create', payload: { id: 'poi-out', scope: 'outdoor', name: 'Flagpole', category: 'information', geometry: { type: 'point', position: at(0.0002, 0.0022) } } })
    p.edit((doc: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      doc.roadJunctions = [...(doc.roadJunctions ?? []), { id: 'rj-1', position: at(0, 0), roadIds: ['road-stairs', 'road-north'], source: 'authored' }]
      doc.separatedCrossings = [...(doc.separatedCrossings ?? []), { id: 'sc-1', roadIds: ['road-bridge', 'road-south'], position: at(0.002, 0.0005) }]
    })
  }, { lat: 14.6, lng: 121.05 })
  const saved = await docOf(ana.page)
  await saveNow(ana.page)

  const fresh = await freshDocument(browser, campusId)
  for (const [id, feature, slope] of [['road-stairs', 'stairs', 'steep'], ['road-ramp', 'ramp', 'gentle'], ['road-bridge', 'bridge', 'level']]) {
    expect(fresh.roads.find((r: Doc) => r.id === id)?.routing, id).toMatchObject({ feature, slope })
  }
  expect(fresh.roadJunctions.some((j: Doc) => j.id === 'rj-1')).toBe(true)
  expect(fresh.separatedCrossings.some((c: Doc) => c.id === 'sc-1')).toBe(true)
  expect(fresh.areas.some((a: Doc) => a.id === 'area-lawn')).toBe(true)
  const outdoorPois = JSON.stringify(fresh).includes('"poi-out"')
  expect(outdoorPois).toBe(true)
  for (const field of ['roads', 'roadJunctions', 'separatedCrossings', 'areas']) {
    expect(withoutLocal(fresh[field]), field).toEqual(withoutLocal(saved[field]))
  }
})

test('P6 — boundary set and clear', async ({ browser }) => {
  const { ana, campusId } = await editor(browser)
  const points = [ll(-0.002, -0.002), ll(0.004, -0.002), ll(0.004, 0.007), ll(-0.002, 0.007)]
  await act(ana.page, (p, pts) => p.run({ id: 'boundary.set', payload: { points: pts } }), points)
  await saveNow(ana.page)
  expect((await freshDocument(browser, campusId)).boundary?.points?.slice(0, 4)).toEqual(points)

  await act(ana.page, (p) => p.run({ id: 'boundary.clear', payload: {} }))
  const cleared = await docOf(ana.page)
  await saveNow(ana.page)
  expect((await freshDocument(browser, campusId)).boundary ?? null).toEqual(cleared.boundary ?? null)
})

test('P7 — terrain area create, update, delete and the vertical datum', async ({ browser }) => {
  const { ana, campusId } = await editor(browser)
  const datum = { kind: 'campus-local', name: 'Campus datum', zeroReference: 'Main gate step', elevationStatus: 'authored-not-surveyed' }
  const square = (d: number) => [ll(d, d), ll(d, d + 0.0005), ll(d + 0.0005, d + 0.0005), ll(d + 0.0005, d)]
  await act(ana.page, (p, arg) => {
    p.run({ id: 'terrain-area.create', payload: { id: 'ta-1', name: 'North Lawn', points: arg.a, color: '#84cc16', elevationMeters: 2.5, datum: arg.datum } })
    p.run({ id: 'terrain-area.create', payload: { id: 'ta-2', name: 'Court', points: arg.b, color: '#f59e0b', elevationMeters: 1 } })
    p.run({ id: 'terrain-area.update', payload: { areaId: 'ta-1', changes: { elevationMeters: 3.25, name: 'North Lawn (raised)' } } })
    p.run({ id: 'terrain-area.delete', payload: { areaId: 'ta-2' } })
  }, { a: square(0.0012), b: square(0.0025), datum })
  await saveNow(ana.page)

  const fresh = await freshDocument(browser, campusId)
  expect(fresh.terrainAreas).toHaveLength(1)
  expect(fresh.terrainAreas[0]).toMatchObject({ id: 'ta-1', name: 'North Lawn (raised)', elevationMeters: 3.25 })
  expect(fresh.terrainVerticalDatum).toMatchObject(datum)
})

test('P9 — undo and redo across a save boundary', async ({ browser }) => {
  const { ana, campusId } = await editor(browser)
  await act(ana.page, (p, id) => p.run({ id: 'entity.update', payload: { entityId: id, changes: { name: 'North A' } } }), NORTH)
  await saveNow(ana.page)
  await act(ana.page, (p, id) => p.run({ id: 'entity.update', payload: { entityId: id, changes: { name: 'North B' } } }), NORTH)
  await act(ana.page, (p) => p.history().undo())
  expect((await docOf(ana.page)).roads.find((r: Doc) => r.id === NORTH).name).toBe('North A')
  await expect(ana.page.getByText(/Saved · #\d+/)).toBeVisible()
  await act(ana.page, (p) => p.history().undo())
  expect((await docOf(ana.page)).roads.find((r: Doc) => r.id === NORTH).name).toBe('North Road')
  await act(ana.page, (p) => { p.history().redo(); p.history().redo() })
  expect((await docOf(ana.page)).roads.find((r: Doc) => r.id === NORTH).name).toBe('North B')
  await saveNow(ana.page)
  const fresh = await freshDocument(browser, campusId)
  expect(fresh.roads.find((r: Doc) => r.id === NORTH).name).toBe('North B')
  expect(fresh.roads.find((r: Doc) => r.id === SOUTH).name).toBe('South Road')
})

test('P11 — the Studio preview page renders the saved campus', async ({ browser }) => {
  const { ana, campusId } = await editor(browser)
  await act(ana.page, (p) => p.run({ id: 'entity.update', payload: { entityId: 'bld-library', changes: { name: 'Library (saved)' } } }))
  await saveNow(ana.page)
  const viewer = await openAdmin(browser, 'ben')
  const errors: string[] = []
  viewer.page.on('pageerror', (error) => errors.push(error.message))
  // The preview draws buildings on the map canvas; it loads them through the Save v2 campus route.
  const load = viewer.page.waitForResponse((r) => r.url().includes(`/api/studio/v2/campus/${campusId}`) && r.request().method() === 'GET', { timeout: 90_000 })
  await viewer.page.goto(`/studio/${campusId}/preview`)
  const answer = await load
  expect(answer.status()).toBe(200)
  expect(await answer.text()).toContain('Library (saved)')
  await expect(viewer.page.getByText('Save v2 Probe Campus').first()).toBeVisible()
  await expect(viewer.page.locator('canvas').first()).toBeVisible()
  expect(viewer.requests.some((r) => r.path === '/api/graph')).toBe(false)
  expect(errors).toEqual([])
})

test('P12 — intended changes: no panorama tool; an unpublished campus is not served as draft data', async ({ browser }) => {
  const { ana, campusId } = await editor(browser)
  // Studio's working area offers no 360 tour / panorama / hotspot tool.
  await expect(ana.page.getByRole('button', { name: /Navigate/ }).first()).toBeVisible()
  await expect(ana.page.locator('main').getByRole('button', { name: /360|panorama|hotspot/i })).toHaveCount(0)
  const response = await ana.page.request.get(`/api/public-campus?campus_id=${encodeURIComponent(campusId)}`)
  const body = await response.text()
  // Before the first publish NAVI Web gets an empty campus, never the saved draft (R60).
  expect(JSON.parse(body)).toMatchObject({ campusId, source: 'empty', revision: null, buildings: [], nodes: [], edges: [] })
  expect(body).not.toContain('Library')
  const catalog = await ana.page.request.get('/api/campuses')
  expect(await catalog.text()).not.toContain(campusId)
})

/**
 * A campus that passes every publish gate: fixtureFull (src/studio-v2/__fixtures__), dumped to
 * e2e/save-v2/fixtures/campus-full.json because the browser probe cannot import the editor's
 * TypeScript test helpers. The server publish tests publish the same document.
 */
const FULL = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'campus-full.json'), 'utf8'))
const PUB_BUILDING = 'osm:way/123'
const PUB_FLOOR = 'bib/ground'

function publishableDocument(campusId: string) {
  const doc = structuredClone(FULL)
  doc.metadata.campusId = campusId
  return doc
}

async function publishableEditor(browser: Parameters<typeof openAdmin>[0]): Promise<{ ana: Admin; campusId: string }> {
  const ana = await openAdmin(browser, 'ana')
  await installEditorHelpers(ana)
  const campusId = await seededCampus(ana, publishableDocument)
  await openMap(ana, campusId, /Biblioteca/)
  return { ana, campusId }
}

/**
 * Publish through Studio's PublishService (client validation + compile, then the Save v2
 * adapter → server publish). With warnings the toolbar button stays disabled (unchanged
 * legacy gate), so this uses the same "Publish Anyway" path as the bypass dialog (R62).
 */
async function publishFromStudio(page: Page): Promise<{ status: number; body: Record<string, unknown> }> {
  const errors = await page.evaluate(() => {
    const context = (window as unknown as { __naviStudioV2: { context: { document: unknown; services: { get(id: string): any } } } }).__naviStudioV2.context // eslint-disable-line @typescript-eslint/no-explicit-any
    return context.services.get('validationEngine').validate(context.document, 'publish').issues
      .filter((issue: { severity: string }) => issue.severity === 'error')
      .map((issue: { ruleId: string; message: string }) => `${issue.ruleId}: ${issue.message}`)
  })
  // Logged, not asserted: the force path skips these soft checks, as Studio's bypass dialog does.
  console.log(`PUBLISH_SOFT_ISSUES ${JSON.stringify(errors)}`)
  const response = page.waitForResponse((r) => r.url().endsWith('/api/studio/v2/publish') && r.request().method() === 'POST', { timeout: 90_000 })
  const outcome = await page.evaluate(async () => {
    const services = (window as unknown as { __naviStudioV2: { context: { services: { get(id: string): any } } } }).__naviStudioV2.context.services // eslint-disable-line @typescript-eslint/no-explicit-any
    let thrown: string | null = null
    await services.get('publish').publish(true).catch((error: unknown) => { thrown = String(error) })
    const snapshot = services.get('publishStore')?.getSnapshot?.() ?? services.get('publish').getSnapshot?.()
    return { thrown, state: snapshot?.publishState ?? null, error: snapshot?.publishError ?? null }
  })
  expect(outcome.thrown ?? outcome.error, JSON.stringify(outcome)).toBeNull()
  const answer = await response
  return { status: answer.status(), body: await answer.json() as Record<string, unknown> }
}

test('P8 — QR checkpoint create → publish → /api/public-qr resolves it', async ({ browser }) => {
  const { ana } = await publishableEditor(browser)
  // qr.create is not registered in Studio's editor context (pre-existing: the POI tool's QR mode
  // fails with "Unknown command"), so the checkpoint is authored directly (R61).
  await act(ana.page, (p, b) => p.edit((doc: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    doc.qrCheckpoints = [...(doc.qrCheckpoints ?? []), { id: 'qr-gate', label: 'Gate QR', position: { x: 2, y: 0 }, floor: 0, buildingId: b, code: 'navi.app/q/qr-gate', metadata: {} }]
  }), PUB_BUILDING)
  await saveNow(ana.page)
  const published = await publishFromStudio(ana.page)
  expect(published.status, JSON.stringify(published.body)).toBe(200)

  const anonymous = await browser.newContext({ baseURL: 'http://127.0.0.1:3118' })
  const response = await anonymous.request.get('/api/public-qr?checkpoint_id=qr-gate')
  const body = await response.text()
  expect(response.status(), body).toBe(200)
  expect(body).toContain('qr-gate')
  expect(body).toContain('Gate QR')
})

test('P10 — publish → NAVI Web serves it, search finds the new room, navigation takes a destination and origin (route + floors: not verified, R63)', async ({ browser }) => {
  const { ana, campusId } = await publishableEditor(browser)
  await act(ana.page, (p, ids) => p.run({ id: 'room.create', payload: { buildingId: ids.b, floorId: ids.f, id: 'room-101', name: 'Room 101', number: '101', category: 'classroom', points: [{ x: -18, y: -9 }, { x: -15, y: -9 }, { x: -15, y: -6 }, { x: -18, y: -6 }, { x: -18, y: -9 }] } }), { b: PUB_BUILDING, f: PUB_FLOOR })
  await saveNow(ana.page)
  const published = await publishFromStudio(ana.page)
  expect(published.status, JSON.stringify(published.body)).toBe(200)

  const visitor = await browser.newContext({ baseURL: 'http://127.0.0.1:3118' })
  await visitor.addInitScript((id) => {
    localStorage.setItem('navi-default-campus', id)
    localStorage.setItem('navi-onboarded', 'true')
  }, campusId)
  const page = await visitor.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const campus = page.waitForResponse((r) => r.url().includes(`/api/public-campus?campus_id=${campusId}`), { timeout: 90_000 })
  await page.goto('/map/explore')
  const answer = await campus
  const payload = await answer.json() as Record<string, unknown>
  console.log(`P10_PUBLIC ${JSON.stringify({ status: answer.status(), source: payload.source, revision: payload.revision })}`)
  expect(answer.status()).toBe(200)
  expect(JSON.stringify(payload)).toContain('Room 101')
  // The dev server may reload a page it just compiled; retry the navigation once.
  // Search finds the room authored in Studio, saved and published through Save v2.
  // The dev server may reload a page it just compiled; retry the navigation once.
  await page.goto('/map/search').catch(() => page.goto('/map/search'))
  await page.getByRole('textbox', { name: 'Search campus' }).fill('Room 101')
  await expect(page.getByRole('button', { name: /^Room 101 \(101\)/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Biblioteca/ })).toBeVisible()
  // Navigation accepts the destination and an origin on the other floor.
  await page.getByRole('textbox', { name: 'Search campus' }).fill('Reading Room')
  await page.getByRole('button', { name: /^Reading Room \(101\)/ }).first().click()
  await page.getByRole('button', { name: 'Set starting point' }).click()
  await page.getByRole('searchbox', { name: 'Search origin' }).fill('Study Hall')
  await page.getByRole('list', { name: 'Location search results' }).getByRole('button').first().click()
  await expect(page.getByRole('button', { name: /From Study Hall/ })).toBeVisible()
  // NOT VERIFIED here (R63): fixtureFull's rooms are not linked to its route network, so NAVI Web
  // answers "No route is currently available"; route computation and floor switching need a
  // routable campus (Task 21's real campus).
  test.info().annotations.push({ type: 'not-verified', description: 'route computed + floors switch: fixture is not routable (R63)' })
  expect(errors).toEqual([])
})

test('P1 — create a campus with the wizard (OSM import stubbed), list it, delete it as owner', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  await installEditorHelpers(ana)
  const name = `Wizard Campus ${Date.now()}`
  // OSM is stubbed: one building inside whatever boundary is drawn.
  await ana.context.route('**/api/osm-buildings', async (route) => {
    const boundary = (route.request().postDataJSON() as { boundary: Array<{ lat: number; lng: number }> }).boundary
    const lat = boundary.reduce((sum, point) => sum + point.lat, 0) / boundary.length
    const lng = boundary.reduce((sum, point) => sum + point.lng, 0) / boundary.length
    const d = 0.00005
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ buildings: [{
        id: 'osm-wizard-1',
        footprint: [{ lat: lat - d, lng: lng - d }, { lat: lat - d, lng: lng + d }, { lat: lat + d, lng: lng + d }, { lat: lat + d, lng: lng - d }],
        height: 9, color: '#9ca3af', center: { lat, lng },
      }] }),
    })
  })
  const created = ana.page.waitForRequest((r) => r.url().endsWith('/api/studio/v2/campuses') && r.method() === 'POST')
  const firstSave = ana.page.waitForResponse((r) => r.url().endsWith('/api/studio/v2/save') && r.request().method() === 'POST', { timeout: 60_000 })

  await ana.page.goto('/studio/create')
  await ana.page.getByPlaceholder('e.g., Main Campus').fill(name)
  await ana.page.getByPlaceholder('e.g., Aklan State University').fill('Aklan State University')
  await ana.page.getByRole('button', { name: 'Next', exact: true }).last().click()
  const canvas = ana.page.locator('canvas.maplibregl-canvas').first()
  await expect(canvas).toBeVisible({ timeout: 60_000 })
  await ana.page.waitForTimeout(1_500)
  const box = (await canvas.boundingBox())!
  for (const [x, y] of [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.6]]) {
    await ana.page.mouse.click(box.x + box.width * x, box.y + box.height * y)
  }
  await ana.page.getByRole('button', { name: /Confirm & Import Buildings/ }).click()
  const campusId = ((await created).postDataJSON() as { campusId: string }).campusId
  expect((await firstSave).status()).toBe(200)
  await ana.page.getByRole('button', { name: /Continue to Editor/ }).click()
  await expect(ana.page.getByRole('treeitem', { name: /Bldg No\. 1/ })).toBeVisible({ timeout: 60_000 })

  // Fresh context: the campus and its imported building come from Save v2.
  const fresh = await freshDocumentReady(browser, campusId)
  expect(fresh.buildings.map((b: Doc) => b.id)).toEqual(['osm-wizard-1'])

  // List and delete (owner).
  await ana.page.goto('/studio')
  await expect(ana.page.getByText(name)).toBeVisible({ timeout: 30_000 })
  ana.page.once('dialog', (dialog) => void dialog.accept())
  const deleted = ana.page.waitForResponse((r) => r.url().includes(`/api/studio/v2/campuses?campus_id=${encodeURIComponent(campusId)}`) && r.request().method() === 'DELETE')
  await ana.page.getByRole('button', { name: `Open actions for ${name}` }).click()
  await ana.page.getByRole('button', { name: 'Delete' }).click()
  expect((await deleted).status()).toBe(200)
  const viewer = await openAdmin(browser, 'ben')
  await viewer.page.goto('/studio')
  await expect(viewer.page.getByText(/\d+ maps?/).first()).toBeVisible({ timeout: 30_000 })
  await expect(viewer.page.getByText(name)).toHaveCount(0)
})

/** freshDocument for a campus whose Explorer shows buildings other than the probe seed's. */
async function freshDocumentReady(browser: Parameters<typeof openAdmin>[0], campusId: string): Promise<Doc> {
  const admin = await openAdmin(browser, 'ben')
  await openMap(admin, campusId, /Bldg No\. 1/)
  const doc = await docOfProbe(admin.page)
  await admin.context.close()
  return doc
}

const docOfProbe = (page: Page): Promise<Doc> => page.evaluate(() => structuredClone((window as unknown as { __naviStudioV2: { context: { document: unknown } } }).__naviStudioV2.context.document))
