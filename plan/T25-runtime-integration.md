# T25 Plan — RuntimeEngine consumes LoadedPackage

## Tasks

### T1 — Update RuntimeEngine constructor
**Files**: `packages/runtime/src/engine/runtime-engine.ts`
- Replace `RuntimeSnapshot` constructor param with `LoadedPackage`
- Extract `graph`, `searchIndex`, `buildingIndex`, `poiIndex` from LoadedPackage fields
- Pass to existing internal services (RoutingEngine, SearchEngine, etc.)

**Acceptance**: Engine constructs from LoadedPackage, all existing engine tests pass.

### T2 — Remove RuntimeSnapshot usage inside engine
**Files**: `packages/runtime/src/engine/runtime-engine.ts`
- Any internal reference to `RuntimeSnapshot` fields routes directly from `LoadedPackage`

**Acceptance**: No `RuntimeSnapshot` reference inside engine logic.

### T3 — Update E2E pipeline test
**Files**: `packages/runtime/src/engine/__tests__/pipeline-recovery.test.ts`
- Replace `loadLegacyPackage()` with `load()` → `LoadedPackage`
- Test the full: compile → publish → load → engine → route path

**Acceptance**: Pipeline test uses the public `load()` entry point.

### T4 — Type cleanup
**Files**: `packages/runtime/src/types.ts`, `packages/runtime/src/engine/types.ts`
- Remove or deprecate `RuntimeSnapshot` type (mark `@deprecated`)
- Ensure no consumers outside runtime depend on it directly

**Acceptance**: Clean types, LoadedPackage is the canonical input.

## Error Prevention

- ADR-012: LoadedPackage is the canonical input to RuntimeEngine
- No adapter layer — extract fields directly in constructor
- All existing routing/search/position behavior preserved unchanged
