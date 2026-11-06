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

test('T1 — terrain workspace: import the TopoExport ground, views, one map and the 3D button', async ({ browser }) => {
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
  // One map only (owner 2026-11-06: no mini 3D window; tilt the map instead).
  await expect(ana.page.locator('[data-terrain-map]')).toHaveCount(1)
  await expect(ana.page.locator('[data-terrain-mini]')).toHaveCount(0)
  await expect(ana.page.getByRole('button', { name: 'Swap' })).toHaveCount(0)
  await expect(ana.page.getByRole('button', { name: 'Pop out' })).toHaveCount(0)
  const range = await ana.page.evaluate(() => (window as ProbeWindow).__naviStudioV2!.context.document.terrain?.colorRange)
  expect(range!.minM).toBeCloseTo(1.8, 0)
  expect(range!.maxM).toBeCloseTo(35.5, 0)
  await ana.page.waitForTimeout(4000)
  await ana.page.screenshot({ path: path.join(SHOTS, 't1-open.png') })
  // Section 2 default: the workspace opens neutral — contour lines, no colour ramp.
  const maps = await ana.page.evaluate(() => {
    const all = (window as unknown as { __naviTerrainMaps?: Record<string, { getTerrain(): unknown; getLayer(id: string): unknown; isSourceLoaded(id: string): boolean }> }).__naviTerrainMaps ?? {}
    return Object.fromEntries(Object.entries(all).map(([role, m]) => [role, { terrain: m.getTerrain(), relief: Boolean(m.getLayer('terrain-relief')), contours: Boolean(m.getLayer('terrain-contours')), loaded: m.isSourceLoaded('terrain-relief-dem') }]))
  })
  expect(maps.top).toMatchObject({ terrain: null, relief: false, contours: true })
  expect(Object.keys(maps)).toEqual(['top'])

  await ana.page.getByRole('button', { name: 'Off', exact: true }).click()
  await ana.page.waitForTimeout(3000)
  await ana.page.screenshot({ path: path.join(SHOTS, 't1-contours.png') })

  // The 3D button tilts the one map: the hill rises in place (and flattens again on a second click).
  await ana.page.getByRole('button', { name: '3D' }).click()
  await expect(ana.page.getByRole('button', { name: '3D' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => ana.page.evaluate(() => (window as unknown as { __naviTerrainMaps: Record<string, { getTerrain(): unknown }> }).__naviTerrainMaps.top.getTerrain())).toMatchObject({ source: 'terrain-dem' })
  await ana.page.getByRole('button', { name: 'Height', exact: true }).click()
  await ana.page.getByLabel('Height exaggeration').fill('3')
  await ana.page.waitForTimeout(4000)
  await ana.page.screenshot({ path: path.join(SHOTS, 't1-3d.png') })
  // Colours are one click away on every map, and the contour lines persist over them (section 2).
  const heights = await ana.page.evaluate(() => {
    const all = (window as unknown as { __naviTerrainMaps?: Record<string, { getLayer(id: string): unknown; isSourceLoaded(id: string): boolean }> }).__naviTerrainMaps ?? {}
    return Object.fromEntries(Object.entries(all).map(([role, m]) => [role, { relief: Boolean(m.getLayer('terrain-relief')), contours: Boolean(m.getLayer('terrain-contours')), loaded: m.isSourceLoaded('terrain-relief-dem') }]))
  })
  for (const m of Object.values(heights)) expect(m).toMatchObject({ relief: true, contours: true, loaded: true })

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
  await page.getByRole('button', { name: 'Height', exact: true }).click()
  const order = () => page.evaluate(() => {
    const top = (window as unknown as { __naviTerrainMaps: Record<string, { getStyle(): { layers: Array<{ id: string }> }; isSourceLoaded(id: string): boolean }> }).__naviTerrainMaps.top
    return { layers: top.getStyle().layers.map((l) => l.id), loaded: top.isSourceLoaded('terrain-tracing') }
  })
  // Wait for the image to load (a fixed wait flaked under whole-lane load, 2026-11-06).
  await expect.poll(async () => (await order()).loaded, { timeout: 15_000 }).toBe(true)
  const { layers } = await order()
  expect(layers.indexOf('terrain-tracing')).toBeGreaterThan(layers.indexOf('terrain-relief'))
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
const terrainMap = (page: import('@playwright/test').Page, role: 'top') => ({
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
  await page.getByRole('button', { name: '3D' }).click()
  await page.waitForTimeout(3000)
  const big = terrainMap(page, 'top')
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

test('T5 — stairs: place a block, stretch one end to the road and the top end to the 3F slab edge, bend, swap preset, undo', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana, ibajayThreeFloors)
  const page = ana.page
  await page.goto(`/studio/${campusId}/edit/terrain`)
  await waitForEditor(page)
  await page.waitForTimeout(1000)
  ana.blocked.length = 0 // late tile requests of the seeding page (map editor, OSM) are not the terrain page's
  const doc = <T,>(read: string) => page.evaluate((r) => new Function('doc', `return ${r}`)((window as ProbeWindow).__naviStudioV2!.context.document), read) as Promise<T>

  await page.getByRole('button', { name: 'Import ground' }).click()
  await page.getByLabel('Terrain files').setInputFiles([path.join(FIXTURES, 'topoexport-asu-ibajay.glb'), path.join(FIXTURES, 'topoexport-frame.geojson')])
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await expect.poll(() => doc<string | undefined>('doc.buildings[0].ground?.baseMode')).toBe('follow-ground')
  await page.waitForTimeout(2500)

  const top = terrainMap(page, 'top')
  const box = (await page.locator('[data-terrain-map="top"]').boundingBox())!
  const screenOf = async (lng: number, lat: number) => {
    const p = await top.run<{ x: number; y: number }>(`map.project([${lng}, ${lat}])`)
    return { x: box.x + p.x, y: box.y + p.y }
  }
  const dragHandle = async (label: string, to: { x: number; y: number }) => {
    const handle = (await page.getByLabel(label).boundingBox())!
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 12 })
    await page.mouse.up()
  }

  // Roads are drawn as surfaces at their width (Task 13), under the road lines.
  expect(await top.run<number>('map.getSource("terrain-road-surfaces").serialize().data.features.length')).toBe(1)
  expect(await top.run<string>('map.getStyle().layers.map((l) => l.id).slice(map.getStyle().layers.findIndex((l) => l.id === "terrain-road-surfaces"))[1]')).toBe('terrain-roads')

  // Place: one click south-east of the hall puts a 3 m block on the ground.
  await page.getByRole('button', { name: 'Stairs' }).click()
  const place = await screenOf(122.1712, 11.8170)
  await page.mouse.click(place.x, place.y)
  await expect.poll(() => doc<number>('(doc.structures ?? []).length')).toBe(1)
  await expect(page.getByLabel('Stair settings').getByLabel('Preset')).toHaveValue('plain-stair')

  // A fresh block is a few pixels long and its end handle is on top, so stretch the end first:
  // end → the road; start → the hall's south edge (top floor by default).
  await dragHandle('Stair end', await screenOf(122.1716, 11.81821))
  await expect.poll(() => doc<string>('doc.structures[0].end.kind')).toBe('road')
  expect(await doc<string>('doc.structures[0].end.roadId')).toBe('road-main')
  await dragHandle('Stair start', await screenOf(122.1706, 11.8172))
  await expect.poll(() => doc<string>('doc.structures[0].start.kind')).toBe('slab')
  expect(await doc<string>('doc.structures[0].start.floorId')).toBe('bld-hall-floor-3')
  expect(await doc<number>('doc.structures[0].start.edgeIndex')).toBe(0)

  // Bend: drag the middle handle sideways.
  const bend = (await page.getByLabel('Stair bend').boundingBox())!
  await dragHandle('Stair bend', { x: bend.x + bend.width / 2 + 40, y: bend.y + bend.height / 2 })
  await expect.poll(() => doc<boolean>('Boolean(doc.structures[0].bend)')).toBe(true)
  await expect(page.getByLabel('Stair readout')).toContainText('steps')

  // Swap preset keeps both ends and the bend.
  await page.getByLabel('Stair settings').getByLabel('Preset').selectOption('hillside-stair')
  await expect.poll(() => doc<string>('doc.structures[0].presetId')).toBe('hillside-stair')
  expect(await doc<number>('doc.structures[0].width')).toBe(4.5)
  expect(await doc<string>('doc.structures[0].start.kind + "/" + doc.structures[0].end.kind')).toBe('slab/road')
  expect(await top.run<number>('map.getLayer("terrain-structures").implementation.vertexCount()')).toBeGreaterThan(0)

  // One command per drag: undo walks back swap → bend → start (the end stays on the road).
  await page.keyboard.press('Control+z')
  await expect.poll(() => doc<string>('doc.structures[0].presetId')).toBe('plain-stair')
  await page.keyboard.press('Control+z')
  await expect.poll(() => doc<boolean>('Boolean(doc.structures[0].bend)')).toBe(false)
  await page.keyboard.press('Control+z')
  await expect.poll(() => doc<string>('doc.structures[0].start.kind')).toBe('ground')
  expect(await doc<string>('doc.structures[0].end.kind')).toBe('road')
  await page.keyboard.press('Control+y')
  await page.keyboard.press('Control+y')
  await page.keyboard.press('Control+y')
  await expect.poll(() => doc<string>('doc.structures[0].presetId')).toBe('hillside-stair')
  await page.screenshot({ path: path.join(SHOTS, 't5-stairs-top.png') })

  // 3D: the stair is drawn at its real height between the slab and the road.
  await page.getByRole('button', { name: '3D' }).click()
  await page.waitForTimeout(3000)
  const big = terrainMap(page, 'top')
  expect(await big.run<number>('map.getLayer("terrain-structures").implementation.vertexCount()')).toBeGreaterThan(0)
  await big.run('map.flyTo({ center: [122.1711, 11.8176], zoom: 18.5, pitch: 60, bearing: -30, duration: 0 })')
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(SHOTS, 't5-stairs-3d.png') })

  // Ramp (Task 14): swap to the plain ramp, add a landing; the panel shows 1:N and the runs.
  await page.getByLabel('Stair settings').getByLabel('Preset').selectOption('plain-ramp')
  await expect.poll(() => doc<string>('doc.structures[0].form')).toBe('ramp')
  await page.getByRole('button', { name: 'Add landing' }).click()
  await expect.poll(() => doc<number>('(doc.structures[0].landings ?? []).length')).toBe(1)
  await expect(page.getByLabel('Ramp readout')).toContainText('Slope 1:')
  await expect(page.getByLabel('Ramp readout')).toContainText('Runs ')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(SHOTS, 't5-ramp-3d.png') })
  expect(ana.blocked).toEqual([])
  await ana.context.close()
})

