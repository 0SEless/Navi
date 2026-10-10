-- Campus-scoped identity for normalized graph projections.
-- Existing rows/geographies are preserved. Missing rows are backfilled from
-- authoritative graph snapshots before same-campus foreign keys are added.
BEGIN;

LOCK TABLE public.buildings, public.route_nodes, public.route_edges IN ACCESS EXCLUSIVE MODE;

-- Reject malformed/duplicated authoritative IDs instead of hiding them in the
-- repair backfill. A logical ID may repeat across campuses, never within one.
DO $$
DECLARE duplicate_row RECORD;
BEGIN
  SELECT g.campus_id, entity->>'id' AS entity_id, 'building' AS entity_type
    INTO duplicate_row
  FROM public.graph_snapshots g
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(g.data->'buildings') = 'array' THEN g.data->'buildings' ELSE '[]'::JSONB END
  ) entity
  GROUP BY g.campus_id, entity->>'id'
  HAVING entity->>'id' IS NULL OR entity->>'id' = '' OR count(*) > 1
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'PROJECTION_ID_INVALID: duplicate or empty % id in campus %: %', duplicate_row.entity_type, duplicate_row.campus_id, duplicate_row.entity_id;
  END IF;

  SELECT g.campus_id, entity->>'id' AS entity_id, 'route node' AS entity_type
    INTO duplicate_row
  FROM public.graph_snapshots g
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(g.data->'nodes') = 'array' THEN g.data->'nodes' ELSE '[]'::JSONB END
  ) entity
  GROUP BY g.campus_id, entity->>'id'
  HAVING entity->>'id' IS NULL OR entity->>'id' = '' OR count(*) > 1
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'PROJECTION_ID_INVALID: duplicate or empty % id in campus %: %', duplicate_row.entity_type, duplicate_row.campus_id, duplicate_row.entity_id;
  END IF;

  SELECT g.campus_id, entity->>'id' AS entity_id, 'route edge' AS entity_type
    INTO duplicate_row
  FROM public.graph_snapshots g
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(g.data->'edges') = 'array' THEN g.data->'edges' ELSE '[]'::JSONB END
  ) entity
  GROUP BY g.campus_id, entity->>'id'
  HAVING entity->>'id' IS NULL OR entity->>'id' = '' OR count(*) > 1
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'PROJECTION_ID_INVALID: duplicate or empty % id in campus %: %', duplicate_row.entity_type, duplicate_row.campus_id, duplicate_row.entity_id;
  END IF;
END;
$$;

-- Replace global foreign keys and primary keys without deleting projection
-- rows. The composite keys allow the same logical IDs in different campuses.
ALTER TABLE public.route_edges DROP CONSTRAINT route_edges_from_node_id_fkey;
ALTER TABLE public.route_edges DROP CONSTRAINT route_edges_to_node_id_fkey;
ALTER TABLE public.route_nodes DROP CONSTRAINT route_nodes_building_id_fkey;

ALTER TABLE public.route_edges DROP CONSTRAINT route_edges_pkey;
ALTER TABLE public.route_nodes DROP CONSTRAINT route_nodes_pkey;
ALTER TABLE public.buildings DROP CONSTRAINT buildings_pkey;

ALTER TABLE public.buildings ADD CONSTRAINT buildings_pkey PRIMARY KEY (campus_id, id);
ALTER TABLE public.route_nodes ADD CONSTRAINT route_nodes_pkey PRIMARY KEY (campus_id, id);
ALTER TABLE public.route_edges ADD CONSTRAINT route_edges_pkey PRIMARY KEY (campus_id, id);

-- Backfill only missing identities from authoritative snapshots. Existing
-- projection rows, including their PostGIS values and timestamps, stay intact.
-- There is intentionally no ON CONFLICT clause: duplicate same-campus input
-- must fail rather than silently suppress a projectable entity.
DO $$
DECLARE
  snapshot_row RECORD;
  item JSONB;
