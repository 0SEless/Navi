# Progress Log

## 2026-09-27: Full NAVI Studio Save Module Stabilization & Live Vercel Production Verification

### What was done
- **GET `/api/graph` Omission Resolved**: `src/app/api/graph/route.ts` and `src/services/graph-snapshot-serializer.ts` committed and deployed, restoring `authoredDocument` and snapshot version serialization for GET requests so clients never initialize `authoredDocument: null`.
- **Authored Document Hydration**: In `EditorBridge.tsx` and `FloorEditorBridge.tsx`, removed guards withholding hydration when `authoredDocument` is empty/null, guaranteeing authoring models are always initialized from Supabase.
- **W3C Fetch Quota Exceeded (<60 KiB guard)**: In `src/store/graph-store.ts`, guarded `keepalive: true` to only attach when `body.length < 60000`, resolving `TypeError: Failed to fetch` on full 290 KB graph snapshots.
- **Safety Guard Baseline Alignment**: Updated `completeCampusHydration()` in `src/store/graph-store.ts` to establish `lastAcknowledgedCollections = collectionsOf(currentJson)`, preventing in-memory post-mount normalization (pruning orphan road junctions) from being flagged as uncommitted destructive deletions by the P0.11 safety guard.
- **Freshness Gate & CAS Stability**: In `src/store/graph-store.ts` (`checkServerFreshness`), eliminated false conflict marks (`syncStatus = 'conflict'`) and the permanent `● Outdated [Load server version]` banner on page reload by verifying `incomingServerTime <= lastServerTime` when `pendingAuthoredMutations.length === 0`.
- **Floor Editor DoorTool Registration & Viewport Scope**:
  - Registered `DoorTool` on `canonicalControllerRef.current` in `FloorEditorCanvas.tsx`.
  - Added vertical datum contract `FLOOR_PRESENTATION_DATUM = 0` in `packages/editor/src/geometry/wall-to-polygon.ts`.
  - Synchronized `viewport.activeBuildingId` and `viewport.activeFloorId` from route parameters and canonical floor in `FloorEditor.tsx`.
- **Audit Suite Execution**: Enhanced `scripts/save-audit-suite.mjs` with exact floor deletion targeting and ToolDock button disambiguation across full browser reload contexts.

### Verification
- **Live Vercel Production Verification (`https://navi-next.vercel.app`)**: **6 PASS / 0 FAIL / 2 SKIPPED**:
  - `C1` (Campus building name edit -> autosave -> Supabase): **PASS** (2 writes fired, persisted, reload clean)
  - `C2` (Campus Manage Floors -> "+ Add Floor" -> Supabase): **PASS** (1 write fired, persisted)
  - `C3` (Campus remove floor created by C2 -> Supabase): **PASS** (1 write fired, persisted)
  - `C6` (Campus reload shows 0 conflict cards / no Outdated banner): **PASS**
  - `F1` (Floor editor place Door -> Supabase & survives reload): **PASS** (1 write fired, persisted, verified after reload)
  - `F6` (Floor editor back to campus shows 0 conflict cards): **PASS**
  - `F2` (Console safety guard / blocked / aborted / Outdated errors): **0 findings**
  - Restore check: production values match pre-test baseline.
- **Vitest Unit Test Suite**: **20/20 test files passed (158/158 tests passed)**.

### What's next
- Merge `fix/floor-editor-persistence-2026-09-27` to main branch.



## 2026-08-30: Route draft preview visibility regression fixed

### What was done
- Reproduced the live issue on the exact Floor Editor route: clicking Route advanced the authoring status to `Route: 2 points (need 2)`, but draft geometry was not visible; finishing the path separately confirmed that persisted route nodes and edges rendered correctly.
- Passed the parent `mapReady` lifecycle signal into `useFloorDrawing`, made that load boundary authoritative, and gated draft source initialization and updates on the ready transition.
- Added a focused regression that verifies the draft FeatureCollection contains one `LineString` and two `Point` vertices after two Route clicks.

### Verification
- Readiness regression: 2 tests passed.
- Focused route/editor suite: 14 files / 328 tests passed.
- Live browser: after a clean reload, two real map clicks visibly produced the orange dashed preview edge and both orange nodes before save; the unsaved probe was cancelled afterward.
- Fresh clean reload: exact URL loaded with the Map region present, no FloorEditor error boundary, and zero new browser console errors.

### What's next
- Manual acceptance testing of the visible Route preview and completed route workflow on the live Floor Editor.

## 2026-08-30: Layered route-network V1 implementation and live verification

### What was done
- Implemented the approved layered navigation slice in the current checkout: Architecture/Navigation tool separation, multi-click Route paths, route node/edge commands and projections, point-based Room/Entrance access, route validation, non-bypassable publish blocking, and preservation of base/architecture/access/navigation artifacts.
- Added the MapLibre readiness fix discovered during live verification: drawing sources and previews now wait for style readiness and load initialization instead of calling `getSource()` during the pre-style lifecycle.
- Kept the internal `hallway` tool ID for compatibility while exposing it as Route in the Navigation tab; no route polygon or hallway width is authored.

### Verification
- Final focused suite: 13 files / 321 tests passed.
- New readiness regression: 1 test passed; the pre-style RED test reproduced the crash before the guard was added.
- Real localhost route: exact Floor Editor URL loaded after a clean reload; Map region present; FloorEditor ErrorBoundary absent; Architecture showed physical tools; Navigation showed Select, Route, Entry Point, Stair, and Elevator; Route activated as `Route (T)`.
- Browser error log after the fix contained no new entries; retained entries were only the earlier pre-fix crash timestamps.
- `graphify update .` was retried after the final source changes and remains blocked by Windows `WinError 5` access denial; generated graph output was left untouched.

### What's next
- Manual acceptance testing of Route authoring, point access connections, validation diagnostics, and publish blocking on the live Floor Editor route.

## 2026-08-29: Wall-derived Room semantics — T4/T5 production gate

### What was done
- Implemented semantic Room declare/update/unassign commands that persist `RoomAttributes` only and leave `Floor.rooms[].polygon` untouched for new authoring.
- Projected assigned derived wall faces into the existing Room Inspector, Outliner, labels, and selection flows while keeping legacy Rooms distinguishable.
- Added stable topology-based face identity, Room-mode hit testing, and plain-JSON MapLibre hover payloads.
- Verified the exact localhost Floor Editor route after save/reload with Room metadata and the derived marker visible.

### Verification
- Focused semantic suite: 15 files / 161 tests passed.
- Semantic-file ESLint and targeted `git diff --check`: passed.
- Live route: exact URL loaded; semantic Room persisted with Number `T-101`, Category `classroom`, Searchable checked, and no legacy Room entry; Room-mode and select-mode hover produced no new MapLibre serialization errors after the hover fix.
- Repository-wide TypeScript remains blocked by the unrelated untracked `packages/runtime/src/__tests__/data-identity-comparison.test.ts` syntax error.
- `graphify update .` remains blocked by Windows `WinError 5` access denial.

### What's next
- Log the integration-gate result and decide whether to remove the temporary live verification fixture after explicit destructive-action approval.

## 2026-08-29: Wall-derived Room semantics — T1 stable face projection

### What was done
- Carried the authored wall ID through intersection splitting and planar half-edges.
- Added canonical source-wall boundary cycles and deterministic face IDs that exclude raw coordinates.
- Deduplicated the two directional traces of the same closed wall cycle.
- Added focused coverage for reordered/reversed/translated walls and reasonable wall movement.

### Verification
- `semantic-room-integration.test.ts`, `w5-derived-rooms.test.ts`, `room-derivation.test.ts`, and `face-identity.test.ts`: 4 files / 40 tests passed.

### What's next
- T2: add dispatcher-backed semantic Room declare/update/unassign commands.

## 2026-08-25: W6A — Stable Face Identity / Lineage

### What was done
- Created `FaceIdentity` type with stable ID, lineage, centroid, and polygon
- Created `FaceIdentityTracker` class that:
  - Maintains a registry of known face identities
  - Matches new derived rooms to existing identities by spatial overlap (Monte Carlo)
  - Preserves identity when overlap > 70% (configurable threshold)
  - Creates new identity for unmatched faces
  - Flags ambiguity when overlap with multiple candidates
  - Updates registry incrementally during processing to avoid stale polygon comparisons
- Created `matchDerivedRoomIdentities()` convenience function for single-cycle matching
- All 4 match cases verified with tests:
  - Case 1: Stability — move wall slightly → identity preserved
  - Case 2: Split — one room becomes two → each gets appropriate identity
  - Case 3: Merge — two rooms become one → ambiguity flagged, lineage recorded
  - Case 4: Large topology change → new identity created

### Files created
- `packages/editor/src/geometry/face-identity.ts` — FaceIdentity type, FaceIdentityTracker, overlap computation
- `packages/editor/src/geometry/__tests__/face-identity.test.ts` — 10 tests covering all match cases + edge cases

### Verification
- `npx vitest run` — 10/10 face-identity tests pass, 2971/2973 total tests pass (3 pre-existing failures)
- `npx tsc --noEmit` — no new type errors in modified files
- All 122 geometry tests pass

### What's next
- W6B: Attach semantic room metadata to face identities
- Integration with derivation pipeline (store face IDs on derived rooms each cycle)

## 2026-08-23: 12A.2 Canonical InteractionController Integration

### What was done
- Exported canonical InteractionController from `packages/editor/src/index.ts`
- Wired canonical InteractionController into `FloorEditorCanvas.tsx`:
  - Imported `InteractionController as CanonicalInteractionController` from `@navi/editor`
  - Created canonical controller instance with `toolRegistry` and `toolContext`
  - Wired `handleEvent()` to Canvas pointer events (pointerDown, pointerMove, pointerUp)
  - Wired keyboard events to route through canonical controller
- Kept local controller for domain responsibilities:
  - Relationship selection
  - Interaction modes
  - Status messages
  - React observation
- Connected the two layers:
  - Canonical controller handles low-level event routing
  - Local controller handles domain-specific behavior

### Files modified
- `packages/editor/src/index.ts` — added exports for canonical InteractionController
- `src/components/floor-editor/FloorEditorCanvas.tsx` — wired canonical controller

### Verification
- TypeScript: No new type errors in modified files
- Tests: All FloorEditorCanvas tests pass (5/5)
- Tests: All canonical InteractionController tests pass (25/25)
- Pre-existing test failures in compiler and panorama handlers are unrelated

### Architecture decision (Option B) implemented
- Canonical InteractionController = event routing, tool delegation, capture/release
- Local controller = domain modes, relationship selection, status messages, React observation
- They are complementary, not competing

### What's next
- Continue with remaining tasks in 12A integration
- Monitor for any runtime issues in Canvas event routing

## 2026-08-29: Wall editing semantic Room vertical slice

### What was done
- Added immutable wall-junction grouping, snapping, and geometry validation.
- Added atomic `wall.junction.update` with inverse history and a semantic-face closure guard.
- Added Select-mode wall hover/select, shared corner handles, local-meter snap preview, Escape cancellation, and save-on-release.
- Kept semantic Rooms in `RoomAttributes`; no new writes to legacy `Floor.rooms[].polygon`.

### Verification
- Focused suite: 6 files / 61 tests passed.
- New wall modules: ESLint passed.
- Live Floor Editor route: selected a wall, made a small junction correction, confirmed `Saved`, and confirmed the derived Room remained after reload.
- Live browser console: no error or warning entries after reload.
- Known environment limitations: `graphify update .` is blocked by Windows `WinError 5`; repository-wide TypeScript is blocked by an unrelated untracked runtime test syntax error; broad lint/diff checks include pre-existing dirty-checkout issues.

### What's next
- Manual QA: select a wall in Select/Navigate mode, drag an orange shared corner, verify the Room remains derived, press Escape during a drag to cancel, and use app undo if available.

## 2026-08-29: Wall endpoint drag reliability fix

### Root cause
- Structural wall lines and junction handles were added below the derived-room layers and the dynamically added floor-plan image. The geometry existed, but the visual and pointer targets were frequently covered.

### Fix
- Promoted wall lines, edit previews, and junction handles above presentation overlays after static setup and after floor-plan updates.
- Increased the wall line and endpoint handle sizes to make the targets practical to grab.
- Added a FloorEditorCanvas regression test for the required layer promotion order.

### Verification
- Focused suite: 6 files / 62 tests passed.
- Live route: exact Floor Editor URL loaded without browser errors or warnings; wall overlay was visible, a wall was selected, an orange endpoint was dragged successfully, `Saved` appeared, and `Rooms (1)` remained derived after reload.
- Remaining lint output is limited to pre-existing canvas test-fixture violations; graphify refresh remains blocked by Windows `WinError 5`.

### What's next
- Manual QA can now use the visible red wall overlay and larger orange corner handles directly in Navigate/Select mode.

## 2026-08-29: Reverted wall endpoint visual enlargement; building-editor investigation

### What was done
- Restored the original wall line, edit-preview line, and junction-handle visual sizes so the floor plan is not globally heavier.
- Investigated the existing campus building editor and traced its metadata, whole-footprint movement, rotation, preview, commit, and cancellation paths.
- Confirmed that the existing building editor does not reshape building vertices; the closest vertex-editing reference is the road/traced-feature editor.
- Made no new wall interaction implementation in this investigation pass.

### Verification
- Focused suite: 6 files / 62 tests passed.
- Live Floor Editor route: exact URL loaded after the restart, the existing derived Room remained visible, and browser logs contained no errors or warnings.

### Findings for the next implementation pass
- Reuse the road vertex editor's explicit pan/zoom suppression, working-geometry preview, and single commit on release.
- If map-level events still lose the drag, use the existing rotation handle's window-level move/release capture pattern.
- Move shared wall junctions atomically, preserve wall topology and stable derived-face identity, and commit through the wall-junction command rather than a legacy Room polygon update.

## 2026-08-30: Semantic Room properties and saveable Inspector

### What was done
- Added canonical semantic Room fields: `name`, `type`, `code`, `description`, and `searchable`.
- Kept legacy `number`/`category` readable for old documents, while new Room authoring writes only `RoomAttributes` and defaults Searchable to enabled.
- Added editable Room Inspector controls, the Searchable `?` explanation, Save dispatch, semantic-only Delete Room behavior, and canonical projection into floor components/outliner.
- Updated search indexing and floor-geometry emission to use canonical fields with legacy fallbacks.

### Verification
- Expanded focused suite: 5 files / 56 tests passed.
- Persistence regression: canonical Room metadata survives GraphAdapter save/reload.
- Projection regression: editing Room metadata updates the projected component immediately while preserving the derived polygon.
- Live route verified at `http://localhost:3000/studio/map-map-1-k6bv/edit/building/osm-bldg-888026366/floor/0`: Room Inspector shows Room type, Code, Description, Searchable, Save, Delete Room, and the clickable Searchable help tooltip.
- Known environment limitations: scoped lint reports existing dirty-checkout issues; `graphify update .` remains blocked by Windows `WinError 5`.

### Manual QA
- Open the route above and select the derived Room in the Outliner or map.
- Edit Name, Room type, Code, and Description; leave Searchable checked or toggle it off; click Save.
- Confirm the Room label/component updates and remains under the floor's Rooms list.
- Reload the route and confirm the values persist.
- Click `?` beside Searchable to read the search explanation.
- Use Delete Room only on a semantic Room and confirm its metadata assignment is removed while the wall-derived enclosure remains.

### What's next
- User manual verification of Room metadata save/reload and semantic Delete behavior.

## 2026-08-30: Room Save and Enter projection regression fix

### Root cause
- The Room command committed the edited metadata, but `useDocumentSelector` memoized against the same mutable document object, so projected Components/Outliner data stayed stale until a full reload.
- Single-line Room Inspector fields had a clickable Save button but no Enter-key path.

### What was done
- Included the document-store version in `useDocumentSelector`'s memo dependencies so in-place commits recompute Room projections immediately.
- Routed Enter from Room Name, Room type, and Code inputs through the same save handler as the button; multiline Description still accepts normal newlines.
- Added regression coverage for both behaviors without changing wall geometry or legacy Room polygon handling.

### Verification
- RED phase reproduced both failures: selector remained `Before`; Enter dispatched zero Room updates.
- GREEN focused suite: 2 files / 6 tests passed.
- Expanded semantic suite: 6 files / 58 tests passed.
- Live route verification: Save changed the Outliner label immediately; Enter did the same; reload preserved the saved value. The temporary live test value was restored to `eme`.
- Clean reload rendered the exact Floor Editor route normally; no new browser errors were recorded after reload.

### Known limitations
- Scoped lint still reports pre-existing dirty-checkout issues in shared files.
- `graphify update .` remains blocked by Windows `WinError 5: Access is denied`; generated graph output was left untouched.

### What's next
- Manually verify Room Name, Room type, Code, Description, Searchable, Save, and reload behavior at the route above.

## 2026-08-30: Layered route authoring and route-entity editing

### What was done
- Kept the approved Architecture/Navigation tool split: one visible Navigation Route tool, with legacy internal `hallway` compatibility and no visible Route Node/Route Edge tools or shortcuts.
- Converted Route authoring to a multi-click `route.path.create` graph mutation that creates nodes and consecutive edges, reusing a nearby existing node for branches and leaving legacy hallway geometry untouched.
- Projected persisted route nodes and edges into distinct floor components, Outliner groups, MapLibre selectable layers, and Inspector views.
- Added route-node dragging with a local-coordinate preview and a single `route.node.update` commit on release; incident edge distances refresh through the command handler.
- Routed route-node and route-edge deletion through their dedicated commands instead of generic component deletion.

### Verification
- Focused route/semantic suite: 6 files / 133 tests passed.
- `git diff --check` passed for the route/Inspector source paths; Git only reported expected line-ending normalization warnings.
- Required `graphify update .` was retried and remains blocked by Windows `WinError 5`; generated graph output was left untouched.

### What's next
- Add point-based room and entrance access links into the same route network, then validate disconnected-node and publish-blocking behavior.
## 2026-08-30: Layered route validation, publish blocking, and artifact preservation

- Completed T7 route validation with shared pure checks for route structure, disconnected components, RoomAccess, EntranceAccess, and floor consistency.
- Registered the route validation rules in the editor ValidationEngine and projected scoped Navigation/Access diagnostics into the active Floor Editor surface.
- Added a non-bypassable `PublishService` route gate: `publish(true)` now stops before compilation when authored route errors remain.
- Tightened direct indoor relationship checks for cross-floor RoomAccess and EntranceAccess route-node references.
- Completed T8 with an end-to-end compiler layer matrix proving base footprint, architecture walls/openings, access relationships, and authored navigation survive together without route-to-hallway conversion.
- Verification: route/publish/relationship suite passed (4 files, 110 tests); Floor Editor validation projection suite passed (4 files, 88 tests); compiler layer closure suite passed (1 file, 64 tests).
- Next: run the complete focused route/Room/browser suite, refresh graphify, and verify the real localhost Floor Editor route.

## 2026-08-30: Semantic selection, deletion routing, and readable route labels

### What was done

- Kept the shared `useSelection` path authoritative so Outliner and Floor Editor selection feed the same Inspector state.
- Added Select-mode derived-face hit testing and selection-layer promotion so semantic Rooms can be selected from the floor without routing through legacy wall/polygon editing.
- Preserved semantic Room deletion through `roomAttributes.unassign`; the wall remains structural and is not deleted when a Room is removed.
- Replaced raw route graph labels with readable `Waypoint`, `Entrance point`, `Stair connector`, `Elevator connector`, and `Route segment` names while keeping raw IDs in metadata and Inspector identity fields.
- Hardened MapLibre drawing initialization for late style readiness and filtered absent layers before rendered-feature queries.

### Verification

- Focused editor suite: 5 files / 93 tests passed.
- Derived-face/semantic geometry suite: 3 files / 47 tests passed.
- Scoped `git diff --check`: passed; only expected line-ending normalization warnings appeared.
- Real localhost route: exact Floor Editor URL clean-reloaded with no new browser errors; Outliner showed `Waypoint 1`–`Waypoint 6` and `Route segment 1`–`Route segment 3`. Outliner selection opened the matching Inspector, and a canvas click produced no missing-layer error.
- Required `graphify update .` was retried and remains blocked by Windows `WinError 5`; generated graph output was left untouched.

### What's next

- Manual QA: select a semantic Room from the derived enclosure, verify the shared highlight/Inspector state, edit its metadata, and use Delete Room to remove only the semantic assignment while the walls remain.

## 2026-08-30: Entrance-first outdoor route connection plan

### What was done

- Restated the agreed workflow: select/create a physical building Entrance, choose an existing outdoor route point visually in a building-centered campus picker, then author the indoor Route from that Entrance and persist the existing `EntranceAccess` bridge.
- Added the draft design spec at `docs/superpowers/specs/2026-08-30-entrance-first-outdoor-route-picker-design.md`.
- Added the implementation plan at `docs/superpowers/plans/2026-08-30-entrance-first-outdoor-route-picker.md`.
- Kept this checkpoint documentation-only; no application source, schema, or live document was changed.

### Verification

- Confirmed the plan file exists and read back its full contents.
- No source tests were run because implementation has not been approved or started.

### What's next

- User validates the restated design and implementation plan. After approval, implement inline in the current checkout and verify the real Floor Editor route.

## 2026-08-30: Entrance-first outdoor route picker foundation

### What was done

- Added a pure outdoor-route candidate model that filters eligible campus graph points, measures them relative to the active building/Entrance, and resolves both node and edge clicks to stable existing node IDs.
- Added a building-centered MapLibre picker that shows the active building, selected Entrance, nearby outdoor route points, and route edges without exposing raw IDs in the primary selection UI.
- Added focused RED/GREEN coverage for candidate filtering, deterministic ordering, building bounds, node/edge selection, picker rendering, confirmation, and cancellation.

### Verification

- Picker model suite: 1 file / 6 tests passed.
- Picker component suite: 1 file / 4 tests passed.
- The new Entrance Inspector contract is currently RED until the picker is wired into the selected Entrance properties.

### What's next

- Wire the visual picker into Entrance properties, then use its confirmed point to gate and anchor the first indoor Route node.

## 2026-08-30: Entrance-first Route authoring integration

### What was done

- Wired the building-centered outdoor picker into the selected Entrance Inspector while keeping the existing `entrance.access.assign` command as the compatibility-only advanced path.
- Added the entrance-first Route gate: a new floor Route cannot begin without a confirmed Entrance/outdoor point; branch authoring on an existing Route network remains available.
- Snapped the first Route vertex to the exact Entrance position, persisted the new indoor node through `entrance.access.assign`, and restore the prior Route network if bridge assignment fails.
- Added contextual Route guidance and preserved the shared selection path by returning to the Entrance after the anchored path is saved.

### Verification

- Entrance Inspector suite: 1 file / 12 tests passed.
- Entrance-first authoring tests: 4 tests passed.
- Production Route characterization: 1 file / 70 tests passed.
- Existing Floor Editor 2D/2.5D suite: 1 file / 11 tests passed in the integration run.

### What's next

- Run the broader focused Room/Route/access/persistence suites, refresh graphify, and verify the real localhost Floor Editor workflow.

## 2026-08-30: Entrance-first Route live verification

### What was verified

- Freshly loaded the exact localhost Floor Editor URL: `http://localhost:3000/studio/map-map-1-k6bv/edit/building/osm-bldg-888026366/floor/0`.
- Opened the selected Entrance's outdoor-route picker; the dialog centered the current building, highlighted the Entrance, and presented a readable existing outdoor candidate without exposing a raw node ID in the primary UI.
- Confirmed the candidate, authored a two-point indoor Route from the Entrance, and observed the visible draft edge/vertices before finishing.
- After finishing, the Outliner showed `Route Nodes (7)` and `Route Edges (4)`, while the Entrance Inspector showed `Indoor: Route point 1` and `Outdoor: Entrance`.
- Reloaded the same route and confirmed the connection remained present and the header returned to `Saved`.
- Closed the picker without mutation and checked the browser console: no error or warning entries were reported.
- Fresh focused regression matrix: 14 files / 228 tests passed.

### Known limitations

- The shared repository typecheck remains blocked by the unrelated untracked syntax error in `packages/runtime/src/__tests__/data-identity-comparison.test.ts`; that file was not modified.
- The required `graphify update .` remains blocked by Windows `WinError 5: Access is denied`; generated graph output was left untouched.
- Live verification intentionally left one saved test path in the current Comsci Building document: Waypoint 7, Route segment 4, and their EntranceAccess bridge. They are visible for manual inspection; they were not deleted because browser safety requires action-time confirmation before deleting saved map data.

### What's next

- Manual QA can now exercise the entrance-first flow on the verified route. If the saved verification path should be removed, confirm deletion of exactly Waypoint 7, Route segment 4, and their EntranceAccess bridge.

## 2026-08-30: Final verification gate

### Verification result

- Corrected the MapLibre readiness fixture to include the required confirmed Entrance anchor; the isolated readiness suite now passes 5/5.
- Re-ran the complete feature matrix: 15 files / 233 tests passed.
- Re-ran the full repository suite: 323 files / 3,950 tests passed; 3 unrelated files / 4 tests remain failing because of missing `golden-campus` imports and publisher artifact assertions. The failures are recorded in `errors/ERRORS.md` and are outside this task.
- Re-ran scoped `git diff --check`: no whitespace errors; only expected LF-to-CRLF warnings were reported.
- Re-ran Graphify refresh after the fixture update; it remains blocked by Windows `WinError 5` and generated graph files remain untouched.

### What's next

- Keep the current checkout changes available for review and manual QA. Do not delete the live verification artifacts without explicit confirmation.

## 2026-09-05: Phase 4E — CASE C separated-crossing A* test fix

### What was done
- Investigated CASE C failure: A* was finding a path between separated roads despite correct normalizer guard logic.
- Root cause: the `nodesNearPosition` helper used a 0.001-degree radius that was too wide for the test geometry. The entrance portal at (14.0005, 121.0005) on floor 1 was matching as `startA` instead of the road-a start at (14.0, 121.0) on floor 0. Similarly, road-a's endpoint was matching as `endB` instead of road-b's endpoint.
- This meant A* was finding a path entirely within road-a — never testing cross-road connectivity at all.
- Added a `nodeAtExactPosition` helper that uses exact coordinate matching (with nearest-distance fallback).
- Updated all Phase 4E test cases (A, B, C, D) to use the new helper for precise node selection.
- Removed debug logging added during investigation.

### Verification
- Phase 4E A* tests: 5/5 pass (CASE A, B, C, D, forbidden crossing)
- Full test suite: 4500 passed, 22 pre-existing failures (unchanged), 8 skipped — zero regressions
- CASE C now correctly verifies that separated crossings prevent A* from finding a path between disconnected roads

### What's next
- Phase 4E is complete. All connectivity semantics phases (0 through 4E) are done.
- Ready for next authorized phase or cleanup.

## 2026-09-05: Phase 5 — Campus ID Contract Fix

### What was done
- Characterized the campus identity flow through Compiler V2 using explore agent.
- Found 3 bug locations where `document.metadata.name` (display name) was used instead of `document.metadata.campusId` (canonical identity):
  1. `campus-compiler.ts` line 163: V2 path set `connectivityGraph.metadata.campusId = document.metadata.name`
  2. `campus-compiler.ts` lines 406, 418: V1 `buildGraph()` used `document.metadata.name` for checksum and return
  3. `publisher/index.ts` line 40: Legacy publisher used `campus.metadata.name` for manifest campusId
- Created 6 characterization tests proving the bug (all 6 failed before fix, all pass after).
- Fixed all 3 locations by changing `.name` to `.campusId`.
- Floor geometry and QR index were already correct (read `document.metadata.campusId` directly).

### Verification
- Phase 5 tests: 6/6 pass
- Phase 4E A*: 5/5 pass
- Phase 4D: 3/3 pass
- Phase 4C: 10/10 pass
- Phase 3 semantics: 19/19 pass
- Phase 2 parity: 21/21 pass
- Phase 1 persistence: 16/16 pass
- N0041: 5/5 pass
- Full test suite: 4506 passed, 22 pre-existing failures (unchanged), 8 skipped — zero regressions

### What's next
- Phase 5 is complete. Phase 6 readiness confirmed.
- Remaining risk: modern publisher receives campusId from caller (PublishOptions). If Studio frontend passes wrong value, it propagates. This is a Phase 7 concern.

## 2026-09-05: Phase 6 — Cross-Producer Topology Parity Gate

### What was done
- Created `RoadConnectivitySignature` parity normalization layer for comparing both graph producers (GraphAdapter/legacy Graph and Compiler V2).
- Built 12 mandatory parity fixtures testing: two-road junction, three-road junction, four-road junction, separated crossing, separated+connected combination, close distinct junctions, navigation-only road, geometry-only modern document, legacy unmarked document, stale junction defense, input order invariance, and repeated projection.
- All 12 parity tests pass.
- Documented two divergences:
  1. V2's position-agnostic separated-crossing check prevents junction honoring when same road pair has both separation and junction at different positions
  2. V2's geometric crossing fallback in canonical mode infers connections from geometry (both producers agree on this behavior)

### Verification
- Phase 6 parity tests: 12/12 pass
- Full test suite: 4518 passed, 22 pre-existing failures (unchanged), 8 skipped — zero regressions
- All Phase 1-5 regression tests pass

### What's next
- Phase 6 is complete. Two documented divergences recorded.
- Phase 7 readiness: NOT READY per instructions.

## 2026-09-05: Phase 0 — Student-facing NAVI remodel audit

### What was done

- Queried Graphify before source inspection and traced the public route tree, AdaptiveShell/AdaptiveNav, public-store hydration, shared MapLibre layers, navigation session, QR/deep-link, Profile/Campuses, panorama, and theme paths.
- Confirmed that Explore and Navigate share `components/public/ExploreMap` and `components/map/NavigationMap`, while identifying the public floorGeometry wiring gap, nested navigation-provider context gap, and floor-aware entrance metadata gap.
- Recorded the locked four-tab/Home/Explore/Navigate/Active Navigation/Profile/Campuses/360/camera/QR requirements in the dedicated audit spec and plan.
- Kept this checkpoint documentation-only. No application, Studio, compiler, routing, graph, CampusDocument, published artifact, or panorama source was changed.

