# Synthetic Restore Test

## Result

**NOT RUN — Docker daemon unavailable.** No PostgreSQL/PostGIS database was started, no SQL was executed, and no dump/restore pass is claimed. The tests below are synthetic-only and executable after the local runtime gate is cleared.

## Prepared proof

`scripts/track-d2-local-recovery/Invoke-SyntheticProof.ps1` is designed to:

1. Confirm Docker responds, port 55432 is unused, and the exact dedicated container/volume/network do not already exist.
2. Pull the pinned-by-version official PostGIS image, start only the prepared local Compose project, and wait for health.
3. Create PostGIS and synthetic `anon`, `authenticated`, and `service_role` roles; seed fabricated campus/building/artifact rows; check geometry/geography operations, `ST_Transform`, composite foreign keys, RLS, grants, trusted role writes, and transaction rollback.
4. Produce a custom-format logical dump from the synthetic container only, copy it to the external synthetic backups directory, verify SHA-256, restore into a uniquely named empty local DB, and compare deterministic row-count/checksum values.
5. Save output to an external log path. It contains no real NAVI or Supabase records. Dedicated Docker volume is retained; the script never prunes or removes volumes.

SQL setup/proof sources are adjacent under `synthetic/`. Expected fixture values and check assertions are documented in the script. `docker inspect`, `docker ps`, SQL results, dump checksum, restored counts, and test outcomes will only exist after the script runs. The synthetic dump will be unencrypted fabricated data and remains outside the repository.

## Local app contract test

Executed command:

```powershell
$env:TEMP = (Resolve-Path .tmp-vitest\trackd2-temp).Path
$env:TMP = $env:TEMP
npx vitest run src/services/scoped-campus-save.test.ts --reporter=dot --pool=threads --maxWorkers=1
```

Result: exit 0; 1 file passed, 12 tests passed. Temporary cache was removed after the run.

The synthetic crypto check also passed using the Windows-hosted .NET AES-GCM API: fabricated text was encrypted to a temporary ciphertext, decrypted in-process, and matched by SHA-256 (`f380eb580580e527ead1d6f5917ac351391249224da2dec5d2b2c86a636fc7d4`). The ephemeral test key was held only in memory and cleared; ciphertext was removed. This does not encrypt a DB dump or verify recoverable key custody.

All three PowerShell scripts passed PowerShell AST parsing. Docker Compose parsed the local YAML with placeholder-only environment values (`docker compose -f scripts\track-d2-local-recovery\compose.yaml config --quiet`). Those checks do not execute container SQL.
