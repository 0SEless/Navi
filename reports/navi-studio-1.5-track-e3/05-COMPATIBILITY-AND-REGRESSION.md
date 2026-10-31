# Compatibility and regression

The adapter and E2/E1 scoped persistence regression set passed **8 files / 77 tests**. Focused ESLint for the adapter and its test passed with 0 errors and 0 warnings. The final 19-test adapter run includes static checks that the forward migration has no destructive DROP, no public legacy graph table changes, and no extension creation; the rollback has no executable `DROP ... CASCADE`.

Route-isolation search found no imports or uses of `scoped-postgres-adapter` / `PostgresScopedCommitStore` in `src/app` or `src/components`. The adapter therefore remains disconnected from `/api/graph` and E2's dev route. E1/E2 persistence and flag defaults remain in their existing code paths.

`npx tsc --noEmit --pretty false` exits 2 with **1,128 TypeScript diagnostics**, exactly matching the recorded E2 baseline. Full typecheck success is not claimed. Logs: `logs/typescript-current.log`, `logs/eslint-focused.log`, and `logs/scoped-regression-vitest.log`.
