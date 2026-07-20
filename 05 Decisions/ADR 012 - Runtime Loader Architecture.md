# ADR 012: Runtime Loader Architecture

**Status:** Accepted
**Date:** 2026-07-17
**Author:** opencode Architecture Agent

## Context

ADR-009 defined the compiler pipeline that produces `NavigationArtifacts` — an in-memory bundle of graph, search index, spatial index, building index, and POI data. ADR-010 defined `NavigationPackage` — the stable, versioned, on-disk format. ADR-011 defined the publisher which transforms `NavigationArtifacts` into a `NavigationPackage` on disk through a nine-step lifecycle with atomic commit.

The pipeline now stands at:

```
CampusDocument
    │
    ▼
Compiler (ADR-009)      → NavigationArtifacts (in-memory)
    │
    ▼
Publisher (ADR-011)     → NavigationPackage (on disk, atomic)
    │
    ▼
Loader (this ADR)       → LoadedPackage (in-memory)
    │
    ▼
RuntimeEngine           → navigation, search, routing, positioning
```

The gap is the **loader**: the layer that reads a `NavigationPackage` from disk and returns a `LoadedPackage` — a typed, verified, in-memory representation that the `RuntimeEngine` (and its sub-engines) consume.

### What exists today

The `@navi/runtime` package contains an `ArtifactLoader` class that:
- Uses `PublishedManifest` (from `@navi/compiler` — an earlier format)
- Loads via URL/fetch (designed for web delivery)
- Returns `RuntimeSnapshot` (an untyped bag of `any` casts)
- Has its own `LoadError` with error codes `MISSING_FILE`, `INVALID_JSON`, `CHECKSUM_MISMATCH`, `UNSUPPORTED_VERSION`

This predates ADR-010 and ADR-011. It is tied to the old compiler interface and does not reflect the current architecture. ADR-012 supersedes this implementation.

### What this ADR does not define

- **Remote loading.** Loading from URL/fetch is a future concern deferred to a subsequent ADR.
- **Package distribution.** ZIP, tarball, or app-bundle distribution is a deployment concern.
- **Package resolution.** How the runtime finds the "current" package directory (symlink, config, DB) is an application concern.
- **Caching or memoization.** The loader is stateless — caching is the engine's or application's responsibility.
- **RuntimeEngine initialization.** The engine receives a `LoadedPackage`; how it wires sub-engines is ADR-013 or equivalent.

### Dependency direction

The loader must not depend on the publisher. The publisher writes packages; the loader reads them. Depending on the publisher would create a circular architectural flow where the writer and reader are coupled.

Instead, the package format types — `NavigationPackageManifest`, `NavNodeFile`, `NavEdgeFile`, and related interfaces — are defined in `@navi/core`, the central type hub. Both publisher and runtime import from `@navi/core`:

```
@navi/core  (NavigationPackage types + NavigationArtifacts)
    ▲            ▲
    │            │
publisher      runtime
    │            │
    └── both ────┘
    import from core
```

The publisher already imports `BoundingBox` from `@navi/core`. Moving the package format types to `@navi/core` follows the same pattern. The publisher's public API (`publish()`, `PublishOptions`, `PublishResult`) is unchanged — only the definition location of the shared types moves.

## Decision

### 1. Package Format Types Move to @navi/core

`NavigationPackageManifest`, `PackageArtifact`, `PackageMetadata`, and all artifact file types (`NavNodeFile`, `NavEdgeFile`, `SearchIndexFile`, `SpatialIndexFile`, `BuildingIndexFile`, `POIIndexFile`) move from `@navi/publisher/src/types.ts` to `@navi/core/src/types/`. The publisher imports them from `@navi/core` instead of defining them locally.

This mirrors `NavigationArtifacts` and `NavigationGraph` which already live in `@navi/core`. The publisher's responsibility changes from "defines the package format" to "writes packages in the format defined by core."

