# Terrain redesign section 5 (opens like NAVI Studio) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Owner rule: no subagents — execute inline with superpowers:executing-plans.**

**Goal:** The terrain editor opens straight onto the campus (street map underneath, flat ground, buildings, the map-creation boundary), with a Layers panel on the left, a bottom tool dock, Import terrain in the dock, a first-open guide, an expandable boundary and a "Take over here" for your own stale lock.

**Architecture:** The real document is never faked: the route builds a *view document* (the document plus the settings boundary and a flat terrain when they are missing) for drawing and tools, and a small runner materialises the missing pieces (`boundary.set`, then `terrain.setup` with "Campus ground") into the real document right before the owner's first edit. The boundary is written back to the campus settings through the existing campus-map store on Done. The existing terrain components are restyled and moved, not rebuilt.

**Tech Stack:** Next.js / React 19, MapLibre GL 5.24, zustand (`src/store/campus-map-store.ts`), `@navi/core`, `@navi/editor`, vitest + Testing Library, Playwright lane `e2e/save-v2`.

**Spec:** `docs/superpowers/specs/2026-11-07-navi-terrain-redesign-section-5-studio-layout.md` (findings: `docs/superpowers/plans/2026-11-07-section-5-plan-notes.md`).

## Global Constraints

- Protected Dev Supabase `scvgulusmutnzasmgysx`: never touched. No database change in this plan (campus settings already update through `PATCH /api/studio/v2/campuses` → `studio.update_campus_settings`).
- Flat start reference, exact: `{ name: 'Campus ground', zeroMeaning: 'The flat starting ground' }`.
- No naming form, no first-visit page. Just looking never changes the document.
- Street map tiles: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (same source as `src/components/studio/rendering/styles.ts` `osm`), Studio only. NAVI Web stays campus-only (T11/T12 `outside` stays `[]`).
- Ground see-through slider starts at 50 % (`groundOpacity: 0.5`).
- Letter keys unchanged (V B S F P L U T H R C E); Import terrain has no letter key.
- Copy: dock button "Import terrain"; same-account lock banner "You are editing the terrain in another tab." with button "Take over here"; no-boundary banner "This map has no campus boundary yet. Draw it in the main editor with Set Campus Boundary."
- Gates before every commit: `bash .superpowers/sdd/2026-11-02-navi-terrain-2.5d-stairs-ramps/gates.sh` (vitest regressed 0; tsc 1122 / baseline 1122 / clean folders 0). After test runs: `git checkout -- demo-output packages/compiler/src/__tests__/__snapshots__` before `git add`.
- Nothing pushed. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A map with no boundary in the document **and** none in the settings → the no-boundary banner, tools disabled, no crash (Task 3 test).
2. View-only (lock not held) on a map with no terrain → flat ground is shown, and no command materialises anything (Task 1 test).
3. Undo right after the first stroke → the stroke is undone; the created flat terrain and copied boundary stay (Task 1 test pins the order of the three history entries).
4. Campus settings unavailable (store fetch fails / campus missing from the list) → the document boundary is used if present, else the banner; Done still saves and only warns if the settings sync fails (Task 2 and Task 3 tests).
5. `localStorage` throwing (private window) → default layers and the guide shows; no crash (Task 5 and Task 8 tests).

---

### Task 1: Flat start and boundary fallback (pure)

**Files:**
- Create: `src/lib/terrain/terrain-start.ts`
- Test: `src/lib/terrain/__tests__/terrain-start.test.ts`

**Interfaces:**
- Consumes: `gridOriginForBoundary(points)` from `@navi/core` (`packages/core/src/terrain/grid.ts:96`); `Command`, `MutationResult` from `@navi/editor`.
- Produces:
  - `FLAT_REFERENCE: { name: string; zeroMeaning: string }`
  - `openRing(points: LatLng[]): LatLng[]` (drops a repeated closing point)
  - `sameBoundary(a: LatLng[] | null | undefined, b: LatLng[] | null | undefined): boolean` (compares open rings, 1e-9 tolerance)
  - `viewDocument(document: CampusDocument, fallback: LatLng[] | null): CampusDocument` — returns `document` itself when it has a boundary (≥3) and a terrain; otherwise a shallow copy with `boundary: { points: fallback }` when the document has none and `fallback` has ≥3 points, and `terrain: { reference: FLAT_REFERENCE, grid: gridOriginForBoundary(points), colorRange: { minM: 0, maxM: 40 } }` when the document has none and a boundary is available.
  - `startCommands(document: CampusDocument, fallback: LatLng[] | null, command: Command): Command[]` — the commands to run before `command`: `boundary.set` with `fallback` (label "Use the boundary from map creation") when the document has no boundary and fallback has ≥3; then `terrain.setup` with `{ reference: FLAT_REFERENCE }` (label "Start flat ground") when the document has no terrain and `command.id !== 'terrain.setup'`; none for `structure.*` / `structure-preset.*`.
  - `executeWithStart(execute: (c: Command) => MutationResult, document, fallback, command): MutationResult` — runs `startCommands` then `command`; stops and returns the first failure.

