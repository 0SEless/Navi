# ADR 007 - Document Transaction Model and Revision-Based Autosave

**Status:** Accepted
**Date:** 2026-07-16
**Author:** opencode Architecture Agent

## Context

S-010 (the stabilization milestone) identified that the editor lacked a
**transaction boundary** for document mutations. Before S-010:

1. Commands mutated `CampusDocument` directly, then emitted `'document.changed'`
   as a catch-all event.
2. Autosave, Workflow dirty-tracking, and Validation each independently
   decided *what* changed by diffing the document — an O(n) operation on every
   edit, and one that easily missed edge cases (history undo, batch operations).
3. Autosave had no serialization guarantee: concurrent saves could race, and
   a stale save (from a debounce that fired after a newer edit) could overwrite
   the latest document state with old data.
4. There was no single authoritative "version number" that all services could
   reference — `document.version` was bumped by `recordChange()` via the change
   journal, but History, Workflow, and Autosave each tracked their own counter.

These gaps are invisible under single-user editing with 5s debounce, but they
become correctness bugs under:
- **Rapid edits** (keyboard repeat, programmatic batch operations)
- **Undo/redo** (restores old document state without incrementing a global version)
- **Future collaborative editing** (OT/CRDT requires an authoritative revision
  sequence)
- **Cloud sync / backup** (needs a consistent snapshot, not a possibly-mid-mutation
  state)

## Decision

`DocumentStore.commit()` is the **single transaction boundary**. Every document
mutation — command execution, history undo/redo, programmatic batch — calls
`commit()` to finalize the mutation. `commit()` atomically:

1. Bumps `this._version++`
2. Emits `'revision.committed'` event on the EventBus

No other service or component emits or handles raw document mutations. All
reactions (autosave debounce, workflow state transition, validation markDirty)
listen to `'revision.committed'`.

### Architecture

```
Command / History / Programmatic
        │
        ▼
  DocumentStore.commit()
        │
        ├── version++
        │
        └── 'revision.committed' event
                  │
        ┌─────────┼──────────┐
        ▼         ▼          ▼
  Autosave   Workflow    Validation
  (debounce) (state)    (markDirty)
```

### SaveQueue Contract

`AutosaveService` owns an internal `SaveQueue` with three states:

- `idle` — no pending or active save
- `saving` — an async save is in flight
- `pending` — a save is queued after the current one

The queue enforces:
- At most 1 active save + 1 pending save at any time.
- If a new save is scheduled while `pending`, the older pending is superseded
  (the latest version wins).
- `executeSave(version)` captures `documentStore.getSnapshot()` at schedule
  time, not execution time (snapshot isolation).

### Stale-Save Detection

`executeSave(version)` checks `if (documentStore.version > version)` at
execution time. If the version has moved past the scheduled version, the save
skips — the document has been modified since the save was scheduled, and a
newer save is already queued or will be.

### WorkflowService State Machine

`WorkflowService` does NOT own save logic. It only tracks state via a
`SaveState` enum:

```
saved → dirty → saving → dirtyWhileSaving → dirty → saved
                         → dirtyWhileSaving → saving
```

- `revision.committed` → `mutate()`: `saving` → `dirtyWhileSaving`, `saved` → `dirty`
- `saveRequested()` → `saving`
- `saveComplete()` → `dirtyWhileSaving` resets to `dirty` for re-save
- `saveFailed()` → `dirty` for retry

## Consequences

### Positive

- **Single source of truth for versions.** `DocumentStore.version` is the
  authoritative revision counter. History, Workflow, and Autosave all reference
  it instead of maintaining their own.
- **No autosave race conditions.** SaveQueue serializes saves; stale-save
  detection prevents out-of-order overwrites; snapshot isolation ensures each
  save captures the state from when it was scheduled, not when it executes.
- **Future-proof for collaboration.** OT/CRDT algorithms need exactly this
  transaction boundary and revision sequence.
- **WorkflowService is lightweight.** It only tracks state; it doesn't own
  debounce, queue, persistence, or scheduling — those are in AutosaveService.
- **Event-driven reactions are predictable.** Every service reacts to
  `'revision.committed'` in the same tick, in registration order. No service
  needs to guess whether a mutation happened.

### Negative

- **Mandatory commit() discipline.** Every code path that mutates the document
  must call `commit()`. Forgetting it means no reactions fire and the UI becomes
  stale. Enforced by making `DocumentStore.document` read-only (setter is
  private) — all mutations must go through `commit()`.
- **History undo/redo required adaption.** The History service's undo/redo
  replaces the document and must call `commit()` explicitly. This was already
  the pattern but is now mandatory.
- **Autosave becomes a two-hop path:** `revision.committed` → debounce →
  SaveQueue → `executeSave`. The indirection is necessary for correctness but
  adds complexity for junior contributors.

## Architectural Invariants

```
CampusDocument
       │
       ▼
DocumentStore.commit()
       │
       ▼
revision.committed event
       │
       ▼
workflow.mutate() │ autosave.debounce() │ validation.markDirty()
```

Every mutation follows this flow. These invariants are enforced during code
review and are absolute:

1.  **Commands never emit events directly.** A command calls
    `documentStore.commit()` after mutating the document. It never calls
    `eventBus.emit('revision.committed')` or any other event. Events flow only
    from `commit()`.

2.  **Autosave never mutates documents.** AutosaveService reads
    `documentStore.getSnapshot()` and calls `workflow.save()`. It never calls
    `documentStore.commit()` or directly modifies `CampusDocument`.

3.  **Validation never mutates documents.** ValidationEngine reads the document
    snapshot and produces issues. It never calls `commit()`, `save()`, or any
    persistence method.

4.  **WorkflowService never performs saves.** WorkflowService transitions state
    and delegates to `persistence.save()`. It does not own debounce, queue
    scheduling, or persistence logic.

5.  **PublishService never mutates documents.** PublishService validates,
    compiles, and persists artifacts. It never calls `commit()` or modifies
    `CampusDocument`.

6.  **Only DocumentStore increments the revision counter.**
    `DocumentStore._version` is incremented exclusively inside `commit()`. No
    other service reads or writes the revision counter directly.

## Alternatives Considered

| Alternative | Pros | Cons | Reason Rejected |
|---|---|---|---|
| Keep `document.changed` as catch-all | simplest, least change | no authoritative version; services diff independently; race conditions under rapid edits | contradicts every stated goal |
| Put transaction in CommandDispatcher only | dispatcher already owns command execution | History undo/redo bypasses dispatcher; programmatic mutations also bypass | not comprehensive |
| WorkflowService owns save queue + debounce + schedule | single service for all save concerns | violates SRP; creates a god service; WorkflowService should only track state | AutosaveService is a separate concern |
| Use RxJS or similar for reactive saves | powerful streaming API | new dependency; overkill for 3-state queue; team doesn't know RxJS | KISS |

## Related

- Depends on: ADR 006 (CampusDocument as Source of Truth) — the transaction
  model assumes `CampusDocument` is the single authoring model.
- Referenced by: `packages/editor/src/context/document-store.ts`,
  `packages/editor/src/services/autosave-service.ts`,
  `packages/editor/src/services/workflow-service.ts`,
  `packages/editor/src/eventbus.ts`
- Supersedes: the implicit "`document.changed` is the only edit event" pattern
  that existed before S-010.
- Enables: M5/M6 (multi-floor navigation), cloud sync, collaborative editing.
