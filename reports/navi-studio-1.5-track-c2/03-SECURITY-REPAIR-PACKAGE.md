# Security Repair Package — Development Only

**Status:** Proposed SQL; not executed. Source and Development catalogs inspected read-only on 2026-10-30.

## Findings

### `published_maps`

Development has RLS enabled (`relrowsecurity=true`, `relforcerowsecurity=false`). Live policies are:

| Policy | Role | Command | Predicate |
|---|---|---|---|
| `published_maps_read_all` | `anon`, `authenticated` | SELECT | `USING (true)` |
| `published_maps_write_authenticated` | `authenticated` | INSERT | `WITH CHECK (true)` |
| `published_maps_update_authenticated` | `authenticated` | UPDATE | `USING (true) WITH CHECK (true)` |
| `published_maps_delete_authenticated` | `authenticated` | DELETE | `USING (true)` |

The live ACL grants `anon`, `authenticated`, and `service_role` all table privileges. Catalog checks confirm authenticated INSERT/UPDATE/DELETE are effectively allowed by the permissive policies. `anon` has no write policy, so RLS denies those operations even though its ACL is broad. The `published_maps_id_seq` sequence is effectively usable by anon/authenticated/service_role; the proposal removes client sequence privileges and leaves service-role privileges untouched. The migration definition is `supabase/migrations/006_create_published_maps.sql`.

The trusted source route `src/app/api/publish/route.ts` calls `requireVerifiedMutationAuth`, rejects protected campus writes, validates compiled artifacts, then uses a server credential and `writePublishedMap`. The verified gate calls `auth.getUser()` and checks administrator identity. This is a viable server path; direct authenticated PostgREST writes bypass the route’s campus/admin checks.

### `spatial_ref_sys`

The table is owned by `supabase_admin`, has RLS disabled, is extension-dependent on PostGIS, and has ACL `supabase_admin=arwdDxtm`, `postgres=arwdDxtm`, `anon=arwdDxtm`, `authenticated=arwdDxtm`, `service_role=arwdDxtm`, plus PUBLIC SELECT. It is extension-managed, so blindly enabling RLS or moving the extension may break PostGIS functions and ownership/upgrade flows. The security advisor reports RLS disabled in public, PostGIS in `public`, and three public `SECURITY DEFINER` `st_estimatedextent` overloads callable by anon/authenticated. It also reports leaked-password protection disabled and five RLS-enabled/no-policy tables. These are separate review items; the live `published_maps` correction does not fix them.

## Smallest proposed SQL

Run only after a backup/recovery path and the negative tests below are approved in a disposable Development environment. This preserves public SELECT and the service-role server path.

```sql
begin;

-- Preserve public published-artifact reads.
grant select on table public.published_maps to anon, authenticated;
drop policy if exists published_maps_write_authenticated on public.published_maps;
drop policy if exists published_maps_update_authenticated on public.published_maps;
drop policy if exists published_maps_delete_authenticated on public.published_maps;
revoke insert, update, delete, truncate, references, trigger
  on table public.published_maps from anon, authenticated;
revoke usage, select, update
  on sequence public.published_maps_id_seq from anon, authenticated;

-- spatial_ref_sys is PostGIS-owned. Keep reads; remove client mutation rights.
revoke insert, update, delete, truncate, references, trigger
  on table public.spatial_ref_sys from anon, authenticated;

commit;
```

The `spatial_ref_sys` linter warning will remain because RLS is still disabled; its intentional public read access and extension-owned status must be reviewed with PostGIS compatibility tests. If the owner requires RLS, prepare a separate extension-owner-approved migration with a read-only policy and validate `ST_Transform`, geometry constructors, and extension upgrade behavior first. Do not move PostGIS as part of this patch.

## Roles, behavior, negative tests

- `anon`: may SELECT public published artifacts and spatial reference metadata; direct DML must fail at `published_maps` (no policy/privilege) and `spatial_ref_sys` (revoked privilege).
- `authenticated`: may SELECT public artifacts; direct INSERT/UPDATE/DELETE on both tables must fail. Authenticated admin publishing must continue through the verified server route.
- `service_role`: remains the trusted server writer for `published_maps`; it bypasses RLS. It is never sent to a browser. `spatial_ref_sys` server writes are not part of the application contract.
- `postgres` / extension owner: retain administrative/extension ownership as required.

Future isolated verification: use anonymous and ordinary authenticated JWTs to test SELECT success and DML denial; attempt server publishing with verified Dev admin and non-admin sessions; verify protected-campus denial, artifact read compatibility, service writer success, and PostGIS `ST_Transform` plus extension upgrade smoke tests. No live exploit attempt or policy test write was performed.

## Rollback and order

Rollback is intentionally the original permissive behavior and requires renewed security-owner approval:

```sql
begin;
grant select on table public.published_maps to anon;
grant select, insert, update, delete on table public.published_maps to authenticated;
grant usage, select on sequence public.published_maps_id_seq to authenticated;
create policy published_maps_write_authenticated on public.published_maps
  for insert to authenticated with check (true);
create policy published_maps_update_authenticated on public.published_maps
  for update to authenticated using (true) with check (true);
create policy published_maps_delete_authenticated on public.published_maps
  for delete to authenticated using (true);
grant insert, update, delete, truncate, references, trigger
  on table public.spatial_ref_sys to anon, authenticated;
commit;
```

Order: (1) verify Development identity and isolated restore path; (2) reconcile Vercel key contract; (3) approve/review this SQL and save exact current definitions; (4) apply only to disposable Development in a separate authorized task; (5) test public read, DML denial, server publish, and PostGIS; (6) review advisor delta. No schema or policy change was made in C2.
