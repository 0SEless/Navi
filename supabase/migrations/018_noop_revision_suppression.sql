-- Suppress ordinary autosave revisions when the canonical Graph and authored
-- document are unchanged. Keep the existing CAS and authored-downgrade checks
-- ahead of this decision. A no-op is still acknowledged by the idempotent
-- wrapper, which records its mutation receipt against the current revision.
BEGIN;

CREATE OR REPLACE FUNCTION public.sync_graph_snapshot(payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SET search_path = 'public' AS $$
DECLARE
  campus TEXT := NULLIF(payload->>'campusId', '');
  expected_revision TIMESTAMPTZ;
  current_revision TIMESTAMPTZ;
  current_authored JSONB;
  current_graph JSONB;
  candidate_identity JSONB;
  current_identity JSONB;
  row_exists BOOLEAN;
  document JSONB := NULLIF(payload->'authoredDocument', 'null'::JSONB);
  source TEXT := COALESCE(NULLIF(payload->>'revisionSource', ''), 'autosave');
  graph_payload JSONB := payload - 'expectedServerUpdatedAt' - 'forceServerOverwrite'
    - 'mutationId' - 'revisionSource' - 'createdBy' - 'authoredDocument'
    - 'authoredDocumentFormatVersion' - 'persistenceProtocol' - 'recoveryPurpose'
    - 'committedContentFingerprint' - 'committedRevision';
BEGIN
  IF campus IS NULL THEN
    RAISE EXCEPTION 'GRAPH_SNAPSHOT_INVALID: campus is required' USING ERRCODE = '22023';
  END IF;
  IF NOT payload ? 'expectedServerUpdatedAt' OR
     jsonb_typeof(payload->'expectedServerUpdatedAt') NOT IN ('null', 'string') OR
     payload->>'expectedServerUpdatedAt' = '' THEN
    RAISE EXCEPTION 'GRAPH_REVISION_REQUIRED: explicit expected revision is required' USING ERRCODE = '22023';
  END IF;
  IF payload ? 'forceServerOverwrite' AND payload->'forceServerOverwrite' <> 'false'::JSONB THEN
    RAISE EXCEPTION 'GRAPH_FORCE_FORBIDDEN: ordinary CAS cannot be bypassed' USING ERRCODE = '22023';
  END IF;
  expected_revision := (payload->>'expectedServerUpdatedAt')::TIMESTAMPTZ;
  PERFORM pg_advisory_xact_lock(hashtext('navi_graph_snapshot:' || campus));
  SELECT data, updated_at, authored_document
    INTO current_graph, current_revision, current_authored
    FROM public.graph_snapshots WHERE campus_id = campus FOR UPDATE;
  row_exists := FOUND;
  IF row_exists AND (expected_revision IS NULL OR current_revision IS DISTINCT FROM expected_revision) THEN
    RAISE EXCEPTION 'GRAPH_SNAPSHOT_CONFLICT: server snapshot exists without a matching revision' USING ERRCODE = 'P0001';
  END IF;
  IF NOT row_exists AND expected_revision IS NOT NULL THEN
    RAISE EXCEPTION 'GRAPH_SNAPSHOT_CONFLICT: expected snapshot no longer exists' USING ERRCODE = 'P0001';
  END IF;
  IF current_authored IS NOT NULL AND document IS NULL THEN
    RAISE EXCEPTION 'AUTHORED_DOCUMENT_DOWNGRADE: modern authored content is required' USING ERRCODE = 'P0001';
  END IF;
  IF document IS NOT NULL AND (jsonb_typeof(document) <> 'object' OR
     document->'metadata'->>'campusId' IS DISTINCT FROM campus) THEN
    RAISE EXCEPTION 'GRAPH_SNAPSHOT_INVALID: authored campus must match' USING ERRCODE = '22023';
  END IF;

  -- A recovery is an explicit audited action and still creates a revision.
  -- Ordinary autosaves compare the same normalized identity used by the
  -- mutation ledger, including authored-only content but excluding clocks.
  IF row_exists AND source = 'autosave' THEN
    candidate_identity := graph_payload || jsonb_build_object('authoredDocument', document);
    current_identity := current_graph || jsonb_build_object('authoredDocument', current_authored);
    IF document IS NOT NULL THEN
      candidate_identity := candidate_identity || jsonb_build_object('authoredDocumentFormatVersion', 1);
    END IF;
    IF current_authored IS NOT NULL THEN
      current_identity := current_identity || jsonb_build_object('authoredDocumentFormatVersion', 1);
    END IF;
    candidate_identity := public.graph_mutation_identity_v2(candidate_identity)->'content';
    current_identity := public.graph_mutation_identity_v2(current_identity)->'content';
    IF current_identity IS NOT DISTINCT FROM candidate_identity THEN
      RETURN jsonb_build_object('success', TRUE, 'campus_id', campus,
        'updatedAt', current_revision, 'no_op', TRUE);
    END IF;
  END IF;

  RETURN public.write_graph_snapshot(campus, graph_payload, source, current_revision,
    COALESCE(NULLIF(payload->>'createdBy', ''), 'api'),
    jsonb_build_object('persistenceProtocol', 2) ||
      CASE WHEN source = 'admin-recovery' THEN jsonb_build_object('recoveryPurpose', payload->>'recoveryPurpose') ELSE '{}'::JSONB END,
    document);
END;
$$;

COMMIT;
