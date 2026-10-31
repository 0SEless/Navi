# NAVI Studio 1.5 — Track E1 Specification

## Goal
Connect the existing Studio document edit stream to the D6 scoped-save contract and in-memory reference history in an isolated Development workflow, while preserving current IndexedDB recovery and cloud save behavior.

## Acceptance criteria
1. A client-safe adapter identifies supported scoped content from the existing CampusDocument without changing the authoritative editor document or fabricating identities/coordinates.
2. Unchanged content produces no operation; ambiguous or unsupported changes are explicitly rejected from scoped history while the normal editor and draft path continue.
3. Multi-scope document changes are represented as one explicit local batch and validated without partial history commits.
4. Integration is gated by a new Development-only flag that defaults OFF and requires the existing local-draft mode as a second prerequisite. OFF creates no new scoped history and leaves current save behavior intact.
5. The reference history runs only in a loopback-only Development endpoint, uses only in-memory state, returns local-only results, and starts a fresh history session after page reload.
6. IndexedDB remains the recoverable draft boundary. A restored draft is never treated as restored in-memory history or as a cloud acknowledgment.
7. Existing manual cloud-save path, per-campus queue, `/api/graph`, editor tools, publishing and authorization remain unchanged.
8. Focused tests cover classification, batches, flags, retries/conflicts, reload/draft distinction, campus isolation and legacy save compatibility; reports distinguish baseline TypeScript from new errors.

## Non-goals
- Durable scoped history, schema migration, cloud scoped writes, new cloud adapter, or Production behavior.
- Replacing the current graph/document store or changing `/api/graph`.
- Inferring missing building IDs, routes, geometry, or campus coordinates.
- Panorama feature work or broad editor refactors.

## Approaches considered
- Import the D6 reference store directly into the client: rejected because its checksum implementation imports `node:crypto`, and because browser reload would misleadingly blur ephemeral history.
- Reimplement the full store in browser code with Web Crypto: rejected because it duplicates the D6 contract and risks checksum divergence.
- Recommended for E1: use a same-origin loopback-only Development API endpoint, gated by `NEXT_PUBLIC_NAVI_STUDIO_SCOPED_HISTORY=true` plus existing `NEXT_PUBLIC_NAVI_STUDIO_LOCAL_DRAFTS=true`, and keep the D6 reference store server-side. Use a new per-page session ID so a reload starts fresh in-memory history while existing IndexedDB draft recovery remains explicit. This reuses tested code and keeps new operations outside Supabase.

## Layers and behavior
- Editor document: `EditorContext.document` remains authoritative; changes are observed after `document.changed`.
- Local draft: existing IndexedDB draft path remains responsible for durable reload recovery and stale-server-base conflict checks.
- Scoped history: derive known building, routing, terrain, and campus-settings projections. The adapter returns either a single-scope operation, an explicit multi-scope batch, unchanged, or a fail-closed rejection. Batches use one local campus revision and cannot partially commit.
- Status: retain the existing save status model and add a clearly labeled local-only history state. Local validation never sets cloud sync status or claims a server save.
- Manual save/publish: existing persistence adapter, save queue and `/api/graph` behavior are not redirected through the scoped endpoint.
