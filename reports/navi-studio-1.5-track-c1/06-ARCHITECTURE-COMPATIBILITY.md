# Track B and schema proposal compatibility review

## Already implemented in Track B

Track B provides a Development-only, default-off IndexedDB draft path for the complete campus Graph plus authored CampusDocument; campus/document identity, schema and checksum validation; no-op write suppression; recovery gating; separate local/cloud states; exact manual cloud-save candidate capture; stale ACK protection; and existing guarded cloud CAS/idempotency behavior. The UI does not label local durability as server acknowledgement. The cloud path remains campus-wide.

## Adds in the October 29 proposal

The proposal adds logical commit scopes for building/shared campus/terrain/routing/settings, a compact versioned change-set history with complete checkpoints, an explicit immutable terrain asset manifest/version lifecycle, CRS/vertical datum/unit/provenance contracts, derived routing-profile versioning, and publication manifests pinned to a source revision and asset versions.

## Compatibility and potential conflicts

- Local draft versus explicit manual cloud save is aligned; Track B already separates them.
- Campus-wide CAS and complete-candidate validation preserve current cloud consistency. Logical scope can be metadata first; treating a building scope as an independently writable database transaction would conflict with the existing whole-campus writer and risks dangling cross-building routes/entrances.
- Track B drafts store a full document. They do not implement compact cloud change sets, checkpoints, or cloud revision reconstruction.
- Track B does not implement terrain uploads, object storage, terrain-derived routing profiles, vertical datum conversion, or immutable terrain publication.
- Existing graph_snapshots, campus_graph_revisions, campus_graph_mutations, projections and published_maps remain the compatibility surfaces. There is no verified migration/source mapping for replacing them.
- The public context hooks repaired in C1 are UI selector contracts, not a cloud persistence architecture change.

## Recommendation

Keep the proposal provisional. Defer schema, migrations, change-set protocol, object-store lifecycle and independent domain writes until the canonical source/deployment/database are mapped, backup restore is rehearsed, authorization policy is approved, full-candidate compatibility is proven, and replay/checkpoint benchmarks pass. No cloud persistence or database changes were made in C1.