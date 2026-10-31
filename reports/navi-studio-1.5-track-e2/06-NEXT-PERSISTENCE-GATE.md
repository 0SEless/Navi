# Track E2 — Next Persistence Gate

## What E2 establishes

The local browser gate now demonstrates the editor behavior with scoped history both disabled and enabled. The existing IndexedDB draft recovers edited synthetic content across reload and browser process restart. The enabled scoped-history endpoint accepts locally validated building/routing history, distinguishes local validation from cloud confirmation, retries exact mutations, and resets with a new in-memory session.

## What remains before a real Development backup/restore

E2 does **not** establish that the real Development database or campus data can be recovered. The scoped-history runtime is deliberately in memory. The only cloud save in E2 is an intercepted `/api/graph` mock; there was no Supabase access, export, or write.

Before a real Development backup rehearsal, the project still needs:

1. An explicitly authorized and verified Development source plus isolated restore target, with owner-approved access and identity checks.
2. A supported PostgreSQL/PostGIS recovery runtime with source/target version compatibility. Track D6 did not establish an available working local database engine.
3. A reviewed export/restore runbook covering encryption key custody, retention, integrity, rollback and cleanup.
4. A separately authorized real Development export/restore rehearsal verifying extensions and versions, row counts and checksums, foreign keys/sequences, privileges/RLS, and application reads.
5. A durable scoped-history storage contract and transaction implementation before any production persistence change.

No migration, Production operation, deployment or external cloud action is authorized or implied by this local acceptance. E2 is complete for its synthetic browser/persistence-integration gate; real Development recovery remains an independent gate.
