# Track D1 — Summary

**Assessment date:** 2026-10-30  
**Workspace:** `navi-studio-1.5-track-a-20261027`, branch `codex/navi-studio-1.5-track-a-20261027`, base `bead5101fc853959f99f7aabcdba72423f48f839`.

## Decision

D1 is **preflight complete; execution not authorized or ready**. No backup/export, restore, cloud write, database mutation, SQL application, Vercel setting change, deployment, or upload was performed. The Dev database identity is verified from its Supabase project ref; the Dev app’s provider isolation and Git branch linkage are not verified. The only local restore runtime found is unavailable because Docker Desktop’s Linux engine is not running and `psql` is not installed.

## Findings requiring attention

- Vercel `navi-dev-studio` is a CLI-deployed project with no Git source/branch metadata on its latest deployment, no deployment target, and no linked project entry in the team Git context. The `navi-next` project is the linked repository project. Do not assume the development project is isolated from Production.
- Supabase Dev is `scvgulusmutnzasmgysx` (`navi-development`, `ap-northeast-1`, ACTIVE_HEALTHY). Actual Dev secret values were not read. Vercel Preview variable names include `SUPABASE_URL` and `SUPABASE_PROJECT_REF`, but their values are unverified. Source expects `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`; those names are absent from the observed nine-variable Preview inventory. No Production key was used.
- Development has 19 migration-ledger entries; the latest is `020_projection_foreign_key_indexes`. Public table counts include 164 `campus_graph_revisions`, 248 `campus_graph_mutations`, 12 `graph_snapshots`, 3 `published_maps`, 450 `route_nodes`, and 469 `route_edges`. These are metadata/counts only; no row data was exported.
- `published_maps` permits broad authenticated direct writes under permissive policies. `spatial_ref_sys` is PostGIS-owned and has client DML grants with RLS off. Proposed least-privilege SQL is supplied; neither finding was changed. Do not enable RLS blindly on the extension-owned table.
- The Dev database reports 33 MB. Its Supabase Free plan does not provide the managed backup download needed for a one-click recovery path. CLI export is possible in principle, but no encrypted destination, encryption utility, or restore runtime is ready.

## Local verification

Four focused Vitest files passed: 38 tests across the scoped save contract, editor persistence service, mutation authorization, and publishing route. The runner used one thread worker and a workspace-local temporary directory to avoid the Windows cache rename failure seen previously.

## Work products

See `01`–`07` for Vercel isolation, backup, restore, security, additive schema, tests, and approvals. The SQL files are proposals and post-application read-only checks; they have not been executed.
