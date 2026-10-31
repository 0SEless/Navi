# Persistence and Recovery Assessment

E8 places boundary, legacy areas, authored polygons and datum in one `terrain:<campusId>` scope. Canonical comparison avoids unchanged revisions; checksums/replay/atomic commits support recovery. Explicit Save is the persistence boundary. Opt-in IndexedDB drafts store checksummed document/graph.

Initially retain one campus terrain scope with deterministic tile ordering. A changed scope is still a full terrain replacement; measure payload, latency, WAL/checkpoint growth and reconstruction. Checkpoints default to every 25 campus revisions. Tile revisions need a separately designed atomic manifest/read consistency contract.

Only completed stroke command mutates the document and schedules local draft autosave. Pointer preview remains private. Conflict/network failure retains the whole authored grid draft; do not silently adopt server state. Undo/redo after failure stays local/dirty.

Future synthetic E5 proof: exact scope/revision/receipt/checksum; unchanged scopes; close context and reconstruct fresh; verify metadata/mask/tiles/samples. Test replay, stale revision, failed batch, corrupt/missing tile, restart and checksum rejection. This audit made no database query.
