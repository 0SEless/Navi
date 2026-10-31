# Track E1 — Test and Static-Check Results

## Focused Vitest

Final focused regression matrix: **15 test files passed, 101 tests passed, 0 failed**. It included the new classifier/flag/batch/client/route tests and existing D6 history/save, IndexedDB drafts, graph-store queue, `/api/graph`, SaveStatus, draft-recovery gate and inspector compatibility suites.

The run used one Vitest worker. The first run exposed an overly strict assertion on the batch operation shape; the test was corrected to assert operation scopes while allowing their integrity-checked operation payloads. The rerun passed all 101 tests.

## ESLint

Focused ESLint on the scoped persistence modules, local API route, SaveStatus, graph store and relevant tests passed with **0 errors / 0 warnings** after cleanup.

Including all of `src/components/studio/EditorBridge.tsx` reports inherited hook-ref access and explicit-`any` findings on the existing context initialization/publish-result bridge. These findings are outside the new E1 lines; the baseline-sensitive module was not refactored as part of this integration.

## TypeScript

D6 baseline: **1,128 diagnostics** (`C:\Users\Administrator\Documents\Codex\NAVI-Track-D6-Backups\typescript-d6-final.log`). The final comparison also returned **1,128 diagnostics**, with **zero diagnostics naming E1 source files**. The comparison used a temporary config that excluded only the malformed generated `.next/dev/types` directory. Standard `tsc --noEmit` still reports TS1434 in generated `.next/dev/types/validator.ts`; no generated files were edited. Full TypeScript success is not claimed.

## Browser check

The existing Track C1 Playwright suite uses synthetic campus fixtures, an isolated localhost auth stub, and browser interception that rejects unexpected API calls. The full configured run and a single edit/reload scenario were each attempted. The harness did not return an HTTP response at `http://127.0.0.1:3187/` (PowerShell requests timed out), so the runs were stopped and no completed Playwright result/artifact was produced. The actual edit/reload flow is **not verified in this E1 environment**. The prior Track C1 reports document earlier synthetic browser acceptance, but that does not substitute for an E1 run.

## Graphify and scope

Graphify code index update completed after the final source fixes: **13,632 nodes / 28,601 edges / 787 communities**. Visualization was skipped at the 5,000-node limit. No full Vitest suite was run. No cloud or Production integration was exercised.
