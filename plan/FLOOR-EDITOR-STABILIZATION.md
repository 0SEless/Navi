# Floor Editor Stabilization Plan

This plan follows `spec/FLOOR-EDITOR-STABILIZATION-AUDIT.md`. Before each task, read `errors/ERRORS.md` and state the relevant prevention rule.

## T1 — Shared rectangle contract and Door/Stair/Elevator authoring

- Description: Extract/adapt the POI rectangle gesture into a shared local rectangle model with drag preview, transform handles, rotation, and command-backed commit; migrate Door, Stair, and Elevator creation and edit paths while preserving vertical connector metadata and legacy opening reads.
- Files to touch: `packages/core/src/types/entities.ts` (only if a backwards-compatible geometry field is required), `packages/editor/src/tools/*`, `packages/editor/src/commands/*`, `src/components/floor-editor/FloorEditorCanvas.tsx`, `src/components/floor-editor/ComponentProperties.tsx`, new focused tests.
- Acceptance: RED/GREEN tests cover placement, move, resize, rotate, cancel, undo/redo, persistence, and legacy-data read; browser verifies each tool on a disposable fixture.
- Errors to prevent: wall-body snapping regression; edits routed to legacy polygon authority; stale selection after delete/undo.

## T2 — Room ownership and explicit Door route semantics

- Description: Add deterministic parent assignment/reparent/unassigned handling and route-anchor/connection commands for authored Door rectangles. Keep RoomAttributes/wall-derived geometry authoritative for rooms.
- Files to touch: core/editor entity types and command handlers, `src/components/floor-editor/ComponentProperties.tsx`, selectors/validation, focused tests.
- Acceptance: a Door inside a room assigns that room, moving it reassigns or clears visibly, and route connection only occurs after explicit user action.
- Errors to prevent: arbitrary route auto-connect; semantic room geometry mutation; production sync conflict overwrite.

## T3 — Entrance visibility and route-source verification

- Description: Fix only the confirmed entrance source/layer priority and active-source/highlight defects. Preserve the existing OutdoorRoutePicker and route-start validation.
- Files to touch: `src/components/floor-editor/FloorEditorCanvas.tsx`, `renderRelationshipOverlay.ts`, validation/tests.
- Acceptance: selected/hovered entrances remain visible in 2D and 2.5D and the explicit indoor/outdoor relationship is rendered without changing authored route topology.
- Errors to prevent: outdoor route candidate leakage and silent route connection.

## T4 — Outliner hierarchy and selection sync

- Description: Make floor and category groups collapsible; add room-parent children and keep canvas/Outliner/Inspector selection synchronized.
- Files to touch: `src/components/floor-editor/FloorOutliner.tsx`, selectors/types, tests.
- Acceptance: hierarchy expands/collapses, child selection highlights the same entity on canvas, and deleting/undoing clears stale selection.
- Errors to prevent: stale Inspector after undo/delete; duplicate entities from mixed local/server caches.

## T5 — 2.5D population lifecycle

- Description: Trace the actual population root cause, then ensure 2D and 2.5D consume the same authored document and update on load, command, undo/redo, and floor changes without forced rerenders.
- Files to touch: confirmed renderer/lifecycle files only, `w13c` and lifecycle tests.
- Acceptance: browser toggles 2D→2.5D→2D and edits after toggling; derived rooms, openings, stairs/elevators, routes, labels, and selection remain present and document JSON is unchanged by view changes.
- Errors to prevent: split renderer authority and mode-only visibility masking stale sources.

## T6 — Window authoring cleanup

- Description: Hide/remove Window authoring affordances from the tool dock and creation registry while retaining Window data/schema and rendering.
- Files to touch: tool registry/dock, `src/components/floor-editor/adapters/tool-adapter.ts`, focused tests.
- Acceptance: Window cannot be newly authored from the UI, existing windows remain visible/readable, and persisted data is unchanged.
- Errors to prevent: schema deletion or public-rendering regression.

## T7 — Stale local/server conflict behavior

- Description: Implement timestamp-authoritative clean-adopt and dirty-conflict behavior in the graph/document store, with explicit UI state and no unconditional server load.
- Files to touch: graph store/persistence modules and conflict UI, focused tests.
- Acceptance: deterministic tests cover clean/dirty × server older/newer; browser verifies the visible conflict state while preserving local edits.
- Errors to prevent: silently replacing unsaved user work; treating mixed local cache order as authoritative.

## Verification gate

Run focused tests per task, then the protected Room/Wall matrix and relevant editor suites. Perform real browser verification on a disposable fixture and separately inspect the linked production page read-only. Only emit `FLOOR EDITOR STABILIZATION: PASS` if every acceptance criterion is implemented and browser-verified; otherwise emit `FLOOR EDITOR STABILIZATION: PARTIAL` with concrete blockers.
