# ADR 014: Runtime Capability Lifecycle

**Status:** Proposed
**Date:** 2026-07-17
**Author:** opencode Architecture Agent

## Context

ADR-013 established the Capability Façade: `RuntimeEngine` exposes a fixed set of domain-scoped services, each constructed from `LoadedPackage` and following a shared pattern (single responsibility, no persistence, stateless, readonly results, deterministic). By M6.4 that pattern is no longer accidental — four capabilities (Navigation, Search, Buildings, Location) already follow it, and M7+ is expected to add several more (Panorama, POI, Accessibility, Events, Transit).

Once the runtime holds 8–10 capabilities, an *implicit* shared pattern becomes a liability: without a formal lifecycle contract, capabilities will drift in how they are created, initialized, torn down, and ordered. Composition services (e.g. an M7 orchestration that chains Location → Search → Building → Navigation) will need a predictable initialization order and a safe shutdown path — neither of which the current "constructed in the engine constructor" approach guarantees.

The gap is the **lifecycle**: ADR-013 defines *what* a capability is and *how* it is constructed; this ADR defines *how every capability lives and is managed* inside the runtime.

## Decision

Introduce a `RuntimeCapability` lifecycle contract that `RuntimeEngine` owns and orchestrates. Every capability either implements the contract or is treated as conforming to it structurally. The engine is responsible for the full lifecycle: create, initialize, expose, dispose.

```typescript
export interface RuntimeCapability {
  /** Prepare the capability for use. Called once by RuntimeEngine after construction. */
  initialize(): void | Promise<void>

  /** Release any resources held by the capability. Called once by RuntimeEngine on shutdown. */
  dispose(): void | Promise<void>
}
```

`RuntimeEngine` becomes the single owner of capability lifecycle:

```typescript
class RuntimeEngine {
  private capabilities: RuntimeCapability[]

  constructor(pkg: LoadedPackage) {
    this.capabilities = [
      new NavigationService(pkg),
      new SearchService(pkg),
      new BuildingService(pkg),
      new LocationService(pkg),
    ]
  }

  async initialize(): Promise<void> {
    for (const c of this.capabilities) await c.initialize()
  }

  async dispose(): Promise<void> {
    for (const c of this.capabilities) await c.dispose()
  }
}
```

### Ownership

- **RuntimeEngine is the sole owner of capability lifecycle.** Capabilities are never instantiated by applications or by other capabilities. Ownership spans construction, initialization, exposure, disposal, and — in future — replacement, lazy loading, and hot reload; the bullets below are implementation details of that ownership.
- **RuntimeEngine initializes capabilities.** After construction, the engine calls `initialize()` on each, in registration order.
- **RuntimeEngine exposes capabilities.** Each capability is reachable as a readonly property on the engine. Applications depend only on the capability contract exposed by `RuntimeEngine`; individual capability implementations may be replaced without changing the public runtime API.
- **RuntimeEngine disposes capabilities.** On shutdown, the engine calls `dispose()` on each.

### Rules

1. **Capabilities are initialized from `LoadedPackage`.** Construction receives the package; `initialize()` performs any deferred setup. Today construction does all the work and `initialize()` is a no-op — that is acceptable; the contract exists for future capabilities that need async or ordered setup.
2. **Capabilities do not own persistence.** They remain read-only over loaded data (per ADR-013).
3. **Capabilities do not initialize other capabilities.** Cross-capability coordination happens through `RuntimeEngine`, never capability-to-capability lifecycle calls.
4. **Lifecycle is uniform.** From the engine's perspective every capability behaves identically: construct → `initialize()` → use → `dispose()`.

### Migration

Existing capabilities (Navigation, Search, Buildings, Location) are **not required** to implement `RuntimeCapability` immediately. New capabilities *should* implement it. Migration of existing services is deferred until a capability genuinely needs lifecycle management (async init, resource cleanup, lazy loading). The migration is mechanical: add `initialize()`/`dispose()` no-ops (or real logic) and register through the engine's capability list.

### Interface Stays Minimal

The contract contains only `initialize()` and `dispose()`. Methods such as `reset()`, `reload()`, `update()`, `tick()`, `pause()`, `resume()` are **deliberately excluded** as speculative. If hot-swapping, lazy loading, or periodic ticks become real requirements, the interface is extended then — not before.

## Consequences

### Positive

- **Consistent lifecycle.** Every capability is created, initialized, exposed, and disposed the same way. The engine's responsibility is explicit and uniform.
- **Easier testing.** A capability can be constructed and `initialize()`d in isolation; `dispose()` gives tests a clean teardown hook.
- **Supports composition services (M7).** An orchestration capability that chains other capabilities can rely on a defined initialization order and a safe startup/shutdown sequence.
- **Enables future lazy loading / hot reload without redesign.** `dispose()` then `initialize()` is a clean reload primitive; the engine can defer capability construction until first access.
- **Explicit registration order.** The engine's capability list makes initialization order visible and controllable.

### Negative

- **Minor boilerplate for new capabilities.** Each new capability adds `initialize()`/`dispose()` even when no-ops.
- **Existing four services remain un-migrated.** They conform structurally but do not formally implement the interface until a need arises — a small inconsistency in the type system.
- **Engine gains an initialize/dispose step.** Applications must now call `engine.initialize()` (or the engine auto-initializes in its constructor). A trivial addition, but a behavior change from "constructor does everything."

## Alternatives Considered

| Alternative | Pros | Cons | Reason Rejected |
|---|---|---|---|
| Keep "constructed in engine constructor" (no lifecycle interface) | No change to working code | No uniform init/shutdown; composition services (M7) lack ordered startup; no teardown hook | Drift risk at 8–10 capabilities; contradicts ADR-013's "shared pattern is architecture" |
| Require all capabilities to implement `RuntimeCapability` now | Fully uniform types | Rewrites four working services just to satisfy an interface they don't yet need | Violates the "minimal, migrate gradually" rule; speculative churn |
| Larger interface (`reset`, `reload`, `tick`, `pause`) | Future-proof | Speculative methods rarely used; locks in unused API surface | YAGNI — extend only when a real need appears |
| Capabilities initialize each other | Convenient for dependency chains | Hidden coupling, order-dependent, circular risk | ADR-013 already assigns coordination to `RuntimeEngine` |
| Engine exposes `LoadedPackage` to capabilities at init only via constructor (no `initialize`) | Simpler | No hook for async setup or resource acquisition | `initialize()` exists precisely for deferred/async setup |

## Related

- Depends on: ADR-013 (Runtime Capability Architecture) — defines what a capability is and the construction pattern this lifecycle wraps
- Depends on: ADR-012 (Runtime Loader Architecture) — supplies the `LoadedPackage` capabilities are initialized from
- Enables: M7 composition services (e.g. accessibility-aware navigation, context-aware routing) that orchestrate multiple capabilities through `RuntimeEngine`
- Referenced by: future M7+ capability specs (Panorama, POI, Accessibility, Events, Transit)
