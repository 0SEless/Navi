# NAVI E8 Authenticated Durable Scoped Persistence — Design

**Date:** 2026-10-30  
**Status:** Awaiting owner design approval  
**Workspace:** `C:\Users\Administrator\Desktop\CODEme\Navi\.navi-worktrees\navi-studio-1.5-track-a-20261027`

## Intent

Advance the existing editor-attached scoped history from a development-only in-memory observer to an opt-in authenticated save boundary backed by the E5 synthetic PostgreSQL database. This gives the editor a recoverable, durable scoped-save proof without connecting the persistence path to Supabase Development or Production.

## Goals

- Verify the request user through NAVI's existing server-side Supabase SSR `auth.getUser()` mechanism.
- Require a verified global administrator for this first iteration. `super_admin` and the existing server allowlist qualify; `campus_admin` and editor roles are denied until a trusted campus ACL exists. Always retain the protected-campus deny guard.
- Keep request authentication and campus authorization injectable for synthetic tests.
- Persist candidates through `PostgresScopedCommitStore` against only the isolated E5 database, with exact E5 identity checks before a connection is allowed.
- Validate request shape, size, campus/document identity, scopes, dependencies, and checksums on the server. Never accept a client actor, admin flag, canonical document ID, or checksum as authoritative.
- Preserve drafts through network failure, conflict, malformed acknowledgment, and ambiguous commit outcomes. Clear dirty state only after an exact durable receipt is verified.
- Keep the legacy save path and publishing path intact. Keep the new mode disabled by default and visibly labeled local/synthetic rather than cloud-saved.
- Demonstrate actual PostgreSQL process-restart reconstruction, authorization, concurrency, retry, mutation collision, rollback, and editor draft recovery.

## Non-goals and anti-goals

- No Supabase data access, export, migration, write, or Production operation.
- No Vercel change, deployment, GitHub push, or change to D2 Docker resources.
- No replacement or weakening of `/api/graph`.
- No default enablement of scoped persistence; no publishing cutover.
- No trusting mock-cookie campus identity, browser-provided role, or client-provided actor.
- No deletion of E5 Docker resources or broad database cleanup.

## Current state and constraints

- `StudioScopedHistoryBridge` observes `document.changed` and sends changes to `/api/dev/scoped-history`. That route is loopback-only, in-memory, and uses a fixed local actor; it is not a durable save acknowledgment.
- `scoped-campus-save.ts` builds canonical checksummed candidates and verifies acknowledgments. `scoped-change-detection.ts` projects and classifies supported document edits. The graph store persists IndexedDB drafts and serializes draft writes.
- `scoped-postgres-adapter.ts` already supports atomic batches, campus revision CAS, dependency checks, immutable receipts, replay/collision detection, append-only change records, checkpoints, and deterministic reconstruction. E7 exercised it against E5 PostgreSQL 17.11.
- `requireVerifiedMutationAuth` calls Supabase SSR `auth.getUser()` and enforces NAVI admin identity, but currently returns only an HTTP denial response or `null`; it does not return the verified principal. It also treats `campus_admin` as globally privileged and does not resolve campus membership.
- The owner selected a fail-closed E8 authorization rule: verified global admins only until a trusted campus ACL is added. The owner also selected a shared verified-principal helper while retaining the existing route helper contract.
- `pg@8.23.1` and the E5 protected runner secret are already available. E5 is bound to `127.0.0.1:55433`, database `navi_e4_test`, PostgreSQL 17.11, role `navi_e4_runner`, marker `navi-e4-synthetic-v1`. D2 remains protected.

## Approaches

1. **Duplicate auth inside a new route — rejected.** It would leave `/api/graph` untouched, but duplicate session verification and create a second place for NAVI's auth policy to drift.
2. **Expose a reusable verified principal from `api-guard` and add a separate scoped route — selected by the owner.** Preserve `requireVerifiedMutationAuth` as a compatibility wrapper for existing routes, add an injectable server-auth seam returning only the verified user identity/role, and build the new route on it. This shares cryptographic verification without changing `/api/graph` behavior.

## Design

### Authenticated boundary

Add a helper in `src/lib/api-guard.ts` (or a focused sibling module if needed to avoid disturbing current route behavior) that returns a discriminated result: verified principal or typed unauthorized/forbidden response. Production Supabase sessions are verified with `auth.getUser()` through the existing SSR client. Test callers inject the verifier. The new scoped route uses the verified server-returned user ID and role only.

The scoped policy allows `app_metadata.role === 'super_admin'` or an email accepted by the existing server-only `NAVI_ADMIN_EMAILS` allowlist. It does not accept `campus_admin`, `mapping_staff`, mock user campus IDs, or body claims as campus authorization. The route hard-denies every ID in `PROTECTED_CAMPUS_IDS` without the legacy server override. Authorization is evaluated before connecting to PostgreSQL.

### Isolated E5 route and connection guard

Add a separate POST endpoint, for example `/api/studio/scoped-save`, behind `NAVI_STUDIO_DURABLE_SCOPED_SAVE=1` and `NODE_ENV=development`; the browser feature also requires `NEXT_PUBLIC_NAVI_STUDIO_DURABLE_SCOPED_SAVE=true` plus the existing scoped-history and IndexedDB draft flags. Default behavior is disabled/404. Use a lazy server-only `pg.Pool` and dedicated `NAVI_E5_PG_*` connection variables. Refuse remote hosts and any host, port, database, role, or marker other than the verified E5 synthetic values. Before serving a commit, check `current_database()`, `session_user`, server major version, and the database comment marker. Never return connection settings or raw SQL errors to clients.

