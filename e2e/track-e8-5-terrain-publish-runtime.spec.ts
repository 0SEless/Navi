import { createHash } from 'node:crypto'
import pg from 'pg'
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import type { CampusDocument, NavigationArtifacts } from '@navi/core'
import { Graph } from '../src/engine/graph'
import { GraphAdapter } from '../packages/editor/src/graph-adapter'
import { CoordinateTransformer } from '../packages/core/src/coordinates/transformer'
import { PostgresScopedCommitStore } from '../src/services/scoped-postgres-adapter'
import { projectScopedDocument } from '../src/services/scoped-change-detection'
import { applyScopedCampusSnapshot } from '../src/services/scoped-campus-snapshot'
import { createE85BrowserCampusDocument, createE8BrowserCampusMap } from '../scripts/track-e8-browser-acceptance/fixture'

const campusId = process.env.NAVI_E8_BROWSER_CAMPUS_ID ?? ''
const actorId = 'e8-browser-global-admin'
const documentId = `campus:${campusId}`
const authOrigin = 'http://127.0.0.1:45678'
const syntheticAdminToken = 'e8-local-synthetic-admin-token'
type CompileRouteArtifacts = Omit<NavigationArtifacts, 'graph' | 'poiIndex'> & {
  navigationGraph: NavigationArtifacts['graph']
  poiData?: NavigationArtifacts['poiIndex']
}
const pool = new pg.Pool({
  host: process.env.NAVI_E5_PG_HOST,
  port: Number(process.env.NAVI_E5_PG_PORT),
  database: process.env.NAVI_E5_PG_DATABASE,
  user: process.env.NAVI_E5_PG_USER,
  password: process.env.NAVI_E5_PG_PASSWORD,
  connectionTimeoutMillis: 3000,
  application_name: 'navi-e8-5-synthetic-browser-acceptance',
  max: 2,
})
const store = new PostgresScopedCommitStore({
  pool,
  resolveTrustedActor: () => actorId,
  resolveDocumentId: (requestedCampusId) => requestedCampusId === campusId ? documentId : null,
  authorizeActor: (context) => context.actorId === actorId && context.campusId === campusId && context.documentId === documentId,
})

function graphPayload(document: CampusDocument) {
  const graph = new Graph()
  graph.campusId = campusId
  new GraphAdapter(graph, new CoordinateTransformer()).sync(document)
  return { ...graph.toJSON(), authoredDocumentFormatVersion: 1, authoredDocument: document }
}

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/** Test-only local publication adapter. It accepts only actual /api/compile output. */
function publishCompiledArtifacts(artifacts: CompileRouteArtifacts, revision: number) {
  const metadata = artifacts.metadata ?? {}
  const graph = artifacts.navigationGraph
  const published = {
    graph,
    searchIndex: artifacts.searchIndex ?? { version: '1.0.0', entries: [] },
    buildingIndex: artifacts.buildingIndex ?? { version: '1.0.0', buildings: [] },
    poiIndex: artifacts.poiData ?? { version: '1.0.0', points: [] },
    spatialIndex: artifacts.spatialIndex ?? null,
    panoramaIndex: artifacts.panoramaIndex ?? null,
    floorGeometry: artifacts.floorGeometry ?? null,
    qrIndex: artifacts.qrIndex ?? null,
    ...(artifacts.terrainAreas !== undefined ? { terrainAreas: artifacts.terrainAreas } : {}),
    ...(artifacts.terrainVerticalDatum !== undefined ? { terrainVerticalDatum: artifacts.terrainVerticalDatum } : {}),
    components: artifacts.components ?? [],
    doors: artifacts.doors ?? [],
    metadata: { ...metadata, campusId, revision: String(revision) },
  }
  return {
    campusId,
    campusName: 'NAVI E8 Synthetic Campus',
    source: 'published_maps',
    revision: String(revision),
    buildings: published.buildingIndex.buildings,
    nodes: graph.nodes,
    edges: graph.edges,
    traces: [],
    pois: published.poiIndex.points,
    boundary: graph.metadata?.boundingBox ?? null,
    components: published.components,
    doors: published.doors,
    artifacts: published,
  }
}

