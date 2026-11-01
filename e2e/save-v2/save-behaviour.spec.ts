// Save v2 browser probe (Task 18): network silence, explicit Save, private floor plans,
// strict locks and two admins editing at once — against a real Next dev server and the
// disposable local database. Run with `node e2e/save-v2/run.mjs`.
//
// Edits are dispatched through the mounted editor (window.__naviStudioV2, a dev-only hook)
// rather than by drawing on the MapLibre canvas: this probe checks what reaches the network
// and the database; canvas gestures are covered by the editor interaction tests.
import { randomBytes, randomUUID } from 'node:crypto'
import path from 'node:path'
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

const ORIGIN = 'http://127.0.0.1:3118'
const LIBRARY = 'bld-library'
const GYM = 'bld-gym'
const NORTH = 'road-north'
const SOUTH = 'road-south'
const BUILDING_DENIED = 'ana is currently editing this building — try editing other buildings.'
const TERRAIN_DENIED = 'ana is using the terrain editor.'
const PLAN_IMAGE = path.join(__dirname, '..', 'test-floor-plan.png')

interface ApiRequest {
  method: string
  path: string
  body: string
}

interface Admin {
  context: BrowserContext
  page: Page
  requests: ApiRequest[]
  blocked: string[]
}

type ProbeWindow = Window & {
  __naviStudioV2?: {
    context: { document: Record<string, any>; services: { get(id: string): any } }
    session: {
      save(doc?: unknown): Promise<{ kind: string }>
      writeDraft(doc?: unknown): Promise<void>
      isDirty(doc?: unknown): boolean
      zones: { held(): string[]; release(zones: string[]): Promise<void> }
    }
  }
}

function floor(id: string, label: string) {
  return {
    id, level: 0, label, shortLabel: 'F1', elevation: 0, height: 3.5, visible: true, locked: false,
    rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], metadata: {},
  }
}

function building(id: string, name: string, code: string, baseLng: number) {
  return {
    id, name, code, category: 'academic', description: `Probe ${name}`,
    footprint: { points: [
      { lat: 14.6, lng: baseLng }, { lat: 14.6, lng: baseLng + 0.001 }, { lat: 14.601, lng: baseLng + 0.001 },
      { lat: 14.601, lng: baseLng }, { lat: 14.6, lng: baseLng },
    ] },
    baseElevation: 0, height: 10, floors: [floor(`${id}-floor-1`, 'Floor 1')],
    verticalConnectors: [], verticalTransitions: [], color: '#4682b4', aliases: [], metadata: {},
  }
}

function road(id: string, name: string, lat: number) {
  return { id, name, polyline: { points: [{ lat, lng: 121.05 }, { lat, lng: 121.054 }] }, width: 4, surface: 'concrete', type: 'connector', metadata: {} }
}

function seedDocument(campusId: string) {
  return {
    schemaVersion: 1,
    version: 1,
    connectivitySemanticsVersion: '1.0.0',
    metadata: { campusId, name: 'Save v2 Probe Campus', description: 'Synthetic browser probe campus', lastModified: '2026-11-01T00:00:00.000Z', editorVersion: '1.5-probe' },
    buildings: [building(LIBRARY, 'Library', 'LIB', 121.05), building(GYM, 'Gym', 'GYM', 121.052)],
    roads: [road(NORTH, 'North Road', 14.6025), road(SOUTH, 'South Road', 14.5995)],
    roadJunctions: [],
    separatedCrossings: [],
    panoramas: [],
    qrCheckpoints: [],
    areas: [],
    boundary: { points: [{ lat: 14.599, lng: 121.049 }, { lat: 14.603, lng: 121.049 }, { lat: 14.603, lng: 121.055 }, { lat: 14.599, lng: 121.049 }] },
  }
}

function mockSession(name: string): string {
  const user = { id: `e2e-${name}`, name, email: `${name}@example.test`, role: 'super_admin', campus_id: null }
  return Buffer.from(JSON.stringify(user)).toString('base64')
}

async function openAdmin(browser: Browser, name: 'ana' | 'ben'): Promise<Admin> {
  const context = await browser.newContext({ baseURL: ORIGIN, viewport: { width: 1440, height: 900 } })
  await context.addCookies([{ name: 'navi-mock-session', value: mockSession(name), url: ORIGIN, sameSite: 'Lax' }])
  const requests: ApiRequest[] = []
  const blocked: string[] = []
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.hostname !== '127.0.0.1') {
      blocked.push(`${request.method()} ${url.origin}`)
      return route.abort('blockedbyclient')
    }
    if (url.pathname.startsWith('/api/')) requests.push({ method: request.method(), path: url.pathname, body: request.postData() ?? '' })
    return route.continue()
  })
  const page = await context.newPage()
  return { context, page, requests, blocked }
}

