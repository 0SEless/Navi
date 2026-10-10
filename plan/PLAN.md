# PLAN: Floor Editor Door & Interior Persistence Across Reload and Tab Close

## Phase P3A Tasks

### P3A-T1: Add isolated test-campus resolver and explicit opt-in
- **Description**: Add a development-only resolver that checks the dedicated localStorage opt-in, exact test campus ID, and exact development project URL; construct a valid `CampusMap` separately from the normal map store.
- **Files to touch**: `src/lib/studio/test-campus-catalog.ts`, its focused unit test.
- **Acceptance check**: Disabled-by-default, environment/project/ID-gated, and production-disabled tests pass.
- **Error prevention**: Preventing test-only catalog state from entering synchronized campus catalog state or any shared development catalog write.

### P3A-T2: Resolve the test map only in the editor route
- **Description**: Keep server-returned maps as the normal source and let the editor resolve the one test ID through the isolated adapter. Show a development-only explicit opt-in control only for that exact ID and project.
- **Files to touch**: `src/app/(admin)/studio/[id]/edit/page.tsx`, the opt-in component, focused editor resolver tests.
- **Acceptance check**: A non-empty server refresh preserves all existing server maps while the test editor route resolves only when opted in; no test map is passed to catalog sync or POST.
- **Error prevention**: Preventing server refresh semantics and current editor authorization from changing; no auth bypass is introduced.

### P3A-T3: Verify and resume isolated browser round trips
- **Description**: Run focused tests and a local production-build exposure check; only if all isolation gates pass, use a fresh isolated browser profile for map and floor editor save/reload checks on the existing dev test campus.
- **Files to touch**: Verification evidence only.
- **Acceptance check**: Record actual `/api/graph` acknowledgments, cold reloads, floor isolation, and test catalog read-only behavior; otherwise report UI checks as not tested.
- **Error prevention**: Preventing false UI-pass claims and ensuring no production or non-test campus writes.

## Tasks

### T1: Harden Graph Store Network Transport & Commit Store Dependencies
- **Description**: Add `keepalive: true` to `fetch('/api/graph', ...)` in `performSyncToSupabase` (`src/store/graph-store.ts`). This allows unload/exit requests to finish even when the user closes the tab or window immediately. Confirm `src/store/graph-store.ts` has `setAuthoredDocument` and full serialization so Vercel builds cleanly without runtime TypeErrors.
- **Files to touch**: `src/store/graph-store.ts`
- **Acceptance check**: `fetch('/api/graph')` includes `keepalive: true`. Vitest graph store tests pass.
- **Error prevention**: "Preventing: In-flight network aborts on tab unload dropping un-synced edits; preventing missing export runtime TypeError on production deployment."

### T2: Attribute Authored Mutations on `document.changed` in `FloorEditorBridge`
- **Description**: In `src/app/(admin)/studio/[id]/edit/building/[buildingId]/floor/[floor]/page.tsx`, update the `document.changed` event listener in `FloorEditorBridge` to call `useGraphStore.getState().recordAuthoredMutation('floor', buildingId, floor)`. This ensures that any autosave or exit flush triggered after an edit has its mutation attributed before the P0.11 guard evaluates the candidate.
- **Files to touch**: `src/app/(admin)/studio/[id]/edit/building/[buildingId]/floor/[floor]/page.tsx`
- **Acceptance check**: `document.changed` listener attributes floor mutation intent.
- **Error prevention**: "Preventing: P0.11 save guard blocking un-attributed floor mutations during autosave; preventing empty pending intent array from dropping autosave."

### T3: Add Explicit Save Button and Keyboard Shortcut in `FloorEditor`
- **Description**: In `src/components/floor-editor/FloorEditor.tsx`, add an explicit Save button in the header toolbar next to the status badge, and attach a `Ctrl+S` / `Cmd+S` keyboard shortcut. When clicked/triggered, it invokes `workflow.save('manual')`.
- **Files to touch**: `src/components/floor-editor/FloorEditor.tsx`
- **Acceptance check**: Save button renders with active status (`Save`, `Saving...`, `Saved`), and `Ctrl+S` triggers `workflow.save('manual')`.
- **Error prevention**: "Preventing: User confusion over whether changes are saved before closing the tab; preventing unhandled keyboard events."

