# PLAN: Fix 3 Campus Interaction Regressions

## Spec Reference

Restore three broken behaviors in the Campus Workspace editor that
were working before the CurrentToolStore migration.

---

## Root Cause Analysis

All three bugs stem from a **two-state problem** introduced during the
CurrentToolStore migration:

| State source | Used by |
|---|---|
| `useDrawingSession()` (React `useState`) | `DrawingOverlay`, `ConfirmBar`, `ConfirmOverlayAdapter` |
| `useStudioStore` (zustand) | `InteractionController`, `BuildingTracer`, `CampusBoundary` |

`InteractionController.handleClick` writes trace points to **zustand**
(via `useStudioStore.getState().addTracePoint`). But `DrawingOverlay`
reads from **React context** (`useDrawingSessionContext`). The two are
never connected → route polyline is invisible.

Building and Boundary tools work because each has its **own** click
handler in `BuildingTracer`/`CampusBoundary` that directly renders
GeoJSON to the map, bypassing the broken overlay.

---

## T1 — Unify drawing state: InteractionController → useDrawingSession

**Problem**: `handleClick` writes to zustand. Overlay reads from React.

**Fix**: Replace `useStudioStore.getState().addTracePoint(pos)` in
`InteractionController.tsx` with the `drawing` prop's `addTracePoint`.
Similarly for all other trace/draw mutations.

**Files to modify**:
- `src/components/studio/InteractionController.tsx`
- `src/components/studio/StudioCanvas.tsx`

**Changes**:
1. Add `drawing: DrawingSessionValue` prop to `InteractionControllerProps`
2. Destructure `{ addTracePoint, setTracePoints, setDrawPoints, clearTracePoints, clearDrawPoints, setAdjustBuilding, setVertexEditing }` from `drawing` prop
3. Replace all `useStudioStore.getState().*` calls with the corresponding
   drawing session methods
4. In `StudioCanvas.tsx`, pass `drawing={drawing}` to `<InteractionController>`

**Acceptance**: Route polyline renders immediately after each click.

---

## T2 — Restore polygon auto-close for Building + Boundary

**Problem**: `BuildingTracer` and `CampusBoundary` only complete on
double-click. Clicking near the first vertex does nothing.

**Fix**: Add snap-to-first-vertex detection in each tracer's `handleClick`.

**Files to modify**:
- `src/components/studio/BuildingTracer.tsx`
- `src/components/studio/CampusBoundary.tsx`

**Changes**:
1. In each `handleClick`, before appending a new point, check if the
   click is within 10px screen distance of the **first** vertex AND
   `points.length >= 2`
2. If so, treat as "close polygon" — same logic as `handleDblClick`
3. Reuse `findNearestVertex` pattern (screen-distance check, not
   geographic) matching `InteractionController`

**Acceptance**:
- Building: 4 clicks → A→B→C→click-near-A → completes polygon
- Boundary: same behavior
- Double-click still works as before

---

## T3 — Restore keyboard shortcuts

### T3a — Wire up `useToolDockShortcuts`

**Problem**: `useToolDockShortcuts` is never called. Tool letter
shortcuts (B=Building, O=Route, Y=Boundary) don't work.

**Fix**: Call `useToolDockShortcuts` in `StudioCanvas.tsx`.

**File**: `src/components/studio/StudioCanvas.tsx`

**Change**: Add `useToolDockShortcuts(CAMPUS_TOOL_GROUPS, activeToolId, (id) => toolRegistry?.activate(id))` call.

### T3b — Add Ctrl+Z / Ctrl+Y undo/redo shortcuts

**Problem**: No keyboard handler for undo/redo.

**Fix**: Add `e.ctrlKey && e.key === 'z'` → `history.undo()` and
`e.ctrlKey && e.key === 'y'` → `history.redo()` to
`InteractionController.handleKeyDown`.

**File**: `src/components/studio/InteractionController.tsx`

**Change**: Add before the `Escape` block:
```ts
if ((e.ctrlKey || e.metaKey) && e.key === 'z') { history?.undo(); return }
if ((e.ctrlKey || e.metaKey) && e.key === 'y') { history?.redo(); return }
```

