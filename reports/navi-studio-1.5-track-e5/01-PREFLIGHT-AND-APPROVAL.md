# Track E5 — Live Preflight and Provisioning Approval Package

## T1 — Current Docker inventory

- Docker Engine/client: **29.8.1**, context `desktop-linux`; 12 CPUs, 6.72 GiB reported memory.
- Important inconsistency: `docker info --format` reports `total=1 running=1 paused=0 stopped=0`. Repeated `docker ps` returns no rows. `docker ps -a` and `docker system df --verbose` show exactly one container, the protected D2 container, exited. This discrepancy is unresolved; do not provision until reconciled.
- D2 container `navi-d2-synthetic-postgis17`, ID `33f738e498240f4cd470c7fc6a391370db11d79ccaaf5af8fabb3d1f6c29ff4c`, image `postgis/postgis:17-3.6`, state `Exited (255)`, restart policy `no`; start `2026-10-30T01:17:49Z`, finish `2026-10-30T06:14:22.62934926Z`, error field empty.
- D2 mounts named volume `navi-d2-synthetic-postgis17-data` read/write at `/var/lib/postgresql/data`; Docker reports 132.7 MB. A read-only copy of its `PG_VERSION` metadata reported `17`. The volume is populated, so old synthetic fixtures may remain; row contents were not inspected. The D2 container was never started or modified.
- D2 has a configured host binding `127.0.0.1:55432` → container `5432/tcp`; there is no current listener because it is stopped. Preserve this binding for possible D2 restart and use E5 port **55433** instead.
- D2 network `navi-d2-synthetic-isolated` is an internal bridge network. It has no attached endpoints while the container is stopped. It remains protected.
- Seven anonymous volumes have only the `com.docker.volume.anonymous` label; none is attached to a listed container and each reports 0 B. Ownership remains unknown. They were not deleted.
- Docker disk usage: images `postgis/postgis:17-3.6` 954.4 MB, `postgres:17-alpine` 423.8 MB, `hello-world:latest` 25.87 kB; protected D2 volume 132.7 MB; D2 container writable layer 94.2 kB; anonymous volumes 0 B each; build cache 0 B. C: free space is 11.34 GiB.
- No listener was found on `127.0.0.1:55432` or `:55433`.
- E5 container name `navi-e5-postgres17`, volume `navi-e5-postgres17-data`, and network `navi-e5-postgres17-net` are available.

## T4 — PostgreSQL and client readiness

The local `postgres:17-alpine` image is already present. Its image ID and repo digest are `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`; image metadata says `PG_MAJOR=17`, `PG_VERSION=17.11`, Linux amd64, size 403.6 MiB. This image is sufficient for a synthetic PostgreSQL 17.11 server and avoids a pull. Use the digest to pin the exact local image.

The E4 harness requires PostgreSQL 17 `psql`, `pg_dump`, and `pg_restore` on the host, but those executables are absent. The plan is to adapt the E4 runner to invoke the matching client tools inside the isolated E5 container with `docker exec`; the host adapter will connect only to `127.0.0.1:55433`. Do not install a Windows PostgreSQL server or pull another image.

