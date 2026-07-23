# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: floor-plan-upload.spec.ts >> Floor plan upload >> upload button opens file picker via <label> and sets planImageId
- Location: e2e\floor-plan-upload.spec.ts:32:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('treeitem', { name: /Bldg No\. 26/i })
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByRole('treeitem', { name: /Bldg No\. 26/i })

```

```yaml
- banner:
  - text: NAVIADMIN
  - textbox "Search..."
  - text: Online ASU Ibajay
- complementary:
  - button
  - navigation:
    - button "Dashboard"
    - button "Panoramas 3"
    - button "QR Checkpoints"
    - button "Route Testing"
    - button "Dataset Mgmt"
    - button "NAVI Studio"
  - button "Sign Out"
- main:
  - text: NAVI STUDIO All changes saved Not Validated
  - button "Validate"
  - button "Publish" [disabled]
  - text: Explorer No entities in document
  - region "Map"
  - group:
    - text: © OpenStreetMap contributors |
    - link "MapLibre":
      - /url: https://maplibre.org/
  - button "Select":
    - img
  - button "Pan":
    - img
  - button "Building":
    - img
  - button "Road":
    - img
  - button "Boundary":
    - img
  - button "Undo" [disabled]
  - button "Redo" [disabled]
- alert
```

# Test source

```ts
  1   | /**
  2   |  * Playwright test: Floor plan upload in Manage Floors dialog
  3   |  *
  4   |  * Run: npx playwright test e2e/floor-plan-upload.spec.ts --reporter=line
  5   |  */
  6   | import { test, expect } from '@playwright/test'
  7   | import path from 'path'
  8   | 
  9   | const BASE = 'http://localhost:3004'
  10  | 
  11  | async function loginAsAdmin(page: import('@playwright/test').Page) {
  12  |   await page.goto(`${BASE}/login`)
  13  |   await page.waitForLoadState('networkidle')
  14  |   await page.getByRole('button', { name: /Dr\. Admin/i }).click()
  15  |   await page.waitForTimeout(500)
  16  |   await page.goto(`${BASE}/dashboard`)
  17  |   await page.waitForLoadState('networkidle')
  18  |   await expect(page).toHaveURL(/\/dashboard/)
  19  | }
  20  | 
  21  | async function openCampusEditor(page: import('@playwright/test').Page) {
  22  |   // Use known campus ID directly (more reliable than /api/campus-maps)
  23  |   const campusId = 'map-map-2-8u5p'
  24  |   await page.goto(`${BASE}/studio/${campusId}/edit`)
  25  |   await page.waitForLoadState('networkidle')
  26  |   // Wait for document to load (tree items appear)
  27  |   await page.waitForTimeout(5000)
  28  |   expect(page.url()).toContain('/edit')
  29  | }
  30  | 
  31  | test.describe('Floor plan upload', () => {
  32  |   test('upload button opens file picker via <label> and sets planImageId', async ({ page }) => {
  33  |     // ── Login + open campus editor ───────────
  34  |     await loginAsAdmin(page)
  35  |     await openCampusEditor(page)
  36  | 
  37  |     // ── Take screenshot to see the state ─────
  38  |     await page.screenshot({ path: 'e2e/screenshots/floorplan-01-editor.png', fullPage: true })
  39  | 
  40  |     // ── Select a building from the tree ──────
  41  |     // Need to click a building to show the properties panel with Manage Floors
  42  |     // Wait for document to load by checking first building appears
  43  |     await page.waitForTimeout(2000)
  44  |     const treeBuilding = page.getByRole('treeitem', { name: /Bldg No\. 26/i })
> 45  |     await expect(treeBuilding).toBeVisible({ timeout: 15000 })
      |                                ^ Error: expect(locator).toBeVisible() failed
  46  |     await treeBuilding.click()
  47  |     await page.waitForTimeout(300)
  48  | 
  49  |     // ── Find the Manage Floors button ─────────
  50  |     const manageBtn = page.getByRole('button', { name: /Manage Floors/i })
  51  |     await expect(manageBtn).toBeVisible({ timeout: 10000 })
  52  |     await manageBtn.click()
  53  |     await page.waitForTimeout(500)
  54  |     await page.screenshot({ path: 'e2e/screenshots/floorplan-02-dialog-open.png', fullPage: true })
  55  | 
  56  |     // ── Find the "+ Upload" label ────────────
  57  |     const uploadLabel = page.locator('label').filter({ hasText: '+ Upload' })
  58  |     await expect(uploadLabel).toBeVisible({ timeout: 5000 })
  59  | 
  60  |     // ── Screenshot before clicking upload ─────
  61  |     await page.screenshot({ path: 'e2e/screenshots/floorplan-03-before-upload.png', fullPage: true })
  62  | 
  63  |     // ── Check that the hidden file input exists ─
  64  |     const fileInput = page.locator('input[type="file"]')
  65  |     await expect(fileInput).toBeAttached()
  66  | 
  67  |     // ── Programmatically set a file ───────────
  68  |     // Create a tiny 1x1 pixel PNG as a data URL
  69  |     const testPng = Buffer.from(
  70  |       'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  71  |       'base64'
  72  |     )
  73  |     await fileInput.setInputFiles({
  74  |       name: 'test-floor-plan.png',
  75  |       mimeType: 'image/png',
  76  |       buffer: testPng,
  77  |     })
  78  |     await page.waitForTimeout(500)
  79  |     await page.screenshot({ path: 'e2e/screenshots/floorplan-04-after-upload.png', fullPage: true })
  80  | 
  81  |     // ── Verify the thumbnail shows "✓ Uploaded" ─
  82  |     const uploadedLabel = page.locator('text=✓ Uploaded')
  83  |     await expect(uploadedLabel).toBeVisible({ timeout: 5000 })
  84  | 
  85  |     // ── Verify Replace and Remove are visible ─
  86  |     const replaceLabel = page.locator('label').filter({ hasText: 'Replace' })
  87  |     await expect(replaceLabel).toBeVisible({ timeout: 3000 })
  88  |     const removeBtn = page.getByRole('button', { name: /Remove/i })
  89  |     await expect(removeBtn).toBeVisible({ timeout: 3000 })
  90  | 
  91  |     // ── Verify planImageId was set ────────────
  92  |     const result = await page.evaluate(() => {
  93  |       const allElements = document.querySelectorAll('*')
  94  |       let startEl: Element | null = null
  95  |       for (let i = 0; i < allElements.length; i++) {
  96  |         if (Object.keys(allElements[i]).some(k => k.startsWith('__reactFiber$'))) {
  97  |           startEl = allElements[i]; break
  98  |         }
  99  |       }
  100 |       if (!startEl) return { success: false, error: 'No React fiber' }
  101 |       const fiberKey = Object.keys(startEl).find(k => k.startsWith('__reactFiber$'))!
  102 |       let fiber = (startEl as any)[fiberKey]
  103 |       let ctx: any = null
  104 |       let depth = 0
  105 |       const visited = new Set()
  106 |       function walk(f: any) {
  107 |         if (!f || visited.has(f) || depth > 500) return
  108 |         visited.add(f); depth++
  109 |         const v = f.memoizedProps?.value
  110 |         if (v?.services && v?.document) { ctx = v; return }
  111 |         const pv = f.pendingProps?.value
  112 |         if (pv?.services && pv?.document) { ctx = pv; return }
  113 |         let s = f.memoizedState
  114 |         let i = 0
  115 |         while (s && i < 20) {
  116 |           const sc = s.memoizedState
  117 |           if (sc?.current?.services && sc.current?.document) { ctx = sc.current; return }
  118 |           s = s.next; i++
  119 |         }
  120 |         if (ctx) return; walk(f.child); if (ctx) return; walk(f.sibling)
  121 |       }
  122 |       walk(fiber)
  123 |       if (!ctx) return { success: false, error: `Context not found (${depth})` }
  124 |       const doc = ctx.document
  125 |       // Find the first floor of the selected building
  126 |       let floor = null
  127 |       for (const b of doc.buildings) {
  128 |         if (b.floors?.length) { floor = b.floors[0]; break }
  129 |       }
  130 |       return {
  131 |         success: true,
  132 |         floorId: floor?.id,
  133 |         planImageId: floor?.planImageId,
  134 |         floorPlanState: floor?.floorPlanState,
  135 |         hasPlan: !!floor?.planImageId,
  136 |       }
  137 |     })
  138 |     console.log('Floor after upload:', JSON.stringify(result, null, 2))
  139 | 
  140 |     expect(result.success).toBe(true)
  141 |     expect(result.hasPlan).toBe(true)
  142 |     expect(result.planImageId).toBe('uploaded')
  143 |     expect(result.floorPlanState).toBe('active')
  144 | 
  145 |     // ── Test: remove the floor plan ──────────
```