### T4: Verification Test for Door Placement and Server Round-Trip
- **Description**: Add / run an automated test that places a door in `floor.doors`, synchronizes via `GraphAdapter`, serializes snapshot with authored document, and validates that `authored_document` retains the door and the P0.11 guard approves the save.
- **Files to touch**: `packages/editor/src/__tests__/floor-door-persistence-roundtrip.test.ts`
- **Acceptance check**: Vitest test passes 100%.
- **Error prevention**: "Preventing: Regressions in door serialization or coordinate transformations."

### T5: E2E and End-to-End Persistence Verification
- **Description**: Run test battery to verify that door persistence, floor creation, and graph store methods operate correctly.
- **Files to touch**: Test logs and verification scripts.
- **Acceptance check**: All targeted vitest suites pass.
- **Error prevention**: "Preventing: False positive verification; verifying with concrete output."
# Phase P3B — Plan

## T1 — Trace the 401 and confirm the browser/session state
- **Description:** Trace middleware, mock login, request cookie forwarding, API auth guard, and `/api/graph` response. Compare the observed cookie *names* and response branch without reading cookie values.
- **Files to touch:** `spec/SPEC.md`, `plan/PLAN.md`, `todo.md`, `progress/PROGRESS.md`, `errors/ERRORS.md` (no application source unless T1 proves a bug).
- **Acceptance:** Root cause is tied to evidence; if the browser evidence is unavailable, record the precise missing fact and do not claim a confirmed cause.
- **Error prevention:** Stale P0.11/auth assumptions can misattribute a rejected write; preserve pending local edits and do not treat a 401 as a persistence write.

## T2 — Add a regression for the confirmed auth condition
- **Description:** Reproduce the exact development-only condition with a focused test while preserving real Supabase-admin and production-denial tests.
- **Files to touch:** `src/lib/api-guard.ts`, `src/lib/__tests__/mutation-auth.test.ts` only if a targeted repair is established.
- **Acceptance:** Focused test fails before and passes after repair; production mock-denial and verified non-admin behavior remain passing.
- **Error prevention:** Do not broaden fallback to verified non-admin users or production; do not weaken the admin gate.

## T3 — Apply minimal auth repair
- **Description:** Correct only the confirmed mock/session forwarding mismatch; no anonymous access or auth middleware bypass.
- **Files to touch:** `src/lib/api-guard.ts` and its focused test only, if required.
- **Acceptance:** Focused regressions pass and `git diff --check` passes.
- **Error prevention:** Preserve P0.11 mutation intent, development project isolation, and production auth behavior.

## T4 — Verify editor round trips or stop at authorization boundary
- **Description:** With explicit development-only process configuration and a legitimate session, verify Map and Floor UI saves against the disposable campus, then cold-read authoritative state; if authorization is unavailable, stop before writes.
- **Files to touch:** `progress/PROGRESS.md`, `errors/ERRORS.md` only.
- **Acceptance:** UI POST acknowledgement, revision/fingerprint, cold readback, floor isolation, and unchanged existing campuses are evidenced; otherwise report NOT TESTED/BLOCKED without claiming persistence.
- **Error prevention:** A failed save stays pending; never clear recovery or report Saved absent server acknowledgement.

# Phase P4 — Floor Editor Room Persistence Repair

## P4-T1 — Preserve state and trace the full room-save data flow
- **Description:** Record the original pending edit and server baseline without changing browser state. Trace room input, event handler, editor state, authored document, GraphAdapter, serialization, `/api/graph` request, response, authoritative readback, and Saved status. Identify the first boundary that drops or rejects the new name.
- **Files to touch:** `spec/SPEC.md`, `plan/PLAN.md`, `todo.md`, `progress/PROGRESS.md`, `errors/ERRORS.md`; source files read-only during T1.
- **Acceptance:** A specific first-loss boundary is evidenced with room/floor IDs and payload or state assertions; if not established, stop before source edits.
- **Error prevention:** Preventing false Saved status, stale authored-document overwrite, cross-floor mutation, and loss of the pending browser recovery edit.

## P4-T2 — Add regression tests for the confirmed boundary
- **Description:** Reproduce the Floor Editor context being created inside a React state initializer under Strict Mode. Prove construction does not start an abandoned context's autosave and that only the mounted context initializes.
- **Files to touch:** `src/app/(admin)/studio/[id]/edit/building/[buildingId]/floor/[floor]/page.tsx`, `src/app/(admin)/studio/[id]/edit/building/[buildingId]/floor/[floor]/page.test.tsx`.
- **Acceptance:** The route-level Strict Mode regression fails before the lifecycle fix and passes after it; Map Editor persistence and authored-intent protections remain unchanged.
- **Error prevention:** Preventing a test that only asserts transport success or mocks away the real serialization/acknowledgement contract.

