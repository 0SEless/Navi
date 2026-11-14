# Floor route workflow implementation plan

Spec: docs/superpowers/specs/2026-11-13-floor-route-workflow.md
Method: inline, regression-first, one scoped final review; no commits.

- [x] T1 Basemap and exact route picking. OutdoorRoutePicker source maxzoom19 and visible recoverable tile error handler; route graph usable with no basemap, attribution retained. Segment pick projects onto real endpoints. RED/GREEN picker/model tests.
- [x] T2 Independent entrance links and free routes. Add atomic entrance.outdoor.connect using a physical entrance floor-side terminal node; no path line or second entrance required. Explicit entrance route port reused by routes starting/ending on entrance; no finish picker requirement. Free route starts and junctions supported; stop after completed attachment. Remove competing legacy primary UI, retain readable compatibility. Tests commands/undo/serialization/compiler and UI lifecycle.
- [x] T3 Editable individual floor ports. Doors existing routeConnection; entrances physical port; per-level stair/elevator routeConnection. Attach/reconnect/disconnect atomically with segment split/reuse, conservative obstruction checks, exact undo. Compiler resolves explicit ports and suppresses nearest fallback for those stops. Existing vertical and outdoor connections preserved.
- [x] T4 Floor-wide Suggest Connections. Pure deterministic candidate model, no state changes until Confirm. Preview all eligible types with corrections by draggable endpoint on route segments, exclusion and uncertain/blocked diagnostics. Existing links preserved, editing supported. One atomic confirm/undo, Cancel inert, stale preview rejected. Wire floor navigation UI and map overlay. Regression and isolated browser proof.
- [x] T5 Final verification/review, graph update one worker no clustering, logs, guarded rollback checkpoint, final handoff. No saved-map data changes.

Review focus: empty floor / one unconnected entrance, independent outdoor change preserves indoor route, repeated confirm idempotence, graph splits shared by multiple attachments, blocked wall crossings, missing imported reference undo, stale preview/permission loss, pointer cancellation and 2D/2.5D presentation.

Verification:343 tests/23 affected suites pass; isolated actual-component browser proof passes with no writes/errors. Review findings fixed and re-reviewed. Final graph/checkpoint checks passed;52 guarded files, reverse patch clean, rollback check-only passed, HEAD unchanged/index empty. No saved-map writes or commits.
