# NAVI Studio 1.5 — Track E2 Plan

## T1 — Verify protected E1 baseline and diagnose harness (complete)
- Files: none.
- Acceptance: expected branch/HEAD; verify D6 archive checksum; inspect 3187/alternate listeners, process ownership, config, server fixture, proxy variables, generated validator and prior browser evidence.
- Prevention: preserve all existing dirty paths and never stop the unrelated port-3000 Next process.
- Evidence: D6 archive SHA-256 matches its sidecar; 3187/3188/3189/3190/3989/3990 are free; proxy variables are unset; validator currently contains its import; prior C1 browser runs passed.

## T2 — Make localhost harness startup diagnosable and port-selectable (complete)
- Files: `playwright.track-c1.config.ts`, `e2e/support/track-c1-local-server.mjs`, `e2e/track-c1-local-drafts.spec.ts`, E2 harness report.
- Acceptance: configurable app/auth/health ports, explicit loopback binding, readiness response check, startup logs, bounded timeout and no collisions with unrelated processes.
- Prevention: poll real HTTP readiness before browser tests; capture child exit and preserve process ownership boundaries.
- Verification: `node --check` passed; 3187/3989/4189 were free; the harness bound all three to 127.0.0.1; Next returned 200 at `/` in 5.5 seconds; `/ready` returned 200 with `ready:true`; E1 Playwright flag-off suite subsequently passed 6 tests / 1 skip.

## T3 — Add E2 browser acceptance for flag OFF/ON (complete)
- Files: `e2e/track-c1-local-drafts.spec.ts`, `src/components/studio/StudioScopedHistoryBridge.tsx`, `src/components/studio/EditorBridge.tsx`, `src/app/(admin)/studio/[id]/edit/building/[buildingId]/floor/[floor]/page.tsx`, Playwright config/server harness, E2 reports.
- Acceptance: flag-off observes no scoped endpoint calls; flag-on confirms building and route operations, local-only status, fresh session on reload and recovered IndexedDB draft. Manual Cloud Save pending/confirmed states use only the `/api/graph` stub. No unexpected external/API requests.
- Prevention: avoid real Supabase credentials or campus records; seed synthetic authenticated session and revision markers.
- Verification: flag OFF 8 passed / 3 skipped; flag ON 9 passed / 2 skipped; zero failures. Route-node selection is canvas-relative and property-panel deletion is selected explicitly.

## T4 — Expand failure/atomicity tests (complete)
- Files: `src/services/scoped-campus-batch.local.test.ts`, `src/services/scoped-history-dev-route.test.ts`, `src/services/scoped-history-dev-client.test.ts`, `src/services/studio-local-drafts.test.ts` only as needed.
- Acceptance: invalid batch, stale base, dependency mismatch, duplicate mutation ID, concurrent commits, lost ACK exact retry, ephemeral server restart, corrupted draft, campus switch and mid-session flag disable. Snapshot checks prove failed batches leave revision, receipts, history, checkpoints and reconstructed content unchanged.
- Prevention: snapshot all observable store state before failure; do not assert atomicity from revision alone.
- Verification: focused matrix 15 files / 103 tests passed, including one-winner/one-stale concurrent batch and exact replay without duplicate history/checkpoint.

## T5 — Verify editor/status and compatibility (complete)
- Files: relevant focused tests, `src/components/floor-editor/FloorEditor.tsx` only if the existing `SaveStatus` mount requires a minimal integration; no product UI redesign.
- Acceptance: browser and component checks distinguish local draft, local scoped validation, pending Cloud Save, confirmed Cloud Save, failure and conflict. Existing manual `/api/graph` save remains intercepted and publishing remains on the legacy path.
- Prevention: label in-memory validation as local-only and keep cloud writes intercepted in browser tests.
- Verification: browser observed pending and confirmed local+cloud labels only after mock acknowledgment; the newer local edit remains local during a delayed acknowledgment.

## T6 — Verify and report (complete)
- Files: `reports/navi-studio-1.5-track-e2/00-SUMMARY.md` through `06-NEXT-PERSISTENCE-GATE.md`, `errors/ERRORS.md`, `progress/PROGRESS.md`.
- Acceptance: all seven E2 reports, logs, progress and error ledger updates are complete. Vitest 15/103 and selected ESLint pass; Playwright completes both modes; TypeScript stays at 1,128 inherited diagnostics.
- Prevention: no browser success claim without completed assertions; no full TypeScript-green claim against the inherited baseline.
- Outcome: local synthetic E2 gate passes. Terrain authoring and a multi-scope UI gesture were not exercised; client/route tests verify a two-scope batch atomically. Real Development database recovery remains unproven.
