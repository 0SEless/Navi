# Source and Environment Identity

**Read-only inspection performed 2026-10-30.** Vercel environment values were not decrypted or printed. Supabase queries were limited to project/catalog/advisor metadata and aggregate database size; no campus rows, auth records, or Storage objects were read.

## Workspace identity

- Root: `C:\Users\Administrator\Desktop\CODEme\Navi\.navi-worktrees\navi-studio-1.5-track-a-20261027`
- Branch: `codex/navi-studio-1.5-track-a-20261027`
- HEAD: `bead5101fc853959f99f7aabcdba72423f48f839` (the requested original base)
- Working tree: intentionally dirty with 20 modified tracked paths and 18 untracked paths before C2. These contain Track B/C1 implementation, plans/specs, local test harnesses, scratch output, and reports. They were preserved. C2 adds only its isolated service/test, benchmark, and report directory.

## Current provider inventory

| Environment/project | Current evidence | Isolation assessment |
|---|---|---|
| Supabase `navi-development` / `scvgulusmutnzasmgysx` | `ACTIVE_HEALTHY`, `ap-northeast-1`, PostgreSQL 17.6.1; organization plan `free`; DB size 33 MB | Verified Dev database. No Production project was returned in the connected Supabase project list. |
| Supabase Production ref `oltfaepqcktrumfhadzb` | `get_project` returned permission denied; not returned by project list | Unverified; do not treat as live or accessible. |
| Vercel `navi-next` / `prj_rlnjagk0Uo5U0wwZosV1ot7ZKLNW` | `live:false`; latest deployment READY, target `production`; SSO on for non-custom domains; latest project metadata has no commit SHA | Has Production deployment metadata, but `live:false` means current live alias not established by this inspection. |
| Vercel `navi-dev-studio` / `prj_kgc9mD5PQsO0llLIMRKlUeFZe6Hq` | `live:false`; latest deployment READY, target `null`; SSO enabled. Preview-only variable names include `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_JWKS_URL`, and `NAVI_DEV_MANUAL_SAVE_AUTHORIZED` | Development project candidate exists. Actual Supabase ref/value and branch binding remain unverified because values were deliberately not read. |
| Vercel `navi-defense-green` / `prj_pe4Zl6EjJHZL2kOVg6dp1Iivmomv` | Preview-only Supabase URL/ref/key variable names listed | Mapping unresolved; values were not read. |
| Vercel `navi-floor-editor-accessor-20261008` / `prj_AmxnMrdd64c8M7sKOYLutmqLno1s` | Listed; zero project environment variables returned | No database mapping evidenced. |

The `navi-next` Preview environment contains Supabase public URL/key aliases whose Vercel comments explicitly say Preview uses the Production Supabase project for public reads. A Preview `SUPABASE_SECRET_KEY` variable also exists. This is the clearest observed cross-environment coupling. The Development project’s variable names do not prove that its values point to the Development Supabase ref.

## Source credential and route contracts

- `.env.example` requires distinct Dev values and documents `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_PROJECT_REF`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `SUPABASE_JWKS_URL`.
- Supabase client and middleware source still use `NEXT_PUBLIC_SUPABASE_ANON_KEY`; the `navi-dev-studio` Preview variable inventory showed `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` but not that alias. Publishing and graph/campus/building API routes still use `SUPABASE_SERVICE_ROLE_KEY`; the Preview inventory showed `SUPABASE_SECRET_KEY` but not that alias. Reconcile both public and server credential names before testing persistence.
- Publish uses `requireVerifiedMutationAuth`, then `assertCampusMutationAllowed`, then the server-side writer. The verified gate calls Supabase `auth.getUser()` and applies server-side admin authorization; mock auth is explicitly restricted to non-production. This route-level gate is distinct from direct PostgREST table access.
- `src/components/providers/AuthProvider.tsx` builds the callback as `${window.location.origin}/auth/callback`; `src/app/auth/callback/route.ts` redirects to a path derived from the current origin. Supabase Auth Site URL and redirect allowlist were not accessible in this inspection. Add the exact local and Dev Preview callback origins to a future reviewed configuration; do not reuse Production origins implicitly.
- `src/lib/r2.ts` uses server-only `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`, with optional `R2_REGION` (default `auto`), and issues bounded presigned panorama URLs. Vercel `navi-next` has R2 variable names in Production; `navi-dev-studio` Preview did not list R2 keys. Do not point Dev at a Production bucket.
- `.env.example` contains Cloudinary client/account/API placeholders for existing floor-plan integration. Storage, Cloudinary, and R2 are separate recovery and environment boundaries.
- `src/lib/env-safety.ts` and `e2e/support/campus-guard.mjs` hard-code `oltfaepqcktrumfhadzb` as the Production guard ref. This is a safety sentinel, not proof that the ref is currently active.
- Supabase’s [2026 breaking-change changelog](https://supabase.com/changelog?types=breaking-change) says new public tables stop being automatically exposed to the Data/GraphQL APIs on 2026-10-30, including existing projects. A future commit schema must explicitly choose a private schema or explicitly reviewed Data API exposure and least-privilege grants; do not assume `public` means API-accessible.
- The changelog also lists PostgreSQL 17.11 minor-upgrade notes for `ltree`, `pgcrypto`, `btree_gist`, and custom operators. The inspected project reports PostgreSQL 17.6.1 and has `ltree` installed; review current index/upgrade guidance before a future upgrade or restore.

## Environment-isolation matrix

| Surface | Development | Preview | Production | Required control |
|---|---|---|---|---|
| Supabase URL/ref | `scvgulusmutnzasmgysx` verified | `navi-next` explicitly described as Production public read; `navi-dev-studio` value unverified | User-supplied `oltfaepqcktrumfhadzb` inaccessible | Bind `navi-dev-studio` Preview only to Dev ref; maintain separate Production project and keys. |
| Server credential | Source expects service-role key; actual Vercel Preview key name mismatch | `SUPABASE_SECRET_KEY` exists on `navi-dev-studio`; do not read value | `navi-next` has secret-key names | Decide and document one server-only credential contract, use project-specific secrets, never `NEXT_PUBLIC_`. |
| Auth callback | Local/Dev origins must be allowlisted | Current `window.location.origin` callback | Production domain | Verify each exact callback and Site URL independently. |
| R2 / object storage | No Dev Preview variable names observed | R2 not configured by observed key names | `navi-next` Production has R2 names | Separate Dev bucket/account/credentials before any object write. |
| Publish authorization | Verified session + admin role + protected-campus gate in source | `NAVI_DEV_MANUAL_SAVE_AUTHORIZED` comment says disabled by default | Protected-campus gate remains | Keep default off; enforce authenticated administrator at server and database boundary. |

## Recommendation

Keep `navi-dev-studio` as the dedicated Development Vercel candidate and configure it to use only `scvgulusmutnzasmgysx`; do not create another project until the owner confirms this one is intended. Before writes, verify its Git branch/domain and actual Supabase ref using a controlled settings review, align the secret-key variable name with source, and provision separate Dev object storage. No Vercel settings were changed.
