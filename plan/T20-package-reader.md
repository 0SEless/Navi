# T20 Plan — PackageReader + FilesystemReader

## Architecture

```
PackageReader (interface)
    │
    ├── readFile(path) → Promise<string>     // UTF-8
    │
    └── readBytes(path) → Promise<Uint8Array> // raw bytes
           │
           ▼
    FilesystemReader implements PackageReader
        │
        ├── fs.promises.readFile(path, 'utf-8')   → readFile()
        │
        └── fs.promises.readFile(path)            → readBytes()
```

Per ADR-012 §5.1: `PackageReader` is the injectable interface. `FilesystemReader` is the default Node.js implementation. No `exists()` method — caller reads manifest to verify package.

`PackageReader` is an internal implementation detail — NOT exported from `@navi/runtime`.

## Tasks

### T1 — PackageReader interface
**Files**: `packages/runtime/src/loader/package-reader.ts`
- `PackageReader` interface: `readFile(relativePath: string): Promise<string>` + `readBytes(relativePath: string): Promise<Uint8Array>`
- Methods throw on error (caller catches and maps to `LoadFailure`)

**Acceptance**: Interface compiles and is the single source of truth. No default implementation yet.

### T2 — FilesystemReader implementation
**Files**: `packages/runtime/src/loader/package-reader.ts`
- `FilesystemReader implements PackageReader`
- Constructor: `new FilesystemReader(basePath: string)`
- `readFile(path)`: `fs.promises.readFile(resolvedPath, 'utf-8')`
- `readBytes(path)`: `fs.promises.readFile(resolvedPath)`
- `resolvedPath = path.join(basePath, relativePath)`
- Missing file → throws Error (caller catches)
- No checksums, no parsing, no caching

**Acceptance**: Reads real fixture files. Raw bytes match expected content.

### T3 — Tests for FilesystemReader
**Files**: `packages/runtime/src/loader/__tests__/package-reader.test.ts`
- `readFile` on existing file returns correct string content
- `readBytes` on existing file returns Uint8Array with correct length
- `readFile` on missing file throws ENOENT error
- `readBytes` on missing file throws ENOENT error
- `path.join` resolves correctly relative to basePath

**Acceptance**: 5 tests passing, no filesystem mocked (use real fixtures).

### T4 — Verify no regressions
**Files**: — (verification only)
- `tsc --noEmit`: 0 errors in `packages/runtime/`
- `vitest run`: all old tests green + new tests green

**Acceptance**: Workspace clean.

## Error Prevention

Before writing code, relevant ERRORS.md entries:
- 2026-07-08: "always compute checksums from exact bytes" → NOT THIS TASK (T21)
- 2026-07-08: "Don't use framework patterns without concrete implementations" → PackageReader is a 2-method interface with 1 real implementation, not a framework
- ADR-012 §5.1: `readFile` returns string, `readBytes` returns Uint8Array, no `exists()`
- ADR-012 §7: Error mapping is caller's concern at this layer — FilesystemReader throws, orchestrator maps codes
