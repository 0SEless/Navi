# Track D5 — Development Runtime and Schema Compatibility

## Read-only observed Development metadata

Supabase project identity was confirmed as `navi-development`, ref `scvgulusmutnzasmgysx`, region `ap-northeast-1`, active/healthy, PostgreSQL 17.6.1.166. Installed PostGIS is 3.3.7 in `public`; `pgcrypto` 1.3 and `uuid-ossp` 1.1 are in `extensions`. No query of application rows, export, or write was performed.

D4.1 synthetic local baseline is PostgreSQL 17.11 / PostGIS 3.6.4. Both are PostgreSQL major 17, but PostGIS patch/minor versions differ. D5 did not restore the Development schema/data into the local image, so compatibility is not proven.

## Restore compatibility assessment

- A PostgreSQL 17 `pg_dump` is suitable for a PostgreSQL 17 target in principle. PostgreSQL documents that dump output is intended to load into newer server versions, with no guarantee for older targets. This does not guarantee extension-specific object compatibility.
- PostGIS 3.3.7 objects may need PostGIS 3.3.7 on the restore target for closest reproduction. The local 3.6.4 image may provide upgrade-compatible behavior, but an actual restore and geometry/SRID/function checks are required. Prefer a local PostGIS 3.3.7 image for fidelity if available and security-maintained; otherwise document the version difference and verify all extension objects/functions and representative operations after restore.
- A plain SQL/custom dump does not recreate Supabase's managed Auth, Storage, API, Realtime, Vault, edge runtime, project settings, roles/passwords, or external media as a complete service. Supabase-managed schemas are subject to exclusions and restore constraints. Inventory these separately.
- The D1 preflight's `published_maps` security proposal matches the read-only metadata observed: RLS enabled; public SELECT policy for `anon`/`authenticated`; authenticated insert/update/delete policies; and the corresponding grants. No SQL was executed.
- D1's additive `navi_private` schema does not exist in the current catalog. Existing campus tables use `campus_id text`; existing graph revision data uses a timestamp-based representation. Proposed bigint revision records are a separate design, not a replacement or migration-ready change. Preserve existing tables and VTour-specific persistence until keys, actor FK semantics, checkpoint format, retention, and concurrency behavior are specified.
- `public.spatial_ref_sys` is owned by `supabase_admin`, has RLS disabled, and is a PostGIS SRID lookup table. Supabase table listing raised a `rls_disabled` advisory and suggested `ALTER TABLE "public"."spatial_ref_sys" ENABLE ROW LEVEL SECURITY;`. This suggestion was not executed. D1 preflight recommends restricting client DML while retaining lookup reads and not blindly enabling RLS, moving the extension, or changing ownership. Review grants/policies through a supported owner-approved process before any security migration.

## Sources

- [Supabase database backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase CLI `db dump`](https://supabase.com/docs/reference/cli/supabase-db-dump)
- [Supabase backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Supabase permissions](https://supabase.com/docs/guides/platform/permissions)
- [Supabase PostGIS extension](https://supabase.com/docs/guides/database/extensions/postgis)
- [PostgreSQL 17 `pg_dump`](https://www.postgresql.org/docs/17/app-pgdump.html)
- [PostGIS manual](https://www.postgis.net/docs/postgis.html)

No Development project setting, extension, policy, grant, schema, or row was changed.
