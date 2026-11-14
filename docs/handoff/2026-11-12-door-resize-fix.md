# Door resize correction - 2026-11-12

Implemented locally on feat/save-v2 without staging or committing. No Save, Done, Publish, edit locks or database writes. Existing local server retained; no new server or configuration changes.

## Cause and correction

- Attached doors defaulted to wall thickness, often 0.15 m. The rectangle helper rejected original edges below 0.20 m, so visible corner handles could not resize them. Doors now explicitly allow a minimum depth of 0.01 m while the default 0.20 m rules for other rectangles stay intact.
- Attached-door corner resizing keeps its existing center fixed and preserves its axes. Width and depth grow/shrink symmetrically, keeping the center on the host wall. Free-door and other rectangle edits retain their existing opposite-corner behavior.
- A handle mousedown also reached the independent placement listener, which could create an extra door. Existing handles now take priority over new placement.
- Initial placement now uses the drag's perpendicular span for depth (at least host-wall thickness), while the projected span controls width. It retains the original host and centers on its line.
- Clicking a door footprint now selects it before its host wall, allowing its handles to reopen. Rejected updates show feedback and restore the original visual footprint. Invalid explicit depth updates are rejected before mutation.

## Verification

- Reproduced thin-door resize refusal, duplicate door creation during handle gestures, fixed initial depth, missing rejection feedback, and wall-first reselection in failing tests before their fixes.
- Final focused regression set: 10 files, 120 tests passed with one worker and a 512 MB heap. Includes horizontal/vertical/diagonal sizing, actual Canvas events, placement hook, standalone Door tool, command ownership/route retention, exact undo, wall-opening geometry and other rectangle behavior.
- Pure geometry modules: zero ESLint errors/warnings. Existing-file comparison found no new diagnostics: Canvas 25 errors/20 warnings before and after; drawing hook 12/3; feature handlers 12/2. No repository-wide clean lint/typecheck claim or full build.
- HTTP 200 verified. Zero staged files. All 11 modified source/test files pass strict UTF-8 decoding.
- Synthetic event fixtures were used; no persisted campus geometry was changed to obtain test evidence.

## Checkpoint

scripts/save-v2/import-data/door-resize-fix-20261112 stores byte-exact before/after files, manifest, task.patch and hash-guarded rollback.ps1. Check-only verification passed for all 11 files; reverse patch application was checked without applying it. This checkpoint restores only the resize correction to the previous uncommitted architecture state. Earlier architecture/validation checkpoints are untouched; rolling all architecture work back would require reverting this later correction first.

## Status clarification

Uncommitted means implemented in local source but not recorded in a Git commit. Wall controls, wall-attached door placement, window controls and 2.5D apertures were implemented by Release A. Connect Doors batch suggestions, floor-height editing, columns/balconies and detailed public stacks remain planned. Regression tests are not a performance benchmark; no separate performance benchmark was claimed or run here.
