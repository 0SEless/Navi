# SPEC: Floor Editor Door & Interior Persistence Across Reload and Tab Close

## 1. Context & Purpose
When users place a door (or any interior entity such as walls, rooms, routes) in the Floor Editor, changes fail to persist to the server when the user closes the URL/tab and reopens it. The user sees their door wiped out or replaced by the server version with a conflict banner. Additionally, on production deployment, `src/store/graph-store.ts` was omitted from a recent commit, causing `TypeError: setAuthoredDocument is not a function` which crashes the editor on load.

## 2. What Needs to Happen (WHAT, not HOW)
1. **Floor Editor Door Creation & Persistence**: Placing a door in the Floor Editor (`door.create`) must reliably update both local cache and Supabase backend with `floor.doors` and graph projection `doors`.
2. **Tab Close / Page Unload Persistence**: When the user closes the tab, navigates away, or unloads the page after placing a door, the save network request to `/api/graph` must not be aborted mid-flight by the browser (`keepalive: true`).
3. **Continuous Mutation Attribution in Floor Editor**: The Floor Editor must record authored mutation intent (`recordAuthoredMutation('floor', buildingId, floor)`) on `document.changed` so any save (autosave, manual, or unload flush) passes the P0.11 safety guard.
4. **Manual Save Trigger in Floor Editor**: The Floor Editor must provide an explicit Save action (and `Ctrl+S` shortcut) with clear status feedback (`Saved`, `Saving...`, `Sync failed`), giving users direct control over when work is persisted to the server.
5. **Clean Production Hydration**: All store methods (`setAuthoredDocument`, `authoredDocument`, serialization) must be committed and deployed, preventing runtime `TypeError` crashes on Vercel.
6. **No Conflict Banner on Reopen**: Reopening the Floor Editor after closing must cleanly load the server-persisted door without false conflict warnings or state erasure.

## 3. Concrete Success Criteria
1. `src/store/graph-store.ts` is committed and cleanly passes tests and typechecks without missing store methods.
2. `performSyncToSupabase` in `src/store/graph-store.ts` uses `{ keepalive: true }` in `fetch('/api/graph', ...)` so in-flight requests survive page unloads.
3. `FloorEditorBridge` records authored mutation intent on `document.changed`.
4. `FloorEditor.tsx` provides a manual Save button and `Ctrl+S` hotkey wired to `workflow.save('manual')`.
5. Automated test verifies: place door -> save -> reload from server -> door exists on both server `authored_document.buildings[...].floors[...].doors` and graph snapshot.

## 4. Known Pitfalls from ERRORS.md
- **2026-09-27**: Save-boundary intent injection defeated the P0.11 unattributed-mutation guard. Fallback must require real document changes (`document.version > 0`).
- **2026-09-27**: Cross-scope destructive save blocked. Always keep scopes distinct and preserve entities outside the active floor.
- **2026-09-27**: Hardcoded keys in verification scripts. Read keys from environment variables only.
- **2026-09-25**: Bulk text replaces can drop parentheses or variable declarations. Verify with targeted checks.
