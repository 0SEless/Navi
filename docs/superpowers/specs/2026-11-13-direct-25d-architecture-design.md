# Direct 2.5D architecture editing and built-in windows

## Intent and agreed scope

Make the active floor's 2.5D mode an architectural editing workspace: place and adjust windows on wall faces, drag a whole wall's height, and inspect precise dimensions. 2D and 2.5D edit the same authored floor data. The owner requested built-in frames and glass panes rather than imported model files. Existing work remains uncommitted and independently reversible.

The owner approved pursuing direct window placement/resizing and whole-wall height dragging. This document makes the behavior and implementation constraints concrete for review before product code changes. Initial release covers those operations and window appearances. Lowering only a selected wall span, Connect Doors, ASU export repair, floor elevation changes, roofs, columns, and public stacked building assembly retain their separate tasks.

## Approaches

1. **Extend current MapLibre floor canvas (recommended).** Keep the shared aperture volume builder and commands; add wall-face picking, an editing overlay, and lightweight frame/glass geometry. Existing 2D data, save formats and rendering remain authoritative. The elevation projection adapter needs careful tests.
2. **Separate full 3D/CAD scene.** Provides a larger modeling surface and richer imported assets but duplicates camera, geometry/picking, save integration and rendering work. It is unnecessary for the requested rectangular windows and whole-wall heights.
3. **Numeric properties only in 2.5D.** Cheapest but does not satisfy placing and dragging on a wall face, so this is insufficient by itself.

The owner explicitly selected built-in window appearances. Proposed initial choices are Open aperture, Fixed glass, and Two-pane glass. These are procedural reusable geometry styles, not external model downloads or window-opening physics.

## User workflow

### Window placement on a wall face

- In Architecture / 2.5D, select Window. Camera controls remain available outside an active edit.
- Hover highlights the nearest visible active-floor wall face. A translucent default window cutout follows the pointer and shows its width, height and sill. Invalid placement is red with a short reason.
- Press and drag diagonally across that face to define the rectangular aperture. Both the along-wall span and vertical span come from the wall face under the pointer, not ground-plane coordinates.
- Lock the selected host, wall geometry and projection frame for the gesture. Do not jump to another wall mid-drag. Release creates one canonical opening if it fits; Escape or an invalid release creates nothing.
- New windows default to Fixed glass. The generated frame and glass are visible in the temporary preview before the user commits the gesture.

### Window selection, movement and sizing

- In Select, click a window's visible frame/pane or its aperture region. Select that logical window ID, even though it may be rendered as several pieces.
- Show four corner resize handles and a center move handle on the wall plane. Corners resize width/height with the opposite corner anchored; center movement adjusts distance along the host and sill height. No independent rotation or movement off the host wall.
- The right inspector edits width, height, sill height, distance from wall start and appearance. Wall X is the start distance along the wall; wall Y is the fixed normal offset of zero; floor Z is sill height above the active floor. Building-local X/Y can be displayed as derived values, not persisted as conflicting window coordinates.
- Keep numeric values readable (meters, practical decimal precision) without rounding stored geometry on selection. Applying a property change is one command; merely selecting or changing view does not edit anything.
- An unchanged Apply is a no-op with no Undo entry. Do not materialize absent legacy height, sill or appearance fields merely by opening the inspector or submitting unchanged displayed defaults; include only values the author changes.
- Host changes require an explicit choice; ordinary dragging never reparents a window. IDs and any existing metadata remain stable.

### Wall height adjustment

- In Select or the 2.5D Wall tool, click a wall face or top to select its logical wall ID. Show a clear vertical arrow/handle at its top edge and the current height. The 2.5D Wall tool offers this height-editing workflow; its existing 2D line-tracing workflow stays in 2D.
- Drag the handle upward/downward on that wall's vertical plane. Keep start/end, thickness, door/window offsets, floor elevation and room boundaries unchanged.
- Preview the proposed height with a measurement. Whole-wall lowering must not automatically shorten/delete a hosted window or door. Show conflicts and reject an invalid release atomically.
- Minimum interactive height is 0.1 m; numeric edits retain the existing positive-finite command contract. No new inherited height relationship is introduced.
- Keep right-panel height/thickness editing available for the selected wall in 2.5D. Lowering a span with automatic wall splitting is a subsequent scoped feature.

