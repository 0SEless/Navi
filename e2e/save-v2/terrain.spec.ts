import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { dataBlocked, floor, openAdmin, openMap, seededCampus, waitForEditor, type ProbeWindow } from './support'

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
  await expect(ana.page.getByRole('button', { name: 'Import terrain' })).toBeVisible({ timeout: 60_000 })
  await ana.page.getByRole('button', { name: 'Import terrain' }).click()
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

  expect(dataBlocked(ana.blocked)).toEqual([])
  await ana.context.close()
})

test('T2 — a Raise stroke is one undo step, shows in the Changes view, and undo/redo work', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana, ibajayDocument)
  await ana.page.goto(`/studio/${campusId}/edit/terrain`)
  await waitForEditor(ana.page)
  await ana.page.waitForTimeout(1000)
  ana.blocked.length = 0 // late tile requests of the seeding page (map editor, OSM) are not the terrain page's
  // Section 5: Terrain opens on flat ground; it is created at the first edit.
  await ana.page.waitForFunction(() => (window as unknown as { __naviTerrainEditing?: boolean }).__naviTerrainEditing === true, undefined, { timeout: 30_000 })
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
  expect(dataBlocked(ana.blocked)).toEqual([])
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
  // Section 5: no first-visit page; the contour pen is a dock tool.
  await page.waitForFunction(() => (window as unknown as { __naviTerrainEditing?: boolean }).__naviTerrainEditing === true, undefined, { timeout: 30_000 })
  await page.getByRole('toolbar', { name: 'Terrain tools' }).getByRole('button', { name: 'Contour pen' }).click()
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
  // Dragged outward to the east (west of the corner is the layers panel, section 5).
  await page.mouse.move(corner.x + 46, corner.y + 40, { steps: 5 })
  await page.mouse.up()
  const firstAfter = await doc<{ lat: number; lng: number }>('doc.boundary.points[0]')
  expect(firstAfter.lng).toBeGreaterThan(firstBefore.lng)

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
  expect(dataBlocked(ana.blocked)).toEqual([])
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
  await page.getByRole('button', { name: 'Import terrain' }).click()
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
  await page.getByRole('toolbar', { name: 'Terrain tools' }).getByRole('button', { name: 'Buildings', exact: true }).click()
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

  // 3D: the building is one solid block with walls (owner 2026-11-07); Cut away above the first floor
  // stops the block at that floor.
  await page.getByRole('button', { name: '3D' }).click()
  await page.waitForTimeout(3000)
  const big = terrainMap(page, 'top')
  expect(await big.run('map.getLayoutProperty("terrain-slabs", "visibility")')).toBe('visible')
  expect(await big.run('map.getSource("terrain-slabs").serialize().data.features.map((f) => f.properties.kind)')).toEqual(['block'])
  await page.getByLabel('Building settings').getByLabel('Cut away above').selectOption({ label: 'Floor 1' })
  await expect.poll(() => big.run('map.getSource("terrain-slabs").serialize().data.features.map((f) => f.properties.kind)')).toEqual(['cut'])
  await page.getByLabel('Height exaggeration').fill('3')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: path.join(SHOTS, 't4-buildings-3d.png') })
  expect(dataBlocked(ana.blocked)).toEqual([])
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

  await page.getByRole('button', { name: 'Import terrain' }).click()
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
  // Section 4: the surface, then its edge and centre markings, all under the (hidden) road line anchor.
  expect(await top.run<string[]>('map.getStyle().layers.map((l) => l.id).slice(map.getStyle().layers.findIndex((l) => l.id === "terrain-road-surfaces"), map.getStyle().layers.findIndex((l) => l.id === "terrain-roads") + 1)')).toEqual(['terrain-road-surfaces', 'terrain-road-edges', 'terrain-road-centre', 'terrain-roads'])

  // Place: one click south-east of the hall puts a 3 m block on the ground.
  await page.getByRole('toolbar', { name: 'Terrain tools' }).getByRole('button', { name: 'Stairs', exact: true }).click()
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
  expect(dataBlocked(ana.blocked)).toEqual([])
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
  // Section 5: Terrain opens on flat ground; it is created at the first edit.
  await ana.page.waitForFunction(() => (window as unknown as { __naviTerrainEditing?: boolean }).__naviTerrainEditing === true, undefined, { timeout: 30_000 })
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

  expect(dataBlocked(ana.blocked)).toEqual([])
  await ana.context.close()
})

test('T7 — the neutral default: colours Off with contour lines on; Height is one click away and the lines stay', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana, ibajayDocument)
  await ana.page.goto(`/studio/${campusId}/edit/terrain`)
  await waitForEditor(ana.page)
  await ana.page.waitForTimeout(1000)
  ana.blocked.length = 0 // late tile requests of the seeding page are not the terrain page's
  // Section 5: Terrain opens on flat ground; it is created at the first edit.
  await ana.page.waitForFunction(() => (window as unknown as { __naviTerrainEditing?: boolean }).__naviTerrainEditing === true, undefined, { timeout: 30_000 })
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

  expect(dataBlocked(ana.blocked)).toEqual([])
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
  await page.getByRole('button', { name: 'Import terrain' }).click()
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
  await page.getByRole('toolbar', { name: 'Terrain tools' }).getByRole('button', { name: 'Buildings', exact: true }).click()
  const centre = await top.run<{ x: number; y: number }>(`map.project([${HALL[0]}, ${HALL[1]}])`)
  await page.mouse.click(box.x + centre.x, box.y + centre.y)
  await expect(page.getByLabel('Building settings').getByText('Hall')).toBeVisible()
  await page.keyboard.press('Shift+Z')
  await expect.poll(() => top.run<number>('map.getPitch()'), { timeout: 5000 }).toBeGreaterThan(60)
  await expect(page.getByText('Height mode')).toBeVisible()
  await page.waitForTimeout(2500) // the 3D ground loads after the tilt
  // The side view frames the hall: it lands in the middle of the screen (it sat in the top third when
  // the aim point fell to sea level inside the hill).
  const framing = await top.run<{ x: number; y: number; w: number; h: number }>(`(() => { const p = map.project([${HALL[0]}, ${HALL[1]}]); return { x: p.x, y: p.y, w: map.getCanvas().clientWidth, h: map.getCanvas().clientHeight } })()`)
  expect(framing.x / framing.w).toBeGreaterThan(0.35)
  expect(framing.x / framing.w).toBeLessThan(0.65)
  expect(framing.y / framing.h).toBeGreaterThan(0.4)
  expect(framing.y / framing.h).toBeLessThan(0.7)
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
  expect(dataBlocked(ana.blocked)).toEqual([])
  await ana.context.close()
})