### T3c — Add Enter to confirm drawing

**Problem**: No `Enter` handler to confirm a route/building/boundary.

**Fix**: In `handleKeyDown`, check `e.key === 'Enter'` → call
`drawing.requestConfirm()`.

**File**: `src/components/studio/InteractionController.tsx`

**Change**: Add:
```ts
if (e.key === 'Enter') {
  drawing.requestConfirm()
  return
}
```

**Acceptance**:
- B / O / Y activate Building / Route / Boundary tools
- Ctrl+Z undoes last command, Ctrl+Y redoes
- Enter triggers confirm overlay for current drawing
- Escape still clears points
- Delete still removes selected node

---

## T4 — Clean up InteractionController dead branches

**Problem**: The `handleClick` and `handleMouseDown` in
`InteractionController` have branches for tools (`building`, `boundary`,
`room`, `asset`) that are now handled by dedicated hooks
(`BuildingTracer`, `CampusBoundary`, `useEntrancePlacer`, etc.). These
dead branches might conflict or cause double-processing.

**Files**: `src/components/studio/InteractionController.tsx`

**Changes**:
1. Remove `if (curTool === 'asset')` branch (handled by gizmo system)
2. Remove `if (curTool === 'room')` from `handleMouseDown`/`handleMouseUp`
   (handled by `useEntrancePlacer`)
3. Keep `route` branch (the InteractionController IS the route handler)
4. Simplify: only handle `route`, `select`, and `vertex` in click/mouse handlers

**Acceptance**: No functional change — building/boundary continue to work
via their dedicated hooks. `route` click handling works.

---

---

## T5 — Improve Road Rendering

**Goal**: Roads visible at every zoom. Easy to trace. Published package
stays lightweight (centerline + width only — no polygons, no buffering).

**Principle**: The Studio authors the **navigation network**, not pretty
lines. Roads have two representations:

```
Road Entity
  ├── Navigation Geometry  (polyline used for routing — lightweight)
  └── Visual Style          (render-time — outline, width, color)
```

### T5a — Add `road.width` to entity model

Add `width: number` (meters) to the `Road` entity type. Default `3.0`.
The routing graph ignores it — it's purely a rendering concern. Clamp
input to `1.0–10.0` meters to prevent nonsense values.

**Files**:
- `packages/core/src/types/entities.ts` — add `width?: number` to `Road`

### T5b — Add `RoadStyle` shared config

Define a shared style constants object used by both Studio and Runtime:

```ts
export const RoadStyle = {
  fillColor: '#FFFFFF',
  outlineColor: '#000000',
  defaultWidthMeters: 3.0,
  minScreenWidthPx: 4,
  maxScreenWidthPx: 12,
  outlineWidthPx: 2,
  minWidthMeters: 1.0,
  maxWidthMeters: 10.0,
}
```

**File**: `packages/core/src/rendering/road-style.ts` (new)

Both Studio and Runtime import this single source of truth.

### T5c — Update Studio road rendering

Current: roads rendered as a single `line` layer.

Change to **two layers** (outline + fill):

```
Layer 1 (outline)  line-color: RoadStyle.outlineColor  line-width: base+2
Layer 2 (fill)     line-color: RoadStyle.fillColor     line-width: base
```

**Width calculation** at any zoom:

```ts
const metersPerPixel = 156543 * cos(lat) / 2^zoom
const screenWidth = road.width / metersPerPixel
const clampedWidth = clamp(screenWidth, RoadStyle.minScreenWidthPx, RoadStyle.maxScreenWidthPx)
```

In Studio, roads are rendered by the entity renderer
(`entity-renderer.ts`). Split the road layer into outline + fill,
compute width from zoom + entity's `width` property.

**Files**:
- `packages/editor/src/rendering/entity-renderer.ts` — split road layer

### T5d — Update Runtime road rendering

The Runtime renders the same compiled graph format. Apply identical
two-layer + width-clamp logic, importing `RoadStyle` from `@navi/core`.

**File**: Find the Runtime's rendering code (app-level, likely in
`src/app/map/runtime/` or `packages/runtime/`) — apply same pattern.

### T5e — Update road creation commands to accept `width`