Node package `pg` is absent from `package.json`, `package-lock.json`, and `node_modules`. The npm registry currently lists `pg` **8.23.1** and describes its pure-JavaScript client with optional native libpq bindings. Proposed test-only install after approval: `npm install --save-dev --save-exact --ignore-scripts pg@8.23.1`. Use a JavaScript `.mjs` integration harness to avoid adding `@types/pg`. Review that only `package.json` and `package-lock.json` changed; do not run `npm ci` or replace the dependency tree. [npm package record](https://www.npmjs.com/package/pg).

The E4 preflight now requires database `navi_e4_test`, role `navi_e4_runner`, database owner `navi_e4_runner`, exact database comment `navi-e4-synthetic-v1`, loopback server address, PostgreSQL 17, restricted role flags, absent Supabase API roles, and no existing `navi_scoped` schema. These checks have source tests but no live PostgreSQL result.

## Proposed E5-only resources (not created)

| Resource | Proposed value |
| --- | --- |
| Container | `navi-e5-postgres17`; `--restart=no` |
| Image | `postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24` (local PostgreSQL 17.11 image) |
| Network | `navi-e5-postgres17-net`, internal bridge |
| Volume | `navi-e5-postgres17-data` mounted at `/var/lib/postgresql/data` |
| Host endpoint | `127.0.0.1:55433` → container `5432` |
| Bootstrap login | `navi_e5_admin`, superuser only inside this synthetic container, random temporary password |
| Test database/role | `navi_e4_test` owned by restricted `navi_e4_runner`; marker `navi-e4-synthetic-v1`; runner has no superuser/CREATEDB/CREATEROLE/BYPASSRLS |

Port 55432 is not selected because the protected D2 configuration reserves it. Port 55433 has no current listener. The proposed names are unused. The image is already cached; no `docker pull` is proposed.

## Exact commands proposed after discrepancy resolution and explicit approval

Generate the bootstrap secret in the PowerShell process only; do not echo or log it:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$env:POSTGRES_PASSWORD = [Convert]::ToBase64String($bytes)

docker network create --internal navi-e5-postgres17-net
docker volume create navi-e5-postgres17-data
docker run --detach --name navi-e5-postgres17 --restart=no `
  --network navi-e5-postgres17-net `
  --publish 127.0.0.1:55433:5432 `
  --mount type=volume,source=navi-e5-postgres17-data,target=/var/lib/postgresql/data `
  --env POSTGRES_USER=navi_e5_admin --env POSTGRES_DB=postgres --env POSTGRES_PASSWORD `
  postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24
```

The E5 process password is random and synthetic only. Do not print `.Config.Env` or secret values from `docker inspect`; remove the environment value when setup no longer needs it. The proposed internal network and loopback-only publish isolate reachability; verify the actual bound endpoint before connecting.

Provision the restricted login/database using the container's PostgreSQL 17 `psql` after readiness. Generate a separate runner password into process variable `NAVI_E4_PGPASSWORD`, pass only the variable name to `docker exec -e`, and use psql variable substitution; no password literal belongs in a file, command text, or log. The SQL procedure is:

```sql
\getenv runner_password NAVI_E4_PGPASSWORD
CREATE ROLE navi_e4_runner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'runner_password';
CREATE DATABASE navi_e4_test OWNER navi_e4_runner;
COMMENT ON DATABASE navi_e4_test IS 'navi-e4-synthetic-v1';
```

Then verify role flags, database owner/comment, loopback address, server version, Supabase-role absence, and `to_regnamespace('navi_scoped') IS NULL` before migration.

## SQL, adapter, dump/restore, and rollback scope

1. Apply only `20261030045317_navi_scoped_persistence_foundation.sql` to the verified `navi_e4_test` target.
2. Verify ownership, seven RLS tables, constraints/indexes, grants/revokes, campus isolation, and restricted-role access.
3. Run synthetic concurrency/CAS, stale revision, injected transaction rollback, receipt batch binding, checkpoint/reconstruction, and independently queried row/fingerprint checks.
4. Run `PostgresScopedCommitStore` through the test-only `pg@8.23.1` pool binding for trusted identity, initialization, single/two-scope atomic writes, exact retry, changed-ID/cross-batch rejection, competing writers, mixed no-op batch, checkpoints, historical reconstruction, repeatable-read consistency, and SQLSTATE/timeouts.
5. Create a custom-format dump of only `navi_scoped`, record SHA-256, verify `pg_restore --list`, use the harness-owned rollback to return the same synthetic DB to an empty schema, restore, then compare counts, canonical fingerprints, revision lineage and reconstructed campus state.
6. Run final owned-schema rollback. Retain the E5 container, network, volume, database, and role for owner review; no Docker resource deletion is included.

Budget: no image pull; image already consumes 423.8 MB. Set an incremental E5 volume/dump budget of **0.5 GiB** and stop before crossing it. C: currently has 11.34 GiB free; recheck Docker disk usage and C: before creation.

## Protected-resource effect and approval still required

Expected effect on D2: none. Do not start, stop, restart, inspect its environment, modify, dump, or delete its container/volume/network. No anonymous volume cleanup. Only the new E5 names and port 55433 are proposed.

**Blocked prerequisite:** Docker reports one running container while `docker ps` reports none and `docker ps -a` shows only the stopped D2 container. Reconcile this read-only inventory inconsistency before marking the plan READY.

After reconciliation, explicit owner approval is still required for creating the named E5 container/network/volume, generating credentials and creating the database/role/marker, installing the exact test-only `pg@8.23.1` dependency, adapting the harness to run client tools in the container, executing migration/integration SQL, and the scoped synthetic dump/restore/rollback. No such action has been taken.
