# Task 3: Trace Compiler Engine Module — Report

## What was built

Created `src/engine/trace-compiler.ts` which exports `compileTrace()` — a function that converts a polyline `TracePath` into a graph of `NavNode`s and `NavEdge`s. It:

1. Creates nodes at trace endpoints and all trace points
2. Finds intersections with existing traces via `findLineIntersections` and creates nodes there
3. Creates `walk` edges between consecutive trace-point nodes
4. Creates `transition` edges to nearby room nodes via `findProximityConnections`
5. Deduplicates nodes by position and avoids creating duplicate edges

## Test results

All 45 tests pass (5 new trace-compiler tests + 40 existing):
```
✓ src/engine/__tests__/trace-compiler.test.ts (5 tests)
```

## Deviations from the brief and why

- **Intersection metadata tagging**: The brief's implementation code created intersection nodes in a separate loop without setting `metadata.source`. The test expects `n.metadata?.source === 'intersection'` on intersection-generated nodes. Fixed by tracking all intersection positions (even duplicates with trace points) in a `Set<string>` and stamping `metadata: { source: 'intersection' }` on any node at an intersection position after creation.

## File paths and line counts

| File | Lines |
|------|-------|
| `src/engine/__tests__/trace-compiler.test.ts` | 87 |
| `src/engine/trace-compiler.ts` | 139 |

## Commit

`3ce732d` — `feat: add trace compiler for polyline-to-graph conversion`
