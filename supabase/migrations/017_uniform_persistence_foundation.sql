-- Uniform persistence protocol v2. Apply only in a verified non-production
-- environment first. This run does not apply this migration to Supabase.
-- No rows/history/projections are deleted or rewritten by this migration.
BEGIN;

-- Canonical retry identity: JSONB supplies stable object order. Session clocks
-- and counters are excluded, while all Graph and authored content is retained.
-- Source/purpose bind an exceptional recovery to its original audited action.
CREATE OR REPLACE FUNCTION public.graph_mutation_identity_v2(payload JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SET search_path = 'public' AS $$
DECLARE
  content JSONB := payload - 'expectedServerUpdatedAt' - 'forceServerOverwrite'
    - 'mutationId' - 'updatedAt' - 'createdBy' - 'revisionSource'
    - 'persistenceProtocol' - 'recoveryPurpose'
    - 'committedContentFingerprint' - 'committedRevision';
  document JSONB := NULLIF(payload->'authoredDocument', 'null'::JSONB);
  source TEXT := COALESCE(NULLIF(payload->>'revisionSource', ''), 'autosave');
BEGIN
  IF document IS NOT NULL THEN
    document := document - 'version' - 'schemaVersion' - '_changeJournal';
    IF jsonb_typeof(document->'metadata') = 'object' THEN
      document := jsonb_set(document, '{metadata}', (document->'metadata') - 'lastModified' - 'editorVersion');
    END IF;
  ELSE
    content := content - 'authoredDocumentFormatVersion';
  END IF;
  content := content || jsonb_build_object('authoredDocument', document);
  RETURN jsonb_build_object('content', content, 'source', source,
    'recoveryPurpose', CASE WHEN source = 'admin-recovery' THEN payload->>'recoveryPurpose' ELSE NULL END);
END;
$$;

-- Replace the old ordinary entry point so older privileged callers cannot
-- omit CAS, use entity counts as row existence, force, or drop a companion.
CREATE OR REPLACE FUNCTION public.sync_graph_snapshot(payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SET search_path = 'public' AS $$
DECLARE
  campus TEXT := NULLIF(payload->>'campusId', '');
  expected_revision TIMESTAMPTZ;
  current_revision TIMESTAMPTZ;
  current_authored JSONB;
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
  SELECT updated_at, authored_document INTO current_revision, current_authored
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
  RETURN public.write_graph_snapshot(campus, graph_payload, source, current_revision,
    COALESCE(NULLIF(payload->>'createdBy', ''), 'api'),
    jsonb_build_object('persistenceProtocol', 2) ||
      CASE WHEN source = 'admin-recovery' THEN jsonb_build_object('recoveryPurpose', payload->>'recoveryPurpose') ELSE '{}'::JSONB END,
    document);
END;
$$;

-- Retain the exact 014 seven-argument projection writer implementation while
-- removing its defaults. Defaults on both overloads made even explicitly typed
-- six-argument calls ambiguous. The six-argument compatibility entry owns defaults.
-- PostgreSQL requires dropping this exact signature to remove its defaults.
-- No CASCADE: any unexpected dependency aborts the entire transaction.
DROP FUNCTION public.write_graph_snapshot(TEXT,JSONB,TEXT,TIMESTAMPTZ,TEXT,JSONB,JSONB);
CREATE FUNCTION public.write_graph_snapshot(
  p_campus TEXT, p_payload JSONB, p_source TEXT,
  p_parent TIMESTAMPTZ, p_created_by TEXT,
  p_metadata JSONB,
  p_authored_document JSONB
) RETURNS JSONB LANGUAGE plpgsql SET search_path = 'public' AS $$
DECLARE
  saved_revision TIMESTAMPTZ;
  revision_metadata JSONB;
  b JSONB;
  n JSONB;
  e JSONB;
BEGIN
  saved_revision := clock_timestamp();
  revision_metadata := COALESCE(p_metadata, '{}'::JSONB) || jsonb_build_object(
    'version', COALESCE(p_payload->>'version', '1.0.0'),
    'buildingCount', COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(p_payload->'buildings') = 'array' THEN p_payload->'buildings' END), 0),
    'nodeCount', COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(p_payload->'nodes') = 'array' THEN p_payload->'nodes' END), 0),
    'edgeCount', COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(p_payload->'edges') = 'array' THEN p_payload->'edges' END), 0),
    'authoredDocumentFormatVersion', CASE WHEN p_authored_document IS NULL THEN NULL ELSE 1 END);

  -- History and current snapshot are one transactionally bound pair.
  INSERT INTO public.campus_graph_revisions
    (campus_id, revision, parent_revision, graph_data, authored_document, checksum, created_by, source, metadata)
  VALUES
    (p_campus, saved_revision, p_parent, p_payload, p_authored_document,
     md5(jsonb_build_object('graph', p_payload, 'authoredDocument', p_authored_document)::TEXT),
     COALESCE(p_created_by, 'api'),
     COALESCE(p_source, 'autosave'), revision_metadata);

  INSERT INTO public.graph_snapshots
    (campus_id, data, authored_document, version, updated_at)
  VALUES
    (p_campus, p_payload, p_authored_document,
     COALESCE(p_payload->>'version', '1.0.0'), saved_revision)
  ON CONFLICT (campus_id)
  DO UPDATE SET
    data = EXCLUDED.data,
    authored_document = EXCLUDED.authored_document,
    version = EXCLUDED.version,
    updated_at = saved_revision;

  DELETE FROM public.buildings WHERE campus_id = p_campus;
  FOR b IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'buildings', '[]'::JSONB))
  LOOP
    INSERT INTO public.buildings (id, campus_id, name, code, description, floors, color, center, outline, floor_plan_url)
    VALUES (
      b->>'id', p_campus, COALESCE(b->>'name', ''), b->>'code', COALESCE(b->>'description', ''),
      COALESCE(jsonb_array_length(b->'floors'), 1), COALESCE(b->>'color', '#64748B'),
      CASE WHEN b->'center'->>'lat' IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint((b->'center'->>'lng')::DOUBLE PRECISION, (b->'center'->>'lat')::DOUBLE PRECISION), 4326)::geography
        ELSE NULL END,
      CASE WHEN b->'outline' IS NOT NULL AND jsonb_array_length(b->'outline') >= 3
        THEN ST_GeogFromText('SRID=4326;POLYGON((' ||
          (SELECT string_agg((p->>'lng')::TEXT || ' ' || (p->>'lat')::TEXT, ',') FROM jsonb_array_elements(b->'outline') p)
          || ', ' || (b->'outline'->0->>'lng')::TEXT || ' ' || (b->'outline'->0->>'lat')::TEXT || '))')
        ELSE NULL END,
      b->>'floorPlanUrl')
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  DELETE FROM public.route_nodes WHERE campus_id = p_campus;
  FOR n IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'nodes', '[]'::JSONB))
  LOOP
    INSERT INTO public.route_nodes
      (id, campus_id, building_id, name, node_type, floor, position, component_id,
       svg_offset_x, svg_offset_y, has_qr, has_panorama, panorama_url, metadata)
    VALUES (
      n->>'id', p_campus, NULLIF(NULLIF(n->>'buildingId', ''), '__outdoor__'),
      COALESCE(n->>'name', ''), COALESCE(n->>'type', 'intersection'),
      COALESCE((n->>'floor')::INTEGER, 1),
      ST_SetSRID(ST_MakePoint((n->'position'->>'lng')::DOUBLE PRECISION, (n->'position'->>'lat')::DOUBLE PRECISION), 4326)::geography,
      n->>'componentId', (n->'svgOffset'->>'x')::DOUBLE PRECISION, (n->'svgOffset'->>'y')::DOUBLE PRECISION,
      COALESCE((n->>'hasQr')::BOOLEAN, FALSE), COALESCE((n->>'hasPanorama')::BOOLEAN, FALSE),
      n->>'panoramaUrl', COALESCE(n->'metadata', '{}'::JSONB))
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  DELETE FROM public.route_edges WHERE campus_id = p_campus;
  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'edges', '[]'::JSONB))
  LOOP
    INSERT INTO public.route_edges (id, campus_id, from_node_id, to_node_id, edge_type, distance)
    VALUES (e->>'id', p_campus, e->>'from', e->>'to', COALESCE(e->>'type', 'walkway'), COALESCE((e->>'distance')::DOUBLE PRECISION, 0))
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object('success', TRUE, 'campus_id', p_campus, 'updatedAt', saved_revision);
END;
$$;

