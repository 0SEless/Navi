# S-010 Plan — Document Transaction Model & Autosave

## Architecture

```
Command
      │
      ▼
DocumentStore.commit()
      │
      ├── version++
      ├── emit RevisionCommitted
      ▼
WorkflowService
      │
      └── Dirty/Clean state (listens to RevisionCommitted)
      ▼
AutosaveService
      │
      ├── debounce
      ├── SaveQueue
      └── snapshot save
      ▼
Persistence
```

### Ownership

- **DocumentStore**: owns `version`, `commit()` bumps version atomically, emits `RevisionCommitted` event
- **WorkflowService**: tracks dirty/clean state by observing revision changes. Does NOT save.
- **AutosaveService**: owns `SaveQueue`, debounce, and snapshot save. Does NOT mutate documents.
- **Persistence**: saves. Does NOT know revisions.

## Tasks

### T1 — DocumentStore owns versioning
**Files**: `packages/editor/src/context/document-store.ts`
- `commit()` bumps version, emits new `RevisionCommitted` event with `{ version }`
- Remove any external version bumping (all through commit)

### T2 — Revision events
**Files**: `packages/editor/src/eventbus.ts`
- Add `'revision.committed'` event type
- Add `'revision.saved'` and `'revision.save-failed'` if useful

### T3 — WorkflowService state machine (reactive)
**Files**: `packages/editor/src/services/workflow-service.ts`
- Replaces `isDirty()` version check with state machine listening to `revision.committed`
- States: `clean | dirty | saving | dirtyWhileSaving`
- `mutate()` → sets dirty (if not saving) or dirtyWhileSaving (if saving)
- `saveRequested()` → sets saving
- `saveComplete()` → clean (or re-save if dirtyWhileSaving)
- `saveFailed()` → dirty (stays dirty)
- Exposes `canPublish()` and `isSaving()` for consumers

### T4 — AutosaveService with SaveQueue
**Files**: `packages/editor/src/services/autosave-service.ts`
- `SaveQueue` internal class with contract: 1 active + 1 pending max
- `schedule(version)` → queue starts save if idle, records pending if saving
- On `revision.committed` → debounce → `schedule(currentVersion)`
- Snapshot: clones document before save, passes to persistence
- Stale-save detection: compare scheduled version vs current before write

### T5 — Update consumers
**Files**: `packages/editor/src/services/publish-service.ts`
- Use `WorkflowService.isSaving()` and `WorkflowService.canPublish()` instead of inspecting state directly
- Keep encapsulation

### T6 — Tests
**Files**: `packages/editor/src/services/__tests__/workflow-service.test.ts`, `packages/editor/src/services/__tests__/autosave-service.test.ts`, `packages/editor/src/services/__tests__/publish-service.test.ts`
- Rapid edits → 1 save
- Edit during save → second save fires
- Failed save → stays dirty
- Save ordering: newest wins
- Stale save discarded
- All existing tests green

## Acceptance Criteria

1. `DocumentStore.commit()` bumps version atomically and emits `revision.committed`
2. WorkflowService tracks clean/dirty/saving/dirtyWhileSaving correctly
3. SaveQueue serializes — never concurrent saves, pending supersedes
4. Snapshot isolation — in-flight save unaffected by concurrent edits
5. Given revisions 41→42→43→44, only revision 44 is persisted
6. Failed save leaves document dirty for retry
7. PublishService reads state via WorkflowService methods (encapsulated)
8. All 74 editor test files + 108 compiler tests pass
