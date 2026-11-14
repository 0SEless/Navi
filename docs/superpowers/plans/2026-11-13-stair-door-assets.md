# Stair and Door Assets Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Preserve the existing worktree and no-commit instruction.

**Goal:** Raised stairs and framed solid/glass doors visible consistently in the floor editor and user app.
**Architecture:** Pure building-local core volume generators; additive producer/consumer fields; shared world projection; scoped MapLibre public layers and Studio preview.
**Tech Stack:** TypeScript, React, MapLibre5.24, Vitest/Playwright.
**Spec:** docs/superpowers/specs/2026-11-13-stair-door-assets.md (owner approved proposal).

## Global constraints

Only feat/save-v2; no commits/staging or saved data changes. Existing server3001/watchdog only. Serial one-worker512MB tests. Missing geometry gets fallback/diagnostic; active-floor z0. Preserve all old checkpoints and baseline captured in stair-door-assets-20261113.

## Review focus

Authored turning/preset stairs, rotation units and direction; missing floor rise or host; dimensions exported through explicit whitelists; decorative panels retaining valid navigation; pitched/public building-floor selection and reliable cleanup after style replacement.

### Task1: Shared procedural assets

Files: new core geometry/stair-assets.ts and door-assets.ts with tests. Parent exports from core/index.
Interfaces: buildStairAssetVolumes(inputs,base=0) -> {collection,diagnostics}; inputs id,position,rotation,polygon?,drawing?,landing?,height. buildDoorAssetVolumes(walls,openings,doors,base=0) -> {frames,panels,glass,diagnostics}; canonical door appearance optional open/solid/glass. Polygon feature properties id,featureId or doorId,base,height; height is absolute top like existing volumes. Exact signatures defined in modules and communicated to consumers.
- [x] Write RED fixtures for actual authored presets, rotated geometry, invalid/missing data, tiny door frames and glass panels.
- [x] Implement pure bounded generators, no document mutation; prove GREEN serially.

### Task2: Persistence and Studio integration

Files: core entities/navigation-artifacts/index; editor feature-handlers/tests; compiler artifacts; runtime converter/service; floor preview/Canvas/FloorEditor/OpeningProperties; new DoorAppearanceProperties/tests and floor-architecture-data adapter/tests; roundtrip tests.
- [x] Add failing enum, optional absence, undo and export/consume retention cases.
- [x] Implement appearance propagation, stair drawing/landing/height export, style inspector with no-op Apply.
- [x] Feed core generators via one shared floor-architecture adapter; render separate opaque/transparent sources and replace old duplicate Studio door block only when modeled.
- [x] Run targeted regression tests and baseline lint comparison; retain proof.

### Task3: Public renderer parity

Files: NavigationRenderModel.ts/tests, new FloorArchitectureLayer.tsx/tests, ExploreMap.tsx. Legacy layers altered only for necessary per-record fallback behavior.
Consumes: core generators and a shared adapter. Public model architecture records contain buildingId,floor and world polygon collections walls/frames/panels/glass/stairs. Optional architecture field preserves legacy model fixtures.
- [x] RED-test complete floor artifacts, scope/camera gates, preserved fields, coordinate units and missing-data fallbacks.
- [x] Build canonical architecture data and render only selected building/floor in pitched mode. Disable duplicate old geometry there; keep markers/fallbacks where assets cannot be produced.
- [x] GREEN tests and new-module lint.

### Task4: Verify/review/checkpoint

- [x] Independent source review; fix material findings with reproducing tests.
- [x] Unsaved Studio demo with door/stairs and actual public component synthetic artifact browser demo; screenshots, camera/floor checks, zero page errors, no Save/Publish, saved checksums unchanged and own locks released.
- [x] Final focused suite, UTF8/lint-baseline checks, one-worker graph update, HTTP200/watchdog, new byte checkpoint/manifest/reverse patch/check-only rollback.
- [x] Log progress/errors and handoff; report implementation and verification limits plainly.
