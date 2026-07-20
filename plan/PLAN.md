# M3.2.2 UX Architecture Alignment

## Phase Order

```
✅ Phase 1   — Building Inspector Redesign (done)
✅ Phase 2   — Floor Manager Dialog (done)
✅ Phase 3   — Context Header (done)
✅ Phase 4   — Tool Dock (done)
⬜ Phase 4.5 — Editing Engine (current) — states, lifecycle, operations, selection, validation
⬜ Phase 4.6 — Engine Integration Verification — prove every mutation flows through the engine
⬜ Phase 5   — Bridge Validation
⬜ Phase 5.5 — Compiler Integration — dirty flags, incremental triggers, build status, autosave→compiler flow
⬜ Phase 6   — Terminology Migration
```

See spec/M3.2.2-P4.5-EDITING-ENGINE.md for the current phase.

## Guiding Principles

1. **Design first, implementation second.** Every phase starts with a written spec.
2. **Editing Engine before compiler integration.** Phase 4.5 defines the lifecycle and dirty flags that Phase 5.5 depends on.
3. **Compiler integration after bridge validation.** Bridge Validation (Phase 5) is one tier of compiler validation — Phase 5.5 completes the pipeline.
4. **Terminology migration last.** Room→Space, FloorEditor→InteriorEditor only after architecture is frozen.

## Ownership Map

| Layer | Owned by | |
|-------|----------|---|
| Campus | Campus Workspace | Building placement, roads, outdoor graph |
| Building Interior | Interior Editor | Rooms/spaces, hallways, indoor entities |
| Navigation Compilation | Graph Compiler | Graph assembly, validation, artifact output |

No layer edits compiled routing artifacts directly.

## Phase 4.5 Implementation Strategy

Build from the inside out, not top-to-bottom.

### Stage A — Editing Engine Core (framework-agnostic library)

Location: `packages/editing-engine/` — zero knowledge of React, Zustand, MapLibre, canvas, or panels.

Build subsystems in dependency order:

```
1. EditingStateMachine   ← everything depends on it
2. SelectionModel         ← independent, fully testable immediately
3. DirtyTracker           ← independent, very small
4. Editing Operations     ← describe intent, don't mutate directly
   Create, Move, Resize, Rename, Delete...
5. ValidationPipeline     ← consumes operations, returns results
6. EditingSession         ← orchestrator: state → operation → validation → command → dirty tracker
```

### Stage B — Adapter Layer (React wiring)

```text
useEditingEngine()
        │
EditingSession
        │
existing CommandBus
        │
CampusDocument
```

If Stage A is good, Stage B is mostly wiring. The React hook is a thin consumer, not the owner.

### Stage C — Tool Migration (one at a time)

- Room Tool → `begin(Create)`
- Hallway Tool → `begin(Create)`
- Move → `begin(Move)`
- Vertex drag → `begin(Resize)`
- Delete → `begin(Delete)`

### Stage D — Remove old interaction code

Strangler Fig pattern — only remove after all tools migrated.

## Phase 4.6 — Engine Integration Verification (hard gate)

Do not start Phase 5 until every mutation flows through the engine.

Checklist:

- [ ] Create Space
- [ ] Delete Space
- [ ] Move Space
- [ ] Resize Space
- [ ] Rename Space
- [ ] Assign Properties
- [ ] Create Hallway
- [ ] Create Entrance
- [ ] Undo
- [ ] Redo
- [ ] Autosave
- [ ] Dirty flags set correctly
- [ ] Validation runs at correct tier
- [ ] Compiler dirty propagation

Every row must show PASS before Phase 5 begins.

## Process Rule (Architecture Freeze)

> No implementation may introduce a new architectural concept without first updating or adding an ADR.

This does not mean every feature needs an ADR. It means: if you are tempted to invent a new subsystem, bypass a boundary, or change ownership, stop and document the architectural decision first.
