# `published_maps` Security Repair Proposal

**Status:** Proposed SQL only. Nothing was executed. Review against live grants, policies, function ownership, and deployed writer before applying to any database.

## Finding in candidate migrations

`supabase/migrations/006_create_published_maps.sql` enables RLS and defines a public read policy, but also grants `authenticated` direct `INSERT`, `UPDATE`, and `DELETE` on every published map. Its write policies use `WITH CHECK (true)` / `USING (true)`, so authentication alone permits direct map mutation. This is broader than the intended publisher boundary.

The intended trusted path is the server-side `src/app/api/publish/route.ts`: it requires verified mutation authentication and campus authorization, then uses `SUPABASE_SERVICE_ROLE_KEY` through `writePublishedMap`. Public app reads are through the `published_maps` read path. Keep public read compatibility and require the trusted server writer for mutations.

## Preconditions before an approved migration

Run read-only inventory against the actual target first: table grants, sequence grants, RLS enabled state, policy names/roles/commands/expressions, table owner, function/RPC grants and security mode, plus a test of public reads and server publishing in an isolated Development project. Verify service-role access and the deployed publish route contract. Do not infer live state from migration text alone.

## Proposed transaction (review required)

```sql
begin;

-- Keep public runtime reads. RLS is already enabled by migration 006.
grant select on table public.published_maps to anon, authenticated;
drop policy if exists "published_maps_write_authenticated" on public.published_maps;
drop policy if exists "published_maps_update_authenticated" on public.published_maps;
drop policy if exists "published_maps_delete_authenticated" on public.published_maps;

-- Remove direct client mutation privileges; trusted server code continues
-- through the service-role client and must retain its existing required grants.
revoke insert, update, delete, truncate, references, trigger
  on table public.published_maps from anon, authenticated;
revoke usage, select, update
  on sequence public.published_maps_id_seq from anon, authenticated;

commit;
```

This intentionally leaves `published_maps_read_all` in place. It does not grant `service_role` new privileges; verify its existing access before and after. If the deployed writer uses a different role or RPC, stop and revise the proposal rather than broadening client permissions. Roll back only by re-creating the exact three permissive write policies and grants from migration 006; that rollback restores the original exposure and requires explicit security-owner approval.

## Verification queries for a future isolated change

Before and after, inspect `information_schema.role_table_grants`, `information_schema.role_usage_grants`, `pg_policies`, `pg_class.relrowsecurity`, and `pg_proc`/`information_schema.routine_privileges` for the actual writer/RPC. Then verify:

1. `anon` can SELECT only as intended; anonymous INSERT/UPDATE/DELETE fail.
2. Ordinary `authenticated` can SELECT but direct INSERT/UPDATE/DELETE fail.
3. The authenticated `/api/publish` route continues to pass its existing user/campus authorization checks and service writer in Development.
4. Existing User App published reads still work.
5. No published row was changed by this permission repair.

## `spatial_ref_sys` is separate

`spatial_ref_sys` is installed/managed by PostGIS (extension creation is in migration 001), not owned by the `published_maps` publication model. This candidate does not define a `spatial_ref_sys` policy/grant change. Inventory actual grants, ownership, RLS state, PostGIS version, and the application's spatial query requirements separately. Preserve required read access for PostGIS/client use; revoke no privileges and add no RLS policy as part of the `published_maps` change without a specific verified exposure and compatibility review.

Supabase documents grants and RLS as separate controls, recommends least-privilege grants plus RLS for exposed Data API objects, and warns that service-role keys bypass RLS. See [Securing your API](https://supabase.com/docs/guides/api/securing-your-api), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), and [API keys](https://supabase.com/docs/guides/getting-started/api-keys).
