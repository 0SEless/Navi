# Room Tool Comsai Multi-Enclosure Debug Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identify and narrowly fix the exact pipeline stage that drops valid Comsai Room candidates.

**Architecture:** Preserve the production server wall geometry as a test fixture, instrument the existing pure derivation stages, and compare engine output with the MapLibre Room candidate source and hit-test contract. Change only the proven failing stage and keep authored geometry immutable.

**Tech Stack:** TypeScript, Vitest, React/MapLibre floor editor, `@navi/editor` geometry.

**Spec:** `spec/ROOM-TOOL-COMSAI-DEBUG.md`

## Global Constraints

- Preserve the seven Comsai walls exactly before repair.
- Do not increase global snap tolerance or synthesize closure.
- Do not modify outdoor routing or unrelated CampusDocument topology.
- Exactly one implementation task may be in progress at a time.

---

### T1: Capture and characterize the failing Comsai geometry

**Files:**
- Create: `packages/editor/src/geometry/__tests__/fixtures/comsai-floor-0.ts`
- Create: `packages/editor/src/geometry/__tests__/comsai-room-candidates.test.ts`
- Modify: `errors/ERRORS.md`
- Modify: `progress/PROGRESS.md`

**Acceptance:** The fixture contains all seven exact saved walls and two saved
room attributes. A focused test prints/asserts deterministic stage counts and
fails only on the missing-candidate contract.

- [ ] Read relevant error-ledger entries and state prevention rules.
- [ ] Add the immutable server fixture and diagnostic assertions.
- [ ] Run focused Vitest and capture the expected RED result.
- [ ] Record the stage counts and RED evidence.

### T2: Prove the root cause and implement one narrow correction

**Files:**
- Modify: `packages/editor/src/geometry/room-derivation.ts` only if the engine is proven responsible.
- Modify: `src/components/floor-editor/FloorEditorCanvas.tsx` or `src/components/floor-editor/semantic-room-interaction.ts` only if the engine already returns every valid face and the exposure/hit-test stage is proven responsible.
- Modify: `packages/editor/src/geometry/__tests__/comsai-room-candidates.test.ts`
- Modify: `errors/ERRORS.md`
- Modify: `progress/PROGRESS.md`

**Acceptance:** One evidence-backed hypothesis explains the exact disappearing
faces; the smallest production change turns the focused regression GREEN.

- [ ] Compare the Comsai failure with the existing rectangle/shared-wall/T-junction implementations.
- [ ] State one root-cause hypothesis with stage-count evidence.
- [ ] Apply the minimal production change at that stage.
- [ ] Run the focused test to GREEN and record evidence.

### T3: Protect required geometry and persistence behaviors

**Files:**
- Modify: `packages/editor/src/geometry/__tests__/comsai-room-candidates.test.ts`
- Modify: an existing persistence test only if the current round-trip coverage cannot consume the exact fixture.
- Modify: `errors/ERRORS.md`
- Modify: `progress/PROGRESS.md`

**Acceptance:** Rectangle, adjacent rooms, T-junction, intentional gap,
Comsai, save/reload, and the existing working fixture pass without relaxing
their contracts.

- [ ] Add/confirm all required focused cases.
- [ ] Run focused geometry and command/persistence suites.
- [ ] Run scoped lint/type verification and classify pre-existing baselines.

### T4: Refresh graph and verify the actual Studio floor

**Files:**
- Modify: `graphify-out/*` via `graphify update .`
- Modify: `errors/ERRORS.md`
- Modify: `progress/PROGRESS.md`

**Acceptance:** Graphify reflects the changed relationship, and the authenticated
Studio floor exposes each valid candidate independently after save/reload with
no new console errors or Wall-tool regression.

- [ ] Run `graphify update .`.
- [ ] Open the exact production floor and activate Room.
- [ ] Click each valid enclosure, save, reload, and re-check candidates/rooms.
- [ ] Inspect console errors and verify Wall tool behavior.
- [ ] Emit exactly one required Room Tool verdict.

