# Task 6: Extend Graph Store for Studio Operations

## What Changed

**File modified:** `src/store/graph-store.ts`

- Added `TracePath` to imports from `../types/nav-types`
- Added `addTrace`, `removeTrace`, `addComponentWithPolygon` to `GraphState` interface
- Updated `addComponent` to preserve polygon: changed `graph.addComponent(component)` → `graph.addComponent({ ...component, polygon: result.polygon ?? component.polygon })`
- Added three new store methods:
  - `addTrace` — filters room nodes, calls `graph.addTraceWithCompile`
  - `removeTrace` — calls `graph.removeTrace`
  - `addComponentWithPolygon` — compiles component with polygon preservation and adds nodes/edges

## Test Results

```
✓ 7 test files passed | 52 tests passed
```
All tests pass with no failures.

## Deviations

None. Implemented exactly per brief.