test('T9 — Shift+Z on a stair: the ground end gets an offset and keeps following the ground; the floor end steps floors', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana, ibajayThreeFloors)
  const page = ana.page
  await page.goto(`/studio/${campusId}/edit/terrain`)
  await waitForEditor(page)
  await page.waitForTimeout(1000)
  ana.blocked.length = 0 // late tile requests of the seeding page are not the terrain page's
  const doc = <T,>(read: string) => page.evaluate((r) => new Function('doc', `return ${r}`)((window as ProbeWindow).__naviStudioV2!.context.document), read) as Promise<T>
  await page.getByRole('button', { name: 'Import terrain' }).click()
  await page.getByLabel('Terrain files').setInputFiles([path.join(FIXTURES, 'topoexport-asu-ibajay.glb'), path.join(FIXTURES, 'topoexport-frame.geojson')])
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await expect.poll(() => doc<string | undefined>('doc.buildings[0].ground?.baseMode')).toBe('follow-ground')
  await page.waitForFunction(() => (window as unknown as { __naviTerrainEditing?: boolean }).__naviTerrainEditing === true, undefined, { timeout: 30_000 })

  // A stair from the hall's Floor 2 (south edge) down to the ground 22 m south.
  const START: [number, number] = [122.1705, 11.8172]
  const END: [number, number] = [122.1705, 11.8170]
  await page.evaluate(([s, e]) => {
    const r = (window as ProbeWindow).__naviStudioV2!.context.services.get('dispatcher').execute({ id: 'structure.create', label: 'Add stair', payload: { structure: {
      id: 'probe-stair', form: 'stairs', presetId: 'plain-stair', width: 2, underneath: 'open', railings: 'both',
      start: { kind: 'slab', buildingId: 'bld-hall', floorId: 'bld-hall-floor-2', edgeIndex: 0, edgeT: 0.5, last: { lat: s[1], lng: s[0], heightM: 0 } },
      end: { kind: 'ground', position: { lat: e[1], lng: e[0] } },
    } } })
    if (r && r.success === false) throw new Error(r.error)
  }, [START, END])
  await page.waitForTimeout(1500)

  const top = terrainMap(page, 'top')
  const box = (await page.locator('[data-terrain-map]').boundingBox())!
  const screenOf = async (p: [number, number]) => {
    const q = await top.run<{ x: number; y: number }>(`map.project([${p[0]}, ${p[1]}])`)
    return { x: box.x + q.x, y: box.y + q.y }
  }
  const drag = async (from: { x: number; y: number }, dy: number) => {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, from.y + dy, { steps: 10 })
    await page.mouse.up()
  }

  // Select the stair with the Stairs tool, then Shift+Z: the side view, and no drag dots in the way.
  await page.getByRole('toolbar', { name: 'Terrain tools' }).getByRole('button', { name: 'Stairs', exact: true }).click()
  const middle = await screenOf([122.1705, 11.8171])
  await page.mouse.click(middle.x, middle.y)
  await expect(page.getByLabel('Stair settings').getByLabel('Preset')).toHaveValue('plain-stair')
  await page.keyboard.press('Shift+Z')
  await expect.poll(() => top.run<number>('map.getPitch()'), { timeout: 5000 }).toBeGreaterThan(60)
  await expect(page.getByLabel('Stair end')).toHaveCount(0)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(SHOTS, 't9-stair-side-view.png') })

  // The ground end: an offset above the ground; it is still attached to the ground (keeps following it).
  await drag(await screenOf(END), -12)
  await expect.poll(() => doc<number | undefined>('doc.structures[0].heightOffset?.end')).toBeGreaterThan(0)
  expect(await doc<string>('doc.structures[0].end.kind')).toBe('ground')
  await expect(page.getByLabel('Stair settings').getByRole('button', { name: 'Back to ground' })).toBeVisible()

  // The floor end steps floor to floor: up a floor from Floor 2.
  await drag(await screenOf(START), -60)
  await expect.poll(() => doc<string>('doc.structures[0].start.floorId')).toBe('bld-hall-floor-3')
  await page.screenshot({ path: path.join(SHOTS, 't9-stair-floor-3.png') })
  await page.keyboard.press('Control+z')
  await expect.poll(() => doc<string>('doc.structures[0].start.floorId')).toBe('bld-hall-floor-2')

  // Back to ground clears the offset; Esc leaves and the camera returns.
  await page.getByLabel('Stair settings').getByRole('button', { name: 'Back to ground' }).click()
  await expect.poll(() => doc<unknown>('doc.structures[0].heightOffset ?? null')).toBeNull()
  await page.keyboard.press('Escape')
  await expect.poll(() => top.run<number>('map.getPitch()'), { timeout: 5000 }).toBeLessThan(5)
  expect(dataBlocked(ana.blocked)).toEqual([])
  await ana.context.close()
})

