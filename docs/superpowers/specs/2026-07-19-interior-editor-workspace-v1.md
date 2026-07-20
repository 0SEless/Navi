# Interior Editor Workspace Specification v1

Date: 2026-07-19
Status: Draft
Parent: Studio UI/UX Redesign v1 (frozen)
Next: Interior Data Model

## Purpose

Define the Interior Editor workspace — what changes, what stays the same, and how the user moves in and out of it. This is the bridge between the Campus Workspace (frozen in v1) and the detailed editing documents that follow.

---

## 1. Mental Model

The Interior Editor is not a separate application. It is the same Studio, zoomed in by one level. The building is the container; the floor is the current layer you are viewing.

```
Interior Editor
    └── Building
            └── Current Floor
```

The Interior Editor always has exactly one active building. Opening another building first exits the current Interior Editor and returns to the Campus Workspace.

```
Campus Workspace          Interior Editor
────────────────────      ────────────────────
Whole campus map     →    Single building
All buildings        →    All floors of one building
Outdoor editing      →    Indoor editing
Buildings in list    →    Rooms/hallways in list
```

The user should never feel like they "switched tools" or "opened another app." They zoomed into a building.

---

## 2. Workspace Layout

The layout regions remain identical to the Campus Workspace:

```
┌─────────────────────────────────────────────┐
│  Context Header    (new)                     │
├──────────┬──────────────────┬───────────────┤
│          │                  │               │
│ Explorer │     Canvas       │   Inspector   │
│          │                  │               │
├──────────┴──────────────────┴───────────────┤
│              Tool Dock                       │
└─────────────────────────────────────────────┘
```

All regions exist in both workspaces. Only the **content** changes.

---

## 3. Ownership Boundary

This boundary must never blur:

| Workspace | Owns |
|-----------|------|
| **Campus Workspace** | Campus boundary, roads, buildings, building footprints, outdoor routing |
| **Interior Editor** | Floors, rooms, hallways, entrances, stairs, elevators, panoramas, indoor navigation graph |
| **QR Manager** | QR generation, QR export, QR deployment |

Campus Workspace never contains room/hallway/indoor editing. Interior Editor never contains QR generation, publishing, or campus-level building management.

The building itself is the container. The floor is simply the current layer you are viewing.

---

## 4. What Stays the Same

| Feature | Behavior |
|---------|----------|
| Layout regions | Explorer, Canvas, Inspector, Tool Dock in same positions |
| Build Status | Same floating indicator in top-right (shows project-level health) |
| Autosave | Same indicator, same behavior |
| Tool Dock position | Bottom-center floating, same rounded container |
| Properties Panel Behavior | Hidden when nothing selected, slides in when selected |
| Keyboard shortcuts | Same workspace-level shortcuts (Ctrl+K, Ctrl+S, etc.) |

---

## 5. What Changes

| Element | Campus Workspace | Interior Editor |
|---------|-----------------|--------------|
| Context Header | Hidden | "Building > Floor \| Save state" |
| Explorer | Buildings list | Building → Floors → Entities |
| Canvas | MapLibre campus map | Floor editing canvas (layer stack) |
| Inspector | Building/road properties | Room/hallway/entity properties |
| Tool Dock | Select, Hand, Building, Road, Boundary | Select, Hand, Room, Hallway, Entrance, Stairs, Elevator, Panorama |
| Breadcrumb | Hidden | "Campus > Building > Floor" |

---

## 6. Entry Flow

Trigger: clicking `🏢 Edit Interior` in the Inspector's Actions section (or clicking a Floor Plan item in Building Status).

Entering the Interior Editor should feel like smoothly zooming into the selected building:

1. The campus map zooms into the building footprint
2. The canvas transitions from the MapLibre campus view to the interior layer stack
3. The Explorer switches from the building list to the floor hierarchy
4. The Inspector updates from building properties to entity properties
5. The Context Header appears
6. The Tool Dock swaps to the interior tool set
7. The breadcrumb appears

The user should perceive this as a continuous zoom, not a page transition.

---

## 7. Exit Flow

Trigger: clicking `Campus` in the breadcrumb, or a `← Back to Campus` action.

