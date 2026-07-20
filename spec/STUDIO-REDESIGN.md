# NAVI Studio — UI/UX Redesign

**Status:** Design spec (post-SV1 target)
**Type:** Product design
**Principles:** Canvas-first, contextual, auto-save, progressive disclosure, object/project separation

---

## Design Philosophy

NAVI Studio should feel like a professional GIS/CAD editor rather than a traditional CRUD application. The administrator's attention should stay on the map, not on panels full of controls.

---

## 1. Remove entity-context buttons from toolbar

Remove Campus / Building / Floor toggle buttons. The editor determines current context automatically from selection:

- Editing campus boundary → campus tools available
- Selecting a building → building actions available
- Opening Floor Editor → floor tools available

No manual mode switching.

---

## 2. Bottom Tool Dock (Figma-style)

Move all editing tools from top toolbar to a floating bottom dock:

```
────────────────────────────────────
Select  Pan  Building  Road  Room
Hallway  Entrance  QR  Panorama
Stairs  Elevator
────────────────────────────────────
```

Advantages: more canvas space, easier mouse travel, cleaner header, familiar editor layout.

---

## 3. Remove permanent Save button

Auto-save already exists. Replace with status indicator (Canva-style):

- `✔ Saved`
- `Saving...`
- `All changes saved`

Always visible. No manual save.

---

## 4. Top-right Project Status

Move all project-level actions to top-right. Rename "Workflow" to "Build Status":

```
✔ Saved
🟢 Build Ready
2 Warnings
[ Validate ]  [ Publish ]
```

---

## 5. Remove Workflow panel from Properties Panel

Current behavior (nothing selected → Workflow appears in Properties panel) mixes object editing with project state. These must be separated:

- **Project state** → top-right header
- **Object state** → contextual Properties panel

---

## 6. Properties panel becomes contextual

- Nothing selected → no Properties panel (maximum canvas)
- Object selected → panel slides in from right
- Click empty canvas → panel slides away

Progressive disclosure: panels appear only when relevant.

---

## 7. Building Inspector is building-only

Only contains building metadata:

```
Building
Name
Code
Category
Height
Color
Description
```

No rooms, hallways, QR, or panorama fields here. Those belong in Floor Editor.

---

## 8. Add Actions section

Separate metadata from actions:

```
Building
...
────────────
📍 Adjust Position
🏢 Open Floor Editor
```

Actions are not metadata.

---

## 9. Keep Adjust Position

OSM footprints and satellite imagery are often misaligned. Clicking enters adjustment mode → drag entire building → auto-save on finish. Moves the whole building, does not edit footprint geometry.

---

## 10. Open Floor Editor as dedicated action

Instead of inline floor controls (add/remove floor spinbutton), have a single action: `🏢 Open Floor Editor`. This communicates entering another workspace.

---

## 11. Floor Editor is a separate workspace

```
Campus → Building → Open Floor Editor → Floor Workspace
```

Floor Workspace contains: floor plan, rooms, hallways, entrances, stairs, elevators, QR markers, panorama nodes. Only one building at a time.

---

## 12. One building at a time

Inside Floor Editor, only one building is active. Administrator edits it completely. Auto-save records every change. Leaving Floor Editor returns to Campus mode.

---

## 13. Floor count becomes managed

Replace `[-] 1 [+]` spinbutton with:

```
Floors: 3
[ Manage Floors ]
```

Changing floor count mid-editing could destroy rooms, QRs, panoramas, stairs, and graph. Floor management happens inside Floor Editor with proper validation.

---

## 14. Assets section

Separate assets from editing:

```
Assets
Building Photo
Floor Plans
Icons
```

No editing controls in assets.

---

## 15. Explorer becomes navigation (not editing)

Replace flat building list with hierarchical tree:

```
Campus
▼ Engineering Building
  Ground Floor
  First Floor
  Second Floor
▼ Library
  Ground Floor
  Second Floor
```

Explorer is for navigation and selection, not editing.

---

## 16. Object vs Project separation (key principle)

| Scope | Location | What |
|-------|----------|------|
| Project State | Top-right header | Auto-save status, Build Status, Validation, Publish |
| Object State | Contextual right panel | Building, Room, Hallway, Road, QR, Panorama, Stair, Elevator metadata |

Never mix these.

---

## 17. Canvas is always the focus

Canvas occupies as much space as possible. Panels appear only when needed. Everything supports editing. Nothing competes with the map.

---

## 18. Target layout

```
┌──────────────────────────────────────────────────────────┐
│ NAVI Studio                           ✔ Saved            │
│                                  🟢 Build Ready          │
│                           [ Validate ] [ Publish ]       │
├──────────────┬───────────────────────────────────────────┤
│ Explorer     │                                           │
│              │                                           │
│ Campus       │                                           │
│ ├─ Building  │              Map Canvas                   │
│ │   ├─ GF    │                                           │
│ │   ├─ 2F    │                                           │
│ └─ Building  │                                           │
│              │                                           │
├──────────────┴───────────────────────────────────────────┤
│ Select  Pan  Building  Road  Room  Hallway  Entrance     │
│ QR  Panorama  Stairs  Elevator                           │
└──────────────────────────────────────────────────────────┘
```

When nothing selected → no Properties panel. Object selected → inspector slides in from right.

---

## Implementation order (recommended)

1. Auto-save status indicator (replaces Save button)
2. Move Build Status to top-right (extract Workflow from Properties)
3. Bottom Tool Dock (move tools from toolbar)
4. Remove entity-context buttons (Campus/Building/Floor toggle)
5. Explorer hierarchy (flat → nested tree)
6. Contextual Properties panel (slide in/out)
7. Floor Editor workspace (separate route)
8. Floor count management (replace spinbutton)
9. Actions section in inspectors
10. Assets section