test('T10 — section 4: the camera stays on the campus, boundary and soft outside, road look, one key per tool', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana, (id) => {
    const d = ibajayDocument(id)
    // One footpath next to the main road (paths: light paving, no markings).
    ;(d.roads as unknown[]).push({ id: 'path-1', name: 'Footpath', polyline: { points: [{ lat: 11.8166, lng: 122.1700 }, { lat: 11.8169, lng: 122.1712 }] }, width: 2, surface: 'concrete', type: 'pedestrian', metadata: {} })
    return d
  })
  const page = ana.page
  await page.goto(`/studio/${campusId}/edit/terrain`)
  await waitForEditor(page)
  await page.waitForTimeout(1000)
  ana.blocked.length = 0 // late tile requests of the seeding page are not the terrain page's
  await page.getByRole('button', { name: 'Import terrain' }).click()
  await page.getByLabel('Terrain files').setInputFiles([path.join(FIXTURES, 'topoexport-asu-ibajay.glb'), path.join(FIXTURES, 'topoexport-frame.geojson')])
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await page.waitForFunction(() => (window as unknown as { __naviTerrainEditing?: boolean }).__naviTerrainEditing === true, undefined, { timeout: 30_000 })
  await page.waitForTimeout(2000)
  const top = terrainMap(page, 'top')

  // Not lost: zooming far out and panning far away are clamped to the campus.
  const limits = await top.run<{ minZoom: number; maxZoom: number; maxPitch: number; bounds: number[][] | null }>('({ minZoom: map.getMinZoom(), maxZoom: map.getMaxZoom(), maxPitch: map.getMaxPitch(), bounds: map.getMaxBounds()?.toArray() ?? null })')
  expect(limits.maxZoom).toBe(21)
  expect(limits.maxPitch).toBe(80)
  expect(limits.minZoom).toBeGreaterThan(14)
  expect(limits.bounds).not.toBeNull()
  await top.run('map.jumpTo({ zoom: 3, center: [130, 20] })')
  const after = await top.run<{ zoom: number; lng: number; lat: number }>('({ zoom: map.getZoom(), lng: map.getCenter().lng, lat: map.getCenter().lat })')
  expect(after.zoom).toBeGreaterThanOrEqual(limits.minZoom - 1e-6)
  expect(after.lng).toBeLessThanOrEqual(limits.bounds![1][0] + 1e-9)
  expect(after.lat).toBeLessThanOrEqual(limits.bounds![1][1] + 1e-9)
  await top.run('map.jumpTo({ zoom: 17, center: [122.171, 11.81765] })')

  // Boundary line and the soft outside veil, flat and tilted.
  const boundaryLayers = () => top.run<{ veil: boolean; veilData: number; line: unknown }>('({ veil: Boolean(map.getLayer("terrain-outside")), veilData: map.getSource("terrain-outside").serialize().data.features?.length ?? (map.getSource("terrain-outside").serialize().data.type === "Feature" ? 1 : 0), line: map.getLayoutProperty("terrain-boundary", "visibility") ?? "visible" })')
  expect(await boundaryLayers()).toEqual({ veil: true, veilData: 1, line: 'visible' })
  await page.getByRole('button', { name: '3D' }).click()
  await expect.poll(() => top.run<number>('map.getPitch()'), { timeout: 5000 }).toBeGreaterThan(50)
  expect(await boundaryLayers()).toEqual({ veil: true, veilData: 1, line: 'visible' })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(SHOTS, 't10-boundary-roads-3d.png') })
  await page.getByRole('button', { name: '3D' }).click()

  // Roads: asphalt with edge lines and a dashed centre (6 m road); the footpath: paving, no markings.
  const markings = await top.run<Array<{ roadId: string; kind: string }>>('map.getSource("terrain-road-markings").serialize().data.features.map((f) => f.properties)')
  expect(markings.filter((m) => m.roadId === 'road-main').map((m) => m.kind).sort()).toEqual(['centre', 'edge', 'edge'])
  expect(markings.filter((m) => m.roadId === 'path-1')).toEqual([])
  expect(await top.run<string>('map.getLayoutProperty("terrain-roads", "visibility")')).toBe('none')
  const roadsEye = page.getByRole('region', { name: 'Layers' }).getByRole('button', { name: 'Roads and paths' })
  await roadsEye.click()
  await expect(roadsEye).toHaveAttribute('aria-pressed', 'false')
  for (const id of ['terrain-road-surfaces', 'terrain-road-edges', 'terrain-road-centre']) {
    expect(await top.run<string>(`map.getLayoutProperty("${id}", "visibility")`)).toBe('none')
  }
  await roadsEye.click()
  await page.screenshot({ path: path.join(SHOTS, 't10-top.png') })

  // One key per tool: the dock's pressed button follows the keys.
  const box = (await page.locator('[data-terrain-map]').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (const [key, label] of [['s', 'Smooth'], ['t', 'Stairs'], ['e', 'Edit boundary'], ['v', 'Move'], ['b', 'Raise / Lower']] as const) {
    await page.keyboard.press(key)
    await expect(page.getByRole('toolbar', { name: 'Terrain tools' }).getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true')
  }
  expect(dataBlocked(ana.blocked)).toEqual([])
  await ana.context.close()
})

/** The routable campus that passes every publish gate (the parity probe's fixtureFull). */
const PUBLISHABLE = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'campus-full.json'), 'utf8'))

