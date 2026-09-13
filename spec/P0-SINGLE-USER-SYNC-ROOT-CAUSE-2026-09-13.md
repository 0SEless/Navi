# SPEC — P0 Single-User Sync Root Cause + Serialization (2026-09-13)

## Problem

A single human editor of `map-map-1-k6bv` can hit an unresolved optimistic-concurrency
conflict against Supabase. Read-only audit (2026-09-13) found three cooperating causes:

1. **Revision acknowledgement loss.** `graph-store.syncToSupabase` only advances the
   sync marker when the localStorage fingerprint equals the posted snapshot, and when
   the server response has no `updatedAt` it falls back to the *previous* marker value.
   The deployed RPC (migrations 004/005, migration 009 "awaits rollout") returns no
   `updatedAt`, so after every successful save the client continues to send the old
   `expectedServerUpdatedAt`.
2. **No per-campus save serialization.** `graph-store` has no in-flight lock. Autosave
   (queued in the editor package) is overlapped by unqueued triggers: EditorBridge
   `visibilitychange`/`beforeunload`, floor-route unmount flush, building-drag mouseup,
   Create Wizard, online resync, and forced reSync. Overlapping POSTs can carry the
   same expected revision.
3. **External writers target production.** Local dev servers use `.env.local` pointed
   at the production Supabase project; e2e/agent browser sessions opened the k6bv
   floor editor and emitted real `POST /api/graph 200` writes.

## What success looks like

1. Sequential single-client saves advance `expectedServerUpdatedAt` in lockstep with
   the server-returned revision (A → B → C → D), zero conflicts.
2. Rapid consecutive edits never produce a self-conflict: at most one graph POST per
   campus is in flight; a later edit is coalesced and pushed against the newly
   acknowledged revision.
3. A successful save never leaves the store reporting `synced` with a stale expected
   revision. If the server does not echo a revision, the client confirms it via GET;
   if it cannot confirm, it reports `error`, never `synced`.
4. A genuinely divergent external writer still produces a visible conflict, and the
   dirty local graph is preserved.
5. Failed saves never report synchronized.
6. Automated browser/e2e configuration cannot select production campus
   `map-map-1-k6bv`.

## Constraints

- Do NOT resolve or mutate the current production conflict; no Supabase writes.
- Do NOT disable optimistic concurrency.
- No server/migration rollout in this task; the client must be correct against both
  the deployed (no `updatedAt`) and the intended 009 RPC.

## Known pitfalls (ERRORS.md)

- Async freshness handlers must read state via `get()`, never stale closures.
- Marker writers/readers must use the same fingerprint normalization.
- Existing graph-store suites stub `fetch`; adding a POST-time GET requires those
  mocks to answer GET as well (or the tests must be updated deliberately).
