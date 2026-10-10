# NAVI Canonical Public Runtime Recovery

## Goal

Restore the verified public map runtime and navigation interactions on the canonical integration branch while preserving the persistence candidate's Supabase, Map/Floor, and Panorama contracts.

## Success criteria

1. Explore and Navigate use one MapLibre canvas across route changes.
2. Public building selection works by map click and by search deep link, while map pan, floor selection, and camera controls remain interactive.
3. The shared public scene renders candidate-authoritative buildings, POIs, authored roads, indoor geometry, and floor-plan overlays without storing signed URLs or changing source data.
4. Runtime readiness reflects map style, sources, and required layers; missing floor-plan assets are omitted safely.
5. Navigate route/location context is authoritative for the shared scene, and the candidate public-campus API continues using its publishable-key contract.

## Known pitfalls from ERRORS.md

- ExploreMap previously dropped floorGeometry and nested a NavigationProvider without the active navigation context.
- Public entrance summaries can lose floor and connector identity.
- MapLibre layers must wait for style readiness and use plain GeoJSON payloads.
- Secondary public routes must not be redirected by stale primary-tab state.
- Do not persist signed image URLs or replace the candidate public-store, API, or canonical Panorama resolver wholesale.
