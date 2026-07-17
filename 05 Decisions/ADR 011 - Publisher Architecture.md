# ADR 011: Publisher Architecture

**Status:** Accepted
**Date:** 2026-07-17
**Author:** opencode Architecture Agent

## Context

ADR-009 defined the compiler pipeline that produces `NavigationArtifacts` — an in-memory bundle of graph, search index, spatial index, building index, and POI data. ADR-010 defined `NavigationPackage` — the stable, versioned, on-disk format that serves as the deployment contract between the compiler and the runtime.

The remaining gap is the **publisher**: the layer that transforms `NavigationArtifacts` into a `NavigationPackage` on disk (or, in the future, to a remote store). Without a defined publisher architecture, the compiler would need to know about files, checksums, and atomic writes — violating ADR-008's architectural boundary and ADR-010's invariant that the compiler does not know about packages.

```
NavigationArtifacts     ← ADR-009, produced by Compiler (in-memory, typed)
       │
       ▼
Publisher               ← this ADR (own package: @navi/publisher)
       │
       ▼
NavigationPackage       ← ADR-010, on-disk format
       │
       ▼
LoadedPackage           ← future ADR-012, consumed by Runtime
```

The publisher is the bridge between the compiler's internal types and the package format. It must be deterministic, atomic, and recoverable. It must never know about the compiler's internals beyond `NavigationArtifacts`, and it must never know about the runtime's consumption patterns.

### Package boundaries and dependency direction

```
@navi/core        →  exports NavigationArtifacts, NavigationPackage, and all shared types
@navi/compiler    →  imports types from @navi/core, exports compile()
@navi/publisher   →  imports types from @navi/core, exports publish()
@navi/runtime     →  imports types from @navi/core, exports load()
```

**Dependency graph:**

```
compiler ──→ core ←── publisher
                    ↑
                 runtime
```

Nobody depends on the compiler. The publisher only needs the **types** — it should not depend on the compiler package. `NavigationArtifacts` and `NavigationPackage` live in `@navi/core` as shared interfaces. This keeps the DAG clean and prevents the publisher from accidentally importing compiler internals.

Each package has exactly one responsibility. The publisher does not live in `@navi/compiler` — it is a deployment pipeline concern, not a compilation concern. Moving it out now while it is small prevents the compiler package from accumulating filesystem, checksum, and atomic-rename logic.

### What this ADR does *not* define

- **Remote publishing.** Uploading to Supabase, S3, or a CDN is a separate concern (future ADR).
- **Distribution mechanics.** Package distribution (ZIP, tarball, app bundle) is the runtime loader's concern (ADR-012).
- **Package versioning at the deployment level.** Which package directory the runtime loads is a deployment decision, not a publisher decision.

## Decision

### 1. Provenance Metadata Lives on NavigationArtifacts

The publisher must not know about compiler versions, document revisions, or any other provenance concept. These fields belong to the compiler's output.

`NavigationArtifacts` gains a `metadata` field:

```typescript
interface NavigationArtifacts {
  graph: NavigationGraph
  searchIndex?: SearchIndex
  spatialIndex?: SpatialIndex
  buildingIndex?: BuildingIndex
  poiIndex?: POIIndex

  /** Provenance metadata — populated by the compiler. */
  metadata: ArtifactsMetadata
}

interface ArtifactsMetadata {
  /** Compiler version that produced these artifacts. */
  compilerVersion: string
  /** Revision identifier from the source document. */
  revision: string
  /** ISO 8601 timestamp of compilation. */
  compiledAt: string
}
```

The publisher copies `metadata` into the package manifest verbatim. It never inspects or modifies these values.

**Timestamp relationship:** `compiledAt` (compiler-generated) and `publishedAt` (publisher-generated) are distinct timestamps. They are not interchangeable. The invariant is `compiledAt ≤ publishedAt` — a package is always published after it is compiled.

### 2. Publisher Interface

```typescript
interface Publisher {
  publish(
    artifacts: NavigationArtifacts,
    options: PublishOptions
  ): Promise<PublishResult>
}

interface PublishOptions {
  /** Target campus ID. Matches CampusDocument.id. */
  campusId: string

  /** Human-readable campus name. */
  campusName: string

  /** Output directory (local filesystem). */
  outputDir: string

  /** Schema versions to use for each artifact (optional). */
  schemaVersions?: Partial<ArtifactSchemaVersions>

  /** Commit strategy override (default: AtomicRename). */
  commitStrategy?: Committer
}
```