## P4-T3 — Apply the minimal root-cause repair
- **Description:** Defer editor service initialization until the mounted Floor Editor session's effect. Preserve revision, fingerprint, idempotency, auth, and recovery contracts.
- **Files to touch:** `src/app/(admin)/studio/[id]/edit/building/[buildingId]/floor/[floor]/page.tsx`.
- **Acceptance:** Focused regression passes and no unrelated source or P3A/P3B work is changed.
- **Error prevention:** Preventing speculative refactors, weakened auth, synthesized mutation intent, and false success indicators.

## P4-T4 — Verify focused regressions and local diff
- **Description:** Run focused tests plus relevant existing graph-store/auth/map persistence suites; inspect `git diff --check` and verify no pre-existing P3A/P3B work was lost.
- **Files to touch:** Verification only; append evidence to `progress/PROGRESS.md` and `errors/ERRORS.md` if needed.
- **Acceptance:** Test output is clean for applicable suites; any unrelated baseline failures are named explicitly.
- **Error prevention:** Preventing verification claims unsupported by output and preventing accidental cleanup of inherited dirty state.

## P4-T5 — Verify through a fresh isolated dev browser session
- **Description:** Only after P4-T1 through T4 pass, start the candidate with the existing development-only config and use a fresh isolated origin/profile to save a uniquely named Floor A room through actual controls. Read back the authoritative document, cold reload without stale recovery, and confirm Floor B remains unchanged. Keep the P3B origin untouched.
- **Files to touch:** Verification evidence only.
- **Acceptance:** Real UI request and acknowledgement match authoritative room/floor/room IDs, room name, revision and fingerprint; cold reload agrees; Floor B is unchanged; no other campus changes are observed.
- **Error prevention:** Preventing old local recovery from masking server state, writes outside the disposable campus, and mistaken API-only claims of UI success.

# Phase P5 — Preserve Verified Persistence Repairs

## P5-T1 — Inventory and classify all dirty files
- **Description:** Enumerate modified and untracked files, inspect complete diffs, and classify production-safe repairs, regression tests, dev-only infrastructure, temporary workarounds, documentation, or unrelated changes.
- **Files to touch:** `spec/SPEC.md`, `plan/PLAN.md`, `todo.md`, `progress/PROGRESS.md`, `errors/ERRORS.md`; read-only source inspection.
- **Acceptance:** Every dirty path is accounted for; proposed commit allowlist is explicit.
- **Error prevention:** Preventing accidental inclusion of the test-campus resolver/opt-in or loss of inherited dirty artifacts.

## P5-T2 — Review production auth and lifecycle boundaries
- **Description:** Verify mock auth fallback is explicitly enabled and rejected in production; verify verified non-admin Supabase identities cannot fall back; verify only the retained Floor Editor context initializes services.
- **Files to touch:** Proposed auth guard/test and Floor Editor route/test only.
- **Acceptance:** Source and tests establish the security/lifecycle conditions; stop if scope is uncertain.
- **Error prevention:** Preventing an unsigned mock session from reaching production mutation authorization and preventing stale autosave writers.

## P5-T3 — Run focused regressions and hygiene checks
- **Description:** Run auth, catalog isolation, graph route, and Floor Editor lifecycle tests; lint the proposed commit files; run typecheck where practical; verify whitespace and secret-file tracking status.
- **Files to touch:** Verification only; record outputs in progress/errors.
- **Acceptance:** Test and diff checks pass; baseline lint/type failures are identified by path and compared with candidate-base content.
- **Error prevention:** Preventing transport-only persistence claims, lost local artifacts, and hidden unrelated failures.

## P5-T4 — Stage and commit the reviewed allowlist
- **Description:** Commit only `api-guard.ts`, its auth regression tests, the Floor Editor route repair, and its Strict Mode test on the existing candidate branch.
- **Files to touch:** The four allowlisted source/test files; no push or deployment.
- **Acceptance:** Staged paths exactly match allowlist, cached diff passes checks, local commit is verified, excluded dirty artifacts remain preserved.
- **Error prevention:** Preventing temporary browser/catalog infrastructure, documentation history, or unrelated changes from entering the candidate commit.

# Phase P6D — Panorama Management R2 Integration

