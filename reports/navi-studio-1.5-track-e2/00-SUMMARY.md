# NAVI Studio 1.5 — Track E2 Summary

**Status: PASS for the local, synthetic E2 gate.** The Playwright harness returned real HTTP responses, and both feature-flag browser matrices completed with no failed or flaky tests. Focused persistence/UI regression tests and scoped lint passed. The work remains a local Development reference only; it does not establish real Development database durability or recoverability.

## Results

- Flag OFF: **8 passed, 3 skipped, 0 failed**. The editor retained the local IndexedDB draft workflow and made zero scoped-history requests.
- Flag ON: **9 passed, 2 skipped, 0 failed**. Building and routing edits generated validated local scoped operations; reload recovered the draft and created a fresh ephemeral session.
- Focused Vitest: **15 files / 103 tests passed**.
- Focused ESLint: **0 errors / 0 warnings** on the selected changed integration, service, page, UI and test files.
- TypeScript: **1,128 diagnostics**, unchanged from the E1/D6 baseline. No new diagnostics were introduced; two diagnostics in the edited editor entry points already appear in the E1 baseline logs.
- Graphify code index refreshed after the final source changes: **13,709 nodes / 28,685 edges / 772 communities**. HTML generation was skipped because the graph exceeds the 5,000-node visualization limit.

## Key changes

- Made the local Playwright harness port-selectable, loopback-bound and readiness-checked against actual HTTP responses. Startup and Next logs are retained under `logs/`.
- Added a reusable scoped-history observer to both the Studio editor and Floor Editor paths. The flag-on status explicitly says scoped operations are local and not cloud-saved.
- Added browser checks for flag-off isolation, building edits, route-node deletion, reload recovery, cloud-save pending/confirmed states and no unexpected external/API calls.
- Added atomic batch failure checks that compare revision, receipts, change history, checkpoints, and reconstructed document state before and after rejection.

## Boundaries

All fixtures and authentication were synthetic and isolated to localhost. `/api/graph` was intercepted for manual-save compatibility checks. No Supabase export/write, migration, deployment, Vercel, Docker, GitHub push, campus-data access or Production operation occurred. The local scoped-history service is in-memory and resets; only the IndexedDB draft is demonstrated as durable across browser reload/process restart.

Terrain edits were not exercised in the browser because the tested Floor Editor flow did not expose a terrain authoring interaction. A multi-scope editor gesture was not produced in the browser; the client and local route tests verify that a building-plus-routing batch is submitted and recorded atomically as one local revision. See [06-NEXT-PERSISTENCE-GATE.md](06-NEXT-PERSISTENCE-GATE.md) before any real Development backup work.
