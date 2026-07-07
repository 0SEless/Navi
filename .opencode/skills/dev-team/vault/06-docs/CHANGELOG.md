# Changelog

## [Unreleased]
### Added
- Dev-team vault bootstrapped with full Obsidian structure
- Supabase MCP server configured in opencode.json (remote, OAuth-based)
- Cloudinary MCP servers: asset-mgmt, env-config, structured-metadata (remote, API key auth)
- Cloudinary env vars in `.env.local` (placeholder values)
- Floor plan upload UI wiring in MapEditor building properties panel
- Panorama image upload UI with preview in PanoramaManagement page
- ADR-001: Supabase MCP Server for AI-Assisted Database Management
- ADR-002: Cloudinary MCP + Skills for Image Management
- DevOps runbooks for Supabase MCP and Cloudinary integration
- QA test plans for both integrations

### Changed (Phase 2 — Database Sprint)
- ADR-003: Supabase as Database Platform (supersedes ADR-002 — self-managed PG → Supabase + PostGIS)
- SQL migration: 4 tables (graph_snapshots, buildings, route_nodes, route_edges) + PostGIS indexes + 3 RPC functions (get_nearest_node, nodes_within_bounds, sync_graph_snapshot)
- `src/lib/db-schema.ts` — serialization helpers for camelCase↔snake_case and PostGIS geometry
- Graph-store enhanced with syncToSupabase() and fetchFromSupabase() — Zustand ← fetch → /api/graph
- `/api/graph` enhanced: POST calls sync_graph_snapshot RPC (transactional upsert), GET returns from graph_snapshots.data
- Memory artifacts updated: TODO.md (stale ADR-002 reference), vault context (thesis goals), decisions log, backlog

## [0.1.0] — 2026-06-20
### Added
- Initial project setup (Next.js 16, Tailwind v3, Maplibre GL)
- Admin dashboard, map editor, routes, dataset pages
- Panorama and QR checkpoint management pages
- Supabase client + server libs with wired API routes
- Vercel deployment configuration