## P6D-T1 — Trace canonical scene, upload, and render contracts
- **Description:** Confirm development-only target and disposable-campus baseline; trace panorama scene identity/location, upload sign/complete API, asset registry, authoritative document save, and Pannellum consumers. Keep the legacy NavNode/data-URL route separate from canonical Panorama scenes.
- **Files to touch:** `spec/SPEC.md`, `plan/PLAN.md`, `todo.md`, `errors/ERRORS.md`; source inspection only.
- **Acceptance:** Every write and render path is mapped to an existing contract; no Production or other-campus target is possible.
- **Error prevention:** Preventing accidental conversion of a NavNode into a Panorama scene or persisting an ephemeral URL/data URL.

## P6D-T2 — Make the upload API issue immutable asset keys
- **Description:** Update the existing sign action to generate a server-side unique asset ID and record a fresh `signed` registry row without replacing an existing uploaded asset; retain current auth, protected-campus, type, and size gates.
- **Files to touch:** `src/app/api/panorama-upload/route.ts`, `src/app/api/panorama-upload/__tests__/route.test.ts`.
- **Acceptance:** Route test proves unique immutable key generation, exact campus/panorama association, and no completion state before verified R2 object.
- **Error prevention:** Preventing failed replacement uploads from making a previously referenced image unresolvable.

## P6D-T3 — Add the editor's verified direct-upload flow
- **Description:** Add a small client helper and canonical Panorama properties control for validation, sign, direct PUT, completion verification, and only then updating `Panorama.imageAssetId` through the existing editor dispatcher.
- **Files to touch:** `src/lib/panorama-upload-client.ts`, `src/lib/__tests__/panorama-upload-client.test.ts`, `packages/editor/src/panels/properties/panorama-props.tsx`, focused properties test if needed.
- **Acceptance:** Tests cover accepted/rejected file validation, API/PUT/complete ordering, and failures leaving the canonical scene reference unchanged.
- **Error prevention:** Preventing false ready state, browser credential exposure, and writes outside the configured development bucket.

## P6D-T4 — Resolve durable keys in Pannellum and remove data-URL authoring
- **Description:** Resolve canonical R2 keys immediately before Pannellum initialization and remove the legacy Panorama Management data-URL upload control without changing authored graph records.
- **Files to touch:** `src/components/tour/TourViewer.tsx`, `src/components/tour/TourViewer.test.tsx`, `src/app/(admin)/panoramas/page.tsx`.
- **Acceptance:** Tests prove keys are resolved for Studio/public tour rendering, legacy URLs remain compatible, resolver failure is visible, and no FileReader/data URL is written.
- **Error prevention:** Preventing expiring signed URLs from becoming durable fields and retaining unrelated legacy scenes without migration.

## P6D-T5 — Verify regressions and disposable-campus browser round trip
- **Description:** Run focused route/client/viewer and Map/Floor persistence regressions, lint the touched source, then use only development Supabase/R2 and the designated disposable campus for actual UI upload, authoritative readback, cold reload, and render checks.
- **Files to touch:** Verification only; append results to `progress/PROGRESS.md` and any new error to `errors/ERRORS.md`.
- **Acceptance:** Report exact test output and UI/network evidence; stop on auth, isolation, or data mismatch; never change other campuses or delete assets.
- **Error prevention:** Preventing unverified browser CORS assumptions, unauthorized saves, and test writes to any non-disposable campus.

## Read-only development Studio authorization diagnosis
- **T1 — Confirm local project and trace admin authorization.** Inspect the running app environment, `/studio` middleware, shared admin authorization helper, API guard, and mock-auth gates. Acceptance: identify the redirect branch without changing source or environment.
- **T2 — Verify development identity and role evidence.** Use read-only development-only auth metadata and aggregate queries. Acceptance: report account recognition, accepted role claim, and session validity without exposing identifiers or credentials.
- **T3 — Record diagnosis and next safe action.** Update progress/error logs only. Acceptance: no role, account, database, or Production changes; state whether Studio UI testing can resume.
- **Error prevention:** Preventing mock-auth bypass and confusing `user_metadata` with the server-accepted `app_metadata.role` or local development allowlist.

