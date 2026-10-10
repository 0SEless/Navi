import { createHash } from 'node:crypto'
import { expect, test, type Page, type TestInfo } from '@playwright/test'

const BUILDING_ID = 'osm-bldg-test-001'
const BUILDING_NAME = 'Science Hall'
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==',
  'base64',
)

const campusDocument = (campusId: string) => ({
  campusId,
  campusName: 'Pointer Regression Campus',
  source: 'graph_snapshots',
  revision: 'pointer-fixture-1',
  nodes: [
    { id: 'bounds-sw', label: 'Boundary southwest', type: 'outdoor', position: { lat: 14.397, lng: 121.197 }, buildingId: '' },
    { id: 'bounds-ne', label: 'Boundary northeast', type: 'outdoor', position: { lat: 14.403, lng: 121.203 }, buildingId: '' },
  ],
  edges: [],
  buildings: [{
    id: BUILDING_ID,
    name: BUILDING_NAME,
    code: 'SCI',
    floors: [0, 1],
    baseElevation: 0,
    height: 12,
    center: { lat: 14.4, lng: 121.2 },
    footprint: [
      { lat: 14.3994, lng: 121.1994 },
      { lat: 14.3994, lng: 121.2006 },
      { lat: 14.4006, lng: 121.2006 },
      { lat: 14.4006, lng: 121.1994 },
      { lat: 14.3994, lng: 121.1994 },
    ],
  }],
})

async function installCampusFixture(page: Page) {
  await page.addInitScript(() => localStorage.setItem('navi-onboarded', 'true'))
  await page.route('**/api/public-campus?*', async (route) => {
    const campusId = new URL(route.request().url()).searchParams.get('campus_id') ?? 'pointer-fixture-campus'
    await route.fulfill({ json: campusDocument(campusId) })
  })
  await page.route('https://tile.openstreetmap.org/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG })
  })
}

async function waitForMapInteractive(page: Page) {
  await expect(page.getByTestId('public-campus-runtime-state')).toHaveAttribute('data-state', 'interactive')
}

async function runtimeCounts(page: Page) {
  return page.evaluate(() => ({
    hostCount: document.querySelectorAll('[data-testid="navigation-map-host"]').length,
    canvasCount: document.querySelectorAll('[data-testid="navigation-map-host"] canvas.maplibregl-canvas').length,
    runtimeStateCount: document.querySelectorAll('[data-testid="public-campus-runtime-state"]').length,
  }))
}

async function mapHitTests(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('[data-testid="navigation-map-host"]')
    const overlay = document.querySelector<HTMLElement>('[data-testid="map-route-overlay"]')
    if (!host || !overlay) return { error: 'map host or route overlay missing', samples: [] }
    const rect = host.getBoundingClientRect()
    const samples = [[0.32, 0.42], [0.5, 0.58], [0.68, 0.68]].map(([px, py]) => {
      const x = Math.round(rect.left + rect.width * px)
      const y = Math.round(rect.top + rect.height * py)
      const target = document.elementFromPoint(x, y)
      return {
        x,
        y,
        target: target?.tagName.toLowerCase() ?? null,
        className: typeof target?.className === 'string' ? target.className : '',
        mapHost: Boolean(target && host.contains(target)),
        routeOverlay: Boolean(target?.closest('[data-testid="map-route-overlay"]')),
      }
    })
    return {
      routePointerEvents: getComputedStyle(overlay).pointerEvents,
      samples,
    }
  })
}

async function clickBuildingCenter(page: Page, touch = false) {
  const rect = await page.getByTestId('navigation-map-host').boundingBox()
  expect(rect).not.toBeNull()
  const x = Math.round(rect!.x + rect!.width / 2)
  const y = Math.round(rect!.y + rect!.height / 2)
  if (touch) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
  } else {
    await page.mouse.click(x, y)
  }
}

