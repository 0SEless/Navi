-- Development-only regression test. Run this single DO block against the
-- local/development database after migration 019. A raised exception fails the
-- test; all generated test campuses are deleted before a successful return.
DO $$
DECLARE
  campus_a TEXT := 'navi-projection-rc-a-' || gen_random_uuid()::TEXT;
  campus_b TEXT := 'navi-projection-rc-b-' || gen_random_uuid()::TEXT;
  payload_a JSONB;
  payload_b JSONB;
  payload_a_updated JSONB;
  parent_revision TIMESTAMPTZ;
  actual_count INTEGER;
  building_name TEXT;
  node_lat DOUBLE PRECISION;
  edge_distance DOUBLE PRECISION;
BEGIN
  payload_a := jsonb_build_object(
    'campusId', campus_a, 'version', '1.0.0',
    'buildings', jsonb_build_array(jsonb_build_object('id', 'shared-building-id', 'name', 'Campus A', 'floors', jsonb_build_array(1))),
    'nodes', jsonb_build_array(
      jsonb_build_object('id', 'shared-node-from', 'buildingId', 'shared-building-id', 'name', 'A from', 'position', jsonb_build_object('lat', 10, 'lng', 20)),
      jsonb_build_object('id', 'shared-node-to', 'buildingId', 'shared-building-id', 'name', 'A to', 'position', jsonb_build_object('lat', 10.01, 'lng', 20.01))
    ),
    'edges', jsonb_build_array(jsonb_build_object('id', 'shared-edge-id', 'from', 'shared-node-from', 'to', 'shared-node-to', 'type', 'walk', 'distance', 1))
  );
  payload_b := jsonb_build_object(
    'campusId', campus_b, 'version', '1.0.0',
    'buildings', jsonb_build_array(jsonb_build_object('id', 'shared-building-id', 'name', 'Campus B', 'floors', jsonb_build_array(1))),
    'nodes', jsonb_build_array(
      jsonb_build_object('id', 'shared-node-from', 'buildingId', 'shared-building-id', 'name', 'B from', 'position', jsonb_build_object('lat', 30, 'lng', 40)),
      jsonb_build_object('id', 'shared-node-to', 'buildingId', 'shared-building-id', 'name', 'B to', 'position', jsonb_build_object('lat', 30.01, 'lng', 40.01))
    ),
    'edges', jsonb_build_array(jsonb_build_object('id', 'shared-edge-id', 'from', 'shared-node-from', 'to', 'shared-node-to', 'type', 'walk', 'distance', 9))
  );

  PERFORM public.write_graph_snapshot(campus_a, payload_a, 'autosave', NULL, 'projection-test', '{}'::JSONB, NULL);
  PERFORM public.write_graph_snapshot(campus_b, payload_b, 'autosave', NULL, 'projection-test', '{}'::JSONB, NULL);

  SELECT count(*) INTO actual_count FROM public.buildings WHERE campus_id = campus_a AND id = 'shared-building-id';
  IF actual_count <> 1 THEN RAISE EXCEPTION 'Campus A building was skipped: %', actual_count; END IF;
  SELECT count(*) INTO actual_count FROM public.buildings WHERE campus_id = campus_b AND id = 'shared-building-id';
  IF actual_count <> 1 THEN RAISE EXCEPTION 'Campus B building was skipped: %', actual_count; END IF;
  SELECT count(*) INTO actual_count FROM public.route_nodes WHERE campus_id = campus_a AND id IN ('shared-node-from','shared-node-to');
  IF actual_count <> 2 THEN RAISE EXCEPTION 'Campus A nodes were skipped: %', actual_count; END IF;
  SELECT count(*) INTO actual_count FROM public.route_nodes WHERE campus_id = campus_b AND id IN ('shared-node-from','shared-node-to');
  IF actual_count <> 2 THEN RAISE EXCEPTION 'Campus B nodes were skipped: %', actual_count; END IF;
  SELECT count(*) INTO actual_count FROM public.route_edges WHERE campus_id = campus_a AND id = 'shared-edge-id';
  IF actual_count <> 1 THEN RAISE EXCEPTION 'Campus A edge was skipped: %', actual_count; END IF;
  SELECT count(*) INTO actual_count FROM public.route_edges WHERE campus_id = campus_b AND id = 'shared-edge-id';
  IF actual_count <> 1 THEN RAISE EXCEPTION 'Campus B edge was skipped: %', actual_count; END IF;

  -- Rebuild Campus A with different values; Campus B's independently keyed
  -- entities and geography-derived coordinates must remain unchanged.
  payload_a_updated := jsonb_set(payload_a, '{buildings,0,name}', '"Campus A Updated"'::JSONB);
  payload_a_updated := jsonb_set(payload_a_updated, '{nodes,0,position,lat}', '11'::JSONB);
  payload_a_updated := jsonb_set(payload_a_updated, '{edges,0,distance}', '2'::JSONB);
  SELECT updated_at INTO parent_revision FROM public.graph_snapshots WHERE campus_id = campus_a;
  PERFORM public.write_graph_snapshot(campus_a, payload_a_updated, 'autosave', parent_revision, 'projection-test', '{}'::JSONB, NULL);

  SELECT name INTO building_name FROM public.buildings WHERE campus_id = campus_b AND id = 'shared-building-id';
  IF building_name IS DISTINCT FROM 'Campus B' THEN RAISE EXCEPTION 'Campus A update changed Campus B building: %', building_name; END IF;
  SELECT ST_Y(position::geometry) INTO node_lat FROM public.route_nodes WHERE campus_id = campus_b AND id = 'shared-node-from';
  IF abs(node_lat - 30) > 0.0000001 THEN RAISE EXCEPTION 'Campus A update changed Campus B node position: %', node_lat; END IF;
  SELECT distance INTO edge_distance FROM public.route_edges WHERE campus_id = campus_b AND id = 'shared-edge-id';
  IF edge_distance IS DISTINCT FROM 9::DOUBLE PRECISION THEN RAISE EXCEPTION 'Campus A update changed Campus B edge: %', edge_distance; END IF;

  -- A second full replacement and target-only deletion must leave every B row.
  SELECT updated_at INTO parent_revision FROM public.graph_snapshots WHERE campus_id = campus_a;
  PERFORM public.write_graph_snapshot(campus_a, payload_a_updated, 'autosave', parent_revision, 'projection-test', '{}'::JSONB, NULL);
  DELETE FROM public.route_edges WHERE campus_id = campus_a;
  DELETE FROM public.route_nodes WHERE campus_id = campus_a;
  DELETE FROM public.buildings WHERE campus_id = campus_a;
  IF (SELECT count(*) FROM public.buildings WHERE campus_id = campus_b) <> 1 OR
     (SELECT count(*) FROM public.route_nodes WHERE campus_id = campus_b) <> 2 OR
     (SELECT count(*) FROM public.route_edges WHERE campus_id = campus_b) <> 1 THEN
    RAISE EXCEPTION 'Campus A rebuild/deletion removed Campus B projection rows';
  END IF;

  DELETE FROM public.graph_snapshots WHERE campus_id IN (campus_a, campus_b);
  DELETE FROM public.campus_graph_revisions WHERE campus_id IN (campus_a, campus_b);
END;
$$;