- [ ] **Step 1: Write the failing tests** — `terrain-start.test.ts`:
  - `viewDocument returns the same object when boundary and terrain exist` (`toBe(document)`).
  - `viewDocument uses the settings boundary and a flat Campus ground terrain` (boundary points equal fallback; `terrain.reference` equals `FLAT_REFERENCE`; `terrain.grid` equals `gridOriginForBoundary(fallback)`; the input document still has no `boundary`/`terrain`).
  - `viewDocument without any boundary adds no terrain` (fallback `null` → `terrain` undefined).
  - `startCommands before a first stroke: boundary.set then terrain.setup` (ids `['boundary.set','terrain.setup']`, payload of the second `{ reference: FLAT_REFERENCE }`).
  - `startCommands for an import adds only the boundary` (command `terrain.setup` → `['boundary.set']`).
  - `startCommands for a stair adds nothing` (`structure.create` → `[]`).
  - `executeWithStart stops at the first refusal` (fake execute refusing `boundary.set` → returns that refusal; the stroke is never executed).
  - Review Focus 3 — `executeWithStart runs boundary, terrain, then the stroke in that order` (recorded ids `['boundary.set','terrain.setup','terrain.apply-tiles']`).
  - Review Focus 2 lives in Task 3 (the route only calls `executeWithStart` when the lock is held).
- [ ] **Step 2: Run** `npx vitest run src/lib/terrain/__tests__/terrain-start.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `src/lib/terrain/terrain-start.ts` with the signatures above.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(terrain): flat start and map-creation boundary fallback (pure)`.

### Task 2: The campus settings boundary

**Files:**
- Create: `src/components/terrain/useSettingsBoundary.ts`
- Test: `src/components/terrain/__tests__/useSettingsBoundary.test.tsx`

**Interfaces:**
- Consumes: `useCampusMapStore` (`maps`, `getMap`, `updateMap`, `fetchFromSupabase`); `openRing`, `sameBoundary` (Task 1).
- Produces: `useSettingsBoundary(campusId: string): { points: LatLng[] | null; loaded: boolean; save(points: LatLng[]): boolean }`
  - Reads `getMap(campusId)?.boundary`; when the campus is not in the store, calls `fetchFromSupabase()` once, then `loaded` turns true (also when the fetch rejects — then `points` is `null`).
  - `points` is `null` when the boundary has fewer than 3 points.
  - `save(points)` calls `updateMap(campusId, { boundary: openRing(points) })` only when `!sameBoundary(points, current)` and the campus is in the store; returns whether it wrote.

- [ ] **Step 1: Write the failing tests** (reset the store with `useCampusMapStore.setState` in `beforeEach`; spy `fetchFromSupabase`, `updateMap`):
  - `reads the boundary drawn at map creation`.
  - `fetches the campus list once when the campus is missing`.
  - Review Focus 4 — `a failed fetch leaves points null and loaded true`.
  - `save writes the open ring only when it changed` (same ring → `false`, no `updateMap`; changed → `true`, `updateMap` called with the open ring).
- [ ] **Step 2: Run** `npx vitest run src/components/terrain/__tests__/useSettingsBoundary.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** the hook.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(terrain): read and write the campus settings boundary`.

### Task 3: Route wiring — open on the campus, no first-visit page

**Files:**
- Modify: `src/components/terrain/TerrainWorkspaceRoute.tsx` (view document, dispatch, onSave), `src/components/terrain/TerrainWorkspace.tsx` (drop `TerrainFirstVisit`, add the no-boundary banner)
- Delete: `src/components/terrain/TerrainFirstVisit.tsx`
- Test: `src/components/terrain/__tests__/TerrainWorkspace.test.tsx` (replace the three first-visit tests)

