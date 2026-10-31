import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { Graph } from '../src/engine/graph'
import { GraphAdapter } from '../packages/editor/src/graph-adapter'
import { CoordinateTransformer } from '../packages/core/src/coordinates/transformer'
import type { CampusDocument } from '../packages/core/src/types/document'
import { createE8BrowserCampusDocument, createE8BrowserCampusMap } from '../scripts/track-e8-browser-acceptance/fixture'

const campusId = process.env.NAVI_E8_BROWSER_CAMPUS_ID ?? ''
const adminToken = 'e8-local-synthetic-admin-token'
const authOrigin = 'http://127.0.0.1:45678'

function graphPayload(document: CampusDocument) {
  const graph = new Graph()
  graph.campusId = campusId
  new GraphAdapter(graph, new CoordinateTransformer()).sync(document)
  return { ...graph.toJSON(), authoredDocumentFormatVersion: 1, authoredDocument: document }
}

async function installLocalOnlyHarness(context: BrowserContext, page: Page, document: CampusDocument) {
  const session = {
    access_token: adminToken,
    refresh_token: 'e8-local-synthetic-refresh-token',
    token_type: 'bearer',
    expires_in: 60 * 60 * 24,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    user: { id: 'e8-browser-global-admin', email: 'e8-browser-admin@example.test', app_metadata: { role: 'super_admin' }, user_metadata: {} },
  }
  await context.addCookies([{
    name: 'sb-127-auth-token',
    value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,
    url: 'http://localhost:3118',
    httpOnly: false,
    sameSite: 'Lax',
  }])
  await page.addInitScript(({ id, graph, campusMap }) => {
    localStorage.setItem(`navi-graph-${id}`, JSON.stringify(graph))
    localStorage.setItem('navi-campus-maps', JSON.stringify([campusMap]))
  }, { id: campusId, graph: graphPayload(document), campusMap: createE8BrowserCampusMap(campusId) })
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/api/studio/scoped-save') {
      console.log(`E8_2_HTTP_REQUEST ${JSON.stringify({ method: request.method(), path: url.pathname, hasOrigin: Boolean(request.headers().origin) })}`)
    }
  })
  page.on('console', (message) => {
    if (message.text().startsWith('[NAVI_E8_SAVE_TRACE]')) console.log(message.text())
  })
  page.on('response', async (response) => {
    const url = new URL(response.url())
    if (url.pathname !== '/api/studio/scoped-save') return
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    const snapshot = payload.snapshot as { revision?: number; scopes?: Record<string, unknown> } | undefined
    const acknowledgments = payload.acknowledgments as Array<{ scope?: { kind?: string; id?: string }; revision?: number }> | undefined
    console.log(`E8_2_HTTP_RESPONSE ${JSON.stringify({ method: response.request().method(), status: response.status(), ok: payload.ok, code: payload.code, revision: payload.revision ?? snapshot?.revision ?? acknowledgments?.[0]?.revision ?? null, scopeKeys: snapshot?.scopes ? Object.keys(snapshot.scopes).sort() : undefined, ackCount: acknowledgments?.length })}`)
  })
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
      return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Legacy writes blocked in durable scoped-save acceptance.' }) })
    }
    return route.continue()
  })
}

async function installSavePipelineDiagnostics(page: Page) {
  await page.evaluate(() => {
    const browserWindow = window as Window & {
      __naviContext?: { document: CampusDocument; services: { get: (id: string) => unknown } }
      __naviE8Trace?: Array<Record<string, unknown>>
    }
    const trace: Array<Record<string, unknown>> = browserWindow.__naviE8Trace = []
    const add = (checkpoint: string, detail: Record<string, unknown> = {}) => trace.push({ checkpoint, at: performance.now(), ...detail })
    const context = browserWindow.__naviContext
    if (!context) { add('editor-context-missing'); return }

    const eventBus = context.services.get('eventBus') as { on?: (name: string, listener: (payload?: unknown) => void) => () => void } | undefined
    eventBus?.on?.('document.changed', () => add('document.changed', {
      buildingName: context.document.buildings.find((building) => building.id === 'e8-building-library')?.name,
      documentVersion: context.document.version,
    }))
    eventBus?.on?.('revision.committed', () => add('revision.committed', { documentVersion: context.document.version }))

    const workflow = context.services.get('workflow') as { save?: (reason: 'manual' | 'autosave') => Promise<void>; isDirty?: () => boolean }
    if (workflow?.save) {
      const original = workflow.save.bind(workflow)
      workflow.save = async (reason) => {
        add('workflow.save.enter', { reason, dirty: workflow.isDirty?.() ?? null })
        try { await original(reason); add('workflow.save.resolved', { reason, dirty: workflow.isDirty?.() ?? null }) }
        catch (error) { add('workflow.save.rejected', { reason, error: error instanceof Error ? error.message : 'unknown' }); throw error }
      }
    }
    const persistence = context.services.get('persistence') as { save?: (reason: 'manual' | 'autosave') => Promise<void> } | undefined
    if (persistence?.save) {
      const original = persistence.save.bind(persistence)
      persistence.save = async (reason) => {
        add('persistence.save.enter', { reason })
        try { await original(reason); add('persistence.save.resolved', { reason }) }
        catch (error) { add('persistence.save.rejected', { reason, error: error instanceof Error ? error.message : 'unknown' }); throw error }
      }
    }
    document.addEventListener('click', (event) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-testid="studio-manual-save"]')) add('save-button.click')
    }, true)
    add('pipeline.instrumented')
  })
}