`NavigationArtifacts` is the only compiler type the publisher imports. This enforces ADR-010's boundary: the compiler can evolve its internal stages without affecting the publisher.

### 3. Publisher is Stateless

The `Publisher` retains no state between `publish()` calls. No caches, no singletons, no open file handles. Each call is self-contained — all state is scoped to the staging directory lifetime. This makes the publisher trivially testable and safe to call concurrently (see §5.7 for concurrency caveats).

### 4. Result Types (Mirroring CompilerReport)

Following ADR-009's `CompilerReport` pattern, the publisher uses a discriminated result type:

```typescript
type PublishResult = PublisherReport | PublishFailure

interface PublisherReport {
  success: true
  /** Path to the published package directory. */
  path: string
  /** Number of artifacts written. */
  artifactCount: number
  /** Total bytes written. */
  totalBytes: number
  /** Duration in milliseconds. */
  durationMs: number
  /** Per-artifact details. */
  artifacts: ArtifactResult[]
}

interface ArtifactResult {
  name: string
  path: string
  checksum: string        // SHA-256 hexadecimal lowercase
  size: number
  schemaVersion: string
}

interface PublishFailure {
  success: false
  /** Machine-readable error code. */
  code: PublishErrorCode
  /** Human-readable message. */
  message: string
  /** Which artifact caused the failure, if applicable. */
  artifact?: string
  /** Duration in milliseconds before failure. */
  durationMs: number
}

type PublishErrorCode =
  | 'PREFLIGHT_FAILED'       // Publishability check failed
  | 'SERIALIZATION_FAILED'   // JSON serialization error
  | 'CHECKSUM_MISMATCH'      // Round-trip verification failed
  | 'IO_ERROR'               // Filesystem error
  | 'COMMIT_FAILED'          // Atomic commit failed
```

**Invariant:** `success: true` and `success: false` are mutually exclusive. The caller checks `result.success` before accessing type-specific fields.

### 5. Internal Architecture

The publisher orchestrates several focused components:

```
Publisher (orchestrator)
   │
   ├── Preflight              ← artifact publishability checks
   ├── EnvironmentProbe       ← outputDir existence, permissions, disk space
   ├── Serializer             ← JSON serialization
   ├── ChecksumService        ← SHA-256 hex computation
   ├── ManifestBuilder        ← build manifest in memory
   ├── PackageWriter          ← writeFile / readFile only
   └── Committer              ← atomic commit (pluggable strategy)
```

Each component has a single responsibility and is independently testable.

#### 5.1 Preflight

Validates that the artifacts are publishable — not that they are correct navigation data:

- Required artifacts exist (`graph` is always required)
- Each present artifact has a known `schemaVersion`
- `campusId` is a non-empty string

The publisher does **not** validate:
- Graph connectivity or routeability
- Node/edge ID uniqueness or cross-references
- `buildingId` values or coordinate ranges
- Metadata counts matching array lengths

Those are **compiler validations**. The compiler must produce structurally correct `NavigationArtifacts`. If it produces bad data, the publisher serializes it faithfully — garbage in, garbage out.

#### 5.2 EnvironmentProbe

Checks the environment before any writes:

- `outputDir` exists
- `outputDir` is writable
- Enough free space (optional, configurable threshold)

#### 5.3 Serializer

Converts an artifact data structure to JSON bytes:

```typescript
interface Serializer {
  serialize(data: unknown): Uint8Array
}
```

Uses compact JSON (`JSON.stringify(value, null, 0)`) — no whitespace. Returns `Uint8Array` to avoid encoding ambiguity.

#### 5.4 ChecksumService

Computes SHA-256 digests:

```typescript
interface ChecksumService {
  /** SHA-256 hex lowercase of the given bytes. */
  hash(data: Uint8Array): string

  /** SHA-256 hex lowercase of a file on disk. */
  hashFile(path: string): Promise<string>
}
```

Algorithm: **SHA-256**, encoding: **hexadecimal lowercase**. Explicit specification prevents future ambiguity (no Base64 variants, no uppercase).

