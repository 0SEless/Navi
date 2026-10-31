# Regression results

- Focused Vitest: **12 files / 120 tests passed**. Coverage includes adapter, scoped save/batch/history, E2 dev client/route/flag, status UI, local draft gate, and graph-store local drafts. Full log: `logs/scoped-regression-vitest.log`.
- Focused ESLint across changed scoped-save contract and adapter sources/tests: **0 errors / 0 warnings**. Log: `logs/eslint-focused.log`.
- Full `npx tsc --noEmit --pretty false`: exits nonzero with **1,128 diagnostics**, matching the E2 baseline; zero diagnostics name E4 adapter, scoped-save contract, or batch-test modules. Log: `logs/typescript-current.log`.
- Route isolation search: no `scoped-postgres-adapter` or `PostgresScopedCommitStore` references under `src/app` or `src/components`.
- Browser smoke was not run: E4 changes no UI or active route, and unit/compatibility coverage passed. No active cloud-saving path was changed.

Existing `/api/graph`, IndexedDB, and publishing behavior remain outside E4 implementation changes. No cloud request, migration execution, PostgreSQL install, Docker/WSL startup, deployment, push, or Production operation occurred.
