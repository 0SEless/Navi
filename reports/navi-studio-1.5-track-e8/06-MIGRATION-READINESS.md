# E8 Migration Readiness

## Current state

The E8 scoped persistence schema and atomic adapter are implemented and exercised on synthetic PostgreSQL 17. The existing snapshot, graph APIs, local draft recovery, and publish adapter were not migrated. No production or real Development data was read or changed. The synthetic acceptance seeded only a unique E8 test campus through the adapter's trusted server-side bootstrap method.

The adapter commits immutable change sets, operations, dependency records, mutation receipts, current scope heads, and checkpoints in one PostgreSQL transaction. The local session retrieves campus revision and scope checksums and submits scoped mutations against a revision. A complete application data-load/import path from real Development snapshots into the new schema is not implemented.

## Required before any real Development cutover

1. Define and review a trusted campus ACL source. Current authorization deliberately denies campus roles and protected IDs.
2. Design a server-side, audited import of legacy snapshots and verify that building, floor, route, entrance, terrain, and campus-setting identities map without loss or ambiguity.
3. Add a server-owned baseline/load path and prove stale clients cannot overwrite scopes from a newer baseline.
4. Define database ownership, deployment migrations, table grants, RLS policies, service boundaries, rate limits, audit retention, backup retention, and secret rotation for the real target.
5. Obtain explicit authorization for a Development-only export and isolated restore rehearsal. The E5 synthetic proof is not a real Development backup.
6. Prove full restore, integrity checks, recovery time, and rollback without writing Production.
7. Complete browser acceptance, resolve repository typecheck/lint/test baseline issues, and obtain code/security review before any cutover proposal.

The new route must remain disabled outside local Development and must not be pointed at Supabase or Production. No cutover or deployment was performed.