#### 5.5 ManifestBuilder

Builds the `NavigationPackageManifest` entirely in memory:

```typescript
interface ManifestBuilder {
  build(options: {
    campusId: string
    campusName: string
    metadata: ArtifactsMetadata
    artifacts: ArtifactWriteResult[]
  }): NavigationPackageManifest
}
```

The manifest is built once and written once (Step 7 of the lifecycle). It never contains placeholder checksums.

#### 5.6 PackageWriter

The simplest component — pure file I/O:

```typescript
interface PackageWriter {
  /** Create a staging directory. */
  createStagingDir(basePath: string, campusId: string): Promise<string>

  /** Write bytes to a file in the staging directory. */
  writeFile(relativePath: string, data: Uint8Array): Promise<void>

  /** Read bytes from a file in the staging directory. */
  readFile(relativePath: string): Promise<Uint8Array>

  /** Delete the staging directory. */
  destroy(): Promise<void>
}
```

`PackageWriter` does not serialize, checksum, or validate — it only reads and writes bytes.

#### 5.7 Committer (Pluggable Strategy)

Handles the atomic cut-over from staging to final:

```typescript
interface Committer {
  commit(stagingPath: string, packagePath: string): Promise<CommitResult>
}

type CommitResult = {
  success: true
} | {
  success: false
  code: 'COMMIT_FAILED'
  message: string
}
```

**Default: `AtomicRename`** — Uses `rename()` syscall on the same filesystem.
- No existing package: staging renamed directly to `packagePath`
- Existing package: old → `<campusId>.bak.<timestamp>`, staging → `<campusId>`, `.bak` deleted after 1s on success
- If staging→final fails: `.bak` restored to `<campusId>`

**Future: `VersionedDirectory`** — Staging committed to `<campusId>/v/<timestamp>/`. Loader reads latest via symlink or pointer.

**Future: `SymlinkSwitch`** — Staging written to versioned directory; symlink `<campusId>/current` atomically swapped.

**Concurrent publishing is unsupported.** If two processes publish to the same output directory simultaneously, behavior is implementation-defined per commit strategy. The default `AtomicRename` may produce a stale `.bak` or overwrite one publish with another. Multi-publisher deployments (CI, nightly builds) should use a strategy with explicit concurrency guarantees, or serialize publishes.

### 6. Publish Lifecycle

Every publish follows this sequence:

```
┌──────────────────────────────┐
│  1. Preflight                │  → validate artifact publishability
├──────────────────────────────┤
│  2. Environment Probe        │  → check outputDir exists and writable
├──────────────────────────────┤
│  3. Create Staging Directory │  → temp dir under outputDir
├──────────────────────────────┤
│  4. Serialize & Write        │  → each artifact → JSON bytes → .nav.json
├──────────────────────────────┤
│  5. Compute Checksums        │  → SHA-256 hex lowercase per file
├──────────────────────────────┤
│  6. Build Manifest           │  → in memory (never placeholder state)
├──────────────────────────────┤
│  7. Write Manifest           │  → campus.nav.json (LAST staged file)
├──────────────────────────────┤
│  8. Round-trip Verify        │  → checksum → deserialize → schema → semantic
├──────────────────────────────┤
│  9. Atomic Commit            │  → via Committer strategy
└──────────────────────────────┘
```

Steps 1–2 run before any I/O. Steps 3–8 happen inside the staging directory. Step 9 is the only externally-visible mutation.

**Invariant:** The manifest is always the final file written inside the staging directory. At any point before the manifest exists, the staging directory is not a valid package. This makes partial-publish detection natural — the runtime loader (ADR-012) checks for manifest existence as its first validation.

#### Step 1 — Preflight

`Preflight` validates publishability of `NavigationArtifacts` (see §5.1). If this fails, no files are touched and the result is `PublishFailure { code: 'PREFLIGHT_FAILED' }`.

#### Step 2 — Environment Probe

`EnvironmentProbe` checks `outputDir` and environment (see §5.2). If this fails, result is `PublishFailure { code: 'IO_ERROR' }`.

#### Step 3 — Create Staging Directory

`PackageWriter.createStagingDir()` creates `<outputDir>/.<campusId>.<timestamp>.staging`. The timestamp is the ISO 8601 instant when staging begins, in UTC. The directory is on the same filesystem as the target so the final commit can use `rename()`.

