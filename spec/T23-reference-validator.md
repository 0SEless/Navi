# T23 — ReferenceValidator

## WHAT

Create `ReferenceValidator` — validates cross-reference integrity between hydrated artifacts (ADR-012 §5.4).

Given the artifacts loaded so far (graph nodes + edges, search entries, building entries, POI entries), verify that all referenced node IDs actually exist.

## What it validates

1. **Edges → Nodes**: Every `edge.from` and `edge.to` references an existing node in the graph
2. **Search entries → Nodes**: Every `entry.nodeId` references an existing node
3. **Building entries → Nodes**: Every `building.entrances[].nodeId` references an existing node
4. **POI entries → Nodes**: Every `point.nodeId` references an existing node

## Non-goals

- ❌ No filesystem awareness (T20)
- ❌ No checksum verification (T21)
- ❌ No JSON parsing or schema validation (T22)
- ❌ No manifest awareness (T24)
- ❌ No routing validation (graph connectivity is T23-level, full routing is runtime engine)
- ❌ No attribute-level validation (room numbers, floor numbers, etc.)

## Success Criteria

1. All edges reference valid nodes → success
2. Missing edge target → `ValidateFailure { code: 'REFERENCE_MISSING_NODE' }`
3. Missing search nodeId → `ValidateFailure`
4. Missing building entrance nodeId → `ValidateFailure`
5. Missing POI nodeId → `ValidateFailure`
6. Empty graph (no nodes, no edges) → success (degenerate case)
7. All old tests still green

## Pitfalls

- ADR-012 Invariant 4: Semantic validation only — no filesystem, no checksums, no orchestration
- ADR-012 Step 4 is strictly about cross-reference ID integrity, not route validity or graph connectivity
- Build a set of node IDs once, then validate all references against it (O(n+m) not O(n*m))
- ERROR 2026-07-08: Keep it simple — a single `ReferenceValidator` class, not an abstract framework
