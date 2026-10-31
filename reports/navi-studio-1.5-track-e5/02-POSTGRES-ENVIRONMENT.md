# PostgreSQL Environment — Inventory Only

Docker Engine 29.8.1 is accessible to the elevated read-only inspection process. No PostgreSQL instance was started or provisioned by this E5 continuation.

The sole row in `docker ps -a` is the protected `navi-d2-synthetic-postgis17` container, `Exited (255)`, restart policy `no`. `docker ps` is empty. `docker info` nevertheless reports one running container and zero stopped containers. The counts remain inconsistent on a repeated query; this is the current readiness blocker.

The D2 container's named volume `navi-d2-synthetic-postgis17-data` is mounted at `/var/lib/postgresql/data`, reports 132.7 MB, and has Compose labels identifying the D2 project. A read-only copy of `PG_VERSION` confirmed major version `17`. Its prior synthetic SQL fixture contents were not queried and may still be present. The D2 volume, container, and internal network were left untouched.

Seven anonymous volumes were listed and inspected. Each has only Docker's anonymous-volume label, reports 0 B, and is unattached to every listed container. Their ownership is unknown; none was removed.

The preloaded image `postgres:17-alpine` is PostgreSQL 17.11, Linux amd64, 403.6 MiB by image metadata (423.8 MB in Docker disk accounting), digest `postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`. It is suitable for the E5 synthetic database; no pull is proposed. The E4 PowerShell runner currently requires host PostgreSQL clients, which are absent. The approval plan is to adapt it to call matching PostgreSQL 17 tools from inside the new E5 container.

No listener exists on 55432 or 55433. The D2 container configuration reserves 127.0.0.1:55432 for a future D2 restart, so E5 proposes loopback-only port 55433. E5 container, volume, and network names are currently available. C: has 11.34 GiB free. Docker image, volume, and container sizes are recorded in `01-PREFLIGHT-AND-APPROVAL.md`.
