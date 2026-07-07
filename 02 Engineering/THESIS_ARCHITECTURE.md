# NAVI System Architecture (Thesis)

## Principle

> **The graph is the source of truth. Everything else is a derived view.**

## 6-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  1. PRESENTATION LAYER                       │
│  Map View  │  Directory Tree  │  Route Panel  │  QR Scanner  │
│  360° Viewer  │  Search Bar  │  GPS Indicator               │
├─────────────────────────────────────────────────────────────┤
│                  2. APPLICATION LAYER                        │
│  Graph Engine  │  A* Router  │  Directory Builder           │
│  Component Compiler  │  Graph Validator                     │
│  Route Instruction Generator                                │
├─────────────────────────────────────────────────────────────┤
│                  3. POSITIONING LAYER                        │
│  GPS (Geolocation API)  │  QR Decoder (html5-qrcode)        │
│  Node Snapping  │  Position → Graph Node Resolution         │
├─────────────────────────────────────────────────────────────┤
│                  4. DATA LAYER                               │
│  Graph (Nodes + Edges)  │  Buildings  │  Components          │
│  GeoJSON Geometry  │  Panorama Metadata  │  QR Code Map      │
├─────────────────────────────────────────────────────────────┤
│                  5. IMMERSIVE LAYER                          │
│  Pannellum 360° Viewer  │  Scene Linking                    │
│  Hotspot Navigation  │  (Future: Three.js 3D)               │
├─────────────────────────────────────────────────────────────┤
│                  6. ADMIN LAYER                              │
│  Map Editor  │  Component Mode  │  Trace Mode               │
│  Node/Edge CRUD  │  Building Manager  │  Dataset Tools       │
│  QR Placement  │  Panorama Upload                          │
└─────────────────────────────────────────────────────────────┘
```

## Deployment Architecture

```
Browser (any device)
    ↓
Vercel (Next.js Edge Network)
    │
    ├── Static Pages (public map, admin UI)
    ├── Next.js API Routes (/api/*)
    │       ↓
    │   Supabase (PostgreSQL)
    │       └── Tables: buildings, nodes, edges, components
    │
    └── Images loaded via Cloudinary CDN
            ↓
        Cloudinary Storage (25 GB free)
            └── 360° panoramas, building photos, floor plans
```

## Data Flow

### Write Path (Admin edits campus)

```
Admin places Component (e.g., Room)
    ↓
Component Compiler runs (client-side)
    ↓
Generates: Nodes + Edges + Geometry
    ↓
Graph updates in Zustand store
    ↓
Save triggered → POST /api/graph → Supabase upsert
    ↓
Store notifies subscribers
    ├── Map re-renders
    ├── Directory rebuilds
    └── Validation re-runs
```

### Read Path (Student navigates)

```
Student opens /map
    ↓
GET /api/graph → loads from Supabase
    ↓
Graph restored in Zustand store
    ├── Map renders (MapLibre)
    ├── Directory builds (tree view)
    ├── GPS locates → snap to nearest node
    └── Search queries graph nodes

Student selects destination
    ↓
A* runs on graph (client-side)
    ↓
Route drawn on map → step-by-step instructions
```

## Component Compiler (Core Innovation)

```
Admin Input                    Compiler Output
─────────────────      ─────────────────────────────
Room (4m×5m)      →   5 nodes + 5 edges + Polygon
Stair             →   2 nodes + 1 edge  + LineString
Elevator (N fl.)  →   N nodes + N-1 edges + MultiPoint
Hallway (L meters)→   2+ nodes + edges + LineString
Entrance          →   1 node + 1 edge  + Point
```

## Key Architecture Rules

1. Graph engine runs entirely client-side (Zustand store)
2. Supabase is a persistence layer — not the source of truth
3. API routes proxy between client and Supabase (keys stay server-side)
4. Images stored in Cloudinary, referenced by URL in node metadata
5. All mutations go through the Graph class, not direct DB writes
6. A* operates on a read-only snapshot of the graph

## Links

- [[THESIS_DEFINITION]]
- [[THESIS_DATA_MODEL]]
- [[THESIS_TECH_STACK]]
- [[THESIS_NEXTJS_MIGRATION]]
