# Brush and Lasso Design

Use an edit-session controller for pointer capture, operation, private preview tiles, dirty set, selection, cancellation and commit. Pointer events update preview buffers only; no `CampusDocument` mutation or command dispatch. Pointer-up validates and dispatches one command containing changed sample/tile deltas. Escape/pointer-cancel discards preview; undo/redo applies exact deltas and rebuilds derived mesh.

Initial Raise/Lower/Smooth/Flatten operations; diameter in meters, strength, falloff, optional shape rotation and flatten target. Circle default with ellipse/square/triangle presets. Custom silhouette may be a deterministic local preference, not a second campus authority. Interpolate pointer segments; define kernel, edge and no-data behavior. Lasso is temporary selection, deterministically rasterized with optional meter-based feather; selection alone never dirties/saves.

Persist lock masks/regions separately from selection. Locked samples receive zero operation weight and visible pattern; changing locks is a reversible terrain command. Lasso cannot unlock. Excavation affecting locked samples is a conflict unless an audited override is explicitly approved.

Use contextual Terrain ToolDock mode and right inspector. Existing `B` shortcut selects Building; do not bind it globally to Brush. Reuse shared shortcut handler and ignore editable inputs/modifiers.

Efficiency invariant: one document command per completed stroke, zero scoped-save HTTP writes during drag, and at most one terrain candidate/commit after explicit Save. Count pointer events, preview updates, changed tiles, mutations, history bytes, local-draft writes, candidates, HTTP requests, bytes and DB revisions in later acceptance.
