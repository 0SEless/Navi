# T21 Plan — ChecksumVerifier

## Architecture

```
ChecksumVerifier (interface)
    │
    ├── hash(bytes: Uint8Array): string
    │
    └── verify(bytes: Uint8Array, expected: string): boolean
           │
           ▼
    Sha256Verifier (class)
        │
        └── crypto.createHash('sha256').update(bytes).digest('hex')
```

Mirrors publisher's `ChecksumService` but read-oriented — adds `verify()` convenience, omits `hashFile()` (filesystem is loader's `FilesystemReader` concern).

## Tasks

### T1 — ChecksumVerifier interface + Sha256Verifier
**Files**: `packages/runtime/src/loader/checksum-verifier.ts`
- Interface: `ChecksumVerifier` with `hash()` and `verify()`
- Class: `Sha256Verifier implements ChecksumVerifier`
- `hash(bytes)`: `createHash('sha256').update(bytes).digest('hex')`
- `verify(bytes, expected)`: `hash(bytes) === expected`

**Acceptance**: Interface compiles, implementation is a thin wrapper around Node's crypto.

### T2 — Tests
**Files**: `packages/runtime/src/loader/__tests__/checksum-verifier.test.ts`
- Known SHA-256 value for "hello"
- Deterministic (same bytes → same hash)
- Different input → different hash
- Empty bytes hash
- verify matches → true
- verify mismatch → false
- verify empty expected → false
- Large buffer (1MB) hashes without error

**Acceptance**: 8 tests, all green, no filesystem dependency.

## Error Prevention

- ERRORS.md 2026-07-08: "checksums from exact bytes" — `hash()` receives raw Uint8Array, no JSON.stringify involved
- ADR-012 §5.2: SHA-256, hex lowercase — matches publisher exactly
- ADR-012 Invariant 3: Checksum verification is its own step, separate from hydration
