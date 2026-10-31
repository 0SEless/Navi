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


-- ---------------------------------------------------------------------------
-- The one save function: studio.save (spec section 5.1)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS studio.mutation_receipts (
  campus_id        text NOT NULL REFERENCES studio.campuses (id) ON DELETE CASCADE,
  mutation_id      text NOT NULL,
  request_checksum char(64) NOT NULL CHECK (request_checksum ~ '^[0-9a-f]{64}$'),
  result           jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campus_id, mutation_id)
);
COMMENT ON TABLE studio.mutation_receipts IS
  'The stored reply of every accepted save (status ok, including a no-op with commitNo null), so a retried mutationId replays instead of repeating.';

ALTER TABLE studio.mutation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE studio.mutation_receipts FROM PUBLIC;

-- One validated change of a save request (internal to studio.save).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'studio' AND t.typname = 'save_change'
  ) THEN
    CREATE TYPE studio.save_change AS (
      part_key         text,
      op               text,
      expected_version bigint,
      checksum         text,
      content          jsonb,
      content_bin      bytea,
      sort_key         text,
      size_bytes       integer,
      zone_key         text
    );
  END IF;
END
$$;

-- Helper: the value as a non-negative integer no larger than p_max, or NULL when
-- it is not a JSON number holding such an integer.
CREATE OR REPLACE FUNCTION studio.save_json_count(p_value jsonb, p_max numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = studio, pg_temp
AS $fn$
  SELECT CASE
    WHEN jsonb_typeof(p_value) IS DISTINCT FROM 'number' THEN NULL
    WHEN (p_value #>> '{}')::numeric < 0
      OR (p_value #>> '{}')::numeric > p_max
      OR (p_value #>> '{}')::numeric <> trunc((p_value #>> '{}')::numeric) THEN NULL
    ELSE (p_value #>> '{}')::numeric
  END
$fn$;

-- Helper: validate and normalize p_changes. Raises SQLSTATE 22023 with a message
-- starting 'INVALID_CHANGE:' on the first problem, so the save writes nothing.
CREATE OR REPLACE FUNCTION studio.save_parse_changes(p_changes jsonb)
RETURNS studio.save_change[]
LANGUAGE plpgsql
SET search_path = studio, pg_temp
AS $fn$
DECLARE
  c_empty_sha CONSTANT text := 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  v_out   studio.save_change[] := ARRAY[]::studio.save_change[];
  v_seen  text[] := ARRAY[]::text[];
  v_e     jsonb;
  v_i     integer := 0;
  v_c     studio.save_change;
  v_n     numeric;
BEGIN
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_CHANGE: changes must be a JSON array.' USING ERRCODE = '22023';
  END IF;

  FOR v_e IN SELECT value FROM jsonb_array_elements(p_changes) LOOP
    v_i := v_i + 1;
    v_c := NULL;

    IF jsonb_typeof(v_e) <> 'object' THEN
      RAISE EXCEPTION 'INVALID_CHANGE: change % is not an object.', v_i USING ERRCODE = '22023';
    END IF;

    -- partKey: a non-empty string, unique within the request, with a valid zone.
    IF jsonb_typeof(v_e -> 'partKey') IS DISTINCT FROM 'string' OR v_e ->> 'partKey' = '' THEN
      RAISE EXCEPTION 'INVALID_CHANGE: change % has no partKey.', v_i USING ERRCODE = '22023';
    END IF;
    v_c.part_key := v_e ->> 'partKey';
    IF v_c.part_key = ANY (v_seen) THEN
      RAISE EXCEPTION 'INVALID_CHANGE: partKey "%" appears more than once.', v_c.part_key USING ERRCODE = '22023';
    END IF;
    v_seen := v_seen || v_c.part_key;
    BEGIN
      v_c.zone_key := studio.zone_of(v_c.part_key);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_CHANGE: partKey "%" is not a valid part key: %', v_c.part_key, SQLERRM
        USING ERRCODE = '22023';
    END;

    -- op
    IF jsonb_typeof(v_e -> 'op') IS DISTINCT FROM 'string'
       OR (v_e ->> 'op') NOT IN ('put', 'put-bin', 'delete') THEN
      RAISE EXCEPTION 'INVALID_CHANGE: partKey "%" has an unknown op.', v_c.part_key USING ERRCODE = '22023';
    END IF;
    v_c.op := v_e ->> 'op';

    -- expectedVersion: 0 means "new part".
    v_n := studio.save_json_count(v_e -> 'expectedVersion', 9223372036854775807);
    IF v_n IS NULL THEN
      RAISE EXCEPTION 'INVALID_CHANGE: partKey "%" needs expectedVersion as a non-negative integer.', v_c.part_key
        USING ERRCODE = '22023';
    END IF;
    v_c.expected_version := v_n;

    -- sortKey: optional string.
    IF jsonb_typeof(v_e -> 'sortKey') = 'string' THEN
      v_c.sort_key := v_e ->> 'sortKey';
    ELSIF v_e -> 'sortKey' IS NOT NULL AND jsonb_typeof(v_e -> 'sortKey') <> 'null' THEN
      RAISE EXCEPTION 'INVALID_CHANGE: partKey "%" has a sortKey that is not a string.', v_c.part_key
        USING ERRCODE = '22023';
    END IF;

    IF v_c.op = 'delete' THEN
      -- Tombstone: no content, sha256 of the empty string, zero bytes.
      v_c.checksum := c_empty_sha;
      v_c.size_bytes := 0;
    ELSE
      IF jsonb_typeof(v_e -> 'checksum') IS DISTINCT FROM 'string'
         OR (v_e ->> 'checksum') !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'INVALID_CHANGE: partKey "%" needs a checksum of 64 lowercase hex digits.', v_c.part_key
          USING ERRCODE = '22023';
      END IF;
      v_c.checksum := v_e ->> 'checksum';

      IF v_c.op = 'put' THEN
        IF v_e -> 'content' IS NULL OR jsonb_typeof(v_e -> 'content') = 'null' THEN
          RAISE EXCEPTION 'INVALID_CHANGE: put of "%" has no content.', v_c.part_key USING ERRCODE = '22023';
        END IF;
        v_c.content := v_e -> 'content';
        v_n := studio.save_json_count(v_e -> 'sizeBytes', 2147483647);
        IF v_n IS NULL THEN
          RAISE EXCEPTION 'INVALID_CHANGE: put of "%" needs sizeBytes as a non-negative integer.', v_c.part_key
            USING ERRCODE = '22023';
        END IF;
        v_c.size_bytes := v_n;
      ELSE
        IF jsonb_typeof(v_e -> 'contentBase64') IS DISTINCT FROM 'string' THEN
          RAISE EXCEPTION 'INVALID_CHANGE: put-bin of "%" has no contentBase64.', v_c.part_key USING ERRCODE = '22023';
        END IF;
        BEGIN
          v_c.content_bin := decode(v_e ->> 'contentBase64', 'base64');
        EXCEPTION WHEN OTHERS THEN
          RAISE EXCEPTION 'INVALID_CHANGE: put-bin of "%" has invalid base64: %', v_c.part_key, SQLERRM
            USING ERRCODE = '22023';
        END;
        v_c.size_bytes := octet_length(v_c.content_bin);
      END IF;
    END IF;

    v_out := v_out || v_c;
  END LOOP;

  RETURN v_out;
END
$fn$;

-- Helper: the zones the changes need that this actor's session does not hold,
-- as [{zoneKey, holderName}] ordered by zoneKey (holderName is null when the zone
-- is free or its heartbeat is older than 5 minutes). Empty array when all held.
CREATE OR REPLACE FUNCTION studio.save_zone_denials(
  p_campus text, p_actor text, p_session text, p_changes studio.save_change[])
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = studio, pg_temp
AS $fn$
  SELECT coalesce(
           jsonb_agg(jsonb_build_object('zoneKey', z.zone_key, 'holderName', zl.holder_name)
                     ORDER BY z.zone_key COLLATE "C"),
           '[]'::jsonb)
    FROM (SELECT DISTINCT c.zone_key FROM unnest(p_changes) AS c WHERE c.zone_key IS NOT NULL) AS z
    LEFT JOIN studio.zone_locks AS zl
      ON zl.campus_id = p_campus
     AND zl.zone_key = z.zone_key
     AND zl.heartbeat_at > now() - interval '5 minutes'
   WHERE NOT coalesce(zl.holder = p_actor AND zl.session_id = p_session, false)
$fn$;

-- Helper: the changes whose expectedVersion is not the part's current version
-- (0 when the part has never been saved), as
-- [{partKey, yourVersion, currentVersion, savedBy, savedAt}] ordered by partKey.
CREATE OR REPLACE FUNCTION studio.save_stale_parts(p_campus text, p_changes studio.save_change[])
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = studio, pg_temp
AS $fn$
  SELECT coalesce(
           jsonb_agg(jsonb_build_object(
                       'partKey', c.part_key,
                       'yourVersion', c.expected_version,
                       'currentVersion', coalesce(pc.version_no, 0),
                       'savedBy', cm.author,
                       'savedAt', cm.created_at)
                     ORDER BY c.part_key COLLATE "C"),
           '[]'::jsonb)
    FROM unnest(p_changes) AS c
    LEFT JOIN studio.parts_current AS pc
      ON pc.campus_id = p_campus AND pc.part_key = c.part_key
    LEFT JOIN studio.commits AS cm
      ON cm.campus_id = pc.campus_id AND cm.commit_no = pc.commit_no
   WHERE c.expected_version <> coalesce(pc.version_no, 0)
$fn$;

-- Helper: parts other actors saved after p_base_commit, minus p_exclude, as
-- [{partKey, versionNo, checksum, content | contentBase64, deleted, sortKey}]
-- ordered by partKey. Binary parts carry contentBase64 instead of content.
CREATE OR REPLACE FUNCTION studio.save_others_changed(
  p_campus text, p_actor text, p_base_commit bigint, p_exclude text[])
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = studio, pg_temp
AS $fn$
  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object(
               'partKey', pc.part_key,
               'versionNo', pc.version_no,
               'checksum', pc.checksum,
               'deleted', pv.deleted,
               'sortKey', pv.sort_key)
             || CASE WHEN pv.content_bin IS NOT NULL
                  THEN jsonb_build_object('contentBase64', translate(encode(pv.content_bin, 'base64'), E'\n', ''))
                  ELSE jsonb_build_object('content', pv.content)
                END
             ORDER BY pc.part_key COLLATE "C"),
           '[]'::jsonb)
    FROM studio.parts_current AS pc
    JOIN studio.part_versions AS pv
      ON pv.campus_id = pc.campus_id AND pv.part_key = pc.part_key AND pv.version_no = pc.version_no
    JOIN studio.commits AS cm
      ON cm.campus_id = pc.campus_id AND cm.commit_no = pc.commit_no
   WHERE pc.campus_id = p_campus
     AND pc.commit_no > p_base_commit
     AND cm.author <> p_actor
     AND pc.part_key <> ALL (p_exclude)
$fn$;

-- studio.save: every Studio save, in one transaction. Steps (spec section 5.1):
--   1. lock the campus row (saves run one at a time); missing -> campus_not_found
--   2. a 'viewer' member -> forbidden (owner, editor or no row may save)
--   3. replay: same mutationId + request checksum -> the stored reply as 'replay';
--      same mutationId, other checksum -> mutation_collision
--   4. validate the changes (raises INVALID_CHANGE, 22023)
--   5. zone rule, then version rule; on any failure write nothing and return
--      zone_not_held (checked first) or stale
--   6. drop no-op changes; nothing left -> ok with commitNo null, no commit
--   7. write the commit, versions and current pointers; bump head_commit;
--      touch zone_locks.last_edit_at
--   8. reply with the written parts and othersChanged; store the receipt
CREATE OR REPLACE FUNCTION studio.save(
  p_campus           text,
  p_actor            text,
  p_session          text,
  p_mutation_id      text,
  p_base_commit      bigint,
  p_message          text,
  p_changes          jsonb,
  p_request_checksum char(64))
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = studio, pg_temp
AS $fn$
DECLARE
  v_head    bigint;
  v_commit  bigint;
  v_role    text;
  v_receipt studio.mutation_receipts;
  v_changes studio.save_change[];
  v_writes  studio.save_change[];
  v_keys    text[];
  v_zones   jsonb;
  v_stale   jsonb;
  v_parts   jsonb;
  v_result  jsonb;
BEGIN
  -- 1. Campus row lock: concurrent saves of one campus wait here.
  SELECT c.head_commit INTO v_head FROM studio.campuses AS c WHERE c.id = p_campus FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'campus_not_found');
  END IF;

  -- 2. Role.
  SELECT m.role INTO v_role FROM studio.members AS m WHERE m.campus_id = p_campus AND m.user_id = p_actor;
  IF v_role = 'viewer' THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  -- 3. Replay or collision (the scalar arguments are checked first).
  IF p_actor IS NULL OR p_actor = '' THEN
    RAISE EXCEPTION 'INVALID_CHANGE: actor is required.' USING ERRCODE = '22023';
  END IF;
  IF p_mutation_id IS NULL OR p_mutation_id = '' THEN
    RAISE EXCEPTION 'INVALID_CHANGE: mutationId is required.' USING ERRCODE = '22023';
  END IF;
  IF p_request_checksum IS NULL OR p_request_checksum::text !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_CHANGE: request checksum must be 64 lowercase hex digits.' USING ERRCODE = '22023';
  END IF;
  IF p_base_commit IS NULL OR p_base_commit < 0 THEN
    RAISE EXCEPTION 'INVALID_CHANGE: baseCommit must be a non-negative integer.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_receipt FROM studio.mutation_receipts AS r
   WHERE r.campus_id = p_campus AND r.mutation_id = p_mutation_id;
  IF FOUND THEN
    IF v_receipt.request_checksum = p_request_checksum THEN
      RETURN v_receipt.result || jsonb_build_object('status', 'replay');
    END IF;
    RETURN jsonb_build_object('status', 'mutation_collision');
  END IF;

  -- 4. Validate.
  v_changes := studio.save_parse_changes(p_changes);
  SELECT coalesce(array_agg(c.part_key), ARRAY[]::text[]) INTO v_keys FROM unnest(v_changes) AS c;

  -- 5. Zone rule, then version rule; locks are the stricter rule and win.
  v_zones := studio.save_zone_denials(p_campus, p_actor, p_session, v_changes);
  v_stale := studio.save_stale_parts(p_campus, v_changes);
  IF jsonb_array_length(v_zones) > 0 THEN
    RETURN jsonb_build_object('status', 'zone_not_held', 'zones', v_zones);
  END IF;
  IF jsonb_array_length(v_stale) > 0 THEN
    RETURN jsonb_build_object('status', 'stale', 'parts', v_stale);
  END IF;

  -- 6. Drop no-ops: a put whose checksum equals the live current version, or a
  -- delete of a part that is missing or already deleted. sortKey alone never counts.
  SELECT coalesce(array_agg(ROW(c.*)::studio.save_change ORDER BY c.part_key COLLATE "C"),
                  ARRAY[]::studio.save_change[])
    INTO v_writes
    FROM unnest(v_changes) AS c
    LEFT JOIN studio.parts_current AS pc
      ON pc.campus_id = p_campus AND pc.part_key = c.part_key
    LEFT JOIN studio.part_versions AS pv
      ON pv.campus_id = pc.campus_id AND pv.part_key = pc.part_key AND pv.version_no = pc.version_no
   WHERE CASE c.op
           WHEN 'delete' THEN pc.part_key IS NOT NULL AND NOT pv.deleted
           ELSE pc.part_key IS NULL OR pv.deleted OR pc.checksum::text <> c.checksum
         END;

  IF cardinality(v_writes) = 0 THEN
    v_commit := NULL;
    v_parts := '[]'::jsonb;
  ELSE
    -- 7. Write. expected_version equals the current version here (step 5).
    v_commit := v_head + 1;
    INSERT INTO studio.commits (campus_id, commit_no, parent_no, author, message, mutation_id, kind)
    VALUES (p_campus, v_commit, v_head, p_actor, p_message, p_mutation_id, 'save');

    INSERT INTO studio.part_versions
      (campus_id, part_key, version_no, checksum, content, content_bin, deleted, sort_key, commit_no, size_bytes)
    SELECT p_campus, w.part_key, w.expected_version + 1, w.checksum, w.content, w.content_bin,
           w.op = 'delete', w.sort_key, v_commit, w.size_bytes
      FROM unnest(v_writes) AS w;

    INSERT INTO studio.parts_current (campus_id, part_key, version_no, checksum, commit_no)
    SELECT p_campus, w.part_key, w.expected_version + 1, w.checksum, v_commit
      FROM unnest(v_writes) AS w
    ON CONFLICT (campus_id, part_key) DO UPDATE
      SET version_no = EXCLUDED.version_no,
          checksum   = EXCLUDED.checksum,
          commit_no  = EXCLUDED.commit_no;

    UPDATE studio.campuses SET head_commit = v_commit WHERE id = p_campus;

    UPDATE studio.zone_locks AS zl
       SET last_edit_at = now()
     WHERE zl.campus_id = p_campus
       AND zl.holder = p_actor
       AND zl.session_id = p_session
       AND zl.zone_key IN (SELECT w.zone_key FROM unnest(v_writes) AS w WHERE w.zone_key IS NOT NULL);

    SELECT jsonb_agg(jsonb_build_object('partKey', w.part_key, 'versionNo', w.expected_version + 1, 'checksum', w.checksum)
                     ORDER BY w.part_key COLLATE "C")
      INTO v_parts
      FROM unnest(v_writes) AS w;
  END IF;

  -- 8. Reply and receipt (accepted outcomes only).
  v_result := jsonb_build_object(
    'status', 'ok',
    'commitNo', v_commit,
    'parts', v_parts,
    'othersChanged', studio.save_others_changed(p_campus, p_actor, p_base_commit, v_keys));

  INSERT INTO studio.mutation_receipts (campus_id, mutation_id, request_checksum, result)
  VALUES (p_campus, p_mutation_id, p_request_checksum, v_result);

  RETURN v_result;
END
$fn$;
COMMENT ON FUNCTION studio.save(text, text, text, text, bigint, text, jsonb, char) IS
  'The one Studio save: all-or-nothing, replay-safe by mutationId, per-part version check and strict zone locks. See spec section 5.1.';

-- Privileges: only studio.save is callable by the API role; the helpers and the
-- receipts table stay private to the schema owner.
REVOKE ALL ON FUNCTION studio.save_json_count(jsonb, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION studio.save_parse_changes(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION studio.save_zone_denials(text, text, text, studio.save_change[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION studio.save_stale_parts(text, studio.save_change[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION studio.save_others_changed(text, text, bigint, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION studio.save(text, text, text, text, bigint, text, jsonb, char) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE studio.mutation_receipts FROM anon';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA studio FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE studio.mutation_receipts FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA studio FROM authenticated';
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION studio.save(text, text, text, text, bigint, text, jsonb, char) TO navi_studio_api;

-- ---------------------------------------------------------------------------
-- Zone locks (spec section 7). A zone is 'building:<id>' (the building and all of
-- its floors), 'terrain' or 'campus'. A lock row counts as held only while its
-- heartbeat is younger than 5 minutes; an older row is free for anyone to take.
-- Every function that changes zone_locks first takes the campus row lock, so lock
-- changes serialize with studio.save (which holds the same lock).
-- ---------------------------------------------------------------------------

-- Helper: validate a zone-key array and return it de-duplicated and ordered by
-- code point. A valid zone key is its own zone (studio.zone_of(z) = z), so floor
-- keys, map keys, non-canonical spellings, '' and NULL are rejected. An empty
-- array is valid; a NULL array is not.
CREATE OR REPLACE FUNCTION studio.lock_zone_keys(p_zones text[])
RETURNS text[]
LANGUAGE plpgsql
SET search_path = studio, pg_temp
AS $fn$
DECLARE
  v_zone text;
  v_zone_of text;
BEGIN
  IF p_zones IS NULL THEN
    RAISE EXCEPTION 'INVALID_ZONE: zones must be an array.' USING ERRCODE = '22023';
  END IF;
  FOREACH v_zone IN ARRAY p_zones LOOP
    IF v_zone IS NULL OR v_zone = '' THEN
      RAISE EXCEPTION 'INVALID_ZONE: a zone key must not be null or empty.' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_zone_of := studio.zone_of(v_zone);
    EXCEPTION WHEN OTHERS THEN
      -- zone_of raises 22023 (bad shape or percent-encoding) and 22021 (invalid UTF-8).
      RAISE EXCEPTION 'INVALID_ZONE: "%" is not a lock zone (%).', v_zone, SQLERRM USING ERRCODE = '22023';
    END;
    IF v_zone_of IS DISTINCT FROM v_zone THEN
      RAISE EXCEPTION 'INVALID_ZONE: "%" is not a lock zone.', v_zone USING ERRCODE = '22023';
    END IF;
  END LOOP;
  RETURN coalesce(
    (SELECT array_agg(z.zone ORDER BY z.zone COLLATE "C")
       FROM (SELECT DISTINCT u.zone FROM unnest(p_zones) AS u(zone)) AS z),
    ARRAY[]::text[]);
END
$fn$;

-- studio.acquire_zones: take all requested zones, or none.
--   campus_not_found | forbidden (viewer) | ok {granted, denied}
-- A zone is denied when another live lock (heartbeat < 5 min) is not held by this
-- actor and session; sameActor tells "you have it open in another tab" apart.
-- Re-acquiring a live lock of this actor and session only refreshes its heartbeat.
CREATE OR REPLACE FUNCTION studio.acquire_zones(
  p_campus     text,
  p_actor      text,
  p_actor_name text,
  p_session    text,
  p_zones      text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = studio, pg_temp
AS $fn$
DECLARE
  v_role   text;
  v_name   text;
  v_zones  text[];
  v_denied jsonb;
BEGIN
  PERFORM 1 FROM studio.campuses AS c WHERE c.id = p_campus FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'campus_not_found');
  END IF;

  IF p_actor IS NULL OR p_actor = '' THEN
    RAISE EXCEPTION 'INVALID_ZONE: actor is required.' USING ERRCODE = '22023';
  END IF;
  IF p_session IS NULL OR p_session = '' THEN
    RAISE EXCEPTION 'INVALID_ZONE: session is required.' USING ERRCODE = '22023';
  END IF;
  v_name := btrim(p_actor_name);
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'INVALID_ZONE: actor name is required.' USING ERRCODE = '22023';
  END IF;

  SELECT m.role INTO v_role FROM studio.members AS m WHERE m.campus_id = p_campus AND m.user_id = p_actor;
  IF v_role = 'viewer' THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  v_zones := studio.lock_zone_keys(p_zones);

  SELECT coalesce(
           jsonb_agg(jsonb_build_object('zoneKey', zl.zone_key,
                                        'holderName', zl.holder_name,
                                        'since', zl.acquired_at,
                                        'sameActor', zl.holder = p_actor)
                     ORDER BY zl.zone_key COLLATE "C"),
           '[]'::jsonb)
    INTO v_denied
    FROM studio.zone_locks AS zl
   WHERE zl.campus_id = p_campus
     AND zl.zone_key = ANY (v_zones)
     AND zl.heartbeat_at > now() - interval '5 minutes'
     AND NOT (zl.holder = p_actor AND zl.session_id = p_session);

  IF jsonb_array_length(v_denied) > 0 THEN
    RETURN jsonb_build_object('status', 'ok', 'granted', '[]'::jsonb, 'denied', v_denied);
  END IF;

  INSERT INTO studio.zone_locks AS zl
    (campus_id, zone_key, holder, holder_name, session_id, acquired_at, heartbeat_at, last_edit_at)
  SELECT p_campus, z.zone, p_actor, v_name, p_session, now(), now(), now()
    FROM unnest(v_zones) AS z(zone)
  ON CONFLICT (campus_id, zone_key) DO UPDATE
    SET holder       = EXCLUDED.holder,
        holder_name  = EXCLUDED.holder_name,
        session_id   = EXCLUDED.session_id,
        acquired_at  = CASE WHEN zl.holder = EXCLUDED.holder AND zl.session_id = EXCLUDED.session_id
                                 AND zl.heartbeat_at > now() - interval '5 minutes'
                            THEN zl.acquired_at ELSE EXCLUDED.acquired_at END,
        heartbeat_at = now(),
        last_edit_at = CASE WHEN zl.holder = EXCLUDED.holder AND zl.session_id = EXCLUDED.session_id
                                 AND zl.heartbeat_at > now() - interval '5 minutes'
                            THEN zl.last_edit_at ELSE EXCLUDED.last_edit_at END;

  RETURN jsonb_build_object('status', 'ok', 'granted', to_jsonb(v_zones), 'denied', '[]'::jsonb);
END
$fn$;
COMMENT ON FUNCTION studio.acquire_zones(text, text, text, text, text[]) IS
  'Takes every requested zone for (actor, session) or none. See spec section 7.';

-- studio.release_zones: delete the lock rows owned by this actor and session.
CREATE OR REPLACE FUNCTION studio.release_zones(
  p_campus  text,
  p_actor   text,
  p_session text,
  p_zones   text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = studio, pg_temp
AS $fn$
DECLARE
  v_zones    text[];
  v_released text[];
BEGIN
  PERFORM 1 FROM studio.campuses AS c WHERE c.id = p_campus FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'campus_not_found');
  END IF;

  IF p_actor IS NULL OR p_actor = '' THEN
    RAISE EXCEPTION 'INVALID_ZONE: actor is required.' USING ERRCODE = '22023';
  END IF;
  IF p_session IS NULL OR p_session = '' THEN
    RAISE EXCEPTION 'INVALID_ZONE: session is required.' USING ERRCODE = '22023';
  END IF;
  v_zones := studio.lock_zone_keys(p_zones);

  WITH gone AS (
    DELETE FROM studio.zone_locks AS zl
     WHERE zl.campus_id = p_campus
       AND zl.zone_key = ANY (v_zones)
       AND zl.holder = p_actor
       AND zl.session_id = p_session
    RETURNING zl.zone_key
  )
  SELECT coalesce(array_agg(g.zone_key ORDER BY g.zone_key COLLATE "C"), ARRAY[]::text[])
    INTO v_released FROM gone AS g;

  RETURN jsonb_build_object('status', 'ok', 'released', to_jsonb(v_released));
END
$fn$;
COMMENT ON FUNCTION studio.release_zones(text, text, text, text[]) IS
  'Releases the zones this actor and session hold; other rows are left alone.';

-- studio.status: the status poll and the heartbeat in one call. Rows in p_held
-- still owned by (actor, session) get a fresh heartbeat even when it had expired
-- (nobody took them meanwhile). lostZones = held zones that are now missing or
-- owned by another holder or session. locks = every live lock after the refresh.
CREATE OR REPLACE FUNCTION studio.status(
  p_campus  text,
  p_actor   text,
  p_session text,
  p_held    text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = studio, pg_temp
AS $fn$
DECLARE
  v_head  bigint;
  v_held  text[];
  v_lost  jsonb;
  v_locks jsonb;
BEGIN
  SELECT c.head_commit INTO v_head FROM studio.campuses AS c WHERE c.id = p_campus FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'campus_not_found');
  END IF;

  IF p_actor IS NULL OR p_actor = '' THEN
    RAISE EXCEPTION 'INVALID_ZONE: actor is required.' USING ERRCODE = '22023';
  END IF;
  IF p_session IS NULL OR p_session = '' THEN
    RAISE EXCEPTION 'INVALID_ZONE: session is required.' USING ERRCODE = '22023';
  END IF;
  v_held := studio.lock_zone_keys(p_held);

  UPDATE studio.zone_locks AS zl
     SET heartbeat_at = now()
   WHERE zl.campus_id = p_campus
     AND zl.zone_key = ANY (v_held)
     AND zl.holder = p_actor
     AND zl.session_id = p_session;

  SELECT coalesce(jsonb_agg(to_jsonb(h.zone) ORDER BY h.zone COLLATE "C"), '[]'::jsonb)
    INTO v_lost
    FROM unnest(v_held) AS h(zone)
   WHERE NOT EXISTS (
           SELECT 1 FROM studio.zone_locks AS zl
            WHERE zl.campus_id = p_campus
              AND zl.zone_key = h.zone
              AND zl.holder = p_actor
              AND zl.session_id = p_session);

  SELECT coalesce(
           jsonb_agg(jsonb_build_object('zoneKey', zl.zone_key,
                                        'holderName', zl.holder_name,
                                        'holderIsMe', zl.holder = p_actor AND zl.session_id = p_session,
                                        'since', zl.acquired_at)
                     ORDER BY zl.zone_key COLLATE "C"),
           '[]'::jsonb)
    INTO v_locks
    FROM studio.zone_locks AS zl
   WHERE zl.campus_id = p_campus
     AND zl.heartbeat_at > now() - interval '5 minutes';

  RETURN jsonb_build_object('status', 'ok', 'headCommit', v_head, 'locks', v_locks, 'lostZones', v_lost);
END
$fn$;
COMMENT ON FUNCTION studio.status(text, text, text, text[]) IS
  'Status poll and heartbeat: refreshes the caller''s held locks and lists every live lock.';

-- studio.force_release: the owner's escape hatch ("Ana went home with the
-- building locked"). Allowed for the campus owner or a super admin; everyone else
-- (editor, viewer, non-member) gets forbidden and nothing is released.
CREATE OR REPLACE FUNCTION studio.force_release(
  p_campus               text,
  p_actor                text,
  p_zone                 text,
  p_actor_is_super_admin boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = studio, pg_temp
AS $fn$
DECLARE
  v_role     text;
  v_zone     text[];
  v_released integer;
BEGIN
  PERFORM 1 FROM studio.campuses AS c WHERE c.id = p_campus FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'campus_not_found');
  END IF;

  IF p_actor IS NULL OR p_actor = '' THEN
    RAISE EXCEPTION 'INVALID_ZONE: actor is required.' USING ERRCODE = '22023';
  END IF;

  SELECT m.role INTO v_role FROM studio.members AS m WHERE m.campus_id = p_campus AND m.user_id = p_actor;
  IF NOT (coalesce(p_actor_is_super_admin, false) OR coalesce(v_role = 'owner', false)) THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  v_zone := studio.lock_zone_keys(ARRAY[p_zone]);

  DELETE FROM studio.zone_locks AS zl WHERE zl.campus_id = p_campus AND zl.zone_key = v_zone[1];
  GET DIAGNOSTICS v_released = ROW_COUNT;

  RETURN jsonb_build_object('status', 'ok', 'released', v_released > 0);
END
$fn$;
COMMENT ON FUNCTION studio.force_release(text, text, text, boolean) IS
  'Owner or super admin removes any lock on a zone. See spec section 7.3.';

REVOKE ALL ON FUNCTION studio.lock_zone_keys(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION studio.acquire_zones(text, text, text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION studio.release_zones(text, text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION studio.status(text, text, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION studio.force_release(text, text, text, boolean) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA studio FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA studio FROM authenticated';
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION studio.acquire_zones(text, text, text, text, text[]) TO navi_studio_api;
GRANT EXECUTE ON FUNCTION studio.release_zones(text, text, text, text[]) TO navi_studio_api;
GRANT EXECUTE ON FUNCTION studio.status(text, text, text, text[]) TO navi_studio_api;
GRANT EXECUTE ON FUNCTION studio.force_release(text, text, text, boolean) TO navi_studio_api;

COMMIT;
