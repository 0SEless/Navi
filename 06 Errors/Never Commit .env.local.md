# Never Commit .env.local

**Date:** 2026-06-20
**Severity:** Critical

The `.env.local` file in `navi-next/` contains real Supabase production credentials:

- Project URL (`oltfaepqcktrumfhadzb.supabase.co`)
- Anon/public key
- Service role / secret keys
- JWKS URL

This file is listed in `.gitignore` (line 34: `.env*`) but must **NEVER** be force-added or committed. Doing so would expose database secrets, allowing unauthorized read/write access to the production database.

**Status:** The file is already gitignored — just never override it with `git add --force` or similar.

## Related

- [[Known Issues and Risks]]
- [[TODO]]
- `navi-next/.env.local` (do not commit)
- `navi-next/.gitignore`
