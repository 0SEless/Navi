# Interior Editor Alignment Plan

## Guiding Principles

> **Every screen in NAVI Studio should answer three questions immediately:**
> 1. **Where am I?**
> 2. **What am I editing?**
> 3. **What can I do next?**

> **The Campus Workspace owns the campus. The Interior Editor owns the inside of a single building. The Graph Compiler owns navigation. Neither workspace edits compiled routing artifacts directly.**

These principles explain every decision below:
- Context Header → *Where am I?*
- Inspector → *What am I editing?*
- Tool Dock / Actions → *What can I do next?*
- Ownership boundaries → every feature fits into exactly one layer

## What Already Exists (80–90% complete)

| Component | Status |
|-----------|--------|
| Canvas (layer stack rendering) | ✅ Implemented |
| Space (Room) Tool | ✅ Implemented |
| Hallway Tool | ✅ Implemented |
| Entrance Tool | ✅ Implemented |
| Stair Tool | ✅ Implemented |
| Elevator Tool | ✅ Implemented |
| Selection system | ✅ Implemented |
| Navigation graph compiler | ✅ Implemented |
| Validation service | ✅ Implemented |
| Autosave service | ✅ Implemented |
| Undo/redo | ✅ Implemented |

## What We're Actually Doing

We're not designing tools from scratch. We're redesigning **the experience around the tools**.

```
Campus Workspace
    ↓
Inspector
    ↓
Interior Editor
    ↓
Existing Canvas — Existing Tools — Existing Compiler
```

The lower layers exist. The upper layers are what we're changing.

## Roadmap

```
Phase 1 — Building Inspector Redesign       (entry point)
Phase 2 — Manage Floors                     (building structure)
Phase 3 — Context Header                    (destination identity)
Phase 4 — Interior Editor UX Alignment      (destination experience)
Phase 4.5 — Studio Walkthrough (SV1)        (validate UX)
Phase 5 — Building Entrance Bridge          (outdoor ↔ indoor)
Phase 6 — Terminology Migration             (rename last)
```

---

## Phase 1 — Building Inspector Redesign

**Goal**: The entry point to the Interior Editor. Redesign the Inspector with fixed section order before changing the destination.

**Files**: `navi-next/src/components/studio/inspector/`

**Change**: Redesign Inspector layout for selected Building. Sections in this exact order (never drifts):

```
Information
    Name, Code, Category, Description

Physical
    Height, Elevation, Color
    Floors: 3
    [Manage Floors]

Status
    Build Status, Last Published

Actions
    [Edit Interior]
    [Adjust Position]

Assets
    Floor Plans, Panoramas

Danger Zone
    [Delete Building]
```

- `[Edit Interior]` navigates to `/studio/:mapId/buildings/:buildingId/floors/:floor`
- `[Manage Floors]` is a placeholder button (Phase 2 owns the dialog)
- No changes to Interior Editor code

**Acceptance**:
- All 6 sections render in exact spec order
- Edit Interior navigates correctly
- Manage Floors button exists (may open stub until Phase 2)

---

## Phase 2 — Manage Floors

**Goal**: Administrators manage floor metadata from the Building Inspector. Inside the Interior Editor, floors are only **selected** — never managed.

**Files**: New component + dialog, Building Inspector, floor data model

**Entry point**: `[Manage Floors]` in Building Inspector → Physical section

**Dialog content** — per floor:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| Name | text | "Ground Floor" | Full name for administrators |
| Label | text | "GF" | Compact display in UI, navigation, maps |
| Elevation | number (m) | 0.0 | Relative to building, not sea level |
| Floor Plan | image upload | — | Upload/replace floor plan image |
| Visible | toggle | true | Hide unfinished floors |
| Locked | toggle | false | Prevent accidental edits |

**Examples**:

| Name | Label | Elevation |
|------|-------|-----------|
| Ground Floor | GF | 0.0 m |
| First Floor | 1F | +4.2 m |
| Second Floor | 2F | +8.4 m |
| Basement 1 | B1 | -3.0 m |
| Mezzanine | M | +2.1 m |
| Roof Deck | RD | +12.6 m |

**Capabilities**: add floor, remove floor, rename, reorder (drag), edit metadata fields above

**Not included**: Visible/Locked affect editing only — do not affect published runtime yet

**Acceptance**:
- Floor Manager dialog opens from Building Inspector
- Can add, remove, rename, reorder floors
- Each floor has Name, Label, Elevation, Floor Plan, Visible, Locked fields
- After changes, building floor count updates in data model
- Interior Editor shows floors as selectable dropdown/tabs (no management)

