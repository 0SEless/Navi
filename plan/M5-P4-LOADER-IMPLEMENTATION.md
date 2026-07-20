# M5 Phase 4 — Runtime Loader Implementation

**Spec:** `spec/M5-P4-LOADER.md` (if one exists)
**ADR:** `ADR 012 - Runtime Loader Architecture.md`

## Goal

Implement the `@navi/runtime` loader — the layer that reads a `NavigationPackage` from disk and returns a `LoadedPackage`. Each `LoadedPackage` is a typed, verified, immutable snapshot that the `RuntimeEngine` consumes.

```
Publisher (ADR-011)
       │
       ▼
NavigationPackage
       │
       ▼
Loader (this phase)  →  LoadedPackage
       │
       ▼
RuntimeEngine
```

## Prerequisites

- All publisher tests green (91 passing across 8 files)
- Full workspace: `npm test` passes (1056+ tests)
- ADR-012 accepted and frozen

## Task Overview

| Task | Description | Files | Test Count |
|------|-------------|-------|-----------|
| T0 | Move package format types to `@navi/core` (architecture migration) | `packages/core/src/types/package-format.ts`, `packages/publisher/src/types.ts` | 0 new (existing still pass) |
| T19 | Define `LoadedPackage`, `LoadResult`, error codes; scaffold `Loader` class | `packages/runtime/src/loader/types.ts`, `packages/runtime/src/loader/loader.ts`, `packages/runtime/src/loader/index.ts`, `packages/runtime/src/index.ts` | 1 |
| T20 | Implement `PackageReader` interface + `FilesystemReader` | `packages/runtime/src/loader/package-reader.ts` | 2 |
| T21 | Implement `ChecksumVerifier` (SHA-256 hex) | `packages/runtime/src/loader/checksum-verifier.ts` | 3 |
| T22 | Implement `ArtifactHydrator` (JSON parse + schema validation) | `packages/runtime/src/loader/artifact-hydrator.ts` | 4 |
| T23 | Implement `ReferenceValidator` (inter-artifact refs) | `packages/runtime/src/loader/reference-validator.ts` | 4 |
| T24 | Implement `Loader` orchestrator; end-to-end integration test | `packages/runtime/src/loader/loader.ts` (update) | 5+1 integration |
| Verify | Full suite: invariants, error codes, determinism | — | all above |

## Test File Structure

```
packages/runtime/src/loader/__tests__/
├── loader.test.ts                  # Happy path + edge cases (T19 + T24)
├── package-reader.test.ts          # Exists, missing, read scenarios (T20)
├── checksum.test.ts                # Match, mismatch, empty (T21)
├── hydration.test.ts               # Valid schema, invalid, missing fields (T22)
├── validation.test.ts              # Valid refs, dangling edges, dangling POIs (T23)
├── invariants.test.ts              # All 6 ADR-012 invariants (T24)
└── integration.test.ts             # Compiler→Publisher→Loader→LoadedPackage (T24)
```

## Expected final test count

~25 new tests across the loader package. All existing 1056+ workspace tests remain green.

---

## T0 — Move package format types to `@navi/core` (architecture migration)

**Description:** Relocate `NavigationPackageManifest`, `PackageArtifact`, `PackageMetadata`, and all artifact file types (`NavNodeFile`, `NavEdgeFile`, `SearchIndexFile`, `SpatialIndexFile`, `BuildingIndexFile`, `POIIndexFile`) from `@navi/publisher/src/types.ts` to `@navi/core/src/types/`. The publisher imports them from `@navi/core` instead of defining them locally.

The publisher's own result types (`PublishOptions`, `PublishResult`, `PublisherReport`, `PublishFailure`, `PublishErrorCode`, `BuiltPackage`, `ArtifactResult`) remain in `@navi/publisher` — they are deployment concerns, not format concerns.

**Files to touch:**
- `packages/core/src/types/package-format.ts` (NEW) — all shared package format types
- `packages/core/src/types/index.ts` — add `export * from './package-format'`
- `packages/publisher/src/types.ts` — remove moved types, replace with imports from `@navi/core`

