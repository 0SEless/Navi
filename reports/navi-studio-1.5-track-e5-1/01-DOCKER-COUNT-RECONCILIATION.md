# Docker Count Reconciliation

## Bounded samples

Read-only inventory was captured twice, approximately 11.6 seconds apart, on 2026-10-30 UTC. Sample 1 began at `06:31:20.533Z`; sample 2 began at `06:31:32.122Z`. Each requested command exited 0 in both samples. Per-command start/end UTC timestamps and complete command output are in `logs/docker-reconciliation-two-samples.log`.

Commands in each sample:

```text
docker context show
docker context inspect desktop-linux
docker version
docker info --format '{{json .}}'
docker ps --no-trunc
docker ps -a --no-trunc
docker inspect --format '{{json .State}}' navi-d2-synthetic-postgis17
```

## Identity and count comparison

| Evidence | Sample 1 | Sample 2 |
|---|---|---|
| Active context | `desktop-linux` | `desktop-linux` |
| Docker server | `29.8.1` | `29.8.1` |
| Daemon ID | `137c7f6b-b76c-4205-90ff-b1170afc87b8` | `137c7f6b-b76c-4205-90ff-b1170afc87b8` |
| `docker info` total / running / stopped | `1 / 1 / 0` | `1 / 1 / 0` |
| Rows in `docker ps` | 0 | 0 |
| Rows in `docker ps -a` | 1 | 1 |
| Listed container | D2 ID `33f738e498240f4cd470c7fc6a391370db11d79ccaaf5af8fabb3d1f6c29ff4c` | Same ID |
| D2 state | `exited`, `Running=false`, `Pid=0`, exit 255 | Same state and timestamps |

Context inspection resolved to `npipe:////./pipe/dockerDesktopLinuxEngine`. There is no indication of a context or endpoint switch. No unidentified container appears in either listing. `docker system df` from the prior E5 read-only inventory also counted one container, consistent with the single stopped D2 container.

## Finding and safety assessment

The aggregate `docker info` running counter does not reconcile with both container listings, which consistently show zero running containers and one stopped container. The discrepancy persisted across the two samples. No transition was observed; no container identity or daemon endpoint disagreement was observed. A stale aggregate counter is possible, but the evidence does not establish that cause. **Root cause: unknown.** The D2 inspection also reports health `starting` while the container is exited; this metadata inconsistency is recorded without inferring a cause.

Under the E5.1 rule, the stable daemon identity, matching container IDs, and absence of unidentified workloads make this an aggregate monitoring anomaly rather than a concrete safety conflict. No Docker restart or resource modification was used to investigate it.

## D2 preservation evidence

- Container `navi-d2-synthetic-postgis17`, image `postgis/postgis:17-3.6`, restart policy `no`; not started or modified.
- Named volume `navi-d2-synthetic-postgis17-data` remains mounted at `/var/lib/postgresql/data`; existing PostgreSQL data directory was confirmed read-only (PG_VERSION `17`). Potential earlier synthetic fixtures may remain and were not inspected or changed.
- Network `navi-d2-synthetic-isolated` remains the D2 network; no endpoint was attached while D2 was stopped.
- Seven anonymous volumes were inspected read-only, each 0 B and unattached to any listed container; ownership remains unknown. None was removed or pruned.

## E5 conflict checks

At the bounded check, `navi-e5-postgres17`, `navi-e5-postgres17-data`, and `navi-e5-postgres17-net` were unused. No listener was found on `127.0.0.1:55433`. D2's stopped container configuration reserves `127.0.0.1:55432`; E5 uses 55433 to preserve D2 restartability. Docker reported 6.72 GiB memory and prior disk inspection reported 11.34 GiB free on C:. No unexpected resource changes were identified.
