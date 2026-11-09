# NAVI Web Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visitors are guided to a campus destination from a gate screen or their phone, and NAVI trusts GPS only as far as it deserves. Concretely:
- progress follows GPS only when it is good
- otherwise the visitor taps Next at each step
- a QR scan re-anchors progress
- the walked part of the route disappears

**Architecture:**
- A small pure policy module decides where progress comes from: GPS (accurate outdoors) or step by step (indoors or rough GPS).
- `NavigationSession` owns progress: from GPS, from the visitor's Next taps, or from a QR re-anchor. It exposes the mode and these actions through `NavigationContext`.
- The Navigate page and a new gate-screen page only present that progress.
- Existing pieces are reused, not rebuilt: route building, instructions, floor changes, ETA, floor switching at stairs, camera follow and heading.

**Tech Stack:** Next.js App Router (client components), React, zustand (`usePublicStore`), MapLibre, Vitest + Testing Library, Playwright (Save v2 browser lane), `qrcode` (already a dependency).

**Spec:** `docs/superpowers/specs/2026-11-02-navi-web-navigation-design.md` (owner approved 2026-11-09)

## Global Constraints

- Thresholds:
  - GPS is good enough when its accuracy is **15 m or better** (`GPS_GOOD_ACCURACY_M = 15`).
  - Off-route distance stays **30 m** (`DEVIATION_THRESHOLD_M`, unchanged).
  - The gate screen resets after **60 s** without use (`GATE_IDLE_MS = 60_000`).
- English copy, exactly:
  - `Following GPS`
  - `Tap Next at each step`
  - `You seem to be near ${label} (±${m} m). Is that right?`
  - `GPS signal lost: tap Next at each step`
  - `You seem off the route`
  - `Recalculate`
  - `I'm fine`
  - `You've arrived at ${destinationLabel}`
  - `Continue on your phone`
  - `Where do you want to go?`
  - `No route to this place from here.`
  - `This gate screen's checkpoint has no routing anchor. Ask staff to set it up.`
- **Navigation stays 2D.** No panoramas, no 3D route features, nothing outside the campus boundary.
- **Copy rule:** the spec's GPS example "(±25 m)" is only an illustration. The rule wins: a fix worse than 15 m is never suggested.
- **The "inside a building" rule applies during active navigation only.** "Inside" means the current route step has `buildingId !== ''`. Before navigation, the Locate suggestion uses only the accuracy rule.
- **Gates after every task** (from the worktree root):
  - `bash .superpowers/sdd/2026-11-02-navi-terrain-2.5d-stairs-ramps/gates.sh` must show `regressed: 0`, and tsc at most the baseline 1122.
  - Then run `git checkout -- demo-output packages/compiler/src/__tests__/__snapshots__`.
- **Commits:** end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push without the owner's word.
- **Databases:** never write to Supabase. The browser lane uses only its Docker database.

## Review Focus

1. **GPS accuracy hovering around 15 m.** The mode must not flicker on every fix. Leaving GPS mode needs 5 s of bad or missing fixes (`GPS_DROP_GRACE_MS = 5000`). Test in Task 1.
2. **Next past the last step.** It ends at the destination and arrives; the step number never goes beyond the end. Test in Task 3.
3. **A QR scanned at an earlier point of the route.** Progress moves back to it and does not stay ahead. Test in Task 3.
4. **A new route while in step mode** (Recalculate, or a new destination). Step progress restarts at 0 for the new route. Test in Task 3.
5. **A gate screen whose checkpoint is unknown or has no routing anchor.** It shows its message and never shows a search box that can't route. The idle reset clears the chosen place and route. Test in Task 7.

---

### Task 1: Progress source policy

**Files:**
- Create: `src/lib/navigation-progress-source.ts`
- Test: `src/lib/__tests__/navigation-progress-source.test.ts`

