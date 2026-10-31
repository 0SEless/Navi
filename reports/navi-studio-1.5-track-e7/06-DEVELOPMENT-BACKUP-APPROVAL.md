# Development Backup Approval Package

## Target candidate

- Supabase project ref: **`scvgulusmutnzasmgysx`** (`navi-development`, `ap-northeast-1`, PostgreSQL 17.6.1.166).
- Historical NAVI Production ref: **`oltfaepqcktrumfhadzb`**. The refs differ; `navi-dev-studio` Preview metadata points to the candidate. The dashboard's `PRODUCTION` label is on the candidate's primary `main` branch. This supports the candidate mapping but still warrants owner acknowledgment before export.
- No Supabase rows were queried or exported. This package is a proposal only.

## Proposed export contents

After owner approval and final project-ref check, create a logical PostgreSQL dump using the approved Supabase CLI `db dump` workflow, with schema, data, and required ownership/privilege statements as supported for the project. Include required extensions and migration/configuration metadata separately. Capture the exact CLI version, dump command, project ref, timestamp, dump checksum, and encrypted artifact checksum. Do not include unrelated storage objects unless separately approved. Redact connection strings and tokens from logs.

## Compatibility and restore target

The project reports PostgreSQL 17.6.1.166 and PostGIS 3.3.7. E5 is PostgreSQL 17.11 without PostGIS; protected D2 is PostgreSQL 17 with PostGIS 3.6.4. Neither is an exact Development restore target. Before export, provision a new isolated target on PostgreSQL 17 with a verified PostGIS 3.3.7-compatible image, loopback-only access, isolated network/volume, and measured disk budget. Do not reuse D2 or infer compatibility from PostgreSQL major version alone.

## Encryption, custody, and storage

Encrypt the logical dump with an authenticated encryption format (AES-256-GCM or an approved equivalent) using a random data key. Store key material separately from ciphertext, verify recovery by an independent authorized custodian, and document rotation/revocation. Select an access-controlled backup location with retention and deletion policy before export; do not store secrets in the repository or test logs.

## Restore verification

Restore only into the isolated target. Verify archive integrity and checksum; PostgreSQL/PostGIS/extension versions; schema and migration state; role and privilege posture; row counts and deterministic checksums for approved data; spatial validity and coordinate transforms; constraints and indexes; and application-level read-only smoke tests. Record failures and preserve sanitized logs. Do not point the application at the restore.

## Risks and exclusions

The Supabase Free plan shown in the dashboard does not provide scheduled project backups. `navi-next` Preview currently points at the historical Production Supabase URL; no Vercel change is included. This rehearsal does not establish real Development recoverability. No export, restore, migration, cloud write, Vercel modification, or Production operation is authorized by this report.

**Owner approvals still required:** confirm `scvgulusmutnzasmgysx` as the intended export target despite the branch label; approve one-time logical export; choose encrypted storage and retention; approve independent key custody; approve a compatible isolated restore target and disk budget; authorize the restore test scope.
