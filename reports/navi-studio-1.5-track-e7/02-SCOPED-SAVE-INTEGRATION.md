# Scoped Save Integration

## Local implementation

The opt-in editor bridge attaches the development scoped-history client to Studio. It batches edits over a 400 ms quiet window, persists local drafts separately, and reports local scoped state without presenting it as cloud acknowledgment. The feature remains disabled unless the existing development environment and both scoped-history/local-draft flags are enabled.

The local development route now shares one in-memory campus store between editor sessions. A second session with an obsolete baseline receives `409 STALE_BASELINE`; campus revision compare-and-swap permits only one concurrent writer. The client maps that response to conflict, preserves local draft recovery behavior, and disposes its coalescing timer when detached.

The existing `/api/graph` authentication, campus mutation guards, and idempotent RPC path remain unchanged. The scoped route is loopback/development-only, in-memory, and uses a fixed local actor. It must not be treated as the durable production authorization boundary.

## Synthetic PostgreSQL path

The E7 harness uses the `PostgresScopedCommitStore` against the dedicated E5 synthetic database only. It seeds two synthetic buildings, a route, terrain, and settings; commits independent scopes; replays a mutation idempotently; rejects a stale competing commit; refreshes the route against updated building revisions; and reconstructs a complete document. The harness requires the exact loopback host, port, database, role, marker, PostgreSQL major, and a missing `navi_scoped` schema before applying the migration. It rolls back only the schema it created and asserts the schema is absent afterward.

## Boundary

The editor-attached bridge is not connected to the PostgreSQL adapter. PostgreSQL proves the scoped adapter's transaction behavior, while the browser-facing path remains a local in-memory reference. The next integration milestone is a server route with verified session identity and administrator authorization that can safely delegate to a durable store, followed by explicit acknowledgment validation. Keep the feature flag off by default until that boundary exists.
