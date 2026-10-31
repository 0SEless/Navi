# Regression Results

| Check | Result |
| --- | --- |
| Focused E8/local-draft Vitest | **PASS** — 6 files, 51 tests |
| Narrow E8 auth/route/session Vitest | **PASS** — 7 files, 59 tests |
| E5 writer + process-restart reader | **PASS** — 1 test in each process |
| Flags-off Playwright scoped endpoint smoke | **PASS** — 1 test; GET/POST disabled before auth/storage |
| E8.1 browser editor-to-E5 save/reload | **FAIL / incomplete** — normalized browser run timed out waiting for scoped-save POST; earlier two-scope run failed exact scope assertion |
| Focused ESLint | **PASS** on scoped persistence, auth route, tests, and harness files |
| ESLint including `StudioWorkspace.tsx` | **FAIL** on existing `react-hooks/set-state-in-effect` at line 202, outside E8 persistence changes |
| Repository-wide TypeScript | **FAIL** — 1,124 diagnostics versus recorded 1,126 baseline; no final E8-specific diagnostics |

The initial Vitest attempt failed before test execution because the sandbox temp path rejected Vite's atomic rename (`EPERM`). Re-running with `TEMP` and `TMP` redirected to `.tmp-vitest/e8-test-temp` passed. No dependencies were installed during this turn.

Detailed sanitized test and browser output is retained in `logs/`.
