# Supabase Environment Identity

## Determination

The candidate Development project reference is **`scvgulusmutnzasmgysx`**. The historical NAVI Production reference recorded in local safety configuration is **`oltfaepqcktrumfhadzb`**. These references are different. The candidate project is titled `navi-development`, is in `ap-northeast-1`, is active, and reports PostgreSQL `17.6.1.166` (major 17).

The Supabase dashboard's `PRODUCTION` label was shown on the candidate project's `main` branch. It identifies that project's primary branch designation; it does not make its project ref equal to the separate historical NAVI Production ref. Project name and branch label were not used as the only identity evidence.

## Vercel mapping (read-only metadata)

- `navi-dev-studio` Preview has `SUPABASE_PROJECT_REF=scvgulusmutnzasmgysx`, matching the candidate Development ref. No Development-target environment variables were present for this project; the observed mapping is Preview only.
- `navi-next` Preview has public Supabase URL `https://oltfaepqcktrumfhadzb.supabase.co`, which points to the historical NAVI Production ref. This is a Preview-to-Production misconfiguration. It was not changed.
- `navi-next` Production Supabase variables are marked sensitive. Their values were not decrypted or exposed, so the exact Production mapping remains independently unverified.

Local `.env.local` and `.vercel` link metadata were absent. `.env.example` contains placeholders. Relevant variable names include Supabase URL, project ref, and JWKS URL names; no local secret values were recorded.

## Gate assessment

The exact candidate ref is independently distinct from the historical live Production ref and matches `navi-dev-studio` Preview metadata. This resolves the project-reference question sufficiently to prepare a Development backup plan, but it does not authorize an export. The dashboard's branch badge and the `navi-next` Preview target require owner awareness. No campus rows were read, and no Supabase database operation was performed.
