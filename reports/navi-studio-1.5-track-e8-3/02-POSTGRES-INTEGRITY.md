# Track E8.3 — PostgreSQL Integrity

## E5 identity

- Endpoint: `127.0.0.1:55433` (host loopback only)
- Database and role: `navi_e4_test` / restricted `navi_e4_runner`
- Database marker: `navi-e4-synthetic-v1`
- PostgreSQL: `17.11`
- Campus: `navi-e8-browser-46b34be9990b4617` (synthetic)

The browser's revision-5 reconstruction matched checksum `910de4377b6442ab7f7c4419b84a70051745103b417cd7d6a95516676f58b285`. The database contained 5 change sets, 6 operations, 6 mutation receipts, 1 checkpoint, and 6 scopes. Stored JSONB operation payloads totaled 6,268 bytes.

The five per-revision checksums and operation/receipt counts are listed in `01-BROWSER-ACCEPTANCE.md`. Only the Library and Lab building scopes and the two routing scopes were written. Campus settings and terrain remained at revision 0.

## Transaction and replay checks

The separate synthetic E5 transaction run recorded:

- Injected transaction rollback: 0 change sets, 0 operations, 0 receipts.
- Concurrent writers: 1 committed and 1 rejected as stale.
- Exact replay: `replayed` without another revision.
- Reusing a mutation ID with changed content: `MUTATION_ID_REUSED`.
- Stale writer: `STALE_REVISION`.
- Unchanged document: `unchanged`.
- Atomic batch: 3 acknowledgments, 1 campus revision; candidate payload 1,753 bytes.
- Measured batch elapsed time: 61.45 ms; concurrent scenario: 49.28 ms.

The write/read evidence is in `logs/postgres-integration-run.log`; final browser-campus verification and revision checksums are in `logs/browser-46b34be9990b4617/postgres-verify-final.log`. These results establish synthetic E5 behavior only. They do not establish recoverability of any real Development database.
