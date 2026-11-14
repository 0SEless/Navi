# Door resize correction

User authorized fixing door width/depth sizing while retaining wall attachment. No commits, staging, saved campus edits, extra servers or changes to earlier checkpoints.

## Evidence and intended behavior

New attached doors use wall thickness (commonly 0.15 m). resizeRectangleFootprint rejects any original rectangle edge below 0.20 m, so its corner handles cannot work. It also anchors the opposite corner, shifting the center off the wall during depth resizing. The placement projection currently fixes depth to wall thickness. A handle gesture can also reach the separate Door placement listener.

Keep four corner handles. Dragging an attached door's corner resizes width and depth symmetrically around its existing center, preserving wall alignment, owner and route connection. Depth may be below 0.20 m; width remains at least 0.20 m. The initial placement drag uses the perpendicular drag span as depth (at least wall thickness), with its center projected onto the wall. A handle gesture must not create another door. Doors constrained by a wall retain its orientation; free doors and other rectangles retain their prior editing behavior.

## Tasks

1. Checkpoint current source bytes; reproduce thin-door resize, symmetric center and initial-depth failures with tests.
2. Extend rectangle resize with explicit per-call door options. Wire actual attached-door handles to fixed-center resizing; prevent placement from stealing handle gestures. Keep rejected edits nonmutating and show feedback.
3. Use perpendicular drag span for initial door depth; validate explicit depth updates. Cover horizontal/vertical/diagonal walls, command ownership/routes/undo, readonly and Escape, and handle event integration.
4. Run focused single-worker tests with a 512 MB heap, targeted lint/baseline comparison, HTTP check and a separate guarded rollback checkpoint. Document evidence and limitations.

Preventing: producer/consumer mismatch (test actual Canvas/hook events), route/ownership changes, duplicate authoring commands, invalid geometry, undo damage, UTF-8 parsing errors, and restoration of unrelated dirty files. Earlier validation and architecture checkpoints remain untouched. No full build on the memory-constrained running server.
