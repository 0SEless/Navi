# Progress Log

## 2026-07-11: M3.2 Phase C Reclassification + Phase D (useEntrancePlacer) — Complete

### What was done
- **ADR 0014**: Created `docs/decisions/ADR-0014-application-bootstrap-workflow.md` — reclassifies CreateMapWizard as Application Bootstrap Workflow (outside EditorContext by design)
- **BuildingMetadataForm extracted**: Moved from inline `MetadataForm` in CreateMapWizard to `src/components/shared/BuildingMetadataForm.tsx` — shared between wizard and future editor panels
- **CreateMapWizard cleaned up**: Removed 80+ lines of duplicated form components (Field, StepBtn, COLOR_SWATCHES, INPUT_STYLE), imports from `@/components/shared/BuildingMetadataForm`
- **M3.2 SPEC updated**: Phase C reclassified (CreateMapWizard removed from migration scope), ADR 0014 referenced in pitfall notes
- **Phase D — useEntrancePlacer migrated**:
  - Removed `useGraphStore` imports (`graph`, `updateBuilding`, `save`, `addNode`)
  - Replaced with `useEditor()` → `dispatcher.execute('entrance.create', ...)` + `workflow.save('manual')`
  - Reads from `document.buildings` instead of `graph.buildings`
  - Point-in-polygon logic extracted to pure function
  - Removed `addNode` call — GraphAdapter handles NavNode creation from CampusDocument

### Verification
- `npx tsc --noEmit` — no new type errors (only pre-existing errors in compiler/core/canvas)
- `npx vitest run` — 110 files, 899 passed, 0 failed

## 2026-07-11: M3.2.3 Phase E (useVertexEditor) — Complete

### What was done
- **Phase E — useVertexEditor migrated**:
  - Removed `useGraphStore` imports (`updateTrace`, `recompileTrace`, `save`)
  - Replaced with `useEditor()` → `dispatcher.execute('entity.update', ...)` + `workflow.save('manual')`
  - Reads `Road` entities from `document.roads` instead of compiled `TracePath` objects from `graph.traces`
  - Edits `Road.polyline.points` via generic `entity.update` command
  - Removed `recompileTrace` call — GraphAdapter will regenerate compiled traces when wired
  - Kept `editTargetType === 'trace'` mapping in studio store (UI concern, maps to Road internally)

### Final M3.2.3 Audit
- No `useGraphStore` imports in active editor components (only legacy/ directories and runtime views remain)
- No direct `.save()` calls in editor UI (all through `workflow.save()`)
- All editor mutations flow through `CommandDispatcher`
- All persistence flows through `WorkflowService`

### Verification
- `npx tsc --noEmit` — no new type errors
- `npx vitest run` — 110 files, 899 passed, 0 failed

## 2026-07-12: M3.3.1 Document Lifecycle (Dirty Tracking) — Complete

### What was done
- **WorkflowStore extended**: Added `SaveState` type, 4 lifecycle fields (`_saveState`, `_saveError`, `_lastSaveReason`, `_lastSavedAt`), atomic `updateLifecycle()` mutator (single commit per transition). Extended `WorkflowSnapshot` interface and `getSnapshot()`.
- **WorkflowService.save() with state machine**: Transitions `saved → saving → saved|error`. `workflow.saved` event emits only after persistence succeeds. On error: captures `saveError`, does NOT update `lastSavedAt`/`lastSaveReason`, rethrows. On success: updates all fields atomically.
- **Initial state on load**: `init()` sets `saveState: 'saved'` + `lastSavedAt: Date.now()`.
- **Ownership invariants documented**: WorkflowStore owns persistence lifecycle, DocumentStore owns revision, WorkflowService is the only synchronization point.

### Verification
- `npx tsc --noEmit` — no new type errors (3 pre-existing)
- `npx vitest run` — 110 files, 904 passed (899 + 5 new lifecycle tests)

### Architecture state
```
Command
    │
    ▼
DocumentStore (revision)
    │
    ▼
WorkflowService (lifecycle)
    │
    ▼
WorkflowStore (state)
    │
    ▼
isDirty (derived), saveState, lastSavedAt, saveError
```

## 2026-07-12: M3.3.2 Autosave Service — Complete

### What was done
- **AutosaveService created** (`packages/editor/src/services/autosave-service.ts`) — new editor service that owns the timing of autosaves. Subscribes to `eventBus` `document.changed` events. Configurable debounce (5s default) and max interval (30s default) via constructor options.
- **WorkflowService.canAutosave() added** — single checkpoint combining `isDirty()` and `saveState !== 'saving'`. Keeps WorkflowStore as an implementation detail behind WorkflowService.
- **Concurrency safety** — internal `pending` flag prevents concurrent saves even if debounce and interval fire simultaneously. Workflow `save()` rejections are caught (no unhandled rejections).
- **Lifecycle**: `init()` subscribes to events + starts max interval. `destroy()` clears debounce + interval + unsubscribes.
- **Registration**: Added to `ServiceMap`, registered in `createEditorContext()`. Exported from services index.

### Verification
- `npx tsc --noEmit` — no new type errors
- `npx vitest run` — 111 files, 911 passed (904 + 7 autosave tests)

### Files changed
- **Created**: `packages/editor/src/services/autosave-service.ts`, `packages/editor/src/services/__tests__/autosave-service.test.ts`
- **Modified**: `packages/editor/src/services/workflow-service.ts` (canAutosave), `packages/editor/src/services/index.ts` (exports), `packages/editor/src/context/service-registry.ts` (ServiceMap), `packages/editor/src/context/create-editor-context.ts` (registration)

### Remaining work
- **M3.3.3**: Validation engine — problems panel, validation queue, stale detection
- **M3.3.4**: Publish pipeline — draft vs published snapshots

## 2025-07-16: P3.1 Editor Bootstrap Consolidation — Complete

### What was done
- Created `packages/editor/src/context/create-editor-context.ts` — shared `createEditorContext(graph, persistenceAdapter, navCompiler)` factory that replaces the duplicated bootstrap in EditorBridge and floor page
- Exported from `@navi/editor` via context/index.ts + package index.ts
- Refactored `EditorBridge.tsx` — replace 90-line `buildContext()` + `createDocument()` with single factory call
- Refactored floor route `page.tsx` — replace 55-line inline `useState(() => {…})` with single factory call (removed 11 imports, removed `createDocument`, removed all manual service wiring)
- Build: clean
- Tests: 108 files, 864 passed, 0 failed

### What's next
- Ready for Phase 3 continuation — see ROADMAP.md for remaining milestones

### Verification
- `npm run build` — compiled successfully
- `npm t` — 108 test files, 864 tests passed
