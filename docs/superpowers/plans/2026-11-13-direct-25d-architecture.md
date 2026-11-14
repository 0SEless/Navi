# Direct 2.5D Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Edit wall-hosted windows and whole-wall height directly in the active floor's 2.5D canvas, with built-in frame/glass styles.

**Architecture:** Keep canonical Opening/Wall commands and ground-plane handlers unchanged. Separate pure facade projection/picking, procedural window assets, and a scoped React interaction overlay. All previews are transient; release dispatches one command.

**Tech Stack:** TypeScript, React, MapLibre GL 5.24, Vitest, existing Playwright.

**Spec:** docs/superpowers/specs/2026-11-13-direct-25d-architecture-design.md (owner approved).

## Global Constraints

- Work only in the existing feat/save-v2 worktree; no commits, staging, saved-campus writes, Save, Done or Publish.
- Keep existing server on port 3001; serial 512 MB single-worker tests; no full build.
- Active-floor z=0; canonical opening offset measures from wall start. Appearance is optional closed enum open/fixed/two-pane; absent legacy appearance means open.
- Keep old checkpoints intact. Baseline: scripts/save-v2/import-data/direct-25d-architecture-20261113/before.
- Preserve readOnly on legacy 2D handlers. No Connect Doors, ASU validation repair, partial-wall lowering, roofs or public stacked assembly.

## Review Focus

- A foreground wall with an aperture must allow picking a rear surface through the hole; real solids hide rear windows.
- Rotated buildings and both facade sides must project handles and gestures at the actual rendered depth.
- A host/opening mutation, camera movement or lock loss during drag cancels without mutation and restores camera states.
- Unchanged numeric Apply preserves absent optional values and creates no Undo entry.
- Small windows must retain positive finite pane geometry; appearance must survive explicit compiler whitelists.

## Task 1: Window assets and persistence

Files: core entities/index/navigation-artifacts; new geometry/window-assets.ts and tests; editor feature-handlers/opening tests/window-tool/useFloorDrawing; compiler artifacts/export tests; architecture-roundtrip tests.

Interface: Opening.windowAppearance?: 'open' | 'fixed' | 'two-pane'. Export buildWindowAssetVolumes(walls, openings, base=0) returning {frames, glass} FeatureCollections of local footprint polygons with base/height, wallId/openingId. New windows default fixed in both placement paths. Old absence remains unchanged.

- [x] Add failing tests for styles, tiny apertures, invalid enums, exact undo, producer/consumer field retention.
- [x] Implement bounded procedural frame/pane solids and strict forward validation with exact inverse compatibility.
- [x] Run focused tests; retain result in ledger, no commit.

## Task 2: Facade projection and picking

Files: new src/components/floor-editor/architecture-3d-math.ts, architecture-3d-projection.ts and tests.

Interface: pure local Point3 {x,y,z}, ScreenPoint {x,y}; ProjectionFrame {matrix:number[],width,height}; projectPoint(frame, mercatorPoint), screenRay(frame, screen) and local adapter callbacks. Export wallFacePoint(wall, offset, z, side), intersectWallFace(ray,wall,side), pickArchitecture(ray,walls,openings,solidFeatures). Adapter captures mainMatrix through a no-draw 3d custom layer, latest frame and subscribe notification. Exact exported signatures documented in code for consumer.

- [x] Write failing perspective projection/inverse, rotated wall, both sides, occlusion through aperture, top/end face, degenerate/missing-frame tests.
- [x] Implement matrix inversion and ray/plane/solid picking; use aperture-subtracted solids and logical IDs.
- [x] Run focused tests; communicate exported API to integration task, no commit.

## Task 3: Scoped editing overlay and inspector

Files: new Architecture3DController.tsx and gesture helper/tests; FloorEditorCanvas.tsx, FloorEditor.tsx, OpeningProperties.tsx/tests, floor-architecture-preview.ts/tests.

Consumes: Tasks 1/2 APIs. Produces transient facade previews, handles and numeric changes; opening.create/update and wall.update remain the only mutations.

- [x] Add failing tests for resize/opposite anchor, move, height, cancel/stale capture, no-op inspector and optional-field absence.
- [x] Implement window hover and frozen-face drag, selected four corner/center handles, wall top arrow, invalid feedback, one command per release and camera restore.
- [x] Add frame/glass layers and transient wall aperture preview. Enable only mapping/access-granted Architecture 2.5D; retain unrelated legacy gates.
- [x] Enable precise window/wall inspectors, practical display precision and appearance selector; unchanged Apply is no-op.
- [x] Run focused regressions and lint changed modules against baseline.

## Task 4: Review, real browser and checkpoint

Files: new ignored browser script/output; checkpoint manifest/task.patch/rollback.ps1; docs/handoff/2026-11-13-direct-25d-architecture.md; progress/PROGRESS.md and errors/ERRORS.md.

- [x] Review task changes against spec with independent reviewer; address material defects with focused tests.
- [x] Browser: authorized test campus map-map-1-375k, bldg-2-emz6/floor0; block saves, use unsaved enclosure; window placement/move/resize/styles, wall height, cancel/undo, second bearing. Capture screenshots/errors.
- [x] Compare saved part checksums before/after, navigate away and release only acquired locks.
- [x] Run serial regression suite, UTF-8 scan, HTTP200, targeted graph update and guarded checkpoint/reverse-patch checks.
- [x] Record exact proof and limitations. Keep all changes uncommitted.