async function addSyntheticSession(context: BrowserContext) {
  const session = {
    access_token: syntheticAdminToken,
    refresh_token: 'e8-local-synthetic-refresh-token',
    token_type: 'bearer',
    expires_in: 86_400,
    expires_at: Math.floor(Date.now() / 1000) + 86_400,
    user: { id: actorId, email: 'e8-browser-admin@example.test', app_metadata: { role: 'super_admin' }, user_metadata: {} },
  }
  await context.addCookies([{
    name: 'sb-127-auth-token',
    value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`,
    url: 'http://localhost:3119',
    httpOnly: false,
    sameSite: 'Lax',
  }])
}

async function installLocalHarness(context: BrowserContext, document: CampusDocument, bundle?: ReturnType<typeof publishCompiledArtifacts>) {
  await context.addInitScript((id) => {
    if (window.location.origin === 'http://localhost:3119') {
      localStorage.setItem('navi-default-campus', id)
      localStorage.setItem('navi-onboarded', 'true')
    }
  }, campusId)
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === authOrigin) return route.continue()
    if (url.origin !== 'http://localhost:3119') return route.abort('blockedbyclient')
    if (url.pathname === '/api/graph' && route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(graphPayload(document)) })
    }
    if (url.pathname === '/api/campus-maps' && route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ maps: [createE8BrowserCampusMap(campusId)] }) })
    }
    if (url.pathname === '/api/public-campus') {
      if (!bundle) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"synthetic publication not ready"}' })
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bundle) })
    }
    return route.continue()
  })
  await addSyntheticSession(context)
}

async function openStudio(browser: Browser, baseline: CampusDocument) {
  const context = await browser.newContext()
  await installLocalHarness(context, baseline)
  const page = await context.newPage()
  await page.goto(`http://localhost:3119/studio/${campusId}/edit`)
  await expect(page.getByRole('treeitem', { name: /Synthetic Library/ }).first()).toBeVisible({ timeout: 35_000 })
  await expect(page.getByTestId('scoped-history-status')).toContainText('Local draft ready')
  await expect(page.getByTestId('terrain-authoring-panel')).toBeVisible()
  return { context, page }
}

async function drawSyntheticTerrain(page: Page) {
  await page.getByTestId('terrain-draw-start').click()
  await page.getByTestId('terrain-name').fill('E8.5 Synthetic North Lawn')
  await page.getByTestId('terrain-elevation').fill('3.25')
  await page.getByTestId('terrain-datum-name').fill('E8.5 synthetic campus datum')
  await page.getByTestId('terrain-datum-zero').fill('Synthetic benchmark at 0.000 m')
  const canvas = page.locator('.maplibregl-canvas').first()
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('Studio MapLibre canvas is unavailable.')
  for (const [x, y] of [[0.64, 0.39], [0.75, 0.39], [0.75, 0.52], [0.64, 0.52]]) {
    await page.mouse.click(bounds.x + bounds.width * x, bounds.y + bounds.height * y)
  }
  await expect(page.getByText('4 vertices', { exact: true })).toBeVisible()
  await page.getByTestId('terrain-draw-finish').click()
  await expect(page.getByTestId('terrain-area-list')).toContainText('E8.5 Synthetic North Lawn')
}

async function authoritativeDocument(baseline: CampusDocument) {
  const state = await store.readCampusState(campusId)
  const snapshot = await store.reconstructCampus(campusId, state.revision)
  const document = await applyScopedCampusSnapshot(baseline, snapshot)
  return { state, snapshot, document }
}

async function compileAuthoritativeDocument(page: Page, document: CampusDocument): Promise<CompileRouteArtifacts> {
  const result = await page.evaluate(async (value) => {
    const response = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ document: value }),
    })
    return { statusCode: response.status, body: await response.json() }
  }, document) as { statusCode: number; body: { status: string; artifacts?: CompileRouteArtifacts; message?: string } }
  if (result.statusCode !== 200) throw new Error(`Authenticated /api/compile returned ${result.statusCode}: ${JSON.stringify(result.body)}`)
  if (result.body.status !== 'success' || !result.body.artifacts) throw new Error('The compiler did not return a successful result.')
  return result.body.artifacts
}

