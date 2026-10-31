# Synthetic Security Rehearsal

The local SQL fixtures represent the minimum `published_maps` client-read/server-write boundary and generic PostGIS behavior. They do **not** mirror all live Supabase roles, policies, extensions, Auth, API, or control plane. No live Development SQL was applied.

## When runtime is approved

The prepared synthetic fixture will:

- Create roles named `anon`, `authenticated`, and `service_role` only inside the dedicated local database instance; enable RLS on a synthetic artifact table.
- Grant `anon` and `authenticated` SELECT and preserve a public-read policy.
- Leave authenticated client DML ungranted and verify it fails; grant trusted local `service_role` DML and verify insertion succeeds.
- Verify PostGIS extension creation, geometry/geography operations and EPSG:4326→3857 `ST_Transform`.
- Verify a composite FK rejects a mismatched campus key and a rolled-back transaction leaves no row.
- Export/restore synthetic rows and compare their count and checksum.

The test does not claim to prove that the live `spatial_ref_sys` ownership and extension upgrades are compatible with the D1 ACL proposal. It also does not validate Supabase JWT/RLS behavior, `auth.getUser()`, service-role route behavior, protected-campus policy, or Admin authorization. Those require a separately approved isolated Supabase rehearsal after real Dev identity is verified.

**Result:** NOT RUN because the Docker engine could not be safely started and no other local PostgreSQL runtime exists. Detailed next steps are in `08-APPROVAL-GATES.md`.
