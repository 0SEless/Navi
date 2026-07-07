---
tags: [meta]
last-updated: 2026-06-20
---

# Project Context

## Project Name
NAVI — Multi-Campus Navigation Platform

## Goal
A web-based indoor/outdoor navigation platform for university campuses. Admin tools for map editing (buildings, floors, paths, panoramas, QR checkpoints) and a public-facing map with turn-by-turn directions and 360° panorama views.

## Tech Stack
| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 16 App Router, React 19, Tailwind v3 | Maplibre GL for maps |
| Backend | Next.js API routes (serverless) | Graph data via REST API |
| Database | Supabase (PostgreSQL + PostGIS) | graph_snapshots, future: route_nodes, route_edges |
| Auth | Supabase Auth | Planning for Google OAuth |
| Images | Cloudinary | Panoramas, building photos, floor plan uploads |
| Infrastructure | Vercel | Serverless deployment |
| Maps | Maplibre GL JS | Indoor/outdoor campus maps |
| 360° Viewer | Pannellum | Panorama viewing on public map |
| State | Zustand | Client-side graph state with localStorage persistence |

## Key Constraints
- Next.js 16 App Router, file-based routing
- Engine layer (`engine/`, `store/`, `types/`) stays framework-agnostic
- Import paths use `@/` alias (maps to `src/`)
- Tailwind v3 (v4 dropped due to lightningcss incompatibility)
- Cloudinary for all image storage, not Supabase Storage
- Supabase for data only (DB, auth, API)

## Non-Goals
- Real-time multi-user editing (MVP is single-admin)
- Mobile native apps (web-first responsive design)
- Turn-by-turn voice navigation

## Thesis Success Criteria (9 Must-Haves)
1. ✅ Component compiler — Room → graph auto-generation
2. ✅ Auto-generated directory from graph
3. ❌ Public map with search + A* routing
4. ❌ GPS positioning (Geolocation API)
5. ❌ QR positioning (html5-qrcode)
6. 🔄 **Data persistence across sessions** — this sprint
7. ❌ Panorama from Cloudinary URL
8. ❌ Deployed on Vercel
9. ❌ One real ASU-Ibajay building with correct data

## Implementation Plan Phases
| Phase | Focus | Status | ADRs |
|-------|-------|--------|------|
| 0 | Foundation (engine, types, stores) | ✅ Done | — |
| 0a | Vite → Next.js migration | ✅ Done | — |
| 1 | Component compiler + editor | ✅ Done | — |
| 2 | **Supabase + persistence** | 🟡 Code-done (blocked) | ADR-003 |
| 3 | Public map + routing | ❌ | ADR-004 |
| 4 | GPS + QR + 360° + Cloudinary | ❌ | ADR-005, ADR-006, ADR-007 |
| 5 | Real building + thesis paper | ❌ | — |

## Current Blocker
Supabase project not yet created (manual Supabase dashboard step). This blocks Phase 2 verification and all subsequent phases.

## Key Documents Created (2026-06-20)
- [[../01-planning/features/full-system-plan]] — Complete 5-phase plan with all roles
- [[../04-testing/test-plans/system-wide-test-strategy]] — Vitest + Playwright + manual checklist
- [[../05-devops/runbooks/vercel-deployment]] — Deployment, rollback, incident response
- ADR-004: Map rendering (Maplibre GL + OpenFreeMap)
- ADR-005: Hybrid positioning (GPS + QR)
- ADR-006: Auth (Supabase Auth + Google OAuth)
- ADR-007: Image storage (Cloudinary)

## Team Memory / Don't Forget
- `npx next build` compiles and type-checks successfully (13/13 pages, 0 TS errors, 0 ESLint errors)
- npm 11.13.0, Node 24.16.0, Next.js 16.2.9
- 57 runtime dependencies
- Supabase API routes need real `.env.local` vars before they return data
- Build logs stored in `.opencode/04 Build Logs/`
- navi-admin archived to `_archive/navi-admin/`
- ADR-002 (self-managed PostgreSQL) is superseded by ADR-003 (Supabase + PostGIS)