The `road.create` handler in `@navi/editor` should accept and store
`width` in payload, defaulting to `RoadStyle.defaultWidthMeters`.
Clamp to `[RoadStyle.minWidthMeters, RoadStyle.maxWidthMeters]`.

**File**: `packages/editor/src/commands/road-handlers.ts`

### T5f — Pass width through confirm flow

When confirming a route, pass `routeWidth` (the slider value) as
`width` in the road creation payload.

**Files**:
- `src/components/studio/ConfirmOverlay.tsx` — set `payload.width`
- `src/components/studio/ConfirmBar.tsx` — rename "Route Width" to
  "Road Width" label

### T5g — Automatic default widths per road type

Let the slider be an **override**, not a requirement:

| Road type | Default width |
|-----------|--------------|
| `road` (default) | `RoadStyle.defaultWidthMeters` (3.0m) |
| `connector` | `2.0` |
| `service` | `1.5` |

**File**: `packages/editor/src/commands/road-handlers.ts` — select
default based on payload `type` field.

The ConfirmBar slider remains as "Road Width" override.

### Acceptance

- Roads have visible outline at every zoom
- Published navigation data still contains only `{ id, points, width }`
- No polygon generation or buffering anywhere
- Routing graph unchanged
- `RoadStyle` shared between Studio and Runtime
- Width clamped to 1.0–10.0m
- Default widths vary by road type (road=3.0, connector=2.0, service=1.5)

---

## Order (Revised)

```
T1 ──► T2 ──► T3 ──► T5 ──► RC1 Manual Test ──► T4 Cleanup
```

Sequential, left to right. T4 (dead branch cleanup) is last — risk-free.

---

# 2026-09-20 — Production Studio conflict recovery action

## T1 — Trace the production-rendered banner and recovery path

- **Description:** Prove the exact banner owner, Studio render path, action wiring, autosave conflict gate, and live production state.
- **Files to touch:** `spec/SPEC.md`, `plan/PLAN.md` only.
- **Error risk:** Stale deployment evidence or an alternate banner assumption.
- **Preventing:** Use the exact warning text, release commit, authenticated live DOM, and store call chain as evidence.
- **Acceptance check:** One root-cause hypothesis is supported end to end before implementation.

## T2 — Add failing focused tests

- **Description:** Cover the visible `Re-sync` action plus missed-ack and auth-specific recovery behavior.
- **Files to touch:** `src/components/studio/__tests__/SaveStatus.test.tsx`, `src/components/studio/__tests__/StudioWorkspace.test.tsx`, `src/store/__tests__/refresh-recovery.test.ts`, `src/store/__tests__/saved-state-gate.test.ts`.
- **Error risk:** Tests that assert mocks instead of user-visible/store outcomes.
- **Preventing:** Render the real `SaveStatus`, exercise the real store, and mock only `/api/graph`.
- **Acceptance check:** New assertions fail against commit `567ef2b` for the intended missing behavior.

## T3 — Implement the minimal recovery correction

- **Description:** Rename the exact banner action to `Re-sync`; auto-heal server-equals-local; preserve conflict on divergence/failure; propagate auth-specific errors.
- **Files to touch:** `src/components/studio/SaveStatus.tsx`, `src/store/graph-store.ts`.
- **Error risk:** Unsafe overwrite, duplicate POST, lost local graph, or bypassed queue/CAS.
- **Preventing:** Reuse `fetchServerSnapshot`, `enqueueCampusSave`, fingerprint checks, marker writes, and the existing conflict gate.
- **Acceptance check:** Focused tests A–G pass and Road Recovery source is untouched.

## T4 — Verify, log, commit, push, deploy

- **Description:** Run focused suites and production build; update graph/logs; commit only scoped files; push the release branch; verify READY deployment and live banner.
- **Files to touch:** `progress/PROGRESS.md`, `errors/ERRORS.md`, graph outputs required by `graphify update .`, plus T2/T3 files.
- **Error risk:** Including unrelated files, claiming an unproven deployment, or mutating production map data during smoke.
- **Preventing:** Use the isolated clean worktree, inspect the staged diff/tree, verify deployment commit, and keep live checks read-only unless the safe owner smoke is explicitly executable.
- **Acceptance check:** Focused tests and build exit 0; commit/tree recorded; release push succeeds; deployment is READY; live `Re-sync` visibility is verified.

