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

## 2026-11-01 — Task 20 (owner: "Approve Task 20")
- Supabase project created: `navi-studio-v2`, ref `ztbnicoiwjghzttchqmp`, region `ap-southeast-1` (Singapore), org `gmikzinflknxypoddaiu`, Free plan — quoted cost $0/month (confirmed under the owner's Task 20 approval).
- The protected Development project `scvgulusmutnzasmgysx` is untouched.
- Schema applied to `ztbnicoiwjghzttchqmp` as 4 migrations (studio_v2_part1..4, the file split at top-level statement boundaries; the file's BEGIN/COMMIT dropped because each migration is its own transaction). Verified identical to the local test database: 154 schema objects, fingerprint `db3dd764ac1b10c928affdbda09e1fe3` on both (function bodies, columns, constraints, indexes, RLS, grants).
- Login role `navi_studio_server` (member of `navi_studio_api`; EXECUTE on the studio functions only, no prune, no table reads) — created WITHOUT a password; the owner sets it in the Supabase dashboard.
- Owner chose Vercel project `navi-dev-studio` (previews only; live site untouched) and admin login through the new project.
- `navi-dev-studio`: function region `sin1` (resourceConfig.functionDefaultRegions); Preview env: NEXT_PUBLIC_NAVI_SAVE_V2=1, NAVI_SAVE_V2_PUBLIC_READ=1, NAVI_STUDIO_ALLOWED_DB_REF=ztbnicoiwjghzttchqmp, NEXT_PUBLIC_SUPABASE_URL → https://ztbnicoiwjghzttchqmp.supabase.co (was the Dev project).
- Waiting on the owner (secrets never pass through tooling): NAVI_STUDIO_DATABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NAVI_STUDIO_DB_CA_PEM, NAVI_ADMIN_EMAILS, the navi_studio_server password, two admin accounts.
