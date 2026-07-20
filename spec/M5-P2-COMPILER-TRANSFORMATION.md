# M5 Phase 2 — Compiler Transformation

**Status:** Draft
**Depends on:** ADR-009 (Compiler Pipeline Architecture), M5 Phase 1 (Domain Model)

## Problem

The existing compiler at `packages/compiler/` uses a 6-stage pipeline operating on flat types (`NavigationSpace`, `TransitionPoint`, `WalkableCorridor`) that predate M5. It cannot consume the new entity types (`VerticalConnector`, `ConnectorStop`, `RoomDoor`, `Anchor`) added in Phase 1, and its output (`CompileResult.graph`) lacks the structured artifact bundle (`NavigationArtifacts`) described in ADR-009.

## Goals

1. **New entity consumption** — Compiler extracts primitives from `VerticalConnector`, `ConnectorStop`, `RoomDoor`, `Anchor` types
2. **PrimitiveGraph IR** — New `PrimitiveNode`/`PrimitiveEdge` discriminated types coexist with old extraction types; PrimitiveGraph is produced by Stage 2
3. **Connectivity isolation** — Phase 3.1 (Normalize) repairs; Phase 3.2 (Validate) inspects; Phase 3.3 (Emit) transforms — no phase does another's job
4. **Mechanical graph emission** — Phase 3.3 emits NavNode/NavEdge via a pure for-loop with zero spatial searching
5. **Diagnostics pipeline** — `CompilerDiagnostic` flows through the entire pipeline, accumulating without blocking compilation
6. **Backward compatibility** — Existing `compile()` function and `CompileResult` continue working; `CampusCompiler.compileV2()` is a *temporary* migration endpoint

## Non-goals

- ❌ Removal of old extraction types (`NavigationSpace`, `TransitionPoint`, `WalkableCorridor`) — deferred to M6
- ❌ Removal of `compileV2()` — deferred to M7 (replaces `compile()`)
- ❌ Editor UX changes
- ❌ Runtime behavior changes
- ❌ Performance optimization beyond baseline
- ❌ `PrimitiveSource` / `ConnectivityResolver` / `ArtifactEnricher` extension point implementations

## API Migration Plan

`compileV2()` is a temporary migration endpoint, not the future compiler API.

| Milestone | Status | API |
|-----------|--------|-----|
| M5 | This phase | `compile()` (legacy, unchanged) + `compileV2()` (new pipeline, side by side) |
| M6 | Next | `compile()` = new pipeline (replaces old). Old path via `compileLegacy()` (deprecated) |
| M7 | Future | `compile()` only. `compileLegacy()` removed. |

> `compileV2()` exists only during the migration window and will replace `compile()` once parity is achieved.

## Acceptance Criteria

1. **AC1**: `CampusCompiler.compileV2(document)` returns `CompileResultV2` containing `PrimitiveGraph`, `NavigationArtifacts`, and `CompilerReport`
2. **AC2**: New entity types (`VerticalConnector`, `ConnectorStop`, `RoomDoor`, `Anchor`) produce primitives (transition nodes, access edges, POI nodes)
3. **AC3**: Existing `compile(document, config)` returns identical output for documents without new entity types
4. **AC4**: Phase 3.3 (Emit) performs no spatial searches — verified by injecting a spy that throws on nearest-neighbor calls
5. **AC5**: Diagnostics accumulate across all phases; structural errors halt, warnings/info never block
6. **AC6**: All existing compiler tests continue passing
7. **AC7**: Compilation is deterministic — identical `CampusDocument` produces byte-identical `NavigationArtifacts` (same checksums)

## Technical Approach

### Pipeline Architecture

```
CampusDocument
      │
      ▼
Stage 1: Normalize
  Phase 1.1 — Parse & Validate (existing, extended for new entities)
  Phase 1.2 — Geometry Normalize (local→world for new entity positions)

Stage 2: Generate Primitives
  Phase 2.1 — Extract Sources (coordinator: runs independent extractors in order)
  Phase 2.2 — Skeletonize (pluggable SkeletonGenerator)
  Phase 2.3 — Connect & Resolve (nearest-waypoint, transition pairing, portal edges)

Stage 3: Build Graph
  Phase 3.1 — Normalize Connectivity (snap, merge, pair — modifies)
  Phase 3.2 — Validate Connectivity (orphans, disconnected, dangling — read-only)
  Phase 3.3 — Emit Graph (mechanical for-loop — no spatial search)

Stage 4: Assemble Artifacts
  Phase 4.1 — Build Indexes
  Phase 4.2 — Serialize & Checksum
      │
      ▼
NavigationArtifacts
```

### Architectural Rules

1. **Primitive extractors never know each other.** `RoomExtractor` never calls `DoorExtractor`. The `PrimitiveCoordinator` runs extractors sequentially and merges their output. Each extractor is independently testable and replaceable.

2. **Normalize modifies, Validate inspects, Emit transforms.** Phase 3.1 may merge/remove nodes. Phase 3.2 is read-only — it reports, never fixes. Phase 3.3 is a pure type-level transform with zero spatial logic.

