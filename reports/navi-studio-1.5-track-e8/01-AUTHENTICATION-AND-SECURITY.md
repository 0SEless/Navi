# E8 Authentication and Security

- `verifyMutationPrincipal` returns the cryptographically verified Supabase Auth user after `auth.getUser()`; legacy mutation routes keep the existing compatibility wrapper.
- The new route verifies the loopback request and default-off server gate before authentication/storage work. It checks Origin when present and rejects a non-loopback or mismatched origin.
- Scoped authorization allows verified `super_admin` or `NAVI_ADMIN_EMAILS` server allowlist. Mock principals, campus admins, mapping staff, viewers, malformed campus IDs, and protected campus IDs are denied. The legacy protected-campus override is ignored for this path.
- POST accepts only `campusId`, `expectedCampusRevision`, and scoped operations. Client actor, role, administrator, and document identity claims are rejected as unknown fields. Canonical document identity is derived as `campus:<campusId>`.
- Request bodies are capped at 1 MiB, with 1–32 operations and bounded dependencies. Candidate request/content checksums are recomputed server-side. The E5 pool is lazy and checks exact host, port, database, role, PostgreSQL major, and database marker before use.
- The only durable target is `127.0.0.1:55433 / navi_e4_test / navi_e4_runner`, marked `navi-e4-synthetic-v1`; no Supabase database client is used by the new persistence route.
- The PostgreSQL schema enables RLS on all seven application tables and adds no anon/authenticated policy or Supabase role grant. The E5 runner role is not superuser, cannot create roles/databases, and does not bypass RLS.
- Browser acknowledgment validation uses Web Crypto; no `node:crypto` server module is bundled into the client path. Failure, conflict, malformed acknowledgment, or ambiguous outcome retains exact pending request bytes and does not claim cloud acknowledgment.

Campus-level authorization intentionally remains unavailable until a trusted campus ACL is implemented and reviewed.
