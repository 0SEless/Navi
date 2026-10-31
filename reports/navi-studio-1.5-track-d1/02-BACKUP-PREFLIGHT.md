# Backup Preflight and Export Procedure

**No export was performed.** Supabase CLI `2.111.0` is installed. `supabase db dump --help` confirmed flags `--db-url`, `--file`, `--role-only`, `--data-only`, `--use-copy`, and `--exclude`; CLI help needed a write to the user telemetry file and was blocked by filesystem permissions on the first attempt, then completed with telemetry disabled. No database URL or password was read into output.

## Readiness

- Dev identity: Supabase project `scvgulusmutnzasmgysx`, `navi-development`, ACTIVE_HEALTHY, `ap-northeast-1`; Vercel variable values are not verified.
- Database size: 33 MB. Dev plan: Free; managed backup download is unavailable on this plan.
- Bucket metadata: zero buckets and zero objects in Supabase Storage. This does not account for external R2/Cloudinary media; no such storage variables were in the observed Dev Preview inventory.
- No `psql`, `age`, `gpg`, `7z`, SQL linter, or Docker daemon available. No encrypted destination selected. Thus the export-and-verify chain is not ready.

## Proposed operator procedure (requires separate approval)

1. Confirm Dev identity and schedule a quiet period. Obtain the DB connection string through an approved secret manager; do not put it in a shell command, report, or history. Use a dedicated Dev read-only credential where supported.
2. Select an owner-controlled encrypted volume/destination and an independently stored encryption key. Install/verify a current `age` or approved equivalent tool and PostgreSQL 17-compatible `pg_dump`/`psql`. Record tool versions. Destination and retention policy require owner choice; 30-day retention is a proposal, not an existing policy.
3. Export roles, schema, and data separately with the installed CLI. Example PowerShell commands after secure environment injection:

```powershell
supabase db dump --db-url $env:NAVI_DEV_DATABASE_URL --role-only --file .\roles.sql
supabase db dump --db-url $env:NAVI_DEV_DATABASE_URL --file .\schema.sql
supabase db dump --db-url $env:NAVI_DEV_DATABASE_URL --data-only --use-copy --file .\data.sql
```

4. Capture exact CLI/pg_dump versions, UTC timestamp, Dev project ref, exit codes, byte sizes, and SHA-256 hashes. Encrypt each artifact before moving it to the approved destination; verify ciphertext hashes and perform a decryption/readability check in a controlled workspace. Do not rely on deleting plaintext from SSD as secure erasure.
5. Keep roles, schema, and data as separate artifacts. Supabase’s logical dump does not include Storage object bytes; Auth settings, OAuth providers, redirect URLs, Edge Functions, Realtime configuration, and external object stores need separate inventory/backup. Never include service-role secrets in the report.
6. Confirm retention and deletion with the data owner. Do not auto-prune the only verified copy. Record custodian and restore access procedure.

The above is a procedure only. No command shown was run. `supabase db dump --dry-run` was also not run because it may initiate remote inspection.
