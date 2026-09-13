# Floor Editor Stabilization Specification

## What

Stabilize the NAVI Floor Editor authoring workflow described in the attached ticket while preserving existing authored data, the Comsai wall-body snapping fix, and the explicit outdoor-route workflow.

## Success criteria

1. Door, Stair, and Elevator authoring use one shared rectangle interaction contract with preview, selection, move, resize, rotation, Inspector edits, undo/redo, save, and reload behavior.
2. Door ownership and route semantics are explicit: room parent assignment is deterministic, reparenting/unassigned state is visible, and route anchors/connections are explicit rather than arbitrary auto-connects.
3. Entrance visibility/selection, Outliner hierarchy, and 2D/2.5D rendering are browser-verified against the same authored document without forced rerender workarounds.
4. Window authoring controls are hidden while Window schema/data and existing rendering remain intact.
5. Newer server revisions adopt only when local state is clean; dirty local state is preserved and surfaced as a conflict with no automatic destructive overwrite.

## Non-goals

- No unrelated visual redesign.
- No direct production database mutation.
- No automatic selection of “Load server version” for a dirty local browser tab.
- No widening of Room derivation tolerances to mask authoring geometry errors.
