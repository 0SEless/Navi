# Local PostgreSQL/PostGIS Runtime

## State

Runtime is **prepared, not operational**. Docker is installed, but the service is stopped and the Linux engine socket is missing. WSL2 distributions are stopped. PostgreSQL binaries are absent. No container, image, volume, or native PostgreSQL service was created, started, removed, or changed.

## Prepared target

`scripts/track-d2-local-recovery/compose.yaml` defines one disposable synthetic DB:

- Official upstream image tag `postgis/postgis:17-3.5` (PostgreSQL 17 / PostGIS 3.5.2 in the upstream Debian build), not `latest`.
- Container `navi-d2-synthetic-postgis17`; dedicated volume `navi-d2-synthetic-postgis17-data`.
- Host bind `127.0.0.1:55432:5432`; dedicated internal network; restart disabled. The proof script refuses existing container, volume, or network name collisions.
- Synthetic DB/user names only. Strong random password generated into an external, ACL-restricted local env file only after elevated BitLocker status confirms encryption and the operator confirms separate recovery-key custody.
- The test image PostGIS 3.5.2 differs from the observed Dev PostGIS 3.3.7. It can validate general PostGIS behavior and SQL semantics; it cannot establish exact extension-version compatibility. Current Dev PostgreSQL is 17.6.1.166, so the major version aligns.

The official PostGIS image repository documents the PostgreSQL 17 / PostGIS tags and exact versions in its [version table](https://github.com/postgis/docker-postgis#versions). The image was not pulled and its digest is not recorded.

## Startup gate

Before `docker desktop start`, confirm existing Docker projects may resume, or have an administrator inventory the offline engine state first. After the engine starts, the proof script refuses collisions with the dedicated container or volume. Do not prune, reset, or delete other Docker data. See `08-APPROVAL-GATES.md`.
