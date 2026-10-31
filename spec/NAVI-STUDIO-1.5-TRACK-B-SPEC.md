# NAVI Studio 1.5 — Track B Specification

## What

Use the clean `bead5101fc853959f99f7aabcdba72423f48f839` candidate as the NAVI 1.5 baseline. Prepare isolated cloud/recovery/security plans and add a development-only, default-off local draft workflow that stores recoverable campus editing state in IndexedDB without automatic cloud writes. Preserve the existing cloud writer and default behavior.

## Success criteria

1. The baseline feature matrix distinguishes tested, source-only, missing/regressed, and unknown behavior; no browser behavior is inferred from code.
2. Vercel/Supabase, backup/restore, and publish authorization plans are specific and contain no secret values; no cloud or DB changes occur.
3. When the explicit local draft flag is enabled in development, document edits become durably recoverable from IndexedDB, are isolated by stable campus/document identity, carry a schema version, integrity checksum, and base server revision, and do not trigger cloud autosave.
4. The UI reports local durability separately from cloud synchronization; storage, checksum, offline, quota, interrupted-write, and conflict paths fail safely without deleting a newer server version.
5. With the flag disabled or outside development, existing local/cloud save behavior remains unchanged. Existing CAS, idempotency, server acknowledgments, and conflict checks remain intact.

## Non-goals

- No Vercel project/environment changes, cloud resource creation, deployment, database/schema/permission changes, publication, or use of Production credentials.
- No new cloud writer or schema migration.
- No patch-only draft representation unless reconstruction is proven; no misleading controls for unsupported scoped cloud commits.
- No changes to the dirty original repositories or worktrees.

## Pitfalls from `errors/ERRORS.md`

- Stale cloud acknowledgments must never clear newer local edits.
- No automatic save may bypass authored-intent, CAS, idempotency, or conflict checks when the feature flag is off.
- Quota/storage failures must not block the existing cloud path in the default configuration.
- Campus/building/floor identity must remain scope-safe; identical coordinates across floors do not imply shared identity.
- Reports must use fresh test output and never expose credentials.
