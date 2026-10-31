-- PROPOSAL ONLY. Review against a verified isolated Development restore.
-- Preserve public read; route trusted writes through the verified server path.
begin;

grant select on table public.published_maps to anon, authenticated;
drop policy if exists published_maps_write_authenticated on public.published_maps;
drop policy if exists published_maps_update_authenticated on public.published_maps;
drop policy if exists published_maps_delete_authenticated on public.published_maps;
revoke insert, update, delete, truncate, references, trigger
  on table public.published_maps from anon, authenticated;
revoke usage, select, update
  on sequence public.published_maps_id_seq from anon, authenticated;

-- PostGIS owns this table. Do not enable RLS or move the extension here.
revoke insert, update, delete, truncate, references, trigger
  on table public.spatial_ref_sys from anon, authenticated;

commit;