async function createCampus(admin: Admin): Promise<string> {
  const campusId = `probe-${randomBytes(6).toString('hex')}`
  const response = await admin.page.request.post('/api/studio/v2/campuses', {
    headers: { 'x-navi-studio-session': randomUUID() },
    data: {
      campusId,
      name: 'Save v2 Probe Campus',
      settings: { schoolName: 'ASU', boundary: [], center: { lat: 14.6005, lng: 121.051 }, stats: { buildings: 2, nodes: 0, edges: 0 }, updatedAt: '2026-11-01T00:00:00.000Z', landmarkTypes: [], landmarkInstances: [] },
    },
  })
  expect(response.status()).toBe(201)
  return campusId
}

async function waitForEditor(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as ProbeWindow).__naviStudioV2?.session), undefined, { timeout: 120_000 })
}

/** Ana creates the campus, saves the seed document through the real client, and frees every lock. */
async function seededCampus(ana: Admin): Promise<string> {
  const campusId = await createCampus(ana)
  await ana.page.goto(`/studio/${campusId}/edit`)
  await waitForEditor(ana.page)
  const outcome = await ana.page.evaluate(async (seed) => {
    const probe = (window as ProbeWindow).__naviStudioV2!
    probe.context.services.get('documentStore').adoptSnapshot(seed)
    const result = await probe.session.save(probe.context.document)
    await probe.session.zones.release(probe.session.zones.held())
    return result.kind === 'saved' ? 'saved' : JSON.stringify(result).slice(0, 2000)
  }, seedDocument(campusId))
  expect(outcome).toBe('saved')
  return campusId
}

async function openMap(admin: Admin, campusId: string): Promise<void> {
  await admin.page.goto(`/studio/${campusId}/edit`)
  await waitForEditor(admin.page)
  await expect(admin.page.getByRole('treeitem', { name: /Library/ })).toBeVisible({ timeout: 60_000 })
}

async function openFloor(admin: Admin, campusId: string, buildingId = LIBRARY): Promise<void> {
  await admin.page.goto(`/studio/${campusId}/edit/building/${buildingId}/floor/0`)
  await waitForEditor(admin.page)
}

function dispatch(page: Page, command: { id: string; label: string; payload: Record<string, unknown> }) {
  return page.evaluate((cmd) => {
    const result = (window as ProbeWindow).__naviStudioV2!.context.services.get('dispatcher').execute(cmd)
    if (result && result.success === false) throw new Error(`${cmd.id} failed: ${result.error}`)
  }, command)
}

function rename(page: Page, entityId: string, name: string) {
  return dispatch(page, { id: 'entity.update', label: 'Rename', payload: { entityId, changes: { name } } })
}

function drawWall(page: Page, buildingId: string, x: number) {
  return dispatch(page, {
    id: 'wall.create', label: 'Draw wall',
    payload: { buildingId, floorId: `${buildingId}-floor-1`, start: { x, y: 0 }, end: { x, y: 6 } },
  })
}

function documentValue<T>(page: Page, read: string): Promise<T> {
  return page.evaluate((source) => {
    const doc = (window as ProbeWindow).__naviStudioV2?.context.document
    // eslint-disable-next-line no-new-func
    return doc ? (new Function('doc', `return (${source})`) as (d: unknown) => unknown)(doc) : undefined
  }, read) as Promise<T>
}

const roadName = (page: Page, id: string) => documentValue<string>(page, `doc.roads.find((r) => r.id === ${JSON.stringify(id)})?.name`)

async function clickSave(page: Page): Promise<number> {
  const response = page.waitForResponse((r) => r.url().endsWith('/api/studio/v2/save') && r.request().method() === 'POST', { timeout: 30_000 })
  await page.getByRole('button', { name: 'Save campus changes' }).click()
  return (await response).status()
}

const saves = (admin: Admin) => admin.requests.filter((r) => r.method === 'POST' && r.path === '/api/studio/v2/save')
const legacy = (admin: Admin) => admin.requests.filter((r) => r.path === '/api/graph' || r.path === '/api/campus-maps' || r.path === '/api/studio/scoped-save' || r.path === '/api/publish')

test.afterEach(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close()
})