**Interfaces:**
- Produces:
  - `GPS_GOOD_ACCURACY_M = 15`
  - `GPS_DROP_GRACE_MS = 5000`
  - `type ProgressMode = 'gps' | 'step'`
  - `interface GpsFix { accuracy: number | null; timestamp: number }`
  - `nextProgressMode(input: { previous: ProgressMode; fix: GpsFix | null; now: number; lastGoodFixAt: number | null; indoors: boolean }): ProgressMode`
  - `isGoodFix(fix: GpsFix | null): boolean`
  - `progressModeLabel(mode: ProgressMode): 'Following GPS' | 'Tap Next at each step'`
  - `shouldWarnOffRoute(input: { mode: ProgressMode; accuracy: number | null; distanceFromRouteM: number }): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
describe('progress source', () => {
  it('a fix of 15 m or better outdoors follows GPS', () => {
    expect(nextProgressMode({ previous: 'step', fix: { accuracy: 15, timestamp: 1 }, now: 1, lastGoodFixAt: 1, indoors: false })).toBe('gps')
  })
  it('a rough fix (16 m) never starts GPS mode', () => {
    expect(nextProgressMode({ previous: 'step', fix: { accuracy: 16, timestamp: 1 }, now: 1, lastGoodFixAt: null, indoors: false })).toBe('step')
  })
  it('indoors is always step by step, even with a good fix', () => {
    expect(nextProgressMode({ previous: 'gps', fix: { accuracy: 4, timestamp: 1 }, now: 1, lastGoodFixAt: 1, indoors: true })).toBe('step')
  })
  it('one bad fix within 5 s keeps GPS mode (no flicker); after 5 s it drops to step', () => {
    expect(nextProgressMode({ previous: 'gps', fix: { accuracy: 40, timestamp: 4000 }, now: 4000, lastGoodFixAt: 0, indoors: false })).toBe('gps')
    expect(nextProgressMode({ previous: 'gps', fix: { accuracy: 40, timestamp: 5001 }, now: 5001, lastGoodFixAt: 0, indoors: false })).toBe('step')
    expect(nextProgressMode({ previous: 'gps', fix: null, now: 5001, lastGoodFixAt: 0, indoors: false })).toBe('step')
  })
  it('labels', () => {
    expect(progressModeLabel('gps')).toBe('Following GPS')
    expect(progressModeLabel('step')).toBe('Tap Next at each step')
  })
  it('off-route warns only in GPS mode with a good fix beyond 30 m', () => {
    expect(shouldWarnOffRoute({ mode: 'gps', accuracy: 10, distanceFromRouteM: 31 })).toBe(true)
    expect(shouldWarnOffRoute({ mode: 'gps', accuracy: 10, distanceFromRouteM: 29 })).toBe(false)
    expect(shouldWarnOffRoute({ mode: 'gps', accuracy: 20, distanceFromRouteM: 80 })).toBe(false)
    expect(shouldWarnOffRoute({ mode: 'step', accuracy: 4, distanceFromRouteM: 80 })).toBe(false)
  })
})
```

- [ ] **Step 2: Run them and confirm they fail.**
  - Run: `npx vitest run src/lib/__tests__/navigation-progress-source.test.ts`
  - Expected: FAIL (the module is not found).

- [ ] **Step 3: Implement the module** in `src/lib/navigation-progress-source.ts`.
  - A good fix is `accuracy !== null && accuracy <= 15`.
  - Indoors always gives `'step'`.
  - A good fix gives `'gps'`.
  - Otherwise, from `'gps'`, stay in `'gps'` while `now - lastGoodFixAt <= 5000`; then `'step'`.
  - Otherwise `'step'`.
  - `shouldWarnOffRoute` uses `DEVIATION_THRESHOLD_M = 30` (export it from this module, and import it in Task 3 in place of the local constant).

- [ ] **Step 4: Run the tests and confirm they pass.** Expected: 6 passed.

