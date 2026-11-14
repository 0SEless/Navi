# Floor route workflow handoff — 2026-11-13

Status: COMPLETE — implementation, focused verification, independent review and rollback guards passed. Everything remains uncommitted. This file is the restart point if account quota runs out. The user reported10 percent at the start and requested a safe stop/handoff at1 percent. Codex cannot read the account quota; if the user reports1 percent, stop safely and preserve this checkpoint.

## Workspace and protected state
Only D:/CODEme/Navi/.navi-worktrees/navi-save-v2, branch feat/save-v2. Baseline HEAD8172b246e2d098b36e1bc9bc740defcc7b346c75. Preserve all older uncommitted architecture/window/door/stair/panel work. No staging or commits. No Save/Done/Publish or saved-map writes. User test-editor tab contains an unsaved draft: do not touch it or its locks. ASU map-asu-ibajay save4 is protected. Never write old navi-development DB or trial campus map-map-5-0y27. Never print/read/copy .env.import.local.

## Approved output implemented
- Entrances can exist alone and connect outdoors independently. A real entrance terminal node represents the floor-side endpoint with zero indoor path edges; no second entrance is required. Confirm exits to Select.
- Routes can start freely and explicitly join entrances, nodes or segments. Intentional junctions split/reuse graph topology. Ending at an entrance completes the path without opening another outdoor picker.
- Additive floor ports for doors, entrances, stair landings and elevator stops; vertical/outdoor links remain distinct. Managed explicit disconnect suppresses compiler nearest-point fallback.
- Navigation workspace has Suggest connections. It opens a floor review dialog showing walls, rooms, main route segments and temporary links. Drag round target endpoints or choose another segment; include/exclude/edit/disconnect per item. Existing links are preserved by default. Confirm is one atomic command; Cancel/Escape is inert; dedicated Undo is revision guarded.
- Suggestions project to actual route centerlines and check straight-line wall crossings. Missing walls or long links require review. This is a conservative straight-line planner, not automatic corridor pathfinding or a guarantee of traversability through incomplete geometry. Review corrections before confirming.
- Physical source moves keep owned anchors aligned; managed door moves reject blocking walls. Feature floor updates/copies preserve target links without copying source route IDs. Deletions clean owned stubs while preserving manual branches/referenced anchors. Node cleanup updates references with exact undo.
- Stable redo snapshots preserve generated identities so dependent routes can redo. Canonical floor doors override stale room copies; valid legacy nested doors remain supported.
- Outdoor picker OSM maxzoom19 prevents unsupported z22 requests; attribution retained. Raster failures show a recoverable background warning while route overlays/list remain usable. Segment selection projects onto the real line.

## Entry points
Spec: docs/superpowers/specs/2026-11-13-floor-route-workflow.md
Plan: docs/superpowers/plans/2026-11-13-floor-route-workflow.md
New connection commands: packages/editor/src/commands/floor-route-workflow.ts
Shared geometry: packages/editor/src/geometry/floor-connections.ts and feature-route-port.ts
Review UI: src/components/floor-editor/FloorConnectionReview.tsx, wired into FloorEditor.tsx Navigation workspace.
Compiler: normalize/index.ts, primitives/coordinator.ts and connector.ts honor authored floor ports.
History: optional CommandHandler.redo and HistoryEntry.redoCommand preserve scoped confirmed-after snapshots for the three new commands.

