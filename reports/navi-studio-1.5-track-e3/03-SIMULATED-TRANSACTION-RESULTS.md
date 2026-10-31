# Simulated transaction results

Focused adapter suite: **19 passed, 0 failed**. It verifies bootstrap, trusted actor rejection, parameter binding, identity mismatch rollback, valid checksums, dependencies, no-op, exact retry replay before stale checks, mutation-ID reuse, batch atomicity, injected failures, campus-lock concurrency behavior, checkpoints, reconstruction, and static migration/rollback invariants.

Failure injection covered change-set, scope-head, operation, receipt, campus-head, and checkpoint writes; each left the committed fake state unchanged and recorded rollback. Same-base concurrent fake calls produced one commit and one stale conflict. The fake models transaction-local state and lock visibility intentionally; this is not a PostgreSQL conformance test and does not prove database isolation, durability, RLS, or recovery.

Logs: `logs/adapter-efficiency-vitest.log` and `logs/scoped-regression-vitest.log`.
