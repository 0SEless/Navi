# Development Recovery Prerequisites

## Project identity and backup availability

Read-only project metadata previously identified `navi-development`, ref `scvgulusmutnzasmgysx`, region `ap-northeast-1`, ACTIVE_HEALTHY, PostgreSQL 17.6.1.166. The configured Production ref in `src/lib/env-safety.ts` is `oltfaepqcktrumfhadzb`, which differs.

The signed-in dashboard for `scvgulusmutnzasmgysx` displayed the project name `navi-development` but labeled its selected `main` branch **PRODUCTION**. This conflicts with the name and repository ref guard. The exact intended Development environment is not safely disambiguated. Do not export until the owner confirms the approved non-Production ref and the Supabase organization/project mapping. The dashboard was viewed read-only; no SQL editor, table data, or export was accessed.

The dashboard states **Free Plan does not include project backups**. Therefore a usable scheduled backup was not available in the dashboard at inspection time. The prior connector has no backup-listing API. A logical CLI dump is the future path after identity approval; it has not been run.

## Version and restore target

- Supabase Development metadata: PostgreSQL **17.6.1.166**, PostGIS **3.3.7** in `public`, `pgcrypto` 1.3 and `uuid-ossp` 1.1 in `extensions`.
- Local E5: PostgreSQL **17.11**. It has no PostGIS and is only a scoped persistence SQL/adapter target.
- Preserved D2 image: `postgis/postgis:17-3.6` (previously observed PostGIS 3.6.4). It is not an E6 restore target and remains protected.
- The officially documented current PostGIS Docker image family supports PostgreSQL 17 with PostGIS 3.6.x and 3.5.x; the exact Development PostGIS 3.3.7 combination was not found in the verified local image set. PostgreSQL major-version compatibility alone is insufficient to prove extension-object compatibility. A separate, pinned PostGIS target must be selected and verified before any restore. See [PostGIS image matrix](https://github.com/postgis/docker-postgis) and [Docker Hub tags](https://hub.docker.com/r/postgis/postgis/tags).

A faithful restore rehearsal should record actual `pg_dump`, server, PostGIS, GEOS/PROJ/GDAL, and extension versions and validate extension creation, SRIDs, geometry operations, transforms, constraints, ownership, grants, and RLS after restore.

## Supabase-specific gaps

A PostgreSQL dump is not a complete Supabase project backup. Supabase documentation notes that CLI dumps exclude managed `auth`, `storage`, and extension schemas by default; default output is schema-only and does not include data or custom roles. Separate plans are required for Auth/provider configuration, Storage object bytes (not stored in the database backup), Edge Functions and their secrets/import maps, Realtime configuration, Vault/secrets, API keys, project settings, and external media. Custom login-role passwords may need resetting. Policies/grants and managed-schema customizations need explicit review.

Relevant official references:

- [Supabase backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase CLI backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Supabase CLI db dump reference](https://supabase.com/docs/reference/cli/global-flags)
- [Restore a dashboard backup](https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore)
- [PostgreSQL 17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)

No row data, migrations, roles, extensions, or settings were changed.

