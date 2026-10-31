# Future Development Backup and Isolated Restore — Owner Approval Package

**Status: NOT READY TO EXECUTE.** The dashboard reports no scheduled backups on the Free plan and shows the selected `main` branch as `PRODUCTION` for the project titled `navi-development`. The owner must first disambiguate the exact authorized non-Production ref. The candidate metadata ref is `scvgulusmutnzasmgysx`; the repository's configured Production ref is `oltfaepqcktrumfhadzb`. No export is authorized or performed by this package.

## Proposed scope after identity resolution and explicit approval

- Source: one owner-confirmed Development Supabase project/ref only.
- Operations: read-only project/extension/version/size inventory; logical schema, data, and custom-role dumps; encryption and manifest; restore only to a new isolated local target. No source writes, migrations, restores into Supabase, or Production access.
- Classification: potentially sensitive application and identity-linked data. Treat dump, logs, and manifests as restricted; never place plaintext or credentials in the repository.
- Tooling: pin and record a current approved Supabase CLI and PostgreSQL 17 client/server build. The project uses PostgreSQL 17.6.1.166, while E5 is PostgreSQL 17.11 without PostGIS. Select and pin a compatible PostGIS target before approval; no image was pulled for E6.
- Storage: restricted local staging followed by encrypted artifact storage at an owner-approved location. AES-256-GCM envelope with integrity manifest; recovery key held separately by named custodians. Keep ciphertext and key custody separate.
- Disk: current C: free space measured at about **10.77 GiB**. Current Development database size was not queried. Before approval, measure live size and ensure free space for at least three times the measured logical dump size plus target image/database overhead and temporary restore files; stop if this cannot be demonstrated.

## Proposed command sequence (not executed)

After confirming identity, credentials, destination, and tooling, use a throwaway working directory outside the source repo. Authenticate using the approved read-only operator identity, link that temporary workspace to the exact approved ref, then run:

```powershell
supabase link --project-ref $env:NAVI_APPROVED_DEV_PROJECT_REF
supabase db dump --linked --file schema.sql
supabase db dump --linked --data-only --use-copy --file data.sql
supabase db dump --linked --role-only --file roles.sql
```

These commands are templates for the future approval. The Supabase CLI default dump is schema-only and excludes Supabase-managed `auth`, `storage`, and extension schemas; `--data-only` and `--role-only` are separate. Review the generated artifacts and exclusions before restore. Do not dump database URLs, tokens, passwords, or file contents to logs. Do not run the commands against either candidate ref until the environment-label conflict is resolved.

Restore only into a newly created isolated local PostgreSQL/PostGIS target matching PostgreSQL 17 and as closely as practical PostGIS 3.3.7. Restore roles/schema/data in reviewed order; omit or map Supabase-managed owners/roles deliberately. Recreate extension versions before dependent objects. Verify counts, checksums/fingerprints, constraints/FKs, sequences, PostGIS transforms, ownership, grants, RLS/policies, and representative read-only application queries. Do not treat schema-only success as full recovery.

## Exclusions

A PostgreSQL dump does not restore Storage object bytes, managed Auth provider settings/API keys, Edge Functions and secrets, Realtime configuration, Vault secrets, project settings, external media, or all platform-managed objects. These require separate inventories and separately approved recovery plans.

## Failure handling and rollback boundary

On identity mismatch, unsupported extension/owner errors, incomplete dump, checksum mismatch, insufficient disk, or failed integrity check: stop, preserve encrypted evidence/logs, keep plaintext staging only until recovery/secure cleanup decision, and report the blocker. Rollback means discard only the newly created local restore target and its explicitly named E6 resources after separate cleanup authorization. Never modify or delete E5/D2 or unrelated resources. Production ref `oltfaepqcktrumfhadzb` is explicitly excluded.

## Owner decisions required before execution

1. Confirm the correct Development project ref and explain the dashboard's `main PRODUCTION` label.
2. Confirm the project is non-Production and approve the exact read/export operation.
3. Approve operator identity, data handling destination, retention, and named key custodians.
4. Approve the pinned PostgreSQL/PostGIS target and required disk budget.
5. Approve restore validation criteria and cleanup boundary.

Official procedures: [Supabase backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [CLI db dump reference](https://supabase.com/docs/reference/cli/global-flags), [Supabase backups and plan behavior](https://supabase.com/docs/guides/platform/backups).

