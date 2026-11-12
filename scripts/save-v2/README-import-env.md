# Save v2 import settings (`.env.import.local`)

The worktree root keeps a local settings file, **`.env.import.local`**, on purpose, so the database connection can be reused without fetching it again (owner decision, 2026-11-12).

- **What it holds:** `NAVI_STUDIO_DATABASE_URL`, the **Transaction pooler** URI of the Save v2 Supabase project `navi-studio-v2` (`ztbnicoiwjghzttchqmp`), including the database password.
- **Why it's kept:** Vercel stores this value as "sensitive" (write-only). It cannot be read back, so the copy in this file is the reusable one.
- **Safety:** git ignores the file (`.gitignore`: `.env*`). Never commit it, paste it into chat or logs, or copy it into another file.
- **If the database password changes:** update this file and the `NAVI_STUDIO_DATABASE_URL` preview setting on the Vercel project `navi-next` together. Otherwise the Save v2 preview stops saving.

## Using it

From the worktree root, in bash:

```bash
. scripts/save-v2/load-import-env.sh
```

It sets these variables and prints only yes/no checks, never values:

| Variable | Value |
|---|---|
| `NAVI_STUDIO_DATABASE_URL` | read from `.env.import.local` |
| `NAVI_STUDIO_ALLOWED_DB_REF` | `ztbnicoiwjghzttchqmp` |
| `NAVI_OLD_SUPABASE_URL`, `NAVI_OLD_SUPABASE_SERVICE_KEY` | read from `../../navi-next/.env.development.local` (old `navi-development` project, select only) |

Then run any Save v2 script that needs the database. For example, the one-time old-map import:

```bash
npx tsx scripts/save-v2/import-old-map.ts export | dry-run | apply --actor <owner user id>
```

## What it was used for

**2026-11-12:** imported the old map `map-map-1-repe` plus the trial campus terrain into the new campus **ASU-IBAJAY** (`map-asu-ibajay`, commit 1, 151 parts). See:

- spec: `docs/superpowers/specs/2026-11-12-navi-old-map-import-with-trial-terrain.md`
- plan: `docs/superpowers/plans/2026-11-12-navi-old-map-import-with-trial-terrain.md`

The exported data is in `scripts/save-v2/import-data/`, which is git-ignored and kept as a record of exactly what was imported.
