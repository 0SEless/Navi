# T22 Plan — ArtifactHydrator

## Architecture

```
HydrateResult<T> = HydrateSuccess<T> | HydrateFailure
    └── success: true  + artifact: T
    └── success: false + code: HydrateErrorCode + message

ArtifactValidator<T> {
    artifactType: string
    supportedSchemaVersion: string
    validate(data: unknown): data is T
}

ArtifactHydrator.hydrate<T>(content: string, validator: ArtifactValidator<T>)
    │
    ├── JSON.parse(content)              → INVALID_JSON
    ├── check schemaVersion              → UNSUPPORTED_VERSION
    └── validator.validate(parsed)       → INVALID_SCHEMA
```

Per-type validators (each a standalone object):
- `GraphValidator` — `nodes: NavNodeFile[]`, `edges: NavEdgeFile[]`, string fields
- `SearchValidator` — `entries: SearchEntryFile[]`
- `BuildingValidator` — `buildings: BuildingEntryFile[]`
- `PoiValidator` — `points: POIEntryFile[]`

## Tasks

### T1 — HydrateResult types + ArtifactValidator interface
**Files**: `packages/runtime/src/loader/artifact-hydrator.ts`
- `HydrateSuccess<T>`, `HydrateFailure`, `HydrateErrorCode`, `HydrateResult<T>`
- `ArtifactValidator<T>` interface with `artifactType`, `supportedSchemaVersion`, `validate()`
- `ArtifactHydrator` class with `hydrate<T>(content, validator): Promise<HydrateResult<T>>`
- No if/else on artifact type — delegates to validator

**Acceptance**: Types compile, hydrator rejects invalid JSON and wrong schema versions.

### T2 — Per-type validators
**Files**: `packages/runtime/src/loader/validators/graph-validator.ts`, `search-validator.ts`, `building-validator.ts`, `poi-validator.ts`, `index.ts`
- Each validator: type guard checking required fields exist with correct structural types
- `graphValidator`: `nodes` is an array, `edges` is an array, `campusId` is string
- `searchValidator`: `entries` is an array
- `buildingValidator`: `buildings` is an array
- `poiValidator`: `points` is an array

**Acceptance**: Each validator accepts valid objects, rejects missing-field objects.

### T3 — Tests
**Files**: `packages/runtime/src/loader/__tests__/hydrator.test.ts`
- Valid graph JSON → success
- Invalid JSON string → INVALID_JSON
- Missing schemaVersion → INVALID_SCHEMA
- Wrong schemaVersion → UNSUPPORTED_VERSION
- Missing required fields → INVALID_SCHEMA
- Wrong top-level type → INVALID_SCHEMA
- Valid search/building/poi → success
- Unknown type validator rejects (validator-level)

**Acceptance**: 9+ tests, all green, no filesystem or checksum dependencies.

## Error Prevention

- ERRORS.md 2026-07-08: "Don't use framework patterns without concrete implementations" — validators are standalone objects, not an abstract plugin framework
- ADR-012 §5.3: Hydrator validates schema, not semantics — no graph connectivity or entry-level validation
- ADR-012 Step 3: schemaVersion checked before per-type validation
