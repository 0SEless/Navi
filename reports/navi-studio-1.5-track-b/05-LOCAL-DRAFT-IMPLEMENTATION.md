# Local Draft Implementation

**Candidate:** `codex/navi-studio-1.5-track-a-20261027`  
**Base:** `bead5101fc853959f99f7aabcdba72423f48f839`  
**Status:** Implemented locally; no cloud deployment or data write.

## Behavior

- `NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS=true` enables the workflow only when `NODE_ENV=development`. Any other environment or value retains the existing persistence behavior.
- Editor autosave and visibility/unload triggers in opted-in development save a complete, reconstructable Graph plus authored `CampusDocument` to IndexedDB. They do not issue a cloud write or place a complete campus snapshot in `localStorage`.
- IndexedDB records are keyed by campus and include stable draft/document IDs, schema and authored-format versions, current building/floor scope, base server revision, timestamps, and canonical SHA-256 checksum. The whole authored document is preserved so floor switching does not split or lose document content.
- Draft writes serialize by campus, suppress content-identical writes, and only report a generation saved when no later edit arrived while the write was pending.
- Refresh recovery verifies identity, format and checksum before restoring. Unsupported/corrupt data is retained and blocks editor mount until retry or explicit, confirmed server-version adoption.
- If there is no draft and the read-only server check fails, recovery also remains blocked. It does not treat an unverified cached campus as current.
- Manual Cloud Save first records an IndexedDB recovery copy, then invokes the existing guarded CAS/idempotent writer. Cloud status only remains `synced` when the draft generation did not change during the request. A later edit stays locally durable and is shown as local-only/pending.

## Changed files

- `src/services/studio-local-drafts.ts` — versioned IndexedDB repository, checksum, validation, serialized storage operations and content fingerprint.
- `src/store/graph-store.ts` — development-only flag, campus draft save/recovery, local/cloud status coordination and stale-ACK handling.
- `src/components/studio/EditorBridge.tsx` — recovery gate and save-trigger routing for the campus editor.
- `src/components/studio/SaveStatus.tsx`, `src/components/studio/save-status-model.ts` — separate local durability from server acknowledgement.
- `src/app/(admin)/studio/[id]/edit/building/[buildingId]/floor/[floor]/page.tsx` — recovery gate and manual-save routing in the standalone Floor Editor.
- `packages/editor/src/services/persistence-service.ts`, `workflow-service.ts` — carry the existing manual/autosave reason into the adapter.
- Focused tests under `src/services`, `src/store`, `src/components/studio/__tests__`, and `packages/editor/src/services/__tests__`.

## Preserved behavior

- Flag-off save path remains the existing localStorage plus cloud workflow.
- The existing cloud writer, authored-intent safety guard, compare-and-swap revision check, mutation idempotency, and authoritative ACK/readback behavior remain the only cloud writer.
- No schema, RLS, migration, Vercel setting, Supabase data, R2 resource, campus record, or Production behavior was changed.

## Verification

- Focused persistence regression: 17 files, 113 tests passed after the stale-ACK repair. Log: `logs/trackb-persistence-regression-final.log`.
- Focused draft store/store tests after the immutable request assertion: 2 files, 14 tests passed.
- Full-suite, lint, TypeScript and build details are in `07-TEST-RESULTS.md`.
- Browser acceptance was not run. Current workspace lacks functional Development Supabase public credentials, and this task forbids using Preview or Production for writes.

## Rollback

This is an isolated uncommitted candidate. Revert only the Track B changed files in this candidate to return to the clean base. Do not reset/clean the parent or sibling worktrees. The flag is off by default and cannot activate in Production.

## Limits

- IndexedDB persistence is browser-local; it is not a substitute for cloud backup or cross-device synchronization.
- The existing writer remains whole-campus. Scoped building/terrain/routes commits are planned separately and are not implemented here.
- Refresh/restart behavior is simulated with the repository/store harness, not a real browser session.
