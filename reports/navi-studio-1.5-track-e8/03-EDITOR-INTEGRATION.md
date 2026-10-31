# E8 Editor Integration

- The existing IndexedDB draft remains the first durable local record. At the explicit editor save boundary, the opted-in path writes and verifies the IndexedDB draft first, then submits one scoped candidate or one atomic scoped batch to local E5.
- Pointer, brush, and `document.changed` events do not write to PostgreSQL. The local reference-history observer is bypassed when durable mode is enabled; a shared boundary registered by `StudioScopedHistoryBridge` supports both the main Studio and floor editor.
- With the E8 flag enabled, manual save is local-only before the E5 write; it does not invoke the legacy Supabase sync. With flags off, the existing save and publishing adapters continue their previous paths.
- A scoped save status is worded as `local synthetic E5` and never as a cloud acknowledgment. Local draft state is preserved on an error, stale conflict, or unknown commit outcome.
- The floor-editor exit/visibility draft flush continues to save to IndexedDB only; it does not attempt an asynchronous E5 write during unload.

Unit coverage verifies baseline read, candidate save, exact acknowledgment, disabled mode, failure retention, and existing draft/save-state regressions. Full browser verification of draft recovery after a real browser network failure and publishing handoff remains open because the Playwright run did not complete.
