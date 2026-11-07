# Stair route links and a preview before publishing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show outdoor stairs and ramps in the map editor, connect them to the route network in a few clicks so visitors are routed over them, and add a Preview that shows the saved campus as NAVI Web will before publishing.

**Architecture:** Pure geometry and suggestion functions in `@navi/core`; connecting is a batch of existing editor commands (`road.create` with a stairs routing feature and an authored connection, `entrance.access.assign`), so it is one undo step and saves as ordinary road and floor parts. The preview is a read-only server route that runs Publish's build steps without recording a publication, and a Studio page that renders the result with NAVI Web's `ExploreMap`.

**Tech Stack:** TypeScript, React 19 / Next 16, MapLibre 5.24, vitest, Playwright (Save v2 lane).

**Spec:** `docs/superpowers/specs/2026-11-07-navi-stair-route-links-and-draft-preview.md`

## Global Constraints

- Two editors stay: stairs are shaped only in the terrain editor; the map editor shows flat markings (no 3D).
- No database or schema change; no new part kind. Stair paths, junctions and entrance links are ordinary `map/road`,
  junction and floor data. New optional field only: `RoadRouting.structureId?: string`.
- Dev Supabase `scvgulusmutnzasmgysx` untouched; Save v2 work on `ztbnicoiwjghzttchqmp` only; nothing to production;
  no push without the owner.
- UI text exactly as the spec: "Connect to route", "Disconnect", "Edit in terrain editor", "Add an entrance on <floor>
  here first", "Stair route out of step: <reason>", "Preview", "Preview — not published. Showing the version saved at
  <time>.", "Save first?" with "Save and preview" / "Preview last save".
- Top-end entrance search radius 3 m (`ENTRANCE_ROUTE_START_TOLERANCE_METERS`); path-end tolerance for "out of step"
  0.5 m (`ROUTE_NETWORK_THRESHOLDS.snapRadiusMeters`).
- Gates before every commit: `bash .superpowers/sdd/2026-11-02-navi-terrain-2.5d-stairs-ramps/gates.sh` (regressed 0;
  tsc errors = baseline 1122, clean folders 0); then `git checkout -- demo-output packages/compiler/src/__tests__/__snapshots__`.
  Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No subagents (owner rule): execute inline.

## Decisions this plan adds to the spec (owner to confirm at plan review)

1. **The top end needs an entrance that reaches the floor's routes.** `entrance.access.assign` requires an indoor route
   node (Verified). The suggestion uses the entrance's existing link's indoor node, else the floor's nearest route node
   within 3 m of the entrance; if neither exists the panel says **"Connect this entrance to <floor>'s routes first"**
   with the floor editor button, and Confirm stays disabled.
2. **One link per entrance (Verified: `addEntranceAccess` replaces).** If the chosen entrance is already linked to a
   road, the panel warns **"This entrance is linked to <road>; it will be linked to the stair instead."** Disconnect
   restores the previous link.

## Review Focus

1. A stair whose bottom end is on the **ground**, not a road → nothing pre-selected; Confirm needs a picked route.
2. A stair whose **top end is not on a building** (road-to-road or ground-to-road stair) → both ends connect to routes,
   no entrance link.
3. **Undo/redo** of Connect and Disconnect → document identical to before/after (one history entry each), saved parts
   touched only for the road(s) and that floor.
4. **Building lock held by someone else** → Connect is refused before anything is written, with who holds it.
5. **Preview with unsaved changes / with a route error** → the dialog appears; a route error shows the same problems as
   Publish and no publication is recorded.

---

### Task 1: Stair geometry for the map editor

**Files:**
- Create: `packages/core/src/structures/marking.ts`, `packages/core/src/structures/__tests__/marking.test.ts`
- Modify: `packages/core/src/terrain/site-artifact.ts` (export the flat-fallback sampler as `structureSampler(doc)`),
  `packages/core/src/structures/index.ts` (export)

