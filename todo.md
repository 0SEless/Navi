# TODO: Floor Editor Door & Interior Persistence

## Phase P3A: Test-Only Studio Catalog Registration
- [x] P3A-T1: Add gated browser-local test campus resolver and focused gate tests
- [x] P3A-T2: Connect editor route and explicit opt-in control; prove catalog isolation
- [ ] P3A-T3: PARTIAL — Map Editor UI round trip passed; Floor Editor authoritative readback failed in P3B

## Phase P3B: Development Studio Graph Write Authentication
- [x] P3B-T1: Reproduced the 401 branch when a stale Supabase cookie shadows a valid enabled dev mock; original browser cookie-name evidence was not retained
- [x] P3B-T2: Added mixed-cookie regression tests; verified admin fallback, verified non-admin denial, and production mock denial
- [x] P3B-T3: Added development-only mock fallback after Supabase verification returns error/no user
- [ ] P3B-T4: BLOCKED — Map UI round trip passed; Floor Editor returned HTTP 200 but authoritative room readback remained unchanged and editor stayed Unsaved

- [x] T1: Harden Graph Store Network Transport & Commit Store Dependencies (`src/store/graph-store.ts`)
- [x] T2: Attribute Authored Mutations on `document.changed` in `FloorEditorBridge` (`src/app/(admin)/studio/[id]/edit/building/[buildingId]/floor/[floor]/page.tsx`)
- [x] T3: Add Explicit Save Button and Keyboard Shortcut in `FloorEditor` (`src/components/floor-editor/FloorEditor.tsx`)
- [x] T4: Verification Test for Door Placement and Server Round-Trip (`packages/editor/src/__tests__/floor-door-persistence-roundtrip.test.ts`)
- [x] T5: Full Verification Battery

## Phase P4: Floor Editor Room Persistence Repair
- [x] P4-T1: Preserve pending state and trace the full room-name save path to the first loss boundary
- [x] P4-T2: Add failing regression for duplicate Floor Editor context initialization under Strict Mode
- [x] P4-T3: Apply the smallest root-cause repair
- [x] P4-T4: Run focused regression suites and inspect the inherited dirty diff
- [x] P4-T5: Verify a real Floor Editor save/readback/cold reload on a fresh isolated dev browser origin; verify Floor B isolation

## Phase P5: Preserve Verified Persistence Repairs
- [x] P5-T1: Inventory all dirty files and classify by deployment scope
- [x] P5-T2: Verify auth fallback, test-campus isolation, and Strict Mode lifecycle security
- [x] P5-T3: Run focused regressions, lint, typecheck, and diff checks; record baseline issues
- [x] P5-T4: Commit `6d03b14399b26deb8670763450b4ba259b6f5ae5` with only reviewed auth and Floor Editor repairs/tests; keep dev catalog mechanism excluded

## Phase P6D: Panorama Management R2 Integration
- [x] P6D-T1: Trace canonical scene, upload, asset registry, save, and render contracts; verify dev-only scope
- [x] P6D-T2: Make sign API generate immutable asset keys and add route regression tests
- [x] P6D-T3: Add file validation, direct upload/completion flow, and canonical Panorama properties control
- [x] P6D-T4: Resolve asset keys at Pannellum render time and remove data-URL authoring path
- [~] P6D-T5: Focused verification passed; browser round trip is blocked until an already-authorized development admin account can access Studio

## Read-only development Studio authorization diagnosis
- [x] T1: Confirm local development target and trace middleware/API admin rules
- [x] T2: Verify development auth/role metadata using aggregate-only read queries
- [x] T3: Record redirect cause and operator-controlled next action; no source or database changes

## Phase P6E: Restore Development Admin Authorization
- [ ] T1: Verify intended account's stable Auth user ID from a live Development session
- [ ] T2: Confirm identity/approval gate, then update only app_metadata.role if both pass
- [ ] T3: Refresh session and verify Studio plus authorized/unauthorized API behavior
- [!] BLOCKED before T1: Current localhost browser is signed out; no stable Auth user ID can be matched to the intended account

## NAVI Phase P6D — Panorama Persistence Verification
- [x] T1 Check candidate commit, runtime target, dev bucket, campus baseline, and route access.
- [ ] T2 Upload image via Studio UI and verify R2 plus asset registry.
- [ ] T3 Save scene and cold-reload authoritative state/viewer.
- [ ] T4 Run focused tests and confirm Development-only change boundaries.
- [!] BLOCKED at T1: candidate routes return 404; no upload attempted.