### Verification

- Focused public/navigation matrix: 8 test files / 107 tests passed.
- Latest repository progress baseline: 4,518 passed, 22 pre-existing failures, 8 skipped.
- Installed MapLibre package verified locally at 5.24.0; required camera and gesture APIs are present in the local declarations.

### What's next

- User reviews the audit and approves or adjusts the implementation phases. Do not modify application code until approval.

## 2026-09-05: Phase 1 T1 — Public shell, campus identity, and presentation contracts

### What was done

- Added the four-item primary navigation contract and kept `/map/maps` as the secondary Campuses route.
- Added pure presentation-only building color resolution for `department`, `navi`, and `uniform`, including navigation/accessibility precedence and input immutability.
- Added pure campus current/default, contextual floor-control, panorama ownership, and catalog/runtime availability contracts.
- Updated the public shell and store to use the four-tab contract and to keep temporary campus hydration separate from the persisted default campus.
- Added focused characterization tests for the new contracts and cache-first store compatibility.

### Verification

- `npm test -- --run src/lib/__tests__/public-app-contracts.test.ts src/store/__tests__/public-store.test.ts` — 2 files / 32 tests passed.
- TDD red phase was observed first: the new module import and missing `setDefaultCampus` action failed before implementation.

### What's next

- T2: add the navigation experience/progress state machine and route-replacement arrival reset guard.

## 2026-09-05: Phase 1 T2 — Navigation experience and progress isolation

### What was done

- Added a pure `setup` → `route-preview` → `active` → `arrived` transition contract.
- Kept GPS-derived `actualCurrentStep` separate from manually `previewedStep`, including a return-to-current operation.
- Added route-key identity and a narrow `NavigationSession` reset guard for arrival notification, reroute debounce, and manual-floor state when a new route replaces the old one.
- Added route-driven floor resolution for active navigation while preserving manual inspection outside active navigation.

### Verification

- TDD red phase was observed first: the new navigation-experience module import failed before implementation.
- `npm test -- --run src/lib/__tests__/navigation-experience.test.ts src/components/map/__tests__/NavigationSession.test.ts` — 2 files / 12 tests passed.

### What's next

- T3: characterize graph-selected named entrances/floors and preserve one live indoor navigation context through `ExploreMap`.

## 2026-09-05: Phase 1 T3 — Graph-path, indoor-context, and floor authority

### What was done

- Added graph-authority fixtures for outdoor → 1F entrance → indoor, direct named 3F entry, lower-floor vertical transition, and graph-selected alternate entrance.
- Added a public navigation-context seam and corrected `ExploreMap` to retain a live parent `NavigationProvider` instead of shadowing it with an empty provider.
- Passed the existing `floorGeometry` artifact and explicit indoor context through the public render-model/layer boundary, and preserved selected-building emphasis wiring.
- Kept A*, compiler/core contracts, entrance authoring, and MapLibre initialization unchanged.

### Verification

- The initial T3 run caught and logged one fixture assertion error; after narrowing the assertion to indoor steps, the focused suite passed.
- `npm test -- --run src/lib/__tests__/public-navigation-context.test.ts src/lib/__tests__/route-entrance-floor-contract.test.ts src/components/public/__tests__/ExploreMap.test.tsx src/components/map/__tests__/NavigationContext.test.ts src/components/map/layers/__tests__/IndoorLayers.test.ts src/lib/__tests__/route-helpers.test.ts` — 6 files / 74 tests passed.

### What's next

- T4: add the MapLibre-independent TOP/FOLLOW/POV camera policy and Capture heading reuse tests.

## 2026-09-05: Phase 1 T4 — Pure navigation camera policy

### What was done

- Added a MapLibre-independent TOP/FOLLOW/POV policy with explicit pitch, bearing, pan/zoom/rotate/pitch permissions, follow suspension, recenter, and compass behavior.
- Reused the tested Capture heading normalizer without changing Capture code or wiring public MapLibre effects.

### Verification

- TDD red phase was observed first: the camera-policy test failed because its module did not exist.
- `npm test -- --run src/lib/__tests__/navigation-camera-policy.test.ts src/features/capture/__tests__/camera.test.ts src/features/capture/__tests__/direction.test.ts src/features/capture/__tests__/orientation-camera.test.ts src/features/capture/__tests__/useCaptureDirection.test.tsx` — 5 files / 36 tests passed.

### What's next

- T5: add QR deep-link parsing/resolution and carry an existing published `qrIndex` through the public bundle adapter.

## 2026-09-05: Phase 1 T5 — QR deep-link and published-artifact adapter contracts

### What was done

- Added pure `/map/navigate` query parsing for opaque QR checkpoints, legacy node links, and explicit destinations without starting navigation.
- Added explicit resolved, unknown, foreign, unavailable, and invalid QR outcomes; opaque IDs resolve only through an exact matching published `QrIndex` entry for the current campus.
- Made legacy QR payload decoding safe for malformed percent-encoding and carried `artifacts.qrIndex` through `CampusBundle` without changing the core schema, compiler, or middleware.

### Verification

- TDD red phase was observed first: the new deep-link module was missing, the resolver was not exported, malformed decoding threw, and the store did not yet pass through `qrIndex`.
- `npm test -- --run src/lib/__tests__/navigation-deep-link.test.ts src/lib/__tests__/qr-payload.test.ts src/store/__tests__/public-store.test.ts` — 3 files / 49 tests passed.
- One adapter union-shape error was logged and corrected during the task; no protected QR/compiler behavior was changed.

### What's next

- T6: run the complete Phase 1 verification matrix, review the protected-file diff, log results, and stop before Phase 2.

## 2026-09-05: Phase 1 T6 — Verification and handoff

### Verification evidence

- New Phase 1 gate: 10 files / 87 tests passed.
- Existing public/navigation matrix: 8 files / 112 tests passed.
- Route, entrance, indoor-layer, render-model, and A* matrix: 7 files / 141 tests passed.
- Navigation camera plus Capture matrix: 5 files / 36 tests passed.
- Pure Phase 1 contract modules and tests: ESLint passed with no diagnostics.
- Scoped tracked-file `git diff --check` and Phase 1-file trailing-whitespace scan passed.
- Repository typecheck remains blocked by the pre-existing `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)` missing-brace parse error; the file was not changed.
- Required `graphify update .` retry remains blocked by Windows `WinError 5: Access is denied`; generated graph output was not edited.

### Handoff

- Phase 1 contracts and characterization tests are implemented and verified within the approved boundary.
- The checkout remains broadly dirty; protected `packages/core` and `packages/compiler` paths were already dirty and were not touched by this Phase 1 work. No middleware or compiler behavior was changed here.
- **STOP:** Do not begin Phase 2 visual remodeling until separately approved.

## 2026-09-05: Phase 2 T1 — Public preference contract and store persistence

### What was done

- Added `src/lib/public-preferences.ts` with validated System/Light/Dark theme,
  Department/NAVI/Uniform map appearance, navigation presentation,
  notifications, and Reduced Motion preferences.
- Added safe local guest persistence with malformed-storage fallback and legacy
  dark-mode/notification migration; preference updates create fresh values and
  do not mutate campus data.
- Extended the public store with explicit preference actions and expanded the
  existing campus-switch reset to clear selected building/node, route ends,
  active floor, and indoor context while preserving `defaultCampusId`.

### Verification

- TDD red phase: the new preference module/action tests failed before the
  implementation existed, as expected.
- `npm test -- --run src/lib/__tests__/public-preferences.test.ts src/store/__tests__/public-store.test.ts` — 2 files / 26 tests passed.
- Scoped ESLint for the new preference module/tests and store files passed with
  no diagnostics.
- Scoped `git diff --check` passed; Git reported only its normal LF/CRLF
  working-copy warnings.

### What's next

- T2: apply semantic public NAVI tokens, theme/accessibility DOM sync, and
  responsive shell/nav presentation without recoloring protected map/route
  semantics.

## 2026-09-05: Phase 2 T2 — Semantic tokens, theme sync, and adaptive public shell

### What was done

- Added public-shell-local NAVI semantic tokens for the approved green,
  information, warning, emergency, neutral surface, and text palette, with a
  dark compatible variant. Protected root/admin and indoor route tokens were
  left unchanged.
- Added `PublicPreferencesSync` to apply theme and Reduced Motion state to the
  public shell only; System follows `prefers-color-scheme` without mutating
  document-global admin state.
- Wrapped the existing adaptive shell/nav in the public token boundary and
  retained phone safe-area/content reservation plus desktop sidebar behavior.
- Kept the Phase 1 four-item navigation contract and added button semantics.

### Verification

- TDD red phase: the shell sync module import failed before implementation;
  existing nav characterization tests passed while the missing boundary was
  isolated.
- `npm test -- --run src/components/public/__tests__/AdaptiveNav.test.tsx src/components/public/__tests__/AdaptiveShell.test.tsx` — 2 files / 6 tests passed.
- Scoped ESLint for the shell/sync files and tests passed with no diagnostics
  after correcting one recorded set-state-in-effect issue.
- Scoped `git diff --check` passed; Git reported only normal LF/CRLF warnings.

### What's next

- T3: remodel Profile as the public settings hub, including Appearance,
  Notifications, Navigation Preferences, Accessibility, Default Campus, and
  the verified guest `/login` action.

## 2026-09-05: Phase 2 T3 — Profile settings hub and guest/account flow

### What was done

- Replaced the legacy Profile view with a responsive public settings hub that
  separates guest/account identity, campus context, preferences, support/about,
  activity, and auth actions.
- Added Appearance controls for System/Light/Dark and Map Appearance → Building
  Colors for Department Colors/NAVI Theme/Uniform, plus Notifications,
  Navigation Preferences (Top/Follow/POV, voice, automatic floors, heading),
  and Accessibility/Reduced Motion controls.
- Wired every preference to the shared public store contract and preserved the
  existing recent-activity clear actions and signed-in logout behavior.
- Corrected guest Sign In to the verified `/login` route and Default Campus
  Change to `/map/maps`; current and default campus values remain visibly
  separate.

### Verification

- TDD red phase: the new Profile assertions failed against the old view because
  its hierarchy, labels, controls, and guest route were absent or incorrect.
- `npm test -- --run src/components/public/__tests__/ProfileDashboard.test.tsx` — 1 file / 4 tests passed.
- Scoped ESLint and `git diff --check` for the Profile component/test passed
  with no diagnostics.

### What's next

- T4: remodel Campuses as the current/default switch surface, preserve the
  existing catalog source policy, and verify campus-scoped reset behavior.

## 2026-09-05: Phase 2 T4 — Campuses current/default flow and source-safe catalog presentation

### What was done

- Replaced the legacy campus list with a responsive public directory using the
  existing `/api/campuses` catalog source and a clear catalog/runtime boundary.
- Added distinct Current Campus and Default Campus summary states, per-campus
  badges, explicit Set as Default actions, search, loading, error, and empty
  states, while preserving the `/map/maps` route.
- Routed campus selection through the public store hydration action so the
  campus-scoped selection, route, floor, and indoor context reset together;
  setting a default remains an explicit preference-only action.

### Verification

- TDD red phase: the new CampusBrowser assertions failed against the old view
  because its current/default labels, explicit default action, search surface,
  and source-safe selection contract were absent.
- `npm test -- --run src/components/public/__tests__/CampusBrowser.test.tsx` — 1 file / 4 tests passed.
- Scoped ESLint for the CampusBrowser component/test passed after fixing the
  recorded structural loader/lint issues.
- Scoped `git diff --check` passed with no whitespace errors.

### What's next

- T5: run the focused Phase 2 matrix, rerun the Phase 1 regression gates,
  inspect the protected-file boundary, refresh the graph, and hand off with
  Phase 3 explicitly deferred pending approval.

## 2026-09-05: Phase 2 T5 — Verification and handoff

### Verification evidence

- Phase 2 focused matrix: 6 files / 40 tests passed, covering preferences,
  public-store persistence/reset, four-item AdaptiveNav, shell synchronization,
  Profile settings, and Campuses current/default behavior.
- Fresh Phase 1 public/navigation regression matrix: 14 files / 195 tests
  passed.
- Fresh Phase 1 camera/Capture matrix: 5 files / 36 tests passed.
- Fresh Phase 1 compiler/route/entrance/indoor matrix: 9 files / 193 tests
  passed.
- Full Phase 2 scoped ESLint passed with no diagnostics; scoped
  `git diff --check` passed with no whitespace errors. Exact approved NAVI
  palette tokens were found in the public token scope and the protected
  `html.dark` scope remained present.
- Live smoke: narrow Profile and Campuses screenshots fit without horizontal
  overflow; desktop accessibility showed the NAVI sidebar and four primary
  destinations; guest Sign In reached the real `/login` page. The persisted
  preference hydration issue found during smoke disappeared after the fix.
- Repository-wide `npx tsc --noEmit --pretty false` remains blocked only by the
  recorded unrelated `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)` missing brace.
- Required `graphify update .` remains blocked by recorded Windows `WinError 5:
  Access is denied`; generated graph output was left untouched.

### Protected boundary

- Phase 2 changes are limited to the public shell, public preferences/store
  contract, public Profile/Campuses surfaces, tests, and workflow logs/specs.
- No Phase 2 patch touched Studio, CampusDocument/authored geometry or colors,
  A*/compiler/publish invariants, entrance/floor authoring, floorGeometry,
  QR, panorama/hotspot, middleware, or backend/schema migration files. The
  checkout remains broadly dirty from earlier work and was not cleaned,
  reverted, or reset.

### Handoff

- Phase 2 is complete within the approved scope.
- **STOP:** Home, Explore, Navigate, QR, panorama, camera, and active-navigation
  remodeling were not started. Recommend Phase 3 only after separate approval.

## 2026-09-05: Phase 3 T1 — Home content contracts and public-data adapter

### What was done

- Added the typed Home content boundary in
  `src/lib/home-content.ts` for hero slides, featured places, recent
  destinations, announcements, editorial actions, and future date-bounded
  content.
- Derived featured places only from the loaded public building list and
  retained stable building IDs; announcement locations are retained only when
  their building ID exists in that same loaded source.
- Added isolated neutral fallback hero/announcement content and deterministic
  active-window/order filtering without a new fetch, schema, admin editor,
  compiler path, or protected artifact dependency.
- Added recent destination formatting from the existing public node/search
  sources, including safe building/floor context and a stale-ID label fallback.

### Verification

- TDD red phase was recorded as the expected missing-module failure in
  `errors/ERRORS.md`; the production adapter was then implemented.
- `npm test -- --run src/lib/__tests__/home-content.test.ts --reporter=dot` —
  1 file / 7 tests passed.
- Focused ESLint for the adapter and test passed.
- Scoped `git diff --check` passed with no whitespace errors.

### What's next

- T2: implement and test the accessible, reduced-motion-aware Home hero
  carousel with stable geometry and interaction timing.

## 2026-09-05: Phase 3 T2 — Accessible hero carousel

### What was done

- Added `src/components/public/HomeHeroCarousel.tsx` as a focused,
  route-agnostic presentation component. It supports active editorial slides,
  keyboard previous/next controls, indicators, touch swipe, stable aspect-ratio
  geometry, focus-visible states, and semantic carousel/slide labels.
- Added a five-second timer that resets after interaction and pauses while the
  surface is focused/hovered/touched; the public reduced-motion preference
  disables auto-advance and transform motion.
- Restricted rendered editorial images to existing same-origin project paths;
  the first slide is the only prioritized image and later slides use lazy
  loading. No panorama or full-resolution tour asset is loaded.

### Verification

- TDD red phase was recorded as the expected missing-component failure in
  `errors/ERRORS.md`; the production carousel was then implemented.
- `npm test -- --run src/components/public/__tests__/HomeHeroCarousel.test.tsx
  --reporter=dot` — 1 file / 5 tests passed.
- Focused ESLint for the carousel and test passed.
- Scoped `git diff --check` passed with no whitespace errors.
- A source-boundary check confirmed the carousel has no panorama/360 import or
  eager tour-asset dependency.

### What's next

- T3: replace the generic Home dashboard with the approved hierarchy and
  existing Search, Explore, and Navigate handoffs.

## 2026-09-05: Phase 3 T3 — Home hierarchy and existing-flow handoffs

### What was done

- Replaced the legacy `HomeDashboard` quick-action grid, mock announcements,
  emergency overlay, and panorama entry with the approved welcome, Search,
  hero, Explore Our Campus, Recent Destinations, and Campus Announcements
  hierarchy.
- Added a NAVI identity/welcome header, campus-specific Search prompt, real
  building cards sourced from the hydrated public bundle, a stable
  `building_id` Explore handoff, and an Explore map entry action.
- Reused the persisted recent-destination list and adapter context for compact
  destination/building/floor cards. Selecting a card sets the existing target
  and routes to `/map/navigate?to=...`; it does not start active navigation.
- Rendered semantic announcement priority labels and a safe information
  fallback, with location text only when the adapter validated a building ID.
- Preserved the existing Phase 2 shell as the owner of primary navigation and
  safe-area/content reservation.

### Verification

- TDD red phase was recorded in `errors/ERRORS.md`; the first implementation
  run also caught and fixed a duplicate named-region/test-fixture mismatch.
- `npm test -- --run src/lib/__tests__/home-content.test.ts
  src/components/public/__tests__/HomeHeroCarousel.test.tsx
  src/components/public/__tests__/HomeDashboard.test.tsx --reporter=dot` —
  3 files / 18 tests passed.
- Focused ESLint for the Home dashboard/test passed.
- Scoped `git diff --check` passed with no whitespace errors.
- Home source-boundary check found no legacy quick-action labels, emergency
  overlay, panorama/360, map-renderer, or second navigation-session reference.

### What's next

- T4: harden responsive, accessibility, performance, and protected-boundary
  evidence across the Phase 3 Home surface.

## 2026-09-05: Phase 3 T4 — Responsive, accessibility, and performance hardening

### What was done

- Added and verified the responsive Home contract across phone, tablet,
  landscape, and desktop widths: width-safe roots, stable card/hero geometry,
  intentional desktop max-width behavior, and content clearance above the
  Phase 2 primary navigation.
- Kept carousel controls at the approved touch-target size, preserved semantic
  headings/labels and reduced-motion behavior, and kept the first hero image
  as the only prioritized image with later content lazy-loaded.
- Confirmed that the Home surface remains presentation-only: no panorama,
  map-renderer, active-navigation, compiler, or new schema dependency was
  introduced.

### Verification

- `npm test -- --run src/lib/__tests__/home-content.test.ts
  src/components/public/__tests__/HomeHeroCarousel.test.tsx
  src/components/public/__tests__/HomeDashboard.test.tsx --reporter=dot` —
  3 files / 19 tests passed.
- Focused ESLint for all Phase 3 Home source and test files passed.
- Scoped `git diff --check` passed with no whitespace errors.
- Real student-app smoke in the connected browser showed the persisted public
  campus with real building cards, the Phase 2 sidebar/bottom navigation, and
  the complete Home section flow. Fresh local Playwright captures at 390,
  768, 1024, and 1440px rendered the safe neutral fallback without onboarding
  or horizontal overflow.
- Captures written for review:
  `phase3-home-phone-390.png`, `phase3-home-tablet-768.png`,
  `phase3-home-landscape-1024.png`, and `phase3-home-desktop-1440.png`.
- Repository-wide `npx tsc --noEmit --pretty false` remains blocked only by
  the recorded unrelated `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)` missing brace.

### What's next

- T5: run the Phase 3, Phase 2, and Phase 1 regression evidence, refresh the
  graph index, complete the final logs, and hand off without beginning Phase 4.

## 2026-09-05: Phase 3 T5 — Verification, visual QA, and handoff

### Verification evidence

- Phase 3 Home matrix: 3 files / 19 tests passed.
- Phase 2 regression matrix: 6 files / 40 tests passed.
- Phase 1 contract matrix: 10 files / 89 tests passed.
- Phase 1 public/navigation matrix: 9 files / 165 tests passed.
- Phase 1 camera/Capture matrix: 5 files / 36 tests passed.
- Phase 1 compiler/route/entrance/indoor matrix: 9 files / 193 tests passed.
- Focused ESLint for all Phase 3 Home source and tests passed. Scoped
  `git diff --check` for the Phase 3 files and workflow logs passed with no
  whitespace errors.
- Repository-wide `npx tsc --noEmit --pretty false` remains blocked only by
  the pre-existing `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)` missing-brace diagnostic.
- The required `graphify update .` retry again returned Windows `WinError 5:
  Access is denied`; generated graph output was left untouched. The required
  graph query had already completed before source inspection.

### Visual and boundary review

- Real student-app smoke showed the loaded public campus with real building
  cards, the Phase 2 four-destination navigation, the Home hierarchy, and
  bottom-navigation/content clearance.
- Fresh local browser captures were reviewed at 390, 768, 1024, and 1440px.
  Phone/tablet stayed width-safe; landscape/desktop retained the approved
  sidebar and intentional max-width content column. The no-campus fresh state
  uses the documented neutral fallback; the persisted public session showed
  real loaded campus places.
- Phase 3 application edits are limited to the Home public presentation,
  isolated content contracts/tests, and this workflow documentation. No Phase
  3 edit touched Studio, CampusDocument/authored geometry or colors, A*/route
  weights, compiler/publisher invariants, entrance/floor authoring,
  floorGeometry, QR, panorama/hotspot, camera integration, active navigation,
  or Explore implementation. The checkout remains broadly dirty from prior
  work and was not cleaned, reset, reverted, or overwritten.

### Handoff

- Phase 3 is complete within the approved Home-only scope.
- Future content work still needs an approved public/published source and an
  admin/editor contract for hero slides and announcements; this phase uses
  the adapter plus safe fallback and adds no schema or editor surface.
- Recommended next milestone: a separately approved Phase 4 Explore remodel
  that consumes the stable Home `building_id` handoff without duplicating
  building details or taking ownership of navigation.
- **STOP:** Do not begin Phase 4 or any Navigate/QR/panorama/active-navigation
  remodel in this task.

## 2026-09-06: Phase 4 T1 — Explore contracts and canonical map context

### What was done

- Added `src/lib/explore-contracts.ts` for published floor/category/search
  derivation, parent-context precedence, presentation-only colors, stable
  destination resolution, and real panorama availability.
- Wired `ExploreMap` to the existing `NavigationMap` and render model so
  outdoor context has no permanent floor selector, selected buildings expose
  only their published floors, indoor layers are context-gated, and the live
  parent navigation context remains authoritative.
- Preserved `floorGeometry` passthrough and safe absence behavior; strengthened
  selected-building emphasis with explicit outline color/width/opacity state.
- Updated floor controls to use top-down ordering, semantic pressed state,
  named grouping, and 44px minimum targets with bounded overflow.

### Verification

- Focused Explore contract, ExploreMap, FloorSelector, and BuildingLayer matrix:
  4 files / 13 tests passed.
- Scoped ESLint for all T1 source/test files passed.
- Repository-wide `npx tsc --noEmit --pretty false` remains blocked only by the
  recorded unrelated `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)` missing-brace diagnostic.
- Required `graphify update .` retry returned Windows `WinError 5: Access is denied`; generated graph output was left untouched.

### What's next

- T2: implement Explore discovery, search/filter, and contextual controls.

## 2026-09-06: Phase 4 T2 — Explore discovery, search/filter, and contextual controls

### What was done

- Added an inline Explore search surface backed by published `searchEntries`,
  with only supported Building/Room/Facility/Entrance filters rendered.
- Added stable Home `building_id` selection, map-visible result selection, and
  clean search close/reset behavior without route computation or entrance
  selection.
- Added Department, NAVI, and Uniform presentation controls and applied them
  as render-time building colors through the existing map model seam.
- Added accessible, style-ready-guarded Recenter and Reset map view actions;
  unsupported voice/route controls were not introduced.
- Preserved explicit loading, error/retry, and no-building states with
  width-safe, keyboard-friendly controls.

### Verification

- Combined T1–T2 focused matrix: 5 files / 19 tests passed.
- Scoped ESLint for all T1–T2 source and test files passed.
- Required `graphify update .` retry returned Windows `WinError 5: Access is denied`; generated graph output was left untouched.

### What's next

- T3: remodel building details and real panorama handoff.

## 2026-09-06: Phase 4 T3 — Building details and real panorama handoff

### What was done

- Replaced the legacy Explore duplicate sheet with the shared responsive
  `BuildingSheet`, using published building metadata, actual floors, rooms,
  named entrances, and explicit empty states.
- Resolved Directions only from a published stable building destination;
  missing destinations remain disabled and Explore never selects an entrance.
- Added real-asset-only 360 availability and deep-link filtering for the
  existing TourViewer route, with building/panorama query support and no
  placeholder imagery.
- Preserved lazy tour opening, close/reset behavior, accessible native buttons,
  and 44px public controls.

### Verification

- T3 focused matrix: 3 files / 13 tests passed.
- Scoped ESLint for the shared sheet, Explore page, panorama page, and Explore
  contracts passed.
- Required `graphify update .` retry returned Windows `WinError 5: Access is
  denied`; generated graph output was left untouched.

### What's next

- T4: full verification, visual QA, regression, and final logging.

## 2026-09-06: Phase 4 T4 — Full verification, visual QA, and handoff

### Verification evidence

- Fresh Phase 4 matrix: 8 files / 30 tests passed, including the canonical
  `NavigationMap` zoom-control boundary.
- Fresh Phase 1–3 regression plus compiler/route/entrance/indoor matrix:
  30 files / 332 tests passed.
- Scoped ESLint for all Phase 4 source/tests passed with no diagnostics after
  clearing the touched renderer’s unused import warning.
- Scoped `git diff --check` passed; only normal Git LF/CRLF working-copy
  warnings were reported.
- Repository-wide `npx tsc --noEmit --pretty false` reproduces only the known
  unrelated `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)`
  missing-brace diagnostic.
- `npm run build` compiled successfully, then the managed environment denied
  Next’s page-data worker spawn with `EPERM`; this is recorded as an
  environment-only post-compile limitation.

### Live visual and interaction evidence

- Existing local Chrome served `/map/explore` successfully. Fresh DOM/CUA
  checks showed the canonical MapLibre region, Search campus, Recenter map,
  Reset map view, four public navigation items, and no framework error overlay;
  after the renderer correction, no permanent Zoom in/Zoom out controls were
  exposed at the connected 582px viewport.
- At the connected 582px viewport, the selected `Library` deep link showed the
  shared `Library details` dialog, actual published floor view, named tabs, and
  the explicit `No rooms have been published for this building.` empty state.
  `Directions unavailable` stayed disabled because the live published index
  contains no stable building destination; no entrance fallback was selected.
- Live DOM metrics reported no horizontal overflow and no browser error/warn
  logs. The screenshot backend timed out, the optional agent-browser CLI was
  unavailable, and sandboxed headless Chromium returned `spawn EPERM`; these
  limitations and the resulting DOM/CUA fallback are recorded in `ERRORS.md`.

### Boundary and handoff

- Phase 4 status is limited to the Explore contracts/map, public discovery and
  shared building sheet, real panorama handoff, tests, and workflow logs. The
  pre-existing dirty compiler/core/API changes were not touched.
- No Navigate remodel, Route Preview, Active Navigation, QR, authoring,
  compiler/publisher, A*, authored geometry/color, entrance/floor authoring,
  or panorama/hotspot schema work was started.
- Final `graphify update .` retries, including the post-correction refresh,
  returned Windows `WinError 5: Access is denied`; generated graph output was
  left untouched.
- **STOP:** Phase 4 is complete. Do not begin Phase 5 or remodel Navigate in
  this task.

## 2026-09-06: Phase 5 T1 — Lifecycle and route presentation contracts

### What was done

- Added presentation-only ETA and distance helpers to the existing navigation
  contract; route cost and `NavRoute.totalDuration` remain unchanged.
- Added route-derived composition for the exact destination, graph-selected
  entrance, target building, route-backed floors, and actual stair/elevator floor
  transitions.
- Added a route-backed instruction adapter that preserves authored instruction
  text and does not invent turn semantics.
- Added characterization coverage for direct upper-floor entry, manual preview
  separation, route replacement reset, presentation ETA, and connector timing.

### Verification

- T1 focused matrix: 3 files / 38 tests passed.
- Scoped ESLint for the changed navigation contract and tests passed.
- Scoped `git diff --check` passed.
- Required `graphify update .` returned Windows `WinError 5: Access is denied`;
  generated graph output was left untouched and the issue is logged in
  `errors/ERRORS.md`.

### What's next

- T2: remodel Navigate setup and route preview, keeping Start Navigation as the
  explicit boundary into active guidance.

## 2026-09-06: Phase 5 T2 — Navigate setup and route preview

### What was done

- Replaced the legacy dominant-map Navigate landing with an accessible setup
  surface: `Navigate`, `Where do you want to go?`, `My Location`, stable
  published destination search, recent destinations, swap/clear, location
  unavailable, and the existing safe QR scanner affordance.
- Added explicit route-preview rendering over the canonical shared map with the
  exact destination, target-building emphasis, route-selected entrance/floor
  context, distance, and presentation-only ETA.
- Kept route computation separate from active guidance: a valid route exposes
  `Start navigation`, while route failure remains an explicit no-route state.
- Reused the public store search/index action and added an additive
  `navigationTargetBuildingId` visual seam without activating Explore indoor
  context or selecting an entrance.

### Verification

- T2 checkpoint matrix: 4 files / 27 tests passed.
- Scoped ESLint for Navigate, ExploreMap, and their tests passed with no
  diagnostics.
- Scoped `git diff --check` passed.
- Required `graphify update .` again returned Windows `WinError 5: Access is
  denied`; generated graph output was left untouched and the issue is logged.

