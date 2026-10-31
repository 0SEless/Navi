# Transaction and reconstruction failure matrix

| Scenario | Local simulated evidence | Result |
| --- | --- | --- |
| Same-base concurrent commits | Fake advisory campus lock, one commit / one stale conflict | Pass (simulated) |
| Lock timeout SQLSTATE `55P03` | Error mapping plus explicit rollback | Pass (simulated) |
| Deadlock / serialization SQLSTATE `40P01` / `40001` | Retryable error plus rollback | Pass (simulated) |
| SQL failure at change set, scope, operation, receipt, head, checkpoint | State snapshots remain unchanged after rollback | Pass (simulated) |
| COMMIT response lost after server-side commit | Returns `COMMIT_OUTCOME_UNKNOWN`, destroys the uncertain client, exact retry resolves receipt | Pass (simulated) |
| Duplicate scope in one batch | Rejected before client acquisition | Pass |
| Entire no-op batch | No history or receipts appended | Pass |
| Mixed changed / unchanged batch | Shared revision and batch binding; unchanged member has null operation index | Pass |
| Revision at `Number.MAX_SAFE_INTEGER` | Refuses advancement before durable writes | Pass |
| Invalid stored campus/scope revision | Classified as history integrity failure | Pass |
| Malformed checkpoint or tampered operation history | Rejected by runtime shape/checksum/revision/operation-count checks | Pass |
| Read snapshot | `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` asserted | Pass (SQL contract/fake only) |

These are controlled in-process query-fake tests. They do **not** establish real PostgreSQL isolation, advisory-lock semantics, SQLSTATE behavior, durability, RLS enforcement, or rollback guarantees. Those checks are prepared for the opt-in integration harness and remain unrun.
