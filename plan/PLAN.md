# PLAN: Floor Editor Door & Interior Persistence Across Reload and Tab Close

## Tasks

### T1: Harden Graph Store Network Transport & Commit Store Dependencies
- **Description**: Add `keepalive: true` to `fetch('/api/graph', ...)` in `performSyncToSupabase` (`src/store/graph-store.ts`). This allows unload/exit requests to finish even when the user closes the tab or window immediately. Confirm `src/store/graph-store.ts` has `setAuthoredDocument` and full serialization so Vercel builds cleanly without runtime TypeErrors.
- **Files to touch**: `src/store/graph-store.ts`
- **Acceptance check**: `fetch('/api/graph')` includes `keepalive: true`. Vitest graph store tests pass.
- **Error prevention**: "Preventing: In-flight network aborts on tab unload dropping un-synced edits; preventing missing export runtime TypeError on production deployment."

### T2: Attribute Authored Mutations on `document.changed` in `FloorEditorBridge`
- **Description**: In `src/app/(admin)/studio/[id]/edit/building/[buildingId]/floor/[floor]/page.tsx`, update the `document.changed` event listener in `FloorEditorBridge` to call `useGraphStore.getState().recordAuthoredMutation('floor', buildingId, floor)`. This ensures that any autosave or exit flush triggered after an edit has its mutation attributed before the P0.11 guard evaluates the candidate.
- **Files to touch**: `src/app/(admin)/studio/[id]/edit/building/[buildingId]/floor/[floor]/page.tsx`
- **Acceptance check**: `document.changed` listener attributes floor mutation intent.
- **Error prevention**: "Preventing: P0.11 save guard blocking un-attributed floor mutations during autosave; preventing empty pending intent array from dropping autosave."

### T3: Add Explicit Save Button and Keyboard Shortcut in `FloorEditor`
- **Description**: In `src/components/floor-editor/FloorEditor.tsx`, add an explicit Save button in the header toolbar next to the status badge, and attach a `Ctrl+S` / `Cmd+S` keyboard shortcut. When clicked/triggered, it invokes `workflow.save('manual')`.
- **Files to touch**: `src/components/floor-editor/FloorEditor.tsx`
- **Acceptance check**: Save button renders with active status (`Save`, `Saving...`, `Saved`), and `Ctrl+S` triggers `workflow.save('manual')`.
- **Error prevention**: "Preventing: User confusion over whether changes are saved before closing the tab; preventing unhandled keyboard events."

### T4: Verification Test for Door Placement and Server Round-Trip
- **Description**: Add / run an automated test that places a door in `floor.doors`, synchronizes via `GraphAdapter`, serializes snapshot with authored document, and validates that `authored_document` retains the door and the P0.11 guard approves the save.
- **Files to touch**: `packages/editor/src/__tests__/floor-door-persistence-roundtrip.test.ts`
- **Acceptance check**: Vitest test passes 100%.
- **Error prevention**: "Preventing: Regressions in door serialization or coordinate transformations."

### T5: E2E and End-to-End Persistence Verification
- **Description**: Run test battery to verify that door persistence, floor creation, and graph store methods operate correctly.
- **Files to touch**: Test logs and verification scripts.
- **Acceptance check**: All targeted vitest suites pass.
- **Error prevention**: "Preventing: False positive verification; verifying with concrete output."
