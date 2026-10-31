# Browser End-to-End Acceptance

## Result: NOT ACCEPTED

The local Next.js browser harness and synthetic Auth stub started successfully after moving the stub from Windows-excluded port 65432 to 45678. The browser loaded the synthetic Studio campus and selected/edited the synthetic Library building. External origins were blocked by the harness; `/api/graph` and campus-map writes were denied by the test harness.

An earlier browser run reached `POST /api/studio/scoped-save` and received an E5 durable acknowledgment, but E5 recorded two operations at one campus revision: the intended `building:e8-building-library` edit plus `campus-settings`. This was traced to an unnormalized fixture semantics version. The fixture now explicitly seeds `1.0.0`.

On subsequent runs with the normalized fixture, the Playwright test did not capture a POST after the edit/manual-save sequence. It timed out waiting for the response. No durable acknowledgment or post-reload browser recovery is claimed for that run. The earlier two-scope run failed its exact-one-scope assertion before reload verification.

## Uncompleted checks

- Single building scope, exact durable acknowledgment, reload from E5, and unchanged second building in one passing browser run.
- Route and terrain edits through the editor.
- Network failure and stale revision conflict with IndexedDB draft recovery.
- Flags-off legacy editor Save workflow. The separate flags-off smoke only proves the scoped endpoint is disabled by default.

## Evidence and logs

- Browser attempt logs and Playwright traces are retained under [`logs/`](./logs/), including the Windows reserved-port diagnosis and route/scope/time-out attempts.
- The browser bootstrap uses unique `navi-e8-browser-*` synthetic campus identities. No rows were deleted.
- The prior request that committed multiple scopes remains as synthetic evidence and was not cleaned up.

The specific remaining blocker is the normalized browser editor Save flow failing to produce a captured scoped-save POST. Continue only against a fresh synthetic campus in E5; do not re-use prior attempt IDs as an empty baseline.
