# Transaction and Revision Efficiency

## E5 PostgreSQL acceptance

The E5-only writer and separate-process reader passed in `integration-ea5dc76de11d4bf2a911a0dd799730dd` (logs under `reports/navi-studio-1.5-track-e8/logs/`). No D2 resources were touched.

- Injected failure during a two-scope transaction: `change_sets=0`, `operations=0`, `receipts=0` after rollback; campus stayed at revision 0.
- Three changed scopes (building, routing, terrain): committed together at campus revision 1 with three acknowledgments.
- Exact retry after simulated lost response: `replayed`, revision 1, three matching acknowledgments.
- Reusing a mutation ID with changed content: `MUTATION_ID_REUSED`.
- Stale expected revision: `STALE_REVISION`.
- Unchanged building content: `unchanged`, campus remained revision 1.
- Two concurrent writers at expected revision 1: one committed, one got stale conflict; final revision 2.
- New process reconstructed revision 2, four scopes, all receipts/history/checkpoints, and matching content checksum.

## Measured values

- Candidate payload: **1,753 bytes**.
- Three-scope batch elapsed: **61.51 ms**.
- Concurrent writer pair elapsed: **38.95 ms**.
- Final E5 row counts: **2 change sets, 4 operations, 4 receipts**; stored JSONB payload bytes **483**; **3 checkpoints**.
- One atomic three-scope edit produced one campus revision, and an unchanged document produced no revision.

## Browser-specific efficiency limitation

One earlier browser commit wrote the intended building plus an unintended campus-settings companion operation at revision 1. This is recorded as a failed browser efficiency acceptance. With the fixture normalized, the next browser attempt timed out before a captured POST. Therefore one meaningful browser building edit producing exactly one persisted scope remains unverified.
