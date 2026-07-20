# ADR 013: Runtime Capability Architecture

**Status:** Accepted
**Date:** 2026-07-17
**Author:** opencode Architecture Agent

## Context

ADR-009 through ADR-012 completed the runtime pipeline: the compiler (ADR-009) produces `NavigationArtifacts`, the publisher (ADR-011) writes them to a `NavigationPackage` (ADR-010), and the loader (ADR-012) reads that package into a `LoadedPackage`. ADR-012 explicitly deferred the question of how `RuntimeEngine` wires its sub-engines to a later ADR ("RuntimeEngine initialization ... is ADR-013 or equivalent").

During planning for M6, the project adopted a **Capability Façade** architecture for the runtime: the engine exposes a small set of domain-scoped services rather than the raw infrastructure beneath them. This decision was already implemented by the Navigation, Search, Building, and Location services (M6.1–M6.4) before this document was committed. This ADR records that decision so the architectural narrative stays internally consistent and future capabilities have a stable foundation to follow.

### Problem

Without an explicit capability model, applications must reach through the runtime into:

- `RoutingEngine`, `SearchEngine`, `PositionAPI` (ad-hoc sub-engines)
- `BuildingIndex`, `SearchIndex` (internal indexes)
- graph traversal, node lookup, package format details

This couples applications to implementation and makes the runtime hard to extend — every new feature risks becoming another ad-hoc sub-engine with its own construction and wiring.

### Forces

- The pipeline (M1–M5) is frozen and stable; new functionality must live entirely within the runtime layer without reopening infrastructure decisions.
- Each runtime feature answers a *product* question ("How do I get there?", "What am I looking for?", "Where am I?"), not a technical one.
- Capabilities should be independently testable against a `LoadedPackage` without a live engine.

## Decision

The runtime is organized as a **Capability Façade**. `RuntimeEngine` is constructed from a single `LoadedPackage` and exposes a fixed set of capability services. Each capability owns exactly one domain and answers exactly one product question.

```typescript
class RuntimeEngine {
  readonly search: SearchService
  readonly navigation: NavigationService
  readonly buildings: BuildingService
  readonly location: LocationService
  constructor(pkg: LoadedPackage) { /* wire capabilities */ }
}
```

### Capability Pattern

Every runtime capability follows the same construction pattern:

1. **Constructed from `LoadedPackage`.** A capability receives the loaded package (or the specific artifacts it needs) in its constructor. It does not call `load()` itself.
2. **Single responsibility.** A capability owns one domain and one product question. It does not reach into other capabilities' domains.
3. **No persistence.** Capabilities are read-only over the loaded data. They do not write, mutate, or cache package state.
4. **Stateless (where possible).** Capabilities hold references to loaded data but no mutable runtime state of their own. Position is passed in, not stored.
5. **Returns readonly domain types.** Every value crossing a capability boundary is immutable. Results are plain, readonly DTOs — not engine internals.
6. **Deterministic.** Given the same `LoadedPackage` and inputs, a capability returns the same output.

### RuntimeEngine Responsibilities

- Accept a `LoadedPackage` in its constructor.
- Construct and wire all capabilities.
- Expose capabilities as readonly properties.
- Own no navigation/search/positioning logic itself — that lives in the capabilities.

### Dependency Direction

Capabilities depend only on `@navi/core` types and the `LoadedPackage` they are given. They do not depend on each other directly. Cross-capability coordination, when needed, happens through `RuntimeEngine`, not through capability-to-capability calls.

```
@navi/core  (types)
     ▲
     │
RuntimeEngine
     ├── NavigationService
     ├── SearchService
     ├── BuildingService
     └── LocationService
```

### Public API Philosophy

The runtime API reads as product intent, not implementation. An application composes capabilities without naming any engine, index, or graph structure:

```typescript
const location  = engine.location.resolve(gps)
const library   = engine.search.search("Library")[0]
const route     = engine.navigation.findRoute(location.node.id, library.nodeId)
const building  = engine.buildings.get(library.buildingId)
```

### Extension Rule

New capabilities are added by introducing a new service class that follows the capability pattern and exposing it as a readonly property on `RuntimeEngine`. The engine's public surface grows by one property per capability; existing properties are never removed.

## Consequences

### Positive

- **Stable infrastructure boundary.** M6 added four substantial capabilities without reopening or refactoring M1–M5. Strong evidence the pipeline abstraction holds.
- **Clean domain boundaries.** Each capability answers one product question. The seams map to user intent, which usually indicates good boundaries.
- **Implementation-hidden API.** Applications never touch routing engines, search engines, position APIs, indexes, or the package format.
- **Independently testable.** Each capability can be constructed from a mock `LoadedPackage` and tested in isolation.
- **Readonly by default.** Immutable results prevent accidental cross-layer mutation.
- **Predictable extension.** New features follow a known pattern; the engine surface grows one property at a time.

### Negative

- **Façade can grow wide.** As capabilities accumulate (Panorama, POI, Accessibility, Events, Transit), `RuntimeEngine` gains a property per capability. Acceptable while capabilities remain independent; composition services (see ADR-014 and future M7) manage cross-cutting flows.
- **No standardized lifecycle yet.** Capabilities share a construction pattern but no formal lifecycle interface. ADR-014 addresses this.
- **Reconstructed after the fact.** This ADR records a decision already implemented by M6.1–M6.4; some rationale is reconstructed from specs rather than captured at decision time.

## Alternatives Considered

| Alternative | Pros | Cons | Reason Rejected |
|---|---|---|---|
| Keep ad-hoc sub-engines (`RoutingEngine`, `PositionAPI`, ...) | No restructuring | Applications coupled to implementation; inconsistent wiring per feature | Defeats the façade goal; M6 already moved past this |
| Single monolithic `RuntimeEngine` with all methods | Fewer files | One class owns navigation, search, buildings, location — violates single responsibility | Hard to test and extend |
| Capabilities depend on each other directly | Convenient for composition | Hidden coupling; order-dependent initialization; circular risk | Cross-capability coordination belongs to `RuntimeEngine` |
| Expose raw indexes (`BuildingIndex`, `SearchIndex`) | Maximum flexibility | Leaks implementation; applications become format-aware | Façade exists precisely to hide these |
| Capabilities mutate `LoadedPackage` (caching inside) | Performance | Breaks immutability invariant from ADR-012; unsafe concurrency | Capabilities are read-only by decision |

## Related

- Depends on: ADR-012 (Runtime Loader Architecture) — defines `LoadedPackage` the engine consumes
- Depends on: ADR-010 (Navigation Package Format) — defines the artifacts behind `LoadedPackage`
- Extended by: ADR-014 (Runtime Capability Lifecycle) — adds the formal lifecycle contract on top of this architecture
- Referenced by: M6.1 NavigationService, M6.2 SearchService, M6.3 BuildingService, M6.4 LocationService specs