test('S1 — edits, undo/redo, idle and a hidden tab send no save and no legacy request', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana)
  await openFloor(ana, campusId)
  const before = ana.requests.length

  await drawWall(ana.page, LIBRARY, 2)
  const wallId = await documentValue<string>(ana.page, `doc.buildings.find((b) => b.id === '${LIBRARY}').floors[0].walls.at(-1).id`)
  await dispatch(ana.page, { id: 'wall.update', label: 'Drag wall', payload: { wallId, buildingId: LIBRARY, floorId: `${LIBRARY}-floor-1`, patch: { start: { x: 3, y: 0 }, end: { x: 3, y: 6 } } } })
  await ana.page.evaluate(async () => {
    const services = (window as ProbeWindow).__naviStudioV2!.context.services
    services.get('history').undo()
    services.get('history').redo()
    // Drawing tools call workflow.save('manual') after each confirm: still a local draft only (R46).
    await services.get('workflow').save('manual')
  })
  await ana.page.waitForTimeout(60_000)
  await ana.page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await ana.page.waitForTimeout(1_000)

  const after = ana.requests.slice(before)
  expect(after.filter((r) => r.path === '/api/studio/v2/save')).toHaveLength(0)
  expect(after.filter((r) => r.path === '/api/graph')).toHaveLength(0)
  expect(legacy(ana)).toHaveLength(0)
  // Only map tiles try to leave the machine (and are blocked); no data request does.
  expect(ana.blocked.filter((entry) => !entry.endsWith('://tile.openstreetmap.org'))).toEqual([])
  expect(await ana.page.evaluate(() => (window as ProbeWindow).__naviStudioV2!.session.isDirty())).toBe(true)
})

test('S2 — Save sends one request with only the changed floor part, no plan image and no data URI', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana)
  await openFloor(ana, campusId)
  await ana.page.locator('input[type="file"]').first().setInputFiles(PLAN_IMAGE)
  await expect.poll(() => documentValue<string>(ana.page, `doc.buildings.find((b) => b.id === '${LIBRARY}').floors[0].planImageId ?? ''`)).toMatch(/^blob:/)
  await drawWall(ana.page, LIBRARY, 2)
  const before = saves(ana).length

  const response = ana.page.waitForResponse((r) => r.url().endsWith('/api/studio/v2/save') && r.request().method() === 'POST')
  await ana.page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => undefined)
  await ana.page.keyboard.press('Control+s')
  expect((await response).status()).toBe(200)
  await ana.page.waitForTimeout(1_000)

  const sent = saves(ana).slice(before)
  expect(sent).toHaveLength(1)
  const body = JSON.parse(sent[0].body) as { changes: Array<{ partKey: string }> }
  expect(body.changes.map((change) => change.partKey)).toEqual([`floor:${LIBRARY}:${LIBRARY}-floor-1`])
  expect(sent[0].body).not.toContain('planImageId')
  expect(sent[0].body).not.toContain('data:')
  expect(sent[0].body).not.toContain('blob:')
  await expect(ana.page.getByText(/Saved · #\d+/)).toBeVisible()
})

test('S3 — the floor plan stays on the tracing admin’s computer; the other admin sees only the walls', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana)
  await openFloor(ana, campusId)
  await ana.page.locator('input[type="file"]').first().setInputFiles(PLAN_IMAGE)
  await expect.poll(() => documentValue<string>(ana.page, `doc.buildings.find((b) => b.id === '${LIBRARY}').floors[0].planImageId ?? ''`)).toMatch(/^blob:/)
  await drawWall(ana.page, LIBRARY, 1)
  await drawWall(ana.page, LIBRARY, 4)
  const outcome = await ana.page.evaluate(async () => {
    const probe = (window as ProbeWindow).__naviStudioV2!
    const result = await probe.session.save()
    // Leaving the building frees its lock (as LeaveBuildingRelease / idle release would).
    await probe.session.zones.release(probe.session.zones.held())
    return result.kind
  })
  expect(outcome).toBe('saved')

  const ben = await openAdmin(browser, 'ben')
  await openFloor(ben, campusId)
  await expect.poll(() => documentValue<number>(ben.page, `doc.buildings.find((b) => b.id === '${LIBRARY}').floors[0].walls?.length ?? 0`)).toBe(2)
  expect(await documentValue<string | null>(ben.page, `doc.buildings.find((b) => b.id === '${LIBRARY}').floors[0].planImageId ?? null`)).toBeNull()
  expect(await ben.page.locator('img[src^="blob:"], img[src^="data:"]').count()).toBe(0)
  expect(ben.requests.some((r) => r.path.includes('floor-plans'))).toBe(false)
})