The publisher's own result types (`PublishOptions`, `PublishResult`, `PublisherReport`, `PublishFailure`, `PublishErrorCode`, `BuiltPackage`, `ArtifactResult`) remain in `@navi/publisher` — they are deployment concerns, not format concerns.

This move is a separate migration step that must complete before the loader is implemented. It changes no publisher behavior — only import paths.

### 2. Loader Interface

```typescript
function load(packagePath: string): Promise<LoadResult>
```

Takes a single argument — the filesystem path to a published package directory. Returns a discriminated result type:

```typescript
type LoadResult = LoadReport | LoadFailure

interface LoadReport {
  success: true
  package: LoadedPackage
  durationMs: number
}

interface LoadFailure {
  success: false
  code: LoadErrorCode
  message: string
  durationMs: number
}

type LoadErrorCode =
  | 'PACKAGE_NOT_FOUND'
  | 'MANIFEST_NOT_FOUND'
  | 'CHECKSUM_MISMATCH'
  | 'INVALID_SCHEMA'
  | 'INVALID_REFERENCE'
  | 'IO_ERROR'
```

**Invariant:** `success: true` and `success: false` are mutually exclusive. The caller checks `result.success` before accessing type-specific fields. This mirrors `CompilerReport` (ADR-009) and `PublishResult` (ADR-011).

### 3. LoadedPackage Definition

`LoadedPackage` is the in-memory representation of a validated `NavigationPackage`. It contains all the data needed to initialize the `RuntimeEngine` — but no caches, no services, no routing state, and no engine references.

```typescript
interface LoadedPackage {
  manifest: NavigationPackageManifest
  graph: NavigationGraphFile
  searchIndex?: SearchIndexFile
  spatialIndex?: SpatialIndexFile
  buildingIndex?: BuildingIndexFile
  poiIndex?: POIIndexFile
}
```

Each field maps directly to an artifact file in the package. The manifest is always present. `graph` is always present (it is the only required artifact per ADR-010). All other artifacts are optional — their presence is determined by the manifest.

**LoadedPackage is dead data.** It is a snapshot of verified bytes from disk. It has no methods, no lazy-loading, no computed properties, no cache handles. The `RuntimeEngine` wraps `LoadedPackage` to provide navigation services.

### 4. Invariants

These invariants are enforceable in implementation tests:

**Invariant 1 — LoadedPackage is immutable.**
Once constructed, `LoadedPackage` is never mutated. All fields are `readonly`. The caller cannot change the manifest, graph, or any artifact after load.

**Invariant 2 — No partial LoadedPackage is ever returned.**
If any step of the lifecycle fails, the function returns `LoadFailure`. A `LoadReport` always contains a fully hydrated `LoadedPackage` with all declared artifacts.

**Invariant 3 — All artifacts have passed checksum verification before hydration completes.**
Checksum verification (step 2) completes before artifact hydration (step 3) begins. No artifact is hydrated unless its checksum matches.

**Invariant 4 — Every loaded reference points to an existing object.**
After hydration, all inter-artifact references (edges→nodes, POIs→nodes, buildings→nodes, search→nodes) are validated. No dangling references exist in a successfully loaded package.

**Invariant 5 — load() is stateless.**
No state persists between calls. Two calls with identical input produce identical output (excluding `durationMs`). Concurrent calls are safe.

**Invariant 6 — Checksums are computed from file bytes, not deserialized objects.**
Checksum verification reads raw bytes from disk and computes SHA-256 over those bytes. This ensures the bytes on disk match what the publisher wrote — not a reconstructed representation.

### 5. Internal Architecture

The loader orchestrates several focused components, mirroring the publisher's architecture (ADR-011 §5):

```
Loader (orchestrator)
    │
    ├── PackageReader        ← filesystem abstraction (injectable)
    ├── ChecksumVerifier     ← SHA-256 hex verification
    ├── ArtifactHydrator     ← JSON parse + schema validation
    └── ReferenceValidator   ← inter-artifact reference integrity
```

Each component has a single responsibility and is independently testable.

