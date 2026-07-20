# M5 Phase 3 Plan: @navi/publisher — Navigation Package Publisher

## Architecture

```
@navi/publisher
├── types.ts              — PublishOptions, PublishResult, PublishErrorCode
├── index.ts              — publish() (public API, re-exports)
├── publisher.ts          — Orchestrator: lifecycle steps 1–9
├── preflight.ts          — Step 1: artifact publishability checks
├── filesystem-probe.ts   — Step 2: outputDir checks
├── serializer.ts         — Step 4: compact JSON → Uint8Array
├── checksum.ts           — Step 5: SHA-256 hex lowercase
├── manifest-builder.ts   — Step 6: build manifest in memory
├── package-writer.ts     — Steps 3–7: staging dir, read/write files
├── round-trip-verifier.ts— Step 8: checksum → parse → schema → semantic
├── committer.ts          — Step 9: Committer interface + AtomicRename
├── cleanup.ts            — Orphaned staging GC
└── __tests__/
    ├── publisher.test.ts       — Happy path + edge cases
    ├── atomicity.test.ts       — Failure scenarios, partial writes
    ├── determinism.test.ts     — Same input → same checksums
    └── recovery.test.ts        — Crash recovery, orphan cleanup
```

### Dependency Graph

```
types.ts ← no deps
checksum.ts ← no deps
serializer.ts ← no deps
preflight.ts ← types
filesystem-probe.ts ← no deps
package-writer.ts ← types
manifest-builder.ts ← types, checksum
committer.ts ← types
round-trip-verifier.ts ← checksum, serializer
cleanup.ts ← package-writer
publisher.ts ← all of the above
```

### Data Flow

```
NavigationArtifacts
    │
    ▼
┌─────────────────────────────┐
│ Preflight                   │  required artifacts exist, known schemaVersion
│ EnvironmentProbe            │  outputDir exists, writable
└─────────────────────────────┘
    │
    ▼ staging directory created
┌─────────────────────────────┐
│ Serializer                  │  artifact → compact JSON bytes
│ PackageWriter.writeFile()   │  bytes → .nav.json in staging
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ ChecksumService.hashFile()  │  SHA-256 hex lowercase per artifact
│ ManifestBuilder.build()     │  in memory (not yet written)
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Serializer(manifest)        │  compact JSON bytes
│ PackageWriter.writeFile()   │  campus.nav.json (LAST file)
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ RoundTripVerifier.verify()  │  checksum → parse → schema → semantic
└─────────────────────────────┘
    │
    ▼
┌─────────────────────────────┐
│ Committer.commit()          │  AtomicRename: staging → final
└─────────────────────────────┘
    │
    ▼
PublishResult (success or failure)
```

### Type Boundaries

**@navi/core** owns domain types only — no deployment/infrastructure types:
- NavigationArtifacts, NavigationGraph, NavNode, NavEdge, NavNodeType, NavEdgeType
- SearchIndex, SearchEntry, SpatialIndex, BuildingIndex, BuildingEntry, POIIndex, POI
- BoundingBox, ArtifactsMetadata (provenance: compilerVersion, revision, compiledAt)

**@navi/publisher** owns deployment format types locally:
- NavigationPackageManifest, PackageArtifact, PackageMetadata
- NavigationGraphFile, SearchIndexFile, SpatialIndexFile, BuildingIndexFile, POIIndexFile
- PublishOptions, PublishResult, PublisherReport, PublishFailure, PublishErrorCode

Rationale: NavigationPackage is infrastructure (deployment format), not a shared domain concept. Keeping it out of core prevents core from accumulating deployment concerns. If runtime later needs the same types, they can move to a `@navi/navigation-format` package — but not before.

## Tasks

### T13A — Shared type migration (domain types only)

**Description:** Move domain types from compiler/src/types/index.ts to @navi/core/src/types/. Specifically: NavigationArtifacts (with new ArtifactsMetadata), NavigationGraph, NavNode, NavEdge, NavNodeType, NavEdgeType, BoundingBox, SearchIndex, SearchEntry, SpatialIndex, BuildingIndex, BuildingEntry, POIIndex, POI, CompilerReport, CompilerStatistics, CompilerDiagnostic. Update compiler imports to use @navi/core. Do NOT touch NavigationPackage types — those stay in publisher.

NavigationArtifacts gains `ArtifactsMetadata metadata` field per ADR-011 §1.

**Files to touch:**
- `packages/core/src/types/` — add navigation-artifacts.ts with domain types
- `packages/core/src/types/index.ts` — re-export new module
- `packages/compiler/src/types/index.ts` — remove moved types, re-export from @navi/core
- `packages/compiler/src/artifacts/` — update imports to use @navi/core types
- `packages/compiler/src/pipeline/` — update imports
- `packages/compiler/src/emitter/` — update imports
- `packages/runtime/src/loader/artifact-loader.ts` — update import from `@navi/compiler` to `@navi/core`
- `packages/runtime/src/loader/types.ts` — update type imports