test('S4 — a building is strictly locked; the other admin edits another building; both saves succeed', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana)
  await openMap(ana, campusId)
  await ana.page.getByRole('treeitem', { name: /Library/ }).click()
  await expect.poll(() => ana.page.evaluate(() => (window as ProbeWindow).__naviStudioV2!.session.zones.held())).toContain(`building:${LIBRARY}`)

  const ben = await openAdmin(browser, 'ben')
  await openMap(ben, campusId)
  await ben.page.getByRole('treeitem', { name: /Library/ }).click()
  await expect(ben.page.getByTestId('zone-denied-dialog')).toContainText(BUILDING_DENIED)
  await ben.page.getByTestId('zone-denied-dialog').getByRole('button', { name: 'OK' }).click()

  await ben.page.getByRole('treeitem', { name: /Gym/ }).click()
  await expect.poll(() => ben.page.evaluate(() => (window as ProbeWindow).__naviStudioV2!.session.zones.held())).toContain(`building:${GYM}`)
  await rename(ben.page, GYM, 'Gym (ben)')
  expect(await clickSave(ben.page)).toBe(200)

  await rename(ana.page, LIBRARY, 'Library (ana)')
  expect(await clickSave(ana.page)).toBe(200)
  await expect(ana.page.getByText(/Saved · #\d+/)).toBeVisible()
  await expect(ben.page.getByText(/Saved · #\d+/)).toBeVisible()
})

test('S5 — different roads merge within 20 s; the same road reports who changed it', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana)
  await openMap(ana, campusId)
  const ben = await openAdmin(browser, 'ben')
  await openMap(ben, campusId)

  await rename(ana.page, NORTH, 'North (ana)')
  await rename(ben.page, SOUTH, 'South (ben)')
  expect(await clickSave(ana.page)).toBe(200)
  expect(await clickSave(ben.page)).toBe(200)
  await expect.poll(() => roadName(ben.page, NORTH), { timeout: 20_000 }).toBe('North (ana)')
  await expect.poll(() => roadName(ana.page, SOUTH), { timeout: 20_000 }).toBe('South (ben)')

  // Ben's unsaved edit is never overwritten by the merge; his later save is stale.
  await rename(ben.page, NORTH, 'North (ben)')
  await rename(ana.page, NORTH, 'North (ana, again)')
  expect(await clickSave(ana.page)).toBe(200)
  expect(await clickSave(ben.page)).toBe(409)
  await expect(ben.page.getByText('This road was changed by ana')).toBeVisible()
  expect(await roadName(ben.page, NORTH)).toBe('North (ben)')
})

test('S6 — closing without saving keeps a draft; reopening offers Restore and brings the edit back', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana)
  await openMap(ana, campusId)
  await rename(ana.page, NORTH, 'North (draft)')
  await ana.page.evaluate(() => (window as ProbeWindow).__naviStudioV2!.context.services.get('workflow').save('autosave'))
  await ana.page.close({ runBeforeUnload: false })

  const page = await ana.context.newPage()
  ana.page = page
  const questions: string[] = []
  page.on('dialog', (dialog) => {
    questions.push(dialog.message())
    void dialog.accept()
  })
  await openMap(ana, campusId)
  expect(questions.some((question) => /unsaved work on this computer/.test(question) && /Restore it\?/.test(question))).toBe(true)
  await expect.poll(() => roadName(page, NORTH)).toBe('North (draft)')
  expect(await page.evaluate(() => (window as ProbeWindow).__naviStudioV2!.session.isDirty())).toBe(true)
  await expect(page.getByText('Unsaved changes')).toBeVisible()
})

test('S7 — terrain is one admin at a time; the other admin can still edit a building', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana)
  await openMap(ana, campusId)
  await ana.page.getByTestId('terrain-draw-start').click()
  await expect.poll(() => ana.page.evaluate(() => (window as ProbeWindow).__naviStudioV2!.session.zones.held())).toContain('terrain')

  const ben = await openAdmin(browser, 'ben')
  await openMap(ben, campusId)
  await ben.page.getByTestId('terrain-draw-start').click()
  await expect(ben.page.getByTestId('zone-denied-dialog')).toContainText(TERRAIN_DENIED)
  await expect(ben.page.getByTestId('terrain-draw-finish')).toHaveCount(0)
  await ben.page.getByTestId('zone-denied-dialog').getByRole('button', { name: 'OK' }).click()

  await ben.page.getByRole('treeitem', { name: /Gym/ }).click()
  await expect.poll(() => ben.page.evaluate(() => (window as ProbeWindow).__naviStudioV2!.session.zones.held())).toContain(`building:${GYM}`)
  await rename(ben.page, GYM, 'Gym (ben)')
  expect(await clickSave(ben.page)).toBe(200)
})


test('S8 — the publish route loads under a real Next server, compiles the saved commit and refuses an unconnected campus', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana)
  const response = await ana.page.request.post('/api/studio/v2/publish', {
    headers: { 'x-navi-studio-session': randomUUID() },
    data: { campusId, commitNo: 1 },
  })
  // The probe campus has two roads and no entrance, so the server-side compile must refuse it.
  // A structured compiler verdict proves the route's module graph loads (Task 12 VERIFY);
  // a successful publish of a connected campus is checked by the parity run (Task 19).
  const body = await response.json() as { code?: string; diagnostics?: Array<{ code: string }> }
  expect(response.status()).toBe(422)
  expect(body.code).toBe('COMPILE_FAILED')
  expect(body.diagnostics?.map((diagnostic) => diagnostic.code)).toContain('HALLWAY_DISCONNECTED')
})