**Need to extract from publisher types:**
```typescript
// Types that move to core:
NavNodeFile, NavEdgeFile, NavigationGraphFile
SearchEntryFile, SearchIndexFile
SpatialIndexFile
EntranceEntryFile, FloorEntryFile, BuildingEntryFile, BuildingIndexFile
POIEntryFile, POIIndexFile
PackageArtifact, PackageMetadata, NavigationPackageManifest
```

**Types that stay in publisher:**
```typescript
BuiltPackage, PublishOptions, ArtifactResult
PublisherReport, PublishFailure, PublishResult
PublishErrorCode
```

**Edge case:** `PackageMetadata.boundingBox: BoundingBox` — `BoundingBox` is already in `@navi/core`. The moved types use it directly. No import needed for this field.

**Acceptance:**
1. `npm run typecheck` passes in both `packages/core` and `packages/publisher`
2. `npm run test` in `packages/publisher` — all 91 tests still pass
3. Publisher exports unchanged (no breaking change to its public API)
4. No runtime code imports `@navi/publisher` (verify with grep)

---

## T19 — Define Loader types and scaffold Loader class

**Description:** Create the loader type definitions (`LoadedPackage`, `LoadResult`, `LoadReport`, `LoadFailure`, `LoadErrorCode`) and a scaffold `Loader` class in `@navi/runtime`. Remove the old `ArtifactLoader` and its types. Update `@navi/runtime` exports.

**Files to touch:**
- `packages/runtime/src/loader/types.ts` — REPLACE: remove `LoaderOptions`, `LoadError`; add `LoadedPackage`, `LoadResult`, `LoadReport`, `LoadFailure`, `LoadErrorCode`
- `packages/runtime/src/loader/loader.ts` — NEW: `Loader` class with constructor that takes `PackageReader` and stub `load()` method
- `packages/runtime/src/loader/index.ts` — update exports
- `packages/runtime/src/types/index.ts` — remove `RuntimeSnapshot` (replaced by `LoadedPackage`), update imports
- `packages/runtime/src/index.ts` — update public exports
- `packages/runtime/package.json` — add `@navi/core` dependency (remove `@navi/compiler` if present; publisher dependency no longer needed since types moved to core)

**New types:**
```typescript
interface LoadedPackage {
  readonly manifest: NavigationPackageManifest
  readonly graph: NavigationGraphFile
  readonly searchIndex?: SearchIndexFile
  readonly spatialIndex?: SpatialIndexFile
  readonly buildingIndex?: BuildingIndexFile
  readonly poiIndex?: POIIndexFile
}

type LoadResult = LoadReport | LoadFailure

interface LoadReport {
  readonly success: true
  readonly package: LoadedPackage
  readonly durationMs: number
}

interface LoadFailure {
  readonly success: false
  readonly code: LoadErrorCode
  readonly message: string
  readonly durationMs: number
}

type LoadErrorCode =
  | 'PACKAGE_NOT_FOUND'
  | 'MANIFEST_NOT_FOUND'
  | 'CHECKSUM_MISMATCH'
  | 'INVALID_SCHEMA'
  | 'INVALID_REFERENCE'
  | 'IO_ERROR'
```

**Scaffold Loader:**
```typescript
export class Loader {
  constructor(private reader: PackageReader) {}

  async load(packagePath: string): Promise<LoadResult> {
    throw new Error('Not implemented')
  }
}
```

**Edge cases:**
- `LoadedPackage` fields are all `readonly` (Invariant 1)
- All fields optional except `manifest` and `graph`

**Acceptance:**
1. `npm run typecheck` passes in `packages/runtime`
2. `npm run test` in `packages/runtime` — existing tests updated or removed
3. Types are importable from `@navi/runtime`

---

## T20 — Implement PackageReader + FilesystemReader

**Description:** Implement the `PackageReader` interface and its default `FilesystemReader` implementation. `PackageReader` abstracts all filesystem access so the `Loader` never touches `fs` directly.

**Files to touch:**
- `packages/runtime/src/loader/package-reader.ts` — NEW
- `packages/runtime/src/loader/__tests__/package-reader.test.ts` — NEW

**Interface:**
```typescript
export interface PackageReader {
  /** Read a file's contents as a UTF-8 string. */
  readFile(relativePath: string): Promise<string>

  /** Read a file's raw bytes (for checksum verification). */
  readBytes(relativePath: string): Promise<Uint8Array>
}
```