async function openPublishedMap(browser: Browser, bundle: ReturnType<typeof publishCompiledArtifacts>, route = '/map/explore', requireTerrainPanel = true) {
  const context = await browser.newContext()
  const document = createE85BrowserCampusDocument(campusId)
  await installLocalHarness(context, document, bundle)
  const page = await context.newPage()
  page.on('request', (request) => {
    if (request.url().includes('/api/public-campus')) console.log('E8_5_PUBLIC_REQUEST', request.url())
  })
  page.on('response', async (response) => {
    if (!response.url().includes('/api/public-campus')) return
    const body = await response.json().catch(() => null) as Record<string, unknown> | null
    const artifacts = body && typeof body.artifacts === 'object' && body.artifacts !== null ? body.artifacts as Record<string, unknown> : null
    const index = artifacts && typeof artifacts.buildingIndex === 'object' && artifacts.buildingIndex !== null ? artifacts.buildingIndex as Record<string, unknown> : null
    console.log('E8_5_PUBLIC_RESPONSE', JSON.stringify({ status: response.status(), source: body?.source, campusId: body?.campusId, revision: body?.revision, terrainCount: Array.isArray(artifacts?.terrainAreas) ? artifacts?.terrainAreas.length : null, buildingCount: Array.isArray(index?.buildings) ? index?.buildings.length : null }))
  })
  page.on('pageerror', (error) => console.log('E8_5_PUBLIC_PAGE_ERROR', error.message))
  await page.goto(`http://localhost:3119${route}`)
  if (requireTerrainPanel) {
    await expect(page.getByTestId('terrain-runtime-panel')).toBeVisible({ timeout: 35_000 })
    try {
      await expect.poll(async () => Number(await page.getByTestId('terrain-runtime-overlay').getAttribute('data-map-viewport-feature-count'))).toBeGreaterThan(0)
    } catch (error) {
      const overlay = page.getByTestId('terrain-runtime-overlay')
      const diagnostic = await overlay.getAttribute('data-map-diagnostic')
      console.log('E8_5_TERRAIN_RENDER_DIAGNOSTIC', JSON.stringify({
        url: page.url(),
        diagnostic,
        renderedAtAreaCenter: await overlay.getAttribute('data-map-rendered-feature-count'),
        sourceFeatureCount: await overlay.getAttribute('data-map-source-feature-count'),
        viewportFeatureCount: await overlay.getAttribute('data-map-viewport-feature-count'),
        terrainAreas: bundle.artifacts.terrainAreas,
        boundary: bundle.boundary,
      }))
      throw error
    }
  }
  return { context, page }
}

