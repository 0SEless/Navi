# Track D6 — Scoped Persistence Implementation

## Changes

- `src/services/scoped-campus-save.ts`: tightened immutable candidate/dependency validation; made mutation lookup campus-scoped; modeled atomic commit outcomes for commit, replay, unchanged state, and typed conflicts; delegated no-op and dependency/CAS checks to the atomic store boundary; required acknowledgments to advance exactly one revision.
- `src/services/scoped-campus-history.local.ts`: added an in-memory local-only reference store with campus-wide CAS, per-campus mutation receipts, atomic dependency checks, scoped replace operations, append-only change sets, periodic full checkpoints, checksummed deterministic reconstruction, and integrity failure reporting.
- Focused tests cover concurrent CAS edits/retries, campus-scoped idempotency, unchanged state, dependency revalidation, checkpoint/history reconstruction, checksum corruption and lost-response replay.

The module is not connected to app routes. A code search found only its own import of `scoped-campus-save`; the existing `/api/graph` path remains the active compatibility path and its regression tests passed. No schema migration, database adapter, or cloud configuration was added.

## Runtime limitation

This is an in-memory contract rehearsal. It does not persist across process restart and is not a production store. A durable backend still needs a reviewed database transaction implementing campus CAS, dependency validation, idempotency receipt storage and scoped history atomically, plus an authorized migration/review and Development restore rehearsal.

## Verification

Five focused files passed 44/44 tests; ESLint passed on all four D6 service/test files. The local module remains isolated from route imports. TypeScript still exits 2 at the repository baseline of 1,128 diagnostics; no D6 module was named in diagnostics.
