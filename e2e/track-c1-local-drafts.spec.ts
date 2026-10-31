import { chromium, expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { Graph } from '../src/engine/graph'
import { GraphAdapter } from '../packages/editor/src/graph-adapter'
import { CoordinateTransformer } from '../packages/core/src/coordinates/transformer'
import type { CampusDocument } from '../packages/core/src/types/document'
import type { StudioDraftRecord } from '../src/services/studio-local-drafts'

const campusId = 'synthetic-track-c1-campus'
const buildingId = 'synthetic-building-a'
const secondBuildingId = 'synthetic-building-b'
const initialRevision = '2026-10-28T00:00:00.000Z'
const updatedRevision = '2026-10-28T00:01:00.000Z'
const draftsDisabled = process.env.NAVI_TRACK_C1_DRAFTS_DISABLED === '1'
const appPort = Number(process.env.NAVI_TRACK_C1_PORT ?? (draftsDisabled ? 3188 : 3187))
const scopedHistoryEnabled = process.env.NAVI_TRACK_E2_SCOPED_HISTORY === '1'

type LocalHarness = {
  postBodies: Array<{ authoredDocument?: CampusDocument }>
  scopedHistoryRequests: Array<Record<string, unknown>>
  externalAttempts: string[]
  unexpectedApiAttempts: string[]
  delayedAck: boolean
  releaseAck: (() => void) | null
  serverDocument: CampusDocument
}

function makeFloor(id: string, level: number, roomId: string, roomName: string) {
  return {
    id,
    level,
    label: level === 0 ? 'Ground Floor' : 'First Floor',
    shortLabel: level === 0 ? 'GF' : '1F',
    elevation: level * 3.5,
    height: 3.5,
    rooms: [{
      id: roomId,
      name: roomName,
      number: level === 0 ? 'G01' : '101',
      category: 'classroom' as const,
      polygon: { points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }, { x: 0, y: 0 }] },
      roomDoors: [],
      metadata: { description: 'Synthetic local-only room' },
    }],
    hallways: [],
    staircases: [],
    elevators: [],
    entrances: [],
    connectorStops: [],
    parametricComponents: [],
    metadata: {},
  }
}

function makeBuilding(id: string, name: string, roomPrefix: string) {
  return {
    id,
    name,
    code: id.toUpperCase(),
    category: 'academic' as const,
    description: 'Synthetic test building; no campus data is used.',
    footprint: { points: [
      { lat: 10.5000, lng: 122.0000 }, { lat: 10.5002, lng: 122.0000 },
      { lat: 10.5002, lng: 122.0002 }, { lat: 10.5000, lng: 122.0002 },
      { lat: 10.5000, lng: 122.0000 },
    ] },
    baseElevation: 0,
    height: 7,
    floors: [
      makeFloor(`${id}-gf`, 0, `${roomPrefix}-gf`, `${name} GF Room`),
      makeFloor(`${id}-1f`, 1, `${roomPrefix}-1f`, `${name} 1F Room`),
    ],
    verticalConnectors: [],
    color: '#3B82F6',
    aliases: [],
    metadata: {},
  }
}

function makeDocument(): CampusDocument {
  return {
    schemaVersion: 1,
    version: 1,
    metadata: {
      campusId,
      name: 'Synthetic Track C1 Campus',
      description: 'Synthetic test data, isolated from all cloud campus data.',
      lastModified: initialRevision,
      editorVersion: 'track-c1-local-test',
    },
    buildings: [
      makeBuilding(buildingId, 'Synthetic Building A', 'room-a'),
      makeBuilding(secondBuildingId, 'Synthetic Building B', 'room-b'),
    ],
    roads: [],
    panoramas: [],
    qrCheckpoints: [],
  }
}

function graphPayload(document: CampusDocument) {
  const graph = new Graph()
  graph.campusId = campusId
  new GraphAdapter(graph, new CoordinateTransformer()).sync(document)
  return {
    ...graph.toJSON(),
    authoredDocumentFormatVersion: 1,
    authoredDocument: document,
  }
}

