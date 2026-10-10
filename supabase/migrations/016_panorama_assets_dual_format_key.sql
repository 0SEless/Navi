-- Migration: relax the panorama_assets key format CHECK to accept both the
-- legacy and the immutable panorama key shapes (Phase 7C, "Deploy R").
--
-- This is a PERMISSIVE SUPERSET, readers-only:
--   * no columns added, dropped or altered
--   * no indexes added or dropped
--   * no INSERT / UPDATE / DELETE — no data backfill, no row rewrite
--   * no change to the `key` primary key, campus_id, panorama_id,
--     content_type, byte_size, status, timestamps, or any RLS policy
--
-- Every key accepted by the previous CHECK is still accepted; the only
-- structural addition is the OPTIONAL third segment (the immutable asset id).
--
--   LEGACY     panoramas/<campusId>/<panoramaId>.<jpg|png|webp>
--   IMMUTABLE  panoramas/<campusId>/<panoramaId>/<assetId>.<jpg|png|webp>
--
-- Phase 7C still ISSUES only legacy keys (`buildPanoramaKey` is unchanged).
-- The immutable shape is accepted here, and by the TypeScript admission gate
-- in src/lib/panorama-keys.ts, purely so that Phase 7D can begin issuing
-- per-asset keys without any already-deployed reader rejecting them.
--
-- WHY THE CONSTRAINT IS DISCOVERED RATHER THAN NAMED: migration 015 declared
-- the check inline and unnamed, so its real name is whatever Postgres
-- auto-generated (`panorama_assets_key_check`). Hard-coding that name would
-- make this migration fail on any database where the generated name differs.
-- Instead we look the constraint up in pg_constraint by inspecting its
-- definition. Of the seven CHECKs on this table only the key-format check
-- mentions 'panoramas/', so the match is unambiguous and cannot touch the
-- campus_id / panorama_id / content_type / byte_size / status checks.
-- Re-running this migration is safe: it drops the format check (whichever
-- name it currently carries) and re-adds the identical definition.
--
-- GRAMMAR PARITY: the expression below must stay byte-compatible with
-- KEY_PATTERN in src/lib/panorama-keys.ts (which escapes the solidus as '\/'
-- where this SQL literal does not). Every segment uses {0,63}, matching
-- ID_PATTERN and migration 015, so accepting an asset segment does not widen
-- the campus/panorama grammar. src/lib/__tests__/panorama-key-db-parity.test.ts
-- fails if the two ever diverge.

DO $$
DECLARE
  existing_check record;
BEGIN
  FOR existing_check IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.panorama_assets'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%panoramas/%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.panorama_assets DROP CONSTRAINT %I',
      existing_check.conname
    );
  END LOOP;
END
$$;

ALTER TABLE public.panorama_assets
  ADD CONSTRAINT panorama_assets_key_format_check
  CHECK (key ~ '^panoramas/[a-z0-9][a-z0-9_-]{0,63}/[a-z0-9][a-z0-9_-]{0,63}(/[a-z0-9][a-z0-9_-]{0,63})?\.(jpg|png|webp)$');