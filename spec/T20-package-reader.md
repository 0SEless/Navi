# T20 — PackageReader + FilesystemReader

## WHAT

Create the filesystem abstraction layer for the new loader pipeline (ADR-012 §5.1).

One interface, one implementation:

- **`PackageReader`** (interface) — reads files from a published navigation package. Two methods: `readFile(relativePath)` returns UTF-8 string content, `readBytes(relativePath)` returns raw bytes for checksumming. No `exists()` — the caller reads the manifest to verify a package.

- **`FilesystemReader`** (class, implements `PackageReader`) — Node.js `fs.promises` backed. Constructor takes `basePath`. Reads resolved paths. ENOENT → IO_ERROR.

No checksum verification, no JSON parsing, no artifact hydration.

## Non-goals

- ❌ No checksum logic (T21)
- ❌ No JSON parsing or type coercion (T22)
- ❌ No artifact hydration into `LoadedPackage` (T22)
- ❌ No orchestration or error recovery (T24)
- ❌ No remote backends yet (HttpReader/ZipReader — future ADR)
- ❌ No caching or memoization

## Success Criteria

1. `PackageReader` interface defines `readFile(path): Promise<string>` and `readBytes(path): Promise<Uint8Array>`
2. `FilesystemReader.readFile("manifest.json")` returns correct string content from disk
3. `FilesystemReader.readBytes("graph.json")` returns exact raw bytes
4. Missing file → returns `LoadFailure` with `IO_ERROR` code (never throws)
5. All old tests (ArtifactLoader) still green — nothing is removed
6. `PackageReader` is not exported from `@navi/runtime` — it's internal

## Pitfalls

- ERRORS.md 2026-07-08: checksums come later, not now
- ERRORS.md 2026-07-08: keep it simple, no framework patterns — FilesystemReader is a direct implementation
- ADR-012 §5.1: `readFile` returns string, `readBytes` returns Uint8Array, no `exists()`
- ADR-012 §7: Error codes must match types.ts exactly
