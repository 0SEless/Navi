# Adapter contract

`src/services/scoped-postgres-adapter.ts` implements `ScopedBatchCommitStore` using minimal injected `ScopedPgPool` and `ScopedPgClient` interfaces; no PostgreSQL package was installed or imported. Trusted actor authorization and canonical document identity come from injected server callbacks. The adapter is not wired to an application route.

Writes use parameterized SQL in a transaction with bounded statement/lock timeouts and `pg_advisory_xact_lock` keyed by campus. After acquiring the lock it verifies stored document identity, checks receipts before stale revision rejection, validates dependencies and checksums, and writes changed scopes, history, all batch receipts, head advancement, and any periodic checkpoint before commit. Database errors roll back; acknowledgments are returned only after commit. Exact retries replay durable receipts; reusing an ID for a different request is rejected.

Checkpoint reconstruction validates checkpoint payload checksum/count/identity, operation checksums, revision sequence, history-chain checksums, and current head checksum. `readCampusState` and `findMutation` are internal adapter methods without actor parameters; any future route must authorize reads before calling them.