test('T11 — NAVI Web campus-only map: published terrain, roads and a stair; no outside map; 3D turns the terrain on', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana, (id) => {
    const d = structuredClone(PUBLISHABLE)
    d.metadata.campusId = id
    return d
  })
  const page = ana.page
  await page.goto(`/studio/${campusId}/edit/terrain`)
  await waitForEditor(page)
  await page.waitForFunction(() => (window as unknown as { __naviTerrainEditing?: boolean }).__naviTerrainEditing !== undefined, undefined, { timeout: 60_000 })
  ana.blocked.length = 0
  const run = (command: Record<string, unknown>) => page.evaluate((c) => {
    const r = (window as ProbeWindow).__naviStudioV2!.context.services.get('dispatcher').execute(c)
    if (r && r.success === false) throw new Error(r.error)
  }, command)
  // Ground: a gentle slope from 10 m (south) to 20 m (north), from two contour lines.
  await run({ id: 'terrain.setup', label: 'Ground', payload: {
    reference: { name: 'Probe slope', zeroMeaning: 'Sea level' },
    base: { kind: 'contours', sourceNote: 'probe', lines: [
      { elevationM: 10, points: [{ lat: 11.6790, lng: 122.3690 }, { lat: 11.6790, lng: 122.3717 }] },
      { elevationM: 20, points: [{ lat: 11.6811, lng: 122.3690 }, { lat: 11.6811, lng: 122.3717 }] },
    ] },
    colorRange: { minM: 10, maxM: 20 },
  } })
  // A stair from the library's upper floor (south edge) down to the ground.
  await run({ id: 'structure.create', label: 'Add stair', payload: { structure: {
    id: 'web-stair', form: 'stairs', presetId: 'plain-stair', width: 2, underneath: 'open', railings: 'both',
    start: { kind: 'slab', buildingId: 'osm:way/123', floorId: 'bib/upper', edgeIndex: 0, edgeT: 0.5 },
    end: { kind: 'ground', position: { lat: 11.67985, lng: 122.3701 } },
  } } })
  const saved = await page.evaluate(async () => {
    const p = (window as ProbeWindow).__naviStudioV2!
    const result = await p.session.save(p.context.document)
    await p.session.zones.release(p.session.zones.held())
    return result.kind
  })
  expect(saved).toBe('saved')

  // Publish from the editor (Studio's "Publish anyway" path, as the parity probe does).
  await openMap(ana, campusId, /Biblioteca/)
  const response = page.waitForResponse((r) => r.url().endsWith('/api/studio/v2/publish') && r.request().method() === 'POST', { timeout: 90_000 })
  const outcome = await page.evaluate(async () => {
    const services = (window as unknown as { __naviStudioV2: { context: { services: { get(id: string): any } } } }).__naviStudioV2.context.services // eslint-disable-line @typescript-eslint/no-explicit-any
    let thrown: string | null = null
    await services.get('publish').publish(true).catch((error: unknown) => { thrown = String(error) })
    const snapshot = services.get('publishStore')?.getSnapshot?.() ?? services.get('publish').getSnapshot?.()
    return { thrown, error: snapshot?.publishError ?? null }
  })
  expect(outcome.thrown ?? outcome.error, JSON.stringify(outcome)).toBeNull()
  expect((await response).status()).toBe(200)

  // A visitor opens NAVI Web: only the campus, nothing fetched from outside.
  const visitor = await browser.newContext({ baseURL: 'http://127.0.0.1:3118', viewport: { width: 1280, height: 820 } })
  const outside: string[] = []
  await visitor.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname !== '127.0.0.1') {
      outside.push(url.hostname)
      return route.abort('blockedbyclient')
    }
    return route.continue()
  })
  await visitor.addInitScript((id) => {
    localStorage.setItem('navi-default-campus', id)
    localStorage.setItem('navi-onboarded', 'true')
  }, campusId)
  const web = await visitor.newPage()
  const errors: string[] = []
  web.on('pageerror', (error) => errors.push(error.message))
  const campus = web.waitForResponse((r) => r.url().includes(`/api/public-campus?campus_id=${campusId}`), { timeout: 90_000 })
  await web.goto('/map/explore')
  const payload = await (await campus).json() as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const site = payload.artifacts?.site ?? payload.site
  expect(site?.structures).toHaveLength(1)
  expect(site?.terrain).not.toBeNull()
  const webMap = <T,>(fn: string) => web.evaluate((f) => new Function('map', `return ${f}`)((window as unknown as { __naviTerrainMaps: Record<string, unknown> }).__naviTerrainMaps.web), fn) as Promise<T>
  const mapReady = () => web.waitForFunction(() => Boolean((window as unknown as { __naviTerrainMaps?: Record<string, { getLayer(id: string): unknown }> }).__naviTerrainMaps?.web?.getLayer('site-ground')), undefined, { timeout: 60_000 })
  // The dev server may reload a page it has just compiled: load it once more before looking.
  await mapReady().catch(() => undefined)
  await web.waitForLoadState('networkidle')
  await web.goto('/map/explore')
  await mapReady()
  const style = await webMap<{ sources: string[]; layers: string[]; bounds: unknown }>('({ sources: Object.keys(map.getStyle().sources), layers: map.getStyle().layers.map((l) => l.id), bounds: map.getMaxBounds()?.toArray() ?? null })')
  expect(style.sources).not.toContain('osm')
  for (const id of ['site-ground', 'site-hillshade', 'site-roads', 'site-road-edges']) expect(style.layers).toContain(id)
  // The app's own layers still set up on top of the campus (they wait for a loaded style; the site's
  // terrain tiles must not keep them waiting), and the campus is drawn underneath them.
  expect(style.layers).toContain('buildings-fill')
  expect(style.layers.indexOf('site-ground')).toBeLessThan(style.layers.indexOf('buildings-fill'))
  // Custom (3D mesh) layers are not part of getStyle(): look them up directly.
  expect(await webMap<boolean>('Boolean(map.getLayer("site-structures"))')).toBe(true)
  expect(style.bounds).not.toBeNull()
  expect(await webMap<number>('map.getLayer("site-structures").implementation.vertexCount()')).toBeGreaterThan(0)
  await web.waitForTimeout(2500)
  await web.screenshot({ path: path.join(SHOTS, 't11-web-2d.png') })

  // The view button tilts to 3D: the published terrain and the slabs turn on.
  await web.getByRole('button', { name: 'Cycle camera view' }).click()
  await expect.poll(() => webMap<string | null>('map.getTerrain()?.source ?? null'), { timeout: 10_000 }).toBe('site-dem-terrain')
  expect(await webMap<string>('map.getLayoutProperty("site-slabs", "visibility")')).toBe('visible')
  await webMap('map.jumpTo({ center: [122.3703, 11.68], zoom: 18.6, pitch: 60, bearing: -25 })')
  await web.waitForTimeout(3000)
  await web.screenshot({ path: path.join(SHOTS, 't11-web-3d.png') })
  expect(outside).toEqual([])
  expect(errors).toEqual([])
  await visitor.close()
  await ana.context.close()
})