BEGIN
  FOR snapshot_row IN SELECT campus_id, data FROM public.graph_snapshots ORDER BY campus_id LOOP
    FOR item IN SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(snapshot_row.data->'buildings') = 'array' THEN snapshot_row.data->'buildings' ELSE '[]'::JSONB END
    ) AS entries(value) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.buildings WHERE campus_id = snapshot_row.campus_id AND id = item->>'id') THEN
        INSERT INTO public.buildings (id, campus_id, name, code, description, floors, color, center, outline, floor_plan_url)
        VALUES (
          item->>'id', snapshot_row.campus_id, COALESCE(item->>'name', ''), item->>'code',
          COALESCE(item->>'description', ''),
          CASE WHEN jsonb_typeof(item->'floors') = 'array' THEN jsonb_array_length(item->'floors') ELSE 1 END,
          COALESCE(item->>'color', '#64748B'),
          CASE WHEN item->'center'->>'lat' IS NOT NULL
            THEN ST_SetSRID(ST_MakePoint((item->'center'->>'lng')::DOUBLE PRECISION, (item->'center'->>'lat')::DOUBLE PRECISION), 4326)::geography
            ELSE NULL END,
          CASE WHEN jsonb_typeof(item->'outline') = 'array' AND jsonb_array_length(item->'outline') >= 3
            THEN ST_GeogFromText('SRID=4326;POLYGON((' ||
              (SELECT string_agg((point->>'lng')::TEXT || ' ' || (point->>'lat')::TEXT, ',') FROM jsonb_array_elements(item->'outline') point)
              || ', ' || (item->'outline'->0->>'lng')::TEXT || ' ' || (item->'outline'->0->>'lat')::TEXT || '))')
            ELSE NULL END,
          item->>'floorPlanUrl'
        );
      END IF;
    END LOOP;

    FOR item IN SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(snapshot_row.data->'nodes') = 'array' THEN snapshot_row.data->'nodes' ELSE '[]'::JSONB END
    ) AS entries(value) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.route_nodes WHERE campus_id = snapshot_row.campus_id AND id = item->>'id') THEN
        INSERT INTO public.route_nodes
          (id, campus_id, building_id, name, node_type, floor, position, component_id, svg_offset_x, svg_offset_y, has_qr, has_panorama, panorama_url, metadata)
        VALUES (
          item->>'id', snapshot_row.campus_id, NULLIF(NULLIF(item->>'buildingId', ''), '__outdoor__'),
          COALESCE(item->>'name', ''), COALESCE(item->>'type', 'intersection'),
          COALESCE((item->>'floor')::INTEGER, 1),
          ST_SetSRID(ST_MakePoint((item->'position'->>'lng')::DOUBLE PRECISION, (item->'position'->>'lat')::DOUBLE PRECISION), 4326)::geography,
          item->>'componentId', (item->'svgOffset'->>'x')::DOUBLE PRECISION, (item->'svgOffset'->>'y')::DOUBLE PRECISION,
          COALESCE((item->>'hasQr')::BOOLEAN, FALSE), COALESCE((item->>'hasPanorama')::BOOLEAN, FALSE),
          item->>'panoramaUrl', COALESCE(item->'metadata', '{}'::JSONB)
        );
      END IF;
    END LOOP;

    FOR item IN SELECT value FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(snapshot_row.data->'edges') = 'array' THEN snapshot_row.data->'edges' ELSE '[]'::JSONB END
    ) AS entries(value) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.route_edges WHERE campus_id = snapshot_row.campus_id AND id = item->>'id') THEN
        INSERT INTO public.route_edges (id, campus_id, from_node_id, to_node_id, edge_type, distance)
        VALUES (item->>'id', snapshot_row.campus_id, item->>'from', item->>'to', COALESCE(item->>'type', 'walkway'), COALESCE((item->>'distance')::DOUBLE PRECISION, 0));
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Refuse same-campus constraints if the authoritative backfill could not
-- resolve every existing relationship. Nothing is discarded on this path.
DO $$
DECLARE invalid_row RECORD;
BEGIN
  SELECT n.campus_id, n.id, n.building_id INTO invalid_row
  FROM public.route_nodes n
  WHERE n.building_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.buildings b WHERE b.campus_id = n.campus_id AND b.id = n.building_id)
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'PROJECTION_FK_INVALID: node %.% references missing same-campus building %', invalid_row.campus_id, invalid_row.id, invalid_row.building_id;
  END IF;

  SELECT e.campus_id, e.id, e.from_node_id INTO invalid_row
  FROM public.route_edges e
  WHERE NOT EXISTS (SELECT 1 FROM public.route_nodes n WHERE n.campus_id = e.campus_id AND n.id = e.from_node_id)
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'PROJECTION_FK_INVALID: edge %.% references missing same-campus from node %', invalid_row.campus_id, invalid_row.id, invalid_row.from_node_id;
  END IF;

  SELECT e.campus_id, e.id, e.to_node_id INTO invalid_row
  FROM public.route_edges e
  WHERE NOT EXISTS (SELECT 1 FROM public.route_nodes n WHERE n.campus_id = e.campus_id AND n.id = e.to_node_id)
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'PROJECTION_FK_INVALID: edge %.% references missing same-campus to node %', invalid_row.campus_id, invalid_row.id, invalid_row.to_node_id;
  END IF;
END;
$$;

ALTER TABLE public.route_nodes
  ADD CONSTRAINT route_nodes_campus_building_fkey
  FOREIGN KEY (campus_id, building_id) REFERENCES public.buildings (campus_id, id) ON DELETE CASCADE;
