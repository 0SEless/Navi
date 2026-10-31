# E5 Final Provisioning Approval Package

## Request

Approve provisioning and running the isolated synthetic PostgreSQL environment below, installing the exact test-only `pg` dependency, and executing the scoped E4 migration/integration plus dump/restore rehearsal. This approval is **not** for Supabase access, Production, migrations outside the synthetic E5 database, deployment, push, or cleanup of unrelated resources. No provisioning or test execution has occurred in E5.1.

## Reconciled Docker state

Two read-only samples 11.6 seconds apart confirmed context `desktop-linux`, endpoint `npipe:////./pipe/dockerDesktopLinuxEngine`, daemon ID `137c7f6b-b76c-4205-90ff-b1170afc87b8`, Docker 29.8.1, and the same sole container identity: protected D2 ID `33f738e498240f4cd470c7fc6a391370db11d79ccaaf5af8fabb3d1f6c29ff4c`, exited 255. Both listings show no running containers, while `docker info` reports one running. The cause is unknown. Under the owner's E5.1 rule, stable identities and no unidentified workloads classify this as a documented aggregate monitoring anomaly, not a blocking resource conflict.

## Exact E5 resource plan

| Resource | Proposed value |
|---|---|
| Container | `navi-e5-postgres17` |
| Image | `postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24` (cached PostgreSQL 17.11; no pull) |
| Named volume | `navi-e5-postgres17-data` mounted at `/var/lib/postgresql/data` |
| Network | `navi-e5-postgres17-net`, dedicated internal bridge |
| Published port | `127.0.0.1:55433:5432` only |
| Database | `navi_e4_test`, marker `navi-e4-synthetic-v1` |
| Restricted role | `navi_e4_runner`, login; no superuser, create-db, create-role, or bypass-RLS privileges; owns only the test DB |
| Bootstrap role | `navi_e5_admin`, disposable local container administrator |
| Node driver | exact dev dependency `pg@8.23.1` |

The Docker daemon and Windows host have access to the published loopback endpoint. The internal bridge blocks ordinary container egress; only localhost-published access is planned. Confirm actual host-to-container connectivity before SQL. Existing D2 reserves `127.0.0.1:55432`; E5 does not use it. The E5 names and 55433 listener were available at inspection.

## Exact commands proposed after approval

Commands below are an execution plan, not executed commands. Use an elevated PowerShell session only if Docker access requires it. First recheck the Docker context, all resource names, port 55433, and C: free space. Stop on any new conflict. Image digest is pinned and already cached.

```powershell
# Create an ACL-restricted secret directory outside the repository, then generate
# a random bootstrap password file without displaying its value.
$secretDir = Join-Path $env:LOCALAPPDATA 'NAVI-E5\secrets'
New-Item -ItemType Directory -Force -Path $secretDir | Out-Null
$secretFile = Join-Path $secretDir 'postgres_admin_password'
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[IO.File]::WriteAllText($secretFile, [Convert]::ToBase64String($bytes))
[Array]::Clear($bytes, 0, $bytes.Length)
icacls $secretDir /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" | Out-Null
# Verify the resulting ACL before Docker starts; abort if another principal has access.

docker network create --driver bridge --internal navi-e5-postgres17-net
docker volume create navi-e5-postgres17-data
docker run --detach --name navi-e5-postgres17 --restart=no `
  --network navi-e5-postgres17-net `
  --publish 127.0.0.1:55433:5432 `
  --mount 'type=volume,source=navi-e5-postgres17-data,target=/var/lib/postgresql/data' `
  --mount "type=bind,source=$secretFile,target=/run/secrets/postgres_admin_password,readonly" `
  --env POSTGRES_USER=navi_e5_admin `
  --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres_admin_password `
  postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24

# Verify container/image/network/mount and loopback publication without printing
# secret values; wait for pg_isready before any SQL.
docker inspect navi-e5-postgres17
docker exec navi-e5-postgres17 pg_isready -U navi_e5_admin
Test-NetConnection 127.0.0.1 -Port 55433

# Install only after approval; inspect package.json/package-lock.json diff.
npm install --save-dev --save-exact --ignore-scripts pg@8.23.1

