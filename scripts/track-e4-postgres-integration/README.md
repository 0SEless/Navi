# Track E4 PostgreSQL 17 integration harness

This harness is **disabled by default**. E4 does not run it. It never creates or drops a database, installs PostgreSQL, starts Docker/WSL, reads Supabase credentials, or uses real campus data. Track E5.2 separately provisions its approved synthetic database and opts in explicitly.

## Required separately provisioned test target

The E5.2 local environment uses container `navi-e5-postgres17`, image PostgreSQL 17.11, and the dedicated host endpoint `127.0.0.1:55433`. Its database `navi_e4_test` must be owned by restricted login `navi_e4_runner`, with database comment `navi-e4-synthetic-v1`. The login must be non-superuser with neither `CREATEDB` nor `CREATEROLE`; as database owner it can create its isolated `navi_scoped` schema. Do not install the Supabase roles `anon`, `authenticated`, or `service_role`. The schema must not exist before the harness starts. Store the test role password outside the repository and supply it only in the process environment.

The harness accepts only host `127.0.0.1`, port `55433`, fixed database/role names, the exact E5 container, and PostgreSQL 17 client tools available inside that container. It invokes `psql`, `pg_dump`, and `pg_restore` through `docker exec`; it stages only reviewed E4 SQL files in a per-run temporary container directory. The SQL clients connect to the container's own `127.0.0.1:5432`, while the Node adapter integration test uses the verified Windows-host endpoint `127.0.0.1:55433`. The database must carry the exact marker. Preflight verifies server identity, role capabilities, version, absence of Supabase roles and `navi_scoped`; any mismatch stops before migration.

## Explicit opt-in

In a PowerShell process already configured with the dedicated local test credentials, set:

```powershell
$env:NAVI_E4_PG_INTEGRATION = '1'
$env:NAVI_E4_PGHOST = '127.0.0.1'
$env:NAVI_E4_PGPORT = '55433'
$env:NAVI_E4_PGDATABASE = 'navi_e4_test'
$env:NAVI_E4_PGUSER = 'navi_e4_runner'
# Set NAVI_E4_PGPASSWORD from an approved local secret store; do not paste it into a command or file.
.\scripts\track-e4-postgres-integration\run.ps1
```

The default invocation refuses with exit code 2 and does not attempt a connection. A successful opt-in run applies the proposal, seeds synthetic records, checks schema/RLS/campus-key constraints, tests two-session advisory-lock/CAS behavior and atomic rollback, runs an opt-in real `pg` adapter integration test, dumps/restores the scoped schema, verifies byte-identical host/container transfer and SHA-256, compares a logical data fingerprint, then rolls back only the schema it created. Logs remain under `reports/navi-studio-1.5-track-e5-2/logs/e4-integration/integration-<run-id>/`; temporary host dump and per-run container staging files are removed in `finally`. The E5 database, container, network, and volume are retained.

If a run fails after migration, the script stops its own writer subprocesses and attempts the E4 rollback only because preflight established that the schema was absent and the harness created it. It never drops the database or removes unrelated resources.
