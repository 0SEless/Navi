# NAVI: Campus Navigation System — Design Spec

**Date:** 2026-06-24
**Status:** Draft
**Author:** [Your Name]

---

## 1. Overview

NAVI is a smart campus navigation platform combining:

- **NAVI App** — public-facing web application for students, visitors, and staff to navigate campuses
- **NAVI Studio** — administrative platform for creating and maintaining campus maps

The core thesis contribution is a **component-based graph compiler**: administrators place high-level building components (rooms, hallways, stairs) on floor plans, and the compiler auto-generates a unified navigation graph (nodes + edges) from which all system views — map rendering, directory listing, and A* routing — are derived.

---

## 2. Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 16 (App Router) | File-based routing, API routes, SSR |
| UI | React 19 + TypeScript 5 | Component rendering |
| Styling | Tailwind CSS 3 + shadcn/ui | Utility-first design + accessible primitives |
| Map Engine | MapLibre GL JS 5 | 2.5D campus map (open-source Mapbox fork) |
| State | Zustand 5 | In-memory graph store |
| Database | Supabase (PostgreSQL + PostGIS) | Persistence with spatial queries |
| Storage | Cloudinary | 360° panoramas + building images |
| Hosting | Vercel | Deployment |
| Auth | Mock (MVP) → Supabase Auth | Login/sign-up for students and guests |

---

## 3. System Architecture

### 3.1 Six-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                PRESENTATION LAYER                            │
│  Public Map  │  Studio Editor  │  Welcome Page  │  Login    │
│  Search Bar  │  Route Panel  │  QR Scanner  │  Panorama     │
├─────────────────────────────────────────────────────────────┤
│                APPLICATION LAYER (framework-agnostic)        │
│  Graph Engine  │  A* Router  │  Directory Builder           │
│  Component Compiler  │  Graph Validator                     │
│  Route Instruction Generator  │  Position Service            │
├─────────────────────────────────────────────────────────────┤
│                POSITIONING LAYER                             │
│  GPS (Geolocation API)  │  QR Decoder (html5-qrcode)        │
│  Node Snapping  │  Real-time Location Tracking              │
├─────────────────────────────────────────────────────────────┤
│                DATA LAYER                                    │
│  Graph (Nodes + Edges)  │  Buildings  │  Components          │
│  GeoJSON Geometry  │  Panorama Metadata  │  QR Code Map      │
├─────────────────────────────────────────────────────────────┤
│                IMMERSIVE LAYER                               │
│  Pannellum 360° Viewer  │  Hotspot Navigation               │
│  Scene Linking                                           │
├─────────────────────────────────────────────────────────────┤
│                ADMIN LAYER (NAVI Studio)                     │
│  Campus Map Editor  │  Building Tracer  │  Floor Editor      │
│  Component Palette  │  Building/Floor CRUD                  │
│  QR Placement  │  Panorama Upload  │  2.5D Preview          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Key Design Rules

1. **Graph is the source of truth** — Map, Directory, and Routing are all derived views
2. **Engine layer is pure TypeScript** — zero framework dependencies, testable in isolation
3. **Zustand store is the in-memory graph** — Supabase is async persistence (not the source of truth)
4. **Component Compiler** bridges admin input → navigation graph
5. **All mutations go through the Graph class**, not direct DB writes
6. **A* operates on a read-only snapshot** of the graph

### 3.3 Data Flow

**Write Path (Admin edits campus):**
```
Admin places Component → Component Compiler runs (client-side)
  → Generates: Nodes + Edges + Geometry
  → Graph updates in Zustand store
  → Save triggered → POST /api/graph → Supabase upsert
  → Store notifies subscribers: Map re-renders, Validation re-runs
```

**Read Path (User navigates):**
```
User opens /map → Graph loaded from Supabase
  → Map renders (MapLibre with 2.5D extrusion)
  → GPS locates → snap to nearest node
  → Search queries graph metadata
  → User selects destination → A* runs → Route + instructions
```

---

## 4. Data Model

### 4.1 Core Tables (Supabase/PostGIS)

**campuses**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| name | TEXT | Campus name |
| slug | TEXT UNIQUE | URL-friendly identifier |
| description | TEXT | |
| address | TEXT | Physical address |
| boundary | GEOGRAPHY(Polygon) | Campus perimeter |
| center | GEOGRAPHY(Point) | Map center anchor |
| default_map_style | TEXT | MapLibre style URL |
| created_at | TIMESTAMPTZ | |

