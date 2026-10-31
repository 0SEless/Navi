# NAVI Studio 1.5 — Track E1 Summary

**Status:** PARTIAL — implementation and focused verification complete; browser acceptance remains unverified because the local test harness did not respond.

Track E1 connects the authoritative Studio `CampusDocument` edit stream to a Development-only, in-memory scoped-history reference endpoint. The new integration is disabled by default and requires both `NEXT_PUBLIC_NAVI_STUDIO_SCOPED_HISTORY=true` and the existing `NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS=true`, with `NODE_ENV=development`. It does not redirect or replace existing `/api/graph` writes, the graph-store queue, IndexedDB draft recovery, or publishing.

The editor classifies supported document changes into building, per-building or campus routing, terrain, and campus-settings scopes. It suppresses unchanged projections, rejects ambiguous or unsupported changes from scoped history, and sends explicit multi-scope batches for one atomic local revision. The loopback endpoint reuses the D6 in-memory reference store and returns local-only status. Page reload starts a new scoped-history session; IndexedDB draft recovery remains the durable local recovery boundary.

## Verification snapshot

- Focused Vitest compatibility matrix: **15 files / 101 tests passed**.
- Focused ESLint for scoped services, route, status UI, graph store and tests: **0 errors and 0 warnings**. Including `EditorBridge.tsx` reports 7 existing hook-ref and explicit-`any` findings outside the E1 additions; details are in `04-TEST-RESULTS.md`.
- TypeScript comparison against the D6 baseline returned **1,128 diagnostics**, matching the baseline; **zero diagnostics name E1 sources**. A temporary comparison config excluded only the malformed generated `.next/dev/types` directory. Standard `tsc` remains blocked by generated `.next/dev/types/validator.ts` TS1434 while the local Next dev artifacts are present.
- The existing Track C1 Playwright edit/reload scenario was attempted twice, including as a single isolated test. The harness did not return an HTTP response on `127.0.0.1:3187`; no browser pass is claimed. Details are in `04-TEST-RESULTS.md` and `errors/ERRORS.md`.
- Graphify code index refreshed after the final type fixes: 13,632 nodes, 28,601 edges, 787 communities. The HTML visualization was skipped because the graph exceeds the 5,000-node visualization limit.

No Supabase export/write, migration, Docker operation, deployment, GitHub push, or Production operation was performed. Synthetic/local validation does not establish real Development database recoverability.