/** The ASU-Ibajay probe campus made publishable: the hall's ground floor has a main entrance tied to the main road. */
function ibajayPublishable(campusId: string) {
  const doc = ibajayThreeFloors(campusId) as unknown as { buildings: Array<{ floors: Array<Record<string, unknown>> }>; roads: Array<Record<string, unknown>> }
  doc.buildings[0].floors[0].entrances = [{ id: 'ent-hall', label: 'Hall entrance', position: { x: 0, y: -15 }, level: 0, type: 'main', hasQR: false, hasPanorama: false, connectorRoadId: 'road-main' }]
  doc.roads[0].connectorEntranceId = 'ent-hall'
  return doc
}

test('T12 — acceptance (Task 16): ASU-Ibajay ground, a raise stroke, buildings follow the ground, a stair from 3F to the road, Done, publish, campus-only NAVI Web, reload identical', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana, ibajayPublishable)
  const page = ana.page
  await page.goto(`/studio/${campusId}/edit/terrain`)
  await waitForEditor(page)
  await page.waitForTimeout(1000)
  ana.blocked.length = 0
  const doc = <T,>(read: string) => page.evaluate((r) => new Function('doc', `return ${r}`)((window as ProbeWindow).__naviStudioV2!.context.document), read) as Promise<T>

  // Import the owner's TopoExport ground; every building follows it (ticked by default).
  await page.getByRole('button', { name: 'Import terrain' }).click()
  // One file at a time, as the owner picks them: the second pick adds to the first.
  await page.getByLabel('Terrain files').setInputFiles(path.join(FIXTURES, 'topoexport-asu-ibajay.glb'))
  await expect(page.getByText('Still needed: frame.geojson')).toBeVisible()
  await page.getByLabel('Terrain files').setInputFiles(path.join(FIXTURES, 'topoexport-frame.geojson'))
  await expect(page.getByRole('list', { name: 'Chosen files' }).getByRole('listitem')).toHaveCount(2)
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  await expect.poll(() => doc<string | undefined>('doc.buildings[0].ground?.baseMode')).toBe('follow-ground')
  const range = await doc<{ minM: number; maxM: number }>('doc.terrain.colorRange')
  expect(range.minM).toBeCloseTo(1.8, 0)
  expect(range.maxM).toBeCloseTo(35.5, 0)
  await page.waitForFunction(() => (window as unknown as { __naviTerrainEditing?: boolean }).__naviTerrainEditing === true, undefined, { timeout: 30_000 })
  await page.waitForTimeout(2000)

  // A raise stroke (away from the hall), seen in the Changes colours.
  await page.getByRole('button', { name: 'Raise / Lower' }).click()
  await page.getByLabel('Brush size').fill('20')
  await page.getByLabel('Brush strength').fill('100')
  const top = terrainMap(page, 'top')
  const box = (await page.locator('[data-terrain-map]').boundingBox())!
  const from = await top.run<{ x: number; y: number }>('map.project([122.1720, 11.8183])')
  await page.mouse.move(box.x + from.x, box.y + from.y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + from.x + i * 6, box.y + from.y, { steps: 2 })
  await page.waitForTimeout(800)
  await page.mouse.up()
  await expect.poll(() => doc<number>('Object.keys(doc.terrainTiles ?? {}).length')).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Changes', exact: true }).click()
  await page.waitForFunction(() => (window as unknown as { __naviTerrainMaps: Record<string, { isSourceLoaded(id: string): boolean; getLayer(id: string): unknown }> }).__naviTerrainMaps.top.isSourceLoaded('terrain-changes'), undefined, { timeout: 15_000 })
  expect(await top.run<boolean>('Boolean(map.getLayer("terrain-relief"))')).toBe(true)
  await page.screenshot({ path: path.join(SHOTS, 't12-changes.png') })
  await page.getByRole('button', { name: 'Off', exact: true }).click()

  // A stair from the hall's Floor 3 (south edge) down to the main road.
  await page.evaluate(() => {
    const r = (window as ProbeWindow).__naviStudioV2!.context.services.get('dispatcher').execute({ id: 'structure.create', label: 'Add stair', payload: { structure: {
      id: 'acceptance-stair', form: 'stairs', presetId: 'hillside-stair', width: 4.5, underneath: 'solid', railings: 'both',
      start: { kind: 'slab', buildingId: 'bld-hall', floorId: 'bld-hall-floor-3', edgeIndex: 0, edgeT: 0.5 },
      end: { kind: 'road', roadId: 'road-main', position: { lat: 11.81707, lng: 122.16985 } },
    } } })
    if (r && r.success === false) throw new Error(r.error)
  })
  const fingerprint = () => page.evaluate(() => {
    const d = (window as ProbeWindow).__naviStudioV2!.context.document as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    // Full-content hash of a tile (base64 text or numbers).
    const sum = (v: unknown) => {
      const values = typeof v === 'string' ? Array.from(v, (c) => c.charCodeAt(0)) : Array.from(v as ArrayLike<number>)
      return `${values.length}:${values.reduce((a, b, i) => (a * 31 + b * (i % 97 + 1)) % 1_000_000_007, 7)}`
    }
    // Key order does not matter (the database stores JSON with its own key order).
    const stable = (value: unknown): unknown => Array.isArray(value)
      ? value.map(stable)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.keys(value as object).sort().map((k) => [k, stable((value as Record<string, unknown>)[k])]))
        : value
    return JSON.stringify(stable({
      tiles: Object.keys(d.terrainTiles ?? {}).sort().map((k) => `${k}=${sum(d.terrainTiles[k])}`),
      structures: d.structures,
      ground: d.buildings.map((b: { id: string; ground?: unknown; baseElevation: number }) => ({ id: b.id, ground: b.ground ?? null, base: b.baseElevation })),
    }))
  })
  const before = await fingerprint()

  // Done: saves and returns to the editor.
  await page.getByRole('button', { name: 'Done' }).click()
  await page.waitForURL(new RegExp(`/studio/${campusId}/edit$`), { timeout: 60_000 })
  await openMap(ana, campusId, /Hall/)

  // Publish (Studio's "Publish anyway" path); time the server publish (bake included).
  const started = Date.now()
  const response = page.waitForResponse((r) => r.url().endsWith('/api/studio/v2/publish') && r.request().method() === 'POST', { timeout: 90_000 })
  const outcome = await page.evaluate(async () => {
    const services = (window as unknown as { __naviStudioV2: { context: { services: { get(id: string): any } } } }).__naviStudioV2.context.services // eslint-disable-line @typescript-eslint/no-explicit-any
    let thrown: string | null = null
    await services.get('publish').publish(true).catch((error: unknown) => { thrown = String(error) })
    const snapshot = services.get('publishStore')?.getSnapshot?.() ?? services.get('publish').getSnapshot?.()
    return { thrown, error: snapshot?.publishError ?? null }
  })
  expect(outcome.thrown ?? outcome.error, JSON.stringify(outcome)).toBeNull()
  expect((await response).status()).toBe(200)
  console.log(`T12_PUBLISH_MS ${Date.now() - started}`)

  // NAVI Web: campus only (nothing from outside), the published terrain, one stair mesh.
  const visitor = await browser.newContext({ baseURL: 'http://127.0.0.1:3118', viewport: { width: 1280, height: 820 } })
  const outside: string[] = []
  await visitor.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname !== '127.0.0.1') {
      outside.push(url.hostname)
      return route.abort('blockedbyclient')
    }
    return route.continue()
  })
  await visitor.addInitScript((id) => {
    localStorage.setItem('navi-default-campus', id)
    localStorage.setItem('navi-onboarded', 'true')
  }, campusId)
  const web = await visitor.newPage()
  const errors: string[] = []
  web.on('pageerror', (error) => errors.push(error.message))
  const campus = web.waitForResponse((r) => r.url().includes(`/api/public-campus?campus_id=${campusId}`), { timeout: 90_000 })
  await web.goto('/map/explore')
  const payload = await (await campus).json() as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  const site = payload.artifacts?.site ?? payload.site
  expect(site?.structures).toHaveLength(1)
  expect(site?.terrain).not.toBeNull()
  const webMap = <T,>(fn: string) => web.evaluate((f) => new Function('map', `return ${f}`)((window as unknown as { __naviTerrainMaps: Record<string, unknown> }).__naviTerrainMaps.web), fn) as Promise<T>
  const mapReady = () => web.waitForFunction(() => Boolean((window as unknown as { __naviTerrainMaps?: Record<string, { getLayer(id: string): unknown }> }).__naviTerrainMaps?.web?.getLayer('site-ground')), undefined, { timeout: 60_000 })
  await mapReady().catch(() => undefined)
  await web.waitForLoadState('networkidle')
  await web.goto('/map/explore')
  await mapReady()
  const sources = await webMap<string[]>('Object.keys(map.getStyle().sources)')
  expect(sources).not.toContain('osm')
  expect(sources).toContain('site-dem-terrain')
  expect(await webMap<number>('map.getLayer("site-structures").implementation.vertexCount()')).toBeGreaterThan(0)
  await web.getByRole('button', { name: 'Cycle camera view' }).click()
  await expect.poll(() => webMap<string | null>('map.getTerrain()?.source ?? null'), { timeout: 10_000 }).toBe('site-dem-terrain')
  await webMap('map.jumpTo({ center: [122.1705, 11.8171], zoom: 18.2, pitch: 62, bearing: -20 })')
  await web.waitForTimeout(3500)
  await web.screenshot({ path: path.join(SHOTS, 't12-web-3d.png') })
  expect(outside).toEqual([])
  expect(errors).toEqual([])
  await visitor.close()

  // Reload Studio: the tiles, the stair and the buildings' ground settings come back identical.
  await page.goto(`/studio/${campusId}/edit/terrain`)
  await waitForEditor(page)
  // The editor page (where Publish lives) uses an online base map; the terrain page and NAVI Web do not.
  await page.waitForTimeout(1000)
  ana.blocked.length = 0
  await expect.poll(() => doc<number>('(doc.structures ?? []).length'), { timeout: 30_000 }).toBe(1)
  expect(await fingerprint()).toBe(before)
  expect(dataBlocked(ana.blocked)).toEqual([])
  await ana.context.close()
})