No `exists()` method — the Loader reads the manifest to verify the package exists. An `ENOENT` from `readFile('campus.nav.json')` is sufficient. This avoids a redundant filesystem stat before every load.

**Implementation (`FilesystemReader`):**
```typescript
export class FilesystemReader implements PackageReader {
  constructor(private basePath: string) {}

  async readFile(relativePath: string): Promise<string> {
    // resolve basePath + relativePath, fs.readFile → utf-8 string
  }

  async readBytes(relativePath: string): Promise<Uint8Array> {
    // resolve basePath + relativePath, fs.readFile → Uint8Array
  }
}
```

**Error handling:** All filesystem errors (ENOENT, EACCES, etc.) must propagate as-is (the Loader maps them to error codes). `FilesystemReader` never swallows errors.

**Tests (2):**
1. `readFile` returns file content for valid paths, rejects for missing
2. `readBytes` returns raw bytes matching file content

**Acceptance:**
- `npm run test` in `packages/runtime` — 3 new tests pass
- `FilesystemReader` is not exported from `@navi/runtime` (internal detail)

---

## T21 — Implement ChecksumVerifier

**Description:** Implement SHA-256 hexadecimal lowercase verification. Mirrors the publisher's `ChecksumService` (ADR-011 §5.4) exactly.

**Files to touch:**
- `packages/runtime/src/loader/checksum-verifier.ts` — NEW
- `packages/runtime/src/loader/__tests__/checksum.test.ts` — NEW

**Interface:**
```typescript
export interface ChecksumVerifier {
  /** SHA-256 hex lowercase of the given bytes. */
  hash(data: Uint8Array): string

  /**
   * Verify bytes match expected checksum.
   * Returns true if checksum matches OR if expected is empty/missing.
   */
  verify(bytes: Uint8Array, expected: string): boolean
}
```

**Implementation:** Use Node.js `crypto.createHash('sha256')` for checksum computation. Use `TextEncoder` for string-to-bytes conversion when needed (but `hash()` operates on `Uint8Array` inputs received from `PackageReader.readBytes()`).

**Edge cases:**
- Empty `expected` string → skip verification (backward compat)
- Empty byte array → valid SHA-256 (e47yda..., fixed known hash)
- Non-hex `expected` → false (invalid checksum format)

**Tests (3):**
1. `hash` produces correct SHA-256 hex for known input
2. `verify` returns true for matching checksum
3. `verify` returns true when expected is empty (backward compat)
4. `verify` returns false for mismatching checksum

**Acceptance:**
- `npm run test` in `packages/runtime` — 4 new tests pass
- Output matches publisher's `ChecksumService.hash()` for identical input (verified in integration test)

---

## T22 — Implement ArtifactHydrator

**Description:** Implement the component that reads, parses, and validates each artifact file. Converts raw file content into typed artifact objects.

**Files to touch:**
- `packages/runtime/src/loader/artifact-hydrator.ts` — NEW
- `packages/runtime/src/loader/__tests__/hydration.test.ts` — NEW

**Interface:**
```typescript
export interface ArtifactHydrator {
  /**
   * Read, parse, and validate a single artifact.
   * Throws LoadError on invalid JSON or missing required fields.
   */
  hydrate<T>(
    reader: PackageReader,
    path: string,
    validator: (data: unknown) => data is T
  ): Promise<T>
}
```

**Validator functions (per artifact type):**
- `isNavigationGraphFile(data: unknown): data is NavigationGraphFile` — checks `schemaVersion: string`, `campusId: string`, `nodes: array`, `edges: array`
- `isSearchIndexFile(data: unknown): data is SearchIndexFile` — checks `schemaVersion: string`, `entries: array`
- `isSpatialIndexFile(data: unknown): data is SpatialIndexFile` — checks `schemaVersion: string`, `cellSize: number`, `cells: object`
- `isBuildingIndexFile(data: unknown): data is BuildingIndexFile` — checks `schemaVersion: string`, `buildings: array`
- `isPOIIndexFile(data: unknown): data is POIIndexFile` — checks `schemaVersion: string`, `points: array`

The hydrator does **not** validate field-level content (node ID format, edge distance range, etc.). Those are compiler validations. Schema validation at this level is limited to:
- Required top-level fields exist
- Required arrays are present (even if empty)
- Types match (string, number, array, object)

