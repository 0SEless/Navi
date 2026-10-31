# NAVI Studio 1.5 — Track C1 Plan

> Execute one task at a time. Read the current `errors/ERRORS.md` entries named under each task before editing that task's files. Keep exactly one task marked in progress in the TODO.

**Spec:** `spec/NAVI-STUDIO-1.5-TRACK-C1-SPEC.md`  
**Candidate:** `codex/navi-studio-1.5-track-a-20261027` at `bead5101fc853959f99f7aabcdba72423f48f839` plus existing Track B changes.

## Global boundaries

- Edit only the isolated worktree; preserve Track B and all parent/sibling worktrees.
- No Supabase, Vercel, R2, Production/Preview, migration, publication, or campus data operations.
- No real credentials or network-dependent browser backend. Browser tests must be localhost-only and synthetic.
- No disabled auth/security checks. Keep the local-draft flag exact-opt-in and Development-only.
- No broad test rewrites or unrelated lint cleanup. Record source and environmental blockers accurately.

## T1 — Diagnose and repair the TypeScript syntax blocker

**Potential ledger errors:** inherited TS1005 and baseline full-suite failures. **Prevention:** inspect the complete test block and preserve its cases; run the affected test before the full check, and log any newly exposed diagnostic separately.

**Files:** `packages/runtime/src/__tests__/data-identity-comparison.test.ts`; C1 report `01-TYPESCRIPT-AND-BUILD-REPAIRS.md`; focused log.

**Acceptance:** smallest syntax-only correction; affected test passes; full TypeScript check completes or remaining diagnostics are precisely classified; no test is removed or suppressed.

## T2 — Reconcile editor context exports

**Potential ledger errors:** inherited export warnings from Track B build and broad-scope lint debt. **Prevention:** query/read existing hook definitions and call sites, then add only compatibility exports that preserve building/floor identity; test consumers before changing API names.

**Files:** `packages/editor/src/context/index.ts`, actual hook module only if needed, focused editor tests; C1 report `01-TYPESCRIPT-AND-BUILD-REPAIRS.md`.

**Acceptance:** `useFloor` and `useBuildingFloors` resolve through a source-supported API, focused editor tests pass, and no unrelated editor context behavior changes.

## T3 — Establish localhost-only browser harness

**Potential ledger errors:** missing Supabase env at prerender; never use fake credentials as functional service configuration; preserve administrator authorization. **Prevention:** intercept all network requests at the browser boundary, use synthetic documents, and fail the harness on any unmocked non-local request.

**Files:** isolated browser test/config files and synthetic fixtures only; C1 report `02-BROWSER-HARNESS.md`.

**Acceptance:** localhost app launches with requests fully mocked/local; no Supabase, Storage, R2, publishing, or external calls succeed or leave the machine.

## T4 — Exercise browser acceptance and save UX

**Potential ledger errors:** IDB transaction rejection, quota false-success, stale ACK certification, draft/server confusion, and browser close guarantees. **Prevention:** assert observable UI, IndexedDB state and intercepted request counts; keep manual Cloud Save state distinct; describe simulated lifecycle accurately.

**Files:** browser tests and harness fixtures; if browser evidence shows a committed edit is not independently persisted during an in-flight cloud save, update `src/components/studio/EditorBridge.tsx` to queue the opt-in IndexedDB save. Integrate the existing local-draft `SaveStatus` in `src/components/floor-editor/FloorEditor.tsx` and `packages/editor/src/panels/ContextHeader.tsx`, and update `src/components/studio/save-status-model.ts` with focused tests. Reports `03-BROWSER-ACCEPTANCE.md`, `04-SAVE-UX-VERIFICATION.md`.

**Acceptance:** every requested scenario has explicit PASS/FAIL/NOT VERIFIED evidence; local-only editing issues no cloud write; refresh recovery and status labels match actual persistence state.

## T5 — Regression/build verification and closeout

**Potential ledger errors:** 34 baseline test failures plus one parallel-only flake; Windows Vite cache EPERM; absent Development env at prerender. **Prevention:** use focused tests and task-scoped cache; compare to captured Track B baseline; do not claim full suite/build/browser PASS when a gate fails.

**Files:** reports `00-TRACK-C1-SUMMARY.md`, `05-REGRESSION-RESULTS.md`, `06-REMAINING-BLOCKERS.md`; update `errors/ERRORS.md`, `progress/PROGRESS.md`, and this TODO; update Graphify after source modifications.

**Acceptance:** exact command/output evidence, changed-file inventory, Track C2 gates, diff checks, and no external operations. Final state is PASS only if all completion criteria are proven; otherwise PARTIAL or BLOCKED.
