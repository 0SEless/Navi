# PLAN — P0 Single-User Sync Root Cause + Serialization (2026-09-13)

## Tasks

- **T1 — Reproduction tests (RED).** Add `navi-next/src/store/graph-store-save-queue.test.ts`
  with a deterministic mock RPC server (CAS semantics + optional legacy no-`updatedAt`
  response). Cases: sequential A→B→C; rapid overlapping saves; legacy revision
  confirm; unconfirmable revision; divergent external writer; failed save.
  Acceptance: run shows the overlapping/legacy cases failing against current code.
- **T2 — Per-campus save queue + revision contract fix.** Rework `syncToSupabase`
  into `enqueueCampusSave(mapId, force)` + `performSyncToSupabase(mapId, force)`.
  Queue policy: one in-flight POST per campus; at most one coalesced follow-up that
  re-reads the latest graph and expected revision at run time. Ack policy: use
  response `updatedAt`; else GET-confirm; else `error` (never `synced`); always write
  the authoritative revision to the marker after a confirmed success.
- **T3 — Update existing suites for the new contract.** `graph-store.test.ts`,
  `graph-store-road-routing.test.ts`, `graph-store-conflict.test.ts` fetch mocks must
  answer GET with a real snapshot+revision; adjust the local-clock test to the new
  "never synced without confirmed revision" contract.
- **T4 — E2E production-safety guard.** Add `navi-next/e2e/support/safety.ts`
  (`requireDisposableTestCampusId`) with protected-ID list incl. `map-map-1-k6bv`.
  Update `e2e/autosave-roundtrip.spec.ts` to require `E2E_CAMPUS_ID` instead of
  picking `maps[0].id`. Guard `e2e-p4-verify.mjs` against k6bv. Add
  `navi-next/__tests__/e2e-safety.test.ts` asserting the guard rejects the protected
  campus and the autosave spec cannot fall back to `maps[0]`.
- **T5 — Verification.** Focused vitest runs: new queue suite, store suites, e2e-safety
  suite. Report exact command + output. No production requests in any test.

## Error prevention (before coding)

- Read `errors/ERRORS.md` relevant entries: stale-closure async handlers; fingerprint
  normalization (`graphFingerprint` ignores `updatedAt`, sorts keys); test mocks that
  answer all methods with `{}` will now mis-handle the POST-time GET.
- Preventing: a POST-time GET hanging tests that stub `fetch` with a never-resolving
  promise; ensure the queue rejects (not hangs) on errors.

## Acceptance evidence

- RED output before the fix; GREEN after.
- `git diff` limited to graph-store, its tests, e2e safety files, and docs.
- No writes to `map-map-1-k6bv` or any production endpoint during this task.
