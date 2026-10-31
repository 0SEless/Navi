# Scoped Save Contract Test Results

## Focused run

```text
npx vitest run src/services/scoped-campus-save.test.ts --reporter=verbose --pool=threads --maxWorkers=1
Test Files  1 passed (1)
Tests       12 passed (12)
Duration    1.08s
```

The first default-pool invocation hit a Windows temporary-directory `EPERM` during a worker cache rename. Rerunning with a worktree-local temp directory and one thread exposed the expected missing-module RED result. After adding the implementation, the focused command above passed. All test operations use an in-memory mock store; no request leaves the process and no Supabase client is imported.

## Required scenarios

| Scenario | Result |
|---|---|
| Successful scoped commit / exact acknowledgment | PASS |
| Unchanged content suppresses write | PASS |
| Stale campus revision | PASS |
| Duplicate mutation ID returns original acknowledgment | PASS |
| Same ID with changed request checksum | PASS |
| Commit response interrupted; retry replays stored acknowledgment | PASS |
| Delayed acknowledgment remains bound to submitted content | PASS |
| Post-submit editor edits do not mutate candidate | PASS |
| Cross-scope dependency revision/checksum conflict | PASS |
| Non-administrator rejected before state read/write | PASS |
| Missing required terrain dependency | PASS |
| Legacy full snapshot converts to deterministic checkpoint and reconstructs | PASS |

Tests cover the isolated contract model in `src/services/scoped-campus-save.ts`. They do not verify PostgreSQL transaction isolation, actual Supabase RLS/grants, cookie parsing in a deployed route, storage upload, or Vercel environment configuration. A real database adapter/route remains future approved work. The model’s `commitAtomically` contract explicitly requires the backend to validate CAS/dependencies and persist commit plus idempotency acknowledgment in one transaction.
