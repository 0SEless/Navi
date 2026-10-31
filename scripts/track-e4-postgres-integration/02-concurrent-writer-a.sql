\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('navi-scoped:synthetic-e4-campus', 0));
SELECT pg_sleep(1.0);
DO $$
DECLARE v_revision bigint;
BEGIN
  SELECT revision INTO v_revision FROM navi_scoped.campus_heads WHERE campus_id = 'synthetic-e4-campus' FOR UPDATE;
  IF v_revision <> 0 THEN RAISE EXCEPTION 'E4_STALE_REVISION'; END IF;
  INSERT INTO navi_scoped.change_sets (campus_id, revision, batch_checksum, before_head_checksum, after_head_checksum, operation_count, actor_id)
  VALUES ('synthetic-e4-campus', 1, repeat('a', 64), repeat('d', 64), repeat('f', 64), 1, 'navi-e4-fixture');
  INSERT INTO navi_scoped.scope_heads (campus_id, scope_kind, scope_id, revision, content_checksum, content_json)
  VALUES ('synthetic-e4-campus', 'building', 'e4-building', 1, repeat('e', 64), '{"name":"Synthetic After A"}'::jsonb)
  ON CONFLICT (campus_id, scope_kind, scope_id) DO UPDATE SET revision = EXCLUDED.revision, content_checksum = EXCLUDED.content_checksum, content_json = EXCLUDED.content_json;
  INSERT INTO navi_scoped.change_operations (campus_id, revision, operation_index, mutation_id, scope_kind, scope_id, before_checksum, after_checksum, content_json)
  VALUES ('synthetic-e4-campus', 1, 0, 'e4-concurrent-a', 'building', 'e4-building', repeat('c', 64), repeat('e', 64), '{"name":"Synthetic After A"}'::jsonb);
  INSERT INTO navi_scoped.mutation_receipts (campus_id, mutation_id, request_checksum, content_checksum, revision, operation_index, batch_checksum)
  VALUES ('synthetic-e4-campus', 'e4-concurrent-a', repeat('1', 64), repeat('e', 64), 1, 0, repeat('a', 64));
  UPDATE navi_scoped.campus_heads SET revision = 1, head_checksum = repeat('f', 64) WHERE campus_id = 'synthetic-e4-campus';
END
$$;
COMMIT;
