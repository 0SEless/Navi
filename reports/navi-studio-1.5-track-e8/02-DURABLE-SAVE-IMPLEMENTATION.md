# E8 Durable Save Implementation

## API and storage

- `GET /api/studio/scoped-save?campusId=...` requires the same loopback, feature, authenticated-principal, and scoped-authorization checks, then returns only the verified synthetic campus revision and scope revision/checksum metadata.
- `POST /api/studio/scoped-save` recomputes single or batch candidates, commits through `PostgresScopedCommitStore`, and returns exact receipts tagged `storage: local-e5-synthetic`.
- The runtime refuses non-development mode, a disabled server flag, any host/port/database/role mismatch, absent password, browser-side pool creation, or incorrect database marker/version.
- The browser client creates SHA-256 candidate identities with Web Crypto and accepts only matching acknowledgments. Ambiguous network failures retain the exact request; changed content is refused until that request is resolved.
- The durable browser flag is nested under development, local-draft, and scoped-history gates and defaults off.

## Database evidence

The guarded runner verified Docker context `desktop-linux`, running E5 container `navi-e5-postgres17`, immutable image reference `postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`, named E5 data volume, and only `127.0.0.1:55433 -> 5432`. It applied the approved E4-owned migration because the schema was absent, then retained it and the synthetic proof rows. No Docker object was created, deleted, or restarted during E8.

The run used PostgreSQL 17.11 and one unique synthetic campus. Writer and reader were separate Vitest/Node processes. Evidence: atomic two-scope revision 1, two exact receipts, exact replay, stale revision rejection, three reconstructed scopes, one change set, two operations, two revision checkpoints, and the expected building content checksum.

## Scope limit

The route is only for the local synthetic E5 runtime. It is not connected to the real Development or Production database and does not provide campus ACLs, import/backfill, production deployment, or cutover behavior.
