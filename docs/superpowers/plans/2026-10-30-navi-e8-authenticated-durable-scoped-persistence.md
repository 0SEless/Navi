# NAVI E8 Authenticated Durable Scoped Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, server-authenticated scoped-save endpoint backed only by the E5 synthetic PostgreSQL database, connect it to Studio without changing legacy saves/publishing, and prove restart durability and recovery.

**Architecture:** Reuse NAVI's verified Supabase principal through a shared `api-guard` result while preserving `requireVerifiedMutationAuth` for current callers. A distinct, disabled-by-default local route enforces global-admin and protected-campus rules, validates canonical candidates, and delegates atomic writes to `PostgresScopedCommitStore` using a loopback/E5 identity-checked pool. The Studio client validates exact acknowledgments and retains IndexedDB drafts on every unsuccessful or ambiguous outcome.

**Tech Stack:** Next.js App Router, TypeScript, Supabase SSR `auth.getUser()`, `pg@8.23.1`, existing scoped-save services, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-30-navi-e8-authenticated-durable-scoped-persistence-design.md`

## Global Constraints

- Do not connect the new persistence path to real Supabase Development or Production; automated tests inject authentication and make no Supabase Auth or database network calls.
- Run live PostgreSQL acceptance only against E5 `127.0.0.1:55433`, database `navi_e4_test`, role `navi_e4_runner`, marker `navi-e4-synthetic-v1`, PostgreSQL major 17.
- If absent, apply only `supabase/migrations/20261030045317_navi_scoped_persistence_foundation.sql` to that exact E5 database; never drop the E5 schema, delete E5 data, or modify Docker resources.
- The new browser and server flags default off; server requires `NODE_ENV=development`; the route rejects remote or non-E5 PostgreSQL configuration.
- Authorization accepts verified `super_admin` or server allowlisted identities only; deny campus roles without a trusted campus ACL and unconditionally deny protected campus IDs on this route.
- Never accept client actor, role, administrator flag, or canonical document ID as trusted; derive actor/document identity server-side and recompute checksums.
- Preserve `/api/graph`, current legacy saves, publishing, IndexedDB recovery, dirty worktree, D6 archive, E5 resources, and D2 resources.
- Keep E5 save status explicitly local/synthetic; never call it a cloud save or enable the path by default.

## Review Focus

1. **Auth/session spoofing or Supabase auth outage** — tests prove no cookie, invalid identity, auth failure, or client role claim cannot reach the database; verified identity is returned only from the injected/server verifier.
2. **Campus/document confusion or protected campus ID** — route tests prove mismatch and every protected campus are rejected before pool acquisition.
3. **Oversized/malformed JSON, invalid scope, or forged checksum** — route tests prove bounded parsing and server-side candidate validation return safe typed errors.
4. **Concurrent commit, lost response, or changed-payload replay** — PostgreSQL tests prove one CAS winner, exact retry receipt replay, collision rejection, and no partial atomic batch.
5. **Draft or route dependency lost during failure/reload** — client/Playwright tests prove IndexedDB retains the submitted document, only exact acknowledgments advance baseline, and a route with stale building dependencies conflicts until refreshed.

---

### Task 1: Return the verified principal without changing legacy auth behavior

**Files:**
- Modify: `src/lib/api-guard.ts`
- Test: `src/lib/__tests__/mutation-auth.test.ts`

**Interfaces:**
- Produces: `verifyMutationPrincipal(request: NextRequest, options?: VerifyOptions): Promise<VerifiedPrincipalResult>` where the success branch contains server-verified `{ id, email, role, method }` and failures contain the existing 401/403 response.
- Existing `requireVerifiedMutationAuth(request, options)` remains a compatibility wrapper returning `NextResponse | null` with byte-for-byte response contracts unchanged.

- [x] **Step 1: Add tests** for a verified `super_admin` principal result, unauthenticated/invalid-session denial, auth service failure, mock-user identity, and unchanged `requireVerifiedMutationAuth` behavior.
- [x] **Step 2: Run RED** with `npx vitest run src/lib/__tests__/mutation-auth.test.ts --reporter=dot`; confirm new result API is absent.
- [x] **Step 3: Implement** the shared verifier using current SSR `auth.getUser()` and `supabaseFactory` injection. Do not change the existing test-runtime seam or caller contract.
- [x] **Step 4: Run GREEN** on the same test file and confirm all existing auth tests pass.

### Task 2: Add fail-closed scoped authorization policy

**Files:**
- Modify: `src/lib/api-guard.ts`
- Test: `src/lib/__tests__/mutation-auth.test.ts`

**Interfaces:**
- Produces: `authorizeScopedSave(principal: VerifiedMutationUser, campusId: string): ScopedSaveAuthorizationResult`.
- Allows only verified `app_metadata.role === 'super_admin'` or the existing server-only `NAVI_ADMIN_EMAILS` allowlist. Always denies `PROTECTED_CAMPUS_IDS`; denies campus/admin/editor roles until an authoritative campus ACL exists.

- [x] **Step 1: Add tests** for global admin allow, allowlisted identity allow, `campus_admin` deny, `mapping_staff` deny, mock identity deny, and protected campus denial even when the legacy override variable is set.
- [x] **Step 2: Run RED** for the new policy test.
- [x] **Step 3: Implement** `authorizeScopedSave` beside the existing protected-campus constants so this route's policy remains independently testable without changing the legacy override semantics.
- [x] **Step 4: Run GREEN** and existing `api-guard` mutation-auth tests.

### Task 3: Build the E5-only PostgreSQL runtime guard

**Files:**
- Create: `src/services/scoped-postgres-runtime.ts`
- Test: `src/services/scoped-postgres-runtime.test.ts`
- Modify: `package.json` only if `pg` is not already directly declared (currently `pg@8.23.1` exists).

**Interfaces:**
- Produces: `getE5ScopedPostgresPool(env = process.env): Promise<ScopedPgPool>` and `assertE5ScopedDatabaseIdentity(pool): Promise<void>`.
- Pool is lazy and process-shared; it accepts only `NODE_ENV=development`, server flag `NAVI_STUDIO_DURABLE_SCOPED_SAVE=1`, host `127.0.0.1`, port `55433`, database `navi_e4_test`, role `navi_e4_runner`; it verifies marker `navi-e4-synthetic-v1` and PostgreSQL major 17 before any commit.

- [x] **Step 1: Add tests** for disabled/default state, production refusal, remote-host refusal, wrong port/database/role refusal, missing credential refusal without secret output, and a successful identity check against an injected pool.
- [x] **Step 2: Run RED** for the runtime guard test.
- [x] **Step 3: Implement** the server-only lazy pool and identity query. Never include connection variables in errors or logs.
- [x] **Step 4: Run GREEN** with injected pools and `npx eslint` on the new runtime files.

### Task 4: Implement the isolated authenticated scoped-save route

**Files:**
- Create: `src/app/api/studio/scoped-save/route.ts`
- Create: `src/services/scoped-save-request.ts`
- Test: `src/services/scoped-save-request.test.ts`
- Test: `src/app/api/studio/scoped-save/__tests__/route.test.ts`

**Interfaces:**
- Request: `POST { campusId, expectedCampusRevision, operations: [{ mutationId, scope, content, dependencies }] }`, bounded to 1 MiB and 1–32 operations.
- Test seam: `handleScopedSaveRequest(request, dependencies)` where dependencies inject principal verification, campus authorization, and adapter/pool factory.
- Success: exact server acknowledgment array with campus, revision, mutation ID, request/content/batch checksums, timestamp, and `durable: true, storage: 'local-e5-synthetic'`.
- Errors: stable typed 401/403/400/404/409/503 responses, including `COMMIT_OUTCOME_UNKNOWN` instructing byte-identical retry.

- [x] **Step 1: Add tests** for disabled route before any auth/DB work; unauthenticated, unauthorized, spoofed actor/document, protected/wrong campus, malformed/oversized request, bad checksum, valid single/batch commit, stale/dependency conflict, and sanitized database failure.
- [ ] **Step 2: Run RED** on service and route test files. The service test file had a verified RED run; the newly added route test file did not get a separate pre-implementation RED run.
- [x] **Step 3: Implement** the separate route. Derive document ID as `campus:${campusId}`; recompute candidate checksums server-side; use `commitBatchAtomically`; never initialize or bootstrap from a browser-supplied baseline. Added a read-only authenticated GET for current synthetic revision/scope metadata; it does not initialize a campus.
- [x] **Step 4: Run GREEN** on both new test files and verify `/api/graph` auth tests remain green (61-test focused set passed).

### Task 5: Integrate exact acknowledgments and durable status in the scoped client

**Files:**
- Modify: `src/services/scoped-history-dev-client.ts` or extract `src/services/scoped-save-client.ts` if needed for clear separation.
- Modify: `src/services/scoped-history-dev-client.test.ts`
- Create or modify: `src/services/scoped-save-client.test.ts`
- Modify: `src/services/studio-scoped-history-flag.ts`
- Modify: `src/services/studio-scoped-history-flag.test.ts`

**Interfaces:**
- Add browser flag `NEXT_PUBLIC_NAVI_STUDIO_DURABLE_SCOPED_SAVE=true`, requiring existing local-drafts and scoped-history flags plus development runtime.
- Client state distinguishes `local-draft`, `saving`, `durably-committed-local`, `failed`, and `conflict`; it does not report cloud acknowledgment.
- Durable commit sends stable candidate bytes/mutation IDs and validates every acknowledgment through `verifyScopedCommitAcknowledgment` / `verifyScopedBatchAcknowledgments`.

- [x] **Step 1: Add tests** for exact acknowledgment, forged/mismatched acknowledgment, 409 stale response, network loss followed by exact retry/replay, and preservation of pending candidate bytes.
- [x] **Step 2: Run RED** for the durable client tests.
- [x] **Step 3: Implement** the opt-in durable client mode without changing local reference behavior or the legacy save API. Browser SHA-256 uses Web Crypto; pending request bytes are retained on uncertain outcomes.
- [x] **Step 4: Run GREEN** on new client tests and existing scoped client tests.

### Task 6: Connect the meaningful editor save boundary while preserving drafts

**Files:**
- Modify: `src/components/studio/EditorBridge.tsx`
- Modify: `src/components/studio/StudioScopedHistoryBridge.tsx`
- Modify: `src/store/graph-store.ts`
- Modify: `src/components/studio/SaveStatus.tsx` and `src/components/studio/save-status-model.ts` only as required for clear states.
- Test: related files under `src/components/studio/__tests__/` and `src/store/graph-store-local-drafts.test.ts`.

**Interfaces:**
- Durable mode routes a meaningful editor save through scoped candidates; coalesced `document.changed` notifications update the authoritative in-memory document and IndexedDB draft but do not directly create one PostgreSQL revision per pointer/brush sample.
- Only a complete, exact durable acknowledgment may advance the scoped committed baseline/status. Failed or conflicting operations retain the IndexedDB record and dirty generation.
- When flags are disabled, current `saveGraph`, `/api/graph`, and publishing behavior are unchanged.

- [ ] **Step 1: Add tests** for dirty draft before commit, coalescing, success acknowledgment clears only matching generation, edit-during-save keeps later edits dirty, conflict/network failure retains the draft, and disabled flags use the legacy save path. Existing draft-preservation tests and new session/client tests cover the main path; a full edit-during-save generation race test remains open.
- [ ] **Step 2: Run RED** on focused Studio and graph-store tests. No dedicated bridge-integration RED run was recorded before implementation.
- [x] **Step 3: Implement** the opt-in save bridge at the existing meaningful save boundary; do not place cloud/durable database behavior in pointer event handlers.
- [x] **Step 4: Run GREEN** on focused editor, draft, and SaveStatus tests.

### Task 7: Prove E5 persistence, transaction behavior, and process restart

**Files:**
- Create: `scripts/track-e8-postgres-integration/run.ps1`
- Create: `scripts/track-e8-postgres-integration/vitest.config.mjs`
- Create: `scripts/track-e8-postgres-integration/worker.mjs`
- Create: `scripts/track-e8-postgres-integration/postgres-acceptance.integration.test.mjs`
- Create logs/reports under: `reports/navi-studio-1.5-track-e8/logs/`

**Interfaces:**
- Runner reads only the existing protected E5 runner password file into a child process environment; secret contents never enter command lines or logs.
- If the E5 schema is absent, apply only the E4-owned approved migration after preflight. Retain migration/schema and synthetic rows; do not drop schema or delete rows.
- Writer process performs authenticated synthetic single/batch commits and exits. A separate reader process reconnects and verifies head, receipts, operation history, checkpoints, and reconstructed checksums.

- [ ] **Step 1: Add failing acceptance assertions** for authorization, cross-campus isolation, building/route batch, terrain, stale concurrent writers, exact replay, changed-payload collision, lost acknowledgment, rollback atomicity, and process-restart reconstruction. Terrain, batch/replay/stale/collision/reconstruction are covered; route authorization, cross-campus isolation, live rollback injection, and real lost-ack fault injection remain open.
- [ ] **Step 2: Verify RED** against an injected test adapter or empty schema before provisioning; confirm the expected contract failures. The live E5 phase was run green after the unit-level route/service RED/GREEN cycle; this database acceptance has no separate RED run.
- [x] **Step 3: Run guarded E5 preflight** for exact context/container/image/port/database/role/marker/schema state; stop on any mismatch. Do not touch Docker resources.
- [x] **Step 4: Apply only the approved E4 migration if absent**, run the integration acceptance against E5, preserve uniquely named synthetic proof records, and never print credentials.
- [x] **Step 5: Verify GREEN** from a separate Node process using direct PostgreSQL reads and complete reconstruction; save sanitized logs.

### Task 8: Browser acceptance, regression, lint, and type baseline

**Files:**
- Create: `e2e/track-e8-durable-scoped-save.spec.ts`
- Create: a focused Playwright config only if the existing E2E setup cannot run this spec without unrelated dependencies.
- Create: `reports/navi-studio-1.5-track-e8/05-PERFORMANCE-AND-REGRESSIONS.md`

- [ ] **Step 1: Add synthetic browser tests** for draft recovery after failed scoped save, opt-in status wording, successful acknowledgment state, concurrent stale conflict, flag-off legacy behavior, and complete document handoff to existing publishing compatibility seams without issuing a publish write. Only the disabled-by-default route test is authored; full browser cases remain open.
- [ ] **Step 2: Run RED** on the new E8 Playwright spec with all E8 flags initially disabled. Attempted but did not return a test result before the bounded run was interrupted.
- [x] **Step 3: Implement only integration fixes** required by those tests; preserve all non-E8 dirty changes.
- [x] **Step 4: Run focused Vitest**; final selection was 19 files / 196 tests. It is not identical to E7's 28 files / 276 tests, so no delta claim is made. Exact command and output are recorded in `reports/navi-studio-1.5-track-e8/logs/focused-vitest.log`.
- [x] **Step 5: Run focused ESLint and TypeScript check** for changed files/project baseline. Selected E8-focused ESLint passed; full TypeScript emitted 1,126 diagnostics, including existing route, editor-test, and graph-store issues.
- [x] **Step 6: Run Playwright synthetic acceptance** against local Next.js + E5 only where feasible; save logs and record any environment limitation. One default-disabled browser gate test passed; full editor workflow cases remain open.

### Task 9: Write E8 reports and migration-readiness gates

**Files:**
- Create: `reports/navi-studio-1.5-track-e8/00-SUMMARY.md`
- Create: `reports/navi-studio-1.5-track-e8/01-AUTHENTICATION-AND-SECURITY.md`
- Create: `reports/navi-studio-1.5-track-e8/02-DURABLE-SAVE-IMPLEMENTATION.md`
- Create: `reports/navi-studio-1.5-track-e8/03-EDITOR-INTEGRATION.md`
- Create: `reports/navi-studio-1.5-track-e8/04-POSTGRES-ACCEPTANCE.md`
- Create: `reports/navi-studio-1.5-track-e8/05-PERFORMANCE-AND-REGRESSIONS.md`
- Create: `reports/navi-studio-1.5-track-e8/06-MIGRATION-READINESS.md`
- Create: `reports/navi-studio-1.5-track-e8/07-REMAINING-GATES.md`

- [x] **Step 1: Record evidence** for legacy snapshot conversion, route/entrance identity handling, receipt/revision strategy, publishing compatibility, RLS boundary, cutover/rollback, and backup prerequisites. Missing production steps are explicit future gates.
- [x] **Step 2: Verify report claims** against saved test logs, E5 identity preflight, source diff, branch/HEAD, and preserved D2/D6/E5 resources.
- [x] **Step 3: Run final `git diff --check`** and report PASS/PARTIAL/BLOCKED without cleaning or resetting the worktree.

---

## Self-review

- **Spec coverage:** Authentication, campus authorization, size/input validation, typed errors, E5 runtime identity, atomic adapter contract, exact acknowledgments, editor/draft integration, process restart, performance, focused regression, Playwright feasibility, migration-readiness, and strict no-cloud prohibitions are mapped to Tasks 1–9.
- **Review focus:** All five high-risk input/failure classes have named tests in the owning tasks.
- **Type consistency:** Route request, auth result, E5 pool, authorization policy, service dependency seams, acknowledgment response, and browser client responsibilities are defined before downstream tasks.
- **Proportion:** The plan separates security, runtime, route, client/editor, database proof, and reports; no production/cloud deployment task is included.
- **Execution constraints:** Use the native sequential plan workflow; do not dispatch subagents. Each implementation step must follow test-first red/green verification.
