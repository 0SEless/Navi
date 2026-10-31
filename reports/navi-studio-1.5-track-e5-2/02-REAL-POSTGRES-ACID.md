# Real PostgreSQL ACID Results

**Status: PASS on isolated synthetic PostgreSQL 17.11.**

The harness connected to `navi_e4_test` as `navi_e4_runner`, verified the exact database marker and loopback client path, and confirmed that the target had no pre-existing `navi_scoped` schema or Supabase API roles. It applied the reviewed persistence migration and seed/contract SQL only to this E5 database.

Verified by the successful harness run:

- Schema and role contracts, database privileges, transaction behavior, atomic rollback, change history, and owned-schema rollback.
- Two-session advisory-lock/CAS behavior: writer A committed; writer B received `E4_STALE_REVISION` and did not commit.
- Migration-run outcome: PostgreSQL 17 synthetic schema apply and contract checks passed.
- Final state query after the harness: `navi_scoped` does not exist and there are zero application tables in `navi_e4_test`.

The final runner log is `logs/e4-integration/integration-00980486cdcf40cc9d3305bc309ee41f/RESULT.txt`. Its preflight, concurrency, adapter, dump, and fingerprint evidence is alongside it. The intermediate failed runs are also retained with their failure records; each harness failure after schema creation ran the scoped rollback. No production or Supabase database was used.

