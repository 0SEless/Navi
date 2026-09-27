# PLAN: Floor-Plan Shared-Asset Deletion Guard (2026-09-27)

Spec: `spec/FLOOR-PLAN-SHARED-ASSET-DELETION-GUARD-2026-09-27.md`
Phase 0 audit is COMPLETE (recorded in spec § "Reference set"). No code was
changed during the audit.

## T1 — Reference collector (Phase A, part 1)

**Files:** `src/services/floor-plan-lifecycle.ts`

Add pure function:

```ts
collectBuildingFloorPlanReferences(building, updatedFloor?) => string[]
```

- Iterate union of `building.floors[]` levels and `building.floorData[].level`.
- Resolve each floor via `resolveFloorPlanUrl(floorPlanUrls[level], { planImageId })`
  (the exact read-path resolver).
- Apply `updatedFloor { level, planImageId }` override (post-update binding for
  the edited floor) before resolving.
- Add `building.floorPlanVisuals[level].imageUrl` values (live public reader).
- Do NOT include `building.floorPlanUrl` singular (zero readers — documented).
- Never write to `floorPlanUrls` or any input (legacy stays read-only).
- Return deduped non-empty strings.

**Acceptance:** pure; no storage/document mutation; handles missing `floorData`,
missing `floorPlanUrls`, floors with no `floorData` entry (legacy-only floors).

**Error prevention:** level-keyed, never index-keyed (ERRORS 2026-09-27);
`planImageId` always passed as an object *key* so explicit-`null` shadow
semantics of `resolveFloorPlanUrl` are preserved.

## T2 — Deletion guard (Phase A, part 2)

**Files:** `src/services/floor-plan-storage.ts`

Extend `deleteFloorPlanImage(url, scope?, options?)`:

```ts
options?: { referencedUrls?: readonly (string | null | undefined)[] }
```

- Reference check FIRST: if any entry strictly equals `url` → return safely
  (no throw — shared-asset condition is expected).
- Then the existing `isOwnedFloorPlanUrl` ownership check, unchanged.
- Signature backward compatible (existing storage tests must pass untouched).

**Acceptance:** with `referencedUrls` containing the target URL → no
`supabase.storage...remove` call; without the option → behavior identical to
today.

**Error prevention:** do not remove the prefix-ownership check; do not reorder
into ownership-first (spec: reference existence takes precedence).

## T3 — Wire call sites (Phase A, part 3)

**Files:** `src/components/floor-editor/FloorEditor.tsx` (only the 2 delete
sites: `handleUpload` ~L486-494, `handleRemoveFloorPlan` ~L521-529)

- Replace site: `collectBuildingFloorPlanReferences(building, { level: currentLevel, planImageId: publicUrl })`
- Remove site: `collectBuildingFloorPlanReferences(building, { level: currentLevel, planImageId: null })`
- Pass result as `options.referencedUrls` to `deleteFloorPlanImage`.
- No other changes in FloorEditor (upload, dispatch, alignment logic untouched).

**Acceptance:** both call sites pass post-update references; `planImageUrl`
resolution (L123) untouched.

**Error prevention:** use `currentLevel` (never `floor` index); do not touch
the `entity.update` payloads.

## T4 — Regression tests 1–4 (Phase B)

**File (new):** `src/services/__tests__/floor-plan-deletion-guard.test.ts`

Mock `@/lib/supabase-client` + `@navi/editor` exactly like
`floor-plan-storage.test.ts`; spy on `storage.from().remove`.

- Test 1: shared A on GF/1F/2F, replace GF → collect refs (override GF=B) →
  delete A → `remove` NOT called; A preserved; GF/1F/2F resolve B/A/A.
- Test 2: GF=A, 1F=B, 2F=C, replace GF → refs lack A → delete A → `remove`
  CALLED once with the exact path.
- Test 3: GF=A, 1F=A, 2F=C, replace GF → 1F still resolves A → `remove` NOT
  called; assert `resolveFloorPlanUrl` for 1F === A.
- Test 4: legacy only — `floorPlanUrls[0]=A`, floors without `planImageId`,
  delete A → `remove` NOT called (legacy fallback protected).

**Acceptance:** each test asserts `remove` call counts, not just returned
values.

## T5 — Regression test 5: real update path (Phase B)

Same new test file: real production dispatcher via
`createEditorContext(graph, persistenceAdapter, navCompiler)` from
`@navi/editor` (registers the real `entity.update` handler — the exact command
`handleUpload` dispatches).

1. Graph with 3 floors resolving shared A (legacy + no planImageId, or
   planImageId=A ×3).
2. `dispatcher.execute({ id:'entity.update', payload:{ entityId: floor-0-id,
   changes:{ planImageId: 'B', floorPlanState:'active', ... }}})`
3. Assert the floor binding actually changed in the authored document
   (real handler, not a fixture mutation).
4. Collect references from post-update state → delete A → `remove` NOT called.
5. Counter-case: after a state where nothing references A → `remove` called.

**Acceptance:** exercises `entity.update` (production command + handler) and
the real guard end-to-end; not hand-mutated fixtures.

## T6 — Phase C regression gate

