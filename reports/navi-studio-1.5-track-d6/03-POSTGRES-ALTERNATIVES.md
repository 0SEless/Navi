# Track D6 — Docker-independent PostgreSQL/PostGIS Options

## Local inventory

- No local `postgres`, `pg_ctl`, `psql`, `pg_restore`, or `createdb` executables, PostgreSQL services, install roots, or matching registry install entries were found.
- WSL Ubuntu exists but is Stopped; this task did not start it or install packages.
- TCP ports 5432 and 55432 had no listeners during inventory.
- C: had approximately 13.67 GiB free after source archive creation.
- No local synthetic PostgreSQL process was run in D6.

## Feasible path without Docker

The practical native Windows route is PostgreSQL 17 via the PostgreSQL Windows download page, then PostGIS 3.6.2 from the PostGIS Windows bundle/StackBuilder for PostgreSQL 14–18. PostgreSQL.org describes the Windows installer as the EDB distribution and tested on Windows Server 2019/2022; the PostGIS Windows documentation lists the current 3.6.2 bundle and EDB/StackBuilder workflow. Confirm the exact package and supported host at install time.

A WSL route is also possible: after explicit approval to start Ubuntu, inspect distro release and package availability, then use Ubuntu packages or the PostgreSQL Global Development Group APT repository for PostgreSQL 17 and matching PostGIS packages. D6 did not start WSL or make package changes.

## Isolation and cost estimate

- Estimated software/license cost: $0 for the documented community distributions; no paid cloud service is required.
- Installer download footprint is not specified here. Reserve roughly 5 GiB of scratch space as a planning estimate and check actual download sizes before approval. Current free space is approximately 13.67 GiB.
- Installation requires administrator permission on Windows or package-management privileges within WSL. Keep data under a dedicated D6-only data directory, use a dedicated synthetic database and temporary external credentials, bind only to `127.0.0.1` on an unused port (for example 55433), and never point the instance at Supabase or campus data.
- Before installation, verify disk space, exact PostgreSQL/PostGIS package compatibility, port availability, service startup mode, and data-directory ACLs. Do not install until the owner separately authorizes the chosen path.

## Compatibility limitation

Current official Windows PostGIS packaging documents 3.6.2 for PostgreSQL 14–18. This is not an exact match for the previously recorded D4.1 PostGIS 3.6.4 rehearsal or the existing Development PostGIS 3.3.7. Do not infer that a real dump can be restored until the source extension versions, required extensions, collation/encoding, and restore behavior are checked against the target package.

## Official references

- [PostgreSQL for Windows](https://www.postgresql.org/download/windows/)
- [PostGIS Windows released versions](https://postgis.net/documentation/getting_started/install_windows/released_versions/)
- [PostgreSQL APT repository](https://wiki.postgresql.org/wiki/Apt)
- [PostgreSQL on Ubuntu](https://www.postgresql.org/download/linux/ubuntu/)
- [Microsoft WSL disk-space guidance](https://learn.microsoft.com/en-us/windows/wsl/disk-space)