## Built-in frame and glass assets

Add optional canonical window appearance data on Opening, for example windowAppearance with a closed preset enum: open, fixed, two-pane. Exact field naming follows existing entity conventions during planning.

- Open: true wall aperture, with no generated frame/glass.
- Fixed: rectangular frame around the aperture and one lightly tinted glass pane.
- Two-pane: same frame plus a central mullion and two panes. This is a visual style, not animation or a claim that the window slides/opens.
- Frame sits inside the aperture; it must not fill the sill/header opening accidentally. Thickness is derived from host thickness; frame breadth is bounded to keep positive pane dimensions for small valid windows.
- Render opaque frame and translucent glass in separate layers. Use a consistent dark frame and subtle blue glass initially, with selection/hover distinct from asset color. Avoid coplanar flicker and duplicate window representations.
- New window placement in both 2D and 2.5D writes the selected preset. Existing openings without appearance retain their current open-aperture rendering; do not silently convert imported windows.
- Styles are decorative. They do not create room ownership, route nodes, access points or navigation obstacles. Aperture dimensions remain the one geometry authority.
- Appearance must survive command updates, undo/redo, serialization, Save v2 split/join, compiler floor geometry and current publisher/runtime readers. Do not change schema-version stamps, migrate old records or install a 3D engine for these simple assets.

## Projection and picking contract

Installed MapLibre is 5.24.0. Its ordinary Map.project/unproject methods project/unproject at ground level and do not provide arbitrary wall height. Ground cursor conversion cannot be reused for facade editing.

Use a small isolated projection adapter with a no-draw custom layer, renderingMode:'3d', to capture a Float64 copy of the current frame's defaultProjectionData.mainMatrix. In installed 5.24 this projects normalized MercatorCoordinate x/y with conformal Mercator z. Do not use the raw modelViewProjectionMatrix or a nonexistent ProjectionData.projectionMatrix suggested by stale upstream JSDoc. Pin this adapter to Mercator and explicitly reject unsupported projection states. Pair the copied matrix with viewport size and projection state from the same rendered frame; update cached CSS dimensions on resize instead of forcing layout on every frame. Keep WebGL state untouched.

The adapter projects building-local (x,y,z) to screen using the same world conversion and active-floor z=0 datum as the rendered walls. Its pure math supports wall-face intersection and projected handle positions. Use perspective-correct screen-to-plane mapping/ray intersection, not screen delta times a guessed meters-per-pixel scale. Test horizontal/vertical/diagonal walls at several camera bearings, pitches and zoom levels, including a rotated building and nonzero floor level.

Pick only actual canonical active-floor walls; resolve generated piece IDs through wallId/openingId. Canonical wall Y=0 is its centerline; rendered facade faces lie at plus/minus thickness/2. Pick on the rendered face while storing canonical along-wall/height values. Test both wall sides.

Use the shared aperture-subtracted wall solids for depth/occlusion, including sill, header and reveal pieces. Prefer the closest visible actual solid or window region; a foreground solid hides a rear wall/window, while a true foreground aperture permits picking the visible rear wall. The selected window's own region remains selectable even for Open appearance. Do not use a full uncut logical-wall rectangle as an occluder or blindly select all window bounds ahead of closer solids. Reveal/end/top faces can select a wall, while facade placement requires the corresponding valid wall plane. Reject edge-on/degenerate wall faces, missing matrices, points behind the camera and nonfinite coordinates, with a hint to rotate the view.

Cancel a gesture on camera movement, context/style loss, active-floor/building/tool change, lock loss, pointer cancellation or unmount. Also cancel if the selected host/opening changes or is deleted during the gesture; compare the current authored geometry with the captured version before release. A frozen host alone does not permit committing against changed data. Restore the camera interaction enablement state after the gesture instead of unconditionally enabling controls. No camera/geometry drift during a drag.

