# NAVI Studio 1.5 — Track D6 Plan

## T1 — Protect the worktree (completed before implementation)
- Files: external versioned archive; report `01-SOURCE-BACKUP-VERIFICATION.md`.
- Acceptance: inventory, secret/output exclusions, exact HEAD/branch, snapshots and patch, SHA-256 verification, extraction rehearsal.

## T2 — Preserve Docker evidence and assess local DB alternatives
- Files: external minimal local diagnostic package; D6 reports `02-DOCKER-DIAGNOSTICS.md`, `03-POSTGRES-ALTERNATIVES.md`.
- Acceptance: exact error and latest service/WSL state captured; no socket change/upload; native PostgreSQL/PostGIS, WSL, port/disk, admin, compatibility, isolation and cost described without installing or starting anything.

## T3 — Harden the scoped-save transaction contract
- Files: `src/services/scoped-campus-save.ts` and focused tests.
- Acceptance: validate candidate identity/checksums/dependencies; scope idempotency by campus; atomic result types represent replay/no-op/conflicts; preflight reads cannot substitute for transactional CAS; preserve immutable acknowledgment binding.

## T4 — Add a local-only scoped history rehearsal
- Files: `src/services/scoped-campus-history.local.ts` and `src/services/scoped-campus-history.local.test.ts` (the worktree ACL denied creation of a new child directory).
- Acceptance: no DB/network imports; in-memory campus CAS; scope-specific replace operations with checksums; per-campus mutation receipts; periodic checkpoints; verified deterministic reconstruction; concurrent edit and failure tests.

## T5 — Verify, log, and report
- Files: focused source tests; `errors/ERRORS.md`, `progress/PROGRESS.md`; `reports/navi-studio-1.5-track-d6/00-SUMMARY.md` through `06-REMAINING-CLOUD-GATES.md`.
- Acceptance: focused tests and scoped lint evidence; compare results with known baseline; graph update; no migration/cloud/production operation.

## Error prevention before implementation

Relevant ledger entries: Windows Vite cache rename EPERM (use one worker and local temp), delayed ACK certification of newer edits (candidate/checksum binding), and inherited full-suite failures (focus tests and compare baseline). Keep the reference store unreferenced from runtime routes.