## Phase P6E — Restore Development Admin Authorization
- **T1 — Verify target and active identity.** Confirm the exact development project and obtain the current signed-in Development Auth user ID. Acceptance: identity is linked to the intended existing account without relying on mock auth or stale session evidence.
- **T2 — Verify approval and make minimal claim update.** Change only the intended user's `app_metadata.role` if the verified operator authorization and user identity both pass the gate. Acceptance: unrelated metadata remains unchanged; no other user or project is touched.
- **T3 — Refresh session and verify access controls.** Have the user sign in again; verify Studio, an authorized Development API request, an unauthenticated rejection, and ordinary-user denial. Acceptance: all checks pass without Production access.
- **Error prevention:** Preventing misapplied privilege grants by stopping whenever the target user ID or approval is uncertain.

## NAVI Phase P6D — Panorama Persistence Verification (2026-10-10)
- T1 Verify candidate runtime, Development Supabase/R2, user authorization, and disposable-camp baseline. Acceptance: exact candidate and targets confirmed; baseline revision/fingerprints recorded.
- T2 Upload a small panorama through the actual Studio browser. Acceptance: browser PUT, R2 object, and uploaded asset registration verified.
- T3 Save a scene, then cold-reload and verify authoritative reference and viewer rendering. Acceptance: server readback matches and Pannellum renders.
- T4 Verify no unrelated campus changes and run relevant focused tests. Acceptance: only disposable-camp test records changed; no Production access.
- Before T2: relevant errors include stale/missing auth state, wrong-checkout server execution, and incomplete Graphify lookup. Preventing: stop on any target mismatch or unresolved route/auth failure; never test with mock login.

## NAVI Phase P6F — Restore local Next.js routing (2026-10-10)
- T1 Identify port listener, process ancestry, candidate worktree, route responses, and startup logs. Acceptance: only the verified candidate server owns the target port.
- T2 Inspect route source, manifest, config, middleware, and generated cache. Acceptance: root cause is supported by timestamps/manifest and process evidence.
- T3 If stale candidate cache is confirmed, stop only that server, verify exact non-shared `.next` path, clear it, and restart the candidate. Acceptance: source and user recovery state remain unchanged.
- T4 Verify public routes, auth redirect, signed-in Studio, Panorama Management, Development Supabase, and Development R2. Acceptance: routing gate passes; do not begin uploads.
- Before T3: relevant errors are the previous all-route 404 and wrong-worktree server. Preventing: match PID/command line to candidate; remove only candidate `.next` after confirming no listener or competing Next process.

## NAVI Phase P6H — Dataset and Panorama UI regression audit
- T1 — Compare current pages, working-tree diffs, repository history, shared shell/style changes, and available screenshots. Acceptance: distinguish actual recent changes from longstanding layout and identify candidate historical versions.
- T2 — Establish the previously approved visual baseline. Acceptance: locate a reliable approval reference; otherwise mark blocked and make no UI source changes.
- T3 — If baseline is proven, restore compatible visual structure while preserving R2/Supabase panorama persistence, then run focused UI checks and lint. Acceptance: before/after evidence and persistence paths remain intact.
- Error prevention: Do not restore historical data-URL upload behavior or claim an unverified historical version was approved.

# Phase P6I — Controlled UI + persistence reconciliation

## T1 — Inventory and compatibility gate [x]
- **Description:** Capture both worktree identities, dirty status, hashes of source inputs, and the exact integration allowlist. Confirm the main `navi-next` worktree remains read-only. Compare Dataset document readers and canonical Panorama contracts against the candidate.
- **Files to touch:** Candidate `spec/SPEC.md`, `plan/PLAN.md`, `todo.md`, `progress/PROGRESS.md`, `errors/ERRORS.md`; read-only source inspection.
- **Acceptance:** Exact path allowlist and compatibility findings are recorded before source edits; candidate P5/P6 changes are preserved; stop on any unresolved persistence ownership mismatch.
- **Error prevention:** Preventing wrong-worktree edits, hydration mismatch, and accidentally storing resolved/signed image URLs.

