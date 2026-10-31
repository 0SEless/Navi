\set ON_ERROR_STOP on
DO $$
DECLARE
  v_rls_count integer;
  v_schema_owner text;
BEGIN
  SELECT count(*) INTO v_rls_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'navi_scoped' AND c.relkind = 'r' AND c.relrowsecurity;
  IF v_rls_count <> 7 THEN RAISE EXCEPTION 'E4_RLS_TABLE_COUNT expected 7, got %', v_rls_count; END IF;
  SELECT r.rolname INTO v_schema_owner
  FROM pg_namespace n JOIN pg_roles r ON r.oid = n.nspowner
  WHERE n.nspname = 'navi_scoped';
  IF v_schema_owner <> session_user THEN RAISE EXCEPTION 'E4_SCHEMA_OWNER mismatch'; END IF;
END
$$;

INSERT INTO navi_scoped.campus_heads (campus_id, document_id, revision, head_checksum, created_by)
VALUES
  ('synthetic-e4-campus', 'synthetic-document-e4', 0, repeat('d', 64), 'navi-e4-fixture'),
  ('synthetic-e4-other-campus', 'synthetic-document-e4-other', 0, repeat('8', 64), 'navi-e4-fixture');

INSERT INTO navi_scoped.scope_heads (campus_id, scope_kind, scope_id, revision, content_checksum, content_json)
VALUES
  ('synthetic-e4-campus', 'building', 'e4-building', 0, repeat('c', 64), '{"name":"Synthetic Before"}'::jsonb),
  ('synthetic-e4-other-campus', 'building', 'e4-building', 0, repeat('9', 64), '{"name":"Other Campus"}'::jsonb);

INSERT INTO navi_scoped.checkpoints (campus_id, revision, format_version, scope_count, snapshot_checksum, snapshot_json)
VALUES ('synthetic-e4-campus', 0, 1, 1, repeat('b', 64),
  '{"campusId":"synthetic-e4-campus","revision":0,"scopes":{"building:e4-building":{"scope":{"kind":"building","id":"e4-building"},"revision":0,"contentChecksum":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","content":{"name":"Synthetic Before"}}}}'::jsonb);

DO $$
BEGIN
  BEGIN
    INSERT INTO navi_scoped.change_sets (campus_id, revision, batch_checksum, before_head_checksum, after_head_checksum, operation_count, actor_id)
    VALUES ('synthetic-e4-campus', 77, repeat('a', 64), repeat('d', 64), repeat('f', 64), 1, 'navi-e4-fixture');
    INSERT INTO navi_scoped.change_operations (campus_id, revision, operation_index, mutation_id, scope_kind, scope_id, before_checksum, after_checksum, content_json)
    VALUES ('synthetic-e4-campus', 77, 0, 'e4-cross-campus-fk', 'building', 'only-exists-other-campus', repeat('c', 64), repeat('e', 64), '{"name":"invalid"}'::jsonb);
    RAISE EXCEPTION 'E4_CAMPUS_ISOLATION_FK was not enforced';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
  IF EXISTS (SELECT 1 FROM navi_scoped.change_sets WHERE campus_id = 'synthetic-e4-campus' AND revision = 77) THEN
    RAISE EXCEPTION 'E4_CAMPUS_ISOLATION_PARTIAL_WRITE';
  END IF;
END
$$;
