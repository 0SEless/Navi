# Real Development Backup Procedure (Not Executed)

**Hard stop:** no real Development export or restore was performed. Do not proceed until a verified local restore runtime, approved encrypted target, approved key custody, and secure Dev connection target are all available.

## Preconditions and project-ref guard

1. Obtain approval for a read-only logical export from Supabase project `scvgulusmutnzasmgysx`, project name `navi-development`, region `ap-northeast-1`. Never use Production ref `oltfaepqcktrumfhadzb`, any Production credential, or Vercel Production variable.
2. Retrieve a direct database URL from an owner-managed secret manager. Before invoking dump, independently verify its hostname/project identity maps to Dev ref `scvgulusmutnzasmgysx`; reject any mismatch. Do not put credentials in command history, shell arguments, logs, or reports. Use a secure environment injection method and a credential with minimum required read access.
3. Export only PostgreSQL logical database content. Supabase logical dump does not back up Storage object bytes, Auth provider/site settings, Edge Function secrets, Realtime/control-plane configuration, or external R2/Cloudinary objects. Current Dev inventory had no Supabase Storage buckets/objects; that does not prove external stores are empty.
4. Choose an encrypted workspace and keep plaintext there only for the shortest practical time. Export separate roles, schema, and data files with Supabase CLI 2.111.0 syntax confirmed in D1. Run exports only after permission; no command below was executed:

```powershell
supabase db dump --db-url $env:NAVI_DEV_DATABASE_URL --role-only --file .\roles.sql
supabase db dump --db-url $env:NAVI_DEV_DATABASE_URL --file .\schema.sql
supabase db dump --db-url $env:NAVI_DEV_DATABASE_URL --data-only --use-copy --file .\data.sql
```

5. Capture project ref, CLI/pg_dump versions, UTC time, exit codes, file sizes, and SHA-256. Encrypt each dump using the approved tool and separately escrow the key. Verify encrypted hashes and a decryption/readability round-trip. Do not put plaintext dumps in the repository or unencrypted Documents path.
6. Restore only into the synthetic-tested isolated local runtime or a separately approved disposable Supabase project. Use PostgreSQL 17 tools, `ON_ERROR_STOP`, an empty target, and never overwrite Dev/Production. Recheck restore target identity immediately before connecting. Re-run counts, FK, schema, policy, and PostGIS checks.
7. The 33 MB reported Dev DB suggests a compressed logical artifact will likely be modest, but actual size is unknown until a permitted dump. Reserve at least 1 GB for encrypted artifacts, restore data, logs, and temporary plaintext; current C: has 12.8 GB free. Do not auto-delete the last verified backup. Retention and cleanup must be owner-approved.

No real credential value, connection string, row, or campus artifact was accessed for this procedure.
