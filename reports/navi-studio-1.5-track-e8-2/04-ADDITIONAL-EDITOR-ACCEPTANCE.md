# Additional Editor Acceptance

## Status

The following scenarios were **not run through actual Studio editor interactions** in E8.2 and are not claimed as passing:

- Route-node edit and durable save/reload.
- Terrain edit and durable save/reload.
- Atomic building-and-route edit from the editor.
- Stale revision conflict from a stale editor session.
- Browser network interruption during save and recovery by exact retry.
- IndexedDB draft preservation after a failed network save.
- Identical retry without a duplicate revision from the editor.
- Flags-off legacy editor save behavior.

The E5 integration rehearsal did exercise transaction rollback, concurrent writers/CAS, replay integrity, mutation ID collision, stale revision rejection, unchanged-content handling, and reconstruction in a separate read process. Those are PostgreSQL/service-level tests, not substitutes for the missing actual-editor browser scenarios above.

## Follow-up

Extend Playwright with fresh synthetic campuses and assert the editor control changes, operation scopes, HTTP result, visible save status, reload state, IndexedDB preservation, and independent E5 counts for each scenario. Keep all writes limited to the E5 synthetic database. Do not infer flags-off or route/terrain behavior from unit tests alone.
