---
tags: [#role/pm]
last-updated: 2026-06-20
---

# Backlog

## Legend
- `[x]` Done
- `[ ]` Pending
- `🔄` In Progress
- `🛑` Blocked

---

## Phase 0 — Foundation ✅
- [x] Engine modules: Graph, A*, Validator, Directory, ComponentCompiler
- [x] Unified TypeScript types (nav-types.ts)
- [x] Zustand stores: graph-store, ui-store
- [x] Framework-agnostic engine layer

## Phase 0a — Next.js Migration ✅
- [x] Scaffold Next.js + Tailwind + shadcn/ui
- [x] Migrate all 13 routes (0 TS errors, 0 ESLint errors)
- [x] Delete 35 unused shadcn files, 6 unused packages
- [x] Vercel config prepared

## Phase 1 — Component Editor ✅
- [x] Component palette (Room, Stair, Elevator, Restroom, Hallway, Entrance)
- [x] Click+drag component placement
- [x] Component → graph auto-generation
- [x] Properties panel

## Phase 2 — Database & Persistence 🟡
- [x] ADR-003: Supabase as Database Platform
- [x] SQL migration (4 tables + PostGIS + 3 RPCs)
- [x] db-schema.ts serialization layer
- [x] Graph-store: syncToSupabase + fetchFromSupabase
- [x] /api/graph GET/POST
- [x] Supabase MCP integration
- [🛑] Create Supabase project (manual — blocks verification)
- [🛑] Run migration + set env vars
- [🛑] End-to-end persistence test
- [ ] Vitest setup + engine unit tests

## Phase 3 — Public Map & Routing ❌
- [ ] [[public-map-and-routing]] (M)
  - [ARCH] ADR-004: Map rendering + routing strategy
  - [DEV] Maplibre GL public map with OpenFreeMap tiles
  - [DEV] Directory sidebar (auto-generated tree)
  - [DEV] Search bar with real-time filtering
  - [DEV] Route display: A* path overlay + step-by-step panel
  - [DEV] 2.5D building extrusions
  - [DEV] Mobile-responsive layout
  - [DEV] Auth: Google OAuth + middleware + protected admin routes
  - [QA] Unit tests: A*, Directory, Search
  - [QA] Playwright E2E: search → route renders
  - [DOCS] Public map user guide

## Phase 4 — Positioning & Panorama ❌
- [ ] [[positioning-and-panorama]] (L)
  - [ARCH] ADR-005: Hybrid positioning (GPS + QR)
  - [ARCH] ADR-006: Auth strategy (Supabase Auth + Google OAuth)
  - [ARCH] ADR-007: Image storage (Cloudinary)
  - [DEV] 4a — GPS positioning + "You are here" marker
  - [DEV] 4b — QR scanner + admin QR generation
  - [DEV] 4c — Pannellum 360° viewer + hotspots
  - [DEV] 4d — Cloudinary upload widget + transforms
  - [QA] Test: GPS mock → marker positioned correctly
  - [QA] Test: QR scan → snap to correct node
  - [QA] Test: Panorama loads from Cloudinary URL
  - [DOCS] Positioning system guide

## Phase 5 — Real Building & Polish ❌
- [ ] Real ASU-Ibajay building with accurate data
  - [PM] Define building scope (floors, rooms, entrances)
  - [DEV] Create floor plans + room coordinates
  - [DEV] Set up 2-3 panoramas with Cloudinary
  - [DEV] Generate 3-5 QR checkpoints
  - [DEV] Admin enters data via map editor
  - [QA] Full end-to-end walkthrough
  - [QA] All 9 thesis must-haves verified
- [ ] Deploy to Vercel production
- [ ] Thesis paper: Implementation chapter
- [ ] Demo script for defense
- [ ] User manual + admin guide
- [ ] GitHub Actions CI (lint + typecheck + test)

## Infrastructure & Cross-Cutting
- [ ] Auth: Admin login page + middleware
- [ ] Auth: Google OAuth via Supabase Auth
- [ ] Auth: RLS policies on all Supabase tables
- [ ] Testing: Vitest (unit) + Playwright (E2E)
- [ ] DEVOPS: Vercel preview deployments
- [ ] DOCS: CONTRIBUTING.md
- [ ] DOCS: API docs for /api/graph

## Ideas / Someday
- Mobile PWA with service worker
- Real-time multi-user map editing
- Multi-campus support (campuses table, campus selector)
- Analytics dashboard (popular destinations)
- Accessibility mode (audio cues, high contrast)
- Offline map caching

## Links
- [[full-system-plan]]
- [[features/public-map-and-routing]]
- [[features/positioning-and-panorama]]
- [[features/database-schema-and-api]]
- [[features/cloudinary-integration]]