Exiting reverses the entry smoothly:

1. The canvas zooms back out to the campus view
2. The Explorer returns to the building list
3. The Inspector returns to the building's properties
4. The Context Header hides
5. The Tool Dock swaps back to campus tools
6. The breadcrumb hides

The building that was edited remains selected in the Campus Workspace, with its updated Status card visible.

---

## 8. Floor Navigation (within Interior Editor)

Switching floors does NOT exit and re-enter the Interior Editor. It is a quick switch within the workspace:

```
1. Click a floor in the Explorer
2. Canvas loads that floor's data (~100ms)
3. Inspector updates to that floor's entities
4. Context Header updates floor name
```

No transition animation — this should feel like clicking a tab, not navigating.

---

## 9. Context Header

Visible only in the Interior Editor. Always pinned at the top. As a single horizontal bar:

```
← Campus     Engineering Building / Ground Floor                    ● Saved
```

**Left:** "← Campus" is a clickable back link to the Campus Workspace.
**Center:** `Building / Floor` — the current context.
**Right:** Save state indicator:
- `● Saved` (green) — all changes persisted
- `● Saving...` (blue) — autosave in progress
- `● Unsaved` (amber) — pending changes
- `● Offline` (red) — connection lost
- `● Save Failed` (red) — retry in progress

Cleaner, uses less vertical space, leaves more room for the canvas.

---

## 10. Empty State Flow

A building with no uploaded floor plans:

```
1. Enter Interior Editor (normal entry animation)
2. Explorer shows empty floors (each with ⚠ empty indicator)
3. Canvas shows empty state for the first/selected floor
4. Inspector shows floor-level Status card (0% complete)
5. Tool Dock loads with full tool set (tools are disabled until a floor plan exists)
6. Context Header shows building and floor name
```

The canvas empty state:

```
┌─────────────────────────────────┐
│                                 │
│     Ground Floor                │
│                                 │
│     This floor hasn't been      │
│     configured yet.             │
│                                 │
│     [ Upload Floor Plan ]       │
│                                 │
│     or                          │
│                                 │
│     [ Start Drawing Without     │
│       Floor Plan ]              │
│                                 │
│     Supported: PNG, JPG, PDF    │
│                                 │
└─────────────────────────────────┘
```

Choose upload when you have a CAD file or floor plan image. Choose draw when you want to trace rooms and hallways directly on a blank canvas.

After upload → calibration mode (defined in Interior Canvas Specification) → full editing unlocked.

---

## 11. Workspace Boundaries

What the Interior Editor does NOT contain:

- **QR code generation** — handled by QR Manager
- **Publishing** — handled by Build Status at Campus level
- **Road/boundary editing** — Campus Workspace only
- **Campus-level building management** — Campus Workspace only
- **Floor count changes** — handled by Manage Floors dialog
- **Building metadata** — read-only reference in Context Header

---

## 12. Error States

| Condition | Behavior |
|-----------|----------|
| Floor has no data | Empty state (see §9) |
| Floor plan image corrupt | Error toast: "Could not load floor plan. Re-upload?" |
| Building has no floors | Cannot enter Interior Editor. Button disabled with tooltip: "Add floors first" |
| Building data fails to load | Error toast + retry button. Explorer shows building name only |
| Autosave fails during entry | Complete entry anyway. Context Header shows "Save Failed" |
| Multiple buildings selected | Edit Interior opens the most recently selected building |

---

## 13. Keyboard Navigation

| Shortcut | Action |
|----------|--------|
| `Escape` | Exit Interior Editor (return to Campus) |
| `Ctrl/Cmd + K` | Command palette (see v1 spec — includes Open Floor, Open Building) |
| `Ctrl/Cmd + [` | Back to Campus (browser back equivalent) |

---

## Open Questions (for next documents)

- What does the entity relationship look like? (Interior Data Model)
- How does the drawing tool work? (Interior Canvas)
- How does snapping work? (Interior Canvas)
- How does the tool system work? (Interior Tool System)
- How do inspector panels work? (Inspector Panels)
- How are stairs/elevators connected across floors? (Navigation Graph Editor)
- How does validation work? (Validation Rules)