- [ ] **Step 5: Commit** with the message `feat(navigation): choose GPS or step-by-step progress by accuracy and indoors`.

### Task 2: Route helpers for step progress and the remaining line

**Files:**
- Modify: `src/lib/nav-route-helpers.ts` (next to `computeRouteProgress`)
- Modify: `src/lib/navigation-experience.ts` (next to `getNavigationInstruction`)
- Test: `src/lib/__tests__/route-helpers.test.ts`, `src/lib/__tests__/navigation-experience.test.ts`

**Interfaces:**
- Produces:
  - `progressAtStep(route: NavRoute, index: number): RouteProgress`
    - `index` is clamped to `0..steps.length-1`.
    - `snappedPosition` is `steps[index].position`.
    - `remainingDistance` is the sum of step-to-step distances (haversine) from `index` to the end.
    - `currentSegment` follows the same rule as `computeRouteProgress`.
  - `remainingRoutePath(route: NavRoute, progress: RouteProgress | null): { path: string[]; leadIn: LatLng | null }`
    - Without progress: the whole `route.path` and `leadIn: null`.
    - Otherwise: `route.path.slice(progress.index)` and `leadIn = progress.snappedPosition`. The lead-in is `null` when the snapped position equals `steps[progress.index].position`.
  - `getUpcomingInstruction(route: NavRoute | null, stepIndex: number): NavigationInstructionView | null` returns the first non-empty instruction after `stepIndex`.

- [ ] **Step 1: Write the failing tests.**
  - `progressAtStep` on a 3-step route:
    - At index 1 the remaining distance is the 1→2 leg, and `snappedPosition` is step 1's position.
    - Index 9 is clamped to the last step, with a remaining distance of 0.
  - `remainingRoutePath`:
    - With null progress it returns the full path.
    - With progress index 1 snapped mid-leg it returns `path.slice(1)` and that `leadIn`.
  - `getUpcomingInstruction`: it skips empty-text instructions and returns `null` after the last instruction.

- [ ] **Step 2: Run them and confirm they fail.**
  - Run: `npx vitest run src/lib/__tests__/route-helpers.test.ts src/lib/__tests__/navigation-experience.test.ts`
  - Expected: FAIL (the functions are not exported).

- [ ] **Step 3: Implement the three functions** with the signatures above.

- [ ] **Step 4: Run the tests and confirm they pass.**

- [ ] **Step 5: Commit** with the message `feat(navigation): step progress, remaining route path and the upcoming instruction`.

### Task 3: NavigationSession owns progress (GPS, Next taps, QR re-anchor)

**Files:**
- Modify: `src/components/map/NavigationSession.tsx`
- Modify: `src/components/map/NavigationContext.tsx` (new fields)
- Modify: `src/hooks/useGeolocation.ts` (only if `timestamp` or `accuracy` are missing; both exist today)
- Test: `src/components/map/__tests__/NavigationSession.progress.integration.test.tsx` (new, same setup as `NavigationSession.location.integration.test.tsx`: mock `navigator.geolocation.watchPosition` with a chosen accuracy)

**Interfaces:**
- Consumes:
  - From Task 1: `nextProgressMode`, `isGoodFix`, `progressModeLabel`, `shouldWarnOffRoute`, `DEVIATION_THRESHOLD_M`
  - From Task 2: `progressAtStep`
