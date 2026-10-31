# Track D6 — Local Verification Results

**Captured:** 2026-10-30; worktree HEAD `bead5101fc853959f99f7aabcdba72423f48f839` plus D6 working-tree changes.

## Focused Vitest matrix

Command:

```powershell
vitest run src/services/scoped-campus-save.test.ts src/services/scoped-campus-history.local.test.ts src/app/api/graph/__tests__/route.test.ts src/store/graph-store.test.ts src/store/graph-store-save-queue.test.ts --reporter=verbose --pool=threads --maxWorkers=1
```

Result: **5 files passed, 44 tests passed**. This covers scoped save validation/idempotency/conflicts, local history/CAS/checkpoints/reconstruction/integrity, plus existing `/api/graph` and graph-store save compatibility. Expected mock error logs appeared in tests that assert upstream error handling.

## Lint and TypeScript

- ESLint on `scoped-campus-save.ts`, `scoped-campus-save.test.ts`, `scoped-campus-history.local.ts`, and `scoped-campus-history.local.test.ts`: exit 0, no diagnostics.
- `tsc --noEmit --pretty false --incremental false`: exit 2, **1,128 diagnostics**. This equals the repository baseline recorded during Tracks B/C1; **0 diagnostics** name either D6 service module. Full output: `C:\Users\Administrator\Documents\Codex\NAVI-Track-D6-Backups\typescript-d6-final.log`.
- This is a focused verification matrix, not a full Vitest suite or a full green TypeScript build.

## Graph update

`graphify update .` completed successfully. It scanned 1,895 files and reported 13,474 nodes, 28,374 edges, and 762 communities. HTML graph output was skipped because the graph is above the 5,000-node visualization limit. The graphify CLI specified that code graph updated and document/paper/image changes require a separate AI-assisted update; this D6 closeout did not run a semantic document extraction.
