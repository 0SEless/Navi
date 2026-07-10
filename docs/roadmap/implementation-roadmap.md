# NAVI Studio — Implementation Roadmap

**Status**: Active  
**Date**: 2026-07-09  
**Version**: 1.0.0

---

## Purpose

A single execution plan that answers:
- What gets built next?
- What depends on what?
- What defines "done" for each milestone?

This roadmap replaces ad-hoc feature work with a systematic migration from legacy architecture to the documented target architecture. It follows the Strangler Fig pattern: incrementally replace legacy code while maintaining a working application at every step.

---

## Architecture State

```
┌─────────────────────────────────────────────────────────────┐
│                    Architecture State                         │
│                                                             │
│  Legacy (src/)                 New (packages/)               │
│  ┌──────────────────┐         ┌──────────────────┐          │
│  │ StudioCanvas     │         │ @navi/core       │ ✅ Done  │
│  │ StudioToolbar    │         │ @navi/editor     │ ✅ Done  │
│  │ FloorEditor      │         │ @navi/compiler   │ ✅ Done  │
│  │ StudioDashboard  │         │ @navi/runtime    │ ✅ Done  │
│  │ graph-store      │         │                  │          │
│  │ legacy Graph     │         │  ⚠️ Missing:      │          │
│  └──────────────────┘         │  ScopedValidation │ 🔴 Next  │
│                               │  EditorService    │ 🟡 Soon  │
│  Legacy files: 21             │  Plugin examples  │ ✅ Done  │
│  Legacy LOC: ~5,000           └──────────────────┘          │
│  Adapters active: GraphAdapter                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Dependency Graph

```
Phase 1 ── Foundation Complete
  │
  ├── 1.1 Scoped Validation ───────────── depends on: @navi/core, @navi/editor
  ├── 1.2 EditorService Interface ─────── depends on: @navi/editor
  └── 1.3 Strongly Typed Services ────── depends on: 1.2
  │
  ▼
Phase 2 ── UI Migration (Begin)
  │
  ├── 2.1 Toolbar ─────────────────────── depends on: Phase 1
  ├── 2.2 Explorer ────────────────────── depends on: Phase 1
  ├── 2.3 Inspector ───────────────────── depends on: Phase 1
  ├── 2.4 Selection Integration ───────── depends on: 2.1–2.3
  ├── 2.5 StudioCanvas (last!) ────────── depends on: 2.4
  └── 2.6 FloorCanvas ─────────────────── depends on: 2.5
  │
  ▼
Phase 3 ── Interaction Pipeline
  │
  ├── 3.1 Tool → Command Pipeline ─────── depends on: Phase 2
  ├── 3.2 CampusDocument as Source of Truth ── depends on: 3.1
  └── 3.3 Event-Driven Renderer ───────── depends on: 3.2
  │
  ▼
Phase 4 ── Retire Legacy Graph
  │
  ├── 4.1 Migrate Remaining Consumers ─── depends on: Phase 3
  ├── 4.2 Remove GraphAdapter ─────────── depends on: 4.1
  └── 4.3 Delete graph-store + Graph ──── depends on: 4.2
  │
  ▼
Phase 5 ── Product Features
  │
  ├── 5.1 Workflow Card
  ├── 5.2 Compile Preview
  ├── 5.3 Publishing Pipeline
  ├── 5.4 Version History
  ├── 5.5 Problems Panel
  ├── 5.6 Command Palette
  ├── 5.7 Keyboard Shortcuts
  ├── 5.8 Notifications
  └── 5.9 Animation System
  │
  ▼
Phase 6 ── Runtime (NAVI User App)
  │
  ├── 6.1 NavigationSession Model
  ├── 6.2 Navigator UI
  ├── 6.3 Rerouting & Accessibility
  └── 6.4 Production Polish
