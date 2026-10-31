# Risks and Approval Gates

## Known risks / limits

1. **Development only:** `NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS=true` is effective only with `NODE_ENV=development`; Production and Preview builds cannot activate this path. The flag is absent/false by default.
2. **Device-local recovery:** IndexedDB data is confined to the browser profile/device. It is not cloud backup, cross-device collaboration, or a restore guarantee after browser data deletion.
3. **Full document payload:** A draft stores a reconstructable campus Graph and authored document in one IndexedDB record per campus. No full copy is duplicated into localStorage by local-mode autosave or manual-save preparation.
4. **Existing cache migration:** A dirty legacy Graph cache without an authored companion is preserved and surfaces a recovery error; automatic reconstruction is not guessed.
5. **Server freshness:** Existing CAS/idempotency remains authoritative. If the server base is unknown or moved, manual Cloud Save may safely conflict and require explicit review.
6. **Browser lifecycle:** IndexedDB writes are asynchronous. The app schedules a visibility/unload save, but no browser-close guarantee is claimed; normal debounced local saves and refresh recovery are covered by mocks, not real browser restart.
7. **Build/readiness:** Full Next build is blocked at static generation by missing isolated Development Supabase public env; repository TypeScript is blocked by the inherited TS1005. Browser acceptance remains pending.
8. **Baseline debt:** Thirty-four full-suite test failures and 12 scoped lint errors match the captured base. One additional `OutdoorRoutePicker` failure occurred only in the parallel full run and passes isolated; keep it as a flake risk until a repeatable characterization is available.
9. **Future cloud writes:** Scoped commits, compact revisions, cleanup/retention and policy changes are not implemented. No automatic revision deletion is enabled.

## Approval boundaries

Separate explicit approval and verified isolation are required before:

- Creating or changing a Vercel project or environment variables.
- Provisioning/using Development Supabase, Auth, storage, or R2 credentials.
- Running migrations or changing grants, RLS, schema, campus records, or revision retention.
- Activating any new cloud writer or scoped persistence API.
- Preview/Production deployment, publish, or writes to any campus data.

## Rollback

The candidate remains an isolated uncommitted worktree at the specified Track B branch. Feature-flag-off behavior is unchanged. To back out this candidate, remove only the Track B edits within this candidate after review; do not reset/clean the parent or other worktrees. No external state needs rollback.
