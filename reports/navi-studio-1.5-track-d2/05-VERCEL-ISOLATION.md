# Vercel Isolation Verification

## Fresh read-only results

The team context still identifies Vercel team `NAVI` (`navi01`, Hobby) and only one linked Git project: `navi-next` → GitHub `0SEless/Navi`. The expected Dev project is `navi-dev-studio` / `prj_kgc9mD5PQsO0llLIMRKlUeFZe6Hq`.

Fresh read-only calls using both the known project ID and project name returned Vercel API `404 not_found` for project metadata and environment metadata. The deployment list call returned `403 forbidden`. These are current access/visibility results, not proof the project was deleted. Since D1, the earlier successful ID-based read cannot be reproduced in this tool context. No automatic CLI fallback was run because it could use a different local credential/team context. No variable value was requested, decrypted, printed, or stored.

D1 recorded a CLI-sourced latest deployment without Git SHA/branch metadata or deployment target, and nine Preview variable names, but those details are not freshly verifiable today. Mark the current exact project state and scopes **UNVERIFIED**. Do not infer a credential target from names.

## Owner-operated checklist

1. In Vercel dashboard, select team `NAVI` and verify exact project ID (not name alone), linked repository, production branch, and the Dev deployment's Git SHA/branch/target.
2. Inspect variable metadata only for Development/Preview scopes. In the dashboard’s secure view, compare `SUPABASE_URL` host and `SUPABASE_PROJECT_REF` to Dev ref `scvgulusmutnzasmgysx`. Do not paste values into chat or reports.
3. Confirm server-only Supabase service key maps to Dev and never enters `NEXT_PUBLIC_*` or client bundles. Reconcile source-required `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` with deployed variable names. Never use Production credentials.
4. Verify Auth Site URL and allowed redirect includes the exact Dev origin and `/auth/callback`; verify Preview deployments are included only if intended.
5. Verify storage providers and credentials are Development-only, or document that no provider is configured. D1 saw no R2/Cloudinary names in the Dev Preview inventory, but this fresh turn could not re-read it.
6. Record only project ref, variable name, environment scope, and pass/fail. Leave values secret. No Vercel configuration was modified.
