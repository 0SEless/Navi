# NAVI Studio 1.5 — Track E3 Specification

## Goal

Implement a disconnected PostgreSQL persistence foundation for the E1/E2 scoped-save contract. The new adapter, additive schema proposal, rollback proposal, and simulated transaction tests must not alter live routes, Supabase projects, existing migrations, or the published campus format.

## Success criteria

1. Add a private, additive PostgreSQL schema for campus heads, scoped documents, immutable change sets/dependencies, idempotency receipts, and periodic checkpoints.
2. Implement a server-only adapter for `ScopedBatchCommitStore` with parameterized SQL, trusted authorization injection, campus transaction locking, exact retries, checksums, atomic batches, rollback, and bounded timeouts.
3. Verify transaction order, parameter binding, rollback, conflicts, idempotency, concurrency contract, checkpointing and reconstruction with controlled fakes, explicitly labeled simulated rather than real PostgreSQL tests.
4. Measure whole-campus versus building/routing/terrain scoped payloads and checkpoint/reconstruction tradeoffs with deterministic synthetic documents.
5. Keep the adapter disconnected from Supabase credentials, `/api/graph`, the E2 dev endpoint, and production defaults; preserve IndexedDB and publish behavior.

## Boundaries

- Do not execute the proposed migration or connect to any database.
- Do not install packages. Inject the pool/query interface.
- Do not modify existing migrations or legacy graph tables.
- Treat `actorId` as trusted server identity only when supplied by a server authorization callback; no client role claim authorizes writes.
- Keep all extension-owned PostGIS objects out of scope. Store scoped JSONB and require no extension changes.
- Real PostgreSQL ACID behavior and real Development backup/restore remain pending.

## Known pitfalls

- Recheck mutation receipts inside the transaction before rejecting a stale expected revision so exact lost-ack retries replay.
- Revalidate checksums, dependencies and campus CAS after acquiring the cross-process lock.
- Make every batch write, receipt, history row, head update and checkpoint part of the same transaction.
- Keep test checksums valid SHA-256 hex strings; failed batches must preserve scope data as well as revision/history metadata.
- Keep OS temp work inside the existing repository `.tmp-vitest` directory in this sandbox.
- Treat existing 1,128 TypeScript diagnostics as baseline; do not claim a green full typecheck.
