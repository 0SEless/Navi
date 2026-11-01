// Save v2 browser probe (Task 18): network silence, explicit Save, private floor plans,
// strict locks and two admins editing at once — against a real Next dev server and the
// disposable local database. Run with `node e2e/save-v2/run.mjs`.
//
// Edits are dispatched through the mounted editor (window.__naviStudioV2, a dev-only hook)
// rather than by drawing on the MapLibre canvas: this probe checks what reaches the network
// and the database; canvas gestures are covered by the editor interaction tests.
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import {
  BUILDING_DENIED, GYM, LIBRARY, NORTH, PLAN_IMAGE, SOUTH, TERRAIN_DENIED,
  clickSave, dispatch, documentValue, drawWall, legacy, openAdmin, openFloor, openMap, rename, roadName, saves, seededCampus,
  type ProbeWindow,
} from './support'

test.afterEach(async ({ browser }) => {
  for (const context of browser.contexts()) await context.close()
})

test('S1 — edits, undo/redo, idle and a hidden tab send no save and no legacy request', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana)
  await openFloor(ana, campusId)
  const before = ana.requests.length

  await drawWall(ana.page, LIBRARY, 2)
  const wallId = await documentValue<string>(ana.page, `doc.buildings.find((b) => b.id === '${LIBRARY}').floors[0].walls.at(-1).id`)
  await dispatch(ana.page, { id: 'wall.update', label: 'Drag wall', payload: { wallId, buildingId: LIBRARY, floorId: `${LIBRARY}-floor-1`, patch: { start: { x: 3, y: 0 }, end: { x: 3, y: 6 } } } })
  await ana.page.evaluate(async () => {
    const services = (window as ProbeWindow).__naviStudioV2!.context.services
    services.get('history').undo()
    services.get('history').redo()
    // Drawing tools call workflow.save('manual') after each confirm: still a local draft only (R46).
    await services.get('workflow').save('manual')
  })
  await ana.page.waitForTimeout(60_000)
  await ana.page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await ana.page.waitForTimeout(1_000)

  const after = ana.requests.slice(before)
  expect(after.filter((r) => r.path === '/api/studio/v2/save')).toHaveLength(0)
  expect(after.filter((r) => r.path === '/api/graph')).toHaveLength(0)
  expect(legacy(ana)).toHaveLength(0)
  // Only map tiles try to leave the machine (and are blocked); no data request does.
  expect(ana.blocked.filter((entry) => !entry.endsWith('://tile.openstreetmap.org'))).toEqual([])
  expect(await ana.page.evaluate(() => (window as ProbeWindow).__naviStudioV2!.session.isDirty())).toBe(true)
})

test('S2 — Save sends one request with only the changed floor part, no plan image and no data URI', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana)
  await openFloor(ana, campusId)
  await ana.page.locator('input[type="file"]').first().setInputFiles(PLAN_IMAGE)
  await expect.poll(() => documentValue<string>(ana.page, `doc.buildings.find((b) => b.id === '${LIBRARY}').floors[0].planImageId ?? ''`)).toMatch(/^blob:/)
  await drawWall(ana.page, LIBRARY, 2)
  const before = saves(ana).length

  const response = ana.page.waitForResponse((r) => r.url().endsWith('/api/studio/v2/save') && r.request().method() === 'POST')
  await ana.page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => undefined)
  await ana.page.keyboard.press('Control+s')
  expect((await response).status()).toBe(200)
  await ana.page.waitForTimeout(1_000)

  const sent = saves(ana).slice(before)
  expect(sent).toHaveLength(1)
  const body = JSON.parse(sent[0].body) as { changes: Array<{ partKey: string }> }
  expect(body.changes.map((change) => change.partKey)).toEqual([`floor:${LIBRARY}:${LIBRARY}-floor-1`])
  expect(sent[0].body).not.toContain('planImageId')
  expect(sent[0].body).not.toContain('data:')
  expect(sent[0].body).not.toContain('blob:')
  await expect(ana.page.getByText(/Saved · #\d+/)).toBeVisible()
})

test('S3 — the floor plan stays on the tracing admin’s computer; the other admin sees only the walls', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana)
  await openFloor(ana, campusId)
  await ana.page.locator('input[type="file"]').first().setInputFiles(PLAN_IMAGE)
  await expect.poll(() => documentValue<string>(ana.page, `doc.buildings.find((b) => b.id === '${LIBRARY}').floors[0].planImageId ?? ''`)).toMatch(/^blob:/)
  await drawWall(ana.page, LIBRARY, 1)
  await drawWall(ana.page, LIBRARY, 4)
  const outcome = await ana.page.evaluate(async () => {
    const probe = (window as ProbeWindow).__naviStudioV2!
    const result = await probe.session.save()
    // Leaving the building frees its lock (as LeaveBuildingRelease / idle release would).
    await probe.session.zones.release(probe.session.zones.held())
    return result.kind
  })
  expect(outcome).toBe('saved')

  const ben = await openAdmin(browser, 'ben')
  await openFloor(ben, campusId)
  await expect.poll(() => documentValue<number>(ben.page, `doc.buildings.find((b) => b.id === '${LIBRARY}').floors[0].walls?.length ?? 0`)).toBe(2)
  expect(await documentValue<string | null>(ben.page, `doc.buildings.find((b) => b.id === '${LIBRARY}').floors[0].planImageId ?? null`)).toBeNull()
  expect(await ben.page.locator('img[src^="blob:"], img[src^="data:"]').count()).toBe(0)
  expect(ben.requests.some((r) => r.path.includes('floor-plans'))).toBe(false)
})

