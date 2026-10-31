# Canonical atomic batch replay integrity

The shared `scopedBatchChecksum()` hashes a versioned canonical object containing campus ID, expected campus revision, and all member mutation IDs, request/content checksums, and scopes sorted by a deterministic code-unit comparison of mutation ID. Caller member ordering does not affect the identity. Each candidate is validated before this checksum is generated.

The proposed schema persists `batch_checksum` on `change_sets` and `mutation_receipts`. A unique `(campus_id, revision, batch_checksum)` key and receipt composite foreign key bind every receipt to the change set's batch identity. Every changed or unchanged member in a mixed changed batch receives the same revision and batch checksum; unchanged members have a null operation index. Existing E1/E2 store interfaces remain unchanged; optional acknowledgment metadata allows legacy reference stores to omit the binding.

Both durable-store replay and the higher-level `commitScopedCandidate` / `commitScopedBatch` wrappers verify the binding. The wrappers catch cross-shape replay before short-circuiting on `findMutation`. Changed content under a reused mutation ID remains `MUTATION_ID_REUSED`; partial or mixed/mismatched bound receipts fail with `BATCH_REPLAY_INTEGRITY_FAILURE`. Exact lost-ack retries replay before stale-revision rejection. Direct adapter and contract tests cover deterministic member ordering, altered content, partial receipts, substituted batch checksums, two-member receipt replay as a single save, and legacy unbound reference-store compatibility.

These checks passed in simulated tests. PostgreSQL constraints have not been executed.
