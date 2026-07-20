# T24 Plan — PackageLoader

## Architecture

```
load(path)
 │
 ├── new PackageReader (FilesystemReader)
 ├── read manifest
 │   └─ fail → MISSING_MANIFEST / INVALID_MANIFEST
 │
 ├── verify manifest checksum (read + hash manifest bytes)
 │
 ├── for each artifact in manifest.artifacts:
 │   ├── read file          → report FAILED if missing
 │   ├── verify checksum    → report FAILED if mismatch
 │   ├── hydrate + validate → report FAILED if schema error
 │   └── store for cross-ref
 │
 ├── if any artifact loaded → run ReferenceValidator
 │
 └── return LoadResult<LoadedPackage>
       with LoadedPackage { manifest, artifacts, reports }
```

`LoadReport` has 3 variants:
- `LOADED` — artifact loaded successfully, includes data
- `SKIPPED` — artifact skipped (unknown type), includes reason
- `FAILED` — artifact failed, includes code + message

`LoadErrorCode` gets 2 new codes: `MISSING_MANIFEST`, `INVALID_MANIFEST`

## Tasks

### T1 — LoadReport types + new LoadErrorCodes
**Files**: `packages/runtime/src/loader/types.ts`
- Add `LoadReport = LoadedReport | SkippedReport | FailedReport`
- Add `LoadedReport { status: 'LOADED', artifactType: string, data: unknown }`
- Add `SkippedReport { status: 'SKIPPED', artifactType: string, reason: string }`
- Add `FailedReport { status: 'FAILED', artifactType: string, code: string, message: string }`
- Add `MISSING_MANIFEST` and `INVALID_MANIFEST` to `LoadErrorCode`

**Acceptance**: Types compile.

### T2 — PackageLoader orchestrator
**Files**: `packages/runtime/src/loader/package-loader.ts`
- Constructor takes `PackageReader`, `ChecksumVerifier`, `ArtifactHydrator`, `ReferenceValidator`, and configuration
- `load(path): Promise<LoadResult<LoadedPackage>>`
- Orchestrates the full pipeline: read → verify → hydrate → validate → collect
- Artifact-level failures collected in reports, don't abort
- Manifest-level failures abort immediately

**Acceptance**: Orchestrator wires all existing components.

### T3 — Artifact type-to-validator mapping
**Files**: `packages/runtime/src/loader/package-loader.ts` (or a new `artifact-registry.ts`)
- Map from manifest artifact key to validator + JSON field mapping
- Known types: `graph` → graphValidator, `search` → searchValidator, `buildings` → buildingValidator, `poi` → poiValidator
- Unknown types → SkippedReport

**Acceptance**: Unknown artifact types are skipped gracefully.

### T4 — Tests
**Files**: `packages/runtime/src/loader/__tests__/package-loader.test.ts`
- Valid package → success with all artifacts and reports
- Missing manifest file → MISSING_MANIFEST
- Invalid manifest JSON → INVALID_MANIFEST
- Single artifact checksum mismatch → FAILED report
- Single artifact invalid schema → FAILED report
- Unknown artifact type → SKIPPED report
- Cross-reference failure → failure with references
- All old tests still green

**Acceptance**: 8+ tests, all green.

## Error Prevention

- ERRORS.md 2026-07-08: Orchestrator is procedural, not a state machine framework
- ADR-012 §6: PackageLoader orchestrates existing components; zero sub-step logic
- Manifest-level failures abort; artifact-level failures collect and continue
- Use test fixtures from existing tests (packages/runtime/test/fixtures/)