#### 5.1 PackageReader (Interface)

A filesystem abstraction, mirroring `PackageWriter` from ADR-011:

```typescript
interface PackageReader {
  /** Read the full contents of a file as UTF-8 text. */
  readFile(relativePath: string): Promise<string>

  /** Read the full contents of a file as raw bytes for checksumming. */
  readBytes(relativePath: string): Promise<Uint8Array>
}
```

No `exists()` method — the Loader reads the manifest to verify the package directory. An `ENOENT` from `readFile('campus.nav.json')` is sufficient, avoiding a redundant filesystem stat before every load.

The default implementation is `FilesystemReader`:

```typescript
class FilesystemReader implements PackageReader {
  constructor(private basePath: string) {}

  async readFile(relativePath: string): Promise<string> { ... }
  async readBytes(relativePath: string): Promise<Uint8Array> { ... }
}
```

Future implementations can support different storage backends:
- `HttpReader` — loads from a URL via fetch
- `ZipReader` — reads from an in-memory ZIP archive
- `MemoryReader` — reads from a pre-loaded Map of path→content
- `ElectronReader` — reads via Electron's file API

The `Loader` receives a `PackageReader` via its constructor. It never touches `fs` directly.

#### 5.2 ChecksumVerifier

Computes and compares SHA-256 digests:

```typescript
interface ChecksumVerifier {
  /**
   * Verify that file bytes match the expected checksum.
   * Returns true if checksum matches or if no checksum is expected.
   */
  verify(bytes: Uint8Array, expected: string): boolean

  /** Compute SHA-256 hex of the given bytes. */
  hash(data: Uint8Array): string
}
```

Algorithm: **SHA-256** (FIPS 180-4), encoding: **hexadecimal lowercase** — identical to the publisher's `ChecksumService` (ADR-011 §5.4).

If the manifest's `PackageArtifact.checksum` is missing or empty for a given artifact, that artifact is skipped during verification. This preserves backward compatibility with packages published by older publisher versions.

#### 5.3 ArtifactHydrator

Loads and validates each artifact file:

```typescript
interface ArtifactHydrator {
  /**
   * Read, parse, and validate a single artifact.
   * Throws on invalid JSON or missing required fields.
   */
  hydrate<T>(reader: PackageReader, path: string, validator: (data: unknown) => data is T): Promise<T>
}
```

For each artifact declared in `manifest.artifacts`:

1. Read file content via `PackageReader.readFile()`
2. `JSON.parse()` into unknown
3. Validate required top-level fields via the type-specific validator
4. Return typed artifact

The `graph` artifact is always required. Optional artifacts that fail to parse are reported as failure — the loader does not silently drop malformed data.

#### 5.4 ReferenceValidator

Validates inter-artifact references after all artifacts are loaded:

```typescript
interface ReferenceValidator {
  /**
   * Validate cross-references between artifacts.
   * Returns an array of validation errors (empty = valid).
   */
  validate(pkg: LoadedPackage): ValidationError[]
}

interface ValidationError {
  message: string
}
```

Scope is limited to inter-artifact reference integrity:
- Every edge's `from` and `to` references an existing node ID in the graph
- Every POI's `nodeId` references an existing node ID
- Every building entry's entrances reference existing node IDs
- Every search entry's `nodeId` references an existing node ID

The validator does NOT validate:
- Graph connectivity or routeability (compiler responsibility)
- Coordinate ranges or spatial index correctness (compiler responsibility)
- Building data completeness or floor consistency (compiler responsibility)
- Search index coverage vs graph nodes (compiler responsibility)

This mirrors the publisher's principle (ADR-011 §5.1): validate integrity, not semantics.

### 6. Load Lifecycle

Every `load()` call follows this sequence:

