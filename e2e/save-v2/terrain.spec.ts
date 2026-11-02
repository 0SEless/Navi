import path from 'node:path'
import { expect, test } from '@playwright/test'
import { floor, openAdmin, seededCampus, waitForEditor, type ProbeWindow } from './support'

// Terrain plan acceptance (built up task by task; Task 16 completes it). Uses the owner's
// ASU-Ibajay TopoExport files; the seeded campus sits inside that export's frame.

const FIXTURES = path.join(__dirname, '..', '..', 'packages', 'core', 'src', 'terrain', '__tests__', 'fixtures')
const SHOTS = path.join(__dirname, '..', '..', 'reports', 'save-v2', 'raw', 'terrain')

function ibajayDocument(campusId: string) {
  const rect = (lat0: number, lng0: number, lat1: number, lng1: number) => ({ points: [
    { lat: lat0, lng: lng0 }, { lat: lat0, lng: lng1 }, { lat: lat1, lng: lng1 }, { lat: lat1, lng: lng0 }, { lat: lat0, lng: lng0 },
  ] })
  const hall = {
    id: 'bld-hall', name: 'Hall', code: 'HAL', category: 'academic', description: 'Terrain probe building',
    footprint: rect(11.8172, 122.1702, 11.8175, 122.1708),
    baseElevation: 0, height: 10, floors: [floor('bld-hall-floor-1', 'Floor 1')],
    verticalConnectors: [], verticalTransitions: [], color: '#4682b4', aliases: [], metadata: {},
  }
  return {
    schemaVersion: 1, version: 1, connectivitySemanticsVersion: '1.0.0',
    metadata: { campusId, name: 'Terrain Probe Campus', description: 'ASU-Ibajay terrain probe', lastModified: '2026-11-03T00:00:00.000Z', editorVersion: '1.5-probe' },
    buildings: [hall],
    roads: [{ id: 'road-main', name: 'Main Road', polyline: { points: [{ lat: 11.8168, lng: 122.1695 }, { lat: 11.8186, lng: 122.1722 }] }, width: 6, surface: 'concrete', type: 'connector', metadata: {} }],
    roadJunctions: [], separatedCrossings: [], panoramas: [], qrCheckpoints: [], areas: [],
    boundary: { points: [{ lat: 11.8163, lng: 122.1690 }, { lat: 11.8163, lng: 122.1730 }, { lat: 11.8190, lng: 122.1730 }, { lat: 11.8190, lng: 122.1690 }] },
  }
}

test('T1 — terrain workspace: import the TopoExport ground, views and the mini 3D', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana, ibajayDocument)

  await ana.page.goto(`/studio/${campusId}/edit/terrain`)
  await waitForEditor(ana.page)
  await ana.page.waitForTimeout(1000)
  ana.blocked.length = 0 // late tile requests of the seeding page (map editor, OSM) are not the terrain page's
  await expect(ana.page.getByRole('button', { name: 'Import ground' })).toBeVisible({ timeout: 60_000 })
  await ana.page.getByRole('button', { name: 'Import ground' }).click()
  await ana.page.getByLabel('Terrain files').setInputFiles([
    path.join(FIXTURES, 'topoexport-asu-ibajay.glb'),
    path.join(FIXTURES, 'topoexport-frame.geojson'),
  ])
  await ana.page.getByRole('button', { name: 'Import', exact: true }).click()

  await expect(ana.page.getByText('Sea level (imported)')).toBeVisible()
  await expect(ana.page.locator('[data-terrain-map="top"]')).toBeVisible()
  await expect(ana.page.locator('[data-terrain-mini="true"]')).toBeVisible()
  const range = await ana.page.evaluate(() => (window as ProbeWindow).__naviStudioV2!.context.document.terrain?.colorRange)
  expect(range!.minM).toBeCloseTo(1.8, 0)
  expect(range!.maxM).toBeCloseTo(35.5, 0)
  await ana.page.waitForTimeout(4000)
  await ana.page.screenshot({ path: path.join(SHOTS, 't1-heights.png') })
  const maps = await ana.page.evaluate(() => {
    const all = (window as unknown as { __naviTerrainMaps?: Record<string, { getTerrain(): unknown; getLayer(id: string): unknown; isSourceLoaded(id: string): boolean }> }).__naviTerrainMaps ?? {}
    return Object.fromEntries(Object.entries(all).map(([role, m]) => [role, { terrain: m.getTerrain(), relief: Boolean(m.getLayer('terrain-relief')), loaded: m.isSourceLoaded('terrain-relief-dem') }]))
  })
  expect(maps.top).toEqual({ terrain: null, relief: true, loaded: true })
  expect(maps['3d']).toMatchObject({ terrain: { source: 'terrain-dem', exaggeration: 1 }, relief: true })

  await ana.page.getByRole('button', { name: 'Contours' }).click()
  await ana.page.waitForTimeout(3000)
  await ana.page.screenshot({ path: path.join(SHOTS, 't1-contours.png') })

  await ana.page.getByRole('button', { name: 'Swap' }).click()
  await ana.page.getByRole('button', { name: 'Heights' }).click()
  await ana.page.getByLabel('Height exaggeration').fill('3')
  await ana.page.waitForTimeout(4000)
  await ana.page.screenshot({ path: path.join(SHOTS, 't1-3d.png') })

  expect(ana.blocked).toEqual([])
  await ana.context.close()
})