---

## Phase 3 — Context Header

**Goal**: Answer "Where am I?" with a minimal breadcrumb bar inside the Interior Editor.

**Files**: `navi-next/src/components/floor-editor/FloorEditor.tsx`

**Change**: Replace current header (back button + "FLOOR EDITOR" + breadcrumb) with:

```
← Campus      Engineering Building / Ground Floor                     ● Saved
```

- **← Campus** — exits Interior Editor (text from route context, not hardcoded)
- **Engineering Building / Ground Floor** — building name never changes while inside; floor label updates immediately on switch
- **● Saved** — reuse existing sync status logic (already renders 3 states)
- No "NAVI STUDIO" branding — global header already has that
- Must render gracefully if building data is still loading

**Acceptance**:
- Header shows correct building name from route
- Floor label updates when switching floors (Phase 2 data)
- Autosave status (Saved/Syncing/Failed) visible in top-right
- Back link returns to campus workspace

---

## Phase 4 — Interior Editor UX Alignment

### 4a — Flat Explorer

**Files**: `navi-next/src/components/floor-editor/FloorOutliner.tsx`

**Change**: Remove category folder grouping. Show flat hierarchy of components on the current floor.

**Acceptance**:
- No folder indentation for Space / Hallway / Entrance
- All items are peers in a single list
- Selection syncs with canvas

### 4b — Tool Dock Redesign (Visual)

**Files**: `navi-next/src/components/floor-editor/FloorEditor.tsx` (right panel)

**Change**: Redesign tool panel visual only. Three groups reflecting frequency of use:

| Group | Tools |
|-------|-------|
| **Navigation** | Select, Pan |
| **Structure** | Space, Hallway |
| **Connections** | Entrance, Stair, Elevator |

- Floating bottom-center placement (always visible, never auto-hide)
- Visual hierarchy: Structure tools (central, largest) > Connections > Navigation
- Active tool highlighted with accent color
- Consistent with Figma principle: tools always where you expect them

**Not included**: hotkey badges (Phase 6).

**Acceptance**:
- Three visible groups with clear visual hierarchy
- Structure tools (Space, Hallway) are visually primary
- Tool switching works (existing tool system)
- No auto-hide — always visible

### 4c — Tool Dock Behavior (Architecture)

**Change**: Document that the tool list changes per workspace:

```
Campus Workspace:     Select, Pan, Boundary, Building, Road

Interior Editor:      Select, Pan, Space, Hallway, Entrance, Stairs, Elevator
```

- Tool Registry in `@navi/editor` should support context-based tool sets
- Each workspace registers its own tool palette
- No tool leaks across ownership boundaries

**Acceptance**:
- Interior Editor never shows campus-only tools (Boundary, Building, Road)
- Campus Workspace never shows interior-only tools (Space, Hallway, etc.)

### 4d — Empty State

**Files**: `navi-next/src/components/floor-editor/FloorEditorCanvas.tsx`

**Change**: When no floor plan image is loaded, show:

```
[info icon]  No floor plan — components shown on dark background.
             [Start Drawing Without One]
```

- Current empty state only has the info message — add the button
- Button activates the Space tool so user can start drawing immediately

**Acceptance**:
- Empty state renders when no floorPlanUrl for current floor
- "Start Drawing Without One" button activates Space tool
- Components render legibly on dark background (existing behavior)

---

## Phase 4.5 — Studio Walkthrough (SV1 Validation)

**Goal**: Walk through the full Studio as an administrator. Validate UX before introducing entrance bridging.

**Files touched**: None — manual walkthrough.

### Walkthrough scenario:
1. Create campus
2. Add building
3. Edit metadata (Inspector — Phase 1)
4. Manage floors (Phase 2)
5. Enter Interior Editor (Phase 3 header)
6. Upload floor plan (or use empty state — Phase 4d)
7. Draw spaces
8. Draw hallways
9. Save (autosave status visible)
10. Exit
11. Reopen

### Five validation questions:

| # | Question | Check |
|---|----------|-------|
| Q1 | Can I understand where I am? | Campus name, building name, floor label visible |
| Q2 | Can I understand what I'm editing? | Inspector matches context, header matches, tools match |
| Q3 | Can I find what I need? | Explorer lists components, Inspector has properties, Tool Dock has tools |
| Q4 | Can I recover from mistakes? | Undo works, autosave shows saved state, Back to Campus works |
| Q5 | Could a new administrator finish this without asking me questions? | Gut check after full walkthrough |

**Gate**: If any answer is "no," fix the issue before proceeding to Phase 5.

