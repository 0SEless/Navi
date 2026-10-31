\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('navi-scoped:synthetic-e4-campus', 0));
DO $$
DECLARE v_revision bigint;
BEGIN
  SELECT revision INTO v_revision FROM navi_scoped.campus_heads WHERE campus_id = 'synthetic-e4-campus' FOR UPDATE;
  IF v_revision <> 0 THEN RAISE EXCEPTION 'E4_STALE_REVISION'; END IF;
  INSERT INTO navi_scoped.change_sets (campus_id, revision, batch_checksum, before_head_checksum, after_head_checksum, operation_count, actor_id)
  VALUES ('synthetic-e4-campus', 1, repeat('b', 64), repeat('d', 64), repeat('g', 64), 1, 'navi-e4-fixture');
END
$$;
COMMIT;