test('T2 — a Raise stroke is one undo step, shows in the Changes view, and undo/redo work', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana, ibajayDocument)
  await ana.page.goto(`/studio/${campusId}/edit/terrain`)
  await waitForEditor(ana.page)
  await ana.page.waitForTimeout(1000)
  ana.blocked.length = 0 // late tile requests of the seeding page (map editor, OSM) are not the terrain page's
  await ana.page.getByRole('button', { name: 'Start flat' }).click()
  await ana.page.getByLabel('Reference name').fill('Gate road')
  await ana.page.getByLabel('0 m means').fill('The road at the main gate')
  await ana.page.getByRole('button', { name: 'Create terrain' }).click()
  await expect(ana.page.locator('[data-terrain-map="top"]')).toBeVisible()
  await ana.page.waitForTimeout(2500)

  await ana.page.getByRole('button', { name: 'Raise / Lower' }).click()
  await ana.page.getByLabel('Brush size').fill('30')
  await ana.page.getByLabel('Brush strength').fill('100')
  const box = (await ana.page.locator('[data-terrain-map="top"]').boundingBox())!
  const y = box.y + box.height / 2
  await ana.page.mouse.move(box.x + box.width * 0.35, y)
  await ana.page.mouse.down()
  for (let i = 0; i <= 20; i++) await ana.page.mouse.move(box.x + box.width * (0.35 + i * 0.015), y, { steps: 2 })
  await ana.page.waitForTimeout(1500) // holding still keeps raising
  await ana.page.mouse.up()

  const tilesAfter = () => ana.page.evaluate(() => Object.keys((window as ProbeWindow).__naviStudioV2!.context.document.terrainTiles ?? {}).length)
  expect(await tilesAfter()).toBeGreaterThan(0)
  await ana.page.evaluate(() => {
    const w = window as unknown as { __terrainErrors: string[]; __naviTerrainMaps: Record<string, any> }
    w.__terrainErrors = []
    w.__naviTerrainMaps.top.on('error', (e: { error?: { message?: string } }) => w.__terrainErrors.push(String(e.error?.message ?? e)))
  })
  const switched = Date.now()
  await ana.page.getByRole('button', { name: 'Changes' }).click()
  await ana.page.waitForFunction(() => (window as unknown as { __naviTerrainMaps: Record<string, { isSourceLoaded(id: string): boolean }> }).__naviTerrainMaps.top.isSourceLoaded('terrain-changes'), undefined, { timeout: 15_000 })
  expect(Date.now() - switched).toBeLessThan(5000) // measured 1.0 s after the ImageBitmap tiles (was 10.8 s)
  await ana.page.waitForTimeout(500)
  await ana.page.screenshot({ path: path.join(SHOTS, 't2-changes.png') })
  expect(await ana.page.evaluate(() => (window as unknown as { __terrainErrors: string[] }).__terrainErrors)).toEqual([])

  await ana.page.keyboard.press('Control+z')
  expect(await tilesAfter()).toBe(0)
  await ana.page.keyboard.press('Control+y')
  expect(await tilesAfter()).toBeGreaterThan(0)
  expect(ana.blocked).toEqual([])
  await ana.context.close()
})

