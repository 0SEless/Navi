# Additive Scoped Persistence Migration Proposal

**Proposal only.** It is not a migration and must not be applied until backup/restore, Dev identity, security repair, and API authorization gates are approved.

## Existing state to preserve

Development has 19 migration-ledger entries through `020_projection_foreign_key_indexes`; existing `graph_snapshots`, `campus_graph_revisions`, `campus_graph_mutations`, `published_maps`, buildings, route nodes/edges, authored-document records, and their FKs remain authoritative/current. Keep the campus aggregate as the concurrency boundary. Do not rename, truncate, rewrite, or independently revision building/routing/terrain scopes. Existing published runtime artifacts remain readable; authored commits do not publish automatically.

## Additive design

Add a non-API-exposed private schema `navi_private` and additive tables for campus commit heads, commits, per-scope change sets, declared dependencies, immutable checkpoints, and idempotency receipts. Suggested constraints: unique `(campus_id, revision)`; unique `(campus_id, mutation_id)`; one head per campus; scope revision unique within campus/scope; FK from each changeset/dependency/checkpoint to parent commit; receipt stores exact acknowledgment and request checksum. Require server-side verified administrator identity, canonical checksums, campus CAS, dependency validation, and receipt lookup in one transaction. Retries with identical mutation ID/checksum return the exact stored acknowledgment; changed checksum is conflict. No-op content produces no revision. Keep full campus head update atomic with commit, changesets, and receipt.

RLS enabled on private tables with no client policies; revoke schema/table access from `PUBLIC`, `anon`, and `authenticated`. Grant only the minimum to `service_role` after verifying that runtime route and transaction function are server-only. Keep service-role credentials out of browser bundles. Do not add `navi_private` to exposed API schemas or create a broadly executable `SECURITY DEFINER` RPC. Prefer a reviewed server transaction boundary. Explicitly inspect Data API exposure; current Supabase behavior no longer guarantees newly created `public` tables are automatically exposed.

## Migration and rollback shape

The SQL file `sql/04-scoped-persistence-additive-proposal.sql` contains a DDL skeleton with checks/constraints and no destructive statements. Before production-quality DDL, confirm existing campus/document key types and actor FK semantics from source/catalog, settle checkpoint payload format and retention, and implement transaction RPC/API with concurrency tests. The rollback proposal is `sql/05-scoped-persistence-rollback-proposal.sql`: revoke access and leave any populated history intact. Dropping the new tables is allowed only after proving empty or after separately exporting the new data and receiving explicit owner approval. Never drop or alter existing revision/mutation tables as rollback.

## Performance and integrity preflight

Preserve campus-wide CAS serialization; index campus/revision, campus/scope/revision, dependency lookups, and mutation receipts. Benchmark large snapshot payloads and concurrent commits against an isolated restored DB; measure p95 transaction latency, lock waits, WAL growth, and restore time. Include stale expected revision, concurrent CAS, dependency change/missing, duplicate same-checksum replay, mutation-ID checksum mismatch, no-op, and rollback-on-failure cases. Do not run against shared Dev in this track.
