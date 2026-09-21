# Progress Log

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

## 2026-09-20 14:30 +08:00 — Production Studio conflict recovery action

- **T1 trace:** The exact warning is produced by `getSaveStatusModel`, rendered by `SaveStatus`, and mounted in the `StudioWorkspace` header beside the unchanged Road Recovery control. `SaveStatus` selects `syncLocalChanges` directly. The authenticated production DOM currently exposes the prior `Sync Changes` action, proving there is no alternate banner or CSS-hidden action; the earlier missing-action screenshot came from an older production artifact/state.
- **Save-block reason:** `syncToSupabase` and `performSyncToSupabase` deliberately reject writes while `syncStatus === 'conflict'`. Local graph/cache mutations remain preserved, and the explicit recovery action is the only safe route back through fingerprint validation and the existing per-campus queue/CAS.
- **T2 RED:** Focused tests failed on the absent `Re-sync` label/handler, a server==local stale-marker case misclassified as divergence, and HTTP 401 surfacing as `Unauthorized`.
- **T3 fix:** Renamed the exact banner action to `Re-sync`; server==local now adopts the authoritative revision without POST; server-at-ack-base refreshes `expectedServerUpdatedAt` before the normal queued save; unknown-base/real divergence remains blocked; 401/403 now use the exact sign-in-again message and remain an error rather than a revision conflict.
- **Review closure:** Added a monotonic campus-session generation around recovery GET/POST work, so late responses cannot mutate either a different campus or a reopened A session after A → B → A. Recovery remains callable from an authentication/preflight `error`; CASE A2 proves pending intents clear on a server-identical snapshot; CASE B proves the POST uses the freshly fetched server revision rather than the stale marker. The final bounded re-review reported no Critical or Important findings.
- **Verification:** Focused sync/store/UI matrix passed 9 files / 58 tests; focused ESLint returned zero findings; `git diff --check` exited 0. The normal production build completed all 41 pages with the existing `.env.production.local` loaded process-only. No Vercel setting or environment value was changed.
- **Graph:** Required elevated `graphify update .` completed: 11,916 nodes / 26,272 edges / 565 communities; visualization was skipped automatically because the graph exceeds the 5,000-node limit.
- **Next:** Commit only the scoped recovery files and workflow records, push `release/navi-auth-fix-2026-09-19`, verify the exact commit reaches a READY production deployment and alias, then perform the non-destructive live visibility check.

## 2026-09-20 15:01 +08:00 — Conflict recovery responsive follow-up

- **Production reproduction:** On the owner's authenticated `/studio/map-map-1-repe/edit` tab, all four recovery buttons were present in the DOM, but their live boxes occupied y=84.8–101.3 while the fixed header ended at y=80 and the map pane began at y=80. The map visually covered the controls exactly as shown in the supplied screenshot.
- **T5 RED:** The growable-header regression failed because the Studio header had a fixed `height: 32px` and no `minHeight` contract.
- **T5 fix:** The header now uses `minHeight: 32px`, `boxSizing: border-box`, and contained 6px vertical padding. Normal status keeps the compact minimum; conflict status grows the header and moves the map pane below the complete recovery action group. Road Recovery and all sync/store behavior are unchanged.
- **Verification:** Focused recovery/UI matrix passed 9 files / 59 tests; the new regression file is ESLint-clean; `git diff --check` passed; the production build compiled and generated all 41 pages. Whole-file StudioWorkspace lint still reports the documented pre-existing publish-effect finding at line 196.
- **Next:** Update Graphify, commit and push the bounded follow-up, deploy the exact commit, then remeasure live header/action/map containment at the reported viewport before claiming the blocker fixed.

## 2026-09-21 — Harmonious autosave building/vertex drag lifecycle

- **Scope:** Continued only the requested transient-interaction wiring. The
  existing autosave/sync service, timing, recovery UI, routing, POIs, and
  Floor Editor architecture were not changed.
- **Trace:** The real building/draft-vertex handlers are in
  `src/components/studio/InteractionController.tsx`; the production selected
  road-vertex editor is `src/components/studio/useVertexEditor.ts`, mounted by
  `StudioCanvas`.
- **Implementation:** Both handlers now activate the existing autosave signal
  only after the first non-zero pointer move, and release it on commit, click
  cancellation, Escape, pointer cancellation, tool-switch cleanup, thrown
  cleanup, and unmount. Vertex click-without-move no longer leaves a stale
  armed drag or saves unchanged geometry.
- **Focused verification:** 14 files / 114 tests passed, including autosave
  timing and Road/Area transient regressions, real building/vertex handlers,
  local draft/reload recovery, local-ahead recovery, session/supersession,
  save queue, conflict, and UI recovery suites.
- **Build:** `npm run build` passed; Next compiled successfully and generated
  all 41 pages with the existing ignored production env loaded process-only.
- **Graph:** Final elevated incremental `graphify update .` completed (11,970
  nodes, 26,369 edges, 564 communities; HTML visualization skipped at the
  configured node limit).
- **Next:** Inspect the scoped diff, commit the focused patch, fetch/push the
  current release branch, deploy the exact SHA, and verify READY/alias/HTTP 200.

## 2026-09-21 — Production Studio post-recovery reload convergence

- **Root cause proven:** Recovery/server adoption replaced the graph, cache,
  marker, and server state while the long-lived `EditorBridge` kept the old
  `CampusDocument`. On visibility/beforeunload, `GraphAdapter.sync(document)`
  projected that stale document back into the recovered graph and
  `persistLocalDraft` cached it; the next reload therefore classified a real
  server/local divergence. Production browser logs showed the resulting
  blocked `EditorBridge adapter save failed` path after a no-edit reload.
- **T9 RED:** The focused recovery regression failed before the boundary fix
  because no authoritative document replacement existed (`reconcile... is not
  a function`). The browser reproduced the red conflict banner; production
  Vercel logs showed `/api/graph` requests were 200 with no server exception.
- **T10 fix:** Added `DocumentStore.replaceAuthoritative`, which updates the
  existing document identity and subscribers without incrementing the version
  or emitting `revision.committed`. `EditorBridge` now reconciles graph-object
  replacements into that document and clears stale history/selection before
  teardown persistence can run.
- **Verification:** Focused convergence/autosave/recovery matrix passed 18
  files / 146 tests. Targeted ESLint reports only the pre-existing
  `EditorBridge` ref/`any` findings. `git diff --check` passed. Production
  build compiled successfully and generated all 41 pages.
- **Next:** Update Graphify, inspect the scoped diff, commit/push the exact
  convergence fix, deploy it to production, and verify READY/alias/HTTP 200/SHA.

## 2026-09-21 — Hydration-only teardown projection guard

- **Production repro:** After `Load server version` visibly changed the banner
  to `All changes saved`, a no-edit browser reload recreated the red warning.
  Vercel logs showed only GET `/api/graph` and GET `/api/campus-maps` during
  that reload, proving the remaining write was local teardown projection.
- **T13 fix:** `EditorBridge` now tracks the document version last projected
  into the legacy graph. Visibility/beforeunload still persists the graph
  cache, but skips document→graph projection when the document was only
  authoritatively hydrated; authored document commits continue to project.
- **Verification:** Recovery regression passed 4/4; focused matrix passed 18
  files / 147 tests; production build compiled and generated all 41 pages;
  targeted lint retains only the documented pre-existing bridge findings;
  `git diff --check` passed.
- **Next:** Update Graphify, commit/push the corrected convergence patch,
  deploy the exact SHA, and repeat the live no-edit reload check.
