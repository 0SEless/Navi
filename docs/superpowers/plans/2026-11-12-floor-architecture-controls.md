# Floor Architecture Controls Implementation Plan

> For agentic workers: use superpowers:executing-plans inline. Use test-driven-development and verification-before-completion; an independent reviewer checks each release. No commits: the owner explicitly requires uncommitted rollback checkpoints.

**Goal:** Deliver reliable 2D architectural controls and matching 2.5D previews, then separately add floor-height editing, columns, and public building assembly.
**Architecture:** Keep authored floor geometry authoritative. Commands maintain attachment/route consistency; a pure wall-volume builder feeds MapLibre, with presentation and stacking datums supplied by callers.
**Tech Stack:** Existing TypeScript/React/MapLibre GL JS, @navi/core/editor/compiler, Savev2 parts, Vitest.
**Spec:** docs/superpowers/specs/2026-11-12-floor-architecture-controls-design.md

## Global constraints

- Worktree feat/save-v2 only; no commits, staging, other user-edit cleanup, second dev server, env disclosure, old/trial database writes, Save/Done/Publish, or clear-reference autofixes.
- Keep campus map-asu-ibajay at save4; use synthetic in-memory data. Any requested persisted demo requires separate exact-change authorization.
- Keep the existing validation checkpoint untouched. Each task gets a new ignored before-file/hash checkpoint under scripts/save-v2/import-data/floor-architecture-checkpoints/; rollback checks hashes before restoring only task files.
- Use one test worker and NODE_OPTIONS=--max-old-space-size=512 for tests. No full build while the memory-constrained dev server is active.

## Review focus

1. Ambiguous nearby walls/corners: never jump hosts mid-drag; no silent attachment.
2. Older standalone doors, Floor.windows and Floor.openings: no forced migration or duplicate representations.
3. Door movement with route assignments: preserve IDs/targets, update anchor/distances, and refuse partial/lock-denied edits.
4. Overlapping apertures, wall splits/merges and missing hosts: report/refuse explicitly, with exact Undo.
5. Elevated/rotated floors, public export and already-uncommitted user files: no datum drift, missing dimensions, or unrelated restoration.

## Release A — implement first after design review

### T0: Baseline and checkpoint
Files: new ignored task ledger/checkpoints; existing errors/ERRORS.md read-only for lessons.
- [ ] Record HEAD, target-file hashes, dirty paths and saved-head/checksum read-only baseline. Read existing error lessons on producer/consumer mismatch, forced-publish bypass, and generated-file type-check false passes.
- [ ] Run relevant existing wall/opening/door/serialization tests once. Record existing failures independently; do not repair unrelated fixtures.
- [ ] Record missing spec/FLOOR-ELEVATION-ACTIVE-FLOW.md as a stale reference; preserve the implemented datum contract in the new spec rather than claiming that document exists.
Expected: reproducible baseline, explicit task scope, no map writes. No commit/stash/reset.

### T1: Height/thickness properties for actual floor walls
Modify: packages/editor/src/commands/wall-handlers.ts; src/components/floor-editor/FloorEditor.tsx and FloorEditorCanvas.tsx; create src/components/floor-editor/WallProperties.tsx and __tests__/WallProperties.test.tsx; extend packages/editor/src/commands/__tests__/wall-handlers.test.ts.
Consumes: Wall numeric height/thickness and wall.update. Produces: an inspector for selected active-floor walls, positive finite validated updates, and explicit copy-floor-height action.
- [ ] RED: valid edits change only the wall; NaN/Infinity/zero/negative rejected without mutation; low wall remains a room boundary; edits that invalidate existing aperture bounds are rejected; Undo restores exact height/thickness; lock/read-only refusal makes no changes.
- [ ] Implement command validation first, then actual floor selection/inspector wiring. Do not confuse rectangle depth with vertical height.
- [ ] GREEN: run wall-handler and inspector suites; inspect low/full-height walls using synthetic rendering fixtures.