async function readSavePipelineDiagnostics(page: Page) {
  return page.evaluate(async () => {
    const browserWindow = window as Window & {
      __naviContext?: { document: CampusDocument; services: { get: (id: string) => unknown } }
      __naviE8Trace?: Array<Record<string, unknown>>
    }
    const context = browserWindow.__naviContext
    const workflow = context?.services.get('workflow') as { isDirty?: () => boolean } | undefined
    const store = context?.services.get('workflowStore') as { getSnapshot?: () => { saveState?: string; saveError?: string | null } } | undefined
    const database = await new Promise<IDBDatabase | null>((resolve) => {
      const request = indexedDB.open('navi-studio-local-drafts')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onupgradeneeded = () => { request.transaction?.abort(); resolve(null) }
    })
    const draft = database ? await new Promise<{ campusId?: string; authoredDocument?: CampusDocument } | null>((resolve) => {
      const transaction = database.transaction('campus-drafts', 'readonly')
      const request = transaction.objectStore('campus-drafts').get(context?.document.metadata.campusId ?? '')
      request.onsuccess = () => resolve(request.result ?? null)
      request.onerror = () => resolve(null)
    }) : null
    database?.close()
    return {
      trace: browserWindow.__naviE8Trace ?? [],
      document: context ? {
        campusId: context.document.metadata.campusId,
        version: context.document.version,
        libraryName: context.document.buildings.find((building) => building.id === 'e8-building-library')?.name,
        labName: context.document.buildings.find((building) => building.id === 'e8-building-lab')?.name,
      } : null,
      workflow: { dirty: workflow?.isDirty?.() ?? null, ...store?.getSnapshot?.() },
      draft: { present: Boolean(draft), libraryName: draft?.authoredDocument?.buildings.find((building) => building.id === 'e8-building-library')?.name ?? null },
      scopedSaveHint: document.body.innerText.includes('durable saves target the local synthetic E5 database'),
    }
  })
}

