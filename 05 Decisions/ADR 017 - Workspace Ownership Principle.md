# ADR 017: Workspace Ownership Principle

**Status:** Accepted
**Date:** 2026-07-19

## Context

NAVI Studio has multiple editing contexts (Campus Workspace, Interior Editor, Graph Compiler, QR Manager, Runtime), each with different concerns. Over the course of M1–M3.2.2 UX alignment, the project naturally converged on a pattern where each workspace owns exactly one layer of the campus model.

This pattern was enforced implicitly by code organization but never documented as a principle. Without an explicit ownership model, future features risk:

- Duplicating functionality across workspaces (e.g. editing building metadata in two places)
- Ambiguous responsibility (e.g. who owns entrance bridge configuration?)
- Circular dependencies between workspaces (e.g. Interior Editor importing from Campus Workspace)

### The architecture is directional

This ADR and ADR-016 share one foundational principle:

> **Data always flows forward through the pipeline and never backward.**

```
Campus
   ↓
Interior
   ↓
Compiler
   ↓
QR
   ↓
Runtime
```

No arrows upward. No shortcuts. No cycles. Every domain feeds only the next domain in the pipeline.

## Decision

Every domain of the campus model has exactly one owning workspace. The ownership is exclusive — no other workspace may modify that domain.

### Ownership Table

| Domain | Owner | Read-only consumers |
|--------|-------|-------------------|
| Campus boundary, building positions, roads | Campus Workspace | Interior Editor, Graph Compiler |
| Building metadata (name, color, height) | Campus Workspace | Interior Editor, Runtime |
| Interior geometry (rooms, hallways, stairs, elevators, entrances, panoramas) | Interior Editor | Graph Compiler |
| Navigation graph (nodes, edges, routing topology) | Graph Compiler | QR Manager, Runtime |
| QR deployment (entity→QR mapping, export) | QR Manager | Runtime |
| Navigation experience (route finding, search, location) | Runtime | — |

### Rules

**Rule 1: Every feature has exactly one owner.** If a proposed feature seems to belong to two workspaces, the design should be reconsidered rather than duplicated. The feature either lives entirely in one workspace or is split at a clean seam.

**Rule 2: Owners write, consumers read.** The owner of a domain is the only workspace that modifies it. All other workspaces treat that domain as read-only input.

**Rule 3: Consumers depend on contracts, not internals.** Read-only consumers depend on the owner's exported contract (types, selectors, service API), never on its internal representation. For example, the Graph Compiler reads interior geometry via the `CampusDocument` schema, never from Interior Editor's internal React state.

**Rule 4: Cross-workspace communication goes through the compiler boundary (ADR-016).** When a domain needs to cross from editable to generated, it passes through the compiler. Workspaces never reach across the boundary.

### Dependency diagram

```
Campus Workspace ──→ Interior Editor ──→ Graph Compiler ──→ QR Manager ──→ Runtime
      │                    │                    │                │
      └──── owns ──────────┘                    └──── owns ──────┘
   outdoor domain                         navigation artifacts

Editors (above compiler boundary)           Generated (below compiler boundary)
```

## Consequences

### Positive

- **No ambiguity.** Every piece of campus data has a known owner. New engineers know where to add code and where to read data.
- **No duplication.** If a feature already exists in one workspace, it doesn't need to be reimplemented elsewhere.
- **Decoupled development.** Teams (or solo engineers across sessions) can work on Campus Workspace and Interior Editor independently as long as the document schema is stable.
- **Explains the compiler's role.** The compiler exists precisely because interior geometry (owned by Interior Editor) needs to become navigation graph (owned by Graph Compiler), and the boundary between them is the compiler pipeline.

### Negative

- **Strict discipline required.** It is always tempting to add a "quick" read of another workspace's internal state. Enforcing contract-only dependencies requires discipline in code review.
- **Can feel indirect.** Updating building metadata requires going through Campus Workspace's document API even when you're working in Interior Editor. This is correct but indirect.

## Related

- ADR-016 (Compiler Boundary) — defines the editable/generated boundary that workspaces must respect
- ADR-006 (CampusDocument as Persistent Source of Truth) — the shared document schema
- ADR-009 (Compiler Pipeline) — the compiler as the transition between workspace domains
