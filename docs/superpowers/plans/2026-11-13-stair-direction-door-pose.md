# Stair Direction and Door Pose Implementation Plan

> **For workers:** Execute task-by-task using test-first and the existing isolated worktree. No commits.

**Goal:** Match 3D rise to the actual2D stair arrow and provide closed/ajar/open single/double door styles.
**Spec:** docs/superpowers/specs/2026-11-13-stair-direction-door-pose.md.
**Architecture:** Shared stair direction resolution; existing door asset generator extended with optional pose; additive command/export/readers and cosmetic inspectors. Existing MapLibre pipeline only.

## Constraints and review focus

Only feat/save-v2, no Save/Done/Publish or map writes, preserve user draft/locks and older checkpoints. Serial one-worker512MB tests. Review aspect ratio/winding/cardinal direction, double-leaf hinge math, optional-field absence and cosmetic route invariance, producer/consumer whitelists, default closed rendering.

### Task1 - Stair regression

Files: core stair-assets and tests/shared direction helper if needed; editor feature-graphics and tests; Studio Canvas and public StaircaseLayer/NavigationRenderModel direction plumbing.
- [x] RED tests compare actual2D arrow vector to direction of increasing3D step height for wide/tall/square and rotated stairs; include authored directions.
- [x] Implement one direction authority, preserving existing footprints and data; GREEN targeted tests.

### Task2 - Door geometry

Files: core door-assets/types/tests; parent exports/types as needed.
- [x] RED tests closed default, poses0/30/90, double-solid/double-glass opposite jambs, open-passage override, dedup and finite dimensions.
- [x] Implement closed default and double panels using same source entity/IDs; GREEN.

### Task3 - Commands, inspectors and persistence

Files: entities/navigation-artifacts/index; feature-handlers/tests; compiler artifacts; runtime service; DoorAppearanceProperties/OpeningProperties/tests; public model; parts roundtrip tests.
- [x] RED enum/no-op/cosmetic network-invariance/roundtrip cases.
- [x] Add optional doorPose, extend appearance enums, support combined pose/style-only commands with exact inverse preservation; expose inspectors; GREEN.

### Task4 - Verification and checkpoint

- [x] Focused regression suite, baseline lint/core types, independent review; fix material findings with proof.
- [x] Browser demonstration through actual shared components; verify arrow/rise and closed/open controls without user's draft changes. Check HTTP200/watchdog/browser launch.
- [x] Source UTF8, one-worker graph update, new before/after/hash manifest/reverse patch/check-only rollback; log/handoff. Uncommitted.
