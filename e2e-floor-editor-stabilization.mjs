/**
 * Floor Editor stabilization — disposable browser verification.
 *
 * The campus-map shell exists only long enough for the server-rendered editor
 * route to resolve. Graph GET/POST requests are intercepted, so authored test
 * geometry stays in this browser context and localStorage. The map shell and
 * local keys are removed in finally.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = 'http://localhost:3000'
const OUT = 'e2e-artifacts/floor-editor-stabilization'
mkdirSync(OUT, { recursive: true })

const results = []
function check(name, ok, details) {
  const entry = { name, ok: Boolean(ok), details }
  results.push(entry)
  console.log(`${entry.ok ? 'PASS' : 'FAIL'} — ${name}${details === undefined ? '' : ` :: ${JSON.stringify(details)}`}`)
}

const sleep = (page, ms = 500) => page.waitForTimeout(ms)
const floorSnapshot = (page, mapId) => page.evaluate((id) => {
  const graph = JSON.parse(localStorage.getItem(`navi-graph-${id}`) || 'null')
  return { graph, floor: graph?.buildings?.[0]?.floorData?.[0] ?? null }
}, mapId)

async function acquireMap(page, attempts = 20) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const acquired = await page.evaluate(() => {
      const element = document.querySelector('.maplibregl-map')
      if (!element) return false
      const fiberKey = Object.keys(element).find((key) => key.startsWith('__reactFiber'))
      let node = fiberKey ? element[fiberKey] : null
      for (let depth = 0; depth < 70 && node; depth += 1) {
        let hook = node.memoizedState
        for (let index = 0; hook && index < 140; index += 1) {
          try {
            const value = hook.memoizedState
            const candidate = value?.current ?? value
            if (candidate && typeof candidate.project === 'function' && typeof candidate.queryRenderedFeatures === 'function') {
              window.__floorStabilizationMap = candidate
            }
          } catch {}
          hook = hook.next
        }
        node = node.return
      }
      return Boolean(window.__floorStabilizationMap)
    })
    if (acquired) return true
    await sleep(page, 500)
  }
  return false
}

const sourceFeatures = (page, sourceId) => page.evaluate((id) => {
  const data = window.__floorStabilizationMap?.getSource(id)?._data
  const collection = data && (data.features ? data : data.geojson)
  return collection?.features ?? []
}, sourceId)

async function featureCenter(page, sourceId, featureId) {
  return page.evaluate(({ sourceId: id, featureId: wanted }) => {
    const data = window.__floorStabilizationMap.getSource(id)?._data
    const features = (data?.features ? data : data?.geojson)?.features ?? []
    const feature = features.find((candidate) => String(candidate.properties?.id ?? candidate.id) === wanted)
    if (!feature) return null
    const ring = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0].slice(0, -1) : [feature.geometry.coordinates]
    const lng = ring.reduce((sum, point) => sum + point[0], 0) / ring.length
    const lat = ring.reduce((sum, point) => sum + point[1], 0) / ring.length
    const projected = window.__floorStabilizationMap.project([lng, lat])
    const bounds = window.__floorStabilizationMap.getCanvas().getBoundingClientRect()
    return { x: bounds.x + projected.x, y: bounds.y + projected.y }
  }, { sourceId, featureId })
}

async function handleScreen(page, type, vertexIndex) {
  return page.evaluate(({ type: wantedType, vertexIndex: wantedIndex }) => {
    const data = window.__floorStabilizationMap.getSource('floor-vertex-handles')?._data
    const features = (data?.features ? data : data?.geojson)?.features ?? []
    const feature = features.find((candidate) => candidate.properties?.type === wantedType
      && (wantedIndex === undefined || candidate.properties?.vertexIndex === wantedIndex))
    if (!feature) return null
    const projected = window.__floorStabilizationMap.project(feature.geometry.coordinates)
    const bounds = window.__floorStabilizationMap.getCanvas().getBoundingClientRect()
    return { x: bounds.x + projected.x, y: bounds.y + projected.y }
  }, { type, vertexIndex })
}

async function drag(page, from, to) {
  if (!from || !to) throw new Error(`Cannot drag missing coordinates: ${JSON.stringify({ from, to })}`)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
  await sleep(page, 650)
}

async function clickTool(page, title) {
  await page.locator(`button[title="${title}"]`).click()
  await sleep(page, 250)
}

const center = { lat: 11.8195, lng: 122.09225 }
const mapId = `map-floor-stabilization-${Date.now()}`
const buildingId = 'bld-floor-stabilization'
const floorId = 'flr-floor-stabilization-0'
const now = new Date().toISOString()
const d = 0.00016
const mapRecord = {
  id: mapId,
  name: 'Floor Stabilization Fixture',
  schoolName: 'NAVI Test',
  campusName: 'Disposable',
  boundary: [
    { lat: center.lat - d * 3, lng: center.lng - d * 3 },
    { lat: center.lat - d * 3, lng: center.lng + d * 3 },
    { lat: center.lat + d * 3, lng: center.lng + d * 3 },
    { lat: center.lat + d * 3, lng: center.lng - d * 3 },
  ],
  center,
  createdAt: now,
  updatedAt: now,
  stats: { buildings: 1, nodes: 0, edges: 0 },
}

const metersToWorld = (x, y) => ({
  lat: center.lat + y / 111320,
  lng: center.lng + x / (111320 * Math.cos(center.lat * Math.PI / 180)),
})
const roomComponent = (id, name, minX, maxX) => ({
  id,
  type: 'room',
  name,
  buildingId,
  campusId: mapId,
  floor: 0,
  position: metersToWorld((minX + maxX) / 2, 0),
  polygon: [metersToWorld(minX, -7), metersToWorld(maxX, -7), metersToWorld(maxX, 7), metersToWorld(minX, 7)],
  metadata: {},
})

const graph = {
  id: mapId,
  version: 1,
  campusId: mapId,
  updatedAt: now,
  buildings: [{
    id: buildingId,
    name: 'Fixture Hall',
    campusId: mapId,
    floors: [0],
    footprint: [
      { lat: center.lat - d, lng: center.lng - d },
      { lat: center.lat - d, lng: center.lng + d },
      { lat: center.lat + d, lng: center.lng + d },
      { lat: center.lat + d, lng: center.lng - d },
      { lat: center.lat - d, lng: center.lng - d },
    ],
    baseElevation: 0,
    height: 8,
    center,
    code: 'TEST',
    description: '',
    color: '#1C6BEB',
    department: '',
    aliases: [],
    metadata: {},
    floorData: [{
      id: floorId,
      level: 0,
      label: 'Ground Floor',
      elevation: 0,
      height: 3.5,
      metadata: {},
      rooms: [
        { id: 'room-left', name: 'Computer Laboratory', number: 'L-101', polygon: { points: [{ x: -9, y: -7 }, { x: 0, y: -7 }, { x: 0, y: 7 }, { x: -9, y: 7 }] }, color: '#DBEAFE' },
        { id: 'room-right', name: 'Room 102', number: '102', polygon: { points: [{ x: 0, y: -7 }, { x: 9, y: -7 }, { x: 9, y: 7 }, { x: 0, y: 7 }] }, color: '#DCFCE7' },
      ],
      hallways: [],
      walls: [],
      staircases: [],
      elevators: [],
      doors: [],
      entrances: [{ id: 'entrance-fixture', label: 'Main Entrance', position: { x: -8, y: 0 }, level: 0, type: 'main', hasQR: false, hasPanorama: false }],
      connectorStops: [],
      parametricComponents: [],
      routeNetwork: { nodes: [{ id: 'route-fixture-1', type: 'waypoint', position: { x: 6, y: 0 }, floor: 0 }], edges: [] },
    }],
  }],
  nodes: [],
  edges: [],
  components: [
    roomComponent('room-left', 'Computer Laboratory', -9, 0),
    roomComponent('room-right', 'Room 102', 0, 9),
    {
      id: 'entrance-fixture', type: 'entrance', name: 'Main Entrance', buildingId, campusId: mapId, floor: 0,
      position: metersToWorld(-8, 0), metadata: { hasQR: false, hasPanorama: false },
    },
  ],
  traces: [],
  areas: [],
  pois: [],
  roads: [],
  roadJunctions: [],
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const mockCookie = Buffer.from(JSON.stringify({
  id: 'mock-super-admin', name: 'Dr. Admin', email: 'admin@asu.edu', role: 'super_admin', campus_id: null,
})).toString('base64')
await context.addCookies([{ name: 'navi-mock-session', value: mockCookie, url: BASE }])
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))
let graphPostMode = 'success'

let shellCreated = false
try {
  await page.goto(`${BASE}/studio/create`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  const createResult = await page.evaluate(async (record) => {
    const response = await fetch('/api/campus-maps', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(record),
    })
    return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) }
  }, mapRecord)
  shellCreated = createResult.ok && createResult.body?.success !== false
  check('disposable campus-map shell created', shellCreated, createResult)
  if (!shellCreated) throw new Error('Could not create disposable campus-map shell')

  await page.route('**/api/graph*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '1.0.0', campusId: mapId, buildings: [], nodes: [], edges: [], components: [] }) })
      return
    }
    if (graphPostMode === 'conflict') {
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'The server changed since this editor loaded it. Your local changes were not overwritten.' }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, updatedAt: new Date().toISOString() }) })
  })

  await page.evaluate(({ mapRecord: record, graph: snapshot }) => {
    localStorage.setItem('navi-campus-maps', JSON.stringify({ maps: [record], landmarkTypes: [], landmarkInstances: [] }))
    localStorage.setItem(`navi-graph-${record.id}`, JSON.stringify(snapshot))
    localStorage.removeItem(`navi-sync-status-${record.id}`)
  }, { mapRecord, graph })

  await page.goto(`${BASE}/studio/${mapId}/edit/building/${buildingId}/floor/0`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('.maplibregl-map', { timeout: 30000 })
  const mapReady = await acquireMap(page)
  check('disposable Floor Editor map acquired', mapReady)
  if (!mapReady) throw new Error('MapLibre instance not acquired')
  const continueWithoutPlan = page.getByRole('button', { name: 'Continue without floor plan', exact: true })
  if (await continueWithoutPlan.isVisible().catch(() => false)) {
    await continueWithoutPlan.click()
    await sleep(page, 500)
  }
  await sleep(page, 1800)

  const rooms = await sourceFeatures(page, 'floor-rooms')
  check('populated 2D floor renders both fixture Rooms', rooms.length === 2, rooms.map((feature) => feature.properties?.id))
  const leftCenter = await featureCenter(page, 'floor-rooms', 'room-left')
  const rightCenter = await featureCenter(page, 'floor-rooms', 'room-right')

  await clickTool(page, 'Door')
  await drag(page, { x: leftCenter.x - 28, y: leftCenter.y - 18 }, { x: leftCenter.x + 28, y: leftCenter.y + 18 })
  let doors = await sourceFeatures(page, 'floor-door-areas')
  check('Door click-drag creates one spatial footprint', doors.length === 1, doors.map((feature) => feature.properties?.id))
  const doorId = String(doors[0]?.properties?.id ?? '')
  check('Door creation keeps Inspector editing available', await page.getByRole('combobox', { name: 'Door parent room' }).isVisible())

  const nameInput = page.locator('main input:not([type])').last()
  await nameInput.fill('Browser Main Door')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await sleep(page, 350)
  await page.getByRole('combobox', { name: 'Door route node' }).selectOption('route-fixture-1')
  await page.getByRole('button', { name: 'Connect Door to Route', exact: true }).click()
  await sleep(page, 7000)
  let snapshot = await floorSnapshot(page, mapId)
  let door = snapshot.floor?.doors?.find((candidate) => candidate.id === doorId)
  check('Door inside Room receives its parent roomId', door?.roomId === 'room-left', door?.roomId)
  check('Door route connection is explicit and persisted locally', door?.routeConnection?.targetRouteNodeId === 'route-fixture-1', door?.routeConnection)
  check('Door metadata is editable in Inspector', door?.name === 'Browser Main Door', door?.name)

  await clickTool(page, 'Navigate')
  let doorCenter = await featureCenter(page, 'floor-door-areas', doorId)
  await page.mouse.click(doorCenter.x, doorCenter.y)
  await sleep(page, 350)
  const widthBefore = door?.width
  const resizeHandle = await handleScreen(page, 'vertex', 2)
  await drag(page, resizeHandle, { x: resizeHandle.x + 22, y: resizeHandle.y + 18 })
  doorCenter = await featureCenter(page, 'floor-door-areas', doorId)
  await page.mouse.click(doorCenter.x, doorCenter.y)
  await sleep(page, 350)
  const rotateHandle = await handleScreen(page, 'rotate')
  const doorCenterForRotation = await featureCenter(page, 'floor-door-areas', doorId)
  const handleDistance = Math.hypot(rotateHandle.x - doorCenterForRotation.x, rotateHandle.y - doorCenterForRotation.y)
  check('rotation handle stays close in screen space', handleDistance > 24 && handleDistance < 120, handleDistance)
  await drag(page, rotateHandle, { x: rotateHandle.x + 55, y: rotateHandle.y + 35 })
  doorCenter = await featureCenter(page, 'floor-door-areas', doorId)
  await page.mouse.click(doorCenter.x, doorCenter.y)
  await sleep(page, 350)
  await drag(page, doorCenter, rightCenter)
  await sleep(page, 7000)
  snapshot = await floorSnapshot(page, mapId)
  door = snapshot.floor?.doors?.find((candidate) => candidate.id === doorId)
  check('Door corner drag resizes the canonical rectangle', Number(door?.width) !== Number(widthBefore), { before: widthBefore, after: door?.width })
  check('Door rotation persists on the canonical object', Math.abs(Number(door?.rotation ?? 0)) > 0.01, door?.rotation)
  check('moving Door into another Room reparents it', door?.roomId === 'room-right', door?.roomId)
  check('Door remains nested under its Room in the Outliner', (await page.locator('main').innerText()).includes('Browser Main Door'))

  const movedGeometry = JSON.stringify((await sourceFeatures(page, 'floor-door-areas'))[0]?.geometry)
  await page.keyboard.press('Control+z')
  await sleep(page, 650)
  const undoGeometry = JSON.stringify((await sourceFeatures(page, 'floor-door-areas'))[0]?.geometry)
  await page.keyboard.press('Control+Shift+z')
  await sleep(page, 650)
  const redoGeometry = JSON.stringify((await sourceFeatures(page, 'floor-door-areas'))[0]?.geometry)
  check('Door move participates in undo/redo', undoGeometry !== movedGeometry && redoGeometry === movedGeometry)

  await page.getByRole('button', { name: 'Navigation', exact: true }).click()
  await clickTool(page, 'Stair')
  await drag(page, { x: leftCenter.x - 28, y: leftCenter.y - 90 }, { x: leftCenter.x + 25, y: leftCenter.y - 45 })
  const stairs = await sourceFeatures(page, 'floor-stair-areas')
  check('Stair click-drag creates an editable footprint', stairs.length === 1, stairs.map((feature) => feature.properties?.id))
  check('Stair Inspector exposes rectangle editing', await page.getByRole('spinbutton', { name: 'Stair rotation' }).isVisible())

  await clickTool(page, 'Elevator')
  await drag(page, { x: rightCenter.x - 25, y: rightCenter.y + 45 }, { x: rightCenter.x + 28, y: rightCenter.y + 90 })
  const elevators = await sourceFeatures(page, 'floor-elevator-areas')
  check('Elevator click-drag creates an editable footprint', elevators.length === 1, elevators.map((feature) => feature.properties?.id))
  check('Elevator Inspector exposes rectangle editing', await page.getByRole('spinbutton', { name: 'Elevator rotation' }).isVisible())

  const entrances = (await sourceFeatures(page, 'floor-point-items')).filter((feature) => feature.properties?.type === 'entrance')
  check('Entrance remains visibly represented on the Floor canvas', entrances.some((feature) => feature.properties?.id === 'entrance-fixture'))

  await page.getByRole('button', { name: 'Architecture', exact: true }).click()
  await page.getByRole('button', { name: '2.5D', exact: true }).click()
  await sleep(page, 700)
  const mode25 = await page.evaluate(() => ({
    door: Boolean(window.__floorStabilizationMap.getLayer('floor-door-areas-extrusion')),
    stairCount: (() => { const data = window.__floorStabilizationMap.getSource('floor-stair-areas')?._data; return ((data?.features ? data : data?.geojson)?.features ?? []).length })(),
    elevatorCount: (() => { const data = window.__floorStabilizationMap.getSource('floor-elevator-areas')?._data; return ((data?.features ? data : data?.geojson)?.features ?? []).length })(),
  }))
  check('2.5D derives Door/Stair/Elevator visuals from populated 2D footprints', mode25.door && mode25.stairCount === 1 && mode25.elevatorCount === 1, mode25)
  await page.screenshot({ path: `${OUT}/01-25d-populated.png` })
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await sleep(page, 500)
  check('switching back to 2D keeps authored objects intact', (await sourceFeatures(page, 'floor-door-areas')).length === 1)

  const roomsCollapse = page.getByRole('button', { name: 'Collapse Rooms', exact: true })
  check('Rooms hierarchy exposes collapse control', await roomsCollapse.isVisible())
  await roomsCollapse.click()
  check('Rooms hierarchy collapses', await page.getByRole('button', { name: 'Expand Rooms', exact: true }).isVisible())
  await page.getByRole('button', { name: 'Expand Rooms', exact: true }).click()

  await sleep(page, 7000)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.maplibregl-map', { timeout: 30000 })
  await acquireMap(page)
  await sleep(page, 1800)
  snapshot = await floorSnapshot(page, mapId)
  door = snapshot.floor?.doors?.find((candidate) => candidate.id === doorId)
  check('Door and explicit route relationship survive save/reload', door?.name === 'Browser Main Door' && door?.routeConnection?.targetRouteNodeId === 'route-fixture-1', door)

  // A simulated optimistic-concurrency rejection must preserve the dirty
  // local graph and expose deliberate recovery, never auto-load the server.
  graphPostMode = 'conflict'
  await page.getByText('Browser Main Door', { exact: true }).first().click()
  await page.locator('main input:not([type])').last().fill('Dirty Browser Door')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const recovery = page.getByRole('button', { name: 'Load server version', exact: true })
  await recovery.waitFor({ state: 'visible', timeout: 10000 })
  const conflictSnapshot = await floorSnapshot(page, mapId)
  const dirtyDoor = conflictSnapshot.floor?.doors?.find((candidate) => candidate.id === doorId)
  check('dirty server conflict exposes explicit recovery UI', await recovery.isVisible())
  check('dirty server conflict preserves local authored work', dirtyDoor?.name === 'Dirty Browser Door', dirtyDoor?.name)
  check('browser run has no uncaught page errors', pageErrors.length === 0, pageErrors)
} catch (error) {
  check('browser run completed without uncaught error', false, String(error?.stack ?? error))
  await page.screenshot({ path: `${OUT}/debug-failure.png`, fullPage: true }).catch(() => {})
} finally {
  if (shellCreated) {
    const cleanup = await page.evaluate(async (id) => {
      localStorage.removeItem(`navi-graph-${id}`)
      localStorage.removeItem(`navi-sync-status-${id}`)
      const parsed = JSON.parse(localStorage.getItem('navi-campus-maps') || '{}')
      if (Array.isArray(parsed.maps)) parsed.maps = parsed.maps.filter((map) => map.id !== id)
      if (Array.isArray(parsed.state?.maps)) parsed.state.maps = parsed.state.maps.filter((map) => map.id !== id)
      localStorage.setItem('navi-campus-maps', JSON.stringify(parsed))
      const response = await fetch(`/api/campus-maps?map_id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
      return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) }
    }, mapId).catch((error) => ({ ok: false, error: String(error) }))
    check('disposable campus-map shell removed', cleanup.ok, cleanup)
  }
  await browser.close()
  const failed = results.filter((result) => !result.ok)
  console.log(`\nFLOOR EDITOR BROWSER VALIDATION — ${failed.length === 0 ? 'PASS' : 'FAIL'} (${results.length - failed.length}/${results.length})`)
  process.exit(failed.length === 0 ? 0 : 1)
}
