---
tags: [#role/architect, #status/planning]
date: 2026-06-20
title: "ADR-004: Public Map Rendering and Routing Strategy"
---

# ADR-004: Public Map Rendering and Routing Strategy

## Status
Proposed

## Context
Phase 3 requires a public-facing map view with:
- Read-only Maplibre GL map
- A* route visualization
- 2.5D building extrusions
- Auto-generated directory sidebar
- Search across nodes

The map must work on mobile and desktop without authentication.

## Decision
1. **Single public map page** at `/map` using Maplibre GL JS with OpenFreeMap tiles (free, no API key).
2. **Route rendering**: A* path from engine → GeoJSON LineString → Maplibre `geojson` source with styled layer.
3. **2.5D extrusions**: Building polygons stored as `geometry` in buildings table → rendered as Maplibre `fill-extrusion`.
4. **Directory**: Client-side filter from graph-store, rendered as collapsible tree in sidebar.
5. **Search**: Client-side fuzzy match on node names + building names.
6. **Responsive**: Sidebar collapses to bottom sheet on mobile (< 768px).

## Alternatives Considered
- **Mapbox GL JS**: Requires API key + paid tier for production → rejected.
- **Server-side search**: Supabase full-text search → unnecessary for MVP (graph is small).
- **Three.js 3D**: Out of scope per thesis definition.

## Consequences
- OpenFreeMap tiles are free but may be slower than Mapbox.
- Client-side search works for <10K nodes; beyond that, server-side needed.
- Single page keeps deployment simple (no additional routes).

## Links
- [[full-system-plan]]
