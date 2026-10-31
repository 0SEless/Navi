# NAVI Studio 1.5 — Track C1 Specification

## What Track C1 delivers

Stabilize the isolated Track B candidate enough to establish which local compile/type issues are fixable without changing unrelated behavior, and verify the development-only local-draft workflow through a browser session that cannot reach cloud services.

## Success criteria

1. The reported test syntax defect is fixed minimally and its test intent is retained; TypeScript diagnostics are rerun and classified against the Track B baseline.
2. The editor context exports are reconciled to their actual source API or consumers are corrected with equivalent behavior; focused editor checks pass.
3. A localhost-only browser harness uses synthetic data and intercepted API calls, with no Production/Preview Supabase, storage, or upload access.
4. Browser evidence covers local draft persistence/recovery, floor/building switching, offline and quota failure, pending manual save, late acknowledgement, cloud conflict, and default-off behavior; unsupported scenarios remain explicitly unverified.
5. Reports 00–06 document source changes, commands, actual results, residual baseline failures, and exact Track C2 gates; no cloud configuration, deployment, or campus data is changed.

## Known pitfalls from the error ledger

- The TS1005 is an inherited syntax error in a test file and may expose additional compiler failures after repair; do not suppress diagnostics or expand into unrelated test rewrites.
- Missing Supabase env caused static prerender failure in Track B. The C1 browser harness must mock/local-adapt initialization, never use Production credentials or pretend placeholder values are a working backend.
- Full Vitest has 34 inherited failures and one additional parallel-only failure; report baseline comparisons without claiming the full suite is green.
- IndexedDB transactions must observe request and transaction rejection; local quota failure must not falsely show saved state or issue an automatic cloud save.
- A server ACK covers only the exact immutable candidate sent; edits created while the request is pending must remain locally saved and cloud-pending.
- Windows shared transform-cache renames previously failed with EPERM; use a task-scoped cache if needed.
- Preserve all existing Track B files and the dirty parent/sibling worktrees; no reset, cleanup, cloud write, migration, deployment, or publication.
