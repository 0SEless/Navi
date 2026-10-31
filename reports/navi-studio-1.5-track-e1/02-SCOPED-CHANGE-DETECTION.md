# Track E1 — Scoped Change Detection

Implementation: `src/services/scoped-change-detection.ts` (client-safe pure projection) and `src/services/scoped-history-dev-client.ts`.

## Scope mapping

- `building:<buildingId>` contains building/floor geometry and attributes, rooms, walls, doors and other building-owned fields. Route-specific floor and vertical-transition fields are split into the building's `routing:<buildingId>` projection.
- `routing:<buildingId>` contains that building's floor route networks, entrance access and vertical transitions.
- `routing:<campusId>` contains campus roads, junctions and separated crossings.
- `terrain:<campusId>` contains campus boundary and areas.
- `campus-settings:<campusId>` contains schema version, stable metadata and connectivity semantics.

Campus identity must match the active campus in both snapshots. Building and floor identities must be present and unambiguous. The classifier does not infer IDs, coordinates or route topology. Content with no explicit mapping, including panorama-only changes, is rejected from scoped history while the editor document and normal draft/save flows remain available.

## Determinism and atomicity

Object keys are canonically ordered before comparing content. Unchanged projections create no operation. A removed scope becomes an explicit tombstone. Changed scopes carry their dependency scopes. Multiple changed scopes are sent as one explicit batch. The client uses a per-page session ID plus a monotonic mutation sequence, captures the current local reference revision as `expectedRevision`, and preserves the exact request body for an idempotent retry. The D6 candidate validator computes canonical before/after checksums and the in-memory history commits all operations in a batch at one revision or none.

The existing store's campus revision/checksum and dependency checks reject stale or conflicting batches. Reusing a mutation ID with different request content is rejected; an identical retry replays its local receipt without another history entry. These are local reference-history semantics, not cloud revision acknowledgments.

## Coverage

Tests cover building/floor content, route fields, combined building-plus-campus routing edits, terrain, metadata-only no-op behavior, unsupported content, campus mismatch, duplicate identities, explicit batch commit/reconstruction, retry idempotency, stale revision rejection and dependency conflict atomicity.