**Interfaces:**
- Consumes: Task 1 (`viewDocument`, `executeWithStart`), Task 2 (`useSettingsBoundary`).
- Produces: `TerrainWorkspaceProps` unchanged except `document` is now the view document; new prop `missingBoundary: boolean`.
- Route rules:
  - `const settings = useSettingsBoundary(document.metadata.campusId)`; `const view = useMemo(() => viewDocument(document, settings.points), [document, documentVersion, settings.points])`. `view` goes to `TerrainWorkspace`, `TerrainStage`, `TerrainTools`, `useTerrainSampler`, `useTerrainStroke`, `useTerrainShortcuts`.
  - `dispatch`: structure commands as today; otherwise lock check as today, then `executeWithStart(dispatcher.execute, document, settings.points, command)` (the real document).
  - `editing = lock.status === 'held' && Boolean(view.terrain)`.
  - `onSave`: after a successful save, `settings.save(document.boundary?.points ?? [])` when the document has ≥3 points; a thrown error there is `console.warn`ed, never fails the save.
  - `missingBoundary = settings.loaded && !(view.boundary?.points?.length >= 3)`.

- [ ] **Step 1: Write the failing tests** in `TerrainWorkspace.test.tsx`:
  - `opens on the map with no first-visit choices` (no `Start flat`/`Trace contours` buttons; children rendered).
  - Review Focus 1 — `shows the no-boundary banner when the map has no boundary` (`missingBoundary` → `role=status` text exactly the Global Constraints copy).
  - Delete the old first-visit tests (`shows first-visit choices…`, `Start flat sets up…`, `first visit shows why setting up was refused…`).
- [ ] **Step 2: Run** `npx vitest run src/components/terrain/__tests__/TerrainWorkspace.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** the route rules and the banner; delete `TerrainFirstVisit.tsx` (its `TerrainImportPanel` import moves nowhere — Task 7 uses the panel from `TerrainTools`).
- [ ] **Step 4: Run** the terrain component tests `npx vitest run src/components/terrain` — Expected: PASS. Then the gates.
- [ ] **Step 5: Commit** `feat(terrain): open on the campus with flat ground; boundary from map creation`.

### Task 4: Expandable boundary (add and remove corners)

**Files:**
- Create: `src/lib/terrain/boundary-edit.ts`; Test: `src/lib/terrain/__tests__/boundary-edit.test.ts`
- Modify: `src/components/terrain/useBoundaryEditor.ts`, `src/components/terrain/TerrainToolRail.tsx` (Edit boundary hint)

**Interfaces:**
- Produces:
  - `edgeMidpoints(points: LatLng[]): LatLng[]` (one per edge of the open ring, including last→first)
  - `insertCorner(points: LatLng[], edgeIndex: number, at: LatLng): LatLng[]` (inserted after corner `edgeIndex`)
  - `removeCorner(points: LatLng[], index: number): LatLng[] | null` (`null` when it would leave fewer than 3)
- `useBoundaryEditor`: corner markers as today (drag → `boundary.set`, label "Move boundary corner"); a small "+" marker at each edge midpoint — clicking it dispatches `boundary.set` with `insertCorner` (label "Add boundary corner"); clicking a corner selects it (ring highlight); `Delete`/`Backspace` (not while typing — reuse `isTypingTarget` from `useTerrainShortcuts.ts`) dispatches `removeCorner` (label "Remove boundary corner"), or reports "A boundary needs at least 3 corners." through a new `onMessage?: (text: string) => void` option that `TerrainTools` wires to its `setMessage`.
- Edit boundary hint: `'Drag a corner; click + on an edge to add one; Delete removes the selected corner'`.

- [ ] **Step 1: Write the failing tests** — `edgeMidpoints of a square has 4 midpoints incl. the closing edge`; `insertCorner puts the new corner after edgeIndex`; `insertCorner on the closing edge appends`; `removeCorner keeps the rest in order`; `removeCorner refuses below 3 corners` (`null`); `works on a closed ring input` (closing duplicate ignored).
- [ ] **Step 2: Run** `npx vitest run src/lib/terrain/__tests__/boundary-edit.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `boundary-edit.ts`, then the hook changes.
- [ ] **Step 4: Run** — Expected: PASS; gates.
- [ ] **Step 5: Commit** `feat(terrain): add and remove boundary corners`.

### Task 5: Street map underneath and the layers model

