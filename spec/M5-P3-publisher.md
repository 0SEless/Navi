# M5 Phase 3: @navi/publisher — Navigation Package Publisher

## WHAT

Implement the `@navi/publisher` package that transforms `NavigationArtifacts` (produced by the compiler) into a `NavigationPackage` on disk — the stable, versioned, self-contained deployment format defined by ADR-010.

The publisher is the bridge between the compiler's internal types and the on-disk package format. It is a separate package (`@navi/publisher`) that imports only shared types from `@navi/core`. It must be deterministic, atomic, and stateless.

## Architecture

```
NavigationArtifacts  ──►  @navi/publisher  ──►  NavigationPackage (on disk)
   (from compiler)           publish()                (ADR-010 format)
```

### Dependency Direction

```
@navi/compiler ──► @navi/core ◄── @navi/publisher
                       ▲
                  @navi/runtime
```

### Lifecycle

```
1. Preflight           → validate artifact publishability
2. Environment Probe   → check outputDir exists and writable
3. Create Staging Dir  → temp dir under outputDir
4. Serialize & Write   → each artifact → compact JSON → .nav.json
5. Compute Checksums   → SHA-256 hex lowercase per file
6. Build Manifest      → in memory (never placeholder state)
7. Write Manifest      → campus.nav.json (LAST staged file)
8. Round-trip Verify   → checksum → deserialize → validate
9. Atomic Commit       → via Committer strategy
```

## Success Criteria

1. **NavigationArtifacts domain types live in @navi/core** — compiler domain types (NavigationArtifacts, NavNode, NavEdge, BoundingBox, search/spatial/building/POI indices, ArtifactsMetadata) are migrated to core. NavigationPackage format types stay local to publisher until runtime needs them.
2. **publish() correctly produces a NavigationPackage** — given valid NavigationArtifacts, the output directory contains exactly the expected files with correct content and checksums
3. **Deterministic output** — two publishes with identical input produce identical checksums across all artifacts (excluding publishedAt)
4. **Atomic commit** — a failed publish leaves no partial package; a successful publish produces a complete, self-validating package
5. **Round-trip verification** — every staged file is verified (checksum → JSON parse → schema check → semantic check) before commit
6. **Graceful failure** — each failure mode (preflight, serialization, IO, checksum mismatch, commit failure) produces the correct `PublishFailure` with appropriate error code
7. **publish() is idempotent** — calling publish() multiple times with identical input produces identical checksums and does not mutate any in-memory state (reinforces ADR-011 stateless design)
8. **Published package is loadable** — a minimal loader (JSON.parse → validate → return LoadedPackage) can consume the publisher output without errors
9. **All existing tests pass** — compiler tests (219+), core tests, and no regressions in the monorepo

## Non-goals

- ❌ No remote publishing (CDN, Supabase, S3) — deferred
- ❌ No distribution mechanics (ZIP, tarball) — deferred to runtime loader
- ❌ No package versioning at the deployment level
- ❌ No multi-publisher concurrency support
- ❌ No changes to the compiler pipeline beyond type migration
- ❌ No schema validation beyond package integrity checks

## Pitfalls from ADR-011

- Manifest must be the LAST file written inside staging (not before all artifacts have checksums)
- publishedAt is excluded from manifest checksum (ADR-010 §4.2)
- Preflight validates publishability only — NOT graph correctness (that's the compiler's job)
- Semantic validation in round-trip verify is LIMITED to: edge refs point to valid node IDs, buildingId is non-empty, manifest artifact entries exist on disk
- publishedAt ≠ compiledAt — publisher generates publishedAt, copies compiledAt from metadata
- Concurrent publishing is unsupported — behavior is implementation-defined
- `@navi/publisher` must NOT depend on `@navi/compiler` — only on `@navi/core`
- Staging directory uses `<campusId>.<timestamp>.staging` convention on same filesystem