**Acceptance:**
- NavigationArtifacts, NavigationGraph, NavNode, NavEdge, SearchIndex, SpatialIndex, BuildingIndex, POIIndex, POI, BoundingBox, ArtifactsMetadata importable from @navi/core
- Compiler compiles without errors importing from @navi/core
- Runtime compiles without errors importing from @navi/core
- All compiler tests pass (219+)
- All core tests pass
- All runtime tests pass

### T13B — Publisher package scaffold

**Description:** Create the @navi/publisher package with no implementation. Sets up package.json, tsconfig, empty source files, public index.ts exports. This is a separate task from T13A so that type migration and package creation can be debugged independently.

**Files to touch:**
- `packages/publisher/package.json` — `name: "@navi/publisher"`, depends on `@navi/core`, type: module
- `packages/publisher/tsconfig.json` — extends root tsconfig
- `packages/publisher/src/index.ts` — empty exports placeholder
- `packages/publisher/src/types.ts` — placeholder comment
- `packages/publisher/src/__tests__/` — empty directory with .gitkeep

**Acceptance:**
- `@navi/publisher` resolves in workspace
- `import { ... } from '@navi/publisher'` compiles (exports nothing yet)
- Root `npm run test` includes publisher (0 tests, no failure)

### T14 — NavigationPackage types + PackageBuilder (pure transform)

**Description:** Establish the in-memory NavigationPackage model and the pure transform that converts NavigationArtifacts into it. The PackageBuilder is a pure function — no filesystem, no hashing, no serialization, no timestamps beyond publishedAt. It flattens LatLng objects into flat lat/lng fields (per ADR-010 §3.1) and reshapes the data into the serializable Package format. This is the most important transform in the publisher.

```text
NavigationArtifacts (typed, domain-oriented)
     │
     ▼  PackageBuilder.build()
     │
NavigationPackage (typed, deployment-oriented, flat fields)
     │
     ▼  (later: Serializer → bytes → checksum → files)
```

**Files to touch:**
- `packages/publisher/src/types.ts` — NavigationPackage, NavigationPackageManifest, PackageArtifact, PackageMetadata, NavigationGraphFile, NavNodeFile, NavEdgeFile, SearchIndexFile, SearchEntryFile, SpatialIndexFile, BuildingIndexFile, BuildingEntryFile, FloorEntryFile, EntranceEntryFile, POIIndexFile, POIEntryFile + PublishOptions, PublishResult, PublisherReport, PublishFailure, PublishErrorCode, ArtifactResult
- `packages/publisher/src/package-builder.ts` — pure function: build(artifacts, options) → BuiltPackage
- `packages/publisher/src/index.ts` — export public API
- `packages/publisher/src/__tests__/package-builder.test.ts`

**Acceptance:**
- PackageBuilder flattens NavNode.position into lat/lng fields
- PackageBuilder flattens SearchEntry.position into lat/lng fields
- PackageBuilder flattens BuildingEntry.position into lat/lng fields
- PackageBuilder flattens POI.position into lat/lng fields
- PackageBuilder copies ArtifactsMetadata verbatim into manifest
- PackageBuilder populates PackageMetadata (nodeCount, edgeCount, buildingCount, floorCount, boundingBox, r eouteable)
- PackageBuilder produces deterministic output — same NavigationArtifacts → identical objects
- PackageBuilder is pure — no I/O, no side effects, no timestamps (except publishedAt which is passed via PublishOptions)
- All properties are pure — all required fields present, optional artifacts omitted when absent

### T15 — Serializer + ChecksumService

**Description:** Implement Serializer (compact JSON → Uint8Array with no whitespace). Implement ChecksumService (SHA-256 hex lowercase for bytes). These operate on bytes — no knowledge of NavigationPackage structure.

```text
NavigationPackage (typed)
     │
     ▼  Serializer.serialize()
     │
Uint8Array (compact JSON)
     │
     ▼  ChecksumService.hash()
     │
string (SHA-256 hex)
```

**Files to touch:**
- `packages/publisher/src/serializer.ts`
- `packages/publisher/src/checksum.ts`
- `packages/publisher/src/index.ts` — export public API additions
- `packages/publisher/src/__tests__/serializer.test.ts`
- `packages/publisher/src/__tests__/checksum.test.ts`

**Acceptance:**
- Serializer.serialize(data) → Uint8Array of compact JSON (no whitespace, no trailing newline)
- ChecksumService.hash(Uint8Array) → SHA-256 hex lowercase string
- Unit tests pass for both components

### T16 — Preflight + EnvironmentProbe + PackageWriter

**Description:** Implement Preflight (validate artifacts are publishable: required artifacts exist, known schemaVersion, non-empty campusId). Implement EnvironmentProbe (outputDir exists, writable, free space). Implement PackageWriter (create staging directory, write file, read file, destroy).

