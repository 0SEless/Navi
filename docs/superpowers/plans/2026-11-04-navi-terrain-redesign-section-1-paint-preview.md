# PLAN — Terrain redesign, section 1: clay-feel paint preview (2026-11-04)

Spec: `docs/superpowers/specs/2026-11-04-navi-terrain-redesign-section-1-paint-preview.md`
Execution: inline (no subagents), one commit per task, gates before every commit
(`bash .superpowers/sdd/2026-11-02-navi-terrain-2.5d-stairs-ramps/gates.sh`).

Standing working loop per task: TODO → DO (prevent listed errors first) → VERIFY (evidence) → LOG
(ledger). Read the task's "Prevents" lines before touching code.

## T1 — Parity facts (read-only, no commit)

Collect and record in the ledger, as the parity contract for T2–T4:
- Which code builds stair/structure meshes (MeshLayer location, mesh data format, origin rule).
- How exaggeration enters maps (`terrain-view` / `applyTerrainView`) and how the stair mesh reads it.
- DEM sampling reference: `encodeDemTile` samples at pixel centres vs grid cells — quantify the
  agreement needed for a clean handoff and pick the handoff rule (remove preview only after the
  regenerated tiles are ready, e.g. map idle/sourcedata).
- Files: `src/lib/three-d/*`, `src/components/terrain/TerrainMap.tsx`, `src/lib/terrain/terrain-view.ts`,
  `packages/core/src/terrain/*` (tile codec, sampler), `src/lib/terrain/dem-protocol.ts`.
- Prevents: exaggeration ≠ 1 mismatch already recorded in the ledger (fixed-vs-slabs disagreement).

## T2 — Preview layer core

- New `src/lib/three-d/terrain-preview-layer.ts` (+ mesh data builder from working tiles under
  `packages/core/src/structures` or `src/lib/terrain`), mirroring MeshLayer's attach/update contract.
- Renders Int16 working tiles at cell resolution with slope shading; absolute heights; exaggeration
  read at draw time from the view. Update per dab = only tiles whose data changed.
- TDD: mesh-data builder test first (values → expected mesh heights at cell corners, shading sorted,
  zero-length stroke no-op), red→green.
- Prevents: the lesson that shader-facing data must be getter-based (two-sided shaders); keep geometry
  finite (existing mesh.test.ts pattern).

## T3 — Stroke wiring: no mid-stroke work

- `useTerrainStroke`: per dab, update the preview layer directly (no React state per tick).
- `TerrainWorkspaceRoute`: during a stroke, `setWorking` does not advance ticks/override the sampler;
  version bumps exist only at stroke START (initial working handoff if any) and via dispatch at END.
- `TerrainStage`/`TerrainMap`: attach the preview to main + mini when a stroke is active; expose it
  for the probe like existing maps are exposed.
- Mid-stroke the sampler stays document-based (pick/flatten target unchanged).
- TDD: component tests for zero mid-stroke renders (render counter) and that the command finishes
  one undo step as today.
- Prevents: appending test blocks appends keep the previous `})` (handoff lesson).

## T4 — Lifecycle safety + Esc

- mouseup / mouseout: finish as today (dispatch once, handoff, remove preview).
- Esc during a stroke: discard (no dispatch), remove preview — new small behavior, covered by a test.
- Errors thrown by dab/update: stopRepeat, no dispatch, preview removed, stroke dies; unmount cleans
  everything.
- Tests: cancel path unit tests (no command, no residue); error path test.

## T5 — Mini 3D + pop out parity

- Same preview behavior on miniMap and pop-out instance (same util, per-map attach).
- Prevents: the ledger's "stacked handles" class of bug — one controller instance per map only.

## T6 — Browser test + timing evidence (needs the 3119 demo stopped; announced first)

- New probe test T6 in `e2e/save-v2/terrain.spec.ts`: during a Raise stroke — zero DEM reloads,
  zero version bumps, zero sampler rebuilds, preview visible; at mouseup — single undo, handoff no
  visual jump (terrain value at stroke centre before/after match), mini 3D shows the same patch;
  screenshots to `reports/save-v2/raw/terrain/`.
- Timing: re-run the measurement scripts (v2), record before/after update latency in the ledger and
  `reports/save-v2/raw/terrain/`.
- Prevents: the demo-probe port conflict (stop demo; never touch the owner's :3000).

## T7 — Close-out

- Full gates; browser probe 25/25 + T6; `git checkout -- demo-output packages/compiler/src/__tests__/__snapshots__`
  before `git add` (handoff rule); commit; ledger rulings; update the handoff doc's In-progress entry.

## Traceability

| Acceptance (spec) | Task |
| --- | --- |
| Within-frame feedback | T2, T3 |
| Zero DEM/version/sampler work mid-stroke | T3 |
| One undo per stroke | T3 |
| Clean handoff | T1 (rule), T3 |
| Mini 3D parity | T5 |
| Timing evidence | T6 |
| Parity safeguard | T1, T2 |
| Lifecycle safeguard | T4 |
