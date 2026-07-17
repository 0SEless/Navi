# NAVI Persistence Architecture

**Frozen at:** `checkpoint/pre-stabilization` (commit `57600fd`)
**Date:** 2026-07-15

---

## Table of Contents

1. [Overview — Multi-Layer Persistence](#1-overview--multi-layer-persistence)
2. [Legacy Store: graph-store.ts](#2-legacy-store-graph-storets)
3. [New Persistence: @navi/editor Services](#3-new-persistence-navieditor-services)
4. [EditorBridge: The Critical Integration Point](#4-editorbridge-the-critical-integration-point)
5. [WorkflowService: Autosave Orchestrator](#5-workflowservice-autosave-orchestrator)
6. [Supabase Sync](#6-supabase-sync)
7. [Known Issues](#7-known-issues)

---

## 1. Overview — Multi-Layer Persistence

The Studio uses a three-layer persistence strategy, reflecting the Strangler Fig migration:

| Layer | Storage | Trigger | Status |
|-------|---------|---------|--------|
| **1. localStorage** | Browser `localStorage` | On every `save()` call | ✅ Working |
| **2. Supabase** | Remote PostgreSQL (via `/api/graph`) | After every `save()` call | ❌ Broken (schema mismatch) |
| **3. Publish** | Filesystem (`demo-output/`) | Manual "Publish" action | ✅ Working |

The primary write path is: **Editor action → Graph mutation → `graph-store.save()` → localStorage + Supabase (attempt)**.

---

## 2. Legacy Store: graph-store.ts

### File
`navi-next/src/store/graph-store.ts`

### State shape
```typescript
interface GraphState {
  graph: Graph               // Legacy Graph class (nodes, edges, buildings, components, traces)
  currentMapId: string | null // Which map is being edited
  renderVersion: number       // Incremented on every mutation (triggers MapRenderer re-render)
  syncStatus: SyncStatus      // 'idle' | 'syncing' | 'synced' | 'error'
  syncError: string | null
}
```

### Storage keys
```typescript
const STORAGE_KEY = 'navi-graph'          // Default key (no mapId)
const SYNC_STATUS_KEY = 'navi-sync-status' // Last sync timestamp
// With mapId: `navi-graph-${mapId}`
```

### Initialization
On mount (via `load()`):
1. Check localStorage for `navi-graph` key
2. If found, `JSON.parse` → `Graph.fromJSON(snapshot)` → restore
3. If not found, `fetchFromSupabase()` → restore
4. On error (corrupt data), fall back to `fetchFromSupabase()`

Map-specific loading (`loadMapData(mapId)`):
1. Check `localStorage` for `navi-graph-${mapId}`
2. If found, restore
3. If not found or corrupt, start fresh

### Save flow
```typescript
save: () => {
  const key = mapId ? `navi-graph-${mapId}` : STORAGE_KEY
  const json = graph.toJSON()
  localStorage.setItem(key, JSON.stringify(json))
  syncToSupabase()  // Fire-and-forget (no await in save)
}
```

### Mutations mutate the Graph in-place and increment `renderVersion`
Every mutation (`addNode`, `removeNode`, `addEdge`, `addComponent`, etc.):
1. Calls `graph.addNode(node)` etc. (in-place mutation on the `Graph` class)
2. Increments `renderVersion` (triggers React re-renders via Zustand subscription)

### Component compilation
When `addComponent()` is called, it:
1. Calls `compileComponent(component, ...)` from `engine/component-compiler.ts`
2. Adds the component + compiled nodes + compiled edges to the graph
3. For hallways, also calls `graph.syncHallwayIntersections()`
4. The `compiler.ts` engine produces NavNodes from Component definitions

---

## 3. New Persistence: @navi/editor Services

The new architecture has three persistence-related services in `packages/editor/src/services/`:

### PersistenceService
**File:** `packages/editor/src/services/persistence-service.ts`

Responsible for the actual I/O. Implemented via the `PersistenceAdapter` interface:

```typescript
interface PersistenceAdapter {
  save(): Promise<void>
  syncToSupabase(): Promise<void>
  publish(document: CampusDocument): Promise<{ success: boolean; version: string }>
}
```

### NavigationCompiler
**File:** `packages/editor/src/services/navigation-compiler.ts`

Stateless compiler wrapper. Injected with a `CompilerAdapter` (see [compiler.md](./compiler.md)). Deduplicates concurrent compile calls.

### WorkflowService
**File:** `packages/editor/src/services/workflow-service.ts`

Orchestrates save, compile, and validate operations. Owns no state — all state lives in `WorkflowStore`.

### WorkflowStore
**File:** `packages/editor/src/services/workflow-store.ts`

State container tracking: `saveState`, `lastSavedAt`, `lastSaveReason`, `compileResult`, `saveError`, `publishState`.

---

## 4. EditorBridge: The Critical Integration Point

### File
`navi-next/src/components/studio/EditorBridge.tsx`

This is where the legacy graph-store feeds into the new editor context.

### What it does
1. **Creates `PersistenceAdapter`** wrapping `useGraphStore`:
   ```typescript
   const persistenceAdapter: PersistenceAdapter = {
     save: () => useGraphStore.getState().save(),
     syncToSupabase: () => useGraphStore.getState().syncToSupabase(),
     publish: async () => ({ success: true, version: '1.0.0' }),
   }
   ```
2. **Creates `NavigationCompiler`** with the client-side adapter: `new NavigationCompiler(createCompilerAdapter())`
3. **Creates `EditorContext`** once per mount:
   ```typescript
   const [context] = useState(() =>
     createEditorContext(useGraphStore.getState().graph, persistenceAdapter, navCompiler)
   )
   ```
4. **Wires `SelectionBridge`** to sync selection between `SelectionManager` and legacy `useStudioStore`
5. **Renders `<EditorProvider>`** to make the context available to all children

### Document lifetime invariant
The `EditorContext` is created **once** per `EditorBridge` mount (using `useState` with lazy initializer). It is never recreated when graph/selection/edit changes. This means:
- The `CampusDocument` inside the context is derived from the initial `Graph` state
- Post-mount legacy graph mutations that bypass the command system may not be reflected in the new document
- The invariant is intentional (performance — avoids recreating all services), but creates a stale-data risk

---

## 5. WorkflowService: Autosave Orchestrator

### File
`navi-next/src/components/studio/StudioWorkspace.tsx` (autosave setup)

```typescript
useEffect(() => {
  const interval = setInterval(() => workflow.save('autosave'), 30000)
  return () => clearInterval(interval)
}, [workflow])
```

### Save lifecycle (`WorkflowService.save()`)
```
saved → saving → saved (success) | error (failure)
```

1. Sets `saveState = 'saving'`
2. Calls `persistence.save()` (which calls `graphStore.save()` → localStorage + `syncToSupabase()`)
3. On success: updates `lastSavedAt`, `lastSaveVersion`, emits `workflow.saved` event
4. On failure: sets `saveState = 'error'`, captures error message, rethrows

### Dirty tracking
```typescript
isDirty(): boolean {
  return documentStore.version > workflowStore.lastSaveVersion
}
```
Uses `DocumentStore.version` (not deep comparison) to detect changes.

---

## 6. Supabase Sync

### Mechanism
Both `graph-store.ts` and `EditorBridge`'s `PersistenceAdapter` call `syncToSupabase()`, which sends a POST to `/api/graph`:

```typescript
syncToSupabase: async () => {
  const snapshot = get().graph.toJSON()
  const res = await fetch('/api/graph', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot),
  })
}
```

### The Save → Sync chain
```
User edits → graph-store mutation → renderVersion++
           → save() called (via WorkflowService autosave or manual)
           → localStorage.setItem(key, json)
           → syncToSupabase()  ← This fires AFTER localStorage write
```

### Known error (Critical)
At `graph-store.ts:257`, `syncToSupabase()` fails consistently with:
```
invalid input syntax for integer: [0]
```

**Root cause:** The Supabase table schema expects integer types for certain fields, but the graph snapshot format serializes some values as string representations (or the Supabase schema uses a different type than the snapshot JSON supplies). The error message `[0]` suggests an array literal `[0]` being passed where a single integer is expected — likely a PostGIS geometry column or an integer array column.

**Impact:** Cloud persistence is non-functional. All saves go to localStorage only. On a different device or after clearing browser data, the user cannot restore their work from Supabase.

### fetchFromSupabase
```typescript
fetchFromSupabase: async () => {
  const res = await fetch('/api/graph')
  const data = await res.json()
  const graph = Graph.fromJSON(data as GraphSnapshot)
  set({ graph, syncStatus: 'synced' })
}
```
If the POST is broken, the GET will also likely fail or return stale data.

---

## 7. Known Issues

### Critical
1. **SyncToSupabase broken** — `graph-store.ts:257` — "invalid input syntax for integer: [0]". Needs schema alignment between Supabase table and snapshot format.

2. **Document lifetime invariant creates stale context** — `EditorContext` is created once from the initial Graph state. Legacy mutations that don't go through the command system won't be reflected.

3. **Auto-flush not guaranteed** — The `graph-store.save()` function calls `syncToSupabase()` but does NOT `await` it (returns void, not Promise). The fire-and-forget pattern means sync errors are silently swallowed (logged to console only).

### Moderate
4. **No conflict resolution** — If two browser tabs edit the same campus, the last save wins. There is no merge strategy.

5. **No offline queue** — If Supabase is unreachable, the sync attempt fails silently. There's no retry queue.

6. **PersistenceAdapter.publish is a stub** — In `EditorBridge.tsx`, `publish` returns `{ success: true, version: '1.0.0' }` without doing anything. The real publish is only accessible via the `/api/publish` endpoint (called from the toolbar's publish button via `publishService.publish()`).

### Minor
7. **localStorage key collision** — `navi-graph` (default) and `navi-graph-${mapId}` (scoped) could overlap if a mapId happens to be empty string.

8. **Sync status not used** — `syncStatus` and `syncError` are stored but never displayed in the UI. Users don't know if their work is persisted remotely.
