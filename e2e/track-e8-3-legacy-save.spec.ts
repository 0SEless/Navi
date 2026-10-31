import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { Graph } from '../src/engine/graph'
import { GraphAdapter } from '../packages/editor/src/graph-adapter'
import { CoordinateTransformer } from '../packages/core/src/coordinates/transformer'
import type { CampusDocument } from '../packages/core/src/types/document'
import { createE83BrowserCampusDocument, createE8BrowserCampusMap } from '../scripts/track-e8-browser-acceptance/fixture'

const campusId = process.env.NAVI_E8_LEGACY_CAMPUS_ID ?? 'navi-e8-legacy-synthetic'
const authOrigin = 'http://127.0.0.1:45678'

function graphPayload(document: CampusDocument) {
  const graph = new Graph()
  graph.campusId = campusId
  new GraphAdapter(graph, new CoordinateTransformer()).sync(document)
  return { ...graph.toJSON(), updatedAt: '2026-10-30T00:00:00.000Z', authoredDocumentFormatVersion: 1, authoredDocument: document }
}

async function installLegacyHarness(context: BrowserContext, page: Page) {
  const session = {
    access_token: 'e8-local-synthetic-admin-token', refresh_token: 'e8-local-synthetic-refresh-token',
    token_type: 'bearer', expires_in: 86_400, expires_at: Math.floor(Date.now() / 1000) + 86_400,
    user: { id: 'e8-browser-global-admin', email: 'e8-browser-admin@example.test', app_metadata: { role: 'super_admin' }, user_metadata: {} },
  }
  await context.addCookies([{
    name: 'sb-127-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,
    url: 'http://localhost:3118', httpOnly: false, sameSite: 'Lax',
  }])
  await page.addInitScript(({ campusMap }) => {
    localStorage.setItem('navi-campus-maps', JSON.stringify([campusMap]))
  }, { campusMap: createE8BrowserCampusMap(campusId) })
}

test('E8.3 flags-off editor retains legacy graph save and validation-gated publish UI', async ({ browser, baseURL }) => {
  const document = createE83BrowserCampusDocument(campusId)
  const graph = graphPayload(document)
  const context = await browser.newContext({ baseURL })
  const page = await context.newPage()
  const graphPosts: Array<Record<string, unknown>> = []
  const publishPosts: Array<Record<string, unknown>> = []
  const externalAttempts: string[] = []
  await installLegacyHarness(context, page)
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === authOrigin) return route.continue()
    if (url.origin !== 'http://localhost:3118') {
      externalAttempts.push(url.origin)
      return route.abort('blockedbyclient')
    }
    if (url.pathname === '/api/graph' && route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(graph) })
    }
    if (url.pathname === '/api/campus-maps' && route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ maps: [createE8BrowserCampusMap(campusId)] }) })
    }
    if (url.pathname === '/api/graph' && route.request().method() === 'POST') {
      graphPosts.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, updatedAt: 'synthetic-legacy-revision-1' }) })
    }
    if (url.pathname === '/api/publish' && route.request().method() === 'POST') {
      publishPosts.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, manifest: { compilerVersion: 'e8-legacy-synthetic' }, message: 'Synthetic endpoint intercepted; no publication was written.' }) })
    }
    if (url.pathname === '/api/graph' || url.pathname === '/api/campus-maps') {
      return route.fulfill({ status: 405, body: 'method not allowed' })
    }
    return route.continue()
  })

  try {
    await page.goto(`/studio/${campusId}/edit`)
    await expect(page.getByRole('treeitem', { name: /Synthetic Library/ }).first()).toBeVisible({ timeout: 30_000 })
    await page.getByRole('treeitem', { name: /Synthetic Library/ }).click()
    await page.locator('main input').nth(1).fill('E8.3 legacy saved Library')
    const graphSave = page.waitForRequest((request) => request.url().endsWith('/api/graph') && request.method() === 'POST')
    await page.getByRole('button', { name: 'Save campus changes' }).click()
    await graphSave
    await expect.poll(() => graphPosts.length).toBe(1)
    expect((graphPosts[0].authoredDocument as CampusDocument).buildings[0].name).toBe('E8.3 legacy saved Library')
    await expect(page.getByTestId('scoped-history-status')).toHaveCount(0)

    await page.getByRole('button', { name: 'Validate', exact: true }).click()
    await expect(page.getByRole('button', { name: /View issues \(1\)/ })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled()
    expect(publishPosts).toHaveLength(0)
    expect(externalAttempts.length).toBeGreaterThan(0)
    expect(new Set(externalAttempts)).toEqual(new Set(['https://tile.openstreetmap.org']))
  } finally {
    await context.close()
  }
})