```
┌────────────────────────────────┐
│  1. Read Manifest              │  readFile → JSON.parse → validate schema
├────────────────────────────────┤
│  2. Verify Checksums           │  readBytes → SHA-256 → compare
├────────────────────────────────┤
│  3. Hydrate Artifacts          │  readFile → JSON.parse → validate fields
├────────────────────────────────┤
│  4. Validate References        │  inter-artifact cross-ref check
├────────────────────────────────┤
│  5. Return LoadedPackage       │  construct LoadReport
└────────────────────────────────┘
```

Steps 1–4 run inside a single `load()` call. Step 5 is the only output. If any step fails, the function returns `LoadFailure` — no partial result is ever returned. This mirrors the publisher's nine-step lifecycle (ADR-011 §6) with the same "fail fast, no partial output" semantics.

#### Step 1 — Read Manifest

Construct `manifestPath = packagePath + '/campus.nav.json'`. Read the file via `PackageReader.readFile()`, parse as JSON, validate against the `NavigationPackageManifest` schema:

When the file does not exist (ENOENT from the filesystem), this is mapped to `PACKAGE_NOT_FOUND` — no separate directory check is needed. The manifest is the package's entry point.

Schema validation:

- `schemaVersion` is present and supported
- `campusId` is a non-empty string
- `campusName` is a non-empty string
- `artifacts` is a non-empty record

If the file does not exist: `LoadFailure { code: 'PACKAGE_NOT_FOUND' }`.
If parsing fails or schema is invalid: `LoadFailure { code: 'INVALID_SCHEMA' }`.
If filesystem error: `LoadFailure { code: 'IO_ERROR' }`.

#### Step 2 — Verify Checksums

For each entry in `manifest.artifacts`:
1. Read artifact file bytes via `PackageReader.readBytes()`
2. Compute SHA-256 hexadecimal lowercase via `ChecksumVerifier.hash()`
3. Compare against `PackageArtifact.checksum`

Verification order follows the explicit artifact order (`graph` → `search` → `spatial` → `building` → `poi`). If any checksum mismatches: `LoadFailure { code: 'CHECKSUM_MISMATCH', message: '<artifact name>: expected <X> got <Y>' }`.

Checksum verification (step 2) completes for ALL artifacts before hydration (step 3) begins (Invariant 3). This prevents wasted work — if the checksums are wrong, there is no point parsing the data.

If a `PackageArtifact.checksum` is missing or empty, that artifact is skipped. This preserves backward compatibility.

#### Step 3 — Hydrate Artifacts

For each artifact declared in `manifest.artifacts`, in the same order as step 2:

1. `ArtifactHydrator.hydrate<T>(reader, path, validator)` → `T`
2. Store in the corresponding `LoadedPackage` field

The `graph` artifact hydration is required to succeed. Optional artifacts that fail hydration produce `LoadFailure { code: 'INVALID_SCHEMA' }`.

Hydration order mirrors checksum verification order (`graph` → `search` → `spatial` → `building` → `poi`). This ensures determinism.

#### Step 4 — Validate References

`ReferenceValidator.validate(pkg)` checks all inter-artifact references. If any reference is invalid: `LoadFailure { code: 'INVALID_REFERENCE', message: '<description>' }`.

The validator never modifies the `LoadedPackage` — it is a read-only analysis (Invariant 1).

#### Step 5 — Return LoadedPackage

Construct `LoadReport` with:
- `package`: The assembled `LoadedPackage` with all hydrated artifacts
- `durationMs`: Wall-clock time from start of step 1 to end of step 4

### 7. Error Handling

Every error is mapped to exactly one `LoadErrorCode`. No thrown exceptions escape to the caller — the function always returns a `LoadResult`.

