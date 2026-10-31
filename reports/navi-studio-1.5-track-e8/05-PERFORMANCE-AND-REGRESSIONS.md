# E8 Performance and Regression Results

## Focused Vitest

Final E8 regression selection: **19 files / 196 tests passed**. Selection:

`mutation-auth`, `api-guard`, `scoped-campus-save`, `scoped-change-detection`, `scoped-postgres-adapter`, `scoped-postgres-runtime`, `scoped-save-request`, `scoped-save-client`, `scoped-save-document-session`, `scoped-history-dev-client`, `scoped-history-dev-route`, `studio-scoped-history-flag`, `studio-local-drafts`, `graph-store-local-drafts`, `SaveStatus`, scoped-save route, `/api/graph` route and lifecycle timeout, and `/api/publish` route.

This selection is not identical to E7's 28-file / 276-test set, so totals are not compared as an apples-to-apples delta. Final output is retained in `logs/focused-vitest.log`; E5 writer/reader test output is separately retained under `logs/integration-52b0f527cf0d4ddd86a6486bda762293/`.

## ESLint and TypeScript

- Focused ESLint on selected E8 services, route, tests, save status, bridge support, and floor editor: exit 0 with no output. The existing unrelated `any` event callback lint findings in `EditorBridge.tsx` were excluded from this clean focused selection and remain in the modified worktree.
- `npx tsc --noEmit --pretty false`: exit 2 with **1,126 diagnostics**. Output is retained in `logs/typescript-final.log`. Remaining diagnostics include the existing `/api/graph` route export check, editor test fixtures, and graph-store casts; the full repository typecheck remains unclean. The earlier implementation run also surfaced ignored extra fourth arguments at two `createEditorContext` call sites; those no-op arguments were removed.
- `git diff --check`: passed; Git printed four line-ending normalization warnings for dirty files.

## Browser test

Playwright passed **1 browser test**: GET and POST remain disabled by default before authentication or PostgreSQL access. The local Next server used fake localhost-only Supabase settings so the app root could render; no service listened at that placeholder address. The test result is documented in `logs/playwright-attempt.md`. Browser coverage for the complete editor save/recovery flow and publish compatibility is still required.
