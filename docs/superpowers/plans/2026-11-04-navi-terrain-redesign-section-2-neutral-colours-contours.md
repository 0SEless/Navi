# PLAN — Terrain redesign, section 2: neutral colours + contours (2026-11-04)

Spec: `docs/superpowers/specs/2026-11-04-navi-terrain-redesign-section-2-neutral-colours-contours.md`
Execution: inline (no subagents), one commit per task, gates before every commit
(vitest baseline compare `regressed: 0` + tsc `1122 / 1122 / clean folders 0`, run **sequentially**
when a next dev is live — the OutdoorRoutePicker flake lesson).

Standing loop per task: TODO → DO (prevent listed errors first) → VERIFY (evidence) → LOG (ledger).

## T1 — Facts + measure (read-only, no commit)

- Time the contour build (`contourSegments` over the demo fixture's boundary box) at load and at
  stroke end with contours on: is the stroke-end settle one long task (DEM commit) or two (DEM +
  contours)? Record numbers in the ledger.
- Decide: if the contour rebuild alone costs more than ~100 ms, plan a cheap fix (coarser sample
  cell or reuse-by-version cache) as part of T2; otherwise leave as is.
- Files: none (ledger only).
- Prevents: shipping a default that silently doubles the stroke-end settle.

## T2 — Defaults flip (TDD)

- `TerrainWorkspaceRoute`: default view `'contours'` (was `'heights'`).
- `TerrainLayersPanel`: `DEFAULT_LAYERS.contours = true` (was `false`).
- Route test first (red): opening the workspace starts on Contours (chip `aria-pressed`), both maps
  show the contour layer and no color-relief layer; switching to Heights keeps the lines (overlay
  present) and shows the colour ramp; mini 3D matches.
- Prevents: the render-counter `act()` flush lesson; restore `compile-v2-regression.test.ts.snap`
  (+ demo-output if dirtied) before `git add`.

## T3 — Browser probe T7 in `e2e/save-v2/terrain.spec.ts` (numbering continues the file's own T1–T6)

- New test T7: on open, both maps show the neutral default (contour layer present, color-relief
  absent, Heights chip not pressed); Heights is one click away (switch → color-relief present, lines
  persist); re-assert the Section 1 mid-stroke zeros (zero version bumps, zero DEM sourcedata on both
  maps) under the new default; screenshots to `reports/save-v2/raw/terrain/`.
- Probe lane choreography as standing: announce, stop the :3119 demo lane, `node e2e/save-v2/run.mjs`
  (whole lane green), restore + reseed the demo afterwards.
- Prevents: the "restore the controls the probe moved" lesson (restore any picker state the test
  touches); treat printed pass/fail lists as the verdict of record (run.mjs exit-code quirk).

## T4 — Close-out

- Whole-lane probe + final gates (sequential) on the exact commit content; `git checkout --` the
  snapshot (+ demo-output) before `git add`; ledger rulings; update the handoff doc's In-progress
  entry to point at section 3; one commit.

## Traceability

| Acceptance (spec)      | Task |
| ---------------------- | ---- |
| Default look neutral   | T2, T3 |
| Contours on open       | T2, T3 |
| Colours still available| T2, T3 |
| Lines persist          | T2, T3 |
| Mid-stroke safety      | T3 (re-assert), Section 1 contract |
| Parity                 | T2 (route test), T3 (both maps) |
| Timing yardstick       | T1, T3 |