**buildings**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| campus_id | UUID FK→campuses | |
| name | TEXT | Building name |
| description | TEXT | |
| department | TEXT | Department info |
| floor_count | INTEGER | Number of floors |
| outline | GEOGRAPHY(Polygon) | Building footprint |
| height | FLOAT | Extrusion height (meters) |
| anchor | GEOGRAPHY(Point) | Location anchor |
| image_url | TEXT | Building photo |
| created_at | TIMESTAMPTZ | |

**floors**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| building_id | UUID FK→buildings | |
| level_number | INTEGER | 1, 2, 3... |
| name | TEXT | "Ground Floor" etc. |
| floor_plan_url | TEXT | Uploaded floor plan image |
| metadata | JSONB | Room count, dimensions |

**components**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| building_id | UUID FK→buildings | |
| floor_id | UUID FK→floors | |
| type | TEXT | room, hallway, stair, elevator, entrance |
| name | TEXT | "Room 201" etc. |
| geometry | GEOGRAPHY(Geometry) | Polygon/LineString/Point |
| properties | JSONB | width, height, connects_floors, etc. |
| created_at | TIMESTAMPTZ | |

**nodes**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| campus_id | UUID FK→campuses | |
| building_id | UUID FK?→buildings | Nullable (indoor/outdoor) |
| floor | INTEGER | |
| position | GEOGRAPHY(Point) | Lat/lng |
| type | TEXT | building_entrance, intersection, staircase, elevator, room, outdoor, waypoint |
| name | TEXT | Human-readable name |
| metadata | JSONB | Department, facility type, etc. |
| has_qr | BOOLEAN | QR code placed here |
| has_panorama | BOOLEAN | 360° image attached |
| is_active | BOOLEAN | |

**edges**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| campus_id | UUID FK→campuses | |
| from_node_id | UUID FK→nodes | |
| to_node_id | UUID FK→nodes | |
| type | TEXT | walkway, stairs, corridor, elevator, ramp |
| distance | FLOAT | Meters (Haversine) |
| is_bidirectional | BOOLEAN | Default true |
| metadata | JSONB | |

**panoramas**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| node_id | UUID FK→nodes | Optional panorama attachment |
| building_id | UUID FK→buildings | |
| floor | INTEGER | |
| image_url | TEXT | Cloudinary URL |
| title | TEXT | |

**panorama_hotspots**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| panorama_id | UUID FK→panoramas | Source panorama |
| target_panorama_id | UUID FK→panoramas | Destination panorama |
| x | FLOAT | Hotspot position in image (0-1) |
| y | FLOAT | Hotspot position in image (0-1) |
| label | TEXT | "Go to next room" |

**qr_codes**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| node_id | UUID FK→nodes | Location this QR points to |
| building_id | UUID FK?→buildings | |
| floor | INTEGER | |
| code_value | TEXT UNIQUE | Scannable code |

**users** (Supabase Auth)
| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| email | TEXT | |
| role | TEXT | student, guest, admin |
| student_id | TEXT? | Student ID (if student) |

### 4.2 Key Relationships

```
Campus 1──* Building 1──* Floor
                             │
                      Component ──compiler──→ Node 1──* Edge
                                                  │
                                           Panorama ──* Hotspot
                                                  │
                                              QR Code
```

---

## 5. NAVI Studio — Workflow

