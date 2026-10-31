# Track E2 — Static Checks and Regression Results

## Focused tests

- Vitest: **15 files passed / 103 tests passed / 0 failed**. The final log is `logs/focused-vitest.log`. Vitest used one worker with `TEMP` and `TMP` directed to the existing repository-local `.tmp-vitest` directory after the restricted OS temp directory denied Vite cache renames with `EPERM`.
- Playwright flag OFF: **8 passed / 3 skipped / 0 failed**.
- Playwright flag ON: **9 passed / 2 skipped / 0 failed**.
- Browser result JSON and server log paths are recorded in `01-PLAYWRIGHT-HARNESS.md`.

## ESLint and syntax

The selected E2 integration, service, UI, page and test files passed focused ESLint with **0 errors and 0 warnings** (`logs/eslint-focused.log`). The selection excludes the pre-existing `EditorBridge.tsx` lint findings documented in E1: hook-ref and explicit-`any` findings outside the E2 changes. `node --check e2e/support/track-c1-local-server.mjs` passed.

## TypeScript

`npx tsc --noEmit --pretty false` exited 2 and returned **1,128 diagnostics**, matching the recorded E1/D6 baseline. The two TS2554 diagnostics surfaced by path matching in this run are inherited: E1 logs already report the same “Expected 3 arguments, but got 4” at the Floor Editor route and `EditorBridge.tsx` lines immediately preceding the E2 changes. No diagnostic was newly introduced by the E2 code. Full TypeScript success is not claimed.

## Graphify

`graphify update .` completed after the final source changes: **13,709 nodes / 28,685 edges / 772 communities**. Graphify skipped HTML output because the graph exceeds its 5,000-node visualization limit.

## Observed non-failing warnings

Next development output repeatedly logged the existing editor service teardown `AggregateError` on navigation/unmount. Browser assertions completed with zero failures; no teardown changes were made. The local server also logs expected synthetic quota/corrupt-draft messages from negative-path acceptance scenarios.