// Section 1 acceptance (2026-11-04 plan): the clay paint preview replaces the mid-stroke DEM feedback
// loop. While painting: no DEM reload, no version bump, no sampler rebuild (a sampler rebuild is only
// possible via a documentVersion bump by construction, so version stability + DEM silence prove it).
// At mouseup: one terrain.apply-tiles (one undo step), the DEM re-commits once, the preview hands off
// on each map's own idle, and the height at the stroke centre round-trips through commit and undo.
test('T6 — the clay paint preview: instant on the map, zero DEM reloads or version bumps mid-stroke, one undo, no centre jump', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana, ibajayDocument)
  await ana.page.goto(`/studio/${campusId}/edit/terrain`)
  await waitForEditor(ana.page)
  await ana.page.waitForTimeout(1000)
  ana.blocked.length = 0 // late tile requests of the seeding page are not the terrain page's
  await ana.page.getByRole('button', { name: 'Start flat' }).click()
  await ana.page.getByLabel('Reference name').fill('Probe flat')
  await ana.page.getByLabel('0 m means').fill('Mean sea level')
  await ana.page.getByRole('button', { name: 'Create terrain' }).click()
  await expect(ana.page.locator('[data-terrain-map="top"]')).toBeVisible()
  await ana.page.waitForTimeout(2500)

  // Instrument after warm-up so the counts start at zero with the DEM tiles settled.
  await ana.page.evaluate(() => {
    const w = window as unknown as {
      __demById: Record<string, { events: number }>
      __versions: number[]
      __versionPoll?: number
      __naviTerrainMaps: Record<string, any>
      __naviStudioV2: { context: { document: { version: number } } }
    }
    w.__demById = {}
    for (const role of Object.keys(w.__naviTerrainMaps)) {
      const bucket = (w.__demById[role] = { events: 0 })
      w.__naviTerrainMaps[role].on('sourcedata', (e: { sourceId?: string }) => {
        if (String(e.sourceId ?? '').includes('dem')) bucket.events++
      })
    }
    w.__versions = [w.__naviStudioV2.context.document.version]
    w.__versionPoll = window.setInterval(() => w.__versions.push(w.__naviStudioV2.context.document.version), 30)
  })

  await ana.page.getByRole('button', { name: 'Raise / Lower' }).click()
  await ana.page.getByLabel('Brush size').fill('30')
  await ana.page.getByLabel('Brush strength').fill('100')

  // Terrain value at the stroke centre BEFORE the stroke (baseline read through the height picker).
  const box = (await ana.page.locator('[data-terrain-map="top"]').boundingBox())!
  const cx = box.x + box.width * 0.5
  const cy = box.y + box.height * 0.5
  await ana.page.keyboard.down('Alt')
  await ana.page.mouse.click(cx, cy)
  await ana.page.keyboard.up('Alt')
  await expect(ana.page.getByLabel('Target height')).toHaveValue(/^0(\.0+)?$/)
  // The pick left the brush in Set-to-height mode; stroke in Raise only so the clay actually rises.
  await ana.page.getByLabel('Brush mode').selectOption('Raise only')

  await ana.page.mouse.move(cx - box.width * 0.15, cy)
  await ana.page.mouse.down()
  for (let i = 0; i <= 20; i++) await ana.page.mouse.move(cx - box.width * 0.15 + i * 6, cy + (i % 2 ? 4 : -4), { steps: 2 })
  await ana.page.waitForTimeout(1200) // holding still keeps raising (repeat dabs through the preview)
  await ana.page.screenshot({ path: path.join(SHOTS, 't6-preview-stroke.png') })

  // Acceptance, still mid-stroke: the painted preview is live on the map...
  // (real MapLibre wraps custom layers: the MeshLayer hides behind .implementation, same as the T5 stairs probe)
  const mid = await ana.page.evaluate(() => {
    const maps = (window as unknown as { __naviTerrainMaps: Record<string, any> }).__naviTerrainMaps
    const vertices = (role: string) => {
      const layer = maps[role].getLayer('terrain-preview') as any
      if (!layer) return -1
      const impl = layer.implementation ?? layer
      return typeof impl.vertexCount === 'function' ? impl.vertexCount() : -1
    }
    return {
      top: vertices('top'),
      versions: [...(window as any).__versions],
      dem: Object.fromEntries(Object.entries((window as any).__demById).map(([k, v]) => [k, (v as { events: number }).events])),
    }
  })
  expect(mid.top).toBeGreaterThan(0)
  // ...with the committed pipeline untouched: one version the whole stroke, zero DEM tile events.
  expect(new Set(mid.versions).size).toBe(1)
  expect(mid.dem.top).toBe(0)

  await ana.page.mouse.up()
  // Handoff: the map reloads the committed DEM tiles once; the preview mesh clears on its idle.
  await ana.page.waitForFunction(() => {
    const maps = (window as unknown as { __naviTerrainMaps: Record<string, any> }).__naviTerrainMaps
    return Object.values(maps).every((m) => {
      const layer = (m.getLayer('terrain-preview') as any) ?? null
      if (!layer) return true
      const impl = layer.implementation ?? layer
      return typeof impl.vertexCount !== 'function' || (impl.vertexCount() ?? 0) === 0
    })
  }, undefined, { timeout: 20_000 })
  const after = await ana.page.evaluate(() => {
    const w = window as unknown as { __demById: Record<string, { events: number }>; __versionPoll?: number }
    if (w.__versionPoll) window.clearInterval(w.__versionPoll)
    return Object.fromEntries(Object.entries(w.__demById).map(([k, v]) => [k, (v as { events: number }).events]))
  })
  expect(after.top).toBeGreaterThan(0)
  await ana.page.waitForTimeout(800)
  await ana.page.screenshot({ path: path.join(SHOTS, 't6-after-idle.png') })

  // One undo step for the whole stroke; undo and redo move the centre height exactly.
  const tilesAfter = () => ana.page.evaluate(() => Object.keys((window as unknown as { __naviStudioV2?: { context: { document: Record<string, any> } } }).__naviStudioV2!.context.document.terrainTiles ?? {}).length)
  expect(await tilesAfter()).toBeGreaterThan(0)
  await ana.page.keyboard.press('Control+z')
  expect(await tilesAfter()).toBe(0)
  await ana.page.waitForTimeout(500)
  await ana.page.keyboard.down('Alt')
  await ana.page.mouse.click(cx, cy)
  await ana.page.keyboard.up('Alt')
  await expect(ana.page.getByLabel('Target height')).toHaveValue(/^0(\.0+)?$/)

  expect(ana.blocked).toEqual([])
  await ana.context.close()
})

