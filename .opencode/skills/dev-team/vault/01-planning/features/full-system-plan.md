---
tags: [#role/pm, #status/planning]
complexity: XL
last-updated: 2026-06-20
---

# Full System Plan — NAVI Multi-Campus Navigation Platform

## End Goal

All 9 thesis must-haves satisfied. A fully functional NAVI platform deployed on Vercel with:

1. Admin map editor with component compiler
2. Supabase persistence for all data
3. Public map with search + A* routing
4. GPS outdoor positioning
5. QR indoor positioning
6. 360° panoramas from Cloudinary
7. Auto-generated directory tree
8. One real ASU-Ibajay building with accurate data
9. Deployed and accessible from any device

---

## Phase 0 — Foundation ✅ DONE

| Task | Owner | Status |
|------|-------|--------|
| Engine modules (Graph, A*, Validator, Directory, ComponentCompiler) | DEV | ✅ |
| Unified TypeScript types (`nav-types.ts`) | DEV | ✅ |
| Zustand stores (graph-store, ui-store) | DEV | ✅ |
| Framework-agnostic engine layer (no React imports) | ARCH | ✅ |

## Phase 0a — Vite → Next.js Migration ✅ DONE

| Task | Owner | Status |
|------|-------|--------|
| Scaffold Next.js + Tailwind + shadcn/ui | DEV | ✅ |
| Migrate all routes (13 pages, 0 TS errors) | DEV | ✅ |
| Delete 35 unused shadcn files, 6 unused packages | DEV | ✅ |
| Fix 15 ESLint errors | DEV | ✅ |
| Vercel config prepared | DEVOPS | ✅ |

## Phase 1 — Component Editor ✅ MOSTLY DONE

| Task | Owner | Status |
|------|-------|--------|
| Component palette (Room, Stair, Elevator, Restroom, Hallway, Entrance) | DEV | ✅ |
| Click+drag component placement | DEV | ✅ |
| Component → graph auto-generation via compiler | DEV | ✅ |
| Properties panel for component editing | DEV | ✅ |
| Component tracking with `componentId` | DEV | ✅ |

---

## Phase 2 — Database & Persistence 🟡 CODE-COMPLETE (blocked on Supabase project)

**Goal**: Data persists across sessions. Admin edits survive reload.

### Feature Spec
- [ARCH] ADR-003: Supabase as Database Platform
- [DEV] SQL migration: 4 tables (graph_snapshots, buildings, route_nodes, route_edges) + PostGIS + 3 RPCs
- [DEV] `src/lib/db-schema.ts` — serialization layer (camelCase ↔ snake_case, PostGIS helpers)
- [DEV] Graph-store: `syncToSupabase()` + `fetchFromSupabase()`
- [DEV] `/api/graph` GET/POST wired to Supabase
- [QA] Test: save graph → reload → data persists
- [DEVOPS] Supabase project creation (manual — needs dashboard)
- [DEVOPS] `.env.local` populated with real keys

### 🔴 Blocker
Supabase project not created. Until resolved, Phase 2 cannot be verified and Phase 3 cannot start.

---

## Phase 3 — Public Map & Routing ❌

**Goal**: End-user can search, select destination, see A* route on map.

### Feature Spec — `public-map-and-routing`

| Task | Owner | Complexity | Dependencies |
|------|-------|-----------|-------------|
| [ARCH] ADR: Map rendering strategy (Maplibre GL tile sources, style conventions) | ARCH | S | |
| [DEV] Public map page — Maplibre GL with campus bounds | DEV | M | Phase 2 complete |
| [DEV] Directory sidebar — auto-generated tree from graph | DEV | M | Phase 1 (exists in store) |
| [DEV] Search bar — filter nodes by name, type, building | DEV | M | |
| [DEV] Destination selector — click node on map OR search results | DEV | S | |
| [DEV] Route display — A* path overlay + step-by-step instructions panel | DEV | M | engine/a-star.ts exists |
| [DEV] 2.5D building extrusions (MapLibre fill-extrusion) | DEV | S | |
| [DEV] Campus selector (if multiple campuses exist) | DEV | M | |
| [QA] Test plan: search, routing, edge cases (no route, disconnected graph) | QA | M | |
| [QA] E2E: click destination → route renders on map | QA | M | |
| [DOCS] Public map user guide | DOCS | S | |

### Acceptance Criteria
- [ ] Public map loads at `/map` with no auth required
- [ ] Directory tree shows all buildings → floors → POIs
- [ ] Search bar filters in real-time as user types
- [ ] Clicking a search result or map node pans camera + shows info
- [ ] Selecting destination + "Get Directions" shows A* route as colored line
- [ ] Step-by-step instructions panel shows turn-by-turn text
- [ ] Instructions include floor transitions (stairs/elevators)
- [ ] Route re-calculates if start/destination changes

---

## Phase 4 — Positioning & Panorama ❌

**Goal**: GPS outdoor + QR indoor positioning + 360° panorama viewing.

### Feature 4a — GPS Positioning

| Task | Owner | Complexity | Dependencies |
|------|-------|-----------|-------------|
| [ARCH] ADR: Positioning architecture (GPS + QR hybrid) | ARCH | S | |
| [DEV] `useGeolocation` hook — wraps Geolocation API | DEV | S | Phase 3 map |
| [DEV] "You are here" marker on map | DEV | S | |
| [DEV] Node snapping — find nearest node to GPS coords | DEV | M | engine/graph.ts nearestNode |
| [DEV] GPS accuracy indicator / radius circle | DEV | S | |
| [DEV] Fallback: "Location unavailable" state | DEV | S | |
| [QA] Test: GPS mock in dev tools → marker appears at correct position | QA | S | |
| [QA] Test: GPS denied → graceful fallback | QA | S | |

### Feature 4b — QR Positioning

| Task | Owner | Complexity | Dependencies |
|------|-------|-----------|-------------|
| [DEV] QR scanner modal — html5-qrcode camera integration | DEV | S | |
| [DEV] QR-to-node resolution — lookup node ID from QR code | DEV | S | |
| [DEV] QR generation page for admins | DEV | M | Phase 2 DB |
| [DEV] "You are here" set via QR scan | DEV | S | |
| [QA] Test: scan QR → position snaps to correct node | QA | S | |

### Feature 4c — 360° Panoramas

| Task | Owner | Complexity | Dependencies |
|------|-------|-----------|-------------|
| [DEV] Pannellum viewer component | DEV | S | Cloudinary images |
| [DEV] Admin panorama upload via Cloudinary widget | DEV | M | Cloudinary account |
| [DEV] Hotspot linking between panoramas | DEV | M | |
| [DEV] Panorama thumbnail grid in admin panel | DEV | S | |
| [QA] Test: panorama loads from URL, hotspots clickable | QA | S | |

### Feature 4d — Cloudinary Integration

| Task | Owner | Complexity | Dependencies |
|------|-------|-----------|-------------|
| [ARCH] ADR: Image storage strategy (Cloudinary) | ARCH | S | |
| [DEV] Cloudinary upload widget in admin flows | DEV | M | |
| [DEV] Replace data URL placeholders with Cloudinary URLs | DEV | S | |
| [DEV] Image optimization (responsive srcsets with Cloudinary transforms) | DEV | M | |
| [QA] Test: upload panorama → URL loads in Pannellum | QA | S | |

### Acceptance Criteria
- [ ] GPS marker shows on map when user grants location
- [ ] GPS snaps to nearest walkable node
- [ ] QR scanner opens from button, reads QR code, sets position
- [ ] Panorama viewer loads 360° images from Cloudinary
- [ ] Hotspots in panoramas link to other panoramas
- [ ] Admin can upload images through Cloudinary widget
- [ ] All images served via Cloudinary CDN (no data URLs in production)

---

## Phase 5 — Real Building & Polish ❌

**Goal**: One real ASU-Ibajay building with accurate data. Thesis defense ready.

| Task | Owner | Complexity | Dependencies |
|------|-------|-----------|-------------|
| [PM] Define ASU-Ibajay building scope (which building, floors, rooms) | PM | S | |
| [DEV] Create building data: floor plans, room coordinates, entrances | DEV | L | Phase 2 DB |
| [DEV] Set up Panorama photos (2-3 locations in the building) | DEV | M | Phase 4 Cloudinary |
| [DEV] Generate QR codes for 3-5 indoor checkpoints | DEV | S | Phase 4 QR |
| [DEV] Admin enters all building data via map editor | DEV | M | Phase 1 + Phase 2 |
| [QA] End-to-end walkthrough: admin enters data → user navigates | QA | M | All phases |
| [QA] Thesis success criteria verified (all 9 must-haves) | QA | S | |
| [DEVOPS] Production deployment to Vercel | DEVOPS | S | |
| [DEVOPS] Custom domain (optional) + HTTPS | DEVOPS | S | |
| [DOCS] Thesis paper final chapter: Implementation | DOCS | L | |
| [DOCS] Demo script for thesis defense | DOCS | M | |
| [DOCS] User manual + admin guide | DOCS | M | |

### Acceptance Criteria
- [ ] One real ASU-Ibajay building mapped with accurate floor plans
- [ ] 2-3 panorama locations with working Cloudinary URLs
- [ ] 3-5 QR checkpoints positioned at real locations
- [ ] End-to-end flow works: admin edits → published → user navigates
- [ ] Deployed on Vercel, accessible from phone + laptop
- [ ] All 9 thesis must-haves green

---

## Infrastructure & Cross-Cutting Concerns

### Auth (Spans Phases 2-5)

| Task | Owner | Phase | Complexity |
|------|-------|-------|-----------|
| [ARCH] ADR: Auth strategy (Supabase Auth, Google OAuth, role model) | ARCH | 2 | S |
| [DEV] Admin login page + auth flow | DEV | 3 | M |
| [DEV] Protected admin routes via middleware | DEV | 3 | S |
| [DEV] Role-based access (admin vs. public) | DEV | 4 | M |
| [QA] Test: unauthenticated redirect to login | QA | 3 | S |
| [QA] Test: Google OAuth flow end-to-end | QA | 4 | S |

### Testing Infrastructure

| Task | Owner | Phase | Complexity |
|------|-------|-------|-----------|
| [DEV] Set up Vitest for engine unit tests | DEV | 2 | S |
| [DEV] Write unit tests: Graph, A*, Validator, Directory, ComponentCompiler | DEV | 2 | M |
| [DEV] Set up Playwright for E2E tests | DEV | 3 | S |
| [DEV] Write E2E tests: map editor, public map, routing | DEV | 3-5 | L |
| [QA] Test plan template established | QA | 2 | S |

### Developer Experience

| Task | Owner | Phase | Complexity |
|------|-------|-------|-----------|
| [DEV] ESLint + Prettier config | DEV | 0a | ✅ |
| [DEVOPS] GitHub Actions CI (lint + typecheck + test) | DEVOPS | 2 | S |
| [DEVOPS] Vercel preview deployments per PR | DEVOPS | 2 | S |
| [DOCS] CONTRIBUTING.md for future contributors | DOCS | 5 | S |

---

## Dependency Graph

```
Phase 0 (Engine) ──► Phase 0a (Next.js) ──► Phase 1 (Editor)
                                                  │
                                                  ▼
Phase 2 (Supabase) ◄──────────────────────────────┘
       │
       ▼
Phase 3 (Public Map + Routing)
       │
       ├──► Phase 4a (GPS)
       ├──► Phase 4b (QR)
       ├──► Phase 4c (Panorama)
       └──► Phase 4d (Cloudinary)
       │
       ▼
Phase 5 (Real Building + Thesis)
```

Phases 4a-4d can be parallelized. Phase 3 must precede all of Phase 4.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Supabase project not created | High | Critical | Create first thing; placeholder env vars ready |
| GPS inaccurate indoors | Medium | Low | QR is primary indoor positioning |
| Cloudinary account setup delay | Medium | Medium | Data URLs as interim fallback |
| Component compiler bugs with real data | Low | High | Unit test each component type |
| Scope creep (adding features beyond thesis) | Medium | Medium | Strict adherence to 9 must-haves |
| Next.js 16 breaking changes | Low | High | Lock dependency versions |
| 360° photo quality | Low | Medium | Phone camera sufficient for demo |
| QR scanner permission issues (iOS) | Medium | Low | Clear permission prompts + fallback manual entry |

---

## Success Criteria (All 9 Must-Haves)

- [ ] 1. Admin adds Room → 5 nodes + 5 edges auto-generated
- [ ] 2. Directory shows POIs grouped by building/floor
- [ ] 3. End-user searches, selects destination, sees A* route on map
- [ ] 4. GPS snaps to nearest node
- [ ] 5. QR scan sets user position
- [ ] 6. Data persists in Supabase across sessions
- [ ] 7. Panorama loads from Cloudinary URL
- [ ] 8. Deployed on Vercel, accessible from any device
- [ ] 9. One real ASU-Ibajay building with correct data

## Links

- [[backlog]]
- [[../../02-architecture/system-map]]
- [[../../99-meta/context]]
- [[../../99-meta/status]]
- [[../../06-docs/CHANGELOG]]
