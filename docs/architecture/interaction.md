# NAVI Interaction Architecture

**Frozen at:** `checkpoint/pre-stabilization` (commit `57600fd`)
**Date:** 2026-07-15

---

## Table of Contents

1. [Overview — Two Parallel Tool Systems](#1-overview--two-parallel-tool-systems)
2. [Legacy System: InteractionController](#2-legacy-system-interactioncontroller)
3. [New System: ToolRegistry](#3-new-system-toolregistry)
4. [Bridge: useToolController](#4-bridge-usetoolcontroller)
5. [Available Tools](#5-available-tools)
6. [The Sync Problem](#6-the-sync-problem)
7. [StudioToolbar: Where the Two Worlds Collide](#7-studiotoolbar-where-the-two-worlds-collide)
8. [Drawing Session](#8-drawing-session)
9. [Data Flow for Common Operations](#9-data-flow-for-common-operations)

---

## 1. Overview — Two Parallel Tool Systems

The Studio has **two completely independent tool systems** that are NOT synchronized. One is a legacy React component that directly handles MapLibre events. The other is a new service-based architecture with individual tool classes. They coexist but do not communicate.

| System | File | Type | Active tool source |
|--------|------|------|-------------------|
| **Legacy** | `InteractionController.tsx` | React component | `useStudioStore.tool` |
| **New** | `packages/editor/src/tools/registry.ts` | Class service | `toolRegistry.activeToolId` |

---

## 2. Legacy System: InteractionController

### File
`navi-next/src/components/studio/InteractionController.tsx`

### What it handles
- **Click** → node selection (querying `l-nodes`/`l-nodes-connection` layers), building selection, trace selection
- **Double-click** → route confirmation
- **Mouse down** → building drag adjustment, room drag, vertex drag
- **Mouse move** → vertex drag preview, room drag preview, building drag preview (writes to `SRC.DRAWING`)
- **Mouse up** → commit vertex drag, commit room creation, commit building drag
- **Keyboard** → Escape (cancel), Delete (delete node)
- **Tooltip** → hover on connection nodes via `mouseenter`/`mouseleave`

### How it reads the active tool
```typescript
const tool = useStudioStore((s) => s.tool)
// And via subscription:
const unsub = useStudioStore.subscribe((state) => {
  toolRef.current = state.tool
})
```

### How it selects entities
```typescript
const features = map.queryRenderedFeatures(e.point)
const hitNode = features.find((f) =>
  f.layer.id === LYR.NODES || f.layer.id === LYR.NODES_CONNECTION
)
```

It directly queries `l-` prefixed layers — the legacy rendering system's layers.

### Cursor management
- `route`, `room`, `asset`, `boundary`, `building` tools → crosshair cursor
- `select` tool → pointer cursor
- All others → default cursor
- Also enables/disables `map.dragPan` based on tool

### Building drag adjustment
When `select` tool is active and `adjustBuildingId` is set, clicking+ dragging a building footprint moves it. On mouse up, the new footprint is committed to `graph-store`.

### Room creation
When `room` tool is active, mousedown starts a drag, mouseup creates a rectangular polygon room via `graphStore.addComponentWithPolygon()`.

### Returns a tooltip `<div>` — the only actual React-rendered output

---

## 3. New System: ToolRegistry

### File
`packages/editor/src/tools/registry.ts`

### Architecture
```typescript
class ToolRegistry extends BaseEditorService {
  readonly id = 'toolRegistry'

  register(tool: Tool): void
  activate(id: string, ctx?: ToolContext): void  // Deactivates previous tool, activates new one
  deactivate(ctx?: ToolContext): void
  get(id: string): Tool | undefined
  get activeTool(): Tool | null
  get activeToolId(): string | null
  remove(id: string): void
}
```

### Tool interface
```typescript
interface Tool {
  id: string
  label: string
  cursor?: string
  onActivate?(ctx: ToolContext): void
  onDeactivate?(ctx: ToolContext): void
  onPointerDown?(event: ToolPointerEvent, ctx: ToolContext): void
  onPointerMove?(event: ToolPointerEvent, ctx: ToolContext): void
  onPointerUp?(event: ToolPointerEvent, ctx: ToolContext): void
  onKeyDown?(event: KeyboardEvent, ctx: ToolContext): void
}
```

### ToolContext
```typescript
interface ToolContext {
  services: ServiceAccessor  // Typed access to all editor services
}
```

### Subscribe mechanism
There is NO built-in subscribe/notify in `ToolRegistry` — tools are activated by calling `activate()`. The `activeToolId` property is readable. Components that need to react to tool changes must poll or use the `eventBus`.

---

## 4. Bridge: useToolController

### File
`navi-next/src/components/studio/useToolController.ts`

This is the **only bridge** between the new tool system and legacy interactions.

```typescript
export function useToolController() {
  const { services } = useEditor()
  const eventBus = services.get('eventBus')
  const dispatcher = services.get('dispatcher')

  useEffect(() => {
    const handleEvent = (payload) => {
      if (!payload?.command) return
      dispatcher.execute({ id: payload.command, label: payload.command, payload: payload.payload ?? {} }, {})
    }
    const unsubscribe = eventBus.on('tool.changed', handleEvent)
    return () => unsubscribe()
  }, [eventBus, dispatcher])
}
```

**What it does:** Listens for `tool.changed` events on the `DocumentEventBus`. When a tool changes, if the payload has a `command` field, it executes that command through the `CommandDispatcher`.

**What it does NOT do:** Bridge the tool selection mechanism. When `StudioToolbar` calls `toolRegistry.activate('select')`, the registry activates the tool but does NOT update `useStudioStore.tool`. The `InteractionController` continues reading the stale tool from `useStudioStore`.

---

## 5. Available Tools

### New system (registered in `ToolRegistry`)

All defined in `packages/editor/src/tools/`:

| Tool | File | Status |
|------|------|--------|
| `select` | `select-tool.ts` | **STUB** — `entityAtEvent()` returns `null` |
| `pan` | `pan-tool.ts` | Implemented |
| `draw-building` | `draw-building-tool.ts` | Implemented (with tests) |
| `draw-room` | `draw-room-tool.ts` | Implemented (with tests) |
| `draw-hallway` | `draw-hallway-tool.ts` | Implemented (with tests) |
| `draw-road` | `draw-road-tool.ts` | Implemented (with tests) |
| `place-entrance` | `place-entrance-tool.ts` | Implemented (with tests) |
| `place-staircase` | `place-staircase-tool.ts` | Implemented (with tests) |
| `place-elevator` | `place-elevator-tool.ts` | Implemented (with tests) |
| `place-panorama` | `place-panorama-tool.ts` | Implemented (with tests) |
| `place-qr` | `place-qr-tool.ts` | Implemented (with tests) |

Exported from `packages/editor/src/tools/index.ts`.

### Legacy system (defined in `studio-store.ts` type `StudioTool`)

The legacy `useStudioStore.tool` field uses string literals — likely `'select'`, `'pan'`, `'route'`, `'room'`, `'asset'`, `'boundary'`, `'building'`, `'vertex'` (inferred from `InteractionController` switch cases).

### The mismatch

The **new** `StudioToolbar` (which is actually rendered in the UI) shows a hybrid set based on `editorMode`:

- **Campus mode:** `select`, `pan`, `draw-road`, `draw-building`
- **Floor mode:** `select`, `draw-room`, `place-entrance`, `place-staircase`, `place-elevator`, `draw-hallway`

These map to new tool IDs. But the `InteractionController` handles the legacy tools (`route`, `room`, `boundary`, `building`, `vertex`) which don't exist in the new registry.

---

## 6. The Sync Problem

### Flow: User clicks a tool button

```
StudioToolbar button click
  → toolRegistry.activate('select')     // New system: toolRegistry.activeToolId = 'select'
  → StudioToolbar re-renders (highlight) // StudioToolbar reads toolRegistry.activeToolId ✅
  → InteractionController reads useStudioStore.tool  // STILL old value ❌
```

**Result:** The UI highlights the correct tool, but the interaction controller handles events for the WRONG (previous) tool.

### Flow: User clicks on map

```
InteractionController.handleClick
  → Reads toolRef.current (from useStudioStore.subscribe)
  → If 'select': queries l-nodes/l-nodes-connection layers
  → If 'route': adds trace point
  → etc.
```

The `select-tool.ts` new tool is never invoked because `InteractionController` doesn't listen to the new `ToolRegistry` or the `eventBus` for `tool.changed`. The `useToolController` bridge converts `tool.changed` events to command dispatches, but the `InteractionController` doesn't participate.

---

## 7. StudioToolbar: Where the Two Worlds Collide

### File
`navi-next/src/components/studio/StudioToolbar.tsx`

This component:

1. **Reads** the new `toolRegistry.activeToolId` for button highlighting
2. **Calls** `toolRegistry.activate(toolId)` on click
3. **Also reads** legacy `viewport.activeBuildingId` and `editingContext.mode`
4. **Does NOT** set `useStudioStore.tool` — the legacy store's tool stays at its previous value

Tool configuration is mode-dependent:
```typescript
const toolConfig = mode === 'floor' ? FLOOR_TOOLS : CAMPUS_TOOLS
```

- Campus tools: `select`, `pan`, `draw-road`, `draw-building`
- Floor tools: `select`, `draw-room`, `place-entrance`, `place-staircase`, `place-elevator`, `draw-hallway`

These correspond to tools in the new system, not legacy tools.

---

## 8. Drawing Session

### File
`navi-next/src/components/studio/useDrawingSession.tsx`

Provides a React context (`DrawingSessionProvider`) for managing drawing state:

- `drawPoints: LatLng[]` — Current set of points being drawn
- `setDrawPoints(points)` — Replace points
- `roomDrag` — Room rectangle drag state
- `pendingConfirm` — Awaiting user confirmation for a drawing operation
- `requestConfirm(type)` — Shows confirm overlay

Used by `ConfirmBar`, `DrawingOverlay`, `PreviewOverlay`.

---

## 9. Data Flow for Common Operations

### Selecting a node (new flow)
```
Toolbar click 'select'
  → toolRegistry.activate('select')
  → select-tool.ts onPointerDown
  → entityAtEvent(event)   // Currently returns null (STUB)
  → No selection happens
```

### Selecting a node (legacy flow)
```
Toolbar click 'select' (but useStudioStore.tool unchanged)
  → InteractionController.handleClick
  → Reads tool = 'select' (from legacy store, IF it was set)
  → map.queryRenderedFeatures(e.point)
  → Finds node in l-nodes layer
  → useStudioStore.setState({ selectedNodeId })
  → EditorBridge propagates to SelectionManager via SelectionBridge
```

### Drawing a route (legacy-only, no new tool exists)
```
User selects route tool (set on useStudioStore.tool = 'route')
  → InteractionController.handleClick
  → addTracePoint(pos)
  → Click, click, click...
  → Double-click to confirm
  → PendingConfirm shown
  → On confirm: graphStore.addTrace(...)
```

### Creating a room (legacy drawing, no new draw-room-tool action)
```
User selects room tool
  → InteractionController.handleMouseDown (starts drag)
  → InteractionController.handleMouseMove (shows rectangle)
  → InteractionController.handleMouseUp
  → graphStore.addComponentWithPolygon(...)
```

**Key takeaway:** All actual map interactions go through `InteractionController`. The new tool system's `onPointerDown`/`onPointerMove`/`onPointerUp` handlers are never called because no code dispatches MapLibre mouse events to the `ToolRegistry`.
