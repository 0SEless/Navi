# Vercel Development Isolation

**Read-only inspection, 2026-10-30.** No variable values were decrypted or displayed.

## Project evidence

| Item | `navi-dev-studio` | `navi-next` |
|---|---|---|
| Project ID | `prj_kgc9mD5PQsO0llLIMRKlUeFZe6Hq` | `prj_rlnjagk0Uo5U0wwZosV1ot7ZKLNW` |
| Team | `NAVI` / `navi01` (Hobby) | same |
| Latest deployment | READY; CLI source; `target=null`; no Git SHA/branch metadata | READY; Production target |
| Git linkage | Not listed in linked Git projects; no branch association verified | linked team Git context says GitHub `0SEless/Navi` |
| Production status | `live=false`; SSO enabled except custom domains | `live=false` in project metadata |

The Dev project exists by known ID, but a project search by `navi-dev-studio` returned no match. Treat the search result as an API filtering discrepancy, not evidence that the project is absent. The latest Dev deployment has empty alias metadata and no Git source, so a branch-isolated preview deployment workflow is **not verified**.

## Preview environment inventory

The project returned nine **Preview-only** variable names, with values hidden: `NAVI_DEV_MANUAL_SAVE_AUTHORIZED`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NAVI_DEV_PREVIEW_ALLOW_TYPE_ERRORS`, `NAVI_DEV_STUDIO_PROJECT_ID`, `SUPABASE_JWKS_URL`, `SUPABASE_PROJECT_REF`, `SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_URL`. No service-role or anon key names were present; no R2/Cloudinary names were present in this inventory. This is a name inventory only, not proof the endpoints or keys point to Dev.

Source examples and client/server setup use `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`; these do not match the observed Preview names. The discrepancy must be reconciled in a later approved change. No attempt was made to read actual secret values.

## Isolation conclusion and gate

Dev app-to-database isolation is **UNVERIFIED** until an authorized operator compares secret endpoint/project-ref identity against Dev ref `scvgulusmutnzasmgysx`, confirms every Preview/Development scope, and proves the deployment branch/environment maps only to this Dev project. Confirm Auth Site URL and redirect allowlist include the Dev callback (`/auth/callback`) before login testing. Never substitute Production credentials. Vercel project settings, variables, Git integration, or deployments were not changed.