-- Legacy six-argument callers must not silently clear a modern companion.
CREATE OR REPLACE FUNCTION public.write_graph_snapshot(
  p_campus TEXT, p_payload JSONB, p_source TEXT DEFAULT 'autosave',
  p_parent TIMESTAMPTZ DEFAULT NULL, p_created_by TEXT DEFAULT 'api',
  p_metadata JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB LANGUAGE plpgsql SET search_path = 'public' AS $$
DECLARE current_authored JSONB; current_revision TIMESTAMPTZ; row_exists BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('navi_graph_snapshot:' || p_campus));
  SELECT authored_document, updated_at INTO current_authored, current_revision FROM public.graph_snapshots WHERE campus_id = p_campus FOR UPDATE;
  row_exists := FOUND;
  IF current_authored IS NOT NULL THEN
    RAISE EXCEPTION 'AUTHORED_DOCUMENT_DOWNGRADE: legacy writer cannot clear modern authored content' USING ERRCODE = 'P0001';
  END IF;
  IF (row_exists AND (p_parent IS NULL OR current_revision IS DISTINCT FROM p_parent)) OR
     (NOT row_exists AND p_parent IS NOT NULL) THEN
    RAISE EXCEPTION 'GRAPH_SNAPSHOT_CONFLICT: legacy writer requires a matching parent revision' USING ERRCODE = 'P0001';
  END IF;
  RETURN public.write_graph_snapshot(p_campus, p_payload, p_source, p_parent, p_created_by, p_metadata, NULL);
