-- PROPOSED ONLY — do not execute as part of Tracks E3/E4.
-- Before rollback: stop new adapter traffic, export/verify any scoped data, and
-- obtain explicit environment-owner approval. This removes only E3-owned objects.

BEGIN;

DROP TABLE IF EXISTS navi_scoped.checkpoints;
DROP TABLE IF EXISTS navi_scoped.mutation_receipts;
DROP TABLE IF EXISTS navi_scoped.change_dependencies;
DROP TABLE IF EXISTS navi_scoped.change_operations;
DROP TABLE IF EXISTS navi_scoped.change_sets;
DROP TABLE IF EXISTS navi_scoped.scope_heads;
DROP TABLE IF EXISTS navi_scoped.campus_heads;

-- Deliberately omit CASCADE. If another object has since been added to this
-- schema, rollback stops for review instead of dropping unreviewed objects.
DROP SCHEMA IF EXISTS navi_scoped;

COMMIT;
