# Track D4 — Next Actions

1. Have an administrator review Docker Desktop's current diagnostic bundle/logs and Windows service/feature state. D4 did not establish root cause; event log filtering returned no matching warning/error records in the D3 interval.
2. If approved, run elevated \`Start-Service -Name com.docker.service\`. If it fails, stop and preserve the exact error; do not change service configuration or reset Docker/WSL.
3. Wait for readiness and verify \`docker info\`. If no Engine, stop; collect Docker Desktop diagnostics for vendor/admin review.
4. Before any NAVI resource, run \`docker ps -a\`, inspect every container including restart policy/state/ports/mounts/networks, and inventory images, volumes, networks and listeners. Stop if any conflict is ambiguous.
5. Only after a clean conflict review, execute the prepared D2 synthetic-only PostgreSQL/PostGIS proof and preserve command logs, checksums, SQL output, integrity checks, and encrypted export/restore evidence.
6. For the Ubuntu alternative, obtain authorization to start the stopped distro for read-only workload/package/service/port inspection. Do not install/start PostgreSQL or modify Ubuntu without separate approval.
7. Confirm a source archive destination and recovery approach before creating any backup archive.

No cloud or Production action is part of D4.