```

---

## Phase 1 — Complete the Foundation

**Goal**: Eliminate remaining architectural gaps. All new code follows the documented architecture.

### M1.1 — Scoped Validation

| Field | Value |
|-------|-------|
| **Priority** | 🔴 Highest |
| **Estimate** | 2–3 sessions |
| **Architecture doc** | [09 Validation Engine](../architecture/technical/09-validation-engine.md) |
| **Engineering doc** | [04 Testing Strategy](../engineering/04-testing-strategy.md) |
| **Feature file** | `packages/editor/src/validation/` |

**Problem**: Currently `ValidationRegistry.validateAll(document)` runs every validator on the entire campus document. Editing a single room triggers a full-campus validation pass.

**Target**:
```
ValidationEngine
    │
    ▼
ScopeRouter
    ├── EntityScope    (validate one entity by ID)
    ├── FloorScope     (validate one floor of one building)
    ├── BuildingScope  (validate one building)
    └── CampusScope    (validate everything — current behavior)
```

**Acceptance criteria**:
1. `ValidationEngine` wraps `ValidationRegistry` with scope-aware validation
2. `ScopeRouter` routes validation to entity/building/campus level
3. Existing validators work at all scopes (entity-level validators skip cross-entity checks at entity scope)
4. `validateEntity(entityId)` runs only validators that can operate on a single entity
5. All 584 existing tests still pass
6. 15+ new tests for scoped validation

**Files to modify**:
- `packages/editor/src/validation/registry.ts` — add scoped validation API
- `packages/editor/src/validation/validators/*.ts` — add scope metadata to validators
- New: `packages/editor/src/validation/engine.ts` — ValidationEngine + ScopeRouter
- New: `packages/editor/src/validation/engine.test.ts` — scoped validation tests

---

### M1.2 — Formal EditorService Interface

| Field | Value |
|-------|-------|
| **Priority** | 🟡 High |
| **Estimate** | 1 session |
| **Architecture doc** | [02 Editor Application](../architecture/technical/02-editor-application.md) |

**Problem**: `ServiceRegistry` is a generic key-value store. Services don't declare capabilities, health, or dependencies.

**Target**:
```typescript
interface EditorService {
  id: string
  init(): Promise<void>
  destroy(): Promise<void>
  reset(): void
  getConfig(): Record<string, unknown>
  setConfig(config: Record<string, unknown>): void
  health(): ServiceHealth
  dependencies?: ServiceId[]
  capabilities?: Capability[]
}
```

**Acceptance criteria**:
1. `EditorService` interface defined with init/destroy/reset/health
2. All core services implement the interface (EventBus, CommandDispatcher, SelectionManager, Viewport, ToolRegistry, ValidationRegistry, HistoryStack)
3. ServiceRegistry validates dependency ordering on init
4. `health()` returns status for each service
5. All existing tests pass

**Files to modify**:
- `packages/editor/src/context/service-registry.ts` — EditorService interface + typed registry
- `packages/editor/src/eventbus.ts` — implement EditorService
- `packages/editor/src/commands/dispatcher.ts` — implement EditorService
- `packages/editor/src/selection.ts` — implement EditorService
- `packages/editor/src/viewport.ts` — implement EditorService
- `packages/editor/src/tools/registry.ts` — implement EditorService
- `packages/editor/src/validation/registry.ts` — implement EditorService
- `packages/editor/src/history.ts` — implement EditorService

---

### M1.3 — Strongly Typed Services

| Field | Value |
|-------|-------|
| **Priority** | 🟡 High |
| **Estimate** | 1 session |
| **Depends on** | M1.2 |

**Problem**: `getService<T>('history')` is stringly-typed. No compile-time safety.

**Target**:
```typescript
// Option A: Typed accessor
services.history.push(command)

// Option B: Branded accessor
getService<'history', HistoryStack>('history')
```

**Acceptance criteria**:
1. Service access is type-safe (no string casts)
2. `ToolContext.getService` is strongly typed
3. All consumers updated
4. All tests pass

---

## Phase 2 — UI Migration

**Goal**: Incrementally migrate 21 legacy UI components from `src/components/studio/` to `packages/` framework, starting with the smallest/most independent components.

### Migration Order

```
M2.1  Toolbar            (small, independent)    →    src/components/studio/StudioToolbar.tsx
M2.2  Explorer           (tree view, read-only)  →    src/components/studio/LeftPanel.tsx
M2.3  Inspector          (property forms)        →    src/components/studio/NodePropertiesPanel.tsx
M2.4  Selection          (click→select→inspect)  →    integrates M2.2 + M2.3
M2.5  Workflow Card      (compile+save)          →    new component
M2.6  StudioCanvas       (the big one, 869 lines)→    src/components/studio/StudioCanvas.tsx
M2.7  FloorCanvas        (floor editing)         →    src/components/studio/FloorTabs.tsx
```

**Key rule**: Do NOT start with StudioCanvas. It's the largest and most coupled component. Everything else should be stable first.

Acceptance criteria per migration:
1. Legacy component still works (Strangler Fig: old code co-exists)
2. New component has tests (unit + integration)
3. No regressions in existing functionality
4. Component is migrated atomically (one commit per component)

---

## Phase 3 — Interaction Pipeline

**Goal**: Replace direct Graph mutations with the documented interaction pipeline.

### Current Flow
```
Mouse → if(tool==="room") → Graph → syncAllData()
```

### Target Flow
```
Mouse → Tool → Command → CampusDocument → Events → Renderer
```

### M3.1 — Tool → Command Pipeline

Ensure every tool interaction produces a `Command` and dispatches it via `CommandDispatcher`. No tool should directly mutate the document or call legacy Graph methods.

### M3.2 — CampusDocument as Source of Truth

Replace `graph-store` with `CampusDocument` + `CommandBus` as the single source of truth. All reads go through `CampusDocument`. All writes go through `CommandBus`.

### M3.3 — Event-Driven Renderer

The renderer subscribes to `DocumentEventBus` events rather than being called imperatively after every mutation. This decouples rendering from interaction logic.

---

## Phase 4 — Navigation Compiler (formerly "Retire Legacy Graph")

**Goal**: Make `CampusDocument` the single source of truth and turn the legacy Graph into a **compiled navigation artifact** produced by the Navigation Compiler — no longer an editable model.

### Current Bridge
```
CampusDocument → GraphAdapter → Legacy Graph → graph-store → UI
```

> **Reframing (2026-07-10, M2.3):** The Graph is not being "retired" so much as **re-roled**. Today `Graph = Editor + Navigation`. The target architecture separates these: `CampusDocument` owns editing; the Navigation Compiler produces a read-only `NavigationGraph` used exclusively by the routing engine. The Graph becomes a compiled runtime artifact, not an editable model.

### Steps
1. **M4.1**: Migrate remaining consumers from `Graph` to `CampusDocument`
2. **M4.2**: Remove `GraphAdapter` (delete adapter, keep compiler for actual graph generation)
3. **M4.3**: Delete `src/engine/graph.ts`, `src/store/graph-store.ts`, `src/engine/component-compiler.ts`, legacy graph validators

**Final state**:
```
CampusDocument → Navigation Compiler → NavigationGraph → Routing Engine
```

---

## Phase 5 — Product Features

**Goal**: Implement the features described in the product specifications.

| # | Feature | Product Spec | Priority |
|---|---------|-------------|----------|
| 5.1 | Workflow Card | [03 Workflow Card](../architecture/product/03-workflow-card.md) | 🔴 High |
| 5.2 | Compile Preview | [08 Publishing Specification](../architecture/product/08-publishing-specification.md) | 🔴 High |
| 5.3 | Publishing Pipeline | [14 Publish Pipeline](../architecture/product/14-publish-pipeline.md) | 🟡 Medium |
| 5.4 | Version History | [11 Version Management](../architecture/product/11-version-management.md) | 🟡 Medium |
| 5.5 | Problems Panel | [05 Validation UX](../architecture/product/05-validation-ux.md) | 🟡 Medium |
| 5.6 | Command Palette | [15 Advanced Interactions](../architecture/product/15-advanced-interactions.md) | 🟢 Low |
| 5.7 | Keyboard Shortcuts | [15 Advanced Interactions](../architecture/product/15-advanced-interactions.md) | 🟢 Low |
| 5.8 | Notifications | [15 Advanced Interactions](../architecture/product/15-advanced-interactions.md) | 🟢 Low |
| 5.9 | Animation System | [12 Visual Design](../architecture/product/12-visual-design.md) | 🟢 Low |

---

## Phase 6 — Runtime (NAVI User App)

**Goal**: Build the user-facing navigation application, completely separate from the editor.

| # | Feature | Architecture Doc | Depends on |
|---|---------|-----------------|------------|
| 6.1 | NavigationSession Model | [01 CampusDocument Model](../architecture/technical/01-campus-document-model.md) | Phase 4 |
| 6.2 | Navigator UI | New | 6.1 |
| 6.3 | Rerouting & Accessibility | [10 Compiler Pipeline](../architecture/technical/10-compiler-pipeline.md) | 6.1 |
| 6.4 | Production Polish | — | 6.2, 6.3 |

---

## Migration Tracking

```typescript
interface MigrationState {
  phase: 'foundation' | 'ui-migration' | 'interaction-pipeline' | 'retire-graph' | 'product-features' | 'runtime' | 'complete'
  legacyFilesRemaining: number   // current: 21
  legacyLinesOfCode: number      // current: ~5000 (estimated)
  adapterCount: number           // current: 1 (GraphAdapter)
  featureParity: number          // percentage of legacy features migrated
  currentMilestone: string       // e.g. "M1.1"
  blockers: string[]             // anything blocking progress
}
```

Track this in `MIGRATION.md` at the project root.

---

## Quick Reference

| Phase | Milestone | Priority | Effort | Architecture Doc |
|-------|-----------|----------|--------|-----------------|
| 1 | M1.1 Scoped Validation | 🔴 | 2–3 sessions | [09 Validation Engine](../architecture/technical/09-validation-engine.md) |
| 1 | M1.2 EditorService Interface | 🟡 | 1 session | [02 Editor Application](../architecture/technical/02-editor-application.md) |
| 1 | M1.3 Strongly Typed Services | 🟡 | 1 session | [02 Editor Application](../architecture/technical/02-editor-application.md) |
| 2 | M2.1 Toolbar Migration | 🟠 | 1 session | — |
| 2 | M2.2 Explorer Migration | 🟠 | 1–2 sessions | — |
| 2 | M2.3 Inspector Migration | 🟠 | 2 sessions | — |
| 2 | M2.4 Selection Integration | 🟠 | 1 session | [02 Editor Application](../architecture/technical/02-editor-application.md) |
| 2 | M2.5 Workflow Card | 🟡 | 1 session | [03 Workflow Card](../architecture/product/03-workflow-card.md) |
| 2 | M2.6 StudioCanvas | 🔴 | 3–4 sessions | [07 Rendering Architecture](../architecture/technical/07-rendering-architecture.md) |
| 2 | M2.7 FloorCanvas | 🟠 | 1 session | — |
| 3 | M3.1–3.3 Interaction Pipeline | 🔴 | 2–3 sessions | [03 Command System](../architecture/technical/03-command-system.md) |
| 4 | M4.1–4.3 Retire Graph | 🟠 | 2 sessions | [01 CampusDocument Model](../architecture/technical/01-campus-document-model.md) |
| 5 | M5.1–5.9 Product Features | 🟡 | 5+ sessions | Various product specs |
| 6 | M6.1–6.4 Runtime | 🟢 | 3+ sessions | [01 CampusDocument Model](../architecture/technical/01-campus-document-model.md) |

---

## Change Log

| Date | Change |
|------|--------|
| 2026-07-09 | Initial roadmap created after architecture audit. M1.1 (scoped validation) identified as next milestone. |
| 2026-07-10 | **M2.2 Explorer Migration COMPLETE** — read-only structural projection of CampusDocument mounted in StudioWorkspace. |
| 2026-07-10 | **M2.3 Inspector Migration COMPLETE** — PropertiesPanel mounted in single EditorBridge; `entity.update` command + HistoryStack wired; `SelectionBridge` syncs canvas↔Inspector; `DocumentStore` drives version-based re-render. **CampusDocument is now the editable model; the Graph is a rendering artifact.** Phase 4 reframed as **Navigation Compiler** (Graph → compiled navigation artifact). |
