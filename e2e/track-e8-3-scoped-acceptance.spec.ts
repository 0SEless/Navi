import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Graph } from '../src/engine/graph'
import { GraphAdapter } from '../packages/editor/src/graph-adapter'
import { CoordinateTransformer } from '../packages/core/src/coordinates/transformer'
import type { CampusDocument } from '../packages/core/src/types/document'
import { createE83BrowserCampusDocument, createE8BrowserCampusMap } from '../scripts/track-e8-browser-acceptance/fixture'

const campusId = process.env.NAVI_E8_BROWSER_CAMPUS_ID ?? ''
const syntheticAdminToken = 'e8-local-synthetic-admin-token'
const authOrigin = 'http://127.0.0.1:45678'

function graphPayload(document: CampusDocument) {
  const graph = new Graph()
  graph.campusId = campusId
  new GraphAdapter(graph, new CoordinateTransformer()).sync(document)
  return { ...graph.toJSON(), authoredDocumentFormatVersion: 1, authoredDocument: document }
}

async function installHarness(context: BrowserContext, page: Page, document: CampusDocument, seedLocalStorage = true) {
  const session = {
    access_token: syntheticAdminToken,
    refresh_token: 'e8-local-synthetic-refresh-token',
    token_type: 'bearer',
    expires_in: 86_400,
    expires_at: Math.floor(Date.now() / 1000) + 86_400,
    user: { id: 'e8-browser-global-admin', email: 'e8-browser-admin@example.test', app_metadata: { role: 'super_admin' }, user_metadata: {} },
  }
  await context.addCookies([{
    name: 'sb-127-auth-token',
    value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,
    url: 'http://localhost:3118',
    httpOnly: false,
    sameSite: 'Lax',
  }])
  if (seedLocalStorage) {
    await page.addInitScript(({ id, graph, campusMap }) => {
      localStorage.setItem(`navi-graph-${id}`, JSON.stringify(graph))
      localStorage.setItem('navi-campus-maps', JSON.stringify([campusMap]))
    }, { id: campusId, graph: graphPayload(document), campusMap: createE8BrowserCampusMap(campusId) })
  }
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
    if (url.pathname === '/api/graph' || url.pathname === '/api/campus-maps') {
      return route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Legacy writes blocked in E8.3 scoped acceptance."}' })
    }
    return route.continue()
  })
}

type CapturedPost = { body: string; status?: number; response?: Record<string, unknown> }

