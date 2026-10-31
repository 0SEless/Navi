# Track B Test Results

## Focused verification

| Check | Result | Evidence |
|---|---|---|
| IndexedDB record identity/checksum/schema validation | PASS | Service tests; corrupt/unsupported records remain preserved |
| Campus isolation and repository read/write/delete | PASS | Service test round-trip across two campus IDs |
| Local-only autosave has no cloud request/full localStorage snapshot | PASS | GraphStore test with fetch spy and localStorage assertion |
| Refresh recovery | PASS in mocked store | Verified draft restored from repository without a network request |
| Missing draft/server read failure | PASS fail-closed | Recovery remains `error`; editor gate does not mount |
| Quota failure | PASS fail-closed | Store reports error, no cloud call, no false saved status |
| Interrupted/late write and campus serialization | PASS | Deferred-write tests preserve latest edit; older queued content cannot overwrite it |
| No-op local write suppression | PASS | Store-level second save creates no additional IndexedDB put |
| Manual cloud candidate / stale ACK | PASS in mocked request | Submitted body excludes a later edit; latest draft remains stored and `syncStatus` remains pending |
| Default flag-off cloud behavior | PASS in focused regressions | Existing GraphStore save queue, conflict, idempotency and studio persistence suites pass |
| Save status distinction | PASS | Local-only, cloud-pending, cloud-confirmed and cloud-failure states have separate labels |

Final focused command:

```text
npm test -- --reporter=verbose src/store/graph-store.test.ts src/store/graph-store-save-queue.test.ts src/store/graph-store-idempotency.test.ts src/store/graph-store-conflict.test.ts src/store/__tests__/refresh-recovery.test.ts src/store/__tests__/readiness-lifecycle.test.ts src/store/__tests__/saved-state-gate.test.ts src/store/__tests__/case-e-attribution.test.ts src/services/authored-snapshot-persistence.test.ts src/components/studio/__tests__/studio-persistence.test.ts src/components/studio/__tests__/save-status-model.test.ts src/services/studio-local-drafts.test.ts src/store/graph-store-local-drafts.test.ts src/components/studio/__tests__/SaveStatus.test.tsx src/components/studio/__tests__/StudioLocalDraftRecoveryGate.test.tsx packages/editor/src/services/__tests__/persistence-service.test.ts packages/editor/src/services/__tests__/workflow-service.test.ts --maxWorkers=1 --no-file-parallelism
```

Result: **17 files passed; 113 tests passed.** Log: `logs/trackb-persistence-regression-final.log`.

After the final candidate-body assertion: `npx vitest run src/store/graph-store-local-drafts.test.ts src/services/studio-local-drafts.test.ts --maxWorkers=1 --no-file-parallelism` — **2 files, 14 tests passed**.

## Full suite and baseline comparison

- Baseline (`npm test -- --reporter=verbose`): 576 files pass / 20 fail; 6,071 pass / 34 fail / 8 skipped; 6,113 total.
- Candidate full run before the last stale-ACK test addition: 578 files pass / 21 fail; 6,087 pass / 35 fail / 8 skipped; 6,130 total.
- The same 34 failed tests appeared in both runs. One additional parallel full-suite failure (`OutdoorRoutePicker` hit-surface preview) passed when run alone: 1 file / 6 tests. The focused final persistence matrix passes. Treat the extra as an unresolved full-run flake, not as a passing full suite.
- Full logs: `logs/baseline-vitest.log` and `logs/trackb-full-vitest.log`.

## TypeScript

Command: `npx tsc --noEmit --pretty false`  
Result: **BLOCKED before checking the candidate** by existing `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3): error TS1005: '}' expected.` This same syntax blocker is recorded in the T1 baseline/error ledger; the file is unrelated and unchanged.

## ESLint

- The new local-draft service, tests, status model/UI, gate tests, GraphStore local-draft tests, and Floor Editor integration have no new lint findings; the new files pass scoped ESLint.
- Baseline lint of `HEAD` versions of the already-dirty bridge/editor service files yields 12 errors: `EditorBridge.tsx` 2 `react-hooks/refs` + 5 `no-explicit-any`; `persistence-service.ts` 2 `no-explicit-any`; `workflow-service.ts` 2 `no-explicit-any`; `persistence-service.test.ts` 1 `no-explicit-any`.
- Candidate scoped lint reports the same 12 errors, with no new errors. A new unused-symbol warning was found and fixed; final new-file lint exits 0.
- Logs: `logs/baseline-scoped-eslint.log`, `logs/trackb-scoped-eslint.log`.

## Production Webpack build

Command: `npm run build -- --webpack`  
Result: **PARTIAL / BLOCKED at prerender.** Webpack compilation succeeds. Next fails prerendering `/demo/navigate` because `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are not configured in this isolated worktree. The build also reports existing missing exports `useFloor` / `useBuildingFloors` from `packages/editor/src/context/index.ts`; no unrelated repairs were made. Next reports type validation skipped by the repository build configuration. No placeholder credentials were added.

Final build log: `logs/trackb-production-build-final.log`.

## Browser and cloud

No real browser run was performed. There are no verified isolated Development credentials, and no Preview/Production writes are allowed. No Supabase, R2, Vercel, publish, campus-data or deployment operation occurred.
