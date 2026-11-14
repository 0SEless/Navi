# Door duplicate wall fix - 2026-11-13

User reported duplicated doors reverted to old freeform behavior rather than attaching when moved to a wall. Fixed uncommitted in existing feat/save-v2, preserving all earlier work. No Save/Done/Publish, saved data, user tab or edit-lock actions.

## Cause and correction
Duplicate helper copied an older whitelist, omitting doorAppearance, doorPose and resolved host attachment. Default diagonal offset made an attached copy freeform. Body movement built a generic rectangle patch; detached doors remained detached and attached ones stayed projected onto their old host.

- Copy appearance/pose only when authored; keep absent fields absent. Existing width/depth/type/name/angle/metadata retained. No source room identity, other-side link or routeConnection inherited.
- Resolve attached duplicate onto a validated free position on the source wall. Prefer available candidates with0.2m clearance, fall back to exact span boundaries where clearance is unavailable. Explicit offset can target another uniquely nearby wall. Copy is derived at host centerline/orientation with its original opening height/depth. Unknown host, no fit or overlap fails without document mutation and is displayed in the properties panel.
- Body drag on a floor with walls requests snapToWall through the existing door.update command. Same nearby-wall selector as new placement, same aperture validator/derivation. Retargets a different wall, including a legacy detached copy. Preserves width/depth/style/pose and recalculates room ownership. Attached route anchors move only for the moved door; duplication never copies links or changes the graph.
- Successful Duplicate switches the current tool to Select before selecting the copy, so the next drag moves it instead of drawing a new door. Failed duplication retains the active tool. Inspector regression reproduced RED1/28passes before the fix.
- Resize and rotation keep their prior command path; wall-free legacy floor movement stays compatible. Rejected moves restore original canvas geometry through the existing rejection handler. Existing exact snapshot inverse restores prior door/attachment/network.

## Verification
153 focused tests /9 files passed, one worker,512MB. Initial RED6/19passes reproduced copy settings/attachment and snapped relocation defects. New actual Canvas integration test proves one snapToWall body-move command and no dimension patch; existing resize tests pass. Inspector duplicate rejection test failed RED then passed. Review tight-gap finding reproduced RED1/19passes; fallback fixed GREEN20/20 in command suite. Final review approved.

Isolated real-component browser: duplicate double-glass closed door on horizontal wall, drag copy onto perpendicular vertical wall, verify centerx10/y5 and radianspi/2 plus preserved dimensions/styles; source snapshot and graph unchanged. Render2.5D shows two correctly attached doors. Ambiguous corner drop rejects without changing door; Undo restores source-wall attachment. Zero page errors, map writes or user tab/lock accesses. Browser uses actual commands, rectangle command builder, preview builder and public renderer, with a fixture gesture; actual FloorEditorCanvas dispatch wiring is additionally covered by its integration test. This is not a saved-campus/native Chrome test.

Lint comparison: introduced0; existing feature-handlers12, FloorEditorCanvas25 and ComponentProperties1 errors retained. New helper, duplicate builder and rectangle builder0. Touched-source syntax0. No full project build/type/full-suite claim. Checkpoint proof/screenshots/logs under scripts/save-v2/import-data/door-duplicate-wall-20261113.

Tooling: test fixture initially omitted floor arrays and outside describe setup, then exposed a new out-of-scope canonicalFloor reference in the body-drop branch. Corrected fixture setup and resolve active floor live at release. Floating-point center equality uses toBeCloseTo/expect.closeTo. No application work inferred from fixture-only failures.

## Rollback
Latest task-only checkpoint: scripts/save-v2/import-data/door-duplicate-wall-20261113 (before/after bytes, hashes, task.patch, guarded rollback.ps1). Run without switches to verify; -Apply only when explicitly requested. Restore this before previous stair-size-workspace or older checkpoints. No staging or commits.