**Files to touch:**
- `packages/publisher/src/preflight.ts`
- `packages/publisher/src/filesystem-probe.ts`
- `packages/publisher/src/package-writer.ts`
- `packages/publisher/src/__tests__/preflight.test.ts`
- `packages/publisher/src/__tests__/filesystem-probe.test.ts`
- `packages/publisher/src/__tests__/package-writer.test.ts`

**Acceptance:**
- Preflight rejects missing graph artifact → PREFLIGHT_FAILED
- Preflight accepts all artifacts present and valid
- EnvironmentProbe rejects non-existent outputDir → IO_ERROR
- EnvironmentProbe accepts writable directory
- PackageWriter creates staging dir with correct naming convention
- PackageWriter.writeFile creates file at relative path
- PackageWriter.readFile returns exact bytes written
- PackageWriter.destroy removes staging dir

### T17 — ManifestBuilder + Committer + RoundTripVerifier

**Description:** Implement ManifestBuilder (build NavigationPackageManifest in memory from artifact write results + metadata). Implement Committer interface + AtomicRename strategy (rename staging to final, backup existing, rollback on failure). Implement RoundTripVerifier (checksum → parse → schema → semantic).

**Files to touch:**
- `packages/publisher/src/manifest-builder.ts`
- `packages/publisher/src/committer.ts`
- `packages/publisher/src/round-trip-verifier.ts`
- `packages/publisher/src/__tests__/manifest-builder.test.ts`
- `packages/publisher/src/__tests__/committer.test.ts`
- `packages/publisher/src/__tests__/round-trip-verifier.test.ts`

**Acceptance:**
- ManifestBuilder.build() returns valid NavigationPackageManifest
- Manifest includes all artifacts with correct checksums and sizes
- Manifest copies ArtifactsMetadata values verbatim
- Manifest.publishedAt is set to current time
- publishedAt excluded from manifest checksum (determinism invariant)
- AtomicRename commits staging to final path
- AtomicRename creates .bak when replacing existing package
- AtomicRename restores .bak if commit fails
- Committer returns COMMIT_FAILED on error
- RoundTripVerifier passes correct package
- RoundTripVerifier rejects checksum mismatch → CHECKSUM_MISMATCH
- RoundTripVerifier rejects invalid JSON
- RoundTripVerifier rejects missing required fields
- RoundTripVerifier rejects dangling edge references

### T18 — Publisher orchestrator + integration tests + runtime loadability

**Description:** Wire the full publish() lifecycle (steps 1–9). Create integration tests for determinism, atomicity, recovery, runtime loadability, and end-to-end happy path. Implement Cleanup (orphaned staging GC).

The runtime loadability test uses a minimal in-test loader — not the real `@navi/runtime` ArtifactLoader. This proves the publisher output is consumable without depending on ADR-012. The minimal loader:
1. Reads each file from disk
2. Verifies checksum against manifest
3. JSON.parses each artifact
4. Validates required fields exist
5. Returns a `LoadedPackage` (local test type)

**Files to touch:**
- `packages/publisher/src/publisher.ts` — publish() orchestrator wiring steps 1–9
- `packages/publisher/src/cleanup.ts` — orphaned staging GC
- `packages/publisher/src/__tests__/publisher.test.ts` — integration tests
- `packages/publisher/src/__tests__/atomicity.test.ts` — failure injection tests
- `packages/publisher/src/__tests__/determinism.test.ts` — identical checksum tests
- `packages/publisher/src/__tests__/recovery.test.ts` — orphan cleanup + rollback tests
- `packages/publisher/src/__tests__/loadability.test.ts` — minimal loader verification

**Acceptance:**
- Publisher.publish() produces correct NavigationPackage on disk
- Publisher.publish() fails gracefully for each error mode
- Publisher.publish() is idempotent — calling it N times with identical input produces identical checksums each time and mutates no in-memory state
- Determinism: two publishes with identical NavigationArtifacts produce identical checksums across all artifacts
- Atomicity: injected failure at any step produces PublishFailure with no partial package on disk
- Recovery: cleanup() removes orphaned staging directories
- Loadability: minimal loader can consume every published artifact
- End-to-end: publish() with real NavigationArtifacts produces valid NavigationPackage
- All existing tests pass across the workspace

## Error Prevention

| Error | Task | Prevention |
|-------|------|------------|
| Manifest written before checksums known | T16/T17 | Manifest built in memory in T16, written in T17 as LAST action after all serialization+checksums |
| publishedAt included in checksum | T16 | publishAt field explicitly excluded when building manifest checksum |
| Publisher imports compiler internals | T13/T14 | Publisher ONLY imports from @navi/core — enforce in review |
| Staging dir not cleaned up on failure | T15/T17 | PackageWriter.destroy() called in finally block |
| Preflight too permissive | T15 | Graph artifact is the ONLY required artifact; others optional |
| SHA-256 vs other hash algorithm | T14 | Single implementation, explicit algorithm choice in ADR |
| Concurrent staging dir name collision | T15 | Timestamp in staging dir name ensures uniqueness |
