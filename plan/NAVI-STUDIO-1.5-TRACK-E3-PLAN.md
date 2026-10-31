# NAVI Studio 1.5 — Track E3 Implementation Plan

**Goal:** Add a disconnected PostgreSQL implementation of the existing scoped-save contract and prove its intended transaction semantics with fakes.

**Architecture:** A private `navi_scoped` schema stores one campus revision head, current scope projections, immutable revision/operation/dependency records, idempotency receipts, and periodic full recovery checkpoints. A typed adapter receives an injected pool and trusted-server authorization/document-identity callbacks. It uses one campus transaction lock and writes every batch artifact in one transaction. A deterministic fake query client verifies emitted SQL and transaction behavior; no database connection is configured.

**Tech Stack:** TypeScript, Node `crypto` SHA-256, injected PostgreSQL query/pool interface, Supabase CLI migration-file generator, Vitest, PostgreSQL SQL proposal.

**Spec:** `spec/NAVI-STUDIO-1.5-TRACK-E3-SPEC.md`

## Global Constraints

- Do not execute the proposed migration or connect to any database.
- Do not install packages, expose credentials, or connect the adapter to any application route.
- Preserve `CampusDocument`, IndexedDB drafts, `/api/graph`, authentication, publish behavior, and all prior Track B–E2 edits.
- Do not edit migrations 001–015 or legacy graph tables.
- Use trusted server authorization; never trust client-provided role claims.
- Call simulated tests simulated; do not claim PostgreSQL ACID or real Development recovery.
- Do not reset, clean, stash, commit or push.

## Review Focus

- Lost acknowledgment after commit: replay an exact receipt before stale-revision rejection; changed request under the same ID must fail.
- One failed SQL step in a batch: rollback leaves committed head, scopes, receipts, changes, and checkpoints unchanged.
- Concurrent same-base commits: serialize with transaction-scoped PostgreSQL locking, not a process-local mutex.
- Malformed/noncanonical content or dependency digest: reject before durable writes and preserve structured error codes.
- Authorization or document identity mismatch: deny before mutations even if an input actor object claims administrator rights.

## Tasks

### T1 — Preflight and project contract (complete)

**Files:** Existing E2 contract and migrations; no implementation files.

- [x] Verify branch/HEAD, preserve dirty state, verify D6 archive hash, inspect free disk and confirm there is no local PostgreSQL runtime or existing `pg` dependency.
- [x] Identify `ScopedBatchCommitStore`, `ScopedSaveCandidate`, the in-memory E2 reference, and existing migration 010/011 responsibilities.
- [x] Query Graphify first; note that its current index returns stale unrelated nodes and use direct source for the contract.
- [x] Read relevant `ERRORS.md` prevention notes.

### T2 — Additive schema and rollback proposal (complete)

**Files:** A new generated file under `supabase/migrations/`, plus a matching explicit proposal under `supabase/rollback/`.

- [x] Use `supabase migration new navi_scoped_persistence_foundation` to create the forward-file name; write only repository SQL, never apply it.
- [x] Create campus heads, scoped heads, revision change sets/operations/dependencies, idempotency receipts, and checkpoint metadata/payload tables with composite keys and indexes.
- [x] Keep the schema private, enable RLS on owned tables, deny client roles, and conditionally grant only the server role the required operations.
- [x] Include comments for rollout assumptions, PostGIS non-interaction, compatibility, and a separately reviewed rollback sequence.
- [x] Test static migration invariants without connecting to a database (completed with T4's SQL contract test).
- **Prevention applied:** left migrations 001–015 and extension-owned PostGIS objects untouched; disabled Supabase CLI telemetry after its first attempt hit the blocked global state file.

### T3 — PostgreSQL adapter (complete)

**Files:** Create `src/services/scoped-postgres-adapter.ts` and its focused test.

- [x] Define small typed `Pool`/`Client` query interfaces and inject document-ID resolution, server authorization, timeout and checkpoint interval.
- [x] Implement contract reads, explicit bootstrap of a trusted baseline, single/batch transaction commit, receipt lookup, and checkpoint reconstruction.
- [x] Use parameterized SQL, `BEGIN`/`COMMIT`/explicit `ROLLBACK`, `set_config` timeouts, and `pg_advisory_xact_lock` per campus.
- [x] Recheck request/content checksums, document identity, trusted authorization, dependencies, stale base, no-op state and mutation uniqueness under the lock.
- [x] Persist all changed scope operations, receipts, campus-head advancement and any checkpoint in the same transaction; return acknowledgments only after COMMIT.

### T4 — Transaction fake tests (complete)

**Files:** `src/services/scoped-postgres-adapter.test.ts` and a test-only fake query pool.

- [x] Assert SQL values bind campus/scope/content/actor data separately from SQL text.
- [x] Inject failures at change-set, scope, operation, receipt, head and checkpoint stages; assert rollback and no committed fake state.
- [x] Cover exact retry replay, mutation-ID reuse, stale base, dependency/checksum mismatch, no-op, actor denial, identity mismatch and batch atomicity.
- [x] Run same-base concurrent calls at the controlled fake transaction boundary and prove one advances, one conflicts.
- [x] Verify checkpoint interval and reconstruct/checksum invariants from a stored checkpoint plus scope operations.

### T5 — Synthetic storage-efficiency measurements (complete)

**Files:** synthetic fixture and measurements in `src/services/scoped-postgres-adapter.test.ts`.

- [x] Measure serialized bytes for a complete synthetic campus and building, routing, and terrain projections.
- [x] Compare per-revision full-campus and scoped history growth at configured checkpoint intervals.
- [x] Measure synthetic reconstruction operation counts/time with deterministic fixtures and report the limits of the fake environment.
- [x] Select a documented configurable checkpoint interval based on tradeoffs, not a live database benchmark.

### T6 — Compatibility, verification, and reports (in progress)

**Files:** `reports/navi-studio-1.5-track-e3/00-SUMMARY.md` through `07-REAL-DATABASE-READINESS.md`, `progress/PROGRESS.md`, `errors/ERRORS.md`.

- [x] Run new adapter/efficiency tests, existing scoped/E2 regression tests, selected ESLint and TypeScript baseline comparison.
- [x] Keep flag-off browser smoke optional; no cloud services were contacted.
- [x] Verify no active route imports the new adapter and existing production/auth/publish defaults remain unchanged.
- [x] Write exact results, source paths, schema security/rollback review, synthetic measurements, and the next real-database/Development-backup gates.

## Execution order

T2 → T3 → T4 → T5 → T6. Touch only task-listed implementation files in each stage; log new errors immediately and return to verification before advancing.
