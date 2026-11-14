# Stair arrow and door controls correction - 2026-11-13

Implemented uncommitted in feat/save-v2, preserving the prior window/stair/door feature and checkpoints. The user supplied screenshots showing a wide freeform stair rising sideways to its2D arrow and requested closed/other door styles plus localhost launch.

## Correction

- Root cause:2D arrow followed ordered rectangle corners; fallback3D independently chose longest dimension. Freeform rise now follows midpoint(p0,p1) toward midpoint(p3,p2), irrespective of aspect ratio or winding. Shared resolveStairDirectionCorners also makes authored parametric directions consistent across core geometry, Studio glyphs and public glyphs. Actual polygonizeRect canonical corner order is tested; existing footprints remain untouched.
- Doors default closed when doorPose is absent, replacing the previous render-only30-degree convention. New optional doorPose closed/ajar/open maps0/30/90 degrees. Inspectors expose Door position plus styles Solid, Glass, Double solid, Double glass and Open frame. Double leaves use opposite jambs/mirrored swings. Open passage doorType always stays an open frame.
- Pose/style edits are cosmetic only: no position/size/host/room/routing normalization, no graph changes. Unchanged Apply creates no command and leaves absent defaults absent. Values survive commands, parts, compiler, runtime service and public render model.
- Independent review found imported-door undo edge cases. Internal history snapshots now restore before forward geometry/room validation, retaining identity/duplicate guards. Forward creation/editing still strictly validates. Regression cases preserve unresolved hosts and stale imported owners exactly.

## Verification

- Final focused suite19 files339 tests passed, serial one worker512MB. Stair suite includes actual generated2D-arrow versus increasing3D-height comparisons for wide/tall/square, winding, rotation and authored directions. Door geometry covers all poses/materials, opposite hinges, defaults, tiny geometry and deduplication; command/inspector/roundtrip tests prove field absence and cosmetic invariance.
- Browser fixture uses actual public render model/architecture layer, shared editor glyph and actual DoorAppearanceProperties component. Wide/tall/square alignment cosine is1 within floating-point tolerance; default solid closed, double glass open then closed all pass; zero page errors. Screenshot evidence under scripts/save-v2/import-data/stair-direction-door-pose-20261113/browser. This is an isolated component fixture, not a saved/published campus or native app test.
- User's existing unsaved editor tab and lock were not accessed, released or navigated. Browser fixture intercepted all requests and made zero map writes. No Save/Done/Publish, commits or staging.
- Scoped core semantic check has4 current errors matching4 baseline errors, introduced0. Touched-source lint counts unchanged (Canvas25, feature-handlers12); new helper/changed inspectors/glyph/assets/readers lint0. A first overly broad reused lint script treated untouched files without before snapshots as new; corrected scope to touched sources and reran. No repository-wide clean lint/type/build claim.
- Localhost3001 was stopped at task start. Confirmed no listener, launched existing start-savev2-local.ps1 in independent hidden PowerShell5876 and existing3GB watchdog8364, opened /studio in browser without navigating the unsaved floor tab. HTTP200 verified; no second dev server.

## Rollback and limits

Checkpoint: scripts/save-v2/import-data/stair-direction-door-pose-20261113. Before/after bytes, SHA256 manifest, source task.patch and default-check-only rollback.ps1. Run without switches to verify; -Apply only on an explicit rollback request. Restore this correction before using the earlier stair-door-assets checkpoint. Original graph bytes are retained separately; generated graph snapshots are excluded from the source review patch. No environment files are copied.

No turning/spiral stair path implementation, new hinge-side editor, animation, navigation door state, saved data repair, public ASU Preview repair or performance benchmark. Existing unsupported stair forms retain diagnostic fallbacks. Door default closure changes only rendering of absent pose data; it does not persist a new property.
