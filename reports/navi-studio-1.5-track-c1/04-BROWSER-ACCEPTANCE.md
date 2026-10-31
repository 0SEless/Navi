# Browser acceptance results

Fresh localhost-only runs on 2026-10-29 used synthetic campus data and system Chrome.

- Draft-enabled mode: 6 passed, 1 skipped (the disabled-mode case is exercised separately).
- Draft-disabled mode: 1 passed, 6 skipped.
- No cloud service or external request was allowed by the harness.

| Requested scenario | Result | Evidence / limitation |
|---|---|---|
| Edit a synthetic building | PASS | Enabled UI scenario edits the synthetic fixture. |
| IndexedDB local draft persists | PASS | UI reload scenario verifies the IndexedDB record and restored content. |
| Refresh recovery | PASS | Same UI scenario reloads and restores the draft. |
| Floor switching | PASS | Fixture switches floors while keeping campus document intact. |
| Building switching | PASS | Fixture switches between two synthetic buildings. |
| Offline editing | PASS | Browser blocks external traffic; local edit remains durable and no cloud graph write occurs. |
| Quota failure | PASS | Injected quota exception is surfaced; no cloud fallback. |
| Corrupt/unsupported draft | PASS | Unsupported version is preserved and recovery is blocked. |
| Interrupted local write | NOT VERIFIED in browser | Deferred/late write ordering and campus serialization are covered by focused service/store tests; browser did not forcibly terminate an IndexedDB transaction. |
| Local save status | PASS | UI differentiates local draft durability from cloud acknowledgement. |
| Manual cloud Save pending | PASS | Mocked request remains pending and UI reports pending state. |
| Delayed acknowledgement | PASS | Mock acknowledgement is delayed, then applied. |
| Edit while Save is in progress | PASS | Later edit remains locally saved after older request ACK; it is not marked cloud-synced. |
| No cloud request during local-only edits | PASS | Browser intercepts graph API and asserts no write in local-only flow. |
| Feature flag disabled/legacy behavior | PASS | Separate disabled configuration passed 1/1 and creates no IndexedDB draft. |

Existing screenshots remain under logs/: browser-local-draft-saved.png, browser-local-draft-quota-error.png, browser-cloud-save-ack.png, browser-process-restart-recovery.png and prior attempt/retry images. The fresh successful Playwright runs retained no failure-only screenshot. Earlier isolated persistent-profile run also demonstrated process-restart recovery; the fresh rerun exercised reload and local acceptance scenarios.

The enabled run emitted expected injected quota/corrupt-record errors in server logs and a service-destroy AggregateError warning on teardown. Those were not assertion failures. Real authentication, live Supabase save, production latency and real publication were not exercised.
Fresh command summaries and durations are in logs/browser-final-20261029.md.

