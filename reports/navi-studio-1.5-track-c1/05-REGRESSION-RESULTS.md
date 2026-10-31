# Regression Results

## Focused tests

- Final targeted editor/persistence matrix: 10 files / 84 tests passed.
- Broader focused persistence matrix: 17 files / 113 tests passed.
- Focused header/model/store slice: 3 files / 34 tests passed.
- Public editor context selector suite: 12 files / 153 tests passed.
- The runtime identity-comparison file parses after the TS1005 repair, but its suite is explicitly skipped: 61 skipped, 0 executed.
- Local Playwright: enabled mode 6 passed / 1 skipped; disabled mode 1 passed.

The counts are from distinct targeted runs and must not be summed as unique tests. Full TypeScript remains nonzero; see `01-TYPESCRIPT-AND-BUILD-REPAIRS.md`.

## ESLint

- `eslint` on `e2e/track-c1-local-drafts.spec.ts`, `e2e/support/track-c1-local-server.mjs`, and `playwright.track-c1.config.ts`: 0 errors / 0 warnings.
- Wider scoped lint JSON: 28 errors / 11 warnings across the selected changed-file set. Findings are in pre-existing portions of `src/components/floor-editor/FloorEditor.tsx` and `src/components/studio/EditorBridge.tsx`; no broad cleanup was made. Full details are in `logs/eslint-final.json`.

## Build and diagnostics

- Production Webpack build: PASS (exit 0).
- Full TypeScript: FAIL/PARTIAL at 1,128 diagnostics versus 1,129 baseline.
- Browser service cleanup: Next dev server logged an unresolved aggregate destroy error during some teardown paths; browser assertions passed.


## Continuation verification - 2026-10-29

Commands and fresh evidence:
- Focused persistence matrix: 17 files / 114 tests passed.
- Editor context: 12 files / 153 tests passed; selector/export test after helper rename: 1 file / 3 passed.
- Floor Editor suites initially failed 12 tests because both graph-store mocks omitted isStudioLocalDraftModeEnabled. Added a false-returning mock export in each file; rerun passed 2 files / 12 tests.
- Full Vitest final rerun: 20 failed files, 579 passed; 34 failed tests, 6,094 passed, 8 skipped (6,136 total). This matches the saved Track B baseline of 34 failing tests; the two extra suites/12 tests seen before the mock fix are resolved. Full log: logs/full-vitest-final-20261029.log.
- A serial full-suite attempt was stopped after several minutes with no useful completion; the normal-worker rerun above completed in 153 seconds. It is not counted as a test result.
- TypeScript: 1,128 diagnostics, exit 2; zero normalized diagnostic differences from the prior C1 current log. Full log: logs/typescript-continuation-20261029.log.
- Production Webpack build: exit 0 using inert loopback configuration. Log: logs/production-webpack-continuation-20261029.log.
- Browser acceptance: enabled 6 passed / 1 skipped; disabled 1 passed / 6 skipped. Interrupted IndexedDB write termination was not exercised in-browser. Existing UI screenshots remain under logs/.
- Scoped ESLint: 5 errors / 8 warnings across selected legacy Floor Editor test lines and selector warnings; the helper hook itself has no Hook-rule errors after rename. Harness-only ESLint was previously 0/0.
- git diff --check: PASS.

Final overall result: **PARTIAL**. Full-suite failures are at the historical baseline; TypeScript and the skipped runtime assertions still prevent a clean verification claim.

