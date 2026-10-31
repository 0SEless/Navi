# Track E8.2 Summary

**Result: PASS for the required single-building browser-to-E5 save/reload gate.** The pass is limited to the synthetic E5 scenario described here; it does not establish Development or Production recoverability.

## Verified workflow

In the final run, Playwright opened a fresh synthetic campus, edited only `e8-building-library`, invoked the Studio Save button, received one durable E5 acknowledgment at revision 1, and showed the UI status `Saved to local synthetic E5; not cloud-saved`. A new browser context then fetched the revision-1 snapshot from E5. The server snapshot, mounted editor document, and rendered Explorer all showed `Synthetic Library E8.1 Accepted`; `Unchanged Synthetic Lab` remained unchanged. The new context had independent storage, so this proves database recovery rather than IndexedDB draft recovery. The reload created no duplicate revision.

Final campus: `navi-e8-browser-be83696418704a03`.

Independent E5 evidence: revision 1; 5 scopes reconstructed; 1 change set, 1 operation, 1 receipt, 1 checkpoint; 1,356 stored JSONB bytes; reconstructed checksum `f2923672134fdc9611f3b181a5ea9d7cdc94d1909ffde4f45eeb3e9e5d6803a2`.

## Root cause and correction

The first traced run that reached reload showed the E5 response and `context.document` held the recovered building, while the React Explorer still rendered its seed name. The hydration path mutated the editor-owned document directly without notifying `DocumentStore` subscribers. The fix adds a baseline-adoption method that notifies subscribers without emitting `revision.committed`, then aligns the workflow's saved version. A regression test covers both UI selector refresh and absence of an edit event.

An earlier trace run reported no POST after local `workflow.save` resolution. That symptom did not reproduce in the subsequent fully forwarded trace; the exact cause of that transient observation remains unestablished. The final browser scenario passed twice, including a final run that asserts the durable status in the UI.

## Regression status

- Focused E8 authorization, session/client, snapshot, diff, PostgreSQL adapter/runtime, and document-selector tests: 81 passed.
- Document-store hydration regression: 4 passed.
- E5 writer/reader integration rehearsal: passed; transaction rollback, concurrent CAS, replay, stale writer, mutation collision and reconstruction were exercised.
- Final Playwright browser scenario: 1 passed; independent DB verify: passed.
- TypeScript: 1,124 diagnostics, matching the E8.1 baseline of 1,124; no new diagnostics after the final fixes.
- Focused ESLint on new/fixed E8.2 files: passed. Broader lint over existing E8 surfaces still reports legacy findings documented in `06-REGRESSION-RESULTS.md`.

Logs are retained under `reports/navi-studio-1.5-track-e8-2/logs/`, including the preserved failed pre-fix run and final accepted run. No cloud/Supabase access, migration, deployment, push, or Docker cleanup was performed. D2 resources were not accessed or modified.

## Next milestone

Add actual-editor Playwright scenarios for route and terrain edits, atomic multi-scope edits, stale revision, network interruption and exact retry, IndexedDB draft preservation, and flags-off legacy save. Keep scoped saving opt-in and synthetic-only until the required release gates are approved and separately completed.
