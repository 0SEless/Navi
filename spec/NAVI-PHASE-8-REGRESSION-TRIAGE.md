# NAVI Phase 8 — Regression Triage and Stabilization

## Goal

Classify the 67 failures recorded by Phase 7 against a clean recovery checkpoint, fix only reproducible integration regressions, and report the remaining verification gates without overstating readiness.

## Success criteria

1. Current branch, source state, dirty artifacts, compiler snapshot, test command, and test configuration are verified and preserved.
2. Comparable failures are rerun at the integration checkpoint and clean recovery checkpoint under the same isolated settings.
3. Every original failure is assigned an evidence-based category; missing evidence remains unresolved.
4. Only confirmed integration regressions are repaired in small reviewed batches and committed locally.
5. Final test, lint, typecheck, build, worktree, and Development-storage limitations are reported accurately.

## Relevant pitfalls

- Phase 7 left 67 failures without complete baseline comparison.
- Phase 6 classified six public-store assertions and Phase 4 classified a stale Navigate simulator expectation; do not treat them as regressions without new evidence.
- Repository lint/typecheck/build have recorded baseline or missing-public-environment blockers.
- On this Windows runner, Vitest may need worktree-local `TEMP` and `TMP` to avoid an `EPERM` before collection.
- Preserve existing Playwright artifacts and do not alter the compiler snapshot whose content hash matches `HEAD`.
