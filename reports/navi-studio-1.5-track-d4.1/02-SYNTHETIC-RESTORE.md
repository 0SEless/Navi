# Track D4.1 — Synthetic Proof and Restore

## Runtime

- Image: postgis/postgis:17-3.6
- PostgreSQL: **17.11** (Debian 17.11-1.pgdg13+2)
- PostGIS: **3.6.4**, extension enabled; GEOS 3.14.1; PROJ 9.8.1.
- Container health check: healthy; pg_isready reports accepting connections.
- PostgreSQL connectivity via docker exec psql: PASS.

## Synthetic checks

| Check | Result |
|---|---|
| PostGIS extension/version | PASS — postgis_full_version() returned 3.6.4 |
| Coordinate transform | PASS — EPSG:4326 point (121,14) transformed to SRID 3857 at (13469658.39, 1574216.55) |
| Geometry/geography | PASS — 25 m geography buffer returned ST_Polygon, area > 0 |
| Public anon read | PASS — 2 fabricated artifacts visible |
| Authenticated direct INSERT/UPDATE/DELETE | PASS — all three denied by table privileges |
| RLS enforcement | PASS — after a transaction-local INSERT grant, authenticated INSERT failed with new row violates row-level security policy; failed connection rolled back the grant |
| RLS/privileges metadata | PASS — t|t|t|f|t|t: RLS enabled; anon SELECT; authenticated SELECT; authenticated INSERT denied; service_role BYPASSRLS; service_role INSERT |
| Trusted service role write | PASS — one synthetic row inserted |
| Composite campus/commit foreign key | PASS — mismatched campus rejected with FK violation |
| Transaction rollback | PASS — artifact count remained 3 before and after rollback-only insert |

## Logical dump and restore

Custom-format logical dump created at:

C:\Users\Administrator\Documents\Codex\NAVI-Track-D2-Recovery\backups\synthetic-d4.1-ceb23469c0874825994c3d92b1c39f8c.dump

- Size: 14,373 bytes.
- SHA-256 before restore: 8c899e509aaa696a2dddaea373e660199fb03ab5e45639bfd4318e49a090c1c2.
- SHA-256 after restore: same.
- Restore database: navi_restore_ceb23469c0.
- Restore command: pg_restore --no-owner --exit-on-error into a newly created empty database on the isolated synthetic PostgreSQL instance.
- PostgreSQL and PostGIS versions matched between source and restored database.

| Table | Source rows | Restored rows | Canonical MD5 (both) |
|---|---:|---:|---|
| synthetic_campuses | 1 | 1 | dbdbb3aad4224e789839515c92f2337c |
| synthetic_buildings | 1 | 1 | 0af848e5090239bbb93ec65c84cac194 |
| synthetic_commits | 1 | 1 | 2216617c020f3651cb8a02766989d3fa |
| synthetic_change_sets | 1 | 1 | 14c5d05bbddef07caf3d19d503c1a5f1 |
| synthetic_published_artifacts | 3 | 3 | efda90031eb01dd77f720a9208731055 |

**Synthetic recovery gate: PASS.** These results cover only fabricated local data.
