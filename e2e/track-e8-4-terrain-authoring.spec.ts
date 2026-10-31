import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { Graph } from '../src/engine/graph'
import { GraphAdapter } from '../packages/editor/src/graph-adapter'
import { CoordinateTransformer } from '../packages/core/src/coordinates/transformer'
import type { CampusDocument } from '../packages/core/src/types/document'
import { createE84BrowserCampusDocument, createE8BrowserCampusMap } from '../scripts/track-e8-browser-acceptance/fixture'

const campusId = process.env.NAVI_E8_BROWSER_CAMPUS_ID ?? ''
const syntheticAdminToken = 'e8-local-synthetic-admin-token'
const authOrigin = 'http://127.0.0.1:45678'

function graphPayload(document: CampusDocument) {
  const graph = new Graph()
  graph.campusId = campusId
  new GraphAdapter(graph, new CoordinateTransformer()).sync(document)
  return { ...graph.toJSON(), authoredDocumentFormatVersion: 1, authoredDocument: document }
}

async function installHarness(context: BrowserContext, page: Page, document: CampusDocument): Promise<Array<Record<string, unknown>>> {
  const publishPosts: Array<Record<string, unknown>> = []
  const session = {
    access_token: syntheticAdminToken,
    refresh_token: 'e8-local-synthetic-refresh-token',
    token_type: 'bearer',
    expires_in: 86_400,
    expires_at: Math.floor(Date.now() / 1000) + 86_400,
    user: { id: 'e8-browser-global-admin', email: 'e8-browser-admin@example.test', app_metadata: { role: 'super_admin' }, user_metadata: {} },
  }
  await context.addCookies([{
    name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,
    url: 'http://localhost:3118', httpOnly: false, sameSite: 'Lax',
  }])
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === authOrigin) return route.continue()
    if (url.origin !== 'http://localhost:3118') return route.abort('blockedbyclient')
    if (url.pathname === '/api/graph' && route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(graphPayload(document)) })
    }
    if (url.pathname === '/api/campus-maps' && route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ maps: [createE8BrowserCampusMap(campusId)] }) })
    }
    if (url.pathname === '/api/publish' && route.request().method() === 'POST') {
      publishPosts.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, manifest: { compilerVersion: 'e8.4-synthetic-contract' }, message: 'Synthetic publish endpoint intercepted; no cloud write occurred.' }) })
    }
    if (url.pathname === '/api/graph' || url.pathname === '/api/campus-maps') {
      return route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Legacy writes blocked in E8.4 synthetic acceptance."}' })
    }
    return route.continue()
  })
  return publishPosts
}

type CapturedPost = { body: string; status?: number; response?: Record<string, unknown> }

function captureScopedPosts(page: Page): CapturedPost[] {
  const posts: CapturedPost[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/api/studio/scoped-save') && request.method() === 'POST') posts.push({ body: request.postData() ?? '' })
  })
  page.on('response', async (response) => {
    if (response.url().endsWith('/api/studio/scoped-save') && response.request().method() === 'POST') {
      const post = [...posts].reverse().find((candidate) => candidate.status === undefined)
      if (!post) return
      post.status = response.status()
      post.response = await response.json().catch(() => ({})) as Record<string, unknown>
    }
  })
  return posts
}

async function openStudio(browser: Browser, baseURL: string | undefined, document: CampusDocument) {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  const posts = captureScopedPosts(page)
  const publishPosts = await installHarness(context, page, document)
  await page.goto(`/studio/${campusId}/edit`)
  await expect(page.getByRole('treeitem', { name: /Synthetic Library/ }).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('scoped-history-status')).toContainText('Local draft ready')
  await expect(page.getByTestId('terrain-authoring-panel')).toBeVisible()
  return { context, page, posts, publishPosts }
}

async function draftTerrain(page: Page, areaName: string) {
  await page.getByTestId('terrain-draw-start').click()
  await page.getByTestId('terrain-name').fill(areaName)
  await page.getByTestId('terrain-elevation').fill('3.25')
  await page.getByTestId('terrain-datum-name').fill('E8.4 synthetic campus datum')
  await page.getByTestId('terrain-datum-zero').fill('Synthetic benchmark point at 0.000 m')
  const canvas = page.locator('.maplibregl-canvas').first()
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('Studio map canvas is unavailable.')
  for (const [x, y] of [[0.66, 0.40], [0.76, 0.40], [0.76, 0.52], [0.66, 0.52]]) {
    await page.mouse.click(bounds.x + bounds.width * x, bounds.y + bounds.height * y)
  }
  await expect(page.getByText('4 vertices', { exact: true })).toBeVisible()
  await page.getByTestId('terrain-draw-finish').click()
  await expect(page.getByTestId('terrain-area-list')).toContainText(areaName)
}