**Error mapping:**
- File read error → `IO_ERROR`
- JSON parse error → `INVALID_SCHEMA`
- Validator returns false → `INVALID_SCHEMA`

**Tests (4):**
1. Hydrates valid graph artifact successfully
2. Hydrates valid optional artifact (search index)
3. Rejects invalid JSON (parse error)
4. Rejects missing required field (validator fail)

**Acceptance:**
- `npm run test` in `packages/runtime` — 4 new tests pass
- Validators reject clearly malformed artifacts
- Error messages include the artifact name for debugging

---

## T23 — Implement ReferenceValidator

**Description:** Implement inter-artifact reference integrity checks. After all artifacts are hydrated, verify that every cross-reference points to an existing node.

**Files to touch:**
- `packages/runtime/src/loader/reference-validator.ts` — NEW
- `packages/runtime/src/loader/__tests__/validation.test.ts` — NEW

**Interface:**
```typescript
export interface ReferenceValidator {
  /**
   * Validate cross-references between artifacts.
   * Returns empty array if valid, array of errors if invalid.
   */
  validate(pkg: LoadedPackage): ValidationError[]
}

export interface ValidationError {
  readonly message: string
}
```

**Validation checks:**
1. **Edges:** For every `NavEdgeFile`, `edge.from` and `edge.to` must exist in `pkg.graph.nodes` (by `id`). Report each invalid reference with edge ID + missing node ID.
2. **POIs:** For every `POIEntryFile`, `poi.nodeId` must exist in `pkg.graph.nodes`. Report each invalid reference.
3. **Buildings:** For every `BuildingEntryFile`, each entrance's `nodeId` must exist in `pkg.graph.nodes`. Report each invalid reference.
4. **Search:** For every `SearchEntryFile`, `entry.nodeId` must exist in `pkg.graph.nodes`. Report each invalid reference.

**Optimization:** Build a `Set<string>` of all node IDs once (O(nodes)) before running checks. Each reference check is then O(1).

**Edge cases:**
- Artifact is absent → skip its checks (if no POI index, no POI validation)
- Empty graph → only empty arrays are valid
- Self-referencing edge (node→itself) → valid (allows future loop edges)

**Tests (4):**
1. Valid package — all references pass
2. Edge references nonexistent node — returns error
3. POI references nonexistent node — returns error
4. Search entry references nonexistent node — returns error

**Acceptance:**
- `npm run test` in `packages/runtime` — 4 new tests pass
- Error messages include artifact type + specific invalid reference

---

## T24 — Implement Loader orchestrator + integration test

**Description:** Implement the six-step lifecycle in the `Loader` class. Wire `PackageReader`, `ChecksumVerifier`, `ArtifactHydrator`, and `ReferenceValidator` into the orchestrator. Write the end-to-end integration test (`Compiler → Publisher → Loader → LoadedPackage`).

**Files to touch:**
- `packages/runtime/src/loader/loader.ts` — implement six-step lifecycle
- `packages/runtime/src/loader/__tests__/loader.test.ts` — happy path + edge cases
- `packages/runtime/src/loader/__tests__/invariants.test.ts` — all 6 invariants
- `packages/runtime/src/loader/__tests__/integration.test.ts` — end-to-end pipeline

**Five-step lifecycle:**
```
ReadManifest → VerifyChecksums → HydrateArtifacts → ValidateReferences → Return
```

**Error handling table:**

| Step | Error | Code |
|------|-------|------|
| 1 | Manifest ENOENT | `PACKAGE_NOT_FOUND` |
| 1 | Invalid JSON in manifest | `INVALID_SCHEMA` |
| 1 | Missing required fields | `INVALID_SCHEMA` |
| 2 | Checksum mismatch | `CHECKSUM_MISMATCH` |
| 3 | Artifact not found | `MANIFEST_NOT_FOUND` |
| 3 | Invalid JSON in artifact | `INVALID_SCHEMA` |
| 3 | Missing required fields | `INVALID_SCHEMA` |
| 4 | Dangling reference | `INVALID_REFERENCE` |
| 1–4 | Filesystem error | `IO_ERROR` |

