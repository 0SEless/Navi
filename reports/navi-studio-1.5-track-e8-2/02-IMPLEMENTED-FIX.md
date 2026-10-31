# Implemented Fix

## Change

Added `DocumentStore.adoptSnapshot(snapshot)`. It copies the server-reconstructed snapshot into the stable editor document object, advances the editor document version, and notifies React subscribers without emitting `revision.committed`. During durable E5 initialization, `StudioScopedHistoryBridge` now uses this method, aligns `WorkflowStore.lastSaveVersion` to the adopted baseline, and then synchronizes the graph projection and local draft.

This avoids treating a server baseline as a new user edit while invalidating document selector memoization. The existing save endpoint, auth guard, scope diff and durable acknowledgement checks remain in place.

## Regression test

`packages/editor/src/context/use-document-selector.test.tsx` now asserts that a server snapshot adoption refreshes `useDocumentSelector`, advances the document version, and emits no `revision.committed` event.

Focused test result: 4 passed.

## Diagnostics

Added opt-in sanitized trace points under `NODE_ENV=development` and `NEXT_PUBLIC_NAVI_E8_SAVE_DIAGNOSTICS=true`. The Playwright-only development server enables the flag. Trace fields include checkpoint, scope kinds/count, expected/current revision, HTTP status, acknowledgment count, and local draft status. No credentials, building payload, or campus document content are logged by the application diagnostics.

## Files

- `packages/editor/src/context/document-store.ts`
- `packages/editor/src/context/use-document-version.ts`
- `packages/editor/src/context/use-document-selector.test.tsx`
- `src/components/studio/StudioScopedHistoryBridge.tsx`
- `src/services/scoped-save-diagnostics.ts`
- `src/services/scoped-save-document-session.ts`
- `src/services/scoped-save-client.ts`
- `src/components/studio/EditorBridge.tsx`
- `src/components/studio/StudioWorkspace.tsx`
- `e2e/track-e8-1-editor-acceptance.spec.ts`
- `playwright.track-e8-1.config.ts`