### 5.1 Campus Map Editor (Mode 1)

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Topbar: Logo │ Campus Name │ Save Status │ User  │
├──────────┬──────────────────────────┬────────────┤
│  TOOLS    │     MAPLIBRE CANVAS      │ PROPERTIES │
│  (left)   │     (satellite/street)   │  (right)   │
│           │                          │            │
│  • Campus │  • Extruded buildings    │  • Selected│
│    boundary│  • Click to select       │    item    │
│  • Building│  • Drag/tilt/zoom       │    metadata│
│    trace   │  • Right-click context   │  • Edit    │
│  • Style   │  • Location anchors      │    fields  │
│    toggle  │    shown as pins        │  • To Floor │
│  • Anchor  │                          │    Editor  │
│    tool    │                          │   [Edit]   │
└──────────┴──────────────────────────┴────────────┘
```

**Flow:**
1. Admin loads map in Campus Map Editor → selects satellite or street style
2. Uses **Boundary tool** → draws campus perimeter polygon
3. Uses **Building Trace tool** → draws building outlines over satellite imagery
4. Places **anchor pins** for campus center and each building
5. **2.5D Preview toggle** → shows extruded buildings with height
6. Clicks a building → **right panel** shows metadata card (name, department, floor count, description, Edit button)
7. Clicks **Edit** → enters Floor Editor

### 5.2 Floor Editor (Mode 2)

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Topbar: Building Name │ [Floor 1][Floor 2][Floor 3] │
├──────────┬──────────────────────────┬────────────┤
│  TOOLS    │     FLOOR PLAN CANVAS    │ PROPERTIES │
│  (left)   │     (MapLibre / overlay) │  (right)   │
│           │                          │            │
│  • Room   │  • Floor plan image     │  • Selected│
│  • Hallway│    as reference layer   │    component│
│  • Stair  │  • Components rendered  │    props   │
│  • Elevator│  • Real-time graph     │  • Name    │
│  • Entrance│    preview              │  • Dims    │
│  • Select │  • Preview toggle       │  • Delete  │
│  • Pan    │  • Grid snap            │            │
│           │                          │            │
│  [Preview]│                          │            │
│   toggle  │                          │            │
└──────────┴──────────────────────────┴────────────┘
```

**Flow:**
1. Admin uploads floor plan image → appears as reference layer
2. Uses component palette to place components:
   - **Room**: Click-drag to draw rectangle → name it, set width/height
   - **Hallway**: Click-drag to draw line → length auto-calculated
   - **Stair**: Click to place → configure floor range (e.g., Floor 1↔2)
   - **Elevator**: Click to place → configure floor range
   - **Entrance**: Click to place on building edge
3. Each placement → **Component Compiler** runs → nodes/edges appear
4. **Preview toggle** → see how it renders on the public map
5. **Floor tabs** at top to switch floors
6. **Unsaved changes warning** if switching floors without saving

### 5.3 Component Compiler (Thesis Innovation)

| Component | Admin Action | Compiler Output |
|-----------|-------------|-----------------|
| Room | Draws rectangle (4m × 5m) | 5 nodes (4 corners + 1 center) + 4 wall edges + 4 walkable edges + Polygon geometry |
| Hallway | Draws line (10m) | 2+ nodes along line + edges + LineString |
| Stair | Clicks + sets floor range (F1↔F2) | 2 nodes (one per floor) + 1 edge (type: 'stairs') |
| Elevator | Clicks + sets floor range (F1→F4) | N nodes + N-1 edges (type: 'elevator') |
| Entrance | Clicks on building edge | 1 node + 1 edge to nearest outdoor node |

---

## 6. Public App — User Experience

### 6.1 Login Page (`/login`)
- **Student**: sign in with student ID or email
- **Guest**: enter email address
- Purpose: track usage analytics for thesis

### 6.2 Welcome Page (`/`)
- Auto-detect location via browser Geolocation API
- Suggest nearest campus ("You're near ASU Ibajay Campus")
- Campus selection grid (manual override)
- Decorative map preview in background

### 6.3 Campus Map (`/map/[campus]`)

```
┌─────────────────────────────────────────────────┐
│  Topbar: [Search... (autocomplete)]  📍  📷      │
├────────────────┬────────────────────────────────┤
│  SIDEBAR       │       MAPLIBRE MAP             │
│  (collapsible) │                                │
│                │  • 2.5D extruded buildings     │
│  Building Info │  • Drag/tilt/rotate/zoom       │
│  (when selected)│  • Pulsing GPS dot (real-time)│
│                │  • Animated route line         │
│  - Name        │  • Building labels             │
│  - Department  │  • Pathway lines               │
│  - Description │                                │
│                │                                │
│  Route Steps   │                                │
│  (when active) │                                │
│  1. Go south   │                                │
│  2. Enter bldg │                                │
│  3. Room 201   │                                │
└────────────────┴────────────────────────────────┘
```

### 6.4 Mobile Layout
- **Bottom sheet** for route info (slides up from bottom)
- **Floating search bar** (minimal, collapses on scroll)
- **📍📍📷 buttons** in bottom-right corner
- Clean, minimalist — focused on navigation

### 6.5 Navigation Flow

