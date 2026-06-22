# Task 4 Report: Component Compiler Polygon Output

## What was built

- **`src/engine/component-compiler.ts`** — modified `compileRoom` to compute a `polygon: LatLng[]` array (SW, SE, NE, NW) from the existing corner position math, and return it in the `CompileResult`.
- **`src/engine/__tests__/component-compiler.test.ts`** — new test file with 4 tests covering room polygon, room node/edge structure, restroom polygon, and stair lack-of-polygon.

## Test results

```
✓ compileRoom returns polygon with 4 vertices
✓ compileRoom outputs center node + 4 wall edges
✓ compileRestroom also returns polygon
✓ compileStair does not return polygon
```

All 4 tests pass.

## Deviations from the brief

One deviation: the `compileComponent` wrapper function (the public API) was only forwarding `nodes` and `edges` from the internal compiler result, dropping `polygon`. The fix required adding `...(result.polygon ? { polygon: result.polygon } : {})` to the return statement at the wrapper level (line ~304). This was not mentioned in the brief but is required for `compileComponent` to actually emit the polygon property.

## File paths and line counts

| File | Lines |
|------|-------|
| `src/engine/component-compiler.ts` | 307 (was 298, +9) |
| `src/engine/__tests__/component-compiler.test.ts` | 98 (new) |
