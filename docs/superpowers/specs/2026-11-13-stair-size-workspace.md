# Stair sizing and usable editor workspace

User requests working stair width edits, adjustable stair height, a scrollable and draggable right panel, collapsible floor outliner and resizable main admin navigation. Existing user draft, campus saves, locks and previous uncommitted changes must remain untouched. No commits.

## Behavior
Stair dimensions are meters: width, footprint depth and separate vertical rise. Rotation is shown in degrees and stored in canonical degrees. Applying dimensions changes both 2D and 2.5D; parametric drawings update their source dimensions, freeform polygons preserve ordered direction and center. Rise defaults to floor height and can be overridden per level; reset restores floor inheritance. Finite positive sizes required; no arbitrary silent clamp. Leaving a field, local Apply or Enter gives one undoable command per action; reset must not commit a pending value first; it does not save the campus. Imported geometry must undo exactly.

Panels: right inspector scrolls all content and has a draggable width divider. Floor outliner can collapse to a narrow restore strip, retaining content state. Main admin navigation supports dragging width and existing icon collapse. Accessible keyboard dividers, bounded widths, map resize notification, no accidental canvas gestures. No new dependencies.

## Approach
Fix source-of-truth geometry rather than scaling rendered meshes. Reuse existing feature command and public height artifact. Use a shared resizable side-panel component for pointer/keyboard sizing, flex height constraints and independent scrolling. Floating panels would obscure the map; browser CSS-only resize lacks controlled collapse and keyboard operation.

## Proof
Regression tests for freeform/parametric edits, rotation, invalid inputs, exact undo and rise export. Component tests for resize/collapse, then isolated real browser proof of scrolling/resizing and changed stair solids without map API writes. One-worker tests; existing localhost only.