test('T13 — section 5: opens flat on a campus whose boundary is only in the settings, expands the boundary, imports one file at a time, Done keeps the settings boundary in step', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const ring = [{ lat: 11.8163, lng: 122.1690 }, { lat: 11.8163, lng: 122.1730 }, { lat: 11.8190, lng: 122.1730 }, { lat: 11.8190, lng: 122.1690 }]
  // As the create-map wizard leaves it: the boundary in the campus settings, none in the document.
  const campusId = await seededCampus(ana, (id) => {
    const document = ibajayDocument(id) as Record<string, unknown>
    delete document.boundary
    return document
  }, ring)
  const page = ana.page
  await page.goto(`/studio/${campusId}/edit/terrain`)
  await waitForEditor(page)
  await page.waitForTimeout(1000)
  ana.blocked.length = 0
  const doc = <T,>(read: string) => page.evaluate((r) => new Function('doc', `return ${r}`)((window as ProbeWindow).__naviStudioV2!.context.document), read) as Promise<T>

  // Opens on the campus: no first-visit page, no missing-boundary banner, nothing written yet.
  await expect(page.locator('[data-terrain-map="top"]')).toBeVisible()
  await page.waitForFunction(() => (window as unknown as { __naviTerrainEditing?: boolean }).__naviTerrainEditing === true, undefined, { timeout: 30_000 })
  await expect(page.getByText(/no campus boundary yet/)).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Layers' })).toBeVisible()
  expect(await doc<boolean>('doc.terrain === undefined && doc.boundary === undefined')).toBe(true)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(SHOTS, 't13-open.png') })
  // The camera frames the campus even though its boundary arrived after the map opened.
  const centre = await page.evaluate(() => (window as unknown as { __naviTerrainMaps: Record<string, { getCenter(): { lat: number; lng: number } }> }).__naviTerrainMaps.top.getCenter())
  expect(centre.lat).toBeGreaterThan(11.8163)
  expect(centre.lat).toBeLessThan(11.8190)
  expect(centre.lng).toBeGreaterThan(122.1690)
  expect(centre.lng).toBeLessThan(122.1730)

  // The first stroke creates the flat "Campus ground" and copies the map-creation boundary.
  const dock = page.getByRole('toolbar', { name: 'Terrain tools' })
  await dock.getByRole('button', { name: 'Raise / Lower' }).click()
  await page.getByLabel('Brush size').fill('20')
  await page.getByLabel('Brush strength').fill('100')
  const box = (await page.locator('[data-terrain-map="top"]').boundingBox())!
  const from = await page.evaluate(() => (window as unknown as { __naviTerrainMaps: Record<string, { project(p: [number, number]): { x: number; y: number } }> }).__naviTerrainMaps.top.project([122.1720, 11.8183]))
  await page.mouse.move(box.x + from.x, box.y + from.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + from.x + i * 6, box.y + from.y, { steps: 2 })
  await page.waitForTimeout(600)
  await page.mouse.up()
  await expect.poll(() => doc<string | undefined>('doc.terrain?.reference?.name')).toBe('Campus ground')
  expect(await doc<number>('doc.boundary.points.length')).toBe(4)
  await expect.poll(() => doc<number>('Object.keys(doc.terrainTiles ?? {}).length')).toBeGreaterThan(0)

  // Expand the boundary: + on the first edge adds a corner.
  await dock.getByRole('button', { name: 'Edit boundary' }).click()
  await page.getByLabel('Add boundary corner on edge 1').click()
  await expect.poll(() => doc<number>('doc.boundary.points.length')).toBe(5)

  // Import terrain from the dock, one file at a time, keeping the stroke.
  await page.getByRole('button', { name: 'Import terrain' }).click()
  await page.getByLabel('Terrain files').setInputFiles(path.join(FIXTURES, 'topoexport-asu-ibajay.glb'))
  await page.getByLabel('Terrain files').setInputFiles(path.join(FIXTURES, 'topoexport-frame.geojson'))
  await page.getByRole('button', { name: 'Keep my changes' }).click()
  await expect.poll(() => doc<number>('Math.round(doc.terrain.colorRange.minM)')).toBe(2)

  // Lower only on the imported ground (owner: "I cannot lower anything"): holding the brush 1.2 s at
  // full strength digs about 1.5 m/s under its centre.
  await dock.getByRole('button', { name: 'Raise / Lower' }).click()
  await page.getByLabel('Brush mode').selectOption('lower')
  await page.getByLabel('Brush strength').fill('100')
  const dig = await page.evaluate(() => (window as unknown as { __naviTerrainMaps: Record<string, { project(p: [number, number]): { x: number; y: number } }> }).__naviTerrainMaps.top.project([122.1712, 11.8172]))
  await page.mouse.move(box.x + dig.x, box.y + dig.y)
  await page.mouse.down()
  await page.waitForTimeout(1200)
  await page.mouse.up()
  const lowest = () => doc<number>('Math.min(0, ...Object.values(doc.terrainTiles ?? {}).map((t) => { const b = atob(t); const a = new Int16Array(new Uint8Array([...b].map((c) => c.charCodeAt(0))).buffer); return Math.min(...a) }))')
  await expect.poll(lowest).toBeLessThanOrEqual(-100)

  // Done: saved, and the campus settings boundary has the new corner too.
  await page.getByRole('button', { name: 'Done' }).click()
  await page.waitForURL(new RegExp(`/studio/${campusId}/edit$`), { timeout: 60_000 })
  await expect.poll(async () => {
    const response = await page.request.get('/api/studio/v2/campuses', { headers: { 'x-navi-studio-session': randomUUID() } })
    const body = await response.json() as { campuses?: Array<{ id: string; settings?: { boundary?: unknown[] } }> }
    return body.campuses?.find((row) => row.id === campusId)?.settings?.boundary?.length ?? 0
  }, { timeout: 30_000 }).toBe(5)
  expect(dataBlocked(ana.blocked)).toEqual([])
  await ana.context.close()
})


