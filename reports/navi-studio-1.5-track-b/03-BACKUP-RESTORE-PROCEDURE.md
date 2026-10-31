# Development Supabase Backup and Restore Procedure

**Status:** Reviewed runbook only. No backup or restore was executed.

## Preconditions

- Name both source and target project refs; target must be a separate disposable Development project.
- Obtain the database connection string through a secure operator channel. Do not put it in Git, a report, shell history, or a shared terminal transcript. Use a temporary process environment variable or protected `.pgpass` entry and clear it afterward.
- Confirm the target ref is not Production and has sufficient disk/storage capacity. Restore into an empty isolated target, never over the source project.
- Install a current Supabase CLI and PostgreSQL `psql` client. Record `supabase --version`, `pg_dump --version`, and `psql --version`; match the PostgreSQL client major version to the source/target server. `supabase db dump` uses Supabase-specific filtering; raw `pg_dump` can include managed internals.
- Freeze Development writes during backup or record a consistent cut time. Write all outputs to an access-controlled backup directory.

## Logical database export

Using the official Supabase CLI workflow, export roles, schema, and data separately. Use the exact connection string in a protected environment variable named `DATABASE_URL`; do not substitute a Production URL.

```powershell
supabase db dump --db-url $env:DATABASE_URL -f roles.sql --role-only
supabase db dump --db-url $env:DATABASE_URL -f schema.sql
supabase db dump --db-url $env:DATABASE_URL -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

Review generated files for credentials or environment-specific URLs before retaining or transferring them. Record row counts for NAVI-owned tables, migration history, extensions, custom roles/grants, RLS/policies, triggers, functions, and publication settings using read-only inventory queries. Export custom Auth/Storage schema changes separately if present.

## External service inventory

The SQL data dump is not a complete Supabase project backup. Separately record (without secrets):

- Auth settings: Site URL, redirect allowlist, providers, email templates, MFA settings, user count and user ids; document which settings must be re-created. Do not export or expose password hashes unnecessarily.
- Storage: bucket names, privacy, policies, object keys, sizes, MIME types, and per-bucket object checksums. Database metadata does not preserve Storage object bytes. Download/copy objects through approved Storage tooling and verify bytes/checksums independently.
- Extensions and versions, project/database settings, Realtime publications, webhooks, Edge Functions and secrets, custom roles and passwords, OAuth provider configuration, and API keys. Recreate secrets in the new project through secure channels; never reuse production values.
- Supabase platform backups/PITR availability and restore point; these complement rather than replace the logical and object inventories.

Supabase’s current backup guide states that database backups do not include Storage API object bytes; its CLI backup/restore guide describes separate role/schema/data dumps and notes custom `auth`/`storage` schema changes require separate handling. See [Database Backups](https://supabase.com/docs/guides/platform/backups), [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), and [Restore Dashboard backup](https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore).

## Integrity and restore

1. Generate SHA-256 for each dump and object manifest, record byte size and creation time, and store the checksum manifest separately from the backup files.
2. Verify each checksum immediately after copying to a second protected location.
3. Provision an empty Development restore target, independently confirm its project ref, install required extensions and compatible database settings, then restore using the approved Supabase CLI/`psql` procedure for the selected target and version. Preserve migration history only after checking target schema state; do not blindly replay migrations on top of imported schema.
4. Restore database roles/schema/data in the documented order, using a single transaction for the SQL files when the chosen dump format supports it. Reset custom role passwords securely. Do not import Production API keys, JWT secrets, service credentials, OAuth secrets, or R2 secrets.
5. Re-create only reviewed Auth settings and Storage buckets/policies; upload object bytes from the separately verified manifest. Recreate Edge Functions, secrets, webhooks, and Realtime configuration explicitly.
6. Validate migration/extension state, constraints, indexes, RLS and grants; compare NAVI table counts and selected row checksums; compare Storage object counts and SHA-256; test Auth login/callback against Development URLs; execute read-only application smoke checks.
7. Keep the source untouched and the target isolated until owner review. Record restore errors and do not declare recovery verified until all checks pass.

## Recovery limitations

Logical SQL does not reproduce project identity, platform settings, OAuth provider secrets, API keys, all managed Auth/Storage internals, Edge Function secrets, or stored Storage object bytes. A database restore can cause downtime and trigger restore-time behavior. Supabase daily backups/PITR have plan and retention constraints; restore operations are project-wide and require separate authorization. This runbook is not authorization to run any backup, restore, migration, or cloud operation.
