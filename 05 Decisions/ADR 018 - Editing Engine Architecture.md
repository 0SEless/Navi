# ADR 018: Editing Engine Architecture

**Status:** Accepted
**Date:** 2026-07-19

## Context

The Interior Editor (formerly FloorEditor) evolved incrementally from graph-store mutations to document-command dispatching. As of Phase 4 (Tool Dock), the editor has:

- A tool registry with activation/deactivation
- An ad-hoc selection state via SelectionManager
- Command handlers that mutate CampusDocument
- A confirmation workflow for polygon drawing

What it lacks is a unified model for how editing works — the lifecycle, the state machine, the validation tiers, and the compiler integration.

Three problems emerge without this model:

1. **Scattered invariants.** Drawing guardrails, selection rules, and tool conflicts are enforced in different places with different patterns. New tools must rediscover these patterns.
2. **No operation vocabulary.** Every tool implements its own mutation logic. "Create", "Delete", "Move", and "Rename" are not explicit concepts — they're emergent patterns in command handlers.
3. **Implicit compiler coupling.** The editor has no explicit dirty state. Any mutation could trigger recompilation. Without a model for what changed (geometry vs metadata vs assets), incremental compilation is impossible.

This ADR defines the Editing Engine as an explicit architectural layer between the UI and the document.

## Decision

The Interior Editor shall have an explicit Editing Engine with six subsystems:

### 1. State Machine

Six mutually exclusive states: Idle, Drawing, Selecting, Moving, Vertex Editing, Panning.

The state machine is the single source of truth for "what is happening right now." All UI components read from it. No component maintains its own interaction state.

Invariants:
- Exactly one state at all times
- Panning is a temporary modifier (not a tool) — Space suspends the current state and returns to it on release
- State transitions are atomic and synchronous

### 2. Interaction Rules

Rules are invariants, not suggestions:

- Only one active tool at a time
- Only one editing state at a time
- Drawing cannot occur during Move
- Vertex Editing cancels Drawing
- Selection persists while changing tools
- Space temporarily overrides everything with Pan

These are enforced by the state machine, not by individual UI components.

### 3. Editing Lifecycle

Every mutation follows exactly five steps:

**Start → Preview → Validate → Commit → Autosave → Mark Compiler Dirty**

- **Start**: User initiates an action (click, drag, keypress)
- **Preview**: Visual feedback during the action (entity follows cursor, polygon preview, marquee rectangle)
- **Validate**: Local validation before commit (self-intersection, minimum points, bounds check)
- **Commit**: Dispatch command that mutates document
- **Autosave**: Persist document state
- **Mark Compiler Dirty**: Flag set only if geometry changed

The compiler is NEVER run during the lifecycle. Only the dirty flag is set. Compilation is a separate concern triggered by the compiler service.

### 4. Editing Operations

Every editing tool reduces to exactly one of eight operations, grouped by domain:

**Geometry:** Create, Delete, Move, Resize, Split, Merge
**Metadata:** Rename, Assign

This is the universal vocabulary. New tools don't implement custom mutation logic — they implement tool behavior (how the user interacts) and then map to an operation (what the tool does).

Operations are building blocks. The Room Tool → Create (Polygon). The Move Tool → Move (Entity). Inspector rename → Rename (Property).

### 5. Selection Engine

Selection is the primary context of the Interior Editor. Everything — Inspector, Explorer, Context Header, Tool availability, Validation — reacts to what is selected.

Selection state: `selectedIds: Set<string>`, `lastSelectedId: string | null`.

Multi-selection modes: Shift+Click (toggle), Ctrl+Click (platform parity), marquee drag (rectangular bounds).

### 6. Dirty State

Four independent dirty flags:

| Flag | Meaning | Example |
|------|---------|---------|
| **Geometry Dirty** | Spatial properties changed | Room moved, vertex adjusted, entity deleted |
| **Metadata Dirty** | Non-spatial properties changed | Room renamed, category changed |
| **Asset Dirty** | Asset references changed | Panorama replaced, QR assigned |
| **Compiler Dirty** | Compiler needs attention (set automatically by Geometry Dirty) | Navigation rebuild required |

Geometry Dirty automatically sets Compiler Dirty. Metadata Dirty does not. Asset Dirty sets Compiler Dirty only if geometry-anchored assets changed. The engine explicitly declares compiler attention rather than making the compiler infer it.

### 7. Validation Levels

Three tiers, each with different scope and cost:

| Level | Scope | When run | Cost |
|-------|-------|----------|------|
| **Editing Validation** | Current operation only | During Preview step (before Commit) | Cheap — O(1) or O(n) on current entity |
| **Geometry Validation** | Single floor or entity group | After Commit, on dirty flag | Moderate — O(n) per floor |
| **Navigation Validation** | Full graph connectivity | During publish / explicit build | Expensive — full graph walk |

Navigation Validation is named after the domain (navigation integrity), not the implementation (compiler). The compiler may change; the validation concept won't.

## Consequences

### Positive

- **Predictable editing.** Every tool follows the same lifecycle. New tools implement behavior hooks, not ad-hoc mutation logic.
- **Decoupled compilation.** The editor sets dirty flags. The compiler service decides when to compile. This is a clean interface between two subsystems.
- **Testable in layers.** The state machine, validation tiers, and dirty state can be unit tested independently of UI components.
- **Explicit vocabulary.** Geometry Operations give the team a shared language. Code reviews discuss "Create vs Move" rather than "the thing where the polygon gets made."
- **Incremental compilation becomes possible.** Dirty flags are the prerequisite for compiling only what changed.

### Negative

- **Upfront design cost.** Before writing a new tool, the team must map it to an operation and lifecycle. This is overhead for simple tools.
- **State machine discipline required.** A component that bypasses the state machine and sets its own interaction state would violate the model. Enforcing this requires code review discipline.
- **Six subsystems to maintain.** The Editing Engine is not a single module — it's six interrelated concepts that must stay consistent.

## Related

- ADR-016 (Compiler Boundary) — defines the editable/generated boundary; the Editing Engine's dirty flags and validation exist entirely on the editable side
- ADR-017 (Workspace Ownership Principle) — the Editing Engine operates within the Interior Editor's owned domain (interior geometry)
- Phase 4.5 SPEC (Editing Engine) — detailed implementation spec for each subsystem
- Phase 5.5 SPEC (Compiler Integration) — the compiler's relationship to dirty flags, build status, and publish flow
