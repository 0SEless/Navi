# Track E5 — Docker Inventory and Approval Readiness

## Status

**BLOCKED: Docker inventory is internally inconsistent.** `docker info` reports one running container, but `docker ps` is empty, while `docker ps -a` and `docker system df` show only the protected D2 container in `Exited (255)` state. Do not provision until this discrepancy is reconciled. No E5 resource was created and no SQL was run.

## Findings

- The protected D2 container, volume, and network were inspected without starting or modifying them. Its named PostgreSQL 17 data volume is 132.7 MB and `PG_VERSION` is 17. Existing fixture contents may remain; they were not examined.
- Seven anonymous volumes have only Docker's `com.docker.volume.anonymous` label, are unattached to listed containers, and have unknown ownership. None was deleted.
- E5 container/volume/network names are unused. Host port 55432 has no current listener but is configured for the stopped D2 container; use free port 55433 for E5 to preserve D2 restartability.
- The preloaded `postgres:17-alpine` image is PostgreSQL 17.11 (image digest recorded in `01-PREFLIGHT-AND-APPROVAL.md`), so no image pull is needed. Host `psql`, `pg_dump`, `pg_restore`, and Node `pg` are absent. The SQL harness must use matching client tools in the E5 container or receive a separately approved client-tool setup.
- E4 harness source checks now validate hex checksum fixtures and require the E5 database owner plus marker. Real PostgreSQL behavior remains unverified.

## E5 gate status

| Gate | Status |
| --- | --- |
| Preflight | **BLOCKED** — `docker info` count disagrees with container listings |
| Real SQL ACID | **NOT RUN** |
| Real TypeScript adapter | **NOT RUN** |
| Synthetic dump/restore | **NOT RUN** |
| Existing application regression | **PASS** — 12 files / 120 tests |
| Real Development recoverability | **UNVERIFIED** |

The conflict-free proposed E5 resources and exact approval scope are in `01-PREFLIGHT-AND-APPROVAL.md`. Wait for Docker count reconciliation and explicit owner approval before provisioning.
