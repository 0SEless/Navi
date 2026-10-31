-- PROPOSED ONLY — Tracks E3/E4. This migration has NOT been applied.
-- It adds an isolated private schema and does not read, backfill, or modify
-- public.graph_snapshots, campus_graph_revisions, or any published-campus data.
-- Scope payloads are JSONB so this proposal does not create, move, or alter any
-- PostGIS extension-owned objects.

BEGIN;

CREATE SCHEMA IF NOT EXISTS navi_scoped;
COMMENT ON SCHEMA navi_scoped IS
  'Private NAVI Studio scoped persistence proposal; owned by the migration executor, which must be a server-side migration role; keep outside Supabase exposed API schemas and never transfer ownership to anon or authenticated roles.';

CREATE TABLE navi_scoped.campus_heads (
  campus_id TEXT PRIMARY KEY CHECK (length(btrim(campus_id)) BETWEEN 1 AND 256),
  document_id TEXT NOT NULL UNIQUE CHECK (length(btrim(document_id)) BETWEEN 1 AND 320),
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  head_checksum TEXT NOT NULL CHECK (head_checksum ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  created_by TEXT NOT NULL CHECK (length(btrim(created_by)) BETWEEN 1 AND 256)
);

CREATE TABLE navi_scoped.scope_heads (
  campus_id TEXT NOT NULL REFERENCES navi_scoped.campus_heads(campus_id),
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('building', 'routing', 'terrain', 'campus-settings')),
  scope_id TEXT NOT NULL CHECK (length(btrim(scope_id)) BETWEEN 1 AND 256),
  revision BIGINT NOT NULL CHECK (revision >= 0),
  content_checksum TEXT NOT NULL CHECK (content_checksum ~ '^[a-f0-9]{64}$'),
  content_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (campus_id, scope_kind, scope_id)
);
CREATE INDEX scope_heads_campus_revision_idx
  ON navi_scoped.scope_heads (campus_id, revision DESC);

CREATE TABLE navi_scoped.change_sets (
  campus_id TEXT NOT NULL REFERENCES navi_scoped.campus_heads(campus_id),
  revision BIGINT NOT NULL CHECK (revision > 0),
  batch_checksum TEXT NOT NULL CHECK (batch_checksum ~ '^[a-f0-9]{64}$'),
  before_head_checksum TEXT NOT NULL CHECK (before_head_checksum ~ '^[a-f0-9]{64}$'),
  after_head_checksum TEXT NOT NULL CHECK (after_head_checksum ~ '^[a-f0-9]{64}$'),
  operation_count INTEGER NOT NULL CHECK (operation_count > 0),
  actor_id TEXT NOT NULL CHECK (length(btrim(actor_id)) BETWEEN 1 AND 256),
  committed_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (campus_id, revision),
  UNIQUE (campus_id, revision, batch_checksum)
);
CREATE INDEX change_sets_recent_idx
  ON navi_scoped.change_sets (campus_id, revision DESC);

CREATE TABLE navi_scoped.change_operations (
  campus_id TEXT NOT NULL,
  revision BIGINT NOT NULL,
  operation_index SMALLINT NOT NULL CHECK (operation_index >= 0),
  mutation_id TEXT NOT NULL CHECK (length(btrim(mutation_id)) BETWEEN 1 AND 320),
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('building', 'routing', 'terrain', 'campus-settings')),
  scope_id TEXT NOT NULL CHECK (length(btrim(scope_id)) BETWEEN 1 AND 256),
  before_checksum TEXT NOT NULL CHECK (before_checksum ~ '^[a-f0-9]{64}$'),
  after_checksum TEXT NOT NULL CHECK (after_checksum ~ '^[a-f0-9]{64}$'),
  content_json JSONB NOT NULL,
  PRIMARY KEY (campus_id, revision, operation_index),
  UNIQUE (campus_id, revision, mutation_id),
  UNIQUE (campus_id, revision, scope_kind, scope_id),
  FOREIGN KEY (campus_id, revision)
    REFERENCES navi_scoped.change_sets(campus_id, revision),
  FOREIGN KEY (campus_id, scope_kind, scope_id)
    REFERENCES navi_scoped.scope_heads(campus_id, scope_kind, scope_id)
);
CREATE INDEX change_operations_scope_history_idx
  ON navi_scoped.change_operations (campus_id, scope_kind, scope_id, revision DESC);