END;
$$;

-- Shared privileged implementation. Exact same lock namespace and ledger,
-- with SHA-256 logical payload checksums instead of volatile transport bytes.
CREATE OR REPLACE FUNCTION public.apply_graph_snapshot_idempotent_v2(payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SET search_path = 'public' AS $$
DECLARE
  campus TEXT := NULLIF(payload->>'campusId', '');
  mut TEXT := NULLIF(payload->>'mutationId', '');
  checksum TEXT := encode(sha256(convert_to(public.graph_mutation_identity_v2(payload)::TEXT, 'UTF8')), 'hex');
  existing_revision TIMESTAMPTZ;
  existing_checksum TEXT;
  previous_graph JSONB;
  previous_document JSONB;
  previous_source TEXT;
  previous_metadata JSONB;
  result JSONB;
BEGIN
  IF campus IS NULL OR mut IS NULL THEN
    RAISE EXCEPTION 'MUTATION_ID_REQUIRED: campus and mutation id are required' USING ERRCODE = '22023';
  END IF;
  -- Even a replay must carry an explicit base and cannot smuggle a force flag.
  IF NOT payload ? 'expectedServerUpdatedAt' OR
     jsonb_typeof(payload->'expectedServerUpdatedAt') NOT IN ('null', 'string') OR
     payload->>'expectedServerUpdatedAt' = '' THEN
    RAISE EXCEPTION 'GRAPH_REVISION_REQUIRED: explicit expected revision is required' USING ERRCODE = '22023';
  END IF;
  IF payload ? 'forceServerOverwrite' AND payload->'forceServerOverwrite' <> 'false'::JSONB THEN
    RAISE EXCEPTION 'GRAPH_FORCE_FORBIDDEN: ordinary CAS cannot be bypassed' USING ERRCODE = '22023';
  END IF;
  -- Validate the base representation before replay as well as before new writes.
  PERFORM (payload->>'expectedServerUpdatedAt')::TIMESTAMPTZ;
  PERFORM pg_advisory_xact_lock(hashtext('navi_graph_snapshot:' || campus));
  SELECT revision, payload_checksum INTO existing_revision, existing_checksum
    FROM public.campus_graph_mutations WHERE campus_id = campus AND mutation_id = mut;
  IF FOUND THEN
    -- Old MD5 receipts remain readable: derive their logical identity from the
    -- immutable accepted revision rather than trusting a weaker legacy digest.
    IF length(existing_checksum) <> 64 THEN
      SELECT graph_data, authored_document, source, metadata
        INTO previous_graph, previous_document, previous_source, previous_metadata
        FROM public.campus_graph_revisions WHERE campus_id = campus AND revision = existing_revision;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'MUTATION_ACK_UNVERIFIED: original revision is unavailable' USING ERRCODE = 'P0001';
      END IF;
      previous_graph := previous_graph || jsonb_build_object('authoredDocument', previous_document,
        'revisionSource', previous_source, 'recoveryPurpose', previous_metadata->>'recoveryPurpose');
      IF previous_document IS NOT NULL THEN
        previous_graph := previous_graph || jsonb_build_object('authoredDocumentFormatVersion', 1);
      END IF;
      existing_checksum := encode(sha256(convert_to(public.graph_mutation_identity_v2(previous_graph)::TEXT, 'UTF8')), 'hex');
    END IF;
    IF existing_checksum <> checksum THEN
      RAISE EXCEPTION 'MUTATION_ID_COLLISION: mutation already committed with different logical content' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object('success', TRUE, 'campus_id', campus, 'updatedAt', existing_revision, 'idempotent_replay', TRUE);
  END IF;
  result := public.sync_graph_snapshot(payload - 'mutationId');
  INSERT INTO public.campus_graph_mutations(campus_id, mutation_id, payload_checksum, revision)
    VALUES(campus, mut, checksum, (result->>'updatedAt')::TIMESTAMPTZ);
  RETURN result || jsonb_build_object('idempotent_replay', FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_graph_snapshot_idempotent_v2(payload JSONB)
RETURNS JSONB LANGUAGE sql SET search_path = 'public' AS $$
  SELECT public.apply_graph_snapshot_idempotent_v2(
    (payload - 'recoveryPurpose') || jsonb_build_object('revisionSource', 'autosave'));
$$;

CREATE OR REPLACE FUNCTION public.recover_graph_snapshot_idempotent_v2(payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN
  IF NULLIF(trim(payload->>'recoveryPurpose'), '') IS NULL OR
     jsonb_typeof(payload->'expectedServerUpdatedAt') IS DISTINCT FROM 'string' OR
     NULLIF(payload->>'expectedServerUpdatedAt', '') IS NULL THEN
    RAISE EXCEPTION 'GRAPH_RECOVERY_REQUIRED: explicit purpose and current revision are required' USING ERRCODE = '22023';
  END IF;
  RETURN public.apply_graph_snapshot_idempotent_v2(payload || jsonb_build_object('revisionSource', 'admin-recovery'));
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_graph_snapshot_idempotent(payload JSONB)
RETURNS JSONB LANGUAGE sql SET search_path = 'public' AS $$
  SELECT public.sync_graph_snapshot_idempotent_v2(payload);
$$;

REVOKE ALL ON FUNCTION public.graph_mutation_identity_v2(JSONB),
  public.apply_graph_snapshot_idempotent_v2(JSONB), public.sync_graph_snapshot_idempotent_v2(JSONB),
  public.recover_graph_snapshot_idempotent_v2(JSONB), public.sync_graph_snapshot_idempotent(JSONB),
  public.sync_graph_snapshot(JSONB), public.write_graph_snapshot(TEXT,JSONB,TEXT,TIMESTAMPTZ,TEXT,JSONB,JSONB),
  public.write_graph_snapshot(TEXT,JSONB,TEXT,TIMESTAMPTZ,TEXT,JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.graph_mutation_identity_v2(JSONB),
  public.apply_graph_snapshot_idempotent_v2(JSONB), public.sync_graph_snapshot_idempotent_v2(JSONB),
  public.recover_graph_snapshot_idempotent_v2(JSONB), public.sync_graph_snapshot_idempotent(JSONB),
  public.sync_graph_snapshot(JSONB), public.write_graph_snapshot(TEXT,JSONB,TEXT,TIMESTAMPTZ,TEXT,JSONB,JSONB),
  public.write_graph_snapshot(TEXT,JSONB,TEXT,TIMESTAMPTZ,TEXT,JSONB)
  TO service_role;

-- Rollback is an explicit release operation, not part of this run: deploy a
-- writer compatible with the desired protocol before restoring 014 function
-- definitions. Never drop history/receipts/authored columns as a rollback.
-- Rolling back these guards reopens the old bypass/downgrade defects.

COMMIT;