**Files:**
- Create: `src/lib/terrain/terrain-layers.ts`; Test: `src/lib/terrain/__tests__/terrain-layers.test.ts`
- Modify: `src/components/terrain/TerrainLayersPanel.tsx` (type + defaults move to `terrain-layers.ts`, re-exported), `src/components/terrain/TerrainMap.tsx`, `src/components/terrain/TerrainStage.tsx` (pass the full layers)

**Interfaces:**
- Produces in `terrain-layers.ts`:
  - `interface TerrainLayers { streetMap: boolean; streetMapOpacity: number; ground: boolean; groundOpacity: number; contours: boolean; buildings: boolean; roads: boolean; structures: boolean; boundary: boolean; tracing: boolean }`
  - `DEFAULT_LAYERS` — all `true`; `streetMapOpacity: 1`; `groundOpacity: 0.5`.
  - `STREET_MAP_SOURCE = 'terrain-street-map'`, `STREET_MAP_LAYER = 'terrain-street-map'`.
  - `loadLayers(storage?: Storage | null): TerrainLayers` / `saveLayers(layers, storage?)` — key `navi-terrain-layers`; unknown/missing keys fall back to defaults; any storage error → defaults / ignored.
  - `layerVisibility(layers): Record<string, 'visible' | 'none'>` for: `STREET_MAP_LAYER` (streetMap), `terrain-background` and `HILLSHADE_LAYER` (ground), `terrain-boundary` (boundary), `terrain-structures` (structures). Buildings/roads/contours keep their existing handling.
- `TerrainMap`: style gets the raster source/layer **first** (tiles from Global Constraints, tileSize 256, attribution "© OpenStreetMap contributors"); `terrain-background` gets `'background-opacity': groundOpacity`; the street map layer `'raster-opacity': streetMapOpacity`; an effect applies `layerVisibility` and both opacities on change.

- [ ] **Step 1: Write the failing tests** — `defaults show everything with the ground half see-through`; `loadLayers merges stored values over defaults`; Review Focus 5 — `loadLayers falls back to defaults when storage throws` (a `Storage` stub whose `getItem` throws); `saveLayers ignores a throwing storage`; `layerVisibility hides the street map and ground when off`.
- [ ] **Step 2: Run** `npx vitest run src/lib/terrain/__tests__/terrain-layers.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `terrain-layers.ts`, then the `TerrainMap` style/effect and `TerrainStage` pass-through. Check `terrain-view-order` tests still pass (the street map sits below `overlayAnchor`'s layers).
- [ ] **Step 4: Run** `npx vitest run src/lib/terrain src/components/terrain` — Expected: PASS; gates.
- [ ] **Step 5: Commit** `feat(terrain): street map under the ground, layer visibility model`.

### Task 6: Layers panel on the left

**Files:**
- Modify: `src/components/terrain/TerrainLayersPanel.tsx`, `src/components/terrain/TerrainTools.tsx` (placement), `src/components/terrain/TerrainWorkspaceRoute.tsx` (`useState(() => loadLayers())`, `saveLayers` on change)
- Test: `src/components/terrain/__tests__/TerrainLayersPanel.test.tsx`

**Interfaces:**
- `TerrainLayersPanel` props unchanged plus the new layer fields. Layout: full-height left panel (`position: absolute; left: 0; top: 0; bottom: 0; width: 240`), heading "Layers", one row per layer with an eye toggle button (`aria-label` = the layer name, `aria-pressed` = on): Street map, Ground, Contour lines, Buildings, Roads and paths, Stairs and ramps, Boundary, Tracing image. Two sliders, 0–100 with value = opacity × 100: `aria-label` "Street map opacity" and "Ground opacity". Tracing file input and its controls stay at the bottom of the panel.
- The map's `fitBounds` padding (`TerrainMap.tsx` load handler) changes to `{ top: 40, left: 260, right: 40, bottom: 110 }` for the new panel and dock.

- [ ] **Step 1: Write the failing tests** — `each layer has an eye that toggles it` (click "Street map" → `onLayers` with `streetMap: false`); `the ground opacity slider reports 0..1`; `the street map opacity slider reports 0..1`.
- [ ] **Step 2: Run** `npx vitest run src/components/terrain/__tests__/TerrainLayersPanel.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** the panel and wire `loadLayers`/`saveLayers` in the route.
- [ ] **Step 4: Run** — Expected: PASS; gates.
- [ ] **Step 5: Commit** `feat(terrain): layers panel on the left`.

### Task 7: Bottom tool dock with Import terrain

