# PLAN: NAVI Studio Server Adoption

## T1 — Trace the visible action and state lifecycle
- **Files:** `src/components/studio/SyncIssueCard.tsx`, `src/store/graph-store.ts`, `src/store/graph-store-conflict.test.ts`, `src/store/__tests__/refresh-recovery.test.ts`, `src/app/(admin)/studio/[id]/edit/building/[buildingId]/floor/[floor]/page.tsx`, `packages/editor/src/context/create-editor-context.ts`, plus discovered Studio autosave/persistence files. Read-only.
- **Before task:** Review ERRORS.md entries on unavailable localStorage inspection, false conflict from normalized fingerprints, and preserving user dirty state.
- **Acceptance:** Document the exact click→request→transformation→Zustand/localStorage/marker→EditorContext/autosave chain and all graph-cache writers; distinguish repository evidence from user-provided live evidence.
- **Result:** Complete. `SyncIssueCard` invokes `adoptServerSnapshot`; `/api/graph` returns graph data plus `authoredDocument`; graph-store parses both, attempts cache replacement, writes the marker, then sets Zustand. The cache `setItem` catch is swallowed. `FloorEditorBridge` creates its context once from the current graph/document; save, visibility, and unmount callbacks capture that context. Only `graph-store.ts` writes `navi-graph-{mapId}` in Studio; normal saves and exit flushes use current/captured editor state respectively.

## T2 — Prove the root cause and define adoption invariants
- **Files:** Read-only source and existing focused tests.
- **Before task:** Prevent: local cache adoption without validating full graph shape, false freshness conclusions, and treating sync markers as proof.
- **Acceptance:** Identify the causal code path from executable tests or deterministic local reproduction. If the supplied production observations cannot be reproduced from source, record the evidence gap and stop before speculative code changes.
- **Result:** Complete. Fault injection reproduced that `adoptServerSnapshot()` resolves successfully when cache replacement throws `QuotaExceededError`; the current implementation consequently advances marker and sets synced. The storage catch is the primary root cause. A mount-once EditorContext with autosave/exit writers is independently capable of re-projecting stale editor data after adoption.

## T3 — Add a failing regression for authoritative adoption
- **Files:** `src/store/graph-store-conflict.test.ts` or a dedicated graph-store adoption test file (select after T1); only this task's chosen test file.
- **Before task:** Prevent: modifying already-dirty tests without preserving their diff; test must prove GF alignment/door and 1F/2F plan/alignment/lock/state replacement and marker ordering.
- **Acceptance:** Test fails against the proven faulty behavior and asserts conflict remains on adoption failure.
- **Result:** Complete. New cache-quota fault-injection test failed before the fix because the adoption promise resolved (`9 passed, 1 failed`), proving the invalid success path.

## T4 — Implement the smallest safe fix
- **Files:** `src/store/graph-store.ts`, `src/app/(admin)/studio/[id]/edit/building/[buildingId]/floor/[floor]/page.tsx`, `src/store/graph-store-conflict.test.ts`, and the targeted in-flight save test in `src/store/__tests__/refresh-recovery.test.ts`.
- **Before task:** Prevent: stale EditorContext/autosave writing back old graph; marker advancement before durable graph replacement; quota-sensitive backup; weakening conflict protection or forced-overwrite separation.
- **Acceptance:** Authoritative adoption replaces all persisted server graph representations, updates editor state safely, and commits marker/conflict state only after success. Focused regression passes.
- **Result:** Complete. Authoritative graph persistence and marker writes must succeed before adoption reports synced. Full-graph localStorage backup duplication was removed. Adoption drains active campus saves, invalidates queued saves, holds new saves, leaves conflict unresolved on failure, increments an adoption generation, and guards against campus navigation. FloorEditorBridge remounts a new editor context on adoption; old context callbacks, exit flush, and autosave cannot project discarded editor state back into graph-store. Explicit force-local overwrite remains separate.

## T5 — Run focused and broader verification
- **Files:** No source edits unless verification finds a defect; then return to T4 after logging it.
- **Before task:** Prevent: attributing known dirty-checkout baselines to this fix; avoid any production writes.
- **Acceptance:** Relevant graph-store/conflict/editor lifecycle tests and `npx tsc --noEmit` are recorded with exact totals and baseline comparison. Inspect targeted diffs.
- **Result:** Complete. 137/137 focused tests passed across 7 graph-store suites (47), 5 editor persistence/autosave suites (36), and 9 floor-editor/floor-plan suites (54). Targeted ESLint exited 0 without warnings on changed production files and adoption test. `npx tsc --noEmit` reports only the existing `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3) TS1005`. The new regression failed before the fix (`9 passed, 1 failed`) and passed afterward; this is before/after mutation evidence.

## T6 — Controlled/live verification gate
- **Files:** No production files/data.
- **Before task:** Prevent: any write to production data, force-sync, deployment, or browser adoption without user-provided/available controlled access and a recoverable backup strategy.
- **Acceptance:** Run controlled adoption, reload, and clean-origin checks if available. Do not deploy or mutate production data from this task. Mark unavailable live checks as pending with specific reason.
- **Result:** Pending live verification. Controlled unit-level adoption and reload proof passed. The authenticated localhost tab is still marked Outdated and contains user data, so no adoption button was clicked. Vercel still serves the pre-fix deployment; no deployment or production data write was performed. Clean-origin browser and actual Vercel adoption/reload checks remain outstanding.
