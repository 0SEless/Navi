# ADR-019: Editing Engine Adoption — Mutation Audit Completion

**Status:** Accepted
**Date:** 2026-07-19
**Supersedes:** N/A
**Superseded by:** N/A
**Related:** ADR-016 (Document Model), ADR-017 (Workspace Architecture), ADR-018 (Editing Operations)

## Context

The Editing Engine (ADR-018) defined an operation pipeline for all user-initiated mutations: `begin → validate → commit → markDirty → dispatch`. Through Stages A–C.5, the engine was implemented and wired into geometry and metadata editing paths.

Before removing legacy code paths (Stage D), a mutation audit (Phase 4.6) was required to verify that **every user-initiated mutation enters the Editing Engine** — no direct mutations bypass it.

## Audit Findings

A systematic grep of every `dispatcher.execute()` call in production code identified:

| Classification | Count | Description |
|---|---|---|
| ENGINE (correct) | 37 | begin/commit before dispatch |
| LEGACY (fixed in audit) | 8 | Dispatched directly — fixed during Phase 4.6 |
| LEGACY (Stage D target) | 18 | Legacy tools/panels in packages/editor — scheduled for deletion |
| ADAPTER (expected) | 3 | Undo/redo in history.ts, handler execute in dispatcher.ts |
| TOOL_ACTION (not mutation) | 2 | View-switching commands |
| REMNANT (inert) | 1 | useToolController — no active senders |

### Fixes applied during audit

1. **Dirty flag contract**: `markMetadataDirty()` now also sets `compilerDirty = true`. Metadata changes (rename, assign) affect runtime-visible output and must trigger recompilation.

2. **CreateOperation expanded**: Added `'building'` and `'road'` to `entityType` union.

3. **ModifyGeometry operation added**: New operation kind for non-resize geometry edits (road vertex editing, boundaries, etc.).

4. **8 legacy sites migrated**:
   - `useFloorDrawing.ts` — entrance/staircase create
   - `useEntrancePlacer.ts` — entrance create
   - `ConfirmOverlay.tsx` — building/road create
   - `useVertexEditor.ts` — road polyline geometry (via ModifyGeometry)
   - `building-props.tsx` — building delete

## Decision

The Editing Engine is adopted as the **sole entry point for all user-initiated document mutations**. The following contract is enforced:

```
User Action → Editing Engine (begin → validate → commit → markDirty)
                ↓
           Dispatcher (mutation adapter — Strangler Fig compatibility)
                ↓
           CampusDocument
```

### What the engine owns
- All 9 operation types: `create`, `delete`, `move`, `resize`, `modifyGeometry`, `split`, `merge`, `rename`, `assign`
- Dirty flag tracking (geometry, metadata, asset, compiler)
- Validation pipeline
- State machine lifecycle
- Selection model

### What the engine does NOT own
- Document mutation (delegated to dispatcher until Stage D)
- Undo/redo history
- Event emission
- Toolbar or tool registry state

## Consequences

Positive:
- All mutations now flow through a single validation and dirty-tracking pipeline
- The architecture matches the design: Tools → Engine → Document → Compiler → Runtime
- Stage D cleanup becomes a mechanical deletion task (no migration risk)

Negative:
- Property panel components now have an additional dependency (`useEditingEngine`) — this is temporary until Stage D removes the old dispatcher calls
- Floor CRUD operations (FloorManager, FloorManagerDialog) still bypass the engine — these are in legacy code targeted for Stage D removal

## Migration Status (end of Phase 4.6)

| Operation | Engine | Stage |
|---|---|---|
| Create (space/hallway/elevator) | ✅ | C |
| Create (entrance/staircase) | ✅ | 4.6 |
| Create (building/road) | ✅ | 4.6 |
| Delete (canvas/explorer/props) | ✅ | C / 4.6 |
| Move | ✅ | C |
| Resize | ✅ | C |
| ModifyGeometry (road vertex) | ✅ | 4.6 |
| Rename | ✅ | C.5 |
| Assign (all property edits) | ✅ | C.5 |
| Floor CRUD | ❌ | Stage D target |
