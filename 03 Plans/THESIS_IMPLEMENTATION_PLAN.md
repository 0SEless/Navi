# NAVI Implementation Plan — 9 Weeks

## Overview

| Phase | Weeks | Focus | Deliverable | Status |
|-------|-------|-------|-------------|--------|
| 0 | 1 | Foundation | Engine modules + Zustand + unified types | ✅ **Done** |
| 0a | 1 | Vite → Next.js Migration | Migrate all code to Next.js App Router | ⏳ **This week** |
| 1 | 2-3 | Core Innovation | Component compiler + editor mode | ❌ |
| 2 | 4 | Backend | Supabase integration + persistence | ❌ |
| 3 | 5-6 | End-User App | Public map + directory + routing | ❌ |
| 4 | 7 | Positioning | GPS + QR + 360° + Cloudinary | ❌ |
| 5 | 8 | Polish | 1 real building, 2.5D, thesis paper | ❌ |

---

## Phase 0 — Foundation (Week 1) ✅ COMPLETE

### Completed Files

| Date | Task | Files |
|------|------|-------|
| 2026-06-20 | Create `types/nav-types.ts` — single canonical types | `types/nav-types.ts` |
| 2026-06-20 | Delete `types/route.ts` — merged into nav-types | — |
| 2026-06-20 | Extract `engine/a-star.ts` — pure A* function | `engine/a-star.ts` |
| 2026-06-20 | Extract `engine/graph-validator.ts` — 10 validation checks | `engine/graph-validator.ts` |
| 2026-06-20 | Build `engine/graph.ts` — Graph class with all methods | `engine/graph.ts` |
| 2026-06-20 | Build `engine/directory.ts` — auto-generate tree from graph | `engine/directory.ts` |
| 2026-06-20 | Build `engine/component-compiler.ts` — Room/Stair/Elevator/Hallway/Entrance | `engine/component-compiler.ts` |
| 2026-06-20 | Install Zustand + create stores | `store/graph-store.ts`, `store/ui-store.ts` |

---

## Phase 0a — Vite → Next.js Migration (This Week)

### Goal
Migrate all existing code from Vite project to Next.js App Router without breaking functionality.

### Tasks

| Day | Task |
|-----|------|
| 1 | Scaffold Next.js project + install dependencies |
| 1 | Copy engine/, store/, types/ (zero changes needed) |
| 2 | Set up Tailwind + shadcn/ui |
| 2 | Create file-based routing: admin layout, public map, login |
| 3 | Migrate MapEditor, RouteTesting, DatasetManagement into route files |
| 3 | Migrate all UI components (sidebar, topbar, map, directory) |
| 4 | Create API route for Supabase |
| 4 | Set up middleware for auth |
| 4 | Deploy to Vercel + verify |

### Files to Create

```
navi-next/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── page.tsx (redirect to /map)
│   │   ├── (public)/map/page.tsx
│   │   ├── (admin)/
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── map-editor/page.tsx
│   │   │   ├── routes/page.tsx
│   │   │   └── dataset/page.tsx
│   │   └── api/graph/route.ts
│   ├── engine/          (copied from Vite)
│   ├── store/           (copied from Vite)
│   ├── types/           (copied from Vite)
│   ├── components/      (migrated)
│   ├── lib/
│   │   └── supabase.ts
│   └── middleware.ts
```

---

## Phase 1 — Core Innovation (Weeks 2-3)

### Goal
Build the component compiler UI. Admin places Room/Stair/Elevator components → auto-generates graph.

### Key Deliverables
- Component palette (Room, Stair, Elevator, Hallway, Entrance buttons)
- "Component" tool mode in MapEditor
- Click-to-place on map → compiler runs → nodes/edges auto-created
- Directory auto-generates from graph

---

## Phase 2 — Backend / Supabase (Week 4)

### Goal
Connect Zustand store to Supabase for persistence across devices.

### Key Deliverables
- Supabase tables created (buildings, nodes, edges, components)
- API routes: `/api/graph` (GET/POST)
- Store save/load wired to Supabase via API
- Cloudinary setup for image upload

---

## Phase 3 — End-User App (Weeks 5-6)

### Goal
Public map view with search, directory, routing.

### Key Deliverables
- Read-only MapLibre map
- Directory sidebar (auto-generated tree)
- Search bar
- Route display (A* path + step-by-step instructions)

---

## Phase 4 — Positioning (Week 7)

### Goal
GPS outdoor + QR indoor + 360° panoramas.

### Key Deliverables
- Geolocation API hook
- QR scanner modal (html5-qrcode)
- Pannellum 360° viewer (images from Cloudinary)
- "You are here" indicator on map

---

## Phase 5 — Polish + Thesis (Week 8)

### Goal
One real building, 2.5D, thesis paper.

### Key Deliverables
- Admin Building at ASU-Ibajay with real data
- MapLibre fill-extrusion (2.5D)
- Complete thesis paper
- Demo script

## Links

- [[THESIS_DEFINITION]]
- [[THESIS_SCOPE]]
- [[THESIS_ARCHITECTURE]]
- [[THESIS_DATA_MODEL]]
- [[THESIS_NEXTJS_MIGRATION]]
