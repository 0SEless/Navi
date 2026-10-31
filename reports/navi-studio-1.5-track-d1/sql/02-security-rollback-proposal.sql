-- ROLLBACK PROPOSAL ONLY. Restores previously observed permissive behavior.
-- Requires renewed security-owner approval; it reopens direct authenticated writes.
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
