# SPEC — Terrain redesign, section 2: neutral colours + contours (2026-11-04)

Owner brief (2026-11-03 feedback, agreed build order): a neutral ground like TopoExport, not flashy;
the green/yellow/orange height colours **off by default but still available**; contour lines **wanted**.

## Facts this builds on (verified in code, 2026-11-04)

- The terrain workspace already has three views: **Heights** (colour-relief ramp from
  `heightsColorStops` over the document's `colorRange`), **Changes** (±5 m), **Contours**
  (hillshade + brown 1 m contour lines, stronger every 5 m — no height colours). The Contours view
  already *is* the neutral TopoExport-like look.
- Contour lines can also overlay any view via the Layers panel toggle; today `DEFAULT_LAYERS.contours
  = false` and the workspace opens on Heights.
- Contour data comes from the **committed** sampler (`contourSegments`, 1 m step, sampled every 2 m
  over the boundary box +20 m) and is recomputed only when the document version bumps — mid-stroke it
  does nothing, so Section 1's zero-mid-stroke-work contract holds by construction.
- Main map, mini 3D and pop-out receive the same `view` and `layers` props — parity is automatic.

## What changes

1. The terrain workspace **opens on the Contours view** (neutral: hillshade + contour lines, no
   height colours).
2. **Contour lines default ON** in the Layers panel, so the lines persist when switching to
   Heights or Changes.
3. **Heights and Changes stay one click away** — the colour ramp is still available, nothing removed.
4. No document schema change: these are opening defaults (session-level), not saved campus state.

## Owner acceptance contract

| Requirement       | Expected result                                                      |
| ----------------- | -------------------------------------------------------------------- |
| Default look      | Workspace opens neutral — no green/yellow/orange on the ground       |
| Contours          | 1 m lines (majors every 5 m) visible on open, on both maps           |
| Colours available | Heights still paints the ramp; Changes still works                   |
| Lines persist     | Contour lines stay visible over Heights/Changes                      |
| Mid-stroke safety | Zero version bumps / DEM reloads / sampler rebuilds while painting   |
| Parity            | Same default look on main map, mini 3D and pop-out                   |
| Timing            | Stroke-end settle measured with contours on; yardstick in the ledger |

## Safeguards (standing)

- **Accuracy over smoothness:** contours are drawn from committed heights; nothing mid-stroke.
- Probe lane choreography unchanged (announce before stopping :3119; :3000 and Dev Supabase never
  touched); gates (vitest baseline + tsc) before every commit; no git push.

## Known trade-offs

- First load now builds contours once (was opt-in) — measured in the plan's first task; if heavy,
  the fix is a coarser sample or a cache, not skipping the feature.
- Stroke-end settle may become **two** long tasks (DEM commit + contour rebuild) instead of one —
  both strictly after mouseup; the measured numbers become the new yardstick. Mid-stroke stays zero.

## Open decision (the one question)

Should the neutral default be **per-session** (recommended: the workspace always opens neutral; what
the owner last chose does not persist) or **saved per campus document** (schema change + migration)?
Recommended: per-session — cheapest, no migration, and "default" is what the brief asks for.

## Out of scope

Shift+Z height editing (section 3); zoom limits, road styling, boundary persistence (section 4);
contour text labels (needs a font server — noted in code); contour interval settings UI; renaming
the view chips (the probe clicks them by name; a rename is cosmetic churn with no owner ask).
