# E5 PostgreSQL Configuration Review

## Network reachability and isolation

Plan a dedicated internal bridge network named `navi-e5-postgres17-net` and publish PostgreSQL only as `127.0.0.1:55433:5432`. Docker documents that internal networks remove the external default route while allowing host-to-container communication, and that a published port bound to `127.0.0.1` is limited to the Docker host. This is compatible with the Windows-host Node `pg` adapter connecting to `127.0.0.1:55433`; the connection will be tested after approval. No network was created during E5.1. See [Docker internal network documentation](https://docs.docker.com/reference/cli/docker/network/create/) and [Docker port publishing documentation](https://docs.docker.com/engine/network/port-publishing/).

## Image, version, and persistent data path

The cached `postgres:17-alpine` image is PostgreSQL 17.11, Linux amd64, image digest `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`. No pull is needed. For PostgreSQL 17 and earlier, the official image uses `/var/lib/postgresql/data` as `PGDATA`; the named volume must mount there, not at its parent. See the [official PostgreSQL image documentation](https://github.com/docker-library/docs/blob/master/postgres/README.md). The E5 named volume will be `navi-e5-postgres17-data`.

## Credential lifecycle

- Generate a random test-only bootstrap password in a file under `%LOCALAPPDATA%\NAVI-E5\secrets`, outside the repository, with a restrictive Windows ACL. Mount that file read-only at `/run/secrets/postgres_admin_password` and set `POSTGRES_PASSWORD_FILE` to that path. Docker inspection will expose the path/configuration but not the password value. Keep the file ACL-restricted for as long as the container may need to restart; securely remove it after the E5 resources are explicitly retired.
- Set `POSTGRES_USER=navi_e5_admin`; this is the disposable container's bootstrap administrator, not a project or Supabase credential.
- Generate a separate random runner password in process memory/environment as `NAVI_E4_PGPASSWORD`. Pass it only to short-lived bootstrap/runner client processes and the host Node `pg` process. Never put the value on a command line, in source, in reports, or in captured output. Clear the environment value when the rehearsal ends. Do not print Docker `.Config.Env` values during inspection.

## Database and least privilege

Create only database `navi_e4_test`, owned by `navi_e4_runner`, and set comment `navi-e4-synthetic-v1`. The runner role is `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`; the bootstrap role is used only for database/role setup. The E4 preflight must verify PostgreSQL 17, loopback-only connectivity, the marker, the expected owner and restricted role, and absence of an existing `navi_scoped` schema before any migration. It must not be given a Supabase connection string or campus data.

## Package and harness compatibility

The project does not currently have `pg` in its manifest/lockfile and host `psql`, `pg_dump`, and `pg_restore` are absent. After approval, add exact test-only dependency `pg@8.23.1` with `npm install --save-dev --save-exact --ignore-scripts pg@8.23.1`; inspect that only the intended package manifest and lockfile change. A JavaScript `.mjs` harness avoids adding `@types/pg`. Do not run `npm ci` or alter unrelated dependencies. The [npm `pg` package page](https://www.npmjs.com/package/pg) identifies the requested version.

The existing `run.ps1` currently rejects execution unless host `psql`, `pg_dump`, and `pg_restore` are installed; those executables are absent here. It cannot run unchanged. The approved work must include a narrowly scoped runner adaptation to use the PostgreSQL 17 client binaries through only `docker exec navi-e5-postgres17`, while preserving binary dump bytes in a host temporary file and supporting restore from that file. Client calls made inside the container must target its loopback `127.0.0.1:5432`; the Windows-host Node adapter uses `127.0.0.1:55433`. Any adapter must translate only the E5 client endpoint, preserve host file inputs/outputs safely, and validate that every SQL/client invocation is pinned to `navi_e4_test` and the E5 container. No such source change was made during E5.1.

## SQL, dump/restore, and rollback scope

The only migration target is the newly created `navi_e4_test` database. Run the existing E4 synthetic migration and acceptance harness against that database after its exact preconditions pass. The tests must remain within E4-owned `navi_scoped` objects. Dump/restore testing is schema-scoped using a custom-format dump, recorded SHA-256 and `pg_restore --list`, followed by restore into a clean E5 test target/schema and comparison of counts, fingerprints, and migration/history state. Rollback may remove only E4-created schema/tables without `CASCADE`; do not issue broad database drops, `docker compose down -v`, or wildcard resource cleanup. Retain the E5 resources for owner review; any later cleanup must name only the E5 container, volume, and network and be separately authorized.

## Resource budget and current state

The image is already cached (~423.8 MB); do not pull it. Reserve a maximum of 0.5 GiB incremental Docker/C: storage for the E5 data, dump, and logs. C: had 11.34 GiB free at the prior read-only check. Recheck available space before provisioning and stop if the budget cannot be maintained. No E5 resource or package was created/installed in this review.
