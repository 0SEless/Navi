# PostgreSQL Performance and Revision Efficiency

## Environment

- E5 container: `navi-e5-postgres17`, image digest `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24` (PostgreSQL 17.11).
- Endpoint: `127.0.0.1:55433`, published from container port 5432.
- Database / role: `navi_e4_test` / restricted `navi_e4_runner`; database marker `navi-e4-synthetic-v1`.
- Synthetic database has no PostGIS extension; this E7 test measures scoped JSON persistence only.

## Observed run

The final run committed 7 change sets and 7 operations, created 4 checkpoints, accepted one concurrent write, and rejected one stale write. Five initial scopes were seeded as the synthetic baseline. Save latencies ranged from **42.763 ms to 261.993 ms** (the higher values included shared Docker Desktop scheduling); reconstruction took **16.482 ms**.

During the run, PostgreSQL reported:

- Database size before migration/workflow: **8,320,691 bytes**.
- Database size after workflow, before schema rollback: **9,123,507 bytes**.
- Allocated bytes for scoped ordinary tables: **704,512 bytes**.
- Stored JSONB operation payload bytes: **32,118**; their JSON text representation was **107,080 bytes**.
- `pg_stat_database` tuple-counter deltas across the measurement window: **769 inserted, 56 updated, 17 deleted**.

The counter window spans database-wide activity from the baseline query through the final measurement and may include migration bookkeeping or concurrent E5 activity; it is not a per-operation WAL measurement. Database-size and relation-size numbers are storage snapshots, not cumulative bytes written. Schema rollback followed measurement, so these are peak-in-run allocations and not persistent post-run growth.

## Payload comparison

The synthetic complete document serialized to **64,226 bytes**. Individual scoped mutation candidates ranged from **578 bytes** (settings) to **22,351 bytes** (terrain); the first building candidate was **14,771 bytes**. These are Node JSON serialization sizes, not network, TOAST, index, or WAL sizes.

Full PostgreSQL output, including individual latencies and candidate sizes, is preserved in `logs/postgres-editor-workflow.log`.
