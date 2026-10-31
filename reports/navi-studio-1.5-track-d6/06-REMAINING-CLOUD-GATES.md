# Track D6 — Remaining Gates Before Real Development Recovery

D6 local work does not establish recoverability of the real Development database. No real Supabase export or connection was made.

## Required before a real Development backup

1. Owner chooses and explicitly authorizes the local PostgreSQL path: native Windows installation or starting the existing Ubuntu WSL distribution. No install or WSL start has occurred.
2. Resolve Docker's error 1920 through an authorized Windows/Docker administrator if Docker is still needed. Do not change the Secrets Engine socket or perform a reset based on this report.
3. Establish source Development PostgreSQL/PostGIS versions, extensions, encoding/collation, backup format, roles/ownership requirements and expected data size using authorized read-only checks.
4. Select a target with matching supported extensions and enough verified storage; isolate its data directory, localhost listener, temporary credentials and network access.
5. Obtain explicit authorization for any real Development export, credential handling, local storage, encryption/key custody and restore target. Use approved secure transfer and retention procedures.
6. Run a real Development backup/restore rehearsal only after approvals; verify schemas, row counts, spatial metadata, representative geometry transforms, constraints, privileges/RLS, checksums and application-level behavior. Record failures and prove restore from the encrypted artifact.
7. Implement persistent scoped revision storage only after transaction design, schema review, migration approval, concurrency/authorization review, rollback plan and Development test approval. Keep `/api/graph` unchanged until that separate gate passes.

## Explicitly outside D6

No Supabase exports/writes, migrations, Vercel changes, GitHub pushes, deployment, Production operation, Docker cleanup, WSL reset, or system package install was performed. D6 in-memory tests and the historical D4.1 synthetic container report are evidence for synthetic behavior only, not real Development backup readiness.
