# T24 — PackageLoader

## WHAT

Create `PackageLoader` — the orchestrator that wires T20–T23 into a single pipeline (ADR-012 §6).

```
PackageLoader.load(path)
 │
 ├── read manifest.json              (PackageReader)
 ├── verify manifest checksum        (PackageReader reads, no checksum on manifest)
 ├── for each artifact in manifest:
 │   ├── read artifact file          (PackageReader)
 │   ├── verify checksum             (ChecksumVerifier)
 │   ├── validate schema             (ArtifactHydrator + validator)
 │   └── validate cross-refs        (ReferenceValidator — after all artifacts loaded)
 │
 └── return LoadResult<LoadedPackage>
       with LoadReport[] per artifact
```

Each artifact processing step produces a `LoadReport` entry. If any step fails for an artifact, that artifact's report records the failure but the pipeline continues with remaining artifacts (resilient). Cross-reference validation runs after all artifacts are loaded and can fail independently.

## Non-goals

- ❌ No CLI (future)
- ❌ No caching
- ❌ No retry logic
- ❌ No package download (future — offline packages only)

## Success Criteria

1. Valid package path → `LoadSuccess` with `LoadedPackage` containing all artifacts
2. Missing manifest → `LoadFailure { code: 'MISSING_MANIFEST' }`
3. Invalid manifest JSON → `LoadFailure { code: 'INVALID_MANIFEST' }`
4. Missing artifact file → `LoadFailure` with report per failed artifact
5. Checksum mismatch → `LoadFailure` with report
6. Invalid schema version → `LoadFailure` with report
7. Cross-reference error → `LoadFailure` with report
8. Unknown artifact path referenced in manifest → graceful skip with report
9. Each artifact gets a `LoadReport` (success: artifact data, or failure: error code + message)
10. All old tests still green

## Pitfalls

- Pipeline resilience: artifact-level failures don't abort the whole load — collect reports
- Package-level failures (missing manifest, invalid manifest) do abort
- ADR-012 §6: PackageLoader orchestrates; it does not implement any sub-step itself
- Three categories of report: `LOADED`, `SKIPPED`, `FAILED`