## Verification evidence
Checkpoint directory: scripts/save-v2/import-data/route-workflow-20261113/
- verification-final.log:343 tests,23 affected suites passed, serial worker and512MB heap. Includes route topology/cleanup, feature levels, door duplicate/attached controls, history, picker, drawing, inspector, floor toggles, normalization/parts/compiler.
- browser/result.json and browser/preview-corrected.png: actual FloorConnectionReview plus real CommandDispatcher/DocumentStore/HistoryStack in an intercepted isolated headless fixture. All4 kinds, pointer correction to x7, inert preview/Cancel, single Confirm, exact one-step Undo, preserve existing, selective disconnect/undo, Escape/short viewport passed. Zero page errors/network writes. No user tabs or locks accessed. This is component integration proof, not a saved-campus end-to-end test.
- Review: floor_route_final_review found2 P2 issues (redo identities, legacy doors); RED2 then GREEN31; both fixed, re-review clear. Owner-delete regressions RED2 then GREEN76, final sanity review clear. review-report.md records evidence.
- Lint comparison: no increased touched-source errors; new production files0; TypeScript syntax0. Core types4 baseline/current, compiler21 baseline/current, targeted editor feature-handlers2 preexisting errors, no introduced diagnostics. Full app build not run due memory constraints. Do not claim preexisting type/lint debt is fixed.
- Baseline virtualization confirmed old wall-hit/drag-pan mock failures. Fixtures corrected using exact layer hits and pre-gesture mock reset; obsolete forced-entry expectation updated; picker awaits async preview effect. No product workarounds for test failures.
- graph.log: one-worker no-cluster graph update completed2577 files,17172 nodes/43284 edges.

## Local server
Existing watchdog had stopped Next at3110MB at18:14:58. Port3001 was empty. Restored using unchanged scripts/save-v2/import-data/start-savev2-local.ps1 in an independent hidden PowerShell process, launcher PID11708; existing watchdog script launched independently PID4520 with3072MB limit. HTTP localhost:3001 returned200. Server lifecycle logs in checkpoint; PIDs are historical, check port/processes before restarting. No second dev server or configuration changes. Watchdog can stop Next again if it exceeds3GB.

## Checkpoint / rollback
Generator: scripts/save-v2/import-data/checkpoint-floor-route-workflow-20261113.py
Exact before bytes + after bytes + SHA256 manifest + task-only patch + guarded rollback.ps1 live in checkpoint. Run generator after final edits, then reverse-patch check and rollback.ps1 without -Apply to verify. Never apply rollback unless user asks. It refuses changed HEAD/branch, escaped paths, corrupt checkpoints or later edits; preserves older uncommitted work and saved campus data. Roll back newest task before older checkpoints.
Commands (from worktree):
python scripts/save-v2/import-data/checkpoint-floor-route-workflow-20261113.py
git apply --reverse --check --whitespace=nowarn scripts/save-v2/import-data/route-workflow-20261113/task.patch
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/save-v2/import-data/route-workflow-20261113/rollback.ps1

## Next session
Read this file/spec/plan and root AGENTS.md; query graph first. Inspect current git/checkpoint state; do not redo completed tasks. Let user review on a disposable working draft: Navigation → Suggest connections → adjust/exclude → Confirm → Undo. Campus Save remains separate and requires explicit authorization. Existing ASU publish issues/loose roads/missing imported room references are separate data repair work; not silently fixed. Future optional work: corridor-aware bent-path suggestions and clearer segment labels/highlighting, after user review. No remaining required implementation work is known. Final checkpoint verification passed: reverse patch check clean; rollback check-only verified52 files; HEAD/branch unchanged and index empty. No rollback was applied.

Final checkpoint:52 guarded files,50 source patch entries (graph files included only in guarded snapshots); UTF8 verified. lint-final.log has no introduced touched-source errors and syntax0; editor-types.json has no introduced target diagnostics.