test('T3 — lasso, slope, contour pen to surface, boundary corner and a local tracing image', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana, ibajayDocument)
  const page = ana.page
  await page.goto(`/studio/${campusId}/edit/terrain`)
  await waitForEditor(page)
  await page.waitForTimeout(1000)
  ana.blocked.length = 0 // late tile requests of the seeding page (map editor, OSM) are not the terrain page's
  await page.getByRole('button', { name: 'Trace contours' }).click()
  await page.getByLabel('Reference name').fill('Sea level')
  await page.getByLabel('0 m means').fill('Mean sea level')
  await page.getByRole('button', { name: 'Create terrain' }).click()
  await expect(page.getByLabel('Contour pen settings')).toBeVisible()
  await page.waitForTimeout(2000)
  const box = (await page.locator('[data-terrain-map="top"]').boundingBox())!
  const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy })
  const click = async (fx: number, fy: number) => { const p = at(fx, fy); await page.mouse.click(p.x, p.y) }
  const doc = <T,>(read: string) => page.evaluate((r) => new Function('doc', `return ${r}`)((window as ProbeWindow).__naviStudioV2!.context.document), read) as Promise<T>

  // Contour pen: two lines, then Generate surface → contours base.
  await click(0.3, 0.3); await click(0.7, 0.3)
  await page.getByLabel('Contour height').fill('10')
  await page.getByRole('button', { name: 'Add line' }).click()
  await click(0.3, 0.7); await click(0.7, 0.7)
  await page.getByLabel('Contour height').fill('20')
  await page.getByRole('button', { name: 'Add line' }).click()
  await page.getByRole('button', { name: 'Generate surface' }).click()
  expect(await doc<string>('doc.terrain.base.kind')).toBe('contours')
  expect(await doc<number>('doc.terrain.colorRange.maxM')).toBe(20)

  // Lasso: set an area to 30 m.
  await page.getByRole('button', { name: 'Lasso' }).click()
  await click(0.45, 0.45); await click(0.55, 0.45); await click(0.55, 0.55); await click(0.45, 0.55)
  await page.getByLabel('Lasso metres').fill('30')
  await page.getByRole('button', { name: 'Apply' }).click()
  expect(await doc<number>('Object.keys(doc.terrainTiles ?? {}).length')).toBeGreaterThan(0)

  // Slope between two points.
  await page.getByRole('button', { name: 'Slope' }).click()
  await click(0.2, 0.8); await click(0.4, 0.8)
  await page.getByLabel('Slope start height').fill('12')
  await page.getByLabel('Slope end height').fill('16')
  const before = await doc<string>('JSON.stringify(doc.terrainTiles)')
  await page.getByRole('button', { name: 'Apply' }).click()
  expect(await doc<string>('JSON.stringify(doc.terrainTiles)')).not.toBe(before)

  // Edit boundary: drag the first corner.
  await page.getByRole('button', { name: 'Edit boundary' }).click()
  const firstBefore = await doc<{ lat: number; lng: number }>('doc.boundary.points[0]')
  const corner = (await page.getByLabel('Boundary corner 1').boundingBox())!
  await page.mouse.move(corner.x + 6, corner.y + 6)
  await page.mouse.down()
  await page.mouse.move(corner.x - 40, corner.y + 40, { steps: 5 })
  await page.mouse.up()
  const firstAfter = await doc<{ lat: number; lng: number }>('doc.boundary.points[0]')
  expect(firstAfter.lng).toBeLessThan(firstBefore.lng)

  // Tracing image: shown, stored on this computer only.
  await page.getByLabel('Tracing image file').setInputFiles(path.join(__dirname, '..', 'test-floor-plan.png'))
  await expect(page.getByLabel('Tracing image north-west corner')).toBeVisible()
  expect(await doc<string>('JSON.stringify(doc)')).not.toMatch(/tracing/i)
  await page.getByRole('button', { name: 'Heights' }).click()
  await page.waitForTimeout(2500)
  const order = await page.evaluate(() => {
    const top = (window as unknown as { __naviTerrainMaps: Record<string, { getStyle(): { layers: Array<{ id: string }> }; isSourceLoaded(id: string): boolean }> }).__naviTerrainMaps.top
    return { layers: top.getStyle().layers.map((l) => l.id), loaded: top.isSourceLoaded('terrain-tracing') }
  })
  expect(order.loaded).toBe(true)
  expect(order.layers.indexOf('terrain-tracing')).toBeGreaterThan(order.layers.indexOf('terrain-relief'))
  await page.screenshot({ path: path.join(SHOTS, 't3-tools.png') })
  expect(ana.blocked).toEqual([])
  await ana.context.close()
})

function ibajayThreeFloors(campusId: string) {
  const doc = ibajayDocument(campusId)
  const hall = doc.buildings[0] as { floors: Array<Record<string, unknown>> }
  hall.floors = [0, 1, 2].map((level) => ({ ...floor(`bld-hall-floor-${level + 1}`, `Floor ${level + 1}`), level, elevation: level * 3.5 }))
  return doc
}

