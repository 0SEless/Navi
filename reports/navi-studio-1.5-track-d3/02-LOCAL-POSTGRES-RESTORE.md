# Local PostgreSQL/PostGIS and Synthetic Restore

## Result: blocked before resource creation

Docker Desktop did not establish a healthy Linux Engine. No container/image/volume/network was created or pulled. No synthetic database was created, and the prepared proof script was not invoked because its documented prerequisite requires a functioning Docker daemon and collision inventory. No SQL ran.

Consequently these checks remain **NOT RUN**: PostgreSQL connectivity, PostGIS extension creation, geometry/geography, `ST_Transform`, composite FK pass/fail, RLS, role grants, transaction rollback, logical export, logical restore, row counts, and data checksum comparison. No restore pass is claimed.

The updated Compose YAML parsed successfully with `docker compose config --quiet` using placeholder-only environment values; the three PowerShell scripts passed AST parsing. These checks validate local configuration syntax only.

## Image source review

The image source is the official [PostGIS Docker repository](https://github.com/postgis/docker-postgis). Its current README warns that `*-3.5` tags are no longer updated and lists Debian `postgis/postgis:17-3.6` with PostgreSQL 17 and PostGIS 3.6.4. The pre-pull C: free-space check was 14.59 GB. In response to that source evidence, the local synthetic Compose file was updated to `postgis/postgis:17-3.6`. This aligns the PostgreSQL major version with Dev 17.6.1.166; PostGIS 3.6.4 still differs from Dev 3.3.7 and is for general synthetic testing only. No pull occurred.

## Prepared proof still ready

After the owner/administrator restores Docker Engine availability, run the existing D2 script with its required flag:

```powershell
.\scripts\track-d2-local-recovery\Invoke-SyntheticProof.ps1 -ConfirmStartSyntheticContainer
```

It checks the local daemon, free loopback port, and dedicated container/volume/network name collisions before pulling/starting. It uses fabricated fixtures only, exports only from the local synthetic container, retains the dedicated synthetic volume, and writes logs/dump outside the repo. Re-check free disk space immediately before pull. The script does not use a Supabase URL.