- Produces these new `NavigationContextValue` fields (with defaults in `NavigationProvider`):
  - `progressMode: ProgressMode` (default `'step'`)
  - `progressLabel: string` (from Task 1's `progressModeLabel(mode)`)
  - `gpsAccuracy: number | null`
  - `gpsLostNotice: boolean`: true right after a drop from `'gps'` to `'step'` because the fix went bad or missing; cleared on the next `nextStep()`
  - `nextStep(): void`
  - `previousStep(): void`
  - `anchorAtNode(nodeId: string): boolean`: returns false when the node is not on the route
- Rules:
  - In `'step'` mode, `routeProgress` is `progressAtStep(route, manualIndex)`, and the context `location` is that progress's `snappedPosition`, so the camera follows the step.
  - In `'gps'` mode, progress comes from `computeRouteProgress`, as today.
  - On a drop from GPS to step mode, `manualIndex` starts at the last GPS index.
  - `indoors` means `route.steps[currentIndex].buildingId !== ''`.
  - `isOffRoute` comes from `shouldWarnOffRoute`.
  - Arrival also triggers when `manualIndex` reaches the last step.
  - A new route (a different `route.path.join('|')`) resets `manualIndex` to 0.

- [ ] **Step 1: Write the failing integration tests:**
  - accuracy 4 outdoors gives `progressMode` `'gps'`, label `Following GPS`
  - accuracy 40 gives `'step'`
  - `nextStep()` ×2 moves `routeProgress.index` 0→2 and the location to step 2
  - `nextStep()` on the last step sets `arrived` and keeps the index at the last step (Review Focus 2)
  - `anchorAtNode(step3.nodeId)` sets the index to 3, then `anchorAtNode(step1.nodeId)` sets it back to 1 (Review Focus 3)
  - `anchorAtNode('elsewhere')` returns false
  - re-rendering with a different route resets the index to 0 (Review Focus 4)
  - a GPS mode followed by fixes stopping for more than 5 s shows `gpsLostNotice` true and `progressMode` `'step'`
  - with accuracy 40 and a position 80 m off, `isOffRoute` is false

- [ ] **Step 2: Run them and confirm they fail.**
  - Run: `npx vitest run src/components/map/__tests__/NavigationSession.progress.integration.test.tsx`
  - Expected: FAIL (the new fields are undefined).

- [ ] **Step 3: Implement this in `NavigationSession`.**
  - Keep `lastGoodFixAt` and `mode` in refs and state.
  - Recompute the mode on every fix and on a 1 s interval while active, so a GPS dropout is noticed without new fixes.
  - Pass the new fields to `NavigationProvider`.

- [ ] **Step 4: Run the new tests, the existing NavigationSession tests and the context tests, and confirm they pass.**
  - Run: `npx vitest run src/components/map/__tests__/NavigationSession* src/components/map/__tests__/NavigationContext.test.ts`
  - Expected: all pass.
  - Existing tests that assume off-route with a good fix keep passing, because they use accuracy 4.

- [ ] **Step 5: Commit** with the message `feat(navigation): progress follows good GPS, Next taps or a QR scan`.

### Task 4: The walked part of the route disappears

**Files:**
- Modify: `src/components/map/RouteLine.tsx`: new optional prop `leadIn?: { lat: number; lng: number } | null`, prepended to the first drawn segment's coordinates
- Modify: `src/components/public/ExploreMap.tsx`: accept `route?: { path: string[]; cost: number; leadIn?: { lat: number; lng: number } | null } | null` and pass `leadIn` to `RouteLine`; the 3D ribbon `routePath` also starts with `leadIn`
- Modify: `src/app/(public)/map/navigate/page.tsx`: while the phase is `'active'`, pass `remainingRoutePath(route, routeProgress)` as the route
- Test: `src/components/map/__tests__/RouteLine.test.tsx`, `src/app/(public)/map/navigate/page.test.tsx`

**Interfaces:**
- Consumes: from Task 2, `remainingRoutePath`; from Task 3, `routeProgress` in the context.

- [ ] **Step 1: Write the failing tests.**
  - RouteLine: with `route.path = ['a','b','c']` and `leadIn = P`, the source's first coordinate is `[P.lng, P.lat]`.
  - Navigate page: in the active phase with `routeProgress.index = 2` (mocked context), the `ExploreMap` mock receives a `route.path` that starts at `route.path[2]`. In route preview it still receives the full path.

- [ ] **Step 2: Run them and confirm they fail.**
  - Run: `npx vitest run src/components/map/__tests__/RouteLine.test.tsx "src/app/(public)/map/navigate/page.test.tsx"`
  - Expected: FAIL.

- [ ] **Step 3: Implement.** `RouteLine`'s camera fit still uses the route key it was given, so trimming the route must not re-fit the camera on every step. Fit only when `route.path.at(-1)` changes, or on the first draw.

- [ ] **Step 4: Run the tests and confirm they pass.**

- [ ] **Step 5: Commit** with the message `feat(navigation): the walked part of the route disappears`.

### Task 5: Active guidance and preview UI

**Files:**
- Modify: `src/app/(public)/map/navigate/page.tsx` (`ActiveNavigationGuidance`, the preview panel, `handleScanResolved`)
- Test: `src/app/(public)/map/navigate/page.test.tsx`

**Interfaces:**
- Consumes:
  - From Task 3: `progressMode`, `progressLabel`, `gpsLostNotice`, `nextStep`, `previousStep`, `anchorAtNode`, `location`
  - From Task 2: `getUpcomingInstruction`
  - Already existing: `getNavigationRouteComposition(route).floorTransitions`, `resolveNearestNode`, `setFrom`
- Behaviour:
  - **Mode label:** a small label shows `progressLabel`.
  - **Step mode controls:** in `'step'` mode the instruction card shows two buttons, **Back** (aria-label `Back one step`) and **Next** (aria-label `Next step`). They call `previousStep()` and `nextStep()`. The existing "Previous instruction" / "Next instruction" preview buttons are shown only in `'gps'` mode.
  - **Next instruction preview:** under the current instruction, show `Then: <upcoming text>` when `getUpcomingInstruction` returns one.
  - **GPS lost:** when `gpsLostNotice` is true, show the status `GPS signal lost: tap Next at each step`.
  - **Off route:** replace today's off-route text with `You seem off the route`, plus buttons **Recalculate** and **I'm fine**.
    - **I'm fine** hides the alert until the visitor is back within 30 m.
    - **Recalculate** calls `resolveNearestNode(nodes, location, undefined, routeEdges)`, then `setFrom(node.id)`, and keeps navigation active on the new route. Set a `restartAfterReroute` ref that dispatches `start-navigation` once the new route reaches `route-preview`.
  - **Arrival:** the heading becomes `You've arrived at ${destinationLabel}`.
  - **Preview stairs:** the preview lists each floor change, for example `Stairs up to 3F` / `Lift down to 1F`. Use `floorTransitions`, and the floor labels the page already resolves for the destination floor.
  - **QR during navigation:** while active, `handleScanResolved(location, 'start')` calls `anchorAtNode(location.nodeId)`.
    - If that returns false (the QR is off the route), it reroutes from that node: `setFrom` plus the same restart as Recalculate.
    - Toast `Position updated: ${location.label}`.

- [ ] **Step 1: Write the failing page tests** (mocked context with `progressMode`):
  - `'step'` mode shows `Tap Next at each step`; clicking `Next step` calls `nextStep`
  - `'gps'` mode shows `Following GPS` and the preview buttons
  - `Then: …` is shown
  - the off-route alert has `Recalculate`, which calls `setFrom` with the nearest node; `I'm fine` hides it
  - arrival reads `You've arrived at Reading Room`
  - the preview lists `Stairs up to 2F` for a route with a stairs step from floor 0 to 1
  - a QR scanned while active calls `anchorAtNode` with its nodeId

- [ ] **Step 2: Run them and confirm they fail.**
  - Run: `npx vitest run "src/app/(public)/map/navigate/page.test.tsx"`
  - Expected: FAIL on the new tests.

- [ ] **Step 3: Implement** the behaviour above. Existing tests whose wording changed (off-route, arrival) are updated to the spec copy; record each one as a ledger ruling.

- [ ] **Step 4: Run the tests and confirm they pass.**

- [ ] **Step 5: Commit** with the message `feat(navigation): step-by-step controls, next instruction, recalculate, QR re-anchor`.

### Task 6: Safe starting points on phones

**Files:**
- Modify: `src/app/(public)/map/navigate/page.tsx` (`handleLocate`, the origin picker placeholder)
- Create: `src/components/map/LocationSuggestion.tsx` (confirm card)
- Test: `src/app/(public)/map/navigate/page.test.tsx`, `src/components/map/__tests__/LocationSuggestion.test.tsx`

**Interfaces:**
- Consumes: from Task 1, `GPS_GOOD_ACCURACY_M`.
- Produces: `LocationSuggestion({ label: string; accuracyM: number; onConfirm(): void; onReject(): void })`, which renders `You seem to be near ${label} (±${Math.round(accuracyM)} m). Is that right?` with buttons **Yes** and **No**.
- Behaviour:
  - `handleLocate` no longer sets the origin directly.
  - With `coords.accuracy > 15` it shows the toast `Location too rough (±${m} m): scan a QR or search where you are`.
  - Otherwise it shows `LocationSuggestion` for the nearest routable node. **Yes** calls `setFrom`; **No** closes it.
  - The origin picker placeholder becomes `Search where you are (room, building, place)`.

- [ ] **Step 1: Write the failing tests:**
  - with accuracy 9, `getCurrentPosition` shows the suggestion and does not call `setFrom`; **Yes** calls `setFrom`
  - with accuracy 25, it shows the "too rough" toast and no suggestion
  - the placeholder text

- [ ] **Step 2: Run them and confirm they fail.**
  - Run: `npx vitest run "src/app/(public)/map/navigate/page.test.tsx" src/components/map/__tests__/LocationSuggestion.test.tsx`

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run the tests and confirm they pass.** The existing test that expected Locate to set the origin directly is updated (ledger ruling).

- [ ] **Step 5: Commit** with the message `feat(navigation): GPS start is a suggestion to confirm; rough fixes are refused`.

### Task 7: Gate screen

**Files:**
- Create: `src/app/(public)/kiosk/[checkpointId]/page.tsx` (outside `map/`, so there is no visitor navigation chrome)
- Create: `src/components/kiosk/GateScreen.tsx`
- Create: `src/hooks/useIdleReset.ts`
- Test: `src/components/kiosk/__tests__/GateScreen.test.tsx`, `src/hooks/__tests__/useIdleReset.test.ts`

**Interfaces:**
- Consumes:
  - `discoverPublicQrCheckpoint(checkpointId)` → `{ status: 'resolved'; campusId; checkpoint } | …` (`src/hooks/useQrNavigateDeepLink.ts`)
  - `usePublicStore.fetchCampusData(campusId)` and `campus`
  - `resolveQrScanPayload(\`navi.app/q/${checkpointId}\`, campus, campusId)` (`src/lib/qr-location.ts`), which gives the start `nodeId`
  - `findRoute(nodes, edges, from, to)` (`src/store/public-store.ts`)
  - `ExploreMap`, `estimatePresentationEtaMinutes`, `formatNavigationDistance`, `getNavigationRouteComposition`
- Produces:
  - `GATE_IDLE_MS = 60_000`
  - `useIdleReset(ms: number, onIdle: () => void): void`: resets on `pointerdown`, `keydown` and `touchstart` on `window`
  - `gateHandoffUrl(origin: string, checkpointId: string, toNodeId: string): string`, which returns `${origin}/map/navigate?qr=${encodeURIComponent(checkpointId)}&to=${encodeURIComponent(toNodeId)}`. That URL is the existing `kind: 'qr'` deep link, so the phone opens in route preview, ready to Start.
- Behaviour:
  - The heading is `Where do you want to go?`.
  - A large search input filters `campus.searchEntries` that have a `nodeId`, by case-insensitive label match. It shows the top 8 as large buttons.
  - Choosing one shows the route on `ExploreMap`, the distance, the time, and the floor changes (as Task 5's preview).
  - It also shows **Continue on your phone** with a QR code: `qrcode` `toDataURL(gateHandoffUrl(window.location.origin, checkpointId, nodeId))`, rendered as `<img alt="Continue on your phone">`.
  - With no route: `No route to this place from here.`
  - With an unknown checkpoint or no `nodeId`: `This gate screen's checkpoint has no routing anchor. Ask staff to set it up.`, and no search box (Review Focus 5).
  - After 60 s idle, it clears the query, the chosen place and the route (Review Focus 5).

- [ ] **Step 1: Write the failing tests:**
  - with a resolved checkpoint (mocked discovery and store), typing `read` lists `Reading Room`, and picking it renders the map mock with a route that starts at the checkpoint node
  - `gateHandoffUrl('https://x', 'qr-1', 'n 2')` returns `'https://x/map/navigate?qr=qr-1&to=n%202'`
  - with fake timers, 60 s idle clears the choice; activity at 59 s postpones it
  - a checkpoint without `nodeId` shows the anchor message and no search input
  - no route shows the no-route message

- [ ] **Step 2: Run them and confirm they fail.**
  - Run: `npx vitest run src/components/kiosk src/hooks/__tests__/useIdleReset.test.ts`

- [ ] **Step 3: Implement the page.** It reads `params.checkpointId` (decoded with `decodeURIComponent`) and renders `GateScreen`. Use large touch targets: buttons at least 56 px tall, text-lg.

- [ ] **Step 4: Run the tests and confirm they pass.**

- [ ] **Step 5: Commit** with the message `feat(navigation): gate screen with a fixed start, search, route and phone hand-off`.

### Task 8: Browser checks

**Files:**
- Create: `e2e/save-v2/navigation.spec.ts` (picked up by `e2e/save-v2/playwright.save-v2.config.ts`; check its `testMatch`, and add the file there if needed)

**Interfaces:**
- Consumes:
  - The lane helpers in `e2e/save-v2/support.ts`: `openAdmin`, `installEditorHelpers`, `seededCampus`, `openMap`, `saveNow`
  - The publish pattern from `terrain.spec.ts` T15: `page.request.post('/api/studio/v2/publish', …)`
  - The publishable fixture from `parity.spec.ts` (`publishableDocument`), with a QR checkpoint whose routing anchor is a ground-floor route node. The fixture's existing checkpoints can be used if one has an anchor; otherwise add one with the command P8 uses.

- [ ] **Step 1: Write the browser tests.**
  - **N1, gate screen:**
    1. Publish the campus.
    2. Open `/kiosk/<checkpointId>` and search an upper-floor room.
    3. The route panel shows the distance and `Stairs up to …`.
    4. The `Continue on your phone` image is visible, and its source URL (from `gateHandoffUrl`) contains `qr=<checkpointId>&to=`.
    5. After a 60 s idle (use `page.clock` if available, else a 61 s wait), the screen is back to `Where do you want to go?`.
  - **N2, phone:**
    1. Open the handoff URL from N1 and click `Start navigation`.
    2. With no GPS in the headless browser, the label reads `Tap Next at each step`.
    3. Press `Next step` until the stairs. The displayed floor switches to the upper floor (the floor control or plan shows it).
    4. Continue to the end: `You've arrived at <room>`.

- [ ] **Step 2: Run them.**
  - Run: `node e2e/save-v2/run.mjs -g "N1|N2"`
  - Expected: 2 passed.
  - Then run the full lane in the background. Expected: all pass, with T14 skipped as before.

- [ ] **Step 3: Gates, then commit** with the message `test(navigation): gate screen and step-by-step phone navigation in the browser`.

- [ ] **Step 4: Deploy the preview.**
  - Run: `bash scripts/save-v2/deploy-preview.sh`
  - The owner tests it. Push only on the owner's word.
