# Door duplication wall fix plan

Spec: docs/superpowers/specs/2026-11-13-door-duplicate-wall.md

- [x] T1: RED command tests for attached duplication/style/pose, no inherited routes, wall fit failure, snapped relocation and undo. Fix duplicate-helpers.ts, new geometry/door-duplicate-placement.ts, feature-handlers.ts.
- [x] T2: RED command-builder/Canvas body-drag integration tests; route only body movement to snapToWall door.update, keeping resize unchanged. Display duplication errors in ComponentProperties. Files: floor-rectangle-authoring.ts, FloorEditorCanvas.tsx, ComponentProperties.tsx and their focused tests.
- [x] T3: Run focused tests and isolated actual geometry/browser scenario, task-only review, graph update/logs and guarded rollback. No commit.

Preventing prior bugs: preserve optional field absence, exact inverse snapshots, imported unresolved references, radians for doors versus degrees for stairs, no accidental room/navigation identity duplication, single-worker memory limits.
