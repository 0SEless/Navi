# SPEC: Navi Studio Floor & Interior Persistence Unblocking

## 1. Context & Purpose
In Navi Studio, when users add floors to a building in the Campus Editor, or edit routes, rooms, and walls inside the Floor Editor, changes fail to persist to Supabase. Edits appear locally in `localStorage`, but autosave either silently drops the save or the Cross-Scope Destructive Save safety guard blocks it with:
`[graph-store] save blocked by safety guard: Cross-scope destructive save blocked: no pending authored intent covers nodes[...] edges[...]`
This causes permanent desynchronization between client local state and the server database, resulting in the "Outdated / Load server version" conflict modal, which overwrites local work when accepted.

## 2. What Needs to Happen (WHAT, not HOW)
1. **Campus-level floor operations must persist reliably**: Adding, deleting, or renaming floors in the Manage Floors dialog must trigger network persistence to Supabase and update the database row.
2. **Floor editor interior modifications must persist without cross-scope guard blocks**: Adding route networks, rooms, or walls within a floor must persist cleanly without falsely dropping or mutating outdoor entities.
3. **Outdoor road node & edge stability**: Reconciling the campus document to graph projection must preserve existing outdoor node and edge identities instead of synthesizing volatile IDs (`N0001..`, `E0001..`) that trigger the cross-scope destruction guard.
4. **Clean reload without false conflict banners**: Reloading the studio or floor editor after saving must load the fresh server state without triggering "Outdated" conflict warnings.

## 3. Concrete Success Criteria
1. `GraphAdapter.sync(document)` preserves existing outdoor road node IDs and edge IDs across reconciliations (verified with unit tests and snapshot comparisons).
2. `EditorBridge.tsx` attributes document mutations (`recordAuthoredMutation`) so campus-level actions like `floor.create` pass the P0.11 authored intent check and autosave to Supabase.
3. `GraphAdapter.sync` accepts an optional scope parameter to scope reconciliation and prevent unintentional outdoor road re-compilation when editing interior floors.
4. Live Playwright verification on Vercel or local end-to-end demonstrates adding a floor and drawing a route network successfully writes `POST /api/graph` (HTTP 200) and updates the database row.

## 4. Known Pitfalls from ERRORS.md
- **2026-09-26**: Snapshot assertions must not include fields modified by the process under test; assert geometry and identity stability cleanly.
- **2026-09-25**: Bulk text replaces can corrupt syntax or drop parens; make focused, atomic modifications.
- **2026-08-29**: Keep repository typecheck/test failures attributed to their owning files; don't break mock exports or mutate unrelated files.