CREATE TABLE navi_scoped.change_dependencies (
  campus_id TEXT NOT NULL,
  revision BIGINT NOT NULL,
  operation_index SMALLINT NOT NULL,
  dependency_index SMALLINT NOT NULL CHECK (dependency_index >= 0),
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('building', 'routing', 'terrain', 'campus-settings')),
  scope_id TEXT NOT NULL CHECK (length(btrim(scope_id)) BETWEEN 1 AND 256),
  expected_revision BIGINT NOT NULL CHECK (expected_revision >= 0),
  expected_checksum TEXT NOT NULL CHECK (expected_checksum ~ '^[a-f0-9]{64}$'),
  required BOOLEAN NOT NULL,
  PRIMARY KEY (campus_id, revision, operation_index, dependency_index),
  FOREIGN KEY (campus_id, revision, operation_index)
    REFERENCES navi_scoped.change_operations(campus_id, revision, operation_index)
);
CREATE INDEX change_dependencies_scope_idx
  ON navi_scoped.change_dependencies (campus_id, scope_kind, scope_id, expected_revision DESC);

CREATE TABLE navi_scoped.mutation_receipts (
  campus_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL CHECK (length(btrim(mutation_id)) BETWEEN 1 AND 320),
  request_checksum TEXT NOT NULL CHECK (request_checksum ~ '^[a-f0-9]{64}$'),
  content_checksum TEXT NOT NULL CHECK (content_checksum ~ '^[a-f0-9]{64}$'),
  revision BIGINT NOT NULL,
  operation_index SMALLINT,
  batch_checksum TEXT NOT NULL CHECK (batch_checksum ~ '^[a-f0-9]{64}$'),
  committed_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (campus_id, mutation_id),
  FOREIGN KEY (campus_id, revision, batch_checksum)
    REFERENCES navi_scoped.change_sets(campus_id, revision, batch_checksum),
  FOREIGN KEY (campus_id, revision, operation_index)
    REFERENCES navi_scoped.change_operations(campus_id, revision, operation_index)
);
CREATE INDEX mutation_receipts_revision_idx
  ON navi_scoped.mutation_receipts (campus_id, revision DESC);

CREATE TABLE navi_scoped.checkpoints (
  campus_id TEXT NOT NULL REFERENCES navi_scoped.campus_heads(campus_id),
  revision BIGINT NOT NULL CHECK (revision >= 0),
  format_version SMALLINT NOT NULL DEFAULT 1 CHECK (format_version = 1),
  scope_count INTEGER NOT NULL CHECK (scope_count >= 0),
  snapshot_checksum TEXT NOT NULL CHECK (snapshot_checksum ~ '^[a-f0-9]{64}$'),
  snapshot_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (campus_id, revision)
);
CREATE INDEX checkpoints_latest_idx
  ON navi_scoped.checkpoints (campus_id, revision DESC);

COMMENT ON TABLE navi_scoped.campus_heads IS
  'One stable document identity and campus-wide monotonic revision per campus.';
COMMENT ON TABLE navi_scoped.scope_heads IS
  'Current scoped JSON projection; stores one scope, never a full campus document per save.';
COMMENT ON TABLE navi_scoped.change_sets IS
  'Immutable per-campus revision envelope; one row per accepted changed batch.';
COMMENT ON TABLE navi_scoped.change_operations IS
  'Immutable scope replacement operations for reconstruction; operation payloads are scope-scoped JSONB.';
COMMENT ON TABLE navi_scoped.change_dependencies IS
  'Immutable revision/checksum dependency references captured for each operation.';
COMMENT ON TABLE navi_scoped.mutation_receipts IS
  'Campus-scoped idempotency receipts. A null operation_index identifies a no-op member of a changed batch.';
COMMENT ON TABLE navi_scoped.checkpoints IS
  'Periodic full scoped projection snapshots; revision zero is the bootstrap checkpoint.';

-- These are application-owned tables, not extension-owned PostGIS objects.
ALTER TABLE navi_scoped.campus_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE navi_scoped.scope_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE navi_scoped.change_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE navi_scoped.change_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE navi_scoped.change_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE navi_scoped.mutation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE navi_scoped.checkpoints ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA navi_scoped FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA navi_scoped FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA navi_scoped REVOKE ALL ON TABLES FROM PUBLIC;

-- Supabase roles are conditional so this proposal can also be reviewed against a
-- plain PostgreSQL catalog. No anon/authenticated policy or grant is created.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA navi_scoped FROM anon';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA navi_scoped FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA navi_scoped REVOKE ALL ON TABLES FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA navi_scoped FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA navi_scoped FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA navi_scoped REVOKE ALL ON TABLES FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA navi_scoped TO service_role';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON navi_scoped.campus_heads, navi_scoped.scope_heads TO service_role';
    EXECUTE 'GRANT SELECT, INSERT ON navi_scoped.change_sets, navi_scoped.change_operations, navi_scoped.change_dependencies, navi_scoped.mutation_receipts, navi_scoped.checkpoints TO service_role';
  END IF;
END
$$;

COMMIT;