ALTER TABLE public.route_edges
  ADD CONSTRAINT route_edges_campus_from_node_fkey
  FOREIGN KEY (campus_id, from_node_id) REFERENCES public.route_nodes (campus_id, id) ON DELETE CASCADE;
ALTER TABLE public.route_edges
  ADD CONSTRAINT route_edges_campus_to_node_fkey
  FOREIGN KEY (campus_id, to_node_id) REFERENCES public.route_nodes (campus_id, id) ON DELETE CASCADE;

-- Full campus replacement. Duplicate IDs inside one campus fail the composite
-- primary key visibly; identical IDs in other campuses remain independent.
CREATE OR REPLACE FUNCTION public.write_graph_snapshot(
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

  INSERT INTO public.campus_graph_revisions
    (campus_id, revision, parent_revision, graph_data, authored_document, checksum, created_by, source, metadata)
  VALUES
    (p_campus, saved_revision, p_parent, p_payload, p_authored_document,
     md5(jsonb_build_object('graph', p_payload, 'authoredDocument', p_authored_document)::TEXT),
     COALESCE(p_created_by, 'api'), COALESCE(p_source, 'autosave'), revision_metadata);

  INSERT INTO public.graph_snapshots (campus_id, data, authored_document, version, updated_at)
  VALUES (p_campus, p_payload, p_authored_document, COALESCE(p_payload->>'version', '1.0.0'), saved_revision)
  ON CONFLICT (campus_id) DO UPDATE SET
    data = EXCLUDED.data, authored_document = EXCLUDED.authored_document,
    version = EXCLUDED.version, updated_at = saved_revision;

  DELETE FROM public.route_edges WHERE campus_id = p_campus;
  DELETE FROM public.route_nodes WHERE campus_id = p_campus;
  DELETE FROM public.buildings WHERE campus_id = p_campus;

  FOR b IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'buildings', '[]'::JSONB)) AS entries(value) LOOP
    INSERT INTO public.buildings (id, campus_id, name, code, description, floors, color, center, outline, floor_plan_url)
    VALUES (
      b->>'id', p_campus, COALESCE(b->>'name', ''), b->>'code', COALESCE(b->>'description', ''),
      COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(b->'floors') = 'array' THEN b->'floors' END), 1),
      COALESCE(b->>'color', '#64748B'),
      CASE WHEN b->'center'->>'lat' IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint((b->'center'->>'lng')::DOUBLE PRECISION, (b->'center'->>'lat')::DOUBLE PRECISION), 4326)::geography ELSE NULL END,
      CASE WHEN jsonb_typeof(b->'outline') = 'array' AND jsonb_array_length(b->'outline') >= 3
        THEN ST_GeogFromText('SRID=4326;POLYGON((' ||
          (SELECT string_agg((point->>'lng')::TEXT || ' ' || (point->>'lat')::TEXT, ',') FROM jsonb_array_elements(b->'outline') point)
          || ', ' || (b->'outline'->0->>'lng')::TEXT || ' ' || (b->'outline'->0->>'lat')::TEXT || '))') ELSE NULL END,
      b->>'floorPlanUrl');
  END LOOP;

  FOR n IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'nodes', '[]'::JSONB)) AS entries(value) LOOP
    INSERT INTO public.route_nodes
      (id, campus_id, building_id, name, node_type, floor, position, component_id, svg_offset_x, svg_offset_y, has_qr, has_panorama, panorama_url, metadata)
    VALUES (
      n->>'id', p_campus, NULLIF(NULLIF(n->>'buildingId', ''), '__outdoor__'), COALESCE(n->>'name', ''), COALESCE(n->>'type', 'intersection'),
      COALESCE((n->>'floor')::INTEGER, 1),
      ST_SetSRID(ST_MakePoint((n->'position'->>'lng')::DOUBLE PRECISION, (n->'position'->>'lat')::DOUBLE PRECISION), 4326)::geography,
      n->>'componentId', (n->'svgOffset'->>'x')::DOUBLE PRECISION, (n->'svgOffset'->>'y')::DOUBLE PRECISION,
      COALESCE((n->>'hasQr')::BOOLEAN, FALSE), COALESCE((n->>'hasPanorama')::BOOLEAN, FALSE), n->>'panoramaUrl', COALESCE(n->'metadata', '{}'::JSONB));
  END LOOP;

  FOR e IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload->'edges', '[]'::JSONB)) AS entries(value) LOOP
    INSERT INTO public.route_edges (id, campus_id, from_node_id, to_node_id, edge_type, distance)
    VALUES (e->>'id', p_campus, e->>'from', e->>'to', COALESCE(e->>'type', 'walkway'), COALESCE((e->>'distance')::DOUBLE PRECISION, 0));
  END LOOP;

  RETURN jsonb_build_object('success', TRUE, 'campus_id', p_campus, 'updatedAt', saved_revision);
END;
$$;

COMMIT;
