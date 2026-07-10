# ADR 0011: Extensible Compiler Pipeline

**Status:** Accepted
**Date:** 2026-07-09
**Author:** Architecture review

## Context

The compiler transforms a CampusDocument into a NavigationGraph through 6 stages: Parse → Build Nodes → Build Edges → Connect Campuses → Optimize → Validate.

Different deployments may need different compilation behavior:

- A university campus may need custom edge weights for accessibility routes
- A hospital campus may need different connectivity rules (e.g., separate public vs. staff paths)
- A mall may need POI-centric routing rather than room-centric routing

Without extensibility, each customization requires modifying the core compiler — creating a maintenance burden and making it harder to upgrade the compiler.

## Decision

Each compiler stage is replaceable via a **CompilerStagePlugin** interface with two modes:

### Replace Mode

The plugin takes full control of a stage. The default implementation is not called. Use for completely different stage behavior.

```typescript
const customValidator: CompilerStagePlugin = {
  id: 'compiler-custom-validator',
  targetStage: 'validate',
  mode: 'replace',
  execute(input, _next) {
    // Custom validation logic
    return { warnings: [], errors: [] };
  },
};
```

### Augment Mode

The plugin wraps the default implementation. The default runs first, then the plugin can modify its output. Use for adding behavior to existing stages.

```typescript
const accessibilityPlugin: CompilerStagePlugin = {
  id: 'compiler-accessibility-weights',
  targetStage: 'build-edges',
  mode: 'augment',
  execute(input, next) {
    const result = next(input); // Run default edge builder
    // Modify edge weights for accessibility
    result.edges?.forEach(e => {
      if (!e.properties.isAccessible) e.weight *= 1.5;
    });
    return result;
  },
};
```

### Registration

Plugins are registered at compiler construction time:

```typescript
const compiler = new CampusCompiler({
  plugins: [accessibilityPlugin, customValidator],
});
```

### Plugin Contract

- Plugin IDs must follow the `compiler-{name}` convention
- Plugins receive `CompilerStageInput` (read-only document, parsed data, current graph state)
- Plugins return `CompilerStageOutput` (modified nodes, edges, warnings, errors)
- Errors returned by a plugin halt the pipeline
- Plugins cannot access external services or the DOM — the compiler remains a pure function

## Consequences

### Positive

- Deployments can customize compilation without forking the compiler.
- Default compiler remains simple and focused.
- Plugins are testable in isolation — same input → output contract as stages.
- Augment mode enables non-invasive additions (analytics, custom logging).

### Negative

- Plugin API must remain stable across compiler versions — adds maintenance surface.
- Ordering of augment plugins matters and must be documented.
- Replace plugins can completely change behavior, making debugging harder.
- Plugin system adds complexity to the compiler construction.

## Alternatives Considered

| Alternative | Pros | Cons | Reason Rejected |
|---|---|---|---|
| Monolithic compiler (no plugins) | Simple, predictable | No customization without forking | Inflexible |
| Configuration flags for each variant | Type-safe, no new API | Explosion of flags, combinatorial | Unsustainable |
| Hooks/callbacks at stage boundaries | Lightweight | Limited control, no replace mode | Too restrictive for major customizations |
| Plugin interface (this ADR) | Flexible, replace+augment modes | API stability cost | Accepted — best balance |

## Related

- Referenced by: [Architecture 10 — Stage Plugin Interface](../architecture/technical/10-compiler-pipeline.md#stage-plugin-interface)
- Referenced by: [Architecture 10 — Plugin Examples](../architecture/technical/10-compiler-pipeline.md#plugin-examples)
- Referenced by: [Engineering 01 — Principle 11](../engineering/01-development-principles.md#principle-11-new-features-integrate-into-the-architecture-never-bypass-it)
- Referenced by: [Engineering 01 — Principle 12](../engineering/01-development-principles.md#principle-12-the-compiler-is-isolated)
