# NAVI Studio 1.5 — Track E1 Plan

## T1 — Baseline and integration map (complete)
- Files: none; record results in report 01.
- Acceptance: verify branch/HEAD and D6 backup SHA; record dirty status, draft flag, Studio save paths, graph queue, route consumers and publish boundary.
- Error prevention: trust neither stale Graphify matches nor the huge untracked cache list; use explicit `git -C <worktree>` and inspect current sources.

## T2 — Define scoped projections and explicit batches (complete)
- Files: `src/services/scoped-change-detection.ts`, tests; `src/services/scoped-campus-history.local.ts`, tests; `src/services/scoped-campus-save.ts`, tests if batch contract requires it.
- Acceptance: deterministic supported scopes, duplicate suppression, explicit multi-scope change set, ambiguous/unsupported rejection, atomic in-memory batch commit and reconstruction.
- Error prevention: identity comes from document entity ownership; no active selection guesses. Preserve campus-wide CAS and deterministic checksums.

## T3 — Add opt-in Development reference endpoint/client (complete)
- Files: `src/services/studio-scoped-history-flag.ts`, tests; `src/services/scoped-history-dev-client.ts`, tests; `src/app/api/dev/scoped-history/route.ts`, tests.
- Acceptance: default-off dual gate (Development + scoped-history flag + local-draft flag); loopback-only server route; no cloud imports; session-scoped in-memory store; exact retry payload replay; no history access after reload.
- Error prevention: never import Node crypto into client chunks; local response is a distinct local-only type, never a cloud ACK.

## T4 — Connect editor events and existing status UI (complete)
- Files: `src/components/studio/EditorBridge.tsx`, `src/store/graph-store.ts`, `src/components/studio/SaveStatus.tsx` and focused tests.
- Acceptance: observe post-hydration document changes; keep editor/draft flow on classification or endpoint failure; explicitly record multi-scope changes; keep cloud save and publish paths unchanged; expose local-only status.
- Error prevention: gate browser work on `indexedDB`; update test mocks for new selectors; bind retry to the exact submitted immutable snapshot; reset scoped session when campus/document identity changes.

## T5 — Verify and report (complete; browser check blocked by the local harness)
- Files: focused test/log artifacts, `errors/ERRORS.md`, `progress/PROGRESS.md`, `reports/navi-studio-1.5-track-e1/00-SUMMARY.md` through `05-REMAINING-PERSISTENCE-GATES.md`.
- Acceptance: focused Vitest and ESLint pass; backward-compatible graph-store tests pass; TypeScript diagnostics compared to 1,128 D6 baseline; browser test run if available; no cloud action.
- Error prevention: run Vitest with one worker and task-local TEMP/TMP; distinguish full-suite and TypeScript baselines; do not claim browser/real-cloud coverage without executing it.
- Closeout: focused Vitest passed 15 files / 101 tests; focused ESLint passed; TypeScript matched the 1,128-diagnostic D6 baseline with no E1-source diagnostics. Playwright edit/reload could not be completed because the local Next harness did not respond on 127.0.0.1:3187; see report 04 and the E1 error ledger. Overall E1 verification is partial for browser coverage.