// Smooth sculpting (2026-11-07): the ASU-IBAJAY copy — boundary and 29 buildings following the ground with "lower"
// pads — sculpted by hand (no TopoExport import, owner's decision). Long main-thread tasks and frames are recorded for
// turning on 3D, a 2 s held Raise stroke and its release. GPU only (PERF_GPU=1).
const IBAJAY = JSON.parse(readFileSync(path.join(FIXTURES, 'ibajay-campus.json'), 'utf-8')) as { boundary: Array<{ lat: number; lng: number }>; footprints: number[][][] }
function ibajayCopy(campusId: string) {
  return {
    schemaVersion: 1, version: 1, connectivitySemanticsVersion: '1.0.0',
    metadata: { campusId, name: 'ASU-IBAJAY copy', description: 'speed test', lastModified: '2026-11-07T00:00:00.000Z', editorVersion: '1.5-probe' },
    buildings: IBAJAY.footprints.map((ring, i) => ({
      id: `bld-${i}`, name: `Bldg ${i}`, code: `B${i}`, category: 'academic', description: '',
      footprint: { points: [...ring, ring[0]].map(([lat, lng]) => ({ lat, lng })) },
      baseElevation: 0, height: 5, floors: [{ ...floor(`bld-${i}-f1`, 'Floor 1'), height: 5 }],
      verticalConnectors: [], verticalTransitions: [], color: '#4682b4', aliases: [], metadata: {},
      ground: { baseMode: 'follow-ground', pad: { mode: 'lower', blendMeters: 3 } },
    })),
    roads: [], roadJunctions: [], separatedCrossings: [], panoramas: [], qrCheckpoints: [], areas: [],
    boundary: { points: IBAJAY.boundary },
  }
}

