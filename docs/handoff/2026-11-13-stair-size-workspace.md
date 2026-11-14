# Stair sizing and workspace panels - 2026-11-13

Implemented in existing feat/save-v2 worktree, uncommitted. No saved campus writes, Save/Done/Publish, user tab navigation, or lock access. Prior uncommitted work is preserved.

## Changes
- Actual stair width/depth edits now update source geometry. Parametric drawing dimensions update stepWidth and stepDepth before regenerating the polygon; freeform scaling preserves ordered corners, center, winding and closure. Rotation is canonical degrees, not the previous inspector radians. Dedicated dimension inspector reads closed footprints directly rather than selector fallback sizes.
- Optional StairLevelGeometry.height is vertical rise in meters, independent of footprint depth. Absent inherits floor height. Studio preview and compiler use per-level override first; existing artifact/runtime height field carries it publicly. Reset removes the override. Positive finite dimensions required; failed edits are atomic. Exact history snapshot restoration preserves imported cache geometry and absent properties.
- Dimensions apply on field blur/Enter or local Apply dimensions, each one command, separate from campus Save. Failed changes display an error. Use floor height avoids a spurious blur commit. Conditional canonical-prop state adjustment retains focused input nodes after ordinary updates/undo; no effect synchronization loop or keyed form remount.
- Shared ResizableSidePanel provides bounded pointer/keyboard dividers, pointer capture cleanup, window/container resize notification, independently scrolling inspector content. Floor outliner collapses to restore strip with content mounted. Admin navigation has adjustable width and its existing icon collapse. Flex minHeight/minWidth chain prevents lower inspector clipping.

## Verification
150 focused tests / 11 files passed serial, one worker, 512 MB. Original stair command regressions: 8 RED /21 preexisting passes. Inspector missing fields:3 RED. Panel controls:4 RED. Review reset/undo browser RED returned2.9 rather than2.2; fixed and GREEN. Review keyboard focus RED returned activeElement null after width blur; fixed and GREEN, plus DOM-node/focus regression.

Actual component browser fixture uses AppLayout, shared panels, door inspectors, FeatureDimensionsProperties, real feature command, real preview builder and public FloorArchitectureLayer. Width4 ->6, rise3.5 ->2.2 and top emitted height2.2 verified, Undo restores inherited3.5. Width blur + Tab retains Depth focus. Inspector scrollHeight1474 > clientHeight629; short520px viewport client429/scroll1446/scrollTop1017 reaches bottom. Inspector drag260 ->333px; collapses enlarge canvas780 ->1031px; navigation keyboard resize280px. Zero page errors and map writes, no user tabs/locks touched. Fixtures/logs/screenshots in scripts/save-v2/import-data/stair-size-workspace-20261113/browser. This is isolated real-component proof, not a saved/published-campus test.

Touched-source syntax errors0. ESLint baseline comparison introduced0: ComponentProperties1, FloorEditor21, FloorOutliner1 existing errors retained; all new modules and AppLayout0. No full project type/build or full-suite claim. Reviewer approved after two reproduced/fixed interaction defects.

Existing localhost3001 verified HTTP200 and one3GB watchdog, no new dev server. Code graph updated single worker/no clustering; no semantic doc extraction or new dependencies.

## Rollback
Task checkpoint scripts/save-v2/import-data/stair-size-workspace-20261113 includes before/after bytes, SHA256 manifest, task.patch and guarded rollback.ps1. Run without switches to check only. -Apply only if user requests rollback. Latest checkpoint must be restored before older corrections. No staging or commits. No changes to ASU save4, old development database, trial campus or test campus saved geometry.

## Tooling lessons
Python source reads require explicit UTF8; initial Windows alias launch was unavailable in default sandbox, so use escalated authorized process for installed interpreter. Browser fixture must define public process.env for imported editor barrel, not load actual environment; first harness failed process undefined without any API writes. Existing inspector tests were updated to require degrees and dimension command fields rather than preserve the faulty radians/polygon expectation. Full user editor was intentionally not entered because it contains an unsaved draft.