#### Step 4 — Serialize and Write

For each artifact (in alphabetical order by filename for determinism):

1. `Serializer.serialize(artifact)` → `Uint8Array`
2. `PackageWriter.writeFile(filename, bytes)` → disk

#### Step 5 — Compute Checksums

`ChecksumService.hashFile(relativePath)` for each artifact file. Returns SHA-256 hexadecimal lowercase.

#### Step 6 — Build Manifest

`ManifestBuilder.build()` assembles the manifest in memory with:
- Artifact metadata (names, paths, checksums, sizes, schema versions)
- Provenance metadata from `NavigationArtifacts.metadata`
- New `publishedAt` timestamp
- Package-level metadata (node count, edge count, etc.)

#### Step 7 — Write Manifest (Once, Last)

`PackageWriter.writeFile('campus.nav.json', serialized)` — the manifest is serialized and written in a single operation. It is never rewritten.

**This is the last staged file.** After this write, the staging directory is a complete, self-validating package.

#### Step 8 — Round-Trip Verification

Every staged file is verified in this order:

```
disk bytes
   │
   ▼ (1) ChecksumService.hashFile()
   │
   ▼ (2) compare against manifest checksum
   │
   ▼ (3) JSON.parse() — valid JSON
   │
   ▼ (4) schema validation — required fields present, correct types
   │
   ▼ (5) semantic validation — edge references valid node IDs, buildingId set
```

Checksum first — if checksum fails, skip further checks for that file. This avoids wasting time parsing corrupt data. If any check fails, the staging directory is destroyed and the result is `PublishFailure { code: 'CHECKSUM_MISMATCH' | 'SERIALIZATION_FAILED' }`.

**Note on semantic validation (Step 5):** This is a lightweight publisher-level check limited to package integrity (node references exist, buildingId is non-empty). It is NOT a substitute for compiler-level graph validation (connectivity, routeability, coordinate ranges).

#### Step 9 — Atomic Commit

`Committer.commit(stagingPath, packagePath)` via the configured strategy. Default: `AtomicRename` (see §5.7). If commit fails, staging is cleaned up and result is `PublishFailure { code: 'COMMIT_FAILED' }`.

### 7. Staging Directory Cleanup

If any step between 3 and 9 fails, `PackageWriter.destroy()` deletes the staging directory. Orphaned staging directories (`.*.staging`) older than 1 hour are garbage-collected.

### 8. Rollback

