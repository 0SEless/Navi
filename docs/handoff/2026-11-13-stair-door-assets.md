# Stair and door representations - 2026-11-13

Implemented in feat/save-v2, HEAD8172b246 unchanged. No commits/staging or saved campus changes. Owner approved the concrete stair/door proposal. Prior window/direct2.5D work is retained.

## Result and workflow

- Studio Architecture/2.5D and the public renderer now share local-meter wall/aperture, stair, window and door geometry. Separate opaque frames/panels and translucent glass render at active-floor z0. Public architecture appears only for the selected building/current floor in a pitched view; existing2D rendering and incomplete-data fallback symbols remain.
- Place stairs through the existing Navigation -> Stair rectangle tool in2D. Switch to Architecture ->2.5D to see raised steps. Click a stair or door solid to select its canonical entity; stair body dragging remains2D. Select a door and choose Solid panel, Glass panel or Open frame in its representation inspector. A canonical door opening offers equivalent style controls.
- Door panels use a fixed30-degree ajar convention and a leading-edge hinge. Open passage doorType always stays visually open. This is illustrative geometry, not door physics or navigation state. Changing appearance alone cannot normalize geometry, alter room ownership, move a route anchor or rewrite connector distances.
- Authored straight stair count/direction/rotation/known rise and explicit landing polygons are retained. Older resolved rectangular stairs can show bounded illustrative treads using known rise, with STAIR_APPROXIMATE diagnostics. Unsupported turning/spiral/nonrectangular flight paths, position-only geometry or unknown rise keep fallback symbols/diagnostics. No missing physical dimensions are written back or guessed as saved geometry.
- Door appearance and stair drawing/landing/height survive serialization, parts, explicit compiler emission and runtime conversion/service. Missing legacy appearance remains absent in data. Exact inverse snapshots preserve prior states. Duplicate physical door appearance prefers explicit canonical RoomDoor style, reports conflicts and never mutates source records.
- Corrected existing public fallback DoorLayer unit handling: width meters are converted through MercatorCoordinate rather than added directly to longitude/latitude. Previous tests incorrectly expected a1.2-degree door line; physical-width regressions now cover three angles.

## Proof

- Final focused suite:22 files,304 tests passed, one worker/512MB. Includes core assets, wall/window regression, appearance commands/exact undo/cosmetic route invariance, compiler/runtime/parts retention, public render model/layer/context, Studio preview/canonical selection, inspector and existing layer tests.
- New modules scoped lint clean; comparison to exact before-byte sources adds zero lint errors. Existing error counts remain FloorEditor21, Canvas25, feature-handlers12 and DoorLayer1. No claim of repository-wide lint cleanliness.
- Scoped core semantic typecheck:4 current errors exactly match4 baseline errors via an in-memory compiler-host overlay of original source; introduced errors0. Existing issues: RouteNetwork export, missing ParametricComponent type, two POI union narrowing errors. No project build or full-repository typecheck claim.
- Actual public render model/FloorArchitectureLayer browser fixture shows12 raised steps plus landing, solid or glass door, existing two-pane window. Ground/first floor switch changes12 to8 steps; building deselection and2D clear canonical3D sources. This is an isolated synthetic artifact through real components, not a published/test-campus save.
- Actual Studio browser demo on map-map-1-375k/bldg-2-emz6/floor0 built an unsaved enclosure, glass door and stair rectangle. Verified40 generated stair pieces,7 door frame pieces,1 glass pane and no opaque glass-door panel; both stair and door solid clicks resolve canonical selection. Door representation inspector appears once. Zero page errors and zero duplicate-key console errors.
- Saved head12 and all9 part versions/checksums unchanged. Navigated away and released only test-session locks. The owner explicitly approved one release of the retained jepersonsalaver test-building lock after navigation; it was executed only for building:bldg-2-emz6 on that campus. Earlier approvals were not generalized.
- Browser evidence: scripts/save-v2/import-data/stair-door-assets-20261113/browser/result.json, studio-selected-glass-door-stairs.png, public-solid-door-stairs.png, public-glass-door-detail.png. Demo data was discarded on exit.

## Checkpoint and limits

New checkpoint: scripts/save-v2/import-data/stair-door-assets-20261113. Original bytes captured before product edits, plus the existing IndoorLayers test captured before its unit correction. SHA-256 manifest, after bytes, source task.patch and default-check-only rollback.ps1 preserve prior uncommitted work. Generated graph bytes are separately guarded, excluded from the review patch. Older checkpoints are untouched; roll this task back before using the previous direct2.5D checkpoint. Run rollback.ps1 without switches to check, -Apply only after owner requests rollback.

Source-only independent review found3 material issues, all fixed with reproducing regressions: asset selection IDs, fully consumed walls reappearing via fallback, and appearance edits normalizing legacy geometry/routes. Browser additionally reproduced and verified the fix for duplicate property-panel React keys. Code graph updated with one worker/no clustering.

No Save/Done/Publish, ASU data repair, validation weakening, native mobile test, roof/column/full stacked-building assembly, stair path editor, imported model pipeline, performance benchmark or terrain elevation policy change. Public app code is wired, but ASU's saved Preview validation remains a separate issue.
