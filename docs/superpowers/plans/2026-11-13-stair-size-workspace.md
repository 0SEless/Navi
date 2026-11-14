# Stair size and workspace implementation plan

> Use superpowers:subagent-driven-development for the disjoint workspace task; controller handles stair integration and verification. No staging or commits.

**Goal:** Make visible stair dimension edits and recover usable canvas space.
**Architecture:** Canonical per-level rise and validated footprint edits; shared resizable panels.
**Tech Stack:** Existing React/TypeScript, MapLibre, Vitest, Playwright.
**Spec:** docs/superpowers/specs/2026-11-13-stair-size-workspace.md

## Global constraints
Work only in current feat/save-v2 worktree. No Save/Done/Publish, map writes, user tab/lock access, secrets or second server. Preserve previous work. Tests serial with 512MB Node.

## Review focus
Ordered polygon direction; parametric source authority; degrees versus radians; inherited rise undo; scrolling at short viewport and resizing during pointer cancellation.

## T1 Stair dimensions
- [x] RED tests for actual dimension edits and height/invalid/undo.
- [x] Fix ComponentProperties and feature.update with reusable geometry helper. Add optional StairLevelGeometry.height; Studio uses override before floor default; compiler retains same override. Existing runtime field suffices.
- [x] Verify commands, inspector, actual asset sizes, export and undo.
Files: ComponentProperties.tsx; editor geometry/feature-dimensions.ts and tests; feature-handlers.ts/tests; core entities.ts; floor-architecture-preview.ts/tests; compiler artifacts.ts; stair-door-roundtrip.test.ts. Check radians and do not regenerate freeform corner order.

## T2 Workspace panels
- [x] RED tests for resize, collapse, cancel, limits.
- [x] Shared resizable side panel; wire floor right/left and admin sidebar. Fix minHeight/flex scrolling chain and map resize.
- [x] Verify real DOM scrolling and keyboard/pointer controls.
Files: src/components/layout/ResizableSidePanel.tsx and tests; AppLayout.tsx; FloorEditor.tsx; FloorOutliner.tsx. Preserve mounted outliner state. No map or save behavior changes.

## T3 Verification and checkpoint
- [x] Focused tests and isolated browser proof, inspect result screenshots.
- [x] Review task-only diff; update graph incrementally one worker without clustering; log results.
- [x] Final guarded before/after rollback checkpoint and handoff. Keep all changes uncommitted.
