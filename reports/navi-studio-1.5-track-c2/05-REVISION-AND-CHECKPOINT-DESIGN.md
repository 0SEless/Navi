# Revision and Checkpoint Design

## Proposed append-only model

Manual Save creates at most one logical campus commit. A no-op creates none. Each changed commit stores a parent campus revision, mutation ID, before/after campus and scope checksums, actor, server timestamp, contract/operation format version, and explicit dependencies. A scope revision contains a deterministic ordered operation list such as `replace-scope`, `upsert-entity`, `delete-entity`, `move-entity`, `set-geometry`, and `set-reference`; every operation records target ID and before/after checksum.

Use immutable full checkpoints as reconstruction anchors. Periodically checkpoint the full campus aggregate and the latest scope state; reconstruction chooses the newest verified checkpoint at or before a requested revision, verifies its checksum, and applies subsequent operations in stable sequence order, checking each `beforeChecksum` and final `afterChecksum`. A corrupt or missing operation blocks restore instead of silently skipping it.

Legacy `graph_snapshots`/`campus_graph_revisions` remain readable. Convert each legacy full snapshot into an immutable `legacy-full-snapshot-v1` checkpoint at its original campus revision; do not rewrite or delete old rows. Existing `published_maps` artifacts keep their compiler format and source revision. Restore creates a new forward commit from a verified checkpoint; it does not erase the revision history or change a published artifact.

## Retention and verification

Keep historical revisions indefinitely until the owner approves a retention policy and a restore/backup process proves an independent recovery copy. Do not automatically prune revisions. A future policy must specify legal/product retention, checkpoint cadence, maximum storage, and a tested cleanup transaction; old published revisions referenced by artifacts must remain available. For every checkpoint, verify SHA-256, revision boundary, document identity, graph/building/routing references, and deterministic reconstruction against the stored campus checksum.

## Synthetic local benchmark

Reproducible script: `scripts/benchmark-scoped-revisions.mjs`. It generated 12 synthetic buildings × 5 floors × 20 rooms, with 600 route nodes and 720 route edges. It modified one wall coordinate in one building. The benchmark runs locally in Node/V8, no database, network, or campus records.

| Measurement | Result |
|---|---:|
| Existing-style full-campus synthetic JSON revision | 492,093 bytes |
| Compact single-building `replace-scope` operation with before/after checksums | 33,195 bytes (6.75% of full; 93.25% smaller) |
| Full checkpoint wrapper | 492,238 bytes |
| Checkpoint metadata overhead | 145 bytes |
| Single-building request envelope | 33,313 bytes |
| Request with 3 building dependencies | 33,726 bytes |
| Cost of two additional dependencies | 413 bytes |
| Reconstruction of cloned full checkpoint + 100 checksum-validated scoped operations | 38.882 ms median (12 measured runs after 3 warmups) |

These are exact measurements for the stated synthetic fixture only. The 100-operation reconstruction repeatedly replaces one synthetic building, checks each before/after checksum, and includes a full-campus checkpoint clone; it is not a production performance forecast. Future acceptance should benchmark real-shaped synthetic campus sizes, multiple changed buildings, dependency fan-out, and checkpoint intervals before setting thresholds.

## Cost/risk tradeoffs

Scoped history reduces repeated serialization when a small building changes, but reconstruction cost grows with operations and cross-scope dependencies. Full campus CAS retains contention between independent buildings; this is deliberate until dependency validation is proven. A checkpoint cadence is not fixed by C2; choose it from measured workloads. No automatic historical deletion is designed or implemented.