test('E8.5 Studio terrain is committed to E5, compiled, published locally, and rendered by NAVI runtime', async ({ browser }) => {
  expect(campusId).toMatch(/^navi-e8-browser-[a-f0-9]{16}$/)
  expect(process.env.NAVI_E5_PG_HOST).toBe('127.0.0.1')
  expect(process.env.NAVI_E5_PG_PORT).toBe('55433')
  expect(process.env.NAVI_E5_PG_DATABASE).toBe('navi_e4_test')
  const identity = await pool.query(`SELECT current_database() AS database, session_user AS role,
    current_setting('server_version_num')::integer AS server_version_num,
    shobj_description(d.oid, 'pg_database') AS marker
    FROM pg_database d WHERE d.datname = current_database()`)
  expect(identity.rows[0]).toMatchObject({ database: 'navi_e4_test', role: 'navi_e4_runner', marker: 'navi-e4-synthetic-v1' })
  expect(Number(identity.rows[0].server_version_num)).toBeGreaterThanOrEqual(170000)
  expect(Number(identity.rows[0].server_version_num)).toBeLessThan(180000)

  const baseline = createE85BrowserCampusDocument(campusId)
  const projection = projectScopedDocument(baseline, campusId)
  expect(projection.status).toBe('projected')
  if (projection.status !== 'projected') throw new Error('Synthetic baseline could not be projected.')
  await store.initializeCampus(actorId, campusId, documentId, projection.scopes.map(({ scope, content }) => ({ scope, content })))

  const { context: studioContext, page: studio } = await openStudio(browser, baseline)
  await drawSyntheticTerrain(studio)
  const savePromise = studio.waitForResponse((response) => response.url().endsWith('/api/studio/scoped-save') && response.request().method() === 'POST')
  await studio.getByRole('button', { name: 'Save campus changes' }).click()
  const saveResponse = await savePromise
  expect(saveResponse.status()).toBe(200)
  const acknowledgment = await saveResponse.json() as { outcome: string; acknowledgments: Array<{ revision: number; mutationId: string; contentChecksum: string; requestChecksum: string }> }
  expect(acknowledgment.outcome).toBe('committed')
  expect(acknowledgment.acknowledgments).toHaveLength(1)
  expect(acknowledgment.acknowledgments[0]).toMatchObject({ revision: 1 })
  expect(acknowledgment.acknowledgments[0].mutationId).toBeTruthy()
  expect(acknowledgment.acknowledgments[0].contentChecksum).toMatch(/^[a-f0-9]{64}$/)

  const first = await authoritativeDocument(baseline)
  expect(first.state.revision).toBe(1)
  expect(first.document.terrainAreas).toHaveLength(1)
  expect(first.document.terrainVerticalDatum?.name).toBe('E8.5 synthetic campus datum')
  const compiled1 = await compileAuthoritativeDocument(studio, first.document)
  expect(compiled1.terrainAreas).toEqual(first.document.terrainAreas)
  expect(compiled1.terrainVerticalDatum).toEqual(first.document.terrainVerticalDatum)
  const terrainChecksum1 = checksum({ areas: compiled1.terrainAreas, datum: compiled1.terrainVerticalDatum })
  const published1 = publishCompiledArtifacts(compiled1, 1)
  const runtime1 = await openPublishedMap(browser, published1)
  await expect(runtime1.page.getByTestId('terrain-runtime-panel')).toContainText('E8.5 Synthetic North Lawn')
  await runtime1.page.getByTestId(`terrain-runtime-select-${first.document.terrainAreas![0].id}`).click()
  await expect(runtime1.page.getByTestId('terrain-inspection-panel')).toContainText('3.25 m')
  await expect(runtime1.page.getByTestId('terrain-inspection-panel')).toContainText('E8.5 synthetic campus datum')
  await runtime1.page.screenshot({ path: 'reports/navi-studio-1.5-track-e8-5/logs/e8-5-runtime-terrain.png', fullPage: true })
  await runtime1.context.close()

  const unchangedCompile = await compileAuthoritativeDocument(studio, first.document)
  expect(checksum({ areas: unchangedCompile.terrainAreas, datum: unchangedCompile.terrainVerticalDatum })).toBe(terrainChecksum1)
  expect((await store.readCampusState(campusId)).revision).toBe(1)

  // A second explicit save advances only E5's authored terrain scope.
  await studio.getByTestId('terrain-select-' + first.document.terrainAreas![0].id).click()
  await studio.getByTestId('terrain-edit-elevation').fill('4.5')
  await studio.getByTestId('terrain-edit-apply').click()
  const updateSave = studio.waitForResponse((response) => response.url().endsWith('/api/studio/scoped-save') && response.request().method() === 'POST')
  await studio.getByRole('button', { name: 'Save campus changes' }).click()
  const updateResponse = await updateSave
  expect(updateResponse.status()).toBe(200)
  const updatedAck = await updateResponse.json() as { outcome: string; acknowledgments: Array<{ revision: number }> }
  expect(updatedAck.outcome).toBe('committed')
  expect(updatedAck.acknowledgments[0]?.revision).toBe(2)

  const second = await authoritativeDocument(baseline)
  expect(second.state.revision).toBe(2)
  const compiled2 = await compileAuthoritativeDocument(studio, second.document)
  expect(compiled2.terrainAreas?.[0]?.elevationMeters).toBe(4.5)
  const terrainChecksum2 = checksum({ areas: compiled2.terrainAreas, datum: compiled2.terrainVerticalDatum })
  expect(terrainChecksum2).not.toBe(terrainChecksum1)
  const published2 = publishCompiledArtifacts(compiled2, 2)

  // Same-context reload exercises IndexedDB cache R1 followed by network R2.
  const updatedRuntime = await openPublishedMap(browser, published1)
  await expect(updatedRuntime.page.getByTestId('terrain-runtime-panel')).toBeVisible()
  await updatedRuntime.context.route('**/api/public-campus?*', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(published2) }))
  await updatedRuntime.page.reload()
  await expect(updatedRuntime.page.getByTestId('terrain-runtime-panel')).toContainText('4.5 m', { timeout: 35_000 })
  await updatedRuntime.page.getByTestId(`terrain-runtime-select-${second.document.terrainAreas![0].id}`).click()
  await expect(updatedRuntime.page.getByTestId('terrain-inspection-panel')).toContainText('4.5 m')
  await updatedRuntime.context.close()

  // Fresh browser context reconstructs the newest published terrain with no prior cache.
  const fresh = await openPublishedMap(browser, published2)
  await expect(fresh.page.getByTestId('terrain-runtime-panel')).toContainText('4.5 m')
  await fresh.context.close()

  // Legacy compilation omits terrain while preserving buildings in the actual Explore runtime.
  const legacyCompiled = await compileAuthoritativeDocument(studio, baseline)
  expect(Object.hasOwn(legacyCompiled, 'terrainAreas')).toBe(false)
  expect(Object.hasOwn(legacyCompiled, 'terrainVerticalDatum')).toBe(false)
  const legacy = await openPublishedMap(browser, publishCompiledArtifacts(legacyCompiled, 3), '/map/explore', false)
  await expect(legacy.page.getByTestId('terrain-runtime-panel')).toHaveCount(0)
  await legacy.page.getByRole('button', { name: 'Search campus' }).click()
  await legacy.page.getByRole('searchbox', { name: 'Search campus places' }).fill('Synthetic Library')
  await expect(legacy.page.getByText('Synthetic Library', { exact: true }).first()).toBeVisible()
  await legacy.page.screenshot({ path: 'reports/navi-studio-1.5-track-e8-5/logs/e8-5-legacy-runtime.png', fullPage: true })
  await legacy.context.close()

  // /map/navigate uses the same published bundle and ExploreMap terrain layer.
  const navigate = await openPublishedMap(browser, published2, '/map/navigate', false)
  await expect(navigate.page.getByRole('region', { name: 'Map' })).toBeVisible()
  await expect(navigate.page.locator('[data-terrain-area-count]').first()).toHaveAttribute('data-terrain-area-count', '1')
  await expect(navigate.page.getByTestId('terrain-runtime-panel')).toContainText('4.5 m')
  await expect.poll(async () => Number(await navigate.page.getByTestId('terrain-runtime-overlay').getAttribute('data-map-rendered-feature-count'))).toBeGreaterThan(0)
  await navigate.page.screenshot({ path: 'reports/navi-studio-1.5-track-e8-5/logs/e8-5-navigate-terrain.png', fullPage: true })
  await navigate.context.close()

  const finalState = await store.readCampusState(campusId)
  const reconstructed = await store.reconstructCampus(campusId, finalState.revision)
  const scopeHeads = await pool.query(`SELECT scope_kind, scope_id, revision, content_checksum
    FROM navi_scoped.scope_heads WHERE campus_id = $1 ORDER BY scope_kind, scope_id`, [campusId])
  const counts = await pool.query(`SELECT
    (SELECT count(*)::integer FROM navi_scoped.change_sets WHERE campus_id = $1) AS change_sets,
    (SELECT count(*)::integer FROM navi_scoped.change_operations WHERE campus_id = $1) AS operations,
    (SELECT count(*)::integer FROM navi_scoped.mutation_receipts WHERE campus_id = $1) AS receipts`, [campusId])
  expect(finalState.revision).toBe(2)
  expect(counts.rows[0]).toMatchObject({ change_sets: 2, operations: 2, receipts: 2 })
  expect(scopeHeads.rows.filter((row) => row.scope_kind !== 'terrain').every((row) => Number(row.revision) === 0)).toBe(true)
  expect(Number(scopeHeads.rows.find((row) => row.scope_kind === 'terrain')?.revision)).toBe(2)
  const integrity = {
    campusId,
    databaseIdentity: identity.rows[0],
    e5AuthoredRevision: finalState.revision,
    publishedBundleRevision: 2,
    sourceDocumentVersion: compiled2.metadata?.sourceDocumentVersion,
    compiledArtifactChecksum1: checksum(compiled1),
    compiledArtifactChecksum2: checksum(compiled2),
    publishedBundleChecksum1: checksum(published1.artifacts),
    publishedBundleChecksum2: checksum(published2.artifacts),
    terrainChecksum1,
    terrainChecksum2,
    reconstructedChecksum: reconstructed.checksum,
    scopeHeads: scopeHeads.rows,
    counts: counts.rows[0],
  }
  console.log('E8_5_STUDIO_E5_COMPILER_RUNTIME_EVIDENCE', JSON.stringify(integrity))
  await studioContext.close()
})

test.afterAll(async () => { await pool.end() })
