# NAVI Studio 1.5 — Track E5 Specification

## Goal

Prove the scoped persistence schema, PostgreSQL adapter, transaction behavior, and dump/restore flow against an isolated synthetic PostgreSQL 17 database without connecting to Supabase or using campus data.

## Success criteria

1. The source backup, worktree, existing dirty state, and local Docker/PostgreSQL inventory are recorded before changes.
2. A dedicated loopback PostgreSQL 17 target is positively identified as synthetic before any migration SQL runs.
3. The real migration and adapter pass integrity, authorization, concurrency, replay, reconstruction, and restore checks against synthetic records.
4. Existing application behavior and the E1–E4 work remain intact.
5. SQL execution, service startup, and resource provisioning happen only after the owner reviews the exact approval package and authorizes those actions.

## Boundaries

- No Supabase Development/Production connection, real campus data, production route wiring, deployment, push, or merge.
- No Docker/WSL startup, installation, database provisioning, or SQL execution before the approval boundary is satisfied.
- Never modify or clean unrelated containers, databases, volumes, or networks.
- Preserve all existing worktree changes and the D6 source archive.
- Keep local synthetic credentials outside the repository and out of logs.

## Known pitfalls

- E4 Graphify query results are stale and cross-link unrelated older safety nodes; use direct sources after recording this limitation.
- The E4 synthetic SQL seed contains invalid non-hex checksum sentinels that conflict with the migration's SHA-256 check constraints.
- The E4 harness checks loopback, database/role names, server version, and absence of Supabase roles, but does not yet positively mark the target database as dedicated synthetic infrastructure.
- Full TypeScript currently has an established 1,128-diagnostic baseline; compare, do not claim globally green.
- Read `errors/ERRORS.md` before code changes and test local harness changes without connecting to PostgreSQL.
