# Track D5 — Real Development Backup Readiness (Not Executed)

## Decision

**Do not perform a real Development export yet.** The D5 synthetic encrypted restore gate is incomplete, and portable key recovery is unproven. No Supabase export or data access was performed during D5.

## Required runbook before a future approved export

1. Verify project identity (`navi-development`, ref `scvgulusmutnzasmgysx`) in the approved operator session. Confirm no Production ref/credentials are present.
2. Use a least-privilege, owner-approved export identity and approved Supabase CLI/pg_dump version. Keep tokens/passwords in an approved secret store or process-only input, never the repository, shell history, logs, or command-line arguments.
3. Record server, client, PostGIS, and installed extension versions; migration ledger; schemas, owners, grants, policies, sequences, functions, triggers, publications, and large-object inventory. Preserve role ownership semantics and Supabase-managed dependencies.
4. Choose and document schema/data/roles dump options explicitly. Supabase CLI `db dump` has defaults/exclusions; separate role, schema, and data artifacts if required. Auth and Storage managed objects require a supported, separately reviewed plan. Database metadata alone does not capture Storage object bytes, Auth provider configuration, edge functions, secrets, external media, or all project settings.
5. Write plaintext only to restricted temporary storage. Compute a source manifest and SHA-256, encrypt the full dump before durable storage, verify ciphertext, and remove plaintext staging after independent confirmation. Keep encryption keys outside the backup location with a named custodian and tested independent recovery.
6. Restore only into a new, isolated disposable target. Do not restore over current Dev or Production. Match PostgreSQL/PostGIS versions as closely as possible; restore roles/schema/data in documented order and address managed Supabase objects with supported steps.
7. Validate counts/checksums, constraints, PostGIS transforms, sequences, ownership, grants, RLS/policies, representative application behavior, Auth user identity references, and Storage object metadata/bytes where in scope. Record exclusions and failures.
8. Confirm retention, encrypted destination, access list, storage/egress/cost, restore duration, rollback/cleanup owner, and evidence retention before execution.

## Gaps before approval

- Docker startup and D5 isolated restore are blocked.
- No fresh backup, persistent key recovery from independent custodian, or real Development restore has been demonstrated.
- D1 migration proposals are not approved or migration-ready; no migration is included in this runbook.
- D1's prior 33 MB size and zero-bucket/object snapshot is historical and must be rechecked before cost/retention estimates.
- D5 incurred no cloud backup or restore cost; future egress/storage cost is unknown pending current plan/usage and approved destination.

Supabase documents that Free projects should use CLI dumps, daily backups do not include Storage object bytes, and managed schemas/roles require special handling. Consult the linked official documentation in `03-DEV-COMPATIBILITY.md` at execution time.
