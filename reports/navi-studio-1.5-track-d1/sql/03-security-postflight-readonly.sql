-- READ-ONLY post-application catalog and PostGIS checks. Run only on isolated restore.
select 'published_maps_rls_enabled' as check_name,
       coalesce((select c.relrowsecurity from pg_class c where c.oid='public.published_maps'::regclass), false) as passed;
select 'published_maps_public_read_policy' as check_name,
       exists(select 1 from pg_policies where schemaname='public' and tablename='published_maps'
              and cmd='SELECT' and 'anon' = any(roles)) as passed;
select 'published_maps_no_authenticated_write_policies' as check_name,
       not exists(select 1 from pg_policies where schemaname='public' and tablename='published_maps'
                  and cmd in ('INSERT','UPDATE','DELETE') and 'authenticated' = any(roles)) as passed;
select 'published_maps_client_dml_revoked' as check_name,
       not has_table_privilege('anon','public.published_maps','INSERT')
       and not has_table_privilege('anon','public.published_maps','UPDATE')
       and not has_table_privilege('anon','public.published_maps','DELETE')
       and not has_table_privilege('authenticated','public.published_maps','INSERT')
       and not has_table_privilege('authenticated','public.published_maps','UPDATE')
       and not has_table_privilege('authenticated','public.published_maps','DELETE') as passed;
select 'published_maps_service_role_writer' as check_name,
       has_table_privilege('service_role','public.published_maps','INSERT')
       and has_table_privilege('service_role','public.published_maps','UPDATE') as passed;
select 'published_maps_sequence_client_revoked' as check_name,
       not has_sequence_privilege('anon','public.published_maps_id_seq','USAGE')
       and not has_sequence_privilege('authenticated','public.published_maps_id_seq','USAGE') as passed;
select 'spatial_ref_sys_extension_owner_preserved' as check_name,
       pg_get_userbyid(c.relowner)='supabase_admin' as passed
  from pg_class c where c.oid='public.spatial_ref_sys'::regclass;
select 'spatial_ref_sys_client_dml_revoked' as check_name,
       not has_table_privilege('anon','public.spatial_ref_sys','INSERT')
       and not has_table_privilege('anon','public.spatial_ref_sys','UPDATE')
       and not has_table_privilege('anon','public.spatial_ref_sys','DELETE')
       and not has_table_privilege('authenticated','public.spatial_ref_sys','INSERT')
       and not has_table_privilege('authenticated','public.spatial_ref_sys','UPDATE')
       and not has_table_privilege('authenticated','public.spatial_ref_sys','DELETE') as passed;
select 'postgis_transform_smoke' as check_name,
       postgis_full_version() is not null
       and ST_SRID(ST_Transform(ST_SetSRID(ST_MakePoint(121.0,14.0),4326),3857))=3857 as passed;
