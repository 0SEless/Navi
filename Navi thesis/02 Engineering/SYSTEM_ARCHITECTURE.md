# NAVI System Architecture

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript |
| **UI** | React 19, Tailwind CSS, shadcn/ui |
| **Maps** | MapLibre GL JS + SVG Engine |
| **State** | Zustand |
| **Database** | Supabase (PostgreSQL + PostGIS) |
| **Auth** | Supabase Auth (Google OAuth) |
| **Storage** | Cloudinary (panoramas) |
| **Deployment** | Vercel |

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                   Student Browser                      │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────┐   │
│  │ Map View     │  │ Directory│  │ Route Panel    │   │
│  │ (MapLibre    │  │ (Grouped │  │ (Step-by-step  │   │
│  │  + SVG)      │  │  POIs)   │  │  instructions) │   │
│  └──────┬───────┘  └─────┬────┘  └───────┬────────┘   │
│         │               │               │            │
│         └───────────────┼───────────────┘            │
│                         │                            │
│              ┌──────────▼──────────┐                 │
│              │  Engine (Pure TS)   │                 │
│              │  ┌────────────────┐ │                 │
│              │  │ A* Pathfinding │ │                 │
│              │  │ Nearest-Node   │ │                 │
│              │  │ Graph Query    │ │                 │
│              │  └────────────────┘ │                 │
│              └─────────────────────┘                 │
└──────────────────────────────────────────────────────┘
                         │
            ┌────────────┴────────────┐
            │                         │
            ▼                         ▼
  ┌──────────────────┐    ┌──────────────────────┐
  │  Supabase API     │    │  JSON Snapshot Cache │
  │  (Live Queries    │    │  (Pre-compiled sync) │
  │   & Auth)         │    │  Stale-while-        │
  │                   │    │  revalidate pattern)  │
  └──────────────────┘    └──────────────────────┘
```

## Multi-Campus Routing

The app uses **path-based routing**: `/campuses/[campusId]/...`  
All data is scoped by `campus_id` at the database level.

## Data Hydration Strategy

1. **Instant Load**: Browser loads a pre-compiled JSON graph snapshot from cache/CDN.
2. **Background Sync**: A Supabase Realtime or lightweight API check determines if the snapshot is stale.
3. **Hydration**: If updated, the diff is merged seamlessly into the in-memory graph without user-facing flicker.
