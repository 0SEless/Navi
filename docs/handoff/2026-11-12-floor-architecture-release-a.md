# Floor architecture Release A - 2026-11-12

Implementation is uncommitted on feat/save-v2. Source changes only; no Save, Done, Publish or database writes. The prior door-validation checkpoint remains separate.

## Implemented

- Select a wall in 2D to edit its height/thickness. Use floor height copies a draft value. Invalid dimensions and edits through hosted apertures are refused.
- Drag a new Door along a wall: the initial host stays fixed, the center aligns to its line, width follows its tangent, and the footprint rotates with it. Ambiguous corners require another placement. Escape, floor/tool changes and read-only mode cancel drafts.
- Existing floor doors have an explicit host/center/opening-height inspector. Preview is nonmutating; Apply sends one attachment command. IDs, room ownership and route targets are retained. Imported free doors are not automatically attached.
- Window is in the Architecture dock. Both authoring paths create canonical floor openings. The inspector controls width, height, sill and wall-start distance. Rejected placements retain feedback and the starting point.
- The active-floor 2.5D source uses shared wall volumes with actual door/window voids, sill/header/lintel pieces and diagnostics. Logical walls and navigation geometry remain intact.
- Split/merge/junction edits preflight door/opening/known legacy-window attachments atomically. Invalidating edits refuse; undo restores prior data, including invalid imported windows that were explicitly repaired.
- Attached-door and window fields survive document serialization, Save v2 parts, compiler output, publisher and runtime readers. Legacy optional fields remain absent.

## Verification

- Main focused architecture run: 24 files, 362 tests passed.
- After final fixes: 61 focused tests passed; authoring/read-only tests 26 passed; opening undo/commands 49 passed. These runs overlap; counts are not summed.
- Final wall repair undo regressions: 43 wall command tests passed, covering canonical openings, legacy windows and attached doors. Lint for this fix has no errors.
- New architecture source modules have no ESLint errors. Existing large-file errors remain: Canvas 25 before/25 after, FloorEditor 21/21, drawing hook 13/12, feature handlers 12/12. No whole-repository clean claim.
- Existing compiler package typecheck has unrelated baseline fixture/import errors. Public preview also has pre-existing room-reference export refusals; architectural persistence tests do not resolve them.
- Actual Canvas event fixtures cover click-versus-hover selection and Escape cancellation. No live campus editing or browser visual acceptance was performed.
- Existing server returned HTTP 200 after fixing a newly added inspector's non-UTF-8 degree/separator bytes; watchdog PID 17888 was active. Listener was PID 18916. Do not start a duplicate server.
- Read-only Supabase check: map-asu-ibajay remains saved head 4, 151 parts, aggregate checksum digest 5ba471fb61555027d0c1a80db4acc2b9, matching the earlier saved-state baseline. No edit locks were acquired; existing owner locks were left alone.

## Checkpoint and rollback

Final source checkpoint: scripts/save-v2/import-data/architecture-release-a-final-20261112. Supersedes the earlier intermediate checkpoint after the final wall undo fix. Includes original/current bytes for 51 task files, manifest and task-verified.patch. rollback.ps1 defaults to checking hashes without changing files; -Apply is reserved for an explicit rollback request. Its check-only verification passed. It refuses changed HEAD/branch, paths outside this worktree and any later edits. It preserves earlier validation work and unrelated dirty edits. The verified review patch retains UTF-8 BOM markers; reverse application was checked without applying it.

## Error lessons

- Actual UI wiring needs event-level tests: an initial callback reached the outliner instead of the canvas; window selection was initially inserted into hover instead of click.
- Rectangle/window draft state is independent of polygon drawMode; Escape and read-only checks must handle both.
- Strict forward validation must not prevent restoring a recorded legacy undo snapshot.
- Explicitly write UTF-8 source. Vitest accepted a Windows-encoded inspector that Next.js refused to parse; HTTP verification caught it.
- Existing warning/error counts are not new regressions. Compare against exact checkpoint bytes before widening scope.

## Still planned

Connect Doors batch review retains its separate approved design; it is not implemented by this architecture release. Floor-to-floor height changes, columns/balconies, detailed public building stacks and roofs remain later releases requiring their concrete plans. Existing floor-offset/rotation discrepancies across the broader floor canvas were not expanded in this release. Furniture and imported 3D assets remain deferred.
