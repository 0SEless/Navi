# NAVI Studio 1.5 — Track E8.1 Summary

**Status: PARTIAL — full browser-to-E5 save/reload acceptance is not proven.**

## Verified

- E8 TypeScript diagnostics reduced from the recorded 1,126 to 1,124. The repository-wide check still fails on legacy diagnostics; none of the final diagnostics point to the E8 route, scoped-save session/snapshot, browser harness, or editor bridge.
- The E5-only PostgreSQL proof passed in separate writer and reader processes. It verified a failed multi-scope transaction left no rows, one atomic three-scope revision, exact replay, collision/stale rejection, unchanged-content no-op, concurrent compare-and-swap, reconstruction, and checksums.
- Focused E8 and local-draft Vitest coverage passed: 6 files / 51 tests. A narrower E8 auth/route/session set passed 7 files / 59 tests.
- The flags-off browser smoke passed: scoped GET/POST stay disabled before authentication or storage access. This is not a full flags-off editor-save-path acceptance.
- A browser request reached the authenticated synthetic E5 route and committed one revision in an earlier run, but the captured change included both the target building and a campus-settings scope. Subsequent test-fixture normalization removed that extra baseline difference, but the clean single-building run timed out without a captured POST. No reload/reconstruction claim is made from the earlier run.
- Focused ESLint passed on the E8 route, persistence/snapshot/session code, tests, and browser harness. Including `StudioWorkspace.tsx` reports the existing `react-hooks/set-state-in-effect` warning at line 202, outside the E8 save change.

## Why this is not PASS

The required browser assertion remains unverified: a single meaningful building edit must produce one building scope, an exact acknowledgment, and recover that committed state after page reload while preserving unrelated buildings. Route/terrain editor acceptance, failure/stale-draft recovery, and flags-off legacy editor save were also not completed.

No real Supabase endpoint, campus data, Production system, deployment, GitHub push, Docker cleanup, or D2 resource was used or changed. E5 synthetic rows and all logs are retained. The outcome does not establish Development database recoverability.

Read-only Docker verification after the test runs showed E5 `navi-e5-postgres17` still running (`0fbf5ea4079e…`), image `postgres@sha256:b0f9560a…`, bound only to `127.0.0.1:55433`, on `navi-e5-postgres17-net` with `navi-e5-postgres17-data`. Protected D2 `navi-d2-synthetic-postgis17` remained exited with code 255, its original volume and isolated network still attached. No container, network, or volume was started, stopped, created, or deleted during E8.1.

## Next milestone

Track E8.2 should diagnose why the normalized browser harness does not capture a scoped POST after the manual editor action, then complete a clean synthetic building save/reload before expanding to route/terrain, stale/network failures, IndexedDB draft recovery, and flags-off legacy save.

No additional owner approval is needed for continued E5 synthetic-only testing. Any move beyond the isolated E5 database still requires its own explicit approval.