## Integration boundaries

- Preserve readOnly protection for existing 2D handlers in pitched view. Add a narrowly enabled architecture-3D controller instead of removing the global readOnly gate and accidentally enabling legacy ground-plane tools.
- Window, selection and Wall-height tool edits are enabled in 2.5D Architecture only. Door placement, route authoring, room drawing and unrelated tools keep their existing behavior.
- Permit architecture inspector edits when the floor is in mapping mode and the existing building edit-zone gate grants access. A missing floor-plan image must not itself disable architectural properties after Continue without floor plan. Setup/alignment and lock-denied views remain protected.
- Reuse opening.create, opening.update and wall.update. Add no renderer-side document mutation. Pure hover/drag previews stay outside the document until a valid release.
- Forward validation remains strict for wall bounds, sill/head fit, positive finite dimensions and overlap with windows/doors. Failed commands show actionable feedback, restore the authored preview and retain selection. Exact inverse snapshots continue to restore prior imported states.
- Every gesture and property apply is one Undo entry; no partial wall/window/asset sequence. One source entity owns all generated appearance pieces.
- 2D reflects every committed 2.5D edit immediately. Active-floor presentation remains at z=0; Floor.elevation and building terrain bases do not move when a wall/window is edited.

## Verification and acceptance

1. Tests fail first for wall-face projection, perspective-correct placement, resize/move, wall-height gestures, cancel/refusal and style geometry. No negative/zero asset pieces or nonfinite coordinates. Existing free-door/rectangle and navigation behavior stays covered.
2. Renderer/command integration fixtures prove previews and commands use the same geometry. Verify stable logical IDs, selected-host retention, exact undo and no mutations during preview.
3. Appearance fields and absent legacy fields round-trip through serialization/parts/compiler/current readers. No visual-only schema field is silently dropped.
4. Real Playwright browser test against the existing localhost:3001 server and the authorized map-map-1-375k building bldg-2-emz6 floor0: create an unsaved small enclosure, draw a window directly in 2.5D, move/resize it, switch appearances, drag wall height, exercise numeric controls, cancel an edit, and undo. Capture screenshots and page errors. Check at a second bearing so a hardcoded isometric mapping cannot falsely pass.
5. Block Save/Publish requests in browser verification; navigate away, release only locks the test acquires, close the isolated context and compare saved part versions/checksums before/after. Never force-release an owner lock without specific authorization for that current conflict. Prior test-lock release approval does not authorize arbitrary future force releases.
6. Run focused tests serially with one worker and a 512 MB heap; no full build or second server on this memory-constrained PC. Targeted lint compared to exact before bytes, source UTF-8 scan, HTTP 200 and guarded rollback checks. Keep old checkpoints and all unrelated dirty files intact.
7. New checkpoint and handoff record what was verified and what was not. Do not claim public detailed building assembly, ASU Preview repair or a performance benchmark from these floor-editor checks.

## Independent builder check

Read-only review completed before requesting design approval. Incorporated: the exact MapLibre 5.24 mainMatrix/scaling contract; rendered face depth versus canonical centerline; aperture-aware visibility and both-side tests; cancellation for changed/deleted hosts or windows; and unchanged numeric Apply preserving optional-field absence without Undo. Opening creation and compiler emission currently whitelist fields, so appearance propagation must be explicit; current runtime cloning alone is not proof of full round-trip preservation. No material design finding remains unresolved after these amendments.

## Evidence and prevention notes

Prior browser testing proved the floor's actual 2.5D aperture rendering and door handle resizing. Preview uses saved commits and publish-like validation; test save12 succeeds while ASU save4 returns 216 room/floor artifact-reference errors. This release does not weaken those checks or clear references.

Preventing: off-wall cursor placement from ground unprojection, picking a generated prism as a separate wall, camera drag fighting edit gestures, one gesture creating duplicate entities, global removal of readOnly protection, dropped export fields, automatic changes to old windows, and false success claims from synthetic tests alone. Write all source files as UTF-8; a previous Windows-encoded inspector passed Vitest but broke Next.js parsing.
