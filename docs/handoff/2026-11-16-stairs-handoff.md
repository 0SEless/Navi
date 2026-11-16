# Handoff: floor-to-floor stairs (2026-11-16)

## Done (committed 55cd5a49 on feat/save-v2, not pushed)
- Spec: docs/superpowers/specs/2026-11-16-u-shape-stair-design.md; plan: docs/superpowers/plans/2026-11-16-whole-building-view-and-floor-to-floor-stairs.md; ledger (git-ignored): .superpowers/sdd/2026-11-16-whole-building-view-and-floor-to-floor-stairs/progress.md (all rulings).
- Stair From/To (`stair.setToFloor`, levels[to].role='top'), one draw rule (core stair-floors.ts), U-Shape + Sides, panel StairClimbProperties, whole-building 2.5D view (floors above, faded), reach warning, publish-gate fix (route-network rootComponents).
- Test building on QA campus map-map-1-375k (saved #18): "Stair Test Hall" bldg-2-ppnx, 3 floors, U tower stairs GF→2F→3F, outdoor straight stair `stair-ext` along north wall GF→2F, Test Walkway road. Preview: entrance → Office 301 "60 m, with stairs".
- Left uncommitted on purpose: ~50 terrain files from earlier sessions (incl. 37 lines in src/lib/terrain/terrain-floors.ts, and compose.test.ts with a syntax error that breaks plain tsc).
- Local server 3001 runs with NEXT_PUBLIC_NAVI_SAVE_V2_TEST_HOOKS=1 (window.__naviStudioV2 for scripted editing); restart with the normal script when done.

## Progress after the handoff (2026-11-16, late)
- Owner chose: fix the floating stair AND switch to smooth (mesh) stairs, editing must keep working.
- DONE + committed: reach rule tightened — STAIR_TOP_REACH_M 1.5 → 0.15 (top must touch); tests updated (stair-top-reach.test.ts, 8 pass; whole-building 5 pass).
- NOT VERIFIED: moving the test outdoor stair `stair-ext` flush to the wall (feature.update position {x:0,y:12.55}; route nodes g-ext-stair → (0,12.55), g-ext-foot → (4,12.55), f2-ext-top → new top). The script was sent but the in-app browser hung (navigate timed out), so check the QA campus: if `stair-ext` is still at y=13.6, re-run those commands via window.__naviStudioV2 (server must run with NEXT_PUBLIC_NAVI_SAVE_V2_TEST_HOOKS=1), then Save. If the server is unresponsive, check the watchdog window / restart with the start script.
- NEXT: smooth stairs (item 2 below), then browser proof, commit.

## Owner feedback to fix next (2026-11-16, screenshots)
1. **Outdoor stair is not really connected — it floats.** Reach rule (packages/editor/src/geometry/stair-top-reach.ts, STAIR_TOP_REACH_M = 1.5) accepted a 1.15 m gap between the stair and the wall. I wrongly called it connected. Fix: a stair's top must touch the upper floor (gap ≈ 0, e.g. ≤ 0.1 m), and/or snap an outside stair flush against the nearest wall when placed/moved; tighten the rule and its tests. Also the outdoor straight stair renders as a solid block from the ground (every step extrudes from base 0) with the top platform as a tall block — looks like a box with rails floating above.
2. **Jagged (stepped) parapets/rails.** Cause: MapLibre fill-extrusion can't slope, so sides are per-step pieces (stair-assets.ts stairPieces). The terrain editor already draws smooth stairs with three.js (packages/core/src/structures/mesh.ts buildStructureMesh + src/lib/three-d/mesh-layer.ts createMeshLayer, used in SiteLayers.tsx). Proposal: draw floor stairs (steps, sloped stringers/parapets, smooth rails, landings) as a mesh layer in the floor editor and NAVI Web; keep the existing fill-extrusion stair polygons only as invisible selection/pick volumes (floor-architecture-preview selectionVolumes → Architecture3DController) so editing/picking is unaffected. Needs owner OK on approach before building.
3. Route display: other floors' route legs drawn faded under the current floor look like a "tree" (src/components/map/RouteLine.tsx, inactive segments opacity 0.45/0.2). Offered: hide other floors' legs. Owner hasn't answered.

## Still open from before
- Top landing length has no panel field; mid-platform height not settable; CS ramp/platform.
- NAVI Web flat-ground switch for Thursday (Nov 19); "footprint is not closed" from the Building tool.
- Known pre-existing test failures: 21 compiler, 4 floor-editor, 3 entrance handlers, 1 route-stair (terrain).