```text
npx vitest run <all floor-plan suites + new deletion-guard suite + FloorEditorCanvas floor-switch tests>
npx tsc --noEmit          (baseline: 1 pre-existing TS1005 in runtime snapshot)
npx eslint <touched files> (baseline: pre-existing errors only, no new)
```

Expected: existing PASS, new PASS, no unrelated regressions.

## Task order

```
Phase 0: audit        (DONE — spec written, no code touched)
Phase A: T1 → T2 → T3
Phase B: T4 → T5
Phase C: T6
Phase D: (do-not-touch Bug B — enforced by T6 suites)
Phase E: report + LOG
```

## Error prevention (read before each task)

- ERRORS: shared SPEC/PLAN overwrite → per-feature files (done).
- ERRORS: floor index vs level → `currentLevel` only.
- ERRORS: PowerShell `<` → pipe form only.
- ERRORS: U+FFFD probe false positive → byte-scan `EF BF BD` if auditing.
- Do not write `building.floorPlanUrls[...]` anywhere.
- Do not touch `FloorEditorCanvas.tsx`, `wall-to-polygon`, elevation code.

---

## Phase E — Verification report (2026-09-27) — COMPLETE

**Changed files (all inside `navi-next/`):**

| File | Change |
|------|--------|
| `src/services/floor-plan-lifecycle.ts` | added pure `collectBuildingFloorPlanReferences(building, updatedFloor?)` (additive only) |
| `src/services/floor-plan-storage.ts` | `deleteFloorPlanImage(url, scope?, options.referencedUrls?)` — reference guard FIRST, then existing prefix-ownership check unchanged (diff: 22+/1−) |
| `src/components/floor-editor/FloorEditor.tsx` | both delete sites pass `referencedUrls` with post-update override `{ level: currentLevel, planImageId }`; `building` added to both `useCallback` dep arrays |
| `src/services/__tests__/floor-plan-deletion-guard.test.ts` | NEW — 7 tests |

**Tests (evidence):**

- New deletion-guard suite: **7/7 PASS** (`npx vitest run src/services/__tests__/floor-plan-deletion-guard.test.ts`).
- Floor-plan regression: **26/26 PASS** across `floor-plan-lifecycle` (7), `floor-plan-storage` (2), `floor-plan-map-source` (3), `floor-plan-commit` (1), `floor-plan-transform` (6), `floor-plan-deletion-guard` (7).
- Floor-editor full dir: **462/464 PASS**; the 2 failures (`route-network-maplibre` endpoint snapping, `semantic-room-interaction` `isPolygonAuthoringTool('elevator')`) are the **documented clean-at-HEAD baseline** — parent `errors/ERRORS.md:2589-2590`, `progress/PROGRESS.md:2932` ("only the 2 baseline failures"). Both failing files + their import graphs are byte-identical to HEAD and exclude every file touched here (semantic-room-interaction imports only a type from `@/types/nav-types`; route-network-handlers imports `@navi/core`/`./types`/`../id`/`./route-junctions` only).
- `npx tsc --noEmit`: **1 error = documented baseline** TS1005 `packages/runtime/src/__tests__/data-identity-comparison.test.ts(255,3)`.
- `npx eslint` touched files: `FloorEditor.tsx` = **29 problems (19 errors, 10 warnings) = exact baseline** (identical exhaustive-deps messages); `floor-plan-lifecycle.ts` + `floor-plan-storage.ts` + new test = **0 problems (exit 0)**.

**Scenario verification (spec acceptance):**

1. Shared asset (A on GF/1F/2F), replace GF → old asset preserved: Test 1 PASS — `remove` NOT called; final bindings B/A/A.
2. Exclusive asset (A only on GF), replace GF → old asset deleted: Test 2 PASS — `remove` CALLED once with exact storage path.
3. Still referenced by another floor after replace → preserved: Test 3 PASS — `remove` NOT called; 1F still resolves A via `resolveFloorPlanUrl`.
4. Legacy `floorPlanUrls[level]` fallback protected: Test 4 PASS — no `planImageId` anywhere, delete A → `remove` NOT called.
5. `floorPlanVisuals[level].imageUrl` counts as a reference: PASS — `remove` NOT called.
6. Real production update path (T5): via `createEditorContext(...)` real `entity.update` dispatcher — (a) shared case: `ctx.document` GF binding changed GF→B through the real handler and old A preserved (override works on pre-update captured view); (b) exclusive case: `remove` CALLED. Both PASS.
7. Mutation proof (tests are load-bearing): guard condition disabled syntactically (`if (false && …)`) → **5/7 FAIL** (exactly the preservation tests; the 2 deletion-expectation tests still pass); guard restored → 7/7 PASS.

**Phase D (do-not-touch):** no edits to `FloorEditorCanvas.tsx`, `wall-to-polygon`, elevation/presentation-datum code, or `FloorEditor.tsx:123` resolver (Bug A read path). Enforced by the T6 suites above (incl. FloorEditorCanvas `Phase` tests inside the 462-passing set).

**LOG:** appended to parent `progress/PROGRESS.md` and `errors/ERRORS.md` (2 new entries: `createEditorContext` structuredClone; mutation-test syntax/encoding).

**Status: DONE. HARD STOP — no Bug B work performed or pending.**
