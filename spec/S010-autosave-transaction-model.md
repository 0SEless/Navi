# S-010 — Document Transaction Model & Autosave

## WHAT

Replace time-based debounce autosave with a revision-based transaction model. Every save serializes one immutable, fully committed document revision. No save ever races with an edit, another save, history, validation, or graph sync.

## Invariant

> **Every save must serialize one immutable, fully committed document version.**
> Never: half a command, mid-validation, mid-graph sync, partially updated selection/floor hierarchy.
> Only committed states.

## Architecture

```
Command → Apply → Commit Revision → Snapshot → History + Validation + Autosave
                                  ↑                        ↓
                                Live Doc            SaveQueue (serialized)
```

### Key Changes

1. **Revision counter** — Monotonic `document.version` is the source of truth. Every mutation commits a new revision atomically.
2. **Save queue** — At most one active save + one pending save. No concurrent writes. Pending save always captures the latest revision.
3. **Snapshot isolation** — Save serializes `clone()` of the document at the revision it was scheduled for. Live mutations during upload are invisible to the in-flight save.
4. **Stale-save detection** — Before writing, compare scheduled revision vs current revision. If outdated, discard.
5. **Shared commit boundary** — History snapshot, validation, graph sync, and autosave all observe the same committed revision. Not separate windows into a mutating object.

## State Machine

```
Clean ──→ Dirty ──→ Saving ──→ DirtyWhileSaving ──→ Saving ──→ Clean
                  ↑                                          │
                  └────── Save fails ────────────────────────┘
```

- `Clean` — document matches last saved revision
- `Dirty` — unsaved edits exist
- `Saving` — save in progress
- `DirtyWhileSaving` — edit arrived during save; triggers immediate re-save when current save finishes

No boolean flags. Single state enum.

## Save Queue Contract

```
SaveQueue:
  state: Idle | Saving | Pending

  schedule(version):
    if state === Idle → start save(version), state = Saving
    if state === Saving → record pending = version, state = Pending
    if state === Pending → update pending = version (newer revision supersedes)

  onSaveComplete:
    if state === Pending → start save(pending), state = Saving
    if state === Saving → state = Idle
```

## Success Criteria

1. **No concurrent saves** — Two overlapping save calls serialize correctly (first finishes, second runs with latest revision).
2. **Rapid edits → 1 save** — 100 rapid edits produce exactly 1 save (the final revision).
3. **Edit during save** — User edits while save is in-flight; current save finishes, then a second save immediately runs with the newer revision.
4. **Failed save** — Failed save leaves document dirty; retry succeeds; state returns to clean.
5. **Save ordering** — Newer revisions never overwritten by older ones.
6. **Stale save discarded** — If save was scheduled for R42 but the document is now at R44, the save is skipped.
7. **beforeunload** — Dirty document triggers `beforeunload` to warn user. (Flush-to-sync deferred — Phase 2 concern.)
8. **Shared commit boundary** — History, validation, graph sync all observe the same committed document version as the autosave.
9. **Existing tests pass** — All 74 editor test files, 108 compiler tests green.

## Non-goals

- ❌ No cloud sync / multi-device conflict resolution
- ❌ No `beforeunload` flush save (deferred)
- ❌ No change to persistence backend (still writes to store)
- ❌ No UI changes (save indicator stays same)
- ❌ No debounce removal (debounce triggers the `schedule` call; the queue replaces the write)

## Pitfalls from ERRORS.md

- Previous bug: `workflow.isSaving()` returned true during entire save, blocking publish — solved by state machine
- Serialization must clone document before async work; never pass a reference to the live mutable document
- Save queue must handle the edge case where `pending` revision is set multiple times before first save completes
- beforeunload must not be added in tests (jsdom limitation)