test('S4 — a building is strictly locked; the other admin edits another building; both saves succeed', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana)
  await openMap(ana, campusId)
  await ana.page.getByRole('treeitem', { name: /Library/ }).click()
  await expect.poll(() => ana.page.evaluate(() => (window as ProbeWindow).__naviStudioV2!.session.zones.held())).toContain(`building:${LIBRARY}`)

  const ben = await openAdmin(browser, 'ben')
  await openMap(ben, campusId)
  await ben.page.getByRole('treeitem', { name: /Library/ }).click()
  await expect(ben.page.getByTestId('zone-denied-dialog')).toContainText(BUILDING_DENIED)
  await ben.page.getByTestId('zone-denied-dialog').getByRole('button', { name: 'OK' }).click()

  await ben.page.getByRole('treeitem', { name: /Gym/ }).click()
  await expect.poll(() => ben.page.evaluate(() => (window as ProbeWindow).__naviStudioV2!.session.zones.held())).toContain(`building:${GYM}`)
  await rename(ben.page, GYM, 'Gym (ben)')
  expect(await clickSave(ben.page)).toBe(200)

  await rename(ana.page, LIBRARY, 'Library (ana)')
  expect(await clickSave(ana.page)).toBe(200)
  await expect(ana.page.getByText(/Saved · #\d+/)).toBeVisible()
  await expect(ben.page.getByText(/Saved · #\d+/)).toBeVisible()
})

test('S5 — different roads merge within 20 s; the same road reports who changed it', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana)
  await openMap(ana, campusId)
  const ben = await openAdmin(browser, 'ben')
  await openMap(ben, campusId)

  await rename(ana.page, NORTH, 'North (ana)')
  await rename(ben.page, SOUTH, 'South (ben)')
  expect(await clickSave(ana.page)).toBe(200)
  expect(await clickSave(ben.page)).toBe(200)
  await expect.poll(() => roadName(ben.page, NORTH), { timeout: 20_000 }).toBe('North (ana)')
  await expect.poll(() => roadName(ana.page, SOUTH), { timeout: 20_000 }).toBe('South (ben)')

  // Ben's unsaved edit is never overwritten by the merge; his later save is stale.
  await rename(ben.page, NORTH, 'North (ben)')
  await rename(ana.page, NORTH, 'North (ana, again)')
  expect(await clickSave(ana.page)).toBe(200)
  expect(await clickSave(ben.page)).toBe(409)
  await expect(ben.page.getByText('This road was changed by ana')).toBeVisible()
  expect(await roadName(ben.page, NORTH)).toBe('North (ben)')
})

test('S6 — closing without saving keeps a draft; reopening offers Restore and brings the edit back', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana)
  await openMap(ana, campusId)
  await rename(ana.page, NORTH, 'North (draft)')
  await ana.page.evaluate(() => (window as ProbeWindow).__naviStudioV2!.context.services.get('workflow').save('autosave'))
  await ana.page.close({ runBeforeUnload: false })

  const page = await ana.context.newPage()
  ana.page = page
  const questions: string[] = []
  page.on('dialog', (dialog) => {
    questions.push(dialog.message())
    void dialog.accept()
  })
  await openMap(ana, campusId)
  expect(questions.some((question) => /unsaved work on this computer/.test(question) && /Restore it\?/.test(question))).toBe(true)
  await expect.poll(() => roadName(page, NORTH)).toBe('North (draft)')
  expect(await page.evaluate(() => (window as ProbeWindow).__naviStudioV2!.session.isDirty())).toBe(true)
  await expect(page.getByText('Unsaved changes')).toBeVisible()
})

test('S7 — terrain is one admin at a time; the other admin can still edit a building', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana)
  await openMap(ana, campusId)
  await ana.page.getByTestId('terrain-draw-start').click()
  await expect.poll(() => ana.page.evaluate(() => (window as ProbeWindow).__naviStudioV2!.session.zones.held())).toContain('terrain')

  const ben = await openAdmin(browser, 'ben')
  await openMap(ben, campusId)
  await ben.page.getByTestId('terrain-draw-start').click()
  await expect(ben.page.getByTestId('zone-denied-dialog')).toContainText(TERRAIN_DENIED)
  await expect(ben.page.getByTestId('terrain-draw-finish')).toHaveCount(0)
  await ben.page.getByTestId('zone-denied-dialog').getByRole('button', { name: 'OK' }).click()

  await ben.page.getByRole('treeitem', { name: /Gym/ }).click()
  await expect.poll(() => ben.page.evaluate(() => (window as ProbeWindow).__naviStudioV2!.session.zones.held())).toContain(`building:${GYM}`)
  await rename(ben.page, GYM, 'Gym (ben)')
  expect(await clickSave(ben.page)).toBe(200)
})


test('S8 — the publish route loads under a real Next server, compiles the saved commit and refuses an unconnected campus', async ({ browser }) => {
  const ana = await openAdmin(browser, 'ana')
  const campusId = await seededCampus(ana)
  const response = await ana.page.request.post('/api/studio/v2/publish', {
    headers: { 'x-navi-studio-session': randomUUID() },
    data: { campusId, commitNo: 1 },
  })
  // The probe campus has two roads and no entrance, so the server-side compile must refuse it.
  // A structured compiler verdict proves the route's module graph loads (Task 12 VERIFY);
  // a successful publish of a connected campus is checked by the parity run (Task 19).
  const body = await response.json() as { code?: string; diagnostics?: Array<{ code: string }> }
  expect(response.status()).toBe(422)
  expect(body.code).toBe('COMPILE_FAILED')
  expect(body.diagnostics?.map((diagnostic) => diagnostic.code)).toContain('HALLWAY_DISCONNECTED')
})
