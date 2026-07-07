# TODO

Main progress tracker for the NAVI second brain.

## Completed

- [x] Full Vite → Next.js migration with 13 routes ✅ (TypeScript 0 errors, build passes)
- [x] Deleted 35 unused shadcn UI files + 6 unused npm packages
- [x] Fixed ESLint errors (15 → 0 errors, 30 warnings remain)
- [x] Supabase client lib files created (`src/lib/supabase.ts`, `src/lib/supabase-server.ts`)
- [x] API route `/api/graph` wired to real Supabase queries (requires env vars)
- [x] Tailwind v3 installed and configured
- [x] Buildings + floors embedded into MapEditor (right panel properties, floor plan upload placeholder)
- [x] Sidebar cleaned up — Buildings/Floors removed as standalone pages (handled in MapEditor)
- [x] Panorama + QR management pages created (`/admin/panoramas`, `/admin/qr`)
- [x] `navi-admin/` archived to `_archive/navi-admin/`
- [x] Vercel config prepared

## Current Priorities

- [ ] Create Supabase project, enable PostGIS, run schema migration
- [ ] Wire graph-store to Supabase (syncToSupabase / fetchFromSupabase)
- [ ] Data persists across sessions (thesis must-have #6)
- [ ] Build the public map view (currently placeholder)
- [ ] Add Vitest + Playwright for testing

## Next Actions

- [ ] Set up `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`
- [ ] Deploy to Vercel — push to GitHub, add env vars in Vercel dashboard
- [ ] Convert NAVI from a one-campus app into a reusable multi-campus navigation platform.
- [ ] Add mobile-first animated 2D route lines for clear navigation.

## Backlog

- [ ] Define campus boundary and map center fields.
- [ ] Define building entrance nodes for outdoor-to-indoor transitions.
- [ ] Define floor and room records for indoor navigation.
- [ ] Define how QR scanning sets the user's current mobile location.
- [ ] Define object storage strategy for panoramas and building images.
- [ ] Define admin roles: super admin, campus admin, mapping staff, content manager, viewer.
- [ ] Define analytics events per campus.

## Blockers And Risks

- [ ] Restore missing real `data/` and `scripts/` folders for the installed `ui-ux-pro-max` skill.
- [ ] Replace the current simple database design with a platform-ready schema.
- [ ] Avoid hardcoded single-campus assumptions in future code.
- [ ] Decide image/panorama storage provider before implementation.

## Completed Decisions

- [x] NAVI will be framed as a reusable multi-campus platform. See [[ADR 001 - Multi Campus Platform]].
- [x] NAVI will use Supabase (PostgreSQL + PostGIS) as the database backend. See [[ADR-003 — Supabase as Database Platform]] (supersedes ADR-002).
- [x] NAVI will use mobile-first animated 2D route lines inspired by SM-style visual route clarity. See [[ADR 003 - Mobile 2D Route Animation]].
- [x] Obsidian will act as the project memory for goals, plans, decisions, errors, and build logs.
- [x] opencode multi-agent system deployed: 6 subagents (memory, research, architect, QA, documentation, mentor) + 3 skills (PostGIS, ADR, lint guard) + supervisor role.

## Key Links

- [[NAVI Project Requirements]]
- [[NAVI System Architecture]]
- [[NAVI Database Design]]
- [[NAVI Roadmap]]
- [[NAVI UI UX Pro Max Workflow]]
- [[NAVI Platform Upgrade Plan]]
- [[Known Issues and Risks]]
- [[SM Mobile Route Animation Reference]]
