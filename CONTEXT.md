# NAVI Domain Glossary

## Editing Engine

### Editing States
Mutually exclusive interaction states for the Interior Editor.

| State | Description |
|-------|-------------|
| **Idle** | Nothing in progress. Canvas navigable (pan/zoom). Selection may exist. |
| **Drawing** | Accumulating polygon points on click. |
| **Selecting** | Single-click selects entity. Drag marquee multi-select. |
| **Moving** | Entity translates with pointer. On mouse-up, dispatches geometry operation. |
| **Vertex Editing** | Vertex handles visible. Drag handle to move it. |
| **Panning** | Temporary modifier (Space held). All tools suspended. |

### Interaction Rules (Invariants)
- Only one active tool at a time.
- Only one editing state at a time.
- Drawing cannot occur during Move.
- Vertex Editing cancels Drawing.
- Selection persists while changing tools.
- Space temporarily overrides everything with Pan.

### Editing Lifecycle
Every edit follows: **Start → Preview → Validate → Commit → Autosave → Mark Dirty**

- **Start**: User initiates an action (click, drag, keypress).
- **Preview**: Visual feedback during the action (entity follows cursor, polygon preview, marquee rectangle).
- **Validate**: Local validation before commit (self-intersection, minimum points, bounds check).
- **Commit**: Dispatch command that mutates document.
- **Autosave**: Service persists document state.
- **Mark Dirty**: Set appropriate flag (geometry → also sets compiler dirty; metadata → no compiler impact).

The compiler is NOT run during the lifecycle. Only the dirty flag is set.

### Selection Engine
Selection is the primary context of the Interior Editor. Everything reacts to what is selected.

### Editing Operations
Every editing action reduces to exactly one of these operations, grouped by domain:

**Geometry:**
| Operation | Example |
|-----------|---------|
| **Create** | Room Tool → Create Polygon |
| **Delete** | Select + Delete key |
| **Move** | Drag entity body |
| **Resize** | Drag vertex handle |
| **Split** | Divide polygon at line |
| **Merge** | Combine adjacent polygons |

**Metadata:**
| Operation | Example |
|-----------|---------|
| **Rename** | Inspector label edit |
| **Assign** | Change category/type/properties |

### Dirty State
Four independent dirty flags:

| Flag | Triggered by | Compiler impact |
|------|-------------|-----------------|
| **Geometry Dirty** | Room moved, hallway resized, vertex adjusted | Sets Compiler Dirty |
| **Metadata Dirty** | Room renamed, category changed | No compiler impact (annotation only) |
| **Asset Dirty** | Panorama replaced, QR re-assigned | Sets Compiler Dirty if geometry-anchored |
| **Compiler Dirty** | Set automatically by Geometry Dirty | Triggers navigation rebuild |

### Validation Levels

| Level | Scope | Examples |
|-------|-------|---------|
| **Editing Validation** | Current operation | Self-intersection, minimum points, bounds check |
| **Geometry Validation** | Floor/entity state | Polygon closed, overlapping rooms, orphaned entrances |
| **Navigation Validation** | Full graph | Connectivity, bridge completeness, anchor integrity |

Navigation Validation is named after the domain, not the implementation.

## Phase Roadmap
```
✅ Phase 1  — Building Inspector Redesign
✅ Phase 2  — Floor Manager Dialog
✅ Phase 3  — Context Header
✅ Phase 4  — Tool Dock
⬜ Phase 4.5 — Editing Engine (states, lifecycle, operations, selection, validation)
⬜ Phase 4.6 — Engine Integration Verification (prove every mutation flows through engine)
⬜ Phase 5  — Bridge Validation
⬜ Phase 5.5 — Compiler Integration (dirty flags, incremental compile, build status)
⬜ Phase 6  — Terminology Migration

After Phase 6: architecture v1.0 stable. Shift to feature development.
```

## Architecture Principles
- **Ownership**: Every domain has exactly one owning workspace (see ADR-017)
- **Boundary**: Compiler boundary separates editable from generated (see ADR-016)
- **Direction**: Data always flows forward through the pipeline, never backward

## Pipeline
```
Campus Workspace
        │
        ▼
Interior Editor
        │
        ▼
Editing Engine
        │
        ▼
CampusDocument
        │
        ▼
Graph Compiler
        │
        ▼
Navigation Package
        │
        ▼
Runtime
```