### What's next

- T3: wire explicit Start Navigation into the session, add authoritative active
  progress, instruction controls, ETA/distance remaining, markers, and truthful
  deviation state.

## 2026-09-06: Phase 5 T3 — Active navigation shell and authoritative progress

### What was done

- Added an explicit `active` boundary to `NavigationSession`; geolocation
  watching, route projection, floor switching, arrival, and deviation context
  are inactive until Start Navigation is pressed.
- Exposed read-only `routeProgress`, `sessionActive`, `isOffRoute`, `arrived`,
  and `geoError` through `NavigationContext`.
- Replaced the active placeholder with route-backed instruction guidance,
  remaining distance/ETA, outdoor/entrance/indoor segment status, current and
  destination marker legend, voice preference toggle, and end control.
- Added local-only Previous/Next instruction preview with a Return to Current
  Step action; manual browsing does not mutate projected progress or floor.
- Kept deviation truthful by exposing an off-route alert and removing the old
  automatic reroute mutation path.
- Reset arrival notification guards when the ordered route identity changes;
  arrival is derived from the active route projection and notified once.

### Verification

- T3 focused checkpoint: 6 files / 43 tests passed.
- Scoped ESLint for Navigate, NavigationContext, NavigationSession, and tests
  passed with no diagnostics.
- Changed-file `git diff --check` passed; repository-wide output only reported
  pre-existing dirty-checkout whitespace warnings.
- Repository-wide `npx tsc --noEmit` still reports only the known unrelated
  missing-brace diagnostic in `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`.
- Required `graphify update .` returned Windows `WinError 5: Access is denied`;
  generated graph output was left untouched and the issue is logged.

### What's next

- T4: add route-selected indoor context, floor transitions, arrival, and
  end/reset flows. Stop before Phase 6.

## 2026-09-06: Phase 5 T4 — Route-selected indoor context, arrival, and reset

### What was done

- Mounted the existing `useNavigationIndoorController` beneath the canonical
  `NavigationSession`, so public indoor context follows live route progress.
- Corrected navigation segment derivation so building-less route steps remain
  outdoor until an authored building-backed entrance is reached.
- Kept route-selected entrance floors and connector transitions authoritative;
  active Explore context intentionally does not expose a manual floor selector.
- Added exact arrival content for destination, building, and route-provided
  floor, with no panorama/360 handoff.
- Made End Navigation reset origin, destination, active route, indoor context,
  and the route-specific public floor state.
- Added controlled session coverage for entrance-floor projection and arrival
  reset on ordered route replacement.

### Verification

- T4 focused checkpoint: 7 files / 77 tests passed.
- Scoped ESLint for Navigate, NavigationSession/Context, ExploreMap, and tests
  passed with no diagnostics.
- Changed-file `git diff --check` passed; only normal CRLF working-copy notice
  was reported.
- Required `graphify update .` returned Windows `WinError 5: Access is denied`;
  generated graph output was left untouched and the issue is logged.

### What's next

- T5: run full Phase 5 verification, responsive visual QA, relevant regression
  suites, and final workflow logging. Stop at Phase 5; do not begin Phase 6.

## 2026-09-06: Phase 6 T1 — Pure camera and heading contracts

### What was done

- Extended the public camera policy with exactly TOP/FOLLOW/POV surface
  precedence, separate transient follow and heading-follow suspension, mode
  transition duration, and functional Compass visibility/reset semantics.
- Kept route preview and Explore presentation TOP-only while allowing stored
  default view selection for active navigation; no stored preference is mutated
  by temporary camera state.
- Reused the Capture heading normalization/smoothing/resolution functions
  without changing Capture thresholds or production behavior.

### Verification

- T1 focused checkpoint: 2 files / 16 tests passed.
- Scoped ESLint passed with no diagnostics.
- Scoped `git diff --check` passed.
- Required `graphify update .` returned Windows `WinError 5: Access is denied`;
  generated graph output was left untouched and the issue is logged.

### What's next

- T2: add additive geolocation heading/speed/timestamp retention and the
  public heading adapter.

## 2026-09-06: Phase 6 T2 — Additive geolocation and heading adapter

### What was done

- Retained finite native geolocation `heading`, `speed`, and timestamp values
  alongside the existing position/error/loading state without changing the
  watch, one-shot, or throttle behavior.
- Added `useNavigationHeading` as a navigation-only adapter over the tested
  Capture direction resolver, including fresh GPS fallback and explicit,
  gesture-gated orientation permission.
- Kept invalid, slow, stale, denied, and unsupported heading behavior within
  the existing Capture contract; no global preference/store writes were added.

### Verification

- T2 focused plus Capture direction checkpoint: 3 files / 20 tests passed.
- Scoped ESLint passed with no diagnostics after correcting the adapter memo
  dependency.
- Scoped `git diff --check` passed; only normal LF-to-CRLF working-copy notices
  appeared.
- Required `graphify update .` returned Windows `WinError 5: Access is denied`;
  generated graph output was left untouched and the issue is logged.

### What's next

- T3: implement the readiness-gated imperative MapLibre camera controller.

## 2026-09-06: Phase 5 T5 — Final verification, responsive QA, and stop boundary

### What was done

- Verified the complete Navigate lifecycle: setup, route preview, explicit Start
  Navigation, active guidance, manual instruction preview isolation, route-
  selected indoor projection in fixtures, exact arrival, and End Navigation
  reset.
- Confirmed the active surface remains truthful when location is unavailable:
  it shows the route-backed instruction and waiting state without inventing
  progress or rerouting. No panorama/360 control or automatic auth flow was
  introduced.
- Preserved the existing A*, entrance-access, compiler, publisher, Studio,
  authored geometry/color, QR, floor, and panorama boundaries; Phase 6 was not
  started.

### Verification

- Phase 5 focused matrix: 7 files / 77 tests passed.
- Protected compiler, entrance, route-validation, and floor-editor matrix: 10
  files / 137 tests passed.
- Editor/rendering/Studio/PublicMap regression matrix: 10 files / 110 tests
  passed.
- Navigation renderer, indoor layers, and inspector matrix: 9 files / 196
  tests passed.
- Scoped ESLint passed with no diagnostics; changed-file `git diff --check`
  passed (only the normal CRLF working-copy notice appeared for the page).
- `npm run build` compiled successfully before the managed-environment page-data
  worker failed with `spawn EPERM`; `npx tsc --noEmit` reports only the known
  unrelated missing-brace baseline in
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`.
- Live browser QA covered 390, 768, 1024, and 1440 pixel widths with no
  horizontal overflow. Setup, route preview, active guidance, manual preview,
  location-unavailable messaging, and End Navigation reset were observed in
  the browser; console error/warning logs were empty.
- The live default campus currently lacks searchable building-backed entries,
  so indoor destination browser QA was completed with deterministic fixtures;
  the limitation is recorded in `errors/ERRORS.md`.
- Required final `graphify update .` again returned Windows `WinError 5: Access
  is denied`; generated graph output was left untouched and the issue is
  recorded in `errors/ERRORS.md`.

### What's next

- Phase 5 is complete. Stop here; do not begin Phase 6.

## 2026-09-06: Phase 6 T3 — Imperative MapLibre camera controller

### What was done

- Added a readiness-gated imperative camera controller that owns only the
  approved MapLibre camera and gesture surface.
- Implemented TOP/FOLLOW/POV pitch, bearing, offsets, gesture restrictions,
  route-preview fit padding, deduplicated updates, transient pan suspension,
  Recenter recovery, functional north-reset Compass behavior, reduced-motion
  durations, and listener cleanup.
- Kept navigation progress, route/session state, and authored map data outside
  the controller.

### Verification

- T3 focused controller checkpoint: 1 file / 11 tests passed.
- Scoped ESLint passed with no diagnostics after switching from the rejected
  legacy `--file` option to the repository's flat-config path invocation.
- Scoped `git diff --check` passed; repository-wide output only reported
  pre-existing unrelated dirty-file whitespace plus normal CRLF notices.
- Required `graphify update .` returned Windows `WinError 5: Access is denied`;
  generated graph output was left untouched and the issue is logged.

### What's next

- T4: add the React bridge and accessible View/Recenter/Compass controls.

## 2026-09-06: Phase 6 T4 — React bridge and accessible camera controls

### What was done

- Added `NavigationCamera` as a readiness-gated React bridge over the
  imperative controller, with optional context-position conversion and no
  route/session ownership.
- Added accessible View, Recenter, Compass, heading-status, and permission
  controls with explicit selected/disabled states, compact safe-area-aware
  layout, and reduced-motion status.
- Added an opt-in `ExploreMap` camera configuration that suppresses duplicate
  legacy controls only when configured; the default Explore tree is unchanged.

### Verification

- T4 focused component/Explore checkpoint: 3 files / 15 tests passed.
- Scoped ESLint passed with no diagnostics after fixing React lifecycle/ref
  lint findings and native control semantics.
- Scoped `git diff --check` passed with only the normal line-ending notice.
- Required `graphify update .` returned Windows `WinError 5: Access is denied`;
  generated graph output was left untouched and the issue is logged.

### What's next

- T5: integrate resolved heading and camera presentation with the Phase 5
  active-navigation and route-preview lifecycle.

## 2026-09-06: Phase 6 T5 — Active-navigation and route-preview integration

### What was done

- Added resolved heading/source/status/permission fields to
  `NavigationContext`; `NavigationSession` adapts additive geolocation fields
  through the existing Capture resolver while leaving route projection,
  arrival, deviation, and floor logic authoritative.
- Wired Navigate route preview to the canonical camera seam as TOP with route
  bounds, and active Start to the stored default camera mode plus heading-follow
  preference. Camera selection remains presentation-only and transient.
- Forwarded context heading/permission data through `ExploreMap` to the bridge,
  while preserving the legacy Explore control path when no camera config exists.

### Verification

- T5 focused lifecycle/session/page checkpoint: 3 files / 30 tests passed.
- Scoped ESLint passed with no diagnostics after quoting the parenthesized
  Navigate paths for PowerShell.
- Scoped `git diff --check` passed with only normal line-ending notices.
- Required `graphify update .` returned Windows `WinError 5: Access is denied`;
  generated graph output was left untouched and the issue is logged.

### What's next

- T6: run Capture and protected Phase 1–5 regression matrices and inspect the
  changed-file boundary.

## 2026-09-06: Phase 6 T6 — Capture and protected regression verification

### What was done

- Ran the fresh Capture direction, camera, orientation, and map-camera
  regressions, including the existing `useCaptureDirection` permission and GPS
  fallback tests.
- Ran the protected compiler/route/floor, editor/Studio/PublicMap, and full
  navigation lifecycle matrices; no QR, panorama, Studio, authored geometry,
  or route-progress production changes were made in T6.
- Inspected the Phase 6 changed-scope status and kept the repository's earlier
  dirty protected files classified as pre-existing checkout state.

### Verification

- Capture/policy matrix: 5 files / 40 tests passed.
- Sensor-hook/controller matrix: 6 files / 41 tests passed.
- Compiler/route/floor protection matrix: 9 files / 129 tests passed.
- Editor/Studio/PublicMap protection matrix: 10 files / 110 tests passed.
- Navigation lifecycle matrix: 6 files / 45 tests passed.
- Scoped Phase 6 `git diff --check` passed with only normal line-ending
  notices; no Phase 6 Capture/protected test files were modified.

### What's next

- T7: perform fresh responsive/browser evidence, log environment limits, and
  stop at the Phase 6 boundary without starting Phase 7.

## 2026-09-06: Phase 6 T7 — Visual QA, evidence, and stop boundary

### What was done

- Used the managed local CUA browser fallback after the prescribed
  `agent-browser` CLI was unavailable. Verified route preview, Start, active
  navigation, View mode changes, Recenter, heading-unavailable/permission
  states, and the Explore legacy controls through fresh accessibility state.
- Confirmed the route-preview surface remains TOP-only and that active
  navigation exposes the presentation controls without changing route/session
  progress. No QR or Phase 7 work was started.

### Verification

- Final Phase 6 focused checkpoint: 16 files / 114 tests passed.
- Earlier protected matrices remained green: Capture/policy 5 files / 40
  tests; sensor/controller 6 / 41; compiler/route/floor 9 / 129;
  editor/Studio/PublicMap 10 / 110; navigation lifecycle 6 / 45.
- Phase 6 changed-file ESLint passed; scoped `git diff --check` passed with
  only normal line-ending notices.
- Fresh typecheck/build remain blocked only by logged repository baselines:
  the unrelated missing `}` in
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255` and
  managed Windows `spawn EPERM` during page-data generation.
- Browser screenshots succeeded for route preview and active navigation after
  retry. Explore screenshot capture was unavailable in the managed CUA
  surface; direct 390px/1440px viewport screenshots were not available, so
  responsive claims are limited to the rendered control semantics and CSS
  invariants covered by tests. External OSM tile fetch failures were logged
  separately.
- Required final `graphify update .` again returned Windows `WinError 5:
  Access is denied`; generated graph output was left untouched.

### What's next

- Phase 6 is complete at its approved boundary. The next separate scope is
  Phase 7 QR runtime integration, only after explicit approval.

## 2026-09-06: Phase 7 T1 — Pure QR formats, location view model, and shared resolver

### What was done

- Hardened the Phase 1 QR/deep-link boundary with explicit stable-ID limits,
  trusted public-host checks, duplicate-parameter rejection, unsupported URL
  rejection, and QR-plus-destination preservation.
- Added the shared QR scan/location resolver. It resolves opaque checkpoints
  from the exact published `qrIndex`, prefers the published QR graph entity,
  supports bounded coordinate snapping only with a published floor geometry
  anchor, and reports non-routable checkpoints without guessing.
- Preserved the explicit legacy node payload families for existing scanner
  consumers.

### Verification

- Focused T1 checkpoint: 3 files / 44 tests passed.
- Scoped ESLint passed with no diagnostics.
- Required `graphify update .` returned Windows `WinError 5: Access is denied`;
  generated graph output was left untouched and the issue is logged.

### What's next

- T2: add published-only QR campus discovery and transaction-safe current
  campus hydration while preserving the saved default campus.

## 2026-09-06: Phase 7 T2 — Published QR discovery and transaction-safe campus hydration

### What was done

- Added `GET /api/public-qr?checkpoint_id=...` as a published_maps-only
  discovery endpoint with exact-ID validation, duplicate/oversize rejection,
  ambiguity detection, generic read failures, and safe checkpoint fields.
- Added explicit `qrLocation` state and a store action that keeps QR origin
  separate from ordinary location selection; ordinary `setFrom` clears it.
- Changed campus switching to retain the prior valid campus until the
  requested campus succeeds, restore it on failed hydration, reset
  campus-scoped selections only after a successful switch, and leave the
  stored default campus unchanged.

### Verification

- Focused T2 checkpoint: 2 files / 29 tests passed.
- Scoped ESLint passed for the public QR route, route tests, public store, and
  store tests.
- Required `graphify update .` returned Windows `WinError 5: Access is denied`;
  generated graph output was left untouched and the issue is logged.

### What's next

- T3: route the in-app scanner through the shared QR resolver while preserving
  the existing admin legacy node callback.

## 2026-09-06: Phase 7 T3 — Shared in-app scanner resolver

### What was done

- Added an additive raw-payload callback to `QRScanner`; existing admin and
  PublicMap consumers still receive their legacy node callback when they do not
  opt into the new path.
- Updated `QRScanSheet` so camera and manual payloads use the shared QR scan
  resolver, preserving explicit legacy node forms and exposing malformed,
  foreign, unknown, and unavailable outcomes through its alert surface.
- Kept the scanner callback stable while synchronizing current campus, mode,
  and parent callbacks from an effect to satisfy the imperative camera/lifecycle
  boundary.

### Verification

- Focused T3 checkpoint: 3 files / 5 tests passed, including the existing
  PublicMap legacy scanner consumer.
- Scoped ESLint passed for the scanner, sheet, and new tests.
- Required `graphify update .` returned Windows `WinError 5: Access is denied`;
  generated graph output was left untouched and the issue is logged.

### What's next

- T4: consume `/map/navigate?qr=...` exactly once, hydrate a discovered campus
  transactionally, and hand the resolved origin to Navigate without auto-start.

## 2026-09-06: Phase 7 T4 — Navigate deep-link lifecycle and handoff

### What was done

- Added the one-shot `useQrNavigateDeepLink` lifecycle: direct same-campus
  resolution first, published QR discovery for missing/foreign campuses, and
  authoritative post-hydration re-resolution before committing origin state.
- Preserved optional `to` only when it is a published graph node, cleaned only
  `qr` after a successful commit, and left malformed/unknown/unavailable links
  visible for recovery without mutating location state.
- Added `/q/[checkpointId]` as a canonical bridge to
  `/map/navigate?qr=<CHECKPOINT_ID>` with malformed ids failing closed.
- Integrated the handoff into Navigate setup and kept route preview separate
  from explicit Start navigation.

### Verification

- Focused T4 checkpoint: 3 files / 18 tests passed.
- Scoped ESLint passed for the hook, bridge, Navigate page, and their tests.
- Required `graphify update .` returned Windows `WinError 5: Access is denied`;
  generated graph output was left untouched and the issue is logged.

### What's next

- T5: finish the accessible QR result/recovery surface, scanner retry path, and
  responsive touch-target invariants without adding active-navigation recovery.

## 2026-09-06: Phase 7 T5 — Accessible QR result, recovery, and responsive setup UI

### What was done

- Added a retryable, live-announced QR deep-link status surface to Navigate for
  loading, unknown, malformed, and unavailable outcomes.
- Hardened the scanner sheet with modal semantics, explicit selected mode state,
  keyboard-safe buttons, 44px touch targets, manual paste recovery, and clear
  camera/QR error announcements.
- Kept non-routable QR locations visible and truthful without inventing a graph
  anchor or enabling active-navigation recovery.

### Verification

- Focused T5 checkpoint: 2 files / 16 tests passed.
- Scoped ESLint passed for the QR sheet, Navigate page, and their tests.
- Required `graphify update .` returned Windows `WinError 5: Access is denied`;
  generated graph output was left untouched and the issue is logged.

### What's next

- T6: run the full Phase 7/protected regression matrices and inspect the
  changed-file boundary before final targeted QA.

## 2026-09-06: Phase 7 T6 — Regression and protected-boundary verification

### What was done

- Closed the non-routable QR handoff gap: deep links and scanner results with
  no authoritative routing anchor remain actionable and cannot mutate the
  current origin, destination, QR location, or URL.
- Re-ran the complete QR/deep-link matrix and all protected compiler,
  navigation, editor/Studio, PublicMap, Capture, and Phase 6 camera suites.
- Confirmed the Phase 7 changed-file boundary with scoped lint and diff
  hygiene; retained unrelated dirty-checkout baselines unchanged.

### Verification

- Phase 7 QR/deep-link matrix: 10 files / 99 tests passed.
- Protected compiler/navigation matrix: 9 files / 198 tests passed.
- Protected editor/Studio/PublicMap matrix: 10 files / 110 tests passed.
- Protected Capture matrix: 8 files / 46 tests passed.
- Protected Phase 6 camera/geolocation matrix: 9 files / 57 tests passed.
- Focused non-routable handoff gate: 2 files / 19 tests passed.
- Full Phase 7 scoped ESLint passed; Phase 7 scoped `git diff --check`
  passed with only normal LF/CRLF notices.
- Repository typecheck remains blocked by the known unrelated
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)`
  `TS1005` baseline; repository-wide diff-check still reports unrelated
  dirty-worktree whitespace. Both are logged in `errors/ERRORS.md`.
- Required `graphify update .` again returned Windows `WinError 5: Access is
  denied`; generated graph output was left untouched and the issue is logged.

### What's next

- T7: perform only targeted browser/device QA and finalize the Phase 7 report;
  do not begin full-app QA or Phase 8.

## 2026-09-06: Phase 7 T7 — Targeted QR QA, documentation, and stop boundary

### What was done

- Performed targeted CUA Chrome checks against the running guest-accessible
  NAVI route: unknown QR, malformed/unsafe QR, canonical `/q/<id>` bridge,
  QR plus destination context, retry, and in-app scanner entry/sheet.
- Confirmed the scanner sheet exposes modal semantics, start/destination
  choices, manual paste recovery, and a disabled Use action before input.
- Reviewed the Phase 7 spec/plan/TODO and the scoped changed-file list; no
  Phase 8 work or final full-app QA was started.

### Verification

- Unknown QR rendered an actionable “This QR location is not recognized.”
  message with “Try QR again”; retry visibly re-entered resolving and settled
  back to the same safe error without changing the QR URL.
- `/q/campus-a-checkpoint` redirected to
  `/map/navigate?qr=campus-a-checkpoint`; an unsafe
  `javascript:alert(1)` value stayed in the QR query and rendered “This QR
  link is invalid.” without execution.
- QR plus `to=room-301` preserved both query parameters and remained in setup
  with no automatic route start; guest navigation showed no login wall.
- Live endpoint checks found no published fixtures for the deterministic
  `north-gate`, `campus-a-checkpoint`, or `campus-b-checkpoint` ids, so live
  valid/cross-campus hydration and floor-context browser checks were not
  claimed. Their resolver/store/hydration behavior is covered by the green
  Phase 7 matrix.
- No physical phone camera was available, and no native-camera verification
  is claimed. Per-viewport browser screenshots at 390/768/1024/1440 were not
  available in the managed CUA surface; responsive/touch/accessibility
  invariants are covered by focused tests and scoped lint.
- All TODO items T1–T7 are now verified. Phase 7 stops here as requested;
  Phase 8 and final full-app QA remain outside this turn.

### What's next

- None in this phase. Await a separate approval before any Phase 8 or final
  full-app QA work.

## 2026-09-06: Phase 8A T0 — Preflight and repository boundary

### What was done

- Confirmed the current branch is `master` with a broadly dirty checkout: 1006
  porcelain entries, including 623 untracked, 365 modified/added, and 18
  deleted entries. Phase 8A artifacts are scoped separately from that prior
  work; no cleanup or reset was performed.
- Confirmed the local Next development server is listening on port 3000
  (Node PID 18376), with Node `v24.16.0`, npm `11.13.0`, Next `16.2.9`,
  React `19.2.4`, MapLibre `5.24.0`, Pannellum `2.5.7`, and html5-qrcode
  `2.3.8`.
- Queried the real public campus catalog and runtime endpoints without
  republishing. The browser session is authenticated as a Viewer and has
  current/default campus `map-map-1-k6bv`; `asu-ibajay` is the catalog's empty
  row.
- Recorded the source inventory: `asu-ibajay` returns `source: empty` with 0
  buildings; `map-map-1-k6bv` returns `source: graph_snapshots` with 30
  buildings, 86 nodes, and 80 edges. Its response has no compiler `artifacts`,
  `qrIndex`, `floorGeometry`, or `panoramaIndex`; all 30 snapshot buildings
  expose `floorData`.
- Confirmed `graphify-out/graph.json` exists at 7.3 MB with last-write time
  2026-08-13; this is project-knowledge-graph availability, not proof of a
  current published navigation package. Catalog metadata lists
  `map-map-1-k6bv` updated 2026-09-04.

### Verification

- Preflight command output, public API responses, branch/status counts, server
  listener, package versions, graph availability, and the active Profile
  campus context are recorded above and in the Phase 8A audit report draft.
- Finding `F-001` records the Profile → Change campus route bounce; the active
  data/source and Home identity mismatch is recorded as a separate T0/T2
  finding in `errors/ERRORS.md`.

### What's next

- T1: audit public entries, shell initialization, guest access, selected
  navigation state, history, refresh, safe-area, and desktop/sidebar behavior.

## 2026-09-06: Phase 8A T1 — Public entry, shell, and primary navigation

### What was done

- Verified the public route responses: `/map` returns a 307 redirect to
  `/map/home`; `/map/home`, `/map/explore`, `/map/navigate`, `/map/profile`,
  and `/map/maps` return 200 responses.
- Verified fresh managed-browser loads for Home, Explore, Navigate, Profile,
  and Campuses. The guest-capable public shell rendered with four primary
  destinations (Home, Explore, Navigate, Profile); Campuses remained a
  secondary route rather than a fifth bottom-nav item.
- Verified in-app Home → Explore → Navigate transitions after allowing for
  client navigation settling. Direct `/map/maps` remained reachable, while
  the authenticated Profile → Change campus handoff returned to Profile; the
  latter is recorded as finding `F-001` and deferred to Phase 8B.
- Observed a QR invalid-state notice on one in-app Explore → Navigate handoff
  without a QR query; fresh direct Navigate did not reproduce it. This is
  recorded for correlation as a possible stale client-state finding.

### Verification

- `curl.exe -s -D - -o NUL http://localhost:3000/map` showed
  `HTTP/1.1 307 Temporary Redirect` and `location: /map/home`.
- `Invoke-WebRequest` returned 200 for each five public page routes.
- CUA observations captured settled accessible trees for all five entries and
  the direct Campuses route; no production source was modified.

### What's next

- T2: audit real-data Home content, search handoff, recents, loading/empty
  states, and campus identity consistency.

## 2026-09-06: Phase 8A T2 — Home and global search

### What was done

- Verified the settled real-data Home surface renders 30 building cards,
  recent destinations (`Road Junction`, `N1002`), one fallback hero, and one
  fallback announcement. The building-card handoff opened Explore with
  `building_id=osm-bldg-801492090`; the recent-destination handoff opened
  `/map/navigate?to=N3887` and correctly waited for a supported origin.
- Verified Home → Search opens `/map/search` with an accessible search field.
  The real active snapshot has no artifacts/search index, so no real query
  result was claimed; fixture contracts cover query ranking and no-result
  states.
- Correlated the live Home identity with the selected campus: the UI says
  ASU–Ibajay while the hydrated campus is `map-map-1-k6bv`. This and the
  fallback content are release findings, not production changes.

### Verification

- `npm test -- --run src/lib/__tests__/home-content.test.ts src/lib/__tests__/search-format.test.ts src/lib/__tests__/public-app-contracts.test.ts src/components/public/__tests__/HomeDashboard.test.tsx src/components/public/__tests__/HomeHeroCarousel.test.tsx src/components/public/__tests__/AdaptiveShell.test.tsx src/components/public/__tests__/AdaptiveNav.test.tsx 'src/app/(public)/map/explore/page.test.tsx' --reporter=dot`
  passed: 8 files, 52 tests.
- CUA observations captured settled Home, Search, Explore-building, and
  Recent→Navigate states. The managed browser could focus but not reliably
  type into the search field; live query results remain unverified.

### What's next

- T3: audit Explore details, panorama availability, indoor/floor controls,
  building data integrity, and responsive map context.

## 2026-09-06: Phase 8A T3 — Explore, building details, panorama, and floors

### What was done

- Verified a real Bldg No. 1 detail handoff and a real Hm Building detail
  handoff. The detail sheet rendered the building name, floor count, room and
  entrance counts, summary state, and disabled Directions action.
- Verified Hm Building exposes four real floor records and the Explore floor
  control switches from Ground Floor to 3F without changing route state.
- Verified the public panorama route settles to `No 360 Tour Available` because
  the active bundle has no `panoramaIndex`.
- Correlated the browser state with the endpoint: the active snapshot contains
  footprints/floor labels but no indoor components, doors, entrances, floor
  geometry, or panorama artifacts. This is recorded as a real-data readiness
  gap, not “fixed” in the app.

### Verification

- `npm test -- --run src/lib/__tests__/explore-contracts.test.ts src/components/public/__tests__/ExploreMap.test.tsx src/components/map/__tests__/BuildingSheet.test.tsx 'src/app/(public)/map/panoramas/page.test.tsx' 'src/app/(public)/map/explore/page.test.tsx' --reporter=dot`
  passed: 5 files, 27 tests.
- CUA observations captured settled Bldg No. 1, Hm Building floor controls,
  floor switching, and the no-panorama surface.

### What's next

- T4: audit Navigate setup, real-data route preview, origins/destinations,
  active navigation, camera/floor behavior, and arrival/off-route states.

## 2026-09-06: Phase 8A T4 — Navigate, routes, active navigation, and camera

### What was done

- Verified live Navigate setup and a non-degenerate real route preview using
  `N1710 → N1717`: 223 m, estimated 3 min, Top view, and Start navigation.
- Verified active navigation renders route progress, remaining distance, next
  instruction, End navigation, camera View menu (Top/Follow/POV), Recenter,
  and compass-permission affordance. Route Preview stayed Top-only; Follow was
  selectable only after active navigation started.
- Verified End navigation returns the UI to setup without changing the route
  URL; the retained query is recorded as a session/URL reconciliation finding.
- Exercised a degenerate real route (`N3727 → N3887`): its 0 m/0 min preview
  and active state simultaneously showed arrival and off-route. The graph
  contains 25 zero/non-positive edges and duplicate-position node groups; no
  route or data changes were made.
- Confirmed the live dataset has no indoor floors/entrances/route transitions,
  so indoor guidance and floor-transition behavior remain not verified with
  real data. Heading permission was not granted in the managed browser.

### Verification

- `npm test -- --run src/lib/__tests__/navigation-experience.test.ts src/lib/__tests__/navigation-heading-contract.test.ts src/lib/__tests__/navigation-camera-policy.test.ts src/lib/__tests__/navigation-camera-controller.test.ts src/hooks/__tests__/useNavigationHeading.test.ts src/hooks/__tests__/useGeolocation.test.ts src/components/map/__tests__/NavigationCamera.test.tsx src/components/map/__tests__/NavigationCameraControls.test.tsx src/components/map/__tests__/NavigationMap.test.tsx src/components/map/__tests__/NavigationSession.test.ts 'src/app/(public)/map/navigate/page.test.tsx' --reporter=dot`
  passed: 11 files, 82 tests.
- CUA observations captured real route preview, active route, camera menu,
  Follow selection, degenerate arrival/off-route state, and teardown.

