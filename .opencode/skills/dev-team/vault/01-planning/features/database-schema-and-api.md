---
tags: [pm, status/done]
created: 2026-06-20
complexity: M
---

# Feature: Database Schema + API (Phase 2)

## Summary
Create Supabase database schema with PostGIS spatial support, enhance the graph-store to sync with the database, and rewrite the API endpoint to handle both JSONB and normalized table persistence.

## Problem Being Solved
The app has no persistence layer — data lives in localStorage only. This sprint connects the Zustand graph store to Supabase so data survives page reloads and works across devices (thesis must-have #6).

## Acceptance Criteria
- [x] Given the admin edits the graph, when clicking "Save", then the full snapshot persists to Supabase via POST /api/graph
- [x] Given data exists in Supabase, when the page loads, then the graph-store fetches it and populates the map
- [x] Given the admin saves, then the data is stored as both JSONB (graph_snapshots) and normalized tables (buildings, route_nodes, route_edges)
- [x] Given a query with lat/lng, then get_nearest_node RPC returns the closest node using PostGIS spatial index
- [x] ADR-002 is superseded by ADR-003 (reflecting Supabase decision)

## Out of Scope
- Supabase project creation (manual step in dashboard)
- Cloudinary upload integration
- Public map page
- Authentication

## Tasks
- [x] [ARCH] ADR-003: Supabase as Database Platform (supersedes ADR-002)
- [x] [DEV] SQL migration: 001_initial_schema.sql (4 tables + 3 RPCs)
- [x] [DEV] src/lib/db-schema.ts serialization layer
- [x] [DEV] Enhance graph-store with syncToSupabase/fetchFromSupabase
- [x] [DEV] Rewrite /api/graph with sync_graph_snapshot RPC

## Estimate
Complexity: M
