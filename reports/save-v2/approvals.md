# Save v2 approvals and baselines

## Task 0 approval

Task 0 approved by owner 2026-10-31: local Track A snapshot commit 74c3219 (not pushed), worktree .navi-worktrees/navi-save-v2 on feat/save-v2, local disposable container navi-savev2-pg on 127.0.0.1:55434

## Baselines measured 2026-10-31 (on commit 74c3219, before any config change)

Vitest (`vitest run`, default config, jsdom):

| Measure | Count |
| --- | --- |
| Test files | 618 |
| Test files that failed to load | 2 |
| Test files with at least one failing test | 20 |
| Tests total | 6322 |
| Tests passed | 6272 |
| Tests failed | 42 |
| Tests skipped | 8 |

The 2 files that fail to load are `__tests__/walking-skeleton.test.ts` and `src/services/__tests__/compiler-adapter.test.ts`. Both import `packages/editor/src/demo/golden-campus`, which does not exist. This is baseline state, not a Save v2 regression.

Three of the 6272 passed tests share a file and name with another test, so the gate compares 6269 unique lines. A second full run with the new `vitest.config.ts` produced the same 6269 unique passed lines (gate exit 0). Running the suite rewrites tracked files `demo-output/manifest.json`, `demo-output/navigation.graph.json` and `packages/compiler/src/__tests__/__snapshots__/compile-v2-regression.test.ts.snap`; restore them with `git checkout --` after a run.

The committed baseline is `baseline-vitest-passed.txt`: one sorted line per passed test (`<repo-relative test file> > <full test name>`). The raw vitest JSON lives in `reports/save-v2/raw/` and is git-ignored.

TypeScript (`tsc --noEmit -p .`): 1122 diagnostics matching `error TS` (`baseline-tsc.txt`).

## Test database

Container `navi-savev2-pg`, image `postgres:17-alpine` (the plan's `postgres:17` is not present locally; nothing was pulled), bound to 127.0.0.1:55434 only, restart policy `no`. Database `navi_savev2_test` carries the comment marker `navi-savev2-synthetic-v1`. The password is generated into `%LOCALAPPDATA%\navi-savev2\pg-password.txt` and is not recorded here.
