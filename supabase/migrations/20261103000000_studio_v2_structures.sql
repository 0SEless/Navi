-- NAVI Studio Save v2: part kinds for outdoor structures (terrain plan, 2026-11-03).
--
-- map/structure (one stair or ramp) and map/structure-preset (one preset) are free map
-- items like map/road: arity 1, no lock zone. Only studio.zone_of changes (it also
-- validates part keys). Idempotent.

BEGIN;

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
    WHEN 'map/structure' THEN 1
    WHEN 'map/structure-preset' THEN 1
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

  -- R69 (owner, 2026-11-02): campus settings are not locked; only buildings and terrain are.
  RETURN CASE v_kind
    WHEN 'building' THEN 'building:' || v_first
    WHEN 'floor' THEN 'building:' || v_first
    WHEN 'terrain' THEN 'terrain'
    WHEN 'terrain-tile' THEN 'terrain'
    ELSE NULL
  END;
END
$fn$;

COMMIT;