| Step | Error Scenario | LoadErrorCode |
|------|---------------|---------------|
| 1 | Manifest ENOENT (package dir missing or no manifest) | `PACKAGE_NOT_FOUND` |
| 1 | manifest.json not valid JSON | `INVALID_SCHEMA` |
| 1 | manifest missing required fields | `INVALID_SCHEMA` |
| 1 | Unsupported schema version | `INVALID_SCHEMA` |
| 2 | Checksum mismatch on any artifact | `CHECKSUM_MISMATCH` |
| 3 | Artifact file not found | `MANIFEST_NOT_FOUND` |
| 3 | Artifact not valid JSON | `INVALID_SCHEMA` |
| 3 | Artifact missing required fields | `INVALID_SCHEMA` |
| 4 | Edge references nonexistent node | `INVALID_REFERENCE` |
| 4 | POI/building/search references nonexistent node | `INVALID_REFERENCE` |
| 1–5 | Uncaught filesystem error | `IO_ERROR` |

### 8. What the Loader Does NOT Do

| Feature | Reason Excluded |
|---------|----------------|
| Route computation | RuntimeEngine responsibility |
| Search indexing | RuntimeEngine responsibility |
| Position resolution | RuntimeEngine responsibility |
| Caching loaded packages | Application/caller responsibility |
| Lazy-loading artifacts | Adds complexity; all artifacts fit in memory for current campus sizes |
| Remote URL loading | Future ADR — different interface (fetch, streaming, CORS) |
| Fallback between package versions | Deployment-level concern |
| Package migration / format upgrade | CLI tool concern, not runtime |
| Logging or metrics | Caller or middleware responsibility |

### 9. Relationship to RuntimeEngine

The `RuntimeEngine` is initialized with a `LoadedPackage`:

```typescript
class RuntimeEngine {
  constructor(pkg: LoadedPackage) { ... }
}
```

The loader never instantiates a `RuntimeEngine`. The engine never calls `load()`. They communicate through `LoadedPackage` — a plain data object.

This separation means:
- The loader can evolve independently (e.g., add remote loading) without changing the engine
- The engine can be tested with mock `LoadedPackage` objects without any filesystem
- Both can be tested independently

### 10. Freeze Contract

Once the loader implementation is complete and tested (M5 Phase 4), the following are frozen:

| Frozen | Details |
|--------|---------|
| `load(packagePath: string): Promise<LoadResult>` | Signature frozen |
| `LoadResult = LoadReport \| LoadFailure` | Discriminated union shape frozen |
| `LoadedPackage` fields | `manifest`, `graph` always required; `searchIndex?`, `spatialIndex?`, `buildingIndex?`, `poiIndex?` optional. Existing fields never removed. New optional fields may be added. |

Not frozen — may evolve:
- `LoadErrorCode` — existing codes never change meaning, new codes may be added
- `PackageReader` interface — new methods may be added for new storage backends
- Internal component architecture — optimizations and refactors are allowed

After freeze: no optimization, no refactoring, and no new capabilities. Only bug fixes.

### 11. Implementation Package

The new loader lives in `@navi/runtime/src/loader/`, replacing the existing `ArtifactLoader`:

```
packages/runtime/src/loader/
├── index.ts                    # Public API: load()
├── types.ts                    # LoadedPackage, LoadResult, LoadReport, LoadFailure, LoadErrorCode
├── loader.ts                   # Six-step lifecycle orchestrator
├── package-reader.ts           # PackageReader interface + FilesystemReader
├── checksum-verifier.ts        # SHA-256 hex verification
├── artifact-hydrator.ts        # JSON parse + schema validation
├── reference-validator.ts      # Inter-artifact reference integrity
└── __tests__/
    ├── loader.test.ts               # Happy path + edge cases
    ├── checksum.test.ts             # Checksum match/mismatch scenarios
    ├── validation.test.ts           # Schema validation, ref validation
    └── invariants.test.ts           # All 6 invariants
```

**Dependencies:**
- `@navi/core` — for `NavigationPackageManifest`, `NavNodeFile`, `NavEdgeFile`, and other package format types
- Node.js built-in: `fs`, `path`, `crypto`

**Exports from `@navi/runtime`:**
- `load()` — the public function
- `LoadResult`, `LoadReport`, `LoadFailure` — result types
- `LoadErrorCode` — error code type
- `LoadedPackage` — the loaded package type