type MapProbe = {
  getTerrain(): unknown
  setPitch(p: number): void
  project(p: [number, number]): { x: number; y: number }
  getLayoutProperty(layer: string, prop: string): unknown
  getSource(id: string): { serialize(): { data: { features: unknown[] } } } | undefined
}
const terrainMap = (page: import('@playwright/test').Page, role: 'top' | '3d') => ({
  run: <T,>(fn: string) => page.evaluate(([r, f]) => new Function('map', `return ${f}`)((window as unknown as { __naviTerrainMaps: Record<string, MapProbe> }).__naviTerrainMaps[r]), [role, fn]) as Promise<T>,
})

test('T4 — buildings follow the ground, Fixed/Snap/pad, solid floor slabs and cut away; tilting the top view shows the hill', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana, ibajayThreeFloors)
  const page = ana.page
  await page.goto(`/studio/${campusId}/edit/terrain`)
  await waitForEditor(page)
  await page.waitForTimeout(1000)
  ana.blocked.length = 0 // late tile requests of the seeding page (map editor, OSM) are not the terrain page's
  const doc = <T,>(read: string) => page.evaluate((r) => new Function('doc', `return ${r}`)((window as ProbeWindow).__naviStudioV2!.context.document), read) as Promise<T>

  // Import with "Set all buildings to follow the ground" (ticked by default).
  await page.getByRole('button', { name: 'Import ground' }).click()
  await page.getByLabel('Terrain files').setInputFiles([path.join(FIXTURES, 'topoexport-asu-ibajay.glb'), path.join(FIXTURES, 'topoexport-frame.geojson')])
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await expect.poll(() => doc<string | undefined>('doc.buildings[0].ground?.baseMode')).toBe('follow-ground')
  await page.waitForTimeout(2500)

  // Tilting the top view turns its 3D ground on; back to flat turns it off.
  const top = terrainMap(page, 'top')
  expect(await top.run('map.getTerrain()')).toBeNull()
  await top.run('map.setPitch(55)')
  await expect.poll(() => top.run('map.getTerrain()')).not.toBeNull()
  await top.run('map.setPitch(0)')
  await expect.poll(() => top.run('map.getTerrain()')).toBeNull()

  // Buildings tool: select the hall by clicking inside it.
  await page.getByRole('button', { name: 'Buildings' }).click()
  const box = (await page.locator('[data-terrain-map="top"]').boundingBox())!
  const centre = await top.run<{ x: number; y: number }>('map.project([122.1705, 11.81735])')
  await page.mouse.click(box.x + centre.x, box.y + centre.y)
  const panel = page.getByLabel('Building settings')
  await expect(panel.getByText('Hall')).toBeVisible()

  await panel.getByLabel('Fixed height').check()
  await expect.poll(() => doc<string>('doc.buildings[0].ground.baseMode')).toBe('fixed')
  await panel.getByLabel('Fixed base height').fill('20')
  await panel.getByRole('button', { name: 'Set' }).click()
  await expect.poll(() => doc<number>('doc.buildings[0].baseElevation')).toBe(20)
  await panel.getByRole('button', { name: 'Raise 0.5 m' }).click()
  await expect.poll(() => doc<number>('doc.buildings[0].baseElevation')).toBe(20.5)
  await panel.getByRole('button', { name: 'Snap to ground' }).click()
  await expect.poll(() => doc<string>('doc.buildings[0].ground.baseMode')).toBe('follow-ground')
  await panel.getByLabel('Pad mode').selectOption('raise')
  await expect.poll(() => doc<string>('doc.buildings[0].ground.pad.mode')).toBe('raise')

  // 3D: solid slabs (3 floors + roof); Cut away above the first floor leaves one slab.
  await page.getByRole('button', { name: 'Swap' }).click()
  await page.waitForTimeout(3000)
  const big = terrainMap(page, '3d')
  expect(await big.run('map.getLayoutProperty("terrain-slabs", "visibility")')).toBe('visible')
  expect(await big.run('map.getSource("terrain-slabs").serialize().data.features.length')).toBe(4)
  await page.getByLabel('Building settings').getByLabel('Cut away above').selectOption({ label: 'Floor 1' })
  await expect.poll(() => big.run('map.getSource("terrain-slabs").serialize().data.features.length')).toBe(1)
  await page.getByLabel('Height exaggeration').fill('3')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: path.join(SHOTS, 't4-buildings-3d.png') })
  expect(ana.blocked).toEqual([])
  await ana.context.close()
})
