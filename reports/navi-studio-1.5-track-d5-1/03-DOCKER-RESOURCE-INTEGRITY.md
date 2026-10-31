# Track D5.1 — Docker Resource Integrity

## Current verification limit

The Engine named pipe is missing. `docker info` cannot connect, so D5.1 could not run a current `docker ps -a`, `docker images`, `docker volume ls`, or `docker network ls` inventory. The NAVI synthetic container, its volume/network, health state, and the historical seven unrelated anonymous volumes cannot be verified in this run.

## Historical D4.1 state (not a live D5.1 inventory)

D4.1 recorded:

- Container: `navi-d2-synthetic-postgis17`
- Volume: `navi-d2-synthetic-postgis17-data`
- Network: `navi-d2-synthetic-isolated`
- Image: `postgis/postgis:17-3.6`
- PostgreSQL 17.11 / PostGIS 3.6.4
- Seven pre-existing anonymous volumes preserved
- Synthetic container restart policy: `no`

D4.1 recorded successful synthetic dump/restore and matching integrity manifests. D5.1 did not recreate these resources or claim they remain healthy now.

## Preservation statement

No Docker resource deletion, prune, volume operation, WSL reset, or repository cleanup occurred. Docker Desktop failed before Engine access became available; the startup attempt did not modify Docker resources. Current integrity must be rechecked with the live inventory after the Engine is recovered.