`PackageReader`, `FilesystemReader`, `ChecksumVerifier`, `ArtifactHydrator`, and `ReferenceValidator` are internal implementation details and are not exported.

The existing `ArtifactLoader`, `LoadError`, `LoaderOptions`, and `RuntimeSnapshot` exports are removed.

## Consequences

### Positive

- **Clean dependency direction.** Runtime does not depend on publisher. Both import from `@navi/core`.
- **Package format types centralized.** `NavigationPackageManifest` lives alongside `NavigationArtifacts` and `NavigationGraph` in `@navi/core`. One source of truth for the format.
- **PackageReader abstraction.** Filesystem is injectable. Future storage backends (HTTP, ZIP, in-memory) require no changes to the loader orchestrator.
- **Mirrors publisher architecture.** `PackageReader` ↔ `PackageWriter`, `ChecksumVerifier` ↔ `ChecksumService`, same verification ordering. Consistent mental model across the pipeline.
- **Six explicit invariants.** Enforceable in tests. Prevent regression in immutability, partial loads, checksum ordering, reference integrity, statelessness, and checksum input source.
- **Clean discriminated result.** `LoadResult` prevents invalid states.
- **Verification ordering explicit.** Checksums → parse → schema → semantic. Mirror of ADR-011 §5 (Step 8).
- **"Hydrate" terminology.** More precise than "deserialize" — the step converts raw bytes to typed `LoadedPackage` structure, not just JSON.parse.
- **Reference validator scoped to inter-artifact integrity.** Will not need to change as the format grows (panoramas, QR codes, schedules, accessibility metadata).
- **Frozen API with room for error codes.** `load()`, `LoadResult`, `LoadedPackage` frozen. `LoadErrorCode` can grow.
- **Whole pipeline consistent.** Every transition has one input, one output, one responsibility, one orchestrator, one typed contract, one result type.

### Negative

- **Types move to core.** Publisher's `types.ts` imports from `@navi/core` instead of defining types locally. Changes import paths but not behavior. A mechanical refactor.
- **PackageReader indirection.** Small runtime cost for the interface dispatch. Negligible for filesystem workloads (I/O-bound).
- **Eager hydration.** All artifacts loaded into memory. Acceptable — campus data fits in memory on all target devices.
- **Limited reference validation.** Only cross-references. Full graph validation is the compiler's job. A corrupt graph with valid references passes loader validation.

## Alternatives Considered

| Alternative | Pros | Cons | Reason Rejected |
|---|---|---|---|
| Keep existing `ArtifactLoader` | No migration | Tied to old `PublishedManifest`, no typed output, fetch-based | Does not match ADR-010/ADR-011 architecture |
| Runtime depends on publisher | Fewer package moves | Circular flow: reader depends on writer | PackageReader abstraction removes the need |
| Loader returns `RuntimeSnapshot` | Backward compat with existing engine code | `RuntimeSnapshot` is untyped (`any` casts), tied to old types | New `LoadedPackage` is fully typed |
| Loader instantiates engine | Convenience | Couples loading to engine initialization, harder to test | Keep separate — loader returns data, engine wraps it |
| Checksum verification always required | Stronger guarantee | Breaks for packages without checksums in artifact entries | Skip missing checksums — backward compatible |
| Validate graph connectivity | Catches corrupt graphs | Duplicates compiler validation, expensive for large graphs | Limited to reference integrity only |
| "Deserialize" step | Common terminology | Less precise — we're hydrating a structure, not just parsing JSON | Renamed to "Hydrate" |
| Single monolithic loader class | Fewer files, simpler | 5 responsibilities in one class | Split into focused components |

## Related

- Depends on: ADR-010 (Navigation Package Format) — defines the format the loader reads
- Depends on: ADR-011 (Publisher Architecture) — creates the packages the loader consumes
- Supersedes: existing `ArtifactLoader` in `@navi/runtime/src/loader/`
- Referenced by: M5 Phase 4 Implementation Plan
