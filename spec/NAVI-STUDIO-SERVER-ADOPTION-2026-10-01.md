# SPEC: NAVI Studio Server Adoption

## What success means
- “Load server version” replaces the local Studio graph and authored document with one validated authoritative server revision.
- Zustand, localStorage, editor context, visible floor editor, and sync marker agree after adoption and reload.
- A failed adoption leaves the prior local graph and conflict state intact, without advancing the sync marker.
- A deterministic regression test covers stale GF alignment/door and missing 1F/2F floor data.
- Conflict protection, forced local overwrite separation, per-floor plan ownership, active-floor isolation, and public User/Navigate behavior remain unchanged.

## Known pitfalls from ERRORS.md
- Preserve origin-scoped unsynced data; prior browser inspection could not read localStorage directly.
- Do not treat projection/fingerprint differences alone as authored local changes; freshness logic already has a false-conflict history.
- Large graph payloads exceed keepalive quota; do not add full localStorage backup copies or attach keepalive to large requests.
- Repository-wide `tsc --noEmit` has a documented pre-existing TS1005 in `packages/runtime/src/__tests__/data-identity-comparison.test.ts`; preserve unrelated dirty work and compare against that baseline.
- The floor-editor route, graph-store tests, editor context, and many unrelated files already have user modifications. Inspect diffs before editing and preserve them.

## Scope
Studio graph adoption, graph-store persistence, conflict UI, editor context hydration/lifecycle, autosave interaction, and focused tests only. No Supabase writes, forced sync, deployments, or User/Navigate changes during this task.
