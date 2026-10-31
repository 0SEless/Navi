# NAVI Studio 1.5 — Track E5.1 Summary

**Decision: READY FOR OWNER APPROVAL**

The bounded Docker reconciliation found the same `desktop-linux` context, daemon ID, Docker Engine version, and sole container identity in both samples. `docker ps` listed no running containers; `docker ps -a` listed only the protected D2 container, exited with code 255. Docker's aggregate `docker info` counters nevertheless reported one running container in both samples. The cause is unknown. Because the container listings and daemon identity are stable and reveal no unidentified workload, this is recorded as a monitoring-counter anomaly under the E5.1 decision rule, not as a concrete resource conflict.

The D2 container, data volume, network, seven anonymous volumes, images, and existing source modifications were left untouched. The proposed E5 names are unused and loopback port `127.0.0.1:55433` was available at inspection. The cached PostgreSQL image is suitable for PostgreSQL 17 tests. The E5 network plan retains internal-network isolation and publishes only the loopback port; the host adapter will use `127.0.0.1:55433`.

The E5-only configuration is technically ready for owner approval. This is not authorization to provision, install `pg`, execute SQL, export/restore data, or clean up resources. No such operations were performed in E5.1. A synthetic E5 pass would not establish recoverability of the real Development database.

See [01-DOCKER-COUNT-RECONCILIATION.md](01-DOCKER-COUNT-RECONCILIATION.md), [02-E5-CONFIGURATION-REVIEW.md](02-E5-CONFIGURATION-REVIEW.md), and [03-FINAL-APPROVAL-PACKAGE.md](03-FINAL-APPROVAL-PACKAGE.md). Raw bounded command output and timestamps are preserved in `logs/docker-reconciliation-two-samples.log`.

## Preserved baseline

- Branch: `codex/navi-studio-1.5-track-a-20261027`
- HEAD: `bead5101fc853959f99f7aabcdba72423f48f839`
- Existing dirty worktree: 93 status lines before these reports; preserved.
- `git diff --check`: passed before report creation.
- Verified D6 archive SHA-256: `dc9327641f30c0b498f327d84075cccba7679f2ab2b7926f98ef77b5d33e0c8e`.
