# NAVI Studio 1.5 — Track E4 Specification

## Goal

Harden the disconnected E3 PostgreSQL scoped adapter around trusted authorization, identity, canonical atomic-batch replay, transaction failure handling, and a safely disabled local PostgreSQL 17 integration harness.

## Success criteria

1. Every adapter read and write resolves a trusted server principal, checks the requested permission, and verifies the campus/document identity; role claims from callers are not authoritative.
2. Every durable receipt is bound to one deterministic batch checksum, so exact retries replay while partial, cross-batch, changed-content, or mutation-ID-substitution replays are rejected.
3. Simulated transaction tests cover failure/ambiguity/timeout/concurrency/reconstruction boundaries; claims remain explicitly simulated until PostgreSQL is actually run.
4. A PostgreSQL 17 harness is runnable only when explicitly enabled and refuses non-loopback, wrong database/user/version, Supabase, or preexisting schema targets. It applies, exercises, dumps/restores, and rolls back only its owned synthetic schema.
5. No application route, active save path, IndexedDB, publishing behavior, cloud service, or Production behavior changes.

## Boundaries

- Do not execute SQL in this task, connect to Supabase, install PostgreSQL, start Docker/WSL, or use real campus data.
- Preserve all existing worktree changes; no reset, clean, stash, commit, or push.
- Keep `navi_scoped` private, RLS-enabled, and unavailable to anon/authenticated client roles; do not touch PostGIS extension-owned objects.
- Keep existing E1/E2 scoped-save interfaces source-compatible.
- Treat COMMIT transport failure as an unknown outcome; exact retry receipt lookup is the recovery mechanism.

## Known pitfalls

- E1/E3 receipts must be checked before stale revision rejection.
- E3 fake transactions must refresh committed visibility after waiting on advisory lock.
- Keep content/checksum fixtures canonical SHA-256 and assert committed state, not SQL strings alone.
- Keep Vitest temp files in `.tmp-vitest`; parallel Vite startup hit EPERM in the sandbox.
- Current full TypeScript baseline is 1,128 diagnostics; compare rather than claim green.
- Graphify index is stale for E3 nodes; use direct source after recording Graphify query output.