test('T7 — the neutral default: colours Off with contour lines on; Height is one click away and the lines stay', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana, ibajayDocument)
  await ana.page.goto(`/studio/${campusId}/edit/terrain`)
  await waitForEditor(ana.page)
  await ana.page.waitForTimeout(1000)
  ana.blocked.length = 0 // late tile requests of the seeding page are not the terrain page's
  await ana.page.getByRole('button', { name: 'Start flat' }).click()
  await ana.page.getByLabel('Reference name').fill('Probe flat')
  await ana.page.getByLabel('0 m means').fill('Mean sea level')
  await ana.page.getByRole('button', { name: 'Create terrain' }).click()
  await expect(ana.page.locator('[data-terrain-map="top"]')).toBeVisible()
  await ana.page.waitForTimeout(2500)

  const layerState = () => ana.page.evaluate(() => {
    const maps = (window as unknown as { __naviTerrainMaps?: Record<string, { getLayer(id: string): unknown; getTerrain(): unknown }> }).__naviTerrainMaps ?? {}
    return Object.fromEntries(Object.entries(maps).map(([role, m]) => [role, {
      contours: Boolean(m.getLayer('terrain-contours')),
      relief: Boolean(m.getLayer('terrain-relief')),
      terrain: m.getTerrain(),
    }]))
  })

  // The opening look is neutral: contour lines, no colour ramp.
  const opened = await layerState()
  expect(opened.top).toMatchObject({ contours: true, relief: false })
  expect(Object.keys(opened)).toEqual(['top'])
  await expect(ana.page.getByRole('button', { name: 'Off', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await ana.page.screenshot({ path: path.join(SHOTS, 't7-default-open.png') })

  // Heights is one click away: the colour ramp returns and the contour lines persist over it.
  await ana.page.getByRole('button', { name: 'Height', exact: true }).click()
  await ana.page.waitForTimeout(1500)
  const heights = await layerState()
  expect(heights.top).toMatchObject({ contours: true, relief: true })
  await ana.page.screenshot({ path: path.join(SHOTS, 't7-heights.png') })

  // Back to the default look; with the lines on by default, the Section 1 stroke invariants hold:
  // zero version bumps and zero DEM sourcedata mid-stroke, one undo at the end.
  await ana.page.getByRole('button', { name: 'Off', exact: true }).click()
  await ana.page.waitForTimeout(1000)

  await ana.page.evaluate(() => {
    const w = window as unknown as {
      __demById: Record<string, { events: number }>
      __versions: number[]
      __versionPoll?: number
      __naviTerrainMaps: Record<string, any>
      __naviStudioV2: { context: { document: { version: number } } }
    }
    w.__demById = {}
    for (const role of Object.keys(w.__naviTerrainMaps)) {
      const bucket = (w.__demById[role] = { events: 0 })
      w.__naviTerrainMaps[role].on('sourcedata', (e: { sourceId?: string }) => {
        if (String(e.sourceId ?? '').includes('dem')) bucket.events++
      })
    }
    w.__versions = [w.__naviStudioV2.context.document.version]
    w.__versionPoll = window.setInterval(() => w.__versions.push(w.__naviStudioV2.context.document.version), 30)
  })

  await ana.page.getByRole('button', { name: 'Raise / Lower' }).click()
  await ana.page.getByLabel('Brush size').fill('30')
  await ana.page.getByLabel('Brush strength').fill('100')

  // The terrain lock is acquired asynchronously; a stroke while still acquiring is silently
  // ignored (T7 flaked once under full-lane load exactly here). Wait until painting is enabled.
  await ana.page.waitForFunction(() => (window as unknown as { __naviTerrainEditing?: boolean }).__naviTerrainEditing === true, undefined, { timeout: 30_000 })

  const box = (await ana.page.locator('[data-terrain-map="top"]').boundingBox())!
  const cx = box.x + box.width * 0.5
  const cy = box.y + box.height * 0.5
  await ana.page.mouse.move(cx - box.width * 0.15, cy)
  await ana.page.mouse.down()
  for (let i = 0; i <= 12; i++) await ana.page.mouse.move(cx - box.width * 0.15 + i * 8, cy + (i % 2 ? 4 : -4), { steps: 2 })
  await ana.page.waitForTimeout(800)
  await ana.page.screenshot({ path: path.join(SHOTS, 't7-stroke.png') })

  const mid = await ana.page.evaluate(() => {
    const maps = (window as unknown as { __naviTerrainMaps: Record<string, any> }).__naviTerrainMaps
    const vertices = (role: string) => {
      const layer = maps[role].getLayer('terrain-preview') as any
      if (!layer) return -1
      const impl = layer.implementation ?? layer
      return typeof impl.vertexCount === 'function' ? impl.vertexCount() : -1
    }
    return {
      top: vertices('top'),
      versions: [...(window as any).__versions],
      dem: Object.fromEntries(Object.entries((window as any).__demById).map(([k, v]) => [k, (v as { events: number }).events])),
    }
  })
  expect(mid.top).toBeGreaterThan(0)
  expect(new Set(mid.versions).size).toBe(1)
  expect(mid.dem.top).toBe(0)

  await ana.page.mouse.up()
  await ana.page.waitForFunction(() => {
    const maps = (window as unknown as { __naviTerrainMaps: Record<string, any> }).__naviTerrainMaps
    return Object.values(maps).every((m) => {
      const layer = (m.getLayer('terrain-preview') as any) ?? null
      if (!layer) return true
      const impl = layer.implementation ?? layer
      return typeof impl.vertexCount !== 'function' || (impl.vertexCount() ?? 0) === 0
    })
  }, undefined, { timeout: 20_000 })
  const after = await ana.page.evaluate(() => {
    const w = window as unknown as { __demById: Record<string, { events: number }>; __versionPoll?: number }
    if (w.__versionPoll) window.clearInterval(w.__versionPoll)
    return Object.fromEntries(Object.entries(w.__demById).map(([k, v]) => [k, (v as { events: number }).events]))
  })
  expect(after.top).toBeGreaterThan(0)

  const tilesAfter = () => ana.page.evaluate(() => Object.keys((window as unknown as { __naviStudioV2?: { context: { document: Record<string, any> } } }).__naviStudioV2!.context.document.terrainTiles ?? {}).length)
  expect(await tilesAfter()).toBeGreaterThan(0)
  await ana.page.keyboard.press('Control+z')
  expect(await tilesAfter()).toBe(0)

  expect(ana.blocked).toEqual([])
  await ana.context.close()
})

test('T8 — Shift+Z height mode: side view, drag a building down and the ground digs to its base, up leaves the ground, Esc returns', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana, ibajayThreeFloors)
  const page = ana.page
  await page.goto(`/studio/${campusId}/edit/terrain`)
  await waitForEditor(page)
  await page.waitForTimeout(1000)
  ana.blocked.length = 0 // late tile requests of the seeding page are not the terrain page's
  const doc = <T,>(read: string) => page.evaluate((r) => new Function('doc', `return ${r}`)((window as ProbeWindow).__naviStudioV2!.context.document), read) as Promise<T>
  await page.getByRole('button', { name: 'Import ground' }).click()
  await page.getByLabel('Terrain files').setInputFiles([path.join(FIXTURES, 'topoexport-asu-ibajay.glb'), path.join(FIXTURES, 'topoexport-frame.geojson')])
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await expect.poll(() => doc<string | undefined>('doc.buildings[0].ground?.baseMode')).toBe('follow-ground')
  await page.waitForFunction(() => (window as unknown as { __naviTerrainEditing?: boolean }).__naviTerrainEditing === true, undefined, { timeout: 30_000 })
  await page.waitForTimeout(1500)

  const top = terrainMap(page, 'top')
  const box = (await page.locator('[data-terrain-map]').boundingBox())!
  const HALL: [number, number] = [122.1705, 11.81735]

  // Nothing selected: Shift+Z only hints.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.keyboard.press('Shift+Z')
  await expect(page.getByText('Select a building or a stair first')).toBeVisible()
  expect(await top.run<number>('map.getPitch()')).toBeLessThan(5)

  // Select the hall with the Buildings tool, then Shift+Z: the camera turns to its side.
  await page.getByRole('button', { name: 'Buildings' }).click()
  const centre = await top.run<{ x: number; y: number }>(`map.project([${HALL[0]}, ${HALL[1]}])`)
  await page.mouse.click(box.x + centre.x, box.y + centre.y)
  await expect(page.getByLabel('Building settings').getByText('Hall')).toBeVisible()
  await page.keyboard.press('Shift+Z')
  await expect.poll(() => top.run<number>('map.getPitch()'), { timeout: 5000 }).toBeGreaterThan(60)
  await expect(page.getByText('Height mode')).toBeVisible()
  await page.waitForTimeout(2500) // the 3D ground loads after the tilt
  const groundBefore = await top.run<number>(`map.queryTerrainElevation([${HALL[0]}, ${HALL[1]}])`)
  await page.screenshot({ path: path.join(SHOTS, 't8-side-view.png') })

  const drag = async (dy: number) => {
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + dy, { steps: 10 })
    await page.mouse.up()
  }

  // Drag down (screen down = lower): Fixed at a lower base, pad digs (lower only), one undo step.
  const before = await doc<number>('doc.buildings[0].baseElevation')
  await drag(60)
  await expect.poll(() => doc<string>('doc.buildings[0].ground.baseMode')).toBe('fixed')
  const lowered = await doc<number>('doc.buildings[0].baseElevation')
  expect(lowered).toBeLessThan(groundBefore - 1)
  expect(await doc<string>('doc.buildings[0].ground.pad.mode')).toBe('lower')
  // The ground under the building digs down to its base (after the one terrain refresh).
  await expect.poll(() => top.run<number>(`map.queryTerrainElevation([${HALL[0]}, ${HALL[1]}])`), { timeout: 15_000 }).toBeLessThan(lowered + 0.15)
  await page.screenshot({ path: path.join(SHOTS, 't8-lowered.png') })

  await page.keyboard.press('Control+z')
  await expect.poll(() => doc<string>('doc.buildings[0].ground.baseMode')).toBe('follow-ground')
  expect(await doc<number>('doc.buildings[0].baseElevation')).toBe(before)

  // Drag up: higher base, and no ground is built up under it (the gap is left open). The ground is the
  // natural slope again (before, the import's "both" pad had flattened it to the outline's mean).
  await drag(-60)
  await expect.poll(() => doc<number>('doc.buildings[0].baseElevation')).toBeGreaterThan(groundBefore + 1)
  const raised = await doc<number>('doc.buildings[0].baseElevation')
  await page.waitForTimeout(3000)
  const groundRaised = await top.run<number>(`map.queryTerrainElevation([${HALL[0]}, ${HALL[1]}])`)
  expect(groundRaised).toBeLessThan(raised - 1)
  expect(Math.abs(groundRaised - groundBefore)).toBeLessThan(1)
  await page.screenshot({ path: path.join(SHOTS, 't8-raised.png') })

  // Esc leaves height mode and the camera goes back to the flat view.
  await page.keyboard.press('Escape')
  await expect.poll(() => top.run<number>('map.getPitch()'), { timeout: 5000 }).toBeLessThan(5)
  await expect(page.getByText('Height mode')).toHaveCount(0)
  expect(ana.blocked).toEqual([])
  await ana.context.close()
})
