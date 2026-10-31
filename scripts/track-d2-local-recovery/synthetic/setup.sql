\set ON_ERROR_STOP on
create extension if not exists postgis;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;

create table public.synthetic_campuses(campus_id text primary key);
create table public.synthetic_buildings(
  campus_id text not null references public.synthetic_campuses(campus_id),
  building_id text not null,
  primary key(campus_id, building_id)
);
create table public.synthetic_commits(
  campus_id text not null references public.synthetic_campuses(campus_id),
  commit_id uuid not null,
  primary key(campus_id, commit_id),
  unique(commit_id, campus_id)
);
create table public.synthetic_change_sets(
  campus_id text not null,
  commit_id uuid not null,
  scope_kind text not null,
  scope_id text not null,
  scope_revision bigint not null,
  primary key(campus_id, scope_kind, scope_id, scope_revision),
  foreign key(commit_id, campus_id) references public.synthetic_commits(commit_id, campus_id)
);

create table public.synthetic_published_artifacts(
  artifact_id text primary key,
  body text not null
);
alter table public.synthetic_published_artifacts enable row level security;
create policy synthetic_public_read on public.synthetic_published_artifacts
  for select to anon, authenticated using (true);
create policy synthetic_trusted_write on public.synthetic_published_artifacts
  for all to service_role using (true) with check (true);
grant usage on schema public to anon, authenticated, service_role;
grant select on public.synthetic_published_artifacts to anon, authenticated;
grant insert, update, delete on public.synthetic_published_artifacts to service_role;

insert into public.synthetic_campuses values ('synthetic-campus-a');
insert into public.synthetic_buildings values ('synthetic-campus-a','synthetic-building-1');
insert into public.synthetic_commits values
 ('synthetic-campus-a','00000000-0000-4000-8000-000000000001');
insert into public.synthetic_change_sets values
 ('synthetic-campus-a','00000000-0000-4000-8000-000000000001','building','synthetic-building-1',1);
insert into public.synthetic_published_artifacts values
 ('synthetic-artifact-1','fabricated payload one'),
 ('synthetic-artifact-2','fabricated payload two');
