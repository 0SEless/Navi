\set ON_ERROR_STOP on
DO $$
DECLARE
  v_head_revision bigint;
  v_change_count integer;
  v_operation_count integer;
  v_receipt_count integer;
  v_latest_scope_checksum text;
  v_latest_operation_checksum text;
BEGIN
  SELECT revision INTO v_head_revision FROM navi_scoped.campus_heads WHERE campus_id = 'synthetic-e4-campus';
  SELECT count(*) INTO v_change_count FROM navi_scoped.change_sets WHERE campus_id = 'synthetic-e4-campus';
  SELECT count(*) INTO v_operation_count FROM navi_scoped.change_operations WHERE campus_id = 'synthetic-e4-campus';
  SELECT count(*) INTO v_receipt_count FROM navi_scoped.mutation_receipts WHERE campus_id = 'synthetic-e4-campus';
  IF v_head_revision <> 1 OR v_change_count <> 1 OR v_operation_count <> 1 OR v_receipt_count <> 1 THEN
    RAISE EXCEPTION 'E4_CONCURRENT_COMMIT_COUNTS head %, changes %, operations %, receipts %', v_head_revision, v_change_count, v_operation_count, v_receipt_count;
  END IF;
  SELECT content_checksum INTO v_latest_scope_checksum FROM navi_scoped.scope_heads
    WHERE campus_id = 'synthetic-e4-campus' AND scope_kind = 'building' AND scope_id = 'e4-building';
  SELECT after_checksum INTO v_latest_operation_checksum FROM navi_scoped.change_operations
    WHERE campus_id = 'synthetic-e4-campus' AND scope_kind = 'building' AND scope_id = 'e4-building'
    ORDER BY revision DESC, operation_index DESC LIMIT 1;
  IF v_latest_scope_checksum <> v_latest_operation_checksum THEN RAISE EXCEPTION 'E4_RECONSTRUCTION_HEAD_MISMATCH'; END IF;
  IF NOT EXISTS (SELECT 1 FROM navi_scoped.checkpoints WHERE campus_id = 'synthetic-e4-campus' AND revision = 0)
    OR NOT EXISTS (SELECT 1 FROM navi_scoped.change_sets WHERE campus_id = 'synthetic-e4-campus' AND revision = 1
      AND before_head_checksum = repeat('d', 64) AND after_head_checksum = repeat('f', 64)) THEN
    RAISE EXCEPTION 'E4_RECONSTRUCTION_LINEAGE_MISSING';
  END IF;

  BEGIN
    INSERT INTO navi_scoped.change_sets (campus_id, revision, batch_checksum, before_head_checksum, after_head_checksum, operation_count, actor_id)
    VALUES ('synthetic-e4-campus', 2, repeat('9', 64), repeat('f', 64), repeat('8', 64), 1, 'navi-e4-fixture');
    UPDATE navi_scoped.campus_heads SET revision = 2, head_checksum = repeat('8', 64) WHERE campus_id = 'synthetic-e4-campus';
    INSERT INTO navi_scoped.mutation_receipts (campus_id, mutation_id, request_checksum, content_checksum, revision, operation_index, batch_checksum)
    VALUES ('synthetic-e4-campus', 'e4-failing-receipt', repeat('1', 64), repeat('2', 64), 2, 0, repeat('7', 64));
    RAISE EXCEPTION 'E4_ATOMIC_ROLLBACK_FAILURE was not triggered';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
  IF EXISTS (SELECT 1 FROM navi_scoped.change_sets WHERE campus_id = 'synthetic-e4-campus' AND revision = 2)
    OR (SELECT revision FROM navi_scoped.campus_heads WHERE campus_id = 'synthetic-e4-campus') <> 1 THEN
    RAISE EXCEPTION 'E4_ATOMIC_ROLLBACK_PARTIAL_WRITE';
  END IF;
END
$$;
