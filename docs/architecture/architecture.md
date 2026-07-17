# NAVI Architecture Overview

**Frozen at:** `checkpoint/pre-stabilization` (commit `57600fd`)
**Date:** 2026-07-15

> This document is a frozen reference for a clean rebuild. It describes the actual codebase on disk at the checkpoint tag, not an aspirational design.

---

## Table of Contents

1. [Repository Topology](#1-repository-topology)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Package Dependency Graph](#3-package-dependency-graph)
4. [Key Entry Points](#4-key-entry-points)
5. [Strangler Fig Architecture](#5-strangler-fig-architecture)
6. [Two Lifecycles: Editing vs Publishing](#6-two-lifecycles-editing-vs-publishing)
7. [Build System](#7-build-system)
8. [Data Flow Overview](#8-data-flow-overview)
9. [Critical Architectural Risks](#9-critical-architectural-risks)

---

## 1. Repository Topology

The project root at `C:\Users\Administrator\Desktop\CODEme\Navi` contains:

```
navi/
├── navi-next/               ← Next.js 16 application (THE app)
│   ├── src/                 ← Application source code
│   │   ├── app/             ← Next.js App Router pages & API routes
│   │   ├── components/      ← React components (legacy + studio)
│   │   ├── store/           ← Zustand stores (legacy)
│   │   ├── services/        ← Service layer (adapters, bridges)
│   │   ├── engine/          ← Legacy engine (pure TS, framework-agnostic)
│   │   ├── data/            ← Static data
│   │   ├── hooks/           ← React hooks
│   │   ├── lib/             ← Shared utilities
│   │   └── types/           ← TypeScript types
│   ├── packages/            ← Workspace packages (the "new" architecture)
│   │   ├── core/            ← Types, geometry, coordinates, serialization
│   │   ├── compiler/        ← Navigation graph compiler (server-side)
│   │   ├── editor/          ← Editor services, tools, commands, rendering
│   │   └── runtime/         ← Runtime (routing, search, offline)
│   └── package.json         ← Next.js workspace root
├── navi-admin/              ← Vite prototype (NOT in use, archived reference)
├── docs/                    ← Architecture docs
├── .opencode/               ← IDE agent config
└── (config files)
```

**Key fact:** `navi-next/packages/` — not a top-level `packages/` — is the workspace. The Next.js app lives directly in `navi-next/`.

---

## 2. Monorepo Structure

The workspace is defined in `navi-next/package.json`:

```json
{
  "workspaces": ["packages/*"]
}
```

### Packages (all under `navi-next/packages/`)

| Package | Path | Role | Browser-safe? |
|---------|------|------|---------------|
| **`@navi/core`** | `packages/core/` | Types, geometry engine, coordinate transformers, serialization (CampusDocument ↔ JSON) | ✅ Yes |
| **`@navi/compiler`** | `packages/compiler/` | Navigation graph compiler — parses CampusDocument, builds NavGraph, search index, POI data, building index. Uses Node `crypto` (SHA-256 checksums). | ❌ Server only |
| **`@navi/editor`** | `packages/editor/` | Editor services: commands, tools, rendering, validation, history, selection, viewport, event bus, workflows, panels. Framework-agnostic (no React imports). | ✅ Yes |
| **`@navi/runtime`** | `packages/runtime/` | Runtime engine for the end-user app: routing (A\*), search, position, offline store. | ✅ Yes |

### Import conventions

- `@navi/editor` imports from `@navi/core` (types, geometry)
- `@navi/compiler` imports from `@navi/core` (types)
- `@navi/runtime` imports from `@navi/core` (types)
- The Next.js app (`navi-next/src/`) imports from `@navi/editor` and `@navi/core`
- `@navi/compiler` is NEVER imported directly in client code — it is called via the `/api/compile` route or the `compiler-server.ts` adapter

### The Legacy Layer (`navi-next/src/`)

Alongside the new packages, `navi-next/src/` contains a parallel legacy system:

- **`src/engine/`** — Pure TS: `graph.ts`, `a-star.ts`, `graph-validator.ts`, `component-compiler.ts`, `directory.ts`, `geo-utils.ts`, `geometry.ts`, `intersection-engine.ts`, `trace-compiler.ts`, `spatial-resolver.ts`. Used by `graph-store.ts`.
- **`src/store/`** — Zustand stores: `graph-store.ts`, `studio-store.ts`, `ui-store.ts`, `campus-map-store.ts`, `public-store.ts`
- **`src/types/`** — `nav-types.ts` (the legacy canonical types), `building.ts`, `campus-map.ts`, `campus.ts`, `studio-types.ts`
- **`src/components/studio/`** — Studio UI components with rendering, interaction, toolbar
- **`src/services/`** — `compiler-adapter.ts` (client-side adapter calling `/api/compile`), `compiler-server.ts` (server-side direct import)

This is the **Strangler Fig** pattern — new `packages/` code slowly replaces legacy `src/` code. Both coexist.

---

## 3. Package Dependency Graph

```
┌─────────────┐
│  @navi/core │  ← No internal dependencies
└──────┬──────┘
       │
       ▼
┌──────────────────┐     ┌──────────────────┐
│ @navi/compiler   │     │ @navi/editor     │
│ (server-side)    │     │ (browser-safe)   │
└──────────────────┘     └──────┬───────────┘
                                │
                                ▼
                      ┌──────────────────┐
                      │ @navi/runtime    │
                      └──────────────────┘
                                │
                                ▼
                      ┌──────────────────┐
                      │  navi-next/app   │ ← Next.js app layer
                      │  (wires it all)  │
                      └──────────────────┘
```

---

## 4. Key Entry Points

### Application Boot
- **`navi-next/src/app/layout.tsx`** — Root layout
- **`navi-next/src/app/(admin)/studio/`** — Studio admin pages
- **`navi-next/src/components/studio/StudioWorkspace.tsx`** — Studio main layout (toolbar + explorer + canvas + properties panel). Creates the autosave interval (30s).
- **`navi-next/src/components/studio/EditorBridge.tsx`** — Creates the `@navi/editor` context ONCE per mount, bridges legacy Zustand stores with new SelectionManager. **This is the critical integration point.**

### API Routes (all in `navi-next/src/app/api/`)
- **`/api/compile`** — POST, compiles CampusDocument → navigation artifacts via `@navi/compiler`
- **`/api/publish`** — POST, writes compiled artifacts to disk (`demo-output/`)
- **`/api/graph`** — POST/GET, persists graph snapshot to Supabase
- **`/api/campuses`**, **`/api/buildings`**, **`/api/campus-maps`**, **`/api/floor-plans`**, **`/api/graph`**, **`/api/osm-buildings`**, **`/api/demo`**

### Package Entry Points
- **`@navi/core`**: `packages/core/src/index.ts` — exports all types, geometry, serialization, coordinates
- **`@navi/compiler`**: `packages/compiler/src/index.ts` — exports `CampusCompiler`, `compile`, artifact builders, pipeline stages and plugins
- **`@navi/editor`**: `packages/editor/src/index.ts` — exports context providers, event bus, commands, tools, selection, viewport, editing context, canvas, validation, shell, panels, rendering, services
- **`@navi/runtime`**: `packages/runtime/src/index.ts` — exports engine, loader, position, routing, search, store

---

## 5. Strangler Fig Architecture

The project is mid-migration from a legacy monolith to a modular package architecture. The migration strategy is documented in ADR-0005.

### What's being strangled
- **`src/engine/Graph`** class → replaced by `CampusDocument` (`@navi/core`) and `@navi/editor` services
- **`src/store/graph-store.ts`** (Zustand, localStorage) → replaced by `DocumentStore` + `WorkflowService` (`@navi/editor`)
- **`MapRenderer`** (legacy, `l-` prefixed layers) → replaced by `EntityRenderer` (`@navi/editor`, `navi-` prefixed layers)
- **`InteractionController`** (direct map click handling) → replaced by `ToolRegistry` + individual tools (`selectTool`, etc.)

### What's still legacy (not yet strangled)
- **`src/store/studio-store.ts`** — `tool`, `selectedNodeId`, `activeBuildingId`, `layers` — entirely legacy, but bridged to `SelectionManager`
- **`InteractionController.tsx`** — All drawing interactions (route tracing, building tracing, room drag) bypass the new tool system
- **`src/engine/graph.ts`** — Legacy `Graph` class (nodes, edges, buildings, components). Used by `graph-store.ts` which feeds `EditorBridge`
- **`NavigationGraphRenderer.tsx`** — Separate renderer for the compiled graph (even in the new system)

### Migration status
- ✅ **Selection** — Migrated to `SelectionManager` with `SelectionBridge` for legacy sync
- ✅ **Viewport** — Migrated to `Viewport` service with command queue
- ✅ **Event bus** — Migrated to `DocumentEventBus`
- ✅ **Commands** — Migrated to `CommandDispatcher` + `CommandRegistry` with handler files per entity type
- ✅ **History** — Migrated to `HistoryStack` (inverse commands + snapshot fallback)
- 🟡 **Rendering** — Dual: `EntityRenderer` (new) and `MapRenderer` + `NavigationGraphRenderer` (legacy), both active
- 🟡 **Tools** — Dual: `ToolRegistry` (new) and `InteractionController` (legacy), NOT synced
- ❌ **Graph store** — Legacy `graph-store.ts` still the data source; `CampusDocument` is the target

---

## 6. Two Lifecycles: Editing vs Publishing

Architected in ADR-0006:

1. **Editing lifecycle** (long-lived, mutable)
   - Source of truth: `CampusDocument` (in-memory) + local persistence
   - Mutations: Commands via `CommandDispatcher`
   - Autosave: `WorkflowService.save('autosave')` every 30s
   - Persistence: localStorage (primary) + Supabase (secondary, unreliable)

2. **Publishing lifecycle** (immutable, versioned)
   - Compilation: `CampusCompiler.compile(document)` → `NavigationGraph`
   - Artifacts: `navigationGraph`, `searchIndex`, `poiData`, `buildingIndex`
   - Output: Written to `demo-output/` with SHA-256 checksums and manifest
   - The runtime app only consumes published artifacts, never the live document

---

## 7. Build System

- **Framework:** Next.js 16.2.9 (App Router, React 19.2.4)
- **Bundler:** Next.js built-in (SWC + Turbopack dev)
- **CSS:** TailwindCSS 3.4.x
- **TypeScript:** ^5
- **Testing:** Vitest 4.1.9 (per-package configs)
- **Package manager:** npm (workspaces)

### Per-package configs
Each of `packages/core`, `packages/compiler`, `packages/editor`, `packages/runtime` has its own:
- `tsconfig.json`
- `vitest.config.ts`
- `package.json`

The root `navi-next/package.json` defines workspace scripts: `dev`, `build`, `test`, `benchmark`, `stress`, `publish`, `validate`, `demo`.

---

## 8. Data Flow Overview

```
User clicks map
       │
       ▼
┌─────────────────────┐     ┌─────────────────────┐
│ InteractionController│     │  New Tool system    │
│ (legacy, Renders null)│    │ (registry.ts,       │
│ Handles clicks,mousedown, │  select-tool.ts,     │
│ mouseup,mousemove, key)  │  draw-*-tool.ts)     │
└─────────┬───────────┘     └──────────┬──────────┘
          │                            │
          ▼                            ▼
┌─────────────────────┐     ┌─────────────────────┐
│  useGraphStore      │     │  CommandDispatcher  │
│  (Zustand, legacy)  │     │  (@navi/editor)     │
│  graph, nodes,      │     │  entity handlers    │
│  edges, buildings   │     └──────────┬──────────┘
└─────────┬───────────┘               │
          │                           ▼
          ▼                  ┌─────────────────────┐
┌─────────────────────┐     │  DocumentStore      │
│  EditorBridge       │────→│  CampusDocument     │
│  (creates context   │     │  (@navi/core types) │
│   from graph-store) │     └──────────┬──────────┘
└─────────┬───────────┘               │
          │                           ▼
          ▼                  ┌─────────────────────┐
┌─────────────────────┐     │  WorkflowService    │
│  MapRenderer        │     │  → Persistence      │
│  NavigationGraphRdr │     │  → Compiler         │
│  EntityRenderer     │     │  → Publish          │
│  (all on map)       │     └─────────────────────┘
└─────────────────────┘
```

---

## 9. Critical Architectural Risks

1. **Two tool systems, not synced.** `StudioToolbar.tsx` calls `toolRegistry.activate('select')` but `InteractionController.tsx` reads `useStudioStore.tool`. The new `select-tool.ts` has `entityAtEvent()` that returns `null` (stub). Drawing interactions only exist in the legacy `InteractionController`.

2. **Two rendering systems, overlapping.** `MapRenderer` (legacy) uses `l-` prefixed layer IDs. `EntityRenderer` (new) uses `navi-` prefixed IDs. Both write to the same map. Buildings are rendered twice unless `layers.buildings` toggle is carefully managed.

3. **SyncToSupabase broken.** At `graph-store.ts:257`, `syncToSupabase` fails with `"invalid input syntax for integer: [0]"` — the Supabase schema doesn't match the snapshot format. This means cloud persistence is non-functional.

4. **EditorBridge creates context ONCE from the initial graph.** The `CampusDocument` is created from the legacy `Graph` at mount time. Post-mount graph changes flow through `SelectionBridge` but the document itself may not reflect all legacy graph mutations.

5. **The `Graph` → `CampusDocument` bridge is one-directional.** `EditorBridge` reads from `useGraphStore.getState().graph` at mount time. Legacy mutations to `graph-store` that create entities (rooms, buildings) via `addComponent` or `addBuilding` may not flow into the new `CampusDocument` that `@navi/editor` services operate on.
