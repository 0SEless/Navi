# PostgreSQL Integrity Evidence

## Browser campus

Independent verification after the final Playwright run queried only E5 synthetic database `navi_e4_test` using restricted role `navi_e4_runner` and campus `navi-e8-browser-be83696418704a03`.

| Check | Observed |
|---|---:|
| Campus revision | 1 |
| Reconstructed scope count | 5 |
| Change sets | 1 |
| Operations | 1 |
| Mutation receipts | 1 |
| Checkpoints | 1 |
| Stored JSONB bytes | 1,356 |
| Reconstructed checksum | `f2923672134fdc9611f3b181a5ea9d7cdc94d1909ffde4f45eeb3e9e5d6803a2` |
| Library | `Synthetic Library E8.1 Accepted` |
| Lab | `Unchanged Synthetic Lab` |

The single operation scope was `building:e8-building-library`. The independent verifier reconstructed revision 1 from PostgreSQL after the browser process exited. No second revision was created by reload.

## E5 transaction/replay rehearsal

The retained E5-only writer/reader rehearsal passed with synthetic campus `navi-e8-synthetic-0730c7aaaa4a49d9bc812a13e7add3b9`: transaction rollback left 0 change sets/operations/receipts for the failed candidate; concurrent CAS resulted in one committed and one stale writer; identical retry returned replayed; mutation collision returned `MUTATION_ID_REUSED`; stale writer returned `STALE_REVISION`; a read worker reconstructed revision 2 with 2 change sets, 4 operations, 4 receipts and 3 checkpoints.

Logs: `reports/navi-studio-1.5-track-e8/logs/integration-0730c7aaaa4a49d9bc812a13e7add3b9/`.

Synthetic tests establish the local E5 harness behavior only. They do not prove recovery of the real Development database.