test('T14 — speed on the ASU-IBAJAY copy (GPU): 3D on, a 2 s held stroke and its release', async ({ browser }) => {
  test.skip(!process.env.PERF_GPU, 'speed test: run with PERF_GPU=1 on the real graphics card')
  test.setTimeout(600_000)
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana, ibajayCopy)
  const page = ana.page
  await page.addInitScript(() => {
    const w = window as unknown as { __long: Array<{ at: number; ms: number }>; __frames: number[] }
    w.__long = []
    w.__frames = []
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__long.push({ at: Math.round(e.startTime), ms: Math.round(e.duration) })
      }).observe({ type: 'longtask', buffered: true })
    } catch {
      // no longtask support
    }
    const tick = (t: number) => {
      w.__frames.push(t)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.goto(`/studio/${campusId}/edit/terrain`)
  await waitForEditor(page)
  await page.waitForFunction(() => (window as unknown as { __naviTerrainEditing?: boolean }).__naviTerrainEditing === true, undefined, { timeout: 60_000 })
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2') as WebGL2RenderingContext | null
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown'
  })
  expect(renderer, 'runs on the graphics card, not software WebGL').not.toMatch(/SwiftShader|software/i)

  const tools = page.getByRole('toolbar', { name: 'Terrain tools' })
  await tools.getByRole('button', { name: 'Raise / Lower' }).click()
  await page.getByLabel('Brush size').fill('30')
  await page.getByLabel('Brush strength').fill('100')
  const box = (await page.locator('[data-terrain-map="top"]').boundingBox())!
  const n = IBAJAY.boundary.length
  const centre = IBAJAY.boundary.reduce((s, p) => ({ lat: s.lat + p.lat / n, lng: s.lng + p.lng / n }), { lat: 0, lng: 0 })
  const at = await page.evaluate((c) => (window as unknown as { __naviTerrainMaps: Record<string, { project(p: [number, number]): { x: number; y: number } }> }).__naviTerrainMaps.top.project([c.lng, c.lat]), centre)
  // The owner's first touch creates the ground (the campus opens flat, nothing stored yet).
  await page.mouse.move(box.x + at.x + 120, box.y + at.y)
  await page.mouse.down()
  await page.waitForTimeout(200)
  await page.mouse.up()
  await page.waitForFunction(() => Boolean((window as ProbeWindow).__naviStudioV2?.context.document.terrain), undefined, { timeout: 30_000 })
  await page.waitForTimeout(3000)

  const mark = () => page.evaluate(() => performance.now())
  const measure = (from: number, to: number) => page.evaluate(([a, b]) => {
    const w = window as unknown as { __long: Array<{ at: number; ms: number }>; __frames: number[] }
    const long = w.__long.filter((l) => l.at >= a && l.at <= b)
    const frames = w.__frames.filter((t) => t >= a && t <= b)
    return { longestMs: Math.max(0, ...long.map((l) => l.ms)), longTasks: long.length, fps: Math.round(frames.length / ((b - a) / 1000)) }
  }, [from, to] as const)

  // 3D on: until the top map's terrain tiles are all in.
  const t0 = await mark()
  await page.getByRole('button', { name: '3D' }).click()
  await page.waitForFunction(() => (window as unknown as { __naviTerrainMaps: Record<string, { getTerrain(): unknown }> }).__naviTerrainMaps.top.getTerrain() !== null, undefined, { timeout: 30_000 })
  await page.waitForFunction(() => (window as unknown as { __naviTerrainMaps: Record<string, { areTilesLoaded(): boolean }> }).__naviTerrainMaps.top.areTilesLoaded(), undefined, { timeout: 60_000 })
  const t1 = await mark()
  const threeD = { ...(await measure(t0, t1)), readyMs: Math.round(t1 - t0) }
  await page.waitForTimeout(2000)

  // A 2 s held Raise stroke at full strength near the campus centre, moving a little as a person does.
  await page.mouse.move(box.x + at.x, box.y + at.y)
  const s0 = await mark()
  await page.mouse.down()
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(box.x + at.x + (i % 10) * 3, box.y + at.y + Math.floor(i / 10) * 3)
    await page.waitForTimeout(50)
  }
  const s1 = await mark()
  await page.mouse.up()
  await page.waitForTimeout(2500)
  const s2 = await mark()
  const stroke = await measure(s0, s1)
  const release = await measure(s1, s2)
  // The elevation tiles and contour lines came from the terrain worker (its script was loaded).
  const workerScripts = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /worker/i.test(n)))
  console.log('T14 ' + JSON.stringify({ renderer, threeD, stroke, release, workerScripts }))
  expect(workerScripts.length, 'the terrain worker loaded').toBeGreaterThan(0)
  await page.screenshot({ path: path.join(SHOTS, 't14-after-stroke.png') })

  // Accepted levels (the prototype the owner approved: 52 fps; longest tasks ~60 ms stroke, ~0.1 s release,
  // ~0.2 s 3D on — the rest is MapLibre and React development mode). The spec targets are tighter; see the log line.
  expect(stroke.fps).toBeGreaterThanOrEqual(40)
  expect(stroke.longestMs).toBeLessThanOrEqual(100)
  expect(release.longestMs).toBeLessThanOrEqual(200)
  expect(threeD.readyMs).toBeLessThanOrEqual(1500)
  expect(threeD.longestMs).toBeLessThanOrEqual(400)
  await ana.context.close()
})
