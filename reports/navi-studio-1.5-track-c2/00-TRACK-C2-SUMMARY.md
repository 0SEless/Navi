# NAVI Studio 1.5 — Track C2 Summary

**Date:** 2026-10-30 (Asia/Manila)  
**Workspace:** `C:\Users\Administrator\Desktop\CODEme\Navi\.navi-worktrees\navi-studio-1.5-track-a-20261027`  
**Branch / HEAD:** `codex/navi-studio-1.5-track-a-20261027` / `bead5101fc853959f99f7aabcdba72423f48f839`

## Result: PARTIAL — preparation complete, cloud gates remain

The named worktree and base commit were verified. Existing Track B/C1 changes and reports were preserved. Track C2 adds an isolated, checksum-backed scoped-save contract model, 12 mock-store contract tests, a reproducible synthetic revision benchmark, and the requested ten reports. No cloud write, migration, backup export, restore, deployment, publish, or campus-data change was performed.

The focused contract suite passed: **1 file, 12 tests**. Full TypeScript remains nonzero at **1,128 diagnostics**, matching the prior C1 count after two temporary C2 test narrowing errors were corrected. No broad refactor was attempted. The current Dev project is Supabase Free, so the provider’s documented downloadable daily backup capability is unavailable; no existing export/restore evidence was found. The previous Production Supabase ref cannot be verified through the connected account.

## Principal findings

- Vercel lists four NAVI projects. `navi-next` Preview has explicit metadata describing Production Supabase access. `navi-dev-studio` exists and has Preview-only Supabase environment-variable names, but its values were not read. Its latest deployment is READY with no target reported; it is a candidate Dev project, not verified as isolated.
- `navi-dev-studio` exposes `SUPABASE_SECRET_KEY` as a Preview variable name; publishing routes in source still expect `SUPABASE_SERVICE_ROLE_KEY`. Values were not read. R2 variable names exist on `navi-next` Production; none were listed for `navi-dev-studio` Preview.
- Development `published_maps` permits authenticated direct writes under broad policies. Preserve SELECT and route writes through the verified-admin server path; exact SQL proposal is in report 03.
- `spatial_ref_sys` is owned by `supabase_admin`, is PostGIS extension-managed, has RLS disabled, and grants broad table privileges to `anon` and `authenticated`. The proposal revokes client DML while retaining reads; it does not blindly enable RLS on an extension-owned table.
- Scoped saves use an immutable candidate and campus-wide compare-and-swap revision. Building, routing, terrain, and campus settings are typed scopes, but remain within one campus transaction boundary until dependencies are proven safe.
- Synthetic local benchmark: 492,093-byte full-campus revision; 33,195-byte building operation; 145-byte checkpoint envelope; 38.882 ms median reconstruction for a full checkpoint plus 100 checksum-validated operations; two extra building dependencies add 413 bytes. See report 05 and `scripts/benchmark-scoped-revisions.mjs`.

## Evidence and gates

| Gate | Result |
|---|---|
| Correct workspace, branch, HEAD, and preserved dirty state | PASS |
| Provider identity / Production mapping | PARTIAL; Development verified, Production ref inaccessible, Preview-to-Production mapping exposed |
| Backup and full-project recovery | NOT READY; Free plan, no backup evidence, object/Auth/config recovery incomplete |
| Security correction | PREPARED ONLY; SQL is not applied |
| Scoped save / revision contract | PREPARED; mock model only, no cloud API or schema implementation |
| Required mock contract cases | PASS, 12/12 |
| Current TypeScript | FAIL overall, 1,128 existing diagnostics |
| Deployment / cloud mutation / backup export / restore | NOT performed |

See reports 01–09 for source evidence, provider limits, proposals, test results, and exact approvals. Final gate: **do not enable real scoped cloud saves until environment isolation, key contract, security correction, and server-side atomic store are reviewed and approved.**