```
User opens app → Login
       ↓
System detects location (GPS)
       ↓
┌─── Outside campus? ─────────────────┐
│   → Show virtual 360° tour option   │
└─────────────────────────────────────┘
┌─── Inside campus? ──────────────────┐
│   → GPS → snap to nearest node      │
│   → Pulsing dot tracks in real-time │
│   → If GPS weak → QR scan           │
│     (QR contains node location)     │
└─────────────────────────────────────┘
       ↓
Search (autocomplete) → searches metadata
       ↓
Select destination → A* from current position
       ↓
Route line on 2.5D map + step-by-step
```

---

## 7. Implementation Phases (16 Weeks)

### Phase 1 — Foundation (Weeks 1-2)
- Scaffold Next.js 16 App Router with TypeScript + Tailwind
- Set up MapLibre GL JS with satellite/street base styles
- Create Supabase project + run PostGIS schema migration
- Build engine modules: Graph class, A* pathfinding, Validator
- Create Zustand graph store with Supabase sync layer
- Mock auth (simple password gate for /studio)

### Phase 2 — Campus Map Editor (Weeks 3-5)
- Implement Campus Map Editor layout (sidebar + canvas + properties panel)
- Campus boundary polygon drawing tool on MapLibre
- Building tracing tool (polygon draw over satellite imagery)
- Location anchor placement (campus + building level)
- 2.5D fill-extrusion preview toggle
- Building CRUD + metadata card in right panel
- Persist to Supabase (campuses + buildings tables)

### Phase 3 — Floor Editor + Components (Weeks 6-8)
- Floor CRUD (create floors per building)
- Floor plan image upload → reference layer on canvas
- Floor editor workspace with building panel + floor tabs
- Component palette UI (Room, Hallway, Stair, Elevator, Entrance)
- Component Compiler: each component type generates nodes/edges
- Real-time graph preview during editing
- Preview toggle (public map render toggle)
- Unsaved changes warning on floor switch

### Phase 4 — Public App + Auth (Weeks 9-11)
- Login/sign-up page (student ID/email or guest email)
- User session management
- Welcome page with geolocation + campus suggestion + campus grid
- Public map view: read-only MapLibre with 2.5D buildings
- Search bar with autocomplete (queries node metadata via PostGIS)
- Building info sidebar (name, department, description)
- Mobile responsive layout with bottom sheet

### Phase 5 — Navigation + Positioning (Weeks 12-14)
- A* route calculation on loaded graph
- Animated route line on map (2D line with dash animation)
- Step-by-step instruction panel with distance
- GPS geolocation → Haversine snap to nearest node
- Pulsing dot that follows user in real-time
- QR scanner modal (html5-qrcode) → resolves to node location
- "Outside campus" → 360° virtual tour redirect

### Phase 6 — Polish + Thesis (Weeks 15-16)
- Populate ASU Ibajay campus with real data (boundary, buildings, floors)
- 360° panorama upload + Pannellum viewer + hotspot linking
- Testing: Vitest for engine modules, manual UI testing
- Vercel deployment with env vars
- Thesis paper writing + demo script + presentation prep

---

## 8. Deferred / Out of Scope

| Feature | Reason |
|---------|--------|
| Native mobile app (Flutter/RN) | Web PWA sufficient for thesis demo |
| Real-time BLE/WiFi indoor tracking | Hardware-dependent and costly |
| Voice-guided turn-by-turn | Out of scope for web-first app |
| Offline maps (service worker) | Nice-to-have, not core thesis |
| Full multi-tenant deployment | Design for it, implement for ASU-Ibajay only |
| Analytics dashboard | Not part of navigation claim |
| Admin role hierarchy | Mock admin auth sufficient for demo |
| Accessibility routing | Future enhancement |

---

## 9. Success Criteria (Thesis Defense)

### Must-Have
- Admin traces building on satellite map → 2.5D extrusion visible
- Admin places Room component → nodes/edges auto-generated
- Public map shows extruded buildings with labels
- User can search, select destination, see A* route
- GPS snaps to nearest node
- QR scan sets user position
- Data persists in Supabase across sessions
- Mobile responsive layout works
- Deployed on Vercel, accessible from any device
- One real ASU Ibajay campus with accurate data

### Nice-to-Have
- 360° panoramas at 2+ nodes with hotspot navigation
- Animated pulsing GPS dot
- Stair + Elevator components (Room alone proves the thesis)
- Smooth outdoor→indoor transition
