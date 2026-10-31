# Regression and Repository Results

## Focused E5 checks

- Real PostgreSQL adapter integration: 1 passed.
- Complete E5 SQL/concurrency/dump/restore/rollback harness: PASS.
- PowerShell parser, Node syntax checks, `git diff --check`, and `npm ls pg --depth=0`: PASS. `git diff --check` emitted only existing LF-to-CRLF working-copy warnings.

## Repository-wide checks

- `npm test -- --reporter=dot`: **607 test files; 587 passed, 20 failed; 6,190 tests passed, 34 failed, 8 skipped**. Full output: `logs/project-vitest.log`.
- `npm run lint`: **failed**; 13,200 problems (1,556 errors, 11,644 warnings). Full output: `logs/eslint.log`.
- `npx tsc --noEmit --pretty false`: **failed** with 1,128 TypeScript diagnostics. Full output: `logs/typescript.log`.

Examples in the Vitest failures include missing `packages/editor/src/demo/golden-campus` imports, compiler/routing assertions, legacy campus recovery, and existing route/editor tests. Lint and TypeScript failures are repository-wide. No clean pre-change baseline was run, so this report does not label the broad failures as introduced by E5.2 or as pre-existing.

## Worktree preservation

Branch and HEAD remain `codex/navi-studio-1.5-track-a-20261027` / `bead5101fc853959f99f7aabcdba72423f48f839`. The D6 archive hash was reverified. The prior dirty work was preserved. E5.2 changes are limited to the exact `pg` dependency/lock, E5 integration tooling/config and the E5.2 reports/logs. Nothing was committed, pushed, or deployed.

