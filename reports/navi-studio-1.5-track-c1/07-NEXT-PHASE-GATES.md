# Next phase gates

## Track C1 closeout

**Verdict: PARTIAL.** Workspace identity and Track B preservation are verified. The TS1005 syntax defect is repaired; editor hook behavior and exports pass focused tests; local browser acceptance passes the exercised scenarios; production Webpack build passes; full Vitest failures match the recorded 34-test baseline after updating the two affected Floor Editor mocks.

Still open:
1. Full TypeScript remains nonzero at 1,128 diagnostics. The exact current output is retained in logs/typescript-continuation-20261029.log.
2. The runtime data-identity file has 61 skipped tests, not executed assertions.
3. Browser-level interrupted IndexedDB transaction termination was not tested; relevant deferred-write/unit coverage is not a substitute.
4. Scoped ESLint still reports 5 errors/8 warnings across selected legacy test files and 3 exhaustive-deps warnings in the selector file. The 5 errors are at unchanged lines.
5. The Next dev server emits a cleanup AggregateError on some teardown/navigation paths.
6. No cloud/real-auth behavior was exercised or modified.

## Before C2 cloud persistence work

- Confirm and pin the intended source commit, deployment project and intended database environment.
- Reconcile migration ledger and schema with the canonical source.
- Complete isolated backup/restore and migration rollback rehearsal.
- Obtain security owner review for published_maps write policies and spatial_ref_sys exposure.
- Approve the cloud commit/scope contract and ownership model; keep campus-wide CAS until dependencies are mapped.
- Add replay/checkpoint and policy tests before enabling any writer.
- Keep the local-draft flag disabled by default and retain legacy read compatibility.
- Do not migrate, deploy, publish, create a campus, or use a real external storage object until separately approved.

## Narrow rollback

The continuation-specific source changes are one helper rename and two test mock exports. Revert only those hunks using the recorded diff if needed; no other uncommitted Track B/C1 files should be reset. The Track B feature itself remains opt-in and Development-only, so disabling its flag leaves the legacy save path selected.

Existing reports, logs and screenshots should be retained as evidence. No database rollback is applicable because C1 performed no database operation.
7. Graphify refresh was not performed. Its incremental detector found 1,862 changed files (1,661 code, 166 documents, 35 images) with no deletions, far beyond this continuation's source hunks. That suggests the saved manifest no longer matches the current worktree; a broad rebuild would reprocess a large corpus. Existing graph.json/report artifacts were left untouched. Re-baseline the manifest before a separate Graphify update.



Fresh status check: the same 20 failing Vitest suite paths appear in the saved Track B baseline and final C1 run; the suite-path set difference is zero. The final TypeScript rerun remains 1,128 diagnostics. Harness-only ESLint is 0/0 and selector-only lint is 0 errors / 3 warnings.