## Real Studio integration check — 2026-11-13 (Claude)
Local :3001 started with the existing launcher + watchdog (5.0 GB free; port was empty). Test login Dr. Admin, disposable campus map-map-1-375k (save #13), building bldg-2-emz6 GF (1 stair, 1 elevator, 1 door). Not ASU; user draft/locks untouched. No Save/Done/Publish.
Verified in the running Studio (not a fixture):
- Navigation workspace shows "Suggest connections"; dialog "Review floor connections" lists door/stair/elevator.
- With no route on the floor each item says "Draw a main floor route before connecting this item"; Cancel left the page at "Saved · #13" (inert).
- After drawing one route (2 points, unsaved draft): three straight orange suggestions to Segment 1, all flagged "Long connection: review its path" and unticked by default.
- Tick Door -> link turns green; dragging its round endpoint slides it along the route line.
- Confirm -> one step: route nodes 2->4 (segment split + door point), edges 1->3; "Undo connections" button appears.
- Undo connections -> exact restore: 2 nodes, 1 edge, link gone, Undo button gone.
- After leaving: campus head commit still 13; the 2 locks taken by the test tab (bldg-1-csq3, bldg-2-emz6) force-released.
Found: minor label glitch — a ticked item's header reads "doorRoute segment" (type label and "Route segment" run together once the warning text is removed). Cosmetic.
Not yet checked in real Studio: Escape, exclude/edit/disconnect of an existing link, stair/elevator confirm, entrance outdoor link + outdoor picker, Redo, compile/Preview of a confirmed result, user app (NAVI Web) routing over confirmed links.

## Real Studio check, part 2 — 2026-11-13 (Claude)
Same campus/floor, unsaved draft only, head commit still 13 afterwards, test-tab lock released.
Verified: Escape closes the review inert (ticked item not applied, tick not kept). Staircase + elevator confirmed together in one step (nodes 2->6, edges 1->5). Undo -> 2/1; Redo (Ctrl+Shift+Z) -> 6/5 with the same node names (stable ids). Existing links show blue "Existing connection preserved. Enable Edit to change it." with Disconnect; Disconnect previews red "Will disconnect on Confirm" + "Keep connection"; Confirm removed only the stair link (6->5, 5->4), elevator kept; Undo restored 6/5. New entrance panel text present ("Connect this entrance outdoors independently…", "This entrance can remain unconnected"). Outdoor picker opens with OSM tiles (3 tiles, max z15, none >19) and "No outdoor route points are available on this campus yet" (campus has no roads), so outdoor attach not testable here.
Findings:
1. BUG (pre-existing, at HEAD and in the checkpoint "before" copy — not introduced by this task): floor-editor Entry Point placement (src/components/floor-editor/useFloorDrawing.ts placeComponent, entrance branch) passes world LatLng to entrance.create, whose handler stores building-local LocalCoord ("the caller converts"); the stair branch converts with transformer.worldToBuildingLocal. A newly placed entrance therefore has {lat,lng} and the review shows "Connection coordinates are invalid" (checkbox disabled; console NaN <circle>/<text> errors). Imported ASU entrances (10/10) use x/y and are unaffected. Proposed fix (not applied, needs owner OK + new checkpoint): convert with worldToBuildingLocal before entrance.create, TDD.
2. Minor: after Redo the "Undo connections" button does not reappear (Ctrl+Z still works).
3. Minor (from part 1): ticked item header reads "doorRoute segment".
Still unverified: outdoor attach on a campus with roads; Edit of an existing link; compile/Preview of confirmed links (Preview needs a saved commit); NAVI Web routing (needs publish).

## Real Studio check, part 3 — ASU-IBAJAY save #6, Computer Science GF (owner asked; owner closed their tab first; lock expired ~5 min after close)
Unsaved draft only; left via navigation; ASU head still 6; my lock released; no other locks.
Verified: Route tool started on the left entrance and ended on the right entrance -> route finished automatically (no Finish step); nodes "Entrance point 1/2" (route-node-entrance-…); both entrances joined by one corridor route.
FINDING (blocks Suggest connections on imported data): of 8 doors, 1 was suggested (ticked green) and 7 were "Connection crosses a wall. Choose an accessible route segment." with their checkboxes DISABLED (cannot be ticked by hand). Cause: floorConnectionProblem (packages/editor/src/geometry/floor-connections.ts:35-49) only exempts a door's own wall when port.hostWallId is set, and hostWallId comes from door.wallAttachment?.wallId (line 13). Imported old-map doors have no wallAttachment (keys: id,name,depth,width,roomId,doorType,geometry,metadata,position,rotation,ownership,connectedToType,routeConnection), so each door's link "crosses" the wall the door sits in. Entrances already get the start-of-link exemption (line 48).
Proposed fix (not applied; needs owner OK + a new separate checkpoint, TDD): when a door has no wallAttachment, treat a wall crossed right at the start of the link (within the door's depth/half-width of the door position) as the host wall; keep blocking any other wall. Add tests with an old-format door (no wallAttachment) on a room wall facing a corridor route.

## Part 4 — owner-approved fix and SAVE on ASU (save #7)
Owner asked: attach the off-wall doors, remove the duplicate door, confirm the suggestions, then save. Done in my tab (test login), so commit 7 author is mock-super-admin.
- Recorded save-6 door positions: scripts/save-v2/import-data/cs-gf-doors-save6.json.
- Used each door's existing "Attach Door to Wall" (Preview -> Apply) instead of delete/re-place: same place (0–15 cm snap onto wall-6-uilh centreline), keeps ids/rooms. Attached door-6-5yqi, door-5-j1pg, door-4-pz7r, door-3-rc8i, door-2-b3ej, door-1-bynm (door-1-eq6i was already attached).
- Deleted duplicate door-1-9275 (width 1.03, overlapping door-4-pz7r; owner's earlier test).
- Route drawn entrance-to-entrance; Suggest connections then offered 7/8 doors automatically (only the unattached duplicate blocked); Confirm applied in one step.
- Saved: ASU head commit 7, only part changed floor:osm-bldg-888026366:flr-osm-bldg-888026366-0. Verified in DB: 7 doors, 7 attached, 7 with route connection, door-1-9275 absent, route 16 nodes / 15 edges, 2 entrances. My lock released; no other locks.
Conclusion: Suggest connections works for wall-attached doors. Imported doors without wallAttachment remain blocked as "crosses a wall" until attached — code fix still proposed (floor-connections.ts host-wall exemption for unattached doors), not applied.

## Door/window assets — STOPPED at usage limit (2026-11-13)
Spec: docs/superpowers/specs/2026-11-13-door-window-assets-design.md. Plan: docs/superpowers/plans/2026-11-13-door-window-assets.md. Ledger (resume point, rulings): .superpowers/sdd/2026-11-13-door-window-assets/progress.md.
Pre-edit checkpoint: scripts/save-v2/import-data/door-window-assets-checkpoint-20261113/ (tracked.patch, untracked.tar.gz, status.txt, SHA256SUMS; HEAD 8172b24). All uncommitted.
DONE: Tasks 1–8 (fields+validation, resolver, 3D hinge/swing/sliding/fire with byte-identical snapshot for old doors, 2D plan symbols, symbols in Studio + NAVI Web, Hinge/Swing/Flip + F key, visual-only invariance test, catalog 11 presets + materials/glass + publish pass-through).
NEXT: Task 9 (materials colour in 3D, folding/roll-up), 10, 11, 12 (Phase 2), 13–15 (windows), 16 (real-Studio check, no save), deferred tsc (OOM at 2 GB with dev server running — stop server first), final review.
Open: 11 pre-existing failures in compiler integration tests (HALLWAY_DISCONNECTED) + spatial-door disconnect test — not caused by this task, not baseline-proven.
Local server: launcher + watchdog still running on :3001.

## Door/window assets — resumed 2026-11-14
Tasks 9–16 done (all uncommitted): materials/colour in 3D, folding + roll-up doors (3D and 2D), thumbnails, Appearance grid with apply-immediately and "Apply to N similar doors" (one undo), windows (9 presets incl. jalousie, sliding, casement, awning, transom, vent block; 3D, 2D symbols, panel). Phase 3 gate 23 files 332/332. Full tsc: 5032 pre-existing errors, none from this work after one test-cast fix. Real-Studio check on map-map-1-375k (save #13) passed, nothing saved.
Server: my launcher + watchdog on :3001. The stale Turbopack cache was moved to .next/dev.bak-20261114 (not deleted).
Pre-existing failures still open: door-gesture-feedback.test.tsx (2, door-tool hint text from the checkpoint), compiler integration HALLWAY_DISCONNECTED (11).
NEXT: final whole-change review, then owner decides on commit.
Final review done (fresh reviewer): 3 fixes applied with tests (legacy "open" door look no longer blocks presets; apply-to-similar copies the legacy look; symbol line colours/widths). Final gate 23 files 335/335. 4 minors deferred (ledger). Nothing committed; owner decides.

## Committed 2026-11-14
Owner approved "all work, no scratch": commit 2e7d847 on feat/save-v2 (225 files; not pushed). Left uncommitted: .superpowers/brainstorm/ and test-results/p13-connects-down.png. Includes the door-disconnect junction fix. Pre-existing failures still open: 9 compiler integration tests (fixture HALLWAY_DISCONNECTED) and the navigate dev-simulator panel test.
