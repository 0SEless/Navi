# T25 — RuntimeEngine consumes LoadedPackage

## WHAT

Replace `RuntimeEngine`'s internal `RuntimeSnapshot` dependency with `LoadedPackage`.

**Before:**
```ts
const engine = new RuntimeEngine(snapshot)
// snapshot: RuntimeSnapshot { graph, searchIndex, buildingIndex, poiIndex }
```

**After:**
```ts
const result = await load(packagePath)
if (!result.success) return result
const engine = new RuntimeEngine(result.package)
// result.package: LoadedPackage { manifest, graph, searchIndex, buildingIndex, poiIndex, reports }
```

## Changes

1. `RuntimeEngine` constructor takes `LoadedPackage` instead of `RuntimeSnapshot`
2. `RuntimeSnapshot` becomes a derivation inside the engine (or is replaced entirely)
3. `RuntimeEngine` gets all required artifacts from `LoadedPackage.graph`, `.searchIndex`, `.buildingIndex`, `.poiIndex`
4. Loader test (pipeline-recovery) updates to use `load()` → `LoadedPackage` → `RuntimeEngine`
5. No compatibility layer. No adapters. No deprecation dance inside the engine.

## Non-goals

- ❌ Remove legacy `ArtifactLoader` / `RuntimeSnapshot` / `LoadError` yet (T26)
- ❌ Change RuntimeEngine public API beyond the constructor
- ❌ Change routing, search, or position internals
- ❌ E2E integration test (T27)

## Success Criteria

1. `RuntimeEngine` accepts `LoadedPackage` in constructor
2. All RuntimeEngine operations (routing, search, position) work identically with `LoadedPackage`
3. All 95+ existing tests still green
4. E2E pipeline test updates to use `load()` → `LoadedPackage` → `RuntimeEngine`
