# Browser save/reload and gesture evidence

Final Playwright log: `logs/run-fec85186572d4c47ae905ff8e03a0222/playwright.log`; trace: `logs/playwright-output/`.

The real Studio editor opened with synthetic campus fixtures in local E5 mode. The test drew `Synthetic north lawn`, set elevation `3.25 m` relative to `E8.4 synthetic campus datum`, and adjusted one vertex. The browser then explicitly saved and received HTTP 200 with `outcome=committed`, one acknowledgment at revision 1, a mutation ID, 64-character content and request checksums, and commit timestamp.

| Measurement | Observed |
|---|---:|
| Vertex-drag pointer-move events | 13 observed by the editor instrumentation |
| Document commands for completed drag | 1 |
| Document changes for completed drag | 1 |
| Scoped-save requests during drag | 0 |
| Save candidates / operations in explicit-save request | 1 |
| HTTP scoped-save posts for successful save | 1 |
| Database revisions committed | 1 campus terrain revision |

The editor did not issue a request during the drag. The explicit Save produced one operation in the campus `terrain` scope. A fresh browser context recovered the exact stable area ID, vertex sequence, name, elevation, and campus datum; the recovered editor displayed one area and the properties panel showed the saved fields.

Failure handling was exercised in the same test: a stale synthetic editor received HTTP 409 and its IndexedDB terrain draft remained; after reload, a deliberately aborted save retained the updated IndexedDB draft and created no additional E5 revision. The browser contexts used synthetic identities only. No Supabase or cloud endpoint was contacted.

The final Playwright test completed in 19.4 seconds. The console contains expected logged errors for the deliberately injected stale revision and network failure; the acceptance assertions for both passed.