## T5 — Keep recovery controls inside the responsive Studio header

- **Description:** Reproduce the owner's screenshot dimensions, prove the recovery controls are painted below the fixed header, and let the header grow to contain the complete multi-row status block.
- **Files to touch:** `src/components/studio/StudioWorkspace.tsx`, `src/components/studio/__tests__/StudioWorkspace.test.tsx`, `spec/SPEC.md`, `plan/PLAN.md`, `progress/PROGRESS.md`, `errors/ERRORS.md`.
- **Error risk:** Moving or hiding Road Recovery, shrinking the map without need, or asserting only DOM presence while the actions remain visually covered.
- **Preventing:** Add a failing growable-header regression, keep the 32px normal state as a minimum, then measure the deployed header/action/map bounding boxes at the reported viewport.
- **Acceptance check:** The focused test fails against the fixed-height header, passes after the minimal style change, and production shows every recovery action within the header above the map pane.

## 2026-09-21 — Production Studio harmonious autosave drag lifecycle

### T6 — Add failing real-handler gesture lifecycle tests

- **Description:** Extend the existing Studio `InteractionController` harness
  to capture the real map handlers and prove building/vertex idle, moved,
  commit, cancel, pointer-cancel, and teardown transitions of the existing
  transient autosave signal. Keep Road/Area and autosave timing assertions in
  the focused matrix.
- **Files to touch:** `src/components/studio/__tests__/InteractionController.test.tsx`,
  `src/components/studio/__tests__/useVertexEditor.test.tsx`, and
  `packages/editor/src/services/__tests__/autosave-transient-gate.test.ts` only
  if a timing assertion needs to be shared.
- **Errors from ERRORS.md:** Vitest worker `spawn EPERM` can prevent collection;
  nested-worktree build-root and env issues are verification setup hazards.
- **Preventing:** Run the exact focused tests through the approved elevated
  runner when sandbox collection fails, and assert the real registered
  handlers rather than a synthetic gate helper.
- **Acceptance check:** New lifecycle assertions fail before production wiring
  while existing tests remain unchanged.

### T7 — Wire the existing signal to real building/vertex gestures

- **Description:** In `InteractionController`, activate the existing autosave
  transient signal on the first non-zero move of an armed building or authored
  vertex gesture; release it on commit, click/pointer cancellation, Escape,
  tool-switch cleanup, error-safe cleanup, and unmount. Do not change timing or
  sync architecture.
- **Files to touch:** `src/components/studio/InteractionController.tsx`,
  `src/components/studio/useVertexEditor.ts`.
- **Errors from ERRORS.md:** Avoid broad source edits while handling the known
  environment-only Vitest/build failures; preserve the existing map listener
  cleanup contract.
- **Preventing:** Keep a single release helper, use `try/finally`-style cleanup
  at every end path, and treat no-move clicks as inactive.
- **Acceptance check:** T6 passes, active drags suppress 5s/30s autosave, and
  post-commit debounce behavior is unchanged.

### T8 — Verify, log, commit, push, and deploy the focused patch

- **Description:** Run the required focused matrix and production build,
  update progress/errors and Graphify, commit only T6/T7 plus required logs,
  fetch and push the current release branch normally, deploy the exact pushed
  SHA to Vercel production, and verify READY/alias/HTTP 200/SHA.
- **Files to touch:** `progress/PROGRESS.md`, `errors/ERRORS.md`, Graphify
  outputs required by `graphify update .`, and the T6/T7 files.
- **Errors from ERRORS.md:** Use the documented elevated commands for Vitest,
  Graphify, and the clean worktree build environment; do not misclassify these
  setup failures as regressions.
- **Preventing:** Inspect the staged diff and remote tip before push; never
  force-push or mutate production data/configuration.
- **Acceptance check:** Focused tests/build pass, pushed and deployed SHA match,
  production responds 200, and the final report contains the requested matrix.