async function readDraftArea(page: Page, areaName: string) {
  return page.evaluate((name) => {
    const context = (window as Window & { __naviContext?: { document?: CampusDocument } }).__naviContext
    return context?.document?.terrainAreas?.find((area) => area.name === name) ?? null
  }, areaName)
}

async function readDraftFromIndexedDb(page: Page, areaName: string) {
  return page.evaluate(async (name) => {
    const campus = (window as Window & { __naviContext?: { document?: CampusDocument } }).__naviContext?.document?.metadata.campusId
    if (!campus) return null
    const database = await new Promise<IDBDatabase | null>((resolve) => {
      const request = indexedDB.open('navi-studio-local-drafts')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onupgradeneeded = () => { request.transaction?.abort(); resolve(null) }
    })
    if (!database) return null
    const draft = await new Promise<{ authoredDocument?: CampusDocument } | null>((resolve) => {
      const request = database.transaction('campus-drafts', 'readonly').objectStore('campus-drafts').get(campus)
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => resolve(null)
    })
    database.close()
    return draft?.authoredDocument?.terrainAreas?.find((area) => area.name === name) ?? null
  }, areaName)
}

test('E8.4 terrain authoring commits one campus scope and reconstructs in a fresh browser context', async ({ browser, baseURL }) => {
  expect(campusId).toMatch(/^navi-e8-browser-[a-f0-9]{16}$/)
  const baseline = createE84BrowserCampusDocument(campusId)
  const stale = await openStudio(browser, baseURL, baseline)
  const editor = await openStudio(browser, baseURL, baseline)

  // Draw the terrain area in the campus map. Drawing and boundary adjustment are local only.
  await draftTerrain(editor.page, 'Synthetic north lawn')
  const initial = await readDraftArea(editor.page, 'Synthetic north lawn')
  expect(initial).toMatchObject({ id: expect.stringMatching(/^terrain-/), name: 'Synthetic north lawn', elevationMeters: 3.25 })
  expect(await readDraftArea(editor.page, 'Synthetic north lawn')).toMatchObject({ points: expect.arrayContaining([expect.objectContaining({ lat: expect.any(Number), lng: expect.any(Number) })]) })
  expect(editor.posts).toHaveLength(0)

  await editor.page.getByTestId('terrain-boundary-edit').click()
  const vertex = editor.page.getByTestId('terrain-vertex-handle').first()
  await expect(vertex).toBeVisible()
  const vertexBounds = await vertex.boundingBox()
  if (!vertexBounds) throw new Error('Terrain boundary handle is not positioned.')
  await editor.page.mouse.move(vertexBounds.x + vertexBounds.width / 2, vertexBounds.y + vertexBounds.height / 2)
  await editor.page.mouse.down()
  for (let step = 1; step <= 8; step++) {
    await editor.page.mouse.move(vertexBounds.x + vertexBounds.width / 2 + step * 2, vertexBounds.y + vertexBounds.height / 2 + step, { steps: 1 })
  }
  await editor.page.mouse.up()
  const metrics = editor.page.getByTestId('terrain-gesture-metrics')
  await expect(metrics).toHaveAttribute('data-document-commands', '1')
  await expect(metrics).toHaveAttribute('data-document-changes', '1')
  const pointerEvents = Number(await metrics.getAttribute('data-pointer-events'))
  expect(pointerEvents).toBeGreaterThan(1)
  expect(editor.posts).toHaveLength(0)
  console.log('E8_4_GESTURE_METRICS', JSON.stringify({
    pointerMoveEvents: pointerEvents,
    documentCommands: Number(await metrics.getAttribute('data-document-commands')),
    documentChanges: Number(await metrics.getAttribute('data-document-changes')),
    scopedSavePostsDuringGesture: editor.posts.length,
  }))

  const saveResponsePromise = editor.page.waitForResponse((response) => response.url().endsWith('/api/studio/scoped-save') && response.request().method() === 'POST')
  await editor.page.getByRole('button', { name: 'Save campus changes' }).click()
  const saveResponse = await saveResponsePromise
  expect(saveResponse.status()).toBe(200)
  const acknowledgment = await saveResponse.json() as { outcome?: string; acknowledgments?: Array<{ mutationId?: string; contentChecksum?: string; requestChecksum?: string; committedAt?: string; revision?: number }> }
  expect(acknowledgment.outcome).toBe('committed')
  expect(acknowledgment.acknowledgments).toHaveLength(1)
  expect(acknowledgment.acknowledgments?.[0]).toMatchObject({ revision: 1 })
  expect(acknowledgment.acknowledgments?.[0]?.mutationId).toEqual(expect.any(String))
  expect(acknowledgment.acknowledgments?.[0]?.contentChecksum).toMatch(/^[a-f0-9]{64}$/)
  expect(acknowledgment.acknowledgments?.[0]?.requestChecksum).toMatch(/^[a-f0-9]{64}$/)
  expect(acknowledgment.acknowledgments?.[0]?.committedAt).toEqual(expect.any(String))
  const saveBody = JSON.parse(editor.posts[0].body) as { operations?: Array<{ scope?: { kind?: string }; content?: { terrainAreas?: unknown[] } }> }
  expect(saveBody.operations).toHaveLength(1)
  console.log('E8_4_EXPLICIT_SAVE_METRICS', JSON.stringify({
    scopedSavePosts: editor.posts.length,
    saveCandidates: saveBody.operations?.length ?? 0,
    scopeKinds: saveBody.operations?.map((operation) => operation.scope?.kind) ?? [],
  }))
  expect(saveBody.operations?.[0]).toMatchObject({ scope: { kind: 'terrain', id: campusId }, content: { terrainAreas: expect.any(Array) } })

  // A stale synthetic editor preserves its local terrain draft after the E5 revision conflict.
  await draftTerrain(stale.page, 'Stale synthetic terrain')
  const staleResponsePromise = stale.page.waitForResponse((response) => response.url().endsWith('/api/studio/scoped-save') && response.request().method() === 'POST')
  await stale.page.getByRole('button', { name: 'Save campus changes' }).click()
  const staleResponse = await staleResponsePromise
  expect(staleResponse.status()).toBe(409)
  expect(await readDraftFromIndexedDb(stale.page, 'Stale synthetic terrain')).toMatchObject({ name: 'Stale synthetic terrain' })
  await stale.context.close()

  const committed = await readDraftArea(editor.page, 'Synthetic north lawn')
  await editor.context.close()

  // A fresh context starts without local graph/draft state and reconstructs the area through the E5 snapshot.
  const recovered = await openStudio(browser, baseURL, baseline)
  await expect(recovered.page.getByTestId('terrain-render-state')).toHaveAttribute('data-area-count', '1')
  await recovered.page.getByTestId(`terrain-select-${committed?.id}`).click()
  await expect(recovered.page.getByTestId('terrain-edit-name')).toHaveValue('Synthetic north lawn')
  await expect(recovered.page.getByTestId('terrain-edit-elevation')).toHaveValue('3.25')
  await expect(recovered.page.getByTestId('terrain-edit-datum-name')).toHaveValue('E8.4 synthetic campus datum')
  expect(await readDraftArea(recovered.page, 'Synthetic north lawn')).toEqual(committed)

  // Publish remains behind the legacy contract and is intercepted before any cloud mutation.
  await recovered.page.getByRole('button', { name: 'Validate', exact: true }).click()
  await expect(recovered.page.getByText('Build Ready', { exact: true })).toBeVisible({ timeout: 30_000 })
  const publishResponsePromise = recovered.page.waitForResponse((response) => response.url().endsWith('/api/publish') && response.request().method() === 'POST')
  await recovered.page.getByRole('button', { name: 'Publish', exact: true }).click()
  const publishResponse = await publishResponsePromise
  expect(publishResponse.status()).toBe(200)
  await expect(recovered.page.getByRole('button', { name: 'Published', exact: true })).toBeVisible()
  expect(recovered.publishPosts).toHaveLength(1)
  const publishedBody = recovered.publishPosts[0]
  expect(publishedBody).toHaveProperty('artifacts')
  expect(publishedBody).toHaveProperty('campusId', campusId)
  expect(publishedBody.artifacts).not.toHaveProperty('terrainAreas')
  await recovered.page.getByRole('button', { name: 'Close', exact: true }).click()

  // A failed request keeps a newer authored draft in IndexedDB and cannot create another E5 revision.
  await recovered.page.getByTestId('terrain-edit-elevation').fill('7.5')
  await recovered.page.getByTestId('terrain-edit-apply').click()
  await recovered.page.route('**/api/studio/scoped-save', (route) => route.abort())
  await recovered.page.getByRole('button', { name: 'Save campus changes' }).click()
  await expect.poll(() => readDraftFromIndexedDb(recovered.page, 'Synthetic north lawn')).toMatchObject({ elevationMeters: 7.5 })
  await recovered.context.close()
})
