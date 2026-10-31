# NAVI Studio 1.5 — Track E5.2 Summary

## Result: Synthetic PostgreSQL 17 recovery proof passed

The isolated E5 environment is reachable from the Windows host at `127.0.0.1:55433`. The PostgreSQL 17.11 harness applied the scoped persistence migration, passed SQL contract/concurrency checks and the real TypeScript adapter integration test, created a custom-format dump, restored it, and verified byte hashes and logical fingerprints. The harness then rolled back only its owned `navi_scoped` schema. Final read-only inspection confirms the database remains present and clean for another synthetic run.

- Dump SHA-256 matched in the container, host copy, and container round-trip: `5471a9203fb8a49c85fa8ac4c786b020baf40d9059ed2c930af4c3964458a584`.
- Pre-restore and post-restore logical fingerprints both equal `75c5b391cab017b9c48acc8c11259a0e`.
- The dedicated real PostgreSQL adapter test passed: one test, one pass.
- Final `navi_e4_test` state: PostgreSQL 17.11, expected synthetic database marker and runner role, no `navi_scoped` schema, zero application tables, no Supabase API roles.
- E5 container, network, and volume remain in place. D2 and anonymous volumes were not modified.

The whole-repository checks are not clean: Vitest reported 34 failures / 6,190 passes / 8 skipped; ESLint reported 1,556 errors and 11,644 warnings; TypeScript reported 1,128 diagnostics. These broad failures are retained in logs and are not represented as E5 persistence failures. No pre-change baseline comparison was run.

This synthetic proof does **not** establish that the real Development database has a valid backup or can be restored. No Supabase connection/export, migration against a real environment, cloud operation, deployment, push, or Production operation occurred.

See the detailed reports and timestamped evidence in this directory. Failed harness attempts and their corrective evidence are retained under `logs/e4-integration/`.