**Interfaces:**
- Produces: `structureCentreline(doc: CampusDocument, structure: Structure): LatLng[] | null` (start → end along
  `structurePath`, 1 m spacing, null when an end cannot be resolved);
  `stairMarking(doc, structure): { outline: LatLng[]; steps: Array<[LatLng, LatLng]>; arrow: [LatLng, LatLng]; uphillAtEnd: boolean } | null`
  (steps empty for ramps; one line per riser from `stairShape`).

- [ ] **Step 1 (RED):** tests `centreline runs from the road end to the slab edge`, `a stair marking has one line per
  step and an arrow pointing uphill`, `a ramp marking has no step lines`, `an end on a deleted building gives null`
  (use a two-building document with a 3 m rise: expect `steps.length === Math.round(3 / 0.175)`).
- [ ] **Step 2:** run `npx vitest run packages/core/src/structures/__tests__/marking.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3:** implement with `resolveStructureEnds(doc, structureSampler(doc), structure)` and `structurePath`.
- [ ] **Step 4:** run it — Expected: PASS. Gates.
- [ ] **Step 5:** commit `feat(core): stair centre line and flat marking`.

### Task 2: Connection suggestion

**Files:** Create `packages/core/src/structures/stair-connection.ts`, `packages/core/src/structures/__tests__/stair-connection.test.ts`

**Interfaces:**
- Consumes: Task 1 `structureCentreline`.
- Produces:
  ```ts
  type StairEndRoute = { roadId: string; kind: 'road-endpoint' | 'road-segment' | 'existing-junction'; position: LatLng; junctionId?: string }
  type StairTop =
    | { kind: 'entrance'; buildingId: string; floorId: string; entranceId: string; indoorRouteNodeId: string; replacesRoadId?: string }
    | { kind: 'route'; route: StairEndRoute }
    | { kind: 'missing'; reason: 'entrance' | 'indoor-route'; buildingId: string; floorId: string }
  interface StairConnection { structureId: string; centreline: LatLng[]; bottom: StairEndRoute | null; top: StairTop | null }
  function suggestStairConnection(doc: CampusDocument, structureId: string): StairConnection | null
  function stairRouteOf(doc: CampusDocument, structureId: string): Road | null  // the road with routing.structureId
  ```
  The low end is the end with the lower resolved height. Road candidates use the editor's existing candidate rules
  (same kinds as `RoadConnectionRequest`), within `snapRadiusMeters` of the end, preferring the end's own `roadId`.

- [ ] **Step 1 (RED):** tests `the bottom end suggests the road it touches`, `a ground bottom end suggests nothing`,
  `the top end suggests the entrance on that floor within 3 m and its indoor route node`, `an entrance already linked to
  a road reports replacesRoadId`, `no entrance near the top end → missing entrance`, `an entrance with no route node
  within 3 m → missing indoor-route`, `a road-to-road stair suggests a route at both ends`.
- [ ] **Steps 2–4:** fail → implement → pass; gates.
- [ ] **Step 5:** commit `feat(core): suggest how a stair joins the routes`.

### Task 3: Connect and Disconnect (one undo step each)

**Files:**
- Modify: `packages/editor/src/commands/road-handlers.ts` (`road.create` accepts `routing` and `heightMode` in the payload),
  `packages/core/src/types/entities.ts` (`RoadRouting.structureId?: string`)
- Create: `packages/editor/src/commands/stair-route.ts`, `packages/editor/src/commands/__tests__/stair-route.test.ts`

**Interfaces:**
- Consumes: Task 2 `StairConnection`, `stairRouteOf`.
- Produces: `stairConnectCommands(doc, connection: StairConnection): Command[] | { error: string }` →
  `[road.create { points: centreline, type: 'pedestrian', width: structure.width, routing: { feature: 'stairs' | 'ramp', structureId }, heightMode: 'follow-surface', connections: [bottom (+ top if route)] }, entrance.access.assign { …, outdoorRouteId: <new road id>, outdoorPosition: centreline end }]`;
  `stairDisconnectCommands(doc, structureId): Command[]` → `[entrance.access.unassign { restoreEntranceAccess: previous }, road.delete]`.
  Callers run them with `dispatcher.executeBatch(commands)` (Verified: `executeBatch` records one history entry).

- [ ] **Step 1 (RED):** tests `connect writes a stairs path joined to the road and linked to the entrance`, `connect then
  undo restores the document exactly (one history entry)`, `disconnect removes what connect wrote and restores the
  previous entrance link`, `a ramp gets routing.feature 'ramp'`, `connect refuses without a bottom route`.
- [ ] **Steps 2–4:** fail → implement → pass; gates.
- [ ] **Step 5:** commit `feat(editor): connect a stair to the routes in one step`.

### Task 4: Keeping the stair route in step

**Files:**
- Modify: `packages/editor/src/commands/structure-handlers.ts` (`structure.replace`, `structure.swap-preset`: after the
  change, rewrite the linked road's polyline from `structureCentreline`, keeping road id, junction and entrance link
  ids; skip when ends cannot be resolved), `packages/editor/src/validation/rules/modules/route-network.ts`
  (`stairRouteIssues(document, profile)` added to `validateRouteNetwork`, issue id `route-stair`, severity error)
- Test: `packages/editor/src/commands/__tests__/stair-route.test.ts`, `packages/editor/src/validation/__tests__/route-stair.test.ts`

- [ ] **Step 1 (RED):** tests `moving the stair moves its path in the same undo step`, `undo of the stair move restores the
  path`, and validation `Stair route out of step: the stair was deleted`, `…: the top end is on another floor`,
  `…: the joined route was deleted`, `…: the entrance was deleted`, `…: the path end is more than 0.5 m from the stair`;
  `a connected, unchanged stair has no issue`.
- [ ] **Steps 2–4:** fail → implement → pass; gates.
- [ ] **Step 5:** commit `feat(editor): stair routes follow their stair; out-of-step stairs block publishing`.

### Task 5: Markings and the stair panel in the map editor

**Files:**
- Create: `src/components/studio/StairMarkingsOverlay.tsx` (map source + layers: outline dashed/solid/warning, step
  lines, arrow; click selects), `src/components/studio/StairPanel.tsx` (floating panel like `ConnectionChoice`),
  `src/components/studio/__tests__/StairPanel.test.tsx`
- Modify: `src/components/studio/StudioCanvas.tsx` (mount `<StairMarkingsOverlay map document />` — through props, keeping
  the composition-root rule: no stores), `src/components/terrain/TerrainWorkspaceRoute.tsx` (read `?stair=<id>`: stairs
  tool, that stair selected, camera framed on it)

**Interfaces:**
- Consumes: Tasks 1–4; `useEnsureZone()` with `` `building:${buildingId}` ``.
- Panel flow: **Connect to route** → shows the suggestion (bottom road highlighted; top entrance or the missing message)
  → a click on another route line replaces the bottom choice → **Confirm** runs `ensureZone([building zone])`, then
  `executeBatch(stairConnectCommands(…))`. Refusal shows who holds the lock. **Disconnect** runs
  `stairDisconnectCommands`. **Edit in terrain editor** links to `/studio/<id>/edit/terrain?stair=<structureId>`.

- [ ] **Step 1 (RED):** panel tests `shows not connected and the suggested road and entrance`, `shows the missing entrance
  message with Confirm disabled`, `warns when the entrance is linked to another road`, `Confirm asks for the building
  lock then runs one batch`, `a refused lock writes nothing`, `connected stairs offer Disconnect`.
- [ ] **Steps 2–4:** fail → implement → pass; gates.
- [ ] **Step 5:** commit `feat(studio): stair markings and Connect to route in the map editor`.

### Task 6: Preview build on the server

**Files:**
- Modify: `src/studio-v2/server/publish-handlers.ts` (extract `buildPublicationBlob(repo, campusId, commitNo)` → `{ ok: true, blob } | { ok: false, response }` from the existing steps; publish = build + record; add `preview(request)`),
  `src/app/api/public-campus/route.ts` (extract the published branch into `publicCampusPayload(campusId, artifacts)` in
  `src/studio-v2/server/public-campus-payload.ts`)
- Create: `src/app/api/studio/v2/preview/route.ts` (POST `{ campusId, commitNo }`, `maxDuration = 60`), tests in
  `src/studio-v2/server/preview.test.ts`

**Interfaces:**
- Produces: POST `/api/studio/v2/preview` → 200 `{ commitNo, campus: <publicCampusPayload> }`; the same 4xx bodies as
  publish for errors (ROUTE_INVALID, COMPILE_FAILED, ARTIFACT_INVALID, COMMIT_NOT_FOUND…). Allowed: any campus role or
  super admin (publish stays owner-only). Never calls `recordPublication`. `Cache-Control: no-store`.

- [ ] **Step 1 (RED):** tests `preview returns the same campus payload NAVI Web would read after publishing that commit`
  (compare with `publicCampusPayload(buildArtifactsBlob(...))`), `preview records no publication`, `a route error returns
  ROUTE_INVALID like publish`, `an editor (not owner) may preview`, `a stranger gets 404`; publish tests still pass.
- [ ] **Steps 2–4:** fail → implement → pass; gates.
- [ ] **Step 5:** commit `feat(studio-v2): build a preview of a saved commit without publishing`.

### Task 7: Preview page and button

**Files:**
- Modify: `src/store/public-store.ts` (export `parsePublicCampus(doc, campusId)` from `fetchFromPublicCampus`, no
  behaviour change), `src/app/(admin)/studio/[id]/preview/page.tsx` (render `StudioPreview`),
  `src/components/studio/StudioWorkspace.tsx` (Preview button next to Publish with the Save-first dialog)
- Create: `src/components/studio/StudioPreview.tsx` (banner, `ExploreMap` with the parsed bundle, a route test: pick A
  and B from the search list, `findRoute(nodes, edges, a, b)`), `src/components/studio/__tests__/StudioPreview.test.tsx`

**Interfaces:**
- Consumes: Task 6 route; the commit number and saved time from the same source `SaveStatus` shows ("Saved · #N").
- The preview never writes to the visitor store or its offline cache.

- [ ] **Step 1 (RED):** tests `the banner names the saved time`, `a failed build lists the problems`, `the route test draws
  the route found between A and B`, `Preview with unsaved changes asks Save first?`, `Save and preview saves then opens`,
  `Preview last save opens without saving`; `parsePublicCampus` parity test against `fetchFromPublicCampus`.
- [ ] **Steps 2–4:** fail → implement → pass; gates.
- [ ] **Step 5:** commit `feat(studio): Preview shows the saved campus as visitors will see it`.

### Task 8: Browser lane, preview deploy, owner test

**Files:** `e2e/save-v2/terrain.spec.ts` (new `T15`), `e2e/save-v2/parity.spec.ts` (P11 updated to the visitor map)

- [ ] **Step 1:** T15 — on the ASU-IBAJAY-style seed: a building with 1F and 2F (2F entrance near the edge, linked to a
  2F route), a road below, a stair from the road to the 2F slab edge (seeded structure). In the map editor: the marking
  is dashed → Connect to route → Confirm → solid; undo/redo; Save; Preview: route test from the road to a 2F room goes
  over the stair (route contains the stairs edge); no publication recorded; Publish; NAVI Web finds the same route.
  Then move the stair in the terrain editor → the path follows; delete it → Validate shows "Stair route out of step".
- [ ] **Step 2:** run `node e2e/save-v2/run.mjs -g "T15|P11"` — Expected: PASS; then the full lane in the background —
  Expected: all pass (T14 skipped without PERF_GPU).
- [ ] **Step 3:** gates; commit `test(studio): stair route links and preview in the browser`.
- [ ] **Step 4:** `bash scripts/save-v2/deploy-preview.sh`; owner tests on the preview.
