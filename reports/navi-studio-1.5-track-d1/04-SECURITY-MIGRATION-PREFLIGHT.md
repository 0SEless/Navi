# Security SQL and Executable Verification Preflight

See `sql/01-security-repair-proposal.sql`, `sql/02-security-rollback-proposal.sql`, and `sql/03-security-postflight-readonly.sql`. These are local artifacts only; **none was sent to Supabase**.

## Baseline

Development `published_maps` has RLS enabled but permissive authenticated INSERT/UPDATE/DELETE policies and broad ACLs. Public SELECT is intentional. The server publish route performs verified-user/admin and protected-campus checks, but direct PostgREST writes bypass that route. `published_maps_id_seq` has broad client privileges. `spatial_ref_sys` is PostGIS-owned by `supabase_admin`, extension-dependent, and has RLS off plus client DML grants. Its RLS linter alert is not a reason to enable RLS blindly. Preserve public metadata reads and test PostGIS behavior.

## Repair proposal

In a transaction: keep `published_maps` SELECT, remove the three authenticated write policies, revoke client table DML and sequence privileges for `anon` and `authenticated`, keep `service_role` server writes. Revoke `anon`/`authenticated` DML on `spatial_ref_sys`, preserve its read path, and do not alter ownership, schema, extension placement, or RLS. Exact statements and inverse rollback are in the SQL files.

## Verification gate

The postflight script is SELECT-only and checks RLS, policy absence/presence, effective privileges, extension ownership, and `ST_Transform`. Execute only after separate change approval, against a disposable verified Development restore. It checks catalog state and basic PostGIS operation; it does not replace API tests using anonymous, ordinary authenticated, and verified-admin sessions. Test public artifact reads, direct DML denial, authorized server publishing, protected-campus denial, and PostGIS upgrade behavior before any shared Dev change.

One manual rollback of `published_maps` recreates broad authenticated write policies and grants; this deliberately lowers security and requires renewed security-owner approval. `spatial_ref_sys` rollback restores prior client grants. No SQL, policy, grant, or schema change has occurred.