**Files:**
- Modify: `src/components/terrain/TerrainToolRail.tsx` (horizontal dock; keep the file and `TERRAIN_TOOLS`), `src/components/terrain/TerrainTools.tsx` (remove "Import ground…" button; import popover and tool settings sit above the dock), `src/components/terrain/TerrainToolPanel.tsx`, `BuildingGroundPanel.tsx`, `TerrainAreaPanel.tsx`, `StructurePanel.tsx` (anchor: `bottom: 64`, centred, instead of their current corners)
- Test: `src/components/terrain/__tests__/TerrainToolRail.test.tsx`

**Interfaces:**
- `TerrainToolRail` new props: `onImport?: () => void`, `importDisabled?: boolean`. Renders `role="toolbar" aria-label="Terrain tools" aria-orientation="horizontal"` at `position: absolute; bottom: 12; left: 50%; transform: translateX(-50%)` with the Studio dock look (`background: var(--navi-card)`, `border: 1px solid var(--navi-border)`, `borderRadius: 8`, `padding: '3px 6px'`, `boxShadow: '0 2px 8px rgba(0,0,0,0.12)'`), buttons keep their text label as accessible name, `aria-pressed`, the letter badge and the `"hint (KEY)"` title. A separator, then the "Import terrain" button (`onImport`).
- Ruling recorded in the plan: the Studio `ToolDock` from `@navi/editor` is **not** reused — it has no disabled state (terrain tools are disabled without the lock) and icon-only names would break every e2e selector.

- [ ] **Step 1: Write the failing tests** — `the dock is a horizontal toolbar`; `Import terrain calls onImport`; `Import terrain is disabled when importDisabled`; `tools without the lock are disabled except alwaysOn`.
- [ ] **Step 2: Run** `npx vitest run src/components/terrain/__tests__/TerrainToolRail.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** the dock, the panel anchors, and in `TerrainTools` pass `onImport={() => setImporting(true)}`, `importDisabled={!editing}`; the import popover opens above the dock (`bottom: 64`). Its refusal stays shown by `TerrainImportPanel` (the `onImport` callback returns the dispatch result instead of closing first: close only on success).
- [ ] **Step 4: Run** `npx vitest run src/components/terrain` — Expected: PASS; gates.
- [ ] **Step 5: Commit** `feat(terrain): bottom tool dock with Import terrain`.

### Task 8: First-open guide

**Files:**
- Create: `src/components/terrain/TerrainGuide.tsx`; Test: `src/components/terrain/__tests__/TerrainGuide.test.tsx`
- Modify: `src/components/terrain/TerrainWorkspaceRoute.tsx` (mount it; a "?" button `aria-label="Terrain guide"` added to `topBarExtras`)

**Interfaces:**
- `TerrainGuide({ open, onClose }: { open: boolean; onClose: () => void })` — a `role="dialog" aria-label="Terrain guide"` card with steps, Next/Back/Done buttons. Exact step copy:
  1. "Layers — turn the street map, ground, buildings and more on or off on the left."
  2. "Tools — shape the ground with the dock at the bottom. Each tool has a letter key."
  3. "Import terrain — bring in a TopoExport .glb with its frame.geojson for real heights."
  4. "Done — saves your terrain and goes back to the editor."
- `guideSeen(storage?)` / `markGuideSeen(storage?)` — key `navi-terrain-guide-seen`; storage errors → not seen / ignored.
- Route: `open` starts as `!guideSeen()`; closing marks it seen; "?" reopens.

- [ ] **Step 1: Write the failing tests** — `shows step 1 first and walks to step 4`; `Done closes`; `guideSeen is false until markGuideSeen`; Review Focus 5 — `guideSeen with a throwing storage is false` (guide shows).
- [ ] **Step 2: Run** `npx vitest run src/components/terrain/__tests__/TerrainGuide.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement**; e2e helpers must close it: Task 10 adds `localStorage.setItem('navi-terrain-guide-seen', '1')` to `openAdmin`'s init script.
- [ ] **Step 4: Run** — Expected: PASS; gates.
- [ ] **Step 5: Commit** `feat(terrain): first-open guide`.

### Task 9: "Take over here" for your own lock

**Files:**
- Modify: `src/components/terrain/useTerrainLock.ts`, `src/components/terrain/TerrainWorkspace.tsx`
- Test: `src/components/terrain/__tests__/useTerrainLock.test.tsx`, `TerrainWorkspace.test.tsx`

