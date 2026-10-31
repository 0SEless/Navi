-- NAVI Studio "Save v2": private `studio` schema.
--
-- Saved campus parts, immutable versions, commits, zone locks, milestones and
-- publications. The schema is server-only: RLS is enabled on every table with
-- no policies, and nothing is granted to PUBLIC, anon or authenticated.
-- The API role `navi_studio_api` (NOLOGIN) receives EXECUTE on SECURITY DEFINER
-- functions only (added by later statements in this file) and no table grants.
--
-- Idempotent: safe to apply repeatedly, including after DROP SCHEMA studio CASCADE
-- (roles are cluster-level and survive a schema drop). Uses no extensions and no
-- superuser-only features, so it is also valid on Supabase.

BEGIN;

CREATE SCHEMA IF NOT EXISTS studio;
COMMENT ON SCHEMA studio IS
  'NAVI Studio Save v2: private, server-only storage for saved campus parts, versions, commits, locks and publications.';

-- Cluster-level API role. Created only if missing; tolerant of a concurrent creator.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'navi_studio_api') THEN
    BEGIN
      CREATE ROLE navi_studio_api NOLOGIN;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS studio.campuses (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  head_commit bigint NOT NULL DEFAULT 0,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE studio.campuses IS
  'One row per campus. head_commit is the latest commit number; settings holds the CampusMap fields (schoolName, campusName, center, boundary, landmarkTypes, landmarkInstances).';

CREATE TABLE IF NOT EXISTS studio.members (
  campus_id    text NOT NULL REFERENCES studio.campuses (id) ON DELETE CASCADE,
  user_id      text NOT NULL,
  display_name text NOT NULL,
  role         text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  PRIMARY KEY (campus_id, user_id)
);
COMMENT ON TABLE studio.members IS
  'Who may open a campus and in which role (owner, editor or viewer).';

CREATE TABLE IF NOT EXISTS studio.commits (
  campus_id   text NOT NULL REFERENCES studio.campuses (id) ON DELETE CASCADE,
  commit_no   bigint NOT NULL,
  parent_no   bigint,
  author      text NOT NULL,
  message     text,
  mutation_id text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('save', 'import', 'restore')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campus_id, commit_no),
  UNIQUE (campus_id, mutation_id)
);
COMMENT ON TABLE studio.commits IS
  'One row per accepted save, import or restore. mutation_id makes a retried request replay instead of repeating.';

CREATE TABLE IF NOT EXISTS studio.part_versions (
  campus_id   text NOT NULL,
  part_key    text NOT NULL,
  version_no  bigint NOT NULL,
  checksum    char(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  content     jsonb,
  content_bin bytea,
  deleted     boolean NOT NULL DEFAULT false,
  sort_key    text,
  commit_no   bigint NOT NULL,
  size_bytes  integer NOT NULL CHECK (size_bytes >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campus_id, part_key, version_no),
  FOREIGN KEY (campus_id, commit_no) REFERENCES studio.commits (campus_id, commit_no) ON DELETE CASCADE,
  CONSTRAINT part_versions_content_shape CHECK (
    (deleted AND content IS NULL AND content_bin IS NULL)
    OR (NOT deleted AND num_nonnulls(content, content_bin) = 1)
  )
);
COMMENT ON TABLE studio.part_versions IS
  'Immutable history of every saved part. Exactly one of content or content_bin is set unless the row records a deletion.';

CREATE INDEX IF NOT EXISTS part_versions_campus_commit_idx
  ON studio.part_versions (campus_id, commit_no);

CREATE TABLE IF NOT EXISTS studio.parts_current (
  campus_id  text NOT NULL,
  part_key   text NOT NULL,
  version_no bigint NOT NULL,
  checksum   char(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  commit_no  bigint NOT NULL,
  PRIMARY KEY (campus_id, part_key),
  FOREIGN KEY (campus_id, part_key, version_no)
    REFERENCES studio.part_versions (campus_id, part_key, version_no) ON DELETE CASCADE
);
COMMENT ON TABLE studio.parts_current IS
  'Pointer to the current version of each part in a campus.';

CREATE INDEX IF NOT EXISTS parts_current_campus_commit_idx
  ON studio.parts_current (campus_id, commit_no);

CREATE TABLE IF NOT EXISTS studio.zone_locks (
  campus_id    text NOT NULL REFERENCES studio.campuses (id) ON DELETE CASCADE,
  zone_key     text NOT NULL,
  holder       text NOT NULL,
  holder_name  text NOT NULL,
  session_id   text NOT NULL,
  acquired_at  timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  last_edit_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campus_id, zone_key)
);
COMMENT ON TABLE studio.zone_locks IS
  'Who is editing a zone (a building, the terrain or the campus) right now.';

CREATE TABLE IF NOT EXISTS studio.milestones (
  campus_id  text NOT NULL REFERENCES studio.campuses (id) ON DELETE CASCADE,
  commit_no  bigint NOT NULL,
  label      text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campus_id, commit_no),
  FOREIGN KEY (campus_id, commit_no) REFERENCES studio.commits (campus_id, commit_no) ON DELETE CASCADE
);
COMMENT ON TABLE studio.milestones IS
  'Named commits that pruning never removes.';

