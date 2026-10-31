# PostgreSQL 17 integration harness

Harness files: `scripts/track-e4-postgres-integration/run.ps1`, `README.md`, and SQL fixtures `01-seed-and-contracts.sql`, `02-concurrent-writer-a.sql`, `02-concurrent-writer-b.sql`, `03-verify-history-and-rollback.sql`.

The runner is disabled unless `NAVI_E4_PG_INTEGRATION=1`. It accepts only loopback host names, the fixed dedicated database `navi_e4_test`, role `navi_e4_runner`, a process-only password, and PostgreSQL 17 `psql`/`pg_dump`/`pg_restore`. Before applying any SQL it verifies connected database/session identity, loopback server address, server version, non-superuser/no-CREATEDB/no-CREATEROLE role flags, database CREATE privilege, absence of Supabase API roles, and that `navi_scoped` does not already exist. It never creates/drops a database or provisions a role.

After explicit opt-in, the harness is designed to apply the migration, seed synthetic rows, check schema ownership/RLS/campus foreign keys, coordinate two writer sessions to test advisory-lock/CAS behavior, exercise a rolled-back partial write, verify reconstruction lineage, create a custom-format schema dump, drop only the schema it created, restore it, compare a logical data fingerprint, and roll back that owned schema. Failure cleanup stops only its own writer processes, attempts only the known-created schema rollback, and removes only its GUID-named temporary dump. Per-run logs are preserved under the report logs directory.

Validation performed in E4: PowerShell AST parse passed; default call, non-loopback host, and missing-password cases each refused with exit code 2 before a database connection. The environment has no `psql`, `pg_dump`, or `pg_restore`, so the integration harness was **not** enabled and SQL was not run.
