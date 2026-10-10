# Canonical Recovery Plan — 2026-10-10

## T4 — Public Navigate recovery

- **T4.1:** Port the persistent shell-owned MapLibre runtime and route-scene publisher from the reviewed `912e767` / `e5edd12` public recovery lineage. Preserve the current public-campus API and persistence-aware public store. Make route-owned controls reachable above the shared canvas so the persistence test can complete real tab transitions.
  - Files: `src/components/map/NavigationMap.tsx`, new `PersistentCampusScene.tsx`, new `PublicCampusRuntimeStatus.tsx`, `src/components/public/AdaptiveShell.tsx`, `src/components/public/ExploreMap.tsx`, `src/components/map/NavigationRenderModel.ts`, `src/components/map/BuildingSheet.tsx`, `src/app/(public)/map/navigate/page.tsx`, matching focused tests.
  - Acceptance: one map host/canvas across Explore → Navigate → Explore; the existing UI regression test fails first and passes after implementation.
  - Preventing: stale route context, duplicate map instances, and MapLibre style-readiness races.
- **T4.2:** Restore public building, authored-road, POI, floor-plan, and route layers against the candidate's existing `CampusBundle` data contract.
  - Files: `NavigationRenderModel.ts`, `RouteLine.tsx`, `BuildingLayer.tsx`, `POILayer.tsx`, new `AuthoredRoadLayer.tsx`, `PublicFloorPlanLayer.tsx`, `authoredTraceGeoJSON.ts`, `mapStyleReadiness.ts`, `lib/public-floor-plan.ts`, and additive public types.
  - Acceptance: focused renderer/layer tests pass; candidate floorGeometry/traces remain consumed; absent plan assets do not break map rendering.
  - Preventing: loss of floor metadata, invalid MapLibre style updates, or storing data URLs/signed URLs.
- **T4.3:** Restore building search identity and map-overlay hit testing with focused tests.
  - Files: `src/store/public-store.ts`, focused store/UI tests, and pointer-event class fixes in the Explore/Navigate controls.
  - Acceptance: search opens the canonical building deep link; map clicks and controls work; existing campus API and auth contracts are unchanged.
  - Preventing: synthetic building results without `buildingId` and map overlays intercepting canvas input.
- **T4.4:** Run focused unit and browser regression suites; compare against the captured baseline; commit only the verified public-runtime batch.
  - Acceptance: E2E and focused tests pass; baseline Navigate simulator failure is reported separately; no database/R2 access occurs.

## T5 — Dataset and Panorama reconciliation

- **T5.1:** Review Dataset routes, workspace, and legacy tools against the campus-first contract; review Panorama Management and Studio against canonical scene IDs, `imageAssetId`, signed resolution, and Pannellum behavior.
  - Files: `src/app/(admin)/dataset/page.tsx`, `src/app/(admin)/dataset/[id]/page.tsx`, `src/app/(admin)/dataset/tools/page.tsx`, `src/components/pages/DatasetManagement.tsx`, `src/components/pages/DatasetTools.tsx`, `src/components/pages/DatasetWorkspace.tsx`, `src/components/pages/dataset/`, `src/app/(admin)/panoramas/page.tsx`, `src/features/panorama-management/`, `src/components/tour/TourViewer.tsx`, `src/lib/panorama-image-resolver.ts`, `src/app/api/panorama-upload/`, and `src/app/api/panorama-resolve/` (review only).
  - Acceptance: campus selection opens the campus Explorer; legacy tools remain at their dedicated route; Panorama inventory uses canonical scenes and the signed resolver; no panorama data-URL authoring path or API/auth weakening is introduced.
- **T5.2:** Align the outdated key-validation test case with the existing immutable asset-key grammar.
  - Files: `src/lib/__tests__/panorama-keys.test.ts` only.
  - Acceptance: legacy and immutable keys are accepted; malformed keys deeper than the three-segment contract remain rejected; focused Dataset and Panorama regressions pass.
- **T5.3:** Review and commit the verified Phase 5 reconciliation batch.
  - Files: only the verified T5.2 test and workflow records (`errors/ERRORS.md`, `plan/PLAN-CANONICAL-RECOVERY-2026-10-10.md`, `progress/PROGRESS.md`, `todo.md`).
  - Acceptance: no unrelated changes included; candidate and donor remain unchanged; commit is confined to the integration branch.

## T6 — Persistence and R2 verification

- **T6.1:** Confirm the selected test suites are isolated from live Supabase and R2 services; record whether the integration worktree has a verified disposable Development target.
  - Files: `vitest.config.ts` and the selected test setup/mocks (review only); check only presence of candidate-local environment filenames, never their contents.
  - Acceptance: execute no external write unless project, campus, bucket, and credentials are independently verified for the disposable Development target. This worktree currently omits local environment files by design.