test('synthetic editor saves one building to E5 and reloads its durable content', async ({ browser, page, baseURL }) => {
  expect(campusId).toMatch(/^navi-e8-browser-[a-f0-9]{16}$/)
  const seed = createE8BrowserCampusDocument(campusId)
  await installLocalOnlyHarness(page.context(), page, seed)
  const scopedRequests: Array<{ body: Record<string, unknown>; status?: number; response?: Record<string, unknown> }> = []
  page.on('request', (request) => {
    if (request.url().endsWith('/api/studio/scoped-save') && request.method() === 'POST') {
      try { scopedRequests.push({ body: request.postDataJSON() as Record<string, unknown> }) } catch { /* captured as missing body by assertion */ }
    }
  })
  page.on('response', async (response) => {
    if (response.url().endsWith('/api/studio/scoped-save') && response.request().method() === 'POST') {
      const item = scopedRequests.at(-1)
      if (item) {
        item.status = response.status()
        try { item.response = await response.json() as Record<string, unknown> } catch { /* assertion reports missing ack */ }
      }
    }
  })

  await page.goto(`/studio/${campusId}/edit`)
  await expect(page.getByRole('treeitem', { name: /Synthetic Library/ })).toBeVisible({ timeout: 30_000 })
  await installSavePipelineDiagnostics(page)
  await page.getByRole('treeitem', { name: /Synthetic Library/ }).click()
  // The legacy Field wrapper renders the visible Name text without a linked
  // label, so target it by its stable position among the editor form controls.
  const name = page.locator('main input').nth(1)
  await expect(name).toHaveValue('Synthetic Library')
  await name.fill('Synthetic Library E8.1 Accepted')
  const afterEdit = await readSavePipelineDiagnostics(page)
  console.log(`E8_2_CHECKPOINTS_AFTER_EDIT ${JSON.stringify(afterEdit)}`)
  const saveButton = page.getByRole('button', { name: 'Save campus changes' })
  await expect(saveButton).toBeEnabled()
  const post = page.waitForResponse((response) => response.url().endsWith('/api/studio/scoped-save') && response.request().method() === 'POST', { timeout: 10_000 })
  await saveButton.click()
  const response = await Promise.race([post.catch(() => null), page.waitForTimeout(10_100).then(() => null)])
  if (!response) {
    const diagnostics = await readSavePipelineDiagnostics(page)
    console.log(`E8_2_CHECKPOINTS_AFTER_SAVE ${JSON.stringify(diagnostics)}`)
    throw new Error(`No scoped-save POST. Last confirmed checkpoint: ${diagnostics.trace.at(-1)?.checkpoint ?? 'none'}.`)
  }
  expect(response.status()).toBe(200)
  const ack = await response.json() as { ok?: boolean; durable?: boolean; storage?: string; outcome?: string; acknowledgments?: Array<{ revision: number; mutationId: string; contentChecksum: string; requestChecksum: string }> }
  expect(ack).toMatchObject({ ok: true, durable: true, storage: 'local-e5-synthetic', outcome: 'committed' })
  expect(ack.acknowledgments).toHaveLength(1)
  expect(scopedRequests).toHaveLength(1)
  expect(scopedRequests[0].status).toBe(200)
  const operations = scopedRequests[0].body.operations as Array<{ scope: { kind: string; id: string }; content: Record<string, unknown> }>
  expect(operations).toHaveLength(1)
  expect(operations[0].scope).toEqual({ kind: 'building', id: 'e8-building-library' })
  expect(operations[0].content.name).toBe('Synthetic Library E8.1 Accepted')
  expect(ack.acknowledgments?.[0]).toMatchObject({ revision: 1 })
  await expect(page.getByTestId('scoped-history-status')).toHaveText('Saved to local synthetic E5; not cloud-saved')
  console.log(`E8_2_UI_ACKNOWLEDGED ${JSON.stringify({ status: await page.getByTestId('scoped-history-status').innerText(), saveButtonDisabled: await saveButton.isDisabled() })}`)

  const restoredContext = await browser.newContext({ baseURL })
  const restoredPage = await restoredContext.newPage()
  await installLocalOnlyHarness(restoredContext, restoredPage, seed)
  const recoveredSnapshotResponse = restoredPage.waitForResponse((candidate) => {
    const url = new URL(candidate.url())
    return url.pathname === '/api/studio/scoped-save' && candidate.request().method() === 'GET'
  }, { timeout: 15_000 })
  await restoredPage.goto(`/studio/${campusId}/edit`)
  const getResponse = await recoveredSnapshotResponse
  const recoveredSnapshot = await getResponse.json() as { ok?: boolean; revision?: number; snapshot?: { scopes?: Record<string, { content?: { name?: string } }> } }
  await expect.poll(() => restoredPage.evaluate(() => {
    const context = (window as Window & { __naviContext?: { document?: CampusDocument } }).__naviContext
    return context?.document?.buildings.find((building) => building.id === 'e8-building-library')?.name
  }), { timeout: 15_000 }).toBe('Synthetic Library E8.1 Accepted')
  const mountedDocument = await restoredPage.evaluate(() => {
    const context = (window as Window & { __naviContext?: { document?: CampusDocument } }).__naviContext
    return {
      libraryName: context?.document?.buildings.find((building) => building.id === 'e8-building-library')?.name,
      labName: context?.document?.buildings.find((building) => building.id === 'e8-building-lab')?.name,
    }
  })
  console.log(`E8_2_RELOAD_CHECKPOINTS ${JSON.stringify({ getStatus: getResponse.status(), ok: recoveredSnapshot.ok, revision: recoveredSnapshot.revision, reconstructedLibrary: recoveredSnapshot.snapshot?.scopes?.['building:e8-building-library']?.content?.name, mountedDocument, domLibraryVisible: await restoredPage.getByRole('treeitem', { name: /Synthetic Library E8\.1 Accepted/ }).count() })}`)
  await expect(restoredPage.getByRole('treeitem', { name: /Synthetic Library E8\.1 Accepted/ })).toBeVisible({ timeout: 30_000 })
  await restoredPage.getByRole('treeitem', { name: /Synthetic Library E8\.1 Accepted/ }).click()
  await expect(restoredPage.locator('main input').nth(1)).toHaveValue('Synthetic Library E8.1 Accepted')
  expect(await restoredPage.getByRole('treeitem', { name: /Unchanged Synthetic Lab/ }).count()).toBe(1)
  await expect.poll(async () => {
    const snapshotResponse = await restoredPage.request.get(`/api/studio/scoped-save?campusId=${encodeURIComponent(campusId)}`)
    return snapshotResponse.status()
  }).toBe(200)
  await restoredContext.close()
})
