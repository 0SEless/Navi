# Remaining Blockers and Limits

1. **Full TypeScript is not clean.** The current repository emits 1,128 diagnostics. The single-count improvement from baseline does not make the check pass. Existing diagnostic debt needs a separately scoped repair.
2. **Inherited lint findings remain.** The scoped report includes 28 errors and 11 warnings in older Floor Editor / EditorBridge sections; they were not addressed as part of C1.
3. **Dev-server teardown warning remains.** Some local navigation/unmount paths log `AggregateError: 3 service(s) failed to destroy`. It did not fail the browser suite but should be investigated separately.
4. **No live backend acceptance.** Browser coverage used local synthetic fixtures and inert credentials. Supabase, R2, Vercel, Production/Preview, real campus persistence, and actual auth were not exercised.
5. **The runtime identity suite is skipped.** Its file now parses, but the 61 assertions are not executed due to its existing `describe.skip`.
6. **No deployment or external write occurred.** The result is only a local candidate verification, not release approval or production readiness.

**Decision:** PARTIAL. Stop before external environment configuration, cloud access, campus editing, or deployment.
