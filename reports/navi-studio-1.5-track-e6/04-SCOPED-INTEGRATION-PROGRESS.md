# Scoped Persistence Integration Progress

## Existing local path reviewed

The dirty worktree contains a staged local integration path:

- `studio-scoped-history-flag.ts` requires `NODE_ENV=development` and both scoped-history and local-draft flags equal `true`; default is OFF.
- `EditorBridge.tsx` mounts `StudioScopedHistoryBridge`; it observes editor events and forwards explicit local operations through the development client.
- `/api/dev/scoped-history` accepts only POST from loopback, requires a matching campus/document identity, and returns `localOnly` results. Its sessions and receipts are in-memory and expire; this endpoint is a reference harness, not a durable authenticated service.
- `scoped-campus-save.ts` defines immutable checksummed candidates, campus revision CAS, mutation-id replay, exact acknowledgments, and atomic batch contracts.
- `scoped-postgres-adapter.ts` resolves actor and document identity on the server, checks authorization, uses bounded transactions, and supports batch commits, checkpoints, and verified reconstruction.
- Existing `/api/graph` and publish paths remain in place. No traffic routing or default flag was changed.
- `SaveStatus` distinguishes scoped local status from the legacy save state and does not present local-only state as a cloud acknowledgment.

## Readiness boundary

The local reference endpoint trusts a fixed local-development actor and is guarded by development + loopback; it is not suitable for deployment. A durable route still needs a real authenticated session resolver, trusted user-to-campus authorization, rate limits/CSRF/origin controls appropriate to the app, and the PostgreSQL adapter. The E5 adapter test proves the adapter against a synthetic DB, not a production Supabase identity integration.

The application integration has advanced to an editor-attached, opt-in local reference path with durable adapter contracts and real PostgreSQL test coverage. It is not ready for Development/Production traffic. No source changes were necessary or made in E6; this track adds focused verification and closes the recovery/key evidence gap.

