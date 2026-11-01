// Shared helpers for the Save v2 browser probes (save-behaviour, parity).
import { randomBytes, randomUUID } from 'node:crypto'
import path from 'node:path'
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

export const ORIGIN = 'http://127.0.0.1:3118'
export const LIBRARY = 'bld-library'
export const GYM = 'bld-gym'
export const NORTH = 'road-north'
export const SOUTH = 'road-south'
export const BUILDING_DENIED = 'ana is currently editing this building — try editing other buildings.'
export const TERRAIN_DENIED = 'ana is using the terrain editor.'
export const PLAN_IMAGE = path.join(__dirname, '..', 'test-floor-plan.png')

export interface ApiRequest {
  method: string
  path: string
  body: string
}

export interface Admin {
  context: BrowserContext
  page: Page
  requests: ApiRequest[]
  blocked: string[]
}

export type ProbeWindow = Window & {
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

export function floor(id: string, label: string) {
  return {
    id, level: 0, label, shortLabel: 'F1', elevation: 0, height: 3.5, visible: true, locked: false,
    rooms: [], hallways: [], staircases: [], elevators: [], entrances: [], connectorStops: [], parametricComponents: [], metadata: {},
  }
}

export function building(id: string, name: string, code: string, baseLng: number) {
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

export function road(id: string, name: string, lat: number) {
  return { id, name, polyline: { points: [{ lat, lng: 121.05 }, { lat, lng: 121.054 }] }, width: 4, surface: 'concrete', type: 'connector', metadata: {} }
}

export function seedDocument(campusId: string) {
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

export function mockSession(name: string): string {
  const user = { id: `e2e-${name}`, name, email: `${name}@example.test`, role: 'super_admin', campus_id: null }
  return Buffer.from(JSON.stringify(user)).toString('base64')
}

export async function openAdmin(browser: Browser, name: 'ana' | 'ben'): Promise<Admin> {
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

export async function createCampus(admin: Admin): Promise<string> {
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

export async function waitForEditor(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean((window as ProbeWindow).__naviStudioV2?.session), undefined, { timeout: 120_000 })
}

/** Ana creates the campus, saves the seed document through the real client, and frees every lock. */
export async function seededCampus(ana: Admin, makeDocument: (campusId: string) => unknown = seedDocument): Promise<string> {
  const campusId = await createCampus(ana)
  await ana.page.goto(`/studio/${campusId}/edit`)
  await waitForEditor(ana.page)
  const outcome = await ana.page.evaluate(async (seed) => {
    const probe = (window as ProbeWindow).__naviStudioV2!
    probe.context.services.get('documentStore').adoptSnapshot(seed)
    const result = await probe.session.save(probe.context.document)
    await probe.session.zones.release(probe.session.zones.held())
    return result.kind === 'saved' ? 'saved' : JSON.stringify(result).slice(0, 2000)
  }, makeDocument(campusId))
  expect(outcome).toBe('saved')
  return campusId
}

export async function openMap(admin: Admin, campusId: string, ready: RegExp = /Library/): Promise<void> {
  await admin.page.goto(`/studio/${campusId}/edit`)
  await waitForEditor(admin.page)
  await expect(admin.page.getByRole('treeitem', { name: ready }).first()).toBeVisible({ timeout: 60_000 })
}

export async function openFloor(admin: Admin, campusId: string, buildingId = LIBRARY): Promise<void> {
  await admin.page.goto(`/studio/${campusId}/edit/building/${buildingId}/floor/0`)
  await waitForEditor(admin.page)
}

export function dispatch(page: Page, command: { id: string; label: string; payload: Record<string, unknown> }) {
  return page.evaluate((cmd) => {
    const result = (window as ProbeWindow).__naviStudioV2!.context.services.get('dispatcher').execute(cmd)
    if (result && result.success === false) throw new Error(`${cmd.id} failed: ${result.error}`)
  }, command)
}

export function rename(page: Page, entityId: string, name: string) {
  return dispatch(page, { id: 'entity.update', label: 'Rename', payload: { entityId, changes: { name } } })
}

export function drawWall(page: Page, buildingId: string, x: number) {
  return dispatch(page, {
    id: 'wall.create', label: 'Draw wall',
    payload: { buildingId, floorId: `${buildingId}-floor-1`, start: { x, y: 0 }, end: { x, y: 6 } },
  })
}

export function documentValue<T>(page: Page, read: string): Promise<T> {
  return page.evaluate((source) => {
    const doc = (window as ProbeWindow).__naviStudioV2?.context.document
    // eslint-disable-next-line no-new-func
    return doc ? (new Function('doc', `return (${source})`) as (d: unknown) => unknown)(doc) : undefined
  }, read) as Promise<T>
}

export const roadName = (page: Page, id: string) => documentValue<string>(page, `doc.roads.find((r) => r.id === ${JSON.stringify(id)})?.name`)

export async function clickSave(page: Page): Promise<number> {
  const response = page.waitForResponse((r) => r.url().endsWith('/api/studio/v2/save') && r.request().method() === 'POST', { timeout: 30_000 })
  await page.getByRole('button', { name: 'Save campus changes' }).click()
  return (await response).status()
}

export const saves = (admin: Admin) => admin.requests.filter((r) => r.method === 'POST' && r.path === '/api/studio/v2/save')
export const legacy = (admin: Admin) => admin.requests.filter((r) => r.path === '/api/graph' || r.path === '/api/campus-maps' || r.path === '/api/studio/scoped-save' || r.path === '/api/publish')


/** Page-side helpers installed before any page script: run a command, read or directly edit the document. */
export async function installEditorHelpers(admin: Admin): Promise<void> {
  await admin.context.addInitScript(() => {
    const probe = () => (window as unknown as { __naviStudioV2: { context: { document: any; services: { get(id: string): any } } } }).__naviStudioV2
    ;(window as unknown as { __p: unknown }).__p = {
      run(command: { id: string; label?: string; payload: Record<string, unknown> }) {
        const result = probe().context.services.get('dispatcher').execute({ label: command.id, ...command })
        if (result && result.success === false) throw new Error(`${command.id}: ${result.error}`)
        return result
      },
      doc() {
        return probe().context.document
      },
      /** For authored data that no single Studio command creates (tools compose it). */
      edit(mutate: (doc: any) => void) {
        const next = structuredClone(probe().context.document)
        mutate(next)
        probe().context.services.get('documentStore').adoptSnapshot(next)
        probe().context.services.get('eventBus').emit('document.changed', { entityType: 'probe' })
      },
      history() {
        return probe().context.services.get('history')
      },
    }
  })
}

/** Open a fresh browser context as `name`, load the campus map and return the loaded document. */
export async function freshDocument(browser: Browser, campusId: string, name: 'ana' | 'ben' = 'ben'): Promise<any> {
  const admin = await openAdmin(browser, name)
  await openMap(admin, campusId)
  const doc = await admin.page.evaluate(() => structuredClone((window as ProbeWindow).__naviStudioV2!.context.document))
  await admin.context.close()
  return doc
}

/** Explicit Save on whichever Studio page is open (toolbar button on the map, Ctrl+S in the floor editor). */
export async function saveNow(page: Page): Promise<void> {
  const response = page.waitForResponse((r) => r.url().endsWith('/api/studio/v2/save') && r.request().method() === 'POST', { timeout: 30_000 })
  const button = page.getByRole('button', { name: 'Save campus changes' })
  if (await button.count()) await button.click()
  else await page.keyboard.press('Control+s')
  const answer = await response
  expect(answer.status(), await answer.text()).toBe(200)
  // The save is finished when the status line says so (drafts cleared, workflow settled).
  await expect(page.getByText(/Saved · #\d+/).first()).toBeVisible()
}
