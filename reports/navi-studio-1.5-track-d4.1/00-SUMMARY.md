# Track D4.1 — Synthetic Database Recovery Proof

**Date:** 2026-10-30 (Asia/Manila)  
**Worktree:** C:\Users\Administrator\Desktop\CODEme\Navi\.navi-worktrees\navi-studio-1.5-track-a-20261027  
**Branch / HEAD:** codex/navi-studio-1.5-track-a-20261027 / bead5101fc853959f99f7aabcdba72423f48f839

## Gate

**PASS — synthetic logical dump and restore completed with matching integrity manifests.** PostgreSQL 17.11 / PostGIS 3.6.4 ran in the dedicated navi-d2-synthetic Compose project. Five synthetic tables had matching source/restore row counts and canonical MD5 checksums. The custom-format dump SHA-256 was unchanged after restore. The AES-GCM synthetic test passed.

The localhost-only mapping is configured in the container, but Docker did not activate a host port forward: docker ps showed only 5432/tcp, NetworkSettings.Ports was empty, and Test-NetConnection 127.0.0.1:55432 failed. Database checks ran with docker exec and passed. This local host-port reachability issue remains open.

## Boundaries

Only fabricated records were used. The Compose network is dedicated and internal=true; the container restart policy is no. Seven pre-existing anonymous Docker volumes were preserved. The only Docker resources added were the PostGIS image, named NAVI synthetic container, named volume, and named network. The container remains running with synthetic data.

No Supabase, Vercel, GitHub, migration, deployment, or Production operation occurred. This proof does not establish that the real Development database is recoverable. The 14,373-byte synthetic dump is a plaintext synthetic artifact; the separate AES-GCM API test is not persistent backup encryption or key-custody evidence.

See 01-DOCKER-INVENTORY.md, 02-SYNTHETIC-RESTORE.md, 03-ENCRYPTION.md, and 04-REAL-DEV-READINESS.md.

The host-side temporary credential file was removed after the run. The running test container retains its generated synthetic password in Docker container configuration; its value was not logged. The source and restore databases and the three synthetic dump staging files remain in the dedicated container; no cleanup was run.