async function installHarness(page: Page, options: { delayedAck?: boolean; initialDocument?: CampusDocument } = {}): Promise<LocalHarness> {
  const baseDocument = options.initialDocument ?? makeDocument()
  const harness: LocalHarness = {
    postBodies: [],
    scopedHistoryRequests: [],
    externalAttempts: [],
    unexpectedApiAttempts: [],
    delayedAck: options.delayedAck ?? false,
    releaseAck: null,
    serverDocument: baseDocument as CampusDocument,
  }
  const admin = {
    id: 'mock-super-admin',
    name: 'Local Test Admin',
    email: 'admin@asu.edu',
    role: 'super_admin',
    campus_id: null,
  }

  await page.context().addCookies([{
    name: 'navi-mock-session',
    value: Buffer.from(JSON.stringify(admin)).toString('base64'),
    url: `http://127.0.0.1:${appPort}`,
    httpOnly: false,
    sameSite: 'Lax',
  }])
  await page.addInitScript(({ id, initialGraph }) => {
    localStorage.setItem(`navi-graph-${id}`, JSON.stringify(initialGraph))
    ;(window as Window & { __naviFailDraftWrites?: boolean }).__naviFailDraftWrites = false
    const prototype = IDBObjectStore.prototype
    const originalPut = prototype.put
    const patchedPrototype = prototype as IDBObjectStore & { __naviTrackC1Patched?: boolean }
    if (!patchedPrototype.__naviTrackC1Patched) {
      Object.defineProperty(patchedPrototype, '__naviTrackC1Patched', { value: true })
      prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
        if ((window as Window & { __naviFailDraftWrites?: boolean }).__naviFailDraftWrites) {
          throw new DOMException('QuotaExceededError: synthetic local storage limit', 'QuotaExceededError')
        }
        return originalPut.apply(this, args)
      }
    }
  }, { id: campusId, initialGraph: graphPayload(baseDocument) })

  await page.context().route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' && url.port === String(appPort)) {
      if (url.pathname === '/api/dev/scoped-history') {
        if (!scopedHistoryEnabled || route.request().method() !== 'POST') {
          harness.unexpectedApiAttempts.push(`${route.request().method()} ${url.pathname}`)
          await route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"scoped-history endpoint blocked by flag-off harness"}' })
          return
        }
        harness.scopedHistoryRequests.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>)
        await route.continue()
        return
      }
      if (url.pathname === '/api/campus-maps' && route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"maps":[]}' })
        return
      }
      if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/graph')) {
        harness.unexpectedApiAttempts.push(`${route.request().method()} ${url.pathname}`)
        await route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"blocked by local harness"}' })
        return
      }
      await route.continue()
      return
    }
    harness.externalAttempts.push(`${route.request().method()} ${url.origin}${url.pathname}`)
    await route.abort('blockedbyclient')
  })

  await page.route('**/api/graph**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...graphPayload(harness.serverDocument as unknown as CampusDocument), updatedAt: initialRevision }),
      })
      return
    }
    if (route.request().method() === 'POST') {
      const payload = JSON.parse(route.request().postData() ?? '{}') as { authoredDocument?: CampusDocument }
      harness.postBodies.push(payload)
      if (harness.delayedAck) {
        await new Promise<void>((resolve) => { harness.releaseAck = resolve })
      }
      if (payload.authoredDocument) harness.serverDocument = payload.authoredDocument as CampusDocument
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ updatedAt: updatedRevision }),
      })
      return
    }
    await route.fulfill({ status: 405, body: 'method not allowed' })
  })

  page.on('pageerror', (error) => console.log(`[track-c1 pageerror] ${error.stack ?? error.message}`))
  page.on('response', (response) => {
    if (response.status() >= 400) console.log(`[track-c1 response] ${response.status()} ${response.url()}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(`[track-c1 console.error] ${message.text()}`)
  })
  const generatedGraph = graphPayload(baseDocument as CampusDocument)
  console.log(`[track-c1 fixture] graph buildings=${generatedGraph.buildings.length} ids=${generatedGraph.buildings.map((building) => building.id).join(',')}`)
  await page.goto(`/studio/${campusId}/edit/building/${buildingId}/floor/0`)
  const seededCache = await page.evaluate((id) => {
    const raw = localStorage.getItem(`navi-graph-${id}`)
    if (!raw) return { exists: false }
    const parsed = JSON.parse(raw)
    return {
      exists: true,
      graphBuildings: parsed.buildings?.map((building: { id: string }) => building.id) ?? [],
      authoredBuildings: parsed.authoredDocument?.buildings?.map((building: { id: string }) => building.id) ?? [],
      formatVersion: parsed.authoredDocumentFormatVersion,
    }
  }, campusId)
  console.log(`[track-c1 storage] ${JSON.stringify(seededCache)}`)
  await expect(page.getByText('Synthetic Building A', { exact: true }).first()).toBeVisible({ timeout: 60_000 })
  await continueFloorSetupIfNeeded(page)
  await expect(page.getByRole('heading', { name: 'Local draft needs a recovery choice' })).toHaveCount(0)
  return harness
}

async function continueFloorSetupIfNeeded(page: Page) {
  const continueLink = page.getByText('Continue without floor plan', { exact: true })
  if (await continueLink.count()) await continueLink.click()
}

async function editGroundRoomName(page: Page, newName: string, currentName = 'Synthetic Building A GF Room') {
  const nameInput = page.locator('input').nth(1)
  if (await nameInput.count() === 0 || await nameInput.inputValue().catch(() => '') !== currentName) {
    await page.getByText(currentName, { exact: true }).first().click()
  }
  await expect(nameInput).toHaveValue(currentName)
  await nameInput.fill(newName)
  await page.getByRole('button', { name: 'Save', exact: true }).last().click()
}

async function readStoredDraft(page: Page) {
  return page.evaluate(async ({ dbName, storeName, id }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      if (!db.objectStoreNames.contains(storeName)) return null
      return await new Promise<StudioDraftRecord | null>((resolve, reject) => {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(id)
        request.onsuccess = () => resolve((request.result as StudioDraftRecord | undefined) ?? null)
        request.onerror = () => reject(request.error)
      })
    } finally {
      db.close()
    }
  }, { dbName: 'navi-studio-local-drafts', storeName: 'campus-drafts', id: campusId })
}

test('local edits persist to IndexedDB, recover after reload, and stay isolated by floor/building', async ({ page }) => {
  test.skip(draftsDisabled, 'Local draft acceptance runs with the exact Development opt-in enabled.')
  const harness = await installHarness(page)
  await editGroundRoomName(page, 'C1 Edited Ground Room')
  await expect.poll(async () => (await readStoredDraft(page))?.authoredDocument?.buildings?.[0]?.floors?.[0]?.rooms?.[0]?.name).toBe('C1 Edited Ground Room')
  await expect(page.getByRole('status')).toContainText('Saved locally', { timeout: 30_000 })
  expect(harness.postBodies).toHaveLength(0)

  await page.screenshot({ path: 'reports/navi-studio-1.5-track-c1/logs/browser-local-draft-saved.png', fullPage: true })
  await page.reload()
  await expect(page.getByText('Synthetic Building A', { exact: true }).first()).toBeVisible()
  await continueFloorSetupIfNeeded(page)
  await expect(page.getByRole('status')).toContainText('Saved locally')
  await page.getByText('C1 Edited Ground Room', { exact: true }).first().click()
  await expect(page.locator('input').nth(1)).toHaveValue('C1 Edited Ground Room')

  await page.getByRole('link', { name: '1F' }).click()
  await expect(page).toHaveURL(/\/floor\/1$/)
  await expect(page.getByText('Synthetic Building A', { exact: true }).first()).toBeVisible()
  await continueFloorSetupIfNeeded(page)
  await page.getByRole('link', { name: 'GF' }).click()
  await expect(page).toHaveURL(/\/floor\/0$/)
  await continueFloorSetupIfNeeded(page)
  await page.goto(`/studio/${campusId}/edit/building/${secondBuildingId}/floor/0`)
  await expect(page.getByText('Synthetic Building B', { exact: true }).first()).toBeVisible()
  await continueFloorSetupIfNeeded(page)
  expect((await readStoredDraft(page))?.authoredDocument?.buildings?.[0]?.floors?.[0]?.rooms?.[0]?.name).toBe('C1 Edited Ground Room')
  expect(harness.postBodies).toHaveLength(0)
  expect(harness.externalAttempts).toEqual([])
  expect(harness.unexpectedApiAttempts).toEqual([])
})

test('E2 flag-off edits stay on the draft path and never call scoped history', async ({ page }) => {
  test.skip(draftsDisabled || scopedHistoryEnabled, 'This acceptance case requires local drafts on and scoped history off.')
  const harness = await installHarness(page)
  await editGroundRoomName(page, 'E2 Flag-Off Building Edit')

  await expect.poll(async () => (
    await readStoredDraft(page)
  )?.authoredDocument?.buildings?.[0]?.floors?.[0]?.rooms?.[0]?.name).toBe('E2 Flag-Off Building Edit')
  expect(harness.scopedHistoryRequests).toHaveLength(0)
  expect(harness.postBodies).toHaveLength(0)
  expect(harness.unexpectedApiAttempts).toEqual([])
  expect(harness.externalAttempts).toEqual([])
})

test('E2 flag-on edits validate locally, recover the draft, and start a fresh history session after reload', async ({ page }) => {
  test.skip(draftsDisabled || !scopedHistoryEnabled, 'This acceptance case requires both Development flags enabled.')
  const harness = await installHarness(page)

  await expect(page.getByTestId('scoped-history-status')).toContainText('Scoped history: local only; resets on reload')
  await expect.poll(() => harness.scopedHistoryRequests.filter((request) => request.type === 'initialize').length).toBe(1)
  const initialSession = String(harness.scopedHistoryRequests.find((request) => request.type === 'initialize')?.sessionId)

  await editGroundRoomName(page, 'E2 Flag-On Building Edit')
  await expect.poll(() => harness.scopedHistoryRequests.filter((request) => request.type === 'commit').length).toBe(1)
  const commit = harness.scopedHistoryRequests.find((request) => request.type === 'commit')
  expect(commit).toMatchObject({ campusId, documentId: `campus:${campusId}`, expectedRevision: 0 })
  expect(commit?.operations).toEqual(expect.arrayContaining([
    expect.objectContaining({ scope: { kind: 'building', id: buildingId } }),
  ]))
  await expect(page.getByTestId('scoped-history-status')).toContainText('not cloud-saved')
  await expect.poll(async () => (
    await readStoredDraft(page)
  )?.authoredDocument?.buildings?.[0]?.floors?.[0]?.rooms?.[0]?.name).toBe('E2 Flag-On Building Edit')
  expect(harness.postBodies).toHaveLength(0)
  expect(harness.unexpectedApiAttempts).toEqual([])
  expect(harness.externalAttempts).toEqual([])

  await page.reload()
  await expect(page.getByText('E2 Flag-On Building Edit', { exact: true }).first()).toBeVisible()
  await expect(page.getByTestId('scoped-history-status')).toContainText('Scoped history: local only; resets on reload')
  await expect.poll(() => harness.scopedHistoryRequests.filter((request) => request.type === 'initialize').length).toBe(2)
  const sessions = harness.scopedHistoryRequests
    .filter((request) => request.type === 'initialize')
    .map((request) => request.sessionId)
  expect(sessions[0]).toBe(initialSession)
  expect(new Set(sessions).size).toBe(2)
  expect(harness.scopedHistoryRequests.filter((request) => request.type === 'commit')).toHaveLength(1)
  expect(harness.postBodies).toHaveLength(0)
  expect(harness.unexpectedApiAttempts).toEqual([])
  expect(harness.externalAttempts).toEqual([])
})

test('E2 flag-on route-node deletion records a building routing scope', async ({ page }) => {
  test.skip(draftsDisabled || !scopedHistoryEnabled, 'This acceptance case requires both Development flags enabled.')
  const initialDocument = makeDocument()
  initialDocument.buildings[0].floors[0].routeNetwork = {
    nodes: [{ id: 'synthetic-route-node', type: 'waypoint', position: { x: 0, y: 0 }, floor: 0 }],
    edges: [],
  }
  const harness = await installHarness(page, { initialDocument })

  await expect.poll(() => harness.scopedHistoryRequests.filter((request) => request.type === 'initialize').length).toBe(1)
  await page.getByRole('button', { name: 'Navigation', exact: true }).click()
  const mapCanvas = page.locator('.maplibregl-canvas').first()
  const mapBounds = await mapCanvas.boundingBox()
  expect(mapBounds).not.toBeNull()
  // The seeded waypoint is at the synthetic building origin. Anchor to the
  // rendered map canvas dimensions instead of assuming a viewport pixel.
  await mapCanvas.click({ position: { x: mapBounds!.width * 0.545, y: mapBounds!.height * 0.45 } })
  await expect(page.getByText('Route Node', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click()

  await expect.poll(() => harness.scopedHistoryRequests.filter((request) => request.type === 'commit').length).toBe(1)
  const commit = harness.scopedHistoryRequests.find((request) => request.type === 'commit')
  expect(commit?.operations).toEqual(expect.arrayContaining([
    expect.objectContaining({ scope: { kind: 'routing', id: buildingId } }),
  ]))
  await expect(page.getByTestId('scoped-history-status')).toContainText('not cloud-saved')
  await expect.poll(async () => (
    await readStoredDraft(page)
  )?.authoredDocument?.buildings?.[0]?.floors?.[0]?.routeNetwork?.nodes?.length ?? 0).toBe(0)
  expect(harness.postBodies).toHaveLength(0)
  expect(harness.unexpectedApiAttempts).toEqual([])
  expect(harness.externalAttempts).toEqual([])
})

test('offline edits still persist locally and never issue a cloud graph write', async ({ page }) => {
  test.skip(draftsDisabled, 'Local draft acceptance runs with the exact Development opt-in enabled.')
  const harness = await installHarness(page)
  await page.context().setOffline(true)
  await editGroundRoomName(page, 'C1 Offline Edit')
  await expect(page.getByRole('status')).toContainText('Saved locally', { timeout: 30_000 })
  await expect.poll(async () => (await readStoredDraft(page))?.authoredDocument?.buildings?.[0]?.floors?.[0]?.rooms?.[0]?.name).toBe('C1 Offline Edit')
  expect(harness.postBodies).toHaveLength(0)
  await page.context().setOffline(false)
  expect(harness.externalAttempts).toEqual([])
  expect(harness.unexpectedApiAttempts).toEqual([])
})

test('an IndexedDB quota failure is surfaced without cloud fallback', async ({ page }) => {
  test.skip(draftsDisabled, 'Local draft acceptance runs with the exact Development opt-in enabled.')
  const harness = await installHarness(page)
  await page.evaluate(() => { (window as Window & { __naviFailDraftWrites?: boolean }).__naviFailDraftWrites = true })
  await editGroundRoomName(page, 'C1 Quota Edit')
  await expect(page.getByRole('status')).toContainText('Local save failed', { timeout: 30_000 })
  expect(harness.postBodies).toHaveLength(0)
  expect(harness.externalAttempts).toEqual([])
  expect(harness.unexpectedApiAttempts).toEqual([])
  await page.screenshot({ path: 'reports/navi-studio-1.5-track-c1/logs/browser-local-draft-quota-error.png', fullPage: true })
})

test('a malformed local draft is preserved and blocks editor recovery', async ({ page }) => {
  test.skip(draftsDisabled, 'Local draft acceptance runs with the exact Development opt-in enabled.')
  await installHarness(page)
  await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('navi-studio-local-drafts', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('campus-drafts', { keyPath: 'campusId' })
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('campus-drafts', 'readwrite')
      transaction.objectStore('campus-drafts').put({ campusId: id, schemaVersion: 999, payload: 'corrupt-synthetic-record' })
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()
  }, campusId)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Local draft needs a recovery choice' })).toBeVisible()
  await expect(page.getByText(/Unsupported local draft schema version: 999/)).toBeVisible()
  const preserved = await readStoredDraft(page)
  expect(preserved).toMatchObject({ campusId, schemaVersion: 999, payload: 'corrupt-synthetic-record' })
})

test('manual Cloud Save reports pending acknowledgment truthfully and keeps a later edit local', async ({ page }) => {
  test.skip(draftsDisabled, 'Local draft acceptance runs with the exact Development opt-in enabled.')
  const harness = await installHarness(page, { delayedAck: true })
  await editGroundRoomName(page, 'C1 Before Cloud Save')
  await expect(page.getByRole('status')).toContainText('Saved locally', { timeout: 30_000 })

  const saveButton = page.getByRole('button', { name: /Save/ }).first()
  await saveButton.click()
  await expect.poll(() => harness.postBodies.length).toBe(1)
  await expect(page.getByRole('status')).toContainText('Saved locally; syncing to cloud…')

  await editGroundRoomName(page, 'C1 Edit While Cloud Save Pending', 'C1 Before Cloud Save')
  await expect.poll(async () => (await readStoredDraft(page))?.authoredDocument?.buildings?.[0]?.floors?.[0]?.rooms?.[0]?.name).toBe('C1 Edit While Cloud Save Pending')
  await expect(page.getByRole('status')).toContainText('Saved locally; syncing to cloud…')
  harness.releaseAck?.()
  await expect(page.getByRole('status')).toContainText('Saved locally', { timeout: 30_000 })
  await expect(page.getByRole('status')).not.toContainText('and to cloud')
  expect(harness.serverDocument.buildings[0].floors[0].rooms[0].name).toBe('C1 Before Cloud Save')
  expect((await readStoredDraft(page))?.authoredDocument?.buildings?.[0]?.floors?.[0]?.rooms?.[0]?.name).toBe('C1 Edit While Cloud Save Pending')
  expect(harness.postBodies).toHaveLength(1)
  expect(harness.externalAttempts).toEqual([])
  expect(harness.unexpectedApiAttempts).toEqual([])
  await page.screenshot({ path: 'reports/navi-studio-1.5-track-c1/logs/browser-cloud-save-ack.png', fullPage: true })
})

test('manual Cloud Save shows cloud confirmation only after the latest edit is acknowledged', async ({ page }) => {
  test.skip(draftsDisabled, 'Cloud confirmation acceptance runs with the exact Development opt-in enabled.')
  const harness = await installHarness(page, { delayedAck: true })
  await editGroundRoomName(page, 'C1 Confirmed Cloud Edit')
  await expect(page.getByRole('status')).toContainText('Saved locally', { timeout: 30_000 })

  await page.getByRole('button', { name: /Save/ }).first().click()
  await expect.poll(() => harness.postBodies.length).toBe(1)
  await expect(page.getByRole('status')).toContainText('Saved locally; syncing to cloud…')
  harness.releaseAck?.()

  await expect(page.getByRole('status')).toContainText('Saved locally and to cloud', { timeout: 30_000 })
  expect(harness.serverDocument.buildings[0].floors[0].rooms[0].name).toBe('C1 Confirmed Cloud Edit')
  expect(harness.postBodies).toHaveLength(1)
  expect(harness.externalAttempts).toEqual([])
  expect(harness.unexpectedApiAttempts).toEqual([])
})

test('flag-disabled Floor Editor creates no IndexedDB draft and preserves revision conflict protection', async ({ page }) => {
  test.skip(!draftsDisabled, 'This assertion runs only in the local server configured with drafts disabled.')
  const harness = await installHarness(page)
  await editGroundRoomName(page, 'C1 Flag Disabled Room')
  await expect(page.getByText(/Outdated/)).toBeVisible()
  expect(await readStoredDraft(page)).toBeNull()
  await expect(page.getByText(/Saved locally/)).toHaveCount(0)
  expect(harness.postBodies).toHaveLength(0)
  expect(harness.externalAttempts).toEqual([])
  expect(harness.unexpectedApiAttempts).toEqual([])
})

test('a browser process restart recovers the latest local draft from IndexedDB', async () => {
  test.skip(draftsDisabled, 'Local draft restart acceptance runs with the exact Development opt-in enabled.')
  const profileDir = path.join(process.cwd(), 'reports/navi-studio-1.5-track-c1/logs', `browser-restart-profile-${Date.now()}`)
  const options = { executablePath: process.env.NAVI_TEST_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true }
  const firstContext = await chromium.launchPersistentContext(profileDir, options)
  try {
    const firstPage = firstContext.pages()[0] ?? await firstContext.newPage()
    const firstHarness = await installHarness(firstPage)
    await editGroundRoomName(firstPage, 'C1 Restart Recovery Room')
    await expect.poll(async () => (await readStoredDraft(firstPage))?.authoredDocument?.buildings?.[0]?.floors?.[0]?.rooms?.[0]?.name).toBe('C1 Restart Recovery Room')
    expect(firstHarness.postBodies).toHaveLength(0)
  } finally {
    await firstContext.close()
  }

  const restartedContext = await chromium.launchPersistentContext(profileDir, options)
  try {
    const restartedPage = restartedContext.pages()[0] ?? await restartedContext.newPage()
    const restartedHarness = await installHarness(restartedPage)
    await expect(restartedPage.getByRole('status')).toContainText('Saved locally')
    await restartedPage.getByText('C1 Restart Recovery Room', { exact: true }).first().click()
    await expect(restartedPage.locator('input').nth(1)).toHaveValue('C1 Restart Recovery Room')
    expect((await readStoredDraft(restartedPage))?.authoredDocument?.buildings?.[0]?.floors?.[0]?.rooms?.[0]?.name).toBe('C1 Restart Recovery Room')
    expect(restartedHarness.postBodies).toHaveLength(0)
    expect(restartedHarness.externalAttempts).toEqual([])
    expect(restartedHarness.unexpectedApiAttempts).toEqual([])
    await restartedPage.screenshot({ path: 'reports/navi-studio-1.5-track-c1/logs/browser-process-restart-recovery.png', fullPage: true })
  } finally {
    await restartedContext.close()
  }
})