# Generate a separate random runner password in process memory. The value is
# passed only to this short-lived docker exec process; never echo or log it.
$runnerBytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Fill($runnerBytes)
$runnerPassword = [Convert]::ToBase64String($runnerBytes)
$env:NAVI_E4_PGPASSWORD = $runnerPassword
[Array]::Clear($runnerBytes, 0, $runnerBytes.Length)
$bootstrapSql = @'
\getenv runner_password NAVI_E4_PGPASSWORD
CREATE ROLE navi_e4_runner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'runner_password';
CREATE DATABASE navi_e4_test OWNER navi_e4_runner;
COMMENT ON DATABASE navi_e4_test IS 'navi-e4-synthetic-v1';
'@
try {
  $bootstrapSql | docker exec -i -e "NAVI_E4_PGPASSWORD=$env:NAVI_E4_PGPASSWORD" `
    navi-e5-postgres17 psql -v ON_ERROR_STOP=1 -U navi_e5_admin -d postgres
  if ($LASTEXITCODE -ne 0) { throw 'E5 role/database bootstrap failed.' }
} finally {
  Remove-Item Env:NAVI_E4_PGPASSWORD -ErrorAction SilentlyContinue
}

# After the separately reviewed runner adaptation routes psql/pg_dump/pg_restore
# through docker exec (and preserves the archive as binary), configure the E4
# target. The harness/client side must reject every database except navi_e4_test.
$env:NAVI_E4_PG_INTEGRATION = '1'
$env:NAVI_E4_PGHOST = '127.0.0.1'
$env:NAVI_E4_PGPORT = '55433'
$env:NAVI_E4_PGDATABASE = 'navi_e4_test'
$env:NAVI_E4_PGUSER = 'navi_e4_runner'
$env:NAVI_E4_PGPASSWORD = $runnerPassword
try { & .\scripts\track-e4-postgres-integration\run.ps1 }
finally {
  Remove-Item Env:NAVI_E4_PG_INTEGRATION,Env:NAVI_E4_PGHOST,Env:NAVI_E4_PGPORT,Env:NAVI_E4_PGDATABASE,Env:NAVI_E4_PGUSER,Env:NAVI_E4_PGPASSWORD -ErrorAction SilentlyContinue
  $runnerPassword = $null
}

# Capture sanitized logs, SHA-256, pg_restore --list, row/fingerprint equality,
# restore verification, and owned-schema rollback. Never print secret values.
```

The bootstrap input contains only the limited role, database, and marker statements shown above; it has no password literal. The runner secret is transiently passed in the environment of the short-lived Docker exec request and must not be echoed, recorded in process transcripts, or included in captured logs. Clear the environment immediately after setup and also in a `finally` block on error. If the proposed PowerShell secret ACL cannot be verified or the Docker bind mount cannot read the protected file, stop and revise the credential mechanism before starting the container.

## Scope, budget, and rollback

- SQL/migration/test scope: only the fresh `navi_e4_test` database and E4-owned `navi_scoped` objects. No existing schema is accepted by preflight.
- Backup proof: custom-format schema dump from E5, SHA-256, `pg_restore --list`, restore into a clean isolated test target, and data/fingerprint comparison.
- Rollback: remove only E4-created objects using its scoped rollback, without `CASCADE`. Keep the E5 database, container, volume, and network available for review. Any later Docker cleanup requires separate explicit authorization and exact E5 resource names; no prune or broad `down -v` command.
- Budget: up to 0.5 GiB incremental storage; cached image is ~423.8 MB and requires no download. Previously observed C: free space was 11.34 GiB; recheck before work.
- Existing effects: no changes to D2 container, D2 data volume/network, seven anonymous volumes, other Docker resources, source modifications, D6 archive, Supabase, Vercel, GitHub, or Production.

## Owner decision still required

Explicitly approve the E5-only container, internal network, named volume, loopback port, test-only `pg@8.23.1` dependency/lockfile update, a narrow E4 harness adaptation for containerized PG17 client tools and byte-safe dump/restore, creation of the synthetic role/database, scoped E4 SQL tests, and synthetic dump/restore. No approval is requested for cleanup. This package does not authorize a real Development backup or establish its recoverability.
