# Regression Results

## E7 verification

- **Focused regression:** 28 test files, **276 passed**, 0 failed. This covers scoped persistence and adapter contracts, local IndexedDB drafts, feature gating, save status, legacy `/api/graph`, auth wiring, publishing compatibility, and selected navigation behavior. Log: `logs/focused-regression-vitest.log`.
- **Synthetic PostgreSQL workflow:** 1 test passed against the E5 local PostgreSQL 17 database. It performed migration, synthetic writes, conflict/replay checks, metrics, reconstruction, and owned-schema rollback. Log: `logs/postgres-editor-workflow.log`.
- **Focused ESLint:** exit 0, zero errors and warnings for the E7-touched files.
- **`git diff --check`:** passed. Git emitted only existing LF-to-CRLF normalization warnings for dirty files.

## Baseline comparison

Track E6 recorded 199 passes across 15 persistence/legacy files and 8 publish/navigation files. The E7 28-file selection includes those categories plus added local workflow coverage, but it is not a byte-for-byte identical file set; report the two passing totals separately rather than calling the difference a count of newly introduced tests or a full repository regression result. No failure appeared in the E7 focused selection. The known whole-repository TypeScript, ESLint, and Vitest issues recorded before E7 were not rerun or reattributed.

The first E7 integration connection attempt was denied by the command sandbox (`EACCES` to loopback) before reaching PostgreSQL. After turn-scoped network permission was granted for the already-approved local E5 test, the guarded workflow passed. A temporary assertion added for reconstructed content exposed an expected winning concurrent Building A edit; the harness was corrected to derive the winner and refresh route dependencies, then passed.