## 2026-09-21 — Production Studio post-recovery reload convergence

### T9 — Prove the first divergent write with a failing regression

- **Description:** Reproduce recovery/server adoption followed by teardown or
  reload and capture server, marker, cache, graph-store, and CampusDocument
  fingerprints. Prove whether a stale document is projected back into the
  graph/cache before the next freshness check.
- **Files to touch:** `src/components/studio/__tests__/EditorBridgeRecovery.test.tsx`,
  `src/store/__tests__/local-draft.test.ts` only if an existing harness is the
  smallest fit.
- **Errors from ERRORS.md:** Vitest `spawn EPERM` can prevent collection;
  browser storage must remain test-local and no production data may be mutated.
- **Preventing:** Assert the first write and all five fingerprints rather than
  inferring the cause from the final red banner.
- **Acceptance check:** The regression fails before the reconciliation boundary
  is implemented and identifies the stale document → graph write.

### T10 — Reconcile authoritative graph into the active document

- **Description:** Add the smallest authoritative replacement operation that
  updates the existing CampusDocument in place, preserves its identity, clears
  stale editor history/selection as appropriate, notifies document consumers,
  and does not emit an authored revision or persist a local draft.
- **Files to touch:** `packages/editor/src/context/document-store.ts`,
  `src/components/studio/EditorBridge.tsx`, and the focused regression test.
- **Errors from ERRORS.md:** Avoid broad graph-adapter changes and do not
  weaken the existing save/conflict gate or 5-second debounce.
- **Preventing:** Use a named authoritative replacement path, keep
  `revision.committed` reserved for user-authored commands, and reconcile on
  graph identity replacement only.
- **Acceptance check:** Recovery/adoption followed by unload leaves all five
  fingerprints equal; hydration alone produces no dirty revision or POST.

### T11 — Run the required convergence matrix and round-trip checks

- **Description:** Cover force overwrite + reload, server adoption + reload,
  normal autosave + reload, hydration-no-edit, interrupted debounce, missed
  acknowledgement, true divergence, authored local draft, and graph/document
  round-trip stability. Keep existing gesture/autosave suites in the focused
  matrix for regression protection.
- **Files to touch:** Focused convergence tests and required progress/error
  logs only.
- **Errors from ERRORS.md:** Classify environment-only Vitest/build failures
  separately and rerun unchanged commands through the approved elevated path.
- **Preventing:** Verify POST counts, marker revisions, and fingerprints at
  each boundary; do not clear storage or auto-force conflicts.
- **Acceptance check:** Every required scenario passes with no unrelated
  source changes.

### T12 — Verify, log, commit, push, and deploy the convergence fix

- **Description:** Run focused tests, production build, Graphify update, and
  diff checks; commit only the convergence implementation/tests/logs; fetch
  and push normally; deploy the exact pushed SHA; verify READY, alias, HTTP
  200, and deployment SHA.
- **Files to touch:** `progress/PROGRESS.md`, `errors/ERRORS.md`, Graphify
  outputs required by `graphify update .`, and T9–T11 files.
- **Errors from ERRORS.md:** Use the established elevated path for Graphify,
  Vercel, and any sandbox-blocked test/build command.
- **Preventing:** Inspect staged files and remote tip before push; never force
  push or mutate production map data during verification.
- **Acceptance check:** Exact commit is deployed and the final report uses the
  requested convergence fields.

### T13 — Guard hydration-only teardown projection

- **Description:** Prevent visibility/beforeunload from projecting an authoritative hydration document back into the legacy graph unless the document has advanced through an authored commit.
- **Files to touch:** `src/components/studio/EditorBridge.tsx`, `src/components/studio/__tests__/EditorBridgeRecovery.test.tsx`, and required progress/error logs.
- **Errors from ERRORS.md:** The mounted-document stale write-back (T9–T12) and the newly observed hydration-only teardown projection that recreated divergence after `Load server version`.
- **Preventing:** Track the document version last projected into the graph; treat authoritative replacement as hydration, not an authored revision.
- **Acceptance check:** A server-adopted graph remains fingerprint-equivalent across no-edit teardown and reload; an authored document commit still projects before teardown; focused regression and build pass.
