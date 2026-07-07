# Task 2 Report: Fix `removeTrace` for Shared Junction Nodes

## What was implemented
- Created `navi-next/src/engine/__tests__/graph-remove-trace.test.ts` with 2 tests:
  1. **should not delete nodes shared with other traces** — verifies shared junction nodes with `traceIds[]` survive removal and only the removed trace's ID is filtered out
  2. **should delete shared node when last reference is removed** — verifies a shared node is deleted when no other trace references it
- Fixed `removeTrace` in `navi-next/src/engine/graph.ts` to handle:
  - Nodes with `metadata.traceId` (fully owned — deleted)
  - Nodes with `metadata.traceIds[]` (shared — removes ID, keeps node if others remain)
  - Nodes with neither — left unchanged

## Test results
- **RED** (before fix): 2/2 failed
  - `AssertionError: expected [ 'trace-1', 'trace-2' ] to deeply equal [ 'trace-2' ]`
  - `AssertionError: expected { id: 'node', ... } to be undefined`
- **GREEN** (after fix): 2/2 passed

## Files changed
- `navi-next/src/engine/graph.ts` — replaced `removeTrace` (lines 203–218) with shared-node-aware implementation
- `navi-next/src/engine/__tests__/graph-remove-trace.test.ts` — new test file

## Commit
- `c123199` — `fix(route): removeTrace handles shared junction nodes via traceIds`

## Self-review findings
- The existing `recompileTrace` method already had correct shared-node handling (with `traceIds`), but `removeTrace` was never updated — clear oversight
- Using `node.metadata as Record<string, unknown>` avoids TypeScript type narrowing issues from NavNode's union metadata type
- Edge cleanup (orphan edges) still works correctly since it iterates `this._edges` after deletions
- No existing tests broke; the existing trace test in `graph.test.ts` ("removes trace and its generated nodes/edges") still passes because `addTraceWithCompile` uses `traceId` (not `traceIds`) for its nodes, which the new code still handles
