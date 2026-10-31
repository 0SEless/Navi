# UI/UX Interaction Specification

Terrain is campus-level. Keep it on Studio campus map, not Floor Editor. Reuse Explorer, map, top Save/status and ToolDock; Terrain mode opens right inspector for datum, brush, selection, locks and conflicts. Optional 3D preview is a collapsible pane.

Modes: Select/Inspect; Raise/Lower/Smooth/Flatten; Lasso; Lock; Foundation Preview. Show brush footprint, numeric meter size/strength, sample elevation and datum. Label authored-not-surveyed. Pattern/labels as well as color distinguish no-data, selected, locked, conflict and pending draft. Unknown is never zero.

Pointer-up creates one command; Escape/pointer cancel restores preview. Announce stroke completion, not every event. Support keyboard controls, focus management, reduced motion, screen-reader status, undo/redo and failure recovery. Do not label local draft as durable commit.

ToolDock currently uses `B` for Building. Do not bind Brush globally to B; choose contextual shortcut via shared handler after owner decision. Visible controls remain discoverable.