CREATE TABLE IF NOT EXISTS studio.publications (
  campus_id      text NOT NULL REFERENCES studio.campuses (id) ON DELETE CASCADE,
  publication_no bigint NOT NULL,
  source_commit  bigint NOT NULL,
  artifacts      jsonb NOT NULL,
  checksum       char(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
  status         text NOT NULL,
  published_by   text NOT NULL,
  published_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campus_id, publication_no)
);
COMMENT ON TABLE studio.publications IS
  'Every publication of a campus: the commit it came from and its compiled artifacts.';

CREATE INDEX IF NOT EXISTS publications_campus_no_desc_idx
  ON studio.publications (campus_id, publication_no DESC);

CREATE TABLE IF NOT EXISTS studio.published_current (
  campus_id      text PRIMARY KEY,
  publication_no bigint NOT NULL,
  FOREIGN KEY (campus_id, publication_no)
    REFERENCES studio.publications (campus_id, publication_no) ON DELETE CASCADE
);
COMMENT ON TABLE studio.published_current IS
  'Which publication NAVI Web currently serves for each campus.';

-- ---------------------------------------------------------------------------
-- Zone mapping: studio.zone_of mirrors zoneOf() in src/studio-v2/parts/part-keys.ts
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION studio.zone_of(p_part_key text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_sep      integer;
  v_kind     text;
  v_ids      text[];
  v_arity    integer;
  v_id       text;
  v_bytes    bytea;
  v_i        integer;
  v_len      integer;
  v_ch       text;
  v_pos      integer;
  v_b        integer;
  v_first    text;
  v_canon    text;
BEGIN
  IF p_part_key IS NULL THEN
    RAISE EXCEPTION 'Part key must not be null.' USING ERRCODE = '22023';
  END IF;

  v_sep := position(':' in p_part_key);
  IF v_sep = 0 THEN
    v_kind := p_part_key;
    v_ids := ARRAY[]::text[];
  ELSE
    v_kind := substr(p_part_key, 1, v_sep - 1);
    v_ids := regexp_split_to_array(substr(p_part_key, v_sep + 1), ':');
  END IF;

  v_arity := CASE v_kind
    WHEN 'campus' THEN 0
    WHEN 'building' THEN 1
    WHEN 'floor' THEN 2
    WHEN 'terrain' THEN 0
    WHEN 'terrain-tile' THEN 1
    WHEN 'map/road' THEN 1
    WHEN 'map/junction' THEN 1
    WHEN 'map/crossing' THEN 1
    WHEN 'map/area' THEN 1
    WHEN 'map/poi' THEN 1
    ELSE NULL
  END;
  IF v_arity IS NULL THEN
    RAISE EXCEPTION 'Unknown part kind in key "%".', p_part_key USING ERRCODE = '22023';
  END IF;

  -- Each id is percent-decoded (a malformed escape raises, as decodeURIComponent
  -- does) and then re-encoded like encodeURIComponent; the first id is kept.
  v_first := NULL;
  FOR v_i IN 1 .. coalesce(array_length(v_ids, 1), 0) LOOP
    v_id := v_ids[v_i];
    v_bytes := ''::bytea;
    v_len := char_length(v_id);
    v_pos := 1;
    WHILE v_pos <= v_len LOOP
      v_ch := substr(v_id, v_pos, 1);
      IF v_ch = '%' THEN
        IF substr(v_id, v_pos + 1, 2) !~ '^[0-9A-Fa-f]{2}$' THEN
          RAISE EXCEPTION 'Malformed percent-encoding in key "%".', p_part_key USING ERRCODE = '22023';
        END IF;
        v_bytes := v_bytes || decode(substr(v_id, v_pos + 1, 2), 'hex');
        v_pos := v_pos + 3;
      ELSE
        v_bytes := v_bytes || convert_to(v_ch, 'UTF8');
        v_pos := v_pos + 1;
      END IF;
    END LOOP;
    -- Raises when the decoded bytes are not valid UTF-8 (decodeURIComponent throws too).
    PERFORM convert_from(v_bytes, 'UTF8');

    IF v_i = 1 THEN
      v_canon := '';
      FOR v_pos IN 0 .. length(v_bytes) - 1 LOOP
        v_b := get_byte(v_bytes, v_pos);
        IF (v_b BETWEEN 48 AND 57) OR (v_b BETWEEN 65 AND 90) OR (v_b BETWEEN 97 AND 122)
           OR v_b IN (45, 95, 46, 33, 126, 42, 39, 40, 41) THEN
          v_canon := v_canon || chr(v_b);
        ELSE
          v_canon := v_canon || '%' || upper(lpad(to_hex(v_b), 2, '0'));
        END IF;
      END LOOP;
      v_first := v_canon;
    END IF;
  END LOOP;

  IF coalesce(array_length(v_ids, 1), 0) <> v_arity THEN
    RAISE EXCEPTION 'Part kind "%" takes % id(s), got %.', v_kind, v_arity, coalesce(array_length(v_ids, 1), 0)
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_ids) AS t(id) WHERE t.id = '') THEN
    RAISE EXCEPTION 'Part kind "%" does not accept an empty id.', v_kind USING ERRCODE = '22023';
  END IF;

  RETURN CASE v_kind
    WHEN 'campus' THEN 'campus'
    WHEN 'building' THEN 'building:' || v_first
    WHEN 'floor' THEN 'building:' || v_first
    WHEN 'terrain' THEN 'terrain'
    WHEN 'terrain-tile' THEN 'terrain'
    ELSE NULL
  END;
