# ADR 016: Compiler Boundary

**Status:** Accepted
**Date:** 2026-07-19

## Context

Over M1–M5 the project established a multi-stage pipeline: editor geometry flows to the compiler, the compiler produces navigation artifacts, the publisher packages them, and the runtime consumes them. During M3.2.2 UX alignment discussions it became clear that this pipeline implies an architectural boundary that had never been explicitly documented.

Without an explicit boundary, future features risk either:
- Editing generated artifacts directly (violating the pipeline's determinism guarantee)
- Bypassing the compiler and writing navigation graph nodes manually
- Coupling editing tools to runtime concerns (e.g. placing QRs inside the Interior Editor)

The boundary exists implicitly in every ADR-009-onward decision. This ADR names it explicitly.

### The architecture is directional

This ADR and ADR-017 share one foundational principle:

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

No arrows upward. No shortcuts. No cycles.

### The boundary

```
Above — Editable · User-created · Source of truth
─────────────────────────────────────────────────
                    │
         Compiler Boundary
                    │
─────────────────────────────────────────────────
Below — Generated · Read-only · Replaceable
```

## Decision

There is a **Compiler Boundary** between all editing workspaces and all compiled/generated artifacts.

### Rules

**Rule 1: Editors only modify source geometry.** Campus Workspace modifies campus geometry (buildings, roads, outdoor traces). Interior Editor modifies interior geometry (rooms, hallways, stairs, entrances, elevators). Neither workspace writes navigation graph nodes, edges, or routing metadata.

**Rule 2: The compiler is the only component that derives navigation behavior from editable geometry.** The compiler pipeline (see ADR-009) produces all compiled artifacts from source geometry. This includes navigation graph construction, node/edge derivation, entrance bridges, floor connectivity, search indexes, building indexes, validation artifacts, and runtime optimization data. No other component may generate these artifacts.

**Rule 3: Generated artifacts are never manually edited.** NavigationPackage contents, compiled graph JSON, search indexes, and building indexes are write-once outputs of the compiler. Any manual edit to these files will be overwritten on the next compile. The publisher (see ADR-011) enforces immutability of the output directory.

**Rule 4: Runtime consumes compiled artifacts only.** The runtime engine (see ADR-013) never reads editor documents or raw geometry. It consumes only the compiled NavigationPackage (see ADR-010, ADR-012). This guarantees that runtime and editor can evolve independently as long as the compiler contract is stable.

### Visual summary

```
Campus Geometry  ──┐
                   ├──→ Editor Workspaces
Interior Geometry ─┘
                         │
              Compiler Boundary
                         │
                         ▼
              Compiled Navigation Package
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
        Navigation   Search    Entrance
          Graph      Index     Bridges
              └──────────┬──────────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
          Building   Runtime    Validation
           Index    Metadata    Artifacts
                         │
                         ▼
                    QR Manager
                         │
                         ▼
                     Runtime
```

## Consequences

### Positive

- **Clear decision rule for new features.** If a proposed feature writes to a compiled artifact (nav graph, package, index), it belongs on the wrong side of the boundary.
- **Safe to regenerate.** Any artifact below the boundary can be regenerated from source geometry without loss.
- **Independent iteration.** Editor UX and runtime performance can be improved independently as long as the compiler contract is stable.
- **Explains existing constraints.** Why don't editors edit nav nodes? Why does QR generation need the compiler output? Because they're on opposite sides of this boundary.

### Negative

- **Must resist convenience.** When a feature could be implemented faster by writing a nav node directly, the boundary forces the slower but correct path through the compiler.
- **Compiler becomes a chokepoint.** All navigation behavior depends on the compiler producing correct output. If the compiler has a bug, there's no escape hatch. (Mitigation: compiler has its own test suite — see ADR-009.)

## Related

- ADR-009 (Compiler Pipeline and Navigation Primitive Generation) — defines what the compiler produces
- ADR-010 (Navigation Package Format) — defines the artifact format below the boundary
- ADR-011 (Publisher Architecture) — enforces output immutability
- ADR-012 (Runtime Loader Architecture) — consumes artifacts from below the boundary
- ADR-013 (Runtime Capability Architecture) — runtime never reads above the boundary
- ADR-017 (Workspace Ownership Principle) — defines who owns each domain
