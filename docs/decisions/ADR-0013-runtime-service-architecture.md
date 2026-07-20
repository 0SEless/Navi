# ADR 013: Runtime Service Architecture

**Status:** Accepted
**Date:** 2026-07-17
**Author:** Architecture review

## Context

M1–M5 established a complete infrastructure pipeline:

```
CampusDocument
    ↓
Compiler
    ↓
NavigationArtifacts
    ↓
Publisher
    ↓
NavigationPackage
    ↓
Loader
    ↓
LoadedPackage
    ↓
RuntimeEngine
```

The pipeline is frozen (Architecture Principle 9). M6 introduces runtime behavior. The question is no longer how data moves, but how applications consume that data.

## Decision

Introduce a **Capability Façade** pattern. Applications interact only with `RuntimeEngine`. Internal domains are organized as capabilities — each owning one domain, initialized from `LoadedPackage`, and exposing a stable public API.

### Capability Façade

```
Application
      │
      ▼
RuntimeEngine
      │
 ┌────┴───────────────────────┐
 │                            │
NavigationCapability
SearchCapability
BuildingCapability
LocationCapability
PanoramaCapability
...
```

Applications never instantiate capabilities directly. Every capability is accessed through `RuntimeEngine`.

### Capability Definition

A capability:

- owns one domain
- is initialized from `LoadedPackage`
- exposes a stable public API
- may depend on other capabilities through `RuntimeEngine`
- contains no persistence
- contains no filesystem logic
- contains no package parsing

### Capability Rules

Every capability must satisfy:

- Single responsibility
- Immutable package input
- No hidden global state
- Deterministic behavior
- Independently testable
- Replaceable implementation

### RuntimeEngine Responsibilities

`RuntimeEngine` should only:

- construct capabilities
- own shared package state
- coordinate cross-capability calls
- expose the public façade
- manage lifecycle

It must never contain routing algorithms, search algorithms, or business logic.

### Dependency Rule

```
Infrastructure
        ↓
LoadedPackage
        ↓
Capabilities
        ↓
Application
```

Never:

```
Capability → Compiler
Capability → Publisher
Capability → Loader
```

Capabilities consume infrastructure. Infrastructure never knows capabilities exist.

### Extension Rule

Adding a capability must not require modifying:

- Compiler
- Publisher
- Loader
- `LoadedPackage` format

unless the feature genuinely requires new published data. This is the architectural payoff of M1–M5.

### Public API Philosophy

Applications talk to one object:

```ts
engine.navigation.findRoute(...)
engine.search.search(...)
engine.buildings.get(...)
engine.location.resolve(...)
```

Internally these are different services. Externally they're one runtime.

### Future Compatibility

Capabilities are **pluggable modules of the runtime**, not hardcoded subsystems. This doesn't mean implementing a plugin system now. It means preserving the architecture so that adding capabilities like accessibility, events, emergency routing, shuttle tracking, indoor positioning, or analytics does not require redesigning `RuntimeEngine`.

## Consequences

### Positive

- Applications have a single, stable entry point
- Capabilities can be developed, tested, and replaced independently
- The pipeline remains frozen — M6+ work never reopens M1–M5
- Adding new capabilities requires no changes outside the runtime package
- Internal engine changes (e.g., replacing A*) don't affect consumers

### Negative

- Capability decomposition requires upfront design to avoid leaking concerns across boundaries
- Cross-capability coordination (e.g., routing + accessibility) adds orchestration complexity
- If capabilities grow too coupled, the façade becomes a pass-through with no value
- The capability pattern adds indirection compared to exposing engines directly

## Alternatives Considered

| Alternative | Pros | Cons | Reason Rejected |
|---|---|---|---|
| Expose engines directly (RoutingEngine, SearchEngine, etc.) | Simple, no indirection | Consumers couple to engines, harder to refactor internally | Violates Principle 7 (Capability Façade) |
| Single monolithic RuntimeAPI class | Trivial to consume | No domain boundaries, hard to test, grows without structure | Unsustainable |
| Plugin-based capability loading | Maximum extensibility | Premature abstraction, no current need for dynamic loading | YAGNI |
| Capability Façade (this ADR) | Stable public API, independent domains, testable | Indirection, coordination cost | Accepted — best balance |

## Related

- Architecture Principle 3 — Infrastructure Independence
- Architecture Principle 7 — Capability Façade
- Architecture Principle 9 — Closed Infrastructure, Open Capabilities
- ADR-009: Compiler Pipeline
- ADR-010: Package Format
- ADR-011: Publisher
- ADR-012: Loader
