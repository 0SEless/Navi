# SPEC — Terrain redesign, section 1: clay-feel paint preview (2026-11-04)

Owner-approved (2026-11-04): direction **B** — while painting, the stroke is shown live in a
dedicated WebGL preview; the real terrain tiles regenerate exactly once at stroke end.

## Problem

Painting feels laggy. Cause chain (verified in code, measured 2026-11-04): every ~300 ms while a
stroke runs, the working tick bumps the sampler version → the sampler is rebuilt → four raster-DEM
sources on both maps reload every visible tile (+ hillshade recompute). Dabs themselves are cheap
tile patches. On this machine frames stay smooth (~120 fps) — the felt lag is the delayed feedback
(up to ~300 ms + full reload burst), not frame math.

## What changes

1. **While a stroke runs:** zero DEM reloads, zero version bumps, zero sampler rebuilds.
2. **New preview layer** (pattern: the stairs MeshLayer): attached to the main map and the mini 3D;
   renders the stroke's working tiles as a hill patch within a frame of the dab; soft shading so it
   reads in top and tilted views; follows the view's current exaggeration; absolute heights (same
   rule as the stair mesh).
3. **At stroke end:** the stroke dispatches its single undo command as today; one version bump
   regenerates only the touched tiles; the preview is removed after the real terrain matches
   (clean handoff, no flash).

## Owner acceptance contract (must all pass before commit)

| Requirement      | Expected result                          |
| ---------------- | ---------------------------------------- |
| Painting         | Responsive, within-frame visual feedback |
| DEM reloads      | Zero during stroke                       |
| Version bumps    | Zero during stroke                       |
| Sampler rebuilds | Zero during stroke                       |
| Undo             | One undo per completed stroke            |
| Mouse release    | Clean preview-to-terrain handoff         |
| Mini 3D          | Same preview behavior as main map        |
| Performance      | Before/after timing evidence             |

## Safeguards (owner condition)

- **Preview/commit parity:** the preview and the committed DEM use the same height calculations,
  tile coordinates, elevation reference and exaggeration rules. No visual jump when the preview
  disappears.
- **Lifecycle safety:** cancel (Esc), tool switch, floor/document change, error or unmount clean up
  the preview and never commit incomplete terrain changes.
- **Accuracy over smoothness:** the preview is temporary rendering, not a second source of truth.

## What success looks like

1. Hold the brush on the hill: the ground under it moves in real time, clay-like.
2. Drag to paint: the ridge appears continuously, not in bursts.
3. Release: one undo step, terrain and preview agree, the preview hands over without a jump.
4. A stroke's mid-flight nothing regenerates DEM tiles or rebuilds the sampler.
5. Timing probe before vs after shows the update latency drop (numbers recorded in the ledger).

## Out of scope (later confirmed sections, untouched)

Neutral default colours + contours (section 2); Shift+Z height editing for buildings/stairs with
ground adapting + groundwork decision (section 3); zoom limits, road styling, boundary persistence
(section 4); stairs UX crowding; campus-only NAVI Web map (plan Tasks 15–16).

## Known visual trade-offs

- Contours/hillshade under an active stroke keep showing the committed state until the stroke ends;
  the preview covers the painted area with its own shading.
- The DEM raster is interpolated by MapLibre while the preview mesh interpolates the grid directly;
  the parity safeguard calls for a handoff that waits for the regenerated tiles to land.

## Rules applied

Inline execution, no subagents; gates (vitest baseline + tsc 1122/clean 0) before every commit; no
git push; wallet chain: none of the work touches the Dev Supabase project or any live database; the
browser probe runs with the demo server on 3119 stopped (ports conflict), which will be announced.