END
$fn$;
COMMENT ON FUNCTION studio.zone_of(text) IS
  'Lock zone of a part key (building:<id>, terrain, campus) or NULL for map items; raises on an invalid key. Mirrors zoneOf in part-keys.ts.';

-- ---------------------------------------------------------------------------
-- Row level security: on for every table, no policies (server-only access)
-- ---------------------------------------------------------------------------

ALTER TABLE studio.campuses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio.members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio.commits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio.part_versions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio.parts_current    ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio.zone_locks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio.milestones       ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio.publications     ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio.published_current ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

REVOKE ALL ON SCHEMA studio FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA studio FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA studio FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA studio FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA studio REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA studio REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA studio REVOKE ALL ON FUNCTIONS FROM PUBLIC;

-- Supabase roles are conditional so this also applies to plain PostgreSQL.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA studio FROM anon';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA studio FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA studio FROM anon';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA studio FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA studio REVOKE ALL ON TABLES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA studio REVOKE ALL ON SEQUENCES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA studio REVOKE ALL ON FUNCTIONS FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA studio FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA studio FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA studio FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA studio FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA studio REVOKE ALL ON TABLES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA studio REVOKE ALL ON SEQUENCES FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA studio REVOKE ALL ON FUNCTIONS FROM authenticated';
  END IF;
END
$$;

-- The API role may enter the schema and call functions; it has no table grants.
GRANT USAGE ON SCHEMA studio TO navi_studio_api;
GRANT EXECUTE ON FUNCTION studio.zone_of(text) TO navi_studio_api;

COMMIT;