**Acceptance**: All five questions answer "yes" before Phase 5 begins.

---

## Phase 5 — Building Entrance Bridge

**Goal**: One shared entity bridging campus graph and interior graph at compile time.

### Entity: `BuildingEntrance`

```typescript
interface BuildingEntrance {
  id: string
  label: string          // "North Entrance", "South Entrance"
  type: EntranceType     // main, service, accessible
  connectionState: EntranceConnectionState
  campusPosition: { lat: number; lng: number }
  interiorPosition: { floorId: string; x: number; y: number } | null
  doorWidth: number      // meters
  accessible: boolean
}
```

### States (no manual setting — workflow drives them):

| State | Meaning |
|-------|---------|
| `PLACED` | Campus anchor exists (placed in Campus Workspace). Interior anchor missing. |
| `LINKED` | Interior anchor placed (set in Interior Editor). |
| `CONNECTED` | Both anchors exist. Compiler validates connectivity. |

### Workflow:

1. **Campus Workspace** — place entrance on building footprint → state = `PLACED`
2. **Interior Editor** — entrance appears with `⚠ Interior position missing` warning; click entrance, then click floor plan → state = `LINKED`
3. **Compiler** — during graph build, entrances with `CONNECTED` status bridge campus → interior graphs

### UI:

- **Campus Workspace**: Entrance placed as marker on building footprint
- **Interior Editor**: Unlinked entrances show as `⚠ North Entrance — Missing interior anchor`
- **Compiler validation**: Cannot publish if any entrance has `connectionState === 'PLACED'`

### Compiler changes:

- When building interior graph, detect entrances with interior anchor
- When building campus graph, detect entrances with campus anchor
- During graph merge, entrances with both anchors become bridge edges between the two graphs
- Validation rejects publish if any entrance is not CONNECTED

**Acceptance**:
- Entrance placed in Campus Workspace shows in Interior Editor as unlinked
- Clicking entrance + clicking floor plan sets interior anchor
- After linking, entrance shows as connected in both views
- Compiler creates bridge edges for connected entrances
- Publish fails with clear message if any entrance is unlinked

---

## Phase 6 — Terminology Migration (last)

**Goal**: Single, coordinated rename after all UX and architecture is frozen.

**Scope**:
- `FloorEditor` → `InteriorEditor`
- `floor-editor/` (folder) → `interior-editor/`
- `FloorEditor.tsx` → `InteriorEditor.tsx`
- `FloorEditorCanvas` → `InteriorCanvas`
- `FloorOutliner` → `InteriorOutliner`
- `Room` (type) → `Space` (core type + all consumers)
- `room` → `space` in API routes, database columns, validation rules
- Route paths (`/floor-editor/...` → `/interior/...`)
- Update Graphify knowledge graph

**Non-goal**: Changing tool names or tool directory structure. Only the editor container, type names, and routes.

**Acceptance**:
- No remaining references to `FloorEditor`, `floor-editor`, or `Room` type
- All routes, imports, and component names consistent
- Dev server starts without errors
- Graphify update completes

---

## Ownership Map

Every feature in this plan fits into exactly one layer:

| Feature | Owner | Phase |
|---------|-------|-------|
| Building Inspector | Campus Workspace | P1 |
| Floor Manager | Campus Workspace (building metadata) | P2 |
| Context Header | Interior Editor | P3 |
| Explorer, Tool Dock, Empty State | Interior Editor | P4 |
| Building Entrance | Shared entity (compiler bridges) | P5 |
| Terminology | Project-wide | P6 |

This ensures no layer crosses ownership boundaries.

---

## What We're NOT Doing (specified but deferred)

| Item | Reason |
|------|--------|
| Command Palette (Ctrl+K) | UI polish — not architectural |
| Validation overlay on canvas | Service exists; rendering is polish |
| Hotkey badges on tools | Polish — defer |
| interactionHotspots | Future feature — not needed for routing MVP |
| CrossFloorEdge typed model | Stair/elevator connections work; typing is refinement |
| Global header redesign | Already exists — no change needed |

## Error Prevention

### From ERRORS.md:

| Entry | Relevance | Prevention |
|-------|-----------|------------|
| Autosave deadlock (2025-09-21) | Phase 3 touches sync status in header | Read-only display; don't change autosave logic |
| NavBar hydration mismatch (2025-09-22) | Phase 1 route changes | Use `useRouter` consistently; avoid SSR on dynamic content |
| Layer ID collision (2025-10-05) | Phase 4 Tool Dock | Tool IDs must remain unique after visual redesign |