async function mapCamera(page: Page) {
  return page.evaluate(() => {
    type MapInstance = {
      getCenter: () => { lng: number; lat: number }
      getZoom: () => number
      getBearing: () => number
      getPitch: () => number
      fire: (...args: unknown[]) => unknown
      jumpTo: (...args: unknown[]) => unknown
    }
    type Hook = { memoizedState?: unknown; next?: Hook | null }
    type Fiber = {
      memoizedState?: Hook | null
      memoizedProps?: Record<string, unknown> | null
      stateNode?: { map?: unknown } | null
      child?: Fiber | null
      sibling?: Fiber | null
      return?: Fiber | null
    }
    const isMap = (value: unknown): value is MapInstance => {
      if (!value || typeof value !== 'object') return false
      const candidate = value as Partial<MapInstance>
      return typeof candidate.getCenter === 'function'
        && typeof candidate.getZoom === 'function'
        && typeof candidate.getBearing === 'function'
        && typeof candidate.getPitch === 'function'
        && typeof candidate.fire === 'function'
        && typeof candidate.jumpTo === 'function'
    }
    const host = document.querySelector<HTMLElement>('[data-testid="navigation-map-host"]')
    if (!host) throw new Error('MapLibre host is missing')
    const fiberKey = Object.keys(host).find((key) => key.startsWith('__reactFiber$'))
    if (!fiberKey) throw new Error('React fiber is unavailable on the MapLibre host')
    const root = (host as unknown as Record<string, unknown>)[fiberKey] as Fiber
    const visited = new Set<Fiber>()
    const findMap = (fiber: Fiber | null | undefined): MapInstance | null => {
      if (!fiber || visited.has(fiber)) return null
      visited.add(fiber)
      let hook = fiber.memoizedState
      while (hook) {
        const state = hook.memoizedState
        if (isMap(state)) return state
        if (state && typeof state === 'object') {
          if ('current' in state && isMap(state.current)) return state.current
          if ('value' in state && isMap(state.value)) return state.value
        }
        hook = hook.next
      }
      const propsMap = fiber.memoizedProps?.map
      if (isMap(propsMap)) return propsMap
      if (isMap(fiber.stateNode?.map)) return fiber.stateNode.map
      return findMap(fiber.child) ?? findMap(fiber.sibling) ?? findMap(fiber.return)
    }
    const map = findMap(root)
    if (!map) throw new Error('MapLibre instance was not found from its rendered canvas')
    const center = map.getCenter()
    return {
      center: { lng: center.lng, lat: center.lat },
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    }
  })
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
  await testInfo.attach(name, { body: JSON.stringify(value, null, 2), contentType: 'application/json' })
}