## NAVI Phase P6F — Restore local Next.js routing
- [x] T1 Identify the port listener and candidate worktree.
- [x] T2 Establish stale candidate `.next` output as the route failure source.
- [x] T3 Stop only the candidate server, clear only its verified `.next`, restart from candidate.
- [x] T4 Verify public routes, unauthenticated redirect, signed-in Studio, Panorama Management, and Development targets.
- [x] STOP at routing gate; no Panorama upload performed.

## NAVI Phase P6H — Dataset and Panorama UI regression audit
- [x] T1 Compare current implementation, working-tree changes, history, shell/styles, and available screenshot references.
- [!] T2 BLOCKED: no reliable approval evidence for the management-page visual baseline; historical Panorama version contains deprecated data-URL upload behavior.
- [ ] T3 Do not change UI source or run implementation checks until the approved design reference is supplied.

## Phase P6I — Controlled UI + persistence reconciliation
- [x] T1: Inventory worktrees, capture source status/hashes, establish exact integration allowlist, and compare contracts.
- [x] T2: Restore campus selector/detail workspace and separate legacy tools route, including only the tested owner-bound cover upload dependencies.
- [x] T3: Restore canonical read-only Panorama management presentation and adapt to the candidate viewer resolver contract.
- [x] T4: Fix nested sidebar highlighting, run focused verification, inspect available browser routes, and log visual-evidence limits.

## NAVI Continuous Canonical Recovery — Phase 4–7
- [x] T4.1: Add the shell-owned persistent MapLibre runtime and shared scene publisher.
- [x] T4.2: Restore public building, POI, authored-road, floor-plan, and route layers against the candidate data contract; fix late building-layer initialization and initial data sync.
- [x] T4.3: Restore search building identity and map overlay hit testing with focused tests.
- [x] T4.4: Run public runtime regression tests and commit the verified Phase 4 batch (`c9b6619afa443dac0265ff70a0dc03730c1ce0c6`).
- [x] T5.1: Review Dataset campus-first routes, legacy tools, and canonical Panorama scene/resolver contracts.
- [x] T5.2: Align the stale panorama key test with the existing immutable asset-key grammar; focused Dataset and Panorama suites passed (440/440).
- [x] T5.3: Review and commit the verified Phase 5 reconciliation batch (`f2cf42dccc91582542b1f14a231fd51dc1e14bb4`).
- [x] T6.1: Confirmed the integration worktree contains no local env files; Map/Floor tests use stubbed fetch/in-memory fixtures, public Supabase tests mock the client, and Panorama route tests mock R2 and asset storage.
- [x] T6.2: Isolated Map/Floor persistence and cross-floor suites passed (12 files / 128 tests).
- [x] T6.3: Ran Dataset, Panorama upload/resolver/Pannellum, and public-map suites (39/41 files passed; six baseline assertions classified and recorded).
- [x] T6.4: Recorded the blocked live Development DB/R2 gate and committed Phase 6 evidence (`eda69f97a6bcff33070a8e7329d788c7d9e1a695`).
- [x] T7.1: Full isolated suite completed (595/630 files; 6,524 passed, 67 failed, 8 skipped); mutation-auth boundary passed 17/17. External service variables were blanked. Failures remain recorded for triage.
- [x] T7.2: Scoped lint, repository typecheck, build, and whitespace checks completed. Lint has 4 inherited errors/4 warnings; typecheck matches the recorded 1,146-diagnostic baseline; build stopped at static generation because public Supabase variables were intentionally blank; whitespace checks passed.
- [x] T7.3: Confirmed candidate/donor identities, 74-path overlay parity, local ignore scope, preserved Playwright artifacts, and no production/database/storage operations.
- [x] T7.4: Record final evidence and commit only the workflow records locally; report the commit SHA and remaining verification blockers.

## NAVI Continuous Phase 8 — Regression triage and stabilization
- [x] T8.1: Verify branch, HEAD, dirty paths, generated Playwright artifacts, compiler snapshot content, and test commands/configuration.
- [x] T8.2: Reproduce all Phase 7 test failures with external-service variables blanked; exact same 35 files / 67 failures recurred.
- [x] T8.3: Compared against clean checkpoint: all 67 current failure identifiers matched baseline; one baseline-only panorama-key failure was already corrected in Phase 5.
- [x] T8.4: Fixed and verified the optional-traces TypeScript regression; included only this fix and Phase 8 evidence in the scoped local commit.
- [x] T8.5: Compared tests, lint, TypeScript, and build baselines; recorded inherited failures and the blocked build/live Development R2 gate.
