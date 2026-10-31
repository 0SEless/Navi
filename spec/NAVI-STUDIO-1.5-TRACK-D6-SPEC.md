# NAVI Studio 1.5 — Track D6 Specification

## Goal
Protect the existing uncommitted Track B–D5.1 work, document a Docker-independent PostgreSQL path, and advance the scoped campus persistence contract using local-only synthetic state.

## Acceptance criteria

1. A versioned archive outside the worktree contains exact HEAD/branch provenance, a binary patch for modified tracked files, exact snapshots of modified tracked files and selected untracked source/report files, SHA-256 manifests, and a successful extraction rehearsal. Secrets, environment files, database dumps, caches, outputs, and dependencies are excluded.
2. Docker error evidence and resource-preservation limits are documented without modifying the Secrets Engine socket or uploading diagnostics.
3. Native PostgreSQL/PostGIS and existing WSL feasibility is assessed from local inventory. No packages are installed and no WSL distribution is started.
4. Scoped persistence remains isolated and unused by application routes. A local in-memory implementation demonstrates campus-wide CAS, scoped change sets, campus-scoped idempotency receipts, dependency validation, append-only revision history, checkpoints, reconstruction, and retry behavior.
5. Focused tests for concurrency, idempotency, dependencies, reconstruction, integrity failures, and existing scoped-save contracts pass. Existing full-suite failures are reported separately.
6. `/api/graph`, migrations, cloud configuration, and Production behavior remain unchanged.

## Known pitfalls

- Windows Vitest cache rename failures: use one worker and task-local temp/cache paths.
- An acknowledgment only applies to the exact immutable candidate that was submitted.
- The full-suite baseline already has inherited failures; do not attribute them to D6 without evidence.
- Docker's current Windows error 1920 is not permission to modify its socket.
