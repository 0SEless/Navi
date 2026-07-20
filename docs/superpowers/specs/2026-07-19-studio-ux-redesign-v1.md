# NAVI Studio UI/UX Redesign v1

Date: 2026-07-19
Status: Ready

## Goal

Transform NAVI Studio from a collection of editing tools into a **context-aware GIS/CAD editor** that follows the administrator's mental model. The administrator should always know *what am I editing?* (Campus → Building → Floor) instead of *which tool do I click?*

## Guiding Principle

NAVI Studio behaves like a professional GIS/CAD application with three editing contexts, each with one responsibility. Users don't switch modes — they move deeper into the map hierarchy.

```
Campus Workspace
      ↓
   Inspector
      ↓
Interior Editor
```

---

## 1. Campus Workspace

The default Studio view. Responsibilities:
- Draw campus boundary
- Manage building footprints and positions
- Edit building-level metadata
- Connect buildings with roads/traces
- Publish campus

The Campus Workspace never contains room/hallway/indoor editing.

---

## 2. Inspector

When an entity is selected, the Inspector shows its properties organized into labeled sections. Sections always appear in the same order. The Inspector layout for a selected building:

```
Information
  Name, Code, Category, Description

──────────────

Physical
  Height, Elevation, Color
  Floors: 3

  [Manage Floors]

──────────────

Status

──────────────

Actions
  📍 Adjust Position
  🏢 Edit Interior

──────────────

Assets

──────────────

Danger Zone
```

Context determines which sections appear:

- **Building selected**: all sections above
- **Floor selected (in Interior Editor)**: Information, Physical, Status, Assets
- **Room selected (in Interior Editor)**: Information, Status
- **Hallway/Stair/Elevator selected**: Information, Status

No rooms, hallways, QR, or panoramas at the campus level.

### Status

The Status section content changes depending on the selected entity. It always answers: *"How complete is this?"*

When a building is selected:

```
Status

72% Complete

✓ Metadata
✓ Position
⚠ Floor Plans
⚠ Indoor Map
```

When a floor is selected:

```
Status

✓ Floor Plan
✓ Hallways
⚠ Panorama Coverage
⚠ Navigation Graph
✓ Rooms

89% Complete
```

---

## 3. Floor Manager

Remove `[-] 3 [+]` inline stepper. Floor count changes are destructive (rooms, hallways, stairs, elevators, panoramas, indoor graph can be lost) — they deserve a dedicated manager.

The Inspector's Physical section shows the current count with a link, and clicking **Manage Floors** opens a dialog:

```
Manage Floors

Engineering Building

────────────────────

1. Ground Floor
   ✓ Complete

2. First Floor
   ✓ Complete

3. Second Floor
   ⚠ Empty

────────────────────

+ Add Floor
──────────────
Rename
Reorder
Archive
Delete

[Done]
```

### Add Floor

```
Manage Floors → + Add Floor

Floor Name

Third Floor

[Cancel] [Create]
```

After creation, the new floor appears in the list and can be edited immediately.

### Delete Floor

```
Delete Second Floor?

This will remove:
• 28 rooms
• 3 hallways
• 2 stairs
• 6 panoramas
• Indoor navigation graph

[Cancel] [Delete Floor]
```

Every delete shows what data will be destroyed. This is safer than a minus button and makes floor management an explicit task — appropriate since buildings on a university campus rarely change floor count after creation.

---

## 4. Interior Editor

Opening the Interior Editor should feel like zooming into a building in Google Maps — same Studio, same layout, just deeper. The campus map zooms into the selected building until the floor plan fills the canvas. No app-switching sensation.

Campus Workspace owns the building footprint and its position. Interior Editor owns everything inside the building.

### Context Header

A persistent application header at the top of the editor, always visible:

```
← Campus

Engineering Building
Ground Floor

● Saved
```

Left: back link to Campus Workspace.
Center: which building and floor.
Right: save state.

### Entry Animation

The transition should not be instant:

1. Selection locked
2. Autosave completes
3. Campus map zooms into building
4. Canvas transitions to floor plan
5. Breadcrumb appears
6. Tool dock swaps to floor tools
7. Explorer updates to building hierarchy
8. Context Header appears
9. Selection unlocked

Total ~300ms. The user should feel like they entered the building, not switched apps.

### Breadcrumb
```
Campus > Engineering Building > Ground Floor
```
Clicking "Campus" returns to Campus Workspace. This transition is explicit — the user should never feel trapped inside the Interior Editor.
### Explorer

Becomes the floor selector showing actual content, not categories:

```
Engineering Building
├── Ground Floor
│   ├── Registrar
│   ├── Dean
│   ├── Faculty Room
│   ├── Main Hall
│   ├── North Entrance
│   ├── Stair A
│   └── Elevator
├── First Floor
└── Second Floor
```

No category folders (Rooms, Hallways, etc.). The hierarchy is: Building → Floor → Objects. Categories can be used as optional filters later. Click a floor row to select it. Click any object to select and inspect it. Default: Ground Floor (or last-edited floor from session).

### Empty Floor

A floor with no floor plan shows a centered empty state on the canvas:

```
Ground Floor

This floor hasn't been configured yet.

[ Upload Floor Plan ]

or

[ Start Drawing Without Floor Plan ]

Supported: PNG, JPG, PDF
```

Choose upload when you have a CAD file or floor plan image. Choose draw when you want to trace rooms and hallways directly on a blank canvas.

### Floor Plan Calibration

After upload, the canvas enters calibration mode:

```
Next Step

Calibrate Floor Plan

[Start Calibration]
```

Calibration sets the image scale and origin so vector overlays align with real coordinates. After calibration, full editing is unlocked.

### Canvas

Replaces the campus MapLibre map with the floor editing canvas. Rendered as a strict layer stack (bottom to top):

```
Grid (background grid for alignment)

──────────────────────────────────

Floor Plan (uploaded image, calibrated)

──────────────────────────────────

Hallways (vector overlay)

──────────────────────────────────

Rooms (vector overlay)

──────────────────────────────────

Navigation Graph (indoor routing nodes + edges)

──────────────────────────────────

Entrances (markers)

──────────────────────────────────

Panoramas (marker nodes)

──────────────────────────────────

Selection Overlay (selection highlight, vertex handles)
```

### Inspector
Edits indoor entities only: room properties, hallway properties, entrance properties, stairs, elevators, panoramas, indoor navigation nodes. Includes the **Status** card for the active floor.

### Scope
One building at a time. To edit another building: exit the Interior Editor → return to Campus → edit that building's interior. Publishing is always initiated from the Campus Workspace after the campus passes validation.

### Outdoor → Indoor Transition
The runtime seamlessly transitions from the outdoor campus graph to the building's indoor graph authored in the Interior Editor. Routing remains continuous — the visualization changes from the campus map to the floor plan, but the navigation session does not restart.

---

## 5. Autosave

Remove the large Save button. Small always-visible status indicator (Canva-style):
- "All changes saved" ✓ (green)
- "Saving..." (blue)
- "Unsaved changes" (amber)

No manual saving. Only Publish remains a major action.

---

## 6. Tool Dock

Remove the old top toolbar with Campus/Building/Floor mode toggle — context already determines the editing level.

Replace with a **Figma-style bottom-center floating dock** — rounded container, soft shadow, grouped tools with subtle separators:

```
┌───────────────────────────────────────────────────────┐
│  🖱  ✋  │  ▭  ╱  🚪  │  🪜  🛗  │  📷  │
└───────────────────────────────────────────────────────┘
```

**Behavior:**
- Selected tool is slightly enlarged and highlighted
- Hover shows label tooltip
- Groups separated by subtle dividers
- Space key temporarily switches to Pan (release returns to previous tool)
- Esc switches back to Select

Tools change automatically depending on the workspace:

**Campus Workspace:**
```
Selection: Select, Hand (Pan)
Creation: Building, Road, Boundary
```

**Interior Editor:**
```
Selection: Select, Hand (Pan)
Structure: Room, Hallway
Access: Entrance, Stairs, Elevator
Media: Panorama
```

No mode buttons. The dock shows only the tools relevant to the current editing context.

---

## 7. Build Status

Replace the large Workflow panel with a tiny always-visible indicator in the top-right. No title, no borders, no panels — just status:

```
✓ Saved
✓ Valid
✓ Compiled

[Publish]
```

When there are problems:

```
⚠ Validation Failed
(3 errors, 2 warnings)

[Validate]
```

Floating, minimal, always present. Merges validation, compile, autosave, and publish into one compact widget centered on the work's health.

---

## 8. Properties Panel Behavior

- Nothing selected → panel hidden, canvas expands
- Entity selected → inspector slides in from right

Maximum editing space at all times.

---

## 9. Adjust Position

Building metadata has 📍 Adjust Position action. Temporarily enables dragging the entire building footprint to align with OSM/satellite imagery. Exit returns to normal editing.

---

## 10. QR Manager (Major Change)

QR editing is removed from the Interior Editor. Dedicated QR Manager in NAVI Admin:

1. Search → choose any object (room, office, entrance, facility)
2. Generate QR → stores entity ID, building, floor, nav node location
3. Export → PNG, SVG, PDF sheet
4. Print → place in real campus
5. When scanned by user app → identifies exact indoor location → navigation continues from that point

Separates **mapping** from **deployment**.

---

## Document Roadmap

The Studio redesign is now complete. The following documents continue the design in order:

1. **Interior Editor Workspace** — workspace entry, exit, layout changes, context header, empty state (done)
2. **Interior Data Model** — entity relationships, building/floor/room/hallway structure, data ownership
3. **Interior Canvas** — drawing model, coordinate system, layer stack, snapping, selection
4. **Interior Tool System** — tool behaviors, cursors, keyboard shortcuts, per-tool interactions
5. **Inspector Panels** — panel layouts for rooms, hallways, entrances, stairs, elevators, panoramas
6. **Navigation Graph Editor** — indoor graph creation, node/edge editing, cross-floor connections
7. **Validation Rules** — error conditions, warning conditions, validation overlay
8. **User App: Indoor Navigation Runtime** — outdoor-to-indoor transition, floor switching, QR scanning