**DurationMs:** Captured at the start of step 1 and end of step 4. Includes all I/O, parsing, verification, and validation. Does not include caller overhead.

**Tests (5 + 1 integration):**
1. `load()` succeeds and returns `LoadReport` for valid package
2. `load()` returns `LoadFailure` for nonexistent path
3. `load()` returns `LoadFailure` for missing manifest
4. `load()` returns `LoadFailure` for checksum mismatch
5. `load()` returns `LoadFailure` for invalid reference

6. **Integration test:** Compile a real `CampusDocument` → publish to temp dir → load from temp dir → verify every artifact and the manifest match the compiler's output (structural equality on all fields)

**Invariant tests (6):**
1. `LoadedPackage` fields are `readonly` (compile-time check, TS-level)
2. No partial: every error path returns `LoadFailure`, never throws
3. Checksums before hydration: verify `ChecksumVerifier.verify()` called before `ArtifactHydrator.hydrate()` (use spy/mock)
4. No dangling refs: every `LoadReport.package` passes `ReferenceValidator.validate()` with zero errors
5. Stateless: two identical `load()` calls produce identical `LoadedPackage` content
6. Checksums from bytes, not objects: verify `PackageReader.readBytes()` is called for checksum, not `readFile()`

**Integration test — full pipeline:**
```typescript
const campus = createTestCampus()
const artifacts = compile(campus)
const publishResult = await publisher.publish(artifacts, {
  campusId: 'test',
  campusName: 'Test Campus',
  outputDir: tempDir,
})
const loadResult = await loader.load(publishResult.path)
// verify loadResult.success === true

// Verify graph — structural equality on nodes + edges
expect(loadResult.package.graph.nodes).toEqual(artifacts.graph.nodes)
expect(loadResult.package.graph.edges).toEqual(artifacts.graph.edges)
expect(loadResult.package.graph.campusId).toBe('test')

// Verify search index
if (loadResult.package.searchIndex && artifacts.searchIndex) {
  expect(loadResult.package.searchIndex.entries).toEqual(artifacts.searchIndex.entries)
}

// Verify building index
if (loadResult.package.buildingIndex && artifacts.buildingIndex) {
  expect(loadResult.package.buildingIndex.buildings).toEqual(artifacts.buildingIndex.buildings)
}

// Verify POI index
if (loadResult.package.poiIndex && artifacts.poiIndex) {
  expect(loadResult.package.poiIndex.points).toEqual(artifacts.poiIndex.points)
}

// Verify manifest provenance fields
expect(loadResult.package.manifest.campusId).toBe('test')
expect(loadResult.package.manifest.campusName).toBe('Test Campus')
expect(loadResult.package.manifest.metadata.nodeCount).toBe(artifacts.graph.nodes.length)
expect(loadResult.package.manifest.metadata.edgeCount).toBe(artifacts.graph.edges.length)
```

**Acceptance:**
- `npm run test` in `packages/runtime` — all ~25 new tests pass
- Integration test runs against real filesystem (temp dir)
- No TODOs, no `.skip`, no `.only`

---

## Verification

Each task must pass:

1. `npx tsc --noEmit` in `packages/runtime` — no new type errors
2. `npx vitest run` in `packages/runtime` — all loader tests pass
3. Full workspace: `npm test` from `navi-next/` — all 1056+ tests pass
4. No `@navi/publisher` imports in `packages/runtime/src/` (verify with grep after T0)
5. Old `ArtifactLoader` removed — no references remain
6. Every error code exercised in at least one test

After T24:
7. ADR-012 invariants all enforced
8. Integration test proves full pipeline end-to-end
9. `load()` API frozen — no further changes allowed

---

## Risks

| Risk | Mitigation |
|------|------------|
| Type move breaks publisher tests | Mechanical change — validate with typecheck + test before moving to runtime |
| Old `ArtifactLoader` consumers in engine code | Remove runtime types that reference it; grep for remaining imports |
| SHA-256 mismatch between Node and browser | Use Node's `crypto` module (runtime is Node-first currently); isolate in platform adapter |
| Integration test filesystem isolation | Use `fs.mkdtempSync()` + clean up in `afterAll` |
| `PublishedManifest` still referenced in engine code | Update engine imports to `NavigationPackageManifest` |