### T2: Attachment schema and lifecycle
Modify: packages/core/src/types/entities.ts, packages/core/src/serialization/serializer.ts, packages/editor/src/commands/feature-handlers.ts, wall-handlers.ts, wall-topology-handlers.ts and wall-junction-handlers.ts, packages/editor/src/geometry/opening-position.ts; src/studio-v2/client/save-controller.ts and zone-client.ts only if affected-zone acquisition changes are required; zone-registry.ts is a client-instance cache, not a command-zone mapper.
Create: packages/editor/src/geometry/door-wall-attachment.ts and geometry/__tests__/door-wall-attachment.test.ts. Extend command wall/opening/door and serialization tests.
Interface: projectDoorToWall(wall:Wall,start:LocalCoord,end:LocalCoord,depth:number): {ok:true;attachment:NonNullable<RoomDoor["wallAttachment"]>;position:LocalCoord;width:number;depth:number;rotation:number} | {ok:false;reason:string}; pure, no mutation. RoomDoor.wallAttachment has wallId/offset/openingHeight from the spec. Reuse wall-attachments projection helpers.
- [ ] RED: horizontal/vertical/diagonal walls, reversed drags/wall direction, degenerate hosts, corners, span too short/long, legacy absent fields, and serialize/deserialize round-trip.
- [ ] RED: move/split/merge remaps host and offset; route anchor moves and incident distances update while target IDs remain; canonical openings and attached doors remap across BOTH removed and retained hosts, including changed origins and reversed directions; split-through-aperture/host deletion/shortening refuses atomically; merge refuses incompatible heights or thicknesses instead of first-wall-wins; one Undo restores door/wall/network data.
- [ ] Implement additive attachment support and lifecycle handling in existing commands. Resolve the exact affected zones before mutation; no caller-side partial patch sequence.
- [ ] GREEN: run attachment, serialization, wall-junction/topology and spatial-door-handler suites.

### T3: Wall-aligned Door tool and explicit existing-door attachment
Modify: src/components/floor-editor/useFloorDrawing.ts, floor-rectangle-authoring.ts, FloorEditorCanvas.tsx, ComponentProperties.tsx; packages/editor/src/tools/door-tool.ts to maintain the alternate tool path.
Extend: floor-rectangle-authoring.test.ts and door-window-authoring.test.ts; create src/components/floor-editor/__tests__/door-wall-placement.test.tsx.
Consumes: T2 projection and attachment-aware commands. Produces: one consistent wall-aligned drag path and explicit attach-existing-door action.
- [ ] RED: host locks on drag-start, center stays on wall, width follows tangent, orientation matches diagonal wall; no-wall/invalid span gives a preview error; room selection cannot steal the gesture; Escape commits nothing.
- [ ] RED: existing attached door drag slides along host; attach-existing preview preserves ID, room and route assignment; valid release is one undo step; failed command leaves selection and feedback.
- [ ] Implement preview and release using the same pure geometry; require explicit choice when candidates are ambiguous. No automatic batch reattachment of imported doors.
- [ ] GREEN: run authoring suites and producer-to-command integration fixture.

### T4: Window placement and aperture properties
Modify: feature-handlers.ts and commands/index.ts for an opening.update handler if absent; useFloorDrawing.ts, FloorEditor.tsx and ComponentProperties.tsx; packages/editor/src/panels/ToolDock.tsx (buildInteriorToolGroups), tools/tool-registry.ts and src/components/floor-editor/adapters/tool-adapter.ts; extend panels/__tests__/ToolDock.test.tsx.
Also modify packages/editor/src/tools/window-tool.ts to dispatch canonical opening commands; extend its existing tools/__tests__/window-tool.test.ts (create that test if absent). All new windows through either tool path must use Floor.openings; retain legacy window.create only for compatibility readers/old callers, not new placement UI.
Create: src/components/floor-editor/OpeningProperties.tsx and its test. Extend packages/editor/src/commands/__tests__/opening-handlers.test.ts and src/components/floor-editor/__tests__/door-window-authoring.test.ts.
Consumes: canonical Floor.walls and Floor.openings, wallId/offset dimensions. Produces: active-floor window tool and width/height/sill controls, with one source of truth.
- [ ] RED: defaults fit a3.5m wall; low wall, sill+height overflow, overlapping openings and span overflow refuse atomically; Undo/redo and legacy windows are preserved.
- [ ] Add opening.update through the existing command registry; expose Window in the real dock rather than leaving an unused helper. Properties preview and commit must use validated values.
- [ ] GREEN: run command, inspector and dock/placement integration tests.

### T5: Opening-aware wall volumes in 2.5D
Modify: packages/editor/src/geometry/wall-to-polygon.ts (preserve old two-argument consumers); create packages/core/src/geometry/wall-opening-volumes.ts and geometry/__tests__/wall-opening-volumes.test.ts, export through packages/core/src/index.ts; modify FloorEditorCanvas.tsx.
Interface: buildWallOpeningVolumes(walls:Wall[],openings:Opening[],doors:RoomDoor[],windows:Window[],base:number): {collection:GeoJSON.FeatureCollection;diagnostics:Array<{entityId:string;code:string;message:string}>}; shared pure geometry in core (no editor/React dependency), stable piece IDs, no writes. Normalize Opening spans from their start offsets; convert attached-door center offsets explicitly. Resolve legacy Window.wallId only against a known canonical host; unresolved composite legacy wall IDs keep their old representation and produce a diagnostic, never a guessed attachment. Normalize attached door apertures and canonical/legacy windows once, using a documented ID/host-span match to avoid double carving.
- [ ] RED: ordinary wall unchanged; door removes lower volume and retains lintel; window retains sill/header; full-height opening; multiple non-overlapping apertures; invalid/legacy overlapping apertures return diagnostics without negative/zero volumes; diagonal footprints; floor-local base0 and supplied stacking base.
- [ ] Implement union/subdivision of opening boundaries for safe rendering of existing overlaps; new authoring overlap remains refused. Do not remove logical walls or alter room derivation/route network.
- [ ] GREEN: run geometry and wall-maplibre-vertical-slice tests. Compare fixture output with actual source used by FloorEditorCanvas; no separate preview-only geometry model.

