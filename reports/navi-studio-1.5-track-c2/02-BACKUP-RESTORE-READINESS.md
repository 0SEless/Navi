# Backup and Restore Readiness

## Current classification: NOT READY / NO USABLE BACKUP VERIFIED

Read-only provider inventory reports the Development organization plan as `free`; the Development database is 33 MB, PostgreSQL 17.6.1. Supabase’s current [Database Backups guide](https://supabase.com/docs/guides/platform/backups) says daily managed backups are automatic on Pro, Team, and Enterprise plans and that Free projects should regularly export with the CLI. It also states database backups exclude Storage API object bytes. The connected tools exposed no backup inventory or recovery-point listing, so no existing backup, downloadable dump, or restore point was verified. No export or restore was started.

The Development `storage.buckets` inventory returned no rows. This is evidence only that no buckets were present in that table at inspection time; it does not inventory R2, Cloudinary, external object stores, or Auth configuration. Supabase Edge Functions inventory returned zero functions. Auth redirect/provider configuration, user counts, custom roles, webhooks, Realtime publications, and R2 object coverage remain uninspected.

The connected migration ledger returned 19 recorded entries, including NAVI revisions/authored-document migrations and Dev-specific compatibility entries. The ledger should be backed up and reconciled against the SQL directory before a restore; it is not proof the full schema can be recreated from migration files alone.

## Future logical export procedure — approval and controlled operator session required

Use a dedicated encrypted backup host with access-controlled storage. Obtain the Development connection string through a secret manager or approved operator channel; never put it in a report, Git, command transcript, or shell history. Record CLI and PostgreSQL client versions and use a client compatible with the PostgreSQL 17 server. Reconfirm source ref `scvgulusmutnzasmgysx` and plan immediately before export.

1. Freeze Development writes or record a consistent snapshot timestamp.
2. Use the official Supabase CLI `db dump` process for separate roles, schema, and data artifacts. Review the installed CLI help/version and exclusion rules first. With a protected `$env:DATABASE_URL` pointing only to the verified Development ref, the current documented command shape is:

   ```powershell
   supabase db dump --db-url $env:DATABASE_URL -f roles.sql --role-only
   supabase db dump --db-url $env:DATABASE_URL -f schema.sql
   supabase db dump --db-url $env:DATABASE_URL -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
   ```

   These commands were documented only; none were run. Avoid dumping managed internal schemas wholesale; account for any custom `auth`/`storage` changes separately.
3. Record database schema, migration ledger, extensions and versions, grants, RLS/policies, functions/triggers, publications, constraints, and indexes. Keep passwords, API keys, JWT secrets, OAuth secrets, and user password hashes out of the artifact and report.
4. Generate SHA-256 hashes and byte sizes for every export, store the manifest separately, and verify after copying to a second protected location.
5. Inventory Auth settings, providers, templates, redirect allowlist, MFA, and aggregate user count through approved administrative surfaces. Do not export user identities or authentication secrets unless a separately approved migration requires them.
6. Inventory Storage bucket policy and object count/bytes. The database backup does not include object bytes. If an approved recovery needs objects, export them through Storage APIs separately and verify each object hash. Inventory R2 and Cloudinary separately; they are not represented by Supabase database metadata.
7. Record Edge Functions source/config and secret names only; redeploy/re-enter secrets to a fresh target using the secret manager. Current connected project listed zero Edge Functions.

## Restore-to-new-target procedure

Provision a separate disposable Development target only after approval and cost confirmation. Install required extensions at compatible versions; ensure the target ref is not Production. For the documented logical CLI path, restore to an empty target with one `psql --single-transaction --variable ON_ERROR_STOP=1 --file roles.sql --file schema.sql --command 'SET session_replication_role = replica' --file data.sql --dbname $env:NEW_DATABASE_URL` invocation, after confirming installed CLI/PG client behavior. Do not blindly replay migrations over an imported schema. Reset custom role passwords in a protected channel. Recreate reviewed Auth settings, Storage buckets/policies, functions, webhooks, and R2 settings independently. Re-upload separately backed-up objects only after their manifest verifies. See Supabase [CLI backup and restore docs](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) for managed-schema caveats and restore ordering.

Validate dump hashes, schema/migration and extension versions, constraints/indexes, RLS/grants, and per-table row counts. Use aggregate counts and checksums for NAVI-owned tables; do not include campus contents or PII in reports. Validate Storage object counts and checksums separately. Test Auth callback on the Dev hostname and run read-only application smoke checks. Record downtime and recovery point. Keep the source intact until owner sign-off.

## Coverage and resource estimate

| Area | Coverage/evidence | Restore requirement |
|---|---|---|
| Database | 33 MB current database size; actual data rows not exported | Target must hold at least current DB size plus indexes/WAL and growth room. Allocate ≥100 MB local scratch as a simple 3× current-size minimum for a first export/restore exercise; increase after seeing actual dump size and object inventory. |
| Roles/secrets | Custom role passwords are not included in daily backups per Supabase docs; no role inventory performed | Recreate role grants, reset passwords; never copy Production secrets. |
| Supabase Storage | No buckets listed; object bytes are excluded from database backups | Separate bucket and object inventory/byte copy if buckets appear later. |
| Auth | No user/settings export; Auth configuration not inspected | Recreate provider/redirect settings; handle user migration only under separate approval and secure process. |
| Edge Functions | Zero listed | No function code inventory required now; secrets still require independent inventory if functions appear. |
| R2 / Cloudinary | R2 is configured by Production variable names in Vercel; Dev key names absent. Cloudinary placeholders exist in source config. | Separate Dev buckets/accounts and copy objects independently only if recovery scope requires them. |

Exact storage, compute, and transfer cost cannot be estimated from the read-only evidence; confirm current provider pricing and selected target size before creating a target. Free plan has no verified managed daily backup download. A database dump alone is not complete Supabase recovery. No backup readiness gate is passed.