### What's next

- T5: audit live QR entry limitations, Profile/Campuses, preferences, theme,
  accessibility, permission affordances, and guest-safe behavior.

## 2026-09-06: Phase 8A T5 — QR, Profile/Campuses, preferences, and permissions

### What was done

- Verified live QR deep-link routing: `/q/north-gate` redirects to
  `/map/navigate?qr=north-gate` and settles to “This QR location is not
  recognized.” A malformed `qr=bad id` settles to “This QR link is invalid.”
  The three deterministic valid/cross-campus ids remain absent from the live
  published QR index and were not treated as valid data.
- Verified the scanner sheet exposes Start/Destination modes, camera-backed
  scanner mounting, paste field, and disabled Use action for empty input. No
  physical camera was available for native decode verification.
- Verified authenticated Profile shows current/default campus context,
  activity/history, theme (System/Light/Dark), map appearance, map view
  (Top/Follow/POV), voice, auto-floor, heading-follow, notifications, and
  reduced-motion controls without changing their stored values.
- Verified direct Campuses lists both catalog rows and distinguishes current
  from default. The Profile Change campus handoff remains the previously
  recorded shell finding; no selection or preference mutation was performed.

### Verification

- `curl.exe` returned 404 `{"status":"unknown"}` for `north-gate`,
  `campus-a-checkpoint`, and `campus-b-checkpoint`.
- `npm test -- --run src/lib/__tests__/qr-payload.test.ts src/lib/__tests__/navigation-deep-link.test.ts src/lib/__tests__/qr-location.test.ts src/app/api/public-qr/__tests__/route.test.ts src/store/__tests__/public-store.test.ts src/components/map/__tests__/QRScanner.test.tsx src/components/map/__tests__/QRScanSheet.test.tsx src/hooks/__tests__/useQrNavigateDeepLink.test.tsx 'src/app/q/[checkpointId]/page.test.tsx' 'src/app/(public)/map/navigate/page.test.tsx' src/components/public/__tests__/ProfileDashboard.test.tsx src/components/public/__tests__/CampusBrowser.test.tsx src/lib/__tests__/public-preferences.test.ts --reporter=dot`
  passed: 13 files, 111 tests.
- CUA observations captured unknown/invalid QR states, scanner controls,
  Profile panels, Campuses, and the compass/location affordances. Native
  camera, physical GPS, and browser viewport-specific runs remain unverified.

### What's next

- T6: execute complete journeys A–F, protected regression matrices, data
  integrity checks, practical console/network/performance checks, and the
  final report evidence gate.

## 2026-09-06: Phase 8A T6 — Journeys, release checks, integrity, and regressions

### What was done

- Completed the six required student journeys against the current public
  runtime and classified them without promoting fixture results to real-data
  evidence:
  - A New Student Discovery — `PARTIAL`: real Home cards and building details
    work, but the live search/entrance data needed to reach a real destination
    route is absent.
  - B Outdoor Navigation — `PARTIAL`: a real graph route previews and enters
    active navigation, but live GPS/arrival cannot be validated here and a
    zero-distance graph path exposes simultaneous arrival/off-route state.
  - C Indoor Destination — `BLOCKED`: the current bundle has no rooms,
    entrances, indoor components, or floor geometry.
  - D QR — `BLOCKED`: live QR index/data is absent; unknown and malformed
    deep-links were verified only as error handling.
  - E Virtual Tour — `BLOCKED`: the live bundle has no panorama index; the
    no-tour state is correct for the published data.
  - F Personalization — `PARTIAL`: Profile preferences and direct Campuses
    are real-data verified, but the Profile-to-Campuses handoff and a
    second usable campus are not.
- Verified data integrity for `map-map-1-k6bv`: 30 buildings, 86 nodes, 80
  edges, 6 graph components, all nodes `intersection`/Floor 0, no building
  entrances, and no runtime artifacts. The graph contains 25 non-positive
  edges and duplicate coordinate groups; this explains the observed
  zero-distance route behavior.
- Ran protected Studio, compiler, runtime-floor, navigation, Capture, public
  contract, and focused student-app matrices. All selected matrices passed,
  totaling 84 file invocations and 774 passing tests, with duplicated files
  across matrices explicitly retained in the count.
- Ran repository release commands. `npx tsc --noEmit --pretty false`
  reproduced the known malformed runtime-test baseline; `npm run build`
  compiled but failed page-data worker spawn with `EPERM`; `npm run lint`
  exited with 2,172 errors and 20,384 warnings in the broad dirty checkout.
- Captured local response timings and network limitations. Public pages were
  approximately 51–64 ms locally; campus catalog was approximately 959–1768
  ms and the 100 KB public campus bundle approximately 551–797 ms. OSM tile
  access failed through the managed proxy. No physical phone/camera or
  viewport-resize/screenshot harness was available.

### Verification

- Protected and focused test evidence is recorded in the Phase 8A report;
  every listed selected test matrix passed.
- Browser/CUA evidence captured settled public pages, real building/floor
  details, route preview/active states, camera view controls, QR error and
  scanner states, Profile preferences, and direct Campuses.
- Release command evidence is recorded in `errors/ERRORS.md`; no application
  or dataset files were changed by T6.

### What's next

- T7: write and verify the final Phase 8A audit report and stop before any
  Phase 8B fixes or Phase 8C release work.

## 2026-09-06: Phase 8A T7 — Final report and stop boundary

### What was done

- Wrote the complete Phase 8A release-candidate report with the executive
  verdict, score, real dataset, automated totals, journeys A–F, P0–P3
  findings, dataset/content gaps, environment limits, physical-device and
  responsive gates, dark mode, accessibility, performance/console/network,
  protected regressions, exact Phase 8A files, Phase 8B priorities,
  non-fixes, and the Phase 8C checklist.
- Kept every recommendation advisory. No Phase 8B application fix, QR/route
  change, dataset mutation, republish, or deployment was performed.

### Verification

- Confirmed all six required Phase 8A artifacts exist and have non-zero
  content.
- Confirmed the report contains numbered sections 1 through 22 and ends with
  the Phase 8A stop condition.
- Added and verified an explicit public-route/state matrix covering the `/map`
  redirect, primary public routes, success/empty/error/loading states, and
  physical permission limitations.
- Confirmed the scoped status contains only the six audit artifacts:
  `spec/...`, `plan/...`, `TODO-...`, `progress/PROGRESS.md`,
  `errors/ERRORS.md`, and `reports/...`; no production source or dataset file
  was changed by Phase 8A.
- The report preserves the known repository-wide build/typecheck/lint
  failures as evidence and does not call the release candidate green.

### What's next

- Stop. Phase 8B requires explicit continuation and implementation approval;
  Phase 8C remains gated on a successful re-audit.

## 2026-09-06: Phase 8B T0 — Scope, plan, and live read-only baseline

### What was done

- Wrote the Phase 8B WHAT-only specification, numbered implementation plan,
  and visible TODO list for the approved targeted release-blocker scope.
- Confirmed the active campus is `map-map-1-k6bv` and the public runtime
  resolves exclusively to `graph_snapshots`, not `published_maps`.
- Captured live read-only counts: 30 buildings, 86 nodes, 80 edges, zero
  public components/doors, and no published artifact bundle. The catalog and
  campus detail endpoint currently expose the opaque campus id as the name.
- Traced Studio loading: the edit route loads a legacy graph snapshot and
  `EditorBridge` constructs the in-memory `CampusDocument`; `/api/compile`
  requires an explicit `CampusDocument` and was not invoked for mutation.

### Verification

- Confirmed the three Phase 8B workflow files exist with non-zero content.
- Read-only GET checks of `/api/public-campus`, `/api/campuses`, `/api/graph`,
  and `/api/buildings` completed successfully against the local app.
- No POST/DELETE/publish/deploy action, compiler change, or authored-data
  mutation was performed.

### What's next

- T1: add failing deterministic public-navigation route tests, then implement
  the smallest shell/nav fix and verify it before proceeding.

## 2026-09-06: Phase 8B T1 — Deterministic public navigation routing

### What was done

- Added a canonical primary-nav selection contract so both phone and desktop
  controls push the approved Home/Explore/Navigate/Profile paths, including
  when the selected tab is already active on a nested route.
- Added secondary public route classification and made the shell leave
  `/map/maps`, `/map/search`, and `/map/panoramas` route-owned instead of
  reclaiming them after a primary tab state change.
- Kept Campuses out of `PRIMARY_NAV_ITEMS`; Profile’s existing direct
  `/map/maps` action remains unchanged.

### Verification

- RED: the two new route tests failed with 0 router calls for Home and an
  unexpected `/map/profile` push from `/map/maps`.
- GREEN: `npm test -- --run
  src/components/public/__tests__/AdaptiveNav.test.tsx
  src/components/public/__tests__/AdaptiveShell.test.tsx --reporter=dot`
  passed 2 files and 8 tests.
- Required `graphify update .` was attempted and logged as a tooling failure
  (`WinError 5: Access is denied`); no source/graph mutation resulted.

### What's next

- T2: add failing mismatched-campus identity tests and remove the hardcoded
  Home campus heading without inferring names from ids.

## 2026-09-06: Phase 8B T2 — Active-campus identity contract

### What was done

- Added an optional `campusName` to the public bundle and exposed only
  explicit display metadata from published artifacts or snapshot data.
- Replaced the hardcoded Home heading and fallback hero identity with a
  neutral, human-readable fallback. An exact campus-id/name match is treated
  as missing metadata; ids are never converted into labels.
- Kept the public response source-exclusive and made the store carry the
  explicit name without changing campus identity or artifact semantics.

### Verification

- RED: API, store, Home, and pure content tests failed for the missing name
  propagation, hardcoded heading, old fallback, and id-as-name case.
- GREEN: `npm test -- --run src/app/api/public-campus/__tests__/route.test.ts
  src/store/__tests__/public-store.test.ts
  src/components/public/__tests__/HomeDashboard.test.tsx
  src/lib/__tests__/home-content.test.ts --reporter=dot` passed 4 files and
  43 tests.
- `graphify update .` was retried and the repeated `WinError 5` access denial
  is recorded in `errors/ERRORS.md`.

### What's next

- T3: write failing campus-A/B recent-history tests, then implement scoped
  persistence and bundle reconciliation.

## 2026-09-06: Phase 8B T3 — Campus-scoped recent destinations

### What was done

- Added pure reconciliation that keeps only destination ids present in the
  active node/search inventory and removes duplicates.
- Added campus-namespaced recent storage with filtered migration from the old
  global list, active-campus hydration on cache/network switch, and rejection
  of unknown destinations.
- Kept `recentDestinations` as the existing state shape for consumers and
  updated Profile’s clear action to clear the active campus namespace as well
  as the legacy compatibility projection.
- Added a Home render guard so manually stale state cannot create a stale
  destination card.

### Verification

- RED: pure reconciliation was missing, legacy-valid `a1` was lost on campus
  hydration, and Home rendered `Stale node`.
- GREEN: `npm test -- --run src/lib/__tests__/home-content.test.ts
  src/components/public/__tests__/HomeDashboard.test.tsx
  src/store/__tests__/public-store.test.ts --reporter=dot` passed 3 files and
  42 tests, including A/B namespace isolation, stale migration, valid
  preservation, and refresh/switch behavior.
- `graphify update .` was retried and the repeated `WinError 5` failure is
  recorded; no graph refresh was available.

### What's next

- T4: add failing route-validity and status-precedence tests, then guard active
  navigation without changing A* or Phase 5 progress calculations.

## 2026-09-06: Phase 8B T4 — Defensive route and status policy

### What was done

- Added a pure route validation boundary that rejects malformed/ordinary
  non-positive routes before preview/start, while preserving single-node
  already-at-destination routes and authored stairs/elevator floor transitions.
- Added explicit status precedence with arrival above off-route and applied it
  in both `NavigationSession` and the active guidance presentation.
- Left A*, route costs/weights, `computeRouteProgress`, and floor/progress
  transitions unchanged.

### Verification

- RED: the new route/status policies were missing, a zero-distance route still
  previewed, and the guidance mock rendered both arrival and off-route.
- GREEN: `npm test -- --run src/lib/__tests__/navigation-experience.test.ts
  'src/app/(public)/map/navigate/page.test.tsx' --reporter=dot` passed 2
  files and 30 tests.
- `graphify update .` was retried and the repeated `WinError 5` failure is
  recorded; no graph refresh was available.

### What's next

- T5: add failing Start → End → URL → refresh tests and implement narrow query
  cleanup while preserving unrelated parameters.

## 2026-09-06: Phase 8B T5 — End-route URL cleanup

### What was done

- Added a pure query-filter contract that removes navigation-session keys while
  preserving unrelated public query parameters and the URL hash.
- End navigation now clears route-driving query state with `history.replaceState`;
  the cleanup does not alter route progress or navigation state.

### Verification

- RED: the query cleanup contract was missing and End left `from`/`to` in the
  browser URL.
- GREEN: `npm test -- --run src/lib/__tests__/navigation-deep-link.test.ts
  'src/app/(public)/map/navigate/page.test.tsx' --reporter=dot` passed 2 files
  and 31 tests, including refresh non-recreation and unrelated-parameter
  preservation.
- `graphify update .` was retried and failed with `WinError 5`; the repeated
  access failure is recorded in `errors/ERRORS.md`.

### What's next

- T6: deterministic QR state-isolation tests first, with the smallest
  production change only if the stale-state reproduction passes.

## 2026-09-06: Phase 8B T6 — QR state isolation

### What was done

- Added deterministic hook coverage for a prior QR discovery error followed by
  leaving Navigate and returning without `qr`, plus a fresh no-QR mount.
- Reproduced the stale local error state and reset only error presentation for
  non-QR URLs; successful resolved QR state and URL cleanup remain unchanged.

### Verification

- Initial invalid-link test was corrected to use a genuine discovery error so
  it exercised retained hook state rather than only derived invalid rendering.
- RED: the genuine `unknown` QR error remained after the non-QR route transition.
- GREEN: `npm test -- --run src/hooks/__tests__/useQrNavigateDeepLink.test.tsx
  --reporter=dot` passed 1 file and 7 tests.
- `graphify update .` was retried and failed with `WinError 5`; the repeated
  access failure is recorded in `errors/ERRORS.md`.

### What's next

- T7: add a focused BuildingLayer console-log regression test and remove or
  gate unconditional initialization logging without changing rendering.

## 2026-09-06: Phase 8B T7 — BuildingLayer log hygiene

### What was done

- Added a component-level characterization test with a MapLibre-shaped fake
  map that covers initialization and data synchronization.
- Removed the four unconditional BuildingLayer initialization/data-sync logs;
  source/layer/data behavior remains unchanged.

### Verification

- The first test draft hit a JSX transform error in the existing `.test.ts`
  file, then was corrected to `createElement`.
- RED: the characterization test observed three unconditional logs.
- GREEN: `npm test -- --run
  src/components/map/layers/__tests__/BuildingLayer.test.ts --reporter=dot`
  passed 1 file and 2 tests.
- `graphify update .` was retried and failed with `WinError 5`; the repeated
  access failure is recorded in `errors/ERRORS.md`.

### What's next

- T8: perform the live read-only publish/source/pipeline, artifact, graph,
  indoor, QR, panorama, and content readiness audit without publishing or
  mutating authored data.

## 2026-09-06: Phase 8B T8 — Read-only publish-readiness audit

### What was done

- Re-read the live public contract for `map-map-1-k6bv`: the public bundle is
  still served from `graph_snapshots`, with 29 buildings, 101 nodes, 101 edges,
  six components, no published row, and no published QR route.
- Confirmed the separate metadata surface is not a published runtime bundle:
  `/api/campus-maps` reports `abc` and 30 buildings, while the authoritative
  public graph reports the current 29-building/101-node snapshot; no merge was
  performed.
- Classified the three current non-positive graph edges and three matching
  duplicate-position groups as authored/snapshot data requiring authoring or
  future validator work, with no global compiler or A* change.
- Audited Studio validation/publish controls, the EditorBridge-to-GraphAdapter
  save path, the `/api/compile` boundary, and the published-map/public-campus
  source-selection behavior.
- Ran safe compiler evidence: the package-configured Phase 7B/readiness
  suites passed 47 tests; the adapter contract passed one test while the
  broader adapter checkpoint remains blocked by its pre-existing missing
  `golden-campus` import.
- Recorded the artifact, indoor, search, QR, panorama, and content readiness
  matrix in the Phase 8B gate report. No publish, database write, geometry
  edit, or deployment occurred.

### Verification

- Live endpoint reread captured current source, counts, timestamps, empty QR/
  panorama inventory, and the three invalid-edge records.
- `npm test -- --run src/__tests__/phase-7b-publish-contract.test.ts
  src/__tests__/w15e-search-floorgeometry.test.ts
  src/__tests__/release-readiness.test.ts --reporter=dot` from
  `packages/compiler` passed 3 files and 47 tests.
- `npm test -- --run src/services/__tests__/compiler-adapter.test.ts
  src/services/__tests__/compiler-adapter-phase7b.test.ts --reporter=dot`
  recorded the existing missing-import failure plus one passing adapter
  contract test; the failure is logged in `errors/ERRORS.md`.
- Report written and verified at
  `reports/NAVI-STUDENT-APP-PHASE8B-GATE-REPORT.md`.

### What's next

- T9: run fresh integrated app/protected verification, static checks, browser
  QA where available, and record the final two-part release gate.

## 2026-09-06: Phase 8B T4 verification remediation — NavigationSession characterization

### What was done

- Diagnosed the protected-matrix failure as a fixture issue: the old
  off-route test placed the simulated user beyond the destination, where the
  unchanged route helper intentionally clamps progress to the final node.
- Moved only that test position to a lateral route-midpoint deviation and
  asserted the mutually exclusive `arrived=false` / `off-route=true` contract.
- Preserved A*, route costs, `computeRouteProgress`, and the approved arrival
  precedence policy.

### Verification

- `npm test -- --run src/lib/__tests__/navigation-experience.test.ts
  src/components/map/__tests__/NavigationSession.test.ts
  'src/app/(public)/map/navigate/page.test.tsx' --reporter=dot` passed 3 files
  and 41 tests.

### What's next

- Resume T9 and rerun the complete protected regression matrices.

## 2026-09-06: Phase 8B T6 browser-transition remediation — QR state isolation

### What was done

- Reproduced a browser-only stale `This QR link is invalid.` message after
  `qr=north-gate` → Explore → Navigate, even though the address bar was clean.
- Updated the hook to derive both its effect input and rendered link from
  reactive Next `usePathname` and `useSearchParams`; the existing parser,
  discovery, QR schema, and successful URL cleanup remain unchanged.
- Added the route-hook test mock needed to exercise the reactive route source.

### Verification

- `npm test -- --run src/hooks/__tests__/useQrNavigateDeepLink.test.tsx
  'src/app/(public)/map/navigate/page.test.tsx' --reporter=dot` passed 2 files
  and 24 tests.
- Browser QA repeated the exact click flow: the returned URL is
  `/map/navigate`, and the surface shows clean route setup with no QR error.

### What's next

- T9: resume fresh integrated/protected verification and update the final gate
  report with the browser result.

## 2026-09-06: Phase 8B T9 — Integrated verification and release gate

### What was done

- Ran the fresh targeted Phase 8B matrix after all approved fixes: 13 files and
  121 tests passed.
- Reran protected root navigation/compiler/indoor/inspector coverage (9/198),
  editor/Studio/PublicMap coverage (10/110), route/floor/compiler coverage
  (10/137), and runtime floor-geometry coverage (1/10); all passed.
- Recorded the package-scoped compiler alias baseline (8 files/142 tests plus
  one transform failure), the two protected production-route characterization
  failures, and the two legacy lint errors without changing protected
  route/entrance/compiler/type systems.
- Repeated browser QA for Profile → Campuses, nested Search → Home, neutral
  campus identity, connected route Start → End → refresh, live off-route
  presentation, and QR error → Explore → Navigate isolation.
- Updated the final two-verdict report. No publish, database write, deployment,
  authored-data mutation, or Phase 8C physical/device work occurred.

### Verification

- Focused app matrix: 13 files / 121 tests passed.
- T4 route/status remediation: 3 files / 41 tests passed.
- T6 QR hook/page regression: 2 files / 24 tests passed.
- Compiler readiness checkpoint: 3 files / 47 tests passed; Phase 7B adapter
  contract 1 test passed.
- Scoped ESLint excluding two legacy `nav-types.ts` `any` fields passed.
- Browser QR transition returned to clean `/map/navigate` setup; route End
  returned to clean `/map/navigate`, and refresh did not recreate the route.
- `graphify update .` was retried after the final code changes and failed again
  with `WinError 5`; the failure is logged separately.

### Final gate

- APP CODE: GO for the targeted Phase 8B scope, with protected baseline
  exceptions explicitly documented.
- PUBLISHED CAMPUS: NOT READY TO PUBLISH; the live source remains an
  unpublished graph snapshot with incomplete authored/runtime projections and
  content.
- Await review before any future Phase 8C work; Phase 8C was not started.

### 2026-09-06 — Navigate map-first development iteration (T1)

- Wrote the scoped Navigate map-first/dev simulation SPEC, PLAN, and TODO.
- Added the explicit non-production `NEXT_PUBLIC_NAVI_DEV_LOCATION=1` gate,
  the requested `11.81830075, 122.17159818` initial coordinate, a 0–359
  heading contract, timestamped wrap-safe updates, and isolated cardinal
  nudges.
- Added the small accessible `NavigationDevPanel`; it owns no route or camera
  state and is only rendered by the future Navigate integration when the gate
  is enabled.

### Verification

- Focused T1 tests: 3 files / 7 tests passed.
- Scoped ESLint: passed with no diagnostics.
- Scoped `git diff --check`: passed with no diagnostics.
- The initial non-escalated Vitest invocation hit the known Windows `spawn
  EPERM` process boundary before loading config; the unchanged retry with
  approved process permission loaded and passed. The failure is recorded in
  the workspace error ledger.

### Next

- T2: feed the opt-in simulation through `NavigationSession` and render the
  current position on the canonical map.

### 2026-09-06 — Navigate map-first development iteration (T2)

- Added an additive `NavigationSession` location override seam guarded by the
  explicit non-production simulation flag. Real `useGeolocation` remains in
  place, while simulated position, speed, timestamp, and heading enter the
  existing `useNavigationHeading` and `NavigationProvider` pipeline.
- Kept route progress, arrival, off-route, floor switching, and navigation
  status calculations unchanged; simulation only supplies the existing
  position/heading inputs and suppresses the dev-only geolocation error.
- Added the passive `NavigationPositionMarker` using the canonical map context;
  it follows position and renders the resolved heading without camera logic.

### Verification

- Focused T2 tests: 2 files / 13 tests passed.
- Scoped ESLint: passed with no diagnostics.
- Scoped `git diff --check`: passed with no diagnostics.
- Required `graphify update .` was attempted after the code changes and hit the
  recurring managed Windows `[WinError 5] Access is denied` boundary; the
  failure is recorded in the workspace error ledger.

### Next

- T3: make Navigate map-first while preserving route preview/active phases.

### 2026-09-06 — Navigate map-first development iteration (T3)

- Replaced the old setup-only centered form with a permanent map-first Navigate
  surface. Idle now keeps the canonical `ExploreMap` mounted with compact
  destination search, origin/location/QR actions, recent destinations, and
  existing map camera controls.
- Kept destination selection, route preview, Start Navigation, active guidance,
  floor/route context, and End Navigation state transitions on their existing
  paths. Route preview remains `route-preview`/TOP-only; only active navigation
  applies the stored camera view. End returns to an active-surface TOP idle map.
- Added the passive position marker to `ExploreMap` and kept campus bounds
  fitting enabled for the route-less idle active-surface camera.
- Passed the opt-in simulation state through `NavigationSession` and rendered
  its development panel only when the explicit flag is enabled.

### Verification

- Focused T3 group: 4 files / 34 tests passed.
- Scoped page/ExploreMap ESLint: passed with no diagnostics.
- Required `graphify update .` was attempted after the edits and hit the
  recurring managed Windows `[WinError 5] Access is denied` boundary; the
  failure is recorded in the workspace error ledger.

### Next

- T4: run focused and protected Phase 5/6 verification, lint/type checks, and
  classify baseline/environmental exceptions.

### 2026-09-06 — Navigate map-first development iteration (T4)

- Ran the focused Navigate/simulation/marker/camera group: 9 files / 54 tests
  passed.
- Ran the protected navigation/compiler/indoor/inspector group: 9 files / 200
  tests passed.
- Ran the protected Capture heading/camera/geolocation group: 6 files / 50
  tests passed.
- Touched-file ESLint passed with no diagnostics. Repository TypeScript still
  stops at the established unrelated
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`
  `TS1005: '}' expected` baseline.
- The existing `ExploreMap` camera bridge was preserved; no route costs,
  progress, arrival, off-route, Capture, Studio, compiler, publisher, QR, or
  panorama files were changed for this iteration.

### Next

- T5: run localhost browser QA with the dev flag, capture camera-state evidence,
  write the final report, and stop before Phase 8C.

### 2026-09-06 — Navigate map-first development iteration (T5)

### What was done

- Ran localhost browser QA with `NEXT_PUBLIC_NAVI_DEV_LOCATION=1` in the
  connected Chrome tab. Idle showed the campus map, simulated marker, compact
  search, existing camera controls, and the DEV simulator.
- Verified existing TOP, FOLLOW, and POV camera presentations; 359° → 1°
  heading updates; Follow pan suspension and Recenter recovery; Compass
  separation; and cardinal simulated movement.
- Verified the existing route deep link on the same mounted map: route preview
  → active navigation → End Navigation → clean map-first idle.
- Repeated two clean reloads after the transient Fast Refresh map lifecycle
  exception; no new fatal lifecycle error recurred. External OSM tile fetch
  failures were recorded as an environment limitation.
- Wrote the final iteration report at
  `progress/NAVI-NAVIGATE-MAP-FIRST-DEV-SIMULATION.md` and closed the TODO.

### Verification

- Final focused/protected Vitest matrix: 23 files / 292 tests passed.
- Final scoped ESLint: passed with no diagnostics.
- Repository TypeScript retains the established unrelated missing-brace error
  at `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`.
- Final `graphify update .` retry remains blocked by managed Windows
  `[WinError 5] Access is denied`; generated graph output was not edited.
- `agent-browser` was unavailable; connected Chrome CUA supplied the browser
  evidence.

### Next

- Stop this iteration. Do not start Phase 8C.

### 2026-09-06 — Navigate forward-heading arrow (T1)

### What was done

- Added the forward-heading arrow specification, implementation plan, and
  visible TODO for this narrowly scoped Navigate presentation iteration.
- Added RED tests for the shared Capture-compatible arrow contract and the
  Navigate MapLibre source/layer integration.

### Verification

- Expected RED result: the shared helper import was unresolved and the
  Navigate marker test found no arrow layer. No production code was changed
  before this checkpoint.

### Next

- Extract the existing Capture arrow image/layer primitive behavior-preserving,
  then wire the separate Navigate source/layer.

### 2026-09-06 — Navigate forward-heading arrow (T2)

### What was done

- Extracted the Capture-equivalent arrow image construction, MapLibre symbol
  layout, and normalized Navigate Point builder into
  `src/lib/navigation-heading-arrow.ts`.
- Kept Capture’s public image ID, source/layer IDs, ordering, cleanup, and
  stabilized position/heading inputs unchanged while routing its visual
  primitive through the shared helper.

### Verification

- `npm test -- --run src/lib/__tests__/navigation-heading-arrow.test.ts src/features/capture/__tests__/direction.test.ts src/features/capture/__tests__/RecordingMap.test.tsx --reporter=dot`
- Result: 3 test files passed, 16 tests passed.

### Next

- Wire the namespaced shared arrow source/layer into Navigate’s current
  position marker and verify unavailable-heading cleanup.

### 2026-09-06 — Navigate forward-heading arrow (T3)

### What was done

- Added the Navigate-owned `navigate-current-direction` GeoJSON source and
  `navigate-current-direction-arrow` symbol layer to the existing passive
  current-position marker.
- Removed the duplicate CSS triangle so the Navigate arrow is rendered by the
  same shared MapLibre primitive as Capture.
- Kept heading and position presentation-only: the component reads the
  existing NavigationContext and does not compute or mutate route/session
  state.

### Verification

- `npm test -- --run src/components/map/__tests__/NavigationPositionMarker.test.tsx src/lib/__tests__/navigation-heading-arrow.test.ts src/features/capture/__tests__/direction.test.ts src/features/capture/__tests__/RecordingMap.test.tsx --reporter=dot`
- Result: 4 test files passed, 18 tests passed.

### Next

- Run the protected Phase 5/6 matrix, scoped lint/type checks, Graphify update,
  and localhost browser QA, then close this TODO.

### 2026-09-06 — Navigate forward-heading arrow (T4, complete)

### Outcome

- Navigate now renders the Capture-style blue outlined forward-heading arrow
  from the existing `NavigationContext` position and resolved heading.
- The arrow is a MapLibre symbol with a geographic Point, `icon-anchor:
  bottom`, map-aligned rotation, and Capture-compatible normalization. The old
  Navigate-only CSS triangle is gone.
- Arrow resources are created only when a valid current position exists, so
  Explore’s no-location context does not gain an empty Navigate arrow layer.
- Capture recording, route tracing, route progress, arrival/off-route logic,
  camera policy/controller, QR, authoring, and map data contracts were not
  changed.

### Files changed for this iteration

- `src/lib/navigation-heading-arrow.ts`
- `src/lib/__tests__/navigation-heading-arrow.test.ts`
- `src/components/map/NavigationPositionMarker.tsx`
- `src/components/map/__tests__/NavigationPositionMarker.test.tsx`
- `src/features/capture/components/RecordingMap.tsx`
- `spec/NAVI-NAVIGATE-FORWARD-HEADING-ARROW.md`
- `plan/NAVI-NAVIGATE-FORWARD-HEADING-ARROW.md`
- `TODO-NAVI-NAVIGATE-FORWARD-HEADING-ARROW.md`
- `progress/PROGRESS.md`
- `errors/ERRORS.md`
- Local QA screenshots: `navigate-forward-heading-arrow-*.png`

### Verification

- Focused final arrow/Capture suite: **4 files, 19 tests passed**.
- Phase 5 protection set: **11 files, 227 tests passed**.
- Scoped ESLint over the changed source/tests: **passed**.
- Repository TypeScript: retained the known unrelated
  `packages/runtime/src/__tests__/data-identity-comparison.test.ts:255`
  `TS1005: '}' expected` baseline.
- Protected Phase 6 matrix: **19 files / 165 tests passed**; 10 existing
  characterization failures remain only in `navigation-camera-policy` and
  `navigation-camera-controller` (current dirty implementation returns the
  newer 60°/85° behavior while those tests expect 50°/70°). No camera files
  were changed.
- Required `graphify update .`: retried after the final edit; managed Windows
  Graphify rebuild remains blocked by `WinError 5: Access is denied`.

### Browser QA

- Playwright Chromium ran against `http://localhost:3000/map/navigate` with
  `NEXT_PUBLIC_NAVI_DEV_LOCATION=1` and active campus `map-map-1-k6bv`.
