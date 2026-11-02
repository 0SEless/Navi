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
  ana.blocked.length = 0 // seeding opens the map editor (OSM tiles); only the terrain page must stay local

  await ana.page.goto(`/studio/${campusId}/edit/terrain`)
  await waitForEditor(ana.page)
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
