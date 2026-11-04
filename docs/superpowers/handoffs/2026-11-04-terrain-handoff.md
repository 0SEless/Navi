# Handoff — NAVI terrain, 2.5D buildings, stairs and ramps (2026-11-04)

For the next agent continuing this work. Read this first, then the ledger.

## Goal

Make NAVI Studio's terrain workspace a tool the owner enjoys using: model the hillside campus like clay,
place buildings and floors at their real heights with the ground adapting to them, connect floors to roads
with good-looking outdoor stairs and ramps, and show the result in NAVI Web as a campus-only map.

**The current priority is not new features.** The owner reviewed Tasks 12–14 live and said the UI/UX is not
good enough. The next job is to agree a redesign with the owner (brainstorming → written spec → plan) and build
it before continuing the plan's Tasks 15–16.

## Where the work is

| What | Value |
|---|---|
| Worktree | `C:\Users\Administrator\Desktop\CODEme\Navi\.navi-worktrees\navi-save-v2` |
| Branch | `feat/terrain-2.5d` (cut from `feat/save-v2` @ 08a5090), HEAD `9638f965`, working tree clean, **not pushed** |
| Specs (owner-approved) | `docs/superpowers/specs/2026-11-02-navi-terrain-2.5d-stairs-ramps-design.md` (this work); `...-navi-route-linking-design.md` and `...-navi-web-navigation-design.md` (both **on hold**) |
| Plan | `docs/superpowers/plans/2026-11-02-navi-terrain-2.5d-stairs-ramps.md` (Tasks 0–16) |
| Ledger (every ruling, test result, open item) | `.superpowers/sdd/2026-11-02-navi-terrain-2.5d-stairs-ramps/progress.md` (git-ignored) |
| Execution method | superpowers:executing-plans, **inline, no subagents** (owner: subagents use too many tokens) |

## Done (committed)

| Task | Commit | What |
|---|---|---|
| 0 | 08a5090 | Plan |
| 1 | 4877d2b | Terrain grid (1 m cells, 128×128 tiles, Int16 cm), tile codec, types |
| 2 | ce87d3a | Save v2 parts: `terrain-tile:<col>_<row>` (binary), `terrain`, `map/structure`, `map/structure-preset`; SQL migration `20261103000000` (**local only**) |
| 3 | 728d119 | Import ground from TopoExport `.glb` + frame GeoJSON, or contours |
| 4 | fda2265 | Final ground = base + changes + fits (building pads, road fits); bake |
| 5 | 9e36091, 6b8054d | Site artifact for NAVI Web (baked terrain, road surfaces, structures) |
| 6 | f4ab11a | Terrain workspace route `/studio/[id]/edit/terrain`, terrain lock, first visit, Done |
| 7 | d96af73 | Views (Heights / Changes / Contours), exaggeration, live mini 3D, Swap, Pop out |
| 8 | 4aa072d | Brushes (raise/lower, smooth, flatten, picker), shapes, profiles, hold-to-paint |
| 9 | 148cb8c | Lasso, slope, reset, contour pen, Edit boundary, local tracing image |
| 10 | 397657d | Buildings follow the ground, Fixed/Snap, pads, solid floor slabs, Cut away above; tilting shows the hill |
| 11 | f2ced68 | Stair shape maths, structure mesh builder, built-in materials and presets |
| 12 | ddf5e30 | Stairs tool: click places a 3 m block, handles snap ends to a floor slab edge / road / ground, bend, flight markers, panel, Save as preset, orphan marker; MapLibre custom mesh layer |
| 13 | b05c9bf | Roads drawn as surfaces at their width; road panel Height: Follow ground / Typed |
| 14 | 9638f965 | Ramps: 1.5 m landings (add/remove/drag), slope 1:N readout, no pass/fail mark |

Last full check (Task 14): vitest gate 0 regressions, tsc gate 1122 (= baseline) with 0 in clean folders,
browser probe 25/25.

## In progress: UI/UX redesign (brainstorming, not yet a spec)

The owner tried the workspace live (demo on port 3119) and gave this feedback. Treat it as the brief; it is
**not yet approved as a design**.

**Owner said:**
1. **Buildings must make the terrain adapt.** Select a building in the terrain editor, tilt into 2.5D/3D, press
   a shortcut (example given: Shift+Z), the cursor becomes a height tool, drag to raise/lower the building. If it
   is lowered into the hill, the ground must reshape around it. Today it does not.
2. **Sculpting is laggy.** Smooth sculpting is the main goal of the terrain editor.
3. **Colours:** wants a neutral ground like TopoExport (not flashy). The green/yellow/orange height colours should
   be **off by default** but still available. Likes contour lines and wants them.
4. **Stairs:** same direct control as buildings (Shift+Z to raise/lower an end); simple control of height, width
   and angle; "smooth as butter", not a crowded set of controls. Stair ends are sometimes buried in the ground.
5. **Keep:** the tool dock, the stair asset's look, the 3D height feel, the boundary.
6. **Choosing tools like Move and Raise by clicking is awful.** Meaning not yet confirmed (see open question).
7. **Roads need styling.**
8. **Zoom** sometimes over-zooms and the user ends up lost in empty space.
9. **Boundary:** once specified, it should stay visible.

**Assumptions written back to the owner, not yet confirmed:**
- "Terrain adapts" = cut-and-fill: the ground under the building levels to its base and blends into the hill;
  stair ends meet the ground the same way; raising the building lifts the ground with it.