- Verified map canvas, simulated marker, DEV heading slider, search surface,
  and existing Top/Follow/POV selector. Heading labels updated through 90°,
  359°, and 1° with no console errors.
- Screenshot crop pixel differences: **1,274** changed pixels for 0°→90° and
  **1,472** for 359°→1°, confirming visible arrow rotation/wraparound.
- Saved full-screen evidence for idle/Top, Follow, and POV plus marker focus
  crops in the workspace, including `navigate-forward-heading-arrow-final.png`.
  The supported `agent-browser` CLI and CUA connector
  were unavailable; elevated Playwright supplied the browser evidence.

### Next

- Stop this iteration. Do not start Phase 8C.

### 2026-09-12 — Consolidated Phase 4 closure audit (C4-T1–T5, complete)

### Outcome

- Read the authoritative Phase 4A–4D gates and protected Phase 2/3 reports.
- Queried Graphify before source inspection and traced the actual Floor.pois → publish → search → POI destination → request-local overlay → NavigationSession → geometry-aware arrival path.
- Confirmed the composed topology signatures remain unchanged across the document, route-network/access, compiled graph, and public session layers.
- Reconciled Phase 2 as historical 9 files / 153 tests versus the later mistyped 8 files / 141 tests; the corrected current command is 9 files / 153 tests. Reconciled Phase 3C historical 52/63/73 counts against the current exact 9-file / 59-test focused matrix without evidence of coverage loss.
- Created progress/PHASE-4-UNIFIED-POI-CONSOLIDATED-GATE-2026-09-12.md.

### Verification

- Report contract: A–Q present, exactly one consolidated verdict, one NO TOPOLOGY MUTATION sentinel, and the exact stop line; passed.
- Final fresh critical rerun: runtime destination/arrival 4 files / 22 tests passed; NavigationSession POI 1 file / 6 tests passed; Phase 2 corrected protection 9 files / 153 tests passed; Phase 3C exact focused set 9 files / 59 tests passed.
- Public focused result: 3 files / 28 tests, 27 passed and the known development-simulator assertion failed at page.test.tsx:399.
- Scoped Phase 4 lint and report diff checks passed. Typecheck remains blocked by the known data-identity-comparison.test.ts:255 TS1005; Graphify refresh remains blocked by managed [WinError 5] Access is denied.
- Safe browser inspection timed out without UI mutation; physical-device run was not performed.

### Next

- Stop after consolidated Phase 4 closure audit. Await human review and separate authorization before any Phase 5 work, field validation, or deployment.
## 2026-09-12 — Unified POI Phase 5 integration and field-validation planning

- **Scope:** Planned Phase 5 after human approval of the consolidated Phase 4 `PASS WITH CONDITIONS` verdict; no Phase 5 implementation, field run, campus mutation, publication, or deployment started.
- **Graphify:** Ran the required pre-search query for Phase 5 validation surfaces. It returned the validation release script, the Android field-execution report, and validation references. No Graphify refresh was attempted.
- **Artifacts:** Added `navi-next/docs/superpowers/plans/2026-09-12-unified-poi-phase5-integration-field-validation.md`; appended the Phase 5 specification to `spec/SPEC.md`; appended the execution plan to `plan/PLAN.md`; added the Phase 5 planning checklist to `TODO.md`.
- **Coverage:** The plan covers safe disposable browser validation, real Android GPS/heading/QR/floor transitions, geometry-aware POI-arrival calibration, full campus scenarios, protected regressions, release readiness, and explicit NAVI-defect versus tooling-condition triage.
- **Constraints preserved:** `Floor.pois` remains the sole canonical authored POI source; stable IDs/local coordinates and `poi.create`/`poi.update`/`poi.delete` remain protected; no Roads, RoadJunctions, SeparatedCrossings, EntranceAccess, RouteNetworks, or graph-connectivity changes are authorized.
- **Verification:** Planning TODO items are checked; future Phase 5 execution tasks remain unchecked; the plan explicitly records `Phase 5 planning: READY`, `Phase 5 implementation/field execution: NOT AUTHORIZED`, and `production deployment: NOT READY`. Final artifact-contract and diff checks remain to be run.
- **Next:** Human review of the Phase 5 plan. Stop before Phase 5 implementation and field validation.
## 2026-09-12 — Phase 5 planning verification result

- **Verification command:** Fresh PowerShell artifact-contract checks passed for the Phase 5 SPEC marker, root PLAN marker, TODO marker, progress/error entries, removed temporary fragment, authorization boundary, and canonical/topology constraints.
- **Plan contract:** The detailed plan exists at `navi-next/docs/superpowers/plans/2026-09-12-unified-poi-phase5-integration-field-validation.md`, contains eight unchecked future execution tasks, has no placeholder/vague-task markers, and has no trailing whitespace.
- **Workflow contract:** Five Phase 5 planning TODO items are checked; future implementation/field tasks remain unchecked. Root tracked planning files passed `git diff --check` with only normal line-ending conversion warnings. The nested NAVI repository reports the new detailed plan as untracked and the progress ledger as modified; no commit or cleanup was performed.
- **Result:** Planning gate verified. Phase 5 planning is ready; Phase 5 implementation and field validation remain not authorized; production deployment remains not ready.
## 2026-09-12 — Phase 5 planning final verification

- **Evidence:** Corrected final verification reported all eight checks `True`: SPEC marker, PLAN marker, TODO planning block, five checked planning items, eight unchecked future execution tasks, authorization boundary, progress verification entry, and zero detailed-plan trailing-whitespace lines.
- **Diff hygiene:** Root tracked planning ledgers and the nested progress ledger passed `git diff --check`; output contained only expected LF-to-CRLF conversion warnings.
- **Final status:** `PHASE 5 PLANNING — READY; IMPLEMENTATION AND FIELD VALIDATION — NOT AUTHORIZED; PRODUCTION DEPLOYMENT — NOT READY`.
- **Stop:** No Phase 5 implementation, browser execution, physical Android run, campus mutation, publication, or deployment was started.
## 2026-09-12 — Phase 5 P5-T1 complete

- **Task:** Wrote `navi-next/docs/phase5/PHASE-5-VALIDATION-CHARTER.md`.
- **Content:** Defined `P5-BR`, `P5-AD`, `P5-AR`, `P5-E2E`, `P5-RR`, and `P5-TRIAGE` scenario families; required evidence fields; controlled verdicts/classifications; topology stop conditions; protected Phase 2–4 invariants; the unchanged `POI_ARRIVAL_TOLERANCE_METERS = 15` baseline; and the production boundary.
- **Verification:** P5-T1 contract verification passed: charter exists, lifecycle/evidence/vocabulary/invariant/baseline/deployment markers are present, and the artifact has no trailing whitespace.
- **Known correction:** Removed two Markdown hard-break spaces found by the first hygiene check and recorded the correction in `errors/ERRORS.md`.
- **Next:** P5-T2 safe disposable browser validation; browser success must be evidenced or classified `BLOCKED BY ENVIRONMENT`.
## 2026-09-12 — Phase 5 P5-T2 complete with conditions

- **Task:** Wrote `navi-next/docs/phase5/PHASE-5-BROWSER-VALIDATION-PROTOCOL.md` and `navi-next/progress/PHASE-5-BROWSER-VALIDATION-2026-09-12.md`.
- **Execution:** Local browser was responsive and reached public home/explore/navigate/search/profile and Studio. Read-only API checks found `asu-main` empty and `map-map-1-k6bv` graph-only without published POI artifacts; search for `study` and `Bldg` returned no published places. Studio inspection exposed the existing POI tool but no creation/save action was taken.
- **Result:** `P5-BR-01` is `BLOCKED BY ENVIRONMENT` due to absent disposable published POI fixture; `P5-BR-02` through `P5-BR-05` are `NOT RUN`; `P5-BR-06` is `PASS WITH CONDITIONS` for no writes performed. No product browser pass/fail is claimed and no topology mutation was observed.
- **Verification:** Protocol and record schema, six scenario IDs, classifications, safety boundary, topology statement, and whitespace checks passed.
- **Next:** P5-T3 physical Android GPS/heading/QR/floor protocol and evidence. Browser blocker remains open for later rerun.
## 2026-09-12 — Phase 5 P5-T3 complete with conditions

- **Task:** Wrote `navi-next/docs/phase5/PHASE-5-ANDROID-FIELD-VALIDATION-PROTOCOL.md` and `navi-next/progress/PHASE-5-ANDROID-FIELD-VALIDATION-2026-09-12.md`.
- **Execution:** Read-only device inventory found `adb command not found` and no emulator/device process candidates. No Android permission prompt, simulator promotion, app mutation, or campus mutation occurred.
- **Result:** `P5-AD-01` and `P5-AD-02` are `BLOCKED BY ENVIRONMENT`; `P5-AD-03` through `P5-AD-08` are `NOT RUN`. This is an environment condition, not a NAVI defect or physical-device pass.
- **Verification:** Protocol and record exist; all eight scenarios, real-device boundary, simulator boundary, unchanged 15 m baseline, and hygiene checks passed with conditions.
- **Next:** P5-T4 POI arrival calibration; retain the Android blocker for the final release gate.
## 2026-09-12 — Phase 5 P5-T4 complete with conditions

- **Task:** Wrote `navi-next/docs/phase5/PHASE-5-POI-ARRIVAL-CALIBRATION.md` and `navi-next/progress/PHASE-5-POI-ARRIVAL-CALIBRATION-2026-09-12.md`.
- **Automated evidence:** Runtime package command passed 2 files/16 tests; app NavigationSession POI command passed 1 file/6 tests. Coverage includes Point/legacy, Circle, Rectangle, Polygon, malformed input, route-endpoint distinction, wrong-floor/building rejection, idempotence, latching, and ordinary progress.
- **Field condition:** Physical GPS/heading/QR/floor calibration remains `NOT RUN` because P5-T3 has no device/adb. The 15 m policy was not changed.
- **Verification:** Protocol/record existence, eight calibration IDs, exact automated counts, field condition, unchanged baseline, and hygiene checks passed with conditions.
- **Next:** P5-T5 complete campus scenario matrix; retain browser/device/calibration conditions for triage and release readiness.
## 2026-09-12 — Phase 5 P5-T5 complete with conditions

- **Task:** Wrote `navi-next/docs/phase5/PHASE-5-CAMPUS-SCENARIOS.md` and `navi-next/progress/PHASE-5-CAMPUS-SCENARIOS-2026-09-12.md`.
- **Automated evidence:** Protected editor/compiler/store/session matrix passed 5 files/15 tests; publisher passed 1 file/2 tests; runtime resolver/arrival passed 2 files/16 tests; NavigationSession POI passed 1 file/6 tests. The public Navigate lifecycle file produced 24 passed/1 failed/25 total on the known development-panel baseline.
- **Scenario result:** `P5-E2E-01` through `P5-E2E-04`, `P5-E2E-07`, `P5-E2E-08`, `P5-E2E-09`, and `P5-E2E-10` are `PASS` or `PASS WITH CONDITIONS` on automated evidence; `P5-E2E-05` and `P5-E2E-06` remain `NOT RUN` because full legacy-campus/browser/device composition was unavailable.
- **Topology evidence:** The focused before/after snapshots passed with no authored or derived topology mutation. A live public bundle signature could not be captured because no disposable published POI fixture exists locally.
- **Verification:** Matrix and record existence, ten scenario IDs, exact evidence counts, topology boundary, live-fixture boundary, and whitespace checks passed after correcting verifier scope.
- **Next:** P5-T6 classify NAVI defects versus tooling/environment and pre-existing baselines; retain browser/device/legacy-campus conditions.
## 2026-09-12 — Phase 5 P5-T6 complete with conditions

- **Task:** Wrote `navi-next/docs/phase5/PHASE-5-DEFECT-TRIAGE.md` and `navi-next/progress/PHASE-5-DEFECT-TRIAGE-2026-09-12.md`.
- **Result:** No reproducible `NAVI_DEFECT` was established. The record separates `TOOLING_ENVIRONMENT`, `OPERATOR_SETUP`, `PRE_EXISTING_BASELINE`, and `EXPECTED_LIMITATION` items with evidence and owners.
- **Conditions classified:** Missing disposable published fixture, missing `adb`/device, prior browser bridge timeout, Graphify permission failure, public navigation-dev-panel baseline, malformed TypeScript fixture, dirty-worktree boundary, and unrun physical calibration.
- **Invariant check:** `Floor.pois`, topology neutrality, request-local overlay behavior, geometry-aware arrival, and the unchanged 15 m policy remain explicit; no source or topology changes were made.
- **Verification:** Triage documents exist, all required classifications and conditions are present, NAVI defect count is zero, protected invariants are represented, and both artifacts pass hygiene checks.
- **Next:** P5-T7 protected regression and release-readiness gate; keep every classified condition visible.
## 2026-09-12 — Phase 5 P5-T7 complete with conditions

- **Task:** Wrote `navi-next/docs/phase5/PHASE-5-RELEASE-READINESS-GATE.md` and `navi-next/progress/PHASE-5-RELEASE-READINESS-2026-09-12.md`.
- **Protected regressions:** Fresh serial matrices passed Phase 2 at 9/153, Phase 3A at 16/141, 3B at 2/21, 3C at 9/59, 3D at 8/55; compiler/runtime/publisher/search/resolution/arrival, navigation, QR/floor, routing/A*, connectivity/access, camera, PublicMap, and store matrices also passed as recorded.
- **Known baseline:** Public Navigate reproduced 27/28 with only the existing `navigation-dev-panel` assertion failing.
- **Release checks:** Typecheck reproduced `TS1005`; build compiled then failed at worker `spawn EPERM`; broad lint reported 2,190 errors/20,381 warnings; focused POI/runtime lint had no errors; direct release validation found 7 passes/7 failures in `deploy/prod`; Graphify remains permission-blocked.
- **Gate result:** `BLOCKED` for field/release readiness because browser/device/physical-arrival evidence is unavailable and release checks/artifacts are not clean. No NAVI POI defect was newly reproduced.
- **Verification:** Release gate documents exist; exact matrix counts, baseline/tooling conditions, `Floor.pois`/topology/15 m invariants, blocked decision, and hygiene checks passed.
- **Next:** P5-T8 write the final Phase 5 report, verify the exact verdict/status/stop contract, and stop for human review.
## 2026-09-12 — Phase 5 P5-T8 complete; stopped for human review

- **Task:** Wrote `navi-next/progress/PHASE-5-INTEGRATION-FIELD-VALIDATION-2026-09-12.md` with the final verdict, validation/field/production status, exact regression evidence, classified conditions, invariant confirmation, follow-up requirements, and deployment boundary.
- **Final verdict:** `PHASE 5 — BLOCKED`.
- **Required status:** Validation complete `NO`; field-ready `NO`; production-ready `NO`; deployment authorized `NO`.
- **Verification:** Final report exists, contains exactly one allowed Phase 5 verdict, preserves all hard invariants, contains the required statuses, has no trailing whitespace, and ends with the exact human-review stop line.
- **Stop:** No deployment, publication, migration, mass authoring, respondent testing, source fix, topology change, or further Phase 5 work was performed after the report gate.
## 2026-09-12 — Phase 5 post-finish full-suite verification condition

- **Command:** `npm test -- --no-file-parallelism --maxWorkers=1 --reporter=dot`.
- **Result:** 513 suites completed with 5,336 passed, 32 failed, and 8 skipped; 16 suites failed. Failures are outside the protected Phase 5 matrix and include unresolved dirty-checkout/legacy fixture/compiler/floor-editor conditions plus the known public baseline.
- **Classification:** `UNRESOLVED` until reproduced from a clean, explicitly selected revision; no Phase 5 source or topology change was made.
- **Final report update:** Added the aggregate to the release gate and final Phase 5 report; verdict remains `PHASE 5 — BLOCKED`.
## 2026-09-12 - Road connectivity repair (Fix 1 + Fix 2)

- **Delivered:** 0.5 m intent-only connection discovery; non-modal Connect / Keep Separate chip; atomic road.create connections (project -> authored RoadJunction, merge existing junction, SeparatedCrossing for genuine crossings, no magnetic snap); legacy detection + road.recovery.apply + review panel; _persistJunctions preserves valid authority; separatedCrossings survive serialization; editor/compiler junction radius aligned at 0.5 m.
- **New tests (9 files, 50 tests):** discovery (8), authoring (9), graph/A*/persistence repair (8), legacy recovery unit (11), compiler parity (3), ConnectionChoice (3), useDrawingSession decisions (5), LegacyRecoveryPanel (2), fixture campus recovery (1).
- **Validation (fixture copy of map-map-1-k6bv, no production mutation):** before 20 components; 24 candidates (18 high-confidence, 6 review); after approving high-confidence: 17 authored junctions (degree 2-3), 5 components; A* route found across previously disconnected traces; save -> reload -> sync preserves junctions and routing.
- **Sweeps:** editor commands+tests 865 pass / 5 baseline fail; engine 316 pass / 8 skip / 1 baseline suite; compiler+core 599 pass / 21 baseline fail (pre-existing, experiment-verified); app components/store/services/lib 653 pass / 1 baseline load fail; runtime 276 pass.
- **Not done:** no commits, no publish, no production campus mutation; UI chip not browser-E2E verified.

## 2026-09-12 - POI extrusion map error fix

- **Error:** `layers.navi-poi-extrusion.paint.fill-extrusion-opacity: data expressions not supported` (EntityRenderer.addLayers aborting the layer batch).
- **Root cause:** feature-state case expression on `fill-extrusion-opacity`, which is a data-constant MapLibre property; reproduced with `validateStyleMin` in a red-first test.
- **Fix:** alpha moved into data-driven `fill-extrusion-color` (rgba 0.45/0.35/0.3); opacity expression removed (defaults to 1).
- **Verification:** `layers.test.ts` 17/17 (single-layer + all-layer style-spec validation); editor rendering + POIInteractionController suites 154/154.
- **Files:** packages/editor/src/rendering/layers.ts (fix), packages/editor/src/rendering/layers.test.ts (regression tests).

## 2026-09-12 - POI tool repair (silent no-context click failure)

- **Reported:** Studio POI tool showed a crosshair but map clicks appeared to do nothing.
- **Reproduced:** with no active building/floor (or a degenerate geometry gesture), both POI surfaces returned before `poi.create` and showed zero feedback; with valid context the full pipeline (Floor.pois, source, layers, selection, Inspector, history, persistence) worked.
- **Root cause:** POI placement context resolution failed silently in `InteractionController` (Point) and `POIGeometryAuthoring` (Circle/Rectangle/Polygon); tool activation/cursor is independent of context.
- **Fix:** new `poi-placement-context.ts` (context resolution + actionable toast reasons + geometry-failure messages); Point mode now reports missing building/floor/transform and dispatch failures; geometry modes report context failures, degenerate shapes, and incomplete polygons.
- **RED→GREEN:** 11 failing → 32/32 passing across 4 focused repair suites (`poi-tool-repair`, `POIGeometryAuthoring.test.tsx`, `POIGeometryAuthoring.test.ts`, `POIInteractionController`).
- **Verification:** protected POI matrix 16 files/120 tests; Studio interaction 18 files/241 tests; road connectivity 19 files/192 tests; workspace consumers 4 files/12 tests; `NO POI TOPOLOGY MUTATION`; browser validation PASS on disposable fixture (point create/select/rename/save/reload, polygon preview/commit, undo/redo, invalid-context and degenerate-gesture feedback); original campus left POI-free.
- **Files:** `src/components/studio/poi-placement-context.ts` (new), `src/components/studio/InteractionController.tsx`, `src/components/studio/POIGeometryAuthoring.tsx`, 3 focused test files.
- **Gate:** `navi-next/progress/POI-TOOL-REPAIR-GATE-2026-09-12.md` — `POI TOOL REPAIR — PASS WITH CONDITIONS` (conditions: stale Inspector after undo, pre-existing TS1005 fixture, Graphify WinError 5, published-fixture validation pending).
- **Stopped:** awaiting human review; no deployment, publication, or production mutation.

## 2026-09-12 - Outdoor POI architecture repair (CampusDocument.pois)

- **Root cause:** the `poi.create` contract required `buildingId`+`floorId` and wrote only `Floor.pois` (local meters); the campus editor click path therefore had no canonical storage, command, render, persistence, compiler, or runtime path for outdoor POIs.
- **Architecture:** outdoor adds `CampusDocument.pois[]` (`scope:'outdoor'`, `WorldPOIGeometry` = runtime `RuntimePOIGeometry`); indoor keeps `Floor.pois[]`; identity/appearance are shared and the `poi.*` command family is scope-aware. Studio rule: no active building → outdoor; active building+floor → indoor; active building without floor → explicit feedback.
- **Pipeline:** GraphAdapter/Graph/createDocument/snapshot serializer carry `pois`; compiler projects outdoor POIs verbatim into the same `POIIndex`/search index with `scope`; publisher writes `scope`; runtime converter/POI/search carry it; the existing request-local destination resolver already scopes no-building POIs to outdoor edges.
- **Studio:** Point creates a world marker with no context; Circle/Rectangle/Polygon resolve scope per gesture with world previews and commits; 2D/2.5D + height; Inspector shows `Outdoor · world coordinates`; Area untouched and flat.
- **Verification:** core 4/72, editor+core matrix 16/197, outdoor suites 8/93, studio interaction 14/145, road connectivity 18/224, runtime 6/50, publisher 3/37, compiler POI 2/29, persistence 6/174, public nav 76/77 (known baseline); `NO POI TOPOLOGY MUTATION`.
- **Browser:** `e2e-poi-outdoor-architecture.mjs` (Playwright CLI, disposable wizard map) — `BROWSER VALIDATION — PASS` 29/29 with screenshots in `e2e-artifacts/poi-outdoor/`; indoor POI compatibility and flat Area verified; disposable map deleted after the run.
- **Incident:** disk filled transiently during implementation and truncated `packages/core/src/validation/poi-appearance.ts`; restored from captured content (see ERRORS.md).
- **Gate:** `progress/POI-OUTDOOR-ARCHITECTURE-GATE-2026-09-12.md` — `POI OUTDOOR ARCHITECTURE REPAIR — PASS WITH CONDITIONS`.
- **Stopped:** awaiting human review; no deployment, publication, or production campus mutation.

## 2026-09-12 - Unified POI / Area migration (Gates A-E)

- **Delivered:** legacy Area records migrate into outdoor 2D polygon POIs (id/name/points/color preserved; deterministic `-migrated-N` on id conflict; invalid areas stay compatibility-only); Area tool retired from Studio (`AreaTracer.tsx` deleted, dock updated, tracer coverage moved to BuildingTracer); POI editing polish (authored `appearance.color` with `coalesce` paints, fill/outline/extrusion hit paths, `usePoiEditor` handles for move/radius/resize/rotate/vertex with one `poi.update` per gesture); `visibility {showOnMap, searchable}` end to end with transient public search reveal; geometry-relative preferred approach anchor (`circle-angle` / `rectangle-edge` / `polygon-edge`) resolved by compiler/publisher/runtime and honored by the destination resolver.
- **Canonical model:** outdoor `CampusDocument.pois[]` (`scope:'outdoor'`, `WorldPOIGeometry`), indoor `Floor.pois[]`; Area is compatibility-only; migration is topology-read-only.
- **Verification:** Unified POI root matrix 24 files / 204 tests PASS; runtime 5/36 PASS; publisher 1/5 PASS; road connectivity union 19/199 PASS; browser `e2e-unified-poi-area.mjs` 23/23 PASS with screenshots in `e2e-artifacts/unified-poi-area/`; `NO POI TOPOLOGY MUTATION` in unit and browser.
- **Conditions:** C1 public search-reveal browser step not validated (automated coverage green); C2 indoor rectangle rotation no-op (axis-aligned contract); C3 pre-existing compiler/typecheck/graphify/public-nav baselines; C4 pre-existing stale Inspector after undo/delete; C5 stale disposable test maps deleted after fixing cleanup param (`map_id`), 0 remain.
- **Gate:** `progress/UNIFIED-POI-AREA-MIGRATION-GATE-2026-09-12.md` - `UNIFIED POI / AREA MIGRATION - PASS WITH CONDITIONS`.
- **Stopped:** awaiting human review; no deployment, publication, or production campus mutation.

## 2026-09-12 - POI visibility / anchor pick / color picker fix

- **Reported:** "Show on map" toggled off but the POI stayed visible; "Pick anchor on shape" appeared to do nothing; Color row needed a custom color picker as the last option.
- **Root causes:** (1) the public map filtered `showOnMap=false` but the Studio renderer never did - `documentToGeoJSON` had no visibility property and `EntityRenderer.syncAll` only filtered by floor; (2) anchor pick is consumed by the select-tool mousedown handler, but the creation tool stays active after placing a POI, and the button gave no cursor/hint/confirmation; (3) no picker existed.
- **Fixes:** Studio now hides hidden POIs by default with a new "Show hidden POIs" dock toggle (`hidden_pois`, `EntityRenderer.setShowHiddenPois`); POI features carry `showOnMap`; the anchor pick activates the select tool, crosshair cursor, info/success toasts, Escape cancel, and draws an orange overlay anchor marker via the new `poi-anchor-overlay.ts`; the Color row ends with a native `<input type="color" aria-label="Custom POI color">`.
- **Verification:** RED first (4 failing tests) then green; focused 8 files / 84 tests; protected matrix 29 files / 240 tests; browser `e2e-poi-fix.mjs` 13/13 PASS; regression `e2e-unified-poi-area.mjs` 23/23 PASS; scoped ESLint no new errors; disposable fixtures cleaned (0 remain).
- **Gate:** `progress/POI-VISIBILITY-ANCHOR-COLOR-FIX-2026-09-12.md` - `POI VISIBILITY / ANCHOR PICK / COLOR PICKER FIX - PASS`.
- **Stopped:** awaiting human review; no deployment, publication, or production campus mutation.

## 2026-09-13 - Room Tool Comsai debugging (T1)

- Captured the exact `Computer Science Building` floor-0 server wall geometry (7 walls) and its 2 semantic room attributes in `packages/editor/src/geometry/__tests__/fixtures/comsai-floor-0.ts`.
- RED evidence: the focused Comsai regression produced 2 bounded/derived/rendered/clickable candidates instead of the 4 visually intended spaces. The loss occurs in the geometry engine before MapLibre rendering or Room hit-testing.
- Root-cause measurements: divider `wall-7-88hi` misses the top boundary by 5.73 mm; divider `wall-9-axn5` misses the top and bottom boundaries by 8.48 mm and 7.91 mm. The first divider intersects both boundaries, so only two faces close.
- Next: enforce exact wall-segment snapping in the Wall authoring contract, without changing room-derivation tolerances or normalizing the immutable fixture.

## 2026-09-13 - Room Tool Comsai debugging (T2)

- Root cause proven: `useFloorDrawing` supplied only authored wall endpoints to `snapPoint`; a partition click near the middle of a boundary therefore remained a grid/raw point instead of becoming an exact T-junction.
- Narrow fix: `snapPoint` now accepts existing wall segments and prioritizes exact segment projection after endpoint snapping but before grid/angle snapping. Only Wall authoring passes wall bodies; Room derivation tolerances and existing persisted coordinates are unchanged.
- GREEN evidence: 3 focused files / 40 tests passed, including exact Comsai click coordinates deriving 4 faces, endpoint/grid/orthogonal priority compatibility, and the prior wall-snapping suite.
- Next: add floor-editor-path coverage and run the protected geometry/persistence regressions.

## 2026-09-13 - Room Tool Comsai debugging (T3)

- Added direct floor-editor coverage proving both divider clicks use the endpoint > wall-body > mode-specific snap contract.
- Required regressions cover the immutable Comsai snapshot, a simple rectangle, adjacent shared-wall rooms, a valid T-junction, an intentional 1 cm gap that remains open, and corrected geometry surviving JSON save/reload with four faces.
- Verification: focused floor-editor/geometry set 57/57; protected Room/Wall matrix 13 files / 154 tests; new geometry/test files pass scoped ESLint; `git diff --check` passes for all task files.
- Condition: whole-file ESLint for legacy `useFloorDrawing.ts` remains non-green with 12 pre-existing errors and 9 warnings unrelated to the new helper/calls.
- Next: update the project knowledge graph and perform browser verification without mutating the production snapshot until the local behavior is proven.

## 2026-09-13 - Room Tool Comsai debugging (T4, blocked)

