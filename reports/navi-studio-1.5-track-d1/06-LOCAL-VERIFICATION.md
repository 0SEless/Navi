# Local Verification

## Focused tests

Command used from the authorized worktree:

```powershell
npx vitest run src/services/scoped-campus-save.test.ts packages/editor/src/services/__tests__/persistence-service.test.ts src/lib/__tests__/mutation-auth.test.ts src/app/api/publish/__tests__/route.test.ts --reporter=dot --pool=threads --maxWorkers=1
```

**Result:** exit code 0; 4 test files passed, 38 tests passed. Duration 6.94s. Temporary directory was `.tmp-vitest/trackd1-temp` to avoid the Windows Vitest cache rename issue. Publishing tests used mocks; output labels are not evidence of a live Supabase write. No full test suite or broad TypeScript build was run.

## SQL/tool feasibility

Supabase CLI `2.111.0` help was read with telemetry disabled; dump syntax flags were confirmed. First help attempt failed only because CLI attempted to write telemetry under the protected user profile. Docker Desktop Linux engine was unavailable, `psql` and SQL parser/linter were absent. Consequently, SQL was not executed or parser-validated. Static review only. All SQL is marked proposed or read-only postflight; checksums are recorded in `07-APPROVAL-CHECKLIST.md` after generation.

## Scope

The local checks cover existing scoped-save/persistence/auth/publishing contracts. They do not prove Vercel-to-Supabase isolation, backup integrity, restore fidelity, live RLS behavior, PostGIS extension upgrades, or migration performance. Those require the isolated environment described in `03-RESTORE-TARGET-COMPARISON.md` and explicit approval.
