# Scoped Save Contract

## Consistency boundary

The current consistency boundary remains the **campus aggregate**. Every Manual Save carries an expected campus revision and commits with a campus-level compare-and-swap. Building, routing, terrain, and campus-settings scopes identify changed content and dependencies; they do not get independent revision heads or independently writable transactions yet. This keeps shared building entrances, indoor transitions, routing nodes, roads, and terrain dependencies consistent.

## Candidate shape

The local model is in `src/services/scoped-campus-save.ts`. `createScopedSaveCandidate` JSON-clones and deeply freezes a candidate, calculates canonical SHA-256 `contentChecksum`, and calculates a separate `requestChecksum` over the identity, scope, expected revision, mutation ID, content checksum, and sorted dependencies.

```json
{
  "contractVersion": 1,
  "campusId": "<stable-campus-id>",
  "scope": { "kind": "building", "id": "<stable-building-id>" },
  "expectedCampusRevision": 42,
  "mutationId": "<client-generated-uuid>",
  "requestChecksum": "<sha256>",
  "contentChecksum": "<sha256>",
  "content": "<immutable scoped snapshot or versioned operation envelope>",
  "dependencies": [
    { "scope": { "kind": "routing", "id": "campus-routing" }, "revision": 19, "contentChecksum": "<sha256>", "required": true }
  ]
}
```

Stable campus/scope IDs are opaque IDs from the existing campus and authored-document identity model. Do not derive durable IDs from names or floor display labels. The candidate captures a frozen snapshot; later editor edits must not alter the submitted payload. Acknowledgments identify exactly `campusId`, new campus revision, `mutationId`, request checksum, content checksum, and server timestamp.

## Request and transaction rules

1. Require a verified Supabase session and administrator authorization server-side; ignore any client-supplied role. Use `auth.getUser()` and trusted `app_metadata`/server allowlist, never user-editable metadata. The current source gate follows this pattern for `/api/publish`.
2. Validate candidate identity and recompute both checksums server-side. Reject malformed scope, revision, dependency, or payload before writes.
3. In one transaction, first look up `(campus_id, mutation_id)`. Same mutation ID + same request checksum returns the originally stored exact acknowledgment. Same ID + changed request checksum returns `409 MUTATION_ID_REUSED`.
4. Compare the current campus revision to `expectedCampusRevision`; stale returns `409 STALE_REVISION` and no change. Compare every dependency revision/checksum in the same transaction; missing required dependency returns `409 DEPENDENCY_MISSING`; changed dependency returns `409 DEPENDENCY_CONFLICT`.
5. If the target content checksum already equals current content and no dependency changed, return `unchanged` without a revision row or campus revision increment.
6. For a changed candidate, insert one parent commit and associated scoped revision/operations, update the campus head, and persist the idempotency record atomically. Use an UPDATE/unique constraint or transaction lock to serialize CAS; a preflight read alone is not sufficient.
7. Store the exact acknowledgment in the transaction. A retry after response loss returns it. Validate an acknowledgment against the submitted checksum and mutation; do not infer success from a timeout.

Suggested API: `POST /api/studio/campuses/{campusId}/commits`, authenticated with a Supabase session cookie. Responses: `201 committed`, `200 unchanged/replayed`, `409 stale/dependency/mutation conflict`, `401 unauthenticated`, `403 non-admin`, `422 invalid candidate`. No database route or cloud API was added in C2.

## Additive storage outline for a future migration

- `campus_commit_heads(campus_id PK, revision, content_checksum, updated_at)`.
- `campus_commits(id, campus_id, revision, mutation_id, request_checksum, content_checksum, actor_id, created_at, UNIQUE(campus_id, revision), UNIQUE(campus_id, mutation_id))`.
- `campus_scope_revisions(id, campus_id, commit_id FK, scope_kind, scope_id, scope_revision, before_checksum, after_checksum, format_version, checkpoint_or_operations, UNIQUE(campus_id, scope_kind, scope_id, scope_revision))`.
- `campus_commit_dependencies(commit_id FK, dependency_scope_kind, dependency_scope_id, expected_scope_revision, expected_checksum)`.

Keep these tables in a non-exposed schema such as `navi_private`, or deliberately expose only a narrow internal API with explicit server-only privileges. Supabase’s changelog says new tables are no longer automatically exposed to Data/GraphQL APIs on 2026-10-30. If the implementation uses PostgREST, explicitly inspect exposed schemas and grants, and grant no direct table write to anon/authenticated; route all commits through a server-only transaction path. Revoke `EXECUTE` from anon/authenticated on internal routines; avoid a public `SECURITY DEFINER` surface. The service-role key must stay server-only. Do not implement this schema until the `published_maps` security correction and Dev environment identity are approved.

## Scope content and dependency rules

- **Building:** building identity, floors, wall/door geometry, room identity, entrances, stairs/elevators, and cross-floor relationship IDs. Stable entity IDs and before/after checksums are required; building ID must belong to candidate campus.
- **Routing:** campus-scoped route nodes/edges, building entrances, stair/elevator transitions, and references to building/floor IDs. Changes depending on a building must include that building’s version/checksum.
- **Terrain:** immutable asset-version reference and its metadata; never mutable shared blob key. Road/foundation dependencies are explicit.
- **Campus settings:** campus-level labels, units, timezone, map CRS defaults, and routing policy. Setting changes invalidate dependent content only when the declared dependency says so.

The runtime must keep reading existing `published_maps` artifacts. New authored commits do not implicitly republish; publishing remains a separate validated action against one exact campus revision.