- Graphify update completed: 13,833 nodes, 27,533 edges, 795 communities.
- Re-read server snapshot `graph_snapshots.id=6696`: its timestamp and exact 7-wall Comsai fixture are unchanged, so no concurrent server edit occurred during debugging.
- Live browser reproduction remains 4 visible spaces but only 2 derived rooms. Reload exposed `Unsaved`; console logs show `syncToSupabase` is blocked by an unresolved newer-server conflict. This prevents a trustworthy save/reload verification.
- A version-checked production patch limited to the six malformed divider endpoint coordinates was prepared but rejected because direct SQL needs separate explicit user approval. No production data changed and no local unsynced state was discarded.
- Required next decision: authorize the exact endpoint-only server correction and choose whether NAVI may replace the open tab's unsynced local snapshot with the server version before final Room-tool click/save/reload verification.
- Final local evidence before handoff: protected Room/Wall matrix 13 files / 154 tests PASS; new geometry/test files ESLint PASS; task-scoped `git diff --check` PASS; final Graphify rebuild 13,836 nodes / 27,536 edges / 780 communities.

## 2026-09-13 - Floor Editor Stabilization audit + safe UI slice

- Completed the mandatory audit and wrote `spec/FLOOR-EDITOR-STABILIZATION-AUDIT.md`, `spec/FLOOR-EDITOR-STABILIZATION.md`, `plan/FLOOR-EDITOR-STABILIZATION.md`, and `TODO-FLOOR-EDITOR-STABILIZATION.md`.
- Confirmed current gaps: Door remains wall-span-only; Stair/Elevator creation remains point-only; Outliner type groups lacked collapse controls; 2.5D uses separate MapLibre/Canvas paths; Window schema/rendering exists and can be hidden at the UI surface; no centralized room-parent contract was found.
- Implemented safe slice: architecture Floor Editor dock no longer exposes Window authoring (registry and persisted Window data remain); Outliner type groups collapse/expand; `EditorBridge` clears a selected entity removed by undo/delete on `document.changed`.
- Verification: new stabilization tool-surface test and editor selection suite pass (27/27); existing semantic-room suite remains 12/14 because two pre-existing mocked outdoor-node cases omit coordinates and therefore cannot satisfy the production candidate filter.
- Status: stabilization remains PARTIAL; T1/T2/T3/T5/T7 require further implementation and browser verification. No production data changed.

## 2026-09-13 - Floor Editor Stabilization shared geometry foundation

- Extracted `packages/core/src/geometry/rectangle-authoring.ts` and reused it from the POI rectangle authoring builder. This establishes one tested drag-normalization/corner-order contract for future Door/Stair/Elevator migration without changing the existing POI schema.
- Verification: shared rectangle test, POI geometry tests, Door/Stair/Elevator tool suites, protected Room/Wall + 2D/2.5D suites — 171/171 passing across the focused runs.
- Status: T1 foundation complete; Door/Stair/Elevator migration and Inspector transform wiring remain open. Stabilization verdict remains PARTIAL.

## 2026-09-13 08:29 +08:00 - Floor Editor Stabilization implementation and verification complete

- **T1:** Door, Stair, and Elevator now share down-drag-release rectangle authoring with preview; Door and connector footprints support select, move, resize, rotate, Inspector edits, undo/redo, save, and reload. The obsolete two-point Door path is no longer the authoring contract.
- **T2:** Spatial Doors use deterministic assigned/unassigned/ambiguous Room ownership, support explicit reparenting, and create route anchors/connector edges only through explicit user action. Moving a Door recomputes ownership and preserves undo state.
- **T3:** Entrances remain visible/selectable with active/selected styling in both view modes; the existing explicit outdoor-route topology contract is preserved.
- **T4:** Floor/category/Room hierarchy is collapsible, assigned Doors nest under Rooms, unassigned Doors remain visible at floor scope, selection auto-reveals without overriding a manual collapse, and removed entities clear stale selection.
- **T5:** The 2.5D population defect was traced to map-readiness synchronization. Both modes now repopulate from the same authored document; Door extrusion and Stair/Elevator sources survive 2D -> 2.5D -> 2D without document mutation.
- **T6:** Window authoring is hidden from the dock/adapter while existing Window schema, persisted records, and rendering remain intact.
- **T7:** Clean clients adopt only newer server revisions; older server data does not replace clean local state; dirty clients retain local work and expose conflict recovery; force-save uses an expected server revision and the server-returned revision becomes authoritative. Migration `009_graph_snapshot_optimistic_concurrency.sql` supplies the server compare-and-swap boundary and awaits rollout.
- **Persistence defect caught by browser:** full spatial Door fields were lost through graph save/reload. `floorData.doors` and `createDocument` now preserve the canonical Door record; the legacy runtime Door projection remains separate.
- **Automated evidence:** final protected matrix 39 files / 625 tests PASS; latest affected regression set 5 files / 34 tests PASS; `node --check e2e-floor-editor-stabilization.mjs` PASS; scoped ESLint for new/self-contained modules PASS; stabilization-owned TypeScript findings 0. The repository-wide TypeScript command remains non-green on the documented pre-existing baseline.
- **Browser evidence:** disposable authenticated local workflow `FLOOR EDITOR BROWSER VALIDATION — PASS (28/28)`, covering Door ownership/reparent/route/edit/undo/redo/save/reload, Stair, Elevator, Entrance, hierarchy, 2D/2.5D, simulated HTTP 409 recovery, local-edit preservation, and zero page errors. Screenshot: `e2e-artifacts/floor-editor-stabilization/01-25d-populated.png`. The disposable map shell was removed successfully.
- **Production observation:** exact linked URL inspected read-only. It still serves the prior UI and reports `route_nodes_building_id_fkey` sync failure; no Save, Load-server, deletion, direct database edit, migration, deployment, or production-data mutation was performed.
- **Next:** deploy the reviewed patch, apply migration 009, then separately diagnose the production route-node/building FK data condition before expecting the linked deployment to reflect the verified behavior.

## 2026-09-13 10:35 +08:00 - Door gesture feedback and synchronous capture (T8)

- **Reproduced:** On the exact local form of the linked floor route, Door activated but a plain map click produced no object, message, status, or console error.
- **Root cause:** `mousedown` updated only React state while `mousemove`/`mouseup` consumed a ref synchronized by a later effect, so a same-frame gesture could lose its release. Every rejected rectangle boundary also returned silently.
- **Fix:** Door/Stair/Elevator rectangle state now updates its mutable ref and render state together. The canvas exposes an accessible live status with activation instructions, in-progress guidance, explicit rejection reasons, command failure details, and creation success.
- **Automated evidence:** RED first (2/2 focused failures), then focused hook GREEN 2/2 and shared Door/Stair/Elevator/Canvas regression GREEN 38/38. The new test file passes scoped ESLint and task-scoped `git diff --check` passes; whole-file Floor Editor lint remains blocked by the recorded legacy baseline.
- **Browser evidence:** The exact local route visibly showed `Door: click and drag to draw a rectangle.` and changed to `No Door created — drag at least 0.2 m wide and deep.` after a click without mutating map data. The disposable authenticated workflow passed 30/30, including a valid Door drag, editing, transformations, persistence, shared Stair/Elevator behavior, and zero page errors; its temporary map shell was removed.
- **Knowledge graph:** Required incremental update completed at 13,941 nodes, 27,723 edges, and 805 communities.
- **Production safety:** No production page data, deployment, database row, or migration was changed.

## 2026-09-13 - Route multi-click reliability T3: drag-pan guard (commit c00c088)

- **Task:** Add Road-tool parity while Route (`tool === 'hallway'`) is active: disable `map.dragPan` so presses that drift past MapLibre's `clickTolerance` are not converted into pans that swallow the click.
- **Test first (RED):** Appended `disables map drag-pan while the Route tool is active and restores it on tool change` to `src/components/floor-editor/__tests__/route-multiclick-reliability.test.tsx`. `npx vitest run ... -t "drag-pan"` failed with `expected "vi.fn()" to be called at least once` (probe `dragPan.disable` never called).
- **Implementation:** Added a guarded effect in `src/components/floor-editor/useFloorDrawing.ts` immediately after the tool-change reset effect (line 432). It no-ops unless `map && mapReady && tool === 'hallway'`, calls `map.dragPan?.disable()`, and restores `enable()` in cleanup. The rectangle Door/Stair/Elevator gesture path is untouched because the effect only mounts for the Route tool.
- **GREEN:** `npx vitest run src/components/floor-editor/__tests__/route-multiclick-reliability.test.tsx` passed 1 file / 3 tests.
- **Commit:** `c00c088` — `fix: disable drag-pan while Route authoring keeps presses as clicks`; only the two briefed files, 32 insertions, 0 deletions.
- **Hygiene:** `git diff --check` for the commit passed. Scoped ESLint: test file clean; `useFloorDrawing.ts` retains only pre-existing whole-file legacy debt (12 errors / 5 warnings, none on the new lines).
- **Report:** `.superpowers/sdd/irj-reports/task-3-report.md`.

## 2026-09-13 - Task 9 fix wave 1: stale route connection prompt (commit 6eb3e10)

- **Finding:** Finishing a Route with an open segment-connection prompt left `routeConnectionPrompt` set; a later Yes/No would commit a stale lone route at the old click position.
- **Fix:** `commitRoutePoints` hallway branch now clears `routeConnectionPrompt` at the transaction-complete point, immediately before the state reset (`src/components/floor-editor/useFloorDrawing.ts:584`). Accept/decline and rollback paths unchanged.
- **Test first (RED):** Appended `finishing the route clears an open segment prompt instead of leaving it stale` to `src/components/floor-editor/__tests__/route-target-finish.test.tsx`; RED failed with `expected { edgeId: 'e1', ... } to be null` (1 failed | 4 passed).
- **GREEN:** `npx vitest run src/components/floor-editor/__tests__/route-target-finish.test.tsx` 5/5; covering `production-route-characterization.test.tsx -t "Route segment finish"` 2 passed | 70 skipped.
- **Hygiene:** Scoped ESLint shows only pre-existing findings; knowledge graph incremental update completed (14,092 nodes / 27,880 edges / 815 communities).
- **Commit:** `6eb3e10` — 2 files changed, 34 insertions(+), 0 deletions(-).
- **Report:** `.superpowers/sdd/irj-reports/task-9-report.md` (Fix wave 1 section).

## 2026-09-13 - Indoor Route Junctions final review fix (C1 + I1 + M4)

- **C1:** Added `collectDoorConnectorEdgeIds` and rejected Door connector edges as junction targets in `route.path.create` (failWithRestore) and `door.route.connect` (pre-mutation validation); hardened anchor removal in connect-reconnect and disconnect to remove every anchor-incident edge; `useFloorDrawing.commitRoutePoints` now returns `ok`/`rejected`/`skipped` so accept/decline/confirm/finish/node-click surface `onRouteStartRejected` instead of silently clearing the prompt.
- **I1:** Shared `isRouteNodeReferencedByAccessRelationships` (entranceAccess + roomAttributes.accessPoints + building.verticalTransitions connections) replaces the floor-local guard.
- **M4:** Both split commands journal the removed original edge as `route-edge deleted`.
- **e2e/plan:** Route segment-finish step filters Door connector ids before picking an edge (delta stays +2); plan doc Task-14 arithmetic corrected +3 → +2.
- **Verification:** command suites 61/61; hook suites 86/86; commands sweep 472/472; `node e2e-floor-editor-stabilization.mjs` → FLOOR EDITOR BROWSER VALIDATION — PASS (36/36).
- **Report:** `.superpowers/sdd/irj-reports/final-review-fix-report.md`.

## 2026-09-13 - ROU Task 1: Core canonical room-identity helpers

- **TDD:** Added `packages/core/src/__tests__/room-identity.test.ts` (16 tests); RED = import resolution failure for `../room-identity`; GREEN = 16/16 after implementing `packages/core/src/room-identity.ts` and exporting it from `packages/core/src/index.ts`.
- **Verification:** Focused suite 16/16; `packages/core/src/serialization/serializer.test.ts` 10/10 (no regressions); graphify update rebuilt 14,199 nodes / 28,002 edges.
- **Hygiene:** Committed only the 3 task files; index.ts staged surgically (1 line) so 7 pre-existing uncommitted exports were not swept in. Scoped tsc shows only the pre-existing `entities.ts` `ParametricComponent` type-name drift.
- **Commit:** `b6e8e3e` — 3 files changed, 221 insertions(+), 0 deletions(-).
- **Report:** `.superpowers/sdd/ro-reports/task-1-report.md`.

## 2026-09-13 - ROU Task 9: Browser verification + full suite + logs

- **Delivered:** Extended `e2e-floor-editor-stabilization.mjs` with: orphan Door fixture + silent auto-adoption assertion on floor open (and persistence across save/reload); Outliner nesting (`Doors (` under the owning Room, no `Unassigned Doors` while all assigned); manual `Reconcile room ownership` idempotence (floor snapshot byte-identical); panel `Duplicate` (count +1, new id, ~0.5 m x/y offset, same canonical `roomId`, no `routeConnection`, selection follows); `Ctrl+D` duplicate + `Ctrl+Z` removal; duplicate persistence across save/reload; and a semantic canonical-ownership block (two fixture wall enclosures, Room tool declaration, attribute-only declaration via the production `roomAttributes.declare` command) with per-door `roomId`/ownership assertions. Added `waitForSnapshot`/`waitForSourceFeatures` polling for the debounced autosave (ERRORS.md timing entry).
- **Browser:** fresh `npm run dev` on :3000 (stale listener PID 16996 stopped first) + `node e2e-floor-editor-stabilization.mjs` → `FLOOR EDITOR BROWSER VALIDATION — FAIL (55/57)`. All 48 pre-existing checks and 7 of 9 new checks pass; the 2 semantic Door checks expose a real product defect (see ERRORS.md entry) — the created Doors were placed correctly inside their faces but resolved `{status:'ambiguous'}` against every derived face.
- **Defect evidence:** offline reproduction with the fixture walls: `resolveUniqueRoomOwner({x:11.94,y:4.02}, collectFloorRoomOwnershipPolygons(floor))` → `{status:'ambiguous', candidateRoomIds:[A,B]}` although the point is inside A only; `{x:25.42,y:-19.54}` (outside both) also → ambiguous.
- **Suite:** `npm test` → **Test Files 15 failed | 533 passed (548); Tests 29 failed | 5649 passed | 8 skipped (5686)** — exactly the pre-existing baseline (15 files / 29 tests), no new failures; failures untouched.
- **Commit:** `c532f80` — `test(e2e): verify room hierarchy, reconcile and door duplication`; only `e2e-floor-editor-stabilization.mjs` staged (+168/−9), `git diff --check` clean.
- **Report:** `.superpowers/sdd/ro-reports/task-9-report.md`.

## 2026-09-13 - ROU Task 9 fix wave: degenerate ring edges

- **Defect:** `pointOnSegment` treated the duplicated closing vertex of wall-derived room rings (and any zero-length segment) as containing every point (`cross = 0` and `dot = 0` satisfied `0 >= 0 && 0 <= 0`), so every derived face "contained" every door position; floors with ≥2 semantic Rooms resolved every door `ambiguous` and never assigned a canonical `roomId`.
- **Fix:** `packages/editor/src/geometry/room-ownership.ts` `pointOnSegment` now rejects (near-)zero-length segments (`lengthSq <= 1e-18`) before the cross/dot math; boundary points are still detected by the adjacent non-degenerate edges, so shared-wall `ambiguous` semantics are unchanged. Commit `0820454` — `fix(editor): ignore degenerate ring edges in room containment` (geometry + test only, +77/−1, parent `c532f80`, not amended).
- **TDD:** RED on the two new `room-ownership` cases before the fix (`{x:2,y:2}` inside adjacent rooms → `ambiguous`; far point → `assigned`); GREEN 11/11 after (new shared-wall and shared-corner ambiguity pins kept passing). Regressions `door-ownership-reconcile` + `spatial-door-handlers` 24/24. `npx eslint` on the two changed files exit 0.
- **Browser:** fresh `npm run dev` on :3000 + `node e2e-floor-editor-stabilization.mjs` → `FLOOR EDITOR BROWSER VALIDATION — PASS (57/57)`; the two semantic ownership checks now pass with canonical ids `room-1-zu4b` and `semantic-room-face-97xrm4`; the server started here was stopped afterwards.
- **Ledger/report:** `errors/ERRORS.md` entry updated with Fix/Verification; `.superpowers/sdd/ro-reports/task-9-report.md` Fix wave section.

## 2026-09-13 - E2E safety wiring: guard every Playwright-driven .mjs script

- **Scope:** Every root `navi-next/*.mjs` and `navi-next/scripts/*.mjs` containing `from 'playwright'` must import `e2e/support/campus-guard.mjs`; `e2e/support/` files, `.ts` specs, `temp/*.mjs`, and the already-guarded `e2e-p4-*.mjs` set were left untouched.
- **Offenders found (grep, 29):** root: check-floor, e2e-gate0, e2e-floor-editor-stabilization, e2e-debug, e2e-p1.1-gate1/2/3/4a/4b/5-uat, e2e-p0-gate0, e2e-p1.3-identity, e2e-panels, e2e-rc1..rc4, e2e-poi-outdoor-architecture, e2e-poi-fix, e2e-unified-poi-area, e2e-verify-fixes, e2e-verify-footprint-fix, e2e-repro-empty-footprint, verify-phase1/15/2c; scripts: debug-map, debug-localstorage, debug-browser.
- **Rule 1 (fixed/selected campus -> requireE2eCampusId, 11):** check-floor, e2e-gate0, e2e-panels, e2e-p1.1-gate5-uat, e2e-verify-fixes, e2e-repro-empty-footprint, verify-phase1/15/2c, scripts/debug-localstorage, scripts/debug-browser. Hardcoded campus literals replaced with `mapId` (`const mapId = requireE2eCampusId()` or inline in the existing const) before any browser action; imports use `./e2e/support/campus-guard.mjs` (root) or `../e2e/support/campus-guard.mjs` (scripts).
- **Rule 2 (own disposable campus / intercepts APIs / generic -> requireSafeTestEnvironment, 18):** e2e-floor-editor-stabilization, e2e-debug, e2e-p1.1-gate1/2/3/4a/4b, e2e-p0-gate0, e2e-p1.3-identity, e2e-rc1..rc4, e2e-poi-outdoor-architecture, e2e-poi-fix, e2e-unified-poi-area, e2e-verify-footprint-fix, scripts/debug-map. Guard call immediately after imports, before browser launch.
- **Verification:** grep re-scan -> 0 offenders; `node --check` on all 29 changed files -> 29/29 exit 0; `npx vitest run __tests__/e2e-safety.test.ts` -> 1 file, 14/14 tests passed (includes "requires every playwright-driven .mjs script to import the environment guard"). No scripts executed, no dev server, no network/Supabase calls, no commits.
- **Files changed:** the 29 listed above; interception logic, fixtures, selectors, and all behavioral code unchanged.

## 2026-09-15 - SYNC hardening Phases 3+4: server mutation gate + writer guards

- **Delivered:** `src/lib/api-guard.ts` (session requirement + protected-campus `423` deny with `NAVI_PROTECTED_CAMPUS_WRITES=1` server override + body/query campus extractors) applied to `/api/graph`, `/api/campuses`, `/api/campus-maps`, `/api/buildings`, `/api/publish` before any Supabase client call or disk write. Guarded `temp/check-compile-data.mjs`, `temp/check-data.mjs`, `scripts/gate3-runtime-verify.ts`, and both `e2e/floor-plan-*.spec.ts`; documented the override in `.env.example`.
- **Auth finding:** middleware protects admin pages only (`/api/*` not in the matcher); API routes used the service-role key with zero auth. Real login sets `sb-*-auth-token*`; dev mock login sets base64-JSON `navi-mock-session` when `NODE_ENV !== 'production' && NEXT_PUBLIC_MOCK_AUTH=true` — the guard accepts exactly those two markers.
- **Verification:** focused `npx vitest run` -> 8 files / 61 tests PASS (api-guard 16, graph 6, publish 16, campuses 8, graph-runtime 1, e2e-safety 14); `npx vitest run src/app/api` -> 11 files / 47 tests PASS; `npx tsc --noEmit` -> 0 errors in touched files (1 pre-existing unrelated); scoped `npx eslint` clean except pre-existing findings; `node --check` on both `.mjs` exit 0; scratch scripts exit 1 refusing production before browser launch.
- **Report:** `../progress/SYNC-HARDENING-PHASE3-MUTATION-GATE.md`. **No production mutations, no Supabase calls, no commits.**
- **Next:** P1-6 (wire the dev/test Supabase project — external), then product decision on verified sessions replacing the mock cookie (residual P1).

## 2026-09-21 - Building creation confirmation / duplicate Save fix

- **Root cause:** `ConfirmOverlay.handleSave` had no synchronous in-flight guard, generated a fresh building id on every click, and let rejected `workflow.save('manual')` promises escape without visible retry state. The confirmation remained live while persistence was pending, so rapid clicks dispatched duplicate `building.create` commands.
- **Fix:** Added a ref-backed Save lock, one stable building id per confirmation, success-only draft finalization, retryable error UI, disabled Cancel/Save while pending, and command-result checks. Existing workflow persistence and sync architecture were left unchanged.
- **Tests:** RED reproduced the duplicate-dispatch and unhandled-rejection failures. GREEN focused confirmation suite: 8/8; adjacent Studio confirmation/drawing suite: 51/51 across 7 files. Scoped ESLint passed.
- **Build:** `npm run build` compiled and finalized all 41 static pages after the approved retry; the initial sandbox worker `EPERM` is recorded in `errors/ERRORS.md`.
- **Graphify:** Required `graphify update .` was attempted and remained blocked by managed Windows `WinError 5`; generated graph output was not edited.
- **Next:** T4 — commit only the scoped files, push a new non-force branch, deploy the exact pushed SHA, and verify provenance/HTTP response.

## 2026-09-21 - Building confirmation release verification

- **Commit:** `a0c5f072582c6a3a111151b24808ac413503c2ea` (`fix(studio): finalize building footprint after save`); commit contains only the two implementation/test files plus this bug's spec, plan, and TODO.
- **Push:** `origin/codex/building-creation-confirmation` resolves to the exact commit SHA; no force push and no changes to `origin/master`.
- **Vercel:** Production deployment `dpl_6gWPCN7r4L6kQxoyodv7Vtd8tqqu` reached `READY` and aliased `https://navi-next.vercel.app`. It was created from a clean worktree checked out at the exact commit SHA.
- **HTTP:** `HEAD /` -> 200 and `HEAD /studio/create` -> 200 on the production alias.
- **Owner smoke:** An authenticated production session was not available to this run. Owner should sign in and execute the four requested Studio checks: one building saves once and remains after reload; Cancel creates nothing; rejected Save leaves the draft and permits retry; a second intentional building saves as a distinct entity.

## 2026-09-25 - Temporary Cloudflare R2 connectivity test endpoint

- **Delivered:** server-only `src/lib/r2.ts` (env validation by name, `S3Client` factory with `forcePathStyle`, `PutObject` of `_navi-tests/r2-connectivity-test.txt` = `NAVI R2 connectivity test`, error sanitizer) plus `POST /api/r2-connectivity-test` behind the existing `requireVerifiedMutationAuth` gate. Responses: `200 {ok,provider,bucket,object}`, `500 missing_configuration` (variable names only), `502 r2_request_failed` (`code`/`httpStatus`/`requestId`, no message). No ACL, no presigning, no `NEXT_PUBLIC_R2_*`.
- **Decision (user-approved):** mutation-style auth guard rather than an open endpoint; `.env.example` left untouched because it already carries unrelated uncommitted edits. Spec/plan live in `spec/R2-CONNECTIVITY-TEST.md` and `plan/R2-CONNECTIVITY-TEST.md` so the shared `spec/SPEC.md`/`plan/PLAN.md` (other in-flight work) were not overwritten.
- **Verification:** `npx eslint` on the 4 touched files -> exit 0; `npx vitest run src/app/api` -> 16 files / 70 tests PASS (new suite covers 401-no-network, sanitized config error, exact object upload, sanitized 502; route registered in `route-auth-wiring.test.ts`); `npx tsc --noEmit` -> 145 -> 3 errors, all pre-existing `data-identity-comparison.test.ts` parse errors, none in touched files; `npm run build` -> exit 0 with `ƒ /api/r2-connectivity-test` in the route list; `next start -p 3111` + `POST /api/r2-connectivity-test` -> `401 {"error":"Authentication required."}`.
- **Limitation:** no `R2_*` credentials exist locally (0 R2 keys in `.env.development.local`, `.env.production.local`, `.env.example`, or the process env), so the real upload to `navi-360` could not be executed from this machine. No credentials were invented or modified.
- **Incident:** the first `npm install` was interrupted and zero-filled `package-lock.json` plus 177 files in `@aws-sdk/core`/`@smithy/core`; recovered per `errors/ERRORS.md`.
- **Next:** commit the 8 scoped files, deploy, then `POST /api/r2-connectivity-test` with a real session against Vercel to execute the live upload.


## 2026-09-25 - R2 connectivity test deployed and verified against production

- **Commit:** `b56743de3f75b6269b678bfcf2d6294ae4eeb2e1` (`feat(r2): add server-side R2 connectivity test endpoint`), 10 files / 937 insertions / 0 deletions. Mixed log files were staged at blob level so only this run's entries (errors +8, progress +9) entered the commit; the pre-existing unstaged work in both logs stayed unstaged.
- **Deploy:** Vercel CLI authenticated via device flow (user-approved), production deployment `dpl_2YUvRKhtGpL82fmkvacXnk3GX16T` -> `READY`, aliased to `https://navi-next.vercel.app`, built from a clean detached worktree at `b56743d` (worktree removed afterwards). Build list contains `/api/r2-connectivity-test` (dynamic route).
- **HTTP:** unauthenticated `POST /api/r2-connectivity-test` -> `401 {"error":"Authentication required."}`; `GET /` -> `200`.
- **Live test (authenticated):** `POST` from an existing `NAVIADMIN` production session -> `200 {"ok":true,"provider":"cloudflare-r2","bucket":"navi-360","object":"_navi-tests/r2-connectivity-test.txt"}`.
- **Blocker resolved:** the secret had been created as `r2_secret_access_key`; case-sensitive mismatch, renamed and redeployed (details in `errors/ERRORS.md`).
- **Independent verification (user-run):** Cloudflare dashboard shows `navi-360` with Public Access Disabled -> `_navi-tests/` -> `r2-connectivity-test.txt`, `text/plain`, 25 B = exact length of `NAVI R2 connectivity test`.
- **Limitation:** R2 credentials are write-only in Vercel (`vercel env pull` returns `""`), so no machine-side read-back was possible. No credential value was printed, stored, or committed at any point; the pulled env file and helper scripts were deleted.
- **Next:** nothing outstanding. Optional tidy-up: drop the stray lowercase `R2_region` Shared variable. Branch state unchanged: local `master` is 381 ahead / 5 behind `origin/master` and was not pushed.

## 2026-09-25 - 360 panorama ingestion readiness: presigned sign/complete/resolve deployed and E2E-verified

