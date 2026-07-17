# NAVI Compiler Architecture

**Frozen at:** `checkpoint/pre-stabilization` (commit `57600fd`)
**Date:** 2026-07-15

---

## Table of Contents

1. [Overview](#1-overview)
2. [Package Structure](#2-package-structure)
3. [CampusCompiler Pipeline](#3-campuscompiler-pipeline)
4. [Artifacts Produced](#4-artifacts-produced)
5. [API Route: /api/compile](#5-api-route-apicompile)
6. [API Route: /api/publish](#6-api-route-apipublish)
7. [Compiler Adapters (Client vs Server)](#7-compiler-adapters-client-vs-server)
8. [Legacy Compile Function](#8-legacy-compile-function)
9. [Plugin System](#9-plugin-system)
10. [Known Issues](#10-known-issues)

---

## 1. Overview

The Compiler transforms a `CampusDocument` (the editing source of truth) into a set of immutable navigation artifacts consumed by the runtime app. This is a **server-side only** operation because `@navi/compiler` depends on Node.js built-ins (`crypto` for SHA-256 checksums, `fs` for I/O).

**Architectural principle (ADR-0002):** The NavigationGraph is always compiled, never hand-edited. The compiler is the single bridge between the editing lifecycle and the runtime lifecycle.

---

## 2. Package Structure

```
packages/compiler/src/
├── compiler.ts                   ← Re-exports compile() + CampusCompiler
├── index.ts                      ← Public API exports
├── types/                        ← TypeScript types
│   └── index.ts
├── pipeline/
│   ├── compile.ts                ← Legacy compile() function + re-exports CampusCompiler
│   └── campus-compiler.ts        ← CampusCompiler class (stage-based)
│   └── stages/                   ← Individual pipeline stages
│       ├── parse-stage.ts
│       ├── build-nodes-stage.ts
│       ├── build-edges-stage.ts
│       ├── connect-campuses-stage.ts
│       ├── optimize-stage.ts
│       └── validate-stage.ts
├── extractors/
│   └── direct-extract.ts         ← Extraction logic (legacy path)
├── artifacts/
│   ├── index.ts                  ← Re-exports
│   └── artifact-generator.ts     ← buildGraph, buildSearchIndex, buildPOIData, buildBuildingIndex
├── plugins/
│   └── index.ts                  ← Example plugins (accessibilityWeightPlugin, customValidationPlugin)
└── publisher/
    └── index.ts
```

---

## 3. CampusCompiler Pipeline

The `CampusCompiler` runs six stages sequentially, each a `CompilerStagePlugin`. Stages are executed in fixed order. Each receives the shared context from prior stages.

### Stage Order

| # | Stage ID | Class | Purpose | Output |
|---|----------|-------|---------|--------|
| 1 | `parse` | `ParseStage` | Parses CampusDocument into intermediate representation | `ParsedDocument` (spaces, transitions, corridors) |
| 2 | `build-nodes` | `BuildNodesStage` | Creates `NavNode[]` from parsed entities | `NavNode[]` |
| 3 | `build-edges` | `BuildEdgesStage` | Creates `NavEdge[]` connecting nodes | `NavEdge[]` |
| 4 | `connect-campuses` | `CampusConnectorStage` | Adds edges between separate campus buildings | `NavEdge[]` (additional) |
| 5 | `optimize` | `OptimizeStage` | Prunes redundant nodes, merges close nodes | Optimized nodes + edges |
| 6 | `validate` | `ValidateStage` | Runs validation checks on the compiled graph | `CompileStats`, warnings, errors |

### Execution model

```typescript
const compiler = new CampusCompiler({ nodeInterval: 5, mergeThreshold: 3, optimizationLevel: 'moderate' })
const result = compiler.compile(document)
// result.success, result.graph, result.stats, result.warnings, result.errors
```

The compiler also has `compileWithProgress(document, onProgress)` for UI progress reporting.

### Context passing

Stages communicate through a shared `ctx: Record<string, unknown>` object. After the `parse` stage, `ctx.parsed` holds the `ParsedDocument`. Each stage can read from and write to `ctx`.

### Error handling

- Errors halt the pipeline immediately (no further stages run).
- Warnings are collected across all stages and returned in the result.
- Fatal exceptions are caught and returned as a single `COMPILE_ERROR` entry.

---

## 4. Artifacts Produced

Four artifacts are produced by compilation (built in `artifact-generator.ts`):

### 4.1 NavigationGraph (`navigation.graph.json`)
```typescript
interface NavigationGraph {
  version: string
  campusId: string
  createdAt: string         // ISO timestamp
  checksum: string          // SHA-256 of content (excluding createdAt and checksum)
  nodes: NavNode[]          // { id, label, type, position, floor, buildingId, properties }
  edges: NavEdge[]          // { id, from, to, type, distance, weight }
  metadata: {
    nodeCount: number
    edgeCount: number
    buildings: number
    floors: number
    boundingBox: BoundingBox
  }
}
```

Build steps:
1. **Spaces → nav nodes** — Each room/space becomes a `type: 'space'` node
2. **Transitions → nav nodes** — Staircases, elevators become `type: 'transition'` nodes
3. **Corridor endpoints → nav nodes** — Each corridor polyline gets start/end nodes (type `'corridor'`) plus an edge between them
4. **Connect rooms to nearest entrance** — On same building/floor
5. **Connect nearby rooms** — Within 50m on same building/floor
6. **Connect entrances to nearest corridor endpoint** — Within 200m

### 4.2 Search Index (`search.index.json`)
```typescript
interface SearchIndex {
  version: string
  entries: SearchEntry[]    // { id, label, type, nodeId, position, tags, buildingId, floor? }
}
```
One entry per building (with code, category, aliases as tags) and one per room (with number, category as tags).

### 4.3 POI Data (`poi.json`)
```typescript
interface POIData {
  version: string
  points: POI[]             // { id, label, category, position, buildingId, floor, nodeId, properties }
}
```
Every navigation node becomes a POI point.

### 4.4 Building Index (`building-index.json`)
```typescript
interface BuildingIndex {
  version: string
  buildings: BuildingEntry[]  // { id, name, code, category, position, floors[], entrances[], nodeId }
}
```
Hierarchical: building → floors → rooms, with entrance positions and node references.

### 4.5 Manifest (`manifest.json`)
Generated by `generateManifest()`. Contains:
- Project/campus ID
- Published timestamp
- Schema version
- Compiler version
- Per-artifact filename, SHA-256 checksum, byte size

---

## 5. API Route: /api/compile

### File
`navi-next/src/app/api/compile/route.ts`

### Endpoint
```
POST /api/compile
Content-Type: application/json

{ "document": CampusDocument }
```

### Response (success)
```json
{
  "status": "success",
  "artifacts": {
    "navigationGraph": { ... },
    "stats": { ... },
    "searchIndex": { ... },
    "poiData": { ... },
    "buildingIndex": { ... }
  },
  "timestamp": 1234567890
}
```

### Response (error)
```json
{
  "status": "error",
  "message": "Invalid document payload",
  "timestamp": 1234567890
}
```

### Implementation details
- Validates that `document.buildings` and `document.metadata` exist (400 if missing)
- Dynamically imports `@navi/compiler` — this is critical because `@navi/compiler` depends on Node `crypto`/`fs`. Dynamic import keeps the client bundle clean.
- Creates `new CampusCompiler()` with default config (no config passed)
- Calls `compiler.compile(document)` then `buildSearchIndex`, `buildPOIData`, `buildBuildingIndex`
- Returns 500 on compilation errors
- Catches all exceptions with `catch (err: any)` — returns 500

---

## 6. API Route: /api/publish

### File
`navi-next/src/app/api/publish/route.ts`

### Endpoint
```
POST /api/publish
Content-Type: application/json

{ "artifacts": CompiledArtifacts, "campusId": string, "revision": string? }
```

### What it does
1. Writes each artifact to `demo-output/` directory on disk:
   - `navigation.graph.json`
   - `search.index.json`
   - `poi.json`
   - `building-index.json`
2. Computes SHA-256 checksums from the exact bytes written (see ERRORS.md 2026-07-08 — checksums are computed from the serialized strings, not from re-read files)
3. Writes `manifest.json`

### Response
```json
{
  "success": true,
  "manifest": { ... },
  "counts": { "nodes": 42, "edges": 128 }
}
```

---

## 7. Compiler Adapters (Client vs Server)

The `@navi/editor` package defines a `CompilerAdapter` interface:

```typescript
interface CompilerAdapter {
  compile(document: CampusDocument): Promise<CompileResult>
}
```

### Client adapter: `createCompilerAdapter()`

**File:** `navi-next/src/services/compiler-adapter.ts`

```typescript
export function createCompilerAdapter(): CompilerAdapter {
  return {
    async compile(document) {
      const response = await fetch('/api/compile', { method: 'POST', body: JSON.stringify({ document }) })
      // ... parse response, extract navigationGraph, searchIndex, poiData, buildingIndex
    }
  }
}
```

Used in `EditorBridge.tsx` to create the `NavigationCompiler` service:
```typescript
const navCompiler = new NavigationCompiler(createCompilerAdapter())
```

### Server adapter: `CampusCompilerAdapter`

**File:** `navi-next/src/services/compiler-server.ts`

```typescript
export class CampusCompilerAdapter implements CompilerAdapter {
  async compile(document) {
    const { CampusCompiler, buildSearchIndex, buildPOIData, buildBuildingIndex } = await import('@navi/compiler')
    const compiler = new CampusCompiler({ nodeInterval: 5, mergeThreshold: 3, ... })
    const result = compiler.compile(document)
    // ... build artifacts
  }
}
```

This direct-import version is intended for server-side use but is not currently called from the API route (which does its own import). It was likely part of an earlier iteration.

### NavigationCompiler service

**File:** `packages/editor/src/services/navigation-compiler.ts`

A thin wrapper service in `@navi/editor` that:
- Delegates to the injected `CompilerAdapter`
- Deduplicates concurrent calls (returns in-flight promise)
- Is **stateless** — never stores `lastResult`. The `WorkflowService` owns compile results in `WorkflowStore`.

---

## 8. Legacy Compile Function

### File
`packages/compiler/src/pipeline/compile.ts`

The standalone `compile(document, config)` function uses the **old pipeline path** — `directExtract` → `buildGraph` — without the plugin system. It is marked `@deprecated` in favor of `new CampusCompiler(config).compile(document)`.

It produces:
- `NavigationGraph` with SHA-256 checksum
- `CompileReport` with counts and warnings
- `ExtractionResult` (raw extraction data)

---

## 9. Plugin System

The `CampusCompiler` supports a plugin architecture for extending pipeline stages.

### Plugin interface
```typescript
interface CompilerStagePlugin {
  id: string                  // Must start with "compiler-"
  targetStage: CompileStageId // Which stage to attach to
  mode: 'replace' | 'augment'// Replace the stage entirely or wrap it
  execute(input, next): output
}
```

### Registration
```typescript
compiler.registerPlugin(accessibilityWeightPlugin)
compiler.registerPlugins([customValidationPlugin])
```

### Execution chain
- **`replace`** mode: The plugin replaces the default stage implementation entirely. Receives `next` as a fallback.
- **`augment`** mode: Wraps the default stage. Multiple augment plugins chain in reverse registration order (last registered runs closest to the default).

### Built-in plugins
- `accessibilityWeightPlugin` — Adjusts edge weights for wheelchair accessibility
- `customValidationPlugin` — Adds custom validation rules

---

## 10. Known Issues

### Checksum calculation
The checksum is computed from `JSON.stringify(contentOnly)` excluding `createdAt` and `checksum` fields. Two different `JSON.stringify` calls can produce different output due to property ordering. This means identical documents can produce different checksums across Node.js versions or serialization paths.

### Config inconsistency
`/api/compile/route.ts` creates `new CampusCompiler()` with no config (default config is `{} as CompilerConfig`). The `CampusCompilerAdapter` in `compiler-server.ts` passes explicit config (`{ nodeInterval: 5, mergeThreshold: 3 }`). The `EditorBridge` uses the client adapter (no config). There is no single source of truth for compiler configuration.

### Dynamic import
The dynamic `import('@navi/compiler')` in the API route means compilation is cold-start on first request. This is acceptable for an admin tool but would need optimization for production use.

### Demo output path
The publish route writes to `demo-output/` relative to `process.cwd()`. This path is hardcoded and not configurable.