## T2 — Restore campus-first Dataset routes and keep legacy tools [x]
- **Description:** Port the campus selector and detail workspace from the UI source; add `/dataset/[id]`; preserve the current legacy component at `/dataset/tools`; add a visible selector link to the legacy route; use the candidate’s graph store and document readers. Port only the owner-bound signed building-cover flow that the Images tab imports, with its focused tests.
- **Files to touch:** `src/app/(admin)/dataset/page.tsx`; `src/app/(admin)/dataset/[id]/page.tsx`; `src/app/(admin)/dataset/tools/page.tsx`; `src/components/pages/DatasetManagement.tsx`; `src/components/pages/DatasetTools.tsx`; `src/components/pages/DatasetWorkspace.tsx`; `src/components/pages/dataset/{DatasetExplorer,DatasetInformationView,DatasetImagesView,DatasetStructuredView,Dataset360View,dataset-selectors,resolve-effective-document,types}`; `src/components/shared/BuildingCoverImage.tsx`; `src/services/building-cover-upload.ts`; `src/app/api/building-cover-upload/{route.ts,__tests__/route.test.ts}`; `src/app/api/building-cover/{route.ts,__tests__/route.test.ts}`; `src/lib/{building-cover-auth,building-cover-r2,building-cover-repository,building-cover-upload-token}.ts`; `src/lib/__tests__/{building-cover-auth,building-cover-r2,building-cover-repository,building-cover-upload-token}.test.ts`; `src/services/building-cover-upload.test.ts`; `src/components/pages/__tests__/{dataset-fixture,dataset-legacy-fixture,dataset-360,dataset-effective-document,dataset-images,dataset-images-upload,dataset-management,dataset-selection-stats,dataset-ux,dataset-workspace}`.
- **Acceptance:** Selector/detail/tools routes compile and render; candidate store remains authoritative; 360 reads canonical scene summaries; cover uploads remain owner-authorized, immutable-key R2 uploads with server verification before graph reference save.
- **Error prevention:** Preventing unacknowledged cover references, cross-campus cover ownership, local cache hydration mismatch, and dropping legacy tooling.

## T3 — Restore compatible Panorama scene-management presentation [x]
- **Description:** Port the read-only scene-management selectors and workspace; adapt its viewer call sites to the candidate `TourViewer` props, which resolves canonical R2 keys itself; add an explicit Studio navigation affordance. Do not add writes or change the candidate upload, asset registration, signed resolver, or renderer implementation.
- **Files to touch:** `src/app/(admin)/panoramas/page.tsx`; `src/app/(admin)/panoramas/page.test.tsx`; `src/features/panorama-management/{selectors.ts,selectors.test.ts,state.ts,state.test.ts,tour-selectors.ts,tour-selectors.test.ts,non-dependency.test.ts}`; `src/features/panorama-management/components/{HotspotDialog.tsx,SceneExplorer.tsx,SceneInspector.tsx,VirtualTourWorkspace.module.css,VirtualTourWorkspace.test.tsx,VirtualTourWorkspace.tsx}`; existing candidate `src/components/tour/TourViewer.tsx` and `src/lib/panorama-image-resolver.ts` are read-only dependencies.
- **Acceptance:** Scene identity is `Panorama.id`; durable image reference is `Panorama.imageAssetId`; the existing candidate resolver is used at render time; management does not persist hotspot drafts or scene changes; scene authoring links into Studio.
- **Error prevention:** Preventing legacy graph-node writes, data-URL storage, signed-URL persistence, and compile-time prop incompatibility.

## T4 — Route/sidebar, focused verification, visual evidence, and log [x]
- **Description:** Make top-level admin navigation active for nested routes; run the Dataset, cover, Panorama, Map/Floor persistence, and responsive checks; compare route structure with the supplied October 3 design description and capture candidate screenshots where an existing authorized browser session permits. Record limits if the original screenshot artifact is unavailable.
- **Files to touch:** `src/app/(admin)/layout.tsx`; focused tests only from T2/T3; candidate workflow docs. Do not edit `navi-next`.
- **Acceptance:** `git diff --check` passes; focused tests and relevant lint/type checks are reported accurately; candidate-only source changes are enumerated; main worktree status and source hashes match baseline; no Supabase/R2 operation occurred.
- **Error prevention:** Preventing wrong-server visual evidence, unverified E2E claims, and accidental loss of dirty P5/P6 files.

### T2 inventory addendum
- The campus selector/workspace also depends on the pure read-only `src/components/studio/studio-display-stats.ts`; this file is added to the T2 allowlist.
- The UI-source legacy test referenced a 202 KB captured campus graph fixture. That data fixture is intentionally excluded; the candidate test helper will use a minimal synthetic graph with equivalent projection coverage.
- The Studio route has no query-driven `360-tour` mode. “Edit Scenes in Studio” therefore uses the existing `/studio/<campusId>/edit` route; mode selection remains in the Studio UI.
- Browser access was available on the candidate local server. Accessible route snapshots verified `/dataset`, `/dataset/<campusId>`, `/dataset/tools`, and `/panoramas`; no pixel screenshot was returned by the browser bridge, and the October 3 screenshot was not present as a local reference image.