function captureScopedPosts(page: Page): CapturedPost[] {
  const posts: CapturedPost[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/api/studio/scoped-save') && request.method() === 'POST') {
      posts.push({ body: request.postData() ?? '' })
    }
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

async function openStudio(browser: Browser, baseURL: string | undefined, document: CampusDocument, persistentProfile?: string) {
  const context = persistentProfile
    ? await browser.browserType().launchPersistentContext(persistentProfile, { baseURL, headless: true })
    : await browser.newContext({ baseURL })
  const page = context.pages()[0] ?? await context.newPage()
  const posts = captureScopedPosts(page)
  await installHarness(context, page, document, false)
  await page.goto(`/studio/${campusId}/edit`)
  await expect(page.getByRole('treeitem', { name: /Synthetic Library/ }).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('scoped-history-status')).toContainText('Local draft ready')
  return { context, page, posts }
}

async function openFloorEditor(browser: Browser, baseURL: string | undefined, document: CampusDocument) {
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  const posts = captureScopedPosts(page)
  await installHarness(context, page, document, false)
  await page.goto(`/studio/${campusId}/edit/building/e8-building-library/floor/0`)
  const continueLink = page.getByText('Continue without floor plan', { exact: true })
  await expect(continueLink).toBeVisible({ timeout: 30_000 })
  await continueLink.click()
  await expect(page.getByTestId('scoped-history-status')).toContainText('Local draft ready', { timeout: 30_000 })
  return { context, page, posts }
}

async function manualSave(page: Page) {
  const response = page.waitForResponse((candidate) =>
    candidate.url().endsWith('/api/studio/scoped-save') && candidate.request().method() === 'POST',
    { timeout: 20_000 },
  )
  await page.getByRole('button', { name: 'Save campus changes' }).click()
  return response
}

async function draftBuildingName(page: Page, buildingId: string): Promise<string | null> {
  return page.evaluate(async (id) => {
    const context = (window as Window & { __naviContext?: { document?: CampusDocument } }).__naviContext
    const campusId = context?.document?.metadata?.campusId
    if (!campusId) return null
    const database = await new Promise<IDBDatabase | null>((resolve) => {
      const request = indexedDB.open('navi-studio-local-drafts')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onupgradeneeded = () => { request.transaction?.abort(); resolve(null) }
    })
    if (!database) return null
    const draft = await new Promise<{ authoredDocument?: CampusDocument } | null>((resolve) => {
      const request = database.transaction('campus-drafts', 'readonly').objectStore('campus-drafts').get(campusId)
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => resolve(null)
    })
    database.close()
    return draft?.authoredDocument?.buildings.find((building) => building.id === id)?.name ?? null
  }, buildingId)
}

test('E8.3 actual editor routing, atomic batch, stale conflict, and exact retry recovery', async ({ browser, baseURL }) => {
  expect(campusId).toMatch(/^navi-e8-browser-[a-f0-9]{16}$/)
  const seed = createE83BrowserCampusDocument(campusId)

  // A: Delete one actual route-network node through the Navigation tool.
  const routeEditor = await openFloorEditor(browser, baseURL, seed)
  await routeEditor.page.getByRole('button', { name: 'Navigation', exact: true }).click()
  // Select the synthetic waypoint through the Floor Editor's route outliner.
  // This is a real editor selection control with no map pixel scaling.
  await routeEditor.page.getByRole('button', { name: 'Expand Navigation' }).click()
  await routeEditor.page.getByRole('button', { name: 'Expand Route Nodes' }).click()
  await routeEditor.page.getByText('Waypoint 1', { exact: true }).click()
  await expect(routeEditor.page.getByText('Route Node', { exact: true }).first()).toBeVisible()
  await routeEditor.page.getByRole('button', { name: 'Delete', exact: true }).last().click()
  await expect.poll(() => routeEditor.page.evaluate(() => {
    const context = (window as Window & { __naviContext?: { document?: CampusDocument } }).__naviContext
    return context?.document?.buildings[0]?.floors[0]?.routeNetwork?.nodes.length
  })).toBe(1)
  const routeResponsePromise = routeEditor.page.waitForResponse((candidate) =>
    candidate.url().endsWith('/api/studio/scoped-save') && candidate.request().method() === 'POST',
    { timeout: 20_000 },
  )
  await routeEditor.page.getByRole('button', { name: 'Save', exact: true }).last().click()
  const routeResponse = await routeResponsePromise
  expect(routeResponse.status()).toBe(200)
  const routeAck = await routeResponse.json() as { outcome?: string; acknowledgments?: Array<{ revision: number }> }
  const routePost = routeEditor.posts.find((post) => JSON.parse(post.body).operations?.some((operation: { scope: { kind: string } }) => operation.scope.kind === 'routing'))
  expect(routePost).toBeDefined()
  const routeOperation = JSON.parse(routePost!.body).operations.find((operation: { scope: { kind: string } }) => operation.scope.kind === 'routing')
  expect(routeOperation.scope).toEqual({ kind: 'routing', id: 'e8-building-library' })
  expect(routeOperation.content.floors[0].routeNetwork.nodes).toHaveLength(1)
  expect(routeOperation.content.floors[0].routeNetwork.edges).toHaveLength(0)
  expect(routeAck).toMatchObject({ outcome: 'committed', acknowledgments: [{ revision: 1 }] })
  await routeEditor.context.close()

  const restoredRoute = await openFloorEditor(browser, baseURL, seed)
  await expect.poll(() => restoredRoute.page.evaluate(() => {
    const context = (window as Window & { __naviContext?: { document?: CampusDocument } }).__naviContext
    return context?.document?.buildings[0]?.floors[0]?.routeNetwork?.nodes.length
  })).toBe(1)
  await restoredRoute.page.getByRole('button', { name: 'Navigation', exact: true }).click()
  await restoredRoute.page.getByRole('button', { name: 'Expand Navigation' }).click()
  await expect(restoredRoute.page.getByText('Route Nodes (1)', { exact: true })).toBeVisible()
  await restoredRoute.page.getByRole('button', { name: 'Expand Route Nodes' }).click()
  await expect(restoredRoute.page.getByText('Waypoint 1', { exact: true })).toBeVisible()
  await restoredRoute.context.close()

  // C: One real editor save changes one building and the outdoor route scope.
  const atomicEditor = await openStudio(browser, baseURL, seed)
  await atomicEditor.page.getByRole('treeitem', { name: /Synthetic Library/ }).click()
  await atomicEditor.page.locator('main input').nth(1).fill('E8.3 atomic Library')
  await atomicEditor.page.getByRole('treeitem', { name: /Synthetic Loop Road/ }).click()
  await atomicEditor.page.getByLabel('Path feature').selectOption('ramp')
  const atomicResponse = await manualSave(atomicEditor.page)
  expect(atomicResponse.status()).toBe(200)
  const atomicAck = await atomicResponse.json() as { outcome?: string; acknowledgments?: Array<{ revision: number }> }
  const atomicPost = atomicEditor.posts.find((post) => JSON.parse(post.body).operations?.length === 2)
  expect(atomicPost).toBeDefined()
  const atomicOperations = JSON.parse(atomicPost!.body).operations
  expect(atomicOperations.map((operation: { scope: { kind: string; id: string } }) => operation.scope).sort((a: { kind: string; id: string }, b: { kind: string; id: string }) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`))).toEqual([
    { kind: 'building', id: 'e8-building-library' },
    { kind: 'routing', id: campusId },
  ])
  expect(atomicOperations.find((operation: { scope: { kind: string } }) => operation.scope.kind === 'building').dependencies)
    .toEqual([expect.objectContaining({ scope: { kind: 'routing', id: 'e8-building-library' }, revision: 1, required: true })])
  expect(atomicAck).toMatchObject({ outcome: 'committed', acknowledgments: [{ revision: 2 }, { revision: 2 }] })
  await atomicEditor.context.close()

  const atomicRecovery = await openStudio(browser, baseURL, seed)
  await expect.poll(() => atomicRecovery.page.evaluate(() => {
    const context = (window as Window & { __naviContext?: { document?: CampusDocument } }).__naviContext
    const document = context?.document
    return {
      library: document?.buildings.find((building) => building.id === 'e8-building-library')?.name,
      lab: document?.buildings.find((building) => building.id === 'e8-building-lab')?.name,
      routeFeature: document?.roads.find((road) => road.id === 'e83-synthetic-road')?.routing?.feature,
      routeNodes: document?.buildings[0]?.floors[0]?.routeNetwork?.nodes.length,
    }
  })).toEqual({ library: 'E8.3 atomic Library', lab: 'Unchanged Synthetic Lab', routeFeature: 'ramp', routeNodes: 1 })
  expect(await atomicRecovery.page.getByRole('treeitem', { name: /E8\.3 atomic Library/ }).count()).toBe(1)
  await atomicRecovery.context.close()

  // D: Two independent contexts start at revision 2; the stale writer keeps its draft.
  const firstWriter = await openStudio(browser, baseURL, seed)
  const staleProfile = mkdtempSync(join(tmpdir(), 'navi-e8-e83-stale-draft-'))
  const staleWriter = await openStudio(browser, baseURL, seed, staleProfile)
  await firstWriter.page.getByRole('treeitem', { name: /E8\.3 atomic Library/ }).click()
  await firstWriter.page.locator('main input').nth(1).fill('E8.3 winner')
  const winnerResponse = await manualSave(firstWriter.page)
  expect(winnerResponse.status()).toBe(200)
  await staleWriter.page.getByRole('treeitem', { name: /Unchanged Synthetic Lab/ }).click()
  await staleWriter.page.locator('main input').nth(1).fill('E8.3 stale editor preserved')
  const staleResponse = await manualSave(staleWriter.page)
  expect(staleResponse.status()).toBe(409)
  await expect(staleWriter.page.getByTestId('scoped-history-status')).toContainText('conflict')
  await expect.poll(() => draftBuildingName(staleWriter.page, 'e8-building-lab')).toBe('E8.3 stale editor preserved')
  const staleBody = JSON.parse(staleWriter.posts[0].body)
  expect(staleBody.expectedCampusRevision).toBe(2)
  expect(await staleResponse.json()).toMatchObject({ code: 'STALE_REVISION' })
  await firstWriter.context.close()
  await staleWriter.context.close()

  // Restart the persistent Chromium profile and verify that IndexedDB kept
  // the unacknowledged conflict draft and the editor can recover its content.
  const restartedContext = await browser.browserType().launchPersistentContext(staleProfile, { baseURL, headless: true })
  try {
    const restartedPage = restartedContext.pages()[0] ?? await restartedContext.newPage()
    await installHarness(restartedContext, restartedPage, seed, false)
    await restartedPage.goto(`/studio/${campusId}/edit`)
    await expect.poll(() => draftBuildingName(restartedPage, 'e8-building-lab')).toBe('E8.3 stale editor preserved')
    await expect(restartedPage.getByRole('treeitem', { name: /E8\.3 stale editor preserved/ }).first()).toBeVisible()
      await expect(restartedPage.getByTestId('scoped-history-status')).toContainText('conflict')
  } finally {
    await restartedContext.close()
    rmSync(staleProfile, { recursive: true, force: true })
  }

  // E/F: The server commits but the first acknowledgment is lost. Retry the
  // exact old bytes, then prove a later editor change remains independently saveable.
  const retryEditor = await openStudio(browser, baseURL, seed)
  await retryEditor.page.getByRole('treeitem', { name: /Unchanged Synthetic Lab/ }).click()
  const labName = retryEditor.page.locator('main input').nth(1)
  await labName.fill('E8.3 acknowledged older edit')
  let lostAcknowledgment = true
  let serverCommitOutcome: Record<string, unknown> | null = null
  await retryEditor.page.route('**/api/studio/scoped-save', async (route) => {
    if (lostAcknowledgment && route.request().method() === 'POST') {
      lostAcknowledgment = false
      const committed = await route.fetch()
      serverCommitOutcome = await committed.json() as Record<string, unknown>
      await route.abort('failed')
      return
    }
    await route.continue()
  })
  const failedPost = retryEditor.page.waitForEvent('requestfailed', (request) => request.url().endsWith('/api/studio/scoped-save') && request.method() === 'POST')
  await retryEditor.page.getByRole('button', { name: 'Save campus changes' }).click()
  await failedPost
  expect(serverCommitOutcome).toMatchObject({ outcome: 'committed', acknowledgments: [{ revision: 4 }] })
  await expect(retryEditor.page.getByTestId('scoped-history-status')).toContainText('save failed')
  await retryEditor.context.setOffline(true)
  await labName.fill('E8.3 newer edit durably saved')
  await expect.poll(() => draftBuildingName(retryEditor.page, 'e8-building-lab')).toBe('E8.3 newer edit durably saved')
  await retryEditor.context.setOffline(false)
  const replayResponse = await manualSave(retryEditor.page)
  expect(replayResponse.status()).toBe(200)
  expect(await replayResponse.json()).toMatchObject({ outcome: 'replayed', acknowledgments: [{ revision: 4 }] })
  expect(retryEditor.posts[0].body).toBe(retryEditor.posts[1].body)

  const latestResponse = await manualSave(retryEditor.page)
  expect(latestResponse.status()).toBe(200)
  const latestAck = await latestResponse.json() as { acknowledgments?: Array<{ revision: number }> }
  expect(latestAck.acknowledgments?.[0]?.revision).toBe(5)
  const newerOperation = JSON.parse(retryEditor.posts.at(-1)!.body).operations[0]
  expect(newerOperation.content.name).toBe('E8.3 newer edit durably saved')
  await expect(retryEditor.page.getByTestId('scoped-history-status')).toHaveText('Saved to local synthetic E5; not cloud-saved')
  await retryEditor.context.close()
})
