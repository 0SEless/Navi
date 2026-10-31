# NAVI E8.4 Terrain Authoring Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add a campus-level terrain polygon editor whose authored areas save and reconstruct through the existing opt-in synthetic E5 terrain scope.

**Architecture:** Keep stable terrain polygon data and a structured campus-local datum in `CampusDocument`, separate from legacy `areas`, graph rendering, and runtime mesh generation. Use existing editor commands and document events; project data only through the existing campus terrain scope; render through a dedicated Studio MapLibre layer and edit panel.

**Tech Stack:** TypeScript, React, Zustand, MapLibre GL, Vitest, Playwright, PostgreSQL 17 through the existing E5 local synthetic harness.

**Spec:** `docs/superpowers/specs/2026-10-30-navi-e84-terrain-authoring-design.md`

## Global Constraints

- Use synthetic local E5 only; no Supabase Development or Production access, export, migration, or writes.
- Do not deploy, push, clean Docker, modify D2 resources, or mutate real campus data.
- Keep scoped-save opt-in and disabled by default.
- Preserve legacy `areas`, building, routing, E8.3 changes and evidence.
- Do not add terrain sculpting, mesh generation, ramps, bridges, roads, smoothing, excavation, or grading.
- Report PASS only if drawing, explicit save, browser-context closure, and exact recovery from E5 in a fresh context all succeed.

## Review Focus

- Missing/blank campus datum or non-finite elevation: reject authoring before save and show a clear field error.
- Invalid or degenerate polygon points: reject create/update without mutating the document.
- Legacy `areas` and POIs: remain byte-equivalent through terrain edits and scope reconstruction.
- Selection and vertex drag: preserve stable terrain ID and emit one final geometry command per completed gesture.
- Save failure, conflict, or lost network: preserve IndexedDB draft and never show durable success before receipt verification.

## Files and responsibilities

- `packages/core/src/types/entities.ts`, `document.ts`: terrain domain types and additive campus fields.
- `packages/core/src/serialization/*`: authored document round-trip compatibility.
- `packages/editor/src/commands/terrain-area-handlers.ts`, command registry: validated create/update/delete and inverses.
- `src/services/scoped-change-detection.ts`, `scoped-campus-snapshot.ts`: terrain-only E5 projection/reconstruction.
- `src/components/studio/TerrainAuthoring*`, `StudioCanvas.tsx`, `StudioWorkspace.tsx`: campus authoring controls and renderer, independent from generic area/POI rendering.
- Existing E8.3 browser harness/config, plus `reports/navi-studio-1.5-track-e8-4/`: live browser/PostgreSQL evidence and closeout.

---

### Task 1: Terrain authored document schema

**Files:** Modify `packages/core/src/types/entities.ts`, `packages/core/src/types/document.ts`; test `packages/core/src/serialization/authored-document.test.ts` and a focused terrain type/serialization test if needed.

**Interfaces:** Add one campus-level `TerrainVerticalDatum` with a fixed campus-local kind, explicit human label/zero reference, and authored-not-surveyed designation; add `TerrainArea` with stable `id`, `name`, `points: LatLng[]`, `color`, and `elevationMeters` relative to that shared datum; add optional `terrainAreas` and `terrainVerticalDatum` fields to `CampusDocument`.

- [x] Write serialization tests proving exact terrain round-trip and legacy documents without terrain still round-trip unchanged.
- [x] Run those tests and verify they fail because terrain fields/types are not yet supported.
- [x] Add only the additive domain fields and exports needed for serialization.
- [x] Run focused core serialization tests.

### Task 2: Terrain commands and geometry validation

**Files:** Create `packages/editor/src/commands/terrain-area-handlers.ts`; modify command registry/exports; test `packages/editor/src/commands/__tests__/terrain-area-handlers.test.ts`.

**Interfaces:** Register `terrain-area.create`, `terrain-area.update`, and `terrain-area.delete`. Validate at least 3 finite geographic points, valid latitude/longitude ranges, non-zero polygon area, no self-intersections, non-empty ID/name, finite elevation, and a non-empty structured campus datum. Overlapping areas remain separate; differing-elevation overlaps are warnings, never silent merges. Updates preserve IDs. Create/update/delete inverses restore the exact prior record and shared datum.

- [x] Write tests for valid creation and stable ID, finite elevation, geometry/name/datum rejection, edit, delete, and inverse restoration.
- [x] Add a conflicting-overlap case proving data remains separate and the conflict detector flags both stable IDs without resolving them.
- [x] Run the focused test and verify it fails before the handlers exist.
- [x] Implement command handlers and register them through the existing dispatcher.
- [x] Run focused command tests plus existing area-handler tests to verify legacy behavior.

### Task 3: Terrain-only scoped persistence projection

**Files:** Modify `src/services/scoped-change-detection.ts` and `src/services/scoped-campus-snapshot.ts`; test their existing focused suites.

