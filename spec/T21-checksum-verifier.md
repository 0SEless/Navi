# T21 — ChecksumVerifier

## WHAT

Create `ChecksumVerifier` — the read-side checksum component (ADR-012 §5.2).

Two methods:

- `hash(bytes: Uint8Array): string` — compute SHA-256 hex digest of raw bytes
- `verify(bytes: Uint8Array, expected: string): boolean` — hash then compare

Algorithm identical to publisher's `ChecksumService`: SHA-256, hexadecimal lowercase.

**Does NOT know about:** manifests, artifacts, graphs, filesystems, or where bytes came from.

## Non-goals

- ❌ No filesystem I/O (no `hashFile` — that's the publisher's concern)
- ❌ No manifest awareness
- ❌ No artifact awareness
- ❌ No orchestration

## Success Criteria

1. `hash("hello")` returns known SHA-256 value
2. `verify(bytes, expectedChecksum)` returns `true` for matching checksum
3. `verify(bytes, wrongChecksum)` returns `false` for mismatched checksum
4. `verify(bytes, "")` returns `false` (empty expected = never skip)
5. `hash(empty bytes)` returns known SHA-256 of empty string
6. Deterministic: same bytes → same hash
7. All old tests still green

## Pitfalls

- ERRORS.md 2026-07-08: checksums from exact bytes, not deserialized objects — `hash()` receives raw `Uint8Array`, no JSON.stringify
- ADR-012 §5.2: algorithm SHA-256, encoding hex lowercase
- ADR-012 Invariant 6: "Checksums are computed from file bytes, not deserialized objects"
