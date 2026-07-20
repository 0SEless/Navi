# T22 — ArtifactHydrator

## WHAT

Create `ArtifactHydrator` — the JSON-to-typed-artifact boundary (ADR-012 §5.3).

```
string (JSON)

↓

JSON.parse()

↓

check schemaVersion

↓

run per-type ArtifactValidator<T>

↓

validated typed object or HydrateFailure
```

Uses a **validator registry pattern** — each artifact type has its own `ArtifactValidator<T>` (graph, search, building, poi). The hydrator itself has zero if/else on artifact type — it delegates entirely to the validator.

## Non-goals

- ❌ No checksum awareness (T21)
- ❌ No filesystem awareness (T20)
- ❌ No manifest awareness (T24)
- ❌ No reference validation (T23)
- ❌ No lifecycle orchestration (T24)
- ❌ No routing, search, or graph semantics
- ❌ No entry-level field validation (shallow schema only)

## Success Criteria

1. Valid graph JSON → `HydrateSuccess<NavigationGraphFile>`
2. Valid search JSON → `HydrateSuccess<SearchIndexFile>`
3. Invalid JSON → `HydrateFailure { code: 'INVALID_JSON' }`
4. Missing required fields → `HydrateFailure { code: 'INVALID_SCHEMA' }`
5. Wrong schema version → `HydrateFailure { code: 'UNSUPPORTED_VERSION' }`
6. Wrong top-level type (e.g., array where object expected) → `INVALID_SCHEMA`
7. Unknown artifact type rejected at the validator level (no global catch-all)
8. All old tests still green

## Pitfalls

- ADR-012 §5.3: Hydrator validates schema, not semantics
- ADR-012 Invariant 4: Reference validation is T23, not T22
- ERRORS.md 2026-07-08: Keep it simple — the registry pattern is a `Map<string, ArtifactValidator>`, not a framework