**Interfaces:** The single campus-wide `terrain:<campusId>` content includes boundary and legacy `areas`; add `terrainAreas` and `terrainVerticalDatum` only when authored. Missing optional fields remain absent when reconstructed, so hydration of legacy documents does not alter their authored fingerprint or create a dirty document. No new scope kind or persistence route is added.

- [x] Add a projection test where one terrain area/elevation/datum edit yields exactly one terrain operation and no changed building, routing, or campus-settings scope.
- [x] Add reconstruction tests asserting exact ordered points, stable ID, elevation, and datum, and preservation of legacy areas/other scopes.
- [x] Run tests to verify the new assertions fail.
- [x] Extend projection/reconstruction with additive fields, preserving backward compatibility for old terrain content.
- [x] Run both focused suites and E8.3 scoped-save unit coverage.

### Task 4: Campus-level authoring UI and rendering

**Files:** Create focused terrain authoring panel/renderer components under `src/components/studio`; modify `StudioCanvas.tsx`, `StudioWorkspace.tsx`, selection/properties integration only as needed; add focused component tests.

**Interfaces:** Draw on the campus map, select a terrain polygon, edit name, shared campus-local datum label/reference, authored elevation (meters), and polygon boundary; delete it; display selected fill/outline separately from generic areas. Editing fields use `terrain-area.update`; a completed pointer gesture dispatches exactly one geometry command, with no request while dragging. Explicit Save is the only write and yields at most one campus terrain-scope commit. UI states authored elevations as authored, not surveyed. Conflicting elevation overlaps are visible and are not automatically changed.

- [x] Write tests for draw/confirm, select/inspect, invalid datum/elevation, edit, delete, distinct selected styling, and one command after a completed boundary drag.
- [x] Run focused tests and verify they fail before UI implementation.
- [x] Implement a campus-level control and dedicated rendering source/layer driven from the authored document, independent of generic area/POI projection.
- [x] Run focused UI tests, existing Studio canvas/workspace tests, and typecheck comparison.

### Task 5: Browser E5 acceptance and gesture measurement

**Files:** Extend the existing E8.3 Playwright harness and report scripts under `scripts/track-e8-*`; create `reports/navi-studio-1.5-track-e8-4/` evidence.

- [x] Add browser acceptance that draws a synthetic terrain polygon, sets explicit datum/elevation, adjusts it, saves, closes the browser context, and reloads the campus in a fresh context from E5.
- [x] Instrument a representative vertex drag: raw pointer events, authored document notifications, save candidates, HTTP calls, and committed revisions.
- [x] Run the targeted Playwright flow against the existing synthetic E5 endpoint with the feature flag enabled only in test configuration; test flags-off separately.
- [x] Independently query E5 for revision number, terrain scope content/checksum, operation receipt, changed-scope set, and unchanged building/routing/settings heads.
- [x] Verify the recovered rendered polygon and fields exactly match the committed authored data; retain failure drafts on forced conflict/network failure if harness supports these cases.

### Task 6: Publish compatibility, regression, and closeout

**Files:** Add the requested E8.4 reports. Modify publish/runtime code only if required to preserve the existing contract; do not add terrain runtime output in this track.

- [x] Exercise the existing synthetic publish workflow in a browser and record whether terrain is absent from the published runtime contract.
- [x] Run focused unit/integration/Playwright acceptance, ESLint on changed files, and the repository TypeScript check; compare diagnostics against the E8.3 baseline of 1,124 and report new diagnostics separately.
- [x] Create reports for implementation/schema, browser save/reload, gesture counts, PostgreSQL integrity, publish compatibility, tests, and blockers.
- [x] Mark PASS only if Task 5 fresh-context recovery and independent database integrity checks pass; otherwise mark PARTIAL with the precise blocker.

## Approved plan refinements

- E8.4 has one campus-level datum and one campus-wide terrain scope, not per-polygon revisions.
- Validity includes self-intersection; overlapping areas are allowed but differing elevations are visibly flagged.
- Legacy absent terrain fields stay absent during hydration and remain semantically unchanged.
- A completed vertex drag emits one geometry command, makes no network writes during movement, and can create at most one terrain-scope commit on explicit Save.
- Polygon elevation remains authored metadata relative to the campus-local datum, not a continuous terrain mesh.

## Self-review

- Spec coverage: schema, authoring, selection/edit/delete, datum/elevation, undo where command inverses support it, terrain-only save/reload, gesture efficiency, publish compatibility, regressions, and closeout each have a task.
- Type consistency: command fields, document fields, scope fields, and browser assertions use the same `terrainAreas` and `terrainVerticalDatum` names.
- Safety: E5 remains the only database target; no Docker cleanup or cloud/Production operation is in the plan.
- Proportion: six tasks separate reviewable domain, persistence, editor, live acceptance, and release-evidence changes without expanding into terrain mesh/runtime work.
