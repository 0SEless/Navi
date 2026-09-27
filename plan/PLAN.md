# PLAN: Unblock Navi Studio Floor & Interior Persistence

## Tasks Breakdown

### T1: Trace Compiler Identity Stability
- **Description**: In `compileTrace(trace, existingNodes, existingEdges)`, look up matching existing nodes by coordinate (`pointToLatLng(pos)`) or matching labels, and reuse existing node IDs instead of calling `genId('N')`. For edges connecting those nodes, look up matching edges in `existingEdges` and reuse their IDs instead of `genId('E')`.
- **Files to touch**:
  - `src/engine/trace-compiler.ts`
  - `src/engine/__tests__/trace-compiler.test.ts` (or focused test)
- **Acceptance check**: Running `compileTrace` with pre-existing nodes and edges preserves the original IDs.
- **Potential Errors from ERRORS.md**:
  - 2026-09-26: Assertion testing wrong field or sentinel; ensure test asserts exact ID equality on reused nodes/edges without mutating original inputs.

---

### T2: Scope-Aware GraphAdapter Sync
- **Description**: Add optional `scope?: GuardScope` parameter to `GraphAdapter.sync(document: CampusDocument, scope?: GuardScope)`.
  - When `scope?.kind === 'floor'` or `'building'`, pass the scope into `reconcileCanonicalCollections()`.
  - In `reconcileCanonicalCollections()`, if scope is non-outdoor (i.e. editing a building or floor), treat `outdoorCovered` as `false`, preserving all existing outdoor nodes and edges untouched.
  - When compiling traces, supply `previous.nodes` and `previous.edges` so trace compilation reuses existing IDs.
  - Update `floor/[floor]/page.tsx` calls to pass the floor scope: `ga.sync(context.document, { kind: 'floor', buildingId, floor })`.
- **Files to touch**:
  - `packages/editor/src/graph-adapter.ts`
  - `src/app/(admin)/studio/[id]/edit/building/[buildingId]/floor/[floor]/page.tsx`
  - `packages/editor/src/__tests__/floor-recalculation.test.ts` or new focused adapter test
- **Acceptance check**: A floor-scoped sync does not remove or rewrite outdoor road nodes (`N1187..N1193`).
- **Potential Errors from ERRORS.md**:
  - 2026-09-25: Syntax issues / dropped parameters in call sites; verify all `ga.sync(...)` call sites typecheck cleanly.

---

### T3: Campus Editor Mutation Attribution
- **Description**: In `EditorBridge.tsx`, listen to `document.changed` event and record the appropriate authored mutation intent using `recordAuthoredMutation`:
  - If `entityType === 'floor'` or `entityType === 'building'`, call `useGraphStore.getState().recordAuthoredMutation('building', buildingId ?? entityId, null)`.
  - If `entityType === 'road'`, call `useGraphStore.getState().recordAuthoredMutation('outdoor', null, null)`.
  - Also ensure that `recordAuthoredMutation` is invoked whenever `dispatcher.execute` mutates campus entities.
- **Files to touch**:
  - `src/components/studio/EditorBridge.tsx`
- **Acceptance check**: Dispatching `floor.create` populates `useGraphStore.getState().pendingAuthoredMutations` with `{ kind: 'building', buildingId }`, allowing autosave to execute `POST /api/graph`.
- **Potential Errors from ERRORS.md**:
  - 2026-09-15: Auth and mutation session guards; ensure authored mutations match GuardScope kinds (`building`, `floor`, `outdoor`).

---

### T4: Verification Suite & Regression Gate
- **Description**: Run focused test suite:
  - `trace-compiler` test
  - `graph-adapter` sync test
  - `floor-editor-persistence.test.ts`
  - End-to-end script verifying that adding a floor and drawing a route does not trigger `Cross-scope destructive save blocked` and sends `POST /api/graph`.
- **Files to touch**:
  - `scripts/verify-persistence-fix.ts`
- **Acceptance check**: All unit tests pass, no cross-scope destruction errors, and save succeeds.
- **Potential Errors from ERRORS.md**:
  - 2026-09-26: Pre-existing failures outside our slice; run focused test commands targeting our modified files.
