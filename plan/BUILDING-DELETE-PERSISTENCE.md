# Building delete persistence — focused plan

## T1 — Reproduce and trace the canonical delete path

- **Description:** Prove the real building ID and trace `building.delete` from
  handler/commit through GraphAdapter, local draft, save candidate, API ack, and
  reload.
- **Files to touch:** focused tests and this plan only.
- **Relevant ERRORS.md prevention:** do not infer a failure from UI state or
  HTTP success; capture the first divergent representation.
- **Acceptance:** a RED regression proves the deleted building is re-added by
  the current projection or another identified layer.

## T2 — Fix only full-document building reconciliation

- **Description:** Make a complete Studio document authoritative for building
  collection reconciliation while preserving explicitly supported scoped
  projections and all unrelated buildings.
- **Files to touch:** `packages/editor/src/graph-adapter.ts` and focused tests.
- **Relevant ERRORS.md prevention:** keep the cross-scope save guard and
  optimistic acknowledgement contract unchanged.
- **Acceptance:** deleted X stays absent, unrelated Y survives, and existing
  scoped-reconciliation tests remain green.

## T3 — Verify persistence and reload contracts

- **Description:** Exercise local serialization, save candidate/server ack
  seams, debounce interruption, and graph reload for building deletion.
- **Files to touch:** focused store/editor tests only if a regression seam is
  missing.
- **Relevant ERRORS.md prevention:** distinguish local cache, payload, server,
  and reload evidence; do not call a save synced without an authoritative ack.
- **Acceptance:** focused delete/save/reload matrix passes with no conflict.

## T4 — Build, graph refresh, release verification

- **Description:** Run focused suites, production build, `graphify update .`,
  commit/push the narrow fix, deploy the exact commit, and verify readiness and
  HTTP 200.
- **Files to touch:** required workflow logs only.
- **Relevant ERRORS.md prevention:** record Graphify/build/network baselines
  rather than changing unrelated code.
- **Acceptance:** evidence is recorded in progress/errors and the deployed SHA
  equals the pushed fix commit, or one exact blocker is reported.
