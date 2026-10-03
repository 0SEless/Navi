# NAVI canonical reconciliation plan

Goal: Add a verified canonical deployment branch while preserving every recovery point.
Execution: Sequential native execution, as explicitly requested. Spec: spec/SPEC.md.
Global constraints: no force-push, reset, branch/tag/worktree deletion, production data mutation, or primary-tree edits.

T1 — Forensic inventory and relationship audit.
Files: progress/reconciliation/*, progress/PROGRESS.md, errors/ERRORS.md.
Acceptance: fetched tips; ancestry and patch-equivalence; root package versions; every unique commit classified; primary dirty-state snapshot.
Preventing: duplicated patches, lost dirty state, misleading evidence summaries.

T2 — Reconcile missing relevant work.
Files: exact source/test paths from each reviewed commit recorded in progress/reconciliation/matrix.json; spec/SPEC.md; plan/PLAN.md; TODO-CANONICAL.md; progress/*; errors/ERRORS.md.
Acceptance: deliberate cherry-pick or port with individual verification; no blind merge; preserve floor/wall/routing/persistence contracts. Before each import, read ERRORS.md.
Preventing: reverting newer authored persistence, incomplete store dependencies, obsolete topology changes.

T3 — Install and verification.
Files: generated node_modules/.next; progress/reconciliation/*; progress/PROGRESS.md; errors/ERRORS.md.
Acceptance: npm ci, build, full existing Vitest suite plus omitted relevant suites, operational lint, production GET smoke checks. Compare failures to untouched base. No production writes.
Preventing: skipped TypeScript validation, baseline failure misclassification, unverified runtime readiness.

T4 — Commit, push, remote/default/Hostinger readiness and safety audit.
Files: documentation and graph update outputs only; amend source plan before any necessary repair.
Acceptance: pushed SHA equals tested SHA; root app verified from origin; change default only with all prior gates passed and authenticated supported path; every original branch survives; original dirty-state comparison; explicit Hostinger detection scope.
Preventing: claiming remote operations succeeded without evidence, stale SHA, CLI auth confusion.

T2 repair scope amendment: src/components/studio/__tests__/InspectorMigration.test.tsx (reset authored fixture/session); imported src/store/__tests__/recovery-supersession.test.ts, refresh-recovery.test.ts, local-ahead-auto-resume.test.ts, local-draft.test.ts (adapt to atomic wait/retry/guarded floor unload contracts); packages/editor/src/__tests__/phase3a-authored-state.test.ts (correct explicitly lossy characterization); building-color-routing-persistence.test.tsx (assert current deduplicated projection).

T2 diagnostic amendment: temporary packages/editor/src/graph-adapter.baseline.ts and src/store/__tests__/canonical-baseline-diagnostic.test.tsx compare the imported production-road fixture against unmodified bead510 GraphAdapter. These temporary diagnostic files must not enter the release commit.
