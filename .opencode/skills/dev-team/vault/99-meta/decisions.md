---
tags: [meta]
---

# Decisions Log

2026-06-20 | ORCH | Vault bootstrapped for dev-team workflow (full Obsidian structure)
2026-06-20 | PM | Feature: [[supabase-mcp-integration]] — scoped as S complexity
2026-06-20 | PM | Feature: [[cloudinary-integration]] — scoped as M complexity
2026-06-20 | ARCH | ADR-001: Supabase MCP — remote, OAuth, project-scoped
2026-06-20 | ARCH | ADR-002: Cloudinary MCP — remote with API key auth, 3 servers + skills
2026-06-20 | DEV | Remote MCP over local for both Supabase and Cloudinary (simpler setup)
2026-06-20 | DEV | File-input-based upload for MVP (Cloudinary widget deferred until account creation)
2026-06-20 | DEV | Panorama images stored as data URLs temporarily (Cloudinary URLs in production)
2026-06-20 | PM | Database sprint scoped to Phase 2 of implementation plan (persistence only)
2026-06-20 | ARCH | Hybrid DB strategy: JSONB graph_snapshots + normalized PostGIS tables
2026-06-20 | ARCH | Five individual API routes collapsed into one enhanced /api/graph endpoint (YAGNI)
2026-06-20 | ARCH | ADR-003 supersedes ADR-002 (self-managed PG → Supabase + PostGIS)
2026-06-20 | DEV | sync_graph_snapshot RPC handles full transaction — JSONB + 3 normalized tables
2026-06-20 | DEV | Graph-store load() fetches from Supabase in background, localStorage is fallback
2026-06-20 | QA | Phase 2 code complete — pending Supabase project creation for end-to-end test
2026-06-20 | ARCH | Cloudinary over Supabase Storage for all images (portable URLs, no vendor lock-in)
2026-06-20 | ARCH | Buildings/floors embedded in MapEditor instead of separate pages
2026-06-20 | ARCH | Panoramas + QR as standalone pages (complex UI in sidebar is unwieldy)
2026-06-20 | ARCH | navi-admin archived rather than deleted (reference for future migration)
2026-06-20 | PM | Full system plan created — 5 phases, 4 new ADRs, QA/DevOps/Docs plans
2026-06-20 | ARCH | ADR-004: Public map rendering with Maplibre GL + OpenFreeMap tiles
2026-06-20 | ARCH | ADR-005: Hybrid positioning (GPS outdoors + QR indoors)
2026-06-20 | ARCH | ADR-006: Auth with Supabase Auth + Google OAuth + RLS
2026-06-20 | ARCH | ADR-007: Image storage with Cloudinary CDN (no Supabase Storage)
2026-06-20 | QA | System-wide test strategy defined — Vitest unit + Playwright E2E + manual checklist
2026-06-20 | DEVOPS | Vercel deployment runbook created — env vars, rollback, monitoring
2026-06-20 | PM | Backlog updated with full prioritized feature list (Phase 0-5)