**Interfaces:**
- `TerrainLockState` gains `sameActor: boolean`, `canTakeOver: boolean`, `takeOver?: () => Promise<void>`.
  - `sameActor`: from `client.onDenied` events with `zoneKey === 'terrain'` (`ZoneDenial.sameActor`).
  - `canTakeOver`: `client.myRole() === 'owner'` (force release is owner/super-admin only on the server; no database change).
  - `takeOver`: `await client.forceRelease('terrain')`, then `client.ensure(['terrain'])` → status `held` or stays `view-only`.
- `TerrainWorkspace` banner when `sameActor`: "You are editing the terrain in another tab." plus the "Take over here" button when `canTakeOver`, else the text " It frees itself within 5 minutes after that tab closes." (server heartbeat window `interval '5 minutes'`).

- [ ] **Step 1: Write the failing tests** — `a same-account denial sets sameActor`; `takeOver force-releases then acquires`; `another admin's lock is not sameActor`; banner tests: `same account shows Take over here for the owner`, `same account without owner role shows the 5-minute note`.
- [ ] **Step 2: Run** `npx vitest run src/components/terrain/__tests__/useTerrainLock.test.tsx src/components/terrain/__tests__/TerrainWorkspace.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS; gates.
- [ ] **Step 5: Commit** `feat(terrain): take over your own terrain lock`.

### Task 10: Remove the old Terrain areas box; browser tests; preview

**Files:**
- Modify: `src/components/studio/StudioCanvas.tsx` (drop the `TerrainAreaAuthoring` import and line 230)
- Delete: `src/components/studio/TerrainAreaAuthoring.tsx` and its tests — only if `grep -rn "TerrainAreaAuthoring" src` shows no other importer; otherwise only the canvas usage goes (ledger the ruling).
- Modify: `e2e/save-v2/support.ts` (export `dataBlocked(blocked: string[]): string[]` = entries not ending in `://tile.openstreetmap.org`; init script sets `navi-terrain-guide-seen`), `e2e/save-v2/terrain.spec.ts`

**Interfaces:**
- e2e changes: every `expect(ana.blocked).toEqual([])` in `terrain.spec.ts` (11) → `expect(dataBlocked(ana.blocked)).toEqual([])`; `Import ground` → `Import terrain` (8 places); T2/T5/T6-style flows drop Start flat / Create terrain and wait for `[data-terrain-map="top"]` then edit (flat starts on the stroke); T3 (trace) drops the form and selects the Contour pen with the `C` key. NAVI Web `outside` assertions (T11/T12) are unchanged.
- New `T13 — opens flat on a campus whose boundary is only in the settings, expands the boundary, imports one file at a time, Done keeps the settings boundary in step`: create the campus with `settings.boundary` = the ibajay ring and a seeded document **without** `boundary`; open Terrain → no banner, `[data-terrain-map="top"]` visible, `doc.terrain` undefined; one Raise stroke → `doc.terrain.reference.name === 'Campus ground'`, `doc.boundary.points.length >= 3`; Edit boundary (`E`), click the first "+" marker → corner count +1; Import terrain with the two TopoExport files one at a time → `doc.terrain.colorRange.minM ≈ 1.8`; Done → `GET /api/studio/v2/campuses` settings boundary has the new corner count.

- [ ] **Step 1: Write T13 and update the flows**; run `node e2e/save-v2/run.mjs -g "T13"` — Expected: PASS (Tasks 1–9 are in). A failure is a finding: use systematic-debugging, fix with a unit test RED → GREEN first.
- [ ] **Step 2: Remove the old box** and run `npx vitest run src/components/studio` — Expected: PASS.
- [ ] **Step 3: Full lane** `node e2e/save-v2/run.mjs` (background; ~15 min) — Expected: 33/33 (a T8 pitch timeout that passes alone is the known load flake; log it).
- [ ] **Step 4: Gates**, notes in `progress/PROGRESS.md` (and `errors/ERRORS.md` for any flake), commit `feat(terrain): section 5 browser tests; remove the old Terrain areas box`.
- [ ] **Step 5: Preview** `bash scripts/save-v2/deploy-preview.sh` (Expected: alias `navi-next-savev2-navi01.vercel.app` updated), then in the owner's Chrome on ASU-IBAJAY: Terrain opens on the campus with the street map, flat ground and the boundary; layers toggle; dock and guide show. **Stop before Done** (saving changes the owner's campus).
