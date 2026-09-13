# ERRORS.md — Ledger of errors encountered

## 2026-09-13: Studio save banner contract — No new errors
- **Error**: None encountered during implementation. Focused suites passed on the first run; ESLint surfaced only the known pre-existing `FloorEditor.tsx` baseline (28 problems, none on changed lines).
- **Cause**: N/A — presentation-only change; no store or editor-package behavior changed.
- **Fix**: N/A.
- **Prevention**: Never render raw `syncError`/`saveError` in the main save banner; expose producer text only through `SaveStatusModel.diagnostic` inside Advanced recovery. Keep the `Offline` prefix and conflict-state sanitization unit-tested. Compare `FloorEditor.tsx` lint against the 28-problem baseline rather than expecting a clean file.
- **Related tasks**: Studio save banner T1–T5

## 2026-09-13: P0 single-user sync — overlapping graph saves self-conflict + revision acknowledgement lost
- **Error**: A single Studio editor could hit `GRAPH_SNAPSHOT_CONFLICT`/client `conflict` state after its own saves. Producing RED tests: (1) three overlapping saves from one client produced 2 conflicts because all three POSTs carried the same `expectedServerUpdatedAt`; (2) against a server that does not echo `updatedAt` (deployed migrations 004/005), the sync marker stayed at the pre-save revision, so the next sequential save claimed a stale revision; (3) a save whose revision could not be confirmed still set `syncStatus:'synced'`.
- **Cause**: `graph-store.syncToSupabase` had no per-campus in-flight lock, so autosave, `visibilitychange`/`beforeunload` flushes, building-drag mouseup, wizard saves, `online` resync and forced `reSync` could all POST concurrently with the same expected revision. The marker write was also conditional on `localMatches` and fell back to `previousMarker?.serverTimestamp` when the RPC returned no `updatedAt`, so a successful save could leave the expected revision stale while the UI reported success.
- **Fix**: Added a per-campus save queue in `src/store/graph-store.ts` (at most one POST in flight; one coalesced follow-up re-reading the latest graph/revision) and a strict ack contract (response `updatedAt` → else GET-confirm → else `error`, never `synced`; confirmed revision always written to the marker). Regression suite `src/store/graph-store-save-queue.test.ts` covers sequential A→B→C→D, rapid coalescing, legacy no-`updatedAt` confirmation, unconfirmable revision, divergent-writer conflict preservation, and failed-save status.
- **Prevention**: Never advance optimistic-concurrency state from a fallback; every successful save must resolve an authoritative revision or report an error. Keep at most one write in flight per campus. Migration 009 (the server compare-and-swap + `updatedAt` echo) still awaits rollout — until then the GET-confirm path is load-bearing.
- **Related tasks**: T1, T2, T5

## 2026-09-13: P0 single-user sync — automated tests/agents could write production campus map-map-1-k6bv
- **Error**: `navi-next/.env.local` points local dev at the production Supabase project (`oltfaepqcktrumfhadzb`). `e2e/autosave-roundtrip.spec.ts` selected `maps[0].id` from `/api/campus-maps` — the only row is the protected campus `map-map-1-k6bv` — then edited and asserted persistence; nine `e2e-p4-*.mjs` scripts hardcoded k6bv URLs; `e2e-unified-poi-area.mjs` fell back to `maps[0]`. `.dev-server-bg.log` shows a k6bv floor-editor session issuing 17 real `POST /api/graph 200` writes, aligned with the production revision timeline. Playwright MCP sessions and the configured Supabase MCP (production project ref) are agent-capable writers.
- **Cause**: No explicit campus selection or protected-ID guard for automated runs; the shared `.env.local` makes any localhost run production-writing by default; a campus cleanup that deletes `/api/campus-maps` rows leaves orphan `graph_snapshots` (which is why fixture saves persisted invisibly).
- **Fix**: Added `e2e/support/safety.ts` and `e2e/support/campus-guard.mjs` (explicit `E2E_CAMPUS_ID`, protected lockout for `map-map-1-k6bv`); autosave spec requires `E2E_CAMPUS_ID`; POI `maps[0]` fallback removed; all hardcoded `e2e-p4-*.mjs` scripts gated. Regression: `__tests__/e2e-safety.test.ts` (7 tests) plus runtime proof that guarded scripts exit 1 for missing/protected ids.
- **Prevention**: Give dev/test its own Supabase project and credentials; never select a campus implicitly in automated runs; keep the protected-ID list in both guards and add new test campuses only via disposable IDs.
- **Related tasks**: T4, T5

## 2026-09-13: P0 single-user sync — deployed RPC returns no updatedAt (migration 009 not rolled out)
- **Error**: A successful `POST /api/graph` on the deployed database returns `{success, campus_id}` with no revision, so the client cannot learn the new `graph_snapshots.updated_at` from its own save.
- **Cause**: `supabase/migrations/004` and `005` define `sync_graph_snapshot` without an `updatedAt` return and without the compare-and-swap check; `009_graph_snapshot_optimistic_concurrency.sql` adds both but `navi-next/progress/PROGRESS.md:2752` records it as "awaits rollout". The stored k6bv snapshot `data` still contains `expectedServerUpdatedAt`/`forceServerOverwrite`, confirming the last production write bypassed 009's stripping.
- **Fix**: Client-side workaround in this session (GET-confirm the revision after a save that returns no `updatedAt`; never report synced without a confirmed revision). No migration was applied.
- **Prevention**: Apply migration 009 through the approved Supabase rollout path before relying on server-side compare-and-swap; keep the client contract compatible with both RPC versions until then.
- **Related tasks**: T1, T2

## 2026-09-13: Campus cleanup — Supabase Management API token rejected (401)
- **Error**: `POST https://api.supabase.com/v1/projects/<ref>/database/query` and `supabase projects list` both returned `401 Unauthorized` using the `SUPABASE_ACCESS_TOKEN` from `navi-next/.env.local`.
- **Cause**: The `.env.local` personal access token is expired/revoked (or not accepted by the Management API); the CLI confirms the same rejection.
- **Fix**: Switched all audit reads to service-role PostgREST GETs (read-only); documented the limitation in the approval report because deletion execution would prefer SQL/transactional access.
- **Prevention**: Do not assume the repo PAT grants SQL access; verify token validity first, and refresh the PAT or DB credential before planning transactional DML.
- **Related tasks**: T1, T6

## 2026-09-13: Campus cleanup — PowerShell JSON parse of PostgREST OpenAPI failed
- **Error**: `ConvertFrom-Json` in Windows PowerShell 5.1 raised `Cannot process argument because the value of argument "name" is not valid` on the PostgREST OpenAPI response (299 KB).
- **Cause**: PS 5.1's JSON parser choked on the OpenAPI document despite valid UTF-8 JSON (Swagger 2.0 payload with percent-encoded path keys).
- **Fix**: Parsed the saved payload with Node (`JSON.parse`) and enumerated the 10 exposed tables successfully; no database state changed.
- **Prevention**: Use Node for JSON-heavy API responses in this environment instead of `ConvertFrom-Json`.
- **Related tasks**: T1, T2

## 2026-09-11: Phase 3 Graphify refresh permission boundary
- **Error**: Required post-edit `graphify update .` retries, including the final post-hardening retry, failed with Windows `[WinError 5] Access is denied` during code re-extraction.
- **Cause**: The managed Graphify cache/output permission boundary remains external to the checkout.
- **Fix**: Left generated `graphify-out` untouched and retained the successful pre-edit graph query plus fresh Phase 3 test evidence.
- **Prevention**: Repair the external Graphify cache permission separately; never rewrite generated graph output to simulate a refresh.
- **Related tasks**: Phase 3 T5

## 2026-09-11: Phase 3 protected isolation baselines unchanged
- **Error**: The protected compiler pipeline retained two `HALLWAY_DISCONNECTED` failures, and the production route characterization retained its two route-path/access-command failures (68 other assertions passed in the combined run).
- **Cause**: These fixtures exercise unrelated route/topology behavior in the already-dirty checkout; the Phase 3 transform/lifecycle changes do not touch those paths.
- **Fix**: Preserved the fixtures and classified the four failures as unchanged baselines after the fresh rerun.
- **Prevention**: Keep publication/topology isolation and route characterization in every Phase 3 gate, but attribute failures only when the changed transform seams are active.
- **Related tasks**: Phase 3 T5

## 2026-09-11: Phase 3 runtime gate path mismatch
- **Error**: The first runtime Vitest invocation used repository-root file paths with the package-local config and returned `No test files found`.
- **Cause**: `packages/runtime/vitest.config.ts` includes `src/**/*.test.ts` relative to the runtime package root.
- **Fix**: Reran the same two runtime suites from `navi-next/packages/runtime` with package-relative paths; 12/12 passed.
- **Prevention**: Run package-local Vitest configs from their owning package root and use paths relative to that config.
- **Related tasks**: Phase 3 T5

## 2026-09-11: Phase 3 inspector lint rejected synchronous draft reset
- **Error**: The scoped ESLint gate reported `react-hooks/set-state-in-effect` for resetting numeric drafts synchronously inside an alignment/frame effect.
- **Cause**: The controlled inspector used an effect solely to clear local input state after parent values changed.
- **Fix**: Replace the effect with a transform-keyed draft state so stale drafts are ignored without a synchronous effect update.
- **Prevention**: Derive controlled-input invalidation from render-time identity instead of using effects for local state resets.
- **Related tasks**: Phase 3 T2, T5

## 2026-09-11: Phase 3 storage test mock hoisting
- **Error**: The focused Phase 3 storage-cleanup suite failed before running because Vitest reported `Cannot access 'createClient' before initialization` while hoisting the `vi.mock` factory.
- **Cause**: The test factory referenced a top-level mock variable that was initialized after Vitest's hoisted mock registration.
- **Fix**: Move the mock function into `vi.hoisted`, then rerun the unchanged focused gate.
- **Prevention**: Define top-level Vitest mock state with `vi.hoisted` whenever a factory closes over it.
- **Related tasks**: Phase 3 T4

## 2026-09-11: Phase 3 RED test expected displayed height as scale
- **Error**: The first Phase 3 helper run expected `scaleY` to equal the
  displayed 14 m height after a locked 35 m width edit.
- **Cause**: The test mixed canonical scale units with derived meter units;
  `scaleY` must be `14 / 12` for a 12 m base frame.
- **Fix**: Narrowed the assertion to the canonical scale and retained the
  derived-dimension behavior as the separately asserted contract.
- **Prevention**: Assert canonical fields and derived UI values in distinct
  expectations; never compare a scale directly with meters.
- **Related tasks**: Phase 3 T1, T2

## 2026-09-01: Wave B planning patch context mismatch
- **Error**: The first combined documentation patch did not apply because its expected `plan/NAVI-CAPTURE-PHASE6R.md` context did not exactly match the current file.
- **Cause**: The patch used a stale/overly broad context block while the plan text had already been updated by the prior Wave A run.
- **Fix**: Re-read the current specification, plan, TODO, and progress sections and reapply the documentation changes with smaller exact-context hunks.
- **Prevention**: Inspect the exact current block before patching shared planning artifacts; use independent hunks for spec, plan, TODO, progress, and error-log updates.
- **Related tasks**: T7

## 2026-09-01: Phase 6R Wave B RED — Vitest startup permission failure
- **Error**: The Wave B Reviewer/map/editing/import RED command failed while loading `vitest.config.ts` with Windows `spawn EPERM`; no test body executed.
- **Cause**: The managed sandbox denied the child-process spawn used by Vite’s external-dependency resolver, matching the established Wave A and Phase 6 startup limitation.
- **Fix**: No product source behavior was inferred or changed. The identical RED command is being rerun with the approved elevated execution context.
- **Prevention**: Separate test-runner startup failures from assertion failures and preserve the command/output before escalating execution.
- **Related tasks**: Phase 6R T7

## 2026-09-01: Phase 6R Wave B RED — Reviewer editing and snap contract failures
- **Error**: The elevated Wave B RED run executed the existing suites successfully but failed the new contracts: the provider-neutral `route-editing` module does not yet exist, Reviewer has no move/add/remove/reset or snap actions, and `CaptureReviewMap` has no snap-target layer or edit gesture listeners.
- **Cause**: Wave B production behavior has not been implemented; the RED tests intentionally describe the approved reviewed-candidate and explicit-snap contracts.
- **Fix**: No production source, Studio document, Supabase data, or captured evidence was changed at the RED checkpoint. The reviewed candidate and snap contracts are the next implementation tasks.
- **Prevention**: Keep raw GPS and source sessions read-only, require explicit snap confirmation, and run the pure route-editing tests before UI integration.
- **Related tasks**: Phase 6R T7

## 2026-09-01: Phase 6R Wave B Reviewer test fixture — raw insertion gap
- **Error**: The first post-integration Reviewer edit test expected Add point to increase the candidate count, but the fixture’s derived candidate already contained every raw sample.
- **Cause**: The initial fixture used a sharp path with no omitted source index, so the raw-trace insertion contract correctly returned no-op.
- **Fix**: Replaced it with a straight, closely sampled fixture whose generated candidate has a source-index gap; the Reviewer suite then passed.
- **Prevention**: Design add-point fixtures from explicit source-index gaps and verify the derived candidate shape before asserting insertion counts.
- **Related tasks**: Phase 6R T9

## 2026-09-01: Phase 6R Wave B T9 — Graphify refresh permission failure
- **Error**: The required `graphify update .` after Wave B source integration reported `Nothing to update or rebuild failed` with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process, matching the established Phase 3–6 limitation.
- **Fix**: No generated graph files were manually edited; Wave B source and test verification remains independent.
- **Prevention**: Resolve Graphify output permissions before treating refresh as a release gate; do not repair generated output destructively during feature work.
- **Related tasks**: Phase 6R T9

## 2026-09-01: Phase 6R Wave B T10 — Graphify refresh permission failure
- **Error**: The required `graphify update .` after the final Wave B source state again reported `Nothing to update or rebuild failed` with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process, matching the established repository limitation.
- **Fix**: No generated graph files were manually edited; source, tests, lint, and build evidence remain independent.
- **Prevention**: Resolve Graphify output permissions before treating refresh as a release gate; do not repair generated output destructively during feature work.
- **Related tasks**: Phase 6R T10

## 2026-09-01: Phase 6R Wave B T11 — scoped status probe used the wrong repository cwd
- **Error**: A read-only boundary probe attempted `git -C navi-next` while already running from the nested `navi-next` working directory, so Git reported that the path did not exist; the same probe also initially read the nested app’s unrelated `errors/ERRORS.md` instead of the root workflow ledger.
- **Cause**: The audit command mixed root-relative and app-relative paths after changing working directories.
- **Fix**: No repository or remote state changed. The app status, root ledger, and root planning artifacts were re-read from their exact absolute/working-directory paths.
- **Prevention**: Keep root workflow-document checks in the root checkout and nested application checks in the app checkout; do not combine `git -C` with an already nested working directory.
- **Related tasks**: Phase 6R T11

## 2026-09-01: Phase 6R Wave B T11 — Resolve-Path probe argument shape
- **Error**: A read-only `Resolve-Path` probe supplied several paths as positional arguments and PowerShell rejected the extra arguments.
- **Cause**: `Resolve-Path` expects a single `-Path` argument containing an array for multiple paths.
- **Fix**: No files or state changed; the same probe was rerun with an explicit path array and resolved all seven scoped Wave B files.
- **Prevention**: Use `-Path @(...)` for multi-path PowerShell inspection commands and keep read-only probe failures separate from product results.
- **Related tasks**: Phase 6R T11

## 2026-08-26: W12B Floor-plan Alignment Correctness
- **Error**: Offset unit mismatch between UI (meters) and transform (internal units)
- **Cause**: `computeFloorPlanCoords` uses `Δlng × cos(lat) × R` without π/180 factor, creating internal units ≈ π/180 meters. Body drag and keyboard nudge add meters to offset, but transform treats them as internal units (57.3x too large).
- **Fix**: Convert offset from meters to internal units inside `computeFloorPlanCoords`
- **Prevention**: Always trace unit semantics through the full transform chain before declaring units

## 2026-08-27: W15C RouteNetwork Compiler — No new errors
- **Error**: None encountered
- **Cause**: N/A
- **Fix**: N/A
- **Prevention**: Reused existing `localToLatLng` conversion from normalizer (same METER_PER_DEG constant)
- **Related tasks**: T1, T2, T3, T4, T5

## 2026-08-27: Indoor Editor Bugfixes — No new errors
- **Error**: None encountered
- **Cause**: N/A
- **Fix**: N/A
- **Prevention**: Followed existing patterns for state management and coordinate transformations
- **Related tasks**: Snap mode, two-point door placement

## 2026-08-29: Delete Controls — MapLibre Wall Selection Timing
- **Error**: The new selected-wall delete test initially could not reach the `Delete Wall` control; only the drawing hook's component-layer queries ran.
- **Cause**: The FloorEditorCanvas MapLibre event-registration effect returned before the map was ready and did not rerun on the `mapReady` transition; the test also simulated its click before the readiness rerender's effects had flushed.
- **Fix**: Added `mapReady` to the event effect dependencies and split the test's readiness wait from its simulated click.
- **Prevention**: Effects that register MapLibre handlers must depend on the readiness state that makes the map usable, and route tests must wait for that handler registration before simulating input.
- **Related tasks**: Delete Wall/Room controls

## 2026-08-29: Delete Controls — Graphify Update Permission Failure
- **Error**: `graphify update .` failed with Windows `[WinError 5] Access is denied` while re-extracting code files.
- **Cause**: The graphify rebuild process does not have permission to write its generated output in this managed checkout.
- **Fix**: No generated graph files were edited manually; the source implementation and tests were verified independently.
- **Prevention**: Retry graphify updates when workspace permissions change and treat generated graph output as read-only when the tool reports this error.
- **Related tasks**: Delete Wall/Room controls

## 2026-08-30: Route Network Audit — Browser Keyboard Probe
- **Error**: The live-browser keyboard probe could not dispatch the `R` key to the Floor Editor body locator.
- **Cause**: The in-app browser harness reported that the focused input target no longer matched the resolved body locator during `Input.dispatchKeyEvent`.
- **Fix**: Treated the probe as inconclusive and relied on source reachability plus non-mutating UI snapshots; no product code was changed.
- **Prevention**: Use a focused, purpose-specific interactive locator for future keyboard probes and do not infer product behavior from a harness dispatch failure.
- **Related tasks**: Route-network audit

## 2026-08-30: Campus Navigation Minimap — Graphify Permission Failure
- **Error**: `graphify update .` failed while rebuilding the project graph with Windows `[WinError 5] Access is denied`.
- **Cause**: The graphify rebuild process cannot write its generated output in this managed checkout.
- **Fix**: No generated graph files were edited manually; the campus-minimap implementation was verified with focused tests and a live, non-mutating browser check.
- **Prevention**: Retry graphify after workspace permissions change and keep generated graph output out of manual source edits.
- **Related tasks**: Campus navigation minimap correction

## 2026-08-30: Entrance Auto-Connection Investigation — Browser Locator Probe
- **Error**: A read-only live-browser text probe initially attempted to call `tab.playwright.page.locator(...)`, which raised a `TypeError` because the documented locator API is exposed directly on `tab.playwright`.
- **Cause**: Used a Playwright-page shape instead of the in-app browser wrapper's direct locator surface.
- **Fix**: Re-ran the same read-only inspection with `tab.playwright.locator(...)`; the Floor Editor loaded and returned its visible state.
- **Prevention**: Use the browser wrapper's documented direct locator methods for future probes; treat failed harness calls as inconclusive and never infer product behavior from them.
- **Related tasks**: Entrance auto-connection investigation

## 2026-08-30: Entrance Auto-Connection Investigation — Search Glob Syntax
- **Error**: A targeted PowerShell `rg` command included a Unix-style wildcard path and returned an invalid filename-pattern error for `navi-next/src/components/floor-editor/*.tsx`.
- **Cause**: The command mixed a recursive ripgrep search with a shell glob that PowerShell did not expand for the supplied path.
- **Fix**: Re-ran the needed inspection against explicit file paths; the source evidence was retrieved successfully.
- **Prevention**: Pass explicit files or a directory to `rg` on Windows and avoid unexpanded wildcard path arguments.
- **Related tasks**: Entrance auto-connection investigation

## 2026-08-30: Controlled Entrance-link plan — No new errors
- **Error**: None encountered during the focused investigation, specification, or plan self-review.
- **Cause**: N/A
- **Fix**: N/A
- **Prevention**: Keep synthetic Entrance proximity links covered by exact edge-ID assertions, keep trace-intersection coverage separate, and preserve read-only live-browser verification until implementation is approved.
- **Related tasks**: Controlled Entrance-link investigation and plan

## 2026-08-30: Controlled Entrance-link implementation — Invalid probe path
- **Error**: A targeted source inspection included two compiler paths that do not exist in this checkout, so PowerShell reported file-not-found errors.
- **Cause**: The initial investigation command guessed `packages/compiler/src/stages/build-edges-stage.ts` and `packages/compiler/src/artifact-generator.ts` instead of the actual pipeline/artifacts paths.
- **Fix**: Located the actual files with an explicit `rg --files navi-next/packages/compiler` query and continued against the real paths.
- **Prevention**: Resolve exact paths before composing multi-file inspection commands; avoid assuming directory names from similarly named modules.
- **Related tasks**: T1, T4

## 2026-08-30: Controlled Entrance-link implementation — Missing normalize probe path
- **Error**: A follow-up inspection guessed `packages/compiler/src/normalize.ts`, which is not present in this checkout.
- **Cause**: The normalization implementation is organized under the compiler pipeline and connectivity modules rather than a root-level `normalize.ts` file.
- **Fix**: No source change was made from the failed probe; the existing compiler file list and exact module paths remain the source of truth.
- **Prevention**: Use the resolved compiler file list before opening neighboring modules with assumed names.
- **Related tasks**: T4

## 2026-08-30: Controlled Entrance-link implementation — Missing primitives type probe path
- **Error**: A targeted inspection guessed `packages/compiler/src/types/primitives.ts`, which is not present in this checkout.
- **Cause**: Compiler primitive types are consolidated in the resolved `packages/compiler/src/types` module rather than that assumed filename.
- **Fix**: No source change was made from the failed probe; continue using exact paths returned by the compiler file listing.
- **Prevention**: Resolve filenames before reading type modules instead of inferring them from imports.
- **Related tasks**: T4

## 2026-08-30: Controlled Entrance-link implementation — Unrelated TypeScript syntax error
- **Error**: The root `npx tsc --noEmit --pretty false` check stopped at `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255` with `TS1005: '}' expected`.
- **Cause**: The reported file is outside this slice and was not modified by the implementation.
- **Fix**: No unrelated runtime test file was changed; focused editor/compiler tests remain the verification source for this task.
- **Prevention**: Repair the pre-existing runtime test syntax before relying on a repository-wide TypeScript check.
- **Related tasks**: T4, T5

## 2026-08-30: Controlled Entrance-link implementation — Graphify update permission failure
- **Error**: `graphify update .` failed while rebuilding the project graph with Windows `[WinError 5] Access is denied`.
- **Cause**: The graphify rebuild process cannot write its generated output in this managed checkout.
- **Fix**: No generated graph files were edited manually; source changes and focused tests/live route verification remain independent evidence.
- **Prevention**: Retry Graphify after workspace permissions change and keep generated graph output out of manual source edits.
- **Related tasks**: T5

## 2026-08-30: Controlled Entrance-link implementation — Package typecheck baseline errors
- **Error**: `npx tsc -p packages/compiler/tsconfig.json --noEmit --pretty false` reported broad existing cross-package fixture, alias, JSX, publisher, and duplicate-state type errors.
- **Cause**: The package typecheck is not currently a clean repository baseline and reports issues outside this slice.
- **Fix**: No unrelated package fixtures or configuration were changed; focused compiler/editor tests remain the verification source.
- **Prevention**: Establish and repair the repository typecheck baseline before using it as a release gate.
- **Related tasks**: T4, T5

## 2026-08-30: Bleacher 2 entrance connection — Indoor route prerequisite
- **Error**: After confirming the Bleacher 2 outdoor target and clicking the inspector Save button, the server graph still contained zero `EntranceAccess` records and zero edges touching entrance node `N0001`.
- **Cause**: The current source-first flow intentionally keeps the picker selection as a pending authoring anchor; persistence occurs only when the first indoor Route node is created and `entrance.access.assign` receives both endpoints. Bleacher 2 currently has no indoor Route node.
- **Fix**: No source or arbitrary map geometry was changed. The pending state was verified, the failed hit-tests were stopped, and the tab was returned to Select mode.
- **Prevention**: Treat the picker confirmation as step one only; require a visible first indoor Route-node step and verify the resulting `EntranceAccess`/edge records before claiming an end-to-end route.
- **Related tasks**: Controlled Entrance-link implementation, Bleacher 2 live verification

## 2026-08-30: Bleacher 2 live verification — Wildcard source probe
- **Error**: A PowerShell `rg` probe included an unexpanded `navi-next/src/components/floor-editor/*.ts` path and returned a Windows invalid filename-pattern error.
- **Cause**: PowerShell passed the wildcard literally to ripgrep.
- **Fix**: Continued with explicit resolved source paths; no product code was affected.
- **Prevention**: Use explicit files or directories with ripgrep on Windows instead of shell wildcard arguments.
- **Related tasks**: Bleacher 2 live verification

## 2026-08-30: Entrance connection plan — Parenthesized path probe
- **Error**: A PowerShell `rg` probe failed because the route page path contained `(admin)` and was passed without quoting, so PowerShell interpreted `admin` as a command token.
- **Cause**: The inspection command mixed a parenthesized Windows path with an unquoted argument.
- **Fix**: No product code was affected; rerun the inspection with every parenthesized path quoted.
- **Prevention**: Quote explicit Windows paths containing parentheses before invoking search tools.
- **Related tasks**: Entrance connection persistence and minimap plan

## 2026-08-30: Entrance connection plan — Header path probe
- **Error**: A source inspection included the guessed path `navi-next/src/components/floor-editor/ContextHeader.tsx`, which does not exist.
- **Cause**: The shared ContextHeader is owned by the editor package, not the Floor Editor component directory.
- **Fix**: No product code was affected; continue with the resolved `navi-next/packages/editor/src/panels/ContextHeader.tsx` path.
- **Prevention**: Resolve component ownership before composing multi-file inspection commands.
- **Related tasks**: Entrance connection persistence and minimap plan

## 2026-08-30: Entrance connection implementation — Combined patch context mismatch
- **Error**: The first T2 minimap patch could not be applied because its combined source/layer context did not match the current component text.
- **Cause**: The patch grouped several nearby edits whose exact ordering differed from the working file.
- **Fix**: No product code was changed by the failed patch; the edits are being reapplied as smaller exact patches.
- **Prevention**: Patch one stable section at a time and inspect exact context before applying grouped changes.
- **Related tasks**: T2

## 2026-08-30: Entrance connection implementation — Preview assertion ambiguity
- **Error**: The picker test’s candidate-label assertion matched both the selected target label and the new unsaved preview label.
- **Cause**: The T2 preview intentionally repeats the selected candidate name for clarity.
- **Fix**: Keep the product preview and narrow the test to the unique selected-target heading.
- **Prevention**: Prefer role/region-specific assertions when a UI enhancement intentionally repeats content.
- **Related tasks**: T2

## 2026-08-30: Entrance connection implementation — Seeded Route fixture assumption
- **Error**: An existing drawing-readiness test expected the author to click the Entrance after the new automatic seed, producing a duplicate first vertex.
- **Cause**: The test encoded the pre-T3 pixel-precise click flow rather than the approved Entrance-first flow.
- **Fix**: Update the fixture to let the seeded Entrance vertex stand and simulate only the next authoring click.
- **Prevention**: Keep interaction fixtures aligned with the Route authoring state machine whenever the initial vertex is supplied by a confirmed connection.
- **Related tasks**: T3

## 2026-08-30: Entrance connection implementation — Graphify update permission failure
- **Error**: `graphify update .` failed while rebuilding the project graph with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed checkout does not currently allow Graphify to write its generated output.
- **Fix**: No generated graph files were edited manually; focused source tests and live route verification remain independent evidence.
- **Prevention**: Retry the Graphify update after workspace permissions change and keep generated graph output out of manual source edits.
- **Related tasks**: T2, T3, T4, T5, T6

## 2026-08-30: Entrance connection implementation — Local cache falsely reported unsaved
- **Error**: After a successful save, reloading the Floor Editor from its map-scoped local snapshot showed `● Unsaved` even though the Entrance → outdoor and Entrance → indoor bridge was present in the server graph.
- **Cause**: `loadMapData` restored the local graph without restoring `syncStatus`; the store started at `idle`, which the Floor Editor maps to `Unsaved`.
- **Fix**: Added a map-scoped sync marker containing a fingerprint of the exact locally cached snapshot. Loading reports `synced` only when that marker matches; failed or unmarked snapshots remain unsynced.
- **Prevention**: Keep local recovery snapshots and server-sync status separate, and test save → reload status plus snapshot mismatch behavior.
- **Related tasks**: T7

## 2026-08-30: T7 local-cache status — Patch context mismatch
- **Error**: The first combined T7 patch could not be applied because the `loadMapData` section appeared before `save` in the source file.
- **Cause**: The patch grouped edits from non-adjacent sections using an incorrect context order.
- **Fix**: Applied the constants, load path, sync path, and test edits as smaller exact patches.
- **Prevention**: Inspect and patch each stable function section independently when source order is non-linear.
- **Related tasks**: T7

## 2026-08-30: T7 live verification — Unsupported browser disabled probe
- **Error**: The in-app browser wrapper did not expose `isDisabled()` on the resolved button locator.
- **Cause**: The wrapper exposes direct locator attributes but not the full Playwright locator method set.
- **Fix**: Re-ran the check with `getAttribute('disabled')` and `getAttribute('aria-disabled')`.
- **Prevention**: Use the documented direct locator surface and treat unsupported wrapper methods as inconclusive.
- **Related tasks**: T7

## 2026-08-30: T7 live verification — Save control unavailable in setup state
- **Error**: After reload, the live Floor Editor reopened its no-floor-plan setup state, so the normal Save control was not available for the final UI status probe.
- **Cause**: The current fixture reopened in setup mode; the mapping UI and route data were still visible, but the workflow Save control was not rendered in that state.
- **Fix**: Verified the persistence path with the focused store test and direct graph API inspection; did not alter the floor plan or route geometry to force a UI state.
- **Prevention**: Separate persistence verification from floor-plan setup-state coverage and explicitly enter mapping mode before future Save-button probes.
- **Related tasks**: T7

## 2026-08-30: T7 local-cache status — Graphify update permission failure
- **Error**: `graphify update .` again failed while rebuilding the project graph with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed checkout still does not allow Graphify to write its generated output.
- **Fix**: No generated graph files were edited manually; source tests and live API verification remain independent evidence.
- **Prevention**: Retry Graphify after workspace permissions change and keep generated graph output out of manual source edits.
- **Related tasks**: T7

## 2026-08-30: Map Editor audit — Road snap argument mismatch
- **Error**: The first click in the live Road tool throws `Runtime TypeError: existingPoints is not iterable` at `packages/editor/src/geometry/snapping.ts:68` and creates no road.
- **Cause**: `InteractionController` imports the geometry `snapPoint` helper but calls it with the road helper's `(point, roads)` shape. The geometry helper expects `(point, config, existingPoints)` and receives no third argument; the separate `road-snap.ts` helper accepts `(LatLng, Road[])`.
- **Fix**: No product source was changed during this investigation; the mismatch is recorded for a focused fix.
- **Prevention**: Keep coordinate-space snap helpers named or exported distinctly and add a compile/runtime contract test at the caller boundary.
- **Related tasks**: T1, T2, T6

## 2026-08-30: Map Editor audit — Area/building probes captured degenerate geometry
- **Error**: Live save/reload probes for a temporary area and building persisted records whose captured points were all identical, so the resulting polygons had no usable extent.
- **Cause**: The browser interaction probe produced repeated identical map coordinates; the current create handlers accept a minimum point count without rejecting duplicate/zero-area geometry. This is an observed data-quality failure, not yet attributed solely to the application or the browser harness.
- **Fix**: The temporary records were removed through the editor's Explorer delete actions and the server was rechecked at 30 buildings and 0 areas.
- **Prevention**: Use true screen-coordinate input for geometry probes and enforce unique/non-zero-area validation before saving polygons.
- **Related tasks**: T3, T4, T6

## 2026-08-30: Map Editor audit — OSM import has no visible draft state
- **Error**: The live Import → Import from OSM mode could be activated, but boundary clicks showed no point count, preview, or confirm/cancel control; a two-point probe could not be safely verified or submitted.
- **Cause**: `OsmImportTool` maintains points and submits on a third-point closure/double-click, while `ConfirmBar` does not include `import-osm`; the tool therefore has no visible authoring-state surface in the current Map Editor.
- **Fix**: No OSM request or import mutation was submitted; the probe was cancelled by switching tools and the graph remained at 36 items.
- **Prevention**: Give import its own visible draft/clear/confirm state and test that state before exercising the network-backed import call.
- **Related tasks**: T5, T6

## 2026-08-30: Map Editor audit — Audit-log patch context mismatch
- **Error**: The first attempt to append the audit findings to `ERRORS.md` was rejected because its expected tail text did not exactly match the file.
- **Cause**: The patch context paraphrased the existing final prevention line.
- **Fix**: Re-read the exact tail and applied a smaller context-anchored patch; no product source was changed.
- **Prevention**: Read the exact nearby lines before appending ledger entries.
- **Related tasks**: T5, T6

## 2026-08-30: Map Editor audit — Focused Vitest startup blocked by sandbox
- **Error**: The focused Vitest command failed before loading tests with `Error: spawn EPERM` while Vite externalized the config.
- **Cause**: The managed sandbox denied the child-process spawn required by the test runner.
- **Fix**: No source was changed; retry the identical focused command with the required elevated execution permission.
- **Prevention**: Treat runner startup failures separately from assertion failures and retain the command/output for the elevated retry.
- **Related tasks**: T6

## 2026-08-30: Map Editor audit — Viewport probe corrected geometry observation
- **Error**: The initial locator-position probes made valid Area and Building clicks appear to produce duplicate coordinates.
- **Cause**: The browser locator click path did not provide reliable viewport placement for MapLibre geometry input; direct viewport pointer clicks did.
- **Fix**: Repeated the non-submitting probes with viewport coordinates. Area, Building, and OSM Import all captured distinct points and rendered their previews; no new records were saved.
- **Prevention**: Use viewport-coordinate pointer input for MapLibre geometry tests and treat locator-position geometry as inconclusive.
- **Related tasks**: T3, T4, T5, T6

## 2026-08-30: Map Editor audit — OSM preview is visible but lacks state controls
- **Error**: With reliable viewport input, OSM Import renders its green boundary preview, but the live UI still exposes no point count or explicit confirm/cancel control.
- **Cause**: The import hook owns its own third-point/double-click completion path while the shared confirmation bar excludes `import-osm`.
- **Fix**: No import was submitted; the two-point preview was discarded by switching tools and the graph stayed unchanged.
- **Prevention**: Add explicit import draft status and cancel/confirm affordances before relying on network-backed import completion.
- **Related tasks**: T5, T6

## 2026-08-30: Map Editor audit — Campus dock IDs are absent from the shared tool registry
- **Error**: The campus dock exposes `area`, `building`, `route`, `import-osm`, and `set-boundary`, but the shared registry definitions do not contain those IDs.
- **Cause**: `CurrentToolStore.activate()` only warns for an unknown ID and still assigns it as active, so the UI can appear to activate tools without registry metadata or shortcut/definition coverage.
- **Fix**: No product source was changed during the audit; the mismatch is recorded as a secondary integration risk.
- **Prevention**: Register every dock-exposed tool ID or make activation reject unknown IDs, and add a cross-check test between dock definitions and registry definitions.
- **Related tasks**: T5, T6

## 2026-08-30: Map Editor tool confirmation fix — Graphify update permission failure
- **Error**: `graphify update .` failed after the tool-registry and confirmation-flow edits with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed checkout still does not allow Graphify to write/rebuild its generated output.
- **Fix**: No generated graph files were edited manually; source tests and live localhost verification remain independent evidence.
- **Prevention**: Retry Graphify after workspace permissions change and keep generated graph output out of manual source edits.
- **Related tasks**: T1, T2, T3, T4, T6

## 2026-08-30: Map Editor tool confirmation fix — Existing lint baseline
- **Error**: The broad ESLint run reports existing `react-hooks/refs` violations in shared editor components, an existing explicit `any`, and an unused test import.
- **Cause**: Those patterns were already present in the touched editor files; the implementation added no new lint violation after the temporary unused OSM variable was removed.
- **Fix**: Focused new OSM/ConfirmOverlay tests lint clean. No unrelated lint refactor was bundled into this narrowly scoped fix.
- **Prevention**: Repair the shared editor lint baseline separately before using repository-wide lint as a release gate.
- **Related tasks**: T3, T4, T5

## 2026-08-30: Map Editor undo cleanup — Browser locator bounds unsupported
- **Error**: The in-app browser locator did not expose `boundingBox()` for the MapLibre canvas.
- **Cause**: The browser wrapper provides a reduced direct-locator API rather than the full Playwright locator surface.
- **Fix**: No product code was changed; use the known live viewport coordinates and CUA pointer input for the MapLibre probe.
- **Prevention**: Use documented wrapper methods and record unsupported harness calls as inconclusive instead of treating them as product failures.
- **Related tasks**: T1, T4

## 2026-08-30: Map Editor undo cleanup — Building probe confirmation timeout
- **Error**: A fresh live Building probe timed out because the browser wrapper found no `Confirm` button after the attempted viewport clicks.
- **Cause**: The probe did not establish that the clicks reached the active MapLibre drawing handler; the interaction harness returned no authoring-state control.
- **Fix**: No source or map data was changed by the failed probe; inspect the active tool/state and retry with fresh viewport coordinates.
- **Prevention**: Confirm the tool's visible authoring state after each input batch before querying confirmation controls, and treat missing controls as an inconclusive harness probe.
- **Related tasks**: T4

## 2026-08-30: Map Editor undo cleanup — Unrelated graph-store marker test failure
- **Error**: The broader focused suite failed `src/store/graph-store.test.ts` because `save()` did not leave the expected `navi-sync-status-<mapId>` local marker; the undo-related 11 files passed 91 tests.
- **Cause**: The failure is outside the undo path and occurred in the existing local-sync-marker test setup; it requires an isolated rerun to distinguish a baseline/mock timing issue from a regression.
- **Fix**: No graph-store source was changed; rerun the exact test independently and keep it separate from undo verification.
- **Prevention**: Run persistence-marker tests in isolation and do not attribute unrelated store failures to renderer/history changes without a focused reproduction.
- **Related tasks**: T4

## 2026-08-30: Map Editor undo cleanup — Graphify refresh permission failure
- **Error**: `graphify update .` failed during the final workflow refresh with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed checkout still does not allow Graphify to write or rebuild its generated output.
- **Fix**: No generated graph files were edited manually; source-level tests, diff checks, and live localhost verification remain independent evidence.
- **Prevention**: Retry the graph refresh after the workspace permissions are corrected and keep generated graph output out of manual source edits.
- **Related tasks**: T4

## 2026-08-30: Map Editor undo follow-up — Draft hook path probe
- **Error**: A targeted source inspection referenced `src/components/studio/useDrawingSession.ts`, which is not present in this checkout.
- **Cause**: The hook is stored under a different resolved filename than the guessed path.
- **Fix**: No product source was changed; resolve the exact path with the repository file list before continuing the trace.
- **Prevention**: Resolve exact filenames before composing multi-file inspection commands.
- **Related tasks**: Undo draft/history follow-up

## 2026-08-30: Map Editor undo follow-up — Current-tool path probe
- **Error**: A follow-up source inspection referenced `src/components/studio/useCurrentTool.tsx`, which is not present in this checkout.
- **Cause**: The current-tool hook uses a different resolved filename or location than the guessed path.
- **Fix**: No product source was changed; continue with exact paths returned by the repository file list.
- **Prevention**: Resolve filenames before including them in multi-file inspection commands.
- **Related tasks**: Undo draft/history follow-up

## 2026-08-30: Map Editor undo follow-up — TDD reference path probe
- **Error**: The TDD skill referenced `references/good-tests.md`, but that file is not present at the installed skill path.
- **Cause**: The installed skill version contains its test guidance inline and uses a different or absent reference filename.
- **Fix**: The inline TDD instructions were read; no product source was changed from the missing reference probe.
- **Prevention**: Resolve skill reference files from the installed skill directory before reading them.
- **Related tasks**: Undo draft/history follow-up

## 2026-08-30: Map Editor undo follow-up — Draft tracer regression test (expected RED)
- **Error**: The new Area/Building tracer regression test failed because changing draft points from three to two left five stale features in each dedicated MapLibre source.
- **Cause**: The tracer synchronization effects were keyed only to the map and active tool, so React draft-point updates did not trigger a redraw.
- **Fix**: This is the expected failing-test checkpoint; production code is being updated only after confirming the failure matches the live reproduction.
- **Prevention**: Cover every dedicated drawing source with a test that changes draft-point state and asserts the resulting feature collection.
- **Related tasks**: T5

## 2026-08-30: Map Editor undo follow-up — Graphify refresh permission failure
- **Error**: `graphify update .` failed again after the tracer fix with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed checkout still does not allow Graphify to write or rebuild its generated output.
- **Fix**: No generated graph files were edited manually; the focused test suite and live Area/Building probes provide the verification evidence.
- **Prevention**: Retry the graph refresh after the workspace permissions are corrected and keep generated graph output out of manual source edits.
- **Related tasks**: T5

## 2026-08-30: Navigation-only routes — Graphify refresh permission failure
- **Error**: `graphify update .` failed after the navigation-only route changes with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed checkout does not currently allow Graphify to write or rebuild its generated output.
- **Fix**: No generated graph files were edited manually; the focused 102-test suite and live localhost verification remain independent evidence.
- **Prevention**: Retry the graph refresh after workspace permissions are corrected and keep generated graph output out of manual source edits.
- **Related tasks**: T4, T5

## 2026-08-30: Navigation-only routes — Existing validation baselines
- **Error**: The repository-wide TypeScript check stopped at the pre-existing `data-identity-comparison.test.ts:255` syntax error, and scoped ESLint reported the existing shared-editor explicit-`any` and React-ref violations.
- **Cause**: Both checks include unrelated dirty-checkout baseline issues outside the navigation-only route behavior; no changed route file was identified as the source of the TypeScript failure.
- **Fix**: No unrelated source or test was changed. The 102 feature tests and 143 adjacent regression tests passed, and `git diff --check` was clean.
- **Prevention**: Repair the repository validation baseline separately before using broad typecheck/lint as a release gate; retain focused route tests for this slice.
- **Related tasks**: T2, T4, T5

## 2026-08-30: Route vertex editing — Style reload loses edit overlay
- **Error**: The new route vertex regression test failed after a MapLibre style reload: the recreated `vertex-source` contained zero handles and no edit line.
- **Cause**: The style-load listener recreated the custom source/layers but did not repaint the active Road's points into the new source.
- **Fix**: Expected RED checkpoint; production code is being changed only after confirming the failure matches the route-edit lifecycle.
- **Prevention**: Treat custom MapLibre source/layer creation and active-edit repaint as one lifecycle operation, and test both initial activation and style reload.
- **Related tasks**: T1, T2, T3

## 2026-08-30: Route testing — Intersection resolver emits disconnected self-loops
- **Error**: The live `map-map-1-k6bv` graph has 11 connected components and four zero-distance edges whose `from` and `to` are the same intersection node. Route Testing cannot find paths across those apparent intersections.
- **Cause**: `Graph.syncTraceIntersections` moves a newly compiled trace endpoint onto the target segment, then queries all current intersection nodes without excluding that endpoint. The endpoint is selected as the nearest node, so the resolver records shared-trace metadata and adds a self-loop instead of splitting/connecting the target trace. The X-crossing branch also attaches only one side of the new segment.
- **Fix**: Not applied in this investigation; product source and stored campus data were left unchanged.
- **Prevention**: Add endpoint/X-crossing regression fixtures; exclude new nodes from canonical-node lookup; split both participating segments; reject zero-length self-loops during graph validation and publication; verify the serialized API graph before live testing.
- **Related tasks**: T1, T2, T3, T4, T5, T6, T7

## 2026-08-30: Workflow verification — pre-existing trailing whitespace
- **Error**: The first workflow-doc `git diff --check` reported trailing whitespace at `plan/PLAN.md:8`.
- **Cause**: The existing plan line contained a space after its colon; it was unrelated to the route investigation.
- **Fix**: Removed only that trailing space; no product source was changed.
- **Prevention**: Run `git diff --check` on workflow artifacts before closing each investigation.
- **Related tasks**: Route graph intersection investigation

## 2026-08-30: Route vertex editing — stale HMR hook dependency warning
- **Error**: The already-open development tab reported that the `useEffect` dependency array changed size after the vertex-editor lifecycle patch, and the route overlay remained stale until a full page reload.
- **Cause**: Fast Refresh retained the previous hook instance while the edited effect changed from a one-item dependency array to a four-item array; this is a development reload artifact, not a clean-mount runtime path.
- **Fix**: Reloaded the real editor route from a clean mount before verification; the route handles then rendered and survived a basemap reload.
- **Prevention**: Perform a clean browser reload after changing hook dependency shapes, then verify the feature from a fresh mount.
- **Related tasks**: T3, T4

## 2026-08-30: Route vertex editing — Graphify refresh permission failure
- **Error**: `graphify update .` failed after the route vertex editor change with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed checkout still does not allow Graphify to write or rebuild generated graph output.
- **Fix**: No generated graph files were edited manually; focused tests and live browser evidence were used independently.
- **Prevention**: Retry Graphify after workspace permissions are corrected and keep generated graph output out of manual source changes.
- **Related tasks**: T3, T4, T5

## 2026-08-30: Route intersection repair — Initial X fixture under-specified
- **Error**: The first X-crossing regression passed even though the junction was attached to only one side of the new segment.
- **Cause**: The test asserted only path reachability and component count; the unsplit straight edge still made the graph technically traversable.
- **Fix**: Added a physical-topology assertion requiring the crossing junction to have four incident edges, then repaired the implementation by splitting both participating edges.
- **Prevention**: Test both connectivity and local junction degree/edge geometry for intersection behavior.
- **Related tasks**: T3, T4

## 2026-08-30: Route intersection repair — Published snapshot remains stale
- **Error**: The live route tester still reports the old graph's four self-loops after the source fix.
- **Cause**: The code change does not mutate the already serialized `graph_snapshots` row; the current API continues serving the pre-repair published graph until a normal recompile/publish.
- **Fix**: No live data was overwritten during this scoped repair; the stale snapshot is explicitly recorded as the remaining deployment step.
- **Prevention**: Re-run serialized graph validation after publishing and require zero self-loops before live route verification.
- **Related tasks**: T5

## 2026-08-31: Validation explainability plan — Missing inspection path
- **Error**: A targeted source inspection referenced `packages/editor/src/context/entity-finder.ts`, which does not exist in this checkout.
- **Cause**: Entity lookup is implemented in the properties panel utilities rather than a dedicated context/entity-finder module.
- **Fix**: No product source was changed; continue with the resolved `panels/properties/property-utils.ts` path.
- **Prevention**: Resolve exact filenames from `rg --files` before composing multi-file inspection commands.
- **Related tasks**: T1

## 2026-08-31: Validation explainability plan — Line-ending command quoting
- **Error**: The first PowerShell line-ending normalization command lost its variables before reaching the nested PowerShell process and failed with a missing foreach variable error.
- **Cause**: The outer PowerShell shell expanded dollar-prefixed variables inside the command string.
- **Fix**: Re-ran the same formatting operation with the nested command enclosed in a literal single-quoted argument; no product source was changed.
- **Prevention**: Quote nested PowerShell scripts literally when they contain dollar-prefixed variables.
- **Related tasks**: Workflow artifact logging

## 2026-08-31: Validation explainability implementation — Expected presenter RED
- **Error**: The new presenter test suite failed before running assertions because `packages/editor/src/validation/presentation.ts` did not exist.
- **Cause**: This is the intentional TDD RED checkpoint before implementing the approved presentation contract.
- **Fix**: Add the minimal presenter implementation and rerun the identical focused test command.
- **Prevention**: Keep the presenter behavior covered by failing-first tests before adding production code.
- **Related tasks**: T1

## 2026-08-31: Validation explainability implementation — Expected Problems panel RED
- **Error**: Four new ProblemsPanel assertions failed: the unvalidated state had no actionable prompt, summary counts were absent, route details used raw rule IDs, and issue focus was not delegated.
- **Cause**: These are the intentional TDD RED assertions for the approved stale-aware report behavior; the existing panel only renders the old message/ID layout and raw selection fallback.
- **Fix**: Implement the report presentation, live-version comparison, and map-focus callback/action, then rerun the focused panel suite.
- **Prevention**: Keep report behavior covered at the component boundary, including targetless and unresolved issue cases.
- **Related tasks**: T2

## 2026-08-31: Validation explainability implementation — Problems panel assertion ambiguity
- **Error**: Two existing panel assertions became ambiguous after the report added summary/stale text: a broad `/error/i` query matched both summary and severity rows, and `/stale/i` also matched the fixture message.
- **Cause**: The new UI intentionally repeats those words in separate, meaningful locations.
- **Fix**: Narrowed the tests to `getAllByText` for the repeated severity word and the exact `● stale` indicator; no product behavior was changed.
- **Prevention**: Use region- or exact-text queries when a report intentionally repeats status vocabulary.
- **Related tasks**: T2

## 2026-08-31: Validation explainability implementation — Expected focus resolver RED
- **Error**: The new validation-focus resolver suite failed before running assertions because `src/components/studio/validation-focus.ts` did not exist.
- **Cause**: This is the intentional TDD RED checkpoint before implementing target-aware authored/derived geometry resolution.
- **Fix**: Add the pure resolver and rerun the identical focused test command before implementing the MapLibre overlay.
- **Prevention**: Keep coordinate-space conversion, derived-target handling, and unresolved-target safety covered independently of the UI lifecycle.
- **Related tasks**: T3

## 2026-08-31: Validation explainability implementation — Expected overlay RED
- **Error**: The new overlay lifecycle suite failed before running assertions because `src/components/studio/ValidationIssueOverlay.tsx` and its focus-store state were not implemented.
- **Cause**: This is the intentional TDD RED checkpoint before adding the temporary MapLibre source/layers and style-reload repaint path.
- **Fix**: Add the shared focus state and overlay lifecycle, then rerun the focused overlay suite.
- **Prevention**: Keep source/layer creation, repaint, clear, and style reload behavior covered with a map double before mounting the overlay in the real canvas.
- **Related tasks**: T3

## 2026-08-31: Validation explainability implementation — Graphify refresh permission failure
- **Error**: `graphify update .` failed after the validation focus overlay changes with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed checkout still does not permit Graphify to write or rebuild its generated output.
- **Fix**: No generated graph files were edited manually; the resolver/overlay focused tests remain independent verification evidence.
- **Prevention**: Retry Graphify after workspace permissions change and keep generated graph output out of manual source edits.
- **Related tasks**: T3

## 2026-08-31: Validation explainability implementation — Workspace test module-resolution RED
- **Error**: The new workspace integration test failed before its assertions because the existing `@navi/core` package import resolves a directory-style `types` module under the test runner's ESM rules.
- **Cause**: Importing `StudioWorkspace` pulls the package barrel into the test graph; this is an existing test-environment resolution constraint, not a validation behavior failure.
- **Fix**: Keep the test's core types type-only and adjust the workspace test harness/import boundary as needed before the next RED/GREEN run; do not change package resolution solely for this feature.
- **Prevention**: Run new workspace tests through the same alias/import path used by existing Studio tests and isolate runtime imports from type-only fixtures.
- **Related tasks**: T4

## 2026-08-31: Validation explainability implementation — Workspace integration RED
- **Error**: The workspace integration suite rendered the existing Studio shell, but Problems was not visible without an authored selection and its focus actions were unavailable.
- **Cause**: `StudioWorkspace` still gated ProblemsPanel behind `hasSelection`, did not expose the header action, and did not wire issue targets to selection, viewport, or temporary validation focus state.
- **Fix**: Add the approved workspace-level report visibility, header action, target-aware focus callback, camera movement, and non-persisted overlay wiring; rerun the identical suite.
- **Prevention**: Keep no-selection report visibility, authored selector shape, derived route compatibility state, camera action, and no-persistence assertions in the workspace test.
- **Related tasks**: T4

## 2026-08-31: Validation explainability implementation — Task 5 inspection working-directory error
- **Error**: The first Task 5 search ran from the repository root while addressing paths under `navi-next`, so PowerShell reported several validation test directories as missing.
- **Cause**: The checkout contains the application under the nested `navi-next` directory; the command used repository-root-relative source paths.
- **Fix**: Re-run the inspection from `C:\Users\Administrator\Desktop\CODEme\Navi\navi-next`; no product source was changed by the failed command.
- **Prevention**: Confirm the package root before every task-specific search and keep workflow files addressed from the repository root separately.
- **Related tasks**: T5

## 2026-09-04: Route connectivity audit parenthesized path probe
- **Error**: A read-only PowerShell `Get-Content` probe failed while opening `navi-next/src/app/(admin)/routes/page.tsx` because the unquoted parenthesized path was parsed as PowerShell syntax.
- **Cause**: The path was passed without `-LiteralPath` quoting around the argument.
- **Fix**: No app request or file data changed; rerun with the complete path supplied as a quoted literal.
- **Prevention**: Quote every Windows path containing parentheses before source inspection.
- **Related tasks**: T1, T2

## 2026-09-04: Route connectivity audit wildcard probe retry
- **Error**: A read-only `rg` probe passed a wildcard path for the editor context directory and Windows returned `os error 123`.
- **Cause**: The wildcard was received literally instead of being expanded by the shell.
- **Fix**: No source or data changed; rerun against explicit files and directories.
- **Prevention**: Do not pass wildcard file arguments to ripgrep on Windows.
- **Related tasks**: T3

## 2026-09-04: Route connectivity audit Vitest binary path probe
- **Error**: The first read-only focused Vitest command targeted `node_modules/.bin/vitest.cmd` at the workspace root, where that binary is not installed.
- **Cause**: This checkout keeps the application dependencies under `navi-next/node_modules`.
- **Fix**: No test body ran and no files changed; rerun using the explicit `navi-next/node_modules/.bin/vitest.cmd` path.
- **Prevention**: Resolve the project-local test runner location before invoking focused suites.
- **Related tasks**: T7

## 2026-09-04: Route connectivity audit focused intersection suite startup
- **Error**: The focused read-only Vitest run reached the runner but failed to start all three workers with `spawn EPERM`; zero tests executed.
- **Cause**: The managed Windows environment denied Vitest fork creation, matching the prior repository runner limitation.
- **Fix**: No source or test files changed; retain live API/A* evidence and classify this as runner-unavailable rather than a test result.
- **Prevention**: Record worker-start failures independently from assertions and use source-level plus live-graph evidence when the runner cannot initialize.
- **Related tasks**: T7

## 2026-09-04: Route connectivity audit live-tab accessibility probe
- **Error**: Two initial read-only browser click calls used an unsupported object shape and were rejected before any page action.
- **Cause**: The CUA tab API requires the accessibility element index as the direct argument.
- **Fix**: No page state changed in the rejected calls; the Diagnostics tab was then opened with the direct element index and inspected successfully.
- **Prevention**: Use the tab API’s documented direct accessibility-index form for live UI probes.
- **Related tasks**: T2, T7

## 2026-09-04: Route connectivity audit compiler characterization baseline
- **Error**: The thread-based read-only compiler road-junction suite ran 3 tests but reported 2 failures at `result.success` for crossing-road and single-road fixtures; one non-crossing test passed.
- **Cause**: The existing fixtures are rejected by current compiler validation before their junction assertions execute.
- **Fix**: No source or test files changed; retain the result as a compiler baseline limitation and rely on the passing legacy engine suite plus live graph evidence for this incident.
- **Prevention**: Assert compiler junction topology at the generator/graph boundary separately from end-to-end compile success.
- **Related tasks**: T4, T7

## 2026-09-04: Route connectivity audit API probe parser error
- **Error**: The first read-only PowerShell `Invoke-RestMethod` probe failed before issuing the localhost request with a missing-closing-parenthesis parser error.
- **Cause**: The diagnostic expression combined PowerShell array subexpressions and a pipeline inside a dense one-line command.
- **Fix**: No application request or data was changed; replace the dense expression with simple sequential variables and explicit output.
- **Prevention**: Keep Windows diagnostic probes syntactically simple and verify the command parser before interpreting endpoint behavior.
- **Related tasks**: T1, T2

## 2026-08-31: Validation explainability implementation — Task 5 test patch context mismatch
- **Error**: The first focused engine-test patch did not apply because its context used a slightly different existing test description.
- **Cause**: The patch matched on an assumed sentence rather than the exact source text (`returns a snapshot with valid state`).
- **Fix**: Reapply the test-only patch against the exact existing context; no source behavior was changed by the failed patch.
- **Prevention**: Inspect the exact nearby lines before applying narrow test patches.
- **Related tasks**: T5

## 2026-08-31: Validation explainability implementation — Graphify refresh permission failure
- **Error**: The required `graphify update .` checkpoint failed again with Windows `[WinError 5] Access is denied` after the workspace and snapshot identity changes.
- **Cause**: The managed checkout still does not permit Graphify to write or rebuild its generated output.
- **Fix**: No generated graph files were edited manually; focused tests and diff inspection remain the independent verification path.
- **Prevention**: Retry Graphify after workspace permissions are corrected and keep generated graph output out of manual source changes.
- **Related tasks**: T4, T5

## 2026-08-31: Validation explainability verification — Existing TypeScript syntax failure
- **Error**: `node_modules\\.bin\\tsc.cmd --noEmit` stops at `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255:3` with `TS1005: '}' expected`.
- **Cause**: The existing runtime test file has an unmatched brace outside the validation-explainability changes.
- **Fix**: No unrelated runtime test was modified; focused Vitest suites remain the source-level verification gate for this slice.
- **Prevention**: Repair the pre-existing runtime test syntax separately before using the repository-wide TypeScript check as a release gate.
- **Related tasks**: T6

## 2026-09-06: Phase 9B progress append context
- **Error**: The first append of the Phase 9B T1/T2 progress entry was rejected because the copied Phase 8B tail context did not match the literal file contents.
- **Cause**: The previous report path line contained inline markdown punctuation that was not copied exactly into the patch anchor.
- **Fix**: No product or progress content changed in the rejected attempt; reread the literal tail and appended against the exact current line.
- **Prevention**: Use a fresh tail read and a leading-space context line for append-only log patches.
- **Related tasks**: T2

## 2026-09-06: Phase 9B test patch string escaping
- **Error**: Two initial apply_patch calls for the Phase 9B public-store test were rejected by the JavaScript tool wrapper before reaching apply_patch.
- **Cause**: The test patch contained template-literal interpolation and backtick characters that were parsed by the orchestration wrapper.
- **Fix**: Rewrote the test fixture identifiers with ordinary string concatenation and applied the patch successfully; no production file was affected.
- **Prevention**: Avoid unescaped template-literal syntax in large patch payloads passed through the JavaScript wrapper.
- **Related tasks**: T3

## 2026-08-31: Validation explainability verification — Baseline lint noise
- **Error**: Targeted ESLint exits non-zero with existing `no-explicit-any`, ref-access, and hook-effect findings across the touched legacy files; it also identified an unused workspace import and a new synchronous no-engine state reset.
- **Cause**: The repository's lint configuration already reports findings in existing editor code, while the workspace import/reset were introduced by this slice.
- **Fix**: Remove the unused import and avoid the unnecessary no-engine reset; retain the existing baseline findings unchanged.
- **Prevention**: Keep new workspace code free of avoidable lint findings and continue using focused tests as the behavioral gate until the baseline lint debt is addressed separately.
- **Related tasks**: T6

## 2026-08-31: Validation explainability verification — False stale indicator RED
- **Error**: The new panel regression fails when `CampusDocument.version` and the independent `DocumentStore` commit revision differ: a matching validation snapshot is incorrectly rendered as `● stale`.
- **Cause**: `ProblemsPanel` compares `snapshot.documentVersion` to `useDocumentVersion()` instead of the document version used by `ValidationEngine`.
- **Fix**: Compare against `document.version` while retaining the document-store hook to trigger rerenders, then rerun the panel suite and live Validate flow.
- **Prevention**: Keep the separate-revision regression test so future changes cannot conflate document identity/version with UI commit notifications.
- **Related tasks**: T6

## 2026-08-31: Validation explainability verification — Raw route target IDs not mapped
- **Error**: On the live Studio route, entrance targets expose `Show on map`, but route-network targets do not; the route issue IDs are raw document IDs while the legacy GraphAdapter stores compiled nodes/edges with `N-route-` and `E-route-` prefixes.
- **Cause**: `resolveValidationFocus` looked up route targets only by their raw ID (`graph.getNode`/`graph.getEdge`), so the derived compatibility graph could not resolve valid authored route-network targets.
- **Fix**: Add resolver fallbacks for GraphAdapter route metadata and its prefixed edge IDs, with regression coverage; keep the original raw issue target for compatibility-state selection.
- **Prevention**: Test both canonical graph IDs and raw document route IDs at the resolver boundary, including live ProblemsPanel focusability.
- **Related tasks**: T6

## 2026-08-31: Validation explainability verification — Route resolver inspection path error
- **Error**: The first route-target inspection again used repository-root-relative `src/components/...` paths even though those files live under `navi-next`.
- **Cause**: Workflow files are rooted at `Navi`, while application source is rooted at `Navi\\navi-next`.
- **Fix**: Re-run the read from the application package root; no product source was changed by the failed inspection.
- **Prevention**: Keep root-level workflow paths and nested application paths explicit in every command.
- **Related tasks**: T6

## 2026-08-31: Validation explainability verification — Expected raw route resolver RED
- **Error**: The new resolver regression returned `null` for a valid raw route-node ID projected as `N-route-route-node-raw` (and therefore also could not resolve its prefixed edge).
- **Cause**: The resolver only attempted exact Graph IDs and had no GraphAdapter projection fallback.
- **Fix**: Add metadata/prefix lookup helpers for route nodes and edges, then rerun the resolver and live focus checks.
- **Prevention**: Keep raw-ID and canonical-ID route fixtures together at the resolver boundary.
- **Related tasks**: T6

## 2026-08-31: Validation explainability implementation — Expected document identity RED
- **Error**: The engine identity assertions received an empty `documentId` for both full and incremental validation snapshots instead of the campus metadata ID.
- **Cause**: Both `runFullValidation` and `runIncrementalValidation` still pass `documentId: ''` to `buildSnapshot`.
- **Fix**: Populate both snapshot paths from `document.metadata.campusId`, then rerun the identical engine suite.
- **Prevention**: Keep full and incremental document identity assertions together so a later optimization cannot regress one path independently.
- **Related tasks**: T5

## 2026-08-31: Validation explainability verification — Final Graphify refresh permission failure
- **Error**: The final required `graphify update .` checkpoint still fails with Windows `[WinError 5] Access is denied`.
- **Cause**: Generated Graphify output remains unwritable in the managed checkout.
- **Fix**: No generated graph files were edited; the final evidence is based on focused tests, clean browser behavior, console inspection, and source diff review.
- **Prevention**: Retry the Graphify refresh after permissions are corrected; do not manually modify generated graph output.
- **Related tasks**: T6

## 2026-08-31: Validation explainability verification — Browser control method mismatch
- **Error**: The first post-reload browser probe called tab-level `waitForTimeout`, `getByRole`, and `domSnapshot` methods that are exposed under the tab's Playwright surface instead.
- **Cause**: The browser client keeps navigation/screenshot methods on the tab and DOM/locator methods under `tab.playwright`.
- **Fix**: Reused the existing claimed tab with `studioTab.playwright` for the semantic controls and completed the live validation/focus verification.
- **Prevention**: Use the documented `tab.playwright` namespace for DOM snapshots and locators; use tab-level methods only for navigation, screenshots, and lifecycle actions.
- **Related tasks**: T6

## 2026-08-31: Validation explainability verification — Full-suite baseline failures
- **Error**: The full `npm test` run exits non-zero with 11 failed files and 18 failed tests, while 326 files and 4,000 tests pass (8 skipped).
- **Cause**: The existing dirty checkout contains unrelated compiler/route/topology/entrance characterization failures and missing `packages/editor/src/demo/golden-campus` imports; the failures are outside the validation explainability focused suites.
- **Fix**: Do not widen this slice into unrelated route/compiler repairs; preserve the green focused validation suite and report the full-suite boundary accurately.
- **Prevention**: Restore the repository baseline or isolate those existing changes before using the full suite as a release gate; retain the focused 8-file validation command as this slice's behavioral gate.
- **Related tasks**: T6

## 2026-08-31: Validation issue report dismissal — Focus selection was misclassified
- **Error**: Live `Show on map` focus selected the route node and moved the map, but the Problems report closed during the bridge's accompanying active-building selection update.
- **Cause**: The new selection-change dismissal effect treated the focus-induced compatibility/active-building selection as an ordinary user selection.
- **Fix**: Add a regression for the focus-induced selection transition and preserve the report only for the expected selection state(s) created by `Show on map`.
- **Prevention**: Keep issue-focus and ordinary component-selection cases separate in workspace tests and recheck both in the live route.
- **Related tasks**: T9

## 2026-08-31: Validation issue report dismissal — MapLibre style-diff warning
- **Error**: The live browser console emitted `Unable to perform style diff: Style is not done loading. Rebuilding the style from scratch.` during map interaction.
- **Cause**: MapLibre received a style operation while the basemap style was still loading; the map rebuilt the style and continued rendering.
- **Fix**: No product change was needed for this unrelated warning; the report dismissal and issue-focus checks completed, and no console errors were emitted.
- **Prevention**: Treat this as a known MapLibre timing warning unless it causes missing layers or failed interaction; investigate separately if it becomes reproducible outside style transitions.
- **Related tasks**: T7

## 2026-08-31: NAVI V1 cache architecture review — parenthesized path probe
- **Error**: A read-only `rg --files` inspection command failed when the `(public)` directory was passed without quoting; PowerShell interpreted `public` as a command token.
- **Cause**: Windows PowerShell path parsing for a directory containing parentheses.
- **Fix**: Re-ran the inspection with the parenthesized path quoted; no application source or generated output was changed by the failed probe.
- **Prevention**: Quote every explicit Windows path containing parentheses before invoking search or inspection commands.
- **Related tasks**: NAVI V1 local campus cache architecture review

## 2026-08-31: NAVI V1 cache architecture review — focused Vitest runner retry
- **Error**: One direct focused Vitest rerun stopped before test discovery with Windows `spawn EPERM` while Vite loaded `vitest.config.ts`.
- **Cause**: Intermittent managed-runner process-spawn restriction; no test assertion or application code failed.
- **Fix**: Re-ran the unchanged focused command with the approved elevated execution path; 2 files and 15 tests passed.
- **Prevention**: Distinguish runner startup failures from feature-test failures and use the direct Vitest binary with elevated execution when the managed runner blocks child-process startup.
- **Related tasks**: NAVI V1 local campus cache architecture review

## 2026-08-31: Validation issue report dismissal — Graphify refresh permission failure
- **Error**: The required post-change `graphify update .` checkpoint failed again with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed checkout still prevents Graphify from writing/rebuilding generated graph output.
- **Fix**: No generated graph files were edited manually; the focused tests and live browser verification remain the evidence for this change.
- **Prevention**: Retry Graphify after checkout permissions are corrected; keep generated graph output out of manual source edits.
- **Related tasks**: T7

## 2026-08-31: Validation issue report dismissal — Diff-check baseline formatting
- **Error**: The scoped `git diff --check` reports trailing whitespace in earlier Markdown hard-break lines in `spec/SPEC.md` and emits LF/CRLF normalization warnings; the new follow-up test files have no trailing-whitespace matches.
- **Cause**: Existing dirty documentation and Windows line-ending normalization are outside this interaction change.
- **Fix**: Do not rewrite unrelated documentation formatting; preserve the focused source change and record the baseline condition.
- **Prevention**: Normalize repository line endings and legacy Markdown formatting in a dedicated cleanup change before requiring a globally clean diff check.
- **Related tasks**: T7

## 2026-08-31: NAVI Capture Phase 0 audit — regression baseline
- **Error**: The root `npm test` baseline exits non-zero with 11 failed files and 18 failed tests, while 326 files and 4,004 tests pass (8 skipped). The runtime package baseline exits non-zero because `src/__tests__/data-identity-comparison.test.ts:255:3` has an unmatched brace; its other 28 files and 326 tests pass. A focused compiler group also has 3 failures in `compile-v2-integration.test.ts`.
- **Cause**: These are existing compiler/route/topology/entrance/UI-characterization failures, missing `packages/editor/src/demo/golden-campus` imports, and the pre-existing runtime test syntax error; no Capture code was introduced in this audit.
- **Fix**: Record the failures as baseline evidence and keep the audit implementation-free; do not repair unrelated systems as part of Phase 0.
- **Prevention**: Establish a clean or isolated branch baseline and make the focused Capture-impact suites plus the existing baseline suite explicit release gates before implementation.
- **Related tasks**: NAVI Capture Phase 0 impact audit

## 2026-08-31: NAVI Capture Phase 0 audit — assumed POI handler path
- **Error**: A source inspection command attempted to read `packages/editor/src/commands/poi-handlers.ts`, which does not exist.
- **Cause**: POI command registration is consolidated in the editor feature-handler module rather than a file with that assumed name.
- **Fix**: Treat the failed read as an inspection-only path error and use the actual command registry/feature-handler locations; no product source was changed.
- **Prevention**: Resolve command IDs through `packages/editor/src/commands/index.ts` and the registered handler module before addressing individual entity handlers.
- **Related tasks**: NAVI Capture Phase 0 impact audit

## 2026-08-31: NAVI Capture Phase 1 — skill path alias correction
- **Error**: The first attempt to load the Graphify and Superpowers skill files used paths under the project-local `.agents`/`.codex` directories and reported file-not-found errors.
- **Cause**: The session skill catalog aliases `r1` and `r10` resolve to the user-level skill roots, while the project-local directories do not contain those skill files.
- **Fix**: Read the skills from `C:\Users\Administrator\.agents\skills\graphify` and `C:\Users\Administrator\.codex\plugins\cache\openai-curated-remote\superpowers\6.3.0\skills` before continuing; no product source was changed.
- **Prevention**: Resolve the catalog's skill-root mapping before reading a named skill and keep project source paths separate from skill-resource paths.
- **Related tasks**: T1

## 2026-08-31: NAVI Capture Phase 1 — Vitest startup permission error
- **Error**: The first T2 RED command reached Vitest but failed while Vite loaded `vitest.config.ts` with `Error: spawn EPERM`, before the Capture tests ran.
- **Cause**: The npm wrapper's Vite config externalization process could not spawn in the managed Windows runner for that invocation.
- **Fix**: Keep the product tests unchanged and retry through the already-approved direct `node_modules\\.bin\\vitest.cmd run` entry point.
- **Prevention**: Use the direct repository test binary when the npm wrapper fails before test discovery, and distinguish runner startup failures from feature-test failures.
- **Related tasks**: T2

## 2026-08-31: NAVI Capture Phase 1 — candidate-route fixture mismatch
- **Error**: The first T2 GREEN run rejected the valid format fixture because its candidate route omitted the required `edgeCount` field.
- **Cause**: The test fixture was written before the final candidate-route shape was encoded in `types.ts`.
- **Fix**: Added `edgeCount: 0` to the one-point candidate fixture; no production behavior was changed.
- **Prevention**: Keep shared domain fixtures synchronized with the complete schema before running round-trip tests.
- **Related tasks**: T2

## 2026-08-31: NAVI Capture Phase 1 — marker fixture without a GPS position
- **Error**: The first T5 shell test attempted to add a marker to a new session with no current GPS position, so the store correctly kept the marker list empty.
- **Cause**: The test did not simulate the foreground recorder delivering a sample before opening the marker flow.
- **Fix**: Seeded one raw sample in the shell test before dropping the POI; no product behavior was changed.
- **Prevention**: Keep marker UI tests explicit about the required current-position precondition.
- **Related tasks**: T5

## 2026-08-31: NAVI Capture Phase 1 — local Next dev-server spawn permission error
- **Error**: The mobile smoke-test server command failed before listening because Next.js reported Windows `Error: spawn EPERM`.
- **Cause**: The managed sandbox prevented the Next dev process from spawning its child server process, matching the earlier Vitest wrapper startup restriction.
- **Fix**: Product tests remain unchanged; retry the same approved `npm run dev -- -p 3000` command with escalated execution so browser verification can run.
- **Prevention**: Treat server startup as an environment gate and keep a direct focused-test path available when the sandbox cannot spawn development subprocesses.
- **Related tasks**: T7

## 2026-08-31: NAVI Capture Phase 1 — existing dev server occupied port
- **Error**: The escalated retry of `npm run dev -- -p 3000` reported `EADDRINUSE` because port 3000 was already serving the application.
- **Cause**: A pre-existing local Next development server was running, so no second server could bind the same port.
- **Fix**: Reused the existing server for browser verification; no process was stopped and no product source was changed.
- **Prevention**: Check for an already-running local server before starting another process during browser smoke tests.
- **Related tasks**: T7

## 2026-08-31: NAVI Capture Phase 1 — mobile admin shell overflow
- **Error**: The first 390px mobile smoke screenshot showed the Capture content constrained beside the existing 200px admin sidebar, with horizontal clipping and unusable narrow controls.
- **Cause**: `AppLayout` had no narrow-viewport treatment for the new Capture screen and always rendered its desktop sidebar.
- **Fix**: Add a Capture-scoped responsive shell class that hides the desktop sidebar and trims header-only context on narrow viewports; no Studio/editor state or behavior changes are involved.
- **Prevention**: Include the shared admin shell in mobile viewport checks whenever a new authenticated admin route is introduced.
- **Related tasks**: T7

## 2026-08-31: NAVI Capture Phase 1 — map cleanup after context teardown
- **Error**: Finishing a recording and mounting Review caused a runtime TypeError in `RecordingMap.tsx` because cleanup attempted `map.getLayer` after the map context had already been torn down.
- **Cause**: The Capture layer effect assumed its MapLibre instance would remain available for passive unmount cleanup, but the parent `NavigationMap` lifecycle can clear that context first.
- **Fix**: Add a failing cleanup-boundary regression, then make Capture layer removal tolerate a null/undefined or already-unavailable map before querying layers/sources.
- **Prevention**: Treat MapLibre cleanup as best-effort and test the teardown boundary separately from layer rendering.
- **Related tasks**: T7

## 2026-08-31: NAVI Capture Phase 1 — scoped typecheck baseline boundary
- **Error**: The temporary JSX typecheck reports four existing `packages/core` export/type errors and test-only matcher typings, while no Capture production diagnostic remains.
- **Cause**: The dirty checkout’s core barrel/entity types are already inconsistent, and the narrowed temporary tsconfig did not include the global Testing Library matcher setup.
- **Fix**: Remove the temporary config after checking; keep the unrelated core/test setup unchanged and use the clean Capture production typecheck plus focused Vitest suites as this slice’s type/behavior evidence.
- **Prevention**: Repair the repository-wide type baseline separately and include the normal test setup when creating future scoped JSX checks.
- **Related tasks**: T7

## 2026-08-31: NAVI Capture Phase 1 — quoted Capture test path
- **Error**: The first final Capture-suite command failed before Vitest startup because PowerShell interpreted the parenthesized `src/app/(admin)/capture` path as a command token.
- **Cause**: The explicit Windows path was not quoted in the command string.
- **Fix**: Reran the same Capture suite with the parenthesized route path quoted; 8 files and 15 tests passed.
- **Prevention**: Quote every explicit Windows path containing parentheses before running final verification commands.
- **Related tasks**: T7

## 2026-08-31: NAVI Capture Phase 1 — production build baseline blockers
- **Error**: `npm run build` did not complete: Next.js could not fetch Google Geist fonts in the restricted environment, and the existing `/demo/navigate` client dependency graph attempts to bundle Node `fs` from `packages/runtime/src/loader/package-reader.ts`.
- **Cause**: Network access to Google Fonts is unavailable and the pre-existing NAVI Web/demo runtime import path is not browser-build-safe; the failure trace does not include Capture code.
- **Fix**: Do not alter the runtime or demo build path in Phase 1; use the passing Capture tests, targeted lint/type checks, and live route smoke test as evidence for this isolated slice.
- **Prevention**: Resolve the runtime browser-bundle boundary and self-host/avoid remote fonts in a separate baseline/build task before using a clean production build as a release gate.
- **Related tasks**: T7

## 2026-08-31: NAVI V1 cache C3 — legacy loading guard regression
- **Error**: The focused public-store suite started a network request when a caller had already set `campusLoading: true` but the new in-flight registry was empty.
- **Cause**: The cache-first action relied only on its closure-local request registry and had removed the previous state-based loading guard.
- **Fix**: Restore the state-based no-op when loading is already active without a tracked request; tracked requests for a different campus can still supersede one another through request identity.
- **Prevention**: Keep compatibility guards for legacy bootstrap callers and cover both duplicate tracked requests and externally observed loading state.
- **Related tasks**: C3

## 2026-08-31: NAVI V1 cache C4 — Graphify refresh permission boundary
- **Error**: The required `graphify update .` attempt failed during code-file re-extraction with Windows `[WinError 5] Access is denied`.
- **Cause**: The local Graphify rebuild process could not access its generated/output path in the dirty Windows checkout.
- **Fix**: Leave generated Graphify output untouched and use the focused test/lint/diff gates for this implementation verification.
- **Prevention**: Resolve the local Graphify file-permission boundary before relying on incremental graph refresh as a release gate.
- **Related tasks**: C4

## 2026-08-31: NAVI V1 cache C4 — PowerShell regex inspection typo
- **Error**: An initial `rg` inspection command failed before searching because its quoted alternation was malformed.
- **Cause**: A nested quote/parenthesis in the ad-hoc search expression was truncated by PowerShell parsing.
- **Fix**: Reran the inspection with a simpler quoted expression; no source files were affected.
- **Prevention**: Prefer separate fixed-string searches or simpler expressions for Windows path inspection.
- **Related tasks**: C4

## 2026-08-31: NAVI V1 cache C4 — repository typecheck baseline blocker
- **Error**: The final nested-repository `tsc --noEmit --pretty false` check stopped on `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3): error TS1005: '}' expected`.
- **Cause**: The dirty checkout contains a pre-existing syntax error in an unrelated runtime test file.
- **Fix**: Leave the unrelated runtime test unchanged and use the passing scoped Vitest and ESLint gates for the cache boundary.
- **Prevention**: Repair the repository-wide runtime test baseline separately before treating full typecheck as a release gate.
- **Related tasks**: C4

## 2026-08-31: NAVI V1 cache C4 — final Graphify refresh retry
- **Error**: The required post-cleanup `graphify update .` retry failed again during re-extraction with Windows `[WinError 5] Access is denied`.
- **Cause**: The same local Graphify generated-output permission boundary persisted after the source verification pass.
- **Fix**: Kept generated graph files unchanged; no source verification gate depends on this unavailable refresh.
- **Prevention**: Correct Graphify output permissions before the next architecture update.
- **Related tasks**: C4

## 2026-08-31: NAVI Capture Phase 2A — unavailable UI design-system script
- **Error**: The UI/UX skill's documented `search.py` design-system command could not run because the bundled script path was not present in the installed skill package.
- **Cause**: The skill package contains a path placeholder for `scripts` rather than the referenced Python utility.
- **Fix**: Read and applied the available UI/UX guidance directly; no application source or design-system files were generated.
- **Prevention**: Restore or expose the referenced UI/UX search utility before relying on automated design-system output in a future task.
- **Related tasks**: Phase 2A planning

## 2026-08-31: NAVI Capture Phase 2A — reviewer test text ambiguity
- **Error**: The Capture Reviewer test initially used single-element text queries for labels rendered in both the session row and selected-session summary.
- **Cause**: The reviewer intentionally repeats the source label and session title in two visible regions.
- **Fix**: Use role-specific heading queries and an explicit multi-match assertion for the repeated source label.
- **Prevention**: Prefer semantic roles or scoped/multi-match Testing Library queries when a responsive workspace repeats metadata.
- **Related tasks**: T4

## 2026-08-31: NAVI Capture Phase 2A — repeated GPS warning labels
- **Error**: The reviewer test's broad warning-text query matched the session summary, layer toggle, section heading, and warning count.
- **Cause**: GPS warning metadata is intentionally visible in multiple reviewer surfaces.
- **Fix**: Scope the assertion to the semantic `GPS warnings` section heading.
- **Prevention**: Use semantic role/name queries for repeated reviewer metadata instead of broad regex text queries.
- **Related tasks**: T4

## 2026-08-31: NAVI Capture Phase 2A — unquoted lint route path
- **Error**: The first scoped ESLint command was parsed by PowerShell before ESLint started.
- **Cause**: The `src/app/(admin)/studio/capture-review/page.tsx` argument contained unquoted parentheses.
- **Fix**: Quote the route path and rerun the same lint command.
- **Prevention**: Quote every Windows verification path containing parentheses.
- **Related tasks**: T4

## 2026-08-31: NAVI Capture Phase 2A — scoped typecheck surfaced mixed-shape types
- **Error**: The first reviewer production typecheck reported mixed Capture/campus coordinate property access and a missing `maplibre-gl` `AnyLayer` type, alongside unrelated core/editor errors.
- **Cause**: The map bound calculation accepted two coordinate shapes without narrowing, and the installed MapLibre typings expose layer types through the map API rather than an `AnyLayer` export.
- **Fix**: Add a local coordinate narrowing helper, use the map library's accepted layer type shape, and exclude reviewer tests from the production-only config.
- **Prevention**: Run scoped production TypeScript checks with explicit source includes and narrow external-library unions at the boundary.
- **Related tasks**: T4, T5

## 2026-08-31: NAVI Capture Phase 2A — post-edit Graphify refresh blocked
- **Error**: The required `graphify update .` command failed during code re-extraction with Windows `[WinError 5] Access is denied`.
- **Cause**: The local Graphify rebuild process cannot access its generated/output path in the dirty Windows checkout.
- **Fix**: Leave generated Graphify output untouched and continue with focused tests, lint, type diagnostics, browser smoke verification, and regression scans.
- **Prevention**: Resolve Graphify output permissions before relying on incremental graph refresh as a release gate.
- **Related tasks**: T5

## 2026-08-31: NAVI Capture Phase 2A — mobile reviewer minimum-width overflow
- **Error**: The first mobile smoke screenshot showed the Reviewer content clipped horizontally beside the existing Studio sidebar.
- **Cause**: Reviewer rail and workspace cards used fixed minimum widths that exceeded the remaining phone-sized content column.
- **Fix**: Bound reviewer flex-item minimum widths with CSS `min(..., 100%)` so cards can wrap inside the available column.
- **Prevention**: Inspect responsive screenshots at the actual content width, including persistent application navigation, not just the viewport width.
- **Related tasks**: T5

## 2026-08-31: NAVI Capture Phase 2A — runtime suite used root config
- **Error**: The first runtime-focused Vitest command reported no test files found.
- **Cause**: The root Vitest configuration does not include `packages/runtime`; the runtime package has its own test boundary.
- **Fix**: Rerun the same runtime paths from the runtime package with its package-local configuration.
- **Prevention**: Run workspace-package suites from their package root or pass the package-local Vitest config explicitly.
- **Related tasks**: T5

## 2026-08-31: NAVI Capture Phase 2A — runtime package Vitest startup boundary
- **Error**: The runtime package-local focused Vitest run failed before discovery with `spawn EPERM` while loading its config.
- **Cause**: The managed Windows runner blocked the Vite config externalization child process, matching the Phase 1 baseline startup failure.
- **Fix**: Retry the same package-local test command with the approved elevated execution path; do not change runtime code or test configuration.
- **Prevention**: Keep the direct package-local Vitest command and an approved elevated fallback recorded for runtime regression gates.
- **Related tasks**: T5

## 2026-08-31: NAVI Capture Phase 2A — unrelated baseline whitespace
- **Error**: A broad `git diff --check` included pre-existing trailing-space lines in `spec/SPEC.md`.
- **Cause**: The dirty checkout contains legacy Markdown hard-break formatting outside the Phase 2A paths.
- **Fix**: Leave the unrelated specification unchanged and rerun whitespace checks only against Phase 2A and its navigation entry.
- **Prevention**: Scope diff hygiene checks to the implementation files when the shared checkout contains known legacy formatting.
- **Related tasks**: T5

## 2026-08-31: NAVI V1 cache browser verification — storage inspection boundary
- **Error**: The in-app and connected Chrome browser-control evaluation contexts exposed no `indexedDB` object, so direct IndexedDB record inspection was unavailable.
- **Cause**: The browser-control bridge provides a restricted page-evaluation global surface even though normal DOM interaction works.
- **Fix**: Kept the browser check read-only and reported the cache/reload scenario as unverified rather than inferring persistence from visual rendering.
- **Prevention**: Run the same scenario in a normal DevTools context or provide a published fixture plus an observable cache-status diagnostic.
- **Related tasks**: C5, C6

## 2026-08-31: NAVI V1 cache browser verification — live dataset limitation
- **Error**: The active public-campus API returned `source: graph_snapshots`, no revision, and no search index; the other listed campus returned `source: empty`.
- **Cause**: No listed live campus currently resolves to a published runtime package suitable for the V1 published-only cache policy.
- **Fix**: Did not seed or modify campus data; completed only the interactions supported by the live graph-snapshot campus and left cache persistence/search verification open.
- **Prevention**: Provision a published campus fixture before the next browser cache acceptance run.
- **Related tasks**: C5, C6

## 2026-08-31: NAVI V1 cache browser verification — evaluation/API inspection attempts
- **Error**: Read-only performance inspection lacked the expected `performance` global, direct API-tab navigation was blocked by the browser client, and one PowerShell result-building command had an empty pipeline element.
- **Cause**: Browser-control evaluation/API restrictions and an ad-hoc PowerShell syntax typo.
- **Fix**: Used DOM snapshots, screenshots, browser console logs, and local `Invoke-WebRequest` checks instead; no application or data changes were made.
- **Prevention**: Prefer documented DOM/console checks and pre-validated shell expressions for future browser verification.
- **Related tasks**: C5, C6

## 2026-08-31: Road save diagnosis — browser locator timeout during cleanup
- **Error**: A browser-control selector timed out while the selected road properties panel was remounting after a reload; the interaction did not produce a product runtime error.
- **Cause**: The retained locator resolved against a transient React render while the road selection/panel changed.
- **Fix**: Re-read the visible DOM, acquired a fresh semantic locator, completed the cleanup, and verified the original road label after another reload.
- **Prevention**: Treat a remount as stale browser state, inspect before retrying, and use a fresh locator scoped to the currently visible control.
- **Related tasks**: Road save/persistence diagnosis

## 2026-08-31: NAVI Capture Phase 2A — final Graphify retry blocked
- **Error**: The required final `graphify update .` retry again failed during code re-extraction with Windows `[WinError 5] Access is denied`.
- **Cause**: The local Graphify generated/output path remains inaccessible in the shared dirty checkout.
- **Fix**: Kept generated graph output unchanged; all Phase 2A source and behavior gates were verified independently.
- **Prevention**: Resolve the Graphify output permission boundary before the next architecture update or use of graph refresh as a release gate.
- **Related tasks**: T5

## 2026-08-31: Road endpoint load sync — plain graph-shaped test fixture
- **Error**: The new EditorBridge mount synchronization called `GraphAdapter.sync()` against an existing test fixture whose `graph` value was a plain object, causing `this.graph.setBuildings is not a function`.
- **Cause**: The production store normally holds a `Graph` instance, while the existing selection test intentionally supplies a minimal graph-shaped object.
- **Fix**: Add a runtime method guard so load-time derived-graph synchronization runs only when the store value exposes the `Graph` mutation API.
- **Prevention**: Keep bridge tests for both the real `Graph` runtime and legacy/minimal store-shaped fixtures before adding mount effects.
- **Related tasks**: Road endpoint persistence T3

## 2026-08-31: Road endpoint regression RED gate
- **Error**: The new endpoint/persistence regression tests initially failed: endpoint markers were absent, road trace metadata was not round-tripping, and the adapter did not expose edited endpoint positions.
- **Cause**: Trace compilation did not mark authored endpoints, the renderer only recognized shared intersection markers, and GraphAdapter omitted road metadata when projecting Road → Trace.
- **Fix**: Add separate `roadEndpoint` metadata, render it through the existing connection-point layer, preserve road metadata in the adapter, and add explicit road Save changes / Enter handling.
- **Prevention**: Keep compiler, adapter round-trip, renderer predicate, and property-save tests together as the road edit regression gate.
- **Related tasks**: Road endpoint persistence T2, T3, T4

## 2026-08-31: Road endpoint task — scoped ESLint baseline
- **Error**: The final scoped ESLint command reported 34 errors and 6 warnings across the selected files, primarily pre-existing explicit `any` usages and React ref-hook diagnostics in existing code.
- **Cause**: The shared dirty checkout already contains those baseline diagnostics; the new endpoint predicate and mount-sync code did not introduce a new lint category, and the changed test files already used `any` before this task.
- **Fix**: Leave unrelated lint debt untouched and use the passing focused Vitest suite plus live browser/API verification as the behavior gates for this narrowly scoped fix.
- **Prevention**: Establish a clean lint baseline or separate pre-existing diagnostics before using repository lint as a blocking gate for future editor changes.
- **Related tasks**: Road endpoint persistence T2, T3, T4, T5

## 2026-08-31: Road endpoint task — Graphify refresh blocked
- **Error**: The required post-edit `graphify update .` command failed during code re-extraction with Windows `[WinError 5] Access is denied`.
- **Cause**: The local Graphify generated/output path remains inaccessible in the shared checkout.
- **Fix**: Kept generated graph output unchanged; source behavior was verified with focused tests, live editor state, persisted API data, and reload verification.
- **Prevention**: Resolve Graphify output permissions before relying on incremental graph refresh as a release gate.
- **Related tasks**: Road endpoint persistence T5

## 2026-08-31: NAVI Capture Phase 2B audit — initial inspection path probes
- **Error**: Two initial read-only probes used guessed paths for the entrance-access module and editor context file; those paths did not exist.
- **Cause**: The repository uses packages/core/src/entrance-access.ts and a context filename/extension different from the guessed probe.
- **Fix**: Re-ran targeted inspection against the existing paths and verified the command, transformer, and context findings from source.
- **Prevention**: Query Graphify first, then resolve an exact file path from the graph or a narrow directory listing before opening a source file.
- **Related tasks**: T1

## 2026-08-31: NAVI Capture Phase 2B audit — Graphify refresh blocked
- **Error**: The required post-document graphify update failed during code re-extraction with Windows [WinError 5] Access is denied.
- **Cause**: The local Graphify generated/output path remains inaccessible in the shared dirty checkout.
- **Fix**: Kept generated graph output untouched and used the successful targeted source query plus document/diff verification as the audit evidence.
- **Prevention**: Resolve Graphify output permissions before relying on an incremental graph refresh as a release gate.
- **Related tasks**: T5

## 2026-08-31: NAVI Capture Phase 2B audit — verification path qualification
- **Error**: The first final artifact check looked for nested audit documents relative to the root repository and reported them missing.
- **Cause**: The report and plan are inside the nested navi-next repository, so the root-relative paths require the navi-next prefix.
- **Fix**: Qualified the nested paths and reran the verification; the documents were present.
- **Prevention**: Keep root-repository and nested-repository working directories explicit in every scoped verification command.
- **Related tasks**: T5

## 2026-08-31: NAVI Capture Phase 2B audit — verifier path expression retry
- **Error**: A retry that constructed nested audit paths through a PowerShell array expression still reported the existing documents as missing.
- **Cause**: The composed path expression was not resolving the nested path values as intended in that command.
- **Fix**: Replaced the composed values with explicit literal paths; the complete artifact verification then passed.
- **Prevention**: Use explicit qualified paths in cross-repository verification commands and test the path itself before applying collection logic.
- **Related tasks**: T5

## 2026-08-31: Road endpoint routing investigation — original route tab unavailable
- **Error**: After browser reconnect, the existing `/routes` tab was not exposed through the browser-control binding; the visible tab list exposed only the Studio editor tab.
- **Cause**: Browser-control state did not retain the original route tab in the current binding.
- **Fix**: Opened a fresh same-origin `/routes` tab, waited for asynchronous campus hydration, and identified the live campus graph and route state from DOM/API evidence. No application state was changed.
- **Prevention**: Treat a fresh fallback tab as separate verification context and explicitly record the limitation instead of claiming inspection of the original tab.
- **Related tasks**: Road endpoint routing investigation T1

## 2026-08-31: Road endpoint routing investigation — trace endpoint order and chain alignment
- **Error**: The live graph did not connect final endpoint `N4495` to the nearby secondary-road segment, and the reported road edit could throw `Cannot read properties of undefined (reading 'from')` in `Graph.syncTraceIntersections`.
- **Cause**: `compileTrace` inserts the two authored endpoints before interior points, but intersection sync uses the first and last compiled nodes as endpoints. Separately, chain construction compacts found edges instead of retaining authored segment indexes; shared/split junctions leave fewer direct edges than segments, making `chain.edges[sj]` unsafe and potentially misaligned.
- **Fix**: No production fix was applied during this diagnosis. The endpoint omission and save-time crash are isolated for the next implementation task; A* was not changed.
- **Prevention**: Preserve authored point order for endpoint selection, keep node/segment alignment explicit, validate every chain segment before dereferencing an edge, and add live-shaped regression fixtures for `N4495` and shared junctions.
- **Related tasks**: Road endpoint routing investigation T2, T3, T4

## 2026-08-31: Road endpoint routing investigation — ad-hoc geometry probe retries
- **Error**: One read-only PowerShell topology probe used an empty pipeline expression, and an initial clamp helper selected an integer overload that reported a segment endpoint instead of the floating-point closest point.
- **Cause**: Two inspection-script syntax/typing mistakes; neither touched application state.
- **Fix**: Replaced the pipeline with an explicit result array, used explicit floating-point clamping, and reran the distance calculation. The final measurement placed `N4495` about 0.1 m from the first `T-1-ddva` segment.
- **Prevention**: Prefer small explicit inspection scripts and validate intermediate coordinates before using derived distance results as evidence.
- **Related tasks**: Road endpoint routing investigation T1, T3

## 2026-08-31: Road endpoint repair — expected RED regressions
- **Error**: The new endpoint-order test reported the final branch endpoint without `connectionNode`, and the split-chain test reproduced `Cannot read properties of undefined (reading 'from')`.
- **Cause**: These are the intentional TDD RED checkpoints: `syncTraceIntersections` selects compiled-node array positions instead of authored trace endpoints and indexes a compacted edge list by an original segment index.
- **Fix**: Production changes have not yet been applied; implement the two isolated invariant repairs and rerun the identical focused suite.
- **Prevention**: Keep both regression cases in the focused graph suite and require them to pass before claiming the route repair.
- **Related tasks**: Road endpoint repair T1, T2

## 2026-08-31: Road endpoint repair — unrelated routing-validation baseline
- **Error**: The broader routing-validation suite reported 3 failures in legacy entrance-to-hallway and cross-building fixture assertions, while the graph endpoint/adapter tests passed.
- **Cause**: The fixture's existing room-door/hallway projection does not produce the expected hallway neighbors; this test path contains no existing-trace intersection for the endpoint-order change to affect, and the failures are outside the repaired graph invariant.
- **Fix**: No unrelated entrance/door behavior was changed. Keep the 3 baseline failures separate and use the focused graph/adapter suite plus live route/editor checks for this task.
- **Prevention**: Establish the routing-validation fixture baseline independently before using that suite as a gate for road-intersection changes.
- **Related tasks**: Road endpoint repair T2, T3

## 2026-08-31: NAVI Capture Phase 2C — intentional TDD RED gate
- **Error**: The new outdoor Capture import contract suites initially failed during module resolution (`../adapter` and `../manifest` did not exist); 2 files failed with 0 tests collected.
- **Cause**: Production adapter and manifest modules were intentionally not present when the tests were added.
- **Fix**: Proceed with the planned test-first implementation of the Capture-owned adapter and sidecar modules.
- **Prevention**: Keep the RED result recorded before writing production import code, then rerun the same focused suites as the GREEN gate.
- **Related tasks**: Phase 2C T2

## 2026-08-31: NAVI Capture Phase 2C — duplicate fixture selection mismatch
- **Error**: The first adapter assertion expected one manifest entry after selecting only `segment-0`, but the test fixture left the other segments unspecified and therefore included by the Reviewer default.
- **Cause**: The test did not mirror the existing review-selection contract, where omitted route decisions mean included.
- **Fix**: Explicitly marked `segment-1` and `segment-2` excluded in the duplicate test fixture.
- **Prevention**: Make selected-segment tests specify every candidate segment when asserting exact command or manifest counts.
- **Related tasks**: Phase 2C T2

## 2026-08-31: NAVI Capture Phase 2C — batch executor RED gate
- **Error**: The new editor transaction tests failed because `CommandDispatcher.executeBatch` did not exist; 2 tests failed with 0 successful assertions.
- **Cause**: The transaction capability is the intentional TDD target for Phase 2C atomic import.
- **Fix**: Implement the smallest dispatcher/document-store batch boundary and rerun the focused editor and Capture import suites.
- **Prevention**: Keep batch atomicity separate from EventBus notification batching and retain a regression test for ordinary `execute()`.
- **Related tasks**: Phase 2C T3

## 2026-08-31: NAVI Capture Phase 2C — rollback left runtime journal key
- **Error**: The first batch rollback test restored roads and version but left the handler-created `_changeJournal` property on the document, so the snapshot was not exact.
- **Cause**: `Object.assign` does not remove object keys that are absent from the rollback snapshot.
- **Fix**: Make the editor-owned `DocumentStore.restore` clear current document keys before assigning the cloned snapshot.
- **Prevention**: Assert deep snapshot equality, including optional runtime-only fields, in transaction rollback tests.
- **Related tasks**: Phase 2C T3

## 2026-08-31: NAVI Capture Phase 2C — reviewer RED fixture isolation
- **Error**: The new reviewer import test could not find its planned `Review import` action, and the added map test inherited a throwing `getLayer` mock from the preceding teardown test.
- **Cause**: Import UI was intentionally not implemented yet, and the shared MapLibre test double reset call history but not its per-test implementation.
- **Fix**: Implement the host-gated import preview, and reset the map mock implementation in `beforeEach` before rerunning the reviewer/map suites.
- **Prevention**: Keep RED UI assertions explicit and reset both mock history and behavior when a teardown test changes a shared mock.
- **Related tasks**: Phase 2C T4

## 2026-08-31: NAVI Capture Phase 2C — unquoted route probe
- **Error**: A read-only `rg` probe against the new `(admin)` route path was parsed by PowerShell as the command token `admin` and failed before inspecting files.
- **Cause**: The parenthesized Windows path was not passed as a quoted literal.
- **Fix**: No source change; rerun the probe with `-LiteralPath`/quoted paths.
- **Prevention**: Quote every route path containing `(admin)` in PowerShell verification commands.
- **Related tasks**: Phase 2C T4, T5

## 2026-08-31: NAVI Capture Phase 2C — scoped lint new diagnostic
- **Error**: The first scoped ESLint run reported a new `no-explicit-any` diagnostic for the batch result accumulator, alongside one pre-existing `execute()` return-type diagnostic.
- **Cause**: The new dispatcher code used `any[]` before importing the existing `MutationResult` type.
- **Fix**: Typed the accumulator as `MutationResult[]`; the remaining dispatcher diagnostic is pre-existing and unchanged.
- **Prevention**: Run scoped lint immediately after adding editor boundary code and reuse declared mutation result types.
- **Related tasks**: Phase 2C T3, T5

## 2026-08-31: NAVI Capture Phase 2C — assumed route test path
- **Error**: A read-only probe looked for `src/app/(admin)/studio/[id]/edit/page.test.tsx`, but the repository has no test at that path.
- **Cause**: The existing edit page has no colocated test; the route convention was inferred from the page path instead of resolved first.
- **Fix**: No production change; add the new route test at its actual new path and keep the probe paths explicit.
- **Prevention**: Resolve exact route files with a literal recursive listing before opening a presumed test file.
- **Related tasks**: Phase 2C T4, T5

## 2026-08-31: Road endpoint repair — graphify refresh permission failure
- **Error**: The required post-change `graphify update .` refresh could not rebuild the index and returned `[WinError 5] Access is denied`.
- **Cause**: The local graphify cache/output is not writable by the Windows process in this checkout; this is the same repository-level permission failure recorded by earlier sessions.
- **Fix**: Did not modify or delete generated graphify files. Continued with the source-focused tests and live browser verification, which do not depend on a refreshed index.
- **Prevention**: Treat graphify refresh as a separately reported environment check and never repair its cache with destructive commands during an application task.
- **Related tasks**: Road endpoint repair T3

## 2026-08-31: NAVI Capture Phase 2C — sandboxed Vitest spawn failure
- **Error**: The final focused Vitest command failed while loading `vitest.config.ts` with Windows `spawn EPERM`, before collecting tests.
- **Cause**: Vite's config externalization subprocess was blocked by the default command sandbox.
- **Fix**: No source change; rerun the identical test command with the approved elevated test permission.
- **Prevention**: When Vitest fails before collection with `spawn EPERM`, distinguish the environment failure from test assertions and use the approved test execution permission.
- **Related tasks**: Phase 2C T5

## 2026-08-31: NAVI Capture Phase 2C-S — literal route path probe
- **Error**: A read-only `Get-Content` probe reported that the normal and Reviewer page paths did not exist.
- **Cause**: PowerShell treated the dynamic `[id]` route segment as a wildcard because the path was not passed with `-LiteralPath`.
- **Fix**: Reran the source inspection with `Get-Content -LiteralPath`; both routes were present and confirmed as separate `EditorBridge` mounts.
- **Prevention**: Use `-LiteralPath` for Next.js dynamic route files containing `[ ]` during PowerShell inspection.
- **Related tasks**: Phase 2C-S T1

## 2026-08-31: NAVI Capture Phase 2C-S — browser file chooser timeout
- **Error**: The in-app browser file chooser timed out after clicking the visible Capture upload control, and the browser-control session reset.
- **Cause**: The local browser automation surface did not expose the native chooser event for this hidden file input in the current tab.
- **Fix**: No application state changed; reconnect to the authenticated tab and use the supported upload fallback before continuing manual QA.
- **Prevention**: Treat native chooser operations as tooling-sensitive, catch chooser timeouts, and verify the tab/document state before retrying.
- **Related tasks**: Phase 2C-S T4

## 2026-08-31: NAVI Capture Phase 2C-S — malformed manual QA fixture
- **Error**: The first temporary manual-history capture upload was rejected with `schemaVersion is unsupported`.
- **Cause**: The fixture used the envelope key `version`; the Capture parser requires top-level `schemaVersion`.
- **Fix**: Corrected only the temporary fixture to match `serializeCaptureSession`; no application code or Studio document changed.
- **Prevention**: Generate manual QA packages through the existing serializer contract or validate the envelope key before upload.
- **Related tasks**: Phase 2C-S T4

## 2026-08-31: Navi Admin Responsive Audit — mock session dropped mid-matrix

- **Error**: During the first desktop route matrix, navigation from Route
  Testing to Capture redirected to `/login`, so the initial desktop readings for
  Capture, Studio, Panoramas, and QR were not valid.
- **Cause**: The active mock-auth session was no longer available to middleware
  after the earlier route sequence; this was an environment/session boundary,
  not a responsive assertion.
- **Fix**: Re-entered the visible Dr. Admin mock session, navigated back to the
  dashboard, and reran every affected route before using its evidence.
- **Prevention**: Check the final URL after every route load and discard any
  measurement captured on the login surface.
- **Related tasks**: Responsive Audit T2

## 2026-08-31: Navi Admin Responsive Audit — dirty-worktree isolation limit

- **Error**: A repository-wide clean diff could not isolate this audit's
  changes because the shared root and nested `navi-next` checkout already
  contain extensive unrelated source, generated, and documentation changes.
- **Cause**: This task started in a shared dirty workspace with no clean
  baseline commit or pre-task status snapshot available for attribution.
- **Fix**: Did not revert or overwrite any existing changes; recorded the
  limitation and verified the audit actions directly: read-only source/browser
  inspection, documentation additions, screenshot artifacts, and viewport
  reset.
- **Prevention**: Start future audits from a clean or explicitly snapshotted
  worktree when file-level attribution is required.
- **Related tasks**: Responsive Audit T4

## 2026-08-31: NAVI Capture manual QA — same-page duplicate plan invalidation
- **Error**: After a successful Phase 2C import, reopening Import Preview in the same Studio Reviewer initially allowed the same capture segments again; a full reload correctly warned.
- **Cause**: CaptureReviewer memoized `importPlan` without an invalidation dependency; stable persisted selection kept the pre-import plan.
- **Fix**: Added a local import-plan revision increment after successful import and a regression assertion; re-tested same-page duplicate now warns and disables Import selected.
- **Prevention**: Recompute manifest-backed import plans after every successful import; keep the regression with a stable persisted selection.
- **Related tasks**: Manual Studio QA, Phase 2C

## 2026-08-31: NAVI Capture manual QA — PowerShell admin path probe
- **Error**: The first post-QA test matrix command parsed `src/app/(admin)/...` as a PowerShell command token, so no tests ran.
- **Cause**: Parenthesized route path was not quoted.
- **Fix**: Reran the unchanged matrix with quoted `(admin)` paths; 16 files / 41 tests passed.
- **Prevention**: Quote parenthesized route paths in PowerShell test commands.
- **Related tasks**: Manual Studio QA

## 2026-08-31: NAVI Capture manual QA — hidden file input chooser timeout
- **Error**: Clicking the hidden file input directly timed out waiting for a file chooser.
- **Cause**: The hidden input did not open the native chooser through the in-app browser control.
- **Fix**: Used the visible `Open .navicapture.json` upload control with the file-chooser flow; uploads succeeded.
- **Prevention**: Trigger file selection from the visible upload control in browser QA.
- **Related tasks**: Manual Studio QA

## 2026-08-31: NAVI Capture manual QA — transient browser tab cleanup
- **Error**: A viewport-reset follow-up tried to inspect a narrow tab that had already been closed; the browser returned `Tab not found`.
- **Cause**: The ephemeral QA tab was cleaned up after navigation.
- **Fix**: Confirmed the controlled tab list retained the reviewer tab; no application state changed.
- **Prevention**: Re-list controlled tabs after viewport reset or navigation before reusing a handle.
- **Related tasks**: Manual Studio QA

## 2026-08-31: Navi Admin Responsive Audit — initial probe path mismatch

- **Error**: The first route inventory probe targeted `apps/studio-new/src/app`,
  which does not exist, and a bracketed route path was then read without a
  literal-path probe.
- **Cause**: The workspace has both a nested `studio-new` app and the active
  root `navi-next` app; PowerShell also treats square brackets as wildcards.
- **Fix**: Confirmed the active server and reran the inventory against
  `navi-next/src/app`, using literal paths where needed; no product files were
  changed.
- **Prevention**: Resolve the active repository root from the running server
  before route inspection and use literal paths for dynamic-segment filenames.
- **Related tasks**: Responsive Audit T1

## 2026-08-31: Navi Admin Responsive Audit — documentation patch context mismatch

- **Error**: Two initial documentation-only patches failed because their context
  lines did not exactly match the current Markdown tail.
- **Cause**: The append context included the wrong indentation/wording and the
  mixed patch stopped before applying either file.
- **Fix**: Re-read the exact tails and applied smaller relative-path patches;
  only the audit documentation was added.
- **Prevention**: Verify exact surrounding lines before applying append patches
  in long, incrementally maintained workflow ledgers.
- **Related tasks**: Responsive Audit T1

## 2026-08-31: NAVI Capture Phase 2C — quoted admin-path probe retry
- **Error**: A read-only `rg` probe that included `src/app/(admin)` was parsed by PowerShell as the command token `admin` and failed before inspecting files.
- **Cause**: The parenthesized route directory was not quoted in the command.
- **Fix**: No source change; subsequent checks use quoted literal paths.
- **Prevention**: Quote every `(admin)` path in PowerShell, including paths passed to multi-path search commands.
- **Related tasks**: Phase 2C T5

## 2026-08-31: NAVI Capture Phase 2C — Graphify refresh permission failure
- **Error**: The required post-implementation `graphify update .` refresh failed during code re-extraction with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed checkout's Graphify cache/output path is not writable by the refresh process.
- **Fix**: Did not modify or delete generated Graphify output; continued with source-focused tests and boundary checks.
- **Prevention**: Keep Graphify refresh as a separately reported environment gate and never repair its cache with destructive commands during feature work.
- **Related tasks**: Phase 2C T5

## 2026-08-31: NAVI Capture Phase 2C — quoted admin-path diff-check retry
- **Error**: A read-only `git diff --check` command failed before execution because its unquoted `src/app/(admin)` argument was parsed by PowerShell as the command token `admin`.
- **Cause**: Parenthesized route paths need quoting in PowerShell argument lists.
- **Fix**: No source change; rerun with the route path as a quoted argument.
- **Prevention**: Quote parenthesized route paths before invoking Git or search tools.
- **Related tasks**: Phase 2C T5

## 2026-08-31: NAVI Capture Phase 2C — legacy spec whitespace baseline
- **Error**: The scoped `git diff --check` reached the repository and reported trailing whitespace on older unrelated lines in `spec/SPEC.md`.
- **Cause**: The shared dirty checkout already contains Markdown hard-break whitespace outside the Phase 2C addition.
- **Fix**: No unrelated cleanup was performed; verify the newly added files directly and report the legacy warning.
- **Prevention**: Keep whitespace checks scoped to the feature additions when a shared worktree contains pre-existing documentation formatting.
- **Related tasks**: Phase 2C T5

## 2026-08-31: NAVI Capture Phase 2C — quoted admin-path status retry
- **Error**: A read-only `git status` probe failed before execution because its unquoted `src/app/(admin)` argument was parsed by PowerShell as the command token `admin`.
- **Cause**: Parenthesized route paths need quoting in PowerShell argument lists.
- **Fix**: No source change; the remaining status check omits parenthesized paths and uses prior quoted-route evidence.
- **Prevention**: Avoid parenthesized path arguments in shell probes unless they are explicitly quoted.
- **Related tasks**: Phase 2C T5

## 2026-08-31: NAVI Capture Phase 2C — reviewer host-label RED gate
- **Error**: The new Studio-hosted reviewer label assertion failed because the UI still rendered the Phase 2A `Read-only` badge and subtitle while import was enabled.
- **Cause**: Phase 2C added the import host and actions without yet differentiating the host-mode copy.
- **Fix**: Update only the conditional reviewer labels, then rerun the same reviewer test.
- **Prevention**: Assert host-mode state copy whenever a read-only surface gains a mutating action.
- **Related tasks**: Phase 2C T4, T5

## 2026-08-31: NAVI Capture Phase 2C — final Graphify refresh permission failure
- **Error**: The required post-edit `graphify update .` refresh again failed during code re-extraction with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed checkout's Graphify output/cache path remains inaccessible to the refresh process.
- **Fix**: Left generated Graphify output untouched; final source and test verification completed independently.
- **Prevention**: Resolve checkout permissions in a separate tooling task before making Graphify refresh a blocking release gate.
- **Related tasks**: Phase 2C T5

## 2026-08-31: NAVI Capture Phase 2C — full-suite reviewer isolation failure
- **Error**: The repository-wide Vitest run reported one `CaptureReviewer.test.tsx` failure in the first read-only test, while the same file and the complete focused Phase 1/2A/2C matrix passed when run directly.
- **Cause**: The failure is currently isolated to full-suite parallel execution; the focused reproduction has not reproduced it yet.
- **Fix**: Debug with serialized and repeated runs before attributing it to Phase 2C or changing production code.
- **Prevention**: Keep the exact focused matrix as the feature gate and add a serialized full-suite reproduction if the failure proves deterministic.
- **Related tasks**: Phase 2C T5

## 2026-08-31: NAVI Capture Phase 2C — test-probe regex parse error
- **Error**: A read-only PowerShell `rg` probe for `next/navigation` mocks failed with a parser error before search because its nested quote/character-class expression was malformed.
- **Cause**: The probe mixed PowerShell string quoting with a regex character class unnecessarily.
- **Fix**: No source change; replace it with a literal `next/navigation` search.
- **Prevention**: Use literal search terms for setup inspection unless regex syntax is necessary.
- **Related tasks**: Phase 2C T5

## 2026-08-31: NAVI Capture Phase 2C — serialized diagnostic interruption
- **Error**: The serialized full-suite diagnostic was interrupted after hanging without further progress.
- **Cause**: The broad dirty-checkout suite contains long-running or stateful tests; the diagnostic had already reproduced the CaptureReviewer failure before the interruption.
- **Fix**: Stopped the diagnostic process without changing source; narrowed reproduction to individual neighboring suites.
- **Prevention**: Use targeted neighboring-file comparisons for state-leak investigation instead of repeatedly waiting on the entire suite.
- **Related tasks**: Phase 2C T5

## 2026-08-31: NAVI Capture Phase 2C — Vitest list sandbox failure
- **Error**: The read-only `vitest list` ordering probe failed while loading config with Windows `spawn EPERM` before listing files.
- **Cause**: The default command sandbox blocked Vite's config externalization subprocess.
- **Fix**: No source change; rerun the diagnostic listing with the approved elevated test permission.
- **Prevention**: Use the same elevated permission for Vitest diagnostics that require config loading.
- **Related tasks**: Phase 2C T5

## 2026-08-31: NAVI Capture Phase 2C — Vitest order diagnostic hang
- **Error**: The elevated `vitest list` probe also produced no filtered output and hung until interrupted.
- **Cause**: File discovery/order listing in this large, dirty checkout did not complete within the diagnostic window.
- **Fix**: Stopped the listing process without source changes; targeted neighbor runs and the feature matrix remain available.
- **Prevention**: Avoid broad file-order diagnostics when the repository test graph is already known to contain long-running suites.
- **Related tasks**: Phase 2C T5

## 2026-08-31: NAVI Capture Phase 2C — reviewer deferred-load RED gate
- **Error**: The new reviewer timing regression assertion observed zero `listSessions` calls immediately after render.
- **Cause**: `CaptureReviewer` deferred its initial session load through a zero-delay timer, making the list dependent on broad-suite timer scheduling.
- **Fix**: Remove only the unnecessary defer and invoke the existing async loader directly from the effect.
- **Prevention**: Keep initial data loading independent of arbitrary timer scheduling and retain the immediate-call regression test.
- **Related tasks**: Phase 2C T4, T5

## 2026-08-31: NAVI Capture Phase 2C — reviewer full-suite regression resolved
- **Error**: Before the deferred-load fix, the full suite had one additional failing Capture Reviewer test; the focused suite and neighboring-file reproduction were green.
- **Cause**: The Reviewer’s zero-delay initial load was not reliable in the broad shared test environment.
- **Fix**: Direct session loading from the effect; the rerun returned to the documented `18` full-suite failing tests with no Capture Reviewer failure.
- **Prevention**: Retain the immediate-load regression test and use the full-suite count as a secondary regression check.
- **Related tasks**: Phase 2C T4, T5

## 2026-08-31: NAVI Capture Phase 2C — direct-load lint diagnostic
- **Error**: Scoped ESLint flagged the direct `loadSessions()` call in the Reviewer effect with `react-hooks/set-state-in-effect`.
- **Cause**: The async loader sets its loading state synchronously before its first await.
- **Fix**: Keep the no-timer behavior but start the loader in a microtask, and await that microtask in the regression test.
- **Prevention**: Run scoped React-hook lint after timing changes and avoid synchronous state updates directly in effect bodies.
- **Related tasks**: Phase 2C T4, T5

## 2026-08-31: NAVI Capture Phase 2C — reviewer timing-test isolation
- **Error**: The first version of the immediate-load regression test ended before its async session state settled, so the following reviewer test intermittently saw the stale loading screen.
- **Cause**: The test asserted the request call but did not await the session render before cleanup.
- **Fix**: Assert the synchronous request start, then await the loaded session heading so the effect settles before test teardown; the focused reviewer suite and full Phase 1/2A/2C matrix are green.
- **Prevention**: When testing async effects for timing, assert the scheduling boundary and also await the resulting state before leaving the test.
- **Related tasks**: Phase 2C T4, T5

## 2026-08-31: NAVI Capture Phase 2C — final Graphify refresh permission failure
- **Error**: The required final `graphify update .` still failed with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed checkout's generated Graphify output/cache path remains inaccessible to the refresh process.
- **Fix**: Left generated Graphify files untouched and completed the final verification with focused tests, the full suite, lint, typecheck, static boundary scan, and diff checks.
- **Prevention**: Resolve the checkout's Graphify output permissions before relying on refresh as a release gate; do not repair it with destructive commands during feature work.
- **Related tasks**: Phase 2C T5

## 2026-08-31: NAVI Capture Phase 2C — root/nested documentation probe path
- **Error**: A read-only scope-sentence probe looked for nested `navi-next/docs` files as root-relative paths and failed before inspection.
- **Cause**: The workspace contains a root workflow-log directory and a nested application repository; the probe omitted the nested repository prefix.
- **Fix**: Reran the same literal search with `navi-next/` prefixes and confirmed the required sentence in both Phase 2B documents, the Phase 2C plan, and the root SPEC/PLAN.
- **Prevention**: Resolve repository roots before using documentation paths in cross-repository verification commands.
- **Related tasks**: Phase 2C T1, T5

## 2026-08-31: NAVI Capture Phase 2C — runtime regression probe paths
- **Error**: The first runtime compatibility invocation selected the package config with a root-relative file path and found no tests; the next package-directory invocation could not find the shared root binary; a root `--root` retry duplicated the config path.
- **Cause**: The runtime package has its own Vitest root/include configuration and shares dependencies from the nested application's root `node_modules`.
- **Fix**: Ran the test from `navi-next/packages/runtime` with `..\\..\\node_modules\\.bin\\vitest.cmd`, `--config vitest.config.ts`, and the package-relative test path; it passed 1 file / 10 tests.
- **Prevention**: Resolve both the Vitest config root and executable path before running package-local suites in this monorepo.
- **Related tasks**: Phase 2C T5

## 2026-08-31: NAVI Capture Phase 2C-S — final verification retained baseline diagnostics
- **Error**: The full suite completed with 11 failed files and 18 failed tests; scoped ESLint reported the existing dispatcher/history `any` diagnostics; TypeScript reported the existing missing-brace error in `packages/runtime/src/__tests__/data-identity-comparison.test.ts`; nested `git diff --check` reported unrelated dirty-checkout whitespace.
- **Cause**: These failures and diagnostics predate Phase 2C-S and remain outside the Capture history change. The full-suite failure counts are unchanged from the locked baseline.
- **Fix**: No unrelated source cleanup was performed. The focused Capture, editor/Studio, compiler/navigation, and runtime gates all passed; the Phase 2C-S source/test whitespace scan was clean.
- **Prevention**: Compare both failure counts and scoped feature gates against the locked baseline, and keep unrelated lint/format cleanup outside this feature task.
- **Related tasks**: Phase 2C-S T5

## 2026-08-31: NAVI Capture Phase 3 — parenthesized path probe
- **Error**: A read-only `rg` probe failed when an unquoted `(admin)` route path was passed through PowerShell; PowerShell interpreted the path fragment as a command token.
- **Cause**: The probe mixed a parenthesized Windows path with an unquoted argument.
- **Fix**: No product code or database state changed; subsequent checks used quoted paths or feature-directory paths without parentheses.
- **Prevention**: Quote every Windows path containing parentheses before running cross-feature searches.
- **Related tasks**: Phase 3 sync audit

## 2026-08-31: NAVI Capture Phase 3 — Supabase MCP first-probe handshake
- **Error**: The first read-only Supabase MCP metadata probes returned `Authentication for Supabase was requested and accepted. Retry this tool call now.`
- **Cause**: The newly authenticated MCP session required one post-auth retry before exposing project metadata tools.
- **Fix**: Retried the same read-only probes once; project metadata, tables, migrations, extensions, policies, and advisors returned successfully.
- **Prevention**: Treat an accepted-auth retry response as a session refresh boundary and retry the identical read-only operation once before diagnosing connectivity.
- **Related tasks**: Phase 3 sync audit

## 2026-08-31: NAVI Capture Phase 3 — provider-neutral contract RED gate
- **Error**: The new Capture Sync hash and error suites failed to resolve `../hash` and `../errors`.
- **Cause**: The tests were intentionally written before the Task 1 implementation modules as required by the TDD plan.
- **Fix**: No production code or provider configuration was changed; the missing modules are the next implementation step.
- **Prevention**: Keep the RED checkpoint before adding the minimal contracts and hash helper, then rerun the exact same suites for GREEN.
- **Related tasks**: Phase 3 T1

## 2026-08-31: NAVI Capture Phase 3 — PowerShell wildcard probe
- **Error**: A read-only dependency probe passed Unix-style wildcard arguments that PowerShell rejected as invalid file names.
- **Cause**: The shell treats wildcard arguments differently when they are supplied to a command expecting literal paths.
- **Fix**: No product code or database state changed; subsequent probes use literal paths or PowerShell-native enumeration.
- **Prevention**: Keep cross-platform glob syntax out of PowerShell command arguments and quote literal paths containing special characters.
- **Related tasks**: Phase 3 T2

## 2026-08-31: NAVI Capture Phase 3 — local sync-state/service RED gate
- **Error**: The new local-state and sync-service suites failed to resolve `../local-state` and `../service`.
- **Cause**: The tests were intentionally written before the Task 2 implementation modules as required by the TDD plan.
- **Fix**: No production code or provider configuration was changed; the missing modules are the next implementation step.
- **Prevention**: Keep local sync metadata isolated from Capture payload persistence and implement the service only after this RED checkpoint.
- **Related tasks**: Phase 3 T2

## 2026-08-31: NAVI Capture Phase 3 — Supabase adapter RED gate
- **Error**: The injected-client adapter suite failed to resolve `../supabase-repository`.
- **Cause**: The tests were intentionally written before the provider-specific adapter as required by the Task 3 TDD plan.
- **Fix**: No Supabase schema or application runtime code was changed; the adapter is the next implementation step.
- **Prevention**: Keep SDK/table details inside the adapter and implement only the behaviors covered by the injected-client tests.
- **Related tasks**: Phase 3 T3

## 2026-09-08: Phase 4 Graphify marker path lookup
- **Error**: `graphify path "CaptureMapLayers" "NavigationPositionMarker"`
  could not resolve the Navigate marker node.
- **Cause**: The generated graph does not contain the current untracked
  `NavigationPositionMarker` relationship, so its index is stale for this
  marker seam.
- **Fix**: Use the already completed graph query for discovery and inspect the
  current source/tests directly after the required graph-first step; no graph
  output was hand-edited.
- **Prevention**: Treat generated graph misses as navigation hints, then verify
  the live source path before designing the shared primitive.
- **Related tasks**: Phase 4 T1

## 2026-08-31: NAVI Capture Phase 3 — adapter test fixture owner default
- **Error**: The first adapter GREEN run reported an unexpected `owner_id` in the recorded insert payload.
- **Cause**: The fake Supabase client recorded its simulated post-insert row, including the database-generated owner default, instead of the client request body.
- **Fix**: The fixture is being adjusted to record the pre-database request separately while retaining the owner default in stored-row simulation; production code is unchanged.
- **Prevention**: Test RLS-owned fields at the request boundary and test database defaults at the returned-row boundary.
- **Related tasks**: Phase 3 T3

## 2026-08-31: NAVI Capture Phase 3 — sync UI RED gate
- **Error**: The new provider/UI suite failed to resolve `../context`; the existing CaptureShell suite remained green at 2 tests.
- **Cause**: The provider-neutral context and UI wiring were intentionally not implemented before the Task 4 RED checkpoint.
- **Fix**: No existing Capture, Studio, or Supabase behavior was changed by the failing run; the context and limited UI wiring are the next step.
- **Prevention**: Keep Supabase composition at the `/capture` boundary and preserve the existing local-only shell behavior when no provider is mounted.
- **Related tasks**: Phase 3 T4

## 2026-08-31: NAVI Capture Phase 3 — sync UI map-layer test mock
- **Error**: The first UI GREEN run failed because the shared `CaptureMapLayers` helper called `useNavigationMap`, which was not present in the test's lightweight `NavigationMap` mock.
- **Cause**: The test targeted sync controls but mounted the real map-layer helper through `CaptureReview`.
- **Fix**: The test will mock the existing Capture map-layer helper for this provider/UI contract test; production map rendering is unchanged.
- **Prevention**: Keep reviewer/sync UI tests focused by isolating MapLibre context when the assertion does not cover map rendering.
- **Related tasks**: Phase 3 T4

## 2026-08-31: NAVI Capture Phase 3 — foreground test JSX extension
- **Error**: The foreground retry test could not be parsed because JSX was placed in a `.ts` file.
- **Cause**: The test file was created with a TypeScript extension instead of the repository's `.tsx` convention for React tests.
- **Fix**: The test is being moved to `.tsx`; no production code or runtime behavior changed.
- **Prevention**: Use `.tsx` for any test containing JSX before running its RED gate.
- **Related tasks**: Phase 3 T5

## 2026-08-31: NAVI Capture Phase 3 — foreground retry/cleanup RED gate
- **Error**: The new foreground suite showed no `online` retry call and no sync-state cleanup call; its remount restoration case passed.
- **Cause**: The online listener and CaptureShell deletion cleanup were intentionally not implemented before the Task 5 RED checkpoint.
- **Fix**: No production lifecycle code was changed by the failing run; those two boundaries are the next implementation step.
- **Prevention**: Keep the listener foreground-only, invoke only the provider-neutral service, and clean sync metadata alongside local session deletion.
- **Related tasks**: Phase 3 T5

## 2026-08-31: NAVI Capture Phase 3 — default table grants exposed by schema verification
- **Error**: Post-migration grant verification showed inherited `anon` and extra `authenticated` privileges on `public.capture_sessions`, including delete, despite the intended authenticated select/insert/update surface.
- **Cause**: The project’s default table privileges were broader than the migration’s explicit grants; explicit grants do not remove inherited default privileges.
- **Fix**: Keep the owner-only RLS policies, add explicit revoke-all statements for `anon`, `public`, and `authenticated`, then re-grant only authenticated select/insert/update in a scoped corrective migration for `capture_sessions`.
- **Prevention**: Verify effective role grants after every new table migration and explicitly revoke default privileges before granting the required surface.
- **Related tasks**: Phase 3 T6

## 2026-08-31: NAVI Capture Phase 3 — runtime subset sandbox spawn
- **Error**: The runtime compatibility command failed before test discovery with Windows `spawn EPERM` while Vite loaded `packages/runtime/vitest.config.ts`.
- **Cause**: The sandbox blocked the package-config process spawn/realpath path used by the runtime Vitest invocation.
- **Fix**: No source or database state changed; retry the same read-only runtime suite with the approved elevated execution context.
- **Prevention**: Use the package-local config and shared root Vitest binary, and escalate only this read-only compatibility command when the sandbox reports `EPERM`.
- **Related tasks**: Phase 3 T7

## 2026-08-31: NAVI Capture Phase 3 — browser skill root probe
- **Error**: The first local-browser setup attempt used a path one directory too deep and could not load `browser-client.mjs`.
- **Cause**: The skill stores `scripts/browser-client.mjs` at the plugin root, not beneath its `skills` directory.
- **Fix**: Reused the same browser workflow with the correct plugin-root script path; desktop and 390×844 Capture checks completed, and the viewport was restored.
- **Prevention**: Resolve the plugin root from the skill path before importing the browser client.
- **Related tasks**: Phase 3 T7

## 2026-08-31: NAVI Capture Phase 3 — final Graphify refresh permission failure
- **Error**: The required final `graphify update .` failed again with Windows `[WinError 5] Access is denied` while rebuilding the managed graph output.
- **Cause**: The checkout's generated Graphify output/cache path remains inaccessible to the refresh process.
- **Fix**: Left generated graph output untouched and completed verification with focused tests, compatibility suites, lint, typecheck comparison, boundary scans, and live schema checks.
- **Prevention**: Resolve Graphify output permissions before relying on refresh as a release gate; do not repair the generated cache with destructive commands during feature work.
- **Related tasks**: Phase 3 T7

## 2026-08-31: Phase 4 spec commit — root index permission failure
- **Error**: Committing the root Phase 4 spec failed because Git could not create `.git/index.lock` and returned `Permission denied`.
- **Cause**: The managed root checkout does not currently allow the Git process to write its index lock; the nested application repository accepted its documentation-only commit.
- **Fix**: Left the root spec staged and did not remove or overwrite any existing index state; application work remains unmodified.
- **Prevention**: Resolve root Git index permissions before attempting future root-level commits; keep exact staged paths visible and avoid manual lock-file deletion.
- **Related tasks**: Phase 4 spec

## 2026-08-31: Vercel readiness check — production build blocked
- **Error**: `npm run build` failed in `next build` before a deployable artifact was produced. The client bundle cannot resolve Node's `fs` import from `packages/runtime/src/loader/package-reader.ts`, reached through `src/app/demo/navigate/page.tsx`; the build also reported unavailable Google Font fetches in the restricted environment.
- **Cause**: A server-only runtime loader is imported into a client route, and the local build environment could not reach Google Fonts. `next.config.ts` ignores TypeScript errors but does not suppress module-resolution or font-fetch build errors.
- **Fix**: No deployment or unrelated production-code change was made during this readiness check. Treat the release as blocked until the client/server import boundary is corrected and the font strategy is made build-safe.
- **Prevention**: Run `npm run build` from the exact Vercel project root before pushing and keep Node-only loaders out of client component import graphs.
- **Related tasks**: Vercel readiness check

## 2026-08-31: Vercel readiness check — lint baseline blocked
- **Error**: `npm run lint` reported `2,155` errors and `20,353` warnings across the current checkout, including generated `.next` files and existing source issues such as `no-explicit-any` and render-time ref mutations.
- **Cause**: The checkout contains extensive unrelated dirty/generated content, and the repository lint command scans it; this is not isolated to the road endpoint repair.
- **Fix**: No broad lint cleanup was attempted. Keep deployment blocked until the intended release diff is isolated and the lint scope/baseline is corrected.
- **Prevention**: Do not push the shared dirty `master` checkout; use a reviewed release commit and exclude generated build output from lint input.
- **Related tasks**: Vercel readiness check

## 2026-09-01: Phase 4 baseline — runtime Vitest sandbox spawn failure
- **Error**: The package-local runtime compatibility baseline failed before test discovery while loading `packages/runtime/vitest.config.ts` with Windows `spawn EPERM`.
- **Cause**: The default command sandbox blocked Vite's config externalization subprocess/realpath operation.
- **Fix**: No source or database state changed; retry the identical read-only runtime suite with the approved elevated test context.
- **Prevention**: Use the package-local runtime config and shared root Vitest binary, and distinguish pre-discovery sandbox failures from test regressions.
- **Related tasks**: Phase 4 baseline

## 2026-09-01: Vercel readiness check — client boundary RED gate
- **Error**: The new demo navigation client-boundary regression could not resolve `@navi/runtime/engine` because that subpath was not exported by `packages/runtime/package.json`.
- **Cause**: The browser-safe engine entrypoint had not yet been added; the test intentionally ran before the production boundary fix.
- **Fix**: No production code changed in the RED checkpoint. The package export and client import are the next implementation step.
- **Prevention**: Keep a regression test that resolves the browser-safe runtime entrypoint and rejects a runtime-engine value import from the package root.
- **Related tasks**: Vercel readiness T1, T2

## 2026-09-01: Vercel readiness check — Vitest boundary-test path
- **Error**: The new boundary test failed before assertions with `The URL must be of scheme file` while reading the sibling page through `import.meta.url`.
- **Cause**: This Vitest configuration presents transformed module URLs that are not filesystem `file:` URLs.
- **Fix**: No product behavior changed; the test will resolve the page from the known application working directory instead.
- **Prevention**: Use `process.cwd()` for source-inspection tests in this repository's Vitest environment, and keep Node filesystem APIs confined to test code.
- **Related tasks**: Vercel readiness T1

## 2026-09-01: Vercel readiness check — second client loader path
- **Error**: After the demo navigation boundary was repaired, `npm run build` still failed because `/map/runtime` reached Node's `fs` through `RuntimeMapShell` importing `@navi/runtime`.
- **Cause**: The runtime package root re-exports the filesystem-backed loader, and another client component still used that root as a value import.
- **Fix**: No second production change has been made yet; audit all runtime value imports and move browser consumers to the engine-only entrypoint while preserving loader imports for server-side code.
- **Prevention**: Keep a repository regression that scans client runtime consumers for package-root value imports and rerun the production build after the first boundary fix.
- **Related tasks**: Vercel readiness T2, T4

## 2026-09-01: Vercel readiness check — public runtime boundary RED assertion
- **Error**: The expanded boundary regression failed because `RuntimeMapShell.tsx` still imported `RuntimeEngine` from `@navi/runtime`.
- **Cause**: The first fix covered `/demo/navigate` but not the public `/map/runtime` client consumer.
- **Fix**: No behavior change in the RED checkpoint; the remaining value import is being moved to the engine-only entrypoint.
- **Prevention**: Cover every client runtime value consumer in the boundary regression, not just the originally reported route.
- **Related tasks**: Vercel readiness T2, T4

## 2026-09-01: Vercel readiness check — build page-data spawn
- **Error**: After successful production compilation, the sandboxed `npm run build` stopped during Next page-data collection with Windows `spawn EPERM`.
- **Cause**: The restricted execution context blocked the worker process spawn used by Next/Turbopack after compilation.
- **Fix**: No source change was made; rerun the identical build with the approved elevated execution context to distinguish sandbox policy from an application build failure.
- **Prevention**: When Next reports `spawn EPERM` after compilation, preserve the compiled result and retry only the same build command with the approved execution context.
- **Related tasks**: Vercel readiness T4

## 2026-09-01: Vercel readiness check — final Graphify refresh permission failure
- **Error**: The required final `graphify update .` failed with `[WinError 5] Access is denied` while rebuilding the managed graph output.
- **Cause**: The checkout's generated Graphify output/cache path remains inaccessible to the refresh process, matching the prior documented permission limitation.
- **Fix**: No generated graph files were manually changed; deployment verification proceeded from the source trace, focused tests, build output, and read-only environment/storage checks.
- **Prevention**: Resolve Graphify output permissions before relying on a refresh as a release gate; do not repair the generated cache with destructive commands during this task.
- **Related tasks**: Vercel readiness T4

## 2026-09-01: Phase 4 plan inspection — unsupported PowerShell parameter
- **Error**: A read-only plan inspection command failed because `Get-Content` does not accept the attempted `-Skip` parameter.
- **Cause**: PowerShell requires `Select-Object -Skip` for that operation.
- **Fix**: No application or plan content changed; subsequent inspections use supported PowerShell parameters.
- **Prevention**: Use `Select-Object -Skip` when reading a file from an offset in PowerShell.
- **Related tasks**: Phase 4 planning

## 2026-09-01: Phase 4 Task 4 inspection — nested app path omitted
- **Error**: A read-only Reviewer source inspection looked under the workspace root and could not find the nested app files.
- **Cause**: The command used the root working directory instead of `navi-next`, where the application source lives.
- **Fix**: No source changed; repeat the inspection from the nested application directory.
- **Prevention**: Resolve the application root before reading or testing feature files, especially when the workspace contains a nested Git repository.
- **Related tasks**: Phase 4 T4

## 2026-09-01: Phase 4 T4 Graphify refresh permission failure
- **Error**: The required `graphify update .` after Reviewer changes reported `[WinError 5] Access is denied` while rebuilding the managed graph output.
- **Cause**: The checkout's generated Graphify output/cache remains inaccessible to the refresh process, matching the existing Phase 3 limitation.
- **Fix**: No generated graph files were manually changed; source and test verification remain the source of truth for this task.
- **Prevention**: Resolve Graphify output permissions before relying on refresh as a release gate; do not repair generated output destructively during feature work.
- **Related tasks**: Phase 4 T4

## 2026-09-01: Phase 4 T5 Graphify refresh permission failure
- **Error**: The required `graphify update .` after Library changes again reported `[WinError 5] Access is denied` while rebuilding managed graph output.
- **Cause**: The existing checkout Graphify output/cache permission limitation persists.
- **Fix**: Left generated graph output untouched; Library tests and source boundary scans remain the verification evidence.
- **Prevention**: Resolve Graphify output permissions before using refresh as a release gate; avoid destructive cache repair during feature work.
- **Related tasks**: Phase 4 T5

## 2026-09-01: Phase 4 Task 5 inspection — nested app path omitted
- **Error**: A read-only Library source inspection again ran from the workspace root and could not find nested app files.
- **Cause**: The command omitted the `navi-next` working directory.
- **Fix**: No source changed; repeat the inspection from the nested application directory.
- **Prevention**: Include the absolute nested app root on every app source/test command during this multi-repository task.
- **Related tasks**: Phase 4 T5

## 2026-09-01: Phase 4 Task 6 route test — unawaited React act
- **Error**: The first dynamic-route RED run warned that a component suspended inside an unawaited `act` scope.
- **Cause**: The test rendered the App Router page's `use(params)` promise without awaiting React's async resolution.
- **Fix**: Updated the test to render inside `await act(async () => ...)`; no production behavior changed.
- **Prevention**: Await `act` whenever route tests render components that consume promise props through React `use()`.
- **Related tasks**: Phase 4 T6

## 2026-09-01: Phase 4 Task 6 Library route test — unawaited React act
- **Error**: The first Library-route test run warned that the page's `use(params)` promise suspended inside an unawaited `act` scope.
- **Cause**: The test was initially rendered like a synchronous component even though the App Router page consumes promise params.
- **Fix**: Wrapped both Library-route renders in `await act(async () => ...)`; no production behavior changed.
- **Prevention**: Await the promise-param route render in App Router tests before asserting page content.
- **Related tasks**: Phase 4 T6

## 2026-09-01: Phase 4 isolation scan — unquoted dynamic route path
- **Error**: A PowerShell `rg`/`git diff --check` command parsed `(admin)` as a command expression and reported `admin: The term 'admin' is not recognized`.
- **Cause**: Dynamic App Router paths containing parentheses were passed without literal quoting.
- **Fix**: No files changed; rerun the read-only scans with quoted route paths.
- **Prevention**: Quote every PowerShell path containing `(admin)` or `[id]`, including in scan argument lists.
- **Related tasks**: Phase 4 T7

## 2026-09-01: Phase 4 runtime gate — package-relative test path
- **Error**: The elevated package-runtime Vitest command exited with `No test files found` for `packages/runtime/src/__tests__/floor-geometry-consumption.test.ts`.
- **Cause**: `packages/runtime/vitest.config.ts` resolves its `src/**/*.test.ts` include relative to the package config root, so a repository-relative path was filtered out.
- **Fix**: No application or test source changed; the config-relative path was also filtered when launched from the app root, confirming that the command must run with `packages/runtime` as its working directory.
- **Prevention**: When invoking a package-local Vitest config, use both test paths and working directory relative to that package's config root.
- **Related tasks**: Phase 4 T7

## 2026-09-01: Phase 4 isolation scan — legacy Reviewer host dependency
- **Error**: A broad scan over the Studio Reviewer route found `useGraphStore` in its existing `EditorBridge` host.
- **Cause**: The dynamic Reviewer route is the established Phase 2C Studio import surface and is present in the dirty checkout outside the new Library implementation; the route must load the editor document for explicit import.
- **Fix**: No source change was made. A scoped scan confirmed no forbidden stores/APIs in the new Capture Library component, Library route, or remote Reviewer wrapper; the legacy host was preserved to avoid changing Studio import behavior.
- **Prevention**: Keep Capture Library read-only isolation scans scoped to new Library production files, and treat the existing Reviewer/editor host as an explicit integration boundary.
- **Related tasks**: Phase 4 T7

## 2026-09-01: Phase 4 T7 Graphify refresh permission failure
- **Error**: The required post-QA `graphify update .` again failed with `[WinError 5] Access is denied` while rebuilding the managed graph output.
- **Cause**: The checkout's generated Graphify output/cache remains inaccessible to the refresh process, matching the documented Phase 3 and earlier Phase 4 limitation.
- **Fix**: No generated graph files were manually changed; tests, browser checks, source-boundary scans, and whitespace checks remain the verification evidence.
- **Prevention**: Resolve Graphify output permissions before using a refresh as a release gate; do not repair generated output destructively during feature work.
- **Related tasks**: Phase 4 T7

## 2026-09-01: Phase 5 skill-path probe
- **Error**: An initial multi-file skill reload attempted to read the literal path `C:\Users\Administrator\.codex\skills\.system\?`, which does not exist.
- **Cause**: A placeholder probe path was included before the concrete skill paths were loaded.
- **Fix**: No application or documentation state changed; the required skills were reloaded from their concrete paths individually.
- **Prevention**: Use only resolved skill paths from the available-skills catalog and avoid placeholder filesystem probes.
- **Related tasks**: Phase 5 T0

## 2026-09-01: Phase 5 baseline — runtime Vitest sandbox spawn failure
- **Error**: The package-local runtime compatibility baseline failed before test discovery while loading `packages/runtime/vitest.config.ts` with Windows `spawn EPERM`.
- **Cause**: The default command sandbox blocked Vite's config externalization subprocess/realpath operation, matching the documented Phase 4 limitation.
- **Fix**: No source changed; retry the identical package-local test command with the approved elevated execution context.
- **Prevention**: Use the package-local runtime config and config-relative test path, and distinguish pre-discovery sandbox failures from application regressions.
- **Related tasks**: Phase 5 T0, T10

## 2026-09-01: Phase 5 T1 metrics RED checkpoint
- **Error**: The new Capture metrics suite could not resolve `src/features/capture/metrics.ts` and therefore discovered zero tests.
- **Cause**: The failing test was intentionally written before the production metric contract as required by the TDD plan.
- **Fix**: No existing Capture behavior changed; the pure metrics module is the next implementation step.
- **Prevention**: Keep the missing-contract RED run visible before adding metric code, then rerun the identical suite for GREEN.
- **Related tasks**: Phase 5 T1

## 2026-09-01: Phase 5 T1 duration-format contract correction
- **Error**: The first metrics GREEN run exposed an inconsistent test expectation: zero duration expected `MM:SS` while a 65-second duration expected `HH:MM:SS`.
- **Cause**: The compact HUD format was not specified consistently in the initial test fixture.
- **Fix**: Chose `MM:SS` below one hour and `HH:MM:SS` at one hour or more; updated the test expectation without changing session data or persistence.
- **Prevention**: Define formatter boundaries with adjacent examples before implementing presentation helpers.
- **Related tasks**: Phase 5 T1

## 2026-09-01: Phase 5 T1 Graphify refresh permission failure
- **Error**: The required `graphify update .` after the Capture metrics source change failed with `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process, matching the Phase 3/4 limitation.
- **Fix**: No generated graph files were manually edited or repaired; the focused metrics tests remain the source verification for this task.
- **Prevention**: Resolve Graphify output permissions before using refresh as a release gate; do not perform destructive cache repair during feature work.
- **Related tasks**: Phase 5 T1

## 2026-09-01: Phase 5 T2 timing RED checkpoint
- **Error**: The new timing suite could not resolve `src/features/capture/timing.ts`; existing store and format behavior also failed the new optional timing assertions.
- **Cause**: The tests intentionally preceded the timing transition, session fields, and format validation implementation.
- **Fix**: No raw sample or persistence key was changed by the RED run; the additive timing implementation is the next step.
- **Prevention**: Keep timing metadata optional and run the same timing/store/format matrix after the minimal transition code is added.
- **Related tasks**: Phase 5 T2

## 2026-09-01: Phase 5 T2 Graphify refresh permission failure
- **Error**: The required `graphify update .` after Capture timing/store changes failed with `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache remains inaccessible to the refresh process.
- **Fix**: No generated graph files were manually edited; timing/store/format and recorder tests remain the source verification.
- **Prevention**: Preserve the known Graphify limitation and do not repair generated output destructively during feature work.
- **Related tasks**: Phase 5 T2

## 2026-09-01: Phase 5 T3 HUD RED checkpoint
- **Error**: The new Live Capture HUD suite could not resolve `src/features/capture/components/CaptureLiveHud.tsx` and discovered zero tests.
- **Cause**: The failing component test intentionally preceded the HUD implementation.
- **Fix**: No existing Capture UI changed; the isolated HUD component is the next implementation step.
- **Prevention**: Keep the HUD test focused on accessible user-visible metrics before mounting it into the existing Recording Map.
- **Related tasks**: Phase 5 T3

## 2026-09-01: Phase 5 T3 HUD assertion correction
- **Error**: The first HUD render exposed duplicate GPS status and distance text matches, making broad `getByText` assertions ambiguous.
- **Cause**: The HUD intentionally presents the same state in a summary and metric context, while the initial test used non-unique selectors.
- **Fix**: Removed the redundant GPS metric tile and tightened the test to the hand-derived distance value; no field behavior or persistence changed.
- **Prevention**: Prefer semantic regions and exact metric values for UI tests when a compact summary repeats a status.
- **Related tasks**: Phase 5 T3

## 2026-09-01: Phase 5 T3 Graphify refresh permission failure
- **Error**: The required `graphify update .` after mounting the Live Capture HUD failed with `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph files were manually edited; the 5B focused UI and Capture tests remain the source verification.
- **Prevention**: Preserve the known Graphify limitation and do not repair generated output destructively during feature work.
- **Related tasks**: Phase 5 T3

## 2026-09-01: Phase 5 T5 direction RED checkpoint
- **Error**: The new pure Capture direction suite could not resolve `src/features/capture/direction.ts` and discovered zero tests.
- **Cause**: The failing contract test intentionally preceded the direction implementation as required by the TDD plan.
- **Fix**: No Capture runtime, raw sample, map, or persistence behavior changed; the isolated direction contract is the next implementation step.
- **Prevention**: Keep heading normalization, freshness, precedence, permission-state, and GeoJSON-shape behavior tested before wiring browser sensors into React.
- **Related tasks**: Phase 5 T5

## 2026-09-01: Phase 5 T5 Graphify refresh permission failure
- **Error**: The required `graphify update .` after the pure direction contract change reported `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process, matching the earlier Phase 5 refresh failures.
- **Fix**: No generated graph files were manually edited; the direction contract suite remains the source verification for this task.
- **Prevention**: Preserve the known Graphify limitation and do not repair generated output destructively during feature work.
- **Related tasks**: Phase 5 T5

## 2026-09-01: Phase 5 T6 direction-hook RED checkpoint
- **Error**: The new browser-facing direction hook suite could not resolve `src/features/capture/hooks/useCaptureDirection.ts` and discovered zero tests.
- **Cause**: The failing hook test intentionally preceded the sensor subscription and explicit permission implementation.
- **Fix**: No browser listeners, Capture session data, map layers, or persistence behavior changed; the isolated hook is the next implementation step.
- **Prevention**: Keep permission prompting user-gesture-only and test listener cleanup before mounting the direction indicator in the Recording Map.
- **Related tasks**: Phase 5 T6

## 2026-09-01: Phase 5 T6 status-control RED checkpoint
- **Error**: The new direction-status suite could not resolve `src/features/capture/components/CaptureDirectionStatus.tsx` and discovered zero tests.
- **Cause**: The failing presentational test intentionally preceded the status-control implementation.
- **Fix**: No HUD, map, sensor, or Capture data behavior changed; the isolated status component is the next implementation step.
- **Prevention**: Keep sensor-state copy and explicit permission action covered independently before integrating the control into the live HUD.
- **Related tasks**: Phase 5 T6

## 2026-09-01: Phase 5 T6 Graphify refresh permission failure
- **Error**: The required `graphify update .` after wiring the direction hook, status control, HUD, and map layers reported `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process, matching the earlier Phase 5 refresh failures.
- **Fix**: No generated graph files were manually edited; the focused direction, hook, status, HUD, and layer-cleanup tests remain the source verification.
- **Prevention**: Preserve the known Graphify limitation and do not repair generated output destructively during feature work.
- **Related tasks**: Phase 5 T6

## 2026-09-01: Phase 5 T7 MapLibre direction-layer validation
- **Error**: Browser QA reported `layers.capture-current-direction-arrow.paint.line-cap: unknown property "line-cap"`, preventing the new direction arrow layer from being added.
- **Cause**: MapLibre defines `line-cap` as a line layer layout property, but the initial Capture direction layer placed it in `paint`.
- **Fix**: Move `line-cap: round` to the direction arrow layer's `layout` block; no source, persistence, route, or compiler behavior is involved.
- **Prevention**: Validate MapLibre paint/layout placement with the runtime layer validator or a browser smoke test before closing the 5C gate.
- **Related tasks**: Phase 5 T7

## 2026-09-01: Phase 5 T7 hot-reload dependency-array warning
- **Error**: During the first live browser pass, React reported that a `useEffect` dependency array changed length between renders.
- **Cause**: Fast Refresh retained a mounted component while the implementation changed an existing MapLibre effect from its pre-change dependency list to the new direction-data list; this was a development hot-reload transition, not a clean-load behavior.
- **Fix**: Reloaded the route after the MapLibre fix; the clean Capture route produced no new dependency-array warning, and no production architecture change was needed.
- **Prevention**: Use a clean route reload when validating hook/effect dependency changes made during a live dev-server session.
- **Related tasks**: Phase 5 T7

## 2026-09-01: Phase 5 T8 presentation RED checkpoint
- **Error**: The new provider-neutral sync presentation suite could not resolve `src/features/capture-sync/presentation.ts` and discovered zero tests.
- **Cause**: The failing mapper test intentionally preceded the sync-state presentation implementation.
- **Fix**: No sync service, repository, state persistence, schema, or UI behavior changed; the pure presentation mapper is the next implementation step.
- **Prevention**: Keep action eligibility and provider-neutral copy tested before replacing duplicate Home/Review sync markup.
- **Related tasks**: Phase 5 T8

## 2026-09-01: Phase 5 T8 Graphify refresh permission failure
- **Error**: The required `graphify update .` after adding the sync presentation mapper reported `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process, matching the earlier Phase 5 refresh failures.
- **Fix**: No generated graph files were manually edited; the pure presentation suite remains the source verification for this task.
- **Prevention**: Preserve the known Graphify limitation and do not repair generated output destructively during feature work.
- **Related tasks**: Phase 5 T8

## 2026-09-01: Phase 5 T9 sync-status RED checkpoint
- **Error**: The new shared Capture sync-status suite could not resolve `src/features/capture-sync/components/CaptureSyncStatus.tsx` and discovered zero tests.
- **Cause**: The failing component test intentionally preceded the shared Home/Review sync-status implementation.
- **Fix**: No sync service, repository, state persistence, schema, or existing Capture UI behavior changed; the isolated status component is the next implementation step.
- **Prevention**: Preserve existing accessible Sync now/Retry button names while routing all actions through the existing provider context.
- **Related tasks**: Phase 5 T9

## 2026-09-01: Phase 5 T9 local-only label regression
- **Error**: The existing Capture Sync UI compatibility test could not find the established `Local only` label after Home was switched to the shared presentation component.
- **Cause**: The new component showed the more descriptive unavailable detail but omitted the prior compact availability badge.
- **Fix**: Preserve `Local only` as a separate unavailable-state label while retaining the descriptive provider-neutral detail; no sync action or transport behavior changed.
- **Prevention**: When replacing duplicate presentation markup, carry forward both accessible action names and stable user-facing state labels.
- **Related tasks**: Phase 5 T9

## 2026-09-01: Phase 5 T9 Graphify refresh permission failure
- **Error**: The required `graphify update .` after integrating the shared sync-status component reported `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process, matching the earlier Phase 5 refresh failures.
- **Fix**: No generated graph files were manually edited; the presentation, provider, and foreground-retry suites remain the source verification.
- **Prevention**: Preserve the known Graphify limitation and do not repair generated output destructively during feature work.
- **Related tasks**: Phase 5 T9

## 2026-09-01: Phase 5 T10 route baseline command quoting
- **Error**: The initial final-gate route test command failed in PowerShell because the unquoted `(admin)` path segment was parsed as a command expression before Vitest started.
- **Cause**: The route path contains parentheses and was passed without a literal quote.
- **Fix**: No source changed and no route tests were discovered; rerun the same intended route subset with literal quoted test paths.
- **Prevention**: Quote Next.js app-router test paths containing parentheses or brackets in PowerShell commands.
- **Related tasks**: Phase 5 T10

## 2026-09-01: Phase 5 T10 full-suite pre-existing failures
- **Error**: The full app suite completed with 382 files, 4,179 passing tests, 8 skipped tests, and 18 failures.
- **Cause**: The failures are outside Phase 5 Capture code and match the dirty-checkout baseline: deleted `packages/editor/src/demo/golden-campus.ts` imports, compiler fixture/topology/navigation failures, and unrelated Floor Editor route/property assertions.
- **Fix**: No unrelated source was modified; the locked Capture, editor/Studio, compiler/navigation/public, runtime, and route subsets were rerun independently and remained green.
- **Prevention**: Use the locked scope-specific suites as the Phase 5 regression gate and report the broader dirty-checkout failures explicitly rather than attributing them to Capture.
- **Related tasks**: Phase 5 T10

## 2026-09-01: Phase 5 T10 final Graphify refresh permission failure
- **Error**: The final required `graphify update .` again reported `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process, matching every earlier Phase 5 refresh attempt.
- **Fix**: No generated graph files were manually edited; all source/test/boundary evidence was collected independently.
- **Prevention**: Resolve Graphify output permissions before treating graph refresh as a release gate; do not repair generated output destructively during feature work.
- **Related tasks**: Phase 5 T10

## 2026-09-01: Phase 6 T1 prerequisite probe — middleware path
- **Error**: A read-only `rg` probe included `middleware.ts` at the nested app root and reported that the path did not exist.
- **Cause**: The Next middleware file is located at `src/middleware.ts` in this checkout.
- **Fix**: No application state changed; the source probe was corrected to use the resolved `src/middleware.ts` path.
- **Prevention**: Resolve exact application paths from the nested app root before composing multi-file inspection commands.
- **Related tasks**: Phase 6 T1

## 2026-09-01: Phase 6 T1 Supabase prerequisite audit — critical RLS advisory
- **Error**: Supabase schema inspection reported a critical `rls_disabled` advisory for `public.spatial_ref_sys`.
- **Cause**: The PostGIS system table is exposed with RLS disabled in the current remote project.
- **Fix**: No SQL, migration, schema, or policy change was made. The finding is classified as a production security release gate outside the Capture implementation scope and requires explicit security-owner review before final sign-off.
- **Prevention**: Run the Supabase security advisor during production hardening and do not auto-apply RLS remediation without reviewing the system-table policies and impact.
- **Related tasks**: Phase 6 T1, Phase 6 T4

## 2026-09-01: Phase 6 T1 Supabase prerequisite audit — empty Capture fixture
- **Error**: The authenticated Supabase project currently contains zero rows in `public.capture_sessions`, so a populated remote Library → Reviewer → import flow cannot be observed.
- **Cause**: No synced Capture session fixture is present in the target project at audit time; local development auth is mock-enabled and is not an authenticated Supabase owner session.
- **Fix**: No remote data or application state was created or modified. The remote-flow gate is classified as an Environment limitation pending a real authenticated owner and valid synced campus session.
- **Prevention**: Seed a disposable, valid finished Capture session through the existing product sync flow before real-device/remote QA; never treat an empty Library as a successful remote-flow test.
- **Related tasks**: Phase 6 T1, Phase 6 T3

## 2026-09-01: Phase 6 T2 controlled browser QA — desktop Capture overflow
- **Error**: At the default 1280px desktop viewport, the Capture Home saved-session grid and Capture Review header/date content were visibly clipped at the right edge even though the document reported no horizontal scroll width.
- **Cause**: The current desktop layout uses a fixed/overflow-constrained content presentation for multi-column cards and wide Review metadata; this is pre-existing UI behavior observed during validation, not a Phase 6 code change.
- **Fix**: No product source was changed. Classified as a Non-blocking defect for a later Capture UX refinement pass.
- **Prevention**: Include visual clipping checks at the default desktop width in future Capture UX work; do not fix unrelated layout behavior during a release-validation phase unless it blocks the approved release path.
- **Related tasks**: Phase 6 T2, Phase 6 T4

## 2026-09-01: Phase 6 T2 controlled browser QA — export event unavailable
- **Error**: The in-app browser download-event probe did not observe a download after clicking `Export .navicapture.json`.
- **Cause**: The browser harness did not expose a usable download event for this local client-side export; the page remained error-free and the automated export/serialization tests already passed in the locked baseline.
- **Fix**: No product source or local Capture data was changed. Classified as an Environment limitation for manual download observation, not as an export failure.
- **Prevention**: Use a real browser download inspection or validate the downloaded file directly on a device during Phase 6 hardware QA; retain automated export contract coverage.
- **Related tasks**: Phase 6 T2, Phase 6 T4

## 2026-09-01: Phase 6 T5 Graphify refresh permission failure
- **Error**: The required `graphify update .` after the Phase 6 validation pass reported `Nothing to update or rebuild failed` with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process, matching the Phase 3–5 limitation.
- **Fix**: No generated graph files were manually changed or repaired; the Phase 6 source/test/browser/Supabase evidence remains independent.
- **Prevention**: Resolve Graphify output permissions before treating refresh as a release gate; never repair generated output destructively during validation.
- **Related tasks**: Phase 6 T5

## 2026-09-01: Vercel production deploy blocked by CLI authentication
- **Error**: `vercel whoami` rejected the available CLI credential as invalid. A fresh `vercel login` device flow opened, but the Vercel authorization page kept `Allow` disabled and the CLI remained waiting for approval.
- **Cause**: The linked project is valid, but this machine has no usable Vercel CLI authentication state; `vercel logout` reported that it was not currently logged in. The initial non-elevated network probe also hit the managed proxy at `127.0.0.1:9`.
- **Fix**: No application, environment, credential file, or project configuration was modified. The supported login flow was restarted and left pending for user authorization.
- **Prevention**: Authenticate the Vercel CLI through its supported device flow before deployment; never manually delete or edit credential files to recover from an auth failure.
- **Related tasks**: Phase 6 deployment validation

## 2026-09-01: Phase 6 real-device diagnosis — initial campus-map probe used the wrong column
- **Error**: A read-only `campus_maps` metadata query referenced `id`, which is not a column in the deployed table.
- **Cause**: The table’s actual primary-key column name was not confirmed before composing the diagnostic projection.
- **Fix**: No data or schema was changed; the failed query returned before reading rows. The query will be retried from `information_schema` metadata.
- **Prevention**: Inspect deployed column metadata before issuing table-specific diagnostic SQL, especially when local model types and remote schema may differ.
- **Related tasks**: Phase 6 real-device sync visibility diagnosis

## 2026-09-01: Phase 6 verification — Vitest blocked by sandbox process permission
- **Error**: The focused Vitest command failed during Vite config loading with `spawn EPERM`; no test body executed.
- **Cause**: The managed sandbox denied the child-process spawn used by Vite’s external-dependency resolver.
- **Fix**: No product source or test fixture was changed. The same read-only test command will be retried with approved elevated execution.
- **Prevention**: Treat startup `spawn EPERM` as an execution-environment failure and preserve the distinction from an actual test failure.
- **Related tasks**: Phase 6 real-device sync visibility diagnosis

## 2026-09-01: Phase 6 verification — broad Supabase log-key probe failed
- **Error**: A read-only unified-log query that enumerated attribute keys returned Supabase’s `Backend error! Retry your query` response.
- **Cause**: The log backend rejected the broad `array join mapKeys(log_attributes)` query.
- **Fix**: No project or data change was made; the diagnosis relies on the earlier successful, narrowly filtered request/auth log queries and source evidence.
- **Prevention**: Keep log diagnostics scoped to known sources, time windows, and non-sensitive derived fields; do not treat a log-tool failure as an application query failure.
- **Related tasks**: Phase 6 real-device sync visibility diagnosis

## 2026-09-01: Phase 6 real-device sync visibility — remote row lacks campus identity
- **Error**: The real phone upload succeeded, but Studio’s campus-filtered Capture Library has no visible session.
- **Cause**: Capture creation does not assign `campusId`; the Supabase adapter persists `campus_id` as `NULL`. The Library queries with the canonical Studio campus ID, so the valid row cannot match and is filtered out.
- **Fix**: None applied. This run was read-only; no application code, schema, RLS policy, or captured row was changed.
- **Prevention**: Propagate one canonical campus ID from Capture creation through sync, and add a field-test contract that rejects or visibly diagnoses a campus-less synced session before Library validation.
- **Related tasks**: Phase 6 T3a, Phase 6 T6

## 2026-09-01: Phase 6 campus-association fix — parenthesized app path probe
- **Error**: A read-only PowerShell `rg --files` command interpreted the unquoted `(admin)` route directory as an expression and failed before listing files.
- **Cause**: The multi-path command omitted quotes around a path containing parentheses.
- **Fix**: No repository file was changed; the listing will be retried with the route path quoted.
- **Prevention**: Quote all Windows paths containing parentheses when composing PowerShell inspection commands.
- **Related tasks**: Phase 6 campus-association fix audit

## 2026-09-01: Phase 6 campus-association fix — red Vitest sandbox startup
- **Error**: The focused campus-association test command failed while loading Vitest with `spawn EPERM`; no test body executed.
- **Cause**: The managed Windows sandbox denied the child-process spawn used by Vite’s external-dependency resolver.
- **Fix**: No source behavior was inferred from the failure; the identical read-only test command will be rerun with approved elevated execution.
- **Prevention**: Distinguish test-runner startup failures from assertion failures and retain the command/output before escalating execution.
- **Related tasks**: Phase 6 campus-association fix T2

## 2026-09-01: Phase 6 campus-association fix — repository TypeScript baseline syntax error
- **Error**: `tsc --noEmit` stopped at `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)` with `TS1005: '}' expected`.
- **Cause**: The dirty checkout contains a pre-existing syntax error in an unrelated runtime test file; the compiler did not reach a source assertion specific to this fix.
- **Fix**: No unrelated file was changed. Capture-family Vitest tests remain the primary behavioral gate, with targeted lint/build checks used where possible.
- **Prevention**: Repair or isolate the repository-wide TypeScript baseline before using it as a release gate; keep unrelated baseline failures separate from feature verification.
- **Related tasks**: Phase 6 campus-association fix T5

## 2026-09-01: Phase 6 campus-association fix — route selection effect lint failure
- **Error**: Targeted ESLint rejected `CapturePageClient` because a state-setting effect synchronously mirrored the campus-map list into local selection (`react-hooks/set-state-in-effect`).
- **Cause**: The first route implementation used an effect to reconcile route selection after the existing campus store hydrated.
- **Fix**: No behavior was shipped from that version. Selection is now initialized from the route, validated by canonical map lookup, changed only from the selector event, and remounted when the server route key changes.
- **Prevention**: Derive state from existing data where possible and avoid synchronous state updates in effects under the repository’s React hooks rules.
- **Related tasks**: Phase 6 campus-association fix T5

## 2026-09-01: Phase 6 campus-association fix — Next build sandbox worker startup
- **Error**: `npm run build` compiled successfully but failed while collecting page data with `spawn EPERM`.
- **Cause**: The managed Windows sandbox denied the Next worker process after compilation; this is an execution-environment failure, not a reported route compile/type error.
- **Fix**: No source change was made in response; the same build will be rerun with approved elevated execution.
- **Prevention**: Separate successful compilation from worker-startup verification and use the approved elevated build path when the sandbox blocks Next workers.
- **Related tasks**: Phase 6 campus-association fix T5

## 2026-09-01: Phase 6 campus-association fix — Graphify refresh permission failure
- **Error**: The required `graphify update .` reported `Nothing to update or rebuild failed` and `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process, matching the established repository limitation.
- **Fix**: No generated graph file was manually edited or repaired; source and test verification remain independent.
- **Prevention**: Resolve Graphify output permissions before treating refresh as a release gate; never repair generated output destructively during feature work.
- **Related tasks**: Phase 6 campus-association fix T5

## 2026-09-01: Phase 6 campus-association fix — browser CLI unavailable
- **Error**: The required `agent-browser` command was not installed, so interactive local route QA could not start.
- **Cause**: This environment exposes no browser-control executable or browser MCP tool for the running local server.
- **Fix**: No application state was changed; the route/build/test gates and a local HTTP smoke check are used, and physical-device QA is reported as pending.
- **Prevention**: Provision the browser-control harness before manual UI verification and do not claim visual/device evidence from an unavailable tool.
- **Related tasks**: Phase 6 campus-association fix T5, T6

## 2026-09-01: Phase 6 campus-association post-fix retest — production deployment is pre-fix
- **Error**: Two fresh phone Capture sessions were reported as synced but were not visible in the campus-scoped desktop Library; the remote rows again have `campus_id = NULL`.
- **Cause**: The active production Vercel deployment is `READY` but was created at `2026-08-31T23:39:48Z` from commit `8329208` (`docs: specify Phase 4 Capture Library`), which predates the local campus-association files. The local fix files were written after that deployment, and the deployed commit does not contain the new Capture route. The phone therefore continued running the pre-fix client that uploads campus-less sessions.
- **Fix**: No deployment, application source, environment, Supabase schema/RLS, or captured data was modified. The finding is a deployment handoff; the prior three NULL-campus rows remain untouched by design.
- **Prevention**: Verify the deployment’s source/build after publishing the campus-association fix before repeating field QA; require a fresh row with both `campus_id` and payload `campusId` equal to the canonical Studio ID.
- **Related tasks**: Phase 6 campus-association fix T7

## 2026-09-01: Phase 6 post-fix verification — PowerShell parenthesized path parse repeated
- **Error**: A read-only `git status` probe failed because the unquoted `(admin)` route segment was parsed by PowerShell.
- **Cause**: The inspection command passed a route path containing parentheses without a literal-path-safe quote.
- **Fix**: No repository or remote state changed; the same status and commit checks were rerun with quoted paths.
- **Prevention**: Quote every Windows route path containing parentheses before passing it to PowerShell or Git.
- **Related tasks**: Phase 6 campus-association fix T7

## 2026-09-01: Phase 6R Wave A RED — Vitest startup permission failure
- **Error**: The Wave A geometry and Reviewer RED command failed while loading `vitest.config.ts` with Windows `spawn EPERM`; no test file was discovered or executed.
- **Cause**: The managed sandbox denied the child-process spawn used by Vite’s external-dependency resolver.
- **Fix**: No product source behavior was inferred or changed in response. The identical RED command will be rerun with the approved elevated execution context.
- **Prevention**: Distinguish test-runner startup failures from assertion failures and preserve the command/output before escalating execution.
- **Related tasks**: Phase 6R T2

## 2026-09-01: Phase 6R Wave A RED — geometry/detail contract failures
- **Error**: The elevated Wave A RED run executed 24 tests; 9 new assertions failed and 15 existing assertions passed. The intended failures covered the absent quality-aware algorithm version, curve retention and maximum-segment behavior, isolated spike rejection, named detail profiles, and the Reviewer Route Detail control.
- **Cause**: The repository still has the pre-6R Douglas–Peucker-only implementation and read-only Reviewer; no Wave A production behavior had been added at the RED checkpoint.
- **Fix**: This is the expected TDD red checkpoint. No unrelated source or remote data was changed; the next task implements only the Wave A contracts.
- **Prevention**: Keep the tests deterministic and source-index based; do not satisfy them by deleting raw samples, interpolating arbitrary vertices, or changing later Capture/Studio waves.
- **Related tasks**: Phase 6R T2

## 2026-09-01: Phase 6R Gate A — pre-existing Reviewer lint error
- **Error**: Targeted ESLint over the Wave A files reported one error at the existing `CaptureReviewer` async loading effect (`react-hooks/set-state-in-effect`) and one existing exhaustive-deps warning.
- **Cause**: The existing Reviewer calls its stateful asynchronous loader from an effect; the warning/error predates the Wave A Route Detail additions and is unrelated to candidate geometry.
- **Fix**: No unrelated loading behavior was changed during Wave A. Geometry and test files are verified separately; the existing Reviewer lint finding remains classified as pre-existing.
- **Prevention**: Keep future Reviewer lifecycle cleanup separate from geometry/detail work and rerun the focused linter before changing that lifecycle path.
- **Related tasks**: Phase 6R T6

## 2026-09-01: Phase 6R Gate A — Graphify refresh permission failure
- **Error**: The required `graphify update .` after Wave A reported `Nothing to update or rebuild failed` with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process, matching the established Phase 3–6 limitation.
- **Fix**: No generated graph file was manually changed or repaired; source/test/build evidence remains independent.
- **Prevention**: Resolve Graphify output permissions before treating refresh as a release gate; do not repair generated output destructively during feature work.
- **Related tasks**: Phase 6R T6

## 2026-09-01: Phase 6R Wave C planning — skill alias probe
- **Error**: The first read-only skill-instruction probe used the short skill names as literal filesystem paths and PowerShell reported that the files did not exist.
- **Cause**: The session catalog maps those names to plugin/cache roots rather than `C:\Users\Administrator\.codex\skills\...`.
- **Fix**: No repository state changed; the exact mapped paths were read successfully before Wave C planning or implementation.
- **Prevention**: Resolve the catalog alias to its absolute skill root before reading instructions; keep skill-discovery path errors separate from product verification.
- **Related tasks**: Phase 6R Wave C planning

## 2026-09-01: Phase 6R Wave C RED — Vitest startup permission failure
- **Error**: The focused Wave C RED command failed while loading `vitest.config.ts` with Windows `spawn EPERM`; no test body was discovered or executed.
- **Cause**: The managed sandbox denied the child-process spawn used by Vite’s external-dependency resolver, matching the established Wave A/B limitation.
- **Fix**: No product source behavior was inferred or changed; the identical RED command is being rerun with the approved elevated execution context.
- **Prevention**: Separate test-runner startup failures from assertion failures and preserve the exact command/output before escalating execution.
- **Related tasks**: Phase 6R T12

## 2026-09-01: Phase 6R Wave C RED — state and observation contract failures
- **Error**: The elevated Wave C RED run executed 7 files / 35 tests; 11 intended assertions/contracts failed and 24 existing assertions passed. Failures covered the missing `preparing` session state, recording-only store append, independent observed position, Preparing finish timing, recorder observation API and pause-watch continuity, Preparing file validation, GPS readiness quality presentation, and Shell marker placement from live fixes.
- **Cause**: The current implementation starts new sessions as `recording`, treats every recorder callback as a route sample, clears the watch on pause, validates only the legacy three statuses, and labels every current position as GPS ready.
- **Fix**: This is the expected TDD RED checkpoint. No production source, Supabase data, schema/RLS, Reviewer/import state, or captured evidence was changed; the next tasks implement only Wave C.
- **Prevention**: Keep GPS observation, GPS quality, and route sampling as separate concerns; preserve one watch through pause; update only `lastPosition` outside Recording; and use existing accuracy classification without adding a new threshold.
- **Related tasks**: Phase 6R T12

## 2026-09-01: Phase 6R Wave C T13 — Graphify refresh permission failure
- **Error**: The required `graphify update .` after the recorder source change reported `Nothing to update or rebuild failed` with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process, matching the established Wave A/B limitation.
- **Fix**: No generated graph files were manually edited; recorder verification proceeds independently.
- **Prevention**: Resolve Graphify output permissions before treating refresh as a release gate; never repair generated output destructively during feature work.
- **Related tasks**: Phase 6R T13

## 2026-09-01: Phase 6R Wave C T14 — Graphify refresh permission failure
- **Error**: The required `graphify update .` after the Capture state/store source change again reported `Nothing to update or rebuild failed` with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph files were manually edited; the state/store verification proceeds independently.
- **Prevention**: Keep Graphify output read-only when the refresh process is denied and do not treat this known environment limitation as a Capture behavior failure.
- **Related tasks**: Phase 6R T14

## 2026-09-01: Phase 6R Wave C T15 — Graphify refresh permission failure
- **Error**: The required `graphify update .` after CaptureShell/RecordingMap/HUD integration again reported `Nothing to update or rebuild failed` with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph files were manually edited; component and regression verification proceeds independently.
- **Prevention**: Keep Graphify output read-only when refresh is denied and do not let this known environment limitation broaden Wave C scope.
- **Related tasks**: Phase 6R T15

## 2026-09-01: Phase 6R Wave C T16 — scoped lint baseline findings
- **Error**: ESLint over the Capture directory and sync status component reported five errors and one warning in existing code: the pre-existing `CaptureLiveHud` clock state effect, four pre-existing `useCaptureDirection` ref-access findings, and the existing unused `syncStatus` warning in `CaptureReview`.
- **Cause**: Those files/lines predate Wave C; the Wave C changes only add readiness usage and state/observation wiring around them.
- **Fix**: No unrelated lifecycle or direction-hook behavior was changed. A second lint run is scoped to the changed files and excludes the known baseline findings.
- **Prevention**: Keep lifecycle/ref-rule cleanup as a separate task, compare lint output against the baseline, and do not broaden Wave C to unrelated hook refactors.
- **Related tasks**: Phase 6R T16

## 2026-09-01: Phase 6R Wave C T16 — production build worker permission failure
- **Error**: `npm run build` compiled the application successfully but failed while collecting page data because Next.js could not spawn its workers (`spawn EPERM`).
- **Cause**: The managed Windows sandbox denied the Next worker process, matching the established Phase 6/6R build limitation.
- **Fix**: No source change was made; the identical production build is being rerun with approved elevated execution.
- **Prevention**: Separate compilation from worker/static-generation verification and use the approved elevated build path when the sandbox blocks Next workers.
- **Related tasks**: Phase 6R T16

## 2026-09-01: Phase 6R Wave D planning — UI/UX design-system script unavailable
- **Error**: The UI/UX skill's documented `scripts/search.py` was not present at the catalog path; the path file resolves to a missing shared source location, so the design-system command could not run.
- **Cause**: This environment exposes the skill instructions but not the referenced script/data payload at the mapped filesystem location.
- **Fix**: No repository or product state was changed for the failed probe. The skill's concrete accessibility, touch-target, safe-area, responsive, semantic-color, and map-first checklist is being applied directly while preserving existing NAVI tokens.
- **Prevention**: Verify skill asset pointers before invoking optional search helpers and keep missing skill assets separate from application verification.
- **Related tasks**: Phase 6R Wave D planning, T17, T20

## 2026-09-01: Phase 6R Wave D RED — Vitest startup permission failure
- **Error**: The focused Wave D RED command failed while loading `vitest.config.ts` with Windows `spawn EPERM`; no test body was discovered or executed.
- **Cause**: The managed sandbox denied the child-process spawn used by Vite's external-dependency resolver, matching the earlier Wave A–C startup limitation.
- **Fix**: No product source behavior was inferred or changed. The identical RED command is being rerun with the approved elevated execution context.
- **Prevention**: Separate test-runner startup failures from assertion RED and preserve the exact command/output before escalating execution.
- **Related tasks**: Phase 6R T17

## 2026-09-01: Phase 6R Wave D RED — HUD and camera-boundary contracts
- **Error**: The elevated RED run executed the existing map cleanup and default NavigationMap tests, while the new Wave D contracts failed as intended: 4 HUD assertions failed because the current HUD is still an absolute overlay with no actions, 1 NavigationMap assertion failed because the new Capture opt-out is not implemented, and the new camera suite could not resolve the not-yet-created `../camera` module.
- **Cause**: Wave D production behavior had not been implemented at the RED checkpoint; the camera module and additive bounds opt-out do not exist yet, and the current HUD still represents the Gate C split layout.
- **Fix**: No production source was changed before the RED checkpoint. The failures are retained as the TDD contract for the next Wave D tasks.
- **Prevention**: Keep camera tests provider-neutral, verify the shared NavigationMap default separately from Capture opt-out, and preserve the exact pre-implementation failure before adding implementation.
- **Related tasks**: Phase 6R T17

## 2026-09-01: Phase 6R Wave D T18 — Graphify refresh permission failure
- **Error**: The required `graphify update .` after the Capture camera policy source change reported `Nothing to update or rebuild failed` with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process, matching the established Wave A–C limitation.
- **Fix**: No generated graph output was manually edited; camera-policy tests remain the source verification boundary.
- **Prevention**: Keep Graphify refresh failures separate from product tests and do not repair generated output destructively during Wave D.
- **Related tasks**: Phase 6R T18

## 2026-09-01: Phase 6R Wave D T19 — Graphify refresh permission failure
- **Error**: The required `graphify update .` after the NavigationMap boundary and Capture camera-control changes again reported `Nothing to update or rebuild failed` with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was manually edited; map-boundary and camera-control tests remain the verification source.
- **Prevention**: Treat this known refresh limitation as an environment finding and preserve shared-map defaults through direct tests.
- **Related tasks**: Phase 6R T19

## 2026-09-01: Phase 6R Wave D T20 — Graphify refresh permission failure
- **Error**: The required `graphify update .` after the merged Capture HUD, responsive CSS, and camera-control mount reported `Nothing to update or rebuild failed` with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was manually edited; the focused HUD and camera tests provide independent verification.
- **Prevention**: Preserve the generated graph as read-only when refresh is denied and keep Graphify failure separate from UI behavior verification.
- **Related tasks**: Phase 6R T20

## 2026-09-01: Phase 6R Wave D T21 — Graphify refresh permission failure
- **Error**: The required `graphify update .` after the final Wave D camera dependency cleanup again returned `Nothing to update or rebuild failed` with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was manually edited; the final focused and full regressions remain independent evidence.
- **Prevention**: Keep Graphify refresh failures separate from product verification and do not repair generated output destructively during a gate.
- **Related tasks**: Phase 6R T21

## 2026-09-01: Phase 6R Wave D T21 — static verification baseline findings
- **Error**: Final targeted ESLint retained the existing `CaptureLiveHud` timer-effect `react-hooks/set-state-in-effect` error and unused `LatLng` warning. Repository typecheck retained the existing missing-`}` syntax error in `packages/runtime/src/__tests__/data-identity-comparison.test.ts`.
- **Cause**: These findings predate Wave D and are outside the HUD/camera scope; the camera dependency warnings introduced during verification were corrected without changing controller behavior.
- **Fix**: No unrelated timer, shared-map type, or runtime-test refactor was made. The Wave D production build and focused tests pass independently.
- **Prevention**: Keep the baseline lint/typecheck cleanup as a separate task and compare future gate output against this recorded baseline.
- **Related tasks**: Phase 6R T21

## 2026-09-01: Phase 6R Wave D T21 — local browser smoke limitations
- **Error**: The first Playwright probe failed from PowerShell/Node quoting; the corrected probe initially hit Windows `spawn EPERM` when launching Chromium. The elevated probe reached `/login` for both `390x844` and desktop because no authenticated browser session was available, so it could not exercise protected Capture UI.
- **Cause**: The local app requires authentication for `/capture`, and the managed sandbox blocks the browser child process unless elevated.
- **Fix**: The probe was corrected and rerun elevated. It confirmed HTTP 200, the expected login redirect, and no document overflow at both viewports; no deployment or auth bypass was performed.
- **Prevention**: Run responsive Capture QA with an authenticated browser profile or the approved physical phone after Gate D; keep route-access limitations distinct from component-test evidence.
- **Related tasks**: Phase 6R T21

## 2026-09-01: Phase 6R Wave D T21 — local dev port already occupied
- **Error**: Starting a local Next dev server on port 3000 returned `EADDRINUSE`.
- **Cause**: A local dev server was already listening on port 3000.
- **Fix**: No process was stopped; the existing server was reused for the elevated Playwright smoke probe.
- **Prevention**: Detect and reuse the existing local server before starting another process during browser QA.
- **Related tasks**: Phase 6R T21

## 2026-09-01: Phase 6R Wave D T21 — unrelated diff-check baseline
- **Error**: A broad `git diff --check` surfaced pre-existing trailing whitespace in `docs/architecture/rendering.md`.
- **Cause**: The checkout contains unrelated dirty changes from earlier work.
- **Fix**: No unrelated file was modified; the Wave D scoped status/diff check showed no new whitespace issue in the touched tracked files.
- **Prevention**: Use scoped diff checks in this dirty checkout and preserve unrelated user changes.
- **Related tasks**: Phase 6R T21

## 2026-09-02: Phase 6R Wave E T22 — heading/orientation RED checkpoint
- **Error**: The elevated Wave E RED run reached 6 test files / 36 tests: 12 intended failures and 24 existing assertions passed. Failures covered missing circular heading helpers, the still-wide cone constants, missing camera orientation APIs, and permission action visibility outside Preparing; the new orientation-control suite could not resolve its not-yet-created production module.
- **Cause**: Wave E production behavior had not been implemented; the existing direction layer is North-Up/no-smoothing, the Wave D camera controller has only Follow/center behavior, and the HUD still renders the direction permission action whenever its callback is supplied.
- **Fix**: This is the expected TDD RED checkpoint. No Wave E production source, raw Capture data, schema/RLS, Reviewer/import behavior, or downstream architecture was changed before the checkpoint.
- **Prevention**: Keep heading smoothing display-only, verify MapLibre's bearing convention against the installed API, preserve independent Follow/orientation state, and do not treat the missing test module or baseline environment limits as product failures.
- **Related tasks**: Phase 6R T22

## 2026-09-02: Phase 6R Wave E T23 — Graphify refresh permission failure
- **Error**: The required `graphify update .` after the heading validation/smoothing source change did not complete successfully in the managed environment, matching the recurring Windows Graphify refresh limitation.
- **Cause**: The managed Graphify output/cache path is inaccessible to the refresh process.
- **Fix**: No generated graph output was manually edited; the T23 heading tests and existing direction regressions provide independent verification.
- **Prevention**: Preserve generated graph output as read-only when refresh is denied and keep this environment finding separate from source/test results.
- **Related tasks**: Phase 6R T23

## 2026-09-02: Phase 6R Wave E T24 — Graphify refresh permission failure
- **Error**: The required `graphify update .` after the Capture camera orientation extension did not complete successfully under the managed Windows environment.
- **Cause**: The Graphify output/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; the provider-neutral camera tests are the independent verification boundary.
- **Prevention**: Keep Graphify output read-only when refresh is denied and do not broaden the camera task to environment repair.
- **Related tasks**: Phase 6R T24

## 2026-09-02: Phase 6R Wave E T25 — Graphify refresh permission failure
- **Error**: The required `graphify update .` after integrating the orientation control, permission UX, and narrow cone again returned `Nothing to update or rebuild failed` with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; direction, camera, component, and cone tests provide independent verification.
- **Prevention**: Keep Graphify refresh failures separate from display behavior and do not repair generated output destructively during Wave E.
- **Related tasks**: Phase 6R T25

## 2026-09-02: Phase 6R Wave E T26 — static verification baseline and build worker permission
- **Error**: Targeted ESLint retained the established HUD timer-effect error, four established `useCaptureDirection` ref-access errors, and the unused `LatLng` warning. Repository typecheck retained the established missing-`}` error in `packages/runtime/src/__tests__/data-identity-comparison.test.ts`. The first production-build attempt compiled successfully but stopped at page-data collection with Windows `spawn EPERM`.
- **Cause**: These lint/typecheck findings predate Wave E and are outside its orientation scope. The managed sandbox denied Next.js worker creation during the first build attempt.
- **Fix**: No unrelated source was changed. The same production build was rerun with approved elevated execution and passed compilation, page-data collection, static generation (**40/40**), and optimization. Wave E test suites remain green independently.
- **Prevention**: Compare gate output against the recorded baseline, keep lifecycle/ref-rule cleanup separate from heading work, and use the approved elevated build path when the sandbox blocks Next workers.
- **Related tasks**: Phase 6R T26

## 2026-09-02: Phase 6R T27 — Vercel CLI authentication recovery
- **Error**: The first authorized preview-deployment attempt was rejected because the stored Vercel CLI token was invalid; the sandboxed CLI also could not reach the Vercel service because of the managed network proxy.
- **Cause**: The checkout had no usable active Vercel CLI authentication for the linked project, and the sandbox blocks the required external connection.
- **Fix**: Started the standard Vercel device-login flow, completed authentication, and reran the same preview deployment. No credential value was printed, committed, or passed in a command argument.
- **Prevention**: Verify Vercel CLI authentication and linked project metadata before deployment; use elevated network execution only when the sandbox blocks the service.
- **Related tasks**: Phase 6R T27

## 2026-09-02: Phase 6R T27 — remote dependency audit advisories
- **Error**: The Vercel remote install reported eight high-severity `npm audit` advisories and pending install-script approval notices.
- **Cause**: Existing dependency-tree/security configuration findings surfaced during the remote build; they are unrelated to the Wave E orientation implementation.
- **Fix**: No dependency, install-script, application, Supabase, or deployment configuration changes were made in this gate. The deployment completed successfully and the advisories were recorded for separate review.
- **Prevention**: Run a separately authorized dependency/security review before treating these advisories as resolved; do not fold unrelated cleanup into the Phase 6R field-validation gate.
- **Related tasks**: Phase 6R T27

## 2026-09-02: Phase 6R Wave E visual correction T29 — heading-glow RED
- **Error**: The elevated RED run executed 2 files / 13 tests; 5 new heading-glow and layer-cleanup assertions failed while 8 existing assertions passed. Failures exposed the old polygon/arrow GeoJSON shape, 8 m cone/7 m arrow constants, and the two old MapLibre direction layers.
- **Cause**: The current implementation still constructs a filled triangular cone and a separate center arrow line; the approved short blurred LineString glow has not been implemented yet.
- **Fix**: No production source, Capture data, candidate route, marker, import/sync, or HUD behavior was changed at the RED checkpoint. The failing assertions are retained for T30.
- **Prevention**: Keep the new direction path single-layer and line-gradient-based, place `line-cap` in layout, and verify geographic anchoring and no-heading hiding through behavior tests rather than opacity-only edits.
- **Related tasks**: T29, T30

## 2026-09-02: Phase 6R Wave E visual correction T30 — heading glow GREEN
- **Error**: None in the focused product verification.
- **Cause**: The old polygon/arrow construction was replaced with the approved short geographic LineString glow.
- **Fix**: The direction source now contains one 4 m geographic line; its single line layer uses `line-gradient`, transparent far-edge stops, blur, round layout caps, and no fill/arrow layer. The green location dot and existing heading/camera ownership remain unchanged.
- **Prevention**: Keep `lineMetrics: true` on the GeoJSON source, assert the gradient/layer contract, and retain the no-heading empty-state test.
- **Related tasks**: T30

## 2026-09-02: Phase 6R Wave E visual correction T30 — Graphify refresh permission failure
- **Error**: The required `graphify update .` after the heading-glow source change returned `Nothing to update or rebuild failed` with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process, matching the prior Phase 6R gate entries.
- **Fix**: No generated graph output was edited; the focused direction and MapLibre layer tests remain the independent source verification.
- **Prevention**: Keep Graphify refresh failures separate from product behavior and do not repair generated output destructively during the correction.
- **Related tasks**: T30

## 2026-09-02: Phase 6R Wave E visual correction T31 — display-position RED
- **Error**: The elevated RED run loaded the new display-position test file but could not resolve the intentionally not-yet-created `../display-position` module; no test body executed.
- **Cause**: The provider-neutral accuracy-aware display stabilizer is the next implementation task and did not exist at the RED checkpoint.
- **Fix**: No Capture source, session data, candidate route, camera transition, HUD, marker, import/sync, or map behavior was changed for the RED checkpoint.
- **Prevention**: Keep the stabilizer as a small deterministic acceptance gate before the existing `easeTo` transition; do not reuse candidate-route filtering or add Kalman/coordinate averaging.
- **Related tasks**: T31, T32

## 2026-09-02: Phase 6R Wave E visual correction T32 — render-time stabilizer refs
- **Error**: Targeted ESLint reported nine `react-hooks/refs` errors in `RecordingMap.tsx` because the display-position stabilizer was initialized, reset, and updated through refs during render.
- **Cause**: The first integration attempted to keep the provider-neutral stabilizer persistent without introducing a state-render cycle, but React's hooks rules reject ref reads, writes, and method calls in render.
- **Fix**: Replace the render-time ref path with a per-session memoized stabilizer and memoized sample update; preserve the existing `easeTo` camera transition and keep raw samples unchanged.
- **Prevention**: Keep display-only derivation isolated from refs during render; use per-session memoization for deterministic acceptance state and reserve refs for effects/event handlers.
- **Related tasks**: T32, T33

## 2026-09-02: Phase 6R Wave E visual correction T33 — repository lint baseline
- **Error**: The full repository lint command reported the known dirty-checkout baseline, including generated `.next` bundles and pre-existing `any`, hook, and unused-symbol findings; it produced no new finding in the touched Wave E files.
- **Cause**: The repository lint script scans generated output and unrelated legacy areas in addition to the Capture source.
- **Fix**: Kept the scoped Wave E lint as the product gate; it exits 0 with no warnings. No unrelated generated or legacy source was changed.
- **Prevention**: Use scoped lint for this gate and compare the full-repository result only against the existing baseline recorded in T26.
- **Related tasks**: T26, T33

## 2026-09-02: Phase 6R Wave E visual correction T33 — local browser verification limitation
- **Error**: The prescribed `agent-browser` CLI is not installed, and the reachable local `/capture` route redirects to `/login`; protected Capture UI could not be opened for an authenticated screenshot. Port inspection also returned Windows `Access denied`.
- **Cause**: This checkout has no authenticated browser state available to the local smoke probe, and the managed environment does not expose the requested browser CLI or port-inspection permission.
- **Fix**: Used the installed Playwright/browser tooling path for the same smoke boundary without bypassing authentication; the code-level MapLibre layer contract and full Capture regression remain independently verified.
- **Prevention**: Repeat the final visual check with an authenticated browser profile or the approved physical phone; do not infer a physical-device pass from an unauthenticated login screenshot.
- **Related tasks**: T33

## 2026-09-02: Phase 6R Wave E visual correction T33 — Graphify refresh permission failure
- **Error**: The required post-change `graphify update .` returned `Nothing to update or rebuild failed` with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process, matching the recorded Wave E environment limitation.
- **Fix**: No generated graph output was manually edited; scoped lint, Capture tests, production build, and browser screenshots remain independent verification evidence.
- **Prevention**: Keep Graphify refresh failures separate from product behavior and do not repair generated output destructively during the Gate E correction.
- **Related tasks**: T33

## 2026-09-02: Phase 6R Wave E visual correction T33 — expired heading stale-frame guard
- **Error**: Review found that a previously smoothed heading could be selected for one render after the direction resolver returned `null`, before the camera callback cleared the smoothed heading state.
- **Cause**: Glow composition preferred the cached display heading without first requiring the current direction resolution to remain trustworthy.
- **Fix**: Gate the glow heading on the current resolved heading; stale display heading state can no longer keep the glow visible when reliable heading is absent.
- **Prevention**: Test no-heading behavior at the final composition boundary as well as in the pure direction builder, and keep raw heading/status resolution separate from display-only smoothing.
- **Related tasks**: T33

## 2026-09-02: Phase 6R Wave E visual correction T33 — final Graphify refresh permission failure
- **Error**: The required `graphify update .` after the final expired-heading guard again returned `Nothing to update or rebuild failed` with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify output/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was manually edited; the final focused tests, full Capture regression, scoped lint, production build, and local screenshots completed independently.
- **Prevention**: Keep generated graph refresh failures separate from the final product gate and preserve the existing dirty graph output.
- **Related tasks**: T33

## 2026-09-02: Phase 6R Quick Capture arrow correction T35 — direction-arrow RED checkpoint
- **Error**: The elevated focused run executed 3 Capture files / 17 tests; 7 intended arrow-contract assertions failed while 10 existing heading/listener assertions passed. Failures exposed the old `glow` GeoJSON field, old glow layer cleanup, and old gradient line layer.
- **Cause**: The new request supersedes the previous glow target, but production still constructs and consumes the old geographic LineString glow.
- **Fix**: No production source, GPS stabilizer, raw sample, candidate route, camera, marker, sync/import, Reviewer, Studio, or HUD behavior was changed before the RED checkpoint.
- **Prevention**: Keep the replacement to one Point-backed symbol arrow with map-aligned rotation, remove all Capture glow styling and `lineMetrics`, and preserve the existing stabilized display coordinate and heading pipeline.
- **Related tasks**: T35, T36

## 2026-09-02: Phase 6R Quick Capture arrow correction T37 — local browser probe adjustment
- **Error**: The first local screenshot probe timed out waiting for a `Recording Map` heading that the production screen does not render as a heading element.
- **Cause**: The probe assumed the visual title semantics instead of the existing Capture DOM contract.
- **Fix**: Re-ran through the existing mock-auth flow and waited for the actual Capture controls/map canvas. Captured no-heading, North-Up, Heading-Up, east-heading, pan/Follow-OFF, and Recenter states successfully with no browser console errors.
- **Prevention**: Use the existing Capture control labels and map canvas as the local smoke boundary; keep visual conclusions separate from physical-phone validation.
- **Related tasks**: T37

## 2026-09-02: Road-tool investigation wildcard source probe
- **Error**: A read-only `rg` probe passed wildcard file paths such as
  `navi-next/src/components/floor-editor/*.tsx` literally and Windows
  returned `os error 123`.
- **Cause**: PowerShell did not expand the wildcard arguments before
  ripgrep received them.
- **Fix**: Re-ran the inspection against explicit resolved directories and
  files; no product files or data were changed.
- **Prevention**: Use explicit directories or file paths with ripgrep on
  Windows; avoid shell wildcard arguments in source probes.
- **Related tasks**: T2

## 2026-09-02: Phase 6R Quick Capture arrow correction T37 — browser tool availability
- **Error**: The prescribed `agent-browser` CLI was not installed in the checkout.
- **Cause**: The managed environment exposes Playwright but not the requested CLI binary.
- **Fix**: Used the installed Playwright browser path for the same local authenticated/mock-GPS smoke without bypassing auth. This produced the requested local screenshots; it is not a physical-device result.
- **Prevention**: Repeat the final visual check on the supplied physical phone before unblocking Wave F.
- **Related tasks**: T37

## 2026-09-02: Phase 6R Quick Capture arrow correction T37 — repository TypeScript baseline
- **Error**: `tsc --noEmit` exits on the established unrelated syntax error `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3): error TS1005: '}' expected`.
- **Cause**: The repository contains a pre-existing malformed runtime test outside the Capture arrow scope; Next production build also uses its established skipped-type-validation convention.
- **Fix**: No unrelated runtime test was changed. Scoped ESLint, focused/complete Capture tests, and the production build passed; the arrow files produced no TypeScript diagnostic before the baseline parser failure.
- **Prevention**: Track the runtime test syntax issue as a separate repository cleanup task and do not fold it into Wave E.
- **Related tasks**: T37

## 2026-09-02: Road-tool investigation Vitest startup probe
- **Error**: The focused Vitest command failed before loading any test body with Vite `externalize-deps` error `spawn EPERM` while loading `vitest.config.ts`.
- **Cause**: The managed Windows sandbox denied the child-process/path-resolution operation used by Vite/Rolldown.
- **Fix**: No source or test files were changed. Retry the identical read-only suite through the approved elevated execution path; if it remains unavailable, report the startup limitation separately from product behavior.
- **Prevention**: Classify runner startup failures independently from assertion failures and preserve source-level evidence when tests cannot initialize.
- **Related tasks**: T3

## 2026-09-02: Road-tool investigation focused compiler suite baseline
- **Error**: The elevated focused Vitest run executed 5 files / 36 tests; 4 files passed, while 2 assertions in `packages/compiler/src/__tests__/road-junction.test.ts` failed because `result.success` was false for the crossing-road and single-road cases.
- **Cause**: The existing compiler characterization expects those fixtures to compile successfully, but the current compiler validation result rejects them before the junction assertions; this is outside the Studio edit interaction and was present without investigation changes.
- **Fix**: No source or test files were changed. Treat the compiler file as a baseline limitation, retain its source-level evidence that exact crossings create forced shared waypoints, and report the passing Studio/legacy tests separately.
- **Prevention**: Separate test-fixture/validation-baseline failures from the road-edit interaction diagnosis; assert the junction behavior at the generator/graph boundary in a focused fixture before using end-to-end compile success as evidence.
- **Related tasks**: T3

## 2026-09-02: Road-tool investigation wildcard rendering probe
- **Error**: A second broad `rg` command included a literal Windows wildcard path (`packages/editor/src/rendering/*.ts`) and returned `os error 123`; the remaining explicit-path probes completed.
- **Cause**: PowerShell did not expand the wildcard argument before ripgrep received it.
- **Fix**: No source or test files were changed. Subsequent searches use explicit files or directories only.
- **Prevention**: Do not pass shell wildcard file arguments to ripgrep on Windows.
- **Related tasks**: T3

## 2026-09-02: Road-tool investigation repository diff-check baseline
- **Error**: Repository-wide `git diff --check` reported an unrelated trailing-whitespace line in `docs/architecture/rendering.md` and line-ending warnings across the already-dirty checkout.
- **Cause**: The repository contains pre-existing documentation and generated/tooling changes outside this investigation scope.
- **Fix**: No unrelated files were modified. Use a scoped diff check for the investigation ledger files and report the repository-wide baseline separately.
- **Prevention**: Do not interpret a full dirty-checkout diff check as evidence against a read-only diagnosis; validate only files touched by the current workflow.
- **Related tasks**: T5

## 2026-09-02: Road-tool investigation progress-log patch context
- **Error**: The first attempt to append the investigation result to `progress/PROGRESS.md` used a TODO heading that was not present in that file, so `apply_patch` rejected the patch.
- **Cause**: The progress file already contains historical session entries and does not share the root TODO heading.
- **Fix**: No file was changed by the rejected patch. Reapply against the verified final progress entry instead.
- **Prevention**: Inspect the file tail before appending to a shared historical log; use a stable neighboring line as patch context.
- **Related tasks**: T5

## 2026-09-02: Road-tool investigation progress-log append context retry
- **Error**: A second progress-log append used a copied historical tail that did not exactly match the current file, so `apply_patch` rejected it.
- **Cause**: The prior command output was truncated/normalized and was not a safe patch anchor for the shared log.
- **Fix**: No file was changed by the rejected patch. Read the actual tail and append using an exact final line.
- **Prevention**: Use the latest direct file output—not summarized context—as the patch anchor for append-only logs.
- **Related tasks**: T5

## 2026-09-04: Persisted junction fix characterization wrong Vitest cwd
- **Error**: The first focused characterization command failed before loading tests because Vitest resolved the repository root and could not resolve the nested app alias `@/engine/component-compiler`.
- **Cause**: The command used the nested binary from the repository root instead of running with `navi-next` as the working directory.
- **Fix**: No production or test behavior changed; rerun the unchanged test from the `navi-next` application root with app-relative paths.
- **Prevention**: Run nested-app Vitest commands from the package root so the configured path aliases and setup are applied.
- **Related tasks**: T1

## 2026-09-04: Persisted junction fix error-ledger patch context retry
- **Error**: The first attempt to append the Vitest cwd error used a copied final-line context that did not exactly match `errors/ERRORS.md`, so `apply_patch` rejected it.
- **Cause**: The shared historical ledger contains similar progress-log entries and the copied anchor was not the exact current text.
- **Fix**: No ledger content changed in the rejected attempt; reread the literal tail and re-applied the entries against the exact final heading and lines.
- **Prevention**: Use direct tail output with a unique heading when appending to the shared error ledger.
- **Related tasks**: T1

## 2026-09-04: Persisted junction topology separation round-trip baseline
- **Error**: The expanded Keep Separate regression reconnected the crossing after the `GraphAdapter.sync → Graph.toJSON/Graph.fromJSON → createDocument → GraphAdapter.sync` cycle; the direct GraphAdapter separation path remained disconnected.
- **Cause**: `createDocument` reconstructs `roadJunctions` from graph nodes but does not reverse-map `separatedCrossings`, so the reloaded document loses the persisted separation before the second sync.
- **Fix**: No production change was made for this unrelated persistence gap; scope the junction regression to direct separation behavior and retain the existing Graph serialization coverage as the protected baseline.
- **Prevention**: Keep SeparatedCrossing persistence as a separately scoped follow-up; do not alter compiler or document authority while repairing persisted junction topology.
- **Related tasks**: T3, T4

## 2026-09-04: Persisted junction topology fix Graphify refresh permission failure
- **Error**: The required post-edit `graphify update .` returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Windows Graphify extraction/cache path is not writable by the refresh process.
- **Fix**: No generated graph output was edited; the focused characterization, protected regression suites, live API topology, and localhost A* smoke were verified independently.
- **Prevention**: Keep Graphify refresh failures separate from application behavior and preserve the existing dirty graph output; retry the refresh only when the managed permission issue is resolved.
- **Related tasks**: T5

## 2026-09-05: Phase 6B Graphify refresh permission boundary
- **Error**: The required post-edit `graphify update .` again returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Windows Graphify extraction/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; application verification continues against the focused tests and independent public-store check.
- **Prevention**: Treat Graphify refresh as an environmental gate and preserve the existing dirty graph output until its managed permission boundary is resolved.
- **Related tasks**: T2, T3, T4

## 2026-09-05: Phase 6B final Graphify retry
- **Error**: The final required `graphify update .` retry again returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Windows Graphify extraction/cache path is still inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; the Phase 6B focused gate, full-suite classification, and final store/editor smoke group were verified independently.
- **Prevention**: Keep Graphify refresh failures separate from application behavior and retry only after the managed permission boundary changes.
- **Related tasks**: T5

## 2026-09-06: Phase 7B compiler RED fixture disconnected hallway
- **Error**: The first Phase 7B compiler contract fixture returned HALLWAY_DISCONNECTED errors before reaching the provenance assertions.
- **Cause**: The fixture introduced a hallway without an entrance bridge accepted by the current compiler validation path.
- **Fix**: Keep the contract fixture focused on a valid room and door projection; remove the unrelated hallway geometry from that fixture. Hallway projection remains covered by existing compiler fixtures and will be checked in the final protected suite.
- **Prevention**: Reuse a known-valid compiler fixture or add authored entrance connectivity before asserting artifact contracts.
- **Related tasks**: T2

## 2026-09-06: Phase 7B scoped diff-check nested repository path
- **Error**: The first scoped diff check for root workflow documents was run from navi-next with parent-relative paths, and Git rejected the paths as outside that nested repository.
- **Cause**: The application repository and root workflow documents have different working-directory boundaries.
- **Fix**: Reran the application check from navi-next and the workflow-document check from the Navi root; both completed without whitespace errors.
- **Prevention**: Run each diff check from the repository that owns the target path.
- **Related tasks**: T6

## 2026-09-06: Phase 7B Graphify refresh permission boundary
- **Error**: The required post-edit graphify update again returned Nothing to update or rebuild failed with [WinError 5] Access is denied.
- **Cause**: The managed Windows Graphify extraction/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; the Phase 7B graph query and application verification remain the evidence sources.
- **Prevention**: Treat Graphify refresh as an environmental gate and retry only after the managed permission boundary changes.
- **Related tasks**: T6

## 2026-09-06: Phase 8B nested Phase 8A audit path
- **Error**: The first read of `progress/PHASE-8A-PUBLISH-FAILSAFE-AUDIT.md` ran from the Navi workspace root and could not find the file.
- **Cause**: The Phase 8A audit is owned by the nested `navi-next` application repository, while the workflow ledger is owned by the workspace root.
- **Fix**: No product or audit file changed; subsequent reads use the nested application working directory.
- **Prevention**: Resolve each target path against the repository that owns it before reading or editing nested-app artifacts.
- **Related tasks**: T1

## 2026-09-06: Phase 8B absent tsconfig.base probe
- **Error**: A characterization command attempted to read `tsconfig.base.json`, which is not present in the nested application repository.
- **Cause**: The probe assumed a monorepo base TypeScript config instead of checking the confirmed file list first.
- **Fix**: No product file changed; the existing root `tsconfig.json` is the applicable app configuration.
- **Prevention**: Use `rg --files` to confirm configuration paths before reading them.
- **Related tasks**: T1

## 2026-09-06: Phase 8B root plan append context
- **Error**: The first append to plan/PLAN.md was rejected because the copied checkpoint context did not match the file's current literal tail.
- **Cause**: The plan file contains historical sections whose surrounding wording differed from the earlier read.
- **Fix**: No plan or TODO content changed in the rejected patch; the next attempt will read the exact tail and append at a stable end anchor.
- **Prevention**: Use a fresh literal tail immediately before append-only workflow edits.
- **Related tasks**: T1

## 2026-09-06: Phase 8B protected publish fixture provenance
- **Error**: The protected publish-blocking gate's warning-only payload returned
  HTTP 422 instead of 200 after the new strict artifact validator was added.
- **Cause**: The historical fixture omitted the Phase 7 graph campusId and
  artifact provenance fields required for a new publish write.
- **Fix**: Update only that fixture with matching campus and source metadata;
  production validation remains strict for new writes.
- **Prevention**: Keep protected publish fixtures aligned with the current
  provenance contract while retaining old-artifact compatibility only on read.
- **Related tasks**: T5

## 2026-09-06: Phase 8B optional validator adapter fields
- **Error**: A valid protected publish fixture still returned HTTP 422 after
  provenance was added.
- **Cause**: The publish route's validator adapter included optional fields with
  value undefined, and the validator interpreted those keys as present but
  malformed arrays.
- **Fix**: Treat undefined optional component/door fields as absent while
  continuing to reject explicit non-array values.
- **Prevention**: Keep adapter construction and runtime optional-field guards
  aligned; test both omitted and explicit malformed optional fields.
- **Related tasks**: T3, T4

## 2026-09-06: Phase 8B Graphify refresh permission boundary
- **Error**: The required post-edit `graphify update .` returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Windows Graphify extraction/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; Phase 8B verification used the completed focused, protected, compatibility, and full-suite test evidence.
- **Prevention**: Treat Graphify refresh as an environmental gate and retry only after the managed permission boundary changes.
- **Related tasks**: T6

## 2026-09-06: Phase 8B final Graphify refresh retry
- **Error**: The final required `graphify update .` retry again returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Windows Graphify extraction/cache path is still inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; the final full-suite run and Phase 8B focused gate completed independently.
- **Prevention**: Keep Graphify refresh failures separate from application behavior and retry only after the managed permission boundary changes.
- **Related tasks**: T6

## 2026-09-06: Phase 9B Graphify refresh permission boundary
- **Error**: The required post-edit `graphify update .` returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied` after the Phase 9B route and focused test edits.
- **Cause**: The managed Windows Graphify extraction/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; Phase 9B source, store, and consumer tests remain the evidence sources.
- **Prevention**: Treat Graphify refresh as an environmental gate and retry only after the managed permission boundary changes.
- **Related tasks**: T4, T5

## 2026-09-06: Phase 9B broad diff-check inherited whitespace
- **Error**: The broad nested/repository `git diff --check` probe reported existing trailing whitespace in `docs/architecture/rendering.md` and line-ending warnings across the dirty checkout.
- **Cause**: The workspace already contains broad unrelated edits and generated artifacts; the reported path is outside the Phase 9B implementation files.
- **Fix**: No unrelated whitespace was rewritten. Phase 9B files passed targeted ESLint and focused tests.
- **Prevention**: Keep broad dirty-checkout whitespace separate from scoped Phase 9B verification.
- **Related tasks**: T6

## 2026-09-06: Phase 9B final Graphify refresh retry
- **Error**: The required final `graphify update .` retry after the validator comment correction again returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Windows Graphify extraction/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; fresh Phase 9B tests and targeted lint remain the completion evidence.
- **Prevention**: Keep Graphify refresh failures separate from application behavior and retry only after the managed permission boundary changes.
- **Related tasks**: T6

## 2026-09-06: Navigate simulation Vitest sandbox spawn boundary
- **Error**: The first focused T1 Vitest command failed before loading tests because Vite config bundling returned Windows `spawn EPERM`.
- **Cause**: The sandbox blocked the child-process spawn used by Vitest's config dependency externalization.
- **Fix**: No application or test behavior was changed; retry the unchanged focused command with the approved escalated execution path.
- **Prevention**: Run nested-app Vitest from `navi-next` and classify pre-test process-spawn failures separately from test failures.
- **Related tasks**: T1

## 2026-09-06: Navigate simulation T2 Graphify refresh boundary
- **Error**: The required post-edit `graphify update .` returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Windows Graphify extraction/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; T2 application tests and scoped lint/diff checks remain the evidence sources.
- **Prevention**: Treat Graphify refresh as an environmental gate and retry only after the managed permission boundary changes.
- **Related tasks**: T2

## 2026-09-06: Navigate map-first T3 Graphify refresh boundary
- **Error**: The required post-edit `graphify update .` returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Windows Graphify extraction/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; T3 Navigate, ExploreMap, and camera tests remain the evidence sources.
- **Prevention**: Treat Graphify refresh as an environmental gate and retry only after the managed permission boundary changes.
- **Related tasks**: T3

## 2026-09-06: Navigate idle camera controls covered by setup overlay
- **Error**: Browser QA showed the map-first idle setup overlay visually covering the existing top-right View/Recenter/Compass controls on the narrow localhost viewport.
- **Cause**: Both the idle overlay and the canonical camera controls used the same stacking level, and the later setup sibling covered the controller UI.
- **Fix**: Lowered only the idle setup overlay to `z-10`; the existing camera controls remain at `z-20` and retain their Phase 6 behavior.
- **Prevention**: Include narrow viewport stacking checks whenever a new Navigate overlay shares the map with imperative controls.
- **Related tasks**: T5

## 2026-09-06: Navigate browser verifier unavailable
- **Error**: The required `agent-browser` verification command was not recognized by PowerShell, and no local `agent-browser` package was found under `node_modules`.
- **Cause**: The optional browser-verification CLI is not installed on this host.
- **Fix**: No application behavior changed; use the already connected persistent Chrome CUA for visual and interaction evidence, and report the CLI limitation separately.
- **Prevention**: Check CLI availability before starting automated browser verification and retain a supported browser-control fallback.
- **Related tasks**: T5

## 2026-09-06: Navigate map layer lifecycle race during browser QA
- **Error**: After a Navigate reload, the browser reported `There is no style added to the map` from the camera controller and then an uncaught `Cannot read properties of undefined (reading getSource)` from `BuildingLayer`.
- **Cause**: The exception occurred during the earlier Fast Refresh/React development-effect reconnect while the map style was being torn down; it did not recur during two subsequent clean browser reloads.
- **Fix**: Repeated clean reload verification after the implementation settled; no unrelated map or navigation behavior was changed.
- **Prevention**: Keep clean reloads in the Navigate browser gate and treat any recurrence as a separate lifecycle fix before release.
- **Related tasks**: T5

## 2026-09-06: Navigate browser OSM raster tile fetches
- **Error**: Chrome logged `AJAXError: Failed to fetch` for several `https://tile.openstreetmap.org/...` raster tiles while panning/zooming the localhost Navigate map.
- **Cause**: The browser/network environment did not allow every external OSM tile request; the campus overlay and already loaded raster tiles remained visible.
- **Fix**: No application or map-source change was made; record the network limitation separately from the verified Navigate behavior.
- **Prevention**: Repeat visual QA in an environment with OSM tile access or a permitted cached/local tile source.
- **Related tasks**: T5

## 2026-09-06: Navigate simulation final Graphify refresh boundary
- **Error**: The required final `graphify update .` returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Windows Graphify extraction/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; fresh focused/protected test evidence and browser QA remain the verification sources.
- **Prevention**: Retry Graphify refresh after the managed permission boundary changes, without treating it as an application failure.
- **Related tasks**: T5

## 2026-09-06: Navigate final ESLint path quoting probe
- **Error**: The first final scoped ESLint command was parsed by PowerShell as an unquoted `(public)` path segment and stopped before ESLint ran.
- **Cause**: The Navigate route test path contains parentheses and was omitted from the command's quoted path list.
- **Fix**: No source or test files changed; rerun the same scoped lint command with the route test path quoted.
- **Prevention**: Quote every path containing parentheses before invoking Windows command-line tooling.
- **Related tasks**: T5

## 2026-09-06: Navigate View compact-control workflow path probe
- **Error**: The first lookup for the existing Navigate forward-heading TODO used a workspace-root path and could not find the file.
- **Cause**: The prior TODO is owned by the nested `navi-next` application repository rather than the workspace root.
- **Fix**: No product or workflow file changed; this iteration uses a new root-scoped SPEC/PLAN/TODO for the compact View control.
- **Prevention**: Resolve nested-app artifacts from `navi-next` and workspace workflow artifacts from the Navi root before reading or editing.
- **Related tasks**: T1

## 2026-09-06: Navigate View compact-control Graphify boundary
- **Error**: The required post-edit `graphify update .` returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Windows Graphify extraction/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; focused tests and scoped ESLint remain the application verification evidence.
- **Prevention**: Treat Graphify refresh as an environmental gate and retry only after the managed permission boundary changes.
- **Related tasks**: T3

## 2026-09-06: Navigate camera-heading audit focused-test drift
- **Error**: The focused audit command ran 8 files and 51 tests, with 18 failures and 33 passes. Failures covered stale Follow/POV pitch and zoom expectations, missing max-zoom/controller fixtures, Follow pan suspension, old reset/destroy call counts, the old text View selector, Capture-compatible symbol-arrow expectations versus the current Navigate cone renderer, and the old position-marker layer/image contract.
- **Cause**: The working source and the test suite are out of sync across the prior Phase 6 camera changes and the requested Navigate heading UX. Some failures expose the requested product gaps; others assert protected legacy contracts that must be preserved or deliberately updated.
- **Fix**: Logged as the audit baseline. The targeted implementation will separate Capture's symbol arrow from Navigate's beam, update tests to the approved camera/heading contracts, and retain route/session behavior.
- **Prevention**: Keep Capture and Navigate rendering contracts independently tested, and update focused policy/controller tests whenever camera presets or limits change.
- **Related tasks**: T1, T2, T3, T4, T5

## 2026-09-06: Navigate Capture test-path lookup probe
- **Error**: A read-only lookup for `navi-next/src/features/capture/components/__tests__/RecordingMap.test.tsx` returned file-not-found.
- **Cause**: That guessed colocated test path does not exist in the current nested app; the Capture implementation and its actual references were already found through targeted search.
- **Fix**: No source or test behavior changed; continue with the existing Capture direction and RecordingMap references.
- **Prevention**: Resolve test locations with targeted repository search before opening guessed colocated paths.
- **Related tasks**: T2

## 2026-09-06: Navigate beam test context reset leak
- **Error**: The new marker wraparound test read no GeoJSON source because the preceding no-position test left the hoisted navigation context location as `null`.
- **Cause**: The marker fixture reset its maps but not its mutable location/heading context between tests.
- **Fix**: Reset the context to the valid campus coordinate and 359° heading in `beforeEach` before rerunning the focused suite.
- **Prevention**: Reset all mutable hoisted context state, not only mock calls and resource maps, in component tests.
- **Related tasks**: T2

## 2026-09-06: Navigate camera-heading T2 Graphify refresh boundary
- **Error**: The required post-edit `graphify update .` returned `Nothing to update or rebuild failed` and `[WinError 5] Access is denied` after the Navigate beam/Capture boundary changes.
- **Cause**: The managed Windows Graphify extraction/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; the 4-file, 22-test T2 rendering/protection run remains the application evidence.
- **Prevention**: Retry Graphify refresh only after the managed permission boundary changes and keep it separate from product test results.
- **Related tasks**: T2

## 2026-09-06: Navigate camera-heading T3 Graphify refresh boundary
- **Error**: The required post-edit `graphify update .` returned `Nothing to update or rebuild failed` and `[WinError 5] Access is denied` after the camera policy contract changes.
- **Cause**: The managed Windows Graphify extraction/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; the 13/13 policy test run remains the T3 application evidence.
- **Prevention**: Retry Graphify refresh only after the managed permission boundary changes and keep it separate from policy verification.
- **Related tasks**: T3

## 2026-09-06: Navigate camera-heading T4 Graphify refresh boundary
- **Error**: The required post-edit `graphify update .` returned `Nothing to update or rebuild failed` and `[WinError 5] Access is denied` after the imperative controller and React bridge changes.
- **Cause**: The managed Windows Graphify extraction/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; the combined 4-file, 35-test camera/bridge gate remains the T4 application evidence.
- **Prevention**: Retry Graphify refresh only after the managed permission boundary changes and keep it separate from camera verification.
- **Related tasks**: T4

## 2026-09-06: Navigate page simulator test-harness mismatch
- **Error**: The combined Navigate page/camera run had 1 failure: the page test expected `navigation-dev-panel` after enabling the development simulator flag, but the test's mocked `ExploreMap` renders only a map stub.
- **Cause**: The existing dynamic-map mock does not include the simulator UI that the real map composition renders; this is unrelated to the camera/heading changes.
- **Fix**: No dev-simulation or product code was changed; camera/page assertions passed and the mismatch remains classified for the final report.
- **Prevention**: Keep route/page mocks behavior-complete for protected development-only UI tests, or scope simulator assertions to the real map composition test.
- **Related tasks**: T5

## 2026-09-06: Navigate nested-worktree diff probe
- **Error**: A root-scoped `git diff --stat` did not describe the Navigate app files because the nested `navi-next` repository resolves to its own Git root and contains broad pre-existing tracked/untracked work.
- **Cause**: The workspace includes a nested application checkout with unrelated dirty changes; a root-relative diff path is not an authoritative implementation diff for that app.
- **Fix**: No files were reset, cleaned, or rewritten. Subsequent status checks use `git -C navi-next` and explicit nested paths.
- **Prevention**: Resolve the Git root before reporting scoped diffs in this workspace and preserve the broad dirty checkout.
- **Related tasks**: T6

## 2026-09-06: Navigate camera bridge lint cascade
- **Error**: The final scoped ESLint run rejected synchronous state updates inside two `NavigationCamera` effects and reported two unused symbols.
- **Cause**: The bridge used effects to mirror external mode/heading-follow props into local state, and the cleanup left an unused Compass icon and zoom destructuring binding.
- **Fix**: Replaced effect-based mirroring with prop-keyed local selections that derive the effective mode/heading state during render; removed the unused import and zoom binding. Focused camera tests and the final scoped lint then passed.
- **Prevention**: Keep controlled/uncontrolled bridge state keyed to its external source and run the exact scoped lint command after React lifecycle edits.
- **Related tasks**: T4, T6

## 2026-09-06: Navigate final page-suite mock mismatch
- **Error**: The full Navigate page suite finished 18/19; its development-simulator test could not find `navigation-dev-panel`.
- **Cause**: The test mocks the dynamic `ExploreMap` with a map stub, while the expected simulator panel is not part of that mock contract; this is unrelated to the camera/heading implementation.
- **Fix**: No production behavior was changed to satisfy the stale mock. Camera/page route assertions and all protected suites passed; the mismatch remains explicitly reported.
- **Prevention**: Keep page mocks behavior-complete when asserting development-only surfaces, or test that surface against the real map composition.
- **Related tasks**: T6

## 2026-09-06: Navigate final TypeScript baseline
- **Error**: `tsc --noEmit` stopped at `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255` with `TS1005: '}' expected`.
- **Cause**: An unrelated pre-existing syntax error in the repository baseline prevents the repository-wide typecheck from reaching the Navigate files.
- **Fix**: No unrelated runtime test file was edited; focused tests, scoped ESLint, and scoped diff-check remain the relevant implementation evidence.
- **Prevention**: Repair the baseline parser error in its owning runtime test before using repository-wide typecheck as a release gate.
- **Related tasks**: T6

## 2026-09-06: Navigate final browser campus bootstrap limitation
- **Error**: Headless Chromium reached `http://localhost:3000/map/navigate` and captured the shell, but after onboarding bypass the page did not receive campus data, so the live map and TOP/FOLLOW/POV controls were not interactable.
- **Cause**: The localhost browser environment did not complete the campus-data bootstrap; no application fetch/XHR response or product exception exposed a camera failure.
- **Fix**: No map, data, or navigation code was changed. Shell screenshots were retained as environment evidence, and automated component/controller tests supplied the interaction verification.
- **Prevention**: Run device/browser QA with the campus backend/seed data available, then repeat map, beam, gesture, and mode screenshots.
- **Related tasks**: T6

## 2026-09-06: Navigate camera-heading final Graphify refresh boundary
- **Error**: The required final `graphify update .` again returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Windows Graphify extraction/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; the final 21-file/225-test protected gate, 7/7 dev-contract gate, scoped lint, and scoped diff-check remain the application evidence.
- **Prevention**: Retry Graphify refresh after the managed permission boundary changes and keep it separate from product behavior verification.
- **Related tasks**: T6

## 2026-09-07: Navigate heading-follow React bridge mismatch
- **Error**: The focused heading/camera run failed the `NavigationCamera` bridge test because the controller update did not receive `headingFollowEnabled: true`, and the Compass click did not call `setHeadingFollowEnabled(false, 90)`; 48/49 focused tests passed.
- **Cause**: The current working-tree `NavigationCamera.tsx` prop interface/destructure/effect/control props omit `headingFollowEnabled` and `onToggleHeadingFollow`, while Navigate page state and the controller contract still provide and expect them.
- **Fix**: No product fix was applied; this was an audit-only reproduction.
- **Prevention**: Keep the page → `NavigationCamera` → controller heading-follow contract covered by the bridge test and verify the bridge’s controlled/uncontrolled mode state after any lifecycle cleanup.
- **Related tasks**: NAVI Heading-Up audit

## 2026-09-07: Navigate heading-up targeted fix Graphify refresh boundary
- **Error**: The required `graphify update .` after the heading bridge and controller smoothing changes returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Windows Graphify extraction/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; targeted tests, protected Capture tests, scoped Navigate tests, ESLint, and diff-check remain the verification evidence.
- **Prevention**: Retry Graphify refresh only after the managed permission boundary changes and keep its result separate from application behavior verification.
- **Related tasks**: NAVI Navigate Heading-Up Targeted Fix T4

## 2026-09-07: Navigate visual cleanup verification boundaries
- **Error**: The full Navigate page suite remains 19/20 because its development-simulator test expects `navigation-dev-panel`, while the dynamic `ExploreMap` mock renders only the map stub.
- **Cause**: The existing test harness does not model the real map composition's development-only surface; this phase does not change simulator behavior.
- **Fix**: Focused visual/action contracts pass; the known simulator mismatch is excluded from the focused gate and remains explicitly reported.
- **Prevention**: Make the dynamic map mock behavior-complete before using that test as a full page gate.
- **Related tasks**: T3, T4

## 2026-09-07: Navigate visual cleanup Graphify refresh boundary
- **Error**: The required `graphify update .` after the Navigate visual/beam changes returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Windows Graphify extraction/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; focused beam/page/camera/Capture tests, scoped ESLint, and diff-check remain the application evidence.
- **Prevention**: Retry Graphify refresh only after the managed permission boundary changes and keep its result separate from product verification.
- **Related tasks**: T2, T3, T4

## 2026-09-07: Navigate quick-controls focused test path probe
- **Error**: The first RED Vitest command was launched from the workspace root and could not find `node_modules/.bin/vitest.cmd`.
- **Cause**: The Vitest installation belongs to the nested `navi-next` application checkout.
- **Fix**: No source behavior changed; rerun the focused command from `navi-next`.
- **Prevention**: Resolve the owning Git/application root before invoking nested app tooling.
- **Related tasks**: T2

## 2026-09-07: Navigate quick-controls Vitest sandbox probe
- **Error**: Vitest failed during Vite config startup with `spawn EPERM` before loading the focused tests.
- **Cause**: The managed sandbox blocks the child-process spawn used by Vite's dependency externalizer.
- **Fix**: No source behavior changed; rerun the same focused gate through the approved elevated execution path.
- **Prevention**: Treat Windows process-spawn failures as an execution-environment boundary and keep the command unchanged when escalating.
- **Related tasks**: T2

## 2026-09-07: Navigate quick-controls Graphify refresh boundary
- **Error**: The required post-edit `graphify update .` returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Windows Graphify extraction/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was edited; application verification continues with focused tests, lint, and live-browser evidence.
- **Prevention**: Retry Graphify refresh only after the managed permission boundary changes and keep its result separate from product behavior verification.
- **Related tasks**: T4

## 2026-09-07: Navigate quick-controls browser runner path probe
- **Error**: The first Playwright verification command could not resolve the `playwright` module from the workspace root.
- **Cause**: Playwright is installed in the nested `navi-next` application checkout.
- **Fix**: No source behavior changed; rerun the browser script from `navi-next`.
- **Prevention**: Resolve the owning application root before invoking browser automation dependencies.
- **Related tasks**: T4

## 2026-09-07: Navigate quick-controls camera diagnostic selector probe
- **Error**: A read-only browser diagnostic used an invalid unquoted `aria-label` attribute selector and stopped before returning controller state.
- **Cause**: The selector's value contained spaces and was not quoted for `querySelector`.
- **Fix**: No source behavior changed; rerun the diagnostic by filtering button attributes in JavaScript.
- **Prevention**: Prefer DOM property filtering for diagnostic selectors whose values contain spaces.
- **Related tasks**: T4

## 2026-09-07: Navigate heading-follow programmatic rotate suspension
- **Error**: In the real mobile browser, a synthetic device heading reached the controller (`bearing: 270`, heading status `available`), but MapLibre stayed at bearing 0 and the controller marked `headingFollowSuspended: true`.
- **Cause**: The controller treats every `rotatestart` as manual rotation; MapLibre emits a programmatic `rotatestart` with no `originalEvent` during its own `easeTo`, so the controller suspends heading follow while applying its camera transition.
- **Fix**: No production code changed yet; add a regression contract distinguishing user-originated rotation from programmatic camera transitions before implementing the smallest controller guard.
- **Prevention**: Only suspend heading follow for MapLibre rotation events carrying a user `originalEvent`, and verify live `getBearing()` after synthetic heading input.
- **Related tasks**: T4

## 2026-09-07: Navigate camera transient style-readiness gate
- **Error**: In the live Navigate browser, a mode update reached `controller.update({ mode: "FOLLOW" })`, but MapLibre returned `isStyleLoaded() === false` during the active route/layer transition; the controller dropped the update, leaving the map in TOP until a later heading event retried it.
- **Cause**: `NavigationCameraController.update` uses the transient style-loaded value as a hard gate and has no retry or post-ready state, even after the map was previously ready.
- **Fix**: No production code changed yet; add a regression for continuing camera updates after the first successful style-ready update.
- **Prevention**: Preserve the controller's initial not-ready safety check while allowing camera commands during transient style reloads after readiness has been established.
- **Related tasks**: T4

## 2026-09-07: Navigate quick-controls Vitest launch quoting probe
- **Error**: One rerun command was parsed by PowerShell as a line break after `.` and stopped before Vitest started.
- **Cause**: The JavaScript tool-call string interpreted the Windows `\\n` path segment as a newline before passing it to PowerShell.
- **Fix**: No source behavior changed; rerun the unchanged test command with forward-slash executable paths.
- **Prevention**: Use forward-slash paths or double-escape Windows backslashes inside JavaScript tool-call strings.
- **Related tasks**: T4

## 2026-09-07: Navigate quick-controls diff path quoting probe
- **Error**: A read-only `git diff` command stopped because PowerShell interpreted the `(public)` directory segment as a command expression.
- **Cause**: The path containing parentheses was not quoted.
- **Fix**: No source behavior changed; rerun the same diff with each affected path quoted.
- **Prevention**: Quote repository paths containing parentheses in PowerShell diagnostics.
- **Related tasks**: T4

## 2026-09-07: Navigate quick-controls ESLint flag probe
- **Error**: The scoped lint command rejected `--file` with `Invalid option '--file'` before linting any source.
- **Cause**: This checkout uses ESLint flat config, where the legacy `--file` flag is unavailable.
- **Fix**: No source behavior changed; rerun ESLint with the target paths as positional arguments.
- **Prevention**: Inspect the active ESLint config mode before composing scoped CLI flags.
- **Related tasks**: T4

## 2026-09-07: Navigate browser verification quoting probe
- **Error**: A read-only Playwright helper stopped with a JavaScript syntax error before opening the page.
- **Cause**: An unescaped double-quoted selector inside the outer `node -e "..."` command terminated the shell string.
- **Fix**: No source behavior changed; rerun the helper with PowerShell-safe quoting.
- **Prevention**: Keep inline browser scripts free of unescaped quote delimiters or pass them with a safe outer quoting form.
- **Related tasks**: T4

## 2026-09-07: Navigate browser verification API helper probe
- **Error**: A read-only node API helper stopped with a missing-parenthesis syntax error before fetching route coordinates.
- **Cause**: The inline callback combined nested `JSON.stringify`/`map` calls without a balanced closing delimiter.
- **Fix**: No source behavior changed; simplify the helper and continue with browser-only verification data.
- **Prevention**: Keep one-purpose inline diagnostics shallow and syntax-check them before adding nested transforms.
- **Related tasks**: T4

## 2026-09-07: Navigate browser verification context probe
- **Error**: The mandatory browser script stopped before page interaction because `browser.contexts()[0]` was undefined.
- **Cause**: Playwright `chromium.launch()` does not create a default context; the script attempted to grant permissions on a nonexistent context.
- **Fix**: No source behavior changed; create an explicit browser context before granting geolocation permission.
- **Prevention**: Use `browser.newContext()` whenever browser-level permissions or mobile context options are required.
- **Related tasks**: T4

## 2026-09-07: Navigate camera idle-listener test expectation
- **Error**: The controller suite reported five `map.off` calls while the destroy test still expected four.
- **Cause**: The controller now removes both `styledata` and `idle` readiness listeners in addition to the existing interaction listeners.
- **Fix**: Update the isolated fixture count to cover the added idle listener.
- **Prevention**: Keep listener registration and teardown counts symmetric whenever a readiness signal is added.
- **Related tasks**: T4

## 2026-09-07: Navigate quick-controls final Graphify refresh boundary
- **Error**: The required post-edit `graphify update .` again returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Windows Graphify extraction/cache path remains inaccessible to the refresh process.
- **Fix**: No generated graph output was intentionally edited; application verification continues with 79 focused tests, scoped lint, and live-browser evidence.
- **Prevention**: Retry Graphify refresh only after the managed permission boundary changes and keep its result separate from application behavior verification.
- **Related tasks**: T4

## 2026-09-07: Navigate final browser smoke helper scope probe
- **Error**: The final read-only smoke stopped when `page.evaluate` could not resolve the Node-side `findMap` helper.
- **Cause**: Browser evaluation runs in a separate page context and cannot access Node lexical bindings.
- **Fix**: No source behavior changed; inline the map lookup inside the browser evaluation.
- **Prevention**: Treat page-evaluate helpers as self-contained browser code or pass explicit serializable arguments.
- **Related tasks**: T4

## 2026-09-07: NAVI designer audit page-global diagnostic probe
- **Error**: A read-only deployed Explore diagnostic failed because the browser wrapper's page-evaluation scope did not expose `performance.getEntriesByType`.
- **Cause**: The probe assumed standard page globals were available in the wrapper's evaluation context.
- **Fix**: No source or deployed state changed; continue with DOM-visible state, console diagnostics, route source, and supported browser APIs.
- **Prevention**: Keep live audit evaluations limited to supported DOM properties and verify wrapper capabilities before using browser globals.
- **Related tasks**: T2

## 2026-09-07: NAVI designer audit appendix route omission
- **Error**: The first report draft omitted the repository page route `/sandbox/tour-test` from the “every route discovered” appendix.
- **Cause**: The initial route reconciliation output was truncated/partial and the standalone sandbox page was not included in the first manual list.
- **Fix**: Queried the route tree again, inspected the page, added it to the appendix, and classified it as an isolated mock-data test page that should not be used as integrated NAVI evidence.
- **Prevention**: Reconcile the final appendix against the complete `src/app` page-file listing before closing the audit.
- **Related tasks**: T6

## 2026-09-07: Field regression audit camera-search wildcard
- **Error**: A read-only camera writer search passed a literal `src/lib/navigation*` directory argument; ripgrep returned Windows os error 123 after reporting matches in the other valid directories.
- **Cause**: PowerShell did not expand the directory wildcard for ripgrep.
- **Fix**: Repeat the search using the explicit src/lib directory and ripgrep glob filtering.
- **Prevention**: Pass real directory paths and use rg -g for filtering on Windows.
- **Related tasks**: Field regression audit T1

## 2026-09-07: Field regression audit Navigate test path
- **Error**: A read-only search targeted a nonexistent Navigate `__tests__/page.test.tsx`; the initial multi-file test command also included that unmatched filter.
- **Cause**: This route colocates `page.test.tsx` beside `page.tsx`.
- **Fix**: Resolved the actual route file list; run the colocated suite separately and do not count the unmatched filter as executed coverage.
- **Prevention**: Resolve route test paths before constructing focused commands.
- **Related tasks**: Field regression audit T1

## 2026-09-07: Field regression audit existing simulator regression
- **Error**: The colocated Navigate page suite fails its development-simulator visibility assertion; 19 page tests pass. Current source has no production caller of useNavigationDevSimulation or NavigationDevPanel and the page passes no locationOverride.
- **Cause**: The simulator is disconnected in the current composition. The page test also replaces ExploreMap with a stub; the source evidence independently establishes the missing wiring, so this is not classified solely as a mock mismatch.
- **Fix**: Audit-only: record the finding and future integration gate; no source/test changes. The extra guessed nav-route-helpers test filter matched no file; resolve the existing route-helpers suite before running it.
- **Prevention**: Verify production reachability and run sequential browser-callback integration checks before treating simulator/component tests as live-navigation proof.
- **Related tasks**: Field regression audit T1

## 2026-09-07: Field regression audit confirmed conditional localization/control defects
- **Error**: The real-page React diagnostic reproduces no continuous location in setup/preview, an ineffective setup Heading Follow toggle, and no POV heading rotation with the explicit follow flag OFF. A separate real-hook probe drops the final GPS callback inside 1000 ms and never delivers it during silence.
- **Cause**: NavigationSession uses watch: active; setup advertises camera surface active while page forces headingFollowEnabled false and rejects toggle persistence; POV respects this explicit flag; the geolocation throttle is leading-edge only.
- **Fix**: Audit-only findings retained in runtime-probe.json. Active P1–P4 propagation and active POV H2/H3 with follow ON succeed with mocked sensor delivery and MapLibre sink. Physical incident phase and deployed-code identity remain unknown.
- **Prevention**: Separate localization lifecycle from route lifecycle; require end-to-end sequential callback and phase-control contracts during implementation.
- **Related tasks**: Field regression audit T1

## 2026-09-07: Phase 1 geolocation test replacement patch shape
- **Error**: The first test-only `apply_patch` was rejected because one patch
  attempted to delete and add `useGeolocation.test.ts` at the same path.
- **Cause**: The patch parser does not allow multiple operations targeting the
  same file in one patch.
- **Fix**: No test or product file changed; replace the file with a direct
  update operation, then add the new integration test separately.
- **Prevention**: Use one update operation per existing file when replacing its
  complete contents.
- **Related tasks**: Phase 1 T1

## 2026-09-07: Field regression audit repeated config wildcard search
- **Error**: The config search repeated the Windows literal-wildcard mistake with next.config.*.
- **Cause**: The shell passed the glob as a literal filename.
- **Fix**: Use an explicit directory and rg -g filters; no product files changed.
- **Prevention**: Apply the earlier wildcard ledger rule to config paths as well as source directories.
- **Related tasks**: Field regression audit T1

## 2026-09-07: Field regression audit POV pitch contract mismatch
- **Error**: Navigate requests POV pitch 85 while NavigationMap does not set maxPitch; installed MapLibre defaults to maxPitch 60 and clamps pitch to that limit.
- **Cause**: The controller/policy contract exceeds the base map's configured pitch range. Existing camera fixtures accept the requested pitch without clamping.
- **Fix**: Audit-only: record as a confirmed pitch-configuration defect and camera-repair risk, not proof of the field heading/location cause.
- **Prevention**: Validate requested camera presets against actual MapLibre limits and observed camera state.
- **Related tasks**: Field regression audit T1

## 2026-09-07: Field regression audit phase clarified and baseline verified
- **Error**: Navigate failed to track while the user strolled without starting a route; setup Heading Follow/POV also failed the expected continuous behavior.
- **Cause**: User clarification confirms the no-route phase. NavigationSession ties watch mode to route activation, while setup exposes camera active controls but forces headingFollowEnabled false. This matches the real-source React reproduction. The earlier phase uncertainty is resolved.
- **Fix**: Audit only; no implementation. Report records the confirmed cause and future requirement to separate live foreground tracking from route guidance. Existing page suite result is 20 passed / 1 failed (21), correcting the initial audit ledger's older 19-passed count; total audit scope is 195 passed / 1 failed (196).
- **Prevention**: Require no-route walking and heading-follow acceptance alongside route-active progress and actual MapLibre/Android validation. Product baseline check: 1,283 unchanged files, no new product files.
- **Related tasks**: Field regression audit T1

## 2026-09-07: Phase 1 focused Vitest sandbox startup boundary
- **Error**: The first focused Phase 1 Vitest run stopped before test loading
  with Vite `spawn EPERM`.
- **Cause**: The managed sandbox blocked Vite's Windows child-process startup,
  matching the existing repository runner limitation.
- **Fix**: Reran the unchanged focused command through the approved elevated
  Vitest path.
- **Prevention**: Run from `navi-next` and preserve the exact command when
  escalating a pre-test spawn failure.
- **Related tasks**: Phase 1 T1

## 2026-09-07: Phase 1 hook test JSX extension mismatch
- **Error**: The elevated RED run could not transform JSX in the existing
  `.test.ts` hook test file, so that suite did not reach its assertions.
- **Cause**: The Strict Mode wrapper used JSX in a TypeScript file without the
  `.tsx` extension.
- **Fix**: Use `createElement` for the wrapper and rerun until the RED suite
  fails only on the intended product contracts.
- **Prevention**: Keep JSX out of `.ts` tests or rename them to `.tsx` before
  relying on JSX syntax.
- **Related tasks**: Phase 1 T1

## 2026-09-08: Phase 1 browser gate setup timeout
- **Error**: The first headless Chromium Phase 1 gate timed out waiting for the
  Navigate setup surface, then retained its browser process until interrupted.
- **Cause**: The controlled public-campus route had not yet been proven to
  match the page request, and the diagnostic script did not force process exit
  after an early failure.
- **Fix**: No product file changed; broaden the local API matcher, print page,
  request, and error state on setup failure, and terminate the diagnostic
  process on rejection before retrying.
- **Prevention**: Make browser fixtures observable and guarantee cleanup on
  every diagnostic failure path.
- **Related tasks**: Phase 1 T3

## 2026-09-08: Phase 1 browser fixture used the internal store shape
- **Error**: The observable browser retry intercepted the expected campus
  request, but Navigate displayed `No campus data available`.
- **Cause**: The diagnostic returned the store's normalized `{ bundle }`
  shape; the real `/api/public-campus` boundary returns flat nodes, edges,
  buildings, components, boundary, and artifacts fields.
- **Fix**: Change only the diagnostic fixture to the actual API response shape
  already consumed by `fetchFromPublicCampus`.
- **Prevention**: Build browser fixtures from the transport boundary rather
  than from a downstream normalized state type.
- **Related tasks**: Phase 1 T3

## 2026-09-08: Phase 1 browser unmount selector mismatch
- **Error**: The corrected browser gate reached the completed end state but
  timed out locating Home as an ARIA link for the final unmount check.
- **Cause**: The public shell does not expose that navigation item with the
  assumed link role.
- **Fix**: Inspect the actual shell markup and use its stable navigation
  contract for the unmount transition.
- **Prevention**: Resolve the rendered role before coding a browser selector.
- **Related tasks**: Phase 1 T3

## 2026-09-08: Phase 1 public-route search path quoting
- **Error**: A read-only ripgrep command parsed `(public)` as PowerShell syntax
  instead of part of a literal directory path.
- **Cause**: The app-route directory containing parentheses was not quoted.
- **Fix**: Repeat the search with each directory passed as a quoted literal.
- **Prevention**: Always quote Next.js route-group paths in PowerShell commands.
- **Related tasks**: Phase 1 T3

## 2026-09-08: Phase 1 dev overlay blocked the unmount click
- **Error**: The browser gate found the real Home button, but Playwright could
  not click it because the Next.js development overlay portal intercepted the
  bottom-navigation pointer target.
- **Cause**: The local development overlay sits above the mobile bottom bar;
  all acquisition phase assertions had already completed.
- **Fix**: Invoke the real button's click handler programmatically for the
  teardown transition, while retaining page-error collection as a gate.
- **Prevention**: Isolate dev-overlay hit-test interference from application
  lifecycle behavior in headless checks.
- **Related tasks**: Phase 1 T3

## 2026-09-08: Phase 1 browser teardown sampled before React unmount
- **Error**: The browser gate passed all setup/preview/active/end observations
  but read one live watcher immediately after the Home URL changed.
- **Cause**: URL transition completion preceded React child teardown; the one
  recorded clear belonged to the initial Strict Mode cleanup.
- **Fix**: Wait for the Navigate marker to detach and for the instrumented live
  watcher count to reach zero before recording unmount evidence.
- **Prevention**: Use a component-detachment condition rather than URL change
  alone as the lifecycle completion signal.
- **Related tasks**: Phase 1 T3

## 2026-09-08: Phase 1 TypeScript baseline parse failure
- **Error**: Repository-wide `tsc --noEmit` stopped at
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255` with
  `TS1005: '}' expected`.
- **Cause**: This pre-existing runtime test parse error was already documented
  before Phase 1 and is outside the changed acquisition files.
- **Fix**: Keep it as a baseline limitation; scoped ESLint, Vitest, and the
  production Next.js build verify the changed files without editing runtime.
- **Prevention**: Separate baseline parse failures from changed-file failures
  and do not repair unrelated package tests inside a bounded phase.
- **Related tasks**: Phase 1 T3

## 2026-09-08: Phase 1 production build sandbox worker boundary
- **Error**: The first `npm run build` compiled successfully but failed while
  spawning Next.js page-data workers with `spawn EPERM`.
- **Cause**: The managed sandbox blocks the Windows child processes used by
  the production build.
- **Fix**: Reran the unchanged build through the approved elevated path; all
  41 static pages generated and the build exited successfully.
- **Prevention**: Preserve the same build command when escalating a post-compile
  worker-spawn failure.
- **Related tasks**: Phase 1 T3

## 2026-09-08: Phase 1 baseline added-file scan included generated trees
- **Error**: The first added-file comparison reported 651 entries because it
  traversed nested `.next` and `node_modules` output under apps/packages.
- **Cause**: The audit baseline intentionally records product files, while the
  comparison included generated build and dependency caches.
- **Fix**: Restrict the added-file comparison to `navi-next/src`, the only
  product source root changed in Phase 1; retain the full baseline hash check
  for existing files.
- **Prevention**: Apply the baseline's product-root/exclusion rules when
  enumerating additions.
- **Related tasks**: Phase 1 T3

## 2026-09-08: Phase 1 Graphify refresh permission boundary
- **Error**: The required `graphify update .` failed with Windows `WinError 5`.
  The elevated retry completed AST extraction but could not replace
  `graphify-out/graph.json` from `.graph.tmp.json`.
- **Cause**: The managed Graphify output/cache replacement path remains
  inaccessible, matching earlier repository sessions.
- **Fix**: Do not hand-edit generated graph output; retain application tests,
  browser evidence, build output, scoped lint, and audit-baseline hashes as the
  Phase 1 verification evidence.
- **Prevention**: Retry Graphify only after the managed Windows permission
  boundary changes and keep this failure separate from product behavior.
- **Related tasks**: Phase 1 T3

## 2026-09-08: Phase 1 final documentation check quoting
- **Error**: The first combined final documentation check did not start because
  nested quote syntax made the JavaScript orchestration source invalid.
- **Cause**: PowerShell regex literals were embedded in a JavaScript string
  without valid JavaScript escaping.
- **Fix**: No check or application file changed; simplify the PowerShell
  expressions and rerun the read-only check.
- **Prevention**: Keep nested JavaScript/PowerShell quoting shallow in composed
  verification calls.
- **Related tasks**: Phase 1 T3
## 2026-09-08: Phase 2 RED Vitest sandbox startup boundary
- **Error**: The first focused Phase 2 RED run stopped before loading the
  Navigate page suite with Vite `spawn EPERM`.
- **Cause**: The managed Windows sandbox blocks the Vite child process used
  while externalizing the Vitest config.
- **Fix**: Rerun the unchanged focused command through the approved elevated
  Vitest path; no assertion result was counted from the sandbox attempt.
- **Prevention**: Run nested-app Vitest from `navi-next` and preserve the
  exact command when escalating a pre-test spawn failure.
- **Related tasks**: Phase 2 T1
## 2026-09-08: Phase 2 RED heading/POV parent contracts
- **Error**: The new Navigate regressions failed because setup Heading Follow
  still ignored the parent toggle and selecting POV left the explicit follow
  flag OFF; the existing simulator visibility test also failed.
- **Cause**: The page callback returns before updating state outside active
  navigation, and its mode callback only changes the selected camera mode.
  The simulator failure is the pre-existing disconnected page wiring.
- **Fix**: No product fix at the RED checkpoint; the two new failures are the
  intended Phase 2 implementation target, while the simulator remains a
  separately classified baseline failure.
- **Prevention**: Keep the parent seam assertions separate from simulator
  reachability and do not weaken the new behavior to make RED pass.
- **Related tasks**: Phase 2 T1
## 2026-09-08: Phase 2 parallel verification command boundaries
- **Error**: A parallel post-T2 check repeated the managed-sandbox Vite
  `spawn EPERM`, and a read-only diff command prefixed `navi-next` while
  already running from that directory, so Git could not resolve the path.
- **Cause**: Vitest still needs the elevated Windows runner; the diff command
  mixed a repository-relative path with the already-selected nested workdir.
- **Fix**: Count the prior elevated 22-pass/1-known-failure result as the T2
  test evidence, and rerun future Git checks from the repository root or use
  `git -C .` from `navi-next`.
- **Prevention**: Keep shell workdirs and Git path prefixes consistent and
  separate runner startup limits from assertion results.
- **Related tasks**: Phase 2 T2
## 2026-09-08: Phase 2 browser gate Chromium startup boundary
- **Error**: The first Phase 2 browser gate stopped at Playwright Chromium
  launch with `browserType.launch: spawn EPERM`; no page assertion ran.
- **Cause**: The managed Windows sandbox blocks the Chromium child process,
  matching the repository's prior browser-runner permission boundary.
- **Fix**: Rerun the unchanged browser gate through the approved elevated
  execution context and count only its page-level output.
- **Prevention**: Separate browser process startup from application evidence
  and preserve the same fixture/script on escalation.
- **Related tasks**: Phase 2 T3
## 2026-09-08: Phase 2 browser gate route fixture timeout
- **Error**: The elevated browser gate launched Chromium and completed setup
  control interaction, but timed out waiting for Route Preview after choosing
  the test destination.
- **Cause**: The diagnostic had no failure-state dump around the route
  transition, so the controlled fixture/selection state was not yet observable.
- **Fix**: Add bounded DOM, phase, button, preference, and page-error output to
  the gate's route-preview wait before retrying; no product source changed.
- **Prevention**: Keep every browser phase transition observable and fail with
  the rendered state rather than a bare timeout.
- **Related tasks**: Phase 2 T3
## 2026-09-08: Phase 2 Graphify refresh permission boundary
- **Error**: Required `graphify update .` re-extraction ended with
  `[WinError 5] Access is denied` and exit code 1.
- **Cause**: The managed Windows Graphify output/cache replacement boundary
  remains inaccessible after product changes, as in Phase 1.
- **Fix**: Do not hand-edit or delete generated graph output; retain the
  source/test/browser/build evidence and classify Graphify as an environment
  limitation.
- **Prevention**: Retry Graphify only when the managed permission boundary is
  available and keep generated graph files outside product implementation.
- **Related tasks**: Phase 2 T3
## 2026-09-08: Phase 2 final diff-check path quoting
- **Error**: Nested Git diff checks passed `src/app/(public)/...` without
  quoting, so PowerShell parsed `public` as syntax before Git ran.
- **Cause**: The Next.js route-group parentheses were embedded in a shell
  command without literal quoting.
- **Fix**: Rerun the same read-only checks with each route path quoted; no
  source or evidence file changed.
- **Prevention**: Quote every `(public)` route-group path in PowerShell,
  including diff/check commands.
- **Related tasks**: Phase 2 T3
## 2026-09-08: Phase 2 end-navigation preference reset
- **Error**: Final lifecycle review found `clearRoute` reset local Heading
  Follow OFF after End even when `preferences.navigation.headingFollow` was
  still ON, leaving setup inconsistent with the persisted choice.
- **Cause**: The pre-Phase-2 clear handler treated the transient camera state
  as the preference and unconditionally set `activeHeadingFollow(false)`.
- **Fix**: Add a regression and restore the stored Heading Follow value and
  top orientation when clearing an active route; rerun the affected page,
  camera, browser, and build gates.
- **Prevention**: Verify preference carry-through across setup, Start, POV,
  End, and the next setup render rather than checking only active navigation.
- **Related tasks**: Phase 2 T2, Phase 2 T3

## 2026-09-08: Phase 3 RED Vitest sandbox startup boundary
- **Error**: The first focused Phase 3 RED run stopped while loading the
  Vitest config with Vite `spawn EPERM`; no Phase 3 assertion executed.
- **Cause**: The managed Windows sandbox blocks the Vite child process used by
  dependency externalization, matching the Phase 1 and Phase 2 runner limit.
- **Fix**: Preserve the exact focused command and rerun it through the approved
  elevated Vitest path; do not count the startup failure as product evidence.
- **Prevention**: Run nested-app Vitest from `navi-next` and separate runner
  startup failures from RED/GREEN assertion results.
- **Related tasks**: Phase 3 T1

## 2026-09-08: Phase 3 RED camera-authority contracts
- **Error**: The elevated Phase 3 RED run executed 4 files / 37 tests with 5
  intended failures: route preview issued a generic `easeTo` after its fit,
  pitch repair requested 85° against a 60° map limit, NavigationMap did not
  expose `maxPitch`, RouteLine had no fit opt-out, and ExploreMap did not pass
  the canonical opt-out/limit props.
- **Cause**: The existing camera stack still has the audit-identified competing
  preview writer and assumes mock maps accept the policy pitch without checking
  MapLibre's configured limit.
- **Fix**: No product fix at the RED checkpoint; failures define the bounded
  Phase 3 T2 implementation target.
- **Prevention**: Keep RouteLine geometry separate from camera ownership, assert
  real constructor options, and test pitch repair against the map-reported cap.
- **Related tasks**: Phase 3 T1

## 2026-09-08: Phase 3 production build sandbox worker boundary
- **Error**: The Phase 3 sandboxed `npm run build` compiled successfully, then
  failed while collecting page data with Next's worker `spawn EPERM`.
- **Cause**: The managed Windows sandbox blocks the child processes used by
  the production build after compilation, matching the earlier phase limits.
- **Fix**: Rerun the unchanged build through the approved elevated path and
  count only that complete result; no source change was made for the startup
  failure.
- **Prevention**: Separate compile success from worker-process permission
  failures and preserve the same build command when escalating.
- **Related tasks**: Phase 3 T3

## 2026-09-08: Phase 3 browser gate Chromium startup boundary
- **Error**: The first Phase 3 browser gate stopped at Playwright Chromium
  launch with `browserType.launch: spawn EPERM`; no page assertion ran.
- **Cause**: The managed Windows sandbox blocks the Chromium child process,
  matching the Phase 1 and Phase 2 browser-runner boundary.
- **Fix**: Rerun the unchanged Phase 3 gate through the approved elevated
  execution context and count only its page-level output.
- **Prevention**: Keep browser startup failures separate from application
  evidence and preserve the same fixture/script on escalation.
- **Related tasks**: Phase 3 T3

## 2026-09-08: Phase 3 browser gate route fixture timing
- **Error**: The elevated Phase 3 browser gate reached the real page with no
  errors but timed out waiting for Route Preview after the synthetic location
  selection; setup still displayed “Set your current location to preview a
  route.”
- **Cause**: The harness clicked through the location action before the
  asynchronous geolocation callback had rendered the selected starting point.
- **Fix**: Add a bounded wait for the starting-location state after the real
  location action, then rerun the same page gate; no product source changed.
- **Prevention**: Synchronize browser fixtures on rendered acquisition state,
  not only on click completion, before asserting route transitions.
- **Related tasks**: Phase 3 T3

## 2026-09-08: Phase 3 browser gate invocation path
- **Error**: The corrected browser gate was invoked from `navi-next` with a
  repository-root-relative path and Node reported `MODULE_NOT_FOUND`.
- **Cause**: The evidence script lives under the parent repository's
  `docs/audits` directory, while the command ran with `navi-next` as its
  working directory.
- **Fix**: Invoke the script through
  `..\\docs\\audits\\2026-09-08-phase3-camera-authority-evidence\\browser-gate.cjs`
  from `navi-next`.
- **Prevention**: Keep the gate command's working directory and script path
  explicit in the evidence log.
- **Related tasks**: Phase 3 T3

## 2026-09-08: Phase 3 Graphify refresh permission boundary
- **Error**: Required `graphify update .` completed its re-extraction attempt but
  failed with `[WinError 5] Access is denied` and exit code 1.
- **Cause**: The managed Windows Graphify output/cache replacement boundary is
  still inaccessible after the Phase 3 source changes.
- **Fix**: Do not hand-edit or delete generated graph output; retain the source,
  test, build, and browser evidence and classify Graphify as an environment
  limitation.
- **Prevention**: Retry Graphify only when the managed permission boundary is
  available and keep generated graph files outside product implementation.
- **Related tasks**: Phase 3 T3

## 2026-09-08: Phase 4 RED Vitest sandbox startup boundary
- **Error**: The first focused Phase 4 RED run stopped while loading the
  Vitest config with Vite `spawn EPERM`; no marker assertion executed.
- **Cause**: The managed Windows sandbox blocks the Vite child process used by
  dependency externalization, matching the prior phase runner boundary.
- **Fix**: Preserve the exact focused command and rerun it through the approved
  elevated Vitest path; do not count the sandbox startup failure as product
  evidence.
- **Prevention**: Run nested-app Vitest from `navi-next` and separate runner
  startup failures from RED/GREEN assertion results.
- **Related tasks**: Phase 4 T1

## 2026-09-08: Phase 4 RED shared marker contracts
- **Error**: The elevated Phase 4 RED run executed 4 files / 24 tests with
  14 passing and 10 intended failures. The shared passive marker helpers were
  absent, Navigate still constructed its DOM marker/beam, and the positionless
  lifecycle contract had no setup path.
- **Cause**: Capture and Navigate still had separate renderer ownership and the
  new tests intentionally described the shared MapLibre dot/arrow contract
  before implementation.
- **Fix**: No product fix at the RED checkpoint; failures define the bounded
  Phase 4 T2 implementation target.
- **Prevention**: Keep route progress/session state outside the renderer and
  make both components consume the same helper/layer definitions.
- **Related tasks**: Phase 4 T1

## 2026-09-08: Phase 4 marker lint warning
- **Error**: Scoped ESLint reported one unused `EMPTY_ARROW` constant after
  Capture direction data delegated to the shared helper.
- **Cause**: The old local empty-direction fallback was no longer needed once
  the shared builder handled invalid coordinates and unavailable headings.
- **Fix**: Remove the dead constant; no behavior or source/layer contract
  changes.
- **Prevention**: Rerun scoped lint after moving any renderer data builder and
  remove obsolete local fallback code immediately.
- **Related tasks**: Phase 4 T2

## 2026-09-08: Phase 4 browser gate Chromium startup boundary
- **Error**: The first Phase 4 browser gate stopped at Playwright Chromium
  launch with `browserType.launch: spawn EPERM`; no page assertion ran.
- **Cause**: The managed Windows sandbox blocks the Chromium child process,
  matching the prior phase browser-runner boundary.
- **Fix**: Rerun the unchanged Phase 4 gate through the approved elevated
  execution context and count only its page-level output.
- **Prevention**: Keep browser startup failures separate from application
  evidence and preserve the same fixture/script on escalation.
- **Related tasks**: Phase 4 T3

## 2026-09-08: Phase 4 production build sandbox worker boundary
- **Error**: The Phase 4 sandboxed `npm run build` compiled successfully, then
  failed while collecting page data with Next's worker `spawn EPERM`.
- **Cause**: The managed Windows sandbox blocks the child processes used by
  the production build after compilation, matching the prior phase limits.
- **Fix**: Rerun the unchanged build through the approved elevated path and
  count only that complete result; no source change was made for the startup
  failure.
- **Prevention**: Separate compile success from worker-process permission
  failures and preserve the same build command when escalating.
- **Related tasks**: Phase 4 T3

## 2026-09-08: Phase 4 Graphify refresh permission boundary
- **Error**: Required `graphify update .` completed its re-extraction attempt but
  failed with `[WinError 5] Access is denied` and exit code 1.
- **Cause**: The managed Windows Graphify output/cache replacement boundary is
  still inaccessible after the Phase 4 marker changes.
- **Fix**: Do not hand-edit or delete generated graph output; retain the source,
  test, build, and browser evidence and classify Graphify as an environment
  limitation.
- **Prevention**: Retry Graphify only when the managed permission boundary is
  available and keep generated graph files outside product implementation.
- **Related tasks**: Phase 4 T3

## 2026-09-08: Phase 4.1 RED Vitest sandbox startup boundary
- **Error**: The first focused Phase 4.1 heading run stopped while loading the
  Vitest config with Vite `spawn EPERM`; no Phase 4.1 assertion executed.
- **Cause**: The managed Windows sandbox blocks the Vite child process used by
  dependency externalization, matching the prior phase runner boundary.
- **Fix**: Preserve the exact focused command and rerun it through the approved
  elevated Vitest path; do not count the startup failure as product evidence.
- **Prevention**: Run nested-app Vitest from `navi-next` and separate runner
  startup failures from RED/GREEN assertion results.
- **Related tasks**: Phase 4.1 T1

## 2026-09-08: Phase 4.1 RED passive heading contracts
- **Error**: The elevated Phase 4.1 RED run executed 3 files / 13 tests with
  3 intended failures. Permission-capable orientation samples did not reach
  `useNavigationHeading`, the real setup `NavigationSession`, or listener
  lifecycle counts because the existing effect waited for explicit permission.
- **Cause**: `useCaptureDirection` only registers orientation listeners after
  `permission === 'granted'`; Navigate's existing explicit permission callback
  is reached from a user gesture, so passive setup observation cannot start on
  a platform that exposes the permission API but delivers orientation events.
- **Fix**: No product fix at the RED checkpoint; failures define the bounded
  Phase 4.1 T2 implementation target.
- **Prevention**: Keep passive observation opt-in for Navigate, never call
  `requestPermission()` from an effect or event callback, and preserve the
  Capture default and one GPS watcher.
- **Related tasks**: Phase 4.1 T1

## 2026-09-08: Phase 4.1 browser gate Chromium startup boundary
- **Error**: The first Phase 4.1 browser gate stopped at Playwright Chromium
  launch with `browserType.launch: spawn EPERM`; no page assertion ran.
- **Cause**: The managed Windows sandbox blocks the Chromium child process,
  matching the prior phase browser-runner boundary.
- **Fix**: Preserve the unchanged Phase 4.1 gate and rerun it through the
  approved elevated execution context; count only page-level output as evidence.
- **Prevention**: Keep browser startup failures separate from application
  evidence and preserve the same fixture/script on escalation.
- **Related tasks**: Phase 4.1 T3

## 2026-09-08: Phase 4.1 browser harness opaque cleanup document
- **Error**: The first elevated Phase 4.1 gate passed the Navigate assertions but
  failed its final check after navigating to `about:blank`; the init script's
  localStorage access raised an opaque-document page error and reset the
  listener counters before cleanup could be read.
- **Cause**: The harness used an opaque cleanup origin while its page fixture
  initializes same-origin storage and kept counters only in document memory.
- **Fix**: Use a same-origin cleanup URL and persist the pre-navigation listener
  counters through `sessionStorage`; no product source changed.
- **Prevention**: Keep browser teardown evidence on a same-origin document and
  separate harness lifecycle errors from application page errors.
- **Related tasks**: Phase 4.1 T3

## 2026-09-08: Phase 4.1 browser harness teardown storage boundary
- **Error**: The corrected gate again passed the product flow, but its
  `sessionStorage` teardown bridge was denied on the cleanup document, leaving
  the old counters visible; a Next.js font abort was also reported as an app
  page error.
- **Cause**: The local browser context does not expose storage consistently on
  the cleanup/404 document, and the harness request-failure filter was broader
  than the application-error boundary.
- **Fix**: Remove the storage-based browser teardown counter assertion, retain
  the same-origin navigation attempt as qualitative evidence, rely on the
  passing real hook cleanup/remount tests for disposal, and ignore only the
  known `__nextjs_font` abort.
- **Prevention**: Keep browser evidence scoped to page-visible behavior and
  collect lifecycle counts in the deterministic Vitest integration test.
- **Related tasks**: Phase 4.1 T3

## 2026-09-08: Phase 4.1 production build sandbox worker boundary
- **Error**: The Phase 4.1 sandboxed `npm run build` compiled successfully,
  then failed while collecting page data with Next's worker `spawn EPERM`.
- **Cause**: The managed Windows sandbox blocks the child processes used by the
  production build, matching the prior phase build boundary.
- **Fix**: Rerun the unchanged build through the approved elevated path and
  count only the complete 41-page result; no source change was made for the
  startup failure.
- **Prevention**: Separate compile success from worker-process permission
  failures and preserve the same build command when escalating.
- **Related tasks**: Phase 4.1 T3

## 2026-09-08: Phase 4.1 Graphify refresh permission boundary
- **Error**: Required `graphify update .` completed its re-extraction attempt but
  failed with `[WinError 5] Access is denied` and exit code 1.
- **Cause**: The managed Windows Graphify output/cache replacement boundary
  remains inaccessible after the Phase 4.1 source changes.
- **Fix**: Do not hand-edit or delete generated graph output; retain the source,
  test, build, and browser evidence and classify Graphify as an environment
  limitation.
- **Prevention**: Retry Graphify only when the managed permission boundary is
  available and keep generated graph files outside product implementation.
- **Related tasks**: Phase 4.1 T3

## 2026-09-08: Phase 4.1 protected Navigate page baseline
- **Error**: The protected camera/Navigate run executed 10 files / 95 tests
  with 94 passing and one failure in the development simulator assertion at
  `src/app/(public)/map/navigate/page.test.tsx:303`.
- **Cause**: The existing disconnected `navigation-dev-panel` simulator mock
  is absent under the test's explicit development flag.
- **Fix**: No Phase 4.1 source change; classify this pre-existing page baseline
  separately from the automatic heading contract.
- **Prevention**: Keep the simulator assertion isolated from heading and marker
  regressions and do not repair unrelated dev tooling in this phase.
- **Related tasks**: Phase 4.1 T3

## 2026-09-08: Phase 5 test-path lookup typo
- **Error**: A combined inspection command looked for `NavigationCameraControls.test.tsx` beside the component instead of under its `__tests__` directory.
- **Cause**: The repository keeps the camera-control test in a nested test directory.
- **Fix**: Continue with the actual `src/components/map/__tests__/` path; no product source changed.
- **Prevention**: Resolve test paths from `rg --files` before composing targeted reads.
- **Related tasks**: Phase 5 T1

## 2026-09-08: Phase 5 browser gate Chromium startup boundary
- **Error**: The first Phase 5 integrated browser gate stopped at Playwright Chromium launch with `browserType.launch: spawn EPERM`; no page assertion ran.
- **Cause**: The managed Windows sandbox blocks the Chromium child process, matching the prior phase browser-runner boundary.
- **Fix**: Preserve the unchanged Phase 5 gate and rerun it through the approved elevated execution context; count only page-level output as evidence.
- **Prevention**: Keep browser startup failures separate from application evidence and preserve the same fixture/script when escalating.
- **Related tasks**: Phase 5 T1

## 2026-09-08: Phase 5 browser harness current-location handoff timeout
- **Error**: The first elevated integrated gate timed out waiting for the origin button after `Use my current location`; route assertions did not run.
- **Cause**: The validation harness did not expose enough state at the one-shot geolocation handoff to distinguish callback timing from the page selection path.
- **Fix**: Add bounded handoff diagnostics for visible page text, watcher counts, and emitted samples before retrying; no product source changed.
- **Prevention**: Keep a bounded, observable one-shot location step before route assertions and reuse the proven published-origin fixture.
- **Related tasks**: Phase 5 T1

## 2026-09-08: Phase 5 browser harness page-context helper boundary
- **Error**: The integrated gate's one-shot geolocation callback raised `samplePosition is not defined` inside the browser init script, so the origin button never updated.
- **Cause**: A Node-side helper was referenced from the browser page context instead of being defined inside the init script.
- **Fix**: Define the position-construction helper in the page context and use it for watch and one-shot callbacks; no product source changed.
- **Prevention**: Keep browser-fixture helpers self-contained inside `addInitScript` and assert page errors before interpreting route behavior.
- **Related tasks**: Phase 5 T1

## 2026-09-08: Phase 5 browser harness gesture hit target
- **Error**: The integrated gate's R8 pan/rotate actions did not report camera suspension.
- **Cause**: The gesture began at the canvas center beneath the active guidance overlay, so the overlay consumed the pointer sequence.
- **Fix**: Move both gestures to an unobscured lower map coordinate; no product source changed.
- **Prevention**: Choose pointer targets from the visible map area after accounting for route and toast overlays.
- **Related tasks**: Phase 5 T1

## 2026-09-08: Phase 5 protected Navigate page baseline
- **Error**: The Phase 5 focused protection run passed 9 files / 93 assertions and failed one existing development simulator-panel assertion at `src/app/(public)/map/navigate/page.test.tsx:303`.
- **Cause**: Navigate still does not mount the disconnected `navigation-dev-panel` expected by that isolated test under its explicit development flag.
- **Fix**: No product source change; the real MapLibre Phase 5 gate uses browser geolocation/orientation callbacks and covers the live acquisition path directly.
- **Prevention**: Keep the simulator baseline separate from integrated location/heading/marker/camera evidence and do not repair unrelated dev tooling during Phase 5.
- **Related tasks**: Phase 5 T3

## 2026-09-08: Phase 5 repository typecheck baseline
- **Error**: `tsc --noEmit` stopped at `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)` with `TS1005: '}' expected`.
- **Cause**: The repository carries the same unrelated pre-existing parse error recorded by Phases 1–4.1.
- **Fix**: No Phase 5 source change; classify the typecheck as baseline-limited while focused TypeScript-backed Vitest and ESLint remain green.
- **Prevention**: Keep the exact parse location in the gate report and do not edit unrelated runtime tests.
- **Related tasks**: Phase 5 T3

## 2026-09-08: Phase 5 Graphify refresh permission boundary
- **Error**: Required `graphify update .` retried after the Phase 5 validation harness and failed with `[WinError 5] Access is denied`.
- **Cause**: The managed Windows Graphify output/cache replacement boundary remains inaccessible.
- **Fix**: Do not hand-edit or delete generated graph output; retain the fresh browser/test/build evidence and classify Graphify as an environment limitation.
- **Prevention**: Retry only when the managed permission boundary is available and keep generated graph files outside product implementation.
- **Related tasks**: Phase 5 T3

## 2026-09-08: Phase 5 post-build dev-server state boundary
- **Error**: The expanded final browser gate reached `http://localhost:3000` but timed out waiting for `navigation-camera-controls` before page evidence; the existing dev-server session was left in a post-build state.
- **Cause**: Running the production build in the same checkout left the long-lived dev process serving an incomplete client state for the next browser context.
- **Fix**: Start the unchanged dev command on a fresh port and rerun the same browser gate against that endpoint; no product source changed.
- **Prevention**: Use a fresh dev-server process/port after a production build before browser validation.
- **Related tasks**: Phase 5 T3

## 2026-09-08: Phase 5 fresh dev-server lock boundary
- **Error**: Starting the clean port-3001 dev server reported an existing Next dev process (PID 11436) still owning the checkout lock.
- **Cause**: The prior long-lived port-3000 session remained alive even though its wrapper PID was different.
- **Fix**: Stop only that known Next dev process and start a fresh validation server; no product source changed.
- **Prevention**: Resolve the actual Next PID from the startup message before launching a fresh post-build browser server.
- **Related tasks**: Phase 5 T3

## 2026-09-08: Phase 5 restarted endpoint selection
- **Error**: The temporary port-3001 endpoint refused connections after the user restarted the local server.
- **Cause**: The restarted server was serving the same checkout on port 3000.
- **Fix**: Probe both local endpoints, rerun the unchanged integrated browser gate against port 3000, and refresh the JSON/report timestamp; no product source changed.
- **Prevention**: Probe the active local endpoint immediately before the final browser gate and record the selected base URL in the evidence JSON.
- **Related tasks**: Phase 5 T3

## 2026-09-10: Routing topology audit Graphify vocabulary probe syntax
- **Error**: The first read-only Python vocabulary probe stopped with `SyntaxError: '(' was never closed`; no source or campus data was read or changed by that failed process.
- **Cause**: The single-line nested `print`/`join` expression omitted its final closing parenthesis.
- **Fix**: Corrected only the probe expression and reran it successfully before the required Graphify query.
- **Prevention**: Keep generated one-line probes structurally simple or syntax-check them before combining nested generator expressions.
- **Related tasks**: NAVI routing topology audit T1
## 2026-09-10: Audit evidence search used invalid Windows path patterns
- **Error**: A read-only `rg` evidence query reported two nonexistent guessed source paths and rejected a `*delete*` argument as an invalid Windows filename pattern.
- **Cause**: The query combined several anticipated filenames before resolving the repository's exact file inventory, and passed a shell-style glob directly to ripgrep on Windows.
- **Fix**: Resolve exact paths with `rg --files` after the mandatory Graphify-first query, then inspect only confirmed files or use ripgrep's `-g` option.
- **Prevention**: Do not pass shell globs as Windows path arguments and do not assume renderer/positioning filenames; query the graph and exact file inventory first.
- **Related tasks**: T3
## 2026-09-10: Focused routing audit tests blocked by sandbox process spawn
- **Error**: The targeted Vitest command failed while loading `vitest.config.ts` with `[plugin externalize-deps] Error: spawn EPERM`; no tests executed.
- **Cause**: The sandbox denied a child-process spawn used by Vite/Rolldown during configuration loading.
- **Fix**: Re-run the identical focused test command with the approved elevated test execution path, and report the first attempt as an environment failure rather than a product failure.
- **Prevention**: When Vitest reports `spawn EPERM` before collecting tests, separate it from test failures and retry the same command with authorized escalation.
- **Related tasks**: T4

## 2026-09-10: Audit log patch wrapper syntax error
- **Error**: One local orchestration wrapper for an audit-log patch failed to parse as JavaScript; a preceding incomplete wrapper evaluated without calling the patch tool.
- **Cause**: The patch text was accidentally placed in an unterminated JavaScript string while switching to the freeform patch helper.
- **Fix**: Reissued the log edit with a valid escaped string and verified the file contents; no product source was touched.
- **Prevention**: Keep patch payloads in a single valid string and always inspect the target log after scripted patch calls.
- **Related tasks**: T4

## 2026-09-10: Existing road-junction test fixtures fail compilation
- **Error**: The focused routing suite completed with 13 test files passing and `packages/compiler/src/__tests__/road-junction.test.ts` failing two tests because `compileDocument(...).success` was `false`; total: 201 passed, 2 failed.
- **Cause**: The legacy fixture assumes an entrance's proximity to a road keeps the whole compile connected, but the current compiler requires an explicit outdoor road assignment; the fixture entrance has no `connectorRoadId` or canonical `EntranceAccess`, so compilation fails validation before the topology assertions. The third test passes because it expects a disconnected compile.
- **Fix**: Preserve the stale fixture failure as baseline evidence and use the passing focused suites plus direct current-source traces for topology conclusions; do not change product code or fixtures during this audit-only task.
- **Prevention**: Report collection/startup failures separately from assertion failures and never infer topology behavior from an assertion that execution did not reach.
- **Related tasks**: T4

## 2026-09-10: Stale compiler normalizer path in audit notes
- **Error**: A read-only source-range command could not find `packages/compiler/src/primitives/connectivity/normalizer.ts`.
- **Cause**: An older audit/note path was reused; the live file is `packages/compiler/src/connectivity/normalizer.ts`.
- **Fix**: Resolved the exact current path with `rg --files` and used only that file for final evidence.
- **Prevention**: Treat prior audit paths as leads, not authoritative current paths; confirm every cited path against the live repository.
- **Related tasks**: T2, T4

## 2026-09-12: Unified POI Phase 3C C6 browser fixture boundary
- **Error**: The safe local Studio browser route reached the shell but opened a
  floor-plan setup modal, so no disposable fixture was available for a
  non-mutating Circle/Rectangle/Polygon authoring probe.
- **Cause**: The available floor reported that it had no floor plan; continuing
  would change setup state and would not be a clean geometry-authoring fixture.
- **Fix**: Stopped the browser probe without clicking through or changing
  campus data and recorded `BROWSER VALIDATION PENDING` in the gate report.
- **Prevention**: Provision a disposable floor fixture with an existing floor
  plan before the next manual authoring gate.
- **Related tasks**: Phase 3C C6, C7

## 2026-09-10: Superpowers reference path resolution
- **Error**: Two read-only skill-reference lookups used package-root paths for
  `writing-good-tests.md` and `references/codex-tools.md` that did not exist.
- **Cause**: The referenced files are scoped under their individual skill
  directories rather than directly under the shared `skills` directory.
- **Fix**: Resolved the applicable Codex reference with an exact recursive
  package lookup; the test-writing reference was not needed for this audit-only
  request because no tests will be authored.
- **Prevention**: Resolve relative references from the directory containing the
  selected `SKILL.md`, as required by the skill-loading rules.
- **Related tasks**: NAVI V1 route network audit T1

## 2026-09-10: Route audit repeated a Windows ripgrep glob mistake
- **Error**: A read-only test-evidence query passed
  `packages/editor/src/commands/*test.ts` as a Windows path argument, producing
  OS error 123 while other explicit directories were still searched.
- **Cause**: A shell-style wildcard was used as a positional path instead of a
  ripgrep `-g` filter, repeating the path-class pitfall already recorded by the
  earlier routing audit.
- **Fix**: Discard the partial command as authoritative evidence and rerun any
  needed test lookup against resolved files or with `-g '*test.ts'`.
- **Prevention**: On Windows, use `rg --files` to resolve test paths or `rg -g`
  for filename patterns; never pass `*` in a positional path.
- **Related tasks**: NAVI V1 route network audit T2, T3
## 2026-09-10: Route audit used a stale serializer path and positional wildcard
- **Error**: A read-only `rg` lookup targeted `packages/editor/src/serialization/serializer.ts` and `packages/editor/src/serialization/*.ts`; the path does not exist and the positional wildcard is not expanded reliably on Windows.
- **Cause**: The persistence lookup reused an assumed directory instead of first resolving the current serializer location.
- **Fix**: Resolve persistence files with `rg --files | rg "serial|persist"`, then query only exact paths.
- **Prevention**: Use Graphify for the concept first, then `rg --files` to resolve exact current paths before content searches; never pass a positional `*` glob to Windows ripgrep.
- **Related tasks**: T2
## 2026-09-10: Route audit repeated recursive-path glob misuse
- **Error**: A read-only test search passed `packages/editor/src/**/__tests__` and `src/**/__tests__` as positional paths to Windows ripgrep, producing OS error 123.
- **Cause**: Recursive glob syntax was placed in path arguments instead of using stable directory roots with `--glob` filters.
- **Fix**: Search the exact directory roots (`packages/editor/src` and `src`) and constrain filenames with `--glob "*.test.ts" --glob "*.test.tsx"`.
- **Prevention**: On Windows, never place `*` or `**` in positional ripgrep paths; use literal roots plus `--glob` exclusively.
- **Related tasks**: T3
## 2026-09-10: Phase 1 Graphify interpreter marker was absent
- **Error**: The first required query-vocabulary command could not read
  `graphify-out/.graphify_python`, so the vocabulary file was not generated.
- **Cause**: The existing graph remained present but its interpreter marker had
  been removed by earlier Graphify cleanup.
- **Fix**: Resolved the installed Graphify Python interpreter, restored only the
  marker, generated vocabulary from the existing graph, and ran the mandatory
  Graphify query before repository source inspection.
- **Prevention**: Use Graphify's interpreter guard before every query subcommand
  and treat graph existence separately from marker existence.
- **Related tasks**: Phase 1 T1

## 2026-09-10: Phase 1 indoor test used an unavailable Set matcher
- **Error**: The first indoor green run reached the new assertions but failed
  because this Vitest/Chai setup does not expose `toHaveSize` for `Set`.
- **Cause**: The test used a matcher available in some assertion libraries but
  not in this repository's configured matcher surface.
- **Fix**: Assert the native `Set.size` number with `toBe(4)` and rerun the
  unchanged behavior test.
- **Prevention**: Prefer primitive property assertions for collection sizes
  unless the repository already demonstrates a custom matcher.
- **Related tasks**: Phase 1 T3

## 2026-09-10: Phase 1 compiler regression workers exited unexpectedly
- **Error**: The five-file compiler green run completed 71 assertions across
  three files, but two Vitest fork workers exited before their files reported,
  leaving two unhandled pool errors and a nonzero exit.
- **Cause**: The parallel Windows Vitest fork pool became unstable during the
  larger canonical compiler regression set; no assertion failure was emitted.
- **Fix**: Rerun the affected files serially with `--no-file-parallelism` and
  use only completed per-file results as verification evidence.
- **Prevention**: Keep heavy compiler regressions serial on this host and
  distinguish worker-process failures from product assertion failures.
- **Related tasks**: Phase 1 T4

## 2026-09-10: Phase 1 plan completion line contained stray text
- **Error**: The first T4 checklist update appended stray `LJlk` text to the
  verification-count line; two later orchestration snippets made no edits, and
  the first corrective patch used a mismatched expected line.
- **Cause**: Accidental text and an over-escaped match were included while
  composing patch wrappers.
- **Fix**: Inspect the literal line and remove the stray text with `apply_patch`;
  product source and test evidence were unaffected.
- **Prevention**: Inspect every workflow-file patch immediately and keep patch
  wrappers minimal and literal.
- **Related tasks**: Phase 1 T4

## 2026-09-10: Phase 1 error-ledger patch wrapper used a mistyped variable
- **Error**: The first local wrapper intended to record the compiler worker
  failure stopped with `ReferenceError` before invoking the patch tool.
- **Cause**: The wrapper assigned and referenced inconsistent non-ASCII
  temporary variable names while sanitizing the patch string.
- **Fix**: Reissued the same ledger edit with one plain ASCII `patch` variable;
  no repository file was changed by the failed wrapper.
- **Prevention**: Pass patch text directly through one consistently named ASCII
  variable without intermediate string rewriting.
- **Related tasks**: Phase 1 T4

## 2026-09-10: Phase 1 boundary lookup used a stale runtime A* filename
- **Error**: A read-only source lookup requested
  `packages/runtime/src/routing/a-star.ts`, which does not exist.
- **Cause**: The editor engine uses `a-star.ts`, while the runtime package uses
  the distinct filename `astar.ts`.
- **Fix**: Resolve the literal runtime routing inventory with `rg --files` and
  inspect `routing/astar.ts`.
- **Prevention**: Do not transfer filenames between packages; resolve each
  package's exact inventory before reading.
- **Related tasks**: Phase 1 T5

## 2026-09-10: Phase 1 boundary fixture initially failed compiler validation
- **Error**: The first end-to-end boundary fixture produced
  `HALLWAY_DISCONNECTED` compiler errors, and the first positive-control lookup
  later selected a colocated editor entrance instead of a road endpoint.
- **Cause**: The road-only fixture had no entrance roots required by Compiler
  V2 connectivity validation; coordinate-only editor lookup was ambiguous once
  valid entrances were added.
- **Fix**: Add two explicit road-linked entrance roots to the test fixture and
  select editor endpoints by `metadata.traceId`; retain coordinate lookup only
  for the emitted runtime graph, where the linked entrance is a valid route
  endpoint.
- **Prevention**: End-to-end compiler fixtures must satisfy validation contracts,
  and source-stage assertions must select nodes by identity when coordinates
  can be shared.
- **Related tasks**: Phase 1 T5

## 2026-09-10: Phase 1 static checks are baseline-limited
- **Error**: Root TypeScript stopped on existing generated `.next` parse errors
  and `packages/runtime/src/__tests__/floor-geometry-consumption.test.ts:255`;
  package-level checks exposed a large pre-existing error set. The first scoped
  lint pass also reported inherited violations plus three new `as any` uses in
  the new boundary fixture.
- **Cause**: The dirty checkout is not globally type-clean, and the boundary
  fixture initially followed legacy world-position casting patterns.
- **Fix**: Replace the three new casts with typed `unknown` conversions/remove
  an unnecessary compiler-config cast. The new boundary file then linted with
  zero findings, and all five changed product files linted with zero errors
  (four inherited warnings).
- **Prevention**: Use focused TypeScript-backed tests and exact-file lint as the
  Phase 1 static gate while reporting global baseline debt separately.
- **Related tasks**: Phase 1 T5

## 2026-09-10: Phase 1 process probe used a malformed CIM filter
- **Error**: One read-only process-status probe passed the invalid filter
  `ProcessId= nuance` and returned access denied.
- **Cause**: Placeholder text was left in the filter expression.
- **Fix**: Use `Get-Process` with the two exact known PIDs; no process was
  changed or terminated.
- **Prevention**: Prefer literal PID queries for read-only process checks.
- **Related tasks**: Phase 1 T5

## 2026-09-10: Phase 1 full gate found a stale auto-snap expectation
- **Error**: The first 17-file Phase 1 gate passed 274 tests and failed one
  `road-snap.test.ts` assertion that expected `road.create` to move a nearby
  endpoint and return `snapCount: 1`.
- **Cause**: The test encoded the superseded implicit-connectivity behavior
  that Phase 1 intentionally removes; the pure preview/helper snapping tests
  remained valid and green.
- **Fix**: Preserve the file's pre-edit hash, rewrite only the command-level
  integration case to assert authored coordinates and no junction, and rerun
  the complete gate.
- **Prevention**: Separate optional geometric snap helpers from mutation-command
  authority in test names and expectations.
- **Related tasks**: Phase 1 T5

## 2026-09-10: Phase 1 stale-fixture runner output wrapper was mistyped
- **Error**: The first separate `road-junction.test.ts` classification run
  completed its command, but the local result-formatting wrapper referenced
  nonexistent `JSONennials` and lost that invocation's displayed output.
- **Cause**: A typo in the JavaScript wrapper after the awaited test command.
- **Fix**: Rerun the identical single-file command with `JSON.stringify`; it
  reproduced exactly the two already-recorded stale fixture failures.
- **Prevention**: Keep result wrappers to the standard verified
  `text(JSON.stringify(result))` form.
- **Related tasks**: Phase 1 T5

## 2026-09-10: Phase 1 final verification commands contained path typos
- **Error**: One final focused test invocation misspelled the
  `legacy-compatibility.test.ts` directory and therefore collected 16 files
  instead of 17; two later read-only commands supplied malformed working
  directories before process creation.
- **Cause**: Stray generated characters entered otherwise literal Windows path
  strings while composing the orchestration wrappers.
- **Fix**: Discarded those invocations as gate evidence and reran the exact
  focused suite (17 files / 276 tests), Graphify update, and scoped lint from
  the correct literal repository paths.
- **Prevention**: Reuse a single verified absolute workspace root and compare
  the collected Vitest file count with the expected gate count.
- **Related tasks**: Phase 1 T5

## 2026-09-10: Phase 1 Graphify refresh required the approved execution path
- **Error**: The required sandboxed `graphify update .` attempt failed with
  Windows `[WinError 5] Access is denied` after product changes.
- **Cause**: Graphify's parallel extraction needs child-process access not
  available in the managed sandbox.
- **Fix**: Reran the identical update through the approved execution path; it
  completed with 22,319 nodes, 32,625 edges, and 1,819 communities.
- **Prevention**: Keep the first sandbox attempt for evidence, retry the exact
  update with approval, and distinguish the repository knowledge index from
  NAVI application graph snapshots.
- **Related tasks**: Phase 1 T5

## 2026-09-10: Full repository suite contains unrelated dirty-baseline failures
- **Error**: The serial all-repository Vitest run completed with 4,860 passed,
  28 failed, and 8 pending tests. Failures include missing `golden-campus`
  imports, stale pipeline/UI fixtures, old proximity-inference expectations,
  and the two known road-junction fixtures.
- **Cause**: The intentionally preserved dirty checkout is not globally green,
  and several tests outside the Phase 1 gate encode superseded or unrelated
  in-progress behavior.
- **Fix**: Retained the full result as broader diagnostic evidence, then reran
  the exact audit comparison suites: 519/521 across 19 files with only the two
  known stale road-junction failures, and 284/284 across 9 scenario files.
- **Prevention**: Compare against exact pre-change test selections and counts;
  never classify the whole dirty-repository result as a Phase 1 regression
  without a matching baseline.
- **Related tasks**: Phase 1 T5

## 2026-09-10: Phase 2 initial source inspection used the outer workspace root
- **Error**: The first Phase 2 read attempted package paths from the outer
  workspace directory, where those paths do not exist.
- **Cause**: The implementation checkout is nested under the workspace, while
  the workflow ledgers and Graphify index live at the outer root.
- **Fix**: Resolve the exact nested checkout once and use explicit working
  directories for product-code commands versus workflow-ledger updates.
- **Prevention**: Verify `Get-Location` and the expected package sentinel before
  batching source reads or test commands.
- **Related tasks**: Phase 2 T1

## 2026-09-10: Phase 2 source lookup used a PowerShell-incompatible rg glob
- **Error**: A read-only `rg` command passed `packages/editor/src/commands/*.ts`
  literally on Windows and returned an invalid filename error; the subsequent
  literal `Get-Content` excerpts still completed.
- **Cause**: The file glob was supplied as a positional Windows path rather
  than an rg `-g` filter.
- **Fix**: Use directory roots with `-g "*.ts"`, or exact literal paths, for
  later relationship-handler searches.
- **Prevention**: Keep wildcard filtering in rg's `-g` option on Windows.
- **Related tasks**: Phase 2 T2

## 2026-09-10: Phase 2 floor cleanup assumed connector arrays were present
- **Error**: The first T3 green run passed the new integrity assertions but two
  existing floor-delete tests threw while reading `floor.connectorStops.map`.
- **Cause**: Legacy/additive fixtures may omit connector arrays at runtime even
  though the current `Floor` interface declares them required.
- **Fix**: Treat floor connector stops, entrances, and building vertical
  connectors as empty when absent, preserving legacy document compatibility.
- **Prevention**: Relationship cleanup at serialization-era boundaries must use
  additive-field guards rather than relying solely on current static types.
- **Related tasks**: Phase 2 T3

## 2026-09-10: Phase 2 compiler batch included a stale merge-threshold fixture
- **Error**: The T4 compiler batch passed 95/96 assertions; the remaining
  `threshold-centralization.test.ts` case expected two nearby distinct-source
  waypoints to merge into one.
- **Cause**: Phase 1 intentionally made proximity insufficient for identity
  merge, but this older threshold test still encodes the superseded behavior.
  Phase 2 did not modify the normalizer before this run.
- **Fix**: Classify it as a stale Phase 1 fixture, retain it unchanged, and use
  the exact canonical/fallback plus supported compiler controls as T4 evidence.
- **Prevention**: Threshold ownership tests must use the same authorized source
  identity when asserting positive merge behavior.
- **Related tasks**: Phase 2 T4

## 2026-09-10: Phase 2 broad scoped lint includes inherited dirty-file debt
- **Error**: Linting every touched path reported 18 errors and 8 warnings.
- **Cause**: All errors are pre-existing `no-explicit-any` findings in the
  already-untracked canonical compiler test and feature handler; the warnings
  are likewise on inherited lines. No diagnostic points to a Phase 2-added
  line.
- **Fix**: Preserve those unrelated dirty-file findings, lint the three wholly
  new Phase 2 files as the clean attribution gate, and rely on focused tests
  plus diff inspection for surgical edits in inherited files.
- **Prevention**: In a heavily dirty checkout, distinguish whole-file baseline
  lint debt from findings introduced on changed lines.
- **Related tasks**: Phase 2 T6

## 2026-09-10: Phase 2 fixture-fix patch used a mismatched ledger heading
- **Error**: The first combined patch for the W15F fixture and error ledger did
  not apply because it searched for `broader scoped lint` while the recorded
  heading is `broad scoped lint`.
- **Cause**: The patch context was paraphrased instead of copied literally.
- **Fix**: Re-read the exact tail and apply the fixture and ledger additions
  with literal context.
- **Prevention**: Copy exact existing headings into multi-file patch anchors.
- **Related tasks**: Phase 2 T6

## 2026-09-10: Floor-geometry fixture relied on malformed EntranceAccess fallback
- **Error**: The first nine-file scenario comparison passed 268/269; a W15F
  floor-geometry test expected compile success while supplying an
  `EntranceAccess` whose outdoor node did not exist.
- **Cause**: The fixture's subject is wall/opening/room-attribute publication,
  but it also carried an unrelated malformed canonical access record that
  previously reopened legacy fallback. Phase 2 correctly makes that record
  fail closed.
- **Fix**: Remove only the unrelated invalid EntranceAccess from that geometry
  fixture; keep dedicated valid EntranceAccess coverage and all fail-closed
  compiler validation intact.
- **Prevention**: Positive artifact fixtures should contain valid dependencies
  or omit relationships outside the behavior under test.
- **Related tasks**: Phase 2 T6

## 2026-09-10: W15F diagnosis found the actual dependency was unbounded distance
- **Error**: Removing the unrelated malformed EntranceAccess did not make the
  W15F geometry fixture compile; diagnostics showed `ENTRANCE_UNCONNECTED` and
  `HALLWAY_DISCONNECTED`.
- **Cause**: The default fixture entrance used a world coordinate roughly 600 m
  from its building-local RouteNetwork. The old unbounded legacy nearest search
  bridged that gap; the new required 50 m compatibility limit correctly does
  not.
- **Fix**: Keep EntranceAccess absent for this geometry-only legacy control and
  give its entrance a valid building-local position at the authored route node.
- **Prevention**: Legacy positive controls must place endpoints within the named
  compatibility bound instead of depending on unlimited nearest search.
- **Related tasks**: Phase 2 T6

## 2026-09-10: Final Phase 2 rerun used a malformed working directory
- **Error**: One final matrix command did not start because stray text was
  appended to the literal nested-checkout path. The first attempt to log this
  also used a mistyped patch heading and made no change.
- **Cause**: The verified absolute workdir and exact ledger anchor were not
  reused verbatim.
- **Fix**: Re-read the ledger tail, record both no-op failures here, and rerun
  from `C:\Users\Administrator\Desktop\CODEme\Navi\navi-next`.
- **Prevention**: Reuse the exact copied checkout path and literal patch
  headings during final evidence commands.
- **Related tasks**: Phase 2 T6

## 2026-09-10: Phase 2 global TypeScript gate is baseline-blocked
- **Error**: `tsc --noEmit` stopped on five syntax diagnostics before it could
  provide a repository-wide Phase 2 signal.
- **Cause**: Three diagnostics are in generated `.next/dev/types/routes.d.ts`,
  one is in generated `.next/dev/types/validator.ts`, and one is in the
  unrelated dirty runtime test
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts`.
- **Fix**: Classified the global typecheck as pre-existing/environmental and
  used the passing focused compiler/editor tests, clean lint on wholly new
  files, and scoped diff check as the attributable Phase 2 gates.
- **Prevention**: Clear generated Next type artifacts and repair the unrelated
  runtime fixture before treating global TypeScript as a release gate.
- **Related tasks**: Phase 2 T6

## 2026-09-10: Phase 2 Graphify refresh needed a Windows retry
- **Error**: Graph extraction completed, but one update attempt could not rename
  `.graph.tmp` to `graph.json` because Windows returned `[WinError 5]`.
- **Cause**: A transient file-handle conflict affected Graphify's final atomic
  rename after extraction.
- **Fix**: Retried the required update; the final repository graph was written
  at 16:06 with 22,400 nodes, 32,766 edges, and 1,837 communities.
- **Prevention**: Verify `graph.json` and `GRAPH_REPORT.md` timestamps and counts
  after the update rather than assuming extraction alone completed the write.
- **Related tasks**: Phase 2 T6

## 2026-09-10: Final evidence commands contained harmless wrapper typos
- **Error**: A no-op malformed JavaScript wrapper, a nonsense read-only `rg`
  path, and one invalid workdir string produced no useful evidence.
- **Cause**: Final command wrappers were composed from transient text instead
  of the already verified literal paths.
- **Fix**: Reissued each required check from the exact outer or nested checkout
  path; no failed command wrote product or protected data.
- **Prevention**: Keep final evidence calls small and reuse the copied absolute
  workdirs without inline annotations.
- **Related tasks**: Phase 2 T6

## 2026-09-10: Phase 3 stale-batch sandbox run hit spawn EPERM
- **Error**: The first unchanged two-file Vitest reproduction could not load
  the Vite config because Windows child-process creation returned `spawn EPERM`.
- **Cause**: The managed sandbox blocks the child process Vite uses while
  resolving its configuration; this is the previously characterized local
  tooling limitation rather than a test assertion failure.
- **Fix**: Reran the identical two-file selection through the approved serial
  Vitest path, which reproduced the expected 5 passes and 3 stale failures.
- **Prevention**: Preserve the sandbox attempt as environment evidence and use
  only the approved identical rerun for assertion-level gate results.
- **Related tasks**: Phase 3 T1

## 2026-09-10: Phase 3 workflow patch used a mistyped progress heading
- **Error**: A combined checklist/progress patch searched for a nonexistent
  `gate gate_gate` heading and did not apply.
- **Cause**: The anchor was composed instead of copied from the ledger.
- **Fix**: Re-read the exact progress tail and reapplied the workflow-only
  changes with the literal Phase 2 terminal heading.
- **Prevention**: Copy final ledger headings verbatim before multi-file patches.
- **Related tasks**: Phase 3 T1

## 2026-09-10: Phase 3 inventory referenced the old road-snap test location
- **Error**: A read-only inventory batch included
  `packages/editor/src/commands/road-snap.test.ts`, which does not exist, so
  `rg` returned exit 1 after still printing the other requested evidence.
- **Cause**: The current test lives under `commands/__tests__/`, but the old
  pre-directory path was supplied.
- **Fix**: Excluded that failed lookup from evidence and used the current
  literal path in subsequent gate selections.
- **Prevention**: Resolve test paths with `rg --files` before composing final
  multi-file verification commands.
- **Related tasks**: Phase 3 T2

## 2026-09-10: Phase 3 runtime gate used repository-relative filters
- **Error**: The first three-file runtime gate reported no test files because
  `packages/runtime/vitest.config.ts` was invoked from the repository root with
  repository-relative test filters.
- **Cause**: The package config resolves its `src/**/*.test.ts` include from
  `packages/runtime`, so the supplied `packages/runtime/src/...` filters could
  not match.
- **Fix**: Rerun from `packages/runtime` with the approved package-local binary
  path and `src/...` filters.
- **Prevention**: Pair package-scoped Vitest configs with their package working
  directory and package-relative test paths.
- **Related tasks**: Phase 3 T3

## 2026-09-10: Phase 3 LF-checksum probe had an invalid PowerShell pipeline
- **Error**: The first read-only checksum-normalization probe produced an
  `empty pipe element` parser error after a top-level `foreach` block.
- **Cause**: Rows from the statement block were piped directly instead of
  being collected into a variable before formatting.
- **Fix**: Collect the loop output into a task-specific variable and format it
  in a separate statement.
- **Prevention**: Do not append a pipeline directly to a PowerShell statement
  block in compact diagnostic commands.
- **Related tasks**: Phase 3 T3

## 2026-09-10: Apply-patch preserved runtime fixture CRLF bytes
- **Error**: A content-neutral two-step patch did not normalize the runtime
  JSON fixtures to LF; the patch writer retained the files' CRLF convention.
- **Cause**: `apply_patch` preserves existing line endings for updated files,
  so toggling and restoring a field was not a viable byte-normalization tool.
- **Fix**: Do not alter checksum verification or guess new metadata; inspect
  the repository line-ending policy and use a deterministic formatter plus a
  scoped LF attribute if needed.
- **Prevention**: Verify raw newline counts after any byte-level fixture repair
  before rerunning checksum-sensitive tests.
- **Related tasks**: Phase 3 T3

## 2026-09-10: Windows rejected the optional Prettier wildcard probe
- **Error**: `rg` rejected the literal `.prettier*` path with Windows error 123
  after the line-ending policy check had already established that no
  `.gitattributes` file exists.
- **Cause**: A shell-style wildcard was passed as a Windows path argument.
- **Fix**: Inspect exact config filenames or `package.json` without wildcard
  path arguments.
- **Prevention**: Resolve optional Windows filenames before supplying them to
  `rg`.
- **Related tasks**: Phase 3 T3

## 2026-09-10: Runtime fixture recreation had intercepted edit errors
- **Error**: The first recreated search fixture briefly contained a mistyped
  field and placeholder value. Its correction patch then reported failure on
  an accidental invalid out-of-workspace path after applying the in-workspace
  correction. A later redundant correction correctly failed its stale context.
- **Cause**: A compound hand-transcription patch included content and a target
  that were not copied from the inspected fixture, and patch application was
  not atomic across all targets.
- **Fix**: The invalid fixture was never tested or loaded. Read back the exact
  current state, confirm the search JSON now matches its original data, restore
  the remaining fixtures in separate scoped edits, and validate parsed content
  plus Git diff before testing.
- **Prevention**: Keep recreation patches single-purpose, never add diagnostic
  paths to a content patch, and verify current state after any partial failure.
- **Related tasks**: Phase 3 T3

## 2026-09-10: Runtime green rerun mistyped one test filter
- **Error**: The first post-repair runtime rerun passed 11 tests across only two
  files because `indoor-route-invariant.test.ts` was mistyped in the command;
  Vitest ignored the unmatched filter without failing the run.
- **Cause**: The verified path list was not copied literally into the rerun.
- **Fix**: Do not count the partial green run; rerun all three exact package-
  relative paths and require 3/3 files.
- **Prevention**: Reconcile requested versus reported file counts for every
  multi-file gate, even when the process exits zero.
- **Related tasks**: Phase 3 T3

## 2026-09-10: First scenario comparison used the wrong nine-file matrix
- **Error**: A nine-file navigation/compiler batch passed 201/201, but it did
  not reproduce the recorded Phase 2 scenario count of 269 and therefore
  cannot be labeled the historical scenario comparison.
- **Cause**: An older approved navigation command was mistaken for the Phase 2
  scenario matrix based on overlapping filenames.
- **Fix**: Retain the 201/201 result only as supplemental evidence, resolve the
  historical file set from its road-snap/crossing/RouteNetwork/access/
  transition/publish description, and reconcile the reported count.
- **Prevention**: Treat historical gate identity as file list plus test count,
  not file-count coincidence alone.
- **Related tasks**: Phase 3 T3

## 2026-09-10: Reconstructed Phase 2 filenames did not reproduce 434 tests
- **Error**: A plausible 13-file integrity matrix passed 193/193 but did not
  reproduce the recorded Phase 2 434-test count, so it is not valid evidence
  for the claimed exact historical selection.
- **Cause**: The Phase 2 report retained aggregate counts but not the literal
  command; filenames were inferred from overlapping implementation and prior
  approved-command context.
- **Fix**: Keep 193/193 as supplemental evidence only and recover the actual
  invocation semantics from the controlling brief and package scripts before
  making any comparison claim.
- **Prevention**: Persist literal gate commands alongside aggregate counts in
  future audit artifacts.
- **Related tasks**: Phase 3 T3

## 2026-09-10: Candidate scenario command had a malformed tool wrapper
- **Error**: One candidate nine-file scenario command failed JavaScript parsing
  before `exec_command` was called.
- **Cause**: Stray text was inserted into the workdir field of the wrapper.
- **Fix**: Reissue the unchanged shell command with the exact verified nested
  checkout path.
- **Prevention**: Keep execution wrappers minimal and copy the known literal
  workdir without annotations.
- **Related tasks**: Phase 3 T3

## 2026-09-10: Phase 3 Graphify refresh hit Windows access denial
- **Error**: The required `graphify update .` rebuild stopped with
  `[WinError 5] Access is denied` during its managed-sandbox write path.
- **Cause**: The same Windows file-handle/atomic replacement boundary observed
  in earlier Graphify refreshes prevented completion.
- **Fix**: Retry the identical repository-only graph update through the
  approved unrestricted execution path and verify output timestamps/counts.
- **Prevention**: Never infer success from extraction startup; inspect the
  final Graphify report and graph file after the retry.
- **Related tasks**: Phase 3 T5

## 2026-09-10: Final Graphify polling had harmless wrapper errors
- **Error**: One poll used an invalid parameter name, several placeholder
  JavaScript snippets did not call a filesystem tool, and one explicit
  malformed patch was rejected before application.
- **Cause**: Tool-wrapper text was malformed while the already running
  Graphify session was completing.
- **Fix**: Reused the original session ID with a valid `write_stdin` call;
  Graphify completed successfully. No placeholder snippet changed a file.
- **Prevention**: Keep follow-up wrappers to one verified tool invocation and
  do not draft placeholder patch strings in executable calls.
- **Related tasks**: Phase 3 T5

## 2026-09-10: Phase 1 camera audit Vitest sandbox spawn boundary
- **Error**: The first read-only focused Vitest command failed before test
  collection with `spawn EPERM` while Vite externalized the config.
- **Cause**: The restricted Windows sandbox could not spawn the helper process;
  this was an execution boundary, not a test or product failure.
- **Fix**: Reran the identical focused command through the approved unrestricted
  execution path; 5 files and 58 tests passed.
- **Prevention**: Treat a sandbox startup failure as non-authoritative and
  require an identical approved rerun before classifying the gate.
- **Related tasks**: Day 2 Phase 1 T3

## 2026-09-10: Phase 2 camera RED Vitest sandbox spawn boundary
- **Error**: The first Phase 2 RED command failed before test collection with
  Windows `spawn EPERM` while Vite externalized the Vitest config.
- **Cause**: The managed Windows sandbox denied the Vite helper process; no
  test assertion ran in that invocation.
- **Fix**: Reran the identical focused RED command through the approved
  elevated path; it executed 2 files / 40 tests and recorded 9 intended
  contract failures before implementation.
- **Prevention**: Preserve the exact RED command and separate runner startup
  failures from assertion results before changing source.
- **Related tasks**: Day 2 Phase 2 T1

## 2026-09-10: Phase 2 browser harness module resolution
- **Error**: The new Phase 2 browser gate could not resolve `playwright` when
  launched from the root `progress` directory.
- **Cause**: Node resolved dependencies relative to the harness file instead
  of the nested `navi-next` application.
- **Fix**: Required the bundled package from `process.cwd()/node_modules`;
  no product code or external state changed.
- **Prevention**: Run nested-app browser harnesses from `navi-next` and resolve
  local dependencies from the application working directory.
- **Related tasks**: Day 2 Phase 2 T3

## 2026-09-10: Phase 2 browser harness React fiber lookup
- **Error**: The first browser gate page loaded successfully but could not
  locate the live MapLibre instance from the initial React fiber traversal.
- **Cause**: This React build stores the NavigationMap instance through hook
  links/props not included in the narrow traversal.
- **Fix**: Expanded the read-only traversal to hook links and React props;
  the complete real MapLibre gate then passed with no page errors.
- **Prevention**: Keep browser seam diagnostics resilient to React hook-fiber
  storage shape and classify lookup failures separately from page behavior.
- **Related tasks**: Day 2 Phase 2 T3

## 2026-09-10: Mapbox Satellite Phase 1 audit — skill path resolution

- **Error**: The first attempt to read the graphify skill from the workspace
  `.agents/skills` path failed because that file was not present there.
- **Cause**: The skill catalog's `r1` root resolves to the user-level
  `C:\Users\Administrator\.agents\skills` directory, not the workspace's
  project-local directory.
- **Fix**: Read the skill from the canonical catalog path and continued the
  audit without changing application code.
- **Prevention**: Resolve the catalog root before opening a skill file and
  treat workspace-local skill paths as optional unless they exist.
- **Related tasks**: Mapbox Satellite Integration T1

## 2026-09-10: Phase 2 Graphify refresh permission boundary
- **Error**: The required `graphify update .` after the camera controller
  change returned `Nothing to update or rebuild failed` with Windows
  `[WinError 5] Access is denied`.
- **Cause**: The managed checkout does not permit Graphify to rebuild its
  generated output/cache path.
- **Fix**: No generated graph files were edited manually; the focused tests,
  targeted lint, browser seam, and scoped diff checks remain independent
  evidence for this camera slice.
- **Prevention**: Retry Graphify only after the managed permission boundary
  changes and keep generated graph output separate from product verification.
- **Related tasks**: Day 2 Phase 2 T4

## 2026-09-10: Phase 3 browser harness reporting variable
- **Error**: The Phase 3 real-MapLibre browser run completed its behavior
  assertions and then exited with `ReferenceError: finalMode is not defined`.
- **Cause**: The evidence object defined `finalMode` inline, while the final
  rapid-mode assertion referenced a local variable that had not been assigned.
- **Fix**: Read the final camera-view aria label once into `finalMode` before
  building the evidence object and assertions.
- **Prevention**: Keep evidence fields assigned to named locals before using
  them in both serialized evidence and gate assertions.
- **Related tasks**: Phase 3 T3

## 2026-09-10: Phase 3 lint wrapper path
- **Error**: The first scoped ESLint invocation reported that the Phase 3
  browser harness file did not exist.
- **Cause**: ESLint was run from `navi-next` with a root-relative `progress`
  path instead of the verified `..\progress` path.
- **Fix**: No source change was needed; the command was corrected to the
  nested application's actual relative path.
- **Prevention**: Resolve each scoped artifact path relative to the command's
  working directory before invoking lint.
- **Related tasks**: Phase 3 T4

## 2026-09-10: Outdoor terrain Phase 0 runtime test path scope
- **Error**: The first unrestricted runtime-package Vitest rerun reported
  `No test files found` after the sandbox-only `spawn EPERM` startup failure.
- **Cause**: `packages/runtime/vitest.config.ts` establishes the runtime package
  as its test root, but the command supplied repository-root-prefixed test paths.
- **Fix**: Ran the same four tests from `packages/runtime` with paths beginning
  at `src/routing`; all 4 files and 42 tests passed.
- **Prevention**: Resolve test filters relative to the selected Vitest config's
  root before classifying a no-files result as a test failure.
- **Related tasks**: Outdoor terrain Phase 0 T3

## 2026-09-10: Phase 3 Graphify refresh permission boundary
- **Error**: The required post-edit `graphify update .` returned
  `Nothing to update or rebuild failed` and `[WinError 5] Access is denied`.
- **Cause**: The managed Windows checkout still blocks Graphify's generated
  rebuild/atomic replacement path.
- **Fix**: No generated graph output was edited manually; product tests,
  lint, browser seam, and scoped diff checks were used as independent gate
  evidence.
- **Prevention**: Treat the Graphify refresh as an environment boundary until
  its managed write path is permitted; do not infer graph freshness from the
  extractor startup message.
- **Related tasks**: Phase 3 T4

## 2026-09-10: Mapbox Satellite repository typecheck baseline
- **Error**: The repository-wide TypeScript check stopped at
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)`
  with `TS1005: '}' expected`.
- **Cause**: The unrelated pre-existing runtime test fixture has an unmatched
  brace; the Mapbox files are outside that failure.
- **Fix**: No unrelated source was changed. The scoped Mapbox/editor test
  matrix and production build were run independently.
- **Prevention**: Repair the existing fixture before using repository-wide
  typecheck as a clean gate; keep the current error classified as baseline.
- **Related tasks**: Mapbox Satellite Integration T3

## 2026-09-10: Mapbox Satellite build sandbox process boundary
- **Error**: The first `npm run build` compiled successfully, then failed
  during page-data workers with Windows `spawn EPERM`.
- **Cause**: The managed sandbox blocked the worker process spawn.
- **Fix**: Reran the same build through the approved elevated execution path;
  compilation, 41 static pages, and route generation passed.
- **Prevention**: Use the approved elevated path when Next.js worker spawning
  is rejected by the managed Windows sandbox.
- **Related tasks**: Mapbox Satellite Integration T3

## 2026-09-10: Mapbox Satellite browser harness availability
- **Error**: The requested `agent-browser` CLI was not installed or available
  on PATH.
- **Cause**: The current managed environment exposes persistent CUA/
  Playwright browser control instead of that CLI.
- **Fix**: Used the available browser control with accessibility-state checks,
  DOM assertions, screenshots, zoom/pan actions, and console-log review.
- **Prevention**: Keep the CUA/Playwright fallback documented as the browser
  gate harness for this environment.
- **Related tasks**: Mapbox Satellite Integration T3

## 2026-09-10: Mapbox Satellite Graphify refresh permission boundary
- **Error**: The required post-edit `graphify update .` returned
  `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed checkout still blocks Graphify's generated
  rebuild/cache write path.
- **Fix**: No generated graph output was edited manually; focused tests,
  build, browser evidence, and scoped diff checks remain independent.
- **Prevention**: Retry Graphify after the managed write path is permitted and
  do not infer graph freshness from the extractor startup message.
- **Related tasks**: Mapbox Satellite Integration T3

## 2026-09-10: Outdoor terrain Phase 0 report-command formatting
- **Error**: One read-only line-number query failed PowerShell parsing because
  a colon immediately followed an interpolated variable, and the first report
  patch was rejected because an add-file line lacked the required patch prefix.
- **Cause**: The command needed a delimited variable reference, and every line
  in an add-file patch must begin with `+`.
- **Fix**: Used `${f}` in the query and generated the report patch by prefixing
  every content line before calling `apply_patch`; both corrected operations
  completed without touching product code.
- **Prevention**: Delimit PowerShell variables before literal colons and build
  large add-file patches from a uniformly prefixed line list.
- **Related tasks**: Outdoor terrain Phase 0 T4

## 2026-09-10: Outdoor terrain Phase 0 verification wrapper syntax
- **Error**: Two final verification wrappers failed JavaScript parsing before
  invoking the shell because malformed extra object properties were appended
  to the tool arguments.
- **Cause**: The wrapper payload was corrupted while composing the verification
  call; no command executed.
- **Fix**: Reissued clean `exec_command` objects. All required report
  sections and the terminal approval-stop line passed, and `git diff --check`
  reported no content errors.
- **Prevention**: Keep verification wrappers minimal and inspect the argument
  object before execution.
- **Related tasks**: Outdoor terrain Phase 0 T4

## 2026-09-10: Outdoor terrain Phase 0 line-reference command parsing
- **Error**: The first read-only PowerShell line-reference command failed with
  a parser error at `"$f:..."`.
- **Cause**: PowerShell interpreted the colon immediately after `$f` as part
  of a scoped variable reference.
- **Fix**: Delimited the variable as `${f}` and reran the read-only command;
  all requested source locations were emitted.
- **Prevention**: Use `${variable}` whenever punctuation immediately follows a
  PowerShell interpolation.
- **Related tasks**: Outdoor terrain Phase 0 T4

## 2026-09-10: Outdoor terrain Phase 1 tool-wrapper syntax
- **Error**: The first attempt to batch-read skill instructions failed JavaScript
  parsing before any shell command ran.
- **Cause**: An extraneous token was appended after the composed tool call.
- **Fix**: Reissued minimal, independently valid read calls; all required skill
  instructions were then read completely before implementation work.
- **Prevention**: Keep orchestration wrappers minimal and inspect object closure
  before submitting multi-read calls.
- **Related tasks**: Outdoor terrain Phase 1 T1

## 2026-09-10: NAVI Phase 4 verification command boundaries
- **Error**: The first Phase 4 test command ran from the repository wrapper and had no `package.json`; a lint command also used obsolete ESLint `--file` flags, and one PowerShell command needed quoting for the `(public)` path.
- **Cause**: The application package is the nested `navi-next` workspace, while ESLint 9 flat config does not support the legacy `--file` option and PowerShell parses unquoted parentheses.
- **Fix**: Reran tests and ESLint from `navi-next`, passed explicit file paths to `npx eslint`, and quoted the route path.
- **Prevention**: Resolve commands from the audited nested app root and use flat-config-compatible ESLint invocation syntax.
- **Related tasks**: NAVI Day 2 Camera Repair Phase 4 T1–T4

## 2026-09-10: NAVI Phase 4 browser harness and worker sandbox boundaries
- **Error**: The first browser harness revision had a JavaScript screenshot-call syntax error; the first delayed-position seam accidentally supplied a fallback `getCurrentPosition`; Chromium and the first production build hit managed-sandbox `spawn EPERM`; Graphify refresh hit `[WinError 5] Access is denied`.
- **Cause**: The harness object options were parenthesized incorrectly, the delayed test seam did not model a delayed position, and Windows process/file access is restricted in the managed environment.
- **Fix**: Corrected the harness with `apply_patch`, made delayed `getCurrentPosition` report an error, reran Chromium and the production build through the approved unrestricted path, and left generated Graphify output untouched.
- **Prevention**: Run browser/build workers through the approved path when required, validate test seams independently, and treat Graphify freshness as unavailable after its access error.
- **Related tasks**: NAVI Day 2 Camera Repair Phase 4 T3–T4

## 2026-09-10: Outdoor terrain Phase 1 polyline helper call shape
- **Error**: The first Phase 1 GREEN run passed 37/40 checks but three
  length-dependent tests threw because `polylineLengthHaversine` received a
  point array and attempted to read its missing `.points` member.
- **Cause**: The new wrapper called the existing utility with the validated
  `points` value instead of its required `WorldPolyline` container.
- **Fix**: Kept the point validation and passed the original `road.polyline`
  container to `polylineLengthHaversine`.
- **Prevention**: Confirm existing utility signatures at their declaration and
  add a direct multi-segment execution test before relying on inferred shapes.
- **Related tasks**: Outdoor terrain Phase 1 T2

## 2026-09-10: Outdoor terrain Phase 1 Graphify refresh permission boundary
- **Error**: The required post-edit `graphify update .` re-extraction ended with
  `Nothing to update or rebuild failed` and `[WinError 5] Access is denied`.
- **Cause**: The managed Windows checkout continues to block Graphify's graph
  rebuild or atomic replacement path.
- **Fix**: No generated graph output was edited manually; fresh focused tests,
  the unchanged baseline matrix, and scoped diff checks provide independent
  Phase 1 evidence.
- **Prevention**: Retry Graphify only after its managed write/access boundary
  changes, and never infer graph freshness from the extraction message alone.
- **Related tasks**: Outdoor terrain Phase 1 T3

## 2026-09-10: Outdoor terrain Phase 1 lint working directory
- **Error**: The first scoped ESLint wrapper did not launch because its working
  directory value was malformed and Windows returned error 267.
- **Cause**: An invalid placeholder-like string was supplied instead of the
  verified nested application path.
- **Fix**: Reissued the unchanged ESLint file selection from the explicit
  `C:\Users\Administrator\Desktop\CODEme\Navi\navi-next` directory.
- **Prevention**: Reuse the verified absolute application root for every nested
  package command rather than recomposing it inline.
- **Related tasks**: Outdoor terrain Phase 1 T3

## 2026-09-10: Outdoor terrain Phase 1 gate patch composition
- **Error**: The first gate-report patch was rejected because it contained two
  update operations for the same plan file; a follow-up ledger patch was also
  rejected because its context label contained an accidental suffix.
- **Cause**: The large patch duplicated a target, then the correction used an
  unverified context string. Both failures occurred before file mutation.
- **Fix**: Re-read the ledger tail, consolidated the plan changes into one hunk,
  and reissued the report and logs with verified context.
- **Prevention**: Use at most one operation per target in a patch and copy
  context directly from the current file before applying corrections.
- **Related tasks**: Outdoor terrain Phase 1 T4

## 2026-09-10: Outdoor terrain Phase 2 UI skill assets unavailable
- **Error**: The UI/UX skill's required design-system command could not open
  `scripts/search.py`; the installed `scripts` and `data` entries are plain
  link-placeholder files rather than directories.
- **Cause**: This workspace's local skill installation does not include the
  documented searchable asset tree.
- **Fix**: Applied the skill's loaded accessibility, native-control,
  progressive-disclosure, and inline-validation guidance directly while
  retaining the repository's existing Inspector design tokens.
- **Prevention**: Verify skill asset entries are directories before invoking
  their documented scripts, and fall back to the fully loaded written rules.
- **Related tasks**: Outdoor terrain Phase 2 T1–T2

## 2026-09-10: Outdoor terrain Phase 2 Inspector-pattern regex
- **Error**: The first read-only search for numeric-input patterns failed with
  an unclosed regular-expression group.
- **Cause**: PowerShell quoting removed the intended quoted HTML fragments from
  the alternation expression.
- **Fix**: Reissued the same search using a single-quoted PowerShell regex; the
  current property-panel numeric patterns were inspected successfully.
- **Prevention**: Use single-quoted regex arguments when searching TSX for
  double-quoted attributes.
- **Related tasks**: Outdoor terrain Phase 2 T1

## 2026-09-10: Outdoor terrain Phase 2 TSX patch artifact
- **Error**: The first GREEN Road Inspector test run stopped during transform
  because a literal `+` patch marker remained after the opening brace of
  `normalizeRoadRouting`.
- **Cause**: The added-line marker was accidentally included in the new TSX
  file's source text.
- **Fix**: Removed the marker before rerunning the focused suite.
- **Prevention**: Inspect newly added function boundaries and require a focused
  transform/test run immediately after applying a new-file patch.
- **Related tasks**: Outdoor terrain Phase 2 T2

## 2026-09-10: Outdoor terrain Phase 2 focused-test sandbox spawn
- **Error**: The focused Vitest command could not load Vite configuration in
  the managed sandbox because the Windows child-process spawn returned
  `EPERM`.
- **Cause**: This checkout's Vite/Rolldown configuration path requires process
  spawning that the managed sandbox blocks.
- **Fix**: Re-ran the identical focused command through the already approved
  elevated Vitest prefix; all 39 tests passed.
- **Prevention**: Treat sandbox `spawn EPERM` as an environment boundary and
  preserve the exact test command when rerunning with approved elevation.
- **Related tasks**: Outdoor terrain Phase 2 T2, T4

## 2026-09-10: Outdoor terrain Phase 2 combined test patch format
- **Error**: A combined patch for Inspector option assertions and the command
  characterization test was rejected as an invalid hunk before changing files.
- **Cause**: An extra hunk delimiter preceded the second file header.
- **Fix**: Split the independent test edits into separate well-formed patches.
- **Prevention**: Avoid an empty trailing hunk when one patch contains multiple
  file updates.
- **Related tasks**: Outdoor terrain Phase 2 T2–T3

## 2026-09-10: Outdoor terrain Phase 2 frozen-matrix test placement
- **Error**: The first exact Phase 0 matrix rerun reported 260 passed and the
  same four known failures instead of the frozen 227/4 count.
- **Cause**: Thirty-two new Inspector cases and one new command case were added
  inside two test files that are members of the literal Phase 0 matrix, so the
  baseline command also counted new Phase 2 coverage.
- **Fix**: Move Phase 2-only cases into dedicated test files, retain the
  original matrix files and cases, and rerun both the Phase 2 and frozen Phase
  0 commands independently.
- **Prevention**: When a gate locks both a command and exact counts, add new
  phase coverage in separate files outside that frozen command.
- **Related tasks**: Outdoor terrain Phase 2 T1, T3–T4

## 2026-09-10: Outdoor terrain Phase 2 split-test hook import
- **Error**: The first run of the separated Inspector test file failed at
  module setup with `TypeError: afterEach is not a function`; the other three
  files passed 14/14.
- **Cause**: `afterEach` was imported from Testing Library instead of Vitest
  while extracting the Phase 2 tests.
- **Additional error**: A first correction patch was also rejected without modifying files
  because its expected import line contained an accidental `import-` prefix.
- **Fix**: Import `afterEach` from Vitest and retain `cleanup` from Testing
  Library; apply the source correction independently from this ledger entry.
- **Prevention**: Keep runner lifecycle hooks grouped with runner imports and
  copy exact source context when splitting test files.
- **Related tasks**: Outdoor terrain Phase 2 T1, T4

## 2026-09-10: Outdoor terrain Phase 2 scoped-review path
- **Error**: A read-only final-review command looked for
  `navi-next/packages/.../road-routing-fields.tsx` while its working directory
  was already `navi-next`, so that one file read returned path-not-found.
- **Cause**: The repository prefix was duplicated after changing the command's
  working directory.
- **Fix**: Reissue the scoped review with package-relative paths from the nested
  repository root.
- **Prevention**: Pair displayed paths with the declared command working
  directory before running multi-file review commands.
- **Related tasks**: Outdoor terrain Phase 2 T4

## 2026-09-10: Outdoor terrain Phase 2 scoped lint
- **Error**: Initial scoped lint reported one new test `any` cast and the React
  set-state-in-effect rule for the routing draft's external prop
  synchronization. It also repeated three pre-existing `no-explicit-any`
  findings in the already dirty Road test/product files.
- **Cause**: The extracted test retained a broad context cast, and the
  component intentionally resets its local raw-input buffer when selection or
  externally applied history changes replace the Road prop.
- **Fix**: Type the new test context through `EditorContext`; make the sync
  effect depend on the complete Road prop and document a narrow rule exemption
  at the first synchronous reset. Do not expand scope to unrelated existing
  `any` cleanup.
- **Prevention**: Use exported context types in new harnesses and document
  legitimate controlled-to-draft synchronization at the effect boundary.
- **Related tasks**: Outdoor terrain Phase 2 T2, T4

## 2026-09-10: Outdoor terrain Phase 2 editor typecheck baseline
- **Error**: `tsc -p packages/editor/tsconfig.json --noEmit` exited 1 with a
  large existing diagnostic set spanning compiler coordinate/entity types,
  editor fixtures and services, core exports, editing-engine exports, and
  cross-package `rootDir` violations.
- **Cause**: The editor TypeScript program currently includes substantial
  unrelated dirty-worktree and cross-package source outside its configured
  root; these baseline diagnostics predate the Phase 2 Inspector slice.
- **Fix**: No out-of-scope type cleanup. Confirm that no diagnostic references
  `road-routing-fields.tsx`, `road-routing-props.test.tsx`, or
  `entity-update-routing.test.ts`, and retain focused transform/tests plus
  clean lint on all new Phase 2 files as the scoped evidence.
- **Prevention**: Restore a clean package typecheck baseline and correct package
  project references before treating editor-wide `tsc` as a feature gate.
- **Related tasks**: Outdoor terrain Phase 2 T4

## 2026-09-10: Outdoor terrain Phase 2 Graphify refresh boundary
- **Error**: Required post-change `graphify update .` re-extracted source but
  exited 1 with `Nothing to update or rebuild failed` and `[WinError 5] Access
  is denied`.
- **Cause**: The existing managed Windows Graphify rebuild/cache permission
  boundary remains unresolved in this dirty workspace.
- **Fix**: No generated graph file was manually edited; retain the successful
  pre-change Graphify queries and fresh scoped lint/test evidence.
- **Prevention**: Retry Graphify only after its managed write/access boundary
  changes, and never infer graph freshness from a failed rebuild.
- **Related tasks**: Outdoor terrain Phase 2 T4

## 2026-09-10: Outdoor terrain Phase 2 production-build sandbox spawn
- **Error**: The sandboxed `npm run build` compiled successfully but failed
  while collecting page data because Next.js could not spawn workers (`EPERM`).
- **Cause**: The managed sandbox blocks the production build's worker-process
  creation on Windows.
- **Fix**: Re-ran the identical build through the approved elevated npm build
  prefix; it exited 0, compiled successfully, and generated all 41 static
  pages.
- **Prevention**: Preserve the exact build command when escalating a
  sandbox-only worker-spawn failure and report the unrestricted result
  separately.
- **Related tasks**: Outdoor terrain Phase 2 T4

## 2026-09-10: Outdoor terrain Phase 2 gate-report patch artifact
- **Error**: Final report auditing found `payload+ payload` in the undo evidence
  sentence.
- **Cause**: An added-line marker was embedded in the report text during the
  large multi-file documentation patch.
- **Fix**: Replaced it with a single `payload` and reran the report-heading and
  artifact search.
- **Prevention**: Search new gate documents for literal patch-marker patterns
  before delivery.
- **Related tasks**: Outdoor terrain Phase 2 T4

## 2026-09-10: Outdoor terrain Phase 2 final-audit wrapper typo
- **Error**: A read-only final document audit completed at the shell layer but
  its output was discarded because the JavaScript wrapper referenced an
  undeclared/misspelled variable.
- **Cause**: The wrapper assigned `abat` and attempted to print `sabat` instead
  of printing the command result directly.
- **Fix**: Rerun the same non-mutating checks with `text(r.output)`.
- **Prevention**: Forward verification command results directly unless an
  intermediate transformation is required.
- **Related tasks**: Outdoor terrain Phase 2 T4

## 2026-09-10: Outdoor terrain Phase 2 split-test import alias
- **Error**: The newly split Inspector test file was initially added with a
  mistyped `@nEval/core` package import.
- **Cause**: Manual transcription while separating phase coverage from the
  frozen Phase 0 matrix.
- **Fix**: Corrected the alias to the repository's `@navi/core` package before
  executing the test file.
- **Prevention**: Compare new split-file imports against the source test's
  existing import block before the first run.
- **Related tasks**: Outdoor terrain Phase 2 T1, T4

## 2026-09-10: NAVI final integrated browser harness synchronization
- **Error**: Early final-gate harness attempts sampled delayed GPS before the camera controller was ready, used a heading helper that also moved the position to P3, asserted an arbitrary rapid-writer threshold, and attempted to snapshot an unmounted audit object after remount.
- **Cause**: The integrated harness combined asynchronous MapLibre/controller lifecycle events without explicit readiness, and its assertions did not consistently separate test input from camera behavior.
- **Fix**: Added bounded controller-readiness and transition-settle waits, a heading-only helper, a documented bounded rapid-transition threshold, and fresh MapLibre re-instrumentation after remount. The final fresh-production run exited 0 across A–N.
- **Prevention**: Synchronize on observable camera-handler state, keep GPS/heading test seams independent, and reattach instrumentation after unmount/remount.
- **Related tasks**: NAVI Day 2 Camera Repair Final Integrated Gate T2

## 2026-09-10: NAVI final integrated Graphify refresh boundary
- **Error**: Required final-gate `graphify update .` again returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Windows checkout blocks Graphify's generated rebuild/cache write path.
- **Fix**: Documented the boundary; no generated Graphify output was manually edited. Independent tests, browser, lint, diff, and build evidence were completed.
- **Prevention**: Retry Graphify only after its managed write/access boundary changes and never infer graph freshness from a failed extractor run.
- **Related tasks**: NAVI Day 2 Camera Repair Final Integrated Gate T3
## 2026-09-11: Phase 3 persistence — core type path probe
- **Error**: A narrow inspection command assumed `packages/core/src/types.ts`, but core types are exported from the `packages/core/src/types/` directory module.
- **Cause**: The probe reused a common single-file layout instead of resolving this repository's exact type-module path.
- **Fix**: Queried `rg --files navi-next/packages/core/src` and resolved the concrete files under `src/types/`; no source change depended on the failed probe.
- **Prevention**: After the mandatory Graphify query, resolve directory-module paths with `rg --files` before opening an assumed aggregate type file.
- **Related tasks**: NAVI Outdoor Terrain Routing Phase 3 T1
## 2026-09-11: Phase 3 persistence — initial Vitest startup boundary
- **Error**: The first Phase 3 RED Vitest command failed while loading `vitest.config.ts` with Windows `spawn EPERM`; no test was collected.
- **Cause**: The managed sandbox blocked Vite's child-process startup, matching the established Windows test-runner boundary.
- **Fix**: Rerun the identical focused command with the approved elevated Vitest execution permission and use only that result as test evidence.
- **Prevention**: Classify pre-collection `spawn EPERM` separately from assertions and never change product code in response to this environment failure.
- **Related tasks**: NAVI Outdoor Terrain Routing Phase 3 T1
## 2026-09-11: Phase 3 RED topology assertion compared generated graph IDs
- **Error**: The first Phase 3 RED run compared complete node/edge IDs across two independently compiled graphs, so GraphAdapter's process-global generated `N####`/`E####` counters caused five unrelated topology assertions to fail.
- **Cause**: The test treated derived graph IDs as persistence invariants even though the locked requirement protects authored Road and RoadJunction identity, geometry, access links, and connectivity structure.
- **Fix**: Canonicalize generated nodes by semantic type/position/trace membership and compare edge endpoints through those semantic keys; retain exact assertions for authored junction records and stable access-edge IDs.
- **Prevention**: Compare author-owned IDs exactly and derived compiler topology semantically when separate graph builds legitimately allocate fresh internal counters.
- **Related tasks**: NAVI Outdoor Terrain Routing Phase 3 T1
## 2026-09-11: Phase 3 RED rerun used mistyped test paths
- **Error**: A combined RED rerun misspelled the core and editor test paths, so Vitest collected only the graph-store Phase 3 suite.
- **Cause**: The command was transcribed with duplicated path segments instead of reusing the literal repository-relative filenames.
- **Fix**: Discarded the partial run as a gate and reran the exact three intended paths.
- **Prevention**: Copy test paths from `rg --files` or the plan verbatim before multi-file verification commands.
- **Related tasks**: NAVI Outdoor Terrain Routing Phase 3 T1
## 2026-09-11: Phase 3 final-gate quality command lookup path typos
- **Error**: The first read-only quality-command lookup used `nnavi` in the Phase 2 report filename and looked for `package.json` at the workspace root instead of `navi-next/package.json`.
- **Cause**: Two literal paths were transcribed instead of copied from the previously resolved report/app locations.
- **Fix**: Repeated the read-only lookup with `docs/audits/2026-09-10-navi-outdoor-terrain-routing-phase2-gate.md` and `navi-next/package.json`.
- **Prevention**: Reuse exact resolved file paths from prior commands for final-gate command discovery.
- **Related tasks**: NAVI Outdoor Terrain Routing Phase 3 T4
## 2026-09-11: Phase 3 scoped lint surfaced legacy adapter/type debt
- **Error**: Linting every touched file reported 56 `no-explicit-any` errors and four warnings in `create-editor-context.ts`, `graph-adapter.ts`, and `nav-types.ts`.
- **Cause**: These large shared files already contain broad explicit-`any` and unused-import debt; the same category is recorded by the Phase 2 baseline. The new standalone Phase 3 files and core/Inspector files emitted no findings.
- **Fix**: Remove avoidable casts from the locally edited Road reconstruction seam, rerun lint on clean Phase 3 files, and classify untouched-line diagnostics separately rather than broadening persistence work into a legacy typing cleanup.
- **Prevention**: Use typed boundary variables in newly edited blocks and pair whole-file legacy lint output with a clean new-file/changed-seam check.
- **Related tasks**: NAVI Outdoor Terrain Routing Phase 3 T4
## 2026-09-11: Phase 3 production build sandbox worker boundary
- **Error**: The sandboxed `npm run build` compiled successfully, then failed while collecting page data because Next.js could not spawn its workers (`EPERM`).
- **Cause**: The managed Windows sandbox blocks the production build's worker-process creation, matching the established Phase 2 boundary.
- **Fix**: Rerun the identical build with the approved elevated npm build execution and use that result as build evidence.
- **Prevention**: Separate successful compilation from sandbox worker startup and never change product code in response to this environment-only failure.
- **Related tasks**: NAVI Outdoor Terrain Routing Phase 3 T4
## 2026-09-11: Phase 3 Graphify invocation wrapper syntax errors
- **Error**: Two orchestration calls failed before tool execution: the first contained an invalid JavaScript token and wrong placeholder working directory, and the attempted immediate log patch was itself malformed.
- **Cause**: The wrapper payload was corrupted during transcription; neither call reached Graphify or changed repository files.
- **Fix**: Verified the workspace with a minimal `Get-Location` call, recorded both wrapper failures using a literal patch, and retried `graphify update .` from the exact repository root.
- **Prevention**: Keep final-gate wrappers minimal, use the known absolute workspace path verbatim, and avoid editing wrapper text after composing the tool call.
- **Related tasks**: NAVI Outdoor Terrain Routing Phase 3 T4
## 2026-09-11: Outdoor terrain Phase 3 Graphify refresh boundary
- **Error**: Required post-change `graphify update .` re-extracted source but exited 1 with `Nothing to update or rebuild failed` and Windows `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify rebuild/cache permission boundary remains unresolved in this shared Windows checkout.
- **Fix**: Left generated Graphify output untouched and retained the successful pre-change Graphify query/explain evidence plus independent test, lint, build, and diff verification.
- **Prevention**: Retry Graphify after its managed write boundary is corrected; never modify generated graph output destructively during feature work.
- **Related tasks**: NAVI Outdoor Terrain Routing Phase 3 T4
## 2026-09-11: Phase 3 final persistence rerun wrapper failures
- **Error**: The first final-matrix wrapper contained corrupted file/workdir text and did not start Vitest; two attempted immediate error-log patches and one read-only shell probe were also malformed before useful execution. A UI input tool was unavailable in Default mode and made no state change.
- **Cause**: Tool-call text was corrupted during orchestration, independent of repository source or the test runner.
- **Fix**: Discarded every non-executed/partial call, returned to minimal verified wrappers, recorded the failures in one ledger entry, and reran the literal previously successful matrix.
- **Prevention**: Use minimal wrapper objects and copy known-good commands without modifying their path text during final verification.
- **Related tasks**: NAVI Outdoor Terrain Routing Phase 3 T4
## 2026-09-11: Outdoor terrain Phase 3 gate-report text artifact
- **Error**: The first Phase 3 gate-report draft contained corrupted extra words in the `git diff --check` evidence sentence.
- **Cause**: Stray generated tokens entered a large documentation patch even though the underlying command evidence was correct.
- **Fix**: Replaced the sentence with the exact verified result and reran an artifact/required-heading scan before delivery.
- **Prevention**: Search newly generated gate reports for anomalous tokens and patch-marker artifacts before marking the workflow complete.

## 2026-09-11: Outdoor terrain Phase 4 audit path and pattern probes
- **Error**: Read-only Phase 4 exploration referenced a nonexistent
  `src/app/api/compile-v2` directory, several conventional-but-absent compiler
  test/type filenames, and one Windows wildcard/regular-expression form that
  the invoked command rejected.
- **Cause**: The probes combined verified architecture concepts with guessed
  filesystem layouts and shell-specific pattern syntax.
- **Fix**: Resolved the actual `/api/compile`, compiler type, normalization,
  junction, publisher, and runtime paths from Graphify plus `rg --files`, then
  continued only with literal verified paths. No product files were changed by
  the failed probes.
- **Prevention**: After the mandatory Graphify query, resolve every uncertain
  filename with `rg --files`; pass Windows globs through `rg -g` rather than as
  literal paths; test complex regular expressions separately.
- **Related tasks**: Outdoor terrain Phase 4 T1

## 2026-09-11: Outdoor terrain Phase 4 focused-test sandbox startup
- **Error**: The first Phase 4 RED Vitest command failed before collection
  while Vite loaded `vitest.config.ts`, reporting `spawn EPERM`.
- **Cause**: The managed Windows sandbox blocked Vite's child-process helper,
  matching the established Phase 2–3 runner boundary.
- **Fix**: Reran the identical focused command with the approved elevated
  Vitest permission; it collected 22 tests and produced the intended 4-failure
  RED signature.
- **Prevention**: Classify pre-collection sandbox startup errors separately and
  use only the identical elevated rerun as product-test evidence.
- **Related tasks**: Outdoor terrain Phase 4 T1

## 2026-09-11: Outdoor terrain Phase 4 rejected T2 patch
- **Error**: The first multi-file T2 patch contained corrupted text in its final
  normalization hunk, so `apply_patch` rejected the full transaction.
- **Cause**: A large patch payload was damaged during composition before the
  patch engine matched source context.
- **Fix**: Confirmed the transaction made no changes, split it into smaller
  literal hunks, and reapplied only verified source edits.
- **Prevention**: Keep cross-layer patches small and isolate complex mapping
  replacements from straightforward type additions.
- **Related tasks**: Outdoor terrain Phase 4 T2

## 2026-09-11: Outdoor terrain Phase 4 package-test root mismatch
- **Error**: The first publisher/runtime RED commands passed repository-relative
  test paths to package-specific Vitest configs, so both reported no files.
- **Cause**: Those configs set `include: src/**/*.test.ts` relative to their
  package roots, unlike the repository-level config.
- **Fix**: Reran from the literal `packages/publisher` and `packages/runtime`
  roots with `src/...` filters; both suites produced the intended RED evidence
  and later passed.
- **Prevention**: Pair each package-local Vitest config with its package working
  directory and package-relative test filter.
- **Related tasks**: Outdoor terrain Phase 4 T3

## 2026-09-11: Outdoor terrain Phase 4 T3 orchestration and patch retries
- **Error**: One multi-file T3 patch failed atomically on runtime-validator
  import context, and one combined verification wrapper contained an invalid
  working directory after its first command.
- **Cause**: Cross-package payload composition mixed source contexts and a
  corrupted command working directory.
- **Fix**: Applied smaller literal patches, discarded the combined wrapper as
  evidence, and reran one verified command per package root.
- **Prevention**: Keep package-boundary edits and verification commands isolated;
  do not batch commands with different working directories into one wrapper.
- **Related tasks**: Outdoor terrain Phase 4 T3

## 2026-09-11: Outdoor terrain Phase 4 compile API fixture connectivity
- **Error**: The first real compile API test returned 500 with
  `HALLWAY_DISCONNECTED`, so the response correctly had no artifacts.
- **Cause**: The new test document contained an isolated Road but no authored
  entrance connection, violating the existing compiler success gate.
- **Fix**: Added a minimal building entrance with explicit
  `connectorRoadId: 'road-1'`; the unchanged API then returned the expected
  compiled artifacts and metadata.
- **Prevention**: Real compile API fixtures must satisfy existing explicit
  connectivity requirements; do not weaken production validation to make an
  isolated synthetic Road pass.
- **Related tasks**: Outdoor terrain Phase 4 T3

## 2026-09-11: Outdoor terrain Phase 4 T4 log patch composition
- **Error**: The first combined plan/TODO/error-ledger update contained a stray
  token in one ledger hunk, so `apply_patch` rejected the full transaction.
- **Cause**: A long documentation patch was corrupted during composition.
- **Fix**: Split workflow-state and ledger updates into smaller verified
  patches; no partial change occurred from the rejected transaction.
- **Prevention**: Update plan state and error records in separate patches when
  the ledger text is substantial.
- **Related tasks**: Outdoor terrain Phase 4 T4

## 2026-09-11: Outdoor terrain Phase 4 audit-report path probe
- **Error**: A T4 lookup first requested a nonexistent Phase 0 filename ending
  in `phase0-gate.md`.
- **Cause**: The actual historical artifact is named
  `2026-09-10-navi-outdoor-terrain-routing-phase0-audit.md`.
- **Fix**: Resolved the exact filename with `rg --files` and read the literal
  report before copying either locked test command.
- **Prevention**: Resolve historical report filenames before reading them;
  never derive a gate path from a phase naming convention.
- **Related tasks**: Outdoor terrain Phase 4 T4

## 2026-09-11: Outdoor terrain Phase 4 expanded compiler baseline failures
- **Error**: The expanded compiler regression matrix reported 69 passes and
  two failures in `published-artifacts-pipeline.test.ts`, both on
  `result.success` after `HALLWAY_DISCONNECTED`.
- **Cause**: Those existing fixtures violate the current explicit connectivity
  success gate; Phase 0 already classifies downstream compiler/publisher
  assertions of this kind as pre-existing.
- **Fix**: Kept the failures visible, verified all eight other expanded files
  passed, and reran the exact locked Phase 0 matrix to confirm its unchanged
  227-pass / same-four-failure signature.
- **Prevention**: Separate historical disconnected-fixture failures from new
  Phase 4 tests; do not weaken connectivity validation to make them pass.
- **Related tasks**: Outdoor terrain Phase 4 T4

## 2026-09-11: Outdoor terrain Phase 4 scoped lint and typecheck baselines
- **Error**: Whole-file scoped lint found nine existing `no-explicit-any`
  errors plus existing unused-import warnings in shared compiler/publisher
  files. Publisher typecheck reported existing core export/model conflicts and
  publisher schema-name debt; runtime typecheck stopped on the established
  `data-identity-comparison.test.ts:255` `TS1005` parse error.
- **Cause**: The shared checkout already contains those diagnostics outside the
  new Phase 4 hunks, and Next build is configured to skip type validation.
- **Fix**: Ran full-rule lint over every new file and clean changed file (exit
  0), reran shared changed files with only the established legacy rules disabled
  (exit 0), retained typecheck output as baseline evidence, and completed the
  passing production build.
- **Prevention**: Pair broad whole-file diagnostics with clean new-file/scoped-
  seam lint; report but do not expand a metadata phase into unrelated type-debt
  repair.
- **Related tasks**: Outdoor terrain Phase 4 T4

## 2026-09-11: Outdoor terrain Phase 4 final evidence orchestration
- **Error**: Final read-only inspection included one invalid working-directory
  value and one mistyped `Select-Object` invocation; a test-helper patch also
  used a function-name context that did not exist. A later publisher/runtime
  verification repeated the already-documented repository-root filter mistake
  and reported no test files.
- **Cause**: Command and patch wrappers were composed from inferred text instead
  of the verified literal paths and surrounding source.
- **Fix**: Re-ran every operation from the confirmed repository or package root,
  inspected the exact source context, applied the smaller patch, and obtained
  passing 38/38 root, 2/2 publisher, and 6/6 runtime Phase 4 results.
- **Prevention**: Reuse the proven package-root commands verbatim and inspect a
  patch anchor before editing late in a verification cycle.
- **Related tasks**: Outdoor terrain Phase 4 T4

## 2026-09-11: Outdoor terrain Phase 4 sampled-coordinate assertion precision
- **Error**: Two strengthened authored-orientation assertions compared sampled
  endpoint coordinates by exact object equality and received normal floating
  interpolation noise (`14.500000000000005` versus `14.5`).
- **Cause**: The skeleton sampler performs floating-point interpolation; exact
  decimal object equality was stricter than the geometric invariant under test.
- **Fix**: Kept production geometry unchanged and compared latitude/longitude
  with ten-decimal closeness while retaining exact edge-chain ordering checks.
  The strengthened compiler/publish pair then passed 30/30.
- **Prevention**: Use tolerance for interpolated coordinates and exact equality
  for identity, adjacency, metadata, distance arrays, and weight arrays.
- **Related tasks**: Outdoor terrain Phase 4 T4

## 2026-09-11: Pre-existing graph-store snapshot fingerprint race
- **Error**: A late rerun of the 12-file Phase 1–3 persistence matrix reported
  197 passes and one failure in `src/store/graph-store.test.ts:78`; the expected
  local sync marker was absent. The isolated assertion reproduced the failure.
- **Cause**: `Graph.toJSON()` generates `updatedAt` on every call. `save()` stores
  one serialization, then `syncToSupabase()` immediately serializes again and
  writes the marker only when the two fingerprints match. Crossing a millisecond
  boundary makes the fingerprints differ, so the test is timing-dependent.
- **Fix**: Classified the issue as pre-existing and out of scope: Phase 4 does
  not modify graph-store, Graph serialization, persistence, or sync behavior.
  Retained the earlier clean 198/198 Phase 3 gate and the new Phase 4-specific
  persistence/publish/runtime evidence; no product workaround was introduced.
- **Prevention**: In a separately approved persistence repair, fingerprint one
  stable serialized snapshot through save and sync rather than calling
  time-bearing `toJSON()` twice.
- **Related tasks**: Outdoor terrain Phase 4 T4

## 2026-09-11: Outdoor terrain Phase 4 review-agent quota fallback
- **Error**: The first independent code-review agent could not complete because
  its account usage limit was reached.
- **Cause**: External agent quota, unrelated to repository code.
- **Fix**: Reused an available read-only audit agent for an independent review;
  it found no critical issue and identified two minor evidence gaps, both of
  which were addressed and rerun successfully.
- **Prevention**: Treat reviewer quota failures as orchestration limits and use
  another already-authorized reviewer without weakening the review gate.
- **Related tasks**: Outdoor terrain Phase 4 T4

## 2026-09-11: Outdoor terrain Phase 4 junction-test matcher artifact
- **Error**: The first junction-test patch inserted a malformed matcher token
  on one assertion line.
- **Cause**: Stray generated text entered a test-only patch payload.
- **Fix**: Corrected the literal line before executing the file; the expanded
  compiler metadata suite then passed 27/27.
- **Prevention**: Search freshly patched assertions for anomalous tokens before
  running focused tests.
- **Related tasks**: Outdoor terrain Phase 4 T4

## 2026-09-11: Outdoor terrain Phase 4 Graphify refresh boundary
- **Error**: Required `graphify update .` re-extracted source and then reported
  `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Windows graph rebuild/cache replacement boundary from
  Phases 1–3 remains unresolved.
- **Fix**: Left generated Graphify output untouched and retained the successful
  pre-change graph query plus current tests, lint, build, and scoped diff
  evidence.
- **Prevention**: Retry after the external permission boundary changes; never
  manually rewrite or destructively clean generated graph data.
- **Related tasks**: Outdoor terrain Phase 4 T4
## 2026-09-11: Outdoor terrain Phase 5 core type path probe
- **Error**: The first T2 source probe requested nonexistent
  `packages/core/src/models/road.ts` and `models/navigation.ts` paths.
- **Cause**: The paths were inferred from domain names before using the exact
  locations returned by `rg`; the canonical declarations live under
  `packages/core/src/types/`.
- **Fix**: Used the successful search output to resolve
  `types/entities.ts`, `types/enums.ts`, and `types/navigation-artifacts.ts` and
  abandoned the inferred paths.
- **Prevention**: Read only literal files returned by Graphify/`rg` after a
  search; do not derive core paths from type names.
- **Related tasks**: Outdoor terrain Phase 5 T2
## 2026-09-11: Outdoor terrain Phase 5 coordinate module path probe
- **Error**: A follow-up T2 probe requested nonexistent
  `packages/core/src/coordinates.ts`.
- **Cause**: The core barrel export `./coordinates` was incorrectly assumed to
  be a file; it resolves through the coordinates directory.
- **Fix**: Stopped inferring barrel targets and resolved the needed haversine
  implementation by exact-symbol search before reading it.
- **Prevention**: Treat extensionless barrel exports as unresolved until `rg`
  identifies the literal declaration path.
- **Related tasks**: Outdoor terrain Phase 5 T2
## 2026-09-11: Outdoor terrain Phase 5 scenario floating-point equality
- **Error**: The first T3 GREEN run passed 106/108 tests but two sensitivity
  cases compared calculated decimal costs by deep exact equality, receiving
  normal IEEE-754 noise such as `112.00000000000001` and
  `114.99999999999999`.
- **Cause**: Multiplication by decimal grade coefficients is not guaranteed to
  preserve their human-readable decimal representation exactly.
- **Fix**: Compare each numerical scenario with ten-decimal tolerance while
  keeping exact legacy-weight identity assertions exact.
- **Prevention**: Use closeness for derived floating-point cost arithmetic and
  exact equality only for IDs, enums, and required legacy pass-through values.
- **Related tasks**: Outdoor terrain Phase 5 T3
## 2026-09-11: Outdoor terrain Phase 5 Dijkstra matcher patch artifact
- **Error**: The first T4 implementation patch inserted a stray `)+` token in
  the Dijkstra relaxation comparison.
- **Cause**: A malformed token entered the multi-line patch payload during
  composition.
- **Fix**: Inspected the exact patched source and corrected the guard before
  running the GREEN suite.
- **Prevention**: Inspect newly patched algorithmic comparison/branch lines
  before executing tests, especially after multi-file patches.
- **Related tasks**: Outdoor terrain Phase 5 T4
## 2026-09-11: Outdoor terrain Phase 5 Windows report-path wildcard
- **Error**: A T5 evidence search passed
  `plan/NAVI-OUTDOOR-TERRAIN-ROUTING-PHASE4*` as a Windows path argument and
  `rg` rejected it with OS error 123. A later anomaly scan repeated the same
  mistake for Phase 5 path arguments before being corrected.
- **Cause**: The wildcard was embedded in a literal Windows pathname instead
  of using an `rg` file filter or resolved filenames.
- **Fix**: Used the exact Phase 4 report and plan paths already returned by the
  prior `rg --files` query, then replaced later wildcard path arguments with a
  literal directory plus `-g` filters; no verification claim relied on either
  failed search.
- **Prevention**: Resolve Windows filenames first and pass literal paths to
  subsequent content searches.
- **Related tasks**: Outdoor terrain Phase 5 T5
## 2026-09-11: Outdoor terrain Phase 5 Graphify refresh boundary
- **Error**: Required `graphify update .` re-extracted the workspace and then
  returned `Nothing to update or rebuild failed` with `[WinError 5] Access is
  denied`.
- **Cause**: The same managed Windows Graphify rebuild/cache replacement
  permission boundary recorded in Phases 1–4 remains active.
- **Fix**: Left generated graph output untouched and retained the successful
  pre-change Graphify queries plus current tests, lint, build, and diff evidence.
- **Prevention**: Retry only after the external permission boundary changes;
  never destructively clean or manually rewrite generated graph data.
- **Related tasks**: Outdoor terrain Phase 5 T5
## 2026-09-11: Outdoor terrain Phase 5 completed TODO state wording
- **Error**: Final inspection found the completed Phase 5 checklist still said
  exactly one task was in progress after all five tasks had been checked off.
- **Cause**: The explanatory sentence was written for the active execution
  state and was not updated with the final checkbox transition.
- **Fix**: Replaced it with an explicit terminal-state sentence stating that no
  task remains in progress and Phase 6 awaits approval.
- **Prevention**: Verify checklist annotations as well as checkbox states during
  the final report-tail audit.
- **Related tasks**: Outdoor terrain Phase 5 T5
## 2026-09-11: Outdoor terrain Phase 6 caller-search quoting
- **Error**: The first 6A read-only audit wrapper was rejected by PowerShell
  before execution with `ParserError: Unrecognized token in source text`.
- **Cause**: A double-quoted `rg` expression embedded a mixed single/double
  quote character class that terminated incorrectly in PowerShell.
- **Fix**: Replaced the expression with a simpler literal-safe symbol/path
  search and reran the audit; the failed wrapper produced no source evidence.
- **Prevention**: Avoid quote-character regex classes in PowerShell command
  strings; search stable path and symbol fragments instead.
- **Related tasks**: Outdoor terrain Phase 6 6A

## 2026-09-11: Outdoor terrain Phase 6 runtime Vitest worker permission
- **Error**: The first focused runtime Vitest invocation failed while loading
  configuration with `spawn EPERM` before collecting the RED test.
- **Cause**: The managed Windows sandbox blocked Vite's local build worker,
  matching the existing package-test execution boundary.
- **Fix**: Reran the exact package-local command through the approved elevated
  Vitest prefix; it executed normally and produced the intended missing-export
  RED assertion.
- **Prevention**: Run runtime tests from `packages/runtime` and use the approved
  elevated local Vitest prefix when the sandbox blocks worker creation.
- **Related tasks**: Outdoor terrain Phase 6 6B-6C

## 2026-09-11: Outdoor terrain Phase 6 capped-cost floating-point equality
- **Error**: The first traversal-cost GREEN run passed 20/21 tests; the capped
  downhill case produced `110.00000000000001` where the test required exact
  identity with `110`.
- **Cause**: The approved decimal coefficient participates in normal IEEE-754
  multiplication, just as the Phase 5 proof suite documented.
- **Fix**: Changed only the derived numerical assertion to ten-decimal
  tolerance; the exact legacy-weight identity assertion remains strict.
- **Prevention**: Use tolerance for calculated terrain costs and reserve exact
  equality for pass-through weights, identifiers, and enum contracts.
- **Related tasks**: Outdoor terrain Phase 6 6B-6C

## 2026-09-11: Outdoor terrain Phase 6 navigation type path probe
- **Error**: The 6G–6H seam audit requested nonexistent
  `packages/runtime/src/engine/types.ts` after successfully reading the actual
  RoutingEngine and NavigationService sources.
- **Cause**: A local engine type module was inferred even though
  `RoutePreferences` is imported from `@navi/core`.
- **Fix**: Abandoned the inferred path and resolved all further declarations by
  exact-symbol search before reading literal files.
- **Prevention**: Do not infer a sibling type filename from an imported type;
  use the import source and `rg` result as the path authority.
- **Related tasks**: Outdoor terrain Phase 6 6G-6H

## 2026-09-11: Outdoor terrain Phase 6 checklist path typo
- **Error**: The first 6G–6H checklist/progress patch was rejected because its
  checklist target contained the mistyped workspace segment `LVni`.
- **Cause**: Manual transcription error in one absolute patch path.
- **Fix**: The patch was atomic and changed nothing; reapplied it to the exact
  verified `Navi` workspace path.
- **Prevention**: Reuse the literal workspace root from successful commands for
  every multi-file patch target.
- **Related tasks**: Outdoor terrain Phase 6 6G-6H

## 2026-09-11: Outdoor terrain Phase 6 production-scenario exact decimal
- **Error**: The first production scenario gate passed 8/9 tests; the derived
  10% uphill case returned `114.99999999999999` where the new test used exact
  equality with `115`.
- **Cause**: Normal IEEE-754 representation of the approved decimal grade and
  rate, identical in kind to the earlier Phase 5 and Phase 6 cost assertions.
- **Fix**: Applied the established ten-decimal tolerance to that derived cost.
- **Prevention**: Apply tolerance consistently to all elevation-derived costs;
  keep exact assertions for legacy pass-through and integer/manual cases.
- **Related tasks**: Outdoor terrain Phase 6 6I-6J

## 2026-09-11: Outdoor terrain Phase 6 optimality matcher typo
- **Error**: The required pre-run anomaly scan found the invalid matcher name
  `toBeGreaterThanOrOrEqual` in the new heuristic gate.
- **Cause**: A duplicated word entered the large test patch.
- **Fix**: Corrected it to `toBeGreaterThanOrEqual` before executing the file;
  no test evidence was collected from malformed source.
- **Prevention**: Continue scanning new test assertions and relaxation guards
  for anomalous tokens before every first execution.
- **Related tasks**: Outdoor terrain Phase 6 6I-6J

## 2026-09-11: Outdoor terrain Phase 6 unified-test invocation payload
- **Error**: The first unified-route test tool request was rejected with an
  unexpected-end-of-input syntax error before reaching the shell.
- **Cause**: The execution payload was incomplete.
- **Fix**: Reissued the complete package-local Vitest command; the malformed
  request produced no filesystem mutation or test evidence.
- **Prevention**: Validate the complete command object before sending focused
  verification requests.
- **Related tasks**: Outdoor terrain Phase 6 6K

## 2026-09-11: Outdoor terrain Phase 6 package-search wildcard
- **Error**: A 6L import audit included literal `navi-next/*.json`; Windows
  rejected the wildcard pathname with OS error 123 while the other exact paths
  in the same read-only command succeeded.
- **Cause**: Repeated the documented mistake of embedding a wildcard in a
  Windows pathname instead of using an `rg` glob filter.
- **Fix**: Discarded that argument and retained only exact-file results; no
  implementation decision depends on the failed wildcard.
- **Prevention**: Use `-g '*.json'` against a literal directory when JSON file
  discovery is needed on Windows.
- **Related tasks**: Outdoor terrain Phase 6 6L-6M

## 2026-09-11: Floor-plan overlay audit search-wrapper quoting
- **Error**: A parallel read-only `rg` wrapper failed in the JavaScript orchestration layer with `SyntaxError: Unexpected string` before any shell command ran.
- **Cause**: Nested quote escaping for three PowerShell search expressions produced invalid JavaScript source.
- **Fix**: Reissue the searches as simple literal-safe command strings; the failed wrapper made no repository or application change.
- **Prevention**: Keep orchestrated command strings single-quoted at the JavaScript layer and avoid embedding doubled quote fragments when PowerShell can accept a plain pattern.
- **Related tasks**: Floor-plan non-uniform overlay audit T2, T3

## 2026-09-11: Floor-plan overlay audit history-module path probe
- **Error**: A read-only source excerpt requested nonexistent `packages/editor/src/commands/history.ts` while the other persistence/history excerpts succeeded.
- **Cause**: The history implementation was inferred to be colocated with command handlers; its exact path is `packages/editor/src/history.ts`.
- **Fix**: Resolved the literal path with `rg --files` before reading it; no source or application state changed.
- **Prevention**: Resolve service implementation filenames before composing multi-file excerpt commands, even when the imported concept appears command-related.
- **Related tasks**: Floor-plan non-uniform overlay audit T3

## 2026-09-11: Floor-plan overlay audit graph-model path probe
- **Error**: A read-only search included nonexistent `src/lib/graph.ts`; the Graph implementation actually lives at `src/engine/graph.ts`.
- **Cause**: The graph model path was guessed from a conventional `lib` layout instead of resolved from the repository file index.
- **Fix**: Resolved the exact implementation with `rg --files` and discarded the failed path argument; no application state changed.
- **Prevention**: Use the literal path returned by file discovery for Graph model inspection and do not infer module directories from imported class names.
- **Related tasks**: Floor-plan non-uniform overlay audit T3

## 2026-09-11: Floor-plan overlay audit Windows test-path wildcards
- **Error**: A read-only test search passed `*.test.ts` and `**/*.test.tsx` as literal Windows path arguments, and `rg` rejected them with OS error 123; two companion test inventories succeeded.
- **Cause**: Wildcards were embedded in path arguments instead of expressed through `rg -g` filters against literal directories, repeating a documented ledger pitfall.
- **Fix**: Discard the failed search and rerun only with literal directory roots plus `-g '*.test.ts'` / `-g '*.test.tsx'` filters.
- **Prevention**: Never use wildcard characters in Windows path arguments; resolve paths first or use tool-native glob filters.
- **Related tasks**: Floor-plan non-uniform overlay audit T4

## 2026-09-11: Floor-plan overlay audit repeated wildcard test probe
- **Error**: A follow-up read-only test probe again used wildcard suffixes in two Windows path arguments and produced OS error 123; the exact `production-route-characterization.test.tsx` argument still returned its valid matches.
- **Cause**: The command mixed one resolved literal file with two unresolved wildcard file arguments despite the immediately preceding prevention note.
- **Fix**: Treat only the literal-file output as evidence and replace all subsequent test searches with literal directory roots plus `-g` filters.
- **Prevention**: Compose Windows test searches from directories only; never append `*` to any path argument in this audit.
- **Related tasks**: Floor-plan non-uniform overlay audit T4

## 2026-09-11: Outdoor terrain Phase 6 adapter-test path corruption
- **Error**: The first adapter-test add-file patch used a corrupted absolute
  path outside the verified workspace and was rejected while resolving parent
  directories. A follow-up ledger patch also used a malformed context label
  and was rejected without changes.
- **Cause**: Generated path/context text was not copied from the known literal
  workspace root.
- **Fix**: Both operations were non-mutating; resumed with the exact
  `C:\Users\Administrator\Desktop\CODEme\Navi` root and a verified ledger
  heading.
- **Prevention**: Copy absolute targets only from successful command output and
  inspect every add-file path before applying it.
- **Related tasks**: Outdoor terrain Phase 6 6L-6M

## 2026-09-11: Outdoor terrain Phase 6 routing-subpath patch target
- **Error**: The first routing-subpath refinement patch targeted nonexistent
  `packages/.json` with an empty hunk and was rejected.
- **Cause**: The intended literal `packages/runtime/package.json` path and
  concrete export change were omitted from the patch payload.
- **Fix**: Reapplied the actual JSON export and adapter import edits to verified
  files; the rejected patch changed nothing.
- **Prevention**: Inspect both patch target and at least one concrete context
  line before issuing small configuration edits.
- **Related tasks**: Outdoor terrain Phase 6 6L-6M

## 2026-09-11: Outdoor terrain Phase 6 post-migration regex quoting
- **Error**: A combined test/caller-audit wrapper was rejected by PowerShell
  before execution with `ParserError` at a mixed-quote import regex.
- **Cause**: The command repeated the quote-character regex pattern already
  prohibited by the Phase 6 6A ledger entry.
- **Fix**: Split test execution from a simpler literal-safe symbol search; the
  rejected wrapper produced no verification evidence.
- **Prevention**: Search import path fragments and stable symbol names without
  regex quote classes in PowerShell command strings.
- **Related tasks**: Outdoor terrain Phase 6 6L-6M

## 2026-09-11: Outdoor terrain Phase 6 baseline-report directory probe
- **Error**: The final baseline search included nonexistent root directory
  `reports`; `rg` returned the valid `docs`/`progress` matches alongside an OS
  path error.
- **Cause**: A possible report location was supplied without first resolving
  it from `rg --files`.
- **Fix**: Discarded the missing-directory result and used the exact
  `docs/audits` paths returned by the successful portion of the search.
- **Prevention**: Resolve optional report directories before passing them as
  literal search roots.
- **Related tasks**: Outdoor terrain Phase 6 6N

## 2026-09-11: Outdoor terrain Phase 6 full-runtime pre-existing parse failure
- **Error**: The full runtime package gate reported 36 passed files and one
  failed suite because `src/__tests__/data-identity-comparison.test.ts:255`
  ends with an unmatched block (`Expected } but found EOF`). All 386 collected
  tests passed.
- **Cause**: The malformed pre-existing test file is part of unrelated dirty
  workspace work and is the same runtime parse boundary documented by Phase 4.
- **Fix**: Classified it as pre-existing and out of Phase 6 scope; ran the exact
  canonical/terrain subsets separately for authoritative feature evidence.
- **Prevention**: Keep package-wide parse debt distinct from scoped feature
  regressions and do not modify unrelated user work during this phase.
- **Related tasks**: Outdoor terrain Phase 6 6N

## 2026-09-11: Outdoor terrain Phase 6 persistence-matrix timestamp race
- **Error**: The final 12-file Phase 1–3 matrix reported 199 passes and the
  known `src/store/graph-store.test.ts:78` failure because the local sync marker
  was absent after save.
- **Cause**: The pre-existing `Graph.toJSON()` timestamp fingerprint race
  documented in Phase 4 remains; two new passing Inspector-warning tests raised
  the matrix total from 198 to 200.
- **Fix**: Classified the identical assertion as pre-existing and kept the
  earlier clean 198/198 Phase 3 evidence plus current Phase 6-specific gates;
  no persistence workaround was introduced.
- **Prevention**: Repair stable snapshot fingerprinting only in a separately
  authorized persistence task.
- **Related tasks**: Outdoor terrain Phase 6 6N

## 2026-09-11: Outdoor terrain Phase 6 root Vitest worker permission
- **Error**: A non-elevated one-file root Vitest probe failed during config load
  with `spawn EPERM` before collecting tests.
- **Cause**: The managed sandbox blocks the same Vite worker creation at the
  root project boundary as at the runtime package boundary.
- **Fix**: Replaced it with the approved elevated combined Phase 4–5 command;
  the startup failure provides no test evidence.
- **Prevention**: Use the approved elevated local Vitest prefix for all final
  root matrices instead of probing non-elevated first.
- **Related tasks**: Outdoor terrain Phase 6 6N

## 2026-09-11: Floor-plan overlay audit nonexistent calibration component test
- **Error**: A read-only test search included nonexistent `src/components/floor-editor/__tests__/TwoPointCalibration.test.tsx`; the calibration coverage lives only in `src/lib/__tests__/two-point-calibration.test.ts`.
- **Cause**: The component-test path was inferred from the component name instead of resolved from the test inventory.
- **Fix**: Discarded the failed path and used the exact test paths returned by `rg --files`; no application state changed.
- **Prevention**: Build focused test commands exclusively from resolved filenames, including when a nearby component strongly suggests a conventional test location.
- **Related tasks**: Floor-plan non-uniform overlay audit T4

## 2026-09-11: Floor-plan overlay audit Vitest sandbox worker permission
- **Error**: The focused seven-file audit suite failed during Vitest config loading with `spawn EPERM` before collecting tests.
- **Cause**: The managed sandbox blocked Vite's config helper process.
- **Fix**: Re-ran the identical explicit-path suite with the approved elevated Vitest prefix; 7 files and 51 tests passed.
- **Prevention**: Use the already-approved elevated local Vitest prefix for final audit verification in this workspace.
- **Related tasks**: Floor-plan non-uniform overlay audit T4

## 2026-09-11: Floor-plan overlay audit Graphify refresh permission
- **Error**: The mandatory `graphify update .` refresh reached code re-extraction and failed with `[WinError 5] Access is denied`.
- **Cause**: The existing managed-Windows Graphify rebuild permission boundary recurred.
- **Fix**: Recorded the failure and left generated Graphify output untouched manually; the audit relies on successful pre-edit Graphify queries plus literal source verification.
- **Prevention**: Repair the Graphify watch/rebuild permission boundary outside this audit before relying on incremental refresh as a completion gate.
- **Related tasks**: Floor-plan non-uniform overlay audit T5

## 2026-09-11: Floor-plan overlay audit source-path verification
- **Error**: The first final documentation gates found shortened compiler paths and three editor paths whose actual `artifacts/`, `emitter/`, `commands/`, `context/`, or `canvas/` subdirectories were omitted.
- **Cause**: Shortened module labels from earlier notes were copied into the documentation instead of the literal resolved paths.
- **Fix**: Replaced every cited source with its `rg --files`-verified location, corrected the published-artifacts-pipeline test filename, and standardized plan commit commands from the repository root.
- **Prevention**: Validate every concrete report/plan source path with `Test-Path` or `rg --files` before claiming the documentation gate passes.
- **Related tasks**: Floor-plan non-uniform overlay audit T5

## 2026-09-11: Floor-plan overlay audit path-regex quoting
- **Error**: One read-only report-path inventory used a regex beginning with an escaped Markdown backtick that PowerShell passed to `rg` as an invalid repetition expression.
- **Cause**: Shell quoting altered the intended literal backtick before the regex reached `rg`.
- **Fix**: Replaced the shell regex with PowerShell `[regex]::Matches()` over the report text; no files were changed by the failed search.
- **Prevention**: Use a single-quoted PowerShell regex for Markdown path extraction instead of embedding a backtick-sensitive pattern in an `rg` command string.
- **Related tasks**: Floor-plan non-uniform overlay audit T5

## 2026-09-11: Outdoor terrain Phase 6 review exposed policy integration gaps
- **Error**: Independent review found that arbitrary injected A* costs still
  inherited haversine, parallel edges were reconstructed by endpoints, invalid
  Road metadata could enter policy logic, and the first unified proof did not
  consume a real compiler result.
- **Cause**: The initial implementation preserved assumptions that were valid
  for the old single-weight graph but insufficient for generic callbacks and
  parallel canonical edges; its unified fixture began below the compiler seam.
- **Fix**: Default arbitrary custom costs to zero heuristic while production
  explicitly supplies proven haversine; carry predecessor edge IDs end to end;
  validate Road metadata before policy use; and route a real `compileV2` graph.
- **Prevention**: Review injected-search heuristics, edge identity, malformed
  metadata, and the highest claimed integration boundary before final gating.
- **Related tasks**: Outdoor terrain Phase 6 6F-6M

## 2026-09-11: Outdoor terrain Phase 6 unified compiler fixture validation
- **Error**: The real unified fixture emitted a usable connected graph but
  returned `success: false` with `HALLWAY_DISCONNECTED`.
- **Cause**: The established compiler validation mismatch rejects this minimal
  explicit RouteNetwork fixture even though canonical access edges are emitted
  and RoutingEngine proves both-direction reachability.
- **Fix**: Kept production validation unchanged and made the test assert the
  exact warning/error signature plus emitted access evidence before routing.
- **Prevention**: Never equate compiler success with graph availability in a
  regression fixture; assert both the exact validation result and graph-level
  connectivity without weakening the production gate.
- **Related tasks**: Outdoor terrain Phase 6 6K

## 2026-09-11: Outdoor terrain Phase 6 late orchestration no-op errors
- **Error**: Late read-only orchestration included one nonexistent `Xana` path,
  one malformed JavaScript result wrapper, one wrong workflow-document workdir,
  and one inferred Phase 5 audit filename.
- **Cause**: Extra path/result fragments and a guessed report suffix were used
  instead of copied literal paths and the standard result wrapper.
- **Fix**: Each failed operation was non-mutating; resolved paths with `rg`,
  reused the verified workspace roots, and reran required reads/commands.
- **Prevention**: Keep one exact workdir, resolve report names from `rg --files`,
  and use only `text(JSON.stringify(result))` for command-result wrappers.
- **Related tasks**: Outdoor terrain Phase 6 6N

## 2026-09-11: Outdoor terrain Phase 6 settled full-suite baseline
- **Error**: The final serial repository suite exited nonzero with 32 failed and
  5,172 passed tests plus 8 skipped across 484 files; 16 suites failed.
- **Cause**: The remaining signatures are established dirty-worktree debt:
  deleted `golden-campus` imports, disconnected/stale compiler fixtures, UI
  expectations, and other failures already present before Phase 6.
- **Fix**: Preserved every failure, compared it with the locked/scoped matrices,
  and reran Phase 6-specific gates, which all pass. No baseline test was hidden
  or modified to manufacture a green full suite.
- **Prevention**: Use the full suite for attribution and the locked Phase 0 plus
  focused matrices as acceptance evidence in this intentionally dirty checkout.
- **Related tasks**: Outdoor terrain Phase 6 6N

## 2026-09-11: Outdoor terrain Phase 6 final worker permission boundary
- **Error**: The first final focused Vitest rerun failed during config load with
  `spawn EPERM`, and the simultaneous Next build compiled but failed while
  spawning page-data workers.
- **Cause**: The managed sandbox blocks Vite/Next Windows child processes.
- **Fix**: Reran the identical commands through the approved execution path;
  focused tests passed 91/91 and the build generated all 41 pages.
- **Prevention**: Use the approved Vitest/build prefixes for final Windows gates;
  do not count pre-collection or pre-page-generation attempts as evidence.
- **Related tasks**: Outdoor terrain Phase 6 6N

## 2026-09-11: Outdoor terrain Phase 6 final static-analysis baselines
- **Error**: Broad touched-file ESLint reported 16 errors and 17 warnings on
  inherited `RouteTesting.tsx`/`nav-types.ts` lines. The first temporary scoped
  tsconfig inherited root includes and hit the known runtime-test parse error;
  the corrected scope reported four existing core export/model errors.
- **Cause**: The dirty checkout is not globally lint/type clean, and TypeScript
  inherited the parent `include` until it was explicitly overridden.
- **Fix**: Ran zero-diagnostic ESLint over new/Phase 6 seams, overrode the
  temporary config include, confirmed no Phase 6 diagnostic, then deleted it.
- **Prevention**: Override both `files` and `include` for scoped TypeScript and
  separate inherited whole-file debt from diagnostics on Phase 6 lines.
- **Related tasks**: Outdoor terrain Phase 6 6N

## 2026-09-11: Outdoor terrain Phase 6 final Graphify refresh boundary
- **Error**: Required `graphify update .` re-extracted code and then reported
  `[WinError 5] Access is denied` while rebuilding the knowledge graph.
- **Cause**: The established managed-Windows Graphify rebuild/cache permission
  boundary remains unresolved.
- **Fix**: Left generated Graphify output untouched and retained the successful
  pre-edit queries plus current source/test/build evidence.
- **Prevention**: Repair the external Graphify permission boundary separately;
  never manually rewrite generated graph data to simulate a successful refresh.
- **Related tasks**: Outdoor terrain Phase 6 6N

## 2026-09-11: Floor-plan Phase 1 calibration RED import
- **Error**: The first transform-authority RED test imported the not-yet-created `floor-plan-transform` module, so Vitest stopped at Vite import analysis instead of reporting the intended missing exports.
- **Cause**: The test-first scaffold used the production module path before the module existed.
- **Fix**: Switched the RED characterization to the existing coordinate module, observed assertion-only failures, then moved the finalized tests to the new authority module after implementation.
- **Prevention**: For RED tests on a new module, begin with an existing seam or create a minimal importable scaffold before asserting missing behavior.
- **Related tasks**: T2

## 2026-09-11: Floor-plan Phase 1 checklist patch context
- **Error**: The first attempt to mark T1 complete and T2 active failed because the patch context did not match the already-edited TODO/plan text.
- **Cause**: The checklist had been updated by an earlier patch, so the stale context was no longer present.
- **Fix**: Re-read the exact files and applied a narrower context patch; no source code was changed by the failed attempt.
- **Prevention**: Read the current checklist immediately before patching workflow state and use single-line anchors.
- **Related tasks**: T1, T2

## 2026-09-11: Floor-plan Phase 1 calibration expectation precision
- **Error**: The first canonical true-meter assertion expected 108.6 m for a 0.001° eastward delta at 14° latitude; the shared spherical conversion correctly produced 107.9 m.
- **Cause**: The expected value used a rough cosine approximation rather than the configured Earth-radius formula.
- **Fix**: Corrected the test expectation to the authority's computed 107.9 m; production code was unchanged.
- **Prevention**: Derive geographic-unit expectations from the same explicit Earth-radius/degrees-to-radians constants used by the authority, with a tolerance appropriate to rounding.
- **Related tasks**: T4

## 2026-09-11: Phase 6 field-validation audit speculative path check
- **Error**: One read-only `rg` check included the nonexistent candidate path
  `navi-next/src/components/studio/rendering/MapRenderer.tsx` and returned a
  file-not-found diagnostic.
- **Cause**: The rendering ownership check initially used a speculative file
  name before the actual bridge/renderer paths were confirmed.
- **Fix**: Re-ran the check against the confirmed
  `EntityRendererBridge.tsx` and `NavigationGraphRenderer.tsx` paths; no source
  change was made.
- **Prevention**: Validate candidate paths with `Test-Path` before scoped text
  searches and cite only confirmed files in audit output.
- **Related tasks**: Phase 6 field-validation audit T2, T3

## 2026-09-11: Phase 6 public edge metadata pass-through gap
- **Error**: The production public-store `normalizeEdge` parser returns only
  scalar edge fields and drops `raw.routing` before RouteTesting calls the
  canonical routing adapter.
- **Cause**: The transport normalizer predates the Phase 6 Road routing
  metadata contract and does not copy the optional routing object.
- **Fix**: Deferred intentionally; this session is audit-only and made no
  application-code changes. The report records the seam and a required
  follow-up validation.
- **Prevention**: Add a transport-contract test that loads a serialized edge
  through `normalizeEdge` and asserts routing preservation before browser
  validation is claimed.
- **Related tasks**: Phase 6 field-validation audit T1, T3

## 2026-09-11: Floor-plan Phase 1 final evidence environment and path probes
- **Error**: The first final Phase 1 Vitest matrix hit Windows `spawn EPERM`
  while Vite loaded its config; one later read-only diff probe also prefixed
  the already-selected `navi-next` workdir a second time and could not find it.
- **Cause**: Managed child-process restrictions and a nested-workdir command
  wrapper error, not product behavior.
- **Fix**: Reran the unchanged matrix through the approved Vitest path (274/274)
  and reran scope checks from the literal package root.
- **Prevention**: Use the approved execution path for Vite and do not prepend a
  nested repository path when the command workdir is already `navi-next`.
- **Related tasks**: Floor-plan Phase 1 T6

## 2026-09-11: Floor-plan Phase 1 protected published-artifact baseline
- **Error**: The protected `published-artifacts-pipeline.test.ts` run retained
  two failures where `compileV2` returned `success: false` with
  `HALLWAY_DISCONNECTED`.
- **Cause**: The established fixture violates the compiler's explicit hallway
  connectivity gate; no floor-plan visual metadata enters that validation path.
- **Fix**: Kept production validation unchanged, recorded the exact failures,
  and used the dedicated floor-plan publication/topology tests as the Phase 1
  acceptance evidence (green).
- **Prevention**: Keep disconnected-fixture failures classified separately from
  visual publication regressions; do not weaken connectivity validation.
- **Related tasks**: Floor-plan Phase 1 T6

## 2026-09-11: Floor-plan Phase 1 repository typecheck baseline
- **Error**: `tsc --noEmit` reported only
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3):
  TS1005: '}' expected`.
- **Cause**: An existing malformed runtime test in the dirty checkout, outside
  the Phase 1 transform/persistence changes.
- **Fix**: Preserved the source and classified the diagnostic as baseline;
  focused Phase 1 tests and runtime routing remained green.
- **Prevention**: Keep repository-wide parse debt separate from scoped Phase 1
  evidence and repair it only under an explicitly approved follow-up.
- **Related tasks**: Floor-plan Phase 1 T6

## 2026-09-11: Floor-plan Phase 1 Graphify refresh permission boundary
- **Error**: Required `graphify update .` re-extracted source and returned
  `Nothing to update or rebuild failed` with Windows `[WinError 5] Access is
  denied`.
- **Cause**: The established managed-Windows Graphify cache replacement
  permission boundary remains unresolved.
- **Fix**: Left generated Graphify output untouched and retained the successful
  pre-edit graph query plus the green Phase 1 code/test evidence.
- **Prevention**: Repair the external Graphify permission boundary separately;
  never manually rewrite generated graph data to simulate a refresh.
- **Related tasks**: Floor-plan Phase 1 T6

## 2026-09-11: Floor-plan Phase 1 final Graphify retry
- **Error**: The required post-fix `graphify update .` retry again returned
  `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The same external managed-Windows graph-cache permission boundary
  persisted after the optional publication-reader correction.
- **Fix**: Did not edit or restore generated `graphify-out` files; final evidence
  relies on the successful graph query and the verified code/test matrix.
- **Prevention**: Resolve Graphify cache permissions outside this Phase 1 code
  gate before claiming a refreshed generated graph.
- **Related tasks**: Floor-plan Phase 1 T6

## 2026-09-11: Phase 6 support-gate RED Vitest worker permission
- **Error**: The first focused RED Vitest invocation failed during config load
  with `spawn EPERM` before collecting tests.
- **Cause**: The managed Windows sandbox blocked Vite's external-dependency
  worker process, matching the established Phase 6 runner boundary.
- **Fix**: Re-ran the identical explicit-path command through the approved
  elevated Vitest execution path; the intended RED assertions then executed.
- **Prevention**: Use the approved elevated Vitest prefix for focused RED/GREEN
  runs and distinguish runner startup failures from product assertions.
- **Related tasks**: Phase 6 field-validation support gate T1

## 2026-09-11: Floor-plan Phase 2 resize RED and precision boundary
- **Error**: The first Phase 2 resize RED suite reported missing `resizePlanFromHandle` exports, and the first GREEN assertion observed a binary floating-point value just below the exact minimum-scale boundary.
- **Cause**: TDD tests were intentionally written before the new authority, and decimal scale multiplication cannot represent every boundary exactly.
- **Fix**: Added the pure handle authority, then asserted the minimum with a `1e-9` tolerance; production clamping remains finite and positive.
- **Prevention**: Keep the pure geometry suite RED before implementation and use tolerance at physical-unit boundaries rather than weakening the clamp.
- **Related tasks**: Floor-plan Phase 2 T1

## 2026-09-11: Floor-plan Phase 2 interaction RED baseline
- **Error**: The first Phase 2 interaction suite could not find semantic handles, the body test surface, aspect-lock control, or pointer transaction behavior.
- **Cause**: The pre-Phase-2 implementation exposed only four mouse corner handles and global mouse listeners.
- **Fix**: Replaced the transform surface with eight semantic Pointer Event handles, pointer capture, RAF previews, and one shared cleanup transaction.
- **Prevention**: Keep semantic handle, capture, RAF, cancellation, and MapLibre preview assertions in the focused suite before running the regression matrix.
- **Related tasks**: Floor-plan Phase 2 T2

## 2026-09-11: Floor-plan Phase 2 protected editor-route baseline
- **Error**: The protected `production-route-characterization.test.tsx` run retained two failures: a Route path expected three points but received four, and the expected `entrance.access.assign` command was absent; the same run had 74 passing assertions and `FloorEditorCanvas.test.tsx` passed.
- **Cause**: These scenarios run with floor-plan alignment inactive and exercise unrelated route-authoring behavior in the already-dirty editor checkout; Phase 2 changes add no route/tool inputs to that component.
- **Fix**: Preserved the production route code and classified both assertions as pre-existing; no Phase 2 expectation was changed.
- **Prevention**: Keep route-authoring characterization separate from the floor-plan interaction gate and only attribute failures to Phase 2 when the transform surface is active or a touched seam changes.
- **Related tasks**: Floor-plan Phase 2 T3

## 2026-09-11: Floor-plan Phase 2 Graphify refresh boundary
- **Error**: Required `graphify update .` after the Phase 2 source edits again failed with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify cache/output permission boundary documented by Phase 1 is still external to the application checkout.
- **Fix**: Left generated `graphify-out` untouched; the successful pre-edit graph query and fresh scoped test evidence remain authoritative for this gate.
- **Prevention**: Never manually rewrite generated graph data to simulate a refresh; repair the cache permission boundary separately.
- **Related tasks**: Floor-plan Phase 2 T4

## 2026-09-11: Floor-plan Phase 2 final Graphify retry
- **Error**: The final post-verification `graphify update .` retry returned the same `[WinError 5] Access is denied` cache failure.
- **Cause**: No change; the managed Graphify output boundary remains unavailable.
- **Fix**: Did not touch generated graph output; retained the successful graph query and fresh Phase 2 evidence.
- **Prevention**: Treat this as the known tooling boundary, not as a transform-code failure, until the cache permission is repaired externally.
- **Related tasks**: Floor-plan Phase 2 T4

## 2026-09-11: Phase 6 support-gate seam test expectation mismatch
- **Error**: The first focused protected matrix failed one public-store seam
  assertion because the test expected `sourceRoadId: road-shared-seam` on the
  serialized blocked edge.
- **Cause**: The fixture payload deliberately overrides that edge's source ID
  to `road-blocked`, but the assertion reused the base routing object.
- **Fix**: Updated the test expectation to match the serialized edge payload;
  no production code or data state changed.
- **Prevention**: Assert serialized fixture metadata from the exact payload
  object, especially when composing overrides over a shared base object.
- **Related tasks**: Phase 6 field-validation support gate T4

## 2026-09-11: Phase 6 support-gate targeted lint baseline
- **Error**: The changed-file ESLint invocation exited non-zero with the
  existing `RouteTesting.tsx` ref/dependency and synchronous-effect rules plus
  existing explicit-`any` diagnostics in `NavigationInspector.test.tsx` and
  `nav-types.ts` (18 errors, 17 warnings after the new fixture effect was
  removed).
- **Cause**: Those diagnostics are present in the checked-in baseline; the
  support changes initially added one new fixture synchronization effect
  diagnostic.
- **Fix**: Removed the new effect and performed fixture-case resets directly
  in the development-only source and case selectors. The focused lint command
  over the support implementation files (excluding the pre-existing debt
  files) now exits 0.
- **Prevention**: Keep support-gate lint scoped to changed implementation
  logic and classify inherited RouteTesting debt separately; do not broaden
  this gate into an unrelated refactor.
- **Related tasks**: Phase 6 field-validation support gate T5

## 2026-09-11: Phase 6 support-gate build worker permission
- **Error**: `npm run build` compiled the production bundle successfully but
  failed during Next.js page-data collection with Windows `spawn EPERM`.
- **Cause**: The managed sandbox blocked Next's page-data worker process after
  compilation; no source diagnostic was emitted.
- **Fix**: Rerun the unchanged build through the approved elevated command
  path and classify the first invocation as an execution-boundary failure.
- **Prevention**: Use the elevated build runner for this checkout's worker
  phase and retain the compile/page-data boundary in the evidence log.
- **Related tasks**: Phase 6 field-validation support gate T5

## 2026-09-11: Phase 6 support-gate repository typecheck baseline
- **Error**: `tsc --noEmit --pretty false` stops at
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)`
  with `TS1005: '}' expected`.
- **Cause**: The dirty checkout contains an existing malformed runtime test
  outside the Phase 6 support-gate files; Next's production build explicitly
  skipped type validation before this command.
- **Fix**: Preserved the unrelated test and classified the diagnostic as a
  baseline parse failure; the targeted Phase 6 Vitest and implementation lint
  evidence remain green.
- **Prevention**: Keep repository-wide parse debt separate from scoped support
  validation and repair it only under an explicitly approved follow-up.
- **Related tasks**: Phase 6 field-validation support gate T5

## 2026-09-11: Phase 6 support-gate Graphify refresh permission
- **Error**: The required post-edit `graphify update .` failed during code
  re-extraction with Windows `[WinError 5] Access is denied`.
- **Cause**: The established managed-Windows Graphify cache replacement
  permission boundary remains unresolved.
- **Fix**: Left generated `graphify-out` content untouched and retained the
  successful pre-edit graph query plus the support-gate test/build evidence.
- **Prevention**: Repair the external Graphify cache permission boundary in a
  separate maintenance task; never rewrite generated graph data to simulate a
  refresh.
- **Related tasks**: Phase 6 field-validation support gate T5

## 2026-09-11: Phase 6 support-gate local server already running
- **Error**: A fresh `npm run dev -- -p 3000` attempt returned
  `EADDRINUSE` because port 3000 was already occupied.
- **Cause**: An existing local Next development server is active in the dirty
  checkout.
- **Fix**: Reused the existing localhost server for read-only browser
  validation; no process was stopped or restarted.
- **Prevention**: Probe the requested local port before launching a second
  dev server and preserve the already-running process.
- **Related tasks**: Phase 6 field-validation support gate T5

## 2026-09-11: Phase 4 parallel Vitest worker permission boundary
- **Error**: Starting the three post-browser Vitest commands concurrently caused
  each Vite config load to fail with `spawn EPERM` before test collection.
- **Cause**: The managed Windows sandbox denied concurrent worker/process
  creation; no test or production diagnostic was emitted.
- **Fix**: Classified the failure as an execution-boundary issue and reran the
  protected commands sequentially through the approved Vitest path.
- **Prevention**: Run this checkout's final Vitest gates sequentially when the
  sandbox is process-constrained; do not treat a config-startup EPERM as a
  floor-plan regression.
- **Related tasks**: Phase 4 T4

## 2026-09-11: Phase 4 Graphify refresh permission boundary
- **Error**: Required `graphify update .` failed during code re-extraction with
  `[WinError 5] Access is denied`.
- **Cause**: The managed-Windows Graphify cache/output permission boundary
  remains unresolved in the already-dirty checkout.
- **Fix**: Preserved generated Graphify content and classified the refresh as
  an environmental gate failure; the Phase 4 graph query and source evidence
  remain valid.
- **Prevention**: Repair the external Graphify cache permission boundary in a
  separate maintenance task; never rewrite generated graph data to simulate a
  successful refresh.
- **Related tasks**: Phase 4 T4

## 2026-09-11: Phase 4 local Campus shell route boundary
- **Error**: Clicking the floor editor's `Campus` link navigated to the local
  map-editor shell and displayed `Map not found`, while the direct floor route
  remained loadable.
- **Cause**: The seeded local route shell did not resolve the map record during
  that SPA navigation; this occurred outside the floor-plan overlay path.
- **Fix**: Used the already loaded direct floor route for the immediate
  exit/return and reload persistence checks; no production source was changed.
- **Prevention**: Treat this as a local route-shell limitation and validate
  persistence through a resolvable direct floor route until the shell fixture
  is repaired separately.
- **Related tasks**: Phase 4 T3
## 2026-09-11: Unified POI audit speculative GraphAdapter path probe
- **Error**: A read-only search included the nonexistent candidate path
  `navi-next/src/engine/graph-adapter.ts` and emitted a file-not-found
  diagnostic.
- **Cause**: The canonical GraphAdapter lives in the editor package, but the
  first persistence search also probed the legacy app-layer location.
- **Fix**: Re-ran the search against the confirmed
  `navi-next/packages/editor/src/graph-adapter.ts` path; no application source
  or data was changed.
- **Prevention**: Confirm candidate paths with `Test-Path` or Graphify before
  including them in scoped searches, and cite only existing paths in the audit.
- **Related tasks**: Unified POI Phase 1 audit T2

## 2026-09-11: Unified POI audit focused Vitest startup boundary
- **Error**: The first sequential focused Vitest batch failed while loading
  `vitest.config.ts` with Windows `spawn EPERM`; no tests were collected.
- **Cause**: The managed sandbox blocked Vite's external-dependency resolver
  subprocess during config startup.
- **Fix**: No source or test file was changed; the identical batch is being
  rerun through the approved elevated Vitest execution path.
- **Prevention**: Keep focused batches sequential and classify config-startup
  `spawn EPERM` separately from assertion failures before evaluating the gate.
- **Related tasks**: Unified POI Phase 1 audit T3

## 2026-09-11: Unified POI audit compiler fixture baseline
- **Error**: The focused compiler/runtime batch reported two failures in
  `published-artifacts-pipeline.test.ts`; both compileV2 assertions stopped on
  `HALLWAY_DISCONNECTED` for the fixture's disconnected waypoints.
- **Cause**: The fixture's existing topology is not reachable from an entrance;
  the audit did not modify compiler, graph, or fixture code.
- **Fix**: Preserved the fixture and classified both failures as an existing
  compiler-pipeline baseline; the other collected tests passed.
- **Prevention**: Keep published-artifact assertions separate from POI
  read/search evidence and attribute failures only after the fixture topology
  is independently green.
- **Related tasks**: Unified POI Phase 1 audit T3

## 2026-09-11: Unified POI audit test path qualification probe
- **Error**: The first compiler/runtime batch included the nonexistent path
  `packages/core/src/context/create-document.test.ts`; Vitest ignored that
  unmatched path while collecting the remaining files.
- **Cause**: The test is under `packages/editor/src/context`, not the core
  package; the path was inferred from the shared `createDocument` symbol.
- **Fix**: No source or test file changed; the editor context suite will be
  rerun from its exact resolved path.
- **Prevention**: Resolve every test path with `rg --files` before composing a
  multi-suite baseline command.
- **Related tasks**: Unified POI Phase 1 audit T3

## 2026-09-11: Unified POI audit repository typecheck baseline
- **Error**: The read-only repository-wide TypeScript check stopped at
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)`
  with `TS1005: '}' expected`.
- **Cause**: The malformed runtime test is an existing dirty-checkout parse
  failure outside this audit; no production or test source was changed.
- **Fix**: Preserved the unrelated file and classified the result as a
  repository baseline limitation; focused suites remain the verification gate.
- **Prevention**: Repair or isolate the pre-existing parse debt before using a
  repository-wide typecheck as a release gate.
- **Related tasks**: Unified POI Phase 1 audit T3

## 2026-09-11: Unified POI audit report verifier path qualification
- **Error**: The first post-write report verifier looked for the report under
  the root `progress/` directory and reported it missing.
- **Cause**: The required report follows the nested app convention at
  `navi-next/progress/`; the verifier was run from the root without the app
  prefix.
- **Fix**: Re-ran the check with the explicit nested path and confirmed the
  report exists; no report content or production source was changed.
- **Prevention**: Keep root workflow documents and nested app report paths
  explicit in every final verification command.
- **Related tasks**: Unified POI Phase 1 audit T3

## 2026-09-11: Unified POI Phase 2 RED Vitest startup boundary
- **Error**: The first focused Phase 2 RED invocation failed while loading
  `vitest.config.ts` with Windows `spawn EPERM`; no test was collected.
- **Cause**: The managed sandbox denied Vite's external-dependency resolver
  subprocess before the new persistence assertions could run.
- **Fix**: No source or test change was made in response; the identical RED
  command is being rerun through the approved elevated sequential runner.
- **Prevention**: Treat config-startup `spawn EPERM` as an environment failure
  and require an actual collected-test RED result before implementing code.
- **Related tasks**: Unified POI Phase 2 T2

## 2026-09-11: Unified POI Phase 2 topology RED fixture identity
- **Error**: The first collected topology test compared raw derived graph
  node/edge IDs across repeated `GraphAdapter.sync()` calls and failed after
  POI creation because generated road IDs changed (`N0021` → `N0031`).
- **Cause**: The fixture rebuild uses process-local generated IDs for derived
  road endpoints; those IDs are not authored routing topology identity.
- **Fix**: Keep the production graph unchanged and normalize the test snapshot
  to stable road/junction geometry and edge connectivity signatures.
- **Prevention**: Topology immutability tests must compare authored IDs and
  stable geometry/connectivity, not process-local IDs for derived nodes.
- **Related tasks**: Unified POI Phase 2 T2

## 2026-09-11: Unified POI Phase 2 topology RED road fixture normalization
- **Error**: The save/reload topology assertion compared the complete Road
  object and exposed existing legacy normalization (`connector` → `arterial`,
  default `displayMode`, and derived surface metadata) unrelated to POI work.
- **Cause**: The fixture used a legacy road presentation/type combination that
  is not preserved byte-for-byte by the existing GraphAdapter round-trip.
- **Fix**: Keep the production adapter unchanged; compare only protected road
  identity, geometry, width, surface, and routing type, and use a stable
  arterial fixture type for this topology invariant.
- **Prevention**: Separate topology immutability assertions from legacy road
  presentation normalization and cover the latter only in its own baseline.
- **Related tasks**: Unified POI Phase 2 T2

## 2026-09-11: Unified POI Phase 2 GREEN fixture expectation
- **Error**: After the adapter projection was repaired, the topology test
  expected an empty POI array after deleting its temporary POI, but the
  fixture intentionally retained two pre-existing POIs.
- **Cause**: The assertion described the temporary operation rather than the
  complete fixture state.
- **Fix**: Preserve the fixture's original POI array and assert that only the
  temporary POI is removed after the save/reload path.
- **Prevention**: Snapshot pre-existing authored records before representative
  create/update/delete operations and assert exact remaining identity state.
- **Related tasks**: Unified POI Phase 2 T3

## 2026-09-11: Unified POI Phase 2 repository typecheck baseline
- **Error**: The fresh repository-wide TypeScript check stopped at
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)`
  with `TS1005: '}' expected`.
- **Cause**: The known malformed runtime test remains in the dirty checkout
  and is outside the Phase 2 files and behavior.
- **Fix**: Preserved the unrelated test and classified the diagnostic as a
  pre-existing repository baseline; the focused Phase 2 matrix is the scoped
  verification gate.
- **Prevention**: Keep repository-wide parse debt separate from the focused
  POI persistence gate and repair it only under an explicitly approved task.
- **Related tasks**: Unified POI Phase 2 T4

## 2026-09-11: Unified POI Phase 2 Graphify refresh permission boundary
- **Error**: Required post-edit `graphify update .` failed during code
  re-extraction with `[WinError 5] Access is denied`.
- **Cause**: The established managed-Windows Graphify cache/output permission
  boundary remains unresolved in the dirty repository.
- **Fix**: Left generated Graphify output untouched and retained the successful
  pre-edit graph query plus fresh focused test evidence.
- **Prevention**: Repair the external Graphify permission boundary separately;
  never manually rewrite generated graph data to simulate a refresh.
- **Related tasks**: Unified POI Phase 2 T4

## 2026-09-12: Unified POI Phase 3A RED Vitest startup boundary
- **Error**: The first focused Phase 3A RED invocation failed while loading
  `vitest.config.ts` with Windows `spawn EPERM`; no test body was collected.
- **Cause**: The managed sandbox blocked Vite's external-dependency resolver
  subprocess during config startup, matching the established Vitest boundary.
- **Fix**: No production behavior was inferred from the startup failure; the
  identical command is being rerun through the approved elevated runner.
- **Prevention**: Keep the focused batch sequential and classify config-startup
  failures separately from missing-POI assertion failures.
- **Related tasks**: Phase 3 T2

## 2026-09-12: Unified POI Phase 3A RED missing Studio seams
- **Error**: The elevated focused RED batch collected four new files and
  failed all 8 assertions: POI lookup, GeoJSON/source/layer rendering,
  campus-tool exposure, Inspector command routing, and map placement/selection.
- **Cause**: The active Studio surface still has no point POI selector/lookup,
  renderer source, Inspector case, campus dock entry, or controller branch.
- **Fix**: Kept production code unchanged at the RED checkpoint; these
  assertion failures are the intended implementation targets for T3/T4.
- **Prevention**: Keep the point-only tests tied to `Floor.pois`, stable IDs,
  floor-local conversion, and specialized `poi.*` commands; do not broaden the
  RED fixture into geometry contracts or graph/topology behavior.
- **Related tasks**: Phase 3 T2

## 2026-09-12: Unified POI Phase 3A T3 Graphify refresh boundary
- **Error**: Required `graphify update .` after the identity/Inspector source
  edits returned `Nothing to update or rebuild failed` and
  `[WinError 5] Access is denied` during code re-extraction.
- **Cause**: The managed Graphify cache/output permission boundary remains
  outside the writable application checkout.
- **Fix**: Left generated `graphify-out` content untouched; the focused
  identity/Inspector tests are the independent source verification.
- **Prevention**: Retry the required refresh after the permission boundary is
  repaired, and never rewrite generated graph output to simulate a refresh.
- **Related tasks**: Phase 3 T3

## 2026-09-12: Unified POI Phase 3A T4 Graphify refresh boundary
- **Error**: Required `graphify update .` after the renderer, tool, and bridge
  edits again returned `Nothing to update or rebuild failed` with Windows
  `[WinError 5] Access is denied` during code re-extraction.
- **Cause**: The managed Graphify cache/output permission boundary is still
  outside the writable checkout.
- **Fix**: Left generated graph output unchanged; focused source and test
  verification remains independent of the refresh.
- **Prevention**: Retry only when the external permission boundary changes;
  never manually rewrite generated Graphify files.
- **Related tasks**: Phase 3 T4

## 2026-09-12: Unified POI Phase 3A T5 scoped lint baseline
- **Error**: The changed implementation-file ESLint command exited non-zero
  with 58 diagnostics: inherited explicit-`any`/unused diagnostics in the
  existing PropertiesPanel, property-utils, EntityRenderer, EditorBridge, and
  InteractionController, plus the repository's existing React ref rules.
- **Cause**: The dirty checkout already contains broad lint debt in those
  active surfaces; the new POI panel initially also used the same unnecessary
  generic `services.get<any>` pattern.
- **Fix**: Remove the new POI panel's unnecessary explicit `any`; classify the
  remaining diagnostics as inherited and rerun lint on the new file plus the
  changed POI seams.
- **Prevention**: Keep new POI code typed against the registered dispatcher and
  do not widen this gate into an unrelated lint refactor.
- **Related tasks**: Phase 3 T5

## 2026-09-12: Unified POI Phase 3A T5 repository typecheck baseline
- **Error**: `tsc --noEmit --pretty false` exited at
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)`
  with `TS1005: '}' expected`.
- **Cause**: The known malformed runtime test is outside the Phase 3A files
  and remains in the dirty checkout.
- **Fix**: Preserved the unrelated runtime fixture and used the focused
  Vitest plus scoped lint results for the 3A implementation gate.
- **Prevention**: Repair repository-wide parse debt separately before using
  root typecheck as a clean release gate.
- **Related tasks**: Phase 3 T5

## 2026-09-12: Unified POI Phase 3A T5 final Vitest startup boundary
- **Error**: The final default invocation of the 3A regression matrix again
  failed while loading `vitest.config.ts` with Windows `spawn EPERM`.
- **Cause**: The managed sandbox blocks Vite's external-dependency resolver
  subprocess during config startup.
- **Fix**: Reran the identical matrix through the approved elevated runner;
  it collected all 16 files and passed all 130 tests.
- **Prevention**: Treat default-run startup failures as environment evidence
  and preserve the elevated sequential command as the reproducible gate path.
- **Related tasks**: Phase 3 T5

## 2026-09-12: Unified POI Phase 3A T5 editor package typecheck baseline
- **Error**: `tsc -p packages/editor/tsconfig.json --noEmit` still reports
  cross-package/rootDir errors, legacy GeoJSON union diagnostics, missing
  existing exports, and incomplete legacy fixtures after the POI-specific
  diagnostics were removed.
- **Cause**: The dirty checkout compiles the editor package with unrelated
  compiler/runtime/source trees and contains pre-existing type drift.
- **Fix**: Fixed the two new POI diagnostics (missing `pois: []` on the
  missing-floor selector result and optional dispatcher access), then
  classified the remaining output as the existing package baseline.
- **Prevention**: Keep the changed-surface diagnostic filter in the 3A gate
  and address repository-wide type debt only under an explicitly scoped task.
- **Related tasks**: Phase 3 T5

## 2026-09-12: Unified POI Phase 3A T5 final Graphify refresh boundary
- **Error**: Required final `graphify update .` returned `Nothing to update
  or rebuild failed` and `[WinError 5] Access is denied` during code
  re-extraction.
- **Cause**: The managed Graphify cache/output permission boundary remains
  outside the writable application checkout.
- **Fix**: Left generated Graphify output untouched and recorded the green
  focused tests plus the successful pre-edit graph query as the source
  evidence for this gate.
- **Prevention**: Retry the refresh only after the external permission
  boundary changes; never manually rewrite generated graph output.
- **Related tasks**: Phase 3 T5

## 2026-09-12: Unified POI Phase 3A T5 verification path context
- **Error**: The first final report/constraint check used the workspace root
  while addressing files under the nested `navi-next` application, so the
  check reported the application report and production paths as missing.
- **Cause**: The repository contains root workflow documents and a nested app
  checkout with separate relative paths.
- **Fix**: Reran the checks from `navi-next` for application files and from
  the workspace root for workflow files; this was a verification-command
  path error, not a product failure.
- **Prevention**: Keep the root-vs-`navi-next` working-directory boundary
  explicit in final evidence commands.
- **Related tasks**: Phase 3 T5

## 2026-09-12: Unified POI Phase 3A T5 post-fix Graphify refresh boundary
- **Error**: The required Graphify refresh after the final type-safety fixes
  again returned `Nothing to update or rebuild failed` with
  `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify re-extraction permission boundary is still
  unchanged.
- **Fix**: Preserved generated output and retained the fresh green Phase 2
  and 3A test evidence; no generated graph file was manually edited.
- **Prevention**: Keep Graphify refresh as an external-environment check and
  rerun it only after its cache/output permissions are repaired.
- **Related tasks**: Phase 3 T5

## 2026-09-12: Unified POI Phase 3A T5 final evidence assertion check
- **Error**: The first final documentation assertion check failed because its
  deferred-3B regex was stricter than the plan wording, and the report
  whitespace check correctly found two intentional Markdown line-break spaces.
- **Cause**: The verification command encoded an exact phrase that was split
  across lines and the report used trailing spaces for Markdown formatting.
- **Fix**: Removed the unnecessary report line-break spaces and replaced the
  brittle assertion with a direct `No 3B files or fields` check.
- **Prevention**: Validate report structure with stable phrases rather than
  line-sensitive composite regexes.
- **Related tasks**: Phase 3 T5

## 2026-09-12: Unified POI Phase 3B B2 RED test runner boundary
- **Error**: The default Phase 3B RED Vitest invocation failed while loading
  `vitest.config.ts` with Windows `spawn EPERM`.
- **Cause**: The managed sandbox blocks the Vite external-dependency resolver
  subprocess during test startup.
- **Fix**: Reran the identical two-file RED command through the approved
  elevated runner. The tests collected and failed on the expected missing
  geometry helpers, legacy-only command handling, and geometry-dropping reader.
- **Prevention**: Use the default runner first for evidence, then preserve the
  elevated sequential Vitest command as the Phase 3B reproducible path when
  the known startup boundary recurs.
- **Related tasks**: Phase 3B B2

## 2026-09-12: Unified POI Phase 3B B5 lint baseline
- **Error**: ESLint over the changed implementation seams exited non-zero
  with 63 errors and 6 warnings, primarily explicit-`any` and unused-symbol
  diagnostics in existing dirty editor code.
- **Cause**: The Phase 3B changes extend files that already carry the
  repository's documented editor lint debt; the new validation module and new
  contract tests lint cleanly.
- **Fix**: Kept the feature-scoped implementation and verified the new core
  module/tests separately with ESLint exit 0; classified the inherited seam
  diagnostics instead of widening the task into an unrelated cleanup.
- **Prevention**: Preserve focused lint for new files and compare changed
  line ranges before attributing existing diagnostics to the POI contract.
- **Related tasks**: Phase 3B B5

## 2026-09-12: Unified POI Phase 3B B5 typecheck baseline
- **Error**: Root TypeScript checking stops at the known unrelated
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)`
  `TS1005`; the editor package check retains broad cross-package/rootDir and
  legacy model/fixture diagnostics.
- **Cause**: The checkout's repository-wide type program is already malformed
  and the editor package imports source trees outside its configured root.
- **Fix**: Filtered the editor output by the Phase 3B files after the final
  cleanup; no new diagnostics remained in the geometry helper, POI command
  changes, reader branch, or new contract test. Existing unrelated diagnostics
  were preserved and classified.
- **Prevention**: Use the focused Vitest contract/protected matrices as the
  functional gate until the repository type baselines are repaired separately.
- **Related tasks**: Phase 3B B5

## 2026-09-12: Unified POI Phase 3B B5 final Graphify refresh boundary
- **Error**: Required `graphify update .` after the final Phase 3B
  production edits again returned `Nothing to update or rebuild failed` with
  `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify cache/output permission boundary remains
  outside the writable application checkout.
- **Fix**: Left generated Graphify output untouched; final focused, protected,
  and adjacent regression matrices remain the source evidence for the gate.
- **Prevention**: Retry Graphify only after its external permission boundary
  changes; never manually rewrite generated graph output.
- **Related tasks**: Phase 3B B5

## 2026-09-12: Unified POI Phase 3B B5 report whitespace check
- **Error**: The first trailing-whitespace scan found two intentional Markdown
  line-break spaces in the new gate report.
- **Cause**: The report header initially used Markdown hard-break syntax.
- **Fix**: Removed the trailing spaces; the rerun found no trailing whitespace
  in the report or new Phase 3B source/test files.
- **Prevention**: Keep gate reports plain-line formatted and run the separate
  untracked-file whitespace scan because `git diff --check` omits untracked
  files.
- **Related tasks**: Phase 3B B5

## 2026-09-12: Unified POI Phase 3C C2 RED Vitest startup boundary
- **Error**: The default Phase 3C RED Vitest invocation failed while loading
  `vitest.config.ts` with Windows `spawn EPERM`; no test body was collected.
- **Cause**: The managed sandbox blocks the Vite external-dependency resolver
  subprocess during test startup, matching the established Phase 2/3A/3B
  boundary.
- **Fix**: Reran the identical focused command through the approved elevated
  sequential runner. It collected eight files and reached the intended RED
  assertions.
- **Prevention**: Run the default command once for evidence, then preserve the
  identical elevated command as the reproducible Phase 3C test path when the
  startup boundary recurs.
- **Related tasks**: Phase 3C C2

## 2026-09-12: Unified POI Phase 3C C3 focused collection boundary
- **Error**: The helper-only Vitest invocation reached the four passing helper
  tests but also collected the new `POIGeometryAuthoring.test.tsx` suite, which
  still failed module resolution because the C4 component had not been added.
- **Cause**: The repository Vitest include configuration discovers matching
  source tests beyond the single CLI path in this managed runner.
- **Fix**: Counted the pure helper evidence separately as 4/4 passing and kept
  the missing component suite as the expected next-task RED condition; no test
  was weakened and no unrelated file was changed.
- **Prevention**: Use the complete focused batch after the C4 component exists,
  and report per-file results when the repository include configuration adds a
  neighboring test to a narrow command.
- **Related tasks**: Phase 3C C3-C4

## 2026-09-12: Unified POI Phase 3C C4 Vitest startup boundary
- **Error**: The default C4 authoring/tool integration matrix failed while
  loading `vitest.config.ts` with Windows `spawn EPERM` before collecting tests.
- **Cause**: The managed sandbox blocks Vite's external-dependency resolver
  subprocess during config startup, matching the prior phase gates.
- **Fix**: Preserve the identical command and rerun it through the approved
  elevated sequential runner for test-body evidence.
- **Prevention**: Run the default command first for environment evidence, then
  use the approved elevated path when this known startup boundary recurs.
- **Related tasks**: Phase 3C C4

## 2026-09-12: Unified POI Phase 3C C5 Vitest startup boundary
- **Error**: The default C5 rendering/Inspector matrix failed while loading
  `vitest.config.ts` with Windows `spawn EPERM` before collecting tests.
- **Cause**: The managed sandbox blocks Vite's external-dependency resolver
  subprocess during config startup.
- **Fix**: Reran the identical focused matrix through the approved elevated
  sequential runner to obtain functional test evidence.
- **Prevention**: Preserve the default-first then elevated fallback for this
  known Windows test-runner boundary.
- **Related tasks**: Phase 3C C5

## 2026-09-12: Unified POI Phase 3C C6 Vitest startup boundary
- **Error**: The default complete 3C matrix failed while loading
  `vitest.config.ts` with Windows `spawn EPERM` before collecting tests.
- **Cause**: The managed sandbox blocks Vite's external-dependency resolver
  subprocess during config startup.
- **Fix**: Preserve the exact complete matrix and rerun it through the approved
  elevated sequential runner.
- **Prevention**: Keep the default-first/elevated-fallback test procedure for
  the known runner boundary.
- **Related tasks**: Phase 3C C6

## 2026-09-12: Unified POI Phase 3C C6 final-repeat runner boundary
- **Error**: The fresh default rerun after the authoring lint cleanup again
  stopped at Vitest config load with Windows `spawn EPERM`.
- **Cause**: The same managed Vite subprocess restriction remained active.
- **Fix**: The exact fresh matrix was rerun through the approved elevated
  runner for final functional evidence.
- **Prevention**: Keep the default attempt as environment evidence and use the
  approved fallback for final repeat runs under this boundary.
- **Related tasks**: Phase 3C C6

## 2026-09-12: Unified POI Phase 3C C6 root typecheck baseline
- **Error**: `tsc --noEmit --pretty false` stopped at
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)`
  with `TS1005: '}' expected`.
- **Cause**: The dirty checkout contains the known malformed unrelated runtime
  fixture outside the Phase 3C surface.
- **Fix**: Preserved that fixture and used the complete focused Vitest and
  changed-surface checks for the feature gate.
- **Prevention**: Repair repository-wide parse debt separately before using the
  root typecheck as a clean release gate.
- **Related tasks**: Phase 3C C6

## 2026-09-12: Unified POI Phase 3C C6 final Graphify refresh boundary
- **Error**: Required `graphify update .` returned `Nothing to update or
  rebuild failed` and `[WinError 5] Access is denied` after the final 3C
  production edits.
- **Cause**: The managed Graphify cache/output permission boundary remains
  outside the writable application checkout.
- **Fix**: Left generated graph output untouched and retained the successful
  pre-edit graph query plus fresh focused/protected test evidence.
- **Prevention**: Retry only after the external Graphify permission boundary is
  repaired; never manually rewrite generated graph output.
- **Related tasks**: Phase 3C C6

## 2026-09-12: Unified POI Phase 3C C6 post-fixture-repeat runner boundary
- **Error**: The final default 3C rerun after correcting the topology fixture
  again stopped at Vitest config load with Windows `spawn EPERM`.
- **Cause**: The same managed Vite subprocess restriction remained active.
- **Fix**: Reran the exact final matrix through the approved elevated runner.
- **Prevention**: Keep this known startup limitation separate from test-body
  results and preserve the elevated command as the reproducible path.
- **Related tasks**: Phase 3C C6

## 2026-09-12: Unified POI Phase 3C C6 topology fixture type correction
- **Error**: The editor-package changed-surface typecheck identified that the
  new topology-neutrality fixture omitted required `Floor.metadata`.
- **Cause**: The fixture intentionally focused on routing fields and did not
  initially include the full Floor shape required by the core type.
- **Fix**: Added the required empty metadata object; the filtered rerun then
  reported no diagnostics in the new topology test or Phase 3C implementation
  seams.
- **Prevention**: Build new CampusDocument fixtures from the complete core
  Floor contract before running package typecheck.
- **Related tasks**: Phase 3C C6

## 2026-09-12: Unified POI Phase 3C C6 changed-seam lint baseline
- **Error**: Final lint over the changed editor/Studio seams exited non-zero
  with 12 errors and 11 warnings, all in inherited renderer/controller/Studio
  patterns; the new helper, authoring component, preview constants, topology
  test, and core validation files exited 0 separately.
- **Cause**: The dirty checkout already contains explicit-`any`, unused-symbol,
  and React ref-in-render diagnostics in those shared seams.
- **Fix**: Kept the narrow feature implementation and separated clean new-file
  lint evidence from the inherited seam baseline; no lint suppression was
  added.
- **Prevention**: Repair shared editor/controller lint debt in a dedicated
  cleanup task rather than broadening the POI geometry slice.
- **Related tasks**: Phase 3C C6

## 2026-09-12: Unified POI Phase 3C C6 dirty-worktree hygiene baseline
- **Error**: Repository-level `git diff --check` surfaced pre-existing
  trailing whitespace and blank-line findings in unrelated dirty files at both
  the root and nested app checkout.
- **Cause**: The shared worktree contains earlier edits outside the Phase 3C
  surface; the check also emits normal LF/CRLF conversion notices.
- **Fix**: Did not alter unrelated files. The Phase 3C appended sections and
  all new Phase 3C files were scanned separately and contain no trailing
  whitespace.
- **Prevention**: Keep repository-wide hygiene cleanup separate and use the
  scoped new-file scan for this feature gate.
- **Related tasks**: Phase 3C C6

## 2026-09-12: Wall enclosure audit PowerShell wildcard probe
- **Error**: A targeted `rg` probe passed `src/components/floor-editor/*.tsx` as a literal path and PowerShell reported an invalid filename-pattern error.
- **Cause**: Windows PowerShell did not expand the Unix-style wildcard in the explicit ripgrep path argument.
- **Fix**: Reran the inspection against the exact `FloorEditorCanvas.tsx` and `useFloorDrawing.ts` paths; no repository state was changed.
- **Prevention**: Resolve exact filenames with `rg --files` and pass explicit paths for Windows source probes.
- **Related tasks**: T1 root-cause investigation

## 2026-09-12: Wall enclosure topology RED reproduction
- **Error**: The new focused topology test failed: a square plus a dangling
  partition produced 3 regions/rooms instead of 1, and the partitioned octagon
  produced 7 rooms instead of 6.
- **Cause**: `traceFace` accepted open walks, `createRoomEntities` closed any
  open walk by appending its first point, and `findEnclosedRegions` retained the
  unbounded exterior winding.
- **Fix**: None at RED; production geometry code was unchanged. The failure is
  the characterization required before the minimal implementation change.
- **Prevention**: Accept only closed, simple, bounded half-edge cycles and keep
  the RED fixtures in the focused regression suite.
- **Related tasks**: T1, T2

## 2026-09-12: Wall enclosure Graphify refresh boundary
- **Error**: Required `graphify update .` after the wall topology source edit
  returned `Nothing to update or rebuild failed` with `[WinError 5] Access is
  denied`.
- **Cause**: The managed Graphify cache/output permission boundary remains
  outside the writable application checkout.
- **Fix**: Left generated Graphify output untouched; source and focused test
  gates provide the implementation evidence.
- **Prevention**: Retry the Graphify refresh only after its external permission
  boundary changes; never manually rewrite generated graph output.
- **Related tasks**: T2, T4

## 2026-09-12: Wall enclosure hygiene probe path
- **Error**: The first changed-file trailing-whitespace probe used application
  paths from the workspace root instead of the nested `navi-next` checkout and
  reported missing paths.
- **Cause**: The repository has a root documentation checkout and a nested app
  checkout with separate source roots.
- **Fix**: Reran the probe with the exact `navi-next/...` paths; no trailing
  whitespace was found in the changed source, test, or workflow artifacts.
- **Prevention**: Anchor application-file probes to `navi-next` after resolving
  the two-checkout layout.
- **Related tasks**: T4

## 2026-09-12: Wall enclosure focused typecheck baseline
- **Error**: Filtering the editor typecheck output for the changed geometry
  module still surfaced two existing tests importing `WallSegment` as though
  `room-derivation.ts` re-exported it.
- **Cause**: The nested editor program has pre-existing test contracts and
  broad cross-package/rootDir diagnostics; the current geometry module imports
  that type locally rather than exporting it.
- **Fix**: Left the unrelated type-export contract unchanged; focused Vitest
  compilation and execution passed for the changed source and tests.
- **Prevention**: Keep repository type debt separate from this topology fix and
  repair the import/export contract in its owning task if needed.
- **Related tasks**: T2, T4

## 2026-09-12: Wall enclosure final Graphify retry
- **Error**: The required post-review `graphify update .` retry again returned
  `[WinError 5] Access is denied`.
- **Cause**: The same managed Graphify permission boundary is still outside
  the writable checkout.
- **Fix**: Left generated graph output unchanged; the final focused rerun
  remains the verification authority.
- **Prevention**: Keep Graphify retries gated on external permission repair.
- **Related tasks**: T4

## 2026-09-12: Unified POI Phase 3D D2 focused RED runner boundary
- **Error**: The focused Phase 3D RED suite stopped while loading Vitest config
  with Windows `spawn EPERM`, before test collection.
- **Cause**: The managed sandbox blocks the Vite subprocess spawned by the
  project's Vitest configuration.
- **Fix**: None in production or tests; rerun the identical focused command
  through the approved elevated Windows runner to obtain assertion-level RED
  evidence.
- **Prevention**: Keep default-runner startup failure separate from test-body
  results and preserve the exact elevated command for reproducible gates.
- **Related tasks**: D2

## 2026-09-12: Unified POI Phase 3D D3 Graphify refresh boundary
- **Error**: Required `graphify update .` after the D3 core/command/reader
  changes returned `Nothing to update or rebuild failed` with
  `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify cache/output permission boundary remains
  outside the writable application checkout.
- **Fix**: Left generated Graphify output untouched; the fresh D3 focused
  matrix remains the source/test verification authority.
- **Prevention**: Retry only after the external Graphify permission boundary
  is repaired; never manually rewrite generated graph output.
- **Related tasks**: D3

## 2026-09-12: Unified POI Phase 3D D4 Graphify refresh boundary
- **Error**: Required `graphify update .` after the D4 rendering/controller
  changes returned `Nothing to update or rebuild failed` with
  `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify cache/output permission boundary remains
  outside the writable application checkout.
- **Fix**: Left generated Graphify output untouched; the fresh D4 focused
  matrix remains the source/test verification authority.
- **Prevention**: Retry only after the external Graphify permission boundary
  is repaired; never manually rewrite generated graph output.
- **Related tasks**: D4

## 2026-09-12: Unified POI Phase 3D D5 Graphify refresh boundary
- **Error**: Required `graphify update .` after the D5 Inspector changes
  returned `Nothing to update or rebuild failed` with `[WinError 5] Access is
  denied`.
- **Cause**: The managed Graphify cache/output permission boundary remains
  outside the writable application checkout.
- **Fix**: Left generated Graphify output untouched; the fresh D5 focused
  matrix remains the source/test verification authority.
- **Prevention**: Retry only after the external Graphify permission boundary
  is repaired; never manually rewrite generated graph output.
- **Related tasks**: D5

## 2026-09-12: Unified POI Phase 3D D6 focused runner boundary
- **Error**: The default complete Phase 3D focused Vitest command stopped while
  loading `vitest.config.ts` with Windows `spawn EPERM`, before collection.
- **Cause**: The managed sandbox blocks the Vite subprocess used by the test
  configuration, matching the established phase-gate boundary.
- **Fix**: Preserve the exact command and rerun it through the approved
  elevated runner for functional evidence.
- **Prevention**: Keep default startup conditions separate from assertion
  results and use the identical elevated fallback for every final matrix.
- **Related tasks**: D6

## 2026-09-12: Unified POI Phase 3D D6 whitespace probe path
- **Error**: The first untracked-file trailing-whitespace probe ran from the
  root checkout while passing nested `navi-next` application paths and reported
  those files as missing.
- **Cause**: The workspace has separate root workflow and nested application
  checkouts.
- **Fix**: Reran the probe from the nested application root with exact paths;
  no source/test trailing whitespace was found.
- **Prevention**: Anchor application-file hygiene probes to `navi-next` after
  resolving the two-checkout layout.
- **Related tasks**: D6

## 2026-09-12: Unified POI Phase 3D D6 browser inspection timeout
- **Error**: A read-only attempt to inspect the available Studio browser tab
  timed out and reset the computer-use kernel before page content was exposed.
- **Cause**: The available tab is an existing authored/remote fixture rather
  than a confirmed disposable Phase 3D test fixture.
- **Fix**: Stopped without clicking, saving, authoring, or retrying against the
  potentially mutable fixture; retained the exact `BROWSER VALIDATION PENDING`
  classification.
- **Prevention**: Provision a disposable local floor-plan fixture before any
  manual POI appearance or save/reload scenario.
- **Related tasks**: D6, D7

## 2026-09-12: Unified POI Phase 3D D6 final Graphify refresh boundary
- **Error**: The final required `graphify update .` retry returned `Nothing to
  update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify cache/output permission boundary remains
  outside the writable application checkout.
- **Fix**: Left generated graph output untouched; all fresh test and hygiene
  evidence remains available for the gate report.
- **Prevention**: Keep Graphify refresh gated on external permission repair and
  never manually rewrite generated graph output.
- **Related tasks**: D6, D7

## 2026-09-12: Unified POI Phase 3D D8 repository-wide diff baseline
- **Error**: The repository-wide `git diff --check` command returned existing
  trailing-whitespace/new-blank-line findings in unrelated legacy and shared
  files.
- **Cause**: The dirty workspace contains pre-existing formatting debt outside
  the Phase 3D report and final gate documentation.
- **Fix**: Did not rewrite unrelated user work; ran the scoped final-document
  check and retained the report's zero-trailing-whitespace result.
- **Prevention**: Keep final gate hygiene checks scoped to touched files and
  distinguish inherited workspace findings from new Phase 3 changes.
- **Related tasks**: D8

## 2026-09-12: Unified POI Phase 4A T2 compiler projection RED
- **Error**: The new compiler projection suite reached two intentional RED
  failures: explicit POI geometry still entered the legacy floor-geometry
  `p.position` path, and graph-derived runtime POIs lacked the new provenance
  and geometry fields.
- **Cause**: Phase 4A production projection has not been implemented yet; the
  current artifact emitter only builds graph-derived legacy POI records and
  assumes every authored floor POI is position-only.
- **Fix**: No production fix was applied at the RED checkpoint. The failures
  are retained as the implementation contract for 4A-T4.
- **Prevention**: Keep the focused suite ahead of implementation, preserve the
  explicit-shape and graph-derived compatibility assertions, and do not infer
  a runner failure when Vitest has collected and executed the tests.
- **Related tasks**: 4A-T2, 4A-T4

## 2026-09-12: Unified POI Phase 4A T3 publisher path mismatch
- **Error**: The first publisher RED command ran from the nested app root with
  a root-level test path and returned `No test files found`.
- **Cause**: The root Vitest include list does not include publisher package
  tests, while the publisher workspace has its own package-local config and
  paths.
- **Fix**: Reran the intended test from
  `navi-next/packages/publisher` with the package-relative path; it collected
  the new test and reached the expected missing serialization fields.
- **Prevention**: Run package-local Vitest configurations from their owning
  package roots and use paths relative to those configs.
- **Related tasks**: 4A-T3

## 2026-09-12: Unified POI Phase 4A T3 runtime/publisher compatibility RED
- **Error**: New compatibility tests failed because runtime conversion and
  package building still omit authored provenance, floor identity, geometry,
  and appearance; the runtime reference matrix otherwise passed.
- **Cause**: The existing package/runtime contract only maps graph-derived
  position plus required `nodeId`.
- **Fix**: No production fix was applied at the RED checkpoint. The focused
  failures define the 4A-T5 implementation contract.
- **Prevention**: Add authored no-node cases beside legacy node-reference
  cases and map every additive field explicitly in both directions.
- **Related tasks**: 4A-T3, 4A-T5

## 2026-09-12: Unified POI Phase 4A T4 adjacent V2 baseline reproduction
- **Error**: The adjacent `compile-v2-integration.test.ts` selection reported
  four `result.success === false` assertions after the T4 implementation.
- **Cause**: Temporary result-boundary diagnostics showed the same existing
  `HALLWAY_DISCONNECTED` diagnostics (three disconnected hallway components)
  that cause this fixture to return `success: false`; the POI artifact stage
  was not the source of the failure.
- **Fix**: Removed the temporary diagnostic, preserved the fixture, and used
  the focused projection plus existing `build-artifacts` suite as T4 evidence.
- **Prevention**: Keep the known V2 connectivity baseline in protected runs and
  inspect collected compiler errors before attributing an adjacent regression
  to an artifact-only change.
- **Related tasks**: 4A-T4, prior Phase 3 protected isolation baseline

## 2026-09-12: Unified POI Phase 4A T6 package typecheck baseline
- **Error**: The compiler, core, runtime, and publisher package-wide TypeScript checks returned non-zero results.
- **Cause**: The dirty repository already contains unrelated baseline diagnostics: malformed runtime test syntax, core export/type conflicts, editor JSX/DOM/tool typings, and publisher legacy type/export mismatches. The changed POI projection and additive runtime fields produced no reported package-specific diagnostic in these runs.
- **Fix**: Kept the package-wide results classified as baseline evidence; relied on the focused compiler/runtime/publisher Vitest suites and protected Phase 2/3 matrices for behavioral verification.
- **Prevention**: Re-run the same package typechecks after baseline repairs and keep package-wide typecheck status separate from the scoped 4A assertion gate.
- **Related tasks**: 4A-T6

## 2026-09-12: Unified POI Phase 4A T6 scoped lint baseline
- **Error**: Scoped ESLint returned nine `no-explicit-any` errors and one unused-import warning in the pre-existing publisher `package-builder.ts`; the new compiler projection, runtime contract, and test files were clean.
- **Cause**: The publisher builder already carries legacy dynamic artifact mappings and an unused type import unrelated to the additive POI contract.
- **Fix**: Did not broaden 4A into unrelated publisher lint cleanup; retained the focused test evidence and recorded the baseline boundary.
- **Prevention**: Re-run the same scoped lint command after the legacy publisher builder is repaired; keep unrelated lint debt out of the POI change set.
- **Related tasks**: 4A-T6

## 2026-09-12: Unified POI Phase 4A T6 Graphify refresh boundary
- **Error**: The mandatory `graphify update .` command returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify cache/output permission boundary remains outside the writable application checkout.
- **Fix**: Left generated Graphify output untouched; the fresh codebase queries and focused/protected tests remain the evidence source for this gate.
- **Prevention**: Retry after the external Graphify permission boundary is repaired and never manually rewrite generated graph files.
- **Related tasks**: 4A-T6, 4A-T7

## 2026-09-12: Unified POI Phase 4A T6 package-local runner path
- **Error**: A final rerun invoked `.\node_modules\.bin\vitest.cmd` from the runtime and publisher package roots, where that executable is not installed; both commands failed before collection.
- **Cause**: The package-local workspaces expose Vitest through their `npm test` scripts rather than a package-local `node_modules/.bin` path.
- **Fix**: Kept the compiler result, which ran from the app root, and reran runtime/publisher using their owning package `npm test` scripts.
- **Prevention**: Use the package script for runtime/publisher focused suites and reserve the direct executable path for the app-root runner.
- **Related tasks**: 4A-T6

## 2026-09-12: Unified POI Phase 4A T7 report hygiene probe
- **Error**: The first exact-file report whitespace probe found three trailing spaces in the report metadata header.
- **Cause**: Markdown hard-break markers were left at the ends of the date, scope, and source lines.
- **Fix**: Remove the hard-break markers and rerun the report-contract and whitespace probes before closing T7.
- **Prevention**: Run the exact-file trailing-whitespace scan after creating the gate report, including Markdown metadata lines.
- **Related tasks**: 4A-T7

## 2026-09-12: Unified POI Phase 4B T1 verification path probe
- **Error**: The first planning-artifact verification used `..\spec` and `..\plan` while the command was already running from the repository root, so those two `rg` probes returned path-not-found errors.
- **Cause**: The verification command mixed the nested-app working-directory convention with the root workflow-document working directory.
- **Fix**: Recorded the mistake and reran the checks with root-relative paths; no source or planning artifact was affected.
- **Prevention**: Keep root workflow checks rooted at `C:\Users\Administrator\Desktop\CODEme\Navi` and app checks rooted at `navi-next`; print the resolved working directory when probes span both.
- **Related tasks**: 4B-T1

## 2026-09-12: Unified POI Phase 4B T2 compiler search RED
- **Error**: The focused compiler search matrix collected 3 files / 60 tests and reached 1 intentional failure: the five authored `Floor.pois` IDs were absent from `SearchIndex`; the existing 59 tests passed.
- **Cause**: Phase 4A intentionally deferred authored POI search projection, so `buildSearchIndex` still emits only document-derived and graph-derived records.
- **Fix**: No production fix was applied at the RED checkpoint. The failure is retained as the 4B-T5 implementation contract.
- **Prevention**: Keep the new authored search assertions ahead of implementation, preserve graph/document/spatial snapshots, and do not infer a runner failure when Vitest collects and executes the suite.
- **Related tasks**: 4B-T2, 4B-T5

## 2026-09-12: Unified POI Phase 4B T3 runtime/publisher search RED
- **Error**: The package-local RED matrix reached the intended missing search seams: runtime collected 3 files / 34 tests with 3 failures and 31 passes; publisher collected 1 file / 2 tests with 1 failure and 1 pass.
- **Cause**: Runtime tokenization does not normalize category separators, `toSearchEntry` drops authored category/provenance/floor context, `SearchService` does not expose discovery position/context, and publisher search serialization maps only the legacy fields.
- **Fix**: No production fix was applied at the RED checkpoint. Existing runtime reference validation and legacy search behavior remained green.
- **Prevention**: Keep authored no-node fixtures beside graph-backed fixtures, map fields explicitly in both publisher/runtime directions, and run runtime/publisher tests from their owning package roots.
- **Related tasks**: 4B-T3, 4B-T6

## 2026-09-12: Unified POI Phase 4B T4 public discovery RED
- **Error**: The focused public matrix collected 3 files / 50 tests and reached 3 intentional failures with 47 passes: public normalization changed authored `poi` to `room` and dropped additive fields, Explore omitted the POI category, and the POI result label rendered as `Entrances`.
- **Cause**: The public `SearchEntry` normalizer only distinguishes `building` versus `room`; Explore category order and label formatting predate authored POI discovery. The authored result itself was already visible by name and did not route.
- **Fix**: No production fix was applied at the RED checkpoint. Existing public store, Explore, routing, and BuildingSheet tests remained otherwise green.
- **Prevention**: Preserve the complete published entry type/context, add `poi` only to discovery category handling, and keep the no-node result on the existing Explore building handoff rather than navigation.
- **Related tasks**: 4B-T4, 4B-T6, 4B-T7

## 2026-09-12: Unified POI Phase 4B T5 metadata-token mismatch
- **Error**: The first compiler implementation run passed 2 files / 59 tests but failed the authored search assertion because metadata values were tokenized while safe metadata keys such as `source` and `rank` were omitted.
- **Cause**: The initial projection treated “safe metadata” as scalar values only, while the approved RED contract requires field discovery without exposing the arbitrary metadata object.
- **Fix**: In the same T5 task, change the token allowlist to include each scalar metadata key and its scalar value; preserve the structured metadata only in the runtime POI projection.
- **Prevention**: Keep compiler tests explicit about both safe field names and values, and rerun the focused compiler matrix before moving to package/runtime mapping.
- **Related tasks**: 4B-T5

## 2026-09-12: Unified POI Phase 4B T5 Graphify refresh boundary
- **Error**: The required `graphify update .` after the compiler/core search projection returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify cache/output permission boundary remains outside the writable checkout.
- **Fix**: Left generated graph output untouched; the focused compiler matrix and immutable topology/source assertions remain the T5 verification authority.
- **Prevention**: Retry Graphify only after the external permission boundary is repaired and never hand-edit generated graph files.
- **Related tasks**: 4B-T5

## 2026-09-12: Unified POI Phase 4B T6 public UI boundary
- **Error**: After the package/runtime/public contract implementation, the focused public matrix still had 2 Explore failures: authored POIs were not offered as a category and their row label fell through to `Entrances`.
- **Cause**: The existing Explore category order and formatter only covered building, room, facility, and entrance; the public-store normalization and search tests were already green.
- **Fix**: Defer the two UI-only seams to 4B-T7; no routing or destination resolver was changed.
- **Prevention**: Keep compiler/package/runtime/public normalization evidence separate from the discovery UI gate and explicitly test no-node Explore handoff before closing 4B.
- **Related tasks**: 4B-T6, 4B-T7

## 2026-09-12: Unified POI Phase 4B T7 node-assumption probe
- **Error**: A preliminary ripgrep command for optional `nodeId` consumers used an unbalanced regular expression and returned a regex parse error.
- **Cause**: The probe combined a literal property pattern and a word-boundary expression without closing the non-capturing group.
- **Fix**: No repository content changed; rerun the audit with separate literal searches before applying UI guards.
- **Prevention**: Prefer separate `rg -n` patterns for property and word searches when auditing optional-field consumers.
- **Related tasks**: 4B-T7

## 2026-09-12: Unified POI Phase 4B T7 Graphify refresh boundary
- **Error**: The required `graphify update .` after the public discovery UI guards returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The same managed Graphify cache/output permission boundary remains outside the writable checkout.
- **Fix**: Left generated graph output untouched; the focused public matrix and scoped UI diff check remain the T7 verification authority.
- **Prevention**: Retry only after the external Graphify permission boundary is repaired and never modify generated graph files manually.
- **Related tasks**: 4B-T7

## 2026-09-12: Unified POI Phase 4B T8 ledger preflight path probe
- **Error**: The first T8 preflight ran from `navi-next` while addressing root workflow files as `errors\\ERRORS.md` and `plan\\PLAN.md`, so the ledger/TODO probes returned no matches.
- **Cause**: The command used the app working directory for both nested application and repository-root workflow paths.
- **Fix**: No repository content changed; rerun root workflow probes from `C:\Users\Administrator\Desktop\CODEme\Navi` with root-relative paths.
- **Prevention**: Keep root ledger/plan/spec/progress probes rooted at the repository root and app source/test probes rooted at `navi-next`.
- **Related tasks**: 4B-T8

## 2026-09-12: Unified POI Phase 4B T8 ESLint path quoting probe
- **Error**: The first scoped Phase 4B ESLint command was parsed by PowerShell before ESLint started because `src/app/(public)/...` paths were unquoted.
- **Cause**: Parentheses in Windows route-segment paths were interpreted as PowerShell syntax rather than literal file paths.
- **Fix**: No repository content changed; rerun the identical lint scope with every parenthesized path quoted.
- **Prevention**: Quote all Windows source paths containing parentheses in lint, typecheck, and verification commands.
- **Related tasks**: 4B-T8

## 2026-09-12: Unified POI Phase 4B T8 scoped lint baseline
- **Error**: The corrected Phase 4B production-scope ESLint run exited non-zero with 13 errors and 2 warnings.
- **Cause**: The selected dirty-checkout files retain inherited publisher `no-explicit-any`/unused-import diagnostics, existing public type/demo `any` diagnostics, and the pre-existing `Couldn't` JSX text diagnostic; no new 4B-specific lint pattern was identified.
- **Fix**: Preserved the unrelated baseline and used the focused Vitest matrices plus scoped diff hygiene as the behavioral gate; no lint suppression or unrelated cleanup was added.
- **Prevention**: Keep inherited lint debt classified separately and rerun the same scoped command after the owning cleanup tasks repair those files.
- **Related tasks**: 4B-T8

## 2026-09-12: Unified POI Phase 4B T8 design-document whitespace probe
- **Error**: The final untracked-file whitespace scan found two trailing Markdown hard-break spaces in the new Phase 4B design document.
- **Cause**: The document header retained hard-break markers that were unnecessary for the final specification format.
- **Fix**: Removed the two trailing spaces and reran the exact new-file scan.
- **Prevention**: Scan every newly created Markdown artifact for trailing whitespace before closing the gate.
- **Related tasks**: 4B-T8

## 2026-09-12: Unified POI Phase 4C T1 public-path probe
- **Error**: A bounded audit command used `src/app\\(public\\)\\map` without quoting and PowerShell parsed the parenthesized route segment as syntax.
- **Cause**: Backslashes do not quote parentheses in PowerShell; the literal path was not passed to `rg`.
- **Fix**: No repository content changed; the audit will be rerun with quoted literal paths.
- **Prevention**: Quote every Windows path containing parentheses in bounded audit and test commands.
- **Related tasks**: 4C-T1

## 2026-09-12: Unified POI Phase 4C T2 runtime destination RED
- **Error**: The runtime RED matrix collected 2 files / 11 tests and reached 10 intentional failures with 1 sentinel pass. The missing seams were the planned `RoutingEngine.findRouteToPOI` and `NavigationService.findDestinationRoute` contracts plus geometry-aware resolution results.
- **Cause**: Phase 4C destination resolution has not been implemented; Phase 4B intentionally stopped authored no-node POIs before routing.
- **Fix**: No production code was changed at the RED checkpoint. Existing runtime routing behavior remained untouched.
- **Prevention**: Keep authored node-less POIs in the RED fixtures, implement the resolver behind typed request/failure contracts, and rerun the exact package-local matrix before expanding the public handoff.
- **Related tasks**: 4C-T2, 4C-T5, 4C-T6

## 2026-09-12: Unified POI Phase 4C T3 overlay routing RED
- **Error**: The runtime overlay RED matrix collected 1 file / 5 tests and reached 5 intentional failures at the absent `RoutingEngine.findRouteToPOI` seam.
- **Cause**: Request-local virtual targets, interior-edge projection, directional split policies, proportional cost, and destination metadata have not been implemented.
- **Fix**: No production code was changed at the RED checkpoint; the existing node-to-node route path remained intact.
- **Prevention**: Implement overlay routing through a fresh graph value and original edge cost/eligibility providers, then rerun the repeated-request and graph-signature assertions before public integration.
- **Related tasks**: 4C-T3, 4C-T5, 4C-T6

## 2026-09-12: Unified POI Phase 4C T4 public handoff RED
- **Error**: The public RED matrix collected 3 files / 28 tests and reached 5 failures: 4 intentional missing POI adapter/store/selection seams and 1 existing Navigate development-simulator assertion.
- **Cause**: The authored no-node POI still follows the Phase 4B navigation guard, while the combined page run also reproduced an environment-sensitive simulator assertion unrelated to POI state.
- **Fix**: No production code was changed. The unrelated simulator result is retained as a baseline to rerun separately before the 4C public gate.
- **Prevention**: Keep POI handoff assertions separate from active-navigation tests, preserve `toNode === null`, and rerun the existing Navigate file independently after the additive preview integration.
- **Related tasks**: 4C-T4, 4C-T7

## 2026-09-12: Unified POI Phase 4C T5 outdoor-fixture context probe
- **Error**: The first pure-resolver verification selected the indoor `hall-edge` for the outdoor-scope assertion and reported the malformed-geometry code as absent.
- **Cause**: The test passed `buildingId`, `floor`, and `floorId` as extra fields on the geometry object instead of the POI overrides, and the direct resolver exposes typed failures at the top level rather than under the route wrapper's `failure` field.
- **Fix**: Moved the outdoor POI context into the override argument, asserted the resolver's top-level failure code, and reran the focused resolver suite successfully.
- **Prevention**: Keep geometry fixtures separate from POI metadata overrides and distinguish pure resolution failures from the route-result wrapper when writing assertions.
- **Related tasks**: 4C-T5

## 2026-09-12: Unified POI Phase 4C T6 loader inspection path probe
- **Error**: A bounded runtime inspection looked for `packages/runtime/src/loader.ts`, which does not exist in the nested package layout.
- **Cause**: The loader source is owned by the app/runtime package layout rather than the guessed package-local path.
- **Fix**: No repository content changed; the routing and engine files were inspected from their correct paths and the loader probe was discarded.
- **Prevention**: Resolve the package entry paths with `rg --files` or the existing graph before opening adjacent runtime infrastructure.
- **Related tasks**: 4C-T6

## 2026-09-12: Unified POI Phase 4C T6 overlay assertion alignment
- **Error**: The first integrated runtime matrix passed 13/15 tests; the cost assertion expected only the split-edge contribution and the one-way failure assertion looked for a nested `failure` object.
- **Cause**: The overlay route correctly retains the unchanged 22.2-cost origin edge, and the typed `DestinationRouteResult` exposes `code`/`message` directly like the pure resolver.
- **Fix**: Update the RED fixture to expect the full generalized cost (82.2) and assert the top-level typed failure code; no routing implementation change is needed.
- **Prevention**: Include unchanged prefix/suffix costs in route totals and keep pure-resolution and route-result failure shapes explicit in tests.
- **Related tasks**: 4C-T3, 4C-T6

## 2026-09-12: Unified POI Phase 4C T6 overlay distance arithmetic
- **Error**: After the cost and failure-shape correction, the integrated matrix retained one distance assertion expecting 50m instead of the route's 47.2m.
- **Cause**: The quarter projection is 25m of the 100m main edge, and the route prefix is 22.2m; the fixture's expected value had treated the projection as half-edge distance.
- **Fix**: Corrected the fixture to assert the full route distance of 47.2m; production distance accounting remains unchanged.
- **Prevention**: Derive expected totals from every path segment, including unchanged prefix/suffix and the exact projection ratio.
- **Related tasks**: 4C-T3, 4C-T6

## 2026-09-12: Unified POI Phase 4C T6 runtime typecheck baseline
- **Error**: `npm run typecheck` from `navi-next/packages/runtime` exited before checking the Phase 4C files at `src/__tests__/data-identity-comparison.test.ts(255,3): TS1005: '}' expected`.
- **Cause**: The dirty checkout retains the known malformed runtime identity-comparison fixture from the earlier Phase 4A baseline.
- **Fix**: No unrelated fixture repair was made; the focused runtime routing matrix remains the behavioral evidence for T6.
- **Prevention**: Repair the pre-existing fixture in its owning task, then rerun package typecheck and retain the same focused matrix for POI regressions.
- **Related tasks**: 4A-T6, 4C-T6

## 2026-09-12: Unified POI Phase 4C T6 Graphify refresh boundary
- **Error**: The required `graphify update .` returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify cache/output permission boundary remains outside the writable application checkout.
- **Fix**: Left generated Graphify output untouched; the focused runtime routing matrix and protected node-routing matrix remain the T6 evidence source.
- **Prevention**: Retry after the external Graphify permission boundary is repaired and never manually rewrite generated graph files.
- **Related tasks**: 4C-T6

## 2026-09-12: Unified POI Phase 4C T7 public fixture state leakage
- **Error**: The first public matrix after adding POI destination state failed the existing development-simulator test and rendered the previous POI ID in a later setup fixture.
- **Cause**: New `poiDestination` state was not reset in the page/store test harnesses after the authored POI selection test.
- **Fix**: Reset `poiDestination` alongside `fromNode` and `toNode` in the public fixtures; no production state behavior was changed.
- **Prevention**: Every public test harness reset must include additive destination state when extending the store contract.
- **Related tasks**: 4C-T4, 4C-T7

## 2026-09-12: Unified POI Phase 4C T7 route-boundary fixture leakage
- **Error**: The strengthened POI preview test left its mocked `findDestinationRoute` in the shared Zustand store, causing six ordinary Navigate tests to use a two-step POI route.
- **Cause**: The harness reset `findRoute` but did not yet reset the newly added destination-route function.
- **Fix**: Capture and restore the default `findDestinationRoute` in `afterEach`; no application route behavior changed.
- **Prevention**: Restore every mocked store function introduced by a destination-state test before running legacy navigation assertions.
- **Related tasks**: 4C-T7

## 2026-09-12: Unified POI Phase 4C T8 protected-runner startup boundary
- **Error**: The default protected Phase 2/3 Vitest command reproduced the Windows Vite `spawn EPERM` startup failure before test collection.
- **Cause**: The managed default runner cannot spawn the Vite config externalizer for this dirty Windows checkout.
- **Fix**: Reran the same read-only matrices through the approved elevated `npm test` runner; all protected matrices completed with the counts recorded in the Phase 4C gate report.
- **Prevention**: Classify the startup boundary before interpreting a zero-test result, then use the approved elevated fallback without changing test assertions or production code.
- **Related tasks**: 4C-T8

## 2026-09-12: Unified POI Phase 4C T8 browser inspection timeout
- **Error**: The safe read-only Computer Use `getTab` inspection of the existing NAVI Studio Chrome tab timed out after 30 seconds and reset the computer-use session.
- **Cause**: The existing remote Studio tab did not expose a responsive target through the browser automation bridge.
- **Fix**: Performed no click, typing, save, authoring, login, or external mutation; recorded browser validation as pending in the Phase 4C gate report.
- **Prevention**: Use only a disposable local floor-plan fixture or a responsive tab for future manual evidence, and stop after a read-only timeout rather than retrying with stale UI state.
- **Related tasks**: 4C-T8

## 2026-09-12: Unified POI Phase 4D T3 session RED harness import
- **Error**: The new `NavigationSession.poi.test.tsx` suite stopped before
  collection with `ReferenceError: afterEach is not defined`.
- **Cause**: The test imported `act`, `cleanup`, `render`, `screen`, and
  `waitFor` but omitted Vitest's `afterEach` global in this repository's
  explicit-import test style.
- **Fix**: Add the missing `afterEach` import in the test only; no production
  code changed.
- **Prevention**: Match the import header of adjacent session integration
  tests and ensure every lifecycle hook is explicitly imported before the RED
  run.
- **Related tasks**: 4D-T3

## 2026-09-12: Unified POI Phase 4D T3 runtime arrival RED seam
- **Error**: The new runtime arrival suite collected no tests because the
  planned `../poi-arrival` production module does not exist yet.
- **Cause**: T3 intentionally adds RED tests before the centralized Phase 4D
  arrival implementation.
- **Fix**: No production fix at the RED checkpoint; after the session harness
  import correction, rerun the focused RED commands and retain the missing
  arrival seam as the intended failure.
- **Prevention**: Keep the RED command focused on the new contract, then add
  the helper only in the GREEN task after both suites execute.
- **Related tasks**: 4D-T3

## 2026-09-12: Unified POI Phase 4D T3 session RED Vitest import
- **Error**: After fixing `afterEach`, the session suite stopped before
  collection with `ReferenceError: vi is not defined`.
- **Cause**: The repository's Vitest setup does not expose the `vi` global to
  this new test module; the test imported only `afterEach`.
- **Fix**: Add the explicit `vi` import in the test only; no production code
  changed.
- **Prevention**: Use explicit Vitest imports (`afterEach`, `vi`, and any
  assertion helpers) for every new suite, matching nearby integration tests.
- **Related tasks**: 4D-T3

## 2026-09-12: Unified POI Phase 4D T3 session RED test globals
- **Error**: The session suite then stopped before collection with
  `ReferenceError: describe is not defined`.
- **Cause**: The new file relied on implicit Vitest globals for `describe`,
  `it`, and `expect`, while this test environment requires explicit imports.
- **Fix**: Add the explicit test-function imports only; no production code
  changed.
- **Prevention**: Start new test files from an explicit-import template and
  run the focused file immediately after creating it.
- **Related tasks**: 4D-T3

## 2026-09-12: Unified POI Phase 4D T3 assertion RED
- **Error**: The focused NavigationSession POI suite collected 1 file / 5
  tests and reached 2 intended failures: the request-local approach endpoint
  was treated as arrival, and wrong building/floor context could not prevent
  arrival. The remaining 3 tests passed. The runtime geometry suite stopped at
  the intentionally absent `poi-arrival` module before test collection.
- **Cause**: Existing `NavigationSession` uses final-step/node arrival and has
  no POI geometry/context or stable destination exposure.
- **Fix**: No production fix at the RED checkpoint; retain the failing
  contract for 4D-T5 GREEN implementation.
- **Prevention**: Keep endpoint-only, context, idempotency, and progress
  assertions explicit, then rerun both owning focused suites after the pure
  helper and session seam exist.
- **Related tasks**: 4D-T3

## 2026-09-12: Unified POI Phase 4D T4 public RED
- **Error**: The focused public RED command collected 2 files / 26 tests and
  reached 3 failures: the authored POI Start/active-session handoff was still
  unavailable, the final adapter instruction still said `You have arrived`,
  and the pre-existing development-simulator assertion failed unchanged.
- **Cause**: Phase 4C intentionally hid POI Start, and the public adapter had
  not yet replaced the runtime approach-target arrival copy. The simulator
  test is the known environment-sensitive baseline.
- **Fix**: No production code changed at the RED checkpoint. Keep the
  simulator failure separately classified while implementing only the two
  4D seams.
- **Prevention**: Preserve `toNode === null`, use stable `poiId`/route
  destination identity, reuse the preview route without a second resolver
  call, and restore all public store mocks in `afterEach`.
- **Related tasks**: 4D-T4

## 2026-09-12: Unified POI Phase 4D T5 runtime test globals
- **Error**: The new runtime arrival suite stopped before collection with `ReferenceError: describe is not defined`.
- **Cause**: The runtime package Vitest configuration does not expose test globals to this file.
- **Fix**: Add explicit `describe`, `expect`, and `it` imports in the test only; no production code changed.
- **Prevention**: Use explicit Vitest imports in both app and package-level Phase4D suites.
- **Related tasks**: 4D-T5

## 2026-09-12: Unified POI Phase 4D T6 category-copy test collision
- **Error**: The public authored-POI handoff assertion found two exact `Study Area` text nodes after the category context was added.
- **Cause**: The formatted `study_area` category rendered as the same bare label as the POI title.
- **Fix**: Prefix the category presentation with `Category:`; no route/session behavior changed.
- **Prevention**: Keep POI title and category visually distinct so exact-label assertions and user scanning remain unambiguous.
- **Related tasks**: 4D-T6

## 2026-09-12: Unified POI Phase 4D T6 protected-matrix worker exhaustion
- **Error**: Concurrent Phase 2/3 protection commands exhausted the Windows Node/Vitest worker processes; several workers exited with V8 out-of-memory errors before complete counts were available.
- **Cause**: Five heavy Vitest matrices were launched simultaneously in the managed environment.
- **Fix**: No repository code changed; rerun the same matrices serially with a single worker and classify the concurrent run as invalid evidence.
- **Prevention**: Serialize large protected suites and use one worker when the managed runner has constrained memory.
- **Related tasks**: 4D-T7

## 2026-09-12: Unified POI Phase 4D T7 unsupported Vitest worker flag
- **Error**: The serial retry command stopped before collection with `CACError: Unknown option --minWorkers`.
- **Cause**: This checkout uses Vitest 4, whose CLI accepts `--maxWorkers` but not the attempted `--minWorkers` spelling.
- **Fix**: No repository code changed; remove the unsupported flag and retain `--no-file-parallelism --maxWorkers=1`.
- **Prevention**: Inspect the installed Vitest CLI options before constraining worker counts.
- **Related tasks**: 4D-T7

## 2026-09-12: Unified POI Phase 4D T6 arrival latch lint failure
- **Error**: Scoped ESLint rejected both `arrivedRouteKey` state updates because they synchronously called `setState` inside effects.
- **Cause**: The latch was modeled as derived session state even though the existing route-scoped `arrivalNotifiedRef` already persists the one-shot arrival transition.
- **Fix**: Remove the duplicate state/effects and derive the latched result from the existing notification ref plus the current route key guard.
- **Prevention**: Prefer the existing route-scoped ref for idempotent session latches; lint with the React hooks rules before broad verification.
- **Related tasks**: 4D-T6

## 2026-09-12: Unified POI Phase 4D T6 ref-latch lint failure
- **Error**: Replacing the state latch with `useRef` caused React hooks lint to reject ref reads during render.
- **Cause**: A ref is not a render subscription and cannot safely drive the stable completion value shown by `NavigationContext`.
- **Fix**: No production behavior was retained from that attempt; replace it with a per-session `useSyncExternalStore` latch so render observes a subscribed snapshot.
- **Prevention**: Use a render-aware state/external-store contract for persistent completion, and reserve refs for effect/event guards.
- **Related tasks**: 4D-T6

## 2026-09-12: Unified POI Phase 4D T7 browser inspection timeout
- **Error**: The final safe read-only Computer Use inspection of the existing NAVI Studio Chrome tab timed out after 30 seconds.
- **Cause**: The remote Studio tab remained unresponsive through the browser automation bridge.
- **Fix**: Performed no click, typing, save, authoring, login, or external mutation; classify browser evidence as pending in the Phase 4D gate report.
- **Prevention**: Do not retry against stale remote UI state; use a responsive disposable fixture or manual evidence in the consolidated review.
- **Related tasks**: 4D-T7

## 2026-09-12: Unified POI Phase 4D T7 Graphify refresh boundary
- **Error**: The required `graphify update .` returned `Nothing to update or rebuild failed` with Windows `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify cache/output permission boundary remains outside the writable checkout.
- **Fix**: Left generated Graphify output untouched; retained the successful pre-edit graph query and independent source/test verification.
- **Prevention**: Retry only after the external Graphify permission boundary is repaired and never rewrite generated graph files manually.
- **Related tasks**: 4D-T7

## 2026-09-12: Unified POI Phase 4D T7 repository diff-check baseline
- **Error**: Broad `git diff --check` reported existing whitespace/new-blank-line findings in unrelated dirty files; the Phase 4D-scoped check exited clean.
- **Cause**: The shared checkout contains pre-existing changes outside the Phase 4D file set.
- **Fix**: Did not alter unrelated files; reran `git diff --check` scoped to the Phase 4D tracked paths and received exit 0.
- **Prevention**: Keep final whitespace checks scoped when the shared worktree is intentionally dirty, while preserving the broad result as a reported limitation.
- **Related tasks**: 4D-T7

## 2026-09-12: Consolidated Phase 4 audit unsupported Vitest list flag
- **Error**: Both attempted Vitest file-enumeration commands stopped before collection with `CACError: Unknown option --list`.
- **Cause**: This checkout uses Vitest 4.1.9, whose CLI does not expose the attempted `--list` option.
- **Fix**: No repository code changed; derive exact collected file sets from serialized verbose test runs instead.
- **Prevention**: Inspect the installed Vitest CLI before using optional reporting flags and retain `--no-file-parallelism --maxWorkers=1` for heavy matrices.
- **Related tasks**: C4-T2

## 2026-09-12: Consolidated Phase 4 audit Phase 2 path reconciliation
- **Error**: The later eight-file/141-test Phase 2 command used `packages/editor/src/tools/poi-tool.test.ts`, which does not exist, so Vitest silently collected eight files instead of the historical nine.
- **Cause**: The current test file is under `packages/editor/src/tools/__tests__/poi-tool.test.ts`; the historical path was copied without its `__tests__` segment.
- **Fix**: Reran the corrected nine-file command; all 9 files and 153 tests passed. No assertion or source code changed.
- **Prevention**: Resolve every protected test path with `Test-Path` before interpreting collection counts.
- **Related tasks**: C4-T2

## 2026-09-12: Consolidated Phase 4 audit browser inspection timeout
- **Error**: The mandated read-only `cua.getTab("1218807396", { browser: "2" })` inspection timed out while issuing `Emulation.setFocusEmulationEnabled`.
- **Cause**: The available remote NAVI Studio tab was not responsive to the Computer Use CDP inspection path.
- **Fix**: No UI action was attempted after the timeout; browser validation is classified as pending in the consolidated gate.
- **Prevention**: Treat a non-responsive disposable browser tab as validation evidence only, and never infer manual success from inventory metadata.
- **Related tasks**: C4-T2, C4-T4

## 2026-09-12: Consolidated Phase 4 audit Graphify refresh boundary
- **Error**: The required normal `graphify update .` returned `Nothing to update or rebuild failed` with `[WinError 5] Access is denied`.
- **Cause**: The managed Graphify cache/output permission boundary remains outside the writable checkout.
- **Fix**: Left generated Graphify output untouched; retained the successful pre-edit graph query and independent source/test verification.
- **Prevention**: Retry only after the external Graphify permission boundary is repaired and never rewrite generated graph files manually.
- **Related tasks**: C4-T2, C4-T4

## 2026-09-12: Consolidated Phase 4 audit typecheck boundary
- **Error**: Both required TypeScript checks stopped at `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255` with `TS1005: '}' expected`.
- **Cause**: A known malformed test fixture prevents the repository compiler from parsing the runtime package and the app project.
- **Fix**: No production or fixture code changed during the closure audit; classify the result as a pre-existing tooling condition.
- **Prevention**: Repair or explicitly waive the malformed fixture before using full typecheck as a release gate.
- **Related tasks**: C4-T2, C4-T4
## 2026-09-12: Consolidated Phase 4 audit large-plan patch boundary
- **Error**: The in-process `apply_patch` helper and the repository wrapper could not decode/apply a multiline patch to the 179 KB shared `plan/PLAN.md` ledger.
- **Cause**: The managed Windows patch bridge truncates or rejects large-file patch payloads before the narrow status hunk is applied.
- **Fix**: Applied one verified exact-string mechanical replacement for the five C4 status lines only, preserved all plan history, and removed the temporary patch artifact.
- **Prevention**: Keep future plan ledgers split below the patch bridge size boundary; use exact match counts and inspect the resulting diff when a legacy ledger is already oversized.
- **Related tasks**: C4-T5

## 2026-09-12: Consolidated Phase 4 audit progress-ledger patch boundary
- **Error**: The in-process patch helper also could not decode the 133 KB shared `navi-next/progress/PROGRESS.md` ledger for an append hunk.
- **Cause**: The same managed Windows patch bridge size boundary affects large workflow ledgers.
- **Fix**: Appended the C4 completion log atomically without rewriting prior progress entries.
- **Prevention**: Keep future progress ledgers split below the patch bridge size boundary.
- **Related tasks**: C4-T5
## 2026-09-12: Phase 5 SPEC append patch boundary
- **Error**: The in-process `apply_patch` helper could not read the 85 KB shared `spec/SPEC.md` while applying the Phase 5 specification append and returned an EOF while decoding the filesystem-helper message.
- **Cause**: The managed Windows patch bridge has a large-file boundary that also affected the existing plan and progress ledgers.
- **Fix**: No partial content was written by the failed patch. Added a temporary exact fragment with `apply_patch`, appended it atomically to `spec/SPEC.md`, verified the character count, and removed the temporary fragment.
- **Prevention**: Keep feature specifications split into smaller files when possible; for an already oversized shared ledger, use an exact fragment plus atomic append and verify the resulting tail before continuing.
- **Related tasks**: P5P-T2
## 2026-09-12: Phase 5 planning verification script variable typo
- **Error**: The first artifact-contract verification script assigned `detailPlan` without the PowerShell `$` sigil, so the detailed-plan checks ran with a null path and the command exited nonzero.
- **Cause**: Operator typo in the one-off verification command; no repository artifact was changed.
- **Fix**: Reran the complete verification with `$detailPlan` assigned correctly, then ran the nested-repository status and trailing-whitespace checks separately.
- **Prevention**: Keep verification variables in a short preflight block and require the command output to show every check before interpreting the exit status.
- **Related tasks**: P5P-T5
## 2026-09-12: Phase 5 final verification tuple flattening
- **Error**: A one-off final verification script represented checks as comma-separated PowerShell arrays, which flattened into scalar values and produced an invalid eight-check failure report.
- **Cause**: PowerShell array enumeration semantics in the reporting block; no repository artifact was changed.
- **Fix**: Replaced the tuples with explicit `PSCustomObject` records and reran the complete artifact, task-count, authorization-boundary, trailing-whitespace, and diff checks; the corrected run passed.
- **Prevention**: Use named objects for multi-field verification records and inspect the formatted table before interpreting aggregate counts.
- **Related tasks**: P5P-T5
## 2026-09-12: Phase 5 validation charter trailing whitespace
- **Error**: The first P5-T1 charter verification found two metadata lines with Markdown hard-break spaces and failed the trailing-whitespace check.
- **Cause**: The initial document used two trailing spaces after the date and baseline lines.
- **Fix**: Removed only those spaces and reran the complete P5-T1 contract check; all checks passed.
- **Prevention**: Run a trailing-whitespace scan on every new Phase 5 evidence artifact before advancing the task checklist.
- **Related tasks**: P5-T1
## 2026-09-12: Phase 5 browser disposable fixture unavailable
- **Error**: The responsive local browser reached the public Navigate and Studio surfaces, but no safe disposable published POI fixture was available: `asu-main` returned `source=empty`, `map-map-1-k6bv` exposed only a graph snapshot without published POI artifacts, public search returned no places, and local Studio initially reported `Map not found` before loading the existing online campus.
- **Cause**: The local public runtime has no published POI index for a disposable campus, while the available Studio dataset is an existing online campus that must not be mutated for evidence.
- **Fix**: Performed only read-only navigation/search/tool inspection; recorded `P5-BR-01` as `BLOCKED BY ENVIRONMENT`, dependent scenarios as `NOT RUN`, and did not create/save/publish a POI.
- **Prevention**: Provision an explicitly disposable local published POI fixture before rerunning P5-BR-01 through P5-BR-06; never author on the existing online campus to manufacture browser evidence.
- **Related tasks**: P5-T2

## 2026-09-12: Phase 5 browser verification parser typo
- **Error**: The first P5-T2 verification command stopped with a PowerShell parser error while checking the browser record.
- **Cause**: Nested quoting in the one-off `PSCustomObject` check expressions.
- **Fix**: Replaced the expressions with single-quoted literals and reran all protocol/record/safety/hygiene checks; the corrected run passed with conditions.
- **Prevention**: Keep verification string literals simple and run the complete check table before interpreting the browser verdict.
- **Related tasks**: P5-T2
## 2026-09-12: Phase 5 Android validation unavailable
- **Error**: No physical Android validation could be executed because `adb` is not installed or discoverable and no emulator/device process candidates were present.
- **Cause**: The execution environment has no connected or accessible Android bridge/device.
- **Fix**: Wrote the Android protocol and evidence record, marked `P5-AD-01`/`P5-AD-02` as `BLOCKED BY ENVIRONMENT`, marked dependent scenarios `NOT RUN`, and did not substitute simulator evidence.
- **Prevention**: Connect a designated real Android device and verify `adb devices -l` before rerunning the eight scenarios.
- **Related tasks**: P5-T3

## 2026-09-12: Phase 5 Android verification quoting typo
- **Error**: The first two P5-T3 verification retries stopped with PowerShell parser errors while checking backtick-containing `adb` text.
- **Cause**: Nested quoting in a one-off verifier expression; no artifact or device state changed.
- **Fix**: Replaced the check with simple regex literals and reran the complete protocol/record/baseline/hygiene table; the corrected run passed with conditions.
- **Prevention**: Use regex literals for Markdown code-span checks in PowerShell verification scripts.
- **Related tasks**: P5-T3
## 2026-09-12: Phase 5 arrival calibration root test filter mismatch
- **Error**: The initial combined root `npm test` invocation ran only the root-visible runtime arrival file (1 file/6 tests); the runtime resolver filter was outside the root Vitest include set and a direct root resolver command collected no files.
- **Cause**: Runtime package tests use `packages/runtime/vitest.config.ts` and must be run from the package with package-relative paths.
- **Fix**: Resolved the package config and reran `npm test` from `navi-next/packages/runtime`; the authoritative package command passed 2 files/16 tests, and the app NavigationSession command passed 1 file/6 tests.
- **Prevention**: Resolve package-specific Vitest configs and run package tests from their package roots; never interpret a zero-file or under-collected root filter as coverage.
- **Related tasks**: P5-T4

## 2026-09-12: Phase 5 arrival calibration verification quoting/parser retries
- **Error**: The first two P5-T4 verification retries stopped with PowerShell parser errors while checking Markdown code-span literals and a multiline field-case string.
- **Cause**: Nested quoting and line wrapping in one-off verifier expressions; no production, test, or calibration policy file changed.
- **Fix**: Replaced the checks with regex/simple substring assertions and reran the complete protocol, evidence, baseline, field-condition, and hygiene table; the corrected run passed with conditions.
- **Prevention**: Use simple literal/regex assertions for Markdown evidence checks and inspect the evidence file actual line wrapping before writing a verifier.
- **Related tasks**: P5-T4
## 2026-09-12: Phase 5 campus matrix verifier array syntax typo
- **Error**: The first P5-T5 artifact verification command failed before evaluating any checks because the PowerShell array expression used `[ @{...} ]` instead of a PowerShell array subexpression.
- **Cause**: Verifier command syntax error, not a project or test failure.
- **Fix**: Re-run the same read-only checks with `@(...)` assertions.
- **Prevention**: Keep verification scripts syntactically minimal and validate command structure before interpreting the result as evidence.
- **Related tasks**: P5-T5
## 2026-09-12: Phase 5 campus matrix verifier checked marker in wrong artifact
- **Error**: The corrected P5-T5 verifier looked for the matrix-level `NO TOPOLOGY MUTATION` marker in the evidence record, producing a false failure even though the matrix and record contained the required topology evidence.
- **Cause**: The assertion did not distinguish specification markers from execution-record markers.
- **Fix**: Inspected both artifacts and corrected the verification scope: the marker is required in the matrix, while the record is checked for passing before/after snapshots and the live-fixture boundary.
- **Prevention**: Map each assertion to the artifact that owns the contract before running the gate.
- **Related tasks**: P5-T5
## 2026-09-12: Phase 5 defect triage verifier hygiene and tuple-precedence errors
- **Error**: The first P5-T6 verifier found a Markdown hard-break space after the triage date, and its compact tuple expression printed one combined boolean label instead of the intended check name.
- **Cause**: The new document retained a trailing-space hard break; PowerShell operator precedence in the one-off reporting expression combined a tuple with `-and` before formatting.
- **Fix**: Removed only the trailing spaces and replaced the compact aggregate assertion with explicit named checks before rerunning the gate.
- **Prevention**: Avoid hard-break spaces in evidence artifacts and use explicit `if` assertions when combining PowerShell booleans.
- **Related tasks**: P5-T6
## 2026-09-12: Phase 5 protected public Navigate baseline reproduced
- **Error**: The fresh protected public Navigate matrix passed 27 of 28 tests; `src/app/(public)/map/navigate/page.test.tsx:399` could not find `data-testid="navigation-dev-panel"`.
- **Cause**: The existing development-simulator assertion is environment-sensitive and was already present in the Phase 4 baseline; no Phase 5 source or fixture change caused it.
- **Fix**: Preserved the assertion and recorded the result as `PRE_EXISTING_BASELINE`; all other public POI/navigation tests in the matrix passed.
- **Prevention**: Keep this baseline separate from POI product results and resolve or explicitly waive it before a production-readiness claim.
- **Related tasks**: P5-T5, P5-T6, P5-T7
## 2026-09-12: Phase 5 repository typecheck baseline reproduced
- **Error**: `npx tsc --noEmit --pretty false` stopped at `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)` with `TS1005: '}' expected`.
- **Cause**: The known malformed test fixture prevents repository-wide TypeScript parsing.
- **Fix**: No source or fixture change was made; the protected functional matrices remain the evidence boundary and the typecheck result is classified `PRE_EXISTING_BASELINE`.
- **Prevention**: Repair or explicitly waive the fixture before using repository-wide typecheck as a release gate.
- **Related tasks**: P5-T6, P5-T7
## 2026-09-12: Phase 5 production build worker permission baseline reproduced
- **Error**: `npm run build` compiled successfully, skipped type validation, then failed while collecting page data with `Error: spawn EPERM` from the Next.js worker process.
- **Cause**: Managed Windows process-spawn permission boundary during the build worker phase; this is independent of the POI functional matrices.
- **Fix**: No build configuration or source change was made; retain the result as a release/tooling condition.
- **Prevention**: Rerun the production build in a permitted clean environment and keep worker-spawn failures separate from application assertions.
- **Related tasks**: P5-T6, P5-T7
## 2026-09-12: Phase 5 broad lint baseline reproduced
- **Error**: `npm run lint` exited 1 with 22,571 reported problems: 2,190 errors and 20,381 warnings, including generated `.next` output and pre-existing dirty-checkout files.
- **Cause**: Repository-wide lint currently traverses generated/legacy content and the broad workspace has an established lint backlog; this run was not scoped to the Phase 5 artifacts.
- **Fix**: No lint rule, generated file, source file, or test was modified; focused protected tests remain the release evidence boundary and the broad lint result is a release condition.
- **Prevention**: Define a clean, source-scoped lint target for release and exclude generated output before treating lint as a binary product gate.
- **Related tasks**: P5-T6, P5-T7
## 2026-09-12: Phase 5 release validator npx cache boundary
- **Error**: `npm run validate` could not start `scripts/validate-release.ts`; `npx tsx` requested `https://registry.npmjs.org/tsx` and failed with `ENOTCACHED` because the managed npm cache has no entry.
- **Cause**: The script uses `npx` rather than the locally installed binary, and network/cache access is unavailable.
- **Fix**: No repository artifact changed; check for and invoke the checked-in local `node_modules/.bin/tsx.cmd` directly.
- **Prevention**: Release validation commands should use a pinned local executable or a prewarmed offline cache.
- **Related tasks**: P5-T6, P5-T7
## 2026-09-12: Phase 5 release artifact validation failed
- **Error**: The checked-in release validator, run directly with Node after the `npx` cache failure, found 7 passes and 7 failures in `deploy/prod`: schema `1` instead of `1.0`, missing `manifest.campusName`, missing `manifest.revision`, and missing `graph`, `search`, `buildings`, and `poi` artifact entries.
- **Cause**: The checked-in production artifact manifest is incomplete or from an incompatible schema; this is a release-artifact condition, not a POI authoring/runtime assertion.
- **Fix**: No manifest, artifact, publication, migration, or deployment change was made.
- **Prevention**: Generate and validate a complete release bundle from an explicitly selected revision before authorizing deployment.
- **Related tasks**: P5-T6, P5-T7
## 2026-09-12: Phase 5 final report patch hunk prefix typo
- **Error**: The first `apply_patch` for the final Phase 5 report was rejected because one wrapped content line lacked the required patch `+` prefix.
- **Cause**: Patch transport syntax error; no report file or project source was written.
- **Fix**: Corrected the missing prefix and will rerun the complete final-report verification.
- **Prevention**: Keep long report paragraphs split into explicit prefixed lines before submitting a patch.
- **Related tasks**: P5-T8
## 2026-09-12: Phase 5 final verifier wording mismatch
- **Error**: The final artifact sweep expected the literal marker `NO new reproducible NAVI_DEFECT`, while the report correctly used `No new reproducible NAVI_DEFECT was established.`
- **Cause**: The verifier asserted a paraphrase instead of the report's exact sentence.
- **Fix**: Kept the report unchanged and corrected the verifier to assert the actual wording.
- **Prevention**: Verify exact contract markers separately from prose assertions and inspect the report text before encoding literals.
- **Related tasks**: P5-T8
## 2026-09-12: Phase 5 full-suite baseline remains non-green
- **Error**: The required full `npm test -- --no-file-parallelism --maxWorkers=1 --reporter=dot` run completed with 16 failed suites, 32 failed tests, 5,336 passed tests, and 8 skipped tests across 513 suites.
- **Cause**: The broad dirty checkout includes failures outside the protected Phase 5 matrix, including missing legacy `golden-campus` imports, compiler fixture/topology assertions, a floor-editor assertion, and the known public navigation-dev-panel baseline.
- **Fix**: No source, fixture, or test was changed. The protected Phase 5 matrices remain separately reported; the aggregate is classified `UNRESOLVED` until reproduced from a clean, explicitly selected revision.
- **Prevention**: Do not use the broad dirty-worktree suite as a product verdict; establish a clean baseline and classify each remaining failure before release authorization.
- **Related tasks**: P5-T6, P5-T7, P5-T8
## 2026-09-12: Phase 5 post-suite report patch targeting error
- **Error**: A post-suite evidence patch was rejected because the same release-gate file appeared in multiple `Update File` operations; an earlier attempt also used an incomplete table hunk.
- **Cause**: `apply_patch` requires one operation per target file and exact surrounding lines.
- **Fix**: No evidence file was partially changed; the updates are being applied one file at a time with exact context.
- **Prevention**: Group all hunks for a file under one update operation and split multi-file patches only when target paths are unique.
- **Related tasks**: P5-T6, P5-T7, P5-T8

## 2026-09-12: Room tool recognizes only 3 of 6 wall cells (Octagon GF)
- **Error**: User's Octagon/GF office grid (6 visually enclosed cells) exposes only 3 usable derived faces; outliner shows "Rooms (3)" and the Room tool cannot declare the remaining cells.
- **Cause**: Pending - recognized count equals the number of valid closed faces in the authored wall graph. Candidate causes: wall endpoints not actually connecting at cell corners (gaps), dangling partitions excluded as bridges, or small/narrow faces classified `utility` (area <= 4 m2 or aspect ratio > 5). Not yet verified against the user's wall geometry (live floor currently holds 0 walls).
- **Fix**: None yet; no geometry available in the current running state. Requires the authored walls for a targeted diagnosis.
- **Prevention**: Surface unclosed boundaries in the editor (e.g., highlight open wall endpoints) before users try to declare rooms.
- **Related tasks**: Room recognition investigation (read-only)
## 2026-09-12: Stale local graph overrides newer server snapshot (Octagon GF room count)
- **Error**: One browser showed 3 recognized rooms on Octagon GF while another browser and the server had 6; "it doesn't recognize the enclosure" persisted until a state refresh.
- **Cause**: `loadMapData` in `src/store/graph-store.ts` keeps the local snapshot when it is not marked synced (no server fetch at all), and its freshness comparison trusts a locally stamped `serverTimestamp` written by `syncToSupabase`, so newer server data can be ignored indefinitely. The divergence came from a local snapshot whose walls predated the corrected server walls (verified: server walls -> 6 faces).
- **Fix**: Workaround applied/communicated: remove `navi-graph-map-map-1-k6bv` + `navi-sync-status-map-map-1-k6bv` and reload (or open incognito) to force CASE A server fetch. Permanent fix pending approval.
- **Prevention**: Surface server-vs-local conflicts; adopt server `updated_at` as the authoritative timestamp; never push a stale local snapshot over a newer server snapshot without confirmation.
- **Related tasks**: Room recognition investigation; graph-store hydration fix (proposed)

## 2026-09-12: Snap-indicator removal — focused floor-editor failures classified as pre-existing baseline
- **Error**: After removing the floor editor snap indicator, the focused floor-editor suite reported 5 failures / 3 files: 2x production-route-characterization route authoring (payload points length 4 vs 3; missing `entrance.access.assign`), 1x route-network-maplibre route-path branch (nodes 4 vs 3), 2x semantic-room-properties panel labels (`Advanced route assignment`, `North Campus Walk`).
- **Cause**: All five assert route command/node behavior or ComponentProperties DOM text in the dirty WIP checkout. No test references `floor-snap`, the removed SnapEngine wiring, or the preview handler; the removed code only called `setData` on a map source and never dispatched commands or mutated the document.
- **Fix**: No test/source change beyond the intended removal; classified `PRE_EXISTING_BASELINE`. The two characterization tests covering the removed code pass (source list; SnapEngine independence).
- **Prevention**: Re-run these five tests once the route-authoring/properties work settles to confirm they return green independent of this change; keep focused matrices separate from dirty-WIP baselines.
- **Related tasks**: REMOVE-FLOOR-SNAP-INDICATOR T1-T5
## 2026-09-12: Blocked-sync throw surfaced as unhandled rejection from autosave paths
- **Error**: After adding the conflict block to `syncToSupabase`, the live app logged `unhandledRejection: Error: The server has a different version of this map...` from `EditorBridge.useEffect.handleVisibility` (and the same pattern existed in the persistence adapter and `InteractionController` building move).
- **Cause**: New throwing path reached pre-existing fire-and-forget `useGraphStore.getState().save()` call sites with no `.catch`.
- **Fix**: Wrapped all fire-and-forget save sites with `void ... .catch(...)` + warn (EditorBridge adapter/visibility/beforeunload, InteractionController building move). Page-level flush already caught.
- **Prevention**: When making an existing async action throw in new cases, audit every call site for unhandled rejections, especially lifecycle handlers (visibilitychange/beforeunload).
- **Related tasks**: Graph-store staleness fix T2/T3.

## 2026-09-13: Route toast overlaps and blocks the door route junction prompt (browser verification finding)
- **Error**: The first browser e2e run timed out clicking the junction prompt: `getByRole('button', { name: 'Yes' }).click()` was retried for 30s with `<div role="status">…</div> intercepts pointer events`. The Route authoring message "Click a route node to reuse it, or a route line to create a junction for this door." (z-index 50, bottom 42) renders on top of the `door-route-connect-prompt` dialog (z-index 13, bottom 64), covering the Yes/No buttons.
- **Cause**: `src/components/floor-editor/FloorEditor.tsx` keeps `routeAuthoringMessage` visible when the junction prompt opens; the toast is later in DOM order with a higher z-index.
- **Fix**: The e2e dismisses the toast through the UI's own `Dismiss route message` control before confirming. Production stacking/clearing not changed (out of task scope, only the e2e script was committed).
- **Prevention**: Clear the route message when a canvas prompt opens, or render prompts above transient toasts. Browser hit-test e2e (real clicks, not `fireEvent`) catches this class; the unit tests could not.
- **Related tasks**: Task 14 (indoor route junctions)

## 2026-09-13: Route-tool edge click landed in the junction node hit circle, so no prompt appeared
- **Error**: Browser run 3: clicking the first route edge midpoint never opened `route-connection-prompt` (5s timeout); the Outliner gained one route node/edge — the click resolved as a direct node commit instead.
- **Cause**: The fixture edge and the Door-1 connector are collinear on y=0. The door segment junction sits at the fixture edge midpoint, and at the fixture map scale the 6px route-node circle covers the connector midpoint (`featureCenter`) used for the click.
- **Fix**: The e2e clicks the Door-2 connector edge (last edge feature, non-collinear with the junction), whose midpoint is clear of every node. `featureCenter` also gained LineString support (averaging coordinates) because the previous ring math produced NaN for route edges.
- **Prevention**: For edge-pick checks choose a point farther than the node hit-radius from every node; confirm the geometry overlap before asserting a prompt.
- **Related tasks**: Task 14 (indoor route junctions)

## 2026-09-13: Briefed Route-tool count delta (+3) did not match command semantics
- **Error**: The brief asserted `routeEdgesAfter === routeEdgesBefore + 3`, but the observed browser delta was +2 (4 -> 6) and the check would fail.
- **Cause**: Committing a path through a junction removes the original edge (-1), adds the two split halves (+2), and adds the authored path edge (+1) = net +2. `applyRouteJunctionSplit` filters out the original edge; the existing unit test (`production-route-characterization.test.tsx`, 1 -> 3 edges) already proves +2. The same brief's door check correctly used +2.
- **Fix**: The e2e asserts `+ 2`; the browser run recorded `{before: 4, after: 6}`.
- **Prevention**: Derive expected count deltas from the command handler and existing tests, not prose summaries.
- **Related tasks**: Task 14 (indoor route junctions)

## 2026-09-13: Briefed second Door invalidated the singleton 2D Door-count check
- **Error**: `switching back to 2D keeps authored objects intact` failed after the brief introduced a second Door; it asserted exactly one door area.
- **Cause**: A downstream singleton assertion in the same script was not updated with the new fixture flow.
- **Fix**: Assert two authored doors and report their ids (`door-1-…`, `door-4-…`).
- **Prevention**: When a script change adds a same-type entity, sweep the script for count/singleton assertions on that entity.
- **Related tasks**: Task 14 (indoor route junctions)

## 2026-09-13: First full-suite invocation was terminated before the summary
- **Error**: The first `npm test` run ended with `EXIT=-1` and no `Test Files`/`Tests` summary (output ended mid-run), so it could not be used as evidence.
- **Cause**: The process was killed before completion (large suite; the run was already several minutes in).
- **Fix**: Re-ran as `npm test -- --reporter=dot`; it completed in 175.27s with the full summary (15 failed files / 29 failed tests, all pre-existing).
- **Prevention**: For this repo use the compact `--reporter=dot` and a generous timeout for full-suite evidence runs.
- **Related tasks**: Task 14 (indoor route junctions)

## 2026-09-13: Route toast blocked the door junction prompt — FIXED in Task 14 fix wave 1
- **Error**: See the 2026-09-13 toast entry above: the route authoring toast (z-index 50, bottom 42) intercepted pointer events over the `door-route-connect-prompt` dialog (z-index 13, bottom 64), so users (and the first e2e run) could not click Yes/No without dismissing the toast.
- **Cause**: the toast container kept default hit-testing across its entire box, which overlaps the prompt buttons.
- **Fix**: `src/components/floor-editor/FloorEditor.tsx` toast container now sets `pointerEvents: 'none'` and the `Dismiss route message` button sets `pointerEvents: 'auto'` (precedent: `rectangleMessage` in `FloorEditorCanvas.tsx`). The e2e now clicks the junction Yes directly through the visible toast and checks the toast is still visible; the Dismiss workaround was removed.
- **Prevention**: overlay/status surfaces that can overlap interactive prompts must be pointer-transparent except for their own controls; browser hit-test checks (real clicks) catch this class.
- **Related tasks**: Task 14 fix wave 1 (`0e37f95`)

## 2026-09-13: Door route pick dead end while route layers hidden by default — FIXED in Task 14 fix wave 1
- **Error**: the Door `Connect to Route…` pick instructs the user to click a route node/line, but `nodes`/`edges` layers default to hidden in the Architecture tab; MapLibre `queryRenderedFeatures` only resolves visible layers, so the pick could not work until the user manually revealed the graph (Navigation Preview → Graph). Task 14's e2e carried that manual reveal.
- **Cause**: `handleStartRouteConnect` did not touch layer visibility; only the Navigation-mode effect enabled `nodes`/`edges`.
- **Fix**: `handleStartRouteConnect` now runs `setLayers((prev) => ({ ...prev, nodes: true, edges: true }))`. The e2e removed the manual `Graph` toggle before the first pick and now `waitForFunction`s both route layers to `visibility: visible`, with a dedicated check.
- **Prevention**: any mode that resolves rendered map features must make the required layers visible as part of entering that mode; e2e must exercise the default layer state, never a manually prepared one.
- **Related tasks**: Task 14 fix wave 1 (`0e37f95`)

## 2026-09-13: Studio live persistence probe could not access `localStorage`
- **Error**: A read-only browser-runtime inspection of the deployed Studio page threw `TypeError: Cannot convert undefined or null to object` while enumerating `localStorage`; no page data was changed and no sync conclusion was drawn.
- **Cause**: The browser evaluation context exposed the page DOM but did not expose a usable `localStorage` object to that probe.
- **Fix**: Guard the storage read and continue with DOM, captured console logs, source tracing, and any directly observable network/API evidence; the same context also lacked `performance.getEntriesByType`, so performance-resource inspection was not used.
- **Prevention**: Treat browser-runtime storage and performance access as optional instrumentation; probe both APIs defensively and classify access failures separately from application persistence failures.
- **Related tasks**: T1

## 2026-09-13: Studio performance-resource probe unavailable in browser evaluation context
- **Error**: The guarded read-only runtime probe threw `TypeError: Cannot read properties of undefined (reading 'getEntriesByType')` while enumerating performance resources; no page data was changed.
- **Cause**: The supported Playwright evaluation context did not expose a `performance` object with the requested resource API.
- **Fix**: Use supported page DOM snapshots and `tab.dev.logs`, plus static source and direct endpoint inspection, for the sync boundary evidence.
- **Prevention**: Detect optional browser APIs before calling them and do not infer network behavior from an unavailable instrumentation surface.
- **Related tasks**: T1

## 2026-09-13: Static sync search command hit PowerShell quoting syntax
- **Error**: A read-only `rg` command failed before searching with `ParserError: An empty pipe element is not allowed`.
- **Cause**: The PowerShell command string contained unescaped quote and pipe characters in the regular expression.
- **Fix**: No repository or product state changed; rerun the search with single-quoted PowerShell literals or smaller search expressions.
- **Prevention**: Use PowerShell-safe quoting for regex searches and split complex expressions before interpreting command failures as source findings.
- **Related tasks**: T2

## 2026-09-13: Public-campus probe assumed the wrong response nesting
- **Error**: A read-only summary probe reported `nodes=1`, `edges=1`, and `pois=1` for `/api/public-campus` because it looked under `response.graph` and `response.artifacts.poiIndex`.
- **Cause**: The endpoint returns `nodes`, `edges`, and `buildings` at the response top level; the fallback `graph_snapshots` response does not include the published artifact indexes.
- **Fix**: Classified those counts as probe artifacts and reran the comparison using the endpoint’s actual top-level fields; no application or database state changed.
- **Prevention**: Confirm the response contract from the route handler before writing ad hoc endpoint summaries, and print the top-level property names on the first probe.
- **Related tasks**: T3

## 2026-09-13: Live Studio edits blocked at the graph sync boundary
- **Error**: The live Studio displayed `All changes saved`, but `graph-store.syncToSupabase()` repeatedly rejected the current map with a server-version conflict; Routes/Route Testing continued to show the 29-building server snapshot.
- **Cause**: The local graph’s expected `graph_snapshots.updated_at` did not match the server revision. The EditorBridge save adapter returns before the graph-store promise settles, and the top save indicator observes only the workflow save state.
- **Fix**: No product fix or external write was performed during this read-only investigation. The conflict must be resolved deliberately by adopting the server snapshot or explicitly force-resyncing an approved local snapshot, followed by validation/publication as appropriate.
- **Prevention**: Await the graph-store save promise, surface graph sync conflicts in the top Studio status, use server `updated_at` as the authoritative revision, and verify the same campus through the public runtime endpoint after saving.
- **Related tasks**: T1–T4

## 2026-09-13: Computer-use reference path was resolved incorrectly
- **Error**: The first read-only attempt to load the computer-use `guidance.md`, `api.md`, and `confirmations.md` references failed with `Cannot find path`.
- **Cause**: The skill file is under the versioned `computer-use/26.908.40834/skills/computer-use/` directory, so its documented `../../docs` paths resolve under the versioned package root rather than the unversioned plugin directory.
- **Fix**: No browser or application action occurred; retry from the correct versioned package path.
- **Prevention**: Resolve relative skill references from the directory containing the selected `SKILL.md`, including versioned package components.
- **Related tasks**: T1

## 2026-09-13: Browser page context still withheld Studio localStorage
- **Error**: A defensive read-only probe failed with `TypeError: Cannot read properties of undefined (reading 'localStorage')` before it could export the map-scoped local graph.
- **Cause**: The supported browser evaluation context does not expose `globalThis.localStorage` for the deployed Studio tab.
- **Fix**: No local data was read, cleared, or changed. Treat the exact local JSON export as unavailable through this instrumentation and continue with visible Studio entities, server API snapshots, and source-level comparison.
- **Prevention**: Detect storage availability before access and require a user-side export or an application-provided export endpoint before claiming a complete local JSON capture.
- **Related tasks**: T1

## 2026-09-13: Source-read orchestration cell had a JavaScript syntax error
- **Error**: A read-only `functions.exec` orchestration cell failed with `SyntaxError: Unexpected token ']'` before invoking any repository command.
- **Cause**: The multi-command JavaScript wrapper was malformed while batching several PowerShell source reads.
- **Fix**: No repository or application state changed; rerun the same reads as separate commands.
- **Prevention**: Keep batched tool orchestration syntax minimal and validate one command before expanding parallel reads.
- **Related tasks**: T1

## 2026-09-13: Context source path was stale during sync-fix inspection
- **Error**: A read-only source inspection reported `Cannot find path` for `navi-next/packages/editor/src/context/base-service.ts`.
- **Cause**: The base service and service registry are defined in a different context module; the guessed filename is not present in this checkout.
- **Fix**: No repository state changed; the existing service-registry module and workflow/persistence sources were read separately.
- **Prevention**: Resolve filenames from `rg --files` before opening related source paths.
- **Related tasks**: T1

## 2026-09-13: Temporary artifact directory command used unsupported PowerShell parameter
- **Error**: `New-Item -ItemType Directory -Force -LiteralPath ...` failed because this shell does not expose a `-LiteralPath` parameter for `New-Item`.
- **Cause**: The command assumed the parameter surface of a different PowerShell version.
- **Fix**: No repository, browser, or production data changed; retry with the explicit absolute path passed through the supported `-Path` parameter.
- **Prevention**: Use the shell's available parameter surface for non-destructive artifact setup and verify the target path before writing.
- **Related tasks**: T1

## 2026-09-13: Sandboxed server snapshot export was network-refused
- **Error**: The read-only `Invoke-WebRequest` GET for the live `/api/graph` endpoint failed with `No connection could be made because the target machine actively refused it` before writing the export.
- **Cause**: The sandboxed command environment does not have the same network access as the already-open browser/API observation surface.
- **Fix**: No repository, browser, or production data changed; retry the same exact GET only with an explicit elevated network request, writing to the temporary comparison directory.
- **Prevention**: Separate network transport limitations from endpoint/application failures and never substitute an inferred snapshot for a failed capture.
- **Related tasks**: T1

## 2026-09-13: Sync-recovery RED tests exposed the missing save-state contract
- **Error**: The new T2 regression run failed because the Studio persistence/status modules did not yet exist, SaveStatus still rendered `Unsaved changes` during a mocked graph conflict, and WorkflowService did not observe mocked syncing/conflict state or block publish.
- **Cause**: This is the expected pre-implementation RED phase for the requested behavior; the existing workflow lifecycle tests and test harness remained green.
- **Fix**: No production code was changed in T2. The failures are retained as the implementation acceptance gate for T3/T4.
- **Prevention**: Keep these tests focused on the adapter promise, graph sync state, conflict-preserving status, and explicit recovery controls before changing the implementation.
- **Related tasks**: T2

## 2026-09-13: T5 integration patch targeted an already-amended plan hunk
- **Error**: A bundled `apply_patch` for the runtime integration test was rejected because it expected the old `src/store/__tests__/graph-runtime-consistency.test.ts` plan entry after that entry had already been moved out of T2.
- **Cause**: The patch combined a new file with a stale plan context hunk.
- **Fix**: No repository or production state changed; apply the test file and current plan update as separate patches after re-reading the exact plan context.
- **Prevention**: Inspect the current target hunk before combining new files with previously edited planning documents.
- **Related tasks**: T5

## 2026-09-13: Public-campus fallback dropped authored traces and POIs
- **Error**: The T5 save → `/api/graph` → `/api/public-campus` integration test received the authored building, stair edge, and slope metadata but `publicBody.traces` and `publicBody.pois` were `undefined`.
- **Cause**: The graph-snapshot fallback typed and returned only buildings, nodes, edges, components, doors, and boundary, even though the saved snapshot preserved traces and POIs.
- **Fix**: Pending T5 implementation; the intended fix is additive response shaping for fallback traces/POIs and published-artifact POI defaults, without changing routing algorithms or source selection.
- **Prevention**: Keep runtime consistency tests spanning the save payload and the public response, including additive authored route and POI fields.
- **Related tasks**: T5

## 2026-09-13: Semantic door ownership always resolves ambiguous on multi-room floors

- **Error**: Browser verification (ROU Task 9) created Doors inside two wall-derived semantic Rooms; both Doors were placed at the correct positions inside their faces but were stored with `ownership: { status: 'ambiguous', candidateRoomIds: [<Room A>, <Room B>] }` and no `roomId`. The same run re-evaluated the pre-existing unassigned Segment Door and assigned it ambiguous candidates instead of resolving it.
- **Cause**: `deriveRooms()` emits closed rings that repeat the first vertex as the last point (`packages/editor/src/geometry/room-ownership.ts` consumes them via `collectFloorRoomOwnershipPolygons`). In `containsPoint`, the final loop iteration pairs that duplicated vertex with itself; `pointOnSegment` then computes `cross = 0` and `dot = 0`, and the guard `dot >= 0 && dot <= lengthSq` (0 ≤ 0) returns `true`. Every derived face therefore "contains" every point, so any floor with ≥2 declared semantic Rooms reports `ambiguous`; a single-face floor would falsely report `assigned` outside its bounds. Offline reproduction: `resolveUniqueRoomOwner({x:11.94,y:4.02}, …)` → ambiguous `[room-1-…, semantic-room-face-97xrm4]` although the point is inside face A only; `{x:25.42,y:-19.54}` (outside both) also ambiguous.
- **Fix**: FIXED (fix wave 1, commit `0820454` — `fix(editor): ignore degenerate ring edges in room containment`). `pointOnSegment` in `packages/editor/src/geometry/room-ownership.ts` now computes the squared segment length up front and returns `false` for (near-)zero-length segments (`lengthSq <= 1e-18`) before the cross/dot math, so the duplicated closing vertex of derived rings can no longer satisfy the dot-product bounds and "contain" every point. Non-degenerate edge semantics are unchanged: a point on a real shared wall (and on its shared vertices) is still detected through the adjacent edges, preserving the door-on-boundary → `ambiguous` behavior.
- **Verification**: RED first on `packages/editor/src/geometry/__tests__/room-ownership.test.ts` — the two-adjacent-semantic-rooms case resolved `ambiguous [room-a, room-b]` and a far point resolved `assigned` through the repeated closing vertex; after the fix 11/11 pass (new cases: adjacent-room interior ownership, shared-wall ambiguity, shared-corner ambiguity, far point outside a closed ring). Regressions `packages/editor/src/commands/__tests__/door-ownership-reconcile.test.ts` + `packages/editor/src/commands/__tests__/spatial-door-handlers.test.ts` → 24/24. Browser: fresh `npm run dev` + `node e2e-floor-editor-stabilization.mjs` → `FLOOR EDITOR BROWSER VALIDATION — PASS (57/57)`; the two previously failing semantic checks now report `{status:'assigned'}` with `room-1-zu4b` and `semantic-room-face-97xrm4`.
- **Prevention**: Any point-in-polygon consumer of `deriveRooms()` output must be tested with ≥2 derived faces and the repeated closing vertex. Existing `room-ownership.test.ts` cases used hand-authored open rings (legacy Rooms) or a single derived face, which kept the defect latent.
- **Related tasks**: ROU Task 9 (found); ROU Task 2 (first fed derived rings into `containsPoint`).

## 2026-09-13: Repository typecheck blocked by unrelated pre-existing syntax error
- **Error**: `npx tsc --noEmit` stopped at `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255` with `TS1005: '}' expected`.
- **Cause**: The existing runtime test file is syntactically incomplete in the dirty checkout; it is outside the NAVI Studio sync-recovery files changed in this task.
- **Fix**: No unrelated user-owned file was edited. The focused Vitest matrix for all changed behavior remains green.
- **Prevention**: Repair the pre-existing runtime test syntax in its owning task, then rerun the repository-wide typecheck; keep scoped verification separate from dirty-WIP baseline failures.
- **Related tasks**: T6

## 2026-09-13: Scoped ESLint includes pre-existing dirty-checkout violations
- **Error**: ESLint over the changed-file set reported 26 errors and 1 warning, primarily existing explicit-`any` violations in service/tests, existing React ref-rule violations in `EditorBridge.tsx`, and an existing unused type import in `publish-service.ts`.
- **Cause**: The repository has an established dirty-WIP lint baseline; the reported locations include code that predates this recovery change, while the newly added modules/tests were not reported in the output.
- **Fix**: No unrelated baseline cleanup was performed. Run ESLint on the newly added files separately and retain the full scoped result as baseline evidence.
- **Prevention**: Keep task lint output split between new code and pre-existing touched-file violations; fix unrelated baseline issues in their owning tasks.
- **Related tasks**: T6

## 2026-09-13: Final-review RED fixture referenced an undestructured canonical id
- **Error**: The new `needsDoorOwnershipReconcile` RED run failed one assertion with `ReferenceError: canonicalId is not defined`; the test body used `canonicalId` without destructuring it from `semanticFloor()`.
- **Cause**: The predicate test was copied from the heal-test shape and its fixture destructure was not updated for the canonical-id case.
- **Fix**: Added `canonicalId` to the destructure; the same RED run then failed only for the intended reasons (`needsDoorOwnershipReconcile is not a function`, unhealed stale pair, dropped angle).
- **Prevention**: When copying fixture-driven tests, re-check every identifier the new body references against its own destructure before treating RED output as product evidence.
- **Related tasks**: Final review fix F1/F2

## 2026-09-13: Final-review dev-server readiness poll killed by the execution harness
- **Error**: The combined `Start-Process npm run dev` + readiness-poll command was terminated by the execution harness (`Unknown: ChildProcess.kill`) without returning command output; the detached Next.js server nevertheless started and served `GET /login 200`.
- **Cause**: The detached npm wrapper held the redirected stdout/stderr handles inherited from the polling shell, so the shell did not return cleanly within the harness wait budget and was force-killed; the kill did not propagate to the detached dev-server tree.
- **Fix**: Confirmed readiness from independent evidence (`Get-NetTCPConnection -LocalPort 3000`, wrapper PID file, dev log), ran `node e2e-floor-editor-stabilization.mjs` against the live server (PASS 57/57), then stopped the tree with `taskkill /PID <wrapper> /T /F` and verified port 3000 free.
- **Prevention**: Start the dev server in a short command that returns immediately, then verify readiness/PID/log in a separate bounded call instead of polling inside the shell that holds the redirected process handles.
- **Related tasks**: Final review fix browser gate

## 2026-09-13: Graphify post-change refresh hit Windows access denied
- **Error**: Mandatory `graphify update .` failed during code re-extraction with `WinError 5: Access is denied`.
- **Cause**: The graphify re-extraction process could not access a project path in the dirty Windows checkout; the command reported no valid update.
- **Fix**: No application source or live data was changed. Use the successful pre-change graphify query and direct source/test verification; inspect graphify output for partial changes before completion.
- **Prevention**: Treat graphify refresh output as invalid unless the command exits successfully, and resolve Windows file-access/locking issues in a separate maintenance task.
- **Related tasks**: T6

## 2026-09-13: Final focused Vitest retry hit sandbox spawn EPERM
- **Error**: The final focused `npm test -- --run ...` command stopped while loading `vitest.config.ts` with `Error: spawn EPERM`; no test body executed in that invocation.
- **Cause**: The default managed Windows command environment denied the Vite external-dependency resolver child-process spawn, matching the established runner limitation.
- **Fix**: The prior elevated focused matrix remains the valid task evidence: 13 files / 77 tests passed. No source, browser, or production data changed in the failed retry.
- **Prevention**: When a final Vitest retry fails before collection with `spawn EPERM`, use the approved elevated test execution context and distinguish runner startup failure from assertion results.
- **Related tasks**: T6

## 2026-09-13: Production build page-data workers hit sandbox spawn EPERM
- **Error**: `npm run build` compiled successfully, skipped type validation, then failed during Next page-data collection with `Error: spawn EPERM`.
- **Cause**: The default managed Windows environment denied the worker process spawn used by Next.js after compilation; this is the same execution limitation seen in prior repository builds.
- **Fix**: No source or production data changed. Compilation evidence is retained, while the focused elevated Vitest matrix remains the functional verification for this task.
- **Prevention**: Rerun the unchanged build in an approved elevated execution context before using it as a deployment gate; keep the unrelated repository typecheck baseline separate.
- **Related tasks**: T6

## 2026-09-13: Broad sync-recovery diff check retained dirty-tree formatting baseline
- **Error**: Repository-wide `git diff --check` exited non-zero with pre-existing trailing-whitespace/newline diagnostics and many LF/CRLF normalization warnings; the task-scoped diff check passed.
- **Cause**: The shared checkout contains unrelated dirty source, generated output, and Markdown hard-break formatting outside this recovery change.
- **Fix**: No unrelated formatting was rewritten. The relevant tracked sync files passed the scoped check, and new/API files passed ESLint.
- **Prevention**: Keep broad hygiene output separate from scoped acceptance checks in this shared dirty worktree; perform repository-wide normalization in a dedicated cleanup task.
- **Related tasks**: T6

## 2026-09-13: E2E safety wiring — no new errors
- **Error**: None encountered. The mechanical guard wiring of 29 Playwright-driven `.mjs` scripts (11 `requireE2eCampusId`, 18 `requireSafeTestEnvironment`) parsed on the first `node --check` run and `__tests__/e2e-safety.test.ts` passed 14/14 on the first run.
- **Cause**: N/A — additive import + guard-call edits only; hardcoded selected-campus ids were replaced by the guard-returned id per the established rule; interception logic, fixtures, and selectors untouched.
- **Fix**: N/A.
- **Prevention**: Keep every new root/`scripts/*.mjs` Playwright script importing `e2e/support/campus-guard.mjs` (`requireE2eCampusId` for fixed/selected campuses, `requireSafeTestEnvironment` for API interceptors, disposable-campus creators, and generic scripts); gate mechanically with `node --check` + `__tests__/e2e-safety.test.ts`.
- **Related tasks**: E2E safety wiring (follow-up to the 2026-09-13 production campus write incident)

## 2026-09-13: Graphify refresh after E2E safety wiring hit Windows access denied (recurrence)
- **Error**: Mandatory post-change `graphify update .` completed AST re-extraction (3027/3027 files) and backed up the curated graph, then failed at the atomic write: `[WinError 5] Access is denied: 'graphify-out\\.graph.tmp.json' -> 'graphify-out\\graph.json'`; the command reported no valid update.
- **Cause**: Same dirty-checkout Windows file-locking/access limitation recorded earlier today for T6; a process or permissions issue blocks the temp-file rename inside `graphify-out/`.
- **Fix**: No application source, tests, or live data changed. Verification for this task stands on the direct evidence: grep re-scan 0 offenders, `node --check` 29/29, `__tests__/e2e-safety.test.ts` 14/14. Treat the graph as not refreshed and resolve the `graphify-out` lock in a separate maintenance task.
- **Prevention**: Check that `graphify-out` is writable/not locked before relying on a refresh; only accept a graphify update when it exits successfully with the new graph written.
- **Related tasks**: E2E safety wiring