test.describe('Explore building interaction regression', () => {
  test.beforeEach(async ({ page }) => {
    await installCampusFixture(page)
  })

  test('passes hit testing to the canvas, opens a building with a physical click, pans, and keeps Explore controls live', async ({ page }, testInfo) => {
    await page.goto('/map/explore')
    await waitForMapInteractive(page)

    const countsBefore = await runtimeCounts(page)
    expect(countsBefore).toEqual({ hostCount: 1, canvasCount: 1, runtimeStateCount: 1 })
    const before = await mapHitTests(page)
    expect(before.routePointerEvents).toBe('none')
    expect(before.samples.every((sample) => sample.mapHost), JSON.stringify(before.samples)).toBe(true)

    const simulatedRegression = await page.evaluate(() => {
      const overlay = document.querySelector<HTMLElement>('[data-testid="map-route-overlay"]')
      if (!overlay) return { error: 'route overlay missing', intercepted: false }
      const rect = document.querySelector('[data-testid="navigation-map-host"]')!.getBoundingClientRect()
      overlay.style.pointerEvents = 'auto'
      const target = document.elementFromPoint(Math.round(rect.left + rect.width * 0.5), Math.round(rect.top + rect.height * 0.58))
      const intercepted = Boolean(target?.closest('[data-testid="map-route-overlay"]'))
      overlay.style.pointerEvents = ''
      return { intercepted, target: target?.tagName.toLowerCase() ?? null }
    })
    expect(simulatedRegression.intercepted).toBe(true)
    const after = await mapHitTests(page)
    expect(after.samples.every((sample) => sample.mapHost)).toBe(true)
    console.log('[DOM_HIT_TEST_PROOF]', JSON.stringify({ simulatedRegression, before, after }))
    await attachJson(testInfo, 'canvas-hit-test-before-after.json', { simulatedRegression, before, after })

    await clickBuildingCenter(page)
    await expect(page.getByRole('dialog', { name: `${BUILDING_NAME} details` })).toBeVisible()
    await page.getByRole('button', { name: 'Close building details' }).click()

    const canvas = page.locator('[data-testid="navigation-map-host"] canvas.maplibregl-canvas')
    const beforePan = await canvas.screenshot()
    const rect = await page.getByTestId('navigation-map-host').boundingBox()
    expect(rect).not.toBeNull()
    const cameraBefore = await mapCamera(page)
    const start = { x: Math.round(rect!.x + rect!.width * 0.2), y: Math.round(rect!.y + rect!.height * 0.42) }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + 90, start.y + 55, { steps: 8 })
    await page.mouse.up()
    const cameraAfter = await mapCamera(page)
    const afterPan = await canvas.screenshot()
    const centerDelta = Math.abs(cameraAfter.center.lng - cameraBefore.center.lng)
      + Math.abs(cameraAfter.center.lat - cameraBefore.center.lat)
    expect(centerDelta).toBeGreaterThan(1e-7)
    expect(createHash('sha256').update(afterPan).digest('hex')).not.toBe(createHash('sha256').update(beforePan).digest('hex'))
    console.log('[MAP_DRAG_PROOF]', JSON.stringify({ cameraBefore, cameraAfter, centerDelta, imageChanged: true, beforeSha256: createHash('sha256').update(beforePan).digest('hex'), afterSha256: createHash('sha256').update(afterPan).digest('hex') }))
    await testInfo.attach('map-canvas-before-pan.png', { body: beforePan, contentType: 'image/png' })
    await testInfo.attach('map-canvas-after-pan.png', { body: afterPan, contentType: 'image/png' })

    await page.getByRole('button', { name: 'Cycle camera view' }).click()
    expect(await runtimeCounts(page)).toEqual(countsBefore)
  })

  test('keeps one host and canvas across Explore → Navigate → Explore and still selects a building', async ({ page }, testInfo) => {
    await page.goto('/map/explore')
    await waitForMapInteractive(page)
    const hostBefore = await page.evaluate(() => {
      const w = window as Window & { __mapHostBefore?: Element; __mapCanvasBefore?: Element }
      w.__mapHostBefore = document.querySelector('[data-testid="navigation-map-host"]') ?? undefined
      w.__mapCanvasBefore = document.querySelector('[data-testid="navigation-map-host"] canvas.maplibregl-canvas') ?? undefined
      return { hostCount: document.querySelectorAll('[data-testid="navigation-map-host"]').length, canvasCount: document.querySelectorAll('[data-testid="navigation-map-host"] canvas.maplibregl-canvas').length }
    })
    expect(hostBefore).toEqual({ hostCount: 1, canvasCount: 1 })

    await page.getByRole('button', { name: 'Navigate' }).click()
    await expect(page).toHaveURL(/\/map\/navigate$/)
    const destinationControl = page.getByRole('button', { name: 'Search building, room, or place' })
    await expect(destinationControl).toBeVisible()
    await destinationControl.click()
    await expect(page.getByRole('searchbox', { name: 'Search destination' })).toBeVisible()
    await page.getByRole('button', { name: 'Close location search' }).click()
    const navigateCounts = await runtimeCounts(page)
    expect(navigateCounts).toEqual({ hostCount: 1, canvasCount: 1, runtimeStateCount: 1 })

    await page.getByRole('button', { name: 'Explore' }).click()
    await expect(page).toHaveURL(/\/map\/explore$/)
    await waitForMapInteractive(page)
    const exploreAgain = await page.evaluate(() => {
      const w = window as Window & { __mapHostBefore?: Element; __mapCanvasBefore?: Element }
      return {
        hostCount: document.querySelectorAll('[data-testid="navigation-map-host"]').length,
        canvasCount: document.querySelectorAll('[data-testid="navigation-map-host"] canvas.maplibregl-canvas').length,
        sameHost: w.__mapHostBefore === document.querySelector('[data-testid="navigation-map-host"]'),
        sameCanvas: w.__mapCanvasBefore === document.querySelector('[data-testid="navigation-map-host"] canvas.maplibregl-canvas'),
      }
    })
    expect(exploreAgain).toEqual({ hostCount: 1, canvasCount: 1, sameHost: true, sameCanvas: true })
    const hitsAfterTransition = await mapHitTests(page)
    expect(hitsAfterTransition.samples.every((sample) => sample.mapHost)).toBe(true)
    console.log('[PERSISTENT_RUNTIME_PROOF]', JSON.stringify({ before: hostBefore, navigate: navigateCounts, after: exploreAgain, hitTestsAfterTransition: hitsAfterTransition }))

    await clickBuildingCenter(page)
    await expect(page.getByRole('dialog', { name: `${BUILDING_NAME} details` })).toBeVisible()
    await attachJson(testInfo, 'persistent-runtime-counts-and-hit-tests.json', { hostBefore, navigateCounts, exploreAgain, hitsAfterTransition })
  })

  test('routes a synthesized non-routable building result to its canonical Explore deep link', async ({ page }, testInfo) => {
    await page.goto('/map/search', { waitUntil: 'domcontentloaded' })
    const search = page.getByRole('textbox', { name: 'Search campus' })
    await expect(search).toBeVisible()
    await expect(page.getByText('Search for a room, building, or office to find your way around campus.')).toBeVisible()
    await page.waitForLoadState('networkidle')
    await search.fill(BUILDING_NAME)
    await expect(search).toHaveValue(BUILDING_NAME)
    const result = page.getByText(BUILDING_NAME, { exact: true }).last()
    await expect(result).toBeVisible()
    await result.click()
    await expect(page).toHaveURL(new RegExp(`/map/explore\\?building_id=${BUILDING_ID}$`))
    await expect(page.getByRole('dialog', { name: `${BUILDING_NAME} details` })).toBeVisible()
    await waitForMapInteractive(page)

    const counts = await runtimeCounts(page)
    expect(counts).toEqual({ hostCount: 1, canvasCount: 1, runtimeStateCount: 1 })
    console.log('[SEARCH_BUILDING_PROOF]', JSON.stringify({ url: page.url(), counts, accessibleDialog: `${BUILDING_NAME} details` }))
    await attachJson(testInfo, 'search-building-deep-link.json', { url: page.url(), counts })
  })

  test('keeps a deep-linked BuildingSheet above the loading presentation', async ({ page }) => {
    let releaseTiles!: () => void
    const tiles = new Promise<void>((resolve) => { releaseTiles = resolve })
    await page.unroute('https://tile.openstreetmap.org/**')
    await page.route('https://tile.openstreetmap.org/**', async (route) => {
      await tiles
      await route.fulfill({ status: 200, contentType: 'image/png', body: TILE_PNG })
    })

    try {
      await page.goto(`/map/explore?building_id=${BUILDING_ID}`, { waitUntil: 'domcontentloaded' })
      const dialog = page.getByRole('dialog', { name: `${BUILDING_NAME} details` })
      const backdrop = page.getByTestId('public-campus-runtime-backdrop')
      await expect(dialog).toBeVisible()
      await expect(backdrop).toBeVisible()
      const layerState = await page.evaluate(() => {
        const route = document.querySelector<HTMLElement>('[data-testid="map-route-overlay"]')!
        const backdrop = document.querySelector<HTMLElement>('[data-testid="public-campus-runtime-backdrop"]')!
        const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
        const button = dialog.querySelector<HTMLElement>('button[aria-label="Close building details"]')!
        const rect = button.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        return {
          routePointerEvents: getComputedStyle(route).pointerEvents,
          backdropPointerEvents: getComputedStyle(backdrop).pointerEvents,
          backdropZIndex: getComputedStyle(backdrop).zIndex,
          routeZIndex: getComputedStyle(route).zIndex,
          dialogZIndex: getComputedStyle(dialog).zIndex,
          closeButtonHit: hit === button || Boolean(hit?.closest('button[aria-label="Close building details"]')),
        }
      })
      expect(layerState).toEqual({
        routePointerEvents: 'none',
        backdropPointerEvents: 'none',
        backdropZIndex: '5',
        routeZIndex: '10',
        dialogZIndex: '30',
        closeButtonHit: true,
      })
      console.log('[RUNTIME_STACK_PROOF]', JSON.stringify(layerState))
      const buttonBox = await page.getByRole('button', { name: 'Close building details' }).boundingBox()
      expect(buttonBox).not.toBeNull()
      await page.mouse.click(buttonBox!.x + buttonBox!.width / 2, buttonBox!.y + buttonBox!.height / 2)
      await expect(dialog).toHaveCount(0)
    } finally {
      releaseTiles()
    }
  })
})

