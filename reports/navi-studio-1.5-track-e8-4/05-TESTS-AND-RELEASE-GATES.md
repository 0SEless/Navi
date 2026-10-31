# Tests, diagnostics, and remaining gates

## Verification

- Focused Vitest: 7 files, 31 tests passed. Covers authored document compatibility, polygon validity/conflicts, terrain command handlers, scoped projection, snapshot reconstruction, GeoJSON, and Studio canvas mounting.
- E8.4 Playwright against browser + synthetic local E5: 1 end-to-end test passed, including drawing, editing, explicit scoped save, exact acknowledgment, fresh-context database recovery, IndexedDB conflict/network-failure draft retention, and legacy publish compatibility.
- Independent PostgreSQL verification: 2 passed, 1 mode-specific test skipped.
- ESLint: passed on E8.4-owned TS/TSX/E2E files. The PowerShell runner has no matching ESLint configuration and is intentionally excluded.
- Full `npx tsc --noEmit`: exits 2; repository still has 1,123 diagnostics. E8.3 recorded 1,124. No new TypeScript diagnostic is attributable to E8.4-owned files; the existing `ParametricComponent` error in `packages/core/src/types/entities.ts` is present in the E8.3 baseline log.

Logs: `typescript-current.log` and `logs/run-fec85186572d4c47ae905ff8e03a0222/`.

The first rerun for exact gesture counts stopped in the PowerShell harness while capturing Node/Next.js stderr and did not reach the browser test. The runner now captures native stderr without treating warnings as terminating errors and still checks each child process exit code. The subsequent full bootstrap, browser acceptance, and independent PostgreSQL verification all passed. The stopped run logs are retained under `logs/run-9cdebe3243fd4c04a6dbc3d954f97e56/` and `logs/run-71e564f98e834cf384ce990132484f21/`.

## Remaining gates

1. Add terrain data to a versioned publish/runtime contract and verify user-app rendering before claiming terrain is published.
2. Define later product behavior for authored elevation versus surveyed elevation and any future terrain-mesh generation.
3. Continue broad TypeScript remediation separately; this track did not change unrelated legacy diagnostics.
4. Keep the synthetic E5 path opt-in and test-only. No Development/Production database or cloud recovery is established by this synthetic proof.

## Safety and worktree

All database writes in this acceptance were synthetic and local E5 only. No Supabase, Production, Vercel, GitHub push, deployment, Docker cleanup, or D2 resource change occurred. Existing dirty source modifications were preserved; no commit was created.