Rollback is defined at the **distribution level**, not the publisher level. The publisher creates immutable packages (ADR-010 Invariant #3). Each publish produces a new package directory.

The `AtomicRename` committer keeps the immediately-preceding version as `.bak.<timestamp>` for emergency rollback. The runtime loader (ADR-012) decides which package directory to load — rolling back means pointing to an older directory.

### 9. Determinism Guarantee

Given identical `NavigationArtifacts` and identical `PublishOptions`, the publisher produces identical package bytes (excluding `publishedAt`):

- Compact JSON serialization (`JSON.stringify(value, null, 0)`)
- SHA-256 hexadecimal lowercase from file bytes
- Deterministic artifact write order (alphabetical by filename)
- `publishedAt` excluded from manifest checksum (ADR-010 §4.2)
- Manifest built in memory and written once — no placeholder state

A determinism test MUST verify that two publishes with identical input produce identical checksums across all artifacts.

### 10. Implementation Package

The publisher lives in its own package, separate from the compiler:

```
packages/publisher/
├── package.json              # @navi/publisher
├── src/
│   ├── index.ts              # Public API: publish()
│   ├── types.ts              # PublishOptions, PublishResult, etc.
│   ├── publisher.ts          # Orchestrator — lifecycle steps 1–9
│   ├── preflight.ts          # Step 1: artifact publishability checks
│   ├── filesystem-probe.ts   # Step 2: outputDir checks
│   ├── serializer.ts         # Step 4: compact JSON serialization
│   ├── checksum.ts           # Step 5: SHA-256 hex lowercase
│   ├── manifest-builder.ts   # Step 6: build manifest in memory
│   ├── package-writer.ts     # Steps 3–7: staging dir, read/write files
│   ├── round-trip-verifier.ts# Step 8: checksum → deserialize → validate
│   ├── committer.ts          # Step 9: Committer interface + AtomicRename
│   ├── cleanup.ts            # Orphaned staging GC
│   └── __tests__/
│       ├── publisher.test.ts       # Happy path + edge cases
│       ├── atomicity.test.ts       # Failure scenarios, partial writes
│       ├── determinism.test.ts     # Same input → same checksums
│       └── recovery.test.ts        # Crash recovery, orphan cleanup
```

**Dependencies:**
- `@navi/compiler` (dev) — for `NavigationArtifacts` types
- `@navi/core` — for shared types (optional, if types are duplicated)

**Key constraint:** `@navi/publisher` exports only `publish()`, `PublishOptions`, and `PublishResult`. The runtime never imports the publisher.

### 11. Future Remote Publisher (Not Implemented)

A future remote publisher replaces `PackageWriter` and `Committer`:

- `PackageWriter`: Writes to local temp directory (same Steps 4–7)
- `Committer`: Uploads each file to remote store with checksum verification; uses store-native versioning instead of rename

Preflight, serialization, checksums, and verification are identical. Only the "where files live and how they're finalized" changes.

## Consequences

### Positive

- **Own package, one responsibility.** `@navi/publisher` keeps deployment pipeline concerns out of the compiler. The compiler never accumulates filesystem logic.
- **Manifest written once.** No placeholder state, no double-write. Simpler and safer.
- **Preflight validates publishability, not navigation.** No validator drift between compiler and publisher.
- **Clean result types.** Discriminated union prevents invalid states. Mirrors ADR-009's `CompilerReport`.
- **Focused components.** `PackageWriter` does only I/O. `Serializer`, `ChecksumService`, `ManifestBuilder` are independently testable.
- **Pluggable commit strategy.** Default `AtomicRename` for single-publisher; future strategies for multi-publisher deployments.
- **Provenance is the compiler's job.** `NavigationArtifacts.metadata` carries all provenance fields. Publisher copies them blindly.
- **SHA-256 hexadecimal lowercase.** Algorithm and encoding are explicit — no ambiguity.
- **Round-trip verification: checksum first.** Corrupt files are rejected before parsing.
- **Publisher is the only bridge.** The compiler never writes files. The runtime never reads compiler types. ADR-008 fully enforced.

### Negative

- **New package.** `@navi/publisher` adds build overhead (another `package.json`, another build target). Acceptable for architectural clarity.
- **Read-after-write for checksums.** Each artifact is written, then read back for checksum computation. Acceptable for file sizes involved (tens of KB to low MB).
- **Staging directory overhead.** Every publish creates and destroys a staging directory. Adds latency on slow filesystems.
- **No incremental publish.** Changing one artifact requires republishing the entire package. Acceptable for whole-campus updates.
- **Local filesystem only.** Remote publishing deferred. Interface is designed for it, but implementation is deferred.

## Alternatives Considered

| Alternative | Pros | Cons | Reason Rejected |
|---|---|---|---|
| Publisher in `@navi/compiler` | Fewer packages, simpler imports | Compiler accumulates filesystem/checksum logic | Separate package keeps each focused |
| Monolithic `PackageWriter` | Single file, simple | 6 responsibilities in one class | Split into focused components |
| Persistent `PublisherReport` on disk | Audit trail | PublishResult already carries info; logging suffices | Remove — don't create persistent artifacts speculatively |
| Hooks system | Extensible | Premature — don't know extension points yet | Defer until real extension needs emerge |
| Manifest written twice | Simpler implementation | Placeholder state, double-write risk | Write once, as last staged file |
| Publisher validates graph correctness | Catches bugs early | Validator drift, duplicated logic | Preflight validates publishability only |
| `success: true + errors[]` | Single result type | Invalid states (`success=true + errors`) | Discriminated result prevents invalid states |

## Related

- Depends on: ADR-009 (Compiler Pipeline) — produces the `NavigationArtifacts` consumed by `@navi/publisher`
- Depends on: ADR-010 (Navigation Package Format) — defines the format `@navi/publisher` writes
- Enables: ADR-012 (Runtime Loader) — defines `load()` which reads packages `@navi/publisher` creates
- Referenced by: M5 Phase 3 Implementation Plan — the first concrete implementation of this ADR