- Zoom stays within the campus and a sensible closest distance.
- Suggested order: sculpting speed → neutral look + contours → Shift+Z height editing for buildings and stair ends
  with the ground adapting → zoom limits, roads, boundary.

**Waiting on the owner:** what point 6 means: (a) keyboard shortcuts to switch tools, (b) no Move tool at all
(pan/tilt any time, even with a brush active), or (c) something else.

**Next steps for this redesign:**
1. Get the owner's answer to point 6 and confirmation of the assumptions above.
2. Measure the sculpting lag before designing a fix (stroke → working tiles → DEM protocol → tile reload; see
   `useTerrainStroke.ts`, `src/lib/terrain/dem-protocol.ts`, `use-terrain-sampler.ts`).
3. Present the design in sections, write it as a spec under `docs/superpowers/specs/`, get owner approval, then
   superpowers:writing-plans, then build.

## Not done

- **UI/UX redesign** (above), first.
- **Task 15:** campus-only terrain map in NAVI Web (MapPreview site layers, route ribbon following terrain).
- **Task 16:** end-to-end acceptance with the ASU-Ibajay data. ⛔ **Step 4 needs explicit owner approval:** apply
  migration `20261103000000` to the cloud project `navi-studio-v2` (`ztbnicoiwjghzttchqmp`) and deploy a preview.
- **Final whole-branch review** (self-review, no subagent), then superpowers:finishing-a-development-branch.
- **On hold by the owner:** route linking, NAVI Web navigation (gate screen, safe start, active navigation),
  building 3D models (later sub-project).
- **Save v2 plan Tasks 21–22** still need explicit owner approval.

## Open questions for the owner

- Point 6 of the feedback (above).
- **BP 344 ramp limit: 1:12 or 1:20?** The ramp panel shows 1:N with no pass/fail mark until confirmed.

## Follow-ups already noted (not started)

- The old TerrainAreaAuthoring panel (pre-terrain-plan) still exists.
- Offline app shell (no service worker yet).
- Contour labels need glyphs (no font server), so contours have no height labels.
- Fixed buildings have no 3D drag handle (fits feedback point 1).
- Terrain exaggeration ≠ 1: slabs (relative to ground) and the stair mesh (absolute) can disagree.

## Standing rules (owner)

- The Dev Supabase project `scvgulusmutnzasmgysx` is protected live data: no writes, migrations, RPC, deletes or
  cleanup without explicit approval.
- Never print or copy secrets; never enter passwords, keys or tokens.
- Never run the quarantined scripts in `navi-next/scripts/`; never run `scripts/save-audit-suite.mjs` unsanitized.
- No git push, no history rewrite; commits are fine on feat branches.
- Never stop the owner's dev server on :3000.
- No subagents. Plain language; label claims Verified / Agreed / Proposed / Unknown; few questions.
- Record every decision in the ledger as `Ruling: <what> — <why> — <cost if wrong>`.

## How to run the checks

- **Gates (must pass before every commit):**
  `bash .superpowers/sdd/2026-11-02-navi-terrain-2.5d-stairs-ramps/gates.sh` (vitest vs
  `reports/save-v2/baseline-vitest-passed.txt` plus the tsc gate: total 1122, 0 in the clean folders).
  The script exports `CERTIFIED_BACKUP_PATH=D:/Downloads/NAVI-map-map-1-k6bv-LOCAL-RAW-2026-09-15T10-57-02-318Z.json`
  (the owner moved Downloads to drive D: on 2026-11-02).
- **Browser probe (25 tests):** Docker Desktop must be running, then `powershell -File scripts/save-v2/db-up.ps1`
  (local Postgres 127.0.0.1:55434), then `node e2e/save-v2/run.mjs` (about 10 min; run it in the background).
  Terrain tests are T1–T5 in `e2e/save-v2/terrain.spec.ts`; screenshots go to `reports/save-v2/raw/terrain/`.
- **DB tests:** `npx vitest run -c vitest.savev2-db.config.ts`.
- **After test runs, before `git add`:** `git checkout -- demo-output packages/compiler/src/__tests__/__snapshots__`.
- **Owner demo (live in the browser):**
  `node .superpowers/sdd/2026-11-02-navi-terrain-2.5d-stairs-ramps/demo-server.mjs` (port 3119, local test DB,
  sign-in stub; run in the background), then `node .superpowers/sdd/2026-11-02-navi-terrain-2.5d-stairs-ramps/demo-seed.mjs`
  (prints a demo campus id: hall with 3 floors, main road, imported ground, one stair, one ramp). In the browser,
  set the cookie `navi-mock-session` = base64 of
  `{"id":"e2e-ana","name":"ana","email":"ana@example.test","role":"super_admin","campus_id":null}` on
  127.0.0.1:3119, then open `/studio/<id>/edit/terrain`. The probe uses ports 3118/45678 and the same `.next`
  folder, so stop the demo before running the probe.
- **Plan scripts:** `task-start PLAN N` and `task-done PLAN N BASE -- <test cmd>` from the executing-plans skill
  (`.../skills/executing-plans/scripts/`).

## Lessons from this run

- Gate before committing; the browser probe has caught real bugs twice (colours drawn over roads, stacked handles).
- Python edit scripts: always `read_text(encoding='utf-8')` / `write_text(..., encoding='utf-8')`; the default
  Windows code page breaks on characters like "→". When appending a `describe` block, keep the previous `})`.
- Prefer script files over long bash heredocs with quotes.
