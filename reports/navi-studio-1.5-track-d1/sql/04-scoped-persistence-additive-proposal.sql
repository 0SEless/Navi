-- DESIGN SKELETON ONLY. Identifiers/types, retention, and route contract require review.
-- This is additive; it does not alter existing revisions, mutations, or publications.
begin;
create schema if not exists navi_private;
revoke all on schema navi_private from public, anon, authenticated;

create table navi_private.campus_commit_heads (
  campus_id text primary key,
  revision bigint not null check (revision >= 0),
  content_checksum text not null,
  updated_at timestamptz not null default now()
);

create table navi_private.campus_commits (
  id uuid primary key default gen_random_uuid(),
  campus_id text not null,
  revision bigint not null check (revision > 0),
  mutation_id uuid not null,
  request_checksum text not null,
  content_checksum text not null,
  actor_id uuid not null,
  created_at timestamptz not null default now(),
  unique (campus_id, revision),
  unique (campus_id, mutation_id),
  unique (id, campus_id)
);

create table navi_private.campus_change_sets (
  id uuid primary key default gen_random_uuid(),
  campus_id text not null,
  commit_id uuid not null,
  scope_kind text not null check (scope_kind in ('building','routing','terrain','campus-settings')),
  scope_id text not null,
  scope_revision bigint not null check (scope_revision > 0),
  before_checksum text,
  after_checksum text not null,
  format_version integer not null check (format_version > 0),
  payload jsonb not null,
  unique (commit_id, scope_kind, scope_id),
  unique (campus_id, scope_kind, scope_id, scope_revision),
  foreign key (commit_id, campus_id) references navi_private.campus_commits(id, campus_id)
);

create table navi_private.campus_commit_dependencies (
  commit_id uuid not null references navi_private.campus_commits(id),
  dependency_scope_kind text not null,
  dependency_scope_id text not null,
  expected_scope_revision bigint not null check (expected_scope_revision > 0),
  expected_checksum text not null,
  required boolean not null default true,
  primary key (commit_id, dependency_scope_kind, dependency_scope_id)
);

create table navi_private.campus_checkpoints (
  id uuid primary key default gen_random_uuid(),
  campus_id text not null,
  commit_id uuid not null,
  format_version integer not null check (format_version > 0),
  payload jsonb not null,
  content_checksum text not null,
  created_at timestamptz not null default now(),
  unique (campus_id, commit_id),
  foreign key (commit_id, campus_id) references navi_private.campus_commits(id, campus_id)
);

create table navi_private.campus_mutation_receipts (
  campus_id text not null,
  mutation_id uuid not null,
  request_checksum text not null,
  acknowledgment jsonb not null,
  created_at timestamptz not null default now(),
  primary key (campus_id, mutation_id)
);

create index campus_commits_campus_created_idx on navi_private.campus_commits(campus_id, created_at desc);
create index campus_change_sets_scope_revision_idx on navi_private.campus_change_sets(scope_kind, scope_id, scope_revision desc);
create index campus_dependencies_lookup_idx on navi_private.campus_commit_dependencies(dependency_scope_kind, dependency_scope_id, expected_scope_revision);

alter table navi_private.campus_commit_heads enable row level security;
alter table navi_private.campus_commits enable row level security;
alter table navi_private.campus_change_sets enable row level security;
alter table navi_private.campus_commit_dependencies enable row level security;
alter table navi_private.campus_checkpoints enable row level security;
alter table navi_private.campus_mutation_receipts enable row level security;

grant usage on schema navi_private to service_role;
grant select, insert, update, delete on all tables in schema navi_private to service_role;
commit;
