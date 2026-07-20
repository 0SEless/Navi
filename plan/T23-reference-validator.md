# T23 Plan — ReferenceValidator

## Architecture

```
ReferenceValidator
  └── validate(artifacts: ArtifactBundle): ValidateResult
        │
        ├── collect all node IDs from graph.nodes
        ├── build Set<string>
        │
        ├── check edges via EdgeRefChecker
        │   └── each edge.from / edge.to → must exist in set
        │
        ├── check search entries
        │   └── each entry.nodeId → must exist in set
        │
        ├── check building entrances
        │   └── each building.entrances[].nodeId → must exist in set
        │
        └── check POI entries
            └── each point.nodeId → must exist in set
```

`ValidateResult = ValidateSuccess | ValidateFailure`
- `ValidateSuccess { success: true }`
- `ValidateFailure { success: false, code: ValidateErrorCode, message: string, references: InvalidReference[] }`
- `ValidateErrorCode = 'REFERENCE_MISSING_NODE'`
- `InvalidReference { source: string, field: string, missingId: string }`

`ArtifactBundle` groups the hydrated artifacts for validation.

## Tasks

### T1 — ArtifactBundle type + ValidateResult types
**Files**: `packages/runtime/src/loader/reference-validator.ts`
- `ArtifactBundle` interface (graph artifacts + search + building + poi, all optional)
- `ValidateResult`, `ValidateSuccess`, `ValidateFailure`, `ValidateErrorCode`, `InvalidReference`
- `ReferenceValidator` class with `validate(bundle): ValidateResult`

**Acceptance**: Types compile, empty bundle succeeds.

### T2 — Reference validation logic
**Files**: `packages/runtime/src/loader/reference-validator.ts`
- Build node ID set from graph
- Validate edges: check `from` and `to` against set
- Validate search entries: check `nodeId`
- Validate building entrances: check `nodeId` in each entrance
- Validate POI entries: check `nodeId`
- Collect all failures (don't short-circuit), return all broken refs

**Acceptance**: All cross-reference types validated.

### T3 — Tests
**Files**: `packages/runtime/src/loader/__tests__/reference-validator.test.ts`
- Valid bundle success
- Edge references missing node
- Search entry missing node
- Building entrance missing node
- POI missing node
- Multiple failures reported together
- Empty graph success
- Empty artifacts (undefined graph) fails

**Acceptance**: 8+ tests, all green.

## Error Prevention

- Build node Set once, validate against it — O(n) not O(n²)
- Collect all failures, not just first — user gets complete picture
- Cross-reference validation is shallow: we check IDs exist, not that the graph is routable
- ADR-012 Invariant 4: This is Step 4 — reference ids, not route computation