No public bootstrap endpoint is added. Synthetic campus baselines are created by the test harness with a test-only trusted initializer and unique IDs. An uninitialized campus returns a typed not-found conflict. The new route does not migrate legacy snapshots or ingest real campus data.

### Request and commit contract

The request is bounded JSON containing a campus ID, expected campus revision, and 1–32 scoped operations. Each operation includes its mutation ID, scope, content, and dependency references. Reject oversized bodies before parsing; validate canonical IDs, supported scope kinds, duplicate scopes/IDs, finite JSON content, dependency count/shape, and campus agreement. Recompute content/request/batch checksums server-side. Derive canonical document ID as `campus:${campusId}`; ignore or reject any client-supplied actor, admin flag, or alternate document ID.

Convert validated operations into immutable `ScopedSaveCandidate`s and commit the complete request through `commitBatchAtomically` in one PostgreSQL transaction. The adapter serializes a campus lock, checks the expected campus revision, rechecks dependency revisions/checksums, writes operations and immutable receipts, advances the head, and creates checkpoints according to its configured interval. A transaction failure rolls back all operations. If commit acknowledgment is ambiguous, return a retryable/unknown outcome; the client must retry the exact same mutation IDs and bytes. Receipt lookup resolves the outcome without creating another revision. Changed-payload reuse is a conflict.

On success, return only exact receipt data: campus ID, revision, mutation ID, request/content/batch checksums, commit timestamp, and committed state. The client runs the existing acknowledgment verifier against every candidate and only then advances its committed baseline/status. Conflicts preserve the IndexedDB draft and report the current durable revision without overwriting local state.

### Editor and draft integration

Extend the opt-in scoped client to call the durable route when the durable flag is active; keep the existing local-history route available as an explicitly local reference mode. Coalesce the current 400 ms burst of change events and support atomic multi-scope operations. The durable path must run through the existing editor save/meaningful-save boundary rather than issuing a database revision for each pointer/brush event. IndexedDB remains the recovery source until the exact server acknowledgment is validated. Status labels distinguish local draft, saving, durably committed to the local E5 synthetic store, failed, conflict, and legacy/cloud status; never label E5 as cloud saved. Publishing continues to consume the existing complete `CampusDocument` and uses the existing publish route.

### Durable synthetic acceptance

The E5 harness may apply only `20261030045317_navi_scoped_persistence_foundation.sql` to the exact verified E5 database if the schema is absent. It must never drop the schema or delete E5 rows/resources as generic cleanup. Use unique synthetic campus IDs and retain the synthetic proof records. Exercise the HTTP boundary with injected trusted-auth and campus-policy dependencies, then make real PostgreSQL reads for head, receipts, operations, and reconstructed document.

For restart durability, run a writer in one Node process, terminate it cleanly, then launch a separate reader process and reconstruct by campus ID/revision from PostgreSQL. Test a lost response by committing and intentionally withholding the response, then retry exact bytes and verify replay; a changed payload using the same mutation ID must conflict. Test concurrent CAS writers with independent connections. Browser/IndexedDB tests use synthetic campus documents only and confirm a failed/conflicting response leaves the draft recoverable. Existing legacy API and publishing tests run with both new flags disabled.

### Errors and observability

Map typed failures to stable HTTP responses: 401 unauthenticated, 403 unauthorized, 400 malformed/oversized, 404 disabled or uninitialized synthetic campus, 409 stale/dependency/mutation conflicts, and 503 unavailable local database or `COMMIT_OUTCOME_UNKNOWN`. The unknown outcome response instructs the client to retry the exact same request and mutation IDs; the receipt lookup resolves whether the transaction committed. Do not expose SQL, stack traces, credentials, host details, or tokens. Log request correlation ID, outcome code, latency, campus ID only where permitted, revision, and mutation IDs; never log content or secrets.

## Migration readiness deliverable

Create a separate E8 migration-readiness report covering snapshot-to-scope conversion, route/entrance ID preservation, revision/receipt backfill, publishing compatibility, authorization/RLS, cutover/rollback, and recovery prerequisites. Mark production data mapping, cloud RLS changes, and cutover as future gates. Do not apply any Supabase migration.

## Verification plan

- Route and service tests: missing/invalid auth, verified global admin, verified campus admin denied, wrong/protected campus, spoofed actor/document, malformed/oversized body, dependency and checksum rejection, exact acknowledgment, safe errors.
- Adapter/E5 tests: atomic multi-scope commit, rollback, CAS race, replay, mutation collision, cross-campus isolation, dependency conflicts, checkpoint reconstruction, server restart readback.
- Editor tests: meaningful save candidate, coalescing, local draft persistence, failure/conflict retains draft, exact acknowledgment alone advances durable status, legacy behavior when disabled, publishing compatibility.
- Run the E7 276-test selection plus E8 additions, focused ESLint, TypeScript check compared with known baseline, and feasible Playwright synthetic acceptance. Report inherited repository failures separately.
- Preserve branch, HEAD, dirty worktree, D6 archive, E5 container/network/volume, and D2 resources.

## Open implementation calls

- Use the existing E5 credential only in the local test/run environment; do not add secrets to the repository or `.env.example` values.
- The scoped route is local synthetic infrastructure. Supabase authentication is verified through the established mechanism in application code; automated E8 tests inject authentication and make no Supabase Auth or database network calls.
- Keep the route's runtime default off and refuse non-loopback PostgreSQL configuration, even if an operator sets the feature flag in another environment.