test.describe('390px mobile Explore building interaction', () => {
  test.beforeEach(async ({ page }) => {
    await installCampusFixture(page)
    await page.setViewportSize({ width: 390, height: 844 })
  })

  test('supports building tap, sheet close, Explore controls, and touch pan with one canvas', async ({ page }, testInfo) => {
    await page.goto('/map/explore')
    await waitForMapInteractive(page)
    expect(await runtimeCounts(page)).toEqual({ hostCount: 1, canvasCount: 1, runtimeStateCount: 1 })
    console.log('[MOBILE_INTERACTION_PROOF]', JSON.stringify({ viewport: { width: 390, height: 844 }, counts: await runtimeCounts(page), hitTests: await mapHitTests(page) }))
    expect((await mapHitTests(page)).samples.every((sample) => sample.mapHost)).toBe(true)

    await clickBuildingCenter(page, true)
    await expect(page.getByRole('dialog', { name: `${BUILDING_NAME} details` })).toBeVisible()
    await page.getByRole('button', { name: 'Close building details' }).click()
    await expect(page.getByRole('dialog', { name: `${BUILDING_NAME} details` })).toHaveCount(0)

    const cameraControl = page.getByRole('button', { name: 'Cycle camera view' })
    const cameraBox = await cameraControl.boundingBox()
    expect(cameraBox).not.toBeNull()
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: cameraBox!.x + cameraBox!.width / 2, y: cameraBox!.y + cameraBox!.height / 2, id: 1 }],
    })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })

    const host = await page.getByTestId('navigation-map-host').boundingBox()
    expect(host).not.toBeNull()
    const start = { x: Math.round(host!.x + host!.width * 0.18), y: Math.round(host!.y + host!.height * 0.42) }
    const canvas = page.locator('[data-testid="navigation-map-host"] canvas.maplibregl-canvas')
    const beforeTouchPan = await canvas.screenshot()
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + 70, y: start.y + 45, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()

    const afterTouchPan = await canvas.screenshot()
    const beforeTouchHash = createHash('sha256').update(beforeTouchPan).digest('hex')
    const afterTouchHash = createHash('sha256').update(afterTouchPan).digest('hex')
    expect(afterTouchHash).not.toBe(beforeTouchHash)
    console.log('[MOBILE_PAN_PROOF]', JSON.stringify({ changed: true, beforeSha256: beforeTouchHash, afterSha256: afterTouchHash }))
    expect(await runtimeCounts(page)).toEqual({ hostCount: 1, canvasCount: 1, runtimeStateCount: 1 })
    await attachJson(testInfo, 'mobile-canvas-hit-tests-and-counts.json', { viewport: { width: 390, height: 844 }, hitTests: await mapHitTests(page), counts: await runtimeCounts(page) })
  })
})
