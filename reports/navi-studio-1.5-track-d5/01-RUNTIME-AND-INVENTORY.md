# Track D5 — Runtime and Inventory

## Docker status

The owner-provided screenshot reports Docker Desktop's “An unexpected error occurred” dialog. The displayed startup diagnostic is:

`starting services: initializing Secrets Engine: listening on unix://C:/Users/Administrator/AppData/Local/docker-secrets-engine/engine.sock: rename C:/Users/Administrator/AppData/Local/docker-secrets-engine/engine.sock.stale C:/Users/Administrator/AppData/Local/docker-secrets-engine/engine.sock: file cannot be accessed by the system.`

A startup was attempted under the existing Track D3 authorization, but the Linux engine named pipe was unavailable afterward. This is a startup failure; the five live inventory commands (`docker info`, `docker ps -a`, `docker images`, `docker volume ls`, `docker network ls`) could not provide a current inventory. No Docker resources were created or modified in D5. Do not treat D4.1's inventory as a live D5 inventory.

Read-only inspection found an inaccessible reparse-point socket at the reported target and an inherited parent ACL. The socket was not changed. No factory reset or diagnostic upload action was selected. Further Docker internal repair is outside this track's synthetic-resource authorization.

## Prior D4.1 baseline (historical, not current)

D4.1 recorded the dedicated synthetic container `navi-d2-synthetic-postgis17`, volume `navi-d2-synthetic-postgis17-data`, internal network `navi-d2-synthetic-isolated`, image candidate `postgis/postgis:17-3.6`, PostgreSQL 17.11 / PostGIS 3.6.4, and seven pre-existing anonymous volumes left untouched. Container-only `docker exec` and `docker cp` worked; host `127.0.0.1:55432` did not. See the D4.1 inventory report for exact evidence. None of these establishes present Docker state.

Host `psql` and `pg_restore` were not found. C: disk space had about 12.98 GiB free in the earlier D5 preflight; this is a time-stamped preflight value, not a fresh value after Docker failure.

## Conflict handling

No dedicated D5 project/container/network/volume was created because the engine was unavailable. No unrelated container or volume was stopped, removed, restarted, or modified.
