# NAVI Studio 1.5 — Feature Baseline

**Candidate:** `codex/navi-studio-1.5-track-a-20261027`  
**HEAD:** `bead5101fc853959f99f7aabcdba72423f48f839`  
**Assessment:** Source and automated tests only. No browser or live service behavior is claimed.

## Feature matrix

| # | Capability | Classification | Evidence and limits |
|---|---|---|---|
| 1 | Building editor | Present and test-verified | Studio/editor bridge and campus editor source exist; `src/components/studio/__tests__/studio-persistence.test.ts` and the 68-test persistence matrix pass. No browser verification. |
| 2 | Floor editor | Present and test-verified | Floor Editor route and editor package exist; `src/store/__tests__/readiness-lifecycle.test.ts`, `refresh-recovery.test.ts`, and `saved-state-gate.test.ts` pass. Floor-specific user interaction remains browser-unverified. |
| 3 | Wall, door, window, and column tools | Present in source; partly test-verified | Editor drawing commands and floor component projection exist. Door/floor persistence tests pass; tool-by-tool coverage for all four types was not isolated in this baseline run. |
| 4 | Room detection and stable room identities | Present in source; partly test-verified | Semantic room projection has focused tests under `src/hooks/__tests__/semantic-room-projection.test.ts`; no end-to-end authored-room identity persistence/browser test was run. |
| 5 | Building entrance editing | Present in source; source-only for this matrix | Entrance/access entity support is present in editor/compiler contracts. The full baseline includes failing legacy entrance/routing integration assertions, so this run does not establish an end-to-end working entrance authoring flow. |
| 6 | Route nodes and route edges | Present and test-verified in editor/compiler units | Route-network and graph model tests exist. Some older route snapping and routing validation tests fail in the full baseline; those failures are listed below and limit the claim to covered units, not all route authoring. |
| 7 | Indoor/outdoor route compilation | Present in source; baseline regression tests fail | Compiler and canonical access compilation are present. The full run failed legacy `routing-validation`, `topology-audit`, and compiler integration/path assertions. Do not treat this baseline as verified end-to-end connectivity. |
| 8 | Campus publishing | Present and test-verified at service/unit level | Publisher package tests and publish service guard tests pass in the full baseline. Production publication was not attempted. |
| 9 | Existing local save recovery | Present and test-verified | `src/store/__tests__/refresh-recovery.test.ts` passed in the focused matrix; existing implementation stores Graph/authored document snapshots in localStorage. The new IndexedDB draft behavior is not yet implemented. |
| 10 | Cloud save acknowledgment | Present and test-verified | `saved-state-gate.test.ts` and `graph-store-save-queue.test.ts` pass; the existing path requires authoritative revision confirmation before marking synced. No cloud request was made by this verification. |
| 11 | Conflict detection | Present and test-verified | `graph-store-conflict.test.ts` and freshness/recovery cases pass in the focused matrix. No live server conflict was induced. |
| 12 | Mutation idempotency | Present and test-verified | `graph-store-idempotency.test.ts` passes in the focused matrix; the existing writer sends a stable mutation ID across transport retries. No cloud mutation was performed. |
| 13 | MapLibre preview/runtime integration | Present and partly test-verified | MapLibre/editor rendering and runtime modules exist; numerous renderer tests pass. This run does not verify a real map session. |

No feature is classified `missing` solely because browser verification was not performed. No comparison against an unverified dirty Production checkout was used to claim parity or regression.

## Baseline verification

- Full command: `npm test -- --reporter=verbose`
- Result: **576 test files passed, 20 failed; 6,071 tests passed, 34 failed, 8 skipped** (6113 total).
- Focused persistence command: 11 GraphStore/authored snapshot/Studio persistence files listed in `logs/baseline-persistence-vitest.log`.
- Focused result: **11 files passed; 68 tests passed**.
- Full output: [`logs/baseline-vitest.log`](logs/baseline-vitest.log)
- Persistence output: [`logs/baseline-persistence-vitest.log`](logs/baseline-persistence-vitest.log)

The failures span 20 files, including legacy compiler/routing/topology assertions, `navigate/page.test.tsx`, the E2E safety guard, and compiler-adapter transformation/import failures. The pre-existing error ledger also identifies a separately parse-broken `packages/runtime/src/__tests__/data-identity-comparison.test.ts` that is excluded from the root Vitest project; no unrelated repair is in scope. Full failure details are preserved in the log rather than restated as a new feature regression.

## Compatibility limits

- The selected baseline is the clean `bead5101` candidate by explicit project decision; it is not proven to match Production.
- No dirty sibling checkout was merged or used as a release source.
- No external environment, database, publication, or campus data was accessed.
