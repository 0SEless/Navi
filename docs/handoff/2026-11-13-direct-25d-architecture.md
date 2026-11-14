# Direct 2.5D architecture editing - 2026-11-13

Implemented in the existing feat/save-v2 worktree. Uncommitted; no staging or saved-campus changes. The owner approved the design in docs/superpowers/specs/2026-11-13-direct-25d-architecture-design.md.

## What to use

Open a floor, continue without a plan if necessary, select Architecture and 2.5D. Window hover previews a cutout with frame/glass on the visible wall face; drag diagonally to set its width and height. Select a window using Navigate, then drag its four corners or center. The inspector provides dimensions, along-wall distance, floor-relative sill and Open/Fixed/Two-pane appearances. Old windows without appearance remain open apertures.

Select a wall with Navigate or Wall, then drag its blue top arrow to adjust whole-wall height. Lowering through a hosted door/window is refused. Wall tracing remains in 2D. Each accepted gesture is one command; Escape cancels previews. Numeric window Apply sends only changed values, preserving original precision and optional-field absence.

Frames and glass derive from one canonical Opening; they have no navigation meaning. Shared geometry subtracts true apertures. Picking and handles respect nearer wall solids. A captured facade/projection stays frozen for each gesture; camera/style/projection/selection/host changes cancel it. Building-zone loss/release disables the architecture controller and inspectors. Existing ground-plane handlers remain readOnly in 2.5D.

## Verification

- Final focused suite: 14 files / 170 tests passed, serial single worker, 512 MB heap. Includes assets, opening/door commands, projection/picking, gestures/controller cancellation, lock access, inspector, actual preview and split/join round trip.
- Additional explicit compiler/runtime retention case passed; the other two compiler tests were intentionally excluded. Existing whole-file fixtures fail HALLWAY_DISCONNECTED independently of this task; no validation was weakened.
- Final real browser script: scripts/save-v2/import-data/direct-25d-browser-20261113.cjs. Used only localhost:3001 test campus map-map-1-375k / bldg-2-emz6 / floor0, unsaved enclosure. Placed directly in 2.5D, resized, moved, switched to two-pane, changed numeric width, verified Undo restored it, cancelled with Escape, dragged wall height, and hovered successfully at a second camera bearing.
- Browser: zero page errors; saved head12 and all nine saved part versions/checksums unchanged. Navigated away; released only its acquired building locks. Save and Publish requests blocked by the harness. No forced lock release.
- Evidence: scripts/save-v2/import-data/direct-25d-architecture-20261113/browser/result.json and screenshots 02-window.png, 03-two-pane.png, 04-wall-height.png, 05-second-bearing.png. Demo geometry was discarded, so reopening the floor will not show it.
- No full build or full-repository test claim. No performance benchmark. ASU Preview validation and public detailed stacked building rendering remain separate work.
- Targeted lint: all new modules clean; original FloorEditor21, Canvas25, drawing12 and feature-handlers12 existing errors remain, with no added error counts by rule/message. After moving the new canvas map reference into state, Canvas returned to its baseline count. Strict UTF-8 scan passed through checkpoint generation. Code graph refreshed using one worker and no clustering; original graph bytes retained for rollback.

## Reversibility

Checkpoint: scripts/save-v2/import-data/direct-25d-architecture-20261113. Byte-exact before/after files, SHA-256 manifest, task.patch and default-check-only rollback.ps1. Run rollback.ps1 without switches to verify; use -Apply only when the owner requests rollback. It refuses changed HEAD/branch or later file edits before any mutation. Older checkpoints remain unchanged.

The compiler integration test was clean at baseline; its original working-tree bytes were reconstructed from HEAD using Git checkout filters. The other original source files were captured before implementation. Generated graph files are hash-guarded byte snapshots, excluded from the source review patch.

## Integration lessons

Installed MapLibre 5.24 returns undefined for omitted style projection (Mercator default). Its inner canvas container can have zero CSS height; capture uses the outer viewport dimensions. Use the existing styleReady helper rather than waiting for tile-loaded isStyleLoaded. Frame capture uses copied defaultProjectionData.mainMatrix, not ground-only Map.project/unproject.

The local server was offline at the first browser attempt. After confirming port3001 unused, restored it with existing start-savev2-local.ps1 and watchdog-savev2.ps1 in independent hidden PowerShell processes; HTTP200 verified. The original cause of the earlier shutdown was not established.