3. **Separation prevents regressions.** If emit accidentally searched spatially, the AC4 spy catches it. If validate mutated the graph, a post-phase snapshot diff catches it.

### Key Types

```typescript
interface CompilerReport {
  diagnostics: CompilerDiagnostic[]
  statistics: CompilerStatistics
}

interface CompilerStatistics {
  rooms: number
  hallways: number
  roads: number
  primitives: number      // total PrimitiveNodes generated
  waypoints: number       // waypoint nodes only
  edges: number           // total PrimitiveEdges generated
  diagnostics: { error: number; warning: number; info: number }
  compileTime: number     // ms
}

interface CompilerDiagnostic {
  severity: 'info' | 'warning' | 'error'
  sourceEntityId: string
  phase: 'normalize' | 'primitives' | 'connectivity' | 'graph' | 'artifacts'
  code: string
  message: string
  relatedNodeIds?: string[]
}

interface NavigationArtifacts {
  graph: NavigationGraph
  searchIndex: SearchIndex
  spatialIndex: SpatialIndex
  buildingIndex: BuildingIndex
  poiIndex: POIIndex
  extensions: Record<string, unknown>  // future artifacts without schema break
}
```

### SkeletonGenerator Interface

```typescript
interface SkeletonGenerator {
  readonly id: string
  generate(
    document: NormalizedDocument,
    primitives: PrimitiveContribution,
    context: GenerationContext,
  ): PrimitiveContribution
}
```

Built-in: `PolylineSkeletonGenerator` (hallway/road sampling). Future: `VisibilityGraphGenerator`, `NavMeshGenerator`, `AIPathGenerator` — all implement the same interface.

### Diagnostics Codes

| Code | Severity | Phase | When |
|------|----------|-------|------|
| `ROOM_NO_DOOR` | info | 2.1 | Room has no RoomDoor → centroid fallback |
| `DOOR_ORPHANED` | warning | 2.3 | RoomDoor has no waypoint on same floor |
| `STOP_UNPAIRED` | warning | 2.3 | ConnectorStop has no paired stop on adjacent floor |
| `ENTRANCE_UNCONNECTED` | warning | 2.3 | EntrancePortal has no road nearby |
| `SKELETON_DANGLING` | warning | 3.2 | Waypoint with zero incident edges after merge |
| `HALLWAY_DISCONNECTED` | error | 3.2 | Hallway skeleton forms disconnected components |

### File Changes

| File | Change |
|------|--------|
| `packages/compiler/src/types/index.ts` | Add `PrimitiveNode`, `PrimitiveEdge`, `PrimitiveGraph`, `CompilerDiagnostic`, `CompilerReport`, `CompilerStatistics`, `ConnectivityGraph`, `NavigationArtifacts`, `SkeletonGenerator` |
| `packages/compiler/src/primitives/` | New directory |
| `packages/compiler/src/primitives/coordinator.ts` | Phase 2.1 coordinator — runs extractors, merges output |
| `packages/compiler/src/primitives/room-extractor.ts` | Room → POI |
| `packages/compiler/src/primitives/door-extractor.ts` | RoomDoor → AccessEdge spec (paired with room) |
| `packages/compiler/src/primitives/anchor-extractor.ts` | Anchor → POI |
| `packages/compiler/src/primitives/connector-extractor.ts` | ConnectorStop → Transition node |
| `packages/compiler/src/primitives/entrance-extractor.ts` | Entrance → EntrancePortalNode |
| `packages/compiler/src/primitives/skeleton-generator.ts` | Phase 2.2 — PolylineSkeletonGenerator |
| `packages/compiler/src/primitives/connector.ts` | Phase 2.3 — nearest-waypoint resolution, transition pairing |
| `packages/compiler/src/connectivity/normalizer.ts` | Phase 3.1 — snap, merge, pair |
| `packages/compiler/src/connectivity/validator.ts` | Phase 3.2 — orphan, disconnect, dangling detection (read-only) |
| `packages/compiler/src/emitter/index.ts` | Phase 3.3 — mechanical Primitive→NavNode/Edge |
| `packages/compiler/src/artifacts/` | Phase 4 — extend for NavigationArtifacts + extensions map |
| `packages/compiler/src/pipeline/campus-compiler.ts` | Add `compileV2()` method, wire new stages, collect `CompilerReport` |
| `packages/compiler/src/index.ts` | Export new types and `CampusCompiler.compileV2()` |

### Verification

1. Unit tests for each extractor (room, door, anchor, connector, entrance) — each tested independently, zero cross-knowledge
2. Unit tests for PolylineSkeletonGenerator
3. Unit tests for connector (nearest-waypoint, transition pairing)
4. Unit tests for connectivity normalizer (snap, merge, pair)
5. Unit tests for connectivity validator (read-only — snapshot output, no mutation)
6. Unit tests for emitter (mechanical mapping table)
7. Integration test: full `compileV2()` round-trip with new entity types
8. Regression test: existing `compile()` output identical for old documents
9. Spy verification: Phase 3.3 does zero spatial searches
10. Determinism test: two identical documents produce byte-identical artifacts
