# Scoped Persistence — Next Phase Proposal

**State:** Planning only. No cloud schema, writer, migration, or campus data was changed.

## Proposed write contract

Keep the existing `/api/graph` whole-campus endpoint as the compatibility path until a separately reviewed additive API is ready. A future scoped request should include:

```ts
type ScopedSaveCandidate = {
  campusId: string
  documentId: string
  scope: 'building' | 'terrain' | 'routes' | 'campus-settings'
  scopeId: string | null
  baseServerRevision: string | null
  mutationId: string
  schemaVersion: number
  contentChecksum: string
  candidate: unknown // immutable canonical snapshot for the declared scope
  dependencies: Array<{ scope: string; scopeId: string | null; checksum: string }>
}
```

The server must authenticate the administrator, validate campus authorization, compare the expected revision, enforce idempotency, validate the immutable candidate/checksum, check cross-scope dependencies, and only then commit. ACK must return the exact committed revision/checksum. A client must keep post-capture edits dirty if their generation differs from the ACKed candidate.

## Scope boundaries

- **Building:** authored building/floor geometry and semantic room identity; never infer missing coverage from a footprint or another floor.
- **Terrain:** a separately versioned terrain document/artifact.
- **Routes:** route graph and explicit access/vertical connections; topology validation stays authoritative.
- **Campus settings:** campus identity/configuration only.

An operation that crosses scopes must declare dependencies and either validate/commit atomically or fail without partial changes. No inferred wall crossings, room links, routes, or stair transitions.

## Revisions and checkpoints

First measure real document sizes and revision frequency in the isolated Development project. Then propose compact scoped revisions plus periodic full checkpoints, with a retention policy and restore test. Do not delete current history automatically. A maximum-count cleanup policy requires separate review/approval and a backup/restore exercise before any production activation.

## Migration dependencies

No migration is prepared for execution in this Track B candidate. A future additive migration must specify new revision/scope metadata, indexes, RLS/grants, compatibility reads for legacy snapshots, backfill strategy, rollback path, and verified staging data. Public published-map reads and trusted publishing authorization must remain compatible.

## Required next-phase gates

1. Provision and independently verify isolated Development Supabase and Vercel projects; separate Auth, storage, redirect origins and R2 bucket (or leave uploads disabled).
2. Back up and restore the Development project into a separate target; inventory Auth users, Storage metadata and object bytes as well as Postgres.
3. Confirm the local draft can be manually reviewed and deliberately submitted without automatic cloud writes.
4. Design/approve additive API, schema, grants/RLS and migration rollback.
5. Test CAS conflicts, idempotent replay, interruption, cross-scope rejection, revision recovery and legacy client compatibility using synthetic data.
6. Only after separate explicit approval, deploy to the isolated Development project and run browser save/reload acceptance.

## Open questions

- Which canonical document representation is authoritative for each scope during migration?
- How should deleting an entity referenced by a route or published artifact be represented atomically?
- What checkpoint cadence and retention bound are justified by measured revision payloads and restore objectives?
- Which server-controlled authorization mechanism is approved for publishing writes?