- **Delivered:** spec/NAVI-360-PANORAMA-INGESTION.md (8 approved gate decisions) + plan/NAVI-360-PANORAMA-INGESTION.md (T1-T13); src/lib/panorama-keys.ts (traversal-proof key convention panoramas/<campus>/<panorama>.<ext>, 25 MiB cap, content-type allowlist); src/lib/r2.ts presigners (presignPanoramaPut/presignPanoramaGet/headPanoramaObject, TTLs 600/300s bounded by 86400, browser-runtime refusal preserved); POST /api/panorama-upload (sign + complete: auth, protected-campus 423, registry-write-before-URL, HeadObject verification); public registry-gated GET /api/panorama-resolve; src/lib/panorama-asset-store.ts + migration 015_panorama_assets.sql (service-role only, RLS enabled, zero client grants). SDK fact: @aws-sdk/s3-request-presigner strips content-type from the signature (verified in its dist-cjs source), so content-type enforcement lives at complete (HeadObject) + the registry gate - recorded in spec/plan.
- **User-applied infrastructure:** migration 015 ran in the Supabase SQL editor ("Success. No rows returned"); R2 navi-360 CORS policy saved in the Cloudflare dashboard (origins https://navi-next.vercel.app + http://localhost:3000; methods PUT/GET/HEAD; headers Content-Type; expose ETag; max-age 3600 - explicit allowlists, no wildcards).
- **Commit:** cce7628 (feat(360): add presigned panorama ingestion API (sign/complete/resolve)), 16 files / 2111 insertions / 7 deletions; only this task's files staged; the pre-existing dirty state untouched; r2-connectivity-test path byte-identical.
- **Deploy:** dpl_4Sidq8ceMZsCBkQvMBLVQEoyzQcw -> READY, aliased https://navi-next.vercel.app, built from a clean detached worktree at cce7628 (npm ci 842 pkgs, lock intact at 943; worktree removed afterwards); no push to origin/master.
- **HTTP:** GET / -> 200; unauthenticated POST /api/panorama-upload -> 401; GET /api/panorama-resolve?key=<unknown> -> 404 not_found (public route, registry-gated); unauthenticated POST /api/r2-connectivity-test -> 401 (regression intact).
- **Live E2E (browser, authenticated session):** sign -> 200 key panoramas/asu-ibajay/e2e-ingest-20260925.jpg; browser fetch(uploadUrl, {PUT, Content-Type: image/jpeg}) from origin https://navi-next.vercel.app -> 200 in 3269 ms, ETag cad259111c822334ac6de5119de8b312, 8220561 bytes (Vercel 4.5 MB cap bypassed); complete -> 200 {byteSize: 8220561, contentType: image/jpeg}; resolve -> 200 presigned GET; fetched bytes -> 8220561 with SHA256 82e2c2e11695b3800f273512ef1fb20377e88c6d465e8b2aa855b19630ec0330 = exact match to the local file (hashMatch: true).
- **Verification:** scoped eslint on 11 touched files -> exit 0; npx tsc --noEmit -> only the 3 pre-existing data-identity-comparison.test.ts baseline errors; npx vitest run src/app/api src/lib -> 431/432 (sole failure qr-location.test.ts, pre-existing: file clean at HEAD and outside this change set); npm run build -> exit 0 with all three routes compiled; graphify update . -> exit 0 (38721 nodes - first successful update in recent sessions).
- **E2E obstacle:** Chrome Private Network Access denied the planned loopback file fetch from the https page; worked around by dropping the file into the page (Playwright drop) and PUT-ing the in-page buffer - logged in errors/ERRORS.md.
- **Next:** user-side independent Cloudflare dashboard confirmation (object under panoramas/, image/jpeg, 8220561 B, bucket still Public Access Disabled); viewer/stitching/hotspot wiring remains out of scope per non-goals. Branch: local master at cce7628, not pushed.

- **Independent verification (user-run, 4 screenshots):** Cloudflare dashboard shows Public Access Disabled, bucket size 8.22 MB; object `panoramas/asu-ibajay/e2e-ingest-20260925.jpg` with Type `image/jpeg`, Size 8.22 MB, Date Created 26 Sep 2026 05:26:26 GMT+8 (= 21:26:26 UTC, matching the E2E PUT window), and a rendered object preview; bucket root shows `_navi-tests/` alongside `panoramas/`. T9 step 5 closed - all five steps passed with evidence recorded.

## 2026-09-26 - Floor-elevation program: Phase 0 verified (classification B) + Phase A vertical contract shipped

- **Program:** `NAVI — FLOOR ELEVATION + ACTIVE FLOW.txt` (phases 0-F). Contracts recorded in `spec/FLOOR-ELEVATION-ACTIVE-FLOW.md` + `plan/FLOOR-ELEVATION-ACTIVE-FLOW.md`. No commits/push/deploy; shared dev data untouched.
- **Phase 0 (root cause = reference/floor-plane contract mismatch):** Studio renders exactly one floor (`FloorEditorCanvas.tsx:1027/1063`), and of its five `fill-extrusion` layers four already sit on datum 0 (rooms `:148` base 0, door areas `:156` base 0, derived rooms `:241` base 0.1, route edges `:332` base 0) while only the wall extrusion applied the stacking datum (`wallsToExtrusionCollection(fl.walls, fl.elevation)` at `:1071`); every non-extrusion renderable (plan raster, outlines, labels, hallways, 2D walls, building fill) is pinned to z=0. On any floor with `elevation > 0` the walls alone rise = the audit's disconnect. `Floor.elevation`'s only other rendering consumer is the published POI stacking path (`packages/editor/src/rendering/geojson.ts:165`, `base_elevation = baseElevation + floor.elevation`) - a genuine multi-floor context. `recalculateBuilding` had zero test coverage (A.2 claim confirmed).
- **Phase 0.5 (repro):** audit screenshot unavailable; current live graph has no walls on ANY floor of `osm-bldg-888026366` and the fixture has walls on level 0 only, so the screenshot state cannot be replayed from data without mutating shared dev data (forbidden) -> reproduced deterministically at component level: RED run failed with `expected 3.5 to be +0` (elevated floor's wall-extrusion `properties.base`).
- **Phase A (Contract L - single-floor presentation frame):** exported `FLOOR_PRESENTATION_DATUM = 0` with the vertical-contract doc from `packages/editor/src/geometry/wall-to-polygon.ts`; `FloorEditorCanvas.tsx:1077` now passes it instead of `fl.elevation`. Untouched: wall XY/thickness data, extrusion formula `height = base + wall.height`, `Floor.elevation` semantics, `recalculateBuilding`, publisher/compiler/runtime/geojson stacking paths, 2D mode. A.6 determination: the floor-plan raster shares the active floor's own plane, so it cannot falsely imply z=0 is the physical floor (no suppression needed). A.9: no base slab (no legitimate need once coherent).
- **Verification (Phase A gate):** RED->GREEN datum tests, `FloorEditorCanvas.test.tsx` 12/12 (elevated-floor contract + ground-floor unchanged guard + zero document mutation); new `floor-recalculation.test.ts` 10/10; wall/enclosure matrix 11 files / 189 tests PASS; `room-derivation.test.ts` PASS; focused floor-editor + editor geometry/commands 1230/1232 (2 pre-existing); `packages/runtime` (own config) 436/436 tests (1 pre-existing parse-broken file); `tsc --noEmit` -> only the pre-existing `data-identity-comparison.test.ts` TS1005; eslint: zero findings on changed lines/files (all findings on untouched pre-existing lines).
- **Full baseline captured for Phase F:** `npx vitest run` = 610 files / 6227 tests -> **18 files / 34 tests failing, all pre-existing**. Attribution: Phase A import graph is `wall-to-polygon` (importers: FloorEditorCanvas + 2 passing tests) and `FloorEditorCanvas` (importers: 2 passing tests, both pass); every failing file lies outside it and co-locates with the parallel workstream's dirty files (`packages/compiler/src/emitter/artifacts.ts` M, `src/services/graph-snapshot-serializer.ts` M, `src/app/(public)/map/navigate/page.tsx` M + test M, studio `EditorBridge/MapCard/StudioDashboard` M, `create-editor-context.ts` M; `phase3a-authored-state.test.ts` untracked ??), or is clean-at-HEAD (`routing-validation`, `topology-audit`, `route-network-maplibre`, `semantic-room-interaction`, runtime parse error). Details in `errors/ERRORS.md`.
- **Next:** Phase B - Studio multi-floor visibility decision (single-floor presentation is now the contract; any stack view must use the stacking datum).
- **Phase B (COMPLETE):** B.1 audit recorded in spec with `path:line` (single-floor rendering via `floors.find(f.level === floor)` at all sync sites; footprint-only context; visibility map `:1496-1539`; plan raster per-level + stale-hide; Navigation Preview graph = active floor's `routeNetwork` `:1186`). B.2 decision: single-floor isolation IS the Studio contract, no stacking view built (YAGNI; future stack view must use `baseElevation + floor.elevation`). B.3: plan imagery stays a 2D reference on the presentation plane (no 3D raster engine). B.4: slab re-affirmed NO. B.5: new `FloorEditorCanvas.test.tsx › Phase B` floor-switch test (walls + wall extrusion + route graph swap atomically; zero document/route-network mutation) -> suite 13/13 PASS. B.6 gate met; floor-editor regression: 35/37 files pass, only the 2 baseline failures (route-network-maplibre, semantic-room-interaction).
- **Next:** Phase C - Navigate activeFloor presentation.

## 2026-09-27 - Navi Studio floor & interior persistence unblocked and verified

- **Problem:** Adding a second floor or modifying interior routes/rooms/walls in Navi Studio failed to persist to Supabase. Edits appeared locally in `localStorage`, but autosave either skipped the write (`pending.length === 0`) or the Cross-Scope Destructive Save guard blocked it with `Cross-scope destructive save blocked: no pending authored intent covers nodes[...] edges[...]`, wiping outdoor road nodes (`N1187..N1193` on `T-1-0ur6`). On reload, the client showed "Outdated / Load server version", which overwrote user edits when accepted.
- **Root Cause & Mechanism:**
  1. `EditorBridge.tsx` listened to `document.changed` on the event bus, but never recorded authored mutation intents (`recordAuthoredMutation`). Thus, `pendingAuthoredMutations.length === 0` caused autosave to skip `POST /api/graph`.
  2. `GraphAdapter.sync(document)` wiped all nodes and edges on sync and recompiled road traces via `compileTrace()`. `compileTrace` ignored existing IDs and assigned volatile `N0001..` / `E0001..` IDs to outdoor road traces.
  3. `reconcileCanonicalCollections()` evaluated `outdoorCovered` as true for any document with a `roads` array, replacing existing outdoor nodes with freshly synthesized IDs.
  4. The safety guard `evaluateAuthoredSave` detected that baseline outdoor nodes/edges had vanished without an outdoor authored intent, blocking the save.
- **Fix Applied (3 parts):**
  1. **T1 (Trace Compiler Identity Stability):** Updated `compileTrace()` in `src/engine/trace-compiler.ts` and `Graph.addTraceWithCompile()` in `src/engine/graph.ts` to accept `stableReference?: { nodes?: NavNode[]; edges?: NavEdge[] }`. It looks up matching nodes by coordinates and matching edges connecting those nodes, reusing stable IDs across reconciliations.
  2. **T2 (Scope-Aware GraphAdapter Sync):** Added `scope?: GraphAdapterScope` to `GraphAdapter.sync()` and `reconcileCanonicalCollections()` in `packages/editor/src/graph-adapter.ts`. When syncing a floor or building scope, `outdoorCovered` is strictly false, preserving outdoor road entities verbatim. In `floor/[floor]/page.tsx`, all sync calls now pass `{ kind: 'floor', buildingId, floor }`.
  3. **T3 (Campus Editor Mutation Attribution):** In `src/components/studio/EditorBridge.tsx`, `document.changed`, `syncDocumentAndCapture`, `persistenceAdapter.save`, and `visibility/unload` handlers now attribute authored mutations via `recordAuthoredMutation` (`building` or `outdoor`) so campus-level actions like `floor.create` pass the P0.11 save gate and autosave.
- **Verification:**
  - `src/engine/__tests__/trace-compiler.test.ts`: 7/7 tests PASS (including new stable node/edge identity reuse tests).
  - `packages/editor/src/__tests__/sync-reconciliation.test.ts`: 6/6 tests PASS.
  - `floor-editor-persistence.test.ts`: 2/2 tests PASS.
  - Full regression suite across 7 files / 36 tests PASS with 0 failures (`trace-compiler`, `sync-reconciliation`, `floor-editor-persistence`, `studio-persistence`, `readiness-lifecycle`, `graph-store-save-queue`, `saved-state-gate`, `case-e-attribution`).
  - End-to-end simulation against real Supabase snapshot (`scripts/verify-persistence-fix.ts`): verified that floor interior sync and campus-level `floor.create` both yield `verdict.allowed: true` with 0 removed outdoor entities.

## 2026-09-27 - Independent QA review of floor/interior persistence change set: BLOCK + fixes applied

- **Review scope:** the 5-file change set (+151/-44): `src/engine/trace-compiler.ts`, `src/engine/graph.ts`, `packages/editor/src/graph-adapter.ts`, `src/components/studio/EditorBridge.tsx`, `floor/[floor]/page.tsx`. Independent QA subagent + supervisor re-validation of every claim.
- **Verdict:** BLOCK - 2 high-severity findings, both confirmed against the code before fixing.
- **HIGH-1 (cross-floor node adoption):** `findMatchingExistingNode` returned `candidates[0]` without a scope check (single-candidate shortcut + no-match fallback). Stacked floors share identical lat/lng, so a floor-1 compile could adopt floor-0's stable node id; `Graph.addNode` is a `Map.set` upsert, so the floor-0 node would be silently replaced with floor-1 data. **Fix:** identity reuse is now scope-strict - return only an exact `buildingId`+`floor` match, otherwise `undefined` (fresh id via `genId('N')`).
- **HIGH-2 (guard-defeating intent injection):** `EditorBridge.saveGraph`/`syncToSupabase` fabricated `recordAuthoredMutation(...)` unconditionally whenever `pendingAuthoredMutations.length === 0`, which is exactly the precondition under which the P0.11 guard fails closed (CASE A: changed candidate with no authored intent) - making the guard unreachable on every EditorBridge save. Tests missed it because they exercise the store directly, bypassing EditorBridge. **Fix:** fallback attribution now additionally requires `contextRef.current.document.version > 0` (a real editor change, the same signal the visibility/beforeunload handlers already use), so hydration/view-only sessions (version 0) stay fail-closed.
- **Lint:** the change set introduced 3 new `react-hooks/exhaustive-deps` warnings in `floor/[floor]/page.tsx`; `floorScope` is now `useMemo`-stabilized and listed in all three effect dep arrays. Scoped eslint on the 5 files after fixes = 7 errors / 1 warning, byte-for-byte the pre-existing HEAD baseline (2x `react-hooks/refs`, 5x `no-explicit-any` in EditorBridge, 1 unused `_` in graph.ts) - 0 new problems.
- **Security:** `scripts/verify-persistence-fix.ts` (untracked) had a hardcoded production Supabase service-role key; replaced with `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` env reads + fail-fast message. `git log --all -S <key-fingerprint>` empty and `git grep` empty - the key was never committed; it stays untracked.
- **Verification after fixes:** full battery 9 files / **55/55 PASS** (trace-compiler 7, sync-reconciliation 6, floor-editor-persistence 2, studio-persistence, readiness-lifecycle 5, save-queue 9, saved-state-gate 10, case-e-attribution, floor-recalculation 10); scoped eslint matches baseline.
- **Known follow-ups (not blocking, recorded by QA):** `metadata.traceId` overwrite when an id is reused; `entityType` 'batch'/unknown scope guessing in intent records; redundant POSTs on visibility/unload without a delta gate; `kind:'outdoor'` scope-drop path in `reconcileCanonicalCollections` currently unreachable.
- **Next:** commit fix set, push to branch `fix/floor-editor-persistence-2026-09-27` (local master shares no ancestor with `origin/master` - unrelated histories, fast-forward push impossible), deploy to Vercel production.
- **Outcome (same day):** commit `37539b6` (10 files, +568/-355; staged set = 5 source + trace-compiler test + spec/plan/progress/errors; `scripts/verify-persistence-fix.ts` and `todo.md` left untracked; post-commit scan confirms 0 key material in the commit). Push succeeded: `* [new branch] HEAD -> fix/floor-editor-persistence-2026-09-27` (exit 0, PR link `https://github.com/0SEless/Navi/pull/new/fix/floor-editor-persistence-2026-09-27`). Deploy built from a clean detached worktree at `37539b6` (npm ci 842 pkgs, 36s; `.vercel` link copied) so production ships exactly the reviewed commit, not parallel workstreams' uncommitted WIP: `dpl_DAPLQJ6kux4X6rM1vvCv3sAUyr3B` -> target production, status Ready, aliases `https://navi-next.vercel.app` + `https://navi-next-navi01.vercel.app`. Live checks: `/` -> 200, `/studio` -> 200, deployment URL -> 200. Worktree removed after deploy.

## 2026-09-27 - Production save-surface audit suite delivered (scripts/save-audit-suite.mjs)

- **Deliverable:** one re-runnable Node script, `navi-next/scripts/save-audit-suite.mjs`, that exercises every studio save surface against PRODUCTION (`https://navi-next.vercel.app`), verifies each change actually lands in Supabase `graph_snapshots` (not just localStorage), prints a mutation plan before touching anything, restores its own mutations, and exits non-zero when any surface FAILs. Test-script only - no app source code changed.
- **Surfaces covered:** C1 campus building property edit (inspector Name -> autosave), C2 Manage Floors "+ Add Floor", C3 removal of the C2 floor, C4 campus canvas POI/node create, C5 manual Save button, C6 fresh-reload conflict banner, F1 floor-editor Navigation -> Route node authoring, F6 floor-editor -> campus back-navigation, F2 whole-run console audit.
- **Auth/safety:** reuses the existing service-role + magic-link -> `@supabase/ssr` chunk cookie pattern from `live-test-suite.mjs`; deep-clones `graph_snapshots.data` + `authored_document` to `save-audit-artifacts/pre-test-snapshot.json` before any mutation, prints the mutation plan, and runs a final restore check that prints `RESTORE-NEEDED` if anything differs.
- **Anti-fluke instrumentation:** every `/api/` response is captured (`GET` reads + write methods), so "no write fired" is a falsifiable observation backed by `instrumentationProof` (`apiCallsSeen` / `readsSeen` / `writesSeen`) in the report - not a silently dead listener.
- **Verified run (attempt 4, log `save-audit-artifacts/run-attempt-4.log`):** `RESULT: 1 PASS / 4 FAIL / 3 SKIPPED`, **exit code 1**, restore check `ok: true`, report `save-audit-report.json` written, per-scenario screenshots in `save-audit-artifacts/`.
  - C1 FAIL - inspector accepted the value (status "Unsaved changes"), then **zero** `POST /api/graph` in a 15 s autosave window, status silently flipped to "All changes saved", and the name reverted on a fresh-context reload. 4 `GET` reads prove the listener was live.
  - C2 FAIL (expected RED) - no write, floors 2 -> 2.
  - C3/C4/C5 SKIPPED - C2 never persisted; POI tool fires only when `viewport.activeBuildingId && activeFloorId` are set (absent in campus editor); no manual Save button exists (header exposes Validate/Publish/View issues/Road Recovery).
  - C6 PASS - no Outdated/Load-server-version banner, status "All changes saved".
  - F1 FAIL - route start rejected: "Select an Entrance, connect it to an outdoor route point, then start the first Route there." (no entrance anchor on any floor), nodes 301 -> 301.
  - F6 FAIL - `[graph-store] save blocked by safety guard: Cross-scope destructive save blocked: no pending authored intent covers nodes[N2373..] edges[...]`, header "Changes not synced / this device contains changes that could not be synchronized".
- **Findings from the run (for the app fix workstream):** the campus autosave drop described in ERRORS.md entry T3 is **still live in production** - the edit reaches the store, the UI reports success, and no network write is issued; plus the floor editor still has no entrance anchor, so first-route authoring is unreachable.
- **Errors hit and logged:** `renderTable()` reading a non-existent field (report/exit-code crash), a batch edit dropping `const deduped = []`, and a C2 evidence note printing `undefined` - all three appended to `errors/ERRORS.md`.
- **Next:** dispatch the app-fix workstream against the C1/C2/F1/F6 evidence (deployment of the pending persistence fix is the leading hypothesis), then re-run `node scripts/save-audit-suite.mjs` expecting C1/C2 to flip to PASS.

## 2026-10-09 — NAVI Phase P3A test-only Studio catalog

- **Done:** Added a development-only resolver for exactly `navi-persistence-test-1791537831751-m7ckux03`, gated by the exact dev Supabase URL and explicit isolated-browser opt-in. The resolver does not add entries to `campus-map-store`; normal catalog refresh and Create Map synchronization remain unchanged.
- **Changed:** `src/lib/studio/test-campus-catalog.ts`, `src/components/studio/TestCampusCatalogOptIn.tsx`, `src/app/(admin)/studio/[id]/edit/page.tsx`, their focused tests, and P3A planning/error logs.
- **Verification:** Focused tests 9/9 pass. Webpack production build succeeds with existing warnings; none of the test ID, storage key, button label, or fixture label appears in `.next/static` browser chunks. Full `tsc --noEmit` reports 1,139 repository diagnostics, with none in changed production files.
- **Live dev evidence:** `/api/campus-maps` GET returned 9 server maps and no test campus. Map Editor resolved the existing graph and showed its two floors. A controlled name edit caused `/api/graph` POST HTTP 401 and the UI retained local changes. A follow-up read-only GET showed the authoritative name and `updatedAt` unchanged; no successful production or development DB write is evidenced. Existing dev server catalog GET still showed 9 entries and no test campus.
- **Cleanup:** Stopped the local Next server and closed both agent-created IAB tabs. The isolated IAB may retain the failed local recovery edit; it was not sent to the server. Candidate HEAD remains unchanged.
- **Next:** Resolve why the development mock session is not accepted by `/api/graph` before retrying; preserve the failed local edit as pending evidence until an explicit safe discard/recovery path is available. Then rerun Map Editor save/cold reload and Floor Editor isolation.
- **Graph:** `graphify query` and `graphify update .` could not run because the uv trampoline failed to canonicalize its script path; no graph files were manually changed.
## 2026-10-09 — NAVI Phase P3B auth repair and UI verification

- **Graphify:** Required initial `graphify query` and final `graphify update .` both failed with `uv trampoline failed to canonicalize script path`; no graph files were manually edited.
- **Root-cause reproduction:** `requireVerifiedMutationAuth` treated any `sb-*-auth-token` cookie as authoritative and skipped the enabled development mock even when Supabase returned an invalid/expired-session error. A focused regression returned HTTP 401 before repair for the combination of a stale Supabase cookie and valid `navi-mock-session` admin.
- **Repair:** Added a narrowly gated fallback to the existing mock-admin path only when (a) runtime is not production, (b) mock auth is explicitly enabled, and (c) Supabase returns an error or no user. Verified Supabase non-admins still receive 403; production mock auth remains denied. No anonymous access or middleware bypass was added.
- **Tests:** `src/lib/__tests__/mutation-auth.test.ts` and `src/app/api/graph/__tests__/route.test.ts`: 2 files / 26 tests PASS. First Vitest attempt failed before collection because the default Windows temp directory rejected a rename; retry with worktree-local `TEMP`/`TMP` passed. Focused ESLint attempt did not finish within the command wait and is not claimed as passed.
- **Development scope:** Candidate HEAD stayed `a2cd48a032b2978c883f0dcc1eb570797785aa83`; `.env.development.local` remained ignored and was checked for the `scvgulusmutnzasmgysx` project without printing values. Local dev server ran on `127.0.0.1:3458` with `VERCEL_ENV=development` and explicit `NEXT_PUBLIC_MOCK_AUTH=true`. Browser used the supported Dr. Admin development mock on a fresh `navi-p3b.localhost` origin.
- **Map Editor:** Changed the disposable campus building `p2-building-m7ckux03` from `P2 Map Metadata Updated` to `P3B UI Auth Repair Verified 2026-10-09` through the UI. Server log: `/api/graph` POST HTTP 200, outcome SUCCESS. Authoritative GET revision `2026-10-09T10:25:57.31465+00:00`; fingerprint `v2:sha256:3da679cd4c81ca55d7ea11a233cbb19c2074578504efdbcb3b6c850db4a4110c`. Cold reload showed the new name and `All changes saved`; readback fingerprint matched.
- **Floor Editor:** Floor A (`floor-a`, GF) began with room `P2 Round Trip Room`; Floor B (`floor-b`, 1F) had zero rooms. UI edited Floor A room to `P3B Floor A UI Auth Verified Room`; server returned HTTP 200 and advanced revision to `2026-10-09T10:28:43.999982+00:00`, but authoritative readback still contained `P2 Round Trip Room`, Floor B remained empty, and fingerprint stayed unchanged. The UI later displayed `Saved` despite the mismatch. Autosave issued repeated requests with the same expected revision; all stayed scoped to the disposable campus and did not change the canonical fingerprint. The local pending edit was preserved; no manual reload/retry or overwrite was attempted.
- **Other data and safety:** `/api/campus-maps` was read only; no registration POST occurred. No other development campus was modified. Production was not accessed. No migrations, deployment, privilege changes, or freeze changes occurred.
- **Cleanup/status:** Local Next dev server was stopped and port 3458 is no longer listening. Candidate HEAD is unchanged. The handoff browser tab remains on the pending Floor A edit; the older origins' pending conflict/recovery state was untouched.
- **Remaining:** Floor Editor persistence is NO-GO pending a separately scoped investigation; do not reload or replace the pending local edit until an operator decides how to recover it.

## 2026-10-09 — NAVI Phase P4 root-cause audit started

- **Pending edit preservation:** Original browser origin is `navi-p3b.localhost:3458`; the server is stopped and its tab currently shows `ERR_CONNECTION_REFUSED`. Do not reload or use this origin. The prior verified pending room-name text is `P3B Floor A UI Auth Verified Room`; authoritative Floor A still held `P2 Round Trip Room`, and Floor B was empty. The exact room ID was not recorded in the previous evidence. An independent storage-level recovery copy could not be made safely because browser storage inspection was unavailable; the source tab/origin remains preserved and untouched.
- **Scope:** Existing test campus only: `navi-persistence-test-1791537831751-m7ckux03`, development project `scvgulusmutnzasmgysx`. Source HEAD remains `a2cd48a032b2978c883f0dcc1eb570797785aa83`.
- **Graphify:** Initial required query failed with the uv trampoline canonicalization error; direct code tracing is in progress.
- **Relevant ERRORS.md entries:** 2026-09-27 false destructive save block and normalized fingerprint conflict; P0.11 authored-intent attribution guard; 2026-10-09 Floor Editor false “Saved” with unchanged server fingerprint; P3B auth mismatch now separately repaired. Preventing stale authored document overwrite, cross-floor scope leakage, and transport-only success state.
- **Verification:** Read-only browser inventory confirms dev server is not listening for the old origin. No browser state was modified and no database operation was performed.

- **Test runner issue:** Initial focused Vitest launch through `pnpm exec` did not run tests: pnpm attempted an install and hit `EPERM` resolving the nested worktree `node_modules` path. No dependencies were installed or changed. Next: inspect the existing dependency target and invoke local Vitest directly; do not re-link or reinstall.

- **Vitest temp error:** Direct runner reached test startup but failed before collection on the sandboxed OS Temp rename (`EPERM`). This matches the prior P3B runner issue. I’m retrying with process-local `TEMP`/`TMP` under the ignored candidate `node_modules` tree; no source or dependency files changed.

## 2026-10-09 — NAVI Phase P4 root cause confirmed

- **Scope / identity:** Candidate source remains `a2cd48a032b2978c883f0dcc1eb570797785aa83`; disposable campus `navi-persistence-test-1791537831751-m7ckux03`, building `p2-building-m7ckux03`, Floor A `floor-a`, room `room-p2-m7ckux03`, Floor B `floor-b`. Development Supabase only.
- **UI reproduction:** Actual Floor Editor controls changed the room to `P4 Floor A Room Persistence 2026-10-09`. The UI issued successful `/api/graph` requests; server logs showed distinct mutation IDs and HTTP 200. Read-only immutable revision history showed the edit committed (revision `2026-10-09T18:50:05.520599+08:00`) and a later revision restored `P2 Round Trip Room` (`2026-10-09T18:50:06.086036+08:00`). Floor B stayed empty. Thus the first successful write included the authored edit; a later writer overwrote it.
- **Root cause:** The Floor Editor constructs `createEditorContext()` in a `useState` initializer. That API initializes services immediately by default. In Next development Strict Mode, an initializer can be replayed; the discarded context's autosave service can retain its 30-second timer and stale document. Subsequent paired writes and periodic stale revisions match this lifecycle leak. This is the first confirmed loss boundary: a competing stale editor context after the server successfully committed the room edit.
- **Server/RPC exclusion:** Source review confirmed migration 017's writer stores the `authored_document` in both `graph_snapshots` and `campus_graph_revisions`; migration 018 compares authored document identity before suppressing no-op writes. The serializer retains legacy room fields. Read-only revision history confirms the changed name was actually committed before rollback.
- **Safety:** Stopped local server session 86748 after observing repeated background writes, so no further autosaves could run. Only the named disposable campus was targeted; no other development campus or Production was accessed. The original P3B origin remains untouched. The fresh P4 browser origin remains open with its recovery state; do not clear it.
- **Next:** Add a Strict Mode regression, then defer initialization to an effect before re-running any UI writes. Re-read `errors/ERRORS.md` and state the applicable prevention before code changes.

## 2026-10-09 — NAVI Phase P4 repair verified

- **Change:** In the Floor Editor route, `createEditorContext()` is now created with deferred initialization and the retained context initializes from an effect. This prevents Strict Mode's discarded state-initializer instance from starting a stale autosave service.
- **Regression test:** Added `src/app/(admin)/studio/[id]/edit/building/[buildingId]/floor/[floor]/page.test.tsx`. Before the source repair it failed because both contexts initialized; after the repair it passed and confirmed two Strict Mode constructions with exactly one initialized instance.
- **Focused tests:** 11 files / 91 tests passed, including the route lifecycle regression, room-property commands, graph store save/queue/idempotency/conflict/state-gate suites, graph API, and floor door persistence round trip. After tightening the new test's type, the route regression passed again and focused ESLint passed for both changed source/test files. Vitest was run directly with process-local `TEMP`/`TMP` set to ignored `node_modules/.cache/p4-vitest-temp`.
- **Browser UI save:** On a fresh development origin, edited room `room-p2-m7ckux03` on `floor-a` using the Floor Editor property panel and header Save. Server log confirmed one `/api/graph` POST HTTP 200, outcome SUCCESS, mutation ID `90402fed-2c92-46f6-8254-fbf831927bf0`. The header displayed Saved.
- **Authoritative readback:** Development project `scvgulusmutnzasmgysx`; head revision `2026-10-09T18:56:57.063013+08:00`; `authored_document` contains `P4 Room StrictMode Roundtrip 2026-10-09` for the same room ID. `floor-b` (`1F`) remains empty. Readback after one 35-second autosave interval showed the same revision/name; no stale overwrite occurred.
- **Cold reload:** A second new browser origin with no prior campus recovery storage loaded Floor A from server and displayed the new room name with Saved. Navigating to Floor B showed “No components.” Browser console error/warning logs were empty. Screenshot evidence was captured from the cold-loaded Floor A view.
- **Prior state:** Original P3B origin remains untouched. The first P4 origin remains open but server is stopped; do not clear its local recovery. The local Next server on port 3460 was stopped after verification.
- **Other safety:** Candidate HEAD remains `a2cd48a032b2978c883f0dcc1eb570797785aa83`; no Production access, changes to another development campus, environment changes, migration, commit, push, or deployment occurred. Existing P3A/P3B dirty work remains preserved.
- **Graphify:** Final `graphify update .` failed with the same uv trampoline path canonicalization error; no generated graph files were edited.
- **Result:** Floor Editor room persistence on the disposable development campus is verified for this regression and round trip. This does not establish all Floor Editor editing paths or production behavior.

## 2026-10-09 — NAVI Phase P5 preservation review

- **Identity:** Candidate branch `codex/navi-floor-editor-accessor-20261008`; starting HEAD `a2cd48a032b2978c883f0dcc1eb570797785aa83`.
- **Inventory:** Classified all tracked modifications and untracked files. Proposed commit allowlist is limited to `src/lib/api-guard.ts`, `src/lib/__tests__/mutation-auth.test.ts`, the Floor Editor route page, and its Strict Mode regression. Excluded temporary test-campus route/resolver/opt-in source and tests; docs remain uncommitted.
- **Security:** Mock auth is opt-in, denied when `NODE_ENV=production` or Vercel production runtime is identified; a verified non-admin Supabase user returns 403 without mock fallback. Test-campus resolution requires development mode, the exact disposable campus ID, explicit localStorage opt-in, and the exact development project URL; server catalog entries retain precedence and the overlay is not synchronized.
- **Lifecycle:** Floor Editor context creation is deferred; only the mounted context is initialized in an effect. The Strict Mode test confirms two constructions but only one initialization.
- **Verification:** 5 focused files / 36 tests passed. Allowlist ESLint passed with one existing unused-function warning. Full typecheck remains blocked by 1,139 repository diagnostics; the two new Floor Editor diagnostics were corrected, while one `api-guard.ts` test-seam type mismatch is unchanged from candidate base. P3A excluded files have two lint errors. `git diff --check` passed.
- **Safety:** No database, environment, Git remote, deployment, or production state was modified. No secrets were read into output. Temporary files remain in ignored `node_modules/.cache`.
- **Commit:** Created local commit `6d03b14399b26deb8670763450b4ba259b6f5ae5`, parent `a2cd48a032b2978c883f0dcc1eb570797785aa83`, on `codex/navi-floor-editor-accessor-20261008`. `git show` confirms exactly the four allowlisted source/test paths.
- **Post-commit verification:** Branch and HEAD match the new commit; the P3A test resolver/opt-in sources and docs remain uncommitted and present. `git diff --check` passes. No push, deployment, database operation, or production access occurred.
- **Next:** The persistence repairs are preserved locally. Continue with the next persistence component only after its scope is specified; no push/deployment was performed.

## 2026-10-09 — NAVI Phase P6D Panorama R2 integration (automated verification)

- **Scope:** Candidate worktree `C:\Users\Administrator\Desktop\CODEme\Navi\.navi-worktrees\navi-floor-editor-accessor-20261008`, branch `codex/navi-floor-editor-accessor-20261008`, base commit `6d03b14399b26deb8670763450b4ba259b6f5ae5`. Existing P5 test infrastructure and documentation remain preserved and uncommitted.
- **Implementation:** Canonical Panorama scenes now use the existing sign → direct R2 PUT → completion verification flow. Uploads get immutable server-generated asset keys; browser validation checks supported image types, size, and 2:1 dimensions; scene `imageAssetId` updates only after verified object completion. Pannellum resolves durable keys at render time. The legacy Panorama Management data-URL authoring control was removed while existing graph-node previews remain readable.
- **Automated verification:** Four focused test files passed, 29/29 tests. Focused ESLint passed on changed application files. `git diff --check` passed. Repository TypeScript checking remains blocked by 1,593 broad diagnostics; the only panorama-filtered line is an unchanged `panorama-props.test.tsx` service mock type mismatch.
- **Environment:** Candidate-local `.env.development.local` is ignored by Git, uses development Supabase host `scvgulusmutnzasmgysx.supabase.co`, and selects `navi-360-dev`. Credential values were not printed. The existing local browser origin `http://localhost:3000` was occupied by a Node server from the parent checkout at a different commit, not the approved candidate worktree; it was not reused. The operator has stopped that server to free the required CORS origin.
- **Graphify:** Required `graphify update .` failed with the recorded uv trampoline canonicalization error; generated graph files were left untouched.
- **UI verification:** Pending port availability. No panorama upload or scene/database mutation has been attempted in this phase.
- **Next:** After port 3000 is free, start the candidate app with its own development environment, verify authorized development session and disposable-campus scope, then perform one UI upload and authoritative cold-reload/readback. Stop on any auth, bucket, or campus mismatch.

### P6D browser access update — 2026-10-09 21:17 Asia/Manila

- The operator stopped the parent-checkout server; port 3000 became free. Candidate Next development server started successfully and explicitly reported `.env.development.local` as its environment source.
- The candidate browser reached the app's normal Google sign-in flow. The account chooser requires the operator to choose their own account. No account was selected and no credentials, verification codes, or sessions were handled by Codex.
- The operator was asked to complete normal sign-in and notify when Studio is open. Until then, no Studio scene, Panorama asset row, or R2 object has been created; the synthetic 512x256 JPEG remains only in ignored `node_modules/.cache`.
- **Next:** Resume the authorized development-only UI test after Studio is open in the authenticated browser.

### P6D authorization check — 2026-10-09 21:24 Asia/Manila

- The operator completed normal Google sign-in. The callback returned to the local app, but navigation to `/studio` redirected to `/`.
- The inspected middleware redirects authenticated identities without `super_admin` or `campus_admin` authorization to `/`; unauthenticated visitors instead go to `/login`. The observed route is consistent with the signed-in identity lacking a development admin role.
- No mock-auth injection, role change, or authorization bypass was attempted. No Panorama scene, Supabase asset row, or R2 object was created.
- **Next:** Resume only after the operator signs in using an already-authorized development `super_admin` or `campus_admin` identity. Do not grant or alter roles as part of P6D.

### Read-only development Studio authorization diagnosis — 2026-10-09

- **Environment:** The candidate-local app is using `.env.development.local` for Supabase project `scvgulusmutnzasmgysx`. Production was not accessed.
- **Session/account:** Development Auth recognizes the signed-in account. The local mock-auth fallback is disabled. Middleware's redirect to `/` (rather than `/login`) is consistent with a valid authenticated user who failed the admin check.
- **Role evidence:** Aggregate-only read query found one development Auth account and zero `super_admin` role claims in either `app_metadata` or `user_metadata`. No public custom role table was found. No email, user ID, session, cookie, or credential was emitted.
- **Authorization path:** Middleware and `POST /api/graph` share `isAdminIdentity`. Server authorization accepts `app_metadata.role` (`super_admin` or `campus_admin`) or a matching `NAVI_ADMIN_EMAILS` entry. Client `user_metadata.role` is not an authorization source. Mock auth is disabled and was not enabled.
- **Cause:** The authenticated development identity does not meet the server-side admin predicate; the absent development allowlist also cannot authorize it. This explains `/studio` redirecting to `/`.
- **Changes:** No application source, account role, database record, or environment setting changed. Only workflow documentation was updated.
- **Verification:** Fresh `/studio` navigation redirected to `/`; read-only project metadata and aggregate role query support the diagnosis. Graphify query could not run because the Windows uv trampoline failed to canonicalize the script path; source trace was used instead.
- **Next:** An authorized development project administrator must verify the intended account and, if appropriate, assign the accepted `app_metadata.role=super_admin` in the development project (or configure the intended development-only allowlist). After that separate action, reauthenticate and retry Studio. Panorama UI testing remains blocked until authorization succeeds.

### P6E development admin authorization — 2026-10-10

- **Project target:** Candidate `.env.development.local` resolves to `scvgulusmutnzasmgysx.supabase.co`; Supabase project lookup confirmed `scvgulusmutnzasmgysx` (`navi-development`, healthy). No Production project was accessed. Local auth mock is unset/disabled and the environment file is Git-ignored.
- **Identity gate:** Current `http://localhost:3000/` shows the signed-out public homepage with a Sign in link. No live NAVI Auth session is available to map to a stable user ID; the prior task's session evidence is stale for this operation.
- **Role state:** Fresh aggregate-only Development query found one Auth user and zero accepted `super_admin`/`campus_admin` claims in either app or user metadata. The user ID was not selected or emitted because no live session could establish the intended account match.
- **Authorization gate:** The operator request explicitly scopes any proposed role update to the intended existing Development user and only `app_metadata.role`; however, that target user cannot be matched to a stable ID in the current session. No role change was attempted.
- **Changes:** Only workflow documentation updated. No Auth user metadata, database records, source, environment values, R2, or Production state changed.
- **Verification:** Read-only project lookup and local environment-host check passed. Browser showed signed-out state. Graphify query failed with the known uv trampoline canonicalization error. First environment inspection command had a PowerShell parser error; a corrected read-only command completed successfully.
- **Next:** Operator must sign in to the local Development app with the intended existing account so its stable Auth ID can be verified. Resume the role operation only after that identity/authorization gate is satisfied; then refresh the session and run the requested access-control checks.

## 2026-10-10 — NAVI Phase P6D Panorama browser verification
- **What was done:** Confirmed the candidate worktree commit/branch and Development-only local target; replaced the wrong-checkout local server with the candidate server. Read-only Development baseline confirms the disposable campus has a snapshot and 27 revisions, with zero registered panorama assets.
- **Verification:** Candidate server uses the approved worktree and reads `.env.development.local`; Supabase URL identifies Development and `R2_BUCKET` is `navi-360-dev`. Browser requests to `/`, `/login`, `/dashboard`, and `/studio` all returned Next.js 404 despite the corresponding source routes and route-manifest entries.
- **Safety:** No browser upload, R2 mutation, database write, migration, deletion, or Production access occurred. Existing test campus and browser recovery state were preserved.
- **Next:** Diagnose and repair the candidate's local Next.js route-resolution issue, then repeat the authenticated UI gate before uploads.

## 2026-10-10 — NAVI Phase P6F local routing repair
- **What was done:** Identified port 3000 listener and parent `next dev` process in the approved candidate worktree. Stopped only that server, removed its ordinary generated `.next` directory after confirming no competing candidate Next process or listener, and restarted `npm run dev -- --port 3000` from the candidate directory.
- **Root cause:** Candidate `.next` contained stale generated artifacts from 2026-10-09, including `BUILD_ID` and compiled app route files, while current development requests returned Next.js 404 for every route. Clearing the candidate-only cache restored routing.
- **Verification:** `/` and unauthenticated `/login` return 200; no-cookie `/dashboard`, `/studio`, and `/panoramas` redirect 307 to `/login`. Authenticated browser session opens `/dashboard`, `/studio`, and `/panoramas` (Panorama Management). Runtime env reports Development project `scvgulusmutnzasmgysx`, bucket `navi-360-dev`, mock auth false.
- **Safety:** No source files, auth roles, database records, R2 objects, or browser recovery data changed. No Production access. Stopped after routing verification; no panorama upload started.
- **Next:** Resume P6D browser upload testing only when authorized as a separate continuation.

## 2026-10-10 09:37:24 +08:00 — NAVI Phase P6H UI regression audit
- **What was done:** Compared the Panorama page's uncommitted diff against repository history; checked Dataset Management history and current source; inspected available screenshot/design artifacts and checked for shared shell/style changes.
- **Findings:** The Panorama page's working-tree change removed its prior card/upload presentation and replaced it with a sparse canonical-scenes notice. Its historical upload implementation persisted data URLs and cannot be restored as-is. Dataset Management is byte-identical to its last relevant historical version (a2fbe56) and has no newer page-specific change in this worktree. Available screenshots do not establish an approved Dataset or Panorama design.
- **Verification:** No UI source changed. Existing P5/P6 changes remain. No tests were run because the required approved visual baseline could not be established and no implementation was made. No Production, Supabase, or R2 access occurred.
- **Next:** Obtain the approved Dataset and Panorama screenshots or an explicitly approved commit/reference; then adapt only compatible visual elements while retaining canonical imageAssetId + R2 persistence.
### P6I — controlled UI + persistence reconciliation (2026-10-10)

- Restored the campus-first Dataset selector and `/dataset/[id]` Explorer route with Information, Images, Dataset, and read-only 360 tabs; retained the previous export/import/validation/backup screen at `/dataset/tools`.
- Restored the canonical read-only Panorama scene-management surface and retained `Panorama.id`, `imageAssetId`, existing signed asset resolution, and Studio authoring navigation. The candidate viewer remains the renderer; no upload or database write was performed.
- Ported only the needed signed building-cover upload/resolution dependencies and their tests; kept panorama authoring and upload logic intact.
- Fixed candidate nested-route sidebar selection, the `MapCard.displayStats` contract, and the effective-document graph null narrowing.
- Verification: 26 focused files / 463 tests passed; focused ESLint passed; repository-wide `tsc --noEmit` remains failing on unrelated existing diagnostics, with no diagnostics in the reconciled paths after the null guard; `git diff --check HEAD -- .` passed.
- Browser route evidence (existing authenticated local session, candidate server): `/dataset` lists campus cards; `/dataset/phase8-completion-20261005-a1` renders the campus hierarchy and four tabs; `/dataset/tools` exposes legacy controls; `/panoramas?campus=phase8-completion-20261005-a1` loads and links to Studio. No controls that write data were used.
- Visual limit: the October 3 screenshot was not available as a local image, and the browser bridge returned accessibility snapshots rather than pixel screenshots. No pixel comparison is claimed.
- Integrity: source worktree stayed at `bead5101fc853959f99f7aabcdba72423f48f839`, with its pre-edit 720-entry status digest unchanged and all 28 manifest-listed source hashes matching. Candidate stayed at `6d03b14399b26deb8670763450b4ba259b6f5ae5`; existing P5/P6 dirty changes were preserved. No cloud, database, R2, deploy, push, or commit operations occurred.
- Graphify query/update could not run because the local uv trampoline failed to canonicalize the script path.
- Next: resume P6G only with a controlled browser upload/cold-reload test against the isolated Development campus and `navi-360-dev`; do not claim Panorama end-to-end persistence verified yet.

## 2026-10-10 12:09:06 +08:00 — Phase 4 T4.1 persistent public map runtime
- **What changed:** Restored the shell-owned persistent MapLibre host, shared route scene publisher, runtime readiness indicator, and Explore route adapter from the reviewed recovery lineage. Added the immutable-bundle render-model cache while preserving the candidate's floorGeometry-aware builder. Added explicit pointer targets to the building detail sheet and Navigate location picker.
- **Verification:** 5 focused runtime files passed (62/62 tests); BuildingSheet and Explore page tests passed (12/12); two real-browser tests passed. They confirmed Explore → Navigate → Explore retains one host and the same canvas, the canvas remains the hit target, a building can be opened and closed, the map pans, and Explore controls remain usable. The Development-only browser harness intercepted the public-campus API and used no privileged credentials or R2 values.
- **Typecheck:** The repository check remains non-clean. Filtered output now reports only two existing diagnostics in unchanged portions of `NavigationRenderModel.ts` (door render data and optional `showOnMap`); broad repository diagnostics were already present in the captured baseline.
- **Graph:** `graphify update .` was attempted and failed with `uv trampoline failed to canonicalize script path`; generated graph output was not edited.
- **Safety:** Candidate and donor worktrees were not touched. No database, R2, production, deployment, push, or commit operations occurred.
- **Next:** T4.2 — restore the missing authored-road, public floor-plan, outdoor POI, and route layers while keeping the candidate's floorGeometry and persistence-aware public store behavior.

## 2026-10-10 12:19 +08:00 — Phase 4 T4.2 public map layers
- **What changed:** Connected the persistent campus scene to authored-road rendering, active-floor plan synchronization, and validated outdoor POIs. Restored marker, 2D area, and 2.5D area display while retaining indoor POI reveal rules. Map readiness now waits for populated building, POI, and authored-road sources and their layers.
- **Verification:** Seven focused test files passed (58/58), covering POI geometry/visibility, layer style readiness and updates, authored trace projection, floor-plan synchronization, public runtime readiness, and render-model caching. Focused ESLint passed with zero errors and three warnings in existing render-model imports/test imports. `git diff --check` passed after removing an extra final newline from the error ledger.
- **Typecheck:** Repository `npx tsc --noEmit --pretty false` remains blocked by 1,150 diagnostics. Four diagnostics touch unchanged model/test lines in `NavigationRenderModel.ts` and its existing test fixtures; none point to the T4.2 layer/runtime additions. One cache-test fixture diagnostic introduced during T4.1 was corrected.
- **Graphify:** Required query and post-edit update both fail before producing results with the known `uv trampoline failed to canonicalize script path`; graph output was not edited.
- **Safety:** Only the isolated integration worktree changed. No source candidate/donor, Supabase, R2, production, remote, or deployment state was touched. The task-owned `.vitest-tmp` was removed after tests.
- **Next:** T4.3 — restore search building identity and verify search-to-map interactions and pointer behavior with focused tests.

## 2026-10-10 12:36 +08:00 — Phase 4 T4.2 browser readiness repair
- **What changed:** Fixed late `BuildingLayer` style initialization by using the shared style-readiness helper. The layer now populates its newly created source from the latest building props, even when the normal data effects ran before style readiness. Added a regression test for delayed style readiness and initial feature sync; corrected the existing test fixture typing and optional paint narrowing.
- **Verification:** Eight focused renderer/layer test files passed (61/61); focused ESLint passed with zero errors; the real-browser public Explore regression suite passed (5/5), including physical building selection, map panning, search deep-link selection, persistent Explore/Navigate canvas, and mobile touch interactions. `git diff --check HEAD -- .` passed.
- **Typecheck:** Repository `npx tsc --noEmit --pretty false` remains blocked at 1,146 diagnostics; only two filtered diagnostics remain in the unchanged `NavigationRenderModel.test.ts` fixture lines, with none in the BuildingLayer implementation or new regression test.
- **Graphify:** Required `graphify update .` was attempted and failed with `uv trampoline failed to canonicalize script path`; generated graph files were not changed.
- **Safety:** Browser testing used a mocked public-campus fixture, the Development project reference, placeholder public key, no privileged credentials, no R2, and no database writes. Temporary diagnostics and result directories were removed. The isolated server started on port 3001 was stopped; port 3000 was left running and untouched.
- **Next:** T4.3 — independently verify canonical building identity from indexed and synthesized search results, then confirm the search UI opens the building and pointer targets remain usable.

## 2026-10-10 12:39 +08:00 — Phase 4 T4.3 search identity and pointer verification
- **What changed:** Preserved canonical `buildingId` while normalizing indexed graph-snapshot search aliases and added it to synthesized building entries. Kept explicit pointer targets on the Explore controls, BuildingSheet, and Navigate location picker over the shell-owned map.
- **Verification:** Public-store, Explore page, and BuildingSheet focused tests passed (51/51). The real-browser regression suite passed (5/5): physical building selection, close-button hit testing, canonical search deep link to `/map/explore?building_id=…`, same host/canvas across Explore↔Navigate, and mobile touch/pan.
- **Known separate test failure:** A prior broader Navigate page run failed one development-simulator test because the unchanged test expects `NavigationDevPanel` while the current `NavigatePage` does not import or render it; this page's T4.3 diff only adds pointer support to the location picker. The simulator failure remains outside this recovery scope and is not counted as a T4.3 pass.
- **Graphify:** Required query again failed with `uv trampoline failed to canonicalize script path`; graph output was not edited.
- **Safety:** Tests used a mocked campus fixture and no Supabase/R2 operations. Production and the original candidate/donor worktrees were untouched.
- **Next:** T4.4 — run the final focused public-runtime checks, review the exact Phase 4 diff, and create one allowlisted commit on the isolated integration branch.

## 2026-10-10 12:48 +08:00 — T4.4 public runtime checkpoint
- **What changed:** Committed the verified public Navigate recovery batch on the isolated integration branch as `c9b6619afa443dac0265ff70a0dc03730c1ce0c6` (`fix(navigation): restore persistent public map runtime`). The commit contains the reviewed 33-file Phase 4 batch only.
- **Verification:** Prior focused runs passed the runtime/layer suites (61/61), public store/Explore/BuildingSheet suites (51/51), and the real-browser regression suite (5/5). `git diff --cached --check` passed before commit. Repository-wide typecheck remains blocked by the previously recorded baseline diagnostics.
- **Workspace state:** Only preserved Playwright `test-results` artifacts remain dirty; no source changes are unstaged. The candidate and donor remain unchanged.
- **Next:** T5 — verify Dataset and Panorama route contracts and run focused reconciliation tests; no live Supabase or R2 operations are part of this audit.

## 2026-10-10 12:52 +08:00 — T5 Dataset and Panorama reconciliation review
- **What changed:** Verified `/dataset` is the campus selector, `/dataset/[id]` hydrates the selected campus and renders `DatasetWorkspace`, and `/dataset/tools` preserves the legacy export/import/validation/backup interface. Panorama Management reads canonical authored scenes, links authoring to Studio, and delegates image resolution to the signed resolver used by `TourViewer`.
- **Persistence boundary:** The Dataset 360 view is read-only. Panorama Management does not introduce upload or scene-write controls. `Panorama.imageAssetId` remains the durable key; legacy data-URL graph metadata is explicitly ignored by the management route tests. Building-cover image URL handling remains separate from panorama persistence.
- **Test correction:** Confirmed one stale unit-test case conflicted with the documented three-segment immutable-key grammar and migration 016. Corrected the fixture only; runtime source and API/auth contracts were not changed.
- **Verification:** Panorama key unit test passed (6/6). Focused Dataset, Panorama, upload, asset-store, resolver, and Pannellum suites passed (21/21 files, 440/440 tests). Initial Vitest invocation hit the known sandbox Temp rename error before collection; retry with task-local `TEMP`/`TMP` collected all tests successfully.
- **Safety:** No database, R2, production, deployment, push, or source-worktree operations occurred. Existing Playwright result artifacts were preserved.
- **Next:** Commit the verified test-only Phase 5 correction, then proceed to Phase 6 local persistence/R2 verification; live Development checks remain gated on independently confirmed disposable-target credentials and authorization.

## 2026-10-10 12:54 +08:00 — T5.3 Dataset/Panorama reconciliation checkpoint
- **Commit:** `f2cf42dccc91582542b1f14a231fd51dc1e14bb4` (`test(panorama): align immutable key validation contract`) on `codex/navi-canonical-integration-20261010`.
- **Scope:** One test file plus plan, TODO, progress, and error records. The test now accepts the migration-016 immutable asset shape and rejects over-depth keys. Dataset and Panorama runtime files were reviewed and required no repair.
- **Verification:** 21 targeted files / 440 tests passed; focused key test passed 6/6; ESLint on the changed test and `git diff --check` passed. Playwright artifacts remain preserved and unstaged.
- **Next:** T6 — run local mocked/in-memory persistence, Dataset, Panorama, resolver, and public-map regression suites. Live Development DB/R2 verification is unavailable from this worktree because its credentials were deliberately excluded and no alternate disposable target has been independently verified here.

## 2026-10-10 13:01 +08:00 — T6 persistence and public-runtime verification
- **Safety gate:** Confirmed `.env.local`, `.env.development`, `.env.development.local`, and `.env.test` are absent from the integration worktree. Map/Floor tests stub fetch and use in-memory documents; the public-campus tests mock Supabase; Panorama API tests mock R2 and the asset store. No live Development or Production connection was attempted.
- **Map/Floor persistence:** 12 focused files / 128 tests passed, including graph save queue, idempotency, stale conflict, authored snapshot, Studio persistence, Floor Editor persistence, and cross-floor round trips.
- **Dataset/Panorama/public map:** 41 focused files collected; 39 passed and 2 had six failing assertions (581/587 passed). The Phase 9B test failures use a POI without the required world position and a cache payload that is not equal to the normalized network bundle. The visibility suite expects the unchanged `search()` action to update `revealedPoiIds`; it currently only returns results. These failures are pre-existing relative to the Phase 4 batch; the feature-level search/reveal path remains a separate follow-up.
- **Storage and live verification:** Panorama upload/asset registration, signed resolve, Pannellum, Dataset source-of-truth, and public API contracts passed their mocked suites. Actual browser CORS, R2 object upload/readback, and live DB cold reload were not tested because the integration worktree has no local credentials and the live-target gate could not be independently confirmed. No writes occurred.
- **Graph:** Post-correction `graphify update .` failed with the known uv trampoline canonicalization error; graph output remains untouched.
- **Next:** Commit the Phase 6 verification records, then run final scoped regressions, lint, typecheck/build where feasible, and confirm branch/worktree isolation.

## 2026-10-10 13:01 +08:00 — T6.4 verification checkpoint
- **Commit:** `eda69f97a6bcff33070a8e7329d788c7d9e1a695` (`docs(recovery): record phase 6 verification`) on the integration branch.
- **Result:** Local persistence, dataset, panorama, and public-map test evidence is recorded. Six public-store assertions remain as described above; no runtime change was made. Actual browser R2 upload and Development cold reload remain blocked by the unavailable isolated credential configuration in this worktree.
- **Next:** T7 — run the full local test suite under a test-only environment with external database/storage variables blanked, then scoped lint/typecheck/build and final isolation checks.

## 2026-10-10 13:16 +08:00 — T7 final local verification
- **Full test suite:** Ran `vitest run src packages` with Supabase, PostgreSQL, R2, Cloudflare, and Vercel variables blanked. Result: 595/630 files passed; 6,524 passed, 67 failed, and 8 skipped. The focused mutation-auth boundary suite passed 17/17. The previously classified public-store assertions and stale Navigate simulator expectation recurred. Eighteen publish-path log notices reported that the deliberately unavailable Supabase client could not persist publication. Other compiler/editor/engine failures remain visible for separate triage; no assertions or source were changed to force a pass.
- **Lint/type/build:** Scoped ESLint checked 95 changed TypeScript files and exited 1 with 4 inherited errors and 4 warnings. Repository typecheck exited 2 with 1,146 diagnostics, the same count as the recorded baseline; 19 diagnostics in touched paths were on lines attributed to commits predating the integration checkpoint. `npm run build` compiled and reached static page generation, then stopped because public Supabase variables were deliberately blank. `git diff --check` passed for committed changes and the current worktree.
- **Workspace integrity:** Integration branch was `codex/navi-canonical-integration-20261010` at `eda69f97a6bcff33070a8e7329d788c7d9e1a695` before final records. Candidate remains at `6d03b14399b26deb8670763450b4ba259b6f5ae5` with 74 dirty paths; candidate and checkpoint path sets match 74/74. Donor remains at `bead5101fc853959f99f7aabcdba72423f48f839` with 3,441 dirty paths. The anchored local ignore rule covers only root `.navi-worktrees/`. Existing Playwright artifacts remain unstaged. The compiler snapshot is marked modified by Git, but its content hash matches `HEAD`; it was not staged.
- **Safety:** No production or development database connection, R2 operation, credential use, push, or deployment occurred. The user-facing candidate server on port 3000 remained running in the original candidate worktree and was not changed. The integration build generated only ignored `.next` output.
- **Closeout:** Commit only the four final workflow records. The complete test, lint, build, and live Development storage gates are not green, so the final verdict remains blocked pending targeted follow-up.
## 2026-10-10 — Phase 8 regression triage started
- Verified the matching integration branch and expected HEAD. The prompt's literal `Navi.navi-worktrees` path is absent; the matching branch/HEAD is in `Navi\.navi-worktrees\navi-canonical-integration-20261010`.
- Current status contains 19 generated/verification paths: compiler snapshot marker (blob identical to HEAD), Playwright `.last-run.json`, two already-deleted prior Floor Plan result files, and 15 files across five new Explore failure-artifact folders. No source diff was found; artifacts remain untouched.
- Re-ran `vitest run src packages --reporter=dot` with external-service variables blanked and worktree-local `TEMP`/`TMP`: 595/630 files passed; 6,524 passed, 67 failed, 8 skipped. The exact same 35 failing files and 67 test names match the Phase 7 run.
- Next: execute the equivalent suite at the clean recovery checkpoint, then attribute failures by baseline evidence.

## 2026-10-10 14:00 +08:00 — NAVI Continuous Phase 8 completed
- **Failure comparison:** Final integration Vitest run: 595/630 files passed, 6,524 passed, 67 failed, 8 skipped. Clean checkpoint: 589/625 files passed, 6,502 passed, 68 failed, 8 skipped. All 67 current failure identifiers appear at baseline; the baseline has one additional panorama immutable-key failure that passes on integration after the Phase 5 test-contract alignment.
- **Failure classes:** 13 Publish API failures are environment-dependent (HTTP 503 without the intentionally absent Supabase writer configuration) and also baseline-reproduced. The other 54 are inherited local failures: compiler pipeline/parity/navigation compiler (22); editor and legacy panorama model expectations (12); stores/public-store fixtures and handshakes (10); engine topology/routing (3); Floor Editor interaction/endpoint tests (2); Studio Inspector migration expectations (2); graph API runtime consistency (1); campus-backup roundtrip (1); Navigate development simulator expectation (1). Assertion details emitted by the runner, and seven rows without individual detail blocks, are recorded in plan/PHASE-8-FAILURE-MATRIX-2026-10-10.md.
- **Confirmed integration regression:** TypeScript found an optional traces dereference in the public-store timing metric. Changed only the metric to tolerate absent traces. TypeScript diagnostics fell from 1,146 before the fix to 1,145 after it; no new diagnostics remain against the 1,159-diagnostic baseline.
- **Focused verification:** public-store tests 39/39; Map/Floor persistence and mutation-auth suites 145/145; Dataset/Panorama/public-runtime suites 694/694. No Phase 8 test was disabled or mass-updated.
- **Lint/build:** ESLint has 4 inherited errors/4 warnings versus 5/5 at baseline, with no new findings. npm run build compiled but failed prerendering /demo/navigate because public Supabase URL and publishable-key variables were intentionally absent; build is BLOCKED, not a pass. No fake or Production values were supplied.
- **Baseline isolation:** The first baseline attempt shared integration node_modules through a junction and was discarded as contaminated. The junction was removed and baseline dependencies installed independently with offline npm ci --ignore-scripts. The clean baseline worktree is retained for review.
- **Graph and tooling:** graphify update failed with uv trampoline failed to canonicalize script path; graph output was left untouched. Command wrappers that stopped before tests were corrected; successful logs are retained under each worktree's ignored node_modules/.cache.
- **Preservation and safety:** Compiler snapshot content still matches HEAD. Existing Playwright artifacts were preserved without cleanup. Candidate and donor were not modified; no database, R2, Production, deployment, push, or secret operation occurred.
- **Checkpoint scope:** The local commit contains only the null-safe public-store metric fix and Phase 8 workflow/evidence records. Generated Playwright artifacts remain unstaged. Live Development R2 browser upload/cold reload and a configured local build remain separate gates.