### T6: Save/export compatibility and release A acceptance
Required: packages/compiler/src/emitter/artifacts.ts and packages/core/src/types/navigation-artifacts.ts must emit/declare wallAttachment including openingHeight in the door floorGeometry record. Update corresponding floorGeometry reader adapters explicitly. Modify src/studio-v2/parts/split.ts/join.ts only if round-trip tests expose a gap. Extend existing parts tests, serializer-features.test.ts and compiler w15e-search-floorgeometry.test.ts.
- [ ] RED: new attachment/window fields survive serialization and split/join; absent old fields stay absent; wall heights, canonical window dimensions and attached-door wallId/offset/openingHeight survive emitted floorGeometry AND its public/runtime reader round-trip; a producer-to-consumer test verifies the same window/door void after compilation without relying on the editor document; all existing door IDs/route targets remain stable.
- [ ] Add only required additive fields/adapters; no schema-version restamp or terrain rebuild. Separate pre-existing compiler room-reference refusal from architectural persistence results.
- [ ] Run focused suites using node --max-old-space-size=512 node_modules/vitest/vitest.mjs run <task tests> --maxWorkers=1 --no-file-parallelism; run ESLint on changed files and git diff --check. No whole-repository pass claim from partial checks.
- [ ] Independent read-only code review; fix material findings with RED/GREEN cases. Verify UI via disposable in-memory fixture if a no-save harness exists. If it does not, report that limitation; do not mutate campus save4 to obtain screenshots.
- [ ] Confirm saved head/checksums and unrelated file hashes unchanged; package task patch and guarded rollback without executing it. Release A acceptance: low wall + diagonal attached door + real window void shown by shared geometry, correct Undo and save round-trip, no new duplicate-key errors, no automatic route creation or publication.

## Release B — floor heights (separate review and implementation plan)

Target files: floor-handlers.ts, entity-update-handler.ts, floor-props.tsx, floor editor settings, save-controller.ts and affected-zone derivation, compiler artifacts/floor readers and src/lib/terrain/building-slabs.ts.
First settle floor-to-ceiling vs floor-to-floor height and slab thickness (current elevation accumulation uses Floor.height). Explicitly review every shifted floor; acquire every affected zone before any change; maintain atomic Undo, exact receipts and current stair landing relationships. Include floor.height in exported/read geometry where needed. Test terrain base once, non-ground floors, roof/block height precedence and rollback. Never silently scale existing custom walls/windows or change existing buildings by applying defaults. Do not implement from this roadmap alone.

## Release C — columns and open corridors (separate review)

Define typed architectural columns (footprint, height, floor ownership), dedicated commands, selection, serialization, rendering and compiler propagation before adding the tool. Reuse existing low walls without fake-room loops. Decide floor slab/balcony outline authoring and visual vs navigation obstruction rules explicitly. Test columns do not create semantic rooms or automatically rewrite routes. No chairs/computers/imported models.

## Release D — public stacked building representation (separate review)

Trace public floor geometry loading and runtime consumers before choosing adapters. Share the release A wall-volume generator at a runtime-safe package boundary (do not import editor React into public code). Overview blocks stay cheap; close-view detailed floors exclude the overlapping block. Resolve datum/terrain once, roofs/floor cutaway ordering, picking and zoom transitions. Measure rendering/memory on375px and landscape with an agreed budget before rollout. A dedicated roof-shape plan was not found in this worktree; do not invent its decisions.

## Stop/decision gates

Release A design approval precedes coding. Each subsequent release needs its own concrete design and acceptance plan. Unknown room ownership or ambiguous wall selection is an author decision, not automatic repair. A save/publish demonstration is not authorized by approving source implementation. All work remains uncommitted until the owner requests otherwise.

## Independent plan review — resolved before implementation

Read-only review checked command lifecycle, old Window paths, geometry offsets, compiler schemas and lock integration. Findings incorporated: separate start/center offset conventions and explicit diagnostics; all-host opening remapping on split/merge; incompatible wall merges refuse; mandatory attached-door export/read round-trip; and alternate Window tool now explicitly routed to canonical opening commands. No unresolved material review finding remains after this scope amendment. This validates the plan against inspected code, not runtime correctness of unimplemented features. Release A code/tests still need to be written and verified after owner review.