- **T6.2:** Verify Map/Floor save queue, idempotency, conflict handling, persistence service, and cross-floor round trips.
  - Files: `src/store/graph-store.test.ts`, `src/store/graph-store-save-queue.test.ts`, `src/store/graph-store-idempotency.test.ts`, `src/store/graph-store-conflict.test.ts`, `src/store/graph-store-foundation.test.ts`, `src/app/(admin)/studio/[id]/edit/building/[buildingId]/floor/[floor]/__tests__/floor-editor-persistence.test.ts`, `src/components/studio/__tests__/studio-persistence.test.ts`, `src/services/authored-snapshot-persistence.test.ts`, `packages/editor/src/services/__tests__/persistence-service.test.ts`, `packages/editor/src/__tests__/floor-door-persistence-roundtrip.test.ts`, `packages/editor/src/__tests__/w14c-multi-floor-persistence-roundtrip.test.ts`, `packages/editor/src/panels/__tests__/floor-editor-stabilization.test.ts` (test only).
  - Acceptance: tests prove server acknowledgment, stale conflict rejection, idempotent replay, authored snapshot round trip, and floor isolation using mocks/in-memory fixtures.
- **T6.3:** Verify Dataset source-of-truth, Panorama upload/asset/resolver/Pannellum contracts, and public-campus/map behavior.
  - Files: Dataset suites under `src/components/pages/__tests__/dataset-*.test.tsx`; Panorama suites under `src/features/panorama-management/`, `src/lib/__tests__/panorama-*.test.ts`, `src/app/api/panorama-{upload,resolve}/__tests__/route.test.ts`, `src/components/tour/TourViewer.test.tsx`, `src/__tests__/panorama-hotspot-roundtrip.test.ts`; public-campus and public map suites under `src/app/api/public-campus/__tests__/`, `src/store/__tests__/public-store*.test.ts`, `src/components/map/__tests__/`, `src/components/map/layers/__tests__/`, and `src/components/public/__tests__/ExploreMap.test.tsx` (test only).
  - Acceptance: canonical scene/image-asset IDs and signed URL resolution remain intact; public map renders the verified candidate data contract; tests use mocks and do not perform live writes. Any baseline failures must be classified with evidence and kept visible; do not weaken behavior or assertions to force a green run.
- **T6.4:** Record live Development gate and commit the test evidence/workflow records.
  - Files: `errors/ERRORS.md`, `progress/PROGRESS.md`, `todo.md`, and this plan only unless a reproducible product defect requires a newly scoped repair.
  - Acceptance: no Production access; live Development operations are reported blocked if target credentials/authorization cannot be independently established; commit only verified local changes.

## T7 — Final verification

- **T7.1:** Run the repository unit/regression suite with database, Supabase, R2, and deployment variables blanked in the test process; include mutation-auth boundary tests.
  - Files: Vitest-discovered tests in `src/` and `packages/`, plus `src/lib/__tests__/mutation-auth.test.ts` (test only).
  - Acceptance: no tests can authenticate to or write an external database/storage target; collect a nonzero test count and classify failures against the recorded baseline.
- **T7.2:** Run scoped lint, repository typecheck, production build, and whitespace verification.
  - Files: changed TypeScript/TSX files from the integration commits (lint only); `tsconfig.json`, `next.config.*`, and package scripts (read only); no source repair unless a new defect is conclusively introduced by this program.
  - Acceptance: report exact command status; separate known typecheck and Windows worker limitations from changed-file diagnostics.
- **T7.3:** Verify branch history, working-tree state, preserved test artifacts, candidate/donor identities, and absence of deployment/database/storage operations.
  - Files: Git metadata and recovery manifests only (read only).
  - Acceptance: all new commits are on the integration branch; original candidate and donor remain unchanged; generated Playwright artifacts remain preserved and unstaged.
- **T7.4:** Record final evidence and commit only the verification records.
  - Files: `errors/ERRORS.md`, `progress/PROGRESS.md`, `todo.md`, and this plan only.
  - Acceptance: final status clearly distinguishes verified local behavior from blocked live Development storage/browser verification; no push, deployment, Production access, or writes occur.
  - **Status:** Final workflow-record-only commit closes this verification task; release gates with failures remain blocked for separate triage.

### T7 execution evidence
- **T7.1:** Full Vitest run with external-service variables blank: 595/630 files passed; 6,524 tests passed, 67 failed, and 8 skipped. Mutation-auth passed 17/17. Previously classified public-store assertions and the stale Navigate simulator expectation recurred; 18 publish-path log notices reported the intentionally unavailable Supabase client. Remaining compiler/editor/engine failures were not all compared against a clean baseline and were not changed.
- **T7.2:** ESLint checked 95 changed TypeScript files and exited 1 with 4 errors and 4 warnings; error locations predate the integration checkpoint. `tsc --noEmit --pretty false` exited 2 with 1,146 diagnostics, matching the recorded baseline; 19 diagnostics in six touched paths were attributed by blame to pre-checkpoint lines. `npm run build` reached static page generation, then exited 1 because public Supabase variables were intentionally blanked. Both committed and working-tree `git diff --check` passed.
- **T7.3:** Candidate remains at `6d03b14399b26deb8670763450b4ba259b6f5ae5` with 74 dirty paths; current status and checkpoint path sets match 74/74. Donor remains at `bead5101fc853959f99f7aabcdba72423f48f839` with 3,441 dirty paths. Integration branch was at `eda69f97a6bcff33070a8e7329d788c7d9e1a695` before the final records commit. The main worktree's `.git/info/exclude` line 7 is `/.navi-worktrees/`, and `git check-ignore` confirms the destination matches. Playwright artifacts remain unstaged; the compiler snapshot's content hash matches `HEAD` despite a Git modified marker. No Production, database, R2, push, or deployment operation occurred.
- **T7.4:** Commit only the four final workflow records locally; the resulting SHA is reported in the final response. No source changes are included.
