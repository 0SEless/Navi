# Missing POST and Reload Root Cause

## Checkpoint trace

The first E8.2 no-POST observation reached the UI Save control and local workflow/persistence resolution, but its browser console listener did not forward application diagnostics. The IndexedDB draft later contained the edited name; no scoped POST was observed in that run. The cause of that one transient no-POST observation could not be established and is not attributed to a guessed server or authorization failure.

With application diagnostics forwarded in a fresh run, the following checkpoints were observed in order:

1. Editor field edit dispatched; `revision.committed` and `document.changed` fired.
2. Authoritative document showed the new Library name; workflow became dirty.
3. Save button handler ran and the IndexedDB draft completed.
4. Scoped diff classified exactly one `building` scope.
5. One immutable candidate was created for expected revision 0.
6. POST `/api/studio/scoped-save` dispatched and returned HTTP 200.
7. Client validated the exact acknowledgment and reported revision 1.
8. UI displayed the durable E5 acknowledgment status.

Sanitized trace: `logs/accepted-browser-be83696418704a03ba6c0031a0f3975d/playwright.log`.

## Reproducible blocker and cause

The first reload failure was reproducible from trace evidence: the GET response reconstructed revision 1 with the edited Library; `window.__naviContext.document` also contained the updated Library and unchanged Lab; the Explorer DOM still displayed the original seed label. Thus the persisted data, authentication, request and snapshot reconstruction had succeeded. The first failing checkpoint was rendering the recovered document in editor selectors.

`StudioScopedHistoryBridge` had applied the reconstructed snapshot by mutating `context.document` directly. Editor React selectors subscribe to `DocumentStore`, so that mutation did not notify them. The fresh context therefore had current data in memory but stale memoized/rendered views.

The correction and focused regression are documented in `02-IMPLEMENTED-FIX.md`. No authorization or request validation was bypassed.
