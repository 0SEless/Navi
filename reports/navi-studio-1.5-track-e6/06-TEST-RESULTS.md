# Focused Test Results

## Scoped persistence and legacy save path

Command: `npx vitest run` over scoped campus save/history/batch/client/route/change-detection, scoped PostgreSQL adapter, feature flag, graph revisions, local draft recovery gate, SaveStatus model/component, studio persistence, legacy `/api/graph` route and lifecycle timeout.

**PASS — 15 files, 147 tests.** Full output: `logs/focused-vitest.log`.

Coverage includes flag-off defaults, loopback rejection, session identity, stale campus revision conflicts, exact mutation replay/idempotency, batch atomicity, authorization-denied behavior, revision/checkpoint reconstruction, malformed/tampered history detection, draft recovery gating, non-false save status on failure, and legacy route behavior.

## Publishing and navigation compatibility

Command: `npx vitest run` over eight focused publish/navigation files.

**PASS — 8 files, 52 tests.** Full output: `logs/publish-navigation-vitest.log`.

## Lint and workspace

Focused ESLint across scoped persistence, bridge, save status, and dev route: **PASS, exit 0**. Output is in `logs/focused-eslint.log` (empty on success).

`git diff --check`: **PASS**, with existing CRLF normalization warnings for pre-existing dirty files. Branch, HEAD, and existing dirty source set were preserved.

## Verification limits

Tests use local mocks for Supabase-facing APIs. Cross-campus security is exercised through the adapter's injected trusted authorization resolver and identity checks; no production Supabase session was tested. The local dev route is in-memory, not durable. Real Development restore and full-project regressions remain unverified.

