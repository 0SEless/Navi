---
tags: [#role/pm, #status/planning]
complexity: M
depends-on: [[database-schema-and-api]]
phase: 3
last-updated: 2026-06-20
---

# Public Map and Routing

## Goal
End-user public map page at `/map` with: Maplibre GL rendering, auto-generated directory sidebar, search, and A* route calculation with visual display.

## Acceptance Criteria
- [ ] `/map` loads without authentication
- [ ] Maplibre GL renders campus map with building footprints
- [ ] Directory sidebar shows tree: Campus → Buildings → Floors → POIs
- [ ] Search bar filters nodes in real-time by name, type, building
- [ ] Clicking a search result or node on map pans camera and shows info popup
- [ ] "Get Directions" button opens route panel
- [ ] A* route displayed as colored line overlay on map
- [ ] Step-by-step instructions panel shows turn-by-turn with distances
- [ ] Instructions include floor transitions (take Stair X to Floor 2)
- [ ] Route re-calculates when start/destination changes
- [ ] 2.5D building extrusions render via fill-extrusion
- [ ] Mobile-responsive: sidebar becomes bottom sheet on <768px
- [ ] 0 ESLint errors, 0 TS errors
- [ ] Playwright E2E: search → select → route renders

## Subtasks

### [ARCH] ADR Decisions
- [ ] ADR-004: Map rendering + routing strategy

### [DEV] Map Page
- [ ] Create `src/app/(public)/map/page.tsx` with split layout (sidebar + map)
- [ ] Maplibre GL initialization with OpenFreeMap tiles
- [ ] Building footprint GeoJSON layer from graph data
- [ ] 2.5D fill-extrusion styling
- [ ] Node markers (colored by type: entrance, room, stair, etc.)
- [ ] Camera controls (zoom, pan, rotate)

### [DEV] Directory Sidebar
- [ ] Collapsible tree component from `engine/directory.ts`
- [ ] Building → Floor → POI hierarchy
- [ ] Click node → pan map + show info
- [ ] Loading/empty states

### [DEV] Search
- [ ] Search input with debounced filtering
- [ ] Fuzzy match on node name + building name + node type
- [ ] Results dropdown with node type icon
- [ ] Click result → pan map + highlight node
- [ ] Clear search button

### [DEV] Route Display
- [ ] "Get Directions" button in node info popup
- [ ] Start/destination selector (click two nodes, or GPS + destination)
- [ ] A* path → GeoJSON LineString overlay
- [ ] Route style (animated dashed line with arrow)
- [ ] Step-by-step panel (walk to X, turn at Y, take stairs to floor Z)
- [ ] Distance + estimated time per step
- [ ] Route summary (total distance, estimated time, floor transitions)

### [QA] Test Plan
- [ ] Unit: A* finds shortest path in known graph
- [ ] Unit: A* returns null for disconnected nodes
- [ ] Unit: Directory tree builds correctly
- [ ] Unit: Search filter returns correct subset
- [ ] E2E: Page loads map tiles in viewport
- [ ] E2E: Search → click result → map pans
- [ ] E2E: Select two nodes → route renders
- [ ] E2E: Mobile layout sidebar collapses

## Dependencies
- Phase 2 (Supabase persistence) must be complete — map reads from persisted data
- engine/a-star.ts, engine/directory.ts, engine/graph.ts — all exist and tested

## Links
- [[full-system-plan]]
- [[../../02-architecture/ADRs/adr-004-public-map-and-routing]